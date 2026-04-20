// Vercel Edge Function — Envia alertas de ruptura predita via Evolution API
// POST /api/send-rupture-alert
// Body: { items: RuptureAlertItem[] }

export const config = { runtime: 'edge' };

interface RuptureAlertItem {
  produtoId: string;
  produtoNome: string;
  estoqueAtual: number;
  totalSolicitado: number;
  saldoProjetado: number;
  status: string;
  score: number;
  classificacao: string;
  riscoAssistencial: string;
  substituto?: string;
}

function buildRuptureMessage(items: RuptureAlertItem[]): string {
  const date = new Date().toLocaleDateString('pt-BR');
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const criticos = items.filter(i => i.classificacao === 'CRITICO' || i.riscoAssistencial === 'CRITICO');
  const altos = items.filter(i => (i.classificacao === 'ALTO' || i.riscoAssistencial === 'ALTO') && !criticos.includes(i));

  let msg = `🚨 *ALERTA DE RUPTURA PREDITA — ${date} ${time}*\n`;
  msg += `📊 FarmaIA · Painel de Previsibilidade\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  if (criticos.length > 0) {
    msg += `🔴 *RISCO CRÍTICO* — ${criticos.length} item(ns)\n\n`;
    criticos.forEach(item => {
      const deficit = Math.abs(item.saldoProjetado);
      msg += `• *${item.produtoNome}* (${item.produtoId})\n`;
      msg += `  📦 Estoque: ${item.estoqueAtual} | 📋 Pedido: ${item.totalSolicitado}\n`;
      msg += `  ⚠️ Déficit: ${deficit} un | Score: ${item.score}/100\n`;
      if (item.substituto) msg += `  🔄 Substituto: ${item.substituto}\n`;
      msg += '\n';
    });
  }

  if (altos.length > 0) {
    msg += `🟠 *RISCO ALTO* — ${altos.length} item(ns)\n\n`;
    altos.forEach(item => {
      const deficit = Math.abs(item.saldoProjetado);
      msg += `• *${item.produtoNome}* (${item.produtoId})\n`;
      msg += `  📦 Estoque: ${item.estoqueAtual} | 📋 Solicitado: ${item.totalSolicitado}\n`;
      msg += `  ⚠️ Déficit: ${deficit} un | Score: ${item.score}/100\n`;
      msg += '\n';
    });
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📌 Total rupturas: ${items.length} | Críticos: ${criticos.length} | Altos: ${altos.length}\n`;
  msg += `🤖 _Gerado automaticamente por FarmaIA_`;

  return msg;
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
  const targets  = process.env.WHATSAPP_TARGETS;

  if (!apiUrl || !apiKey || !instance || !targets) {
    return new Response(
      JSON.stringify({ error: 'Evolution API não configurada.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { items: RuptureAlertItem[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { items } = body;
  if (!items?.length) {
    return new Response(JSON.stringify({ error: 'Nenhum item de ruptura' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const message = buildRuptureMessage(items);
  const numbers = targets.split(',').map(n => n.trim()).filter(Boolean);

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

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  return new Response(
    JSON.stringify({ ok: true, sent, failed, total: items.length }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
