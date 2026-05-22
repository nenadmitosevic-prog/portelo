#!/usr/bin/env node
// One-shot CLI import: reads the NalogZaNaplatu Excel and pushes bills to local D1
// Usage: node scripts/import-excel.js <path-to-xlsx> <period YYYY-MM>
import { readFileSync } from 'fs';
import { read, utils } from 'xlsx';

const file = process.argv[2];
const period = process.argv[3];

if (!file || !period) {
  console.error('Usage: node scripts/import-excel.js <xlsx> <YYYY-MM>');
  process.exit(1);
}

const buf = readFileSync(file);
const wb = read(buf, { type: 'buffer' });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = utils.sheet_to_json(ws, { header: 1, defval: null });

function periodToYYYYMM(ggmm) {
  const s = String(ggmm).padStart(4, '0');
  return `20${s.slice(0,2)}-${s.slice(2,4)}`;
}

const byApt = {};
let detectedPeriod = null;

for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r[2]) continue;
  const apt = String(r[2]).trim();
  const svcId = r[4];
  const gross = Number(r[11]) || 0;
  const ggmm = r[14];
  if (ggmm && !detectedPeriod) detectedPeriod = periodToYYYYMM(ggmm);
  if (!byApt[apt]) byApt[apt] = { kwh: 0, kw: 0 };
  if (svcId === 8) byApt[apt].kwh += gross;
  if (svcId === 44) byApt[apt].kw += gross;
}

console.log(`Detected period from file: ${detectedPeriod || 'unknown'}`);
console.log(`Using period: ${period}`);
console.log(`\nApartments found: ${Object.keys(byApt).length}`);
console.log('\nGenerated SQL (pipe to: wrangler d1 execute portelo-db --file=- --remote):\n');

for (const [apt, data] of Object.entries(byApt)) {
  if (!apt || apt === 'null') continue;
  const total = data.kwh + data.kw;
  const lineItems = JSON.stringify([
    { label: 'Električna energija (kWh)', amount: Math.round(data.kwh * 100) / 100 },
    { label: 'Snaga (kW)', amount: Math.round(data.kw * 100) / 100 },
  ]).replace(/'/g, "''");

  console.log(`-- Apartment ${apt} | Total: ${Math.round(total)} RSD`);
  console.log(`INSERT INTO bills (id, resident_id, building_id, period, total_amount, line_items, status)`);
  console.log(`  SELECT hex(randomblob(12)), r.id, 'ch', '${period}', ${total}, '${lineItems}', 'pending'`);
  console.log(`  FROM residents r WHERE r.building_id='ch' AND r.apartment_ref='${apt}'`);
  console.log(`  ON CONFLICT DO NOTHING;`);
}
