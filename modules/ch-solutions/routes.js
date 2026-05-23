import { Router } from '../../core/router.js';
import { validateSession, getTokenFromRequest } from '../../core/auth/session.js';
import { queryOne, query, run } from '../../shared/db/index.js';
import { json, error, currentPeriod, generateId } from '../../shared/utils/index.js';
import {
  getResidentBills, getBillDetail, getResidentKPIs,
  getBuildingSummary, updateBillStatus, createBill,
  importBillsFromExcel, parseChExcel,
} from './billing.js';
import { extractElectricityBill } from '../../shared/pdf-parser/extract.js';

const router = new Router();

// Accepts any direct_billing building
async function requireResidentSession(request, db) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.resident_id) return null;
  const resident = await queryOne(db, 'SELECT * FROM residents WHERE id = ?', [session.resident_id]);
  if (!resident) return null;
  const building = await queryOne(db, 'SELECT * FROM buildings WHERE id = ? AND type = "direct_billing"', [resident.building_id]);
  if (!building) return null;
  return { resident, building };
}

async function requireAdminSession(request, db, buildingId) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.admin_id) return null;
  const admin = await queryOne(db, 'SELECT * FROM admin_users WHERE id = ?', [session.admin_id]);
  if (!admin) return null;
  if (admin.role !== 'superadmin' && admin.building_id !== buildingId) return null;
  return admin;
}

// --- Resident routes ---

router.get('/api/resident/bills', async (req, env) => {
  const ctx = await requireResidentSession(req, env.DB);
  if (!ctx) return error('Unauthorized', 401);
  const { resident } = ctx;
  const { results } = await getResidentBills(env.DB, resident.id);
  return json(results.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })));
});

router.get('/api/resident/bills/:id', async (req, env, _ctx, params) => {
  const ctx = await requireResidentSession(req, env.DB);
  if (!ctx) return error('Unauthorized', 401);
  const bill = await getBillDetail(env.DB, params.id, ctx.resident.id);
  if (!bill) return error('Not found', 404);
  return json({ ...bill, line_items: JSON.parse(bill.line_items || '[]') });
});

// --- GCE resident dashboard (bv / ku) ---
router.get('/api/resident/dashboard/gce-resident', async (req, env) => {
  const ctx = await requireResidentSession(req, env.DB);
  if (!ctx) return error('Unauthorized', 401);
  const { resident, building } = ctx;

  // Resident's bills sorted newest first
  const { results: bills } = await getResidentBills(env.DB, resident.id, 12);
  const latest = bills[0];

  let comparison = null;
  if (latest) {
    const latestItems = JSON.parse(latest.line_items || '{}');

    // All other apartments' bills for the same building + period
    const { results: peers } = await query(env.DB,
      'SELECT total_amount, line_items FROM bills WHERE building_id = ? AND period = ? AND resident_id != ?',
      [building.id, latest.period, resident.id]
    );

    const allGross = [latest.total_amount, ...peers.map(p => p.total_amount)].sort((a, b) => a - b);
    const allKwh = [
      latestItems.consumption_kwh || 0,
      ...peers.map(p => { const li = JSON.parse(p.line_items || '{}'); return li.consumption_kwh || 0; }),
    ].sort((a, b) => a - b);

    const rankByGross = allGross.filter(v => v < latest.total_amount).length + 1;
    const avgGross = Math.round(allGross.reduce((s, v) => s + v, 0) / allGross.length * 100) / 100;
    const avgKwh  = Math.round(allKwh.reduce((s, v) => s + v, 0) / allKwh.length * 100) / 100;

    comparison = {
      rank: rankByGross,
      total_apartments: allGross.length,
      min_gross: allGross[0],
      avg_gross: avgGross,
      max_gross: allGross[allGross.length - 1],
      min_kwh: allKwh[0],
      avg_kwh: avgKwh,
      max_kwh: allKwh[allKwh.length - 1],
    };
  }

  return json({
    resident: { id: resident.id, apartment_ref: resident.apartment_ref, display_name: resident.display_name, building_id: resident.building_id },
    building: { id: building.id, name: building.name, accent_color: building.accent_color },
    latest: latest ? { ...latest, line_items: JSON.parse(latest.line_items || '{}') } : null,
    comparison,
    history: bills.map(b => {
      const li = JSON.parse(b.line_items || '{}');
      return { period: b.period, total_amount: b.total_amount, status: b.status,
               consumption_kwh: li.consumption_kwh || 0, service_type: li.service_type || null };
    }),
  });
});

router.get('/api/resident/dashboard/ch', async (req, env) => {
  const ctx = await requireResidentSession(req, env.DB);
  if (!ctx) return error('Unauthorized', 401);
  const { resident, building } = ctx;

  const [kpis, { results: bills }, electricity] = await Promise.all([
    getResidentKPIs(env.DB, resident.id),
    getResidentBills(env.DB, resident.id, 12),
    query(env.DB, 'SELECT * FROM electricity_bills WHERE building_id = ? ORDER BY period DESC LIMIT 12', [resident.building_id]),
  ]);

  return json({
    resident: { id: resident.id, apartment_ref: resident.apartment_ref, display_name: resident.display_name, building_id: resident.building_id },
    building: { id: building.id, name: building.name, accent_color: building.accent_color },
    kpis,
    bills: bills.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })),
    electricity: electricity.results,
  });
});

// --- Admin routes (generic :bid for zh/kv/any direct_billing building) ---

router.get('/api/admin/buildings/:bid/summary', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const summary = await getBuildingSummary(env.DB, params.bid, period);
  return json(summary);
});

router.get('/api/admin/buildings/:bid/residents', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT id, apartment_ref, display_name, email, phone, active, created_at FROM residents WHERE building_id = ? ORDER BY CAST(apartment_ref AS INTEGER), apartment_ref',
    [params.bid]
  );
  return json(results);
});

router.post('/api/admin/buildings/:bid/residents', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  if (!body.apartment_ref || !body.pin) return error('apartment_ref and pin required');

  const { hashPin } = await import('../../core/auth/pin.js');
  const pinHash = await hashPin(body.pin);
  const id = generateId('res');

  try {
    await run(env.DB,
      'INSERT INTO residents (id, building_id, apartment_ref, pin_hash, display_name, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, params.bid, body.apartment_ref, pinHash, body.display_name || null, body.email || null, body.phone || null]
    );
    return json({ id }, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return error('Apartment already exists', 409);
    throw e;
  }
});

router.put('/api/admin/buildings/:bid/residents/:rid', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  const fields = [], values = [];

  if (body.pin) {
    const { hashPin } = await import('../../core/auth/pin.js');
    fields.push('pin_hash = ?'); values.push(await hashPin(body.pin));
  }
  if (body.display_name !== undefined) { fields.push('display_name = ?'); values.push(body.display_name); }
  if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }

  if (!fields.length) return error('Nothing to update');
  values.push(params.rid, params.bid);
  await run(env.DB, `UPDATE residents SET ${fields.join(', ')} WHERE id = ? AND building_id = ?`, values);
  return json({ ok: true });
});

router.get('/api/admin/buildings/:bid/bills', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const status = url.searchParams.get('status');

  let sql = `SELECT b.*, r.apartment_ref, r.display_name
    FROM bills b JOIN residents r ON b.resident_id = r.id
    WHERE b.building_id = ? AND b.period = ?`;
  const sqlParams = [params.bid, period];
  if (status) { sql += ' AND b.status = ?'; sqlParams.push(status); }
  sql += ' ORDER BY CAST(r.apartment_ref AS INTEGER), r.apartment_ref';

  const { results } = await query(env.DB, sql, sqlParams);
  return json(results.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })));
});

router.post('/api/admin/buildings/:bid/bills', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  const id = await createBill(env.DB, { buildingId: params.bid, ...body });
  return json({ id }, 201);
});

router.put('/api/admin/buildings/:bid/bills/:billId', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  await updateBillStatus(env.DB, params.billId, body);
  return json({ ok: true });
});

router.post('/api/admin/buildings/:bid/excel/import', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);

  const formData = await req.formData();
  const file = formData.get('file');
  const period = formData.get('period');

  if (!file) return error('No file provided');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return error('Valid period (YYYY-MM) required');

  const buffer = await file.arrayBuffer();
  const rows = await parseChExcel(buffer);

  if (formData.get('preview') === '1') {
    return json({ preview: rows.slice(0, 10), total: rows.length });
  }

  const { bills, skipped } = await importBillsFromExcel(env.DB, params.bid, period, rows);
  const logId = generateId('log');
  await run(env.DB,
    'INSERT INTO import_logs (id, building_id, period, import_type, row_count, skipped_count, skipped_rows) VALUES (?, ?, ?, "bills", ?, ?, ?)',
    [logId, params.bid, period, bills.length, skipped.length, JSON.stringify(skipped)]
  );

  return json({ imported: bills.length, skipped: skipped.length, skipped_rows: skipped });
});

router.post('/api/admin/buildings/:bid/electricity/upload', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file) return error('No file provided');

  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const r2Key = `${params.bid}/${new Date().toISOString().slice(0, 7)}/electricity.pdf`;

  await env.BILLS_BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: 'application/pdf' } });

  const extracted = await extractElectricityBill(base64, env);
  const id = generateId('elec');
  const period = extracted.ok ? extracted.data.period : (formData.get('period') || currentPeriod());

  await run(env.DB,
    'INSERT OR REPLACE INTO electricity_bills (id, building_id, period, consumption_kwh, total_amount, pdf_r2_key, extracted_data, extraction_ok) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [id, params.bid, period,
      extracted.ok ? extracted.data.consumption_kwh : null,
      extracted.ok ? extracted.data.total_amount_rsd : null,
      r2Key, JSON.stringify(extracted), extracted.ok ? 1 : 0]
  );

  return json({ id, period, extraction_ok: extracted.ok, data: extracted.ok ? extracted.data : null });
});

router.get('/api/admin/buildings/:bid/electricity', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB, params.bid);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT * FROM electricity_bills WHERE building_id = ? ORDER BY period DESC LIMIT 24',
    [params.bid]
  );
  return json(results);
});

export default router;
