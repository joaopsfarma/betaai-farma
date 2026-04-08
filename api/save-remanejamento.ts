// Vercel Serverless Function — Salva snapshot de remanejamento no KV
// POST /api/save-remanejamento
// Body: { snapshot: string, analise?: AnaliseItem[], sugestoes?: SugestaoRemanejamento[] }
// Persiste o texto + análise + sugestões para o bot WhatsApp responder consultas

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
    body: JSON.stringify({ key, value }),
  });
}

export default async function handler(req: Request): Promise<Response> {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  let body: { snapshot: string; analise?: AnaliseItem[]; sugestoes?: SugestaoRemanejamento[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!body.snapshot) {
    return new Response(JSON.stringify({ error: 'snapshot vazio' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Salva snapshot textual (para respostas rápidas de remanejamento)
  await kvSet('remanejamento_snapshot', body.snapshot);

  // Salva análise completa por farmácia (para consultas de saldo por estoque)
  if (body.analise && body.analise.length > 0) {
    const analiseUtil = body.analise.filter(i => i.saldoAtual > 0 || i.consumoTotal > 0);
    await kvSet('remanejamento_analise', analiseUtil);
  }

  // Salva sugestões de remanejamento (para respostas diretas de alta prioridade)
  if (body.sugestoes && body.sugestoes.length > 0) {
    await kvSet('remanejamento_sugestoes', body.sugestoes.slice(0, 50));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export const config = { runtime: 'edge' };
