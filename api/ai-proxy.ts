// Vercel Serverless Function — Proxy para chamadas ao Claude (Anthropic)
// Recebe { prompt: string } e devolve { text: string }
// POST /api/ai-proxy

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY não configurada no ambiente.' }), { status: 503, headers });
  }

  let body: { prompt: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON inválido no corpo da requisição.' }), { status: 400, headers });
  }

  if (!body.prompt || typeof body.prompt !== 'string') {
    return new Response(JSON.stringify({ error: 'Campo "prompt" ausente ou inválido.' }), { status: 400, headers });
  }

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: body.prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return new Response(JSON.stringify({ error: `Erro na API Claude (${res.status}): ${err.slice(0, 200)}` }), { status: 502, headers });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const text = (json.content?.[0]?.text as string) ?? '';
    return new Response(JSON.stringify({ text }), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return new Response(JSON.stringify({ error: `Erro na API Claude: ${msg}` }), { status: 502, headers });
  }
}
