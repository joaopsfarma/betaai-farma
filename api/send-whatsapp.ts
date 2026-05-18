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
  media?: number;
  tendencia?: 'alta' | 'queda' | 'estavel';
  nivel: 'critico' | 'alerta' | 'atencao' | 'ok';
}

const MAX_CRITICOS = 8;
const MAX_ALERTAS  = 5;

const DIV = '━━━━━━━━━━━━━━━━━━━━';

function tendLabel(t?: string): string {
  if (t === 'alta')  return 'consumo crescente';
  if (t === 'queda') return 'consumo em queda';
  return 'estável';
}

function buildMessage(rows: TrackingRow[]): string {
  const date = new Date().toLocaleDateString('pt-BR');
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const zerados  = rows
    .filter(r => r.nivel === 'critico' && r.projecao <= 0)
    .sort((a, b) => a.saldo - b.saldo);
  const criticos = rows
    .filter(r => r.nivel === 'critico' && r.projecao > 0)
    .sort((a, b) => a.projecao - b.projecao);
  const alertas  = rows
    .filter(r => r.nivel === 'alerta')
    .sort((a, b) => a.projecao - b.projecao);
  const atencao  = rows.filter(r => r.nivel === 'atencao').length;

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  let msg = `🏥 *RASTREIO DE FALTA — ${date} ${hora}*\n${DIV}\n`;
  msg += `📦 ${rows.length} monitorados`;
  if (zerados.length)  msg += ` · ⛔ ${zerados.length} zerado${zerados.length > 1 ? 's' : ''}`;
  if (criticos.length) msg += ` · 🔴 ${criticos.length} crítico${criticos.length > 1 ? 's' : ''}`;
  if (alertas.length)  msg += ` · 🟡 ${alertas.length} alerta${alertas.length > 1 ? 's' : ''}`;
  if (atencao)         msg += ` · 🔵 ${atencao} atenção`;
  msg += '\n';

  // ── Zerados — seção prioritária ────────────────────────────────────────────
  if (zerados.length) {
    msg += `\n⛔ *ZERADOS — PROVIDENCIAR AGORA*\n`;
    zerados.forEach((r, i) => {
      const media = r.media != null && r.media > 0
        ? ` · Média: ${r.media.toFixed(1)}/${r.unidade}`
        : '';
      msg += `${i + 1}. *${r.comercial}* (${r.codigo}) ⚠️ Risco Assistencial\n`;
      msg += `   Saldo: 0 ${r.unidade}${media}\n`;
    });
  }

  // ── Críticos ───────────────────────────────────────────────────────────────
  if (criticos.length) {
    const exibidos = criticos.length > MAX_CRITICOS
      ? `${MAX_CRITICOS} de ${criticos.length} exibidos`
      : `${criticos.length} iten${criticos.length > 1 ? 's' : ''}`;
    msg += `\n${DIV}\n🔴 *CRÍTICO ≤7 DIAS* — ${exibidos}\n\n`;
    criticos.slice(0, MAX_CRITICOS).forEach((r, i) => {
      const media = r.media != null && r.media > 0
        ? ` · Média: ${r.media.toFixed(1)}/${r.unidade}`
        : '';
      const tend = r.tendencia ? ` · ${tendLabel(r.tendencia)}` : '';
      msg += `${i + 1}. *${r.comercial}* (${r.codigo}) ⚠️ Risco Assistencial\n`;
      msg += `   Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} · ⏳ ${Math.round(r.projecao)}d${media}${tend}\n`;
    });
    if (criticos.length > MAX_CRITICOS) {
      msg += `_+ ${criticos.length - MAX_CRITICOS} outros → envie *crítico* ao bot_\n`;
    }
  }

  // ── Alertas ────────────────────────────────────────────────────────────────
  if (alertas.length) {
    const exibidos = alertas.length > MAX_ALERTAS
      ? `${MAX_ALERTAS} de ${alertas.length} exibidos`
      : `${alertas.length} iten${alertas.length > 1 ? 's' : ''}`;
    msg += `\n${DIV}\n🟡 *ALERTA 8–15 DIAS* — ${exibidos}\n\n`;
    alertas.slice(0, MAX_ALERTAS).forEach((r, i) => {
      const media = r.media != null && r.media > 0
        ? ` · Média: ${r.media.toFixed(1)}/${r.unidade}`
        : '';
      const tend = r.tendencia ? ` · ${tendLabel(r.tendencia)}` : '';
      msg += `${i + 1}. *${r.comercial}* (${r.codigo}) ⚠️ Risco Assistencial\n`;
      msg += `   Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} · ⏳ ${Math.round(r.projecao)}d${media}${tend}\n`;
    });
    if (alertas.length > MAX_ALERTAS) {
      msg += `_+ ${alertas.length - MAX_ALERTAS} outros → envie *alerta* ao bot_\n`;
    }
  }

  if (!zerados.length && !criticos.length && !alertas.length) {
    msg += '\n✅ Nenhum item em nível Crítico ou Alerta com risco assistencial no momento.';
  }

  // ── Rodapé com comandos do bot ─────────────────────────────────────────────
  msg += `\n${DIV}\n💬 *Comandos do bot:*\n`;
  msg += `• *crítico* → lista completa de críticos\n`;
  msg += `• *alerta* → lista completa de alertas\n`;
  msg += `• *zerado* → apenas itens sem estoque\n`;
  msg += `• *risco* → somente com risco assistencial\n`;
  msg += `_FarmaIA · Rastreio Automatizado_`;

  return msg;
}

// ─── Vercel KV (Upstash REST) — persiste snapshot para o webhook ─────────────

async function kvSet(key: string, value: unknown): Promise<void> {
  const url   = process.env.SUPABASE_URL;
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !token) return;

  try {
    const res = await fetch(`${url}/rest/v1/bot_cache`, {
      method: 'POST',
      headers: {
        'apikey': token,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ key, value }]),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[SW] kvSet falhou — HTTP ${res.status} | key=${key} | ${errBody.slice(0, 300)}`);
    } else {
      console.log(`[SW] kvSet ok — key=${key}`);
    }
  } catch (e) {
    console.error('[SW] kvSet erro (rede/timeout):', e);
  }
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
          const isSessionError =
            errorBody.includes('SessionError') ||
            errorBody.includes('No sessions') ||
            errorBody.includes('session') ||
            errorBody.includes('Connection Closed') ||
            errorBody.includes('Connection closed') ||
            errorBody.includes('connection') ||
            errorBody.includes('Unauthorized') ||
            errorBody.includes('not-authorized');
          const err = new Error(`HTTP ${r.status}${errorBody ? ': ' + errorBody.slice(0, 200) : ''}`) as Error & { sessionError?: boolean };
          err.sessionError = isSessionError;
          throw err;
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
  const sessionError = results
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .some(r => (r.reason as any)?.sessionError === true);

  return new Response(
    JSON.stringify({ sent, failed, errors: errors.length ? errors : undefined, sessionError: sessionError || undefined }),
    {
      status: failed === numbers.length ? (sessionError ? 401 : 502) : 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export const config = { runtime: 'edge' };
