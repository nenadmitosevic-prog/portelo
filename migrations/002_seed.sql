-- Portelo Seed Data
-- PIN hashes below are bcryptjs cost-10 hashes
-- res_001/res_002: PIN 1234 | res_003: PIN 9999 | adm_001: password 'Admin2024!'

INSERT OR IGNORE INTO buildings VALUES
  ('ch', 'C&H Solutions', 'direct_billing', '/logos/ch.svg', '#2c5f8a', '{}', datetime('now')),
  ('gce', 'Green Comfort Energy', 'infostan_verification', '/logos/gce.svg', '#1e7f54', '{}', datetime('now'));

-- Placeholder residents — real PINs set via admin or first-login flow
-- PIN hashes generated at runtime via /api/admin/setup
INSERT OR IGNORE INTO residents (id, building_id, apartment_ref, pin_hash, display_name) VALUES
  ('res_001', 'gce', '45', '$2a$10$placeholder_hash_replace', 'Petar Petrović'),
  ('res_002', 'gce', '12', '$2a$10$placeholder_hash_replace', 'Ana Nikolić');

-- C&H residents imported from Excel (see /api/admin/buildings/ch/excel/import)
-- Admin user — password set via environment variable ADMIN_INITIAL_PASSWORD_HASH
INSERT OR IGNORE INTO admin_users (id, email, role, building_id, password_hash) VALUES
  ('adm_001', 'nenad.mitosevic@gmail.com', 'superadmin', NULL, '$2a$10$placeholder_set_via_env');
