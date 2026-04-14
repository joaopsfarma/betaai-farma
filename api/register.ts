// Vercel Serverless Function — Cadastro aberto
// POST /api/register
// Body: { email: string, password: string }

export default async function handler(req: Request): Promise<Response> {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Servidor não configurado.' }), {
      status: 503, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  let body: { email: string; password: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const { email, password } = body;
  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Preencha todos os campos.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const created = await createRes.json() as { id?: string; error?: string; msg?: string };

  if (!createRes.ok || !created.id) {
    const msg = created.msg ?? created.error ?? 'Erro ao criar conta.';
    const friendly = msg.includes('already registered')
      ? 'Este e-mail já está cadastrado.'
      : msg;
    return new Response(JSON.stringify({ error: friendly }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export const config = { runtime: 'edge' };
