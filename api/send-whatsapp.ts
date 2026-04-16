// Vercel Serverless Function — Envia alertas de rastreio de falta via Evolution API
// POST /api/send-whatsapp
// Body: { rows: TrackingRow[], diaLabels: string[] }
// Também persiste o snapshot no Vercel KV para o webhook poder responder menções

interface TrackingRow {
  codigo: string;
  comercial: string;
  unidade: string;
  saldo: number;
  projecao: number;
  nivel: 'critico' | 'alerta' | 'atencao' | 'ok';
}

function buildMessage(rows: TrackingRow[]): string {
  const criticos = rows.filter(r => r.nivel === 'critico');
  const alertas  = rows.filter(r => r.nivel === 'alerta');
  const date     = new Date().toLocaleDateString('pt-BR');

  let msg = `🚨 *RASTREIO DE FALTA — ${date}*\n`;
  msg += `📊 Total monitorado: ${rows.length} produtos\n\n`;

  if (criticos.length) {
    msg += `🔴 *CRÍTICO (≤7 dias)* — ${criticos.length} itens\n`;
    criticos.forEach(r => {
      const proj = r.projecao <= 0 ? 'Sem estoque' : `${r.projecao.toFixed(0)}d`;
      msg += `• *${r.codigo}* – ${r.comercial}\n`;
      msg += `  Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} | Projeção: ${proj}\n`;
    });
    msg += '\n';
  }

  if (alertas.length) {
    msg += `🟡 *ALERTA (8–15 dias)* — ${alertas.length} itens\n`;
    alertas.forEach(r => {
      msg += `• *${r.codigo}* – ${r.comercial}\n`;
      msg += `  Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} | Projeção: ${r.projecao.toFixed(0)}d\n`;
    });
  }

  if (!criticos.length && !alertas.length) {
    msg += '✅ Nenhum item em nível Crítico ou Alerta no momento.';
  }

  return msg;
}

// ─── Vercel KV (Upstash REST) — persiste snapshot para o webhook ─────────────

async function kvSet(key: string, value: unknown): Promise<void> {
  const url   = process.env.SUPABASE_URL;
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !token) return;

  await fetch(`${url}/rest/v1/bot_cache`, {
    method: 'POST',
    headers: {
      'apikey': token,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify([{ key, value }]),
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiUrl   = process.env.EVOLUTION_API_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  // Suporta número individual (5511999999999) ou JID de grupo (120363XXXXXXXXX@g.us)
  // Múltiplos destinos separados por vírgula
  const targets  = process.env.WHATSAPP_TARGETS;

  let body: { rows: TrackingRow[]; diaLabels?: string[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { rows, diaLabels } = body;
  if (!rows?.length) {
    return new Response(JSON.stringify({ error: 'Nenhum dado recebido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Persiste snapshot no KV para o webhook responder menções MESMO QUE o envio de WhatsApp falhe
  await kvSet('last_stock_data', rows);
  if (diaLabels?.length) await kvSet('last_stock_dia_labels', diaLabels);

  if (!apiUrl || !apiKey || !instance || !targets) {
    return new Response(
      JSON.stringify({ error: 'Evolution API não configurada. Dados salvos no cache do Bot, mas os alertas do Zap não foram enviados. Defina EVOLUTION_API_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCE e WHATSAPP_TARGETS.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }



  const message  = buildMessage(rows);
  const numbers  = targets.split(',').map(n => n.trim()).filter(Boolean);

  const results = await Promise.allSettled(
    numbers.map(number =>
      fetch(`${apiUrl}/message/sendText/${instance}`, {
        method: 'POST',
        headers: {
          'apikey': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number, textMessage: { text: message } }),
      }).then(async r => {
        if (!r.ok) {
          const errorBody = await r.text().catch(() => '');
          throw new Error(`HTTP ${r.status}${errorBody ? ': ' + errorBody.slice(0, 200) : ''}`);
        }
        return r.json();
      })
    )
  );

  const sent    = results.filter(r => r.status === 'fulfilled').length;
  const failed  = results.filter(r => r.status === 'rejected').length;
  const errors  = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map(r => r.reason?.message ?? 'Erro desconhecido');

  return new Response(
    JSON.stringify({ sent, failed, errors: errors.length ? errors : undefined }),
    {
      status: failed === numbers.length ? 502 : 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export const config = { runtime: 'edge' };
