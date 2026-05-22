import { Router } from '../../core/router.js';
import { validateSession, getTokenFromRequest } from '../../core/auth/session.js';
import { queryOne, query, run } from '../../shared/db/index.js';
import { json, error, currentPeriod, generateId } from '../../shared/utils/index.js';
import {
  getResidentInfostan, getInfostanDetail, getResidentKPIs,
  flagDiscrepancy, getBuildingSummary, importFromExcel,
  parseGceExcel, importResidentsFromExcel,
} from './infostan.js';
import { extractElectricityBill } from '../../shared/pdf-parser/extract.js';

const router = new Router();

async function requireResidentSession(request, db) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.resident_id) return null;
  const resident = await queryOne(db, 'SELECT * FROM residents WHERE id = ?', [session.resident_id]);
  if (!resident || resident.building_id !== 'gce') return null;
  return resident;
}

async function requireAdminSession(request, db) {
  const token = getTokenFromRequest(request);
  const session = await validateSession(db, token);
  if (!session?.admin_id) return null;
  const admin = await queryOne(db, 'SELECT * FROM admin_users WHERE id = ?', [session.admin_id]);
  if (!admin) return null;
  if (admin.role !== 'superadmin' && admin.building_id !== 'gce') return null;
  return admin;
}

// --- Resident routes ---

router.get('/api/resident/infostan', async (req, env) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);
  const { results } = await getResidentInfostan(env.DB, resident.id);
  return json(results.map(r => ({
    ...r,
    line_items: JSON.parse(r.line_items || '[]'),
    infostan_line_items: JSON.parse(r.infostan_line_items || '[]'),
  })));
});

router.get('/api/resident/infostan/:id', async (req, env, _ctx, params) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);
  const ref = await getInfostanDetail(env.DB, params.id, resident.id);
  if (!ref) return error('Not found', 404);
  return json({
    ...ref,
    line_items: JSON.parse(ref.line_items || '[]'),
    infostan_line_items: JSON.parse(ref.infostan_line_items || '[]'),
  });
});

router.get('/api/resident/dashboard/gce', async (req, env) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);

  const [kpis, { results: history }, electricity] = await Promise.all([
    getResidentKPIs(env.DB, resident.id),
    getResidentInfostan(env.DB, resident.id, 12),
    query(env.DB, 'SELECT * FROM electricity_bills WHERE building_id = "gce" ORDER BY period DESC LIMIT 12'),
  ]);

  return json({
    resident: { id: resident.id, apartment_ref: resident.apartment_ref, display_name: resident.display_name },
    kpis,
    history: history.map(r => ({
      ...r,
      line_items: JSON.parse(r.line_items || '[]'),
      infostan_line_items: JSON.parse(r.infostan_line_items || '[]'),
    })),
    electricity: electricity.results,
  });
});

router.post('/api/resident/infostan/:id/flag', async (req, env, _ctx, params) => {
  const resident = await requireResidentSession(req, env.DB);
  if (!resident) return error('Unauthorized', 401);
  const body = await req.json();
  if (!body.note) return error('Note required');
  await flagDiscrepancy(env.DB, params.id, resident.id, body.note);
  return json({ ok: true });
});

// --- Admin routes ---

router.get('/api/admin/buildings/gce/summary', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();
  const summary = await getBuildingSummary(env.DB, period);
  return json(summary);
});

router.get('/api/admin/buildings/gce/residents', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT id, apartment_ref, display_name, email, phone, active, created_at FROM residents WHERE building_id = "gce" ORDER BY apartment_ref'
  );
  return json(results);
});

router.get('/api/admin/buildings/gce/infostan', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const url = new URL(req.url);
  const period = url.searchParams.get('period') || currentPeriod();

  const { results } = await query(env.DB,
    `SELECT i.*, r.apartment_ref, r.display_name
     FROM infostan_references i JOIN residents r ON i.resident_id = r.id
     WHERE i.building_id = "gce" AND i.period = ?
     ORDER BY r.apartment_ref`,
    [period]
  );
  return json(results.map(r => ({
    ...r,
    line_items: JSON.parse(r.line_items || '[]'),
    infostan_line_items: JSON.parse(r.infostan_line_items || '[]'),
  })));
});

router.post('/api/admin/buildings/gce/infostan', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const body = await req.json();
  const id = generateId('inf');
  await run(env.DB,
    `INSERT INTO infostan_references
     (id, resident_id, building_id, period, expected_amount, infostan_amount, line_items, discrepancy_amount)
     VALUES (?, ?, "gce", ?, ?, ?, ?, ?)`,
    [id, body.resident_id, body.period, body.expected_amount, body.infostan_amount,
     JSON.stringify(body.line_items || []),
     body.infostan_amount != null ? body.infostan_amount - body.expected_amount : null]
  );
  return json({ id }, 201);
});

router.post('/api/admin/buildings/gce/excel/import-residents', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const formData = await req.formData();
  const file = formData.get('file');
  if (!file) return error('No file provided');
  const buffer = await file.arrayBuffer();
  const result = await importResidentsFromExcel(env.DB, buffer);
  return json(result);
});

router.post('/api/admin/buildings/gce/excel/import', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);

  const formData = await req.formData();
  const file = formData.get('file');
  const period = formData.get('period');

  if (!file) return error('No file provided');
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return error('Valid period (YYYY-MM) required');

  const buffer = await file.arrayBuffer();
  const rows = await parseGceExcel(buffer);

  if (formData.get('preview') === '1') {
    return json({ preview: rows.slice(0, 10), total: rows.length });
  }

  const { records, skipped } = await importFromExcel(env.DB, period, rows);
  const logId = generateId('log');
  await run(env.DB,
    'INSERT INTO import_logs (id, building_id, period, import_type, row_count, skipped_count, skipped_rows) VALUES (?, "gce", ?, "infostan", ?, ?, ?)',
    [logId, period, records.length, skipped.length, JSON.stringify(skipped)]
  );

  return json({ imported: records.length, skipped: skipped.length, skipped_rows: skipped });
});

router.post('/api/admin/buildings/gce/electricity/upload', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);

  const formData = await req.formData();
  const file = formData.get('file');
  if (!file) return error('No file provided');

  const buffer = await file.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const r2Key = `gce/${new Date().toISOString().slice(0, 7)}/electricity.pdf`;

  await env.BILLS_BUCKET.put(r2Key, buffer, { httpMetadata: { contentType: 'application/pdf' } });

  const extracted = await extractElectricityBill(base64, env);
  const id = generateId('elec');
  const period = extracted.ok ? extracted.data.period : (formData.get('period') || currentPeriod());

  await run(env.DB,
    'INSERT OR REPLACE INTO electricity_bills (id, building_id, period, consumption_kwh, total_amount, pdf_r2_key, extracted_data, extraction_ok) VALUES (?, "gce", ?, ?, ?, ?, ?, ?)',
    [id, period,
     extracted.ok ? extracted.data.consumption_kwh : null,
     extracted.ok ? extracted.data.total_amount_rsd : null,
     r2Key, JSON.stringify(extracted), extracted.ok ? 1 : 0]
  );

  return json({ id, period, extraction_ok: extracted.ok });
});

router.get('/api/admin/buildings/gce/electricity', async (req, env) => {
  const admin = await requireAdminSession(req, env.DB);
  if (!admin) return error('Unauthorized', 401);
  const { results } = await query(env.DB,
    'SELECT * FROM electricity_bills WHERE building_id = "gce" ORDER BY period DESC LIMIT 24'
  );
  return json(results);
});

export default router;
