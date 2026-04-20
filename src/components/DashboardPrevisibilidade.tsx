import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { AlertTriangle, CheckCircle, UploadCloud, Search, Filter, Package, AlertOctagon, FileText, XCircle, ChevronDown, ChevronUp, Download, RefreshCw, Database, Activity, Target, ShieldAlert, Zap, ArrowUpDown, ArrowUp, ArrowDown, TrendingDown, Brain, Settings2, BarChart3, TrendingUp, Gauge, SlidersHorizontal } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import { motion, AnimatePresence } from 'motion/react';
import {
  calcularScorePrioridade,
  mediaMovelPonderada,
  coeficienteVariacao,
  classificarXYZ,
  regressaoLinearSimples,
  projecaoComBandaConfianca,
  estoqueSegurancaDinamico,
  SCORE_COLORS,
  SCORE_LABELS,
  type ScorePesos,
  DEFAULT_SCORE_PESOS,
} from '../utils/supplyScore';
import {
  type SupplyConfig,
  DEFAULT_SUPPLY_CONFIG,
  SUPPLY_CONFIG_LABELS,
  SUPPLY_CONFIG_KEY,
} from '../utils/supplyConfig';

export interface LoteData {
  lote: string;
  validade: string;
  quantidade: number;
}

export interface PredictabilityData {
  Produto_ID: string;
  Produto_Nome: string;
  Estoque_Atual: number;
  Total_Solicitado: number;
  Saldo_Projetado: number;
  Status: 'Ruptura Predita' | 'Suficiente' | 'Falta, mas com Substituto';
  Solicitacoes: { id: string; data: string; qt: number }[];
  Lotes: LoteData[];
  Sugestao_Substituicao?: { nome: string; saldo: number };
}

interface RawData {
  pendingSolicitacoes: Map<string, string>;
  requestedProducts: Map<string, { id: string, nome: string, total: number, solicitacoes: { id: string, data: string, qt: number }[] }>;
  stockMap: Map<string, { total: number, lotes: LoteData[], nome: string }>;
}

interface DashboardPrevisibilidadeProps {
  equivalenceMap: Record<string, string[]>;
  setEquivalenceMap: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  data: PredictabilityData[];
  setData: React.Dispatch<React.SetStateAction<PredictabilityData[]>>;
  filesLoaded: {demandas: boolean, itens: boolean, estoque: boolean};
  setFilesLoaded: React.Dispatch<React.SetStateAction<{demandas: boolean, itens: boolean, estoque: boolean}>>;
  rawSource: any | null;
  setRawSource: (source: any) => void;
}

// Extrai string de data no formato DD/MM/YYYY de uma string de data/hora
function extractDayKey(dateStr: string): string | null {
  if (!dateStr || dateStr === 'Data não informada') return null;
  const datePart = dateStr.trim().split(' ')[0];
  const parts = datePart.split('/');
  if (parts.length === 3 && parts[2].length === 4) return datePart;
  return null;
}

export const DashboardPrevisibilidade: React.FC<DashboardPrevisibilidadeProps> = ({
  equivalenceMap = {}, 
  setEquivalenceMap,
  data = [],
  setData,
  filesLoaded = { demandas: false, itens: false, estoque: false },
  setFilesLoaded,
  rawSource,
  setRawSource
}) => {
  // Garantia de que data é um array (evita erros de .length)
  const safeData = Array.isArray(data) ? data : [];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyRupture, setShowOnlyRupture] = useState(true);
  const [windowHours, setWindowHours] = useState<0 | 48 | 72 | 96>(0);
  // Removido rawData local em favor do rawSource vindo do App.tsx

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof PredictabilityData; direction: 'asc' | 'desc' } | null>(null);

  // ── IA ────────────────────────────────────────────────────────────────────
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult]       = useState<string | null>(null);
  const [showAiModal, setShowAiModal] = useState(false);

  // ── WhatsApp Alert ──────────────────────────────────────────────────────
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [whatsAppResult, setWhatsAppResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Config & Score ───────────────────────────────────────────────────────
  const [showConfigPanel, setShowConfigPanel] = useState(false);
  const [supplyConfig, setSupplyConfig] = useState<SupplyConfig>(DEFAULT_SUPPLY_CONFIG);
  const [scorePesos, setScorePesos] = useState<ScorePesos>(DEFAULT_SCORE_PESOS);

  // ── Simulador de Cenários ───────────────────────────────────────────────
  const [showSimulador, setShowSimulador] = useState(false);
  const [simConsumoVar, setSimConsumoVar] = useState(0);   // -50 a +100 (%)
  const [simAtrasoFornecedor, setSimAtrasoFornecedor] = useState(0); // 0-30 dias
  const [simHorizonte, setSimHorizonte] = useState(7);     // 7-90 dias

  // 1. Filtro por busca apenas (sem ruptura ainda — será aplicado após recálculo)
  const searchFiltered = useMemo(() => {
    return safeData.filter(item =>
      item.Produto_Nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Produto_ID?.includes(searchTerm)
    );
  }, [safeData, searchTerm]);

  // 2. Projeta demanda para a janela escolhida
  //    Lógica: conta quantos dias únicos aparecem nas datas das solicitações.
  //    Taxa diária = Total_Solicitado / dias_observados
  //    Projetado = taxa_diária × (windowHours / 24)
  //    Fallback: se não há datas ou apenas 1 dia, considera 1 dia de referência
  //    (solicitudes de hoje × nº de dias da janela)
  const windowedData = useMemo(() => {
    if (windowHours === 0) return searchFiltered;
    const targetDays = windowHours / 24;

    return searchFiltered.map(item => {
      // Conta dias únicos nas datas das solicitações
      const uniqueDays = new Set<string>();
      item.Solicitacoes.forEach(s => {
        const key = extractDayKey(s.data);
        if (key) uniqueDays.add(key);
      });

      // Referência: dias observados (mínimo 1)
      const refDays = Math.max(1, uniqueDays.size);

      // Demanda diária → projeção para a janela
      const dailyRate = item.Total_Solicitado / refDays;
      const totalSolicitado = Math.ceil(dailyRate * targetDays);
      const saldoProjetado = item.Estoque_Atual - totalSolicitado;
      let status: PredictabilityData['Status'] = saldoProjetado < 0 ? 'Ruptura Predita' : 'Suficiente';
      if (status === 'Ruptura Predita' && item.Sugestao_Substituicao) status = 'Falta, mas com Substituto';

      return { ...item, Total_Solicitado: totalSolicitado, Saldo_Projetado: saldoProjetado, Status: status };
    });
  }, [searchFiltered, windowHours]);

  // 2.5 Enriquecer com Score de Prioridade e classificação XYZ
  const enrichedData = useMemo(() => {
    return windowedData.map(item => {
      // Extrair valores diários das solicitações para análise estatística
      const dailyValues: number[] = [];
      const dayMap = new Map<string, number>();
      item.Solicitacoes.forEach(s => {
        const key = extractDayKey(s.data);
        if (key) dayMap.set(key, (dayMap.get(key) || 0) + s.qt);
      });
      dayMap.forEach(v => dailyValues.push(v));

      const cv = coeficienteVariacao(dailyValues);
      const classeXYZ = classificarXYZ(cv);
      const tendencia = regressaoLinearSimples(dailyValues);
      const mediaPonderada = mediaMovelPonderada(dailyValues);
      const coberturaDias = mediaPonderada > 0 ? item.Estoque_Atual / mediaPonderada : 999;

      const scoreResult = calcularScorePrioridade({
        nomeProduto: item.Produto_Nome,
        coberturaDias,
        consumoMedio: mediaPonderada,
      }, scorePesos);

      // Simulador: projeção com variação de consumo
      const consumoSimulado = mediaPonderada * (1 + simConsumoVar / 100);
      const demandaSimulada = consumoSimulado * simHorizonte;
      const saldoSimulado = item.Estoque_Atual - demandaSimulada;
      const coberturaSimulada = consumoSimulado > 0 ? item.Estoque_Atual / consumoSimulado : 999;

      // Estoque de segurança dinâmico
      const ssSeguranca = dailyValues.length >= 2
        ? estoqueSegurancaDinamico(dailyValues, supplyConfig.coberturaAlerta)
        : Math.ceil(mediaPonderada * supplyConfig.coberturaAlerta * (supplyConfig.multiplicadorSeguranca - 1));

      return {
        ...item,
        _score: scoreResult,
        _classeXYZ: classeXYZ,
        _cv: cv,
        _tendencia: tendencia.tendencia,
        _mediaPonderada: mediaPonderada,
        _coberturaDias: coberturaDias,
        _ssSeguranca: ssSeguranca,
        _saldoSimulado: saldoSimulado,
        _coberturaSimulada: coberturaSimulada,
      };
    });
  }, [windowedData, scorePesos, simConsumoVar, simHorizonte, supplyConfig]);

  // 3. Filtro por ruptura aplicado após recálculo (para refletir status da janela)
  const filteredData = useMemo(() => {
    if (!showOnlyRupture) return enrichedData;
    return enrichedData.filter(d => d.Status === 'Ruptura Predita');
  }, [enrichedData, showOnlyRupture]);

  const sortedFilteredData = useMemo(() => {
    if (!sortConfig) return filteredData;
    return [...filteredData].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
      }
      const aStr = String(aVal ?? '').toLowerCase();
      const bStr = String(bVal ?? '').toLowerCase();
      return sortConfig.direction === 'asc'
        ? aStr.localeCompare(bStr, 'pt-BR')
        : bStr.localeCompare(aStr, 'pt-BR');
    });
  }, [filteredData, sortConfig]);

  const requestSort = (key: keyof PredictabilityData) => {
    setSortConfig(prev =>
      prev?.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'asc' }
    );
  };

  const SortIcon = ({ col }: { col: keyof PredictabilityData }) => {
    if (sortConfig?.key !== col) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp className="w-3 h-3 text-indigo-500" />
      : <ArrowDown className="w-3 h-3 text-indigo-500" />;
  };

  // Base ativa para KPIs: usa dados enriquecidos sem o filtro de ruptura
  const activeData = enrichedData;

  const uniqueProductsCount = activeData.length;
  const ruptureCount = activeData.filter(d => d.Status === 'Ruptura Predita').length;
  const substituteCount = activeData.filter(d => d.Status === 'Falta, mas com Substituto').length;
  const totalRupturas = ruptureCount + substituteCount;
  const coverageRate = totalRupturas > 0 ? Math.round((substituteCount / totalRupturas) * 100) : 0;

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const toggleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === sortedFilteredData.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(sortedFilteredData.map(item => item.Produto_ID)));
    }
  };

  const parseCSV = (file: File): Promise<string[][]> => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          let rows = results.data as string[][];
          // Handle weird CSV format where the entire row is wrapped in quotes
          rows = rows.map(row => {
            if (row.length === 1 && typeof row[0] === 'string' && row[0].includes(',')) {
              const parsedRow = Papa.parse(row[0], { header: false }).data[0] as string[];
              if (parsedRow && parsedRow.length > 1) {
                return parsedRow;
              }
            }
            return row;
          });
          resolve(rows);
        },
        error: reject
      });
    });
  };

  const findValueNearIndex = (row: string[], index: number, validator: (val: string) => boolean): string => {
    if (row[index] && validator(row[index])) return row[index];
    for (let offset = 1; offset <= 3; offset++) {
      if (row[index + offset] && validator(row[index + offset])) return row[index + offset];
      if (row[index - offset] && validator(row[index - offset])) return row[index - offset];
    }
    return '';
  };

  const recalculate = useCallback((raw: any = rawSource) => {
    if (!raw) return;
    
    // Deserialização segura (converte de volta para Map se for objeto simples)
    const pendingSolicitacoes = raw.pendingSolicitacoes instanceof Map 
      ? raw.pendingSolicitacoes 
      : new Map(Object.entries(raw.pendingSolicitacoes || {}));

    const requestedProductsRaw = raw.requestedProducts instanceof Map
      ? raw.requestedProducts
      : new Map(Object.entries(raw.requestedProducts || {}));
    
    // Cast necessário para o TypeScript após a conversão do objeto
    const requestedProducts = requestedProductsRaw as Map<string, { id: string, nome: string, total: number, solicitacoes: { id: string, data: string, qt: number }[] }>;

    const stockMapRaw = raw.stockMap instanceof Map
      ? raw.stockMap
      : new Map(Object.entries(raw.stockMap || {}));

    const stockMap = stockMapRaw as Map<string, { total: number, lotes: LoteData[], nome: string }>;
    
    // 4. Cruzamento de Dados (Matemática de Previsibilidade)
    const result: PredictabilityData[] = [];
    requestedProducts.forEach((req, id) => {
      const stockInfo = stockMap.get(id) || { total: 0, lotes: [], nome: '' };
      const estoqueAtual = stockInfo.total;
      const saldoProjetado = estoqueAtual - req.total;
      let status: PredictabilityData['Status'] = saldoProjetado < 0 ? 'Ruptura Predita' : 'Suficiente';
      let sugestaoSubstituicao: { nome: string; saldo: number } | undefined = undefined;
      
      if (status === 'Ruptura Predita') {
        // 1. Tentar pelo Mapa da aba Equivalência (compartilhado via App)
        if (equivalenceMap[id]) {
          for (const subId of equivalenceMap[id]) {
            const subInfo = stockMap.get(subId);
            if (subInfo && subInfo.total > 0) {
              status = 'Falta, mas com Substituto';
              sugestaoSubstituicao = { nome: subInfo.nome, saldo: subInfo.total };
              break;
            }
          }
        }

        // 2. Fallback: Tentar pelo princípio ativo (lógica original baseada em string)
        if (status === 'Ruptura Predita') {
          const parts = req.nome.split('-');
          const principioAtivo = parts[parts.length - 1].trim().toLowerCase();
          
          if (principioAtivo) {
            for (const [subId, subInfo] of stockMap.entries()) {
              if (subId !== id && subInfo.nome.toLowerCase().includes(principioAtivo) && subInfo.total > 0) {
                status = 'Falta, mas com Substituto';
                sugestaoSubstituicao = { nome: subInfo.nome, saldo: subInfo.total };
                break;
              }
            }
          }
        }
      }
      
      const sortedLotes = [...stockInfo.lotes].sort((a, b) => {
        const [d1, m1, y1] = a.validade.split('/');
        const [d2, m2, y2] = b.validade.split('/');
        const date1 = new Date(`${y1}-${m1}-${d1}`);
        const date2 = new Date(`${y2}-${m2}-${d2}`);
        return date1.getTime() - date2.getTime();
      });

      result.push({
        Produto_ID: id,
        Produto_Nome: req.nome,
        Estoque_Atual: estoqueAtual,
        Total_Solicitado: req.total,
        Saldo_Projetado: saldoProjetado,
        Status: status,
        Solicitacoes: req.solicitacoes,
        Lotes: sortedLotes,
        Sugestao_Substituicao: sugestaoSubstituicao
      });
    });

    // Ordenar por Saldo Projetado (crescente) para que as rupturas apareçam primeiro
    result.sort((a, b) => a.Saldo_Projetado - b.Saldo_Projetado);

    setData(result);
  }, [rawSource, equivalenceMap, setData]);

  const handleAiAnalysis = useCallback(async () => {
    const rupturas = windowedData.filter(d => d.Status === 'Ruptura Predita');
    if (rupturas.length === 0) return;

    setIsAnalyzing(true);
    setAiResult(null);
    setShowAiModal(true);

    const janelaLabel = windowHours > 0
      ? `Janela de projeção ativa: ${windowHours}h (${windowHours / 24} dias)`
      : 'Janela de projeção: dados brutos sem recálculo temporal';

    const linhas = rupturas.map((item, idx) => {
      const deficit = Math.abs(item.Saldo_Projetado);
      const solIds  = item.Solicitacoes.map(s => `#${s.id}(${s.qt}un)`).join(', ');
      return (
        `${idx + 1}. ${item.Produto_Nome} (ID: ${item.Produto_ID})\n` +
        `   Estoque atual: ${item.Estoque_Atual.toLocaleString('pt-BR')} un | ` +
        `Total solicitado: ${item.Total_Solicitado.toLocaleString('pt-BR')} un | ` +
        `Déficit: ${deficit.toLocaleString('pt-BR')} un\n` +
        `   Solicitações pendentes: ${solIds || 'N/D'}`
      );
    }).join('\n\n');

    const prompt = `Você é um especialista em logística farmacêutica hospitalar. Analise a seguinte situação de ruptura de estoque prevista e forneça uma análise estruturada em português brasileiro, com linguagem técnica adequada para um farmacêutico hospitalar.

=== CONTEXTO ===
Sistema: FarmaIA — Painel de Previsibilidade de Ruptura
Data da análise: ${new Date().toLocaleDateString('pt-BR')}
${janelaLabel}
Total de rupturas preditas: ${rupturas.length} produto(s)

=== PRODUTOS COM RUPTURA PREDITA ===
${linhas}

=== SOLICITAÇÃO DE ANÁLISE ===
Com base nos dados acima, forneça:

1. RANKING DE PRIORIDADE
   Liste os produtos em ordem de urgência de intervenção, justificando cada posição com base no déficit absoluto, volume de solicitações e criticidade clínica estimada.

2. AVALIAÇÃO DE RISCO
   Para cada produto, classifique o risco como CRÍTICO, ALTO ou MODERADO, considerando o impacto potencial na assistência ao paciente caso a ruptura ocorra.

3. AÇÕES RECOMENDADAS
   Para cada produto, indique a ação imediata mais adequada: contato com fornecedor, solicitação emergencial ao almoxarifado central, busca de substituto terapêutico, fracionamento de estoque de outro setor ou outra estratégia específica.

Seja objetivo, direto e prático. Priorize a segurança do paciente.`;

    try {
      const res = await fetch('/api/ai-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as { text?: string; error?: string };
      if (json.error) throw new Error(json.error);
      setAiResult(json.text || 'Análise concluída sem conteúdo retornado.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAiResult(`Erro ao gerar análise: ${msg}. Verifique a conexão com a API.`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [windowedData, windowHours]);

  const handleWhatsAppAlert = useCallback(async () => {
    const rupturas = enrichedData.filter(d => d.Status === 'Ruptura Predita' || d.Status === 'Falta, mas com Substituto');
    if (rupturas.length === 0) return;

    setIsSendingWhatsApp(true);
    setWhatsAppResult(null);

    try {
      const items = rupturas.map(item => ({
        produtoId: item.Produto_ID,
        produtoNome: item.Produto_Nome,
        estoqueAtual: item.Estoque_Atual,
        totalSolicitado: item.Total_Solicitado,
        saldoProjetado: item.Saldo_Projetado,
        status: item.Status,
        score: item._score.score,
        classificacao: item._score.classificacao,
        riscoAssistencial: item._score.riscoLevel,
        substituto: item.Sugestao_Substituicao?.nome,
      }));

      const res = await fetch('/api/send-rupture-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      const text = await res.text();
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(text); } catch {
        throw new Error(`API indisponível (HTTP ${res.status})`);
      }
      if (!res.ok) throw new Error((json.error as string) || `HTTP ${res.status}`);
      setWhatsAppResult({ ok: true, message: `Alerta enviado para ${json.sent} destino(s)` });
    } catch (err) {
      setWhatsAppResult({ ok: false, message: err instanceof Error ? err.message : 'Erro ao enviar' });
    } finally {
      setIsSendingWhatsApp(false);
      setTimeout(() => setWhatsAppResult(null), 5000);
    }
  }, [enrichedData]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setLoading(true);
    setError(null);
    
    try {
      let fileDemandas: { data: string[][], headerRow: number } | null = null;
      let fileItens: { data: string[][], headerRow: number } | null = null;
      let fileEstoque: { data: string[][], headerRow: number } | null = null;

      for (const file of acceptedFiles) {
        const csvData = await parseCSV(file);
        const contentStr = csvData.slice(0, 20).map(row => row.join(' ')).join(' ');
        const contentLower = contentStr.toLowerCase();
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const contentNorm = normalize(contentLower);

        let headerRow = -1;

        if ((contentStr.includes('Situa') && contentStr.includes('Tp Solicita')) ||
            (contentNorm.includes('situa') && contentNorm.includes('solicita') && !contentNorm.includes('qt. solicitada') && !contentNorm.includes('qtd solicitada'))) {
          headerRow = csvData.findIndex(row => {
            const r = normalize(row.join(' ').toLowerCase());
            return r.includes('solicita') && r.includes('situa');
          });
          fileDemandas = { data: csvData, headerRow: Math.max(0, headerRow) };
        } else if ((contentStr.includes('Atendimento') && contentStr.includes('Qt. Solicitada')) || 
                   (contentNorm.includes('solicita') && (contentNorm.includes('qt. solicitada') || contentNorm.includes('qtd solicitada')))) {
          headerRow = csvData.findIndex(row => {
            const r = normalize(row.join(' ').toLowerCase());
            return (r.includes('solicita') || r.includes('atendimento')) && (r.includes('qt. solicitada') || r.includes('qtd solicitada') || r.includes('qt solicitada'));
          });
          fileItens = { data: csvData, headerRow: Math.max(0, headerRow) };
        } else if ((contentStr.includes('Qtd Atual') || contentStr.includes('Estoque Atual')) && contentStr.includes('Produto') || 
                   (contentNorm.includes('produto') && (contentNorm.includes('qtd atual') || contentNorm.includes('estoque atual')))) {
          headerRow = csvData.findIndex(row => {
            const r = normalize(row.join(' ').toLowerCase());
            return r.includes('produto') && (r.includes('qtd atual') || r.includes('estoque atual'));
          });
          fileEstoque = { data: csvData, headerRow: Math.max(0, headerRow) };
        }
      }

      setFilesLoaded({
        demandas: !!fileDemandas,
        itens: !!fileItens,
        estoque: !!fileEstoque,
      });

      if (!fileDemandas || !fileItens || !fileEstoque) {
        const missing = [];
        if (!fileDemandas) missing.push("Relatório de Solicitações (Demandas)");
        if (!fileItens) missing.push("Relatório de Itens da Solicitação");
        if (!fileEstoque) missing.push("Relatório de Posição de Estoque");
        throw new Error(`Arquivos não identificados ou ausentes: ${missing.join(', ')}`);
      }

      // 1. Identificar Solicitações Pendentes
      const pendingSolicitacoesMap = new Map<string, string>(); // id -> data
      const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const demHeaderRow = fileDemandas.data[fileDemandas.headerRow].map(c => c ? normalize(c.trim().toLowerCase()) : '');
      let demSolIdx = demHeaderRow.findIndex(c => c.includes('solicita'));
      if (demSolIdx === -1) demSolIdx = 0; // Fallback
      let demSitIdx = demHeaderRow.findIndex(c => c.includes('situa'));
      if (demSitIdx === -1) demSitIdx = 1; // Fallback
      let demDataIdx = demHeaderRow.findIndex(c => c.includes('data') || c.includes('emissao') || c.includes('criacao') || c.includes('hora'));

      for (let i = fileDemandas.headerRow + 1; i < fileDemandas.data.length; i++) {
        const row = fileDemandas.data[i];
        const sol = findValueNearIndex(row, demSolIdx, val => /^\d+$/.test(val.trim()));
        const sit = findValueNearIndex(row, demSitIdx, val => val.trim().length > 0);
        const dataStr = demDataIdx !== -1 ? findValueNearIndex(row, demDataIdx, val => val.includes('/') || val.includes(':')) : '';
        
        // Removed strict `pend` check, assume user exported the pending list correctly
        if (sol) {
          pendingSolicitacoesMap.set(sol.trim(), dataStr || 'Data não informada');
        }
      }

      // 2. Processar Itens das Solicitações Pendentes
      const itensHeaderRow = fileItens.data[fileItens.headerRow].map(c => c ? normalize(c.trim().toLowerCase()) : '');
      let itSolIdx = itensHeaderRow.findIndex(c => c.includes('solicita'));
      if (itSolIdx === -1) itSolIdx = 3; // Fallback based on known structure
      let itProdIdx = itensHeaderRow.findIndex(c => c === 'produto');
      if (itProdIdx === -1) itProdIdx = 6; // Fallback based on known structure
      let itQtIdx = itensHeaderRow.findIndex(c => c.includes('qt. solicitada') || c.includes('qtd solicitada') || c.includes('qt solicitada'));
      if (itQtIdx === -1) itQtIdx = 9; // Fallback based on known structure

      const requestedProducts = new Map<string, { id: string, nome: string, total: number, solicitacoes: { id: string, data: string, qt: number }[] }>();

      for (let i = fileItens.headerRow + 1; i < fileItens.data.length; i++) {
        const row = fileItens.data[i];
        const sol = findValueNearIndex(row, itSolIdx, val => /^\d+$/.test(val.trim()));
        
        if (sol && pendingSolicitacoesMap.has(sol.trim())) {
          // Relaxed validation - any string starting with numbers
          const prodRaw = findValueNearIndex(row, itProdIdx, val => /^\d+/.test(val.trim()));
          const qtRaw = findValueNearIndex(row, itQtIdx, val => /^\d+([.,]\d+)?$/.test(val.replace(/"/g, '').trim()));

          if (prodRaw && qtRaw) {
            let id = '';
            let nome = '';
            if (prodRaw.includes('-')) {
              const parts = prodRaw.split('-');
              id = parts[0].trim();
              nome = parts.slice(1).join('-').trim() || prodRaw;
            } else {
              const match = prodRaw.match(/^(\d+)(.*)/);
              if (match) {
                id = match[1].trim();
                nome = match[2].trim() || prodRaw;
              }
            }
            
            const qt = parseFloat(qtRaw.replace(/"/g, '').replace(/\./g, '').replace(',', '.'));
            
            if (!isNaN(qt) && id) {
              const existing = requestedProducts.get(id) || { id, nome, total: 0, solicitacoes: [] };
              existing.total += qt;
              existing.solicitacoes.push({ id: sol.trim(), data: pendingSolicitacoesMap.get(sol.trim()) || '', qt });
              requestedProducts.set(id, existing);
            }
          }
        }
      }

      // 3. Processar Posição de Estoque / Conferência de Lotes
      const estHeaderRow = fileEstoque.data[fileEstoque.headerRow].map(c => c ? normalize(c.trim().toLowerCase()) : '');
      const isConferenciaLotes = estHeaderRow.includes('lote') && estHeaderRow.includes('validade');

      const stockMap = new Map<string, { total: number, lotes: LoteData[], nome: string }>();
      let currentProdId = '';
      let currentProdNome = '';

      if (isConferenciaLotes) {
        let estProdIdx = estHeaderRow.findIndex(c => c.includes('produto') || c.includes('descrição') || c.includes('descricao'));
        if (estProdIdx === -1) estProdIdx = 3; // Fallback for Conferencia de Lotes

        for (let i = fileEstoque.headerRow + 1; i < fileEstoque.data.length; i++) {
          const row = fileEstoque.data[i];
          if (!row || row.length === 0) continue;

          let id = '';
          if (row[1] && /^\d+$/.test(row[1].trim())) {
            id = row[1].trim();
            currentProdId = id;
            currentProdNome = row[estProdIdx] || '';
          } else {
            id = currentProdId;
          }

          if (!id) continue;

          const existing = stockMap.get(id) || { total: 0, lotes: [], nome: currentProdNome };

          if (row[1]) {
            const estAtualRaw = row[6] || row[5] || '';
            existing.total = parseInt(estAtualRaw.replace(/"/g, '').replace(/\./g, '').replace(',', '.'), 10) || 0;
          }

          const lote = row[8] || row[7] || '';
          const validade = row[10] || row[9] || '';
          const qtLoteRaw = row[18] || row[17] || '';
          const qtLote = parseInt(qtLoteRaw.replace(/"/g, '').replace(/\./g, '').replace(',', '.'), 10) || 0;

          if (lote && validade && validade.includes('/')) {
            existing.lotes.push({ lote: lote.trim(), validade: validade.trim(), quantidade: qtLote });
          }

          stockMap.set(id, existing);
        }
      } else {
        let estProdIdx = estHeaderRow.findIndex(c => c.includes('produto'));
        if (estProdIdx === -1) estProdIdx = 0;
        let estQtdIdx = estHeaderRow.findIndex(c => c.includes('estoque atual') || c.includes('qtd atual'));
        if (estQtdIdx === -1) estQtdIdx = 1;

        for (let i = fileEstoque.headerRow + 1; i < fileEstoque.data.length; i++) {
          const row = fileEstoque.data[i];
          const prodRaw = row[estProdIdx] || '';
          const qtdRaw = row[estQtdIdx] || '';

          if (prodRaw.includes('-') && /^\d+\s*-/.test(prodRaw.trim())) {
            const parts = prodRaw.split('-');
            const id = parts[0].trim();
            const nome = parts.slice(1).join('-').trim() || prodRaw;
            const qtd = parseInt(qtdRaw.replace(/"/g, '').replace(/\./g, '').replace(',', '.'), 10);
            
            if (!isNaN(qtd) && id) {
              stockMap.set(id, { total: qtd, lotes: [], nome });
            }
          }
        }
      }

      const serializableRaw = {
        pendingSolicitacoes: Object.fromEntries(pendingSolicitacoesMap),
        requestedProducts: Object.fromEntries(requestedProducts),
        stockMap: Object.fromEntries(stockMap)
      };

      if (pendingSolicitacoesMap.size === 0) {
         throw new Error("⚠️ Ocorreu um problema ao ler as Demandas. Nenhuma solicitação encontrada! Verifique se seu arquivo possui solicitações ou a palavra 'Solicitação'.");
      }
      if (requestedProducts.size === 0) {
         throw new Error("⚠️ O cruzamento falhou no arquivo de Itens. Nenhum produto lido. Verifique as colunas de quantidade e produto.");
      }
      if (stockMap.size === 0) {
         throw new Error("⚠️ O cruzamento falhou no Estoque. Não conseguimos ler saldos ou produtos validamente.");
      }

      setRawSource(serializableRaw);
      
      recalculate(serializableRaw);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido ao processar arquivos.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [setRawSource, recalculate]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'text/csv': ['.csv', '.txt'] },
    multiple: true
  } as any);

  // As declarações duplicadas foram removidas daqui para cima.

  const exportToPDF = () => {
    const dataToExport = selectedItems.size > 0
      ? sortedFilteredData.filter(item => selectedItems.has(item.Produto_ID))
      : sortedFilteredData;

    const date = new Date().toLocaleDateString('pt-BR');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const filterLabel = selectedItems.size > 0
      ? `Seleção manual: ${selectedItems.size} item(s)`
      : showOnlyRupture ? 'Filtro: somente Ruptura Predita' : 'Todos os produtos';

    const kpis = [
      { label: 'Total de Produtos', value: String(uniqueProductsCount), color: '#4f46e5' },
      { label: 'Ruptura Predita',   value: String(ruptureCount),        color: '#dc2626' },
      { label: 'Com Substituto',    value: String(substituteCount),     color: '#d97706' },
      { label: 'Cobertura',         value: `${coverageRate}%`,          color: coverageRate >= 70 ? '#16a34a' : coverageRate >= 40 ? '#d97706' : '#dc2626' },
      { label: 'Saúde do Atend.',   value: `${healthScore}%`,           color: healthScore >= 90 ? '#16a34a' : healthScore >= 70 ? '#d97706' : '#dc2626' },
    ];

    const kpisHtml = kpis.map(k => `
      <div class="kpi-card">
        <div class="kpi-value" style="color:${k.color}">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
      </div>`).join('');

    const statusStyle = (s: string) => {
      if (s === 'Ruptura Predita')         return { color: '#be123c', bg: '#fff1f2', border: '#fda4af' };
      if (s === 'Falta, mas com Substituto') return { color: '#b45309', bg: '#fffbeb', border: '#fcd34d' };
      return { color: '#15803d', bg: '#f0fdf4', border: '#86efac' };
    };

    const rowsHtml = dataToExport.map((item, i) => {
      const ss = statusStyle(item.Status);
      const bg = i % 2 === 1 ? '#f8fafc' : '#ffffff';
      const rowBg = item.Status === 'Ruptura Predita' ? '#fff1f2' : item.Status === 'Falta, mas com Substituto' ? '#fffbeb' : bg;

      const projColor = item.Saldo_Projetado < 0 ? '#dc2626' : '#1e293b';
      const projWeight = item.Saldo_Projetado < 0 ? '700' : '600';

      const solHtml = item.Solicitacoes?.length > 0
        ? item.Solicitacoes.map(s =>
            `<div class="sol-item">${s.id} — <strong>${s.qt}un</strong>${s.data ? ` <span class="sol-date">(${s.data})</span>` : ''}</div>`
          ).join('')
        : '<span class="empty">—</span>';

      const subHtml = item.Sugestao_Substituicao
        ? `<div class="sub-nome">${item.Sugestao_Substituicao.nome}</div><div class="sub-saldo">Saldo: ${item.Sugestao_Substituicao.saldo.toLocaleString('pt-BR')}</div>`
        : '<span class="empty">—</span>';

      const lotesHtml = item.Lotes?.length > 0
        ? item.Lotes.slice(0, 3).map(l =>
            `<div class="lote-item"><span class="lote-num">${l.lote}</span> <span class="lote-val">${l.validade}</span></div>`
          ).join('')
        : '<span class="empty">—</span>';

      return `
        <tr style="background:${rowBg}">
          <td class="td-id">${item.Produto_ID}</td>
          <td class="td-prod">${item.Produto_Nome}</td>
          <td class="td-num">${item.Estoque_Atual.toLocaleString('pt-BR')}</td>
          <td class="td-num">${item.Total_Solicitado.toLocaleString('pt-BR')}</td>
          <td class="td-num" style="color:${projColor};font-weight:${projWeight}">${item.Saldo_Projetado.toLocaleString('pt-BR')}</td>
          <td class="td-status">
            <span class="status-badge" style="color:${ss.color};background:${ss.bg};border:1px solid ${ss.border}">${item.Status}</span>
          </td>
          <td class="td-sol">${solHtml}</td>
          <td class="td-sub">${subHtml}</td>
          <td class="td-lote">${lotesHtml}</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 10mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1e293b; background: #fff; }

  /* ── HEADER ── */
  .header {
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(135deg, #3730a3 0%, #4f46e5 100%);
    color: white; padding: 10px 14px; border-radius: 5px; margin-bottom: 10px;
  }
  .header h1 { font-size: 18px; font-weight: 700; letter-spacing: 0.3px; }
  .header .sub { font-size: 8.5px; opacity: 0.8; margin-top: 3px; }
  .header-right { text-align: right; font-size: 8.5px; opacity: 0.9; line-height: 1.8; }
  .header-right strong { font-size: 11px; }

  /* ── KPIs ── */
  .kpis { display: flex; gap: 8px; margin-bottom: 10px; }
  .kpi-card {
    flex: 1; background: white; border: 1px solid #e2e8f0;
    border-radius: 5px; padding: 8px 10px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .kpi-value { font-size: 22px; font-weight: 800; line-height: 1; }
  .kpi-label { font-size: 8px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }

  /* ── TABLE ── */
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #d1d9e6; overflow: hidden; }
  thead tr { background: #312e81; color: white; }
  th {
    padding: 6px 5px; font-size: 8px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.3px;
    text-align: center; border-right: 1px solid rgba(255,255,255,0.12);
  }
  th.th-left { text-align: left; }
  th:last-child { border-right: none; }
  td {
    padding: 5px 5px; border-bottom: 1px solid #e8edf4;
    border-right: 1px solid #f1f5f9; font-size: 8px;
    vertical-align: top; overflow: hidden;
  }
  td:last-child { border-right: none; }
  tbody tr:last-child td { border-bottom: none; }

  /* ── COLUMN WIDTHS ── */
  col.c-id   { width: 5%; }
  col.c-prod { width: 24%; }
  col.c-est  { width: 6%; }
  col.c-ped  { width: 6%; }
  col.c-proj { width: 7%; }
  col.c-sta  { width: 14%; }
  col.c-sol  { width: 21%; }
  col.c-sub  { width: 10%; }
  col.c-lot  { width: 7%; }

  .td-id   { text-align: center; font-family: monospace; font-size: 7.5px; color: #64748b; vertical-align: middle; }
  .td-prod { font-weight: 600; color: #1e293b; word-break: break-word; line-height: 1.35; vertical-align: middle; }
  .td-num  { text-align: center; font-weight: 600; vertical-align: middle; }
  .td-status { text-align: center; vertical-align: middle; }
  .td-sol  { line-height: 1.5; }
  .td-sub  { line-height: 1.5; }
  .td-lote { line-height: 1.5; }

  .status-badge {
    display: inline-block; border-radius: 4px;
    padding: 2px 5px; font-size: 7.5px; font-weight: 700;
    white-space: normal; line-height: 1.2;
  }

  .sol-item  { color: #4f46e5; font-size: 7.5px; }
  .sol-date  { color: #94a3b8; }
  .sub-nome  { font-weight: 600; color: #b45309; font-size: 7.5px; }
  .sub-saldo { color: #78350f; font-size: 7.5px; }
  .lote-item { font-size: 7.5px; }
  .lote-num  { font-family: monospace; color: #1e293b; }
  .lote-val  { color: #64748b; }
  .empty     { color: #cbd5e1; }

  /* ── FOOTER ── */
  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>Relatório de Previsibilidade de Estoque</h1>
    <div class="sub">${filterLabel} · ${dataToExport.length} produtos · Emitido em: ${date}, ${time}</div>
  </div>
  <div class="header-right">
    <div>Emitido em: <strong>${date}, ${time}</strong></div>
    <div>FarmaIA &nbsp;|&nbsp; Logística Farmacêutica</div>
  </div>
</div>

<div class="kpis">${kpisHtml}</div>

<table>
  <colgroup>
    <col class="c-id"><col class="c-prod"><col class="c-est"><col class="c-ped">
    <col class="c-proj"><col class="c-sta"><col class="c-sol"><col class="c-sub"><col class="c-lot">
  </colgroup>
  <thead>
    <tr>
      <th>ID</th>
      <th class="th-left">Produto</th>
      <th>Estoque</th>
      <th>Pedido</th>
      <th>Projeção</th>
      <th>Status</th>
      <th class="th-left">Sol. Pendentes</th>
      <th class="th-left">Substituto / Saldo</th>
      <th class="th-left">Lote Rec.</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>

<div class="footer">
  <span>${dataToExport.length} produto(s)${selectedItems.size > 0 ? ' selecionados' : ' exibidos'} de ${safeData.length} no total</span>
  <span>Gerado em ${date} às ${time} · FarmaIA</span>
</div>

</body>
</html>`;

    const win = window.open('', '_blank', 'width=1200,height=850');
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => { win.print(); }, 700);
    }
  };

  const downloadTemplates = () => {
    // We will generate empty CSV templates for the user
    // 1. Demandas
    let csvContent = "Solici.,It.,Situa.,Tp Solicita.,Dt Atend.\n";
    downloadCSV(csvContent, "modelo_demandas_mv.csv");
    
    // 2. Itens
    csvContent = "Situa.,S.I.,Solicita.,It.,Produto,Descrição,Qtd Solicitada,Qtd Atendida\n";
    downloadCSV(csvContent, "modelo_itens_mv.csv");
    
    // 3. Estoque
    csvContent = "Produto,Qtd Atual,Lote,Validade\n";
    downloadCSV(csvContent, "modelo_estoque_mv.csv");
  };

  const downloadCSV = (content: string, filename: string) => {
    const encodedUri = encodeURI("data:text/csv;charset=utf-8," + content);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getDayDiff = (dateStr: string) => {
    const [d, m, y] = dateStr.split('/');
    if (!d || !m || !y) return 999;
    const expDate = new Date(`${y}-${m}-${d}`);
    const today = new Date();
    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
  };

  // Cálculo de Saúde de Atendimento (Health Score)
  const healthScore = uniqueProductsCount > 0 
    ? Math.round(((uniqueProductsCount - ruptureCount) / uniqueProductsCount) * 100) 
    : 100;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">

      {/* ── Cabeçalho unificado ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 px-6 py-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur p-2.5 rounded-xl">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                  Painel de Montagem
                </span>
              </div>
              <h1 className="text-xl font-black text-white leading-tight">Previsibilidade de Ruptura</h1>
              <p className="text-indigo-200 text-sm mt-0.5">
                Cruza demandas pendentes com estoque real — identifique rupturas antes da separação.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {safeData.length > 0 && (
              <>
                <button
                  onClick={() => recalculate()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-bold transition-colors border border-white/20"
                  title="Recalcular com equivalências atuais"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Sincronizar
                </button>
                {ruptureCount > 0 && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleAiAnalysis}
                      disabled={isAnalyzing}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-400 to-violet-500 hover:opacity-90 text-white rounded-lg text-sm font-bold transition-all shadow-sm disabled:opacity-60"
                      title={`Analisar ${ruptureCount} ruptura(s) com IA`}
                    >
                      <Brain className={`w-4 h-4 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                      {isAnalyzing ? 'Analisando...' : 'Analisar com IA'}
                    </button>
                    {!isAnalyzing && aiResult && !showAiModal && (
                      <button
                        onClick={() => setShowAiModal(true)}
                        className="flex items-center gap-1 text-xs text-indigo-200 hover:text-white transition-colors underline underline-offset-2"
                      >
                        <Brain className="w-3 h-3" />
                        Ver análise
                      </button>
                    )}
                  </div>
                )}
                {(ruptureCount > 0 || substituteCount > 0) && (
                  <div className="relative">
                    <button
                      onClick={handleWhatsAppAlert}
                      disabled={isSendingWhatsApp}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-bold transition-all shadow-sm disabled:opacity-60"
                      title="Enviar alerta de ruptura via WhatsApp"
                    >
                      <span className="text-base">📱</span>
                      {isSendingWhatsApp ? 'Enviando...' : 'WhatsApp'}
                    </button>
                    {whatsAppResult && (
                      <div className={`absolute top-full mt-1 right-0 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap z-50 ${
                        whatsAppResult.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {whatsAppResult.message}
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={() => setShowSimulador(v => !v)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${showSimulador ? 'bg-violet-500 text-white border-violet-400' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  Simulador
                </button>
                <button
                  onClick={() => setShowConfigPanel(v => !v)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition-colors border ${showConfigPanel ? 'bg-amber-500 text-white border-amber-400' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}
                >
                  <Settings2 className="w-4 h-4" />
                  Config
                </button>
                <button
                  onClick={exportToPDF}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white text-indigo-700 rounded-lg text-sm font-bold hover:bg-indigo-50 transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Exportar PDF
                </button>
              </>
            )}
          </div>
        </div>

        {/* Guia de informações inline */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap gap-2 items-center">
          <span className="flex items-center gap-1.5 bg-white border border-indigo-100 text-indigo-700 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
            <Target className="w-3 h-3 text-indigo-400" /><strong>Saldo Projetado:</strong>&nbsp;Estoque − pedidos pendentes
          </span>
          <span className="flex items-center gap-1.5 bg-white border border-amber-100 text-amber-700 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
            <Zap className="w-3 h-3 text-amber-400" /><strong>Substituto:</strong>&nbsp;Equivalente com saldo disponível
          </span>
          <span className="flex items-center gap-1.5 bg-white border border-rose-100 text-rose-700 text-xs font-medium px-3 py-1 rounded-full shadow-sm">
            <ShieldAlert className="w-3 h-3 text-rose-400" /><strong>Ruptura Predita:</strong>&nbsp;Estoque insuficiente
          </span>
        </div>
      </div>

      {/* ── Dropzone: completo se sem dados, compacto se já importado ── */}
      {safeData.length === 0 ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer relative overflow-hidden
            ${isDragActive ? 'border-indigo-500 bg-indigo-50/80 scale-[1.01]' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50/50 bg-white shadow-sm'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className={`w-12 h-12 ${isDragActive ? 'text-indigo-500' : 'text-slate-400'}`} />
            <h3 className="text-lg font-medium text-slate-700">Arraste e solte os relatórios CSV aqui</h3>
            <p className="text-sm text-slate-500 max-w-md">
              1. Relatório de Solicitações (Demandas)<br/>
              2. Relatório de Itens da Solicitação<br/>
              3. Relatório de Posição de Estoque<br/>
              <span className="text-indigo-500 font-medium">As equivalências são lidas automaticamente da aba Equivalência.</span>
            </p>
            <div className="flex gap-4 mt-2">
              {(['demandas', 'itens', 'estoque'] as const).map(k => (
                <div key={k} className={`flex items-center gap-1 text-xs capitalize ${filesLoaded[k] ? 'text-emerald-600 font-semibold' : 'text-slate-400'}`}>
                  <CheckCircle className="w-3 h-3" /> {k}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-4">
              <button
                onClick={(e) => { e.stopPropagation(); downloadTemplates(); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-bold transition-colors flex items-center gap-2"
              >
                <FileText className="w-4 h-4" /> Baixar Modelos CSV
              </button>
              <button className="px-4 py-2 bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-sm font-bold text-slate-700 transition-colors">
                Procurar Arquivos
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Dropzone compacto quando dados já carregados */
        <div
          {...getRootProps()}
          className={`border border-dashed rounded-xl px-5 py-3.5 flex items-center justify-between gap-4 cursor-pointer transition-all
            ${isDragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50/50 shadow-sm'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
              <UploadCloud className={`w-4 h-4 ${isDragActive ? 'text-indigo-600' : 'text-indigo-400'}`} />
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-700">Reimportar dados</span>
              <p className="text-xs text-slate-400">Arraste novos CSVs para atualizar</p>
            </div>
          </div>
          <div className="flex gap-2">
            {(['demandas', 'itens', 'estoque'] as const).map(k => (
              <div key={k} className={`flex items-center gap-1.5 text-[11px] font-bold capitalize px-2.5 py-1 rounded-full border ${filesLoaded[k] ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                {filesLoaded[k] ? <CheckCircle className="w-3 h-3" /> : <div className="w-2.5 h-2.5 rounded-full border-2 border-slate-300" />}
                {k}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status de Carregamento */}
      {loading && (
        <div className="flex justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex items-start gap-3">
          <XCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-semibold">Erro ao processar arquivos</h4>
            <p className="text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Dashboard Content */}
      {safeData.length > 0 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">

            {/* Produtos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] bg-indigo-500 w-full" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Produtos</span>
                  <div className="p-1.5 bg-indigo-50 rounded-lg"><Package className="w-3.5 h-3.5 text-indigo-500" /></div>
                </div>
                <p className="text-4xl font-black text-indigo-600 leading-none">{uniqueProductsCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Únicos Lidos</p>
              </div>
            </div>

            {/* Ruptura */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${ruptureCount > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Rupturas</span>
                  <div className={`p-1.5 rounded-lg ${ruptureCount > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                    {ruptureCount > 0 ? <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> : <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                </div>
                <p className={`text-4xl font-black leading-none ${ruptureCount > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{ruptureCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Ruptura Predita</p>
              </div>
            </div>

            {/* Substitutos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${substituteCount > 0 ? 'bg-amber-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Substitutos</span>
                  <div className={`p-1.5 rounded-lg ${substituteCount > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${substituteCount > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-4xl font-black leading-none ${substituteCount > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{substituteCount}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Salváveis</p>
              </div>
            </div>

            {/* Cobertura por Substitutos */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${coverageRate >= 70 ? 'bg-emerald-500' : coverageRate >= 40 ? 'bg-amber-500' : totalRupturas > 0 ? 'bg-rose-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Cobertura</span>
                  <div className={`p-1.5 rounded-lg ${coverageRate >= 70 ? 'bg-emerald-50' : coverageRate >= 40 ? 'bg-amber-50' : totalRupturas > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${coverageRate >= 70 ? 'text-emerald-500' : coverageRate >= 40 ? 'text-amber-500' : totalRupturas > 0 ? 'text-rose-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-4xl font-black leading-none ${coverageRate >= 70 ? 'text-emerald-600' : coverageRate >= 40 ? 'text-amber-600' : totalRupturas > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                  {coverageRate}<span className="text-2xl font-bold">%</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5">
                  <div className={`h-1.5 rounded-full transition-all ${coverageRate >= 70 ? 'bg-emerald-500' : coverageRate >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${coverageRate}%` }} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Rupturas c/ Substituto</p>
              </div>
            </div>

            {/* Saúde */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${healthScore >= 90 ? 'bg-emerald-500' : healthScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Saúde</span>
                  <div className={`p-1.5 rounded-lg ${healthScore >= 90 ? 'bg-emerald-50' : healthScore >= 70 ? 'bg-amber-50' : 'bg-rose-50'}`}>
                    <Activity className={`w-3.5 h-3.5 ${healthScore >= 90 ? 'text-emerald-500' : healthScore >= 70 ? 'text-amber-500' : 'text-rose-500'}`} />
                  </div>
                </div>
                <p className={`text-4xl font-black leading-none ${healthScore >= 90 ? 'text-emerald-600' : healthScore >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {healthScore}<span className="text-2xl font-bold">%</span>
                </p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5">
                  <div className={`h-1.5 rounded-full transition-all ${healthScore >= 90 ? 'bg-emerald-500' : healthScore >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${healthScore}%` }} />
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Atendimento OK</p>
              </div>
            </div>

          </div>

          {/* Action Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text"
                placeholder="Pesquisar produto por nome ou ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <label className="flex items-center gap-2 cursor-pointer">
                <div className="relative">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={showOnlyRupture}
                    onChange={(e) => setShowOnlyRupture(e.target.checked)}
                  />
                  <div className={`block w-10 h-6 rounded-full transition-colors ${showOnlyRupture ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                  <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${showOnlyRupture ? 'translate-x-4' : ''}`}></div>
                </div>
                <span className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  <Filter className="w-4 h-4" />
                  Mostrar apenas Ruptura Predita
                </span>
              </label>

              <div className="h-5 w-px bg-slate-200" />

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={windowHours > 0}
                    onChange={e => setWindowHours(e.target.checked ? 48 : 0)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <span className="text-sm font-medium text-slate-700">Janela temporal</span>
                </label>
                {windowHours > 0 && (
                  <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                    {([48, 72, 96] as const).map(h => (
                      <button
                        key={h}
                        onClick={() => setWindowHours(h)}
                        className={`px-3 py-1 text-xs font-bold transition-colors ${windowHours === h ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {windowHours > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
              <span className="text-xl">🗓️</span>
              <div>
                <span className="font-bold text-amber-800">Projeção {windowHours}h ({windowHours / 24} dias) ativa</span>
                <span className="text-amber-700 ml-2">
                  Pedido = demanda diária × {windowHours / 24} dias — Saldo recalculado para esta janela
                </span>
              </div>
            </div>
          )}

          {/* ── Painel de Configuração ── */}
          <AnimatePresence>
            {showConfigPanel && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-white" />
                      <h3 className="text-white font-bold text-sm">Parâmetros de Ressuprimento</h3>
                    </div>
                    <button onClick={() => { setSupplyConfig(DEFAULT_SUPPLY_CONFIG); setScorePesos(DEFAULT_SCORE_PESOS); }}
                      className="text-white/80 hover:text-white text-xs font-medium underline">
                      Restaurar Padrão
                    </button>
                  </div>
                  <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {(Object.keys(SUPPLY_CONFIG_LABELS) as (keyof SupplyConfig)[]).map(key => {
                      const cfg = SUPPLY_CONFIG_LABELS[key];
                      return (
                        <div key={key} className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-600 flex items-center gap-1">
                            {cfg.label}
                            <span className="text-slate-400 font-normal">({cfg.sufixo})</span>
                          </label>
                          <input
                            type="number"
                            min={cfg.min} max={cfg.max} step={cfg.step}
                            value={supplyConfig[key]}
                            onChange={e => setSupplyConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) || cfg.min }))}
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm font-medium focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                          />
                          <p className="text-[10px] text-slate-400 leading-tight">{cfg.descricao}</p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-5 pb-4">
                    <div className="border-t border-slate-100 pt-3">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Pesos do Score de Prioridade</h4>
                      <div className="grid grid-cols-4 gap-3">
                        {(['risco', 'cobertura', 'custo', 'tendencia'] as (keyof ScorePesos)[]).map(k => (
                          <div key={k} className="space-y-1">
                            <label className="text-xs font-semibold text-slate-600 capitalize">{k}</label>
                            <input
                              type="range" min="0" max="1" step="0.05"
                              value={scorePesos[k]}
                              onChange={e => setScorePesos(prev => ({ ...prev, [k]: parseFloat(e.target.value) }))}
                              className="w-full h-1.5 accent-amber-500"
                            />
                            <span className="text-[10px] text-slate-500 font-mono">{(scorePesos[k] * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Simulador de Cenários ── */}
          <AnimatePresence>
            {showSimulador && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-white rounded-2xl border border-violet-200 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-white" />
                      <h3 className="text-white font-bold text-sm">Simulador de Cenários — "E se...?"</h3>
                    </div>
                    <button onClick={() => { setSimConsumoVar(0); setSimAtrasoFornecedor(0); setSimHorizonte(7); }}
                      className="text-white/80 hover:text-white text-xs font-medium underline">
                      Resetar
                    </button>
                  </div>
                  <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                        <span>Variação de Consumo</span>
                        <span className={`font-mono text-sm ${simConsumoVar > 0 ? 'text-rose-600' : simConsumoVar < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                          {simConsumoVar > 0 ? '+' : ''}{simConsumoVar}%
                        </span>
                      </label>
                      <input type="range" min="-50" max="100" step="5" value={simConsumoVar}
                        onChange={e => setSimConsumoVar(parseInt(e.target.value))}
                        className="w-full h-2 accent-violet-500" />
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>-50%</span><span>0</span><span>+100%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                        <span>Atraso Fornecedor</span>
                        <span className="font-mono text-sm text-slate-700">+{simAtrasoFornecedor} dias</span>
                      </label>
                      <input type="range" min="0" max="30" step="1" value={simAtrasoFornecedor}
                        onChange={e => setSimAtrasoFornecedor(parseInt(e.target.value))}
                        className="w-full h-2 accent-violet-500" />
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>0</span><span>15</span><span>30 dias</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-600 flex items-center justify-between">
                        <span>Horizonte de Análise</span>
                        <span className="font-mono text-sm text-slate-700">{simHorizonte} dias</span>
                      </label>
                      <input type="range" min="7" max="90" step="1" value={simHorizonte}
                        onChange={e => setSimHorizonte(parseInt(e.target.value))}
                        className="w-full h-2 accent-violet-500" />
                      <div className="flex justify-between text-[10px] text-slate-400">
                        <span>7</span><span>30</span><span>90 dias</span>
                      </div>
                    </div>
                  </div>
                  {/* Resumo do Simulador */}
                  {(simConsumoVar !== 0 || simAtrasoFornecedor > 0) && (
                    <div className="px-5 pb-4">
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                        {(() => {
                          const rupturasSim = enrichedData.filter(d => d._saldoSimulado < 0).length;
                          const rupturasAtual = enrichedData.filter(d => d.Saldo_Projetado < 0).length;
                          const delta = rupturasSim - rupturasAtual;
                          const cobMediaSim = enrichedData.length > 0
                            ? Math.round(enrichedData.reduce((acc, d) => acc + Math.min(d._coberturaSimulada, 999), 0) / enrichedData.length)
                            : 0;
                          const cobMediaAtual = enrichedData.length > 0
                            ? Math.round(enrichedData.reduce((acc, d) => acc + Math.min(d._coberturaDias, 999), 0) / enrichedData.length)
                            : 0;
                          return (
                            <>
                              <div className="text-center">
                                <p className="text-2xl font-black text-violet-700">{rupturasSim}</p>
                                <p className="text-[10px] font-bold text-violet-500 uppercase">Rupturas Simuladas</p>
                              </div>
                              <div className="text-center">
                                <p className={`text-2xl font-black ${delta > 0 ? 'text-rose-600' : delta < 0 ? 'text-emerald-600' : 'text-slate-500'}`}>
                                  {delta > 0 ? '+' : ''}{delta}
                                </p>
                                <p className="text-[10px] font-bold text-violet-500 uppercase">Delta vs Atual</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-black text-violet-700">{cobMediaSim}<span className="text-lg">d</span></p>
                                <p className="text-[10px] font-bold text-violet-500 uppercase">Cobertura Média Sim.</p>
                              </div>
                              <div className="text-center">
                                <p className="text-2xl font-black text-slate-500">{cobMediaAtual}<span className="text-lg">d</span></p>
                                <p className="text-[10px] font-bold text-violet-500 uppercase">Cobertura Média Atual</p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden pointer-events-auto">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="p-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedItems.size === sortedFilteredData.length && sortedFilteredData.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-500 text-indigo-400 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </th>
                    <th className="p-4 w-10"></th>
                    <th className="p-4 cursor-pointer select-none" onClick={() => requestSort('Produto_Nome')}>
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        Produto <SortIcon col="Produto_Nome" />
                      </div>
                    </th>
                    <th className="p-4 cursor-pointer select-none text-right" onClick={() => requestSort('Estoque_Atual')}>
                      <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        Estoque <SortIcon col="Estoque_Atual" />
                      </div>
                    </th>
                    <th className="p-4 cursor-pointer select-none text-right" onClick={() => requestSort('Total_Solicitado')}>
                      <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        Pedido <SortIcon col="Total_Solicitado" />
                      </div>
                    </th>
                    <th className="p-4 cursor-pointer select-none text-right" onClick={() => requestSort('Saldo_Projetado')}>
                      <div className="flex items-center justify-end gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        Projeção <SortIcon col="Saldo_Projetado" />
                      </div>
                    </th>
                    <th className="p-4 cursor-pointer select-none text-center" onClick={() => requestSort('Status')}>
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-300 uppercase tracking-widest">
                        Status <SortIcon col="Status" />
                      </div>
                    </th>
                    <th className="p-4 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">Score</th>
                    <th className="p-4 text-center text-xs font-bold text-slate-300 uppercase tracking-widest">XYZ</th>
                    <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-widest">Ação / Sugestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedFilteredData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-12 text-center text-slate-500 bg-slate-50/50">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <Package className="w-12 h-12 text-slate-300" />
                          <p className="text-sm font-medium">Nenhum produto atende aos filtros atuais.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    sortedFilteredData.map((item) => {
                      const isRupture = item.Status === 'Ruptura Predita';
                      const isExpanded = expandedRows.has(item.Produto_ID);
                      return (
                        <React.Fragment key={item.Produto_ID}>
                          <tr
                            onClick={() => toggleRow(item.Produto_ID)}
                            style={{ borderLeft: `3px solid ${isRupture ? '#f43f5e' : item.Status === 'Falta, mas com Substituto' ? '#f59e0b' : '#e2e8f0'}` }}
                            className={`transition-colors cursor-pointer ${
                              isRupture ? 'bg-rose-50/70 hover:bg-rose-100/60' :
                              item.Status === 'Falta, mas com Substituto' ? 'bg-amber-50/50 hover:bg-amber-100/50' :
                              'hover:bg-slate-50/80'
                            }`}
                          >
                            <td className="p-4 w-10" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center">
                                <input 
                                  type="checkbox" 
                                  checked={selectedItems.has(item.Produto_ID)}
                                  onChange={() => toggleSelectItem(item.Produto_ID)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                                />
                              </div>
                            </td>
                            <td className="p-4 w-10">
                              <div className={`p-1.5 rounded-md transition-colors ${isExpanded ? 'bg-slate-200/50' : 'bg-transparent group-hover:bg-slate-100'}`}>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                              </div>
                            </td>
                            <td className="p-4">
                              <div className="flex flex-col gap-1">
                                <span className={`font-bold ${isRupture ? 'text-rose-900' : item.Status === 'Falta, mas com Substituto' ? 'text-amber-900' : 'text-slate-800'}`}>
                                  {item.Produto_Nome}
                                </span>
                                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md w-fit">
                                  ID: {item.Produto_ID}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 text-right font-medium text-slate-600">
                              <span className="bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{item.Estoque_Atual.toLocaleString('pt-BR')}</span>
                            </td>
                            <td className="p-4 text-right font-medium text-slate-600">
                              <span className="bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{item.Total_Solicitado.toLocaleString('pt-BR')}</span>
                            </td>
                            <td className="p-4 text-right">
                              <span className={`px-2 py-1 rounded-lg font-bold border ${isRupture ? 'bg-rose-100 text-rose-700 border-rose-200' : item.Status === 'Falta, mas com Substituto' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}`}>
                                {item.Saldo_Projetado.toLocaleString('pt-BR')}
                              </span>
                            </td>
                            <td className="p-4 text-center">
                              {isRupture ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-sm shadow-rose-200">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  Ruptura Predita
                                </span>
                              ) : item.Status === 'Falta, mas com Substituto' ? (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-sm shadow-amber-200">
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  Substituto
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 text-emerald-700 border border-emerald-200">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  Suficiente
                                </span>
                              )}
                            </td>
                            <td className="p-4 text-center">
                              {(() => {
                                const sc = item._score;
                                const colors = SCORE_COLORS[sc.classificacao];
                                return (
                                  <div className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border ${colors.bg} ${colors.border} ${colors.text}`}>
                                    <span className="text-lg font-black leading-none">{sc.score}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-wider">{SCORE_LABELS[sc.classificacao]}</span>
                                  </div>
                                );
                              })()}
                            </td>
                            <td className="p-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black border ${
                                  item._classeXYZ === 'X' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  item._classeXYZ === 'Y' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  'bg-rose-50 text-rose-700 border-rose-200'
                                }`}>
                                  {item._classeXYZ}
                                </span>
                                <span className="text-[9px] text-slate-400 font-medium flex items-center gap-0.5">
                                  {item._tendencia === 'CRESCENTE' && <TrendingUp className="w-3 h-3 text-rose-500" />}
                                  {item._tendencia === 'DECRESCENTE' && <TrendingDown className="w-3 h-3 text-emerald-500" />}
                                  {item._tendencia === 'ESTAVEL' && <span className="text-slate-400">—</span>}
                                  {item._tendencia === 'CRESCENTE' ? '↑' : item._tendencia === 'DECRESCENTE' ? '↓' : ''}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              {item.Sugestao_Substituicao ? (
                                <div className="flex flex-col gap-1 p-2 bg-amber-50 rounded-lg border border-amber-100/50">
                                  <span className="text-xs font-bold text-amber-900 line-clamp-1" title={item.Sugestao_Substituicao.nome}>{item.Sugestao_Substituicao.nome}</span>
                                  <div className="flex items-center gap-1 text-[10px] font-medium text-amber-700">
                                    <Database className="w-3 h-3" /> Saldo: {item.Sugestao_Substituicao.saldo.toLocaleString('pt-BR')}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-slate-300 px-2">-</span>
                              )}
                            </td>
                          </tr>
                          
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.tr 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-slate-50 border-t border-slate-200 overflow-hidden shadow-inner"
                              >
                                <td colSpan={10} className="p-0">
                                  <div className="p-6 md:pl-24 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-slate-50 via-slate-100/50 to-slate-100">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                      {/* Score & Forecasting */}
                                      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                        <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50 border-b border-slate-200 flex items-center gap-2">
                                          <Gauge className="w-4 h-4 text-indigo-500" />
                                          <h4 className="text-sm font-bold text-slate-700">Inteligência de Supply</h4>
                                        </div>
                                        <div className="p-4 grid grid-cols-2 md:grid-cols-6 gap-3">
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Score</p>
                                            <p className={`text-2xl font-black ${SCORE_COLORS[item._score.classificacao].text}`}>{item._score.score}</p>
                                            <p className="text-[10px] text-slate-400">{SCORE_LABELS[item._score.classificacao]}</p>
                                          </div>
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Classe XYZ</p>
                                            <p className="text-2xl font-black text-slate-700">{item._classeXYZ}</p>
                                            <p className="text-[10px] text-slate-400">CV: {item._cv.toFixed(2)}</p>
                                          </div>
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Média Ponderada</p>
                                            <p className="text-2xl font-black text-slate-700">{item._mediaPonderada.toFixed(1)}</p>
                                            <p className="text-[10px] text-slate-400">un/dia</p>
                                          </div>
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Cobertura</p>
                                            <p className={`text-2xl font-black ${item._coberturaDias <= supplyConfig.coberturaCritica ? 'text-rose-600' : item._coberturaDias <= supplyConfig.coberturaAlerta ? 'text-amber-600' : 'text-emerald-600'}`}>
                                              {Math.min(item._coberturaDias, 999).toFixed(0)}
                                            </p>
                                            <p className="text-[10px] text-slate-400">dias</p>
                                          </div>
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Estoque Segurança</p>
                                            <p className="text-2xl font-black text-indigo-600">{item._ssSeguranca}</p>
                                            <p className="text-[10px] text-slate-400">unidades</p>
                                          </div>
                                          <div className="text-center p-2 bg-slate-50 rounded-lg">
                                            <p className="text-xs font-bold text-slate-500">Tendência</p>
                                            <p className="text-lg font-black text-slate-700 flex items-center justify-center gap-1">
                                              {item._tendencia === 'CRESCENTE' && <TrendingUp className="w-5 h-5 text-rose-500" />}
                                              {item._tendencia === 'DECRESCENTE' && <TrendingDown className="w-5 h-5 text-emerald-500" />}
                                              {item._tendencia === 'ESTAVEL' && <span className="text-slate-400">—</span>}
                                              <span className="text-sm">{item._tendencia}</span>
                                            </p>
                                            <p className="text-[10px] text-slate-400">consumo</p>
                                          </div>
                                        </div>
                                        {/* Score breakdown bar */}
                                        <div className="px-4 pb-4">
                                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                                            <span>Composição do Score:</span>
                                            <div className="flex-1 h-3 rounded-full overflow-hidden flex bg-slate-100">
                                              <div className="bg-rose-400 h-full" style={{ width: `${item._score.componentes.risco * scorePesos.risco / 100}%` }} title={`Risco: ${item._score.componentes.risco}`} />
                                              <div className="bg-amber-400 h-full" style={{ width: `${item._score.componentes.cobertura * scorePesos.cobertura / 100}%` }} title={`Cobertura: ${item._score.componentes.cobertura}`} />
                                              <div className="bg-indigo-400 h-full" style={{ width: `${item._score.componentes.custo * scorePesos.custo / 100}%` }} title={`Custo: ${item._score.componentes.custo}`} />
                                              <div className="bg-violet-400 h-full" style={{ width: `${item._score.componentes.tendencia * scorePesos.tendencia / 100}%` }} title={`Tendência: ${item._score.componentes.tendencia}`} />
                                            </div>
                                            <span className="flex items-center gap-2">
                                              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-rose-400"></span>Risco</span>
                                              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-amber-400"></span>Cobertura</span>
                                              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-indigo-400"></span>Custo</span>
                                              <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded bg-violet-400"></span>Tendência</span>
                                            </span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Tabela Demandas */}
                                      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                                          <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <FileText className="w-4 h-4 text-indigo-500" />
                                            Solicitações Detalhadas
                                          </h4>
                                          <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded text-xs font-bold leading-none">{item.Solicitacoes.length}</span>
                                        </div>
                                        <div className="overflow-auto max-h-[300px]">
                                          <table className="w-full text-left text-sm">
                                            <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-100">
                                              <tr>
                                                <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Demanda</th>
                                                <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Data/Hora</th>
                                                <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider text-right">Qtd</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                              {item.Solicitacoes.map((sol, idx) => (
                                                <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                                  <td className="px-4 py-2 font-mono font-medium text-slate-700">#{sol.id}</td>
                                                  <td className="px-4 py-2 text-slate-500 text-xs">{sol.data}</td>
                                                  <td className="px-4 py-2 text-right font-bold text-slate-600">{sol.qt.toLocaleString('pt-BR')}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                      {/* Tabela Lotes */}
                                      {item.Lotes && item.Lotes.length > 0 && (
                                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                                          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                                            <Package className="w-4 h-4 text-emerald-500" />
                                            <h4 className="text-sm font-bold text-slate-700">
                                              Lotes (Ordem de Validade)
                                            </h4>
                                          </div>
                                          <div className="overflow-auto max-h-[300px]">
                                            <table className="w-full text-left text-sm">
                                              <thead className="bg-slate-50/80 sticky top-0 backdrop-blur-sm z-10 border-b border-slate-100">
                                                <tr>
                                                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Código</th>
                                                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider">Validade</th>
                                                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider text-right">Qtd</th>
                                                  <th className="px-4 py-3 font-semibold text-slate-500 uppercase text-[10px] tracking-wider text-center">Instrução</th>
                                                </tr>
                                              </thead>
                                              <tbody className="divide-y divide-slate-50">
                                                {item.Lotes.map((lote, idx) => {
                                                  const daysToExpire = getDayDiff(lote.validade);
                                                  const isCriticalDate = daysToExpire <= 30;
                                                  const isWarningDate = daysToExpire > 30 && daysToExpire <= 60;
                                                  
                                                  return (
                                                    <tr key={idx} className={idx === 0 ? "bg-emerald-50/30 border-l-2 border-l-emerald-400" : "hover:bg-slate-50 transition-colors"}>
                                                      <td className="px-4 py-2 font-mono font-medium text-slate-700">{lote.lote}</td>
                                                      <td className="px-4 py-2">
                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                                                           <span className={`font-bold ${isCriticalDate ? 'text-rose-600' : isWarningDate ? 'text-amber-600' : 'text-slate-600'}`}>
                                                             {lote.validade}
                                                           </span>
                                                           {isCriticalDate && (
                                                              <span className="bg-rose-100 text-rose-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Vence &lt; 30d</span>
                                                           )}
                                                           {isWarningDate && (
                                                              <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider">Vence &lt; 60d</span>
                                                           )}
                                                        </div>
                                                      </td>
                                                      <td className="px-4 py-2 text-right font-bold text-slate-600">{lote.quantidade.toLocaleString('pt-BR')}</td>
                                                      <td className="px-4 py-2 text-center">
                                                        {idx === 0 && (
                                                          <span className={`inline-flex items-center justify-center gap-1 w-full px-2 py-1 rounded-md text-[10px] font-black tracking-wider uppercase border ${isCriticalDate ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Separar 1º
                                                          </span>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      )}

                                    </div>
                                  </div>
                                </td>
                              </motion.tr>
                          )}
                        </AnimatePresence>
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}

      {/* ── Modal: Análise IA ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAiModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => !isAnalyzing && setShowAiModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-violet-700 px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="bg-white/10 p-2 rounded-lg">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-base leading-tight">Análise IA — Rupturas Preditas</h3>
                    <p className="text-indigo-200 text-xs mt-0.5">{ruptureCount} produto(s) · FarmaIA × Claude</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAiModal(false)}
                  disabled={isAnalyzing}
                  className="text-white/70 hover:text-white transition-colors disabled:opacity-40"
                  aria-label="Fechar análise"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">
                {isAnalyzing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-indigo-600 mb-4">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span className="text-sm font-semibold">Gerando análise clínica...</span>
                    </div>
                    {[85, 65, 75, 55, 70, 60, 80].map((w, i) => (
                      <div key={i} className="h-3 bg-slate-100 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : aiResult ? (
                  aiResult.startsWith('Erro ao gerar') ? (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
                      <XCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">Falha na análise</p>
                        <p className="text-sm text-red-600 mt-1">{aiResult}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult}</p>
                  )
                ) : null}
              </div>

              {/* Footer */}
              {!isAnalyzing && aiResult && !aiResult.startsWith('Erro ao gerar') && (
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-400">Análise gerada por IA — valide com o farmacêutico responsável.</p>
                  <button
                    onClick={() => navigator.clipboard.writeText(aiResult!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Copiar
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
