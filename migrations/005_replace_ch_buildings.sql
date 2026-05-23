-- Remove placeholder/wrong ch data (delete in FK-safe order)
DELETE FROM sessions WHERE resident_id IN (SELECT id FROM residents WHERE building_id = 'ch');
DELETE FROM import_logs WHERE building_id = 'ch';
DELETE FROM electricity_bills WHERE building_id = 'ch';
DELETE FROM bills WHERE building_id = 'ch';
DELETE FROM residents WHERE building_id = 'ch';
DELETE FROM buildings WHERE id = 'ch';

-- Add the two real C&H Solutions buildings
INSERT OR IGNORE INTO buildings (id, name, type, logo_url, accent_color, settings) VALUES
  ('zh', 'Zen Hill', 'direct_billing', '/logos/zh.svg', '#2c5f8a', '{"group":"ch","group_name":"C&H Solutions"}'),
  ('kv', 'Kovačeva', 'direct_billing', '/logos/kv.svg', '#2c5f8a', '{"group":"ch","group_name":"C&H Solutions"}');
