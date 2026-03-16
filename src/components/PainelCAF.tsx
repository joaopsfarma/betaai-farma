import React, { useState, useMemo } from 'react';
import { Upload, FileSpreadsheet, Package, TrendingUp, Activity, Layers, ArrowDownToLine, Database, Target, ShieldCheck as ShieldIcon, DollarSign, TrendingDown, AlertTriangle, CheckCircle, Clock, Search, Filter, AlertOctagon, Info, Printer, Pill, BriefcaseMedical, LayoutList, CalendarRange, MapPin } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPDFHeader, drawPDFFooters, drawKPICards, PDF_COLORS } from '../utils/pdfExport';

// --- Parser CSV Customizado (Robusto para lidar com aspas e vírgulas) ---
const parseCSV = (text: string) => {
  let rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    let char = text[i];
    let nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentCell += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentCell.trim());
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        if (char === '\r') i++;
      } else {
        currentCell += char;
      }
    }
  }
  if (currentRow.length > 0 || currentCell !== '') {
    currentRow.push(currentCell.trim());
    rows.push(currentRow);
  }
  return rows;
};

// Conversor de números no formato "1.000,50" ou "1000" para Float
const parseLocalNum = (str: any) => {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  let s = String(str).replace(/\./g, '').replace(',', '.');
  let n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Função para converter data "DD/MM/YYYY" em objeto Date
const parseDateBR = (dateStr: string) => {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  // Mês é 0-indexado no JavaScript
  return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
};

// Calcula a diferença em dias entre duas datas (com sinal: negativo = passado/atrasado, positivo = futuro)
const diffDaysSigned = (hoje: Date, dataFutura: Date) => {
  if (!hoje || !dataFutura) return 0;
  // Ignorar horas para comparar apenas os dias exatos
  const d1 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const d2 = new Date(dataFutura.getFullYear(), dataFutura.getMonth(), dataFutura.getDate());
  const diffTime = d2.getTime() - d1.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
};

export const PainelCAF: React.FC = () => {
  const [activeTab, setActiveTab] = useState('acompanhamento');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Novos estados para os filtros
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [fornecedorFilter, setFornecedorFilter] = useState('Todos');
  const [grupoFilter, setGrupoFilter] = useState('Todos'); // Novo Filtro
  
  // Estados para armazenar os dados crus processados
  const [ordersData, setOrdersData] = useState<any[]>([]);
  const [consumptionData, setConsumptionData] = useState<any[]>([]);
  const [stockData, setStockData] = useState<any[]>([]);
  const [consumptionDays, setConsumptionDays] = useState<string[]>([]); // Novo estado para armazenar as datas dinâmicas dos dias
  
  // Status de upload
  const [filesLoaded, setFilesLoaded] = useState({
    ordens: false,
    consumo: false,
    estoque: false
  });

  // Estado para ordenação
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const renderSortIcon = (key: string) => {
    if (!sortConfig || sortConfig.key !== key) {
      return <ArrowDownToLine className="w-3 h-3 inline-block ml-1 opacity-20" />;
    }
    return sortConfig.direction === 'asc' ? 
      <ArrowDownToLine className="w-3 h-3 inline-block ml-1 transform rotate-180" /> : 
      <ArrowDownToLine className="w-3 h-3 inline-block ml-1" />;
  };

  // --- Handlers de Upload de Arquivo ---
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'ordens' | 'consumo' | 'estoque') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = parseCSV(text);
      
      if (type === 'ordens') processOrders(rows);
      if (type === 'consumo') processConsumption(rows);
      if (type === 'estoque') processStock(rows);
      
      setFilesLoaded(prev => ({ ...prev, [type]: true }));
    };
    reader.readAsText(file, 'ISO-8859-1'); // ISO-8859-1 ajuda com acentos em CSV padrão do Windows/Excel
  };

  // Função heurística para determinar se é Medicamento ou Material (Pode ser ajustada)
  const classificarGrupo = (nome: string, unidade: string) => {
    const n = String(nome).toUpperCase();
    const u = String(unidade).toUpperCase();

    // Palavras-chave comuns para Materiais Médicos/Hospitalares
    const materiaisKeywords = ['SERINGA', 'AGULHA', 'CATETER', 'CURATIVO', 'ATADURA', 'ESCALPE', 'LUVA', 'SONDA', 'COMPRESSA', 'FRALDA', 'COLETOR', 'EQUIPO', 'FIO SUTURA', 'PANO', 'BOBINA', 'SACHE', 'PLASTICO'];
    
    // Palavras-chave comuns para Medicamentos (Geralmente Unidades específicas ou formas farmaceuticas)
    const medKeywords = ['AMPOLA', 'COMPRIMIDO', 'FRASCO', 'MG', 'ML', 'UI', 'CAPSULA', 'GOTAS', 'XAROPE', 'SUSPENSAO', 'COMP REV'];

    if (materiaisKeywords.some(kw => n.includes(kw))) return 'Material';
    if (medKeywords.some(kw => n.includes(kw) || u.includes(kw))) return 'Medicamento';
    
    return 'Outros'; // Caso não consiga classificar
  };

  const processOrders = (rows: string[][]) => {
    let data: any[] = [];
    let currentOC = '-';
    let currentForn = 'N/A';

    rows.forEach(r => {
        let dt = String(r[0]).trim();
        // Verifica se a primeira coluna é uma data
        if (r.length > 3 && dt.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
            
            // Busca a assinatura única de um produto: [Código(Num), Nome(Str), Unidade(Str), Saldo(Num)]
            let prodIdx = -1;
            for (let i = 1; i < r.length - 3; i++) {
                let v1 = String(r[i]).trim();
                let v2 = String(r[i+1]).trim();
                let v3 = String(r[i+2]).trim();
                let v4 = String(r[i+3]).trim();
                
                if (v1 !== '' && !isNaN(Number(v1)) && 
                    v2 !== '' && isNaN(Number(v2)) && 
                    v3 !== '' && isNaN(Number(v3)) && 
                    v4 !== '' && !isNaN(parseLocalNum(v4))) {
                    prodIdx = i;
                    break;
                }
            }

            if (prodIdx !== -1) {
                // Produto Encontrado!
                
                // 1. Identificar OC e Fornecedor (estão antes do produto)
                let beforeProd = [];
                for (let j = 1; j < prodIdx; j++) {
                    let val = String(r[j]).trim();
                    if (val !== '') beforeProd.push(val);
                }
                
                if (beforeProd.length >= 3) {
                    currentOC = beforeProd[0];
                    currentForn = beforeProd[2]; // Index 1 é o ID do Fornecedor
                } else if (beforeProd.length >= 1) {
                    currentOC = beforeProd[0];
                }

                // 2. Identificar Quantidades (estão depois da unidade do produto)
                let afterUnidade = [];
                for (let j = prodIdx + 3; j < r.length; j++) {
                    let val = String(r[j]).trim();
                    if (val !== '') afterUnidade.push(parseLocalNum(val));
                }

                let pId = String(r[prodIdx]).trim();
                let pNome = String(r[prodIdx + 1]).trim();
                let pUnidade = String(r[prodIdx + 2]).trim();
                
                // As quantidades seguem a ordem: [0]Saldo, [1]QtComprada, [2]QtRecebida
                let qtComp = afterUnidade.length > 1 ? afterUnidade[1] : 0;
                let qtRec = afterUnidade.length > 2 ? afterUnidade[2] : 0;

                data.push({
                    dtPrevista: dt,
                    oc: currentOC,
                    fornecedor: currentForn,
                    produtoId: pId,
                    produtoNome: pNome,
                    unidade: pUnidade,
                    grupo: classificarGrupo(pNome, pUnidade),
                    qtComprada: qtComp,
                    qtRecebida: qtRec,
                    qtPendente: Math.max(0, qtComp - qtRec)
                });
            } else {
                // Linha de Cabeçalho sem produto (apenas herança de OC e Fornecedor para a próxima linha)
                let beforeProd = [];
                for (let j = 1; j < r.length; j++) {
                    let val = String(r[j]).trim();
                    if (val !== '') beforeProd.push(val);
                }
                if (beforeProd.length >= 3) {
                    currentOC = beforeProd[0];
                    currentForn = beforeProd[2];
                }
            }
        }
    });
    setOrdersData(data);
  };

  const processConsumption = (rows: string[][]) => {
    let data: any[] = [];
    let cDays = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']; // Nomes padrão caso não encontre no cabeçalho
    let totalIdx = 9;
    let mediaIdx = 10;

    // 1. Procurar os cabeçalhos dos dias dinamicamente (procurando pela coluna "Total")
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      let r = rows[i];
      let tIdx = r.findIndex(val => String(val).trim().toUpperCase() === 'TOTAL');
      let mIdx = r.findIndex(val => String(val).trim().toUpperCase() === 'MÉDIA' || String(val).trim().toUpperCase() === 'MEDIA');
      
      if (tIdx > 3) {
        // Captura os cabeçalhos dos dias (da coluna 3 até à coluna Total)
        cDays = r.slice(3, tIdx).map(h => String(h).trim() || '-');
        totalIdx = tIdx;
        mediaIdx = mIdx !== -1 ? mIdx : tIdx + 1;
        break;
      }
    }
    setConsumptionDays(cDays);

    // 2. Processar os dados extraindo a nova matriz de dias
    rows.forEach(r => {
      // Assume que a linha é de dados se a coluna 0 for um número (ID do produto)
      if (r.length > Math.max(totalIdx, mediaIdx) && r[0] && !isNaN(Number(r[0])) && r[0].trim() !== '') {
        const nome = r[1] || 'Produto Desconhecido';
        const unidade = r[2] || '';

        // Extrai o consumo de cada dia isoladamente
        let diasVals = [];
        for (let i = 0; i < cDays.length; i++) {
          diasVals.push(parseLocalNum(r[3 + i]));
        }

        const mediaExata = parseLocalNum(r[mediaIdx]);

        data.push({
          id: String(r[0]).trim(),
          nome: nome,
          unidade: unidade,
          grupo: classificarGrupo(nome, unidade),
          dias: diasVals, // Adiciona o array de consumos diários
          total5dias: Math.round(parseLocalNum(r[totalIdx])),
          mediaDiariaExata: mediaExata,
          mediaDiaria: Math.ceil(mediaExata) // Arredonda para cima, pois não se consome "meio" produto fisicamente
        });
      }
    });
    setConsumptionData(data);
  };

  const processStock = (rows: string[][]) => {
    let dataMap = new Map();
    rows.forEach(r => {
      // Estrutura CONF501: coluna 1 é ID, coluna 2 é Nome, coluna 6 é Estoque Atual
      if (r.length > 6 && r[1] && !isNaN(Number(r[1])) && r[1].trim() !== '') {
        const id = String(r[1]).trim();
        const nome = r[2] || '';
        const unidade = r[3] || '';
        const qty = parseLocalNum(r[6]);
        const grupo = classificarGrupo(nome, unidade);
        
        if (dataMap.has(id)) {
          dataMap.get(id).estoqueAtual += qty; // Soma lotes diferentes
        } else {
          dataMap.set(id, { id, nome, unidade, grupo, estoqueAtual: qty });
        }
      }
    });
    setStockData(Array.from(dataMap.values()));
  };

  // --- Processamento Unificado para Acompanhamento ---
  
  // Obter lista única de fornecedores para o dropdown
  const uniqueFornecedores = useMemo(() => {
    const fornecedores = ordersData.map(o => o.fornecedor).filter(Boolean);
    return [...new Set(fornecedores)].sort();
  }, [ordersData]);

  const trackingData = useMemo(() => {
    if (!ordersData.length) return [];
    
    const hoje = new Date();
    
    let result = ordersData.map(order => {
      const stock = stockData.find(s => s.id === order.produtoId) || { estoqueAtual: 0 };
      const cons = consumptionData.find(c => c.id === order.produtoId) || { mediaDiariaExata: 0, mediaDiaria: 0, total5dias: 0 };

      // Usamos a média exata (quebrada) para o cálculo matemático da cobertura ser preciso
      const diasCoberturaAtual = cons.mediaDiariaExata > 0 ? (stock.estoqueAtual / cons.mediaDiariaExata) : 999;
      
      let status = 'OK';
      let statusColor = 'bg-green-100 text-green-800';
      
      if (diasCoberturaAtual <= 2) {
        status = 'Crítico';
        statusColor = 'bg-red-100 text-red-800';
      } else if (diasCoberturaAtual <= 5) {
        status = 'Atenção';
        statusColor = 'bg-yellow-100 text-yellow-800';
      }

      // Lógica Avançada de Alertas e Ações
      const dtPrevistaObj = parseDateBR(order.dtPrevista);
      const diasAteEntrega = dtPrevistaObj ? diffDaysSigned(hoje, dtPrevistaObj) : 0;
      
      let alerta = null;
      let acao = "Aguardar Entrega";
      let acaoColor = "text-gray-500";

      if (stock.estoqueAtual === 0) {
        if (cons.mediaDiariaExata > 0) {
          // Estoque zero E existe histórico de consumo: RUPTURA REAL
          if (diasAteEntrega < 0) {
             alerta = `RUPTURA E ATRASO (${Math.abs(diasAteEntrega)}d)`;
             acao = "Contatar Fornecedor URGENTE";
             acaoColor = "text-red-700 font-bold";
          } else if (diasAteEntrega === 0) {
             alerta = "RUPTURA (Chega Hoje)";
             acao = "Cobrar Entrega Hoje";
             acaoColor = "text-orange-600 font-bold";
          } else {
             alerta = `RUPTURA (Chega em ${diasAteEntrega}d)`;
             acao = "Solicitar Empréstimo/Antecipar";
             acaoColor = "text-red-600 font-bold";
          }
        } else {
          // Estoque zero, MAS não houve consumo nos últimos dias: APENAS ACOMPANHAR
          status = 'Atenção';
          statusColor = 'bg-yellow-100 text-yellow-800';
          alerta = diasAteEntrega < 0 ? `Sem Estoque / Atrasado (${Math.abs(diasAteEntrega)}d)` : "Estoque Zerado (Sem consumo 5d)";
          acao = diasAteEntrega < 0 ? "Cobrar Fornecedor" : "Acompanhar Chegada";
          acaoColor = diasAteEntrega < 0 ? "text-red-500 font-medium" : "text-orange-500 font-medium";
        }
      } else {
        // TEM ESTOQUE
        if (diasAteEntrega < 0) {
          alerta = `ENTREGA ATRASADA (${Math.abs(diasAteEntrega)}d)`;
          acao = "Cobrar Fornecedor";
          acaoColor = "text-red-600 font-bold";
          // Agrava o status para Atenção se estiver OK
          if (status === 'OK') {
             status = 'Atenção';
             statusColor = 'bg-yellow-100 text-yellow-800';
          }
        } else if (cons.mediaDiariaExata > 0 && diasCoberturaAtual < diasAteEntrega) {
          // A matemática diz que vai acabar antes de chegar
          alerta = `Estoque acaba antes da entrega (Faltam ${Math.ceil(diasAteEntrega - diasCoberturaAtual)}d)`;
          acao = "Acelerar Entrega / Empréstimo";
          acaoColor = "text-orange-600 font-bold";
          // Força status crítico pois vai faltar
          status = 'Crítico';
          statusColor = 'bg-red-100 text-red-800';
        } else if (status === 'Crítico') {
           acao = "Monitorar Diariamente";
           acaoColor = "text-yellow-600 font-medium";
         } else if (status === 'Atenção') {
           acao = "Confirmar Entrega";
           acaoColor = "text-blue-600 font-medium";
         }
      }

      return {
        ...order,
        estoqueAtualCAF: stock.estoqueAtual,
        consumoMedio: cons.mediaDiaria, // Usado para exibição, mas agora vamos usar o total na tabela
        consumoTotal5d: cons.total5dias, // <-- Campo que usaremos para exibir o Consumo Total
        diasCoberturaAtual: diasCoberturaAtual === 999 ? '> 99' : diasCoberturaAtual.toFixed(1),
        status,
        statusColor,
        alerta,
        acao,
        acaoColor
      };
    });

    // Filtro de Pesquisa em Texto
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.produtoNome.toLowerCase().includes(lowerQuery) || 
        item.produtoId.includes(lowerQuery) ||
        item.oc.includes(lowerQuery)
      );
    }

    // Filtro de Status
    if (statusFilter !== 'Todos') {
      result = result.filter(item => item.status === statusFilter);
    }

    // Filtro de Fornecedor
    if (fornecedorFilter !== 'Todos') {
      result = result.filter(item => item.fornecedor === fornecedorFilter);
    }

    // Filtro de Grupo
    if (grupoFilter !== 'Todos') {
      result = result.filter(item => item.grupo === grupoFilter);
    }

    return result;
  }, [ordersData, consumptionData, stockData, searchQuery, statusFilter, fornecedorFilter, grupoFilter]);


  const filteredConsumptionData = useMemo(() => {
      let result = consumptionData;
      if (grupoFilter !== 'Todos') {
        result = result.filter(item => item.grupo === grupoFilter);
      }
      if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          result = result.filter(item => item.nome.toLowerCase().includes(lowerQuery) || item.id.includes(lowerQuery));
      }
      return result;
  }, [consumptionData, grupoFilter, searchQuery]);

  const filteredStockData = useMemo(() => {
      let result = stockData;
      if (grupoFilter !== 'Todos') {
        result = result.filter(item => item.grupo === grupoFilter);
      }
      if (searchQuery) {
          const lowerQuery = searchQuery.toLowerCase();
          result = result.filter(item => item.nome.toLowerCase().includes(lowerQuery) || item.id.includes(lowerQuery));
      }
      return result;
  }, [stockData, grupoFilter, searchQuery]);

  const sortedTrackingData = useMemo(() => {
    let sortableItems = [...trackingData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        
        if (sortConfig.key === 'dtPrevista') {
           aValue = parseDateBR(aValue)?.getTime() || 0;
           bValue = parseDateBR(bValue)?.getTime() || 0;
        } else if (sortConfig.key === 'diasCoberturaAtual') {
           aValue = aValue === '> 99' ? 999 : parseFloat(aValue);
           bValue = bValue === '> 99' ? 999 : parseFloat(bValue);
        }

        if (aValue < bValue) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [trackingData, sortConfig]);

  const sortedConsumptionData = useMemo(() => {
    let sortableItems = [...filteredConsumptionData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredConsumptionData, sortConfig]);

  const sortedStockData = useMemo(() => {
    let sortableItems = [...filteredStockData];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key];
        let bValue = b[sortConfig.key];
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredStockData, sortConfig]);

  // --- Resumo de Dados (Métricas) ---
  const summaryMetrics = useMemo(() => {
    if (!trackingData.length) return null;
    return {
      total: trackingData.length,
      critico: trackingData.filter(i => i.status === 'Crítico').length,
      atencao: trackingData.filter(i => i.status === 'Atenção').length,
      ok: trackingData.filter(i => i.status === 'OK').length,
      rutura: trackingData.filter(i => i.estoqueAtualCAF === 0).length
    };
  }, [trackingData]);


  // --- Renderizadores de UI ---

  const renderUploadCard = (title: string, type: 'ordens' | 'consumo' | 'estoque', isLoaded: boolean, icon: React.ReactNode) => (
    <div className={`p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors print:hidden ${isLoaded ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400 bg-white'}`}>
      <div className={`p-3 rounded-full mb-3 ${isLoaded ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
        {isLoaded ? <CheckCircle size={24} /> : icon}
      </div>
      <h3 className="font-semibold text-gray-700 text-sm mb-2">{title}</h3>
      <label className="cursor-pointer bg-white px-4 py-2 border border-gray-300 rounded-lg shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
        {isLoaded ? 'Substituir Arquivo' : 'Selecionar CSV'}
        <input type="file" accept=".csv" className="hidden" onChange={(e) => handleFileUpload(e, type)} />
      </label>
    </div>
  );

  const handleExportPDF = () => {
    let dataToExport: any[] = [];
    let headers: string[] = [];
    let title = '';
    let subtitle = '';

    if (activeTab === 'acompanhamento') {
      title = 'Acompanhamento Inteligente — CAF';
      subtitle = 'Ordens de compra, cobertura e alertas de ruptura';
      headers = ['Previsão', 'OC', 'Produto', 'Código', 'Forn.', 'Grupo', 'A Receber', 'Est. CAF', 'Cons. 5d', 'Cobertura', 'Status', 'Alerta', 'Ação'];
      dataToExport = sortedTrackingData.map(row => [
        row.dtPrevista, row.oc, row.produtoNome, row.produtoId, row.fornecedor,
        row.grupo, row.qtPendente, row.estoqueAtualCAF, row.consumoTotal5d,
        row.diasCoberturaAtual, row.status, row.alerta || '', row.acao,
      ]);
    } else if (activeTab === 'consumo') {
      title = 'Consumo em 5 Dias — CAF';
      subtitle = 'Histórico de consumo diário por produto';
      headers = ['Código', 'Produto', 'Grupo', 'OC', ...consumptionDays.map(d => `Dia ${d}`), 'Total 5d', 'Média/Dia'];
      dataToExport = sortedConsumptionData.map(row => {
        const ocInfo = ordersData.find(o => o.produtoId === row.id)?.oc || '-';
        return [row.id, row.nome, row.grupo, ocInfo, ...row.dias, row.total5dias, row.mediaDiaria];
      });
    } else if (activeTab === 'estoque') {
      title = 'Estoque Atual — CAF';
      subtitle = 'Saldo físico por produto';
      headers = ['Código', 'Produto', 'Unidade', 'Grupo', 'Estoque Físico'];
      dataToExport = sortedStockData.map(row => [row.id, row.nome, row.unidade, row.grupo, row.estoqueAtual]);
    }

    if (dataToExport.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const doc = new jsPDF('landscape' as any);
    const color = PDF_COLORS.indigo;

    let currentY = drawPDFHeader(doc, title, subtitle, color);

    currentY = drawKPICards(doc, [
      { label: 'Total de Registros', value: dataToExport.length.toString(), color: PDF_COLORS.indigo },
      { label: 'Aba Atual', value: activeTab.charAt(0).toUpperCase() + activeTab.slice(1), color: PDF_COLORS.slate },
    ], currentY);

    autoTable(doc, {
      head: [headers],
      body: dataToExport,
      startY: currentY + 2,
      theme: 'grid',
      margin: { left: 10, right: 10, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });

    drawPDFFooters(doc, color);
    doc.save(`exportacao_${activeTab}_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const handleExportCSV = () => {
    let dataToExport: any[] = [];
    let headers: string[] = [];

    if (activeTab === 'acompanhamento') {
      headers = ['Previsão', 'OC', 'Produto', 'Código', 'Fornecedor', 'Grupo', 'A Receber', 'Estoque CAF', 'Consumo Total', 'Cobertura', 'Status', 'Alerta', 'Ação'];
      dataToExport = trackingData.map(row => [
        row.dtPrevista,
        row.oc,
        row.produtoNome,
        row.produtoId,
        row.fornecedor,
        row.grupo,
        row.qtPendente,
        row.estoqueAtualCAF,
        row.consumoTotal5d,
        row.diasCoberturaAtual,
        row.status,
        row.alerta || '',
        row.acao
      ]);
    } else if (activeTab === 'consumo') {
      headers = ['Código', 'Produto', 'Grupo', 'Ordem Compra', ...consumptionDays.map(d => `Dia ${d}`), 'Consumo Total', 'Média Diária'];
      dataToExport = filteredConsumptionData.map(row => {
        const ocInfo = ordersData.find(o => o.produtoId === row.id)?.oc || '-';
        return [
          row.id,
          row.nome,
          row.grupo,
          ocInfo,
          ...row.dias,
          row.total5dias,
          row.mediaDiaria
        ];
      });
    } else if (activeTab === 'estoque') {
      headers = ['Código', 'Produto', 'Unidade', 'Grupo', 'Estoque Físico Atual'];
      dataToExport = filteredStockData.map(row => [
        row.id,
        row.nome,
        row.unidade,
        row.grupo,
        row.estoqueAtual
      ]);
    }

    if (dataToExport.length === 0) {
      alert('Não há dados para exportar.');
      return;
    }

    const csvContent = [
      headers.join(';'),
      ...dataToExport.map(row => row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `exportacao_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderGrupoIcon = (grupo: string) => {
    if (grupo === 'Medicamento') return <Pill className="w-4 h-4 text-purple-500 inline mr-1" />;
    if (grupo === 'Material') return <BriefcaseMedical className="w-4 h-4 text-teal-500 inline mr-1" />;
    return <Package className="w-4 h-4 text-gray-400 inline mr-1" />;
  };

  return (
    <div className="bg-gray-50 text-gray-800 font-sans p-6 print:p-0 print:bg-white">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto space-y-6 print:space-y-4 print:max-w-full">
        
        {/* Cabeçalho */}
      <div className="mb-8 relative z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-indigo-600 rounded-xl text-white">
                <BriefcaseMedical className="w-8 h-8" />
              </div>
              Controle de Estoque: CAF
            </h1>
            <p className="text-slate-500 font-medium mt-1">Gestão central de abastecimento, validade e volumetria do almoxarifado.</p>
          </div>
          <div className="flex gap-3">
             <button 
              onClick={handleExportCSV}
              className="mt-4 md:mt-0 flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-600 transition print:hidden shadow-sm"
            >
              <FileSpreadsheet size={18} />
              Exportar CSV
            </button>
             <button 
              onClick={handleExportPDF}
              className="mt-4 md:mt-0 flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition print:hidden shadow-sm"
            >
              <Printer size={18} />
              Exportar PDF
            </button>
          </div>
        </div>
        
        <div className="mt-8">
          <PanelGuide 
            sections={[
              {
                title: "Classificação ABC",
                content: "Divide o estoque em categorias de valor. A Classe A representa itens de alto custo que exigem controle e auditoria rigorosos.",
                icon: <LayoutList className="w-4 h-4" />
              },
              {
                title: "Monitoramento de Validade",
                content: "Alertas visuais para itens que vencem nos próximos 90 dias, permitindo ações preventivas de dispersão ou troca com o fornecedor.",
                icon: <CalendarRange className="w-4 h-4" />
              },
              {
                title: "Ocupação e Logística",
                content: "Gerencia a posição física dos itens no almoxarifado central, otimizando o fluxo de separação e garantindo o padrão FIFO.",
                icon: <MapPin className="w-4 h-4" />
              }
            ]}
          />
        </div>
      </div>

        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 print:hidden">
          {renderUploadCard("1. Ordem de Compra (R_ORD...)", "ordens", filesLoaded.ordens, <FileSpreadsheet size={24} />)}
          {renderUploadCard("2. Consumo Diário (conbusmo...)", "consumo", filesLoaded.consumo, <TrendingDown size={24} />)}
          {renderUploadCard("3. Estoque Atual (CONF501)", "estoque", filesLoaded.estoque, <Package size={24} />)}
        </div>

        {/* Content Area */}
        {Object.values(filesLoaded).some(Boolean) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col print:border-none print:shadow-none">
            
            {/* Tabs & Search/Filters */}
            <div className="border-b border-gray-200 px-6 py-4 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-gray-50/50 print:hidden">
              <div className="flex space-x-2 w-full xl:w-auto overflow-x-auto pb-2 xl:pb-0">
                <button 
                  onClick={() => setActiveTab('acompanhamento')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'acompanhamento' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Clock className="w-4 h-4" />
                  1. Acompanhamento Inteligente
                </button>
                <button 
                  onClick={() => setActiveTab('consumo')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'consumo' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <TrendingDown className="w-4 h-4" />
                  2. Consumo em 5 Dias
                </button>
                <button 
                  onClick={() => setActiveTab('estoque')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === 'estoque' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Package className="w-4 h-4" />
                  3. Estoque Atual
                </button>
              </div>

              <div className="flex flex-col md:flex-row gap-3 w-full xl:w-auto mt-2 xl:mt-0">
                {/* Filtro de Grupo - Visível em todas as abas */}
                 <select
                      value={grupoFilter}
                      onChange={(e) => setGrupoFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition bg-white w-full md:w-40"
                    >
                      <option value="Todos">Todos (Medic/Mat)</option>
                      <option value="Medicamento">💊 Medicamentos</option>
                      <option value="Material">🧰 Materiais</option>
                      <option value="Outros">Outros</option>
                  </select>

                {/* Filtros visíveis apenas no separador de acompanhamento */}
                {activeTab === 'acompanhamento' && (
                  <>
                    <select
                      value={fornecedorFilter}
                      onChange={(e) => setFornecedorFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition bg-white w-full md:w-48 truncate"
                    >
                      <option value="Todos">Todos os Fornecedores</option>
                      {uniqueFornecedores.map(fornecedor => (
                        <option key={fornecedor} value={fornecedor}>{fornecedor}</option>
                      ))}
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition bg-white w-full md:w-40"
                    >
                      <option value="Todos">Todos os Status</option>
                      <option value="Crítico">🚨 Crítico (≤ 2 dias)</option>
                      <option value="Atenção">⚠️ Atenção (≤ 5 dias)</option>
                      <option value="OK">✅ OK (&gt; 5 dias)</option>
                    </select>
                  </>
                )}

                <div className="relative w-full md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input 
                    type="text" 
                    placeholder="Procurar produto ou OC..." 
                    className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm transition"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Secção de Métricas de Resumo (apenas no acompanhamento) */}
            {activeTab === 'acompanhamento' && summaryMetrics && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6 bg-gray-50 border-b border-gray-200 print:bg-white print:border-none print:p-0 print:mb-4">
                  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col print:border-gray-300">
                    <span className="text-sm text-gray-500 font-medium">Total de Itens</span>
                    <span className="text-2xl font-bold text-gray-800">{summaryMetrics.total}</span>
                  </div>
                  <div className="bg-red-50 p-4 rounded-xl shadow-sm border border-red-100 flex flex-col print:border-red-300">
                    <span className="text-sm text-red-600 font-medium flex items-center gap-1"><AlertOctagon className="w-4 h-4"/> Críticos</span>
                    <span className="text-2xl font-bold text-red-700">{summaryMetrics.critico}</span>
                  </div>
                  <div className="bg-yellow-50 p-4 rounded-xl shadow-sm border border-yellow-100 flex flex-col print:border-yellow-300">
                    <span className="text-sm text-yellow-600 font-medium flex items-center gap-1"><AlertTriangle className="w-4 h-4"/> Atenção</span>
                    <span className="text-2xl font-bold text-yellow-700">{summaryMetrics.atencao}</span>
                  </div>
                  <div className="bg-green-50 p-4 rounded-xl shadow-sm border border-green-100 flex flex-col print:border-green-300">
                    <span className="text-sm text-green-600 font-medium flex items-center gap-1"><CheckCircle className="w-4 h-4"/> Saudável</span>
                    <span className="text-2xl font-bold text-green-700">{summaryMetrics.ok}</span>
                  </div>
                  <div className="bg-orange-50 p-4 rounded-xl shadow-sm border border-orange-100 flex flex-col print:border-orange-300">
                    <span className="text-sm text-orange-600 font-medium flex items-center gap-1"><TrendingUp className="w-4 h-4"/> Ruptura Atual</span>
                    <span className="text-2xl font-bold text-orange-700">{summaryMetrics.rutura}</span>
                  </div>
              </div>
            )}

            {/* Tab: Acompanhamento */}
            {activeTab === 'acompanhamento' && (
              <div className="overflow-x-auto print:overflow-visible">
                {ordersData.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 print:hidden">
                    <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>Faça o upload do arquivo de Ordens de Compra para visualizar este relatório.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-sm print:text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 print:bg-gray-100">
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('dtPrevista')}>Previsão {renderSortIcon('dtPrevista')}</th>
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('oc')}>OC {renderSortIcon('oc')}</th>
                        <th className="p-4 print:p-2 font-semibold min-w-[250px] cursor-pointer hover:bg-gray-100" onClick={() => handleSort('produtoNome')}>Produto {renderSortIcon('produtoNome')}</th>
                        <th className="p-4 print:p-2 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('qtPendente')}>A Receber {renderSortIcon('qtPendente')}</th>
                        <th className="p-4 print:p-2 font-semibold text-right bg-blue-50/50 print:bg-blue-50 cursor-pointer hover:bg-blue-100" onClick={() => handleSort('estoqueAtualCAF')}>Estoque CAF {renderSortIcon('estoqueAtualCAF')}</th>
                        <th className="p-4 print:p-2 font-semibold text-right bg-orange-50/50 print:bg-orange-50 cursor-pointer hover:bg-orange-100" onClick={() => handleSort('consumoTotal5d')}>Consumo Total {renderSortIcon('consumoTotal5d')}</th>
                        <th className="p-4 print:p-2 font-semibold text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('diasCoberturaAtual')}>Cobertura {renderSortIcon('diasCoberturaAtual')}</th>
                        <th className="p-4 print:p-2 font-semibold text-center cursor-pointer hover:bg-gray-100" onClick={() => handleSort('status')}>Status {renderSortIcon('status')}</th>
                        <th className="p-4 print:p-2 font-semibold">Análise & Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 print:divide-gray-200">
                      {sortedTrackingData.map((row, idx) => (
                        <tr key={idx} className={`hover:bg-gray-50 transition-colors ${row.estoqueAtualCAF === 0 ? 'bg-red-50/30 print:bg-red-50' : ''}`}>
                          <td className="p-4 print:p-2 text-gray-900 whitespace-nowrap">{row.dtPrevista}</td>
                          <td className="p-4 print:p-2 font-mono text-gray-600">{row.oc}</td>
                          <td className="p-4 print:p-2">
                            <p className="font-medium text-gray-900 line-clamp-2 print:line-clamp-none">
                              {renderGrupoIcon(row.grupo)}
                              {row.produtoNome}
                            </p>
                            <p className="text-xs text-gray-500">Cód: {row.produtoId} | Forn: {row.fornecedor}</p>
                          </td>
                          <td className="p-4 print:p-2 text-right font-medium text-blue-600">{row.qtPendente}</td>
                          <td className={`p-4 print:p-2 text-right font-medium bg-blue-50/20 print:bg-blue-50 ${row.estoqueAtualCAF === 0 ? 'text-red-600 font-bold' : ''}`}>{row.estoqueAtualCAF}</td>
                          <td className="p-4 print:p-2 text-right font-medium bg-orange-50/20 print:bg-orange-50">{row.consumoTotal5d}</td>
                          <td className="p-4 print:p-2 text-center font-bold text-gray-700">{row.diasCoberturaAtual} {row.diasCoberturaAtual !== '> 99' && 'd'}</td>
                          <td className="p-4 print:p-2 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${row.statusColor} flex items-center justify-center gap-1 w-24 mx-auto print:border print:border-gray-300`}>
                              {row.status === 'Crítico' && <AlertTriangle className="w-3 h-3 print:hidden" />}
                              {row.status}
                            </span>
                          </td>
                          <td className="p-4 print:p-2">
                            {row.alerta && (
                              <p className="text-xs text-red-600 font-semibold mb-1 flex items-center gap-1">
                                <Info className="w-3 h-3 print:hidden" /> {row.alerta}
                              </p>
                            )}
                            <p className={`text-xs ${row.acaoColor}`}>{row.acao}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Consumo */}
            {activeTab === 'consumo' && (
              <div className="overflow-x-auto print:overflow-visible">
                {filteredConsumptionData.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 print:hidden">
                    <TrendingDown className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>Sem dados para exibir. Faça o upload ou altere os filtros.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-sm print:text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 print:bg-gray-100">
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('id')}>Código {renderSortIcon('id')}</th>
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('nome')}>Produto {renderSortIcon('nome')}</th>
                        <th className="p-4 print:p-2 font-semibold">Ordem Compra</th>
                        {/* Colunas Diárias Dinâmicas */}
                        {consumptionDays.map((dia, idx) => (
                          <th key={idx} className="p-4 print:p-2 font-semibold text-center bg-gray-100/50 print:bg-transparent">
                            Dia {dia}
                          </th>
                        ))}
                        <th className="p-4 print:p-2 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('total5dias')}>Consumo Total {renderSortIcon('total5dias')}</th>
                        <th className="p-4 print:p-2 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('mediaDiaria')}>Média Diária {renderSortIcon('mediaDiaria')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 print:divide-gray-200">
                      {sortedConsumptionData.map((row, idx) => {
                         // Buscar a OC associada a este produto (Pega a primeira se houver várias)
                         const ocInfo = ordersData.find(o => o.produtoId === row.id)?.oc || '-';
                         
                         return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="p-4 print:p-2 font-mono text-gray-600">{row.id}</td>
                            <td className="p-4 print:p-2 font-medium text-gray-900">
                               {renderGrupoIcon(row.grupo)}
                               {row.nome}
                            </td>
                            <td className="p-4 print:p-2 font-mono text-gray-600">{ocInfo}</td>
                            
                            {/* Distribuição do consumo diário do produto */}
                            {row.dias.map((d: any, i: number) => (
                              <td key={i} className="p-4 print:p-2 text-center font-medium text-gray-600 bg-gray-50/50 print:bg-transparent">
                                {d}
                              </td>
                            ))}

                            <td className="p-4 print:p-2 text-right">{row.total5dias}</td>
                            <td className="p-4 print:p-2 text-right font-medium text-orange-600">{row.mediaDiaria}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tab: Estoque Atual */}
            {activeTab === 'estoque' && (
              <div className="overflow-x-auto print:overflow-visible">
                {filteredStockData.length === 0 ? (
                  <div className="p-12 text-center text-gray-500 print:hidden">
                    <Package className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p>Sem dados para exibir. Faça o upload ou altere os filtros.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-sm print:text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 print:bg-gray-100">
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('id')}>Código {renderSortIcon('id')}</th>
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('nome')}>Produto {renderSortIcon('nome')}</th>
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('unidade')}>Unidade {renderSortIcon('unidade')}</th>
                        <th className="p-4 print:p-2 font-semibold cursor-pointer hover:bg-gray-100" onClick={() => handleSort('grupo')}>Grupo {renderSortIcon('grupo')}</th>
                        <th className="p-4 print:p-2 font-semibold text-right cursor-pointer hover:bg-gray-100" onClick={() => handleSort('estoqueAtual')}>Estoque Físico Atual {renderSortIcon('estoqueAtual')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 print:divide-gray-200">
                      {sortedStockData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 print:p-2 font-mono text-gray-600">{row.id}</td>
                          <td className="p-4 print:p-2 font-medium text-gray-900">{row.nome}</td>
                          <td className="p-4 print:p-2 text-gray-600">{row.unidade}</td>
                          <td className="p-4 print:p-2">
                             <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold border ${
                               row.grupo === 'Medicamento' ? 'bg-purple-50 text-purple-700 border-purple-100' : 
                               row.grupo === 'Material' ? 'bg-teal-50 text-teal-700 border-teal-100' : 
                               'bg-gray-50 text-gray-600 border-gray-100'
                             }`}>
                               {row.grupo}
                             </span>
                          </td>
                          <td className="p-4 print:p-2 text-right font-bold text-gray-800">{row.estoqueAtual}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
