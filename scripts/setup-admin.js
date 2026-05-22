#!/usr/bin/env node
// Usage: node scripts/setup-admin.js <password>
// Generates a bcrypt hash to use as ADMIN_INITIAL_PASSWORD_HASH secret
import bcrypt from 'bcryptjs';

const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/setup-admin.js <password>');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);
console.log('\nPassword hash (copy into D1 or wrangler secret):\n');
console.log(hash);
console.log('\nUpdate migrations/002_seed.sql or run:');
console.log(`wrangler d1 execute portelo-db --command="UPDATE admin_users SET password_hash='${hash}' WHERE email='nenad.mitosevic@gmail.com'" --remote`);
