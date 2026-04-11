import React, { useState, useMemo, useCallback } from 'react';
import {
  UploadCloud,
  AlertTriangle,
  PackageX,
  Clock,
  DollarSign,
  Search,
  Pill,
  Filter,
  FileSpreadsheet,
  TrendingDown,
  TrendingUp,
  BarChart2,
  Users,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Activity,
  Link,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Download,
  Warehouse,
  Layers,
  BadgeDollarSign
} from 'lucide-react';

// --- UTILITÁRIO: Capitaliza cada palavra e decodifica entidades HTML ---
const toTitleCase = (str: string) =>
  str.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// --- UTILITÁRIO: Parser genérico de CSV com suporte a delimitador configurável ---
const parseCsvWithDelimiter = (csvText: string, delimiter: string) => {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(delimiter).map((h: string) => h.replace(/(^"|"$)/g, '').trim());
  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    let obj: Record<string, string> = {};
    let inQuotes = false;
    let value = '';
    let headerIndex = 0;
    for (let char of lines[i]) {
      if (char === '"') { inQuotes = !inQuotes; }
      else if (char === delimiter && !inQuotes) {
        if (headers[headerIndex]) obj[headers[headerIndex]] = value.trim();
        value = ''; headerIndex++;
      } else { value += char; }
    }
    if (headers[headerIndex]) obj[headers[headerIndex]] = value.trim();
    result.push(obj);
  }
  return result;
};

// --- Converte número no formato brasileiro ("1.234,56") para float ---
const parseBrNumber = (s: string) => parseFloat((s || '0').replace(/\./g, '').replace(',', '.')) || 0;

// --- Parser da Posição de Estoque (formato hierárquico com Sub-Classe) ---
const parsePosicaoEstoque = (csvText: string) => {
  const lines = csvText.split('\n');
  const result: Record<string, string>[] = [];
  let especie = '', classe = '', subClasse = '';

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;

    // Faz parsing respeitando aspas com delimitador vírgula
    const cols: string[] = [];
    let inQ = false, val = '';
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(val.trim()); val = ''; }
      else { val += ch; }
    }
    cols.push(val.trim());

    // Captura metadados da hierarquia
    if (cols[0]?.startsWith('Esp')) { especie = cols[2]?.replace(/^\d+\s+/, '').trim() || ''; continue; }
    if (cols[0]?.startsWith('Classe')) { classe = cols[2]?.replace(/^\d+\s+/, '').trim() || ''; continue; }
    if (cols[0]?.startsWith('Sub-Classe')) { subClasse = cols[2]?.replace(/^\d+\s+/, '').trim() || ''; continue; }

    // Pula linhas de cabeçalho/rodapé
    if (!cols[2] || cols[3] === 'Estoq' || cols[1] === 'Produto' || cols[1] === '') continue;

    // Extrai código e descrição do campo combinado: "  285   AMBISOME 50MG ..."
    const raw = cols[2].trim();
    const match = raw.match(/^(\d+)\s+(.+)$/);
    if (!match) continue;
    const [, cod, desc] = match;

    result.push({
      'Cód Item': cod.trim(),
      'Desc Item': desc.trim(),
      'Localização': cols[3]?.trim() || '',
      'Unidade': cols[4]?.trim() || '',
      'Est Mínimo': cols[5] || '0',
      'Est Máximo': cols[6] || '0',
      'P Pedido': cols[7] || '0',
      'Estoque Atual': cols[8] || '0',
      'Custo Médio': cols[9] || '0',
      'Vl Total': cols[10] || '0',
      'Espécie': especie,
      'Classe': classe,
      'Sub-Classe': subClasse,
    });
  }
  return result;
};

// --- UTILITÁRIO: Parser de CSV nativo para o formato (;) com aspas ---
const parseCSV = (csvText: string) => {
  const lines = csvText.split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(';').map((h: string) => h.replace(/(^"|"$)/g, '').trim());
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    let obj: Record<string, string> = {};
    let currentLine = lines[i];
    let inQuotes = false;
    let value = '';
    let headerIndex = 0;

    for (let char of currentLine) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ';' && !inQuotes) {
        if (headers[headerIndex]) {
          obj[headers[headerIndex]] = value.trim();
        }
        value = '';
        headerIndex++;
      } else {
        value += char;
      }
    }
    if (headers[headerIndex]) {
      obj[headers[headerIndex]] = value.trim();
    }
    result.push(obj);
  }
  return result;
};

export default function AbastecimentoFarmaceutico() {
  const [data, setData] = useState<Record<string, string>[] | null>(null);
  const [nfData, setNfData] = useState<Record<string, string>[] | null>(null);
  const [lcData, setLcData] = useState<Record<string, string>[] | null>(null);
  const [stockData, setStockData] = useState<Record<string, string>[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('Todos');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [colFilters, setColFilters] = useState({
    medicamento: '',
    fornecedor: '',
    oc: '',
    nf: ''
  });

  const [sortConfig, setSortConfig] = useState({ key: 'Dias Atraso', direction: 'desc' });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsedData = parseCSV(text);
        setData(parsedData);
        setCurrentPage(1);
      };
      reader.readAsText(file, 'ISO-8859-1');
    }
  };

  const handleNfUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsedData = parseCSV(text);
        setNfData(parsedData);
      };
      reader.readAsText(file, 'ISO-8859-1');
    }
  };

  const handleLcUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        // Detecta delimitador: se a primeira linha contém vírgulas fora de aspas, usa vírgula
        const firstLine = text.split('\n')[0] || '';
        const delimiter = firstLine.includes(';') ? ';' : ',';
        const parsedData = parseCsvWithDelimiter(text, delimiter);
        setLcData(parsedData);
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const handleStockUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const parsed = parsePosicaoEstoque(text);
        setStockData(parsed);
      };
      reader.readAsText(file, 'ISO-8859-1');
    }
  };

  const handleClearData = () => {
    setData(null);
    setNfData(null);
    setLcData(null);
    setStockData(null);
    setSearchTerm('');
    setActiveFilter('Todos');
    setColFilters({ medicamento: '', fornecedor: '', oc: '', nf: '' });
    setSortConfig({ key: 'Dias Atraso', direction: 'desc' });
  };

  const { kpis, filteredData, fornecedores, fornecedorStats } = useMemo(() => {
    if (!data) return { kpis: {} as Record<string, number>, filteredData: [] as Record<string, any>[], fornecedores: [] as any[], fornecedorStats: {} as Record<string, number> };

    let emFalta = 0;
    let atrasados = 0;
    let altoCusto = 0;
    let coberturaCritica = 0;
    let comDependencia = 0;

    data.forEach(item => {
      const isFalta = item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim' || item['Status'] === 'Em Falta';
      if (isFalta) emFalta++;

      const diasAtraso = parseInt(item['Dias Atraso']) || 0;
      if (diasAtraso > 0 || item['Atrasado'] === 'Sim') atrasados++;

      if (item['Item de Alto Custo (R$)'] === 'Sim') altoCusto++;

      let cobertura = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
      if (cobertura < 7 && cobertura >= 0 && !isFalta) coberturaCritica++;

      if (item['Dependência'] && item['Dependência'] !== 'Sem dependência') comDependencia++;
    });

    // KPIs farmacêuticos adicionais
    let coverageSum = 0, coverageCount = 0, conformes = 0;
    data.forEach(item => {
      const isFalta = item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim' || item['Status'] === 'Em Falta';
      const diasAtraso = parseInt(item['Dias Atraso']) || 0;
      const isAtrasado = diasAtraso > 0 || item['Atrasado'] === 'Sim';
      const cobertura = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
      if (!isFalta && cobertura < 999) { coverageSum += cobertura; coverageCount++; }
      if (!isFalta && cobertura >= 7 && !isAtrasado) conformes++;
    });
    const coberturaMedia = coverageCount > 0 ? Math.round(coverageSum / coverageCount) : 0;
    const taxaRuptura = data.length > 0 ? parseFloat(((emFalta / data.length) * 100).toFixed(1)) : 0;
    const taxaConformidade = data.length > 0 ? parseFloat(((conformes / data.length) * 100).toFixed(1)) : 0;

    const kpis = {
      total: data.length, emFalta, atrasados, altoCusto, coberturaCritica, comDependencia,
      coberturaMedia, taxaRuptura, taxaConformidade
    };

    // ── Avaliação de Fornecedores (RDC 204/2017 — qualificação de fornecedores) ──
    const fornecedorMap = new Map<string, { total: number; atrasados: number; emFalta: number; diasAtrasoSum: number; coberturaSum: number; coberturaCount: number }>();
    data.forEach(item => {
      const nome = (item['Fornec'] || 'Não informado').trim();
      if (!fornecedorMap.has(nome)) {
        fornecedorMap.set(nome, { total: 0, atrasados: 0, emFalta: 0, diasAtrasoSum: 0, coberturaSum: 0, coberturaCount: 0 });
      }
      const f = fornecedorMap.get(nome)!;
      f.total++;
      const isFaltaF = item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim' || item['Status'] === 'Em Falta';
      if (isFaltaF) f.emFalta++;
      const diasAtrasoF = parseInt(item['Dias Atraso']) || 0;
      if (diasAtrasoF > 0 || item['Atrasado'] === 'Sim') { f.atrasados++; f.diasAtrasoSum += diasAtrasoF; }
      const cobF = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
      if (!isFaltaF && cobF < 999) { f.coberturaSum += cobF; f.coberturaCount++; }
    });

    const fornecedores = Array.from(fornecedorMap.entries()).map(([nome, s]) => ({
      nome,
      total: s.total,
      atrasados: s.atrasados,
      emFalta: s.emFalta,
      diasAtrasoMedio: s.atrasados > 0 ? Math.round(s.diasAtrasoSum / s.atrasados) : 0,
      coberturaMedia: s.coberturaCount > 0 ? Math.round(s.coberturaSum / s.coberturaCount) : 0,
      pontualidade: s.total > 0 ? parseFloat((((s.total - s.atrasados) / s.total) * 100).toFixed(1)) : 100,
    })).sort((a, b) => (b.emFalta * 3 + b.atrasados) - (a.emFalta * 3 + a.atrasados));

    const fornecedorStats = {
      totalFornecedores: fornecedorMap.size,
      fornecedoresComAtraso: fornecedores.filter(f => f.atrasados > 0).length,
      fornecedoresComRuptura: fornecedores.filter(f => f.emFalta > 0).length,
      pontualidadeMedia: fornecedores.length > 0
        ? parseFloat((fornecedores.reduce((s, f) => s + f.pontualidade, 0) / fornecedores.length).toFixed(1))
        : 100,
    };

    const nfMap = new Map<string, Record<string, string>>();
    if (nfData) {
      nfData.forEach(nf => {
        if (nf['NF - Núm']) {
          nfMap.set(nf['NF - Núm'].toString().trim(), nf);
        }
      });
    }

    let result: Record<string, any>[] = data.map(item => {
      const numNf = item['NF - Núm'] ? item['NF - Núm'].toString().trim() : null;
      if (numNf && nfMap.has(numNf)) {
        return { ...item, nfDetails: nfMap.get(numNf) };
      }
      return item;
    });

    if (activeFilter === 'Em Falta') {
      result = result.filter(item => item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim' || item['Status'] === 'Em Falta');
    } else if (activeFilter === 'Atrasados') {
      result = result.filter(item => (parseInt(item['Dias Atraso']) || 0) > 0 || item['Atrasado'] === 'Sim');
    } else if (activeFilter === 'Alto Custo') {
      result = result.filter(item => item['Item de Alto Custo (R$)'] === 'Sim');
    } else if (activeFilter === 'Risco Crítico') {
      result = result.filter(item => {
        let cob = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
        return cob < 7 && cob >= 0;
      });
    } else if (activeFilter === 'Com Dependência') {
      result = result.filter(item => item['Dependência'] && item['Dependência'] !== 'Sem dependência');
    }

    if (searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      result = result.filter(item =>
        (item['Desc Item'] && item['Desc Item'].toLowerCase().includes(lowerTerm)) ||
        (item['Cod Item'] && item['Cod Item'].toLowerCase().includes(lowerTerm)) ||
        (item['Fornec'] && item['Fornec'].toLowerCase().includes(lowerTerm))
      );
    }

    if (colFilters.medicamento) {
      const term = colFilters.medicamento.toLowerCase();
      result = result.filter(item =>
        (item['Desc Item'] && item['Desc Item'].toLowerCase().includes(term)) ||
        (item['Cod Item'] && item['Cod Item'].toLowerCase().includes(term))
      );
    }
    if (colFilters.fornecedor) {
      const term = colFilters.fornecedor.toLowerCase();
      result = result.filter(item =>
        item['Fornec'] && item['Fornec'].toLowerCase().includes(term)
      );
    }
    if (colFilters.oc) {
      const term = colFilters.oc.toLowerCase();
      result = result.filter(item =>
        item['OC - Núm'] && item['OC - Núm'].toLowerCase().includes(term)
      );
    }
    if (colFilters.nf) {
      const term = colFilters.nf.toLowerCase();
      result = result.filter(item =>
        item['NF - Núm'] && item['NF - Núm'].toLowerCase().includes(term)
      );
    }

    return { kpis, filteredData: result, fornecedores, fornecedorStats };
  }, [data, nfData, searchTerm, activeFilter, colFilters]);

  // ── Lista Crítica do Planejamento ──
  const lcStats = useMemo(() => {
    if (!lcData || lcData.length === 0) return null;

    let cobZero = 0, scEmergencial = 0, ocReposicao = 0, monitorar = 0;
    const causaCount: Record<string, number> = {};
    const setorCount: Record<string, number> = {};

    lcData.forEach(item => {
      const cob = parseInt(item['Cob Disp'] || item['Cob Disp'] || '0') || 0;
      if (cob === 0) cobZero++;

      const acao = (item['Ação'] || '').trim();
      if (acao.includes('SC EMERGENCIAL') || acao.includes('SC Emergencial')) scEmergencial++;
      else if (acao.includes('OC de reposição') || acao.includes('OC de Reposição')) ocReposicao++;
      else if (acao.includes('Monitorar')) monitorar++;

      const causa = (item['Causa'] || 'Outros').trim();
      causaCount[causa] = (causaCount[causa] || 0) + 1;

      const setor = (item['Setor responsavel'] || item['Setor responsável'] || 'N/A').trim();
      setorCount[setor] = (setorCount[setor] || 0) + 1;
    });

    // Ordena itens por urgência: cobZero primeiro, depois menor cobertura
    const sortedItems = [...lcData].sort((a, b) => {
      const ca = parseInt(a['Cob Disp'] || '0') || 0;
      const cb = parseInt(b['Cob Disp'] || '0') || 0;
      return ca - cb;
    });

    const dataLC = lcData[0]?.['Data LC']
      ? new Date(lcData[0]['Data LC']).toLocaleDateString('pt-BR')
      : null;

    return { total: lcData.length, cobZero, scEmergencial, ocReposicao, monitorar, causaCount, setorCount, sortedItems, dataLC };
  }, [lcData]);

  // ── Posição de Estoque ──
  const stockStats = useMemo(() => {
    if (!stockData || stockData.length === 0) return null;

    // Agrega por item (código) somando localizações
    const itemMap = new Map<string, {
      desc: string; classe: string; subClasse: string; unidade: string;
      estoqueTotal: number; valorTotal: number; custoMedio: number;
      estMin: number; estMax: number; pPedido: number;
      localizacoes: string[];
    }>();

    stockData.forEach(row => {
      const cod = row['Cód Item'];
      const est = parseBrNumber(row['Estoque Atual']);
      const vl  = parseBrNumber(row['Vl Total']);
      const cm  = parseBrNumber(row['Custo Médio']);
      const min = parseBrNumber(row['Est Mínimo']);
      const max = parseBrNumber(row['Est Máximo']);
      const pp  = parseBrNumber(row['P Pedido']);

      if (!itemMap.has(cod)) {
        itemMap.set(cod, {
          desc: row['Desc Item'], classe: row['Classe'], subClasse: row['Sub-Classe'],
          unidade: row['Unidade'], estoqueTotal: 0, valorTotal: 0,
          custoMedio: cm, estMin: min, estMax: max, pPedido: pp, localizacoes: [],
        });
      }
      const entry = itemMap.get(cod)!;
      entry.estoqueTotal += est;
      entry.valorTotal   += vl;
      if (!entry.localizacoes.includes(row['Localização'])) entry.localizacoes.push(row['Localização']);
    });

    const items = Array.from(itemMap.entries()).map(([cod, d]) => ({ cod, ...d }));
    const valorTotalGeral = items.reduce((s, i) => s + i.valorTotal, 0);

    // Curva ABC por valor
    const sorted = [...items].sort((a, b) => b.valorTotal - a.valorTotal);
    let cumSum = 0;
    sorted.forEach(item => {
      cumSum += item.valorTotal;
      const pct = valorTotalGeral > 0 ? (cumSum / valorTotalGeral) * 100 : 0;
      (item as any).curvaABC = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
    });

    const abcCount = { A: 0, B: 0, C: 0 };
    const abcValue = { A: 0, B: 0, C: 0 };
    sorted.forEach(i => {
      const c = (i as any).curvaABC as 'A' | 'B' | 'C';
      abcCount[c]++; abcValue[c] += i.valorTotal;
    });

    // Itens abaixo do mínimo, no ponto de pedido, zerados
    const zerados      = items.filter(i => i.estoqueTotal === 0).length;
    const abaixoMin    = items.filter(i => i.estMin > 0 && i.estoqueTotal < i.estMin).length;
    const noPontoPedido= items.filter(i => i.pPedido > 0 && i.estoqueTotal <= i.pPedido).length;
    const acimaMax     = items.filter(i => i.estMax > 0 && i.estoqueTotal > i.estMax).length;

    // Distribuição por Sub-Classe (valor)
    const subClasseMap: Record<string, { count: number; valor: number }> = {};
    items.forEach(i => {
      const k = i.subClasse || 'Outros';
      if (!subClasseMap[k]) subClasseMap[k] = { count: 0, valor: 0 };
      subClasseMap[k].count++;
      subClasseMap[k].valor += i.valorTotal;
    });

    return {
      totalItens: items.length, valorTotalGeral, zerados, abaixoMin, noPontoPedido, acimaMax,
      abcCount, abcValue, subClasseMap, sortedByValue: sorted,
    };
  }, [stockData]);

  const sortedData = useMemo(() => {
    let sortableItems = [...filteredData];
    if (sortConfig) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key];
        let bValue: any = b[sortConfig.key];

        if (sortConfig.key === 'Cobertura') {
          aValue = parseFloat((aValue || '999').toString().replace(',', '.')) || 999;
          bValue = parseFloat((bValue || '999').toString().replace(',', '.')) || 999;
        } else if (['Dias Atraso', 'Estoq Disp', 'Qtd Pend'].includes(sortConfig.key)) {
           aValue = parseInt(aValue) || 0;
           bValue = parseInt(bValue) || 0;
        } else if (sortConfig.key === 'Valor total (R$)') {
           aValue = parseFloat((aValue || '0').toString().replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
           bValue = parseFloat((bValue || '0').toString().replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
        } else {
           aValue = (aValue || '').toString().toLowerCase();
           bValue = (bValue || '').toString().toLowerCase();
        }

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredData, sortConfig]);

  // ── PDF Export ──
  const exportPDF = useCallback(() => {
    if (!sortedData.length) return;

    const date = new Date().toLocaleDateString('pt-BR');
    const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const kpisObj = kpis as Record<string, number>;

    const kpisArr = [
      { label: 'Total',              value: String(kpisObj.total ?? 0),            color: '#334155' },
      { label: 'Ruptura / Em Falta', value: String(kpisObj.emFalta ?? 0),          color: '#dc2626' },
      { label: 'Risco Crítico',      value: String(kpisObj.coberturaCritica ?? 0), color: '#ea580c' },
      { label: 'Atrasados',          value: String(kpisObj.atrasados ?? 0),        color: '#d97706' },
      { label: 'Alto Custo',         value: String(kpisObj.altoCusto ?? 0),        color: '#4f46e5' },
      { label: 'Taxa Ruptura',        value: `${kpisObj.taxaRuptura ?? 0}%`,        color: '#dc2626' },
      { label: 'Cob. Média',          value: `${kpisObj.coberturaMedia ?? 0}d`,     color: '#059669' },
      { label: 'Conformidade',        value: `${kpisObj.taxaConformidade ?? 0}%`,   color: '#059669' },
    ];

    const kpisHtml = kpisArr.map(k => `
      <div class="kpi-card">
        <div class="kpi-value" style="color:${k.color}">${k.value}</div>
        <div class="kpi-label">${k.label}</div>
      </div>`).join('');

    const rowsHtml = sortedData.map((item, i) => {
      const isFalta = item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim';
      const diasAtraso = parseInt(item['Dias Atraso']) || 0;
      const isAtrasado = diasAtraso > 0 || item['Atrasado'] === 'Sim';
      const cobertura = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
      const isCritico = cobertura < 7 && cobertura >= 0 && !isFalta;
      const isAltoCusto = item['Item de Alto Custo (R$)'] === 'Sim';

      const rowBg = isFalta ? '#fff1f2' : isCritico ? '#fff7ed' : isAtrasado ? '#fffbeb' : i % 2 === 1 ? '#f8fafc' : '#ffffff';

      const cobText = isFalta
        ? '<span style="color:#dc2626;font-weight:700">Ruptura</span>'
        : isCritico
          ? `<span style="color:#ea580c;font-weight:700">${item['Cobertura']}d ⚠</span>`
          : `<span style="color:#16a34a">${item['Cobertura'] || '—'}d</span>`;

      const sinalizadores = [
        isAltoCusto ? '<span class="badge badge-indigo">ALTO CUSTO</span>' : '',
        item['Importado'] === 'Sim' ? '<span class="badge badge-blue">IMP</span>' : '',
        item['Dependência'] && item['Dependência'] !== 'Sem dependência'
          ? `<span class="badge badge-purple">${item['Dependência'].substring(0, 20)}</span>` : '',
      ].filter(Boolean).join(' ');

      return `
        <tr style="background:${rowBg}">
          <td class="td-num">${i + 1}</td>
          <td class="td-cod">${item['Cod Item'] || ''}</td>
          <td class="td-prod">${item['Desc Item'] || 'N/A'}<span class="td-curva">${item['Curva ABC'] ? ' · Curva ' + item['Curva ABC'] : ''}</span></td>
          <td class="td-fornec">${item['Fornec'] || '—'}</td>
          <td class="td-cob">${cobText}</td>
          <td class="td-est">Disp: <strong style="color:${isFalta || item['Estoq Disp'] === '0' ? '#dc2626' : '#1e293b'}">${item['Estoq Disp'] || '0'}</strong><br><small>Tot: ${item['Estoq Tot'] || '0'}</small></td>
          <td class="td-qtd">${item['Qtd Pend'] || '0'} <small>${item['Un'] || ''}</small></td>
          <td class="td-val">${item['Valor total (R$)'] || ''}<br><small style="color:#94a3b8">Unit: ${item['Vl. Unit. (R$)'] || ''}</small></td>
          <td class="td-oc">OC: ${item['OC - Núm'] || '—'}<br><small style="color:#64748b">${item['Nova Data Ent'] || item['OC - Entrega'] || ''}</small></td>
          <td class="td-nf">${item['NF - Núm'] || '—'}</td>
          <td class="td-atraso">${diasAtraso > 0 ? `<span style="color:#d97706;font-weight:700">${diasAtraso}d</span>` : '<span style="color:#94a3b8">—</span>'}</td>
          <td class="td-flags">${sinalizadores || '<span style="color:#94a3b8">—</span>'}</td>
        </tr>`;
    }).join('');

    const filterLabel = activeFilter !== 'Todos' ? ` · Filtro: ${activeFilter}` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 10mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1e293b; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: center; background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%); color: white; padding: 10px 14px; border-radius: 5px; margin-bottom: 10px; }
  .header h1 { font-size: 17px; font-weight: 700; letter-spacing: 0.3px; }
  .header .sub { font-size: 8.5px; opacity: 0.8; margin-top: 3px; }
  .header-right { text-align: right; font-size: 8.5px; opacity: 0.9; line-height: 1.8; }
  .header-right strong { font-size: 11px; }
  .kpis { display: flex; gap: 8px; margin-bottom: 10px; }
  .kpi-card { flex: 1; background: white; border: 1px solid #e2e8f0; border-radius: 5px; padding: 8px 10px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
  .kpi-value { font-size: 18px; font-weight: 800; line-height: 1; }
  .kpi-label { font-size: 7.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #d1d9e6; overflow: hidden; }
  thead tr { background: #1e3a8a; color: white; }
  th { padding: 6px 4px; font-size: 7.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; text-align: center; border-right: 1px solid rgba(255,255,255,0.12); overflow: hidden; }
  th:last-child { border-right: none; }
  td { padding: 4px 4px; border-bottom: 1px solid #e8edf4; border-right: 1px solid #f1f5f9; font-size: 8px; vertical-align: middle; overflow: hidden; word-break: break-word; line-height: 1.3; }
  td:last-child { border-right: none; }
  tbody tr:last-child td { border-bottom: none; }
  col.c-num { width: 2.5%; } col.c-cod { width: 5.5%; } col.c-prod { width: 20%; } col.c-for { width: 11%; }
  col.c-cob { width: 6%; } col.c-est { width: 7%; } col.c-qtd { width: 6%; } col.c-val { width: 8%; }
  col.c-oc { width: 9%; } col.c-nf { width: 6%; } col.c-atr { width: 5%; } col.c-flags { width: auto; }
  .td-num { text-align: center; color: #94a3b8; font-size: 7.5px; }
  .td-cod { font-family: monospace; font-size: 8px; color: #64748b; text-align: center; }
  .td-prod { font-weight: 600; color: #1e293b; }
  .td-curva { font-weight: 400; font-size: 7.5px; color: #64748b; }
  .td-fornec { color: #334155; }
  .td-cob { text-align: center; font-weight: 600; }
  .td-est { text-align: center; font-size: 7.5px; }
  .td-qtd { text-align: center; }
  .td-val { text-align: right; }
  .td-oc { text-align: center; font-size: 7.5px; }
  .td-nf { text-align: center; font-family: monospace; font-size: 7.5px; color: #475569; }
  .td-atraso { text-align: center; font-weight: 700; }
  .td-flags { text-align: center; }
  .badge { display: inline-block; border-radius: 3px; padding: 1px 5px; font-size: 7px; font-weight: 700; white-space: nowrap; }
  .badge-indigo { color: #4338ca; background: #eef2ff; border: 1px solid #c7d2fe; }
  .badge-blue { color: #1d4ed8; background: #eff6ff; border: 1px solid #bfdbfe; }
  .badge-purple { color: #7c3aed; background: #f5f3ff; border: 1px solid #ddd6fe; }
  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<div class="header">
  <div><h1>Visão de Abastecimento Farmacêutico</h1><div class="sub">${sortedData.length} itens exibidos${filterLabel} · ${date}</div></div>
  <div class="header-right"><div>Emitido em: <strong>${date}, ${time}</strong></div><div>FarmaIA &nbsp;|&nbsp; Logística Farmacêutica</div></div>
</div>
<div class="kpis">${kpisHtml}</div>
<table>
  <colgroup>
    <col class="c-num"><col class="c-cod"><col class="c-prod"><col class="c-for">
    <col class="c-cob"><col class="c-est"><col class="c-qtd"><col class="c-val">
    <col class="c-oc"><col class="c-nf"><col class="c-atr"><col class="c-flags">
  </colgroup>
  <thead>
    <tr>
      <th>#</th><th>Código</th><th style="text-align:left">Medicamento / Material</th>
      <th style="text-align:left">Fornecedor</th>
      <th>Cobertura</th><th>Estoque</th><th>Qtd Pend.</th>
      <th>Valor</th><th>OC / Entrega</th><th>NF</th><th>Atraso</th><th>Sinalizadores</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>
<div class="footer">
  <span>Total: ${sortedData.length} itens exibidos de ${kpisObj.total ?? 0} analisados</span>
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
  }, [sortedData, kpis, activeFilter]);

  const totalPages = Math.ceil(sortedData.length / itemsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSort = (key: string) => {
    let direction = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline-block" />;
    return sortConfig.direction === 'asc'
      ? <ArrowUp className="w-3 h-3 text-blue-600 ml-1 inline-block" />
      : <ArrowDown className="w-3 h-3 text-blue-600 ml-1 inline-block" />;
  };

  // KPI Card — linha 1 (críticos, com barra de progresso)
  const CriticalKpiCard = ({
    title, value, total, icon: Icon, colorClass, bgClass, borderClass, description
  }: {
    title: string; value: number; total: number; icon: React.ElementType;
    colorClass: string; bgClass: string; borderClass: string; description: string;
  }) => {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
      <div className={`bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col relative overflow-hidden border-t-4 ${borderClass}`}>
        <div className={`absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-10 -mr-4 -mt-4 ${bgClass}`} />
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-wider">{title}</p>
            <h3 className={`text-3xl font-bold mt-1 ${colorClass}`}>{value}</h3>
          </div>
          <div className={`p-3 rounded-lg ${bgClass}`}>
            <Icon className={`w-6 h-6 ${colorClass}`} />
          </div>
        </div>
        <div className="mb-2">
          <div className="flex justify-between text-[10px] text-slate-400 font-medium mb-1">
            <span>{value} de {total} itens</span>
            <span className={colorClass}>{pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${bgClass.replace('100', '500')}`}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-auto">{description}</p>
      </div>
    );
  };

  // KPI Card — linha 2 (métricas farmacêuticas)
  const MetricKpiCard = ({
    title, value, suffix, icon: Icon, colorClass, bgClass, target, targetLabel
  }: {
    title: string; value: number | string; suffix?: string;
    icon: React.ElementType; colorClass: string; bgClass: string;
    target?: string; targetLabel?: string;
  }) => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${bgClass} flex-shrink-0`}>
        <Icon className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 font-medium truncate">{title}</p>
        <p className={`text-xl font-bold ${colorClass}`}>
          {value}<span className="text-sm font-medium ml-0.5">{suffix}</span>
        </p>
        {target && (
          <p className="text-[10px] text-slate-400 mt-0.5">Meta: {target} · {targetLabel}</p>
        )}
      </div>
    </div>
  );

  // ── TELA DE UPLOAD ──
  if (!data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20 flex items-center justify-center p-4 font-sans">
        <div className="max-w-lg w-full">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-200 mb-4">
              <Activity className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Abastecimento Farmacêutico</h1>
            <p className="text-slate-500 mt-1 text-sm">Análise preditiva de risco e follow-up de suprimentos</p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4">
              <p className="text-white font-semibold text-sm">Importar Dados</p>
              <p className="text-blue-200 text-xs mt-0.5">Arquivo CSV (Follow Up) gerado pelo sistema ERP</p>
            </div>
            <div className="p-6">
              <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-blue-200 border-dashed rounded-xl cursor-pointer bg-blue-50/40 hover:bg-blue-50 hover:border-blue-400 transition-all group">
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center group-hover:from-blue-200 group-hover:to-indigo-200 transition-colors">
                    <UploadCloud className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-blue-700">Clique para selecionar o CSV</p>
                    <p className="text-xs text-slate-400 mt-1">Formato aceito: delimitado por ponto e vírgula (;)</p>
                  </div>
                </div>
                <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
              </label>

              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {['Ruptura e Risco', 'Cobertura de Estoque', 'Pedidos Atrasados', 'Alto Custo'].map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-slate-50 border border-slate-200 text-slate-500 text-[11px] font-medium rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* HEADER */}
      <header className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 px-6 py-5 sticky top-0 z-20 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white leading-none tracking-tight">
                Visão de Abastecimento Farmacêutico
              </h1>
              <span className="text-blue-200 text-xs mt-0.5 block">
                Gestão de Risco · Follow-up · {kpis.total} itens analisados
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {!nfData && data && (
              <label className="flex items-center gap-2 text-xs font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer transition-colors">
                <UploadCloud className="w-4 h-4" /> Anexar NFs
                <input type="file" className="hidden" accept=".csv" onChange={handleNfUpload} />
              </label>
            )}
            {nfData && (
              <div className="text-xs font-semibold text-emerald-200 bg-emerald-500/20 border border-emerald-400/30 px-3 py-2 rounded-lg flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> NFs Sincronizadas
              </div>
            )}
            {!lcData ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer transition-colors" title="Importar Lista Crítica do Planejamento">
                <UploadCloud className="w-4 h-4" /> Lista Crítica
                <input type="file" className="hidden" accept=".csv" onChange={handleLcUpload} />
              </label>
            ) : (
              <div className="text-xs font-semibold text-violet-200 bg-violet-500/20 border border-violet-400/30 px-3 py-2 rounded-lg flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4" /> LC Carregada ({lcStats?.total})
              </div>
            )}
            {!stockData ? (
              <label className="flex items-center gap-2 text-xs font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 px-3 py-2 rounded-lg cursor-pointer transition-colors" title="Importar Posição de Estoque">
                <UploadCloud className="w-4 h-4" /> Pos. Estoque
                <input type="file" className="hidden" accept=".csv,.txt" onChange={handleStockUpload} />
              </label>
            ) : (
              <div className="text-xs font-semibold text-teal-200 bg-teal-500/20 border border-teal-400/30 px-3 py-2 rounded-lg flex items-center gap-2">
                <Warehouse className="w-4 h-4" /> Estoque ({stockStats?.totalItens} itens)
              </div>
            )}
            <button
              onClick={exportPDF}
              className="flex items-center gap-2 text-xs font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 px-3 py-2 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Exportar PDF
            </button>
            <button
              onClick={handleClearData}
              className="flex items-center gap-2 text-xs font-semibold text-white/70 hover:text-white bg-white/5 border border-white/10 hover:border-white/20 px-3 py-2 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" /> Novo Arquivo
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-5">

        {/* KPI LINHA 1 — Indicadores Críticos */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <CriticalKpiCard
            title="Ruptura / Em Falta"
            value={kpis.emFalta}
            total={kpis.total}
            icon={PackageX}
            colorClass="text-red-600"
            bgClass="bg-red-100"
            borderClass="border-t-red-500"
            description="Itens zerados — Risco Assistencial Máximo"
          />
          <CriticalKpiCard
            title="Risco Crítico (< 7 dias)"
            value={kpis.coberturaCritica}
            total={kpis.total}
            icon={TrendingDown}
            colorClass="text-orange-500"
            bgClass="bg-orange-100"
            borderClass="border-t-orange-500"
            description="Baixa cobertura no estoque disponível"
          />
          <CriticalKpiCard
            title="Pedidos Atrasados"
            value={kpis.atrasados}
            total={kpis.total}
            icon={Clock}
            colorClass="text-amber-600"
            bgClass="bg-amber-100"
            borderClass="border-t-amber-500"
            description="Fornecedores com entrega pendente"
          />
          <CriticalKpiCard
            title="Alto Custo"
            value={kpis.altoCusto}
            total={kpis.total}
            icon={DollarSign}
            colorClass="text-indigo-600"
            bgClass="bg-indigo-100"
            borderClass="border-t-indigo-500"
            description="Requer atenção na gestão de capital"
          />
        </div>

        {/* KPI LINHA 2 — Métricas Farmacêuticas (skill farmacêutico-hospitalar) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricKpiCard
            title="Taxa de Ruptura"
            value={kpis.taxaRuptura}
            suffix="%"
            icon={AlertTriangle}
            colorClass={kpis.taxaRuptura > 2 ? 'text-red-600' : 'text-emerald-600'}
            bgClass={kpis.taxaRuptura > 2 ? 'bg-red-100' : 'bg-emerald-100'}
            target="< 2%"
            targetLabel={kpis.taxaRuptura <= 2 ? 'Dentro do limite' : 'Acima do limite'}
          />
          <MetricKpiCard
            title="Cobertura Média"
            value={kpis.coberturaMedia}
            suffix=" dias"
            icon={BarChart2}
            colorClass={kpis.coberturaMedia < 7 ? 'text-red-600' : kpis.coberturaMedia <= 30 ? 'text-emerald-600' : 'text-amber-600'}
            bgClass={kpis.coberturaMedia < 7 ? 'bg-red-100' : kpis.coberturaMedia <= 30 ? 'bg-emerald-100' : 'bg-amber-100'}
            target="15–30 dias"
            targetLabel="Janela ideal"
          />
          <MetricKpiCard
            title="Taxa de Conformidade"
            value={kpis.taxaConformidade}
            suffix="%"
            icon={TrendingUp}
            colorClass={kpis.taxaConformidade >= 95 ? 'text-emerald-600' : 'text-orange-500'}
            bgClass={kpis.taxaConformidade >= 95 ? 'bg-emerald-100' : 'bg-orange-100'}
            target="> 95%"
            targetLabel={kpis.taxaConformidade >= 95 ? 'Meta atingida' : 'Abaixo da meta'}
          />
          <MetricKpiCard
            title="Com Dependência"
            value={kpis.comDependencia}
            suffix=" itens"
            icon={Users}
            colorClass="text-purple-600"
            bgClass="bg-purple-100"
          />
        </div>

        {/* AVALIAÇÃO DE FORNECEDORES */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-violet-100 rounded-lg">
                <Users className="w-4 h-4 text-violet-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-800">Avaliação de Fornecedores</h2>
                <p className="text-[10px] text-slate-400">Qualificação baseada em pontualidade, ruptura e cobertura — RDC 204/2017</p>
              </div>
            </div>
            <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
              {fornecedorStats.totalFornecedores} fornecedores
            </span>
          </div>

          {/* KPIs de fornecedores */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100">
            {[
              {
                label: 'Pontualidade Média',
                value: `${fornecedorStats.pontualidadeMedia}%`,
                sub: 'Meta: > 90%',
                ok: fornecedorStats.pontualidadeMedia >= 90,
                icon: TrendingUp,
              },
              {
                label: 'Fornecedores c/ Atraso',
                value: fornecedorStats.fornecedoresComAtraso,
                sub: `de ${fornecedorStats.totalFornecedores} ativos`,
                ok: fornecedorStats.fornecedoresComAtraso === 0,
                icon: Clock,
              },
              {
                label: 'Fornecedores c/ Ruptura',
                value: fornecedorStats.fornecedoresComRuptura,
                sub: `de ${fornecedorStats.totalFornecedores} ativos`,
                ok: fornecedorStats.fornecedoresComRuptura === 0,
                icon: PackageX,
              },
              {
                label: 'Maior Risco',
                value: fornecedores[0]?.nome ? (() => { const n = toTitleCase(fornecedores[0].nome); return n.length > 22 ? n.substring(0, 22) + '…' : n; })() : '—',
                sub: fornecedores[0] ? `${fornecedores[0].emFalta} ruptura(s) · ${fornecedores[0].atrasados} atraso(s)` : 'Todos em dia',
                ok: !fornecedores[0] || (fornecedores[0].emFalta === 0 && fornecedores[0].atrasados === 0),
                icon: AlertTriangle,
              },
            ].map(({ label, value, sub, ok, icon: Icon }) => (
              <div key={label} className="bg-white p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  <Icon className={`w-4 h-4 ${ok ? 'text-emerald-600' : 'text-red-600'}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                  <p className={`text-base font-bold truncate ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
                  <p className="text-[10px] text-slate-400">{sub}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Ranking de fornecedores */}
          {fornecedores.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-y border-slate-100">
                    <th className="px-5 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Fornecedor</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Itens</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Pontualidade</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Dias Médios Atraso</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Rupturas</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Cob. Média</th>
                    <th className="px-3 py-2.5 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {fornecedores.slice(0, 8).map((f, i) => {
                    const isCritico = f.emFalta > 0;
                    const isAtencao = !isCritico && (f.atrasados > 0 || f.pontualidade < 90);
                    const isOk = !isCritico && !isAtencao;
                    return (
                      <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${isCritico ? 'bg-red-50/30' : ''}`}>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isCritico ? 'bg-red-500' : isAtencao ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                            <span className="font-medium text-slate-800 text-xs truncate max-w-[200px]" title={toTitleCase(f.nome)}>{toTitleCase(f.nome)}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center text-xs text-slate-600">{f.total}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-bold ${f.pontualidade >= 90 ? 'text-emerald-600' : f.pontualidade >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                            {f.pontualidade}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {f.diasAtrasoMedio > 0
                            ? <span className="text-xs font-bold text-amber-600">{f.diasAtrasoMedio}d</span>
                            : <span className="text-xs text-slate-400">—</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center">
                          {f.emFalta > 0
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">{f.emFalta}</span>
                            : <span className="text-xs text-slate-400">—</span>
                          }
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-medium ${f.coberturaMedia < 7 ? 'text-red-600' : f.coberturaMedia <= 14 ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {f.coberturaMedia > 0 ? `${f.coberturaMedia}d` : '—'}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            isCritico  ? 'bg-red-100 text-red-700 border-red-200'       :
                            isAtencao  ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                         'bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}>
                            {isCritico ? 'Crítico' : isAtencao ? 'Atenção' : 'OK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {fornecedores.length > 8 && (
                <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">
                  Exibindo top 8 de {fornecedores.length} fornecedores (ordenado por risco)
                </div>
              )}
            </div>
          )}
        </div>

        {/* LISTA CRÍTICA DO PLANEJAMENTO */}
        {lcStats && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-violet-50 to-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-violet-100 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Lista Crítica do Planejamento</h2>
                  <p className="text-[10px] text-slate-400">
                    Itens em monitoramento · {lcStats.dataLC && `Referência: ${lcStats.dataLC}`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-violet-600 bg-violet-50 border border-violet-200 px-2.5 py-1 rounded-full">
                  {lcStats.total} itens
                </span>
                <button
                  onClick={() => setLcData(null)}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* KPIs da LC */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100">
              {[
                { label: 'Cobertura Zero', value: lcStats.cobZero, sub: 'Estoque disponível zerado', ok: lcStats.cobZero === 0, icon: PackageX },
                { label: 'SC Emergencial', value: lcStats.scEmergencial, sub: 'Solicitações em andamento', ok: lcStats.scEmergencial === 0, icon: AlertTriangle },
                { label: 'OC de Reposição', value: lcStats.ocReposicao, sub: 'Ordens de compra abertas', ok: true, icon: FileSpreadsheet },
                { label: 'Monitorar Entrega', value: lcStats.monitorar, sub: 'Aguardando confirmação', ok: true, icon: Clock },
              ].map(({ label, value, sub, ok, icon: Icon }) => (
                <div key={label} className="bg-white p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <Icon className={`w-4 h-4 ${ok ? 'text-emerald-600' : 'text-red-600'}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                    <p className={`text-xl font-bold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
                    <p className="text-[10px] text-slate-400">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Breakdown por causa */}
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap gap-2 items-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Causa:</span>
              {Object.entries(lcStats.causaCount).sort((a, b) => b[1] - a[1]).map(([causa, count]) => {
                const colors: Record<string, string> = {
                  'Atraso na Entrega': 'bg-amber-100 text-amber-700 border-amber-200',
                  'Divergência de Inventário': 'bg-blue-100 text-blue-700 border-blue-200',
                  'Variação de demanda': 'bg-purple-100 text-purple-700 border-purple-200',
                  'Bloqueio Financeiro': 'bg-red-100 text-red-700 border-red-200',
                  'Saldo em excesso em outro estoque': 'bg-teal-100 text-teal-700 border-teal-200',
                  'Baixa movimentação': 'bg-slate-100 text-slate-600 border-slate-200',
                };
                const cls = colors[causa] || 'bg-slate-100 text-slate-600 border-slate-200';
                return (
                  <span key={causa} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cls}`}>
                    {causa} <span className="font-bold">{count}</span>
                  </span>
                );
              })}
            </div>

            {/* Tabela de itens críticos */}
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['Cód.', 'Medicamento / Material', 'Cob. Disp.', 'Cob. c/ Subst.', 'Cob. Total', 'Causa', 'Ação', 'Substitutos', 'Observação'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {lcStats.sortedItems.slice(0, 15).map((item, i) => {
                    const cobDisp = parseInt(item['Cob Disp'] || '0') || 0;
                    const cobTotal = parseInt(item['Cob Total'] || '0') || 0;
                    const cobSubst = parseInt(item['Cobertura Disp+ substitutos'] || '0') || 0;
                    const acao = (item['Ação'] || '').trim();
                    const causa = (item['Causa'] || '').trim();

                    const isZero = cobDisp === 0;
                    const isCritico = cobDisp > 0 && cobDisp < 7;
                    const acaoColor =
                      acao.includes('SC EMERGENCIAL') ? 'bg-red-100 text-red-700 border-red-200' :
                      acao.includes('OC de reposição') ? 'bg-blue-100 text-blue-700 border-blue-200' :
                      'bg-slate-100 text-slate-600 border-slate-200';

                    const subs = [item['1ª Opção Subs.'], item['2ª Opção Subs.'], item['3ª Opção Subs.']].filter(s => s && s.trim() !== '');

                    return (
                      <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${isZero ? 'bg-red-50/30' : isCritico ? 'bg-orange-50/20' : ''}`}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                            {item['Cód. Item']}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          <span className="text-xs font-medium text-slate-800 leading-tight line-clamp-2" title={toTitleCase(item['Desc. Item'] || '')}>
                            {toTitleCase(item['Desc. Item'] || '') || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${
                            isZero ? 'bg-red-100 text-red-700 border-red-200' :
                            isCritico ? 'bg-orange-100 text-orange-700 border-orange-200' :
                            'bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}>
                            {isZero ? 'Zero' : `${cobDisp}d`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-slate-600">{cobSubst > 0 ? `${cobSubst}d` : '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-slate-600">{cobTotal > 0 ? `${cobTotal}d` : '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-slate-600 leading-tight">{causa || '—'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${acaoColor}`}>
                            {acao || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {subs.length > 0 ? subs.map((s, si) => (
                              <span key={si} className="text-[10px] font-mono bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded">
                                {s}
                              </span>
                            )) : <span className="text-[10px] text-slate-400">—</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <span className="text-[10px] text-slate-500 leading-tight" title={item['Observação Planejamento']}>
                            {item['Observação Planejamento']?.substring(0, 60) || '—'}{item['Observação Planejamento']?.length > 60 ? '…' : ''}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {lcStats.total > 15 && (
                <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">
                  Exibindo 15 de {lcStats.total} itens (ordenado por urgência de cobertura)
                </div>
              )}
            </div>
          </div>
        )}

        {/* POSIÇÃO DE ESTOQUE */}
        {stockStats && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-teal-50 to-slate-50">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-teal-100 rounded-lg">
                  <Warehouse className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Posição de Estoque</h2>
                  <p className="text-[10px] text-slate-400">Análise por valor, cobertura e Curva ABC — {stockStats.totalItens} itens únicos</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2.5 py-1 rounded-full">
                  R$ {stockStats.valorTotalGeral.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                <button onClick={() => setStockData(null)} className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded">✕</button>
              </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-100">
              {[
                { label: 'Estoque Zerado',     value: stockStats.zerados,       sub: 'Itens sem saldo',            ok: stockStats.zerados === 0,        icon: PackageX },
                { label: 'Abaixo do Mínimo',   value: stockStats.abaixoMin,     sub: 'Risco de ruptura iminente',  ok: stockStats.abaixoMin === 0,      icon: TrendingDown },
                { label: 'No Ponto de Pedido', value: stockStats.noPontoPedido, sub: 'Solicitar reposição',        ok: stockStats.noPontoPedido === 0,  icon: AlertTriangle },
                { label: 'Acima do Máximo',    value: stockStats.acimaMax,      sub: 'Capital imobilizado em excesso', ok: stockStats.acimaMax === 0,  icon: TrendingUp },
              ].map(({ label, value, sub, ok, icon: Icon }) => (
                <div key={label} className="bg-white p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${ok ? 'bg-emerald-100' : 'bg-red-100'}`}>
                    <Icon className={`w-4 h-4 ${ok ? 'text-emerald-600' : 'text-red-600'}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 font-medium">{label}</p>
                    <p className={`text-xl font-bold ${ok ? 'text-emerald-600' : 'text-red-600'}`}>{value}</p>
                    <p className="text-[10px] text-slate-400">{sub}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Curva ABC */}
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Curva ABC:</span>
              {(['A', 'B', 'C'] as const).map(c => {
                const colors = { A: 'bg-red-100 text-red-700 border-red-200', B: 'bg-amber-100 text-amber-700 border-amber-200', C: 'bg-slate-100 text-slate-600 border-slate-200' };
                const pct = stockStats.valorTotalGeral > 0
                  ? ((stockStats.abcValue[c] / stockStats.valorTotalGeral) * 100).toFixed(1)
                  : '0';
                return (
                  <div key={c} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${colors[c]}`}>
                    <span className="text-xs font-black">Curva {c}</span>
                    <span className="text-[11px] font-semibold">{stockStats.abcCount[c]} itens</span>
                    <span className="text-[10px]">· {pct}% do valor</span>
                    <span className="text-[10px] font-bold">
                      R$ {stockStats.abcValue[c].toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Sub-classes */}
            <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Sub-Classe:</span>
              {Object.entries(stockStats.subClasseMap)
                .sort((a, b) => b[1].valor - a[1].valor)
                .map(([nome, s]) => (
                  <span key={nome} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border bg-teal-50 text-teal-700 border-teal-200">
                    {toTitleCase(nome.replace(/^\d+\s+/, ''))}
                    <span className="font-bold">{s.count}</span>
                  </span>
                ))}
            </div>

            {/* Tabela top itens por valor */}
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    {['ABC', 'Cód.', 'Medicamento / Material', 'Sub-Classe', 'Unidade', 'Estoque', 'Mín / Máx', 'Localizações', 'Custo Médio', 'Vl. Total'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {stockStats.sortedByValue.slice(0, 20).map((item: any, i: number) => {
                    const abcColors: Record<string, string> = {
                      A: 'bg-red-100 text-red-700 border-red-200',
                      B: 'bg-amber-100 text-amber-700 border-amber-200',
                      C: 'bg-slate-100 text-slate-600 border-slate-200',
                    };
                    const isZero = item.estoqueTotal === 0;
                    const isAbaixoMin = item.estMin > 0 && item.estoqueTotal < item.estMin;
                    return (
                      <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${isZero ? 'bg-red-50/30' : isAbaixoMin ? 'bg-orange-50/20' : ''}`}>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ${abcColors[item.curvaABC]}`}>
                            {item.curvaABC}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{item.cod}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[240px]">
                          <span className="text-xs font-medium text-slate-800 leading-tight" title={toTitleCase(item.desc)}>
                            {toTitleCase(item.desc)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] text-slate-500">{toTitleCase(item.subClasse.replace(/^\d+\s+/, ''))}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{item.unidade}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-sm font-bold ${isZero ? 'text-red-600' : isAbaixoMin ? 'text-orange-600' : 'text-slate-800'}`}>
                            {item.estoqueTotal.toLocaleString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center text-xs text-slate-500 whitespace-nowrap">
                          {item.estMin > 0 || item.estMax > 0
                            ? <>{item.estMin.toLocaleString('pt-BR')} / {item.estMax.toLocaleString('pt-BR')}</>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {item.localizacoes.map((l: string) => (
                              <span key={l} className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded font-mono">{l}</span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-600 whitespace-nowrap">
                          R$ {item.custoMedio.toLocaleString('pt-BR', { minimumFractionDigits: 4 })}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <span className="text-xs font-bold text-teal-700">
                            R$ {item.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {stockStats.totalItens > 20 && (
                <div className="px-5 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 text-center">
                  Exibindo top 20 de {stockStats.totalItens} itens (ordenado por maior valor)
                </div>
              )}
            </div>
          </div>
        )}

        {/* TOOLBAR: SEARCH & FILTERS */}
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col lg:flex-row gap-4 justify-between items-center">
          <div className="relative w-full lg:w-96">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por código, princípio ativo ou fornecedor..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-sm"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>

          <div className="flex gap-2 overflow-x-auto w-full lg:w-auto pb-2 lg:pb-0 hide-scrollbar">
            {[
              { label: 'Todos',           count: kpis.total,            icon: null,         color: null },
              { label: 'Em Falta',        count: kpis.emFalta,          icon: AlertTriangle, color: 'text-red-500' },
              { label: 'Risco Crítico',   count: kpis.coberturaCritica, icon: TrendingDown,  color: 'text-orange-500' },
              { label: 'Atrasados',       count: kpis.atrasados,        icon: Clock,         color: 'text-amber-500' },
              { label: 'Alto Custo',      count: kpis.altoCusto,        icon: DollarSign,    color: 'text-indigo-500' },
              { label: 'Com Dependência', count: kpis.comDependencia,   icon: Link,          color: 'text-purple-500' },
            ].map(({ label, count, icon: Icon, color }) => (
              <button
                key={label}
                onClick={() => {
                  setActiveFilter(label);
                  setCurrentPage(1);
                }}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5
                  ${activeFilter === label
                    ? 'bg-slate-800 text-white shadow-md'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
              >
                {Icon && <Icon className={`w-3.5 h-3.5 ${activeFilter === label ? 'text-slate-300' : color}`} />}
                {label}
                {label !== 'Todos' && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold
                    ${activeFilter === label
                      ? 'bg-white/20 text-white'
                      : count > 0 ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400'
                    }`}>
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* DATA TABLE */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
          <div className="overflow-x-auto flex-1 pb-4">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <tr>
                  {/* Indicador de status */}
                  <th className="w-1 p-0" />
                  {/* Código / Medicamento */}
                  <th className="px-4 py-4 align-top">
                    <div className="mb-2 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Desc Item')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">Código / Medicamento</span>
                      <SortIcon columnKey="Desc Item" />
                    </div>
                    <input
                      type="text"
                      placeholder="Filtrar cód/med..."
                      className="w-full px-2 py-1.5 text-xs font-normal border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                      value={colFilters.medicamento}
                      onChange={e => { setColFilters(p => ({...p, medicamento: e.target.value})); setCurrentPage(1); }}
                    />
                  </th>
                  {/* Fornecedor */}
                  <th className="px-4 py-4 align-top">
                    <div className="mb-2 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Fornec')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">Fornecedor</span>
                      <SortIcon columnKey="Fornec" />
                    </div>
                    <input
                      type="text"
                      placeholder="Filtrar fornecedor..."
                      className="w-full px-2 py-1.5 text-xs font-normal border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                      value={colFilters.fornecedor}
                      onChange={e => { setColFilters(p => ({...p, fornecedor: e.target.value})); setCurrentPage(1); }}
                    />
                  </th>
                  {/* Cobertura — nova coluna */}
                  <th className="px-4 py-4 align-top text-center cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Cobertura')}>
                    <div className="flex items-center justify-center gap-1 text-xs font-semibold uppercase tracking-wider">
                      <span>Cobertura</span>
                      <SortIcon columnKey="Cobertura" />
                    </div>
                  </th>
                  {/* Estoque */}
                  <th className="px-4 py-4 align-top">
                    <div className="mt-1 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Estoq Disp')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">Estoque (Disp/Tot)</span>
                      <SortIcon columnKey="Estoq Disp" />
                    </div>
                  </th>
                  {/* Qtd */}
                  <th className="px-4 py-4 align-top">
                    <div className="mt-1 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Qtd Pend')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">Qtd. (Pend/Tot)</span>
                      <SortIcon columnKey="Qtd Pend" />
                    </div>
                  </th>
                  {/* Valores */}
                  <th className="px-4 py-4 align-top">
                    <div className="mt-1 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Valor total (R$)')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">Valores (Unit/Total)</span>
                      <SortIcon columnKey="Valor total (R$)" />
                    </div>
                  </th>
                  {/* OC e NF */}
                  <th className="px-4 py-4 align-top">
                    <div className="mb-2 flex items-center justify-between cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('Dias Atraso')}>
                      <span className="text-xs font-semibold uppercase tracking-wider">OC e Nota Fiscal</span>
                      <SortIcon columnKey="Dias Atraso" />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Filtrar OC..."
                        className="w-1/2 px-2 py-1.5 text-xs font-normal border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                        value={colFilters.oc}
                        onChange={e => { setColFilters(p => ({...p, oc: e.target.value})); setCurrentPage(1); }}
                      />
                      <input
                        type="text"
                        placeholder="Filtrar NF..."
                        className="w-1/2 px-2 py-1.5 text-xs font-normal border border-slate-300 rounded focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
                        value={colFilters.nf}
                        onChange={e => { setColFilters(p => ({...p, nf: e.target.value})); setCurrentPage(1); }}
                      />
                    </div>
                  </th>
                  {/* Sinalizadores */}
                  <th className="px-4 py-4 align-top">
                    <div className="mt-1 text-xs font-semibold uppercase tracking-wider">Sinalizadores</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      <Filter className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                      Nenhum item encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, index) => {
                    const isFalta = item['Em Falta'] === 'Sim' || item['Ruptura'] === 'Sim';
                    const diasAtraso = parseInt(item['Dias Atraso']) || 0;
                    const isAtrasado = diasAtraso > 0 || item['Atrasado'] === 'Sim';
                    const cobertura = item['Cobertura'] ? parseFloat(item['Cobertura'].replace(',', '.')) : 999;
                    const isCritico = cobertura < 7 && cobertura >= 0 && !isFalta;
                    const isAltoCusto = item['Item de Alto Custo (R$)'] === 'Sim';

                    return (
                      <tr key={index} className={`hover:bg-slate-50/80 transition-colors
                        ${isFalta ? 'bg-red-50/40' : isCritico ? 'bg-orange-50/30' : isAtrasado ? 'bg-amber-50/20' : ''}
                      `}>
                        {/* Tira de status */}
                        <td className={`p-0 w-1 ${
                          isFalta    ? 'bg-red-500'    :
                          isCritico  ? 'bg-orange-400' :
                          isAtrasado ? 'bg-amber-400'  :
                                       'bg-emerald-400'
                        }`} />

                        {/* Medicamento */}
                        <td className="px-4 py-4">
                          <div className="font-medium text-slate-800 max-w-[250px] truncate text-sm" title={toTitleCase(item['Desc Item'] || '')}>
                            {toTitleCase(item['Desc Item'] || '') || 'N/A'}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">{item['Cod Item']}</span>
                            {item['Curva ABC'] && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                item['Curva ABC'] === 'A' ? 'bg-red-100 text-red-700 border-red-200'     :
                                item['Curva ABC'] === 'B' ? 'bg-amber-100 text-amber-700 border-amber-200':
                                                            'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                Curva {item['Curva ABC']}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Fornecedor */}
                        <td className="px-4 py-4">
                          <div className="text-slate-700 max-w-[150px] truncate text-sm" title={toTitleCase(item['Fornec'] || '')}>
                            {toTitleCase(item['Fornec'] || '') || '-'}
                          </div>
                        </td>

                        {/* Cobertura — nova coluna com pill colorido */}
                        <td className="px-4 py-4 text-center">
                          {isFalta ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
                              Ruptura
                            </span>
                          ) : cobertura < 7 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-200">
                              {item['Cobertura']}d
                            </span>
                          ) : cobertura <= 14 ? (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
                              {item['Cobertura']}d
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                              {item['Cobertura'] || '—'}d
                            </span>
                          )}
                        </td>

                        {/* Estoque */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className={`font-semibold text-sm ${isFalta || item['Estoq Disp'] === '0' ? 'text-red-600' : 'text-slate-700'}`}>
                              Disp: {item['Estoq Disp'] || '0'}
                            </span>
                            <span className="text-xs text-slate-400">Tot: {item['Estoq Tot'] || '0'}</span>
                          </div>
                        </td>

                        {/* Qtd */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700" title="Quantidade Pendente">
                              {item['Qtd Pend'] || item['Qtd. Total'] || '0'} <span className="text-xs font-normal text-slate-500">{item['Un']}</span>
                            </span>
                            <span className="text-xs text-slate-400" title="Quantidade Total da Ordem">
                              OC: {item['Qtd. Total'] || '0'}
                            </span>
                          </div>
                        </td>

                        {/* Valores */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-700">
                              {item['Valor total (R$)'] || 'R$ 0,00'}
                            </span>
                            <span className="text-xs text-slate-400">
                              Unit: {item['Vl. Unit. (R$)'] || 'R$ 0,00'}
                            </span>
                          </div>
                        </td>

                        {/* OC e NF */}
                        <td className="px-4 py-4">
                          <div className="flex flex-col gap-1.5">
                            <div>
                              <div className="text-sm font-medium text-slate-700">
                                OC: {item['OC - Núm'] || '-'}
                              </div>
                              <div className="text-xs text-slate-500">
                                Ent: {item['Nova Data Ent'] || item['OC - Entrega'] || '-'}
                              </div>
                            </div>

                            {(item['NF - Núm'] || item.nfDetails) && (
                              <div className="mt-1 pt-1 border-t border-slate-100">
                                <div className="text-xs font-medium text-slate-600">
                                  NF: {item['NF - Núm'] || '-'}
                                </div>
                                {item.nfDetails && (
                                  <div className="mt-0.5">
                                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                      item.nfDetails['Status Entrega'] === 'Entregue'
                                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                        : 'bg-blue-100 text-blue-700 border-blue-200'
                                    }`}>
                                      {item.nfDetails['Status Entrega']}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}

                            {isAtrasado && !item.nfDetails && (
                              <div className="mt-1">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">
                                  {diasAtraso} dia(s) atraso
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Sinalizadores */}
                        <td className="px-4 py-4">
                          <div className="flex gap-1.5 flex-wrap w-32">
                            {isAltoCusto && (
                              <span title="Alto Custo" className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold border border-indigo-200 uppercase">
                                ALTO CUSTO
                              </span>
                            )}
                            {item['Importado'] === 'Sim' && (
                              <span title="Importado" className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold border border-blue-200">
                                IMP
                              </span>
                            )}
                            {item['Dependência'] !== 'Sem dependência' && item['Dependência'] && (
                              <span
                                title={`Situação real/Dependência: ${item['Dependência']}`}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold border border-purple-200 cursor-help max-w-[140px]"
                              >
                                <Link className="w-3 h-3 flex-shrink-0" />
                                <span className="truncate uppercase">{item['Dependência']}</span>
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* PAGINATION */}
          {totalPages > 1 && (
            <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Mostrando <span className="font-medium text-slate-800">{((currentPage - 1) * itemsPerPage) + 1}</span> a{' '}
                <span className="font-medium text-slate-800">{Math.min(currentPage * itemsPerPage, sortedData.length)}</span> de{' '}
                <span className="font-medium text-slate-800">{sortedData.length}</span> resultados
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => p - 1)}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium text-slate-600 px-2">
                  {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(p => p + 1)}
                  className="p-1 rounded bg-white border border-slate-200 text-slate-600 disabled:opacity-50 hover:bg-slate-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
