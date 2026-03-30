// Vercel Serverless Function — Recebe webhooks da Evolution API
// Responde quando o bot é mencionado no grupo com a situação atual de faltas
// POST /api/whatsapp-webhook

interface TrackingRow {
  codigo: string;
  descricao: string;
  comercial: string;
  generico: string;
  unidade: string;
  dias: number[];
  total: number;
  media: number;
  saldo: number;
  projecao: number;
  tendencia: 'alta' | 'queda' | 'estavel';
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

// ─── Formata linha de um item ─────────────────────────────────────────────────

function formatItem(r: TrackingRow, compact = false): string {
  const proj     = r.projecao <= 0 ? '⛔ Sem estoque' : `${Math.round(r.projecao)}d`;
  const media    = r.media > 0 ? r.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';
  const saldo    = r.saldo.toLocaleString('pt-BR');
  const tend     = r.tendencia === 'alta' ? '↑ Alta' : r.tendencia === 'queda' ? '↓ Queda' : '→ Estável';

  if (compact) {
    return `• *${r.codigo}* – ${r.comercial}\n  Saldo: ${saldo} ${r.unidade} | Média/dia: ${media} | Projeção: ${proj} | ${tend}\n`;
  }
  return `• *${r.codigo}* – ${r.comercial}\n  Saldo: ${saldo} ${r.unidade}\n  Média/dia: ${media} ${r.unidade} | Projeção: ${proj}\n  Tendência: ${tend}\n`;
}

// ─── Detecta intenção da pergunta ────────────────────────────────────────────

type Intencao = 'ruptura' | 'critico' | 'alerta' | 'atencao' | 'tudo' | 'geral';

function detectarIntencao(texto: string): Intencao {
  const t = texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .toLowerCase();

  if (/ruptur|sem estoque|zerado|0 dia|faltando hoje|acabou/.test(t))  return 'ruptura';
  if (/criti|urgente|emergencia|urgencia/.test(t))                      return 'critico';
  if (/alert|atenc/.test(t))                                            return 'alerta';
  if (/tudo|todos|completo|geral|resumo|situacao|status/.test(t))       return 'tudo';
  return 'geral';
}

// ─── Formata resposta de estoque ──────────────────────────────────────────────

function buildReply(rows: TrackingRow[], intencao: Intencao): string {
  const date = new Date().toLocaleDateString('pt-BR');

  // ── Ruptura: projeção 0–1 dia ─────────────────────────────────────────────
  if (intencao === 'ruptura') {
    const itens = rows.filter(r => r.projecao <= 1);
    if (!itens.length) {
      return `✅ *RUPTURAS — ${date}*\nNenhum item com ruptura hoje (projeção 0–1 dia).`;
    }
    let msg = `🚨 *RUPTURAS HOJE — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com projeção de 0–1 dia\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  // ── Crítico: ≤7 dias ──────────────────────────────────────────────────────
  if (intencao === 'critico') {
    const itens = rows.filter(r => r.nivel === 'critico');
    if (!itens.length) {
      return `✅ *CRÍTICOS — ${date}*\nNenhum item em nível Crítico no momento.`;
    }
    let msg = `🔴 *CRÍTICOS (≤7 dias) — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'}\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  // ── Alerta: 8–15 dias ─────────────────────────────────────────────────────
  if (intencao === 'alerta') {
    const itens = rows.filter(r => r.nivel === 'alerta');
    if (!itens.length) {
      return `✅ *ALERTAS — ${date}*\nNenhum item em nível Alerta no momento.`;
    }
    let msg = `🟡 *ALERTA (8–15 dias) — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'}\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  // ── Tudo: todos os problemas ──────────────────────────────────────────────
  if (intencao === 'tudo') {
    const rupturas = rows.filter(r => r.projecao <= 1);
    const criticos = rows.filter(r => r.nivel === 'critico' && r.projecao > 1);
    const alertas  = rows.filter(r => r.nivel === 'alerta');

    if (!rupturas.length && !criticos.length && !alertas.length) {
      return `✅ *ESTOQUE COMPLETO — ${date}*\nNenhum item em situação crítica ou alerta.`;
    }

    let msg = `📋 *RELATÓRIO COMPLETO — ${date}*\n\n`;

    if (rupturas.length) {
      msg += `🚨 *RUPTURA (0–1 dia)* — ${rupturas.length} itens\n`;
      rupturas.forEach(r => { msg += formatItem(r, true); });
      msg += '\n';
    }
    if (criticos.length) {
      msg += `🔴 *CRÍTICO (2–7 dias)* — ${criticos.length} itens\n`;
      criticos.forEach(r => { msg += formatItem(r, true); });
      msg += '\n';
    }
    if (alertas.length) {
      msg += `🟡 *ALERTA (8–15 dias)* — ${alertas.length} itens\n`;
      alertas.forEach(r => { msg += formatItem(r, true); });
    }
    return msg;
  }

  // ── Geral: resumo padrão (crítico + alerta) ───────────────────────────────
  const rupturas = rows.filter(r => r.projecao <= 1);
  const criticos = rows.filter(r => r.nivel === 'critico');
  const alertas  = rows.filter(r => r.nivel === 'alerta');

  if (!criticos.length && !alertas.length) {
    return `✅ *SITUAÇÃO DO ESTOQUE — ${date}*\nNenhum item em nível Crítico ou Alerta no momento.`;
  }

  let msg = `📊 *SITUAÇÃO DO ESTOQUE — ${date}*\n`;

  if (rupturas.length) {
    msg += `⚠️ _${rupturas.length} ${rupturas.length === 1 ? 'item' : 'itens'} com ruptura hoje_ — pergunte sobre *rupturas* para detalhes\n`;
  }

  msg += '\n';

  if (criticos.length) {
    msg += `🔴 *CRÍTICO (≤7 dias)* — ${criticos.length} itens\n`;
    criticos.forEach(r => { msg += formatItem(r); });
    msg += '\n';
  }

  if (alertas.length) {
    msg += `🟡 *ALERTA (8–15 dias)* — ${alertas.length} itens\n`;
    alertas.forEach(r => { msg += formatItem(r); });
  }

  msg += `\n💡 _Pergunte sobre: *rupturas* | *crítico* | *alerta* | *tudo*_`;
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

  // Só processa novas mensagens (aceita maiúsculo e minúsculo)
  const event = (payload.event ?? '').toLowerCase().replace('_', '.');
  if (event !== 'messages.upsert') {
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

  // Verifica menção por correspondência parcial do número ou LID (WhatsApp moderno usa @lid)
  const botNumber = process.env.BOT_NUMBER ?? '';
  const botLid    = process.env.BOT_LID ?? '';
  const botMentioned = mentionedJids.some(jid => {
    const jidClean = jid.replace(/\D/g, '');
    const numClean = botNumber.replace(/\D/g, '');
    return (
      (numClean && (jidClean.includes(numClean) || numClean.includes(jidClean))) ||
      (botLid   && jid.includes(botLid))
    );
  }) || text.includes(`@${botNumber}`);

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

  // ─── Remove menção do texto e detecta intenção ───────────────────────────
  const textoLimpo = text.replace(/@\S+/g, '').trim();

  // Busca por produto específico (ex: "@bot amoxicilina")
  if (textoLimpo.length >= 3) {
    const termoBusca = textoLimpo.toLowerCase();
    const filtrado = rows.filter(
      r =>
        r.codigo.toLowerCase().includes(termoBusca) ||
        r.comercial.toLowerCase().includes(termoBusca),
    );
    if (filtrado.length > 0) {
      const reply = buildReply(filtrado, 'tudo');
      await sendReply(remoteJid, reply);
      return new Response('OK', { status: 200 });
    }
  }

  // Detecta intenção e responde
  const intencao = detectarIntencao(textoLimpo);
  const reply    = buildReply(rows, intencao);
  await sendReply(remoteJid, reply);

  return new Response('OK', { status: 200 });
}

export const config = { runtime: 'edge' };
