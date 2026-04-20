// ─── SCORE DE PRIORIDADE UNIFICADO (Supply Intelligence) ─────────────────────
// Combina risco clínico + cobertura + custo + tendência num score 0-100.
// Usado em Ressuprimento, Previsibilidade e Requisição para ordenação unificada.

import { getRiscoAssistencial, type RiscoLevel } from './riscoAssistencial';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type ScoreClassificacao = 'CRITICO' | 'ALTO' | 'MEDIO' | 'BAIXO';

export interface ScorePesos {
  risco: number;       // peso do risco assistencial (0-1)
  cobertura: number;   // peso da cobertura em dias (0-1)
  custo: number;       // peso da curva ABC (0-1)
  tendencia: number;   // peso da tendência de consumo (0-1)
}

export interface ScoreInput {
  nomeProduto: string;
  coberturaDias: number;
  curvaABC?: 'A' | 'B' | 'C';
  consumoMedio?: number;
  consumoAnterior?: number; // consumo médio do período anterior (para tendência)
}

export interface ScoreResult {
  score: number;                     // 0-100
  classificacao: ScoreClassificacao;
  riscoLevel: RiscoLevel;
  componentes: {
    risco: number;
    cobertura: number;
    custo: number;
    tendencia: number;
  };
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_SCORE_PESOS: ScorePesos = {
  risco: 0.40,
  cobertura: 0.30,
  custo: 0.20,
  tendencia: 0.10,
};

export const SCORE_PESOS_KEY = 'supply_score_pesos_v1';

// ─── Funções de cálculo ─────────────────────────────────────────────────────

const RISCO_SCORES: Record<RiscoLevel, number> = {
  CRITICO: 100,
  ALTO: 75,
  MEDIO: 40,
  BAIXO: 10,
};

const CURVA_SCORES: Record<string, number> = {
  A: 100,
  B: 50,
  C: 15,
};

function calcComponenteRisco(nomeProduto: string): { score: number; level: RiscoLevel } {
  const info = getRiscoAssistencial(nomeProduto);
  return { score: RISCO_SCORES[info.level], level: info.level };
}

function calcComponenteCobertura(coberturaDias: number): number {
  // Quanto menor a cobertura, maior o score (mais urgente)
  // 0 dias → 100, 3 dias → 80, 7 dias → 50, 15 dias → 20, 30+ dias → 0
  if (coberturaDias <= 0) return 100;
  if (coberturaDias >= 30) return 0;
  return Math.round(100 * Math.exp(-0.12 * coberturaDias));
}

function calcComponenteCusto(curva?: 'A' | 'B' | 'C'): number {
  return CURVA_SCORES[curva || 'C'] ?? 15;
}

function calcComponenteTendencia(consumoAtual?: number, consumoAnterior?: number): number {
  if (!consumoAtual || !consumoAnterior || consumoAnterior === 0) return 50; // neutro
  const variacao = (consumoAtual - consumoAnterior) / consumoAnterior;
  // Consumo subindo → score alto (mais urgente), caindo → score baixo
  // +100% → 100, +50% → 75, 0% → 50, -50% → 25, -100% → 0
  return Math.round(Math.min(100, Math.max(0, 50 + variacao * 50)));
}

// ─── Função principal ───────────────────────────────────────────────────────

export function calcularScorePrioridade(
  input: ScoreInput,
  pesos: ScorePesos = DEFAULT_SCORE_PESOS
): ScoreResult {
  const { nomeProduto, coberturaDias, curvaABC, consumoMedio, consumoAnterior } = input;

  const riscoResult = calcComponenteRisco(nomeProduto);
  const coberturaScore = calcComponenteCobertura(coberturaDias);
  const custoScore = calcComponenteCusto(curvaABC);
  const tendenciaScore = calcComponenteTendencia(consumoMedio, consumoAnterior);

  // Score ponderado
  const totalPeso = pesos.risco + pesos.cobertura + pesos.custo + pesos.tendencia;
  const score = Math.round(
    (pesos.risco * riscoResult.score +
     pesos.cobertura * coberturaScore +
     pesos.custo * custoScore +
     pesos.tendencia * tendenciaScore) / totalPeso
  );

  // Classificação
  let classificacao: ScoreClassificacao;
  if (score > 80) classificacao = 'CRITICO';
  else if (score > 60) classificacao = 'ALTO';
  else if (score > 40) classificacao = 'MEDIO';
  else classificacao = 'BAIXO';

  return {
    score,
    classificacao,
    riscoLevel: riscoResult.level,
    componentes: {
      risco: riscoResult.score,
      cobertura: coberturaScore,
      custo: custoScore,
      tendencia: tendenciaScore,
    },
  };
}

// ─── Utilidades de display ──────────────────────────────────────────────────

export const SCORE_COLORS: Record<ScoreClassificacao, { bg: string; text: string; border: string }> = {
  CRITICO: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
  ALTO:    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-300' },
  MEDIO:   { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  BAIXO:   { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200' },
};

export const SCORE_LABELS: Record<ScoreClassificacao, string> = {
  CRITICO: 'Crítico',
  ALTO: 'Alto',
  MEDIO: 'Médio',
  BAIXO: 'Baixo',
};

// ─── Funções estatísticas para forecasting ──────────────────────────────────

export function mediaMovelPonderada(valores: number[], janela: number = 7): number {
  if (valores.length === 0) return 0;
  const slice = valores.slice(-janela);
  let somaP = 0, somaPesos = 0;
  for (let i = 0; i < slice.length; i++) {
    const peso = i + 1; // peso crescente (mais recente = mais peso)
    somaP += slice[i] * peso;
    somaPesos += peso;
  }
  return somaPesos > 0 ? somaP / somaPesos : 0;
}

export function desvioPadrao(valores: number[]): number {
  if (valores.length < 2) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const somaQuad = valores.reduce((acc, v) => acc + (v - media) ** 2, 0);
  return Math.sqrt(somaQuad / (valores.length - 1));
}

export function coeficienteVariacao(valores: number[]): number {
  if (valores.length < 2) return 0;
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  if (media === 0) return 0;
  return desvioPadrao(valores) / media;
}

export type ClasseXYZ = 'X' | 'Y' | 'Z';

export function classificarXYZ(cv: number): ClasseXYZ {
  if (cv < 0.5) return 'X';  // demanda estável
  if (cv < 1.0) return 'Y';  // demanda moderada
  return 'Z';                  // demanda errática
}

export function regressaoLinearSimples(valores: number[]): { inclinacao: number; tendencia: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE' } {
  const n = valores.length;
  if (n < 2) return { inclinacao: 0, tendencia: 'ESTAVEL' };

  let somaX = 0, somaY = 0, somaXY = 0, somaXX = 0;
  for (let i = 0; i < n; i++) {
    somaX += i;
    somaY += valores[i];
    somaXY += i * valores[i];
    somaXX += i * i;
  }

  const denominador = n * somaXX - somaX * somaX;
  if (denominador === 0) return { inclinacao: 0, tendencia: 'ESTAVEL' };

  const inclinacao = (n * somaXY - somaX * somaY) / denominador;
  const media = somaY / n;

  // Tendência baseada na inclinação relativa à média
  const variacaoRelativa = media !== 0 ? inclinacao / media : 0;

  let tendencia: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE';
  if (variacaoRelativa > 0.05) tendencia = 'CRESCENTE';
  else if (variacaoRelativa < -0.05) tendencia = 'DECRESCENTE';
  else tendencia = 'ESTAVEL';

  return { inclinacao, tendencia };
}

export function projecaoComBandaConfianca(
  valores: number[],
  diasFuturo: number
): { projecao: number; limiteInferior: number; limiteSuperior: number } {
  const media = mediaMovelPonderada(valores);
  const dp = desvioPadrao(valores);
  const { inclinacao } = regressaoLinearSimples(valores);

  // Projeção = média ponderada + tendência × dias
  const projecao = Math.max(0, (media + inclinacao * diasFuturo) * diasFuturo);

  // Banda de confiança (95% ≈ 1.96σ)
  const margem = 1.96 * dp * Math.sqrt(diasFuturo);

  return {
    projecao: Math.round(projecao),
    limiteInferior: Math.round(Math.max(0, projecao - margem)),
    limiteSuperior: Math.round(projecao + margem),
  };
}

// ─── Estoque de segurança dinâmico ──────────────────────────────────────────

export function estoqueSegurancaDinamico(
  consumoDiario: number[],
  leadTimeDias: number = 7,
  nivelServico: number = 0.95  // 95% → z ≈ 1.65
): number {
  const dp = desvioPadrao(consumoDiario);
  const z = nivelServico >= 0.99 ? 2.33 : nivelServico >= 0.95 ? 1.65 : 1.28;
  return Math.ceil(z * dp * Math.sqrt(leadTimeDias));
}

export function pontoRessuprimentoDinamico(
  consumoDiario: number[],
  leadTimeDias: number = 7,
  nivelServico: number = 0.95
): number {
  const media = consumoDiario.length > 0
    ? consumoDiario.reduce((a, b) => a + b, 0) / consumoDiario.length
    : 0;
  const ss = estoqueSegurancaDinamico(consumoDiario, leadTimeDias, nivelServico);
  return Math.ceil(media * leadTimeDias + ss);
}
