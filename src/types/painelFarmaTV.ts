// ─── Shared payload types for Painel do Farma TV ─────────────────────────────
// Each source tab writes its summary to localStorage; the TV panel reads them.

// ── Insights do Farma (Dashboard.tsx) ────────────────────────────────────────
export interface InsightsPayload {
  savedAt: string;
  stats: {
    total: number;
    critical: number;
    warning: number;
    ok: number;
    avgCoverage: number;
    turnover: number;
  };
  paretoTop5?: { name: string; consumption: number; percentage: number }[]; // legacy — mantido para compatibilidade
  paretoData: { name: string; consumption: number; percentage: number }[]; // até 15 itens
  securityAlerts: {
    id: string;
    name: string;
    coverageDays: number;
    dailyConsumption: number;
    status: string;
  }[];
  abcDistribution: { curvaA: number; curvaB: number; curvaC: number };
  transferOpportunities: {
    id: string;
    name: string;
    physicalStock: number;
    coverageDays: number;
    dailyConsumption: number;
  }[];
  expiryItems: { date: string; count: number; day: number; month: number }[];
}

// ── Rastreio de Falta (RastreioFalta.tsx) ─────────────────────────────────────
export interface RastreioPayload {
  savedAt: string;
  total: number;
  critico: number;
  alerta: number;
  atencao: number;
  ok: number;
  tendAlta: number;
  tendQueda: number;
  top10: {
    codigo: string;
    comercial: string;
    projecao: number;
    nivel: string;
    media: number;
    saldo: number;
  }[];
  top20: {
    codigo: string;
    comercial: string;
    projecao: number;
    nivel: string;
    media: number;
    saldo: number;
  }[];
  diaLabels: string[];
}

// ── Previsibilidade (PrevisibilidadeV2.tsx) ───────────────────────────────────
export interface PrevisibilidadePayload {
  savedAt: string;
  total: number;
  rupturaPredita: number;
  semSubstituto: number;
  comSubstituto: number;
  parcial: number;
  suficiente: number;
  top10Risk?: {
    id: string;
    nome: string;
    cobertura: string;
    coberturaEquiv: boolean;
    saldo: number;
    qtdSolicitada: number;
  }[]; // legacy — mantido para compatibilidade
  top20Risk: {
    id: string;
    nome: string;
    cobertura: string;
    coberturaEquiv: boolean;
    saldo: number;
    qtdSolicitada: number;
  }[]; // até 20 itens
  substituteList: {
    id: string;
    nome: string;
    saldo: number;
    qtdSolicitada: number;
  }[];
}

// ── Abastecimento (PainelTVAbastecimento — chave existente) ───────────────────
// Replicamos apenas os campos usados pelo Painel TV do Farma
export interface AbastecimentoPayload {
  savedAt?: string;
  kpis?: {
    emFalta: number;
    atrasados: number;
    coberturaCritica: number;
    taxaRuptura: number;
    total?: number;
    coberturaMedia?: number;
    taxaConformidade?: number;
    altoCusto?: number;
  };
  rupturas?: {
    codItem: string;
    descItem: string;
    fornecedor: string;
    diasAtraso: number;
    cobertura: number;
  }[];
  items?: {
    codItem: string;
    descItem: string;
    fornec: string;
    emFalta: boolean;
    ruptura: boolean;
    diasAtraso: number;
    cobertura: number;
    estoqDisp: number;
    estoqTot: number;
  }[];
  suppliers?: {
    nome: string;
    total: number;
    atrasados: number;
    emFalta: number;
    diasAtrasoMedio: number;
    coberturaMedia: number;
    pontualidade: number;
  }[];
}
