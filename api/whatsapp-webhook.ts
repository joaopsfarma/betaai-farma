// Vercel Serverless Function — Recebe webhooks da Evolution API
// Responde quando o bot é mencionado no grupo com a situação atual de faltas
// POST /api/whatsapp-webhook

import Anthropic from '@anthropic-ai/sdk';

// ─── Tipos da análise de farmácias (Remanejamento) ───────────────────────────

interface AnaliseItem {
  produto: string;
  unidade: string;
  estoqueId: string;
  estoqueName: string;
  saldoAtual: number;
  consumoTotal: number;
  consumoDiario: number;
  coberturaDias: number;
  status: 'EXCESSO' | 'NORMAL' | 'ALERTA' | 'CRÍTICO' | 'SEM CONSUMO';
  estMin: number;
  estMax: number;
  custoMedio: number;
}

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
  const rupturas = rows.filter(r => r.projecao <= 0).length;
  const criticos = rows.filter(r => r.nivel === 'critico').length;
  const alertas  = rows.filter(r => r.nivel === 'alerta').length;
  const atencao  = rows.filter(r => r.nivel === 'atencao').length;
  const ok       = rows.filter(r => r.nivel === 'ok').length;

  const cabecalho = `RESUMO: ${rows.length} itens total | Ruptura: ${rupturas} | Crítico: ${criticos} | Alerta: ${alertas} | Atenção: ${atencao} | OK: ${ok}`;

  // Todos os itens não-ok ordenados por urgência + amostra dos ok
  const naoOk = rows
    .filter(r => r.nivel !== 'ok')
    .sort((a, b) => a.projecao - b.projecao);

  const linhas = naoOk.map(r => {
    const proj = r.projecao <= 0 ? 'SEM ESTOQUE' : `${Math.round(r.projecao)}d`;
    const tend = r.tendencia === 'alta' ? '↑' : r.tendencia === 'queda' ? '↓' : '→';
    return `[${r.nivel.toUpperCase()}] ${r.codigo} ${r.comercial} | ${r.saldo}${r.unidade} | med:${r.media.toFixed(1)} | proj:${proj} | ${tend}`;
  });

  if (!linhas.length) return `${cabecalho}\nTodos os itens com estoque OK.`;
  return `${cabecalho}\n\nITENS COM ATENÇÃO:\n${linhas.join('\n')}`;
}

// ─── Claude (Anthropic) — análise inteligente ────────────────────────────────

async function askClaude(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '⚠️ ANTHROPIC_API_KEY não configurada no ambiente.';

  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    });
    return message.content[0]?.type === 'text' ? message.content[0].text : '';
  } catch (e) {
    return `⚠️ Erro ao consultar IA: ${String(e).slice(0, 120)}`;
  }
}

async function askGroq(pergunta: string, rows: TrackingRow[]): Promise<string> {
  const date    = new Date().toLocaleDateString('pt-BR');
  const hora    = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const estoque = resumoEstoqueParaIA(rows);

  const rupturas = rows.filter(r => r.projecao <= 0).length;
  const criticos = rows.filter(r => r.nivel === 'critico').length;
  const situacao = rupturas > 0 ? '🚨 há rupturas agora' : criticos > 0 ? '⚠️ há itens críticos' : '✅ estoque estável';

  const sistemaMsg = `Você é o FarmaBot, assistente de farmácia hospitalar do sistema FarmaIA. Hoje é ${date}, ${hora}. Situação geral: ${situacao}.

Seu jeito de ser:
- Fale como um colega farmacêutico experiente, não como um robô. Seja humano e direto.
- Adapte o tom à urgência: se há ruptura, seja objetivo e urgente. Se está tudo ok, seja mais tranquilo.
- Quando a pergunta for vaga ("tá crítico?", "e aí?"), interprete pelo contexto do estoque e responda com o que for mais relevante.
- Ao responder sobre um item específico, sempre mencione saldo, projeção e tendência.
- Se a pergunta envolver "o que pedir", calcule uma sugestão de quantidade: (consumo médio × 30) − saldo atual.
- No final de respostas longas, sugira uma próxima ação ou ofereça um follow-up natural. Ex: "Quer que eu liste os fornecedores críticos?" ou "Posso gerar um resumo para levar à reunião."
- Nunca diga "com base nos dados fornecidos" ou frases robóticas assim. Fale naturalmente.

Formatação WhatsApp: *negrito* para nomes e destaques, • para listas, _itálico_ para observações secundárias. Máximo 400 palavras.

Campos do estoque:
- nivel: critico (≤7d) | alerta (8–15d) | atencao (16–30d) | ok (>30d)
- projecao: dias restantes de estoque (≤0 = ruptura)
- media: consumo médio diário
- tendencia: alta ↑ | queda ↓ | estavel →`;

  const usuarioMsg = `ESTOQUE ATUAL:\n${estoque}\n\nPERGUNTA: ${pergunta || 'Dá um resumo rápido da situação e me diz o que precisa de atenção agora.'}`;

  return askClaude(sistemaMsg, usuarioMsg, 900);
}

// ─── Detecta intenção da pergunta ────────────────────────────────────────────

type Intencao = 'ruptura' | 'critico' | 'alerta' | 'tudo' | 'geral' | 'ia' | 'ajuda' | 'remanejamento' | 'farmacia';

function detectarIntencao(texto: string): Intencao {
  if (!texto || texto.length < 2) return 'ajuda';

  const t = texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Saudações e pedidos de ajuda → menu
  if (/^(oi|ola|bom dia|boa tarde|boa noite|oque|o que|menu|ajuda|help|comandos|como usar|o que voce faz|o que vc faz)/.test(t)) return 'ajuda';

  // Remanejamento — checa antes do limite de palavras
  if (/remanejar|remanejamento|transferir|redistribui|sobra|excesso entre estoques/.test(t)) return 'remanejamento';

  // Farmácia específica — checa ANTES do limite de palavras
  // Permite: "meronem na central", "meronem no pronto socorro", "criticos cti", etc.
  if (detectarFarmacia(t) !== null || /farmacia|farmacias/.test(t)) return 'farmacia';

  // Frases longas SEM farmácia específica → IA genérica
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length > 3) return 'ia';

  // Comandos curtos genéricos (sem farmácia específica)
  if (/ruptur|sem estoque|zerado|acabou/.test(t)) return 'ruptura';
  if (/^criti|^urgent|^emergenc/.test(t))         return 'critico';
  if (/^alert|^atenc/.test(t))                    return 'alerta';
  if (/^tudo$|^todos$|^resumo$|^status$/.test(t)) return 'tudo';

  // Keywords de estoque sem farmácia específica
  if (/saldo|cobertura/.test(t)) return 'farmacia';

  // Qualquer outra coisa → IA
  return 'ia';
}

// ─── Palavras que indicam pergunta livre (não nome de produto) ───────────────

const VERBOS_PERGUNTA = /^(qual|quais|quanto|quantos|quando|como|porque|por que|existe|tem|ha|precisa|devo|posso|pode|o que|quem|onde)/;

function pareceProduto(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const palavras = t.split(/\s+/).filter(Boolean);
  if (palavras.length > 3) return false;
  if (VERBOS_PERGUNTA.test(t)) return false;
  // Tem pelo menos 3 chars e não é um comando conhecido
  return t.length >= 3;
}

// ─── Consultas de saldo por farmácia ─────────────────────────────────────────

// Nomes curtos reconhecidos para cada farmácia
const FARMACIAS_ALIAS: Record<string, string[]> = {
  'central':  ['central', 'farmacia central', 'farm central', 'fc'],
  'cti':      ['cti', 'uti', 'intensiva', 'terapia intensiva', 'farm cti', 'farmacia cti'],
  'cc':       ['cc', 'centro cirurgico', 'cirurgico', 'cirurgia', 'farm cc', 'farmacia cc', 'centro cirúrgico'],
  'ps':       ['ps', 'pronto socorro', 'emergencia', 'emergência', 'farm ps', 'farmacia ps'],
};

function detectarFarmacia(texto: string): string | null {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [key, aliases] of Object.entries(FARMACIAS_ALIAS)) {
    if (aliases.some(a => t.includes(a))) return key;
  }
  return null;
}

function nomeFarmaciaDisplay(key: string): string {
  return { central: 'Farmácia Central', cti: 'Farmácia CTI', cc: 'Farmácia Centro Cirúrgico', ps: 'Farmácia Pronto Socorro' }[key] ?? key;
}

function farmaciaMatchesEstoque(farmaciaKey: string, estoqueName: string): boolean {
  const n = estoqueName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const aliases = FARMACIAS_ALIAS[farmaciaKey] ?? [];
  return aliases.some(a => n.includes(a));
}

// Gera resumo textual da análise para enviar à IA
function resumoAnaliseParaIA(analise: AnaliseItem[], farmaciaKey: string | null, produto: string | null): string {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let filtrado = analise;

  if (farmaciaKey) {
    filtrado = filtrado.filter(i => farmaciaMatchesEstoque(farmaciaKey, i.estoqueName));
  }

  if (produto) {
    const tokens = norm(produto).split(/\s+/).filter(t => t.length >= 3);
    filtrado = filtrado.filter(i => tokens.some(t => norm(i.produto).includes(t)));
  }

  if (filtrado.length === 0) return 'Nenhum item encontrado para os critérios informados.';

  // Ordena por status (crítico primeiro) depois por cobertura crescente
  const prioStatus: Record<string, number> = { 'CRÍTICO': 0, 'ALERTA': 1, 'NORMAL': 2, 'EXCESSO': 3, 'SEM CONSUMO': 4 };
  filtrado.sort((a, b) => (prioStatus[a.status] ?? 5) - (prioStatus[b.status] ?? 5) || a.coberturaDias - b.coberturaDias);

  const cabecalho = farmaciaKey
    ? `FARMÁCIA: ${nomeFarmaciaDisplay(farmaciaKey)} | ${filtrado.length} itens`
    : `${filtrado.length} itens encontrados`;

  const linhas = filtrado.slice(0, 30).map(i => {
    const cob = i.coberturaDias >= 9999 ? '999+d' : `${i.coberturaDias.toFixed(0)}d`;
    const cons = i.consumoDiario > 0 ? `cons:${i.consumoDiario.toFixed(1)}/d` : 'sem consumo';
    return `[${i.status}] ${i.produto} (${i.estoqueName}) | saldo:${i.saldoAtual}${i.unidade} | ${cons} | cobertura:${cob}`;
  });

  return `${cabecalho}\n\n${linhas.join('\n')}`;
}

async function askGroqFarmacias(pergunta: string, analise: AnaliseItem[]): Promise<string> {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const t = norm(pergunta);

  const farmaciaKey = detectarFarmacia(t);

  // Stopwords a remover para isolar o nome do produto
  const STOPWORDS = new Set([
    'saldo','cobertura','estoque','tem','na','no','em','de','do','da','nas','nos','das','dos',
    'qual','quanto','quais','critico','criticos','alerta','excesso','resumo','situacao','status',
    'farmacia','farmacias','farm','central','cti','uti','cc','ps','pronto','socorro','centro',
    'cirurgico','terapia','intensiva','urgente','urgencia','ruptura','ruptura',
  ]);

  const produtoTokens = t
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(tok => tok.length >= 4 && !STOPWORDS.has(tok));
  const produtoQuery = produtoTokens.length > 0 ? produtoTokens.join(' ') : null;

  const dados = resumoAnaliseParaIA(analise, farmaciaKey, produtoQuery);
  const date  = new Date().toLocaleDateString('pt-BR');

  const sistemaMsg = `Você é o FarmaBot, assistente de farmácia hospitalar do FarmaIA. Hoje é ${date}.

Responda como um colega farmacêutico que conhece bem cada setor do hospital. Se a pergunta for sobre uma farmácia específica, foque nela e seja contextual. Se for sobre um produto, explique a situação em cada estoque onde ele aparece.

Ao identificar itens críticos, mencione a urgência naturalmente. Se tudo estiver ok, diga isso de forma tranquila. Ofereça um follow-up ao final quando fizer sentido.

Nunca use frases robóticas como "com base nos dados fornecidos". Fale naturalmente.
Formatação WhatsApp: *negrito*, • listas, _itálico_. Máximo 350 palavras.

Status: CRÍTICO (<15d) | ALERTA (15–29d) | NORMAL (30–89d) | EXCESSO (≥90d) | SEM CONSUMO`;

  const usuarioMsg = `ESTOQUE POR FARMÁCIA:\n${dados}\n\nPERGUNTA: ${pergunta}`;

  return askClaude(sistemaMsg, usuarioMsg, 700);
}

// ─── Remanejamento ───────────────────────────────────────────────────────────

function buildRemanejamentoReply(snapshot: string): string {
  if (!snapshot || snapshot.trim().length === 0) {
    return `🔄 *REMANEJAMENTO*\n\nNenhum dado de remanejamento disponível.\nAcesse a aba *Remanejamento* no FarmaIA, importe os CSVs e clique em *Copiar WhatsApp* para enviar a análise aqui.`;
  }
  return snapshot;
}

// ─── Menu de ajuda ───────────────────────────────────────────────────────────

function buildHelp(): string {
  return `👋 Olá! Sou o *FarmaBot*, seu assistente de farmácia hospitalar.

Pode me perguntar qualquer coisa sobre o estoque — falo português normal, não precisa de comando especial. Mas se quiser respostas rápidas, aqui estão alguns atalhos:

📋 *Relatórios instantâneos*
  • *rupturas* — itens zerados ou acabando hoje
  • *crítico* — cobertura ≤7 dias
  • *alerta* — cobertura 8–15 dias
  • *tudo* — relatório completo

🏥 *Por farmácia ou produto*
  • _@bot saldo CTI_ — situação da CTI
  • _@bot meropenem nas farmácias_ — saldo por estoque
  • _@bot críticos PS_ — críticos no Pronto Socorro

🧠 *Perguntas livres*
  • _@bot o que precisa ser pedido urgente?_
  • _@bot vai faltar alguma coisa essa semana?_
  • _@bot quanto de amoxicilina ainda tem?_
  • _@bot remanejamento_ — sugestões de redistribuição

_Dica: se o estoque foi atualizado hoje no FarmaIA, minhas respostas refletem a situação atual._`;
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

  // ─── Detecta intenção antes de buscar dados (remanejamento usa snapshot próprio) ──
  const textoAntecipado = text.replace(/@\S+/g, '').trim();
  const intencaoAntecipada = detectarIntencao(
    textoAntecipado.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  );

  if (intencaoAntecipada === 'remanejamento') {
    const snapshot = await kvGet<string>('remanejamento_snapshot');
    await sendReply(remoteJid, buildRemanejamentoReply(snapshot ?? ''));
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'farmacia') {
    const analise = await kvGet<AnaliseItem[]>('remanejamento_analise');
    if (!analise || analise.length === 0) {
      await sendReply(
        remoteJid,
        '🏥 *Consulta por Farmácia*\n\nNenhum dado de estoque por farmácia disponível.\nImporte os CSVs na aba *Remanejamento* do FarmaIA para habilitar esta consulta.',
      );
      return new Response('OK', { status: 200 });
    }
    const resposta = await askGroqFarmacias(textoAntecipado, analise);
    await sendReply(remoteJid, `🏥 ${resposta}`);
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'ajuda') {
    await sendReply(remoteJid, buildHelp());
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

    const normalizar = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Busca direta (substring exata)
    let filtrado = rows.filter(r =>
      normalizar(r.codigo).includes(termoBusca) ||
      normalizar(r.comercial).includes(termoBusca) ||
      normalizar(r.generico ?? '').includes(termoBusca),
    );

    // Busca por tokens (cada palavra com ≥4 chars)
    if (!filtrado.length) {
      const tokens = termoBusca.split(/\s+/).filter(t => t.length >= 4);
      if (tokens.length > 0) {
        filtrado = rows.filter(r =>
          tokens.some(tok =>
            normalizar(r.codigo).includes(tok) ||
            normalizar(r.comercial).includes(tok) ||
            normalizar(r.generico ?? '').includes(tok),
          ),
        );
      }
    }

    if (filtrado.length > 0) {
      const reply = buildReply(filtrado, 'tudo');
      await sendReply(remoteJid, reply);
      return new Response('OK', { status: 200 });
    }

    // Parece nome de produto mas não foi encontrado → avisa sem chamar IA
    if (pareceProduto(textoLimpo)) {
      const criticos = rows.filter(r => r.nivel === 'critico' || r.nivel === 'alerta').slice(0, 5);
      let msg = `⚠️ Produto _"${textoLimpo}"_ não encontrado no estoque atual.\n`;
      msg += `Verifique o código ou nome exato.\n\n`;
      if (criticos.length) {
        msg += `📋 *Itens críticos/alerta no momento:*\n`;
        criticos.forEach(r => { msg += formatItem(r, true); });
        msg += `\n_Use *tudo* para o relatório completo._`;
      }
      await sendReply(remoteJid, msg);
      return new Response('OK', { status: 200 });
    }
  }

  // ─── Detecta intenção e responde ─────────────────────────────────────────
  const intencao = detectarIntencao(textoLimpo);

  if (intencao === 'ajuda') {
    await sendReply(remoteJid, buildHelp());
    return new Response('OK', { status: 200 });
  }

  if (intencao === 'ia') {
    // Pergunta livre → Groq (Llama 3) analisa
    const respostaIA = await askGroq(textoLimpo, rows);
    if (respostaIA) {
      await sendReply(remoteJid, `🤖 ${respostaIA}`);
      return new Response('OK', { status: 200 });
    }
  }

  const reply = buildReply(rows, intencao);
  await sendReply(remoteJid, reply);

  return new Response('OK', { status: 200 });
}

export const config = { runtime: 'nodejs' };
