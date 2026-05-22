import bcrypt from 'bcryptjs';
import { queryOne } from '../../shared/db/index.js';

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function loginAdmin(db, email, password) {
  const admin = await queryOne(db,
    'SELECT * FROM admin_users WHERE email = ?',
    [email]
  );
  if (!admin) return { ok: false };

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return { ok: false };

  return { ok: true, admin };
}

export function requireAdmin(session) {
  return session?.admin_id != null;
}

export function requireSuperAdmin(session, admin) {
  return admin?.role === 'superadmin';
}

export function canAccessBuilding(admin, buildingId) {
  if (admin.role === 'superadmin') return true;
  return admin.building_id === buildingId;
}
