// Vercel Serverless Function — Proxy para chamadas ao Claude (Anthropic)
// Recebe { prompt: string } e devolve { text: string }
// POST /api/ai-proxy

import Anthropic from '@anthropic-ai/sdk';

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
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: body.prompt }],
    });

    const text = message.content[0]?.type === 'text' ? message.content[0].text : '';
    return new Response(JSON.stringify({ text }), { status: 200, headers });
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
    return new Response(JSON.stringify({ error: `Erro na API Claude: ${msg}` }), { status: 502, headers });
  }
}
