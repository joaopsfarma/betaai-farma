import React, { useState, useMemo } from 'react';
import { 
  UploadCloud, 
  FileText, 
  BarChart2, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp, 
  Package, 
  RefreshCw,
  Info,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  Users,
  Zap,
  ArrowRight,
  ClipboardList,
  BarChart3,
  UserCheck
} from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import { getBaseProduct } from '../data/productDatabase';

interface IMetrics {
  totalRequests: number;
  totalRequested: number;
  totalDispensed: number;
  fulfillmentRate: number;
  statusCounts: Record<string, number>;
  typeCounts: Record<string, number>;
  typeRowCounts: Record<string, number>;
  topProducts: any[];
  totalRows: number;
  tableData: any[];
  topUsersList: any[];
  formattedHourly: any[];
  maxHourCount: number;
  peakHourInfo: { hour: string; count: number };
}

export const AnaliseDispensacao: React.FC = () => {
  const [data, setData] = useState<any[] | null>(null);
  const [productMapping, setProductMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState('');
  const [dbFileName, setDbFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Estados de Filtro
  const [filterStatus, setFilterStatus] = useState('Todos');
  const [filterType, setFilterType] = useState('Todos'); 
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Função para processar o CSV de Database de Códigos
  const processDatabaseCSV = (text: string) => {
    try {
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return {};

      const mapping: Record<string, string> = {};
      // Pula o cabeçalho
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(';').map(v => v.replace(/^"|"$/g, '').trim());
        if (values.length >= 2) {
          const baseCode = values[0];
          const baseName = values[1];
          if (baseCode && baseName) {
            mapping[baseCode] = baseName;
            // Mapeia códigos semelhantes (colunas 2, 4, 6, 8, ...)
            for (let j = 2; j < values.length; j += 2) {
              const similarCode = values[j];
              if (similarCode) {
                mapping[similarCode] = baseName;
              }
            }
          }
        }
      }
      return mapping;
    } catch (err) {
      console.error("Erro ao processar database:", err);
      return {};
    }
  };

  const handleDbUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDbFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const decoder = new TextDecoder('windows-1252'); // Geralmente esses CSVs são Windows-1252
      const text = decoder.decode(arrayBuffer);
      const mapping = processDatabaseCSV(text);
      setProductMapping(mapping);
    };
    reader.readAsArrayBuffer(file);
  };

  // Função para processar o CSV manualmente sem dependências externas
  const processCSV = (text: string) => {
    try {
      // Lida com quebras de linha tanto do Windows (\r\n) quanto Unix (\n)
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      
      // Encontrar a linha de cabeçalho de forma mais robusta (ignorando acentos e maiúsculas)
      let headerIndex = -1;
      for (let i = 0; i < lines.length; i++) {
        const normalizedLine = lines[i].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedLine.includes('codigo solicitacao') || normalizedLine.includes('codigo produto') || normalizedLine.includes('status')) {
          headerIndex = i;
          break;
        }
      }

      if (headerIndex === -1) {
        throw new Error("Não foi possível encontrar as colunas no arquivo. Verifique se o formato está correto.");
      }

      const headers = lines[headerIndex].split(';').map(h => h.replace(/^"|"$/g, '').trim());
      const parsedData = [];

      for (let i = headerIndex + 1; i < lines.length; i++) {
        const values = lines[i].split(';');
        // Aceita linhas se tiverem pelo menos metade das colunas do cabeçalho preenchidas
        if (values.length >= (headers.length / 2)) {
          const row: any = {};
          for (let j = 0; j < headers.length; j++) {
            if (headers[j]) {
              row[headers[j]] = values[j] ? values[j].replace(/^"|"$/g, '').trim() : '';
            }
          }
          parsedData.push(row);
        }
      }
      return parsedData;
    } catch (err: any) {
      throw new Error("Erro ao ler o arquivo: " + err.message);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setLoading(true);
    setError(null);

    const reader = new FileReader();
    
    // Ler como ArrayBuffer para lidar com as codificações típicas de sistemas legados (Windows-1252 vs UTF-8)
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        let text;
        
        try {
          const decoderUtf8 = new TextDecoder('utf-8', { fatal: true });
          text = decoderUtf8.decode(arrayBuffer);
        } catch (err) {
          const decoderWin = new TextDecoder('windows-1252');
          text = decoderWin.decode(arrayBuffer);
        }

        // Se o texto leu em UTF-8 mas ainda contém falhas de conversão, forçamos o Windows-1252
        if (text.includes('')) {
          const decoderWin = new TextDecoder('windows-1252');
          text = decoderWin.decode(arrayBuffer);
        }

        const parsedData = processCSV(text);
        if (parsedData.length === 0) {
          throw new Error("O arquivo parece estar vazio ou em um formato incorreto.");
        }
        setData(parsedData);
      } catch (err: any) {
        setError(err.message);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError("Erro ao carregar o arquivo.");
      setLoading(false);
    };

    reader.readAsArrayBuffer(file);
  };

  const resetApp = () => {
    setData(null);
    setFileName('');
    setError(null);
    setFilterStatus('Todos');
    setFilterType('Todos');
    setCurrentPage(1);
  };

  // Cálculos de Indicadores usando useMemo para otimização
  const metrics = useMemo(() => {
    if (!data) return null;

    let totalRequested = 0;
    let totalDispensed = 0;
    const uniqueRequests = new Set();
    const productStats: Record<string, { requested: number; dispensed: number }> = {};
    const statusCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {}; // Quantidade pedida por tipo
    const typeRowCounts: Record<string, number> = {}; // Quantidade de linhas por tipo (para o filtro)
    const tableData: any[] = [];
    
    // Novos indicadores
    const hourlyStats = Array(24).fill(0);
    const userStats: Record<string, number> = {};

    // Função robusta para encontrar a chave certa (ignorando acentuação)
    const findKey = (row: any, searchTerms: string[]) => {
      const keys = Object.keys(row);
      for (const k of keys) {
        const normKey = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        for (const term of searchTerms) {
          if (normKey === term || normKey.includes(term)) return k;
        }
      }
      return null;
    };

    // Função robusta para converter números (Ex: "1.000,50" -> 1000.5)
    const parseNumber = (val: any) => {
      if (!val) return 0;
      const cleanVal = val.toString().replace(/\./g, '').replace(',', '.');
      const num = parseFloat(cleanVal);
      return isNaN(num) ? 0 : num;
    };

    data.forEach(row => {
      const keyReqId = findKey(row, ['codigo solicitacao']);
      const keyQtdReq = findKey(row, ['qtd solicitada', 'quantidade solicitada']);
      const keyQtdDisp = findKey(row, ['qtd dispensada', 'quantidade dispensada']);
      const keyStatus = findKey(row, ['status']);
      const keyType = findKey(row, ['tipo solicitacao']);
      const keyProductCode = findKey(row, ['codigo produto', 'cod produto']);
      const keyProductDesc = Object.keys(row).find(k => k.trim().toLowerCase() === 'produto') || findKey(row, ['produto', 'descricao']);
      const keyDate = findKey(row, ['data pedido', 'data movimentacao', 'data']);
      const keyUser = findKey(row, ['usuario movimentacao estoque', 'usuario movimentacao', 'usuario', 'usuário']);
      const keyTime = findKey(row, ['hora movimentacao', 'hora pedido', 'hora']);

      const reqId = keyReqId ? row[keyReqId] : null;
      const qtdReq = keyQtdReq ? parseNumber(row[keyQtdReq]) : 0;
      const qtdDisp = keyQtdDisp ? parseNumber(row[keyQtdDisp]) : 0;
      const status = keyStatus ? (row[keyStatus] || 'Desconhecido') : 'Desconhecido';
      const type = keyType ? (row[keyType] || 'Outros') : 'Outros';
      const productCode = keyProductCode ? row[keyProductCode] : null;
      let product = keyProductDesc ? (row[keyProductDesc] || 'Produto não identificado') : 'Produto não identificado';
      
      // Normalização por Database de Códigos
      if (productCode) {
        // Prioridade 1: Mapping dinâmico (CSV carregado)
        if (productMapping[productCode]) {
          product = productMapping[productCode];
        } else {
          // Prioridade 2: Mapping estático (Arquivo productDatabase.ts)
          const baseProduct = getBaseProduct(productCode);
          if (baseProduct) {
            product = baseProduct.name;
          }
        }
      }

      const date = keyDate ? (row[keyDate] || '-') : '-';
      const user = keyUser ? (row[keyUser] || '-') : '-';
      const timeStr = keyTime ? (row[keyTime] || '') : '';

      if (reqId) uniqueRequests.add(reqId);
      
      totalRequested += qtdReq;
      totalDispensed += qtdDisp;

      // Status
      statusCounts[status] = (statusCounts[status] || 0) + 1;

      // Tipos (Volume Pedido) e (Volume de Linhas)
      typeCounts[type] = (typeCounts[type] || 0) + qtdReq;
      typeRowCounts[type] = (typeRowCounts[type] || 0) + 1;

      // Produtos
      if (!productStats[product]) {
        productStats[product] = { requested: 0, dispensed: 0 };
      }
      productStats[product].requested += qtdReq;
      productStats[product].dispensed += qtdDisp;
      
      // Top Utilizadores (Contagem de movimentos)
      if (user && user !== '-' && user !== '') {
        userStats[user] = (userStats[user] || 0) + 1;
      }

      // Distribuição por Hora
      if (timeStr) {
        const hourMatch = timeStr.match(/^(\d{1,2}):/);
        if (hourMatch) {
          const hour = parseInt(hourMatch[1], 10);
          if (!isNaN(hour) && hour >= 0 && hour <= 23) {
            hourlyStats[hour] += 1;
          }
        }
      }

      tableData.push({
        reqId: reqId || '-',
        date,
        user,
        product,
        requested: qtdReq,
        dispensed: qtdDisp,
        status,
        type,
        time: timeStr
      });
    });

    // Ordenar Top 5 Produtos
    const topProducts = Object.entries(productStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        gap: stats.requested - stats.dispensed
      }))
      .sort((a, b) => b.requested - a.requested)
      .slice(0, 5);
      
    // Ordenar Top 5 Utilizadores
    const topUsersList = Object.entries(userStats)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Formatar Horários para o Gráfico
    const formattedHourly = hourlyStats.map((count, i) => ({
      hour: `${i.toString().padStart(2, '0')}h`,
      count
    }));
    const maxHourCount = Math.max(...hourlyStats, 1);
    
    // Identificar a hora de pico
    const peakHourIndex = hourlyStats.indexOf(Math.max(...hourlyStats));
    const peakHourInfo = {
        hour: `${peakHourIndex.toString().padStart(2, '0')}h`,
        count: hourlyStats[peakHourIndex]
    };

    const fulfillmentRate = totalRequested > 0 ? parseFloat(((totalDispensed / totalRequested) * 100).toFixed(1)) : 0;

    const metricsData: IMetrics = {
      totalRequests: uniqueRequests.size,
      totalRequested,
      totalDispensed,
      fulfillmentRate,
      statusCounts,
      typeCounts,
      typeRowCounts,
      topProducts,
      totalRows: data.length,
      tableData,
      topUsersList,
      formattedHourly,
      maxHourCount,
      peakHourInfo
    };

    return metricsData;
  }, [data]);

  // Filtragem Dupla (Status e Tipo) e Paginação da Tabela
  const filteredTableData = useMemo(() => {
    if (!metrics) return [];
    
    return metrics.tableData.filter(item => {
      const matchStatus = filterStatus === 'Todos' || item.status === filterStatus;
      const matchType = filterType === 'Todos' || item.type === filterType;
      return matchStatus && matchType;
    });
  }, [metrics, filterStatus, filterType]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTableData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTableData, currentPage]);

  const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);

  // Ecrã de Upload
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans text-slate-800">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <BarChart2 className="w-10 h-10 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Análise de Dispensação</h1>
          <p className="text-slate-500 mb-8">
            Faça o upload do seu arquivo CSV (Solicitações x Materiais) para gerar os indicadores automaticamente.
          </p>

          <label className="relative flex flex-col items-center justify-center w-full h-48 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloud className="w-10 h-10 text-slate-400 mb-3" />
              <p className="mb-2 text-sm text-slate-600">
                <span className="font-semibold">Clique para carregar</span> ou arraste o arquivo
              </p>
              <p className="text-xs text-slate-500">Apenas arquivos .CSV (Solicitações)</p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept=".csv" 
              onChange={handleFileUpload} 
              disabled={loading}
            />
          </label>

          <div className="mt-6 pt-6 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Opcional: Database de Códigos</p>
            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <RefreshCw className={`w-4 h-4 ${dbFileName ? 'text-emerald-500' : 'text-slate-400'}`} />
              <span className="text-sm font-medium text-slate-600">
                {dbFileName ? `Database: ${dbFileName}` : 'Carregar Database de Códigos'}
              </span>
              <input 
                type="file" 
                className="hidden" 
                accept=".csv" 
                onChange={handleDbUpload} 
              />
            </label>
            {dbFileName && (
              <p className="mt-2 text-[10px] text-emerald-600 font-medium">
                ✓ {Object.keys(productMapping).length} códigos mapeados para normalização.
              </p>
            )}
          </div>

          {loading && <p className="mt-4 text-blue-600 font-medium">Processando dados...</p>}
          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm flex items-start text-left">
              <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Cores de status dinâmicas
  const getStatusColor = (status: string) => {
    const s = status.toLowerCase();
    if (s.includes('totalmente')) return 'bg-emerald-500';
    if (s.includes('não')) return 'bg-red-500';
    if (s.includes('mais')) return 'bg-amber-400';
    if (s.includes('menos')) return 'bg-orange-500';
    return 'bg-slate-400';
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-800">
      {/* Cabeçalho */}
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
            <BarChart2 className="w-8 h-8 text-blue-600" />
            Painel de Desempenho
          </h1>
          <p className="text-slate-500 mt-1 flex items-center gap-2">
            <FileText className="w-4 h-4" /> {fileName} ({metrics?.totalRows} registros)
            {dbFileName && (
              <span className="flex items-center gap-1 ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px] font-bold uppercase tracking-wider">
                <RefreshCw className="w-3 h-3" /> Database Ativa
              </span>
            )}
          </p>
        </div>
        <button 
          onClick={resetApp}
          className="flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Novo Arquivo
        </button>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <KpiCard 
            title="Total Solicitações" 
            value={metrics?.totalRequests.toLocaleString('pt-PT') || "0"} 
            icon={<FileText className="text-blue-500" />} 
            subtitle="Pedidos únicos"
          />
          <KpiCard 
            title="Itens Solicitados" 
            value={metrics?.totalRequested.toLocaleString('pt-PT') || "0"} 
            icon={<Package className="text-indigo-500" />} 
            subtitle="Unidades totais"
          />
          <KpiCard 
            title="Itens Dispensados" 
            value={metrics?.totalDispensed.toLocaleString('pt-PT') || "0"} 
            icon={<CheckCircle className="text-emerald-500" />} 
            subtitle="Unidades entregues"
          />
          <KpiCard 
            title="Taxa de Atendimento" 
            value={`${metrics?.fulfillmentRate || 0}%`} 
            icon={<TrendingUp className={(metrics?.fulfillmentRate || 0) >= 80 ? "text-emerald-500" : "text-orange-500"} />} 
            subtitle="Nível de Serviço"
            alert={(metrics?.fulfillmentRate || 0) < 70}
          />
        </div>

        {/* Linha 1 de Gráficos: Produtos e Status */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Top 5 Produtos (Ocupa 2 colunas) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Package className="w-5 h-5 text-slate-400" />
              Top 5 Produtos Solicitados
            </h2>
            <div className="space-y-6">
              {metrics?.topProducts.map((prod, index) => {
                const maxReq = metrics.topProducts[0]?.requested || 1;
                const reqPercent = (prod.requested / maxReq) * 100;
                const dispPercent = (prod.dispensed / maxReq) * 100;

                return (
                  <div key={index} className="relative">
                    <div className="flex justify-between items-end mb-1">
                      <span className="text-sm font-medium text-slate-700 truncate pr-4" title={prod.name}>
                        {index + 1}. {prod.name}
                      </span>
                      <span className="text-xs font-semibold bg-slate-100 px-2 py-1 rounded text-slate-600 whitespace-nowrap">
                        {prod.requested.toLocaleString('pt-PT')} unid.
                      </span>
                    </div>
                    {/* Barras */}
                    <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden flex relative">
                      <div 
                        className="h-full bg-blue-200 absolute left-0 top-0 rounded-full" 
                        style={{ width: `${reqPercent}%` }}
                      ></div>
                      <div 
                        className="h-full bg-blue-600 absolute left-0 top-0 rounded-full" 
                        style={{ width: `${dispPercent}%` }}
                        title={`Dispensado: ${prod.dispensed}`}
                      ></div>
                    </div>
                    <div className="flex justify-between mt-1 text-[10px] text-slate-500 uppercase">
                      <span>{prod.dispensed} dispensados</span>
                      {prod.gap > 0 && <span className="text-orange-500 font-medium">Falta: {prod.gap}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Distribuição de Status */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-slate-400" />
              Qualidade da Dispensação
            </h2>
            <div className="space-y-4">
              {(Object.entries(metrics?.statusCounts || {}) as [string, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([status, count], idx) => {
                  const percent = ((count / (metrics?.totalRows || 1)) * 100).toFixed(1);
                  return (
                    <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${getStatusColor(status)}`}></div>
                        <span className="text-sm font-medium text-slate-700">{status}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold">{count}</div>
                        <div className="text-xs text-slate-500">{percent}%</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Linha 2 de Gráficos: Horários e Utilizadores */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Horários de Pico */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 lg:col-span-2">
             <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Clock className="w-5 h-5 text-slate-400" />
              Volume de Movimentações por Horário
            </h2>
            <div className="flex items-end justify-between gap-1 mt-4 h-48 border-b border-slate-200 pb-2">
                {metrics?.formattedHourly.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                       {/* Tooltip */}
                       <div className="opacity-0 group-hover:opacity-100 absolute -top-8 transition-opacity text-[10px] bg-slate-800 text-white rounded px-2 py-1 whitespace-nowrap z-10 pointer-events-none">
                         {h.count} movs
                       </div>
                       
                       <div 
                         className={`w-full max-w-[20px] rounded-t-sm transition-all duration-300 ${h.count === metrics.maxHourCount ? 'bg-indigo-600' : 'bg-indigo-300 hover:bg-indigo-400'}`} 
                         style={{ 
                           height: `${(h.count / metrics.maxHourCount) * 100}%`, 
                           minHeight: h.count > 0 ? '4px' : '0' 
                         }}
                       ></div>
                       <span className="text-[10px] text-slate-400 mt-2 rotate-45 transform origin-top-left -ml-2">{h.hour}</span>
                    </div>
                ))}
            </div>
            <div className="mt-8 text-sm text-slate-600 text-center">
              O horário de pico é às <strong>{metrics?.peakHourInfo.hour}</strong> com <strong>{metrics?.peakHourInfo.count}</strong> movimentações registadas.
            </div>
          </div>

          {/* Top Utilizadores (Equipa) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
             <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Top 5 Usuários (Equipe)
            </h2>
            <div className="space-y-4">
              {metrics?.topUsersList && metrics.topUsersList.length > 0 ? metrics.topUsersList.map((user, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {user.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-slate-700 truncate" title={user.name}>
                      {user.name}
                    </span>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <div className="text-sm font-bold text-indigo-600">{user.count}</div>
                    <div className="text-[10px] text-slate-500 uppercase">Movs</div>
                  </div>
                </div>
              )) : (
                <div className="text-center py-4 text-slate-500 text-sm">
                  Sem dados de usuários
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Secção Inferior: Sugestões de Ação Detalhadas */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
           <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800">
              <Zap className="w-6 h-6 text-yellow-500 fill-yellow-500" />
              Insights e Planos de Ação Estratégicos
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Plano 1: Nível de Serviço */}
              <div className="p-5 rounded-xl border border-slate-200 flex flex-col h-full relative overflow-hidden bg-white hover:shadow-md transition-shadow">
                <div className={`absolute top-0 left-0 w-full h-1 ${(metrics?.fulfillmentRate || 0) < 75 ? 'bg-orange-500' : 'bg-emerald-500'}`}></div>
                <h3 className="font-bold text-slate-800 text-lg mb-2 mt-1">
                  1. Recuperação do Nível de Serviço ({metrics?.fulfillmentRate || 0}%)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  {(metrics?.fulfillmentRate || 0) < 75 
                    ? "Uma porção significativa das solicitações não está sendo totalmente atendida. Isso pode comprometer a assistência e gerar retrabalho contínuo da enfermagem ao solicitar itens em falta."
                    : "A taxa está em um patamar saudável, indicando uma boa cobertura de estoque, mas exige monitoramento contínuo sobre os itens pendentes."}
                </p>
                <div className="mt-auto bg-slate-50 p-4 rounded-lg">
                  <span className="text-xs font-bold uppercase text-slate-500 mb-3 block">Passos Recomendados:</span>
                  <ul className="text-sm text-slate-700 space-y-3">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Auditoria de Rupturas:</strong> Filtre a tabela abaixo por status "Item não dispensado" e identifique se os motivos são por ruptura real de estoque, problemas de cadastro do item ou cancelamento de prescrição.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Alinhamento Clínico:</strong> Criar um protocolo rápido para a farmácia sugerir alternativas terapêuticas imediatamente aos médicos quando um medicamento crítico entra em falta.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Plano 2: Gestão de Curva A */}
              <div className="p-5 rounded-xl border border-slate-200 flex flex-col h-full relative overflow-hidden bg-white hover:shadow-md transition-shadow">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500"></div>
                <h3 className="font-bold text-slate-800 text-lg mb-2 mt-1">
                  2. Controle da Curva A (Alto Impacto)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  O produto <strong>{metrics?.topProducts[0]?.name || 'N/A'}</strong> domina o volume de saídas com {metrics?.topProducts[0]?.requested?.toLocaleString('pt-PT') || 0} unidades pedidas. Falhas nestes itens param a operação.
                </p>
                <div className="mt-auto bg-slate-50 p-4 rounded-lg">
                  <span className="text-xs font-bold uppercase text-slate-500 mb-3 block">Passos Recomendados:</span>
                  <ul className="text-sm text-slate-700 space-y-3">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Ajuste do Ponto de Encomenda:</strong> Calcule o consumo médio diário deste Top 5 e aumente os gatilhos de estoque de segurança no ERP (ex: Tasy/MV) para antecipar compras.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Gestão à Vista:</strong> Estes produtos de alto giro devem ser posicionados nas prateleiras mais próximas da bancada de triagem da farmácia, minimizando o tempo de deslocamento da equipe.</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Plano 3: Escalas e Horários */}
              <div className="p-5 rounded-xl border border-slate-200 flex flex-col h-full relative overflow-hidden bg-white hover:shadow-md transition-shadow">
                <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
                <h3 className="font-bold text-slate-800 text-lg mb-2 mt-1">
                  3. Otimização do Fluxo de Trabalho (RH)
                </h3>
                <p className="text-sm text-slate-600 mb-4">
                  Foi detectado que as {metrics?.peakHourInfo?.hour} formam o pico da operação da farmácia. A velocidade e precisão da equipe são mais testadas nestes momentos.
                </p>
                <div className="mt-auto bg-slate-50 p-4 rounded-lg">
                  <span className="text-xs font-bold uppercase text-slate-500 mb-3 block">Passos Recomendados:</span>
                  <ul className="text-sm text-slate-700 space-y-3">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Distribuição de Pausas:</strong> Garanta que horários de refeição ou passagem de turno da equipe da farmácia nunca coincidam com este pico.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Trabalho Antecipado:</strong> Utilize os vales (horários com poucas movimentações visíveis no gráfico) para montar "kits" de procedimentos padronizados e fracionamento de blisters, desanuviando as horas de pico.</span>
                    </li>
                  </ul>
                </div>
              </div>

               {/* Plano 4: Anomalias e Qualidade */}
               <div className="p-5 rounded-xl border border-slate-200 flex flex-col h-full relative overflow-hidden bg-white hover:shadow-md transition-shadow">
                  <div className={`absolute top-0 left-0 w-full h-1 ${(metrics?.statusCounts['Item dispensado a mais'] || 0) > 0 || (metrics?.typeCounts['DEVOL. PACIENTE'] || 0) > 0 ? 'bg-amber-500' : 'bg-slate-400'}`}></div>
                  <h3 className="font-bold text-slate-800 text-lg mb-2 mt-1">
                    4. Qualidade e Desperdício
                  </h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Com {metrics?.statusCounts['Item dispensado a mais'] || 0} itens faturados/dispensados "a mais" e um volume focado em Devoluções de Paciente, existem lacunas de processo a corrigir.
                  </p>
                  <div className="mt-auto bg-slate-50 p-4 rounded-lg">
                  <span className="text-xs font-bold uppercase text-slate-500 mb-3 block">Passos Recomendados:</span>
                  <ul className="text-sm text-slate-700 space-y-3">
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Treinamento de Fracionamento:</strong> Dispensas "a mais" ocorrem frequentemente por ausência de conversão (ex: prescrição pede 5ml, mas a farmácia baixa 1 frasco inteiro de 100ml no sistema). Treinar a equipe a dar baixa apenas da fração correta.</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0"/>
                      <span><strong>Mapeamento de Devoluções:</strong> Altos índices de devolução geram risco de contaminação e perda de tempo de reposição. Crie a rotina de auditar o setor de enfermagem que mais devolve itens.</span>
                    </li>
                  </ul>
                </div>
                </div>

            </div>
        </div>

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <BarChart2 className="w-8 h-8 text-indigo-600" />
              Análise de Dispensação
            </h1>
            <p className="text-slate-500 font-medium mt-1">Métricas de atendimento, desempenho por horário e volumetria de prescrições.</p>
          </div>
          <div className="flex gap-3">
            {/* ... buttons ... */}
          </div>
        </div>

        <PanelGuide 
          sections={[
            {
              title: "Status de Atendimento",
              content: "Classifica cada pedido como 'Dispensado Total', 'Parcial' ou 'Pendente', demonstrando o nível de serviço da farmácia.",
              icon: <ClipboardList className="w-4 h-4" />
            },
            {
              title: "Demandas por Horário",
              content: "Visualiza o volume de prescrições agrupadas por hora, permitindo o escalonamento eficiente da equipe de separação.",
              icon: <BarChart3 className="w-4 h-4" />
            },
            {
              title: "Rastreabilidade de Usuário",
              content: "Rastreia quem solicitou e quem dispensou cada item, criando um log simplificado para segurança e auditoria do processo.",
              icon: <UserCheck className="w-4 h-4" />
            }
          ]}
        />

        {/* Secção Nova: Tabela Detalhada */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h2 className="text-lg font-bold flex items-center gap-2 text-slate-800 whitespace-nowrap">
              <Filter className="w-5 h-5 text-slate-400" />
              Detalhamento de Movimentações
            </h2>
            
            {/* Agrupamento de Filtros */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
              {/* Filtro de Tipo */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Tipo:</span>
                <select 
                  className="w-full sm:w-auto text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={filterType}
                  onChange={(e) => {
                    setFilterType(e.target.value);
                    setCurrentPage(1); // Resetar página ao filtrar
                  }}
                >
                  <option value="Todos">Todos os Tipos</option>
                  {Object.keys(metrics?.typeRowCounts || {}).map(type => (
                    <option key={type} value={type}>
                      {type} ({metrics?.typeRowCounts[type]})
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro de Status */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-sm text-slate-500 font-medium whitespace-nowrap">Status:</span>
                <select 
                  className="w-full sm:w-auto text-sm border border-slate-300 rounded-lg px-3 py-2 bg-slate-50 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  value={filterStatus}
                  onChange={(e) => {
                    setFilterStatus(e.target.value);
                    setCurrentPage(1); // Resetar página ao filtrar
                  }}
                >
                  <option value="Todos">Todos os Status</option>
                  {Object.keys(metrics?.statusCounts || {}).map(status => (
                    <option key={status} value={status}>
                      {status} ({metrics?.statusCounts[status]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-semibold border-b border-slate-200">Solicitação</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200">Data e Hora</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200">Tipo</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200">Usuário</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200 min-w-[200px]">Produto</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200 text-right">Ped.</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200 text-right">Entr.</th>
                  <th className="px-4 py-3 font-semibold border-b border-slate-200">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-700 divide-y divide-slate-100">
                {paginatedData.length > 0 ? paginatedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 font-medium">{row.reqId}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {row.date} {row.time && <span className="text-slate-400 text-xs ml-1">{row.time}</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {row.type === 'DEVOL. PACIENTE' ? (
                         <span className="text-amber-600">{row.type}</span>
                      ) : row.type === 'PEDIDO PACIENTE' ? (
                         <span className="text-blue-600">{row.type}</span>
                      ) : (
                         <span>{row.type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[120px]" title={row.user}>{row.user}</td>
                    <td className="px-4 py-3 text-slate-800 truncate max-w-[200px]" title={row.product}>{row.product}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-600">{row.requested}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{row.dispensed}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border border-slate-200 bg-white shadow-sm text-slate-700">
                        <span className={`w-2 h-2 rounded-full mr-2 ${getStatusColor(row.status)}`}></span>
                        {row.status}
                      </span>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                      Nenhum registro encontrado com os filtros atuais. Tente alterar o "Tipo" ou o "Status".
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
              <p className="text-sm text-slate-500">
                Mostrando <span className="font-semibold text-slate-700">{filteredTableData.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}</span> a <span className="font-semibold text-slate-700">{Math.min(currentPage * itemsPerPage, filteredTableData.length)}</span> de <span className="font-semibold text-slate-700">{filteredTableData.length}</span> resultados
              </p>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Página Anterior"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600" />
                </button>
                <span className="text-sm text-slate-600 font-medium px-2">
                  Página {currentPage} de {totalPages}
                </span>
                <button 
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 border border-slate-300 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Próxima Página"
                >
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

// Componente utilitário para os Cards
interface KpiCardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  subtitle?: string;
  alert?: boolean;
}

function KpiCard({ title, value, icon, subtitle, alert }: KpiCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border ${alert ? 'border-orange-200 bg-orange-50/30' : 'border-slate-200'} p-6 flex flex-col`}>
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h3>
        <div className="p-2 bg-slate-50 rounded-lg">
          {icon}
        </div>
      </div>
      <div className="mt-auto">
        <span className={`text-3xl font-bold ${alert ? 'text-orange-600' : 'text-slate-900'}`}>{value}</span>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}
