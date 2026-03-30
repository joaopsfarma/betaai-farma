// Vercel Serverless Function — Recebe webhooks da Evolution API
// Responde quando o bot é mencionado no grupo com a situação atual de faltas
// POST /api/whatsapp-webhook

interface TrackingRow {
  codigo: string;
  comercial: string;
  unidade: string;
  saldo: number;
  projecao: number;
  nivel: 'critico' | 'alerta' | 'atencao' | 'ok';
}

// ─── Vercel KV (Upstash REST) helpers ────────────────────────────────────────

async function kvGet<T>(key: string): Promise<T | null> {
  const url   = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  const res  = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const json = await res.json() as { result: string | null };
  return json.result ? JSON.parse(json.result) as T : null;
}

// ─── Formata resposta de estoque ──────────────────────────────────────────────

function buildReply(rows: TrackingRow[]): string {
  const criticos = rows.filter(r => r.nivel === 'critico');
  const alertas  = rows.filter(r => r.nivel === 'alerta');
  const date     = new Date().toLocaleDateString('pt-BR');

  if (!criticos.length && !alertas.length) {
    return `✅ *SITUAÇÃO DO ESTOQUE — ${date}*\nNenhum item em nível Crítico ou Alerta no momento.`;
  }

  let msg = `📊 *SITUAÇÃO DO ESTOQUE — ${date}*\n\n`;

  if (criticos.length) {
    msg += `🔴 *CRÍTICO (≤7 dias)* — ${criticos.length} itens\n`;
    criticos.forEach(r => {
      const proj = r.projecao <= 0 ? 'Sem estoque' : `${Math.round(r.projecao)}d`;
      msg += `• *${r.codigo}* – ${r.comercial}\n`;
      msg += `  Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} | Projeção: ${proj}\n`;
    });
    msg += '\n';
  }

  if (alertas.length) {
    msg += `🟡 *ALERTA (8–15 dias)* — ${alertas.length} itens\n`;
    alertas.forEach(r => {
      msg += `• *${r.codigo}* – ${r.comercial}\n`;
      msg += `  Saldo: ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} | Projeção: ${Math.round(r.projecao)}d\n`;
    });
  }

  return msg;
}

// ─── Envia mensagem via Evolution API ────────────────────────────────────────

async function sendReply(to: string, text: string): Promise<void> {
  const apiUrl   = process.env.EVOLUTION_API_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instance) return;

  await fetch(`${apiUrl}/message/sendText/${instance}`, {
    method: 'POST',
    headers: { apikey: apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: to, textMessage: { text } }),
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Só processa novas mensagens
  if (payload.event !== 'messages.upsert') {
    return new Response('OK', { status: 200 });
  }

  const data      = payload.data;
  const key       = data?.key;
  const remoteJid = key?.remoteJid as string | undefined;

  // Ignora mensagens enviadas pelo próprio bot
  if (!remoteJid || key?.fromMe) return new Response('OK', { status: 200 });

  const msg            = data?.message ?? {};
  const text: string   = msg.conversation ?? msg.extendedTextMessage?.text ?? '';
  const mentionedJids: string[] = msg.extendedTextMessage?.contextInfo?.mentionedJid ?? [];

  const isGroup = remoteJid.endsWith('@g.us');

  // Verifica menção por correspondência parcial do número (ignora formatação)
  const botNumber = process.env.BOT_NUMBER ?? '';
  const botMentioned = mentionedJids.some(jid =>
    jid.replace(/\D/g, '').includes(botNumber.replace(/\D/g, '')) ||
    botNumber.replace(/\D/g, '').includes(jid.replace(/\D/g, '').replace('@s.whatsapp.net', ''))
  ) || text.includes(`@${botNumber}`);

  // Em grupos: responde apenas quando mencionado
  // Em DM: responde sempre
  if (isGroup && !botMentioned) {
    return new Response('OK', { status: 200 });
  }

  // ─── Busca último snapshot de estoque ────────────────────────────────────
  const rows = await kvGet<TrackingRow[]>('last_stock_data');

  if (!rows || rows.length === 0) {
    await sendReply(
      remoteJid,
      '⚠️ Ainda não há dados de estoque disponíveis.\nEnvie o rastreio pelo sistema *Logística Farma* para eu ter a situação atualizada.',
    );
    return new Response('OK', { status: 200 });
  }

  // ─── Filtra por item específico se mencionado no texto ───────────────────
  const termoBusca = text
    .replace(/@\d+/g, '') // remove menções "@numero"
    .trim()
    .toLowerCase();

  let rowsFiltrados = rows;
  if (termoBusca.length >= 3) {
    const filtrado = rows.filter(
      r =>
        r.codigo.toLowerCase().includes(termoBusca) ||
        r.comercial.toLowerCase().includes(termoBusca),
    );
    if (filtrado.length > 0) rowsFiltrados = filtrado;
  }

  const reply = buildReply(rowsFiltrados);
  await sendReply(remoteJid, reply);

  return new Response('OK', { status: 200 });
}

export const config = { runtime: 'edge' };
