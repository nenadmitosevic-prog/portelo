import { Router } from '../../core/router.js';
import { validateSession, getTokenFromRequest } from '../../core/auth/session.js';
import { queryOne, query } from '../../shared/db/index.js';
import { json, error, currentPeriod, generateId } from '../../shared/utils/index.js';
import {
  getResidentBills, getBillDetail, getResidentKPIs,
  getBuildingSummary, updateBillStatus, createBill,
  importBillsFromExcel, parseChExcel,
} from './billing.js';
import { extractElectricityBill } from '../../shared/pdf-parser/extract.js';

const router = new Router();

async function requireResidentSession(request, db) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.resident_id) return null;
  const resident = await queryOne(db, 'SELECT * FROM residents WHERE id = ?', [session.resident_id]);
  if (!resident || resident.building_id !== 'ch') return null;
  return resident;
}

async function requireAdminSession(request, db) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.admin_id) return null;
  const admin = await queryOne(db, 'SELECT * FROM admin_users WHERE id = ?', [session.admin_id]);
  if (!admin) return null;
  if (admin.role !== 'superadmin' && admin.building_id !== 'ch') return null;
  return admin;
}

// --- Resident routes ---

router.get('/api/resident/bills', async (req, env) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);
  const { results } = await getResidentBills(env.DB, resident.id);
  return json(results.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })));
});

router.get('/api/resident/bills/:id', async (req, env, _ctx, params) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);
  const bill = await getBillDetail(env.DB, params.id, resident.id);
  if (!bill) return error('Not found', 404);
  return json({ ...bill, line_items: JSON.parse(bill.line_items || '[]') });
});

router.get('/api/resident/dashboard/ch', async (req, env) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);

  const [kpis, { results: bills }, electricity] = await Promise.all([
    getResidentKPIs(env.DB, resident.id),
    getResidentBills(env.DB, resident.id, 12),
    query(env.DB, 'SELECT * FROM electricity_bills WHERE building_id = "ch" ORDER BY period DESC LIMIT 12'),
  ]);

  return json({
    resident: { id: resident.id, apartment_ref: resident.apartment_ref, display_name: resident.display_name },
    kpis,
    bills: bills.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })),
    electricity: electricity.results.map(e => ({ ...e, extracted_data: JSON.parse(e.extracted_data || 'null') })),
  });
});

// --- Admin routes ---

router.get('/api/admin/buildings/ch/summary', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const summary = await getBuildingSummary(env.DB, 'ch', period);
  return json(summary);
});

router.get('/api/admin/buildings/ch/residents', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT id, apartment_ref, display_name, email, phone, active, created_at FROM residents WHERE building_id = "ch" ORDER BY apartment_ref'
  );
  return json(results);
});

router.post('/api/admin/buildings/ch/residents', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  if (!body.apartment_ref || !body.pin) return error('apartment_ref and pin required');

  const { hashPin } = await import('../../core/auth/pin.js');
  const pinHash = await hashPin(body.pin);
  const id = generateId('res');

  try {
    await run(env.DB,
      'INSERT INTO residents (id, building_id, apartment_ref, pin_hash, display_name, email, phone) VALUES (?, "ch", ?, ?, ?, ?, ?)',
      [id, body.apartment_ref, pinHash, body.display_name || null, body.email || null, body.phone || null]
    );
    return json({ id }, 201);
  } catch (e) {
    if (e.message?.includes('UNIQUE')) return error('Apartment already exists', 409);
    throw e;
  }
});

router.put('/api/admin/buildings/ch/residents/:rid', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  const { run } = await import('../../shared/db/index.js');
  const fields = [], values = [];

  if (body.pin) {
    const { hashPin } = await import('../../core/auth/pin.js');
    fields.push('pin_hash = ?'); values.push(await hashPin(body.pin));
  }
  if (body.display_name !== undefined) { fields.push('display_name = ?'); values.push(body.display_name); }
  if (body.active !== undefined) { fields.push('active = ?'); values.push(body.active ? 1 : 0); }

  if (!fields.length) return error('Nothing to update');
  values.push(params.rid);
  await run(env.DB, `UPDATE residents SET ${fields.join(', ')} WHERE id = ? AND building_id = "ch"`, values);
  return json({ ok: true });
});

router.get('/api/admin/buildings/ch/bills', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const status = url.searchParams.get('status');

  let sql = `SELECT b.*, r.apartment_ref, r.display_name
    FROM bills b JOIN residents r ON b.resident_id = r.id
    WHERE b.building_id = "ch" AND b.period = ?`;
  const params = [period];
  if (status) { sql += ' AND b.status = ?'; params.push(status); }
  sql += ' ORDER BY r.apartment_ref';

  const { results } = await query(env.DB, sql, params);
  return json(results.map(b => ({ ...b, line_items: JSON.parse(b.line_items || '[]') })));
});

router.post('/api/admin/buildings/ch/bills', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  const id = await createBill(env.DB, { buildingId: 'ch', ...body });
  return json({ id }, 201);
});

router.put('/api/admin/buildings/ch/bills/:bid', async (req, env, _ctx, params) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  await updateBillStatus(env.DB, params.bid, body);
  return json({ ok: true });
});

router.post('/api/admin/buildings/ch/excel/import', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
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

  const { bills, skipped } = await importBillsFromExcel(env.DB, 'ch', period, rows);
  const logId = generateId('log');
  const { run } = await import('../../shared/db/index.js');
  await run(env.DB,
    'INSERT INTO import_logs (id, building_id, period, import_type, row_count, skipped_count, skipped_rows) VALUES (?, "ch", ?, "bills", ?, ?, ?)',
    [logId, period, bills.length, skipped.length, JSON.stringify(skipped)]
  );

  return json({ imported: bills.length, skipped: skipped.length, skipped_rows: skipped });
});

router.post('/api/admin/buildings/ch/electricity/upload', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file) return error('No file provided');

  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const r2Key = `ch/${new Date().toISOString().slice(0, 7)}/electricity.pdf`;

  await env.BILLS_BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: 'application/pdf' } });

  const extracted = await extractElectricityBill(base64, env);
  const id = generateId('elec');
  const period = extracted.ok ? extracted.data.period : (formData.get('period') || currentPeriod());

  const { run } = await import('../../shared/db/index.js');
  await run(env.DB,
    'INSERT OR REPLACE INTO electricity_bills (id, building_id, period, consumption_kwh, total_amount, pdf_r2_key, extracted_data, extraction_ok) VALUES (?, "ch", ?, ?, ?, ?, ?, ?)',
    [id, period,
      extracted.ok ? extracted.data.consumption_kwh : null,
      extracted.ok ? extracted.data.total_amount_rsd : null,
      r2Key, JSON.stringify(extracted), extracted.ok ? 1 : 0]
  );

  return json({ id, period, extraction_ok: extracted.ok, data: extracted.ok ? extracted.data : null });
});

router.get('/api/admin/buildings/ch/electricity', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT * FROM electricity_bills WHERE building_id = "ch" ORDER BY period DESC LIMIT 24'
  );
  return json(results);
});

export default router;
