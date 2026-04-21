// Vercel Serverless Function — Recebe webhooks da Evolution API
// Responde quando o bot é mencionado no grupo com a situação atual de faltas
// POST /api/whatsapp-webhook

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

interface SugestaoRemanejamento {
  produto: string;
  unidade: string;
  origemId: string;
  origemNome: string;
  saldoOrigem: number;
  coberturaOrigem: number;
  destinoId: string;
  destinoNome: string;
  saldoDestino: number;
  coberturaDestino: number;
  qtdSugerida: number;
  prioridade: 'ALTA' | 'MÉDIA' | 'BAIXA';
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
  const url   = process.env.SUPABASE_URL;
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !token) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/bot_cache?key=eq.${encodeURIComponent(key)}&select=value`,
      {
        headers: { 'apikey': token, 'Authorization': `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      console.error(`[WH] kvGet falhou — HTTP ${res.status} | key=${key} | ${errBody.slice(0, 200)}`);
      return null;
    }
    const data = await res.json() as { value: T }[];
    console.log(`[WH] kvGet key=${key} | encontrado=${data.length > 0}`);
    return data[0]?.value ?? null;
  } catch (e) {
    console.error('[WH] kvGet erro (rede/timeout):', key, e);
    return null;
  }
}

async function kvSet<T>(key: string, value: T): Promise<void> {
  const url   = process.env.SUPABASE_URL;
  const token = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !token) return;

  try {
    await fetch(`${url}/rest/v1/bot_cache`, {
      method: 'POST',
      headers: {
        'apikey': token,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify([{ key, value }]),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    console.error('[WH] kvSet erro:', e);
  }
}

// ─── Levenshtein & Fuzzy Search Helpers ──────────────────────────────────────

function levenshteinDistance(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array<number[]>(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    let row = matrix[i] = new Array<number>(an + 1);
    row[0] = i;
  }
  const firstRow = matrix[0];
  for (let j = 1; j <= an; ++j) {
    firstRow[j] = j;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1) // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

function stringSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

function fuzzySubstringMatch(query: string, target: string): boolean {
  if (!query || !target) return false;
  if (target.includes(query)) return true;
  // Comparações por palavra (ignorando pequenas conjunções)
  const targetWords = target.split(/\s+/);
  for (const word of targetWords) {
    if (word.length < 4) continue;
    if (stringSimilarity(query, word) >= 0.75) return true;
  }
  return false;
}

// ─── Classificação de satélites por dias de cobertura ────────────────────────

function nivelSatelite(projecao: number): { label: string; emoji: string } {
  if (projecao <= 0)  return { label: 'RUPTURA',       emoji: '⛔' };
  if (projecao <= 3)  return { label: 'RISCO RUPTURA', emoji: '🚨' };
  if (projecao <= 10) return { label: 'SAUDÁVEL',      emoji: '✅' };
  if (projecao <= 20) return { label: 'EXCESSO',       emoji: '🟡' };
  return                     { label: 'ALTO EXCESSO',  emoji: '🔵' };
}

// ─── Identifica dietas parenterais (excluídas de todas as respostas) ──────────

function isDietaParenteral(r: TrackingRow): boolean {
  const n = `${r.comercial} ${r.generico ?? ''} ${r.descricao ?? ''}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return /parent[ae]r|npp\b|np\s*(total|periferica)|smof|kabiven|olimel|nutriflex|clinimix|dieta\s*(enteral|parenteral)/.test(n);
}

// ─── Formata linha de um item ─────────────────────────────────────────────────

function formatItem(r: TrackingRow): string {
  const niv  = nivelSatelite(r.projecao);
  const proj = r.projecao <= 0 ? '⛔ zerado' : `⏳ ${Math.round(r.projecao)}d`;
  const tend = r.tendencia === 'alta' ? '↑' : r.tendencia === 'queda' ? '↓' : '→';
  const media = r.media > 0
    ? ` · ${r.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/${r.unidade}`
    : '';

  return `• *${r.codigo}* – ${r.comercial}\n  ${r.saldo.toLocaleString('pt-BR')} ${r.unidade} · ${proj} · ${niv.emoji} ${niv.label}${media} ${tend}\n`;
}

// ─── Monta texto compacto do estoque para enviar à IA ────────────────────────

function resumoEstoqueParaIA(rows: TrackingRow[], diaLabels: string[] = []): string {
  // Exclui dietas parenterais de todas as análises de IA
  const rowsFilt = rows.filter(r => !isDietaParenteral(r));

  const rupturas    = rowsFilt.filter(r => r.projecao <= 0).length;
  const riscoRuptura = rowsFilt.filter(r => r.projecao > 0 && r.projecao <= 3).length;
  const saudavel    = rowsFilt.filter(r => r.projecao > 3  && r.projecao <= 10).length;
  const excesso     = rowsFilt.filter(r => r.projecao > 10 && r.projecao <= 20).length;
  const altoExcesso = rowsFilt.filter(r => r.projecao > 20).length;

  const cabecalho = `RESUMO SATÉLITES: ${rowsFilt.length} itens | ⛔Ruptura:${rupturas} | 🚨RiscoRuptura:${riscoRuptura} | ✅Saudável:${saudavel} | 🟡Excesso:${excesso} | 🔵AltoExcesso:${altoExcesso}`;

  const naoOk = rowsFilt
    .filter(r => r.projecao <= 10)
    .sort((a, b) => a.projecao - b.projecao);

  // Aplica hist[] e aceleração: em listas grandes, apenas para itens urgentes
  const usarHist = (r: TrackingRow) =>
    rowsFilt.length <= 30 || r.projecao <= 10;

  const linhas = naoOk.map(r => {
    const proj = r.projecao <= 0 ? 'SEM ESTOQUE' : `${Math.round(r.projecao)}d`;
    const tend = r.tendencia === 'alta' ? '↑' : r.tendencia === 'queda' ? '↓' : '→';

    let extra = '';
    if (usarHist(r) && r.dias.length > 0) {
      const ultimos3 = r.dias.slice(-3);
      const media3   = ultimos3.reduce((s, v) => s + v, 0) / (ultimos3.length || 1);
      const acel     = r.media > 0 ? Math.round(((media3 - r.media) / r.media) * 100) : 0;
      const acelStr  = acel > 10 ? ` acel:+${acel}%` : acel < -10 ? ` acel:${acel}%` : '';
      // Prefixar com datas reais se disponíveis (últimos 5 dias)
      const ultimos5vals   = r.dias.slice(-5);
      const ultimos5labels = diaLabels.slice(-5);
      const hist = ultimos5vals.map((v, i) => {
        const label = ultimos5labels[i] ?? '';
        return label ? `${label}:${v}` : `${v}`;
      }).join(',');
      extra = `${acelStr} | hist:[${hist}]`;
    }

    const niv = nivelSatelite(r.projecao);
    return `[${niv.label}] ${r.codigo} ${r.comercial} | ${r.saldo}${r.unidade} | med:${r.media.toFixed(1)} | proj:${proj} | ${tend}${extra}`;
  });

  if (!linhas.length) return `${cabecalho}\nTodos os itens com estoque saudável (≥4 dias).`;
  return `${cabecalho}\n\nITENS EM RISCO OU RUPTURA:\n${linhas.join('\n')}`;
}

// ─── Claude (Anthropic) — análise inteligente ────────────────────────────────

export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string;
}

async function askClaude(system: string, userMessages: string | AnthropicMessage[], maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return '⚠️ ANTHROPIC_API_KEY não configurada no ambiente.';

  const messagesPayload = typeof userMessages === 'string' 
    ? [{ role: 'user', content: userMessages }] 
    : userMessages;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: maxTokens,
        system,
        messages: messagesPayload,
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const err = await res.text();
      return `⚠️ Erro na API Claude (${res.status}): ${err.slice(0, 120)}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    return (json.content?.[0]?.text as string) ?? '';
  } catch (e) {
    return `⚠️ Erro ao consultar IA: ${String(e).slice(0, 120)}`;
  }
}

async function askGroq(pergunta: string, rows: TrackingRow[], diaLabels?: string[], nomeUsuario?: string, history: AnthropicMessage[] = []): Promise<string> {
  const date    = new Date().toLocaleDateString('pt-BR');
  const hora    = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const estoque = resumoEstoqueParaIA(rows, diaLabels);

  const rupturas = rows.filter(r => r.projecao <= 0).length;
  const criticos = rows.filter(r => r.nivel === 'critico').length;
  const situacao = rupturas > 0 ? '🚨 há rupturas agora' : criticos > 0 ? '⚠️ há itens críticos' : '✅ estoque estável';

  const sistemaMsg = `Você é o FarmaBot, assistente de farmácia hospitalar do FarmaIA. Hoje é ${date}, ${hora}.

CONTEXTO: Rastreio DIÁRIO de faltas de estoque em satélites hospitalares. Cada produto tem "hist:[...]" = histórico de consumo por dia (último valor = hoje). "acel:+XX%" indica consumo recente acelerou XX% acima da média histórica. Dietas parenterais já foram excluídas dos dados.

CLASSIFICAÇÃO SATÉLITE (baseada em projecao = saldo ÷ média diária):
- ⛔ RUPTURA: projecao ≤0 (sem estoque — ruptura ativa agora)
- 🚨 RISCO RUPTURA: 1–3 dias restantes (emergência)
- ✅ SAUDÁVEL: 4–10 dias restantes (faixa ideal)
- 🟡 EXCESSO: 11–20 dias restantes (sobra, avaliar redistribuição)
- 🔵 ALTO EXCESSO: 21+ dias restantes (excesso significativo)

CAMPOS DO ESTOQUE:
- tendencia "alta": consumo hoje > 1,25× ontem (aceleração preocupante)
- hist[]: últimos valores de consumo diário — leia a curva para detectar picos

COMO RESPONDER POR TIPO DE PERGUNTA:
- Tendência/subindo? Cite os 2-3 últimos valores do hist[], calcule o delta percentual e relacione com a projeção. Ex: "O Meropenem saiu de 8 para 12 amp/dia (+50%), restam só 4 dias."
- Pedido/compra? Calcule (média × 30) − saldo para cada item com RUPTURA/RISCO. Apresente lista por prioridade com quantidades e unidades.
- Geral/resumo? Priorize por projeção crescente. Comece pelos zerados, depois RISCO, depois próximo de saudável. Mencione tendências que agravam o risco.
- Item específico? Saldo + projeção + classificação satélite + tendência + últimos 2 valores do hist[].

SITUAÇÃO ATUAL: ${situacao}.

SEU JEITO DE SER:
- Farmacêutico experiente, direto, humano. Fale como colega, não como sistema.
- Adapte o tom: ruptura → objetivo e urgente; estoque ok → tranquilo e descontraído.
- Nunca diga "com base nos dados fornecidos". Fale naturalmente.
- No final de respostas complexas, sugira um próximo passo. Ex: "Quer que eu monte a lista de pedido urgente?"
${nomeUsuario ? `- A pessoa se chama *${nomeUsuario}*. Use o nome naturalmente no início ou durante a resposta quando fizer sentido. Ex: "Olá ${nomeUsuario}," ou "${nomeUsuario}, olha só:"` : ''}

FORMATAÇÃO WHATSAPP: *negrito* para nomes/destaques, • para listas, _itálico_ para observações.
IMPORTANTE: Liste TODOS os itens relevantes, sem cortar. Termine SEMPRE com uma frase de impacto curta e direta — ex: "São X itens em risco real hoje. Hora de agir." Nunca corte no meio da resposta.`;

  const usuarioMsg = `ESTOQUE ATUAL:\n${estoque}\n\nPERGUNTA: ${pergunta || 'Dá um resumo rápido da situação e me diz o que precisa de atenção agora.'}`;
  
  const thread = [...history, { role: 'user', content: usuarioMsg } as AnthropicMessage];
  return askClaude(sistemaMsg, thread, 900);
}

// ─── Apresentação da Silky — farmacêutica do Noturno ────────────────────────

async function askApresentacaoSilky(nomeUsuario?: string): Promise<string> {
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const sistemaMsg = `Você é o FarmaBot, assistente de farmácia hospitalar do FarmaIA.

Você foi perguntado sobre a Silky — a farmacêutica responsável pelo turno Noturno do hospital.

Faça uma apresentação criativa, calorosa e bem-humorada da Silky. Use o seguinte contexto:
- Nome: Silky
- Cargo: Farmacêutica do Turno Noturno
- Ela trabalha quando o hospital dorme, mas os medicamentos nunca param
- É a guardiã silenciosa da farmácia nas madrugadas
- Conhece cada prateleira no escuro, cada código de barras de cor
- Tem um sexto sentido para estoque crítico às 3 da manhã
- É respeitada pela equipe toda — plantão, residentes, enfermeiros

Tom: divertido, cheio de personalidade, como quem apresenta uma celebridade do hospital.
Use *negrito* para o nome e destaques. Use emojis com moderação. Formato WhatsApp.
Termine com uma frase de impacto sobre o papel dela no noturno.
${nomeUsuario ? `A pessoa que perguntou se chama *${nomeUsuario}*. Mencione o nome no início de forma natural.` : ''}
Máximo 200 palavras. Seja criativo — não escreva um currículo, escreva uma apresentação com alma.`;

  const usuarioMsg = `Quero conhecer a Silky! Me apresenta ela. São ${hora} agora.`;

  return askClaude(sistemaMsg, usuarioMsg, 400);
}

// ─── Detecta intenção da pergunta ────────────────────────────────────────────

type Intencao = 'ruptura' | 'critico' | 'alerta' | 'tudo' | 'geral' | 'ia' | 'ajuda' | 'social' | 'silky' | 'remanejamento' | 'farmacia' | 'semana' | 'zerado' | 'tendencia_alta' | 'pedido' | 'remane_ia' | 'remane_excesso' | 'remane_alta' | 'ruptura_24h' | 'ruptura_48h' | 'ruptura_72h';

function detectarIntencao(texto: string): Intencao {
  if (!texto || texto.length < 2) return 'ajuda';

  const t = texto
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  // Saudações e pedidos de ajuda → menu (não captura perguntas sobre estoque)
  if (/^(oi$|ola$|bom dia|boa tarde|boa noite|^menu$|^ajuda$|^help$|^comandos$|como usar|o que voce faz|o que vc faz|oque voce faz|oque vc faz)/.test(t)) return 'ajuda';

  // Respostas sociais → mensagem amigável curta sem buscar estoque
  if (/^(obrigado|obrigada|obg|valeu|vlw|de nada|perfeito|certo|entendido|tks|thanks|otimo|otima|excelente|show|boa|beleza|ok$|blz$|tmj$|massa$|legal$|sucesso$|👍|🙏|😊)/.test(t)) return 'social';

  // Easter egg — apresentação da Silky, farmacêutica do Noturno
  if (/silky|conhece.*silky|quem.*silky|silky.*farmac|farmac.*silky/.test(t)) return 'silky';

  // Calcula palavras antes do bloco de remanejamento (necessário para ramificação)
  const palavras = t.split(/\s+/).filter(Boolean);

  // Remanejamento — ramifica por comprimento e palavras-chave
  if (/remanejar|remanejamento|transferir|redistribui|sobra|excesso entre estoques/.test(t)) {
    if (/alta.*prioridade|prioridade.*alta|urgente|sugestoes.*alta/.test(t)) return 'remane_alta';
    if (/\bexcesso\b/.test(t) && palavras.length <= 4)                       return 'remane_excesso';
    if (palavras.length <= 3) return 'remanejamento'; // comando curto → snapshot rápido
    return 'remane_ia';                               // pergunta natural → Claude
  }

  // Farmácia específica — checa ANTES do limite de palavras
  if (detectarFarmacia(t) !== null || /farmacia|farmacias/.test(t)) return 'farmacia';

  // Frases longas (perguntas naturais) → Claude responde de forma conversacional
  if (palavras.length > 3) return 'ia';

  // Comandos curtos (≤3 palavras) — resposta direta sem IA
  if (/24\s?h|24\s?horas/.test(t) && /ruptur|falta|acabo|quase/.test(t)) return 'ruptura_24h';
  if (/48\s?h|48\s?horas/.test(t)) return 'ruptura_48h';
  if (/72\s?h|72\s?horas/.test(t)) return 'ruptura_72h';
  if (/^zerado$|^sem.?estoque$|^ruptura.?total$/.test(t)) return 'zerado';
  if (/^semana$|^7.?dias?$|^proxima.?semana$/.test(t))    return 'semana';
  if (/^subindo$|^aumentando$|^tendencia.?alta?$/.test(t)) return 'tendencia_alta';
  if (/^pedido$|^compra$|^pedir$|^comprar$/.test(t))       return 'pedido';
  if (/^excesso$/.test(t))                                  return 'remane_excesso';
  if (/^alta$/.test(t))                                     return 'remane_alta';
  if (/ruptur|acabou/.test(t))                             return 'ruptura';
  if (/^criti|^urgent|^emergenc/.test(t))                  return 'critico';
  if (/^alert|^atenc/.test(t))                             return 'alerta';
  if (/^tudo$|^todos$|^resumo$|^status$/.test(t))          return 'tudo';

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

async function askGroqFarmacias(pergunta: string, analise: AnaliseItem[], nomeUsuario?: string, history: AnthropicMessage[] = []): Promise<string> {
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

Responda como um colega farmacêutico que conhece bem cada setor do hospital. Se a pergunta for sobre uma farmácia específica, foque nela. Se for sobre um produto, explique a situação em cada estoque onde ele aparece.

Contexto de remanejamento: EXCESSO significa que o estoque pode ceder para outros; CRÍTICO/ALERTA significa que o estoque precisa receber transferências. Se a pergunta envolver redistribuição, mencione essa relação naturalmente.

Ao identificar itens críticos, mencione a urgência. Se tudo estiver ok, diga de forma tranquila. Ofereça follow-up ao final quando fizer sentido.
Nunca use "com base nos dados fornecidos". Fale naturalmente.
${nomeUsuario ? `A pessoa se chama *${nomeUsuario}*. Use o nome naturalmente no início ou durante a resposta.` : ''}
Formatação WhatsApp: *negrito*, • listas, _itálico_. Máximo 350 palavras.

Status: CRÍTICO (<15d) | ALERTA (15–29d) | NORMAL (30–89d) | EXCESSO (≥90d) | SEM CONSUMO`;

  const usuarioMsg = `ESTOQUE POR FARMÁCIA:\n${dados}\n\nPERGUNTA: ${pergunta}`;
  
  const thread = [...history, { role: 'user', content: usuarioMsg } as AnthropicMessage];
  return askClaude(sistemaMsg, thread, 450);
}

// ─── Remanejamento ───────────────────────────────────────────────────────────

function buildRemanejamentoReply(snapshot: string): string {
  if (!snapshot || snapshot.trim().length === 0) {
    return `🔄 *REMANEJAMENTO*\n\nNenhum dado de remanejamento disponível.\nAcesse a aba *Remanejamento* no FarmaIA, importe os CSVs e clique em *Copiar WhatsApp* para enviar a análise aqui.`;
  }
  return snapshot;
}

function buildExcessoReply(analise: AnaliseItem[]): string {
  const date    = new Date().toLocaleDateString('pt-BR');
  const excessos = analise
    .filter(i => i.status === 'EXCESSO')
    .sort((a, b) => b.coberturaDias - a.coberturaDias);

  if (!excessos.length) {
    return `📦 *ITENS EM EXCESSO — ${date}*\nNenhum item com saldo excessivo no momento.\n_Use *remanejamento* para ver o resumo completo._`;
  }

  let msg = `📦 *ITENS EM EXCESSO — ${date}*\n_Estoques com saldo acima do necessário — podem ceder:_\n\n`;
  excessos.slice(0, 12).forEach(i => {
    const cob     = i.coberturaDias >= 9999 ? '999+d' : `${i.coberturaDias.toFixed(0)}d`;
    const reserva = i.consumoDiario > 0 ? Math.floor(i.saldoAtual - i.consumoDiario * 30) : i.saldoAtual;
    msg += `• *${i.produto}* (${i.estoqueName})\n`;
    msg += `  Saldo: ${i.saldoAtual.toLocaleString('pt-BR')} ${i.unidade} | Cobertura: ${cob}`;
    if (reserva > 0) msg += ` | Pode ceder: ~${reserva.toLocaleString('pt-BR')} ${i.unidade}`;
    msg += '\n';
  });
  if (excessos.length > 12) msg += `\n_... e mais ${excessos.length - 12} itens com excesso._`;
  msg += `\n_Use *remanejamento* para ver sugestões de transferência ou *alta* para urgências._`;
  return msg;
}

function buildAltaPrioridadeReply(sugestoes: SugestaoRemanejamento[]): string {
  const date  = new Date().toLocaleDateString('pt-BR');
  const altas = sugestoes.filter(s => s.prioridade === 'ALTA');

  if (!altas.length) {
    const temSugestoes = sugestoes.length > 0;
    return `🚨 *ALTA PRIORIDADE — ${date}*\nNenhuma sugestão de alta prioridade no momento.${temSugestoes ? `\n_Há ${sugestoes.length} sugestões de média/baixa prioridade — use *remanejamento*._` : '\n_Use *remanejamento* para ver o resumo completo._'}`;
  }

  let msg = `🚨 *ALTA PRIORIDADE — ${date}*\n_Transferências urgentes — receptor com cobertura <15 dias:_\n\n`;
  altas.slice(0, 10).forEach(s => {
    const cobDest   = s.coberturaDestino.toFixed(0);
    const cobOrig   = s.coberturaOrigem >= 9999 ? '999+' : s.coberturaOrigem.toFixed(0);
    const valor     = s.custoMedio > 0
      ? ` | _R$ ${(s.custoMedio * s.qtdSugerida).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}_`
      : '';
    msg += `• *${s.produto}*\n`;
    msg += `  ${s.origemNome} → ${s.destinoNome}\n`;
    msg += `  Transferir: ${s.qtdSugerida} ${s.unidade} | Receptor: ${cobDest}d | Doador: ${cobOrig}d${valor}\n`;
  });
  if (altas.length > 10) msg += `\n_... e mais ${altas.length - 10} sugestões de alta prioridade._`;
  msg += `\n_Use *remanejamento* para o resumo completo ou *excesso* para ver todos os doadores._`;
  return msg;
}

// ─── Resumo especializado para IA de remanejamento ───────────────────────────

function resumoAnaliseRemanejamento(analise: AnaliseItem[], sugestoes: SugestaoRemanejamento[]): string {
  const criticos   = analise.filter(i => i.status === 'CRÍTICO');
  const alertas    = analise.filter(i => i.status === 'ALERTA');
  const excessos   = analise.filter(i => i.status === 'EXCESSO');
  const semConsumo = analise.filter(i => i.status === 'SEM CONSUMO');
  const normais    = analise.filter(i => i.status === 'NORMAL');
  const estoques   = new Set(analise.map(i => i.estoqueId)).size;

  const cabecalho = [
    `ANÁLISE REMANEJAMENTO | ${analise.length} produto×estoque | ${estoques} estoques`,
    `CRÍTICO: ${criticos.length} | ALERTA: ${alertas.length} | NORMAL: ${normais.length} | EXCESSO: ${excessos.length} | SEM CONSUMO: ${semConsumo.length}`,
    `Sugestões: ${sugestoes.length} (ALTA: ${sugestoes.filter(s => s.prioridade === 'ALTA').length} | MÉDIA: ${sugestoes.filter(s => s.prioridade === 'MÉDIA').length} | BAIXA: ${sugestoes.filter(s => s.prioridade === 'BAIXA').length})`,
  ].join('\n');

  const fmt = (i: AnaliseItem) => {
    const cob  = i.coberturaDias >= 9999 ? '999+d' : `${i.coberturaDias.toFixed(0)}d`;
    const cons = i.consumoDiario > 0 ? `cons:${i.consumoDiario.toFixed(1)}/d` : 'sem consumo';
    return `[${i.status}] ${i.produto} (${i.estoqueName}) | saldo:${i.saldoAtual}${i.unidade} | ${cons} | cob:${cob}`;
  };

  const receptores = [...criticos, ...alertas].sort((a, b) => a.coberturaDias - b.coberturaDias).map(fmt).join('\n');
  const doadores   = excessos.sort((a, b) => b.coberturaDias - a.coberturaDias).slice(0, 20).map(fmt).join('\n');

  const top10 = sugestoes.slice(0, 10).map(s => {
    const valor = s.custoMedio > 0 ? ` | custo:R$${(s.custoMedio * s.qtdSugerida).toFixed(0)}` : '';
    const cobOrig = s.coberturaOrigem >= 9999 ? '999+' : s.coberturaOrigem.toFixed(0);
    return `[${s.prioridade}] ${s.produto} | ${s.origemNome} → ${s.destinoNome} | qtd:${s.qtdSugerida}${s.unidade} | receptor:${s.coberturaDestino.toFixed(0)}d | doador:${cobOrig}d${valor}`;
  }).join('\n');

  return [
    cabecalho,
    receptores.length ? `\nRECEPTORES (precisam receber):\n${receptores}` : '',
    doadores.length   ? `\nDOADORES (podem ceder):\n${doadores}` : '',
    top10.length      ? `\nSUGESTÕES DE TRANSFERÊNCIA (top 10):\n${top10}` : '',
  ].filter(Boolean).join('\n');
}

// ─── Claude especializado em remanejamento ───────────────────────────────────

async function askRemanejamento(
  pergunta: string,
  analise: AnaliseItem[],
  sugestoes: SugestaoRemanejamento[],
  nomeUsuario?: string,
  history: AnthropicMessage[] = []
): Promise<string> {
  const date  = new Date().toLocaleDateString('pt-BR');
  const dados = resumoAnaliseRemanejamento(analise, sugestoes);

  const sistemaMsg = `Você é o FarmaBot, especialista em remanejamento de estoque hospitalar do FarmaIA. Hoje é ${date}.

CONTEXTO: Análise quadrimestral (120 dias). consumoDiario = consumoTotal ÷ 120. coberturaDias = saldo ÷ consumoDiario.

CLASSIFICAÇÃO:
- CRÍTICO <15d → receptor urgente (precisa receber)
- ALERTA 15-29d → receptor secundário (precisa receber)
- NORMAL 30-89d → estável (pode ser doador se cobertura >60d)
- EXCESSO ≥90d → doador prioritário (pode ceder com segurança)
- SEM CONSUMO → doador total (pode ceder tudo)

LÓGICA DOADOR→RECEPTOR: Doador mantém reserva de 30d, cede o excedente. Se sem consumo, pode ceder tudo. qtdSugerida já está calculada com essa lógica.

COMO RESPONDER:
- "o que posso transferir?" → sugestões ALTA com rota completa (De X para Y), qtdSugerida e cobertura atual do receptor
- "quem tem excesso?" / "quem pode ceder?" → liste EXCESSO por estoque, maior cobertura primeiro, calcule quanto pode ceder
- "quem está crítico?" / "quem precisa receber?" → liste CRÍTICO por menor cobertura, associe com sugestão disponível
- "quanto custa?" → some custoMedio × qtdSugerida das sugestões ALTA, mostre total e por item
- Item específico → status em cada estoque + sugestão de transferência se existir
- Farmácia específica → CRÍTICOs/ALERTAs desse estoque + EXCESSOs que podem enviar para ele

SEU JEITO DE SER:
- Farmacêutico experiente, direto, humano. Fale como colega, não como sistema.
- Adapte urgência: receptor crítico → objetivo e urgente; situação controlada → tranquilo.
- Nunca diga "com base nos dados fornecidos". Fale naturalmente.
- Ao listar transferências, sempre mencione a rota completa: "De [Origem] para [Destino]".
- Ofereça follow-up quando fizer sentido. Ex: "Quer que eu calcule o custo total das transferências ALTA?"
${nomeUsuario ? `- A pessoa se chama *${nomeUsuario}*. Use o nome naturalmente no início ou durante a resposta.` : ''}

FORMATAÇÃO WHATSAPP: *negrito* para nomes/destaques, • para listas, _itálico_ para observações.
IMPORTANTE: Liste TODOS os itens relevantes. Termine com frase de impacto. Nunca corte no meio.`;

  const usuarioMsg = `DADOS DE REMANEJAMENTO:\n${dados}\n\nPERGUNTA: ${pergunta || 'Qual é a situação atual? O que é mais urgente transferir?'}`;
  
  const thread = [...history, { role: 'user', content: usuarioMsg } as AnthropicMessage];
  return askClaude(sistemaMsg, thread, 900);
}

// ─── Menu de ajuda ───────────────────────────────────────────────────────────

function buildHelp(): string {
  return `👋 Olá! Sou o *FarmaBot*, assistente de farmácia hospitalar do FarmaIA.

Pode me perguntar em português normal ou usar os atalhos abaixo.

━━━━━━━━━━━━━━━━━━━━━
📦 *RASTREIO DE FALTA*
_Dados do CSV enviado pelo FarmaIA_

🚨 *Situação agora*
  • *ruptura* — itens que já zeraram ou zeram hoje
  • *zerado* — só os com estoque = 0
  • *24h* · *48h* · *72h* — o que vai zerar em até X horas

📋 *Relatórios*
  • *crítico* — cobertura ≤7 dias
  • *alerta* — cobertura 8–15 dias
  • *semana* — tudo que zera nos próximos 7 dias
  • *tudo* — relatório completo (rupturas + crítico + alerta)

📈 *Consumo*
  • *subindo* — itens com consumo acelerando (risco crescente)
  • _@bot tendência do meropenem_ — como está o consumo de um item

🛒 *Compras*
  • *pedido* — quanto pedir de cada crítico/alerta (cobertura 30d)
  • _@bot quanto pedir de dipirona?_ — pedido de item específico
  • _@bot o que é mais urgente comprar?_ — prioridade por risco

🔍 *Produto específico*
  • _@bot amoxicilina_ — saldo, projeção e tendência
  • _@bot tem substituto para [produto]?_ — opções em ruptura

━━━━━━━━━━━━━━━━━━━━━
🔄 *REMANEJAMENTO*
_Dados do CSV da aba Remanejamento_

  • *remanejamento* — resumo geral das transferências sugeridas
  • *excesso* — estoques com sobra que podem ceder
  • *alta* — transferências urgentes (receptor crítico)
  • _@bot saldo CTI_ — situação de uma farmácia específica
  • _@bot o que posso transferir da Central?_ — análise via IA

━━━━━━━━━━━━━━━━━━━━━
🧠 *Perguntas livres* (via IA)
  • _@bot o que precisa de atenção agora?_
  • _@bot vai faltar alguma coisa essa semana?_
  • _@bot o que está com consumo acelerado?_
  • _@bot monta a lista de pedido urgente_

_Dica: os dados refletem o último CSV enviado pelo FarmaIA._`;
}

// ─── Formata resposta de estoque (respostas rápidas por palavra-chave) ────────

function buildReply(rows: TrackingRow[], intencao: Intencao): string {
  const date = new Date().toLocaleDateString('pt-BR');

  if (intencao === 'ruptura' || intencao === 'ruptura_24h') {
    const itens = rows.filter(r => r.projecao <= 1);
    const tit = intencao === 'ruptura_24h' ? 'EM ATÉ 24h' : 'HOJE';
    if (!itens.length) return `✅ *RUPTURAS ${tit} — ${date}*\nNenhum item com ruptura (projeção 0–1 dia).`;
    let msg = `🚨 *RUPTURAS ${tit} — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com projeção de 0–1 dia\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  if (intencao === 'ruptura_48h') {
    const itens = rows.filter(r => r.projecao <= 2);
    if (!itens.length) return `✅ *RUPTURAS EM ATÉ 48h — ${date}*\nNenhum item com projeção ≤2 dias.`;
    let msg = `🚨 *RUPTURAS EM ATÉ 48h — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com projeção de 0–2 dias\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    return msg;
  }

  if (intencao === 'ruptura_72h') {
    const itens = rows.filter(r => r.projecao <= 3);
    if (!itens.length) return `✅ *RUPTURAS EM ATÉ 72h — ${date}*\nNenhum item com projeção ≤3 dias.`;
    let msg = `🚨 *RUPTURAS EM ATÉ 72h — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'} com projeção de 0–3 dias\n\n`;
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

  if (intencao === 'zerado') {
    const itens = rows.filter(r => r.projecao <= 0).sort((a, b) => a.projecao - b.projecao);
    if (!itens.length) return `✅ *SEM RUPTURAS — ${date}*\nNenhum item com estoque zerado no momento.`;
    let msg = `⛔ *ESTOQUE ZERADO — ${date}*\n${itens.length} ${itens.length === 1 ? 'item zerado' : 'itens zerados'}\n\n`;
    itens.forEach(r => { msg += formatItem(r); });
    msg += `\n_Use *pedido* para ver sugestão de compra._`;
    return msg;
  }

  if (intencao === 'semana') {
    const itens  = rows.filter(r => r.projecao > 0 && r.projecao <= 7).sort((a, b) => a.projecao - b.projecao);
    const zerados = rows.filter(r => r.projecao <= 0).length;
    if (!itens.length) {
      const aviso = zerados > 0 ? ` _(${zerados} ${zerados === 1 ? 'item já zerado' : 'itens já zerados'} — use *zerado*)_` : '';
      return `✅ *PRÓXIMA SEMANA — ${date}*\nNenhum item vai zerar nos próximos 7 dias.${aviso}`;
    }
    let msg = `📅 *ZERAM EM ≤7 DIAS — ${date}*\n${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`;
    if (zerados > 0) msg += `\n_(+ ${zerados} já ${zerados === 1 ? 'zerado' : 'zerados'} — use *zerado*)_`;
    msg += '\n\n';
    itens.forEach(r => { msg += formatItem(r); });
    msg += `\n_Use *pedido* para sugestão de compra urgente._`;
    return msg;
  }

  if (intencao === 'tendencia_alta') {
    const itens = rows.filter(r => r.tendencia === 'alta').sort((a, b) => a.projecao - b.projecao);
    if (!itens.length) return `✅ *CONSUMO SUBINDO — ${date}*\nNenhum item com tendência de alta no momento.`;
    let msg = `📈 *CONSUMO SUBINDO — ${date}*\n${itens.length} ${itens.length === 1 ? 'item com tendência de alta' : 'itens com tendência de alta'}\n\n`;
    itens.forEach(r => {
      msg += formatItem(r);
      const ultDois = r.dias.slice(-2);
      if (ultDois.length === 2 && ultDois[0] > 0) {
        const varPct = Math.round(((ultDois[1] - ultDois[0]) / ultDois[0]) * 100);
        if (varPct > 0) msg += `  _(+${varPct}% vs dia anterior)_\n`;
      }
    });
    msg += `\n_Itens com alta tendência e baixa projeção são risco iminente._`;
    return msg;
  }

  if (intencao === 'pedido') {
    const itens = rows
      .filter(r => r.nivel === 'critico' || r.nivel === 'alerta')
      .sort((a, b) => a.projecao - b.projecao)
      .slice(0, 20);
    if (!itens.length) return `✅ *SUGESTÃO DE PEDIDO — ${date}*\nNenhum item crítico ou em alerta no momento.`;

    let msg = `🛒 *SUGESTÃO DE PEDIDO — ${date}*\n_Cálculo: (média/dia × 30 dias) − saldo atual_\n\n`;

    const zerados  = itens.filter(r => r.projecao <= 0);
    const urgentes = itens.filter(r => r.projecao > 0 && r.nivel === 'critico');
    const alertas  = itens.filter(r => r.nivel === 'alerta');

    if (zerados.length) {
      msg += `⛔ *ZERADOS — pedido imediato*\n`;
      zerados.forEach(r => {
        const qtd = Math.ceil(r.media * 30);
        msg += `• *${r.codigo}* – ${r.comercial}: pedir *${qtd.toLocaleString('pt-BR')} ${r.unidade}*\n`;
      });
      msg += '\n';
    }
    if (urgentes.length) {
      msg += `🔴 *CRÍTICO — pedido urgente*\n`;
      urgentes.forEach(r => {
        const qtd = Math.max(1, Math.ceil(r.media * 30 - r.saldo));
        msg += `• *${r.codigo}* – ${r.comercial}: pedir *${qtd.toLocaleString('pt-BR')} ${r.unidade}* _(${Math.round(r.projecao)}d restantes)_\n`;
      });
      msg += '\n';
    }
    if (alertas.length) {
      msg += `🟡 *ALERTA — planejar compra*\n`;
      alertas.forEach(r => {
        const qtd = Math.max(1, Math.ceil(r.media * 30 - r.saldo));
        msg += `• *${r.codigo}* – ${r.comercial}: pedir *${qtd.toLocaleString('pt-BR')} ${r.unidade}* _(${Math.round(r.projecao)}d restantes)_\n`;
      });
      msg += '\n';
    }
    msg += `_Quantidades baseadas em 30 dias de cobertura. Ajuste conforme prazo do fornecedor._`;
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
      rupturas.forEach(r => { msg += formatItem(r); });
      msg += '\n';
    }
    if (criticos.length) {
      msg += `🔴 *CRÍTICO (2–7 dias)* — ${criticos.length} itens\n`;
      criticos.forEach(r => { msg += formatItem(r); });
      msg += '\n';
    }
    if (alertas.length) {
      msg += `🟡 *ALERTA (8–15 dias)* — ${alertas.length} itens\n`;
      alertas.forEach(r => { msg += formatItem(r); });
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
    signal: AbortSignal.timeout(5000),
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
  // Evolution API pode enviar: "messages.upsert", "message.upsert", "MESSAGES_UPSERT", etc.
  const rawEvent = (payload.event ?? payload.type ?? payload.name ?? '').toString();
  const event = rawEvent.toLowerCase().replace(/_/g, '.');
  console.log('[WH] event:', rawEvent, '→', event, '| keys:', Object.keys(payload));
  if (event !== 'messages.upsert' && event !== 'message.upsert') {
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
  // Nome do remetente (vindo da Evolution API como pushName)
  const pushName: string = (data?.pushName ?? data?.senderName ?? '').split(' ')[0];

  const isGroup = remoteJid.endsWith('@g.us');

  // Verifica menção por correspondência parcial do número ou LID (WhatsApp moderno usa @lid)
  const botNumber = process.env.BOT_NUMBER ?? '';
  const botLid    = process.env.BOT_LID ?? '';

  const mentionMatch = mentionedJids.some(jid => {
    const jidClean = jid.replace(/\D/g, '');
    const numClean = botNumber.replace(/\D/g, '');
    return (
      (numClean && (jidClean.includes(numClean) || numClean.includes(jidClean))) ||
      (botLid   && jid.includes(botLid))
    );
  });

  // Responde se o bot foi explicitamente mencionado.
  // Evita interagir se outro membro do grupo for mencionado ao invés do próprio bot.
  const checkFallback = (!botNumber && !botLid && mentionedJids.length > 0);
  const checkText = botNumber ? text.includes(`@${botNumber}`) : false;

  const botMentioned = mentionMatch || checkText || checkFallback;
  console.log('[WH] jid:', remoteJid, '| isGroup:', isGroup, '| mentioned:', botMentioned, '| text:', text.slice(0, 80), '| mentionedJids:', mentionedJids);

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
    const history = await kvGet<AnthropicMessage[]>(`chat_${remoteJid}`) || [];
    const resposta = await askGroqFarmacias(textoAntecipado, analise, pushName, history);
    if (!resposta.includes('⚠️ Erro')) await kvSet(`chat_${remoteJid}`, [...history, { role: 'user', content: textoAntecipado } as AnthropicMessage, { role: 'assistant', content: resposta } as AnthropicMessage].slice(-6));
    await sendReply(remoteJid, `🏥 ${resposta}`);
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'remane_ia') {
    const [analise, sugestoes] = await Promise.all([
      kvGet<AnaliseItem[]>('remanejamento_analise'),
      kvGet<SugestaoRemanejamento[]>('remanejamento_sugestoes'),
    ]);
    if (!analise || analise.length === 0) {
      await sendReply(
        remoteJid,
        '🔄 *Remanejamento*\n\nNenhum dado disponível ainda.\nImporte os CSVs na aba *Remanejamento* do FarmaIA e clique em *Copiar WhatsApp* para habilitar consultas detalhadas.',
      );
      return new Response('OK', { status: 200 });
    }
    const history = await kvGet<AnthropicMessage[]>(`chat_${remoteJid}`) || [];
    const resposta = await askRemanejamento(textoAntecipado, analise, sugestoes ?? [], pushName, history);
    if (!resposta.includes('⚠️ Erro')) await kvSet(`chat_${remoteJid}`, [...history, { role: 'user', content: textoAntecipado } as AnthropicMessage, { role: 'assistant', content: resposta } as AnthropicMessage].slice(-6));
    await sendReply(remoteJid, `🔄 ${resposta}`);
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'remane_excesso') {
    const analise = await kvGet<AnaliseItem[]>('remanejamento_analise');
    await sendReply(remoteJid, buildExcessoReply(analise ?? []));
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'remane_alta') {
    const sugestoes = await kvGet<SugestaoRemanejamento[]>('remanejamento_sugestoes');
    await sendReply(remoteJid, buildAltaPrioridadeReply(sugestoes ?? []));
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'ajuda') {
    await sendReply(remoteJid, buildHelp());
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'social') {
    const nome = pushName ? `, ${pushName}` : '';
    await sendReply(remoteJid, `De nada${nome}! 😊 Qualquer dúvida sobre o estoque é só chamar.`);
    return new Response('OK', { status: 200 });
  }

  if (intencaoAntecipada === 'silky') {
    const apresentacao = await askApresentacaoSilky(pushName);
    await sendReply(remoteJid, `🌙 ${apresentacao}`);
    return new Response('OK', { status: 200 });
  }

  // ─── Busca último snapshot de estoque ────────────────────────────────────
  const [rows, diaLabels] = await Promise.all([
    kvGet<TrackingRow[]>('last_stock_data'),
    kvGet<string[]>('last_stock_dia_labels'),
  ]);

  if (!rows || rows.length === 0) {
    await sendReply(
      remoteJid,
      '⚠️ Ainda não há dados de estoque disponíveis.\nEnvie o rastreio pelo sistema *Logística Farma* para eu ter a situação atualizada.',
    );
    return new Response('OK', { status: 200 });
  }

  // Exclui dietas parenterais de TODAS as respostas do bot
  const rowsFiltrados = rows.filter(r => !isDietaParenteral(r));

  // ─── Remove menção do texto ───────────────────────────────────────────────
  const textoLimpo = text.replace(/@\S+/g, '').trim();

  // ─── Busca por produto específico (ex: "@bot amoxicilina") ───────────────
  // Pula busca de produto se já detectamos um comando conhecido (ruptura, critico, pedido, etc.)
  const ehComandoConhecido = intencaoAntecipada !== 'ia' && intencaoAntecipada !== 'geral';
  if (textoLimpo.length >= 3 && !ehComandoConhecido) {
    const termoBusca = textoLimpo.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const normalizar = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Busca direta (substring exata) — apenas nos itens filtrados (sem dietas)
    let filtrado = rowsFiltrados.filter(r =>
      normalizar(r.codigo).includes(termoBusca) ||
      normalizar(r.comercial).includes(termoBusca) ||
      normalizar(r.generico ?? '').includes(termoBusca),
    );

    // Busca por tokens (cada palavra com ≥4 chars)
    if (!filtrado.length) {
      const tokens = termoBusca.split(/\s+/).filter(t => t.length >= 4);
      if (tokens.length > 0) {
        filtrado = rowsFiltrados.filter(r =>
          tokens.some(tok =>
            normalizar(r.codigo).includes(tok) ||
            normalizar(r.comercial).includes(tok) ||
            normalizar(r.generico ?? '').includes(tok),
          ),
        );
      }
    }

    // Busca Difusa (Fuzzy Search - Similaridade >= 75%)
    if (!filtrado.length) {
      filtrado = rowsFiltrados.filter(r => 
        fuzzySubstringMatch(termoBusca, normalizar(r.comercial)) ||
        fuzzySubstringMatch(termoBusca, normalizar(r.generico ?? ''))
      );
    }

    if (filtrado.length > 0) {
      const reply = buildReply(filtrado, 'tudo');
      await sendReply(remoteJid, reply);
      return new Response('OK', { status: 200 });
    }

    // Parece nome de produto mas não foi encontrado → avisa sem chamar IA
    if (pareceProduto(textoLimpo)) {
      const urgentes = rowsFiltrados.filter(r => r.projecao <= 10).slice(0, 5);
      let msg = `⚠️ Produto _"${textoLimpo}"_ não encontrado no estoque atual.\n`;
      msg += `Verifique o código ou nome exato.\n\n`;
      if (urgentes.length) {
        msg += `📋 *Itens em risco/ruptura no momento:*\n`;
        urgentes.forEach(r => { msg += formatItem(r); });
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

  if (intencao === 'social') {
    const nome = pushName ? `, ${pushName}` : '';
    await sendReply(remoteJid, `De nada${nome}! 😊 Qualquer dúvida sobre o estoque é só chamar.`);
    return new Response('OK', { status: 200 });
  }

  if (intencao === 'ia') {
    // Pergunta livre → Claude analisa (já recebe rowsFiltrados sem dietas)
    const history = await kvGet<AnthropicMessage[]>(`chat_${remoteJid}`) || [];
    const respostaIA = await askGroq(textoLimpo, rowsFiltrados, diaLabels ?? [], pushName, history);
    if (respostaIA && !respostaIA.includes('⚠️ Erro')) {
      await kvSet(`chat_${remoteJid}`, [...history, { role: 'user', content: textoLimpo } as AnthropicMessage, { role: 'assistant', content: respostaIA } as AnthropicMessage].slice(-6));
      await sendReply(remoteJid, `🤖 ${respostaIA}`);
      return new Response('OK', { status: 200 });
    } else if (respostaIA) {
      await sendReply(remoteJid, `🤖 ${respostaIA}`);
      return new Response('OK', { status: 200 });
    }
  }

  const reply = buildReply(rowsFiltrados, intencao);
  await sendReply(remoteJid, reply);

  return new Response('OK', { status: 200 });
}

export const config = { runtime: 'edge' };
