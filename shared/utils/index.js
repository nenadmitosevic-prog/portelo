export function generateId(prefix = '') {
  const rand = crypto.getRandomValues(new Uint8Array(12));
  const hex = Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
  return prefix ? `${prefix}_${hex}` : hex;
}

export function generateToken() {
  const rand = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(rand).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function formatRSD(amount) {
  return new Intl.NumberFormat('sr-RS', { style: 'currency', currency: 'RSD', maximumFractionDigits: 0 }).format(amount);
}

export function periodToYYYYMM(ggmm) {
  // Converts 2604 → '2026-04'
  const s = String(ggmm).padStart(4, '0');
  return `20${s.slice(0, 2)}-${s.slice(2, 4)}`;
}

export function currentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function error(message, status = 400) {
  return json({ error: message }, status);
}

export function parsePeriodFromBody(body) {
  if (!body?.period) return null;
  if (/^\d{4}-\d{2}$/.test(body.period)) return body.period;
  return null;
}
