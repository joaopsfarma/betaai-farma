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
  const proj  = r.projecao <= 0 ? '⛔ Sem estoque' : `${Math.round(r.projecao)}d`;
  const media = r.media > 0 ? r.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0';
  const saldo = r.saldo.toLocaleString('pt-BR');
  const tend  = r.tendencia === 'alta' ? '↑ Alta' : r.tendencia === 'queda' ? '↓ Queda' : '→ Estável';

  if (compact) {
    return `• *${r.codigo}* – ${r.comercial}\n  Saldo: ${saldo} ${r.unidade} | Média/dia: ${media} | Projeção: ${proj} | ${tend}\n`;
  }
  return `• *${r.codigo}* – ${r.comercial}\n  Saldo: ${saldo} ${r.unidade}\n  Média/dia: ${media} ${r.unidade} | Projeção: ${proj}\n  Tendência: ${tend}\n`;
}

// ─── Monta texto compacto do estoque para enviar à IA ────────────────────────

function resumoEstoqueParaIA(rows: TrackingRow[]): string {
  const relevantes = rows.filter(r => r.nivel !== 'ok');
  if (!relevantes.length) return 'Nenhum item crítico ou em alerta no momento.';

  return relevantes.map(r => {
    const proj = r.projecao <= 0 ? 'SEM ESTOQUE' : `${Math.round(r.projecao)} dias`;
    const tend = r.tendencia === 'alta' ? 'ALTA' : r.tendencia === 'queda' ? 'QUEDA' : 'ESTÁVEL';
    return `[${r.nivel.toUpperCase()}] ${r.codigo} | ${r.comercial} | Saldo: ${r.saldo} ${r.unidade} | Média/dia: ${r.media.toFixed(1)} | Projeção: ${proj} | Tendência: ${tend}`;
  }).join('\n');
}

// ─── Gemini Flash — análise inteligente ──────────────────────────────────────

async function askGemini(pergunta: string, rows: TrackingRow[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return '';

  const date   = new Date().toLocaleDateString('pt-BR');
  const estoque = resumoEstoqueParaIA(rows);

  const prompt = `Você é um assistente especialista em gestão de estoque farmacêutico hospitalar. Hoje é ${date}.

DADOS DE ESTOQUE ATUAL:
${estoque}

PERGUNTA: ${pergunta || 'Faça um resumo da situação atual e indique as prioridades.'}

Responda em português brasileiro de forma clara e objetiva.
Formate para WhatsApp: use *negrito* para destaques e • para listas.
Seja direto e prático. Priorize o que é mais urgente. Máximo 250 palavras.`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
        }),
      },
    );
    if (!res.ok) {
      const err = await res.text();
      return `⚠️ Erro ao consultar IA (${res.status}): ${err.slice(0, 120)}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    return (json.candidates?.[0]?.content?.parts?.[0]?.text as string) ?? '';
  } catch (e) {
    return `⚠️ Erro ao consultar IA: ${String(e).slice(0, 120)}`;
  }
}

// ─── Detecta intenção da pergunta ────────────────────────────────────────────

type Intencao = 'ruptura' | 'critico' | 'alerta' | 'tudo' | 'geral' | 'ia';

function detectarIntencao(texto: string): Intencao {
  if (!texto || texto.length < 3) return 'geral';

  const t = texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Frases longas (mais de 3 palavras) → sempre usar IA
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length > 3) return 'ia';

  // Comandos curtos → filtro por palavra-chave
  if (/ruptur|sem estoque|zerado|acabou/.test(t)) return 'ruptura';
  if (/^criti|^urgent|^emergenc/.test(t))         return 'critico';
  if (/^alert|^atenc/.test(t))                    return 'alerta';
  if (/^tudo$|^todos$|^resumo$|^status$/.test(t)) return 'tudo';

  // Qualquer outra coisa → IA
  return 'ia';
}

// ─── Formata resposta de estoque (respostas rápidas por palavra-chave) ────────

function buildReply(rows: TrackingRow[], intencao: Intencao): string {
  const date = new Date().toLocaleDateString('pt-BR');

  if (intencao === 'ruptura') {
    const itens = rows.filter(r => r.projecao <= 1);
    if (!itens.length) return `✅ *RUPTURAS — ${date}*\nNenhum item com ruptura hoje (projeção 0–1 dia).`;
    let msg = `🚨 *RUPTURAS HOJE — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com projeção de 0–1 dia\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  if (intencao === 'critico') {
    const itens = rows.filter(r => r.nivel === 'critico');
    if (!itens.length) return `✅ *CRÍTICOS — ${date}*\nNenhum item em nível Crítico no momento.`;
    let msg = `🔴 *CRÍTICOS (≤7 dias) — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'}\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  if (intencao === 'alerta') {
    const itens = rows.filter(r => r.nivel === 'alerta');
    if (!itens.length) return `✅ *ALERTAS — ${date}*\nNenhum item em nível Alerta no momento.`;
    let msg = `🟡 *ALERTA (8–15 dias) — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'}\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

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

  // Geral: resumo padrão
  const rupturas = rows.filter(r => r.projecao <= 1);
  const criticos = rows.filter(r => r.nivel === 'critico');
  const alertas  = rows.filter(r => r.nivel === 'alerta');
  if (!criticos.length && !alertas.length) {
    return `✅ *SITUAÇÃO DO ESTOQUE — ${date}*\nNenhum item em nível Crítico ou Alerta no momento.`;
  }
  let msg = `📊 *SITUAÇÃO DO ESTOQUE — ${date}*\n`;
  if (rupturas.length) {
    msg += `⚠️ _${rupturas.length} ${rupturas.length === 1 ? 'item' : 'itens'} com ruptura hoje_ — pergunte sobre *rupturas*\n`;
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
  msg += `\n💡 _Pergunte livremente ou use: *rupturas* | *crítico* | *alerta* | *tudo*_`;
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

  // ─── Remove menção do texto ───────────────────────────────────────────────
  const textoLimpo = text.replace(/@\S+/g, '').trim();

  // ─── Busca por produto específico (ex: "@bot amoxicilina") ───────────────
  if (textoLimpo.length >= 3) {
    const termoBusca = textoLimpo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const filtrado = rows.filter(r =>
      r.codigo.toLowerCase().includes(termoBusca) ||
      r.comercial.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termoBusca) ||
      (r.generico ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termoBusca),
    );

    if (filtrado.length > 0) {
      const reply = buildReply(filtrado, 'tudo');
      await sendReply(remoteJid, reply);
      return new Response('OK', { status: 200 });
    }
  }

  // ─── Detecta intenção e responde ─────────────────────────────────────────
  const intencao = detectarIntencao(textoLimpo);

  if (intencao === 'ia') {
    // Pergunta livre → Gemini analisa
    const respostaIA = await askGemini(textoLimpo, rows);
    if (respostaIA) {
      await sendReply(remoteJid, `🤖 ${respostaIA}`);
      return new Response('OK', { status: 200 });
    }
    // Fallback se Gemini falhar
  }

  const reply = buildReply(rows, intencao);
  await sendReply(remoteJid, reply);

  return new Response('OK', { status: 200 });
}

export const config = { runtime: 'edge' };
