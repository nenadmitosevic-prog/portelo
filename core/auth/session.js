import { generateToken } from '../../shared/utils/index.js';
import { queryOne, run } from '../../shared/db/index.js';

const SESSION_TTL_DAYS = 7;

export async function createSession(db, { residentId = null, adminId = null }) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400000).toISOString();
  await run(db,
    'INSERT INTO sessions (token, resident_id, admin_id, expires_at) VALUES (?, ?, ?, ?)',
    [token, residentId, adminId, expiresAt]
  );
  return token;
}

export async function validateSession(db, token) {
  if (!token) return null;
  const session = await queryOne(db,
    'SELECT * FROM sessions WHERE token = ? AND expires_at > datetime("now")',
    [token]
  );
  return session || null;
}

export async function deleteSession(db, token) {
  await run(db, 'DELETE FROM sessions WHERE token = ?', [token]);
}

export async function cleanExpiredSessions(db) {
  await run(db, 'DELETE FROM sessions WHERE expires_at <= datetime("now")');
}

export function getTokenFromRequest(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/portelo_session=([a-f0-9]{64})/);
  return match ? match[1] : null;
}

export function setSessionCookie(token, response) {
  const headers = new Headers(response.headers);
  headers.set('Set-Cookie',
    `portelo_session=${token}; HttpOnly; SameSite=Strict; Max-Age=${SESSION_TTL_DAYS * 86400}; Path=/`
  );
  return new Response(response.body, { status: response.status, headers });
}

export function clearSessionCookie() {
  return 'portelo_session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/';
}
