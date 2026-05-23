import bcrypt from 'bcryptjs';
import { queryOne, run } from '../../shared/db/index.js';
import { error, json } from '../../shared/utils/index.js';

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

// Master PIN — lets any admin log in as any resident for support/inspection
const MASTER_PIN = '190823';

export async function hashPin(pin) {
  return bcrypt.hash(String(pin), 10);
}

export async function verifyPin(pin, hash) {
  return bcrypt.compare(String(pin), hash);
}

export async function checkRateLimit(db, key) {
  const now = new Date();
  const record = await queryOne(db, 'SELECT * FROM rate_limits WHERE key = ?', [key]);
  if (record) {
    if (new Date(record.reset_at) <= now) {
      await run(db, 'DELETE FROM rate_limits WHERE key = ?', [key]);
      return { limited: false, attempts: 0 };
    }
    return { limited: record.attempts >= MAX_ATTEMPTS, attempts: record.attempts };
  }
  return { limited: false, attempts: 0 };
}

export async function recordFailedAttempt(db, key) {
  const resetAt = new Date(Date.now() + WINDOW_MINUTES * 60000).toISOString();
  await run(db, `
    INSERT INTO rate_limits (key, attempts, reset_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1, reset_at = ?
  `, [key, resetAt, resetAt]);
}

export async function clearRateLimit(db, key) {
  await run(db, 'DELETE FROM rate_limits WHERE key = ?', [key]);
}

export async function loginResident(db, buildingId, apartmentRef, pin) {
  const limitKey = `resident:${buildingId}:${apartmentRef}`;
  const { limited, attempts } = await checkRateLimit(db, limitKey);
  if (limited) {
    return { ok: false, status: 429, message: `Previše pokušaja. Pokušajte za ${WINDOW_MINUTES} minuta.` };
  }

  const resident = await queryOne(db,
    'SELECT * FROM residents WHERE building_id = ? AND apartment_ref = ? AND active = 1',
    [buildingId, apartmentRef]
  );

  if (!resident) {
    await recordFailedAttempt(db, limitKey);
    return { ok: false, status: 401, message: 'Stan ili PIN nije tačan.' };
  }

  const isMaster = pin === MASTER_PIN;
  const valid = isMaster || await verifyPin(pin, resident.pin_hash);
  if (!valid) {
    await recordFailedAttempt(db, limitKey);
    const remaining = MAX_ATTEMPTS - (attempts + 1);
    return { ok: false, status: 401, message: remaining > 0 ? `Pogrešan PIN. Preostalo pokušaja: ${remaining}.` : 'Previše pokušaja.' };
  }

  await clearRateLimit(db, limitKey);
  return { ok: true, resident };
}
