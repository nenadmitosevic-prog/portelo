import { query, queryOne, run } from '../../shared/db/index.js';
import { generateId, currentPeriod } from '../../shared/utils/index.js';

export async function getResidentInfostan(db, residentId, limit = 12) {
  return query(db,
    'SELECT * FROM infostan_references WHERE resident_id = ? ORDER BY period DESC LIMIT ?',
    [residentId, limit]
  );
}

export async function getInfostanDetail(db, id, residentId) {
  return queryOne(db,
    'SELECT * FROM infostan_references WHERE id = ? AND resident_id = ?',
    [id, residentId]
  );
}

export async function getResidentKPIs(db, residentId) {
  const period = currentPeriod();
  const current = await queryOne(db,
    'SELECT * FROM infostan_references WHERE resident_id = ? AND period = ?',
    [residentId, period]
  );
  return { current, period };
}

export async function flagDiscrepancy(db, id, residentId, note) {
  await run(db,
    'UPDATE infostan_references SET resident_notes = ?, status = "discrepancy_flagged" WHERE id = ? AND resident_id = ?',
    [note, id, residentId]
  );
}

export async function getBuildingSummary(db, period) {
  const [verified, discrepancies, avgDisc, apartments] = await Promise.all([
    queryOne(db,
      'SELECT COUNT(*) as count FROM infostan_references WHERE building_id = "gce" AND period = ? AND status = "verified_correct"',
      [period]
    ),
    queryOne(db,
      'SELECT COUNT(*) as count FROM infostan_references WHERE building_id = "gce" AND period = ? AND status = "discrepancy_flagged"',
      [period]
    ),
    queryOne(db,
      'SELECT AVG(ABS(discrepancy_amount)) as avg FROM infostan_references WHERE building_id = "gce" AND period = ? AND discrepancy_amount IS NOT NULL',
      [period]
    ),
    queryOne(db,
      'SELECT COUNT(*) as count FROM residents WHERE building_id = "gce" AND active = 1',
      []
    ),
  ]);

  return {
    period,
    verified_count: verified?.count ?? 0,
    discrepancy_count: discrepancies?.count ?? 0,
    avg_discrepancy: avgDisc?.avg ?? 0,
    total_apartments: apartments?.count ?? 0,
  };
}

export async function importFromExcel(db, period, rows) {
  const skipped = [];
  const records = [];

  for (const row of rows) {
    const apartmentRef = String(row.apartment_ref || '').trim();
    if (!apartmentRef) {
      skipped.push({ row, reason: 'Missing apartment_ref' });
      continue;
    }

    const resident = await queryOne(db,
      'SELECT * FROM residents WHERE building_id = "gce" AND apartment_ref = ?',
      [apartmentRef]
    );
    if (!resident) {
      skipped.push({ row, reason: `No resident found for apartment ${apartmentRef}` });
      continue;
    }

    const lineItems = [];
    if (row.grejanje) lineItems.push({ label: 'Grejanje', amount: Number(row.grejanje) });
    if (row.voda) lineItems.push({ label: 'Voda', amount: Number(row.voda) });
    if (row.ostalo) lineItems.push({ label: 'Ostalo', amount: Number(row.ostalo) });

    const expectedAmount = Number(row.expected_amount) || lineItems.reduce((s, i) => s + i.amount, 0);
    const infostanAmount = Number(row.infostan_amount) || null;
    const discrepancy = infostanAmount != null ? infostanAmount - expectedAmount : null;

    let status = 'pending_verification';
    if (discrepancy != null) {
      status = Math.abs(discrepancy) < 1 ? 'verified_correct' : 'pending_verification';
    }

    const existing = await queryOne(db,
      'SELECT id FROM infostan_references WHERE resident_id = ? AND period = ?',
      [resident.id, period]
    );

    if (existing) {
      await run(db,
        `UPDATE infostan_references SET expected_amount = ?, infostan_amount = ?,
         line_items = ?, discrepancy_amount = ?, status = ? WHERE id = ?`,
        [expectedAmount, infostanAmount, JSON.stringify(lineItems), discrepancy, status, existing.id]
      );
      records.push({ id: existing.id, apartment_ref: apartmentRef, action: 'updated' });
    } else {
      const id = generateId('inf');
      await run(db,
        `INSERT INTO infostan_references
         (id, resident_id, building_id, period, expected_amount, infostan_amount, line_items, discrepancy_amount, status)
         VALUES (?, ?, "gce", ?, ?, ?, ?, ?, ?)`,
        [id, resident.id, period, expectedAmount, infostanAmount, JSON.stringify(lineItems), discrepancy, status]
      );
      records.push({ id, apartment_ref: apartmentRef, action: 'created' });
    }
  }

  return { records, skipped };
}

export async function parseGceExcel(buffer) {
  const { read, utils } = await import('xlsx');
  const wb = read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length < 2) return [];

  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const col = names => {
    for (const n of (Array.isArray(names) ? names : [names])) {
      const i = header.findIndex(h => h.includes(n));
      if (i !== -1) return i;
    }
    return -1;
  };

  const aptCol = col(['stan', 'apartment']);
  const infostanCol = col(['infostan']);
  const expectedCol = col(['očekivani', 'ocekivani', 'expected']);
  const grejCol = col(['grejanje', 'heating']);
  const vodaCol = col(['voda', 'water']);
  const ostaloCol = col(['ostalo', 'other']);

  return rows.slice(1)
    .filter(r => r[aptCol])
    .map(r => ({
      apartment_ref: String(r[aptCol]).trim(),
      infostan_amount: infostanCol !== -1 ? Number(r[infostanCol]) || null : null,
      expected_amount: expectedCol !== -1 ? Number(r[expectedCol]) || null : null,
      grejanje: grejCol !== -1 ? Number(r[grejCol]) || null : null,
      voda: vodaCol !== -1 ? Number(r[vodaCol]) || null : null,
      ostalo: ostaloCol !== -1 ? Number(r[ostaloCol]) || null : null,
    }));
}

export async function importResidentsFromExcel(db, buffer) {
  const { read, utils } = await import('xlsx');
  const wb = read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null });
  if (rows.length < 2) return { created: 0, skipped: [] };

  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const aptCol = header.findIndex(h => h.includes('stan') || h.includes('apartment'));
  const nameCol = header.findIndex(h => h.includes('ime') || h.includes('name'));

  const skipped = [];
  let created = 0;

  for (const row of rows.slice(1)) {
    const apt = String(row[aptCol] || '').trim();
    if (!apt) { skipped.push({ row, reason: 'Missing apartment' }); continue; }

    const name = nameCol !== -1 ? String(row[nameCol] || '').trim() : null;
    const id = generateId('res');
    const { hashPin } = await import('../../core/auth/pin.js');
    const pinHash = await hashPin('1234');

    try {
      await run(db,
        'INSERT OR IGNORE INTO residents (id, building_id, apartment_ref, pin_hash, display_name) VALUES (?, "gce", ?, ?, ?)',
        [id, apt, pinHash, name]
      );
      created++;
    } catch (e) {
      skipped.push({ row, reason: e.message });
    }
  }

  return { created, skipped };
}
