import { Router } from '../router.js';
import { loginResident } from './pin.js';
import { loginAdmin } from './admin.js';
import { createSession, deleteSession, getTokenFromRequest, setSessionCookie, clearSessionCookie, validateSession } from './session.js';
import { queryOne } from '../../shared/db/index.js';
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
