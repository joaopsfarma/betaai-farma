// Vercel Serverless Function — Cadastro com código de convite
// POST /api/register
// Body: { email: string, password: string, code: string }

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

  let body: { email: string; password: string; code: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const { email, password, code } = body;
  if (!email || !password || !code) {
    return new Response(JSON.stringify({ error: 'Preencha todos os campos.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const headers = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };

  // 1. Valida o código de convite
  const codeRes = await fetch(
    `${supabaseUrl}/rest/v1/invite_codes?code=eq.${encodeURIComponent(code.trim().toUpperCase())}&select=id,used`,
    { headers },
  );
  const codes = await codeRes.json() as { id: number; used: boolean }[];

  if (!codes.length) {
    return new Response(JSON.stringify({ error: 'Código de convite inválido.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  if (codes[0].used) {
    return new Response(JSON.stringify({ error: 'Este código de convite já foi utilizado.' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  const codeId = codes[0].id;

  // 2. Cria o usuário via Admin API
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

  // 3. Marca o código como usado
  await fetch(`${supabaseUrl}/rest/v1/invite_codes?id=eq.${codeId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Prefer': 'return=minimal' },
    body: JSON.stringify({ used: true, used_by: email, used_at: new Date().toISOString() }),
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export const config = { runtime: 'edge' };
