const ANTHROPIC_HAIKU = 'claude-haiku-4-5-20251001';

export async function extractElectricityBill(pdfBase64, env) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_HAIKU,
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
          },
          {
            type: 'text',
            text: `Extract the following fields from this Serbian electricity bill (EPS) and return ONLY valid JSON, no other text:
{
  "period": "YYYY-MM",
  "consumption_kwh": number,
  "total_amount_rsd": number,
  "billing_from": "YYYY-MM-DD",
  "billing_to": "YYYY-MM-DD"
}
If a field cannot be determined, set it to null.`,
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    return { ok: false, raw: `HTTP ${response.status}` };
  }

  const data = await response.json();
  const text = data.content?.[0]?.text ?? '';

  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, raw: text };
  }
}
