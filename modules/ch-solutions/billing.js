import { query, queryOne, run } from '../../shared/db/index.js';
import { generateId, periodToYYYYMM } from '../../shared/utils/index.js';

export async function getResidentBills(db, residentId, limit = 12) {
  return query(db,
    'SELECT * FROM bills WHERE resident_id = ? ORDER BY period DESC LIMIT ?',
    [residentId, limit]
  );
}

export async function getBillDetail(db, billId, residentId) {
  return queryOne(db,
    'SELECT * FROM bills WHERE id = ? AND resident_id = ?',
    [billId, residentId]
  );
}

export async function getResidentKPIs(db, residentId, outstandingOverride = null) {
  const [current, outstanding, lastPaid] = await Promise.all([
    queryOne(db,
      'SELECT * FROM bills WHERE resident_id = ? ORDER BY period DESC LIMIT 1',
      [residentId]
    ),
    outstandingOverride !== null
      ? Promise.resolve({ total: outstandingOverride })
      : queryOne(db,
          'SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total FROM bills WHERE resident_id = ? AND status IN ("pending","overdue","partial")',
          [residentId]
        ),
    queryOne(db,
      'SELECT * FROM bills WHERE resident_id = ? AND status = "paid" ORDER BY paid_at DESC LIMIT 1',
      [residentId]
    ),
  ]);
  return { current, outstanding: outstanding?.total ?? 0, lastPaid };
}

export async function createBill(db, { residentId, buildingId, period, totalAmount, lineItems = [], dueDate, notes }) {
  const id = generateId('bill');
  await run(db,
    'INSERT INTO bills (id, resident_id, building_id, period, total_amount, due_date, line_items, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, residentId, buildingId, period, totalAmount, dueDate, JSON.stringify(lineItems), notes]
  );
  return id;
}

export async function updateBillStatus(db, billId, { status, paidAmount, paidAt, notes }) {
  const fields = [];
  const values = [];
  if (status !== undefined) { fields.push('status = ?'); values.push(status); }
  if (paidAmount !== undefined) { fields.push('paid_amount = ?'); values.push(paidAmount); }
  if (paidAt !== undefined) { fields.push('paid_at = ?'); values.push(paidAt); }
  if (notes !== undefined) { fields.push('notes = ?'); values.push(notes); }
  if (!fields.length) return;
  values.push(billId);
  await run(db, `UPDATE bills SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function getBuildingSummary(db, buildingId, period) {
  const [billed, collected, residents] = await Promise.all([
    queryOne(db,
      'SELECT COALESCE(SUM(total_amount), 0) as total FROM bills WHERE building_id = ? AND period = ?',
      [buildingId, period]
    ),
    queryOne(db,
      'SELECT COALESCE(SUM(paid_amount), 0) as total FROM bills WHERE building_id = ? AND period = ?',
      [buildingId, period]
    ),
    queryOne(db,
      'SELECT COUNT(*) as count FROM residents WHERE building_id = ? AND active = 1',
      [buildingId]
    ),
  ]);
  return {
    period,
    total_billed: billed?.total ?? 0,
    total_collected: collected?.total ?? 0,
    outstanding: (billed?.total ?? 0) - (collected?.total ?? 0),
    resident_count: residents?.count ?? 0,
  };
}

export async function importBillsFromExcel(db, buildingId, period, rows) {
  const skipped = [];
  const bills = [];

  for (const row of rows) {
    const apartmentRef = String(row.apartment_ref || '').trim();
    if (!apartmentRef) {
      skipped.push({ row, reason: 'Missing apartment_ref' });
      continue;
    }

    const resident = await queryOne(db,
      'SELECT * FROM residents WHERE building_id = ? AND apartment_ref = ?',
      [buildingId, apartmentRef]
    );
    if (!resident) {
      skipped.push({ row, reason: `No resident found for apartment ${apartmentRef}` });
      continue;
    }

    const existing = await queryOne(db,
      'SELECT id FROM bills WHERE resident_id = ? AND period = ?',
      [resident.id, period]
    );

    const lineItems = [];
    if (row.kwh_amount) lineItems.push({ label: 'Električna energija (kWh)', amount: Number(row.kwh_amount) });
    if (row.kw_amount) lineItems.push({ label: 'Snaga (kW)', amount: Number(row.kw_amount) });
    if (row.other_items) lineItems.push(...row.other_items);

    const total = row.total_override != null ? row.total_override : lineItems.reduce((s, i) => s + i.amount, 0);

    if (existing) {
      await run(db,
        'UPDATE bills SET total_amount = ?, line_items = ? WHERE id = ?',
        [total, JSON.stringify(lineItems), existing.id]
      );
      bills.push({ id: existing.id, apartment_ref: apartmentRef, action: 'updated' });
    } else {
      const id = await createBill(db, {
        residentId: resident.id,
        buildingId,
        period,
        totalAmount: total,
        lineItems,
        dueDate: null,
      });
      bills.push({ id, apartment_ref: apartmentRef, action: 'created' });
    }
  }

  return { bills, skipped };
}

export async function parseChExcel(buffer) {
  const { read, utils } = await import('xlsx');
  const wb = read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

  if (!rows.length) return [];

  // Detect format: GGMM billing format vs simple format
  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const hasGGMM = header.includes('oznakaporostoradavalac') || header.includes('idprostorason');

  if (hasGGMM) {
    return parseNalogFormat(rows);
  }
  return parseSimpleFormat(rows);
}

function parseNalogFormat(rows) {
  // IDLokacijeSON, IDProstoraSON, OznakaProstoraDavalac, IDDavaocaSON, IDUslugeSON,
  // JM, NetoCenaJMRSD, KolicinaSopstvena, KolicinaZajednicka, MesecnoNeto, StopaPDV,
  // MesecnoBruto, PotrosnjaOD, PotrosnjaDO, GGMMFakturisanja
  const byApt = {};
  let period = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r[2]) continue;
    const apt = String(r[2]).trim();
    const svcId = r[4];
    const gross = Number(r[11]) || 0;
    const ggmm = r[14];

    if (ggmm && !period) {
      period = periodToYYYYMM(ggmm);
    }

    if (!byApt[apt]) byApt[apt] = { kwh_amount: 0, kw_amount: 0 };
    const sid = Number(svcId);
    if (sid === 8 || sid === 72) byApt[apt].kwh_amount += gross;   // heating kWh (8) + cooling kWh (72)
    if (sid === 44 || sid === 73) byApt[apt].kw_amount += gross;   // heating kW (44) + cooling kW (73)
  }

  return Object.entries(byApt).map(([apt, data]) => ({
    apartment_ref: apt,
    ...data,
    detected_period: period,
  }));
}

function parseSimpleFormat(rows) {
  const header = rows[0].map(h => String(h || '').trim().toLowerCase());
  const col = name => header.findIndex(h => h.includes(name));
  const aptCol = col('stan') !== -1 ? col('stan') : 0;
  const kwhCol = col('kwh');
  const kwCol = col('kw');
  const totalCol = col('ukupno') !== -1 ? col('ukupno') : col('total');

  return rows.slice(1)
    .filter(r => r[aptCol])
    .map(r => ({
      apartment_ref: String(r[aptCol]).trim(),
      kwh_amount: kwhCol !== -1 ? Number(r[kwhCol]) || 0 : 0,
      kw_amount: kwCol !== -1 ? Number(r[kwCol]) || 0 : 0,
      total_override: totalCol !== -1 ? Number(r[totalCol]) || null : null,
    }));
}
