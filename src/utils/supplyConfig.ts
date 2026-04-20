// ─── CONFIGURAÇÃO DE PARÂMETROS DE RESSUPRIMENTO ─────────────────────────────
// Centraliza todos os thresholds usados nos módulos de Supply/Previsibilidade.
// Persistido via usePersistentState (localStorage + Supabase).

export interface SupplyConfig {
  coberturaCritica: number;      // dias — abaixo disso = URGENTE (default: 3)
  coberturaAlerta: number;       // dias — abaixo disso = PEDIR (default: 7)
  multiplicadorSeguranca: number; // fator de safety stock (default: 1.20)
  horizonteRequisicao: number;   // dias de cobertura alvo na requisição (default: 5)
  limiteDivergencia: number;     // unidades — divergência física vs sistema (default: 30)
  diasExpiracaoAlerta: number;   // dias — alerta de validade próxima (default: 90)
  coberturaIdeal: number;        // dias — cobertura alvo para ressuprimento (default: 15)
}

export const DEFAULT_SUPPLY_CONFIG: SupplyConfig = {
  coberturaCritica: 3,
  coberturaAlerta: 7,
  multiplicadorSeguranca: 1.20,
  horizonteRequisicao: 5,
  limiteDivergencia: 30,
  diasExpiracaoAlerta: 90,
  coberturaIdeal: 15,
};

export const SUPPLY_CONFIG_KEY = 'supply_config_v1';

export const SUPPLY_CONFIG_LABELS: Record<keyof SupplyConfig, { label: string; descricao: string; min: number; max: number; step: number; sufixo: string }> = {
  coberturaCritica: {
    label: 'Cobertura Crítica',
    descricao: 'Dias de cobertura abaixo dos quais o item é classificado como URGENTE',
    min: 1, max: 10, step: 1, sufixo: 'dias',
  },
  coberturaAlerta: {
    label: 'Cobertura Alerta',
    descricao: 'Dias de cobertura abaixo dos quais o item entra em alerta (PEDIR)',
    min: 3, max: 30, step: 1, sufixo: 'dias',
  },
  multiplicadorSeguranca: {
    label: 'Multiplicador de Segurança',
    descricao: 'Fator aplicado sobre a necessidade calculada para margem de segurança',
    min: 1.0, max: 2.0, step: 0.05, sufixo: '×',
  },
  horizonteRequisicao: {
    label: 'Horizonte de Requisição',
    descricao: 'Dias de cobertura alvo ao gerar requisições (Satélite → CAF)',
    min: 3, max: 30, step: 1, sufixo: 'dias',
  },
  limiteDivergencia: {
    label: 'Limite de Divergência',
    descricao: 'Diferença máxima (unidades) entre estoque físico e sistema antes de alertar',
    min: 5, max: 100, step: 5, sufixo: 'un.',
  },
  diasExpiracaoAlerta: {
    label: 'Alerta de Validade',
    descricao: 'Dias antes da expiração para sinalizar risco de validade',
    min: 30, max: 180, step: 15, sufixo: 'dias',
  },
  coberturaIdeal: {
    label: 'Cobertura Ideal',
    descricao: 'Dias de cobertura alvo para o ressuprimento padrão',
    min: 7, max: 60, step: 1, sufixo: 'dias',
  },
};
