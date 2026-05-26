-- Payments table: bookkeeper-confirmed transfers for C&H residents
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  resident_id TEXT NOT NULL,
  building_id TEXT NOT NULL,
  amount REAL NOT NULL,
  booked_date TEXT NOT NULL,    -- YYYY-MM-DD from bank statement
  reference TEXT,               -- bookkeeper invoice reference (e.g. "IZ 2026-12345")
  note TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed: 16 records parsed from C&H kartice Jan 1 – May 5, 2026

-- kv/1 Karanović Milorad — lump-sum payments split 50/50 with kv/7
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date, note) VALUES
  ('pay_kv1_2601a', 'res_7eef0a436f', 'kv', 12500.00, '2026-01-05', 'Split 50/50 sa kv/7 (Karanović)'),
  ('pay_kv1_2601b', 'res_7eef0a436f', 'kv', 15000.00, '2026-01-05', 'Split 50/50 sa kv/7 (Karanović)');

-- kv/7 Karanović Milorad — lump-sum payments split 50/50 with kv/1
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date, note) VALUES
  ('pay_kv7_2601a', 'res_a34ac0580f', 'kv', 12500.00, '2026-01-05', 'Split 50/50 sa kv/1 (Karanović)'),
  ('pay_kv7_2601b', 'res_a34ac0580f', 'kv', 15000.00, '2026-01-05', 'Split 50/50 sa kv/1 (Karanović)');

-- zh/1 Mina Rajković
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh1_2603a', 'res_1432e46488', 'zh', 9653.89, '2026-03-30');

-- zh/5 Aleksandar Žeravčić
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh5_2601a', 'res_1f407e5c9a', 'zh', 8513.25, '2026-01-03'),
  ('pay_zh5_2601b', 'res_1f407e5c9a', 'zh', 8432.50, '2026-01-23');

-- zh/18 Petar Džakula
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh18_2601a', 'res_6b34984fe7', 'zh', 10856.00, '2026-01-06'),
  ('pay_zh18_2601b', 'res_6b34984fe7', 'zh', 11524.00, '2026-01-24');

-- zh/104 Ivana Bajović
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh104_2601a', 'res_9dc4b82d17', 'zh', 17960.40, '2026-01-16');

-- zh/118 Dragan i Dragana Bulut
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh118_2602a', 'res_8e89c76d4b', 'zh', 22000.00, '2026-02-25');

-- zh/202 Marijana Jelić — payment attributed to this apartment (±3% match)
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh202_2601a', 'res_d2df6d9be7', 'zh', 7884.50, '2026-01-25');

-- zh/203 Saška Cvetković
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh203_2601a', 'res_110bbea87f', 'zh', 4177.77, '2026-01-30'),
  ('pay_zh203_2601b', 'res_110bbea87f', 'zh', 4217.77, '2026-01-30');

-- zh/207 Marijana Jelić — payment attributed to this apartment (±3% match)
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh207_2601a', 'res_9d62950c01', 'zh', 4649.00, '2026-01-25');

-- zh/309 Nataša Jeličić
INSERT OR IGNORE INTO payments (id, resident_id, building_id, amount, booked_date) VALUES
  ('pay_zh309_2602a', 'res_7e322fad1b', 'zh', 4247.22, '2026-02-27');
