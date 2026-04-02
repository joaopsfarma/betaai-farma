import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPDFHeader, drawPDFFooters, drawKPICards, PDF_COLORS } from '../utils/pdfExport';
import { AlertTriangle, CheckCircle, UploadCloud, Search, Filter, Package, AlertOctagon, FileText, XCircle, ChevronDown, ChevronUp, Download, RefreshCw, Database, Activity, Target, ShieldAlert, Zap, ArrowUpDown, ArrowUp, ArrowDown, TrendingDown } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import { motion, AnimatePresence } from 'motion/react';

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
  const [showOnlyRupture, setShowOnlyRupture] = useState(false);
  const [windowHours, setWindowHours] = useState<0 | 48 | 72 | 96>(0);
  // Removido rawData local em favor do rawSource vindo do App.tsx

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<{ key: keyof PredictabilityData; direction: 'asc' | 'desc' } | null>(null);

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

  // 3. Filtro por ruptura aplicado após recálculo (para refletir status da janela)
  const filteredData = useMemo(() => {
    if (!showOnlyRupture) return windowedData;
    return windowedData.filter(d => d.Status === 'Ruptura Predita');
  }, [windowedData, showOnlyRupture]);

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

  // Base ativa para KPIs: usa dados janelados (ou todos) sem o filtro de ruptura
  const activeData = windowedData;

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
        
        if (sol && sit && normalize(sit.toLowerCase()).includes('pend')) {
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
          const prodRaw = findValueNearIndex(row, itProdIdx, val => val.includes('-') && /^\d+\s*-/.test(val.trim()));
          const qtRaw = findValueNearIndex(row, itQtIdx, val => /^\d+([.,]\d+)?$/.test(val.replace(/"/g, '').trim()));

          if (prodRaw && qtRaw) {
            const parts = prodRaw.split('-');
            const id = parts[0].trim();
            const nome = parts.slice(1).join('-').trim() || prodRaw;
            
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
    const color = PDF_COLORS.indigo;
    const dataToExport = selectedItems.size > 0
      ? sortedFilteredData.filter(item => selectedItems.has(item.Produto_ID))
      : sortedFilteredData;

    const doc = new jsPDF('landscape' as any);

    const filterLabel = selectedItems.size > 0
      ? `Seleção manual: ${selectedItems.size} item(s)`
      : showOnlyRupture ? 'Filtro: somente Ruptura Predita' : 'Todos os produtos';

    let currentY = drawPDFHeader(doc, 'Relatório de Previsibilidade de Estoque', filterLabel, color);

    currentY = drawKPICards(doc, [
      { label: 'Total de Produtos', value: uniqueProductsCount.toString(), color: PDF_COLORS.indigo },
      { label: 'Ruptura Predita', value: ruptureCount.toString(), color: PDF_COLORS.red },
      { label: 'Com Substituto', value: substituteCount.toString(), color: PDF_COLORS.amber },
      { label: 'Cobertura', value: `${coverageRate}%`, color: coverageRate >= 70 ? PDF_COLORS.emerald : coverageRate >= 40 ? PDF_COLORS.amber : PDF_COLORS.red },
      { label: 'Saúde do Atend.', value: `${healthScore}%`, color: healthScore >= 90 ? PDF_COLORS.emerald : healthScore >= 70 ? PDF_COLORS.amber : PDF_COLORS.red },
    ], currentY);

    // col indexes: 0=ID, 1=Produto, 2=Estoque, 3=Pedido, 4=Projeção, 5=Status,
    //              6=Sol. Pendentes, 7=Substituto/Saldo, 8=Lote Rec.
    const tableColumn = ['ID', 'Produto', 'Estoque', 'Pedido', 'Projeção', 'Status', 'Sol. Pendentes', 'Substituto / Saldo', 'Lote Rec.'];
    const tableRows = dataToExport.map(item => {
      const loteRec = item.Lotes?.length > 0
        ? `${item.Lotes[0].lote} (${item.Lotes[0].validade})`
        : '-';
      const solicitacoesPendentes = item.Solicitacoes?.length > 0
        ? item.Solicitacoes.map(s => `${s.id} — ${s.qt}un  ${s.data ? `(${s.data})` : ''}`).join('\n')
        : '-';
      return [
        item.Produto_ID,
        item.Produto_Nome,
        item.Estoque_Atual.toLocaleString('pt-BR'),
        item.Total_Solicitado.toLocaleString('pt-BR'),
        item.Saldo_Projetado.toLocaleString('pt-BR'),
        item.Status,
        solicitacoesPendentes,
        item.Sugestao_Substituicao
          ? `${item.Sugestao_Substituicao.nome}\nSaldo: ${item.Sugestao_Substituicao.saldo}`
          : '-',
        loteRec,
      ];
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: currentY + 2,
      theme: 'grid',
      margin: { left: 10, right: 10, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2.5, overflow: 'linebreak', valign: 'middle' },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 16, halign: 'center' },
        1: { cellWidth: 55, fontStyle: 'bold' },
        2: { cellWidth: 16, halign: 'right' },
        3: { cellWidth: 16, halign: 'right' },
        4: { cellWidth: 18, halign: 'right', fontStyle: 'bold' },
        5: { cellWidth: 36, fontStyle: 'bold', halign: 'center' },
        6: { cellWidth: 40 },
        7: { cellWidth: 'auto' },
        8: { cellWidth: 30 },
      },
      didParseCell(data) {
        if (data.section === 'body') {
          // Row-level background by status
          const rowStatus = (data.row.raw as string[])[5];
          if (rowStatus === 'Ruptura Predita') {
            data.cell.styles.fillColor = [255, 241, 242];
          } else if (rowStatus === 'Falta, mas com Substituto') {
            data.cell.styles.fillColor = [255, 251, 235];
          }
          // Status column
          if (data.column.index === 5) {
            if (data.cell.raw === 'Ruptura Predita') {
              data.cell.styles.textColor = [190, 18, 60];
              data.cell.styles.fontStyle = 'bold';
            } else if (data.cell.raw === 'Falta, mas com Substituto') {
              data.cell.styles.textColor = [180, 83, 9];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [4, 120, 87];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Projeção negativa
          if (data.column.index === 4) {
            const val = Number(String(data.cell.raw).replace(/\./g, '').replace(',', '.'));
            if (val < 0) {
              data.cell.styles.textColor = [220, 38, 38];
              data.cell.styles.fontStyle = 'bold';
            }
          }
          // Solicitações pendentes
          if (data.column.index === 6 && data.cell.raw !== '-') {
            data.cell.styles.textColor = [79, 70, 229];
            data.cell.styles.fontStyle = 'bold';
          }
          // Substituto
          if (data.column.index === 7 && data.cell.raw !== '-') {
            data.cell.styles.textColor = [180, 83, 9];
          }
        }
      },
    });

    drawPDFFooters(doc, color);
    doc.save('previsibilidade_estoque.pdf');
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
                    <th className="p-4 text-xs font-bold text-slate-300 uppercase tracking-widest">Ação / Sugestão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedFilteredData.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-500 bg-slate-50/50">
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
                                <td colSpan={8} className="p-0">
                                  <div className="p-6 md:pl-24 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-slate-50 via-slate-100/50 to-slate-100">
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                      
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
    </div>
  );
};
