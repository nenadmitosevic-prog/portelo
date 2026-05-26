import { Router } from '../router.js';
import { loginResident, hashPin, verifyPin } from './pin.js';
import { loginAdmin } from './admin.js';
import { createSession, deleteSession, getTokenFromRequest, setSessionCookie, clearSessionCookie, validateSession } from './session.js';
import { queryOne, run } from '../../shared/db/index.js';
import { json, error } from '../../shared/utils/index.js';

const router = new Router();

router.post('/api/auth/login', async (req, env) => {
  const body = await req.json();
  const { building_id, apartment_ref, pin } = body;

  if (!building_id || !apartment_ref || !pin) {
    return error('building_id, apartment_ref, and pin required');
  }

  const result = await loginResident(env.DB, building_id, apartment_ref, String(pin));
  if (!result.ok) {
    return error(result.message, result.status);
  }

  const token = await createSession(env.DB, { residentId: result.resident.id });
  const resp = json({
    ok: true,
    resident: {
      id: result.resident.id,
      building_id: result.resident.building_id,
      apartment_ref: result.resident.apartment_ref,
      display_name: result.resident.display_name,
    },
    redirect: `/resident/${building_id}/dashboard`,
  });

  return setSessionCookie(token, resp);
});

router.post('/api/auth/admin/login', async (req, env) => {
  const body = await req.json();
  const { email, password } = body;

  if (!email || !password) return error('email and password required');

  const result = await loginAdmin(env.DB, email, password);
  if (!result.ok) return error('Email ili lozinka nisu tačni.', 401);

  const token = await createSession(env.DB, { adminId: result.admin.id });

  await queryOne(env.DB,
    'UPDATE admin_users SET last_login = datetime("now") WHERE id = ?',
    [result.admin.id]
  );

  const resp = json({
    ok: true,
    admin: { id: result.admin.id, email: result.admin.email, role: result.admin.role, building_id: result.admin.building_id },
    redirect: '/admin/dashboard',
  });

  return setSessionCookie(token, resp);
});

router.post('/api/auth/logout', async (req, env) => {
  const token = getTokenFromRequest(req);
  if (token) await deleteSession(env.DB, token);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie(),
    },
  });
});

router.post('/api/auth/change-pin', async (req, env) => {
  const token = getTokenFromRequest(req);
  const session = await validateSession(env.DB, token);
  if (!session || !session.resident_id) return error('Unauthorized', 401);

  const body = await req.json();
  const { current_pin, new_pin } = body;

  if (!current_pin || !new_pin) return error('current_pin and new_pin su obavezni.');
  if (!/^\d{4,6}$/.test(String(new_pin))) return error('Novi PIN mora biti 4 do 6 cifara.');

  const resident = await queryOne(env.DB, 'SELECT * FROM residents WHERE id = ?', [session.resident_id]);
  if (!resident) return error('Unauthorized', 401);

  const valid = await verifyPin(current_pin, resident.pin_hash);
  if (!valid) return error('Trenutni PIN nije tačan.', 401);

  if (String(current_pin) === String(new_pin)) return error('Novi PIN mora biti drugačiji od trenutnog.');

  const newHash = await hashPin(new_pin);
  await run(env.DB, 'UPDATE residents SET pin_hash = ? WHERE id = ?', [newHash, resident.id]);
  // Invalidate all other sessions — keep current one active
  await run(env.DB, 'DELETE FROM sessions WHERE resident_id = ? AND token != ?', [resident.id, token]);

  return json({ ok: true });
});

router.get('/api/auth/me', async (req, env) => {
  const token = getTokenFromRequest(req);
  const session = await validateSession(env.DB, token);
  if (!session) return error('Unauthorized', 401);

  if (session.resident_id) {
    const resident = await queryOne(env.DB, 'SELECT id, building_id, apartment_ref, display_name FROM residents WHERE id = ?', [session.resident_id]);
    return json({ type: 'resident', ...resident });
  }
  if (session.admin_id) {
    const admin = await queryOne(env.DB, 'SELECT id, email, role, building_id FROM admin_users WHERE id = ?', [session.admin_id]);
    return json({ type: 'admin', ...admin });
  }

  return error('Unauthorized', 401);
});

export default router;
