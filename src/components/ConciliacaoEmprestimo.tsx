import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  UploadCloud, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  DollarSign, 
  Package, 
  Search, 
  Award, 
  Info,
  FileDown,
  Building2,
  Calculator,
  Check,
  X,
  FileText as FileIcon,
  ChevronUp,
  ChevronDown,
  History,
  ShieldCheck,
  FileCheck
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawPDFHeader, drawPDFFooters, drawKPICards, PDF_COLORS } from '../utils/pdfExport';
import { PanelGuide } from './common/PanelGuide';

// --- FUNÇÃO DE PARSER DE CSV ---
const parseCSV = (csvText: string, typeFallback: 'Recebido' | 'Concedido') => {
  const lines = csvText.split(/\r?\n/).filter(l => l.trim() !== '');
  let headerIndex = -1;
  
  for (let i = 0; i < Math.min(15, lines.length); i++) {
    if (lines[i].includes('Tp. Emp.') && lines[i].includes('Status')) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) return [];

  const headers = lines[headerIndex].split(';');
  const dataLines = lines.slice(headerIndex + 1);

  const idxTpEmp = headers.indexOf('Tp. Emp.');
  const idxDtMov = headers.indexOf('Dt. Mov.');
  const idxFornecedor = headers.indexOf('Fornecedor');
  const idxProduto = headers.indexOf('Produto');
  const idxQtd = headers.indexOf('Qtd');
  const idxVlTotal = headers.indexOf('Vl. Total');
  const idxStatus = headers.lastIndexOf('Status');
  const idxEntrada = headers.indexOf('Entrada');
  const idxSaida = headers.findIndex(h => h.trim().toLowerCase() === 'saída' || h.trim().toLowerCase() === 'saida');
  const idxConciliacao = headers.findIndex(h => h.trim().toLowerCase().includes('concilia'));
  const idxObs = headers.findIndex(h => h.trim().toLowerCase().includes('obs. emp'));

  return dataLines.map((line, index) => {
    const cols = line.split(';');
    if (cols.length < idxStatus) return null;

    const supplier = cols[idxFornecedor]?.trim();
    const product = cols[idxProduto]?.trim();

    if (!supplier || !product || supplier === "Desconhecido" || product === "Desconhecido") return null;

    const rawVal = cols[idxVlTotal] || '0';
    const val = parseFloat(rawVal.replace(/\./g, '').replace(',', '.')) || 0;
    const rawQty = cols[idxQtd] || '0';
    const qty = parseInt(rawQty.replace(/\./g, ''), 10) || 0;

    let typeStr = cols[idxTpEmp] || typeFallback;
    let type: 'Recebido' | 'Concedido';
    if (typeStr.toUpperCase().includes('RECEBIDO')) type = 'Recebido';
    else if (typeStr.toUpperCase().includes('CONCEDIDO')) type = 'Concedido';
    else type = typeFallback;

    let entradaId = idxEntrada >= 0 && cols[idxEntrada] ? cols[idxEntrada] : '-';
    let saidaId = idxSaida >= 0 && cols[idxSaida] ? cols[idxSaida] : '-';

    if (type === 'Concedido' && entradaId !== '-' && entradaId !== '') {
      saidaId = entradaId;
      entradaId = '-';
    }

    return {
      id: `${type}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      date: cols[idxDtMov] || '',
      entradaId: entradaId || '-',
      saidaId: saidaId || '-',
      conciliacaoId: idxConciliacao >= 0 && cols[idxConciliacao] ? cols[idxConciliacao] : '-',
      supplier: supplier,
      product: product,
      quantity: qty,
      value: val,
      obs: idxObs >= 0 && cols[idxObs] ? cols[idxObs].trim() : '',
      status: cols[idxStatus] ? cols[idxStatus].trim() : 'Pendente'
    };
  }).filter(Boolean);
};

export const ConciliacaoEmprestimo: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [typeFilter, setTypeFilter] = useState('Todos');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  const [isSupMenuOpen, setIsSupMenuOpen] = useState(false);
  const supMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (supMenuRef.current && !supMenuRef.current.contains(event.target as Node)) {
        setIsSupMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);


  const processFiles = async (files: FileList | null) => {
    if (!files) return;
    let allData: any[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const text = await file.text();
      const typeFallback = file.name.toUpperCase().includes('CONCEDIDO') ? 'Concedido' : 'Recebido';
      allData = [...allData, ...parseCSV(text, typeFallback)];
    }
    setData(allData);
    setSelectedSuppliers([]);
  };

  const uniqueSuppliers = useMemo(() => {
    return Array.from(new Set(data.map(d => d.supplier))).sort();
  }, [data]);

  const kpis = useMemo(() => {
    let totalR = 0, totalC = 0, pCount = 0, entC = 0, saiC = 0, entQ = 0, saiQ = 0;
    data.forEach(item => {
      if (item.type === 'Recebido') { totalR += item.value; entC++; entQ += item.quantity; }
      else { totalC += item.value; saiC++; saiQ += item.quantity; }
      if (['Amarelo', 'Vermelho', 'Pendente'].includes(item.status)) pCount++;
    });
    return { totalR, totalC, saldo: totalR - totalC, pCount, entC, saiC, entQ, saiQ };
  }, [data]);

  const obsRanking = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach(i => {
      if (i.obs && i.obs !== '-' && i.obs.length > 2) {
        const o = i.obs.toUpperCase();
        counts[o] = (counts[o] || 0) + 1;
      }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [data]);

  const filteredData = useMemo(() => {
    let res = data.filter(d => {
      const mT = typeFilter === 'Todos' || d.type === typeFilter;
      const mS = statusFilter === 'Todos' || d.status === statusFilter;
      const mSup = selectedSuppliers.length === 0 || selectedSuppliers.includes(d.supplier);
      const sL = searchTerm.toLowerCase();
      const mSe = searchTerm === '' || 
                  d.supplier.toLowerCase().includes(sL) || 
                  d.product.toLowerCase().includes(sL) ||
                  d.entradaId.toLowerCase().includes(sL) ||
                  d.saidaId.toLowerCase().includes(sL);
      return mT && mS && mSe && mSup;
    });

    if (sortConfig.key) {
      res.sort((a, b) => {
        let av = a[sortConfig.key], bv = b[sortConfig.key];
        if (sortConfig.key === 'date') {
          const p = (s: string) => { 
            const parts = s.split(' ')[0].split('/'); 
            return parts.length === 3 ? new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0])).getTime() : 0; 
          };
          av = p(av); bv = p(bv);
        }
        if (av < bv) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (av > bv) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return res;
  }, [data, typeFilter, statusFilter, selectedSuppliers, searchTerm, sortConfig]);

  const tableTotals = useMemo(() => {
    return filteredData.reduce((acc, curr) => {
      acc.quantity += curr.quantity;
      acc.value += curr.value;
      return acc;
    }, { quantity: 0, value: 0 });
  }, [filteredData]);

  const formatCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const toggleSupplier = (sup: string) => {
    setSelectedSuppliers(prev => prev.includes(sup) ? prev.filter(s => s !== sup) : [...prev, sup]);
  };

  const getStatusBadge = (s: string) => {
    const colors: Record<string, string> = { 
      Verde: 'bg-green-100 text-green-700 border-green-200', 
      Amarelo: 'bg-yellow-100 text-yellow-700 border-yellow-200', 
      Vermelho: 'bg-red-100 text-red-700 border-red-200' 
    };
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${colors[s] || 'bg-gray-100 text-gray-700'}`}>{s}</span>;
  };

  const requestSort = (key: string) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
  };

  // --- EXPORTAÇÃO PDF 100% NATIVA ---
  const handleDownloadPDF = () => {
    const color = PDF_COLORS.purple;
    const doc = new jsPDF('landscape' as any);

    const filterLabel = selectedSuppliers.length > 0
      ? `Hospitais: ${selectedSuppliers.join(', ')}`
      : 'Todos os hospitais';

    let currentY = drawPDFHeader(
      doc,
      'Relatório de Conciliação Financeira',
      filterLabel,
      color
    );

    currentY = drawKPICards(doc, [
      { label: 'Total Recebido', value: formatCurrency(kpis.totalR), color: PDF_COLORS.emerald },
      { label: 'Total Concedido', value: formatCurrency(kpis.totalC), color: PDF_COLORS.red },
      { label: `Saldo (${kpis.saldo < 0 ? 'Credor' : 'Devedor'})`, value: formatCurrency(Math.abs(kpis.saldo)), color: PDF_COLORS.purple },
      { label: 'Pendências', value: kpis.pCount.toString(), color: PDF_COLORS.amber },
      { label: 'Registros Filtrados', value: filteredData.length.toString(), color: PDF_COLORS.slate },
    ], currentY);

    if (filteredData.length === 0) {
      doc.setFontSize(11);
      doc.setTextColor(100, 116, 139);
      doc.text('Nenhum dado encontrado com os filtros aplicados.', 12, currentY + 10);
      drawPDFFooters(doc, color);
      doc.save(`Relatorio_Conciliacao_${new Date().getTime()}.pdf`);
      return;
    }

    const tableColumn = ['Data', 'Tipo', 'Entr.', 'Saída', 'Hospital', 'Produto', 'Qtd', 'Valor (R$)', 'Status'];
    const tableRows: any[] = filteredData.map(r => [
      r.date.split(' ')[0],
      r.type === 'Recebido' ? 'REC' : 'CON',
      r.entradaId,
      r.saidaId,
      r.supplier,
      r.product,
      r.quantity.toString(),
      formatCurrency(r.value),
      r.status.toUpperCase(),
    ]);

    // Totals row
    tableRows.push([
      { content: 'TOTAIS FILTRADOS:', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold', fillColor: [243, 232, 255] } },
      { content: tableTotals.quantity.toString(), styles: { fontStyle: 'bold', halign: 'center', fillColor: [243, 232, 255], textColor: [147, 51, 234] } },
      { content: formatCurrency(tableTotals.value), styles: { fontStyle: 'bold', halign: 'right', fillColor: [243, 232, 255], textColor: [147, 51, 234] } },
      { content: '', styles: { fillColor: [243, 232, 255] } },
    ]);

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: currentY + 2,
      theme: 'grid',
      margin: { left: 12, right: 12, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak', lineColor: [226, 232, 240], lineWidth: 0.1 },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [250, 245, 255] },
      columnStyles: {
        0: { cellWidth: 18, halign: 'center' },
        1: { cellWidth: 14, halign: 'center' },
        2: { cellWidth: 18, halign: 'center' },
        3: { cellWidth: 18, halign: 'center' },
        4: { cellWidth: 52, halign: 'left' },
        5: { cellWidth: 'auto', halign: 'left' },
        6: { cellWidth: 14, halign: 'center' },
        7: { cellWidth: 26, halign: 'right' },
        8: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index === 8) {
          if (data.cell.raw === 'VERDE') data.cell.styles.textColor = [21, 128, 61];
          else if (data.cell.raw === 'AMARELO') data.cell.styles.textColor = [161, 98, 7];
          else if (data.cell.raw === 'VERMELHO') data.cell.styles.textColor = [185, 28, 28];
        }
      },
    });

    // Signature lines
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    const sigY = pageHeight - 32;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.4);
    doc.line(40, sigY, 120, sigY);
    doc.line(pageWidth - 120, sigY, pageWidth - 40, sigY);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Responsável Farmacêutico', 80, sigY + 5, { align: 'center' });
    doc.text('Aprovação Financeira', pageWidth - 80, sigY + 5, { align: 'center' });

    drawPDFFooters(doc, color);
    doc.save(`Relatorio_Conciliacao_${new Date().getTime()}.pdf`);
  };

  // --- DOWNLOAD DE EXCEL (CSV) ---
  const handleDownloadCSV = () => {
    const headers = ['Data', 'Tipo', 'Entrada', 'Saida', 'Hospital_Fornecedor', 'Produto', 'Quantidade', 'Valor_Total', 'Status', 'Observacao'];
    const csvRows = [headers.join(';')];
    
    filteredData.forEach(r => {
      const row = [
        r.date.split(' ')[0], 
        r.type,               
        r.entradaId,          
        r.saidaId,            
        `"${r.supplier}"`,    
        `"${r.product}"`,     
        r.quantity,           
        r.value.toFixed(2).replace('.', ','), 
        r.status,             
        `"${r.obs || ''}"`    
      ];
      csvRows.push(row.join(';'));
    });

    csvRows.push(['', '', '', '', '', '"TOTAIS FILTRADOS"', tableTotals.quantity, tableTotals.value.toFixed(2).replace('.', ','), '', ''].join(';'));

    const csvString = csvRows.join('\n');
    const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Planilha_Conciliacao_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 md:p-6 font-sans">
      <div className="max-w-[1600px] mx-auto">
        
        {/* HEADER DE COMANDOS */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Calculator className="w-8 h-8 text-indigo-600" />
            Conciliação de Empréstimos
          </h1>
          <p className="text-slate-500 font-medium">Conferência de itens consignados e validação de lotes com fornecedores.</p>
        </div>
        <div className="flex gap-3">
            <button 
              onClick={handleDownloadCSV} 
              className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 border-b-4 border-green-800 active:border-b-0"
              title="Download em Excel (CSV)"
            >
              <FileDown size={18} /> Baixar Planilha
            </button>

            <button
              onClick={handleDownloadPDF}
              className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-2xl text-sm font-bold flex items-center gap-2 transition-all shadow-lg active:scale-95 border-b-4 border-purple-800 active:border-b-0"
              title="Download do Relatório PDF"
            >
              <FileIcon size={18} /> Baixar PDF
            </button>
            
            <div className={`relative border-2 border-dashed rounded-2xl p-2 px-5 text-center cursor-pointer transition-all ${isDragging ? 'border-purple-500 bg-purple-50 scale-105' : 'border-slate-300 bg-white hover:border-purple-400 hover:bg-slate-50'}`} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}>
              <input type="file" multiple accept=".csv" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => processFiles(e.target.files)} />
              <div className="flex items-center gap-2 text-slate-600">
                <UploadCloud size={18} className="text-purple-600" /> 
                <span className="text-sm font-bold">Importar Ficheiros</span>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card title="Recebidos" val={formatCurrency(kpis.totalR)} info={`${kpis.entC} registos`} icon={<TrendingDown size={22}/>} color="green" />
          <Card title="Concedidos" val={formatCurrency(kpis.totalC)} info={`${kpis.saiC} registos`} icon={<TrendingUp size={22}/>} color="purple" />
          <Card title="Saldo Financeiro" val={formatCurrency(Math.abs(kpis.saldo))} info={kpis.saldo < 0 ? 'Resultado Credor' : 'Resultado Devedor'} icon={<DollarSign size={22}/>} color={kpis.saldo < 0 ? 'green' : 'red'} />
          <Card title="Pendências" val={kpis.pCount.toString()} info="Necessitam Ação" icon={<AlertTriangle size={22}/>} color="amber" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* SIDEBAR (LEGENDA E RANKING) */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-black text-slate-400 mb-5 uppercase tracking-widest flex items-center gap-2">
                <Info size={14} className="text-purple-600" /> Legenda
              </h3>
              <div className="space-y-4">
                <LegendItem color="bg-green-500" title="Verde (Quitado)" desc="Finalizado totalmente." />
                <LegendItem color="bg-yellow-400" title="Amarelo (Pendente)" desc="Aguardando compensação." />
                <LegendItem color="bg-red-500" title="Vermelho (Crítico)" desc="Divergência ou atraso." />
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-xs font-black text-slate-400 mb-5 uppercase tracking-widest flex items-center gap-2">
                <Award size={16} className="text-amber-500" /> Top Justificativas
              </h3>
              <div className="space-y-3">
                {obsRanking.length > 0 ? obsRanking.map(([obs, count], idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs pb-3 border-b border-slate-50 last:border-0 last:pb-0">
                    <div className="flex gap-2 overflow-hidden">
                      <span className="font-black text-slate-200 text-base">{idx+1}</span>
                      <span className="truncate max-w-[150px] font-bold text-slate-600 uppercase text-[10px] mt-0.5" title={obs}>{obs}</span>
                    </div>
                    <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-lg font-black text-[9px]">{count}</span>
                  </div>
                )) : <p className="text-[10px] text-slate-400 italic text-center py-2">Sem dados.</p>}
              </div>
            </div>
          </div>

          {/* ÁREA DA TABELA */}
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 lg:col-span-9 overflow-hidden">
            <div className="flex flex-col gap-4 mb-6">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-3.5 text-slate-300" size={18} />
                  <input type="text" placeholder="Pesquisar por produto, entrada, saída..." className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-purple-50 outline-none transition-all" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <div className="relative md:w-64" ref={supMenuRef}>
                  <button onClick={() => setIsSupMenuOpen(!isSupMenuOpen)} className={`w-full flex items-center justify-between pl-12 pr-4 py-3 bg-slate-50 border rounded-2xl text-sm font-bold transition-all ${selectedSuppliers.length > 0 ? 'border-purple-400 text-purple-700 bg-purple-50' : 'border-slate-100 text-slate-600'}`}>
                    <Building2 className={`absolute left-4 top-3 ${selectedSuppliers.length > 0 ? 'text-purple-600' : 'text-slate-400'}`} size={18} />
                    <span className="truncate pr-2">{selectedSuppliers.length === 0 ? 'Hospitais' : `${selectedSuppliers.length} Selecionados`}</span>
                    <ChevronDown size={16} className={`transition-transform ${isSupMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isSupMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 max-h-60 overflow-y-auto p-2">
                      <button onClick={() => setSelectedSuppliers([])} className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-purple-600 hover:bg-purple-50 rounded-lg">Limpar</button>
                      <div className="h-px bg-slate-100 my-2"></div>
                      {uniqueSuppliers.map(sup => {
                        const isSelected = selectedSuppliers.includes(sup);
                        return (
                          <div key={sup} onClick={() => toggleSupplier(sup)} className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-colors mb-1 ${isSelected ? 'bg-purple-600 text-white' : 'hover:bg-slate-50 text-slate-700'}`}>
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'border-white bg-purple-500' : 'border-slate-300 bg-white'}`}>
                              {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                            </div>
                            <span className="text-[10px] font-bold truncate uppercase">{sup}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* BARRA DE FILTROS EXPLÍCITOS (TIPO E STATUS) */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:inline">Status:</span>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    {['Todos', 'Verde', 'Amarelo', 'Vermelho'].map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-1.5 text-[10px] rounded-lg font-black transition-all ${statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-700'}`}>{s}</button>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest hidden sm:inline">Tipo:</span>
                  <div className="flex bg-purple-50 p-1 rounded-xl">
                    {['Todos', 'Recebido', 'Concedido'].map(t => (
                      <button key={t} onClick={() => setTypeFilter(t)} className={`px-4 py-1.5 text-[10px] rounded-lg font-black transition-all ${typeFilter === t ? 'bg-purple-600 text-white shadow-lg' : 'text-purple-600 hover:text-purple-800'}`}>
                        {t === 'Todos' ? 'Ambos' : t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table className="w-full text-left text-[11px] border-separate border-spacing-0" style={{ tableLayout: 'fixed' }}>
                <thead>
                  <tr className="text-slate-400 font-black uppercase tracking-widest">
                    <SortTh label="Data" k="date" conf={sortConfig} onClick={requestSort} width="85px" />
                    <SortTh label="Tipo" k="type" conf={sortConfig} onClick={requestSort} width="60px" />
                    <th className="p-3 border-b" style={{ width: '60px' }}>Entr.</th>
                    <th className="p-3 border-b" style={{ width: '60px' }}>Saída</th>
                    <SortTh label="Hospital" k="supplier" conf={sortConfig} onClick={requestSort} width="auto" />
                    <SortTh label="Produto" k="product" conf={sortConfig} onClick={requestSort} width="auto" />
                    <th className="p-3 border-b text-center" style={{ width: '45px' }}>Qtd</th>
                    <SortTh label="Valor" k="value" conf={sortConfig} onClick={requestSort} width="110px" />
                    <th className="p-3 border-b text-center" style={{ width: '85px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length > 0 ? filteredData.map(row => (
                    <tr key={row.id} className="hover:bg-purple-50/40 transition-colors">
                      <td className="p-3 border-b text-slate-400 font-bold font-mono">{row.date.split(' ')[0]}</td>
                      <td className="p-3 border-b">
                        <span className={`px-2 py-0.5 rounded-lg font-black text-[9px] ${row.type === 'Recebido' ? 'bg-green-600 text-white' : 'bg-purple-600 text-white'}`}>
                          {row.type === 'Recebido' ? 'REC' : 'CON'}
                        </span>
                      </td>
                      <td className="p-3 border-b font-mono text-slate-400 truncate">{row.entradaId}</td>
                      <td className="p-3 border-b font-mono text-slate-400 truncate">{row.saidaId}</td>
                      <td className="p-3 border-b font-black text-slate-700 whitespace-normal break-words leading-tight">{row.supplier}</td>
                      <td className="p-3 border-b text-slate-500 font-medium whitespace-normal break-words leading-tight">{row.product}</td>
                      <td className="p-3 border-b text-center font-black text-slate-800">{row.quantity}</td>
                      <td className="p-3 border-b text-right font-black text-slate-900 whitespace-nowrap">{formatCurrency(row.value)}</td>
                      <td className="p-3 border-b text-center">{getStatusBadge(row.status)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={9} className="p-10 text-center text-slate-300 font-black uppercase tracking-widest italic">Vazio</td></tr>
                  )}
                </tbody>
                {filteredData.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr className="font-black text-slate-900 border-t-2 border-slate-200">
                      <td colSpan={6} className="p-3 text-right uppercase tracking-tighter text-[10px]">TOTAIS:</td>
                      <td className="p-3 text-center text-purple-700 bg-purple-50/50 font-black">{tableTotals.quantity}</td>
                      <td className="p-3 text-right text-purple-700 bg-purple-50/50 font-black">{formatCurrency(tableTotals.value)}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENTES ---
function Card({ title, val, info, icon, color }: { title: string, val: string, info: string, icon: React.ReactNode, color: string }) {
  const colors: Record<string, string> = { 
    purple: 'bg-purple-600 text-white', 
    green: 'bg-green-600 text-white', 
    red: 'bg-red-600 text-white', 
    amber: 'bg-amber-500 text-white',
    blue: 'bg-blue-600 text-white'
  };
  return (
    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 hover:shadow-2xl transition-all group">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h3>
        <div className={`p-2.5 rounded-2xl ${colors[color]} shadow-lg transition-transform group-hover:scale-110`}>{icon}</div>
      </div>
      <p className="text-2xl font-black text-slate-900 tracking-tighter mb-1">{val}</p>
      <div className="bg-slate-50 inline-block px-3 py-1 rounded-full text-[9px] font-black text-slate-400 uppercase tracking-tighter">{info}</div>
    </div>
  );
}

function LegendItem({ color, title, desc }: { color: string, title: string, desc: string }) {
  return (
    <div className="flex gap-3">
      <div className={`w-1.5 h-8 ${color} rounded-full shrink-0 shadow-sm`}></div>
      <div>
        <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{title}</p>
        <p className="text-[9px] text-slate-400 font-medium leading-tight">{desc}</p>
      </div>
    </div>
  );
}

function SortTh({ label, k, conf, onClick, width }: { label: string, k: string, conf: { key: string, direction: string }, onClick: (k: string) => void, width: string }) {
  const isS = conf.key === k;
  return (
    <th className="p-3 border-b cursor-pointer hover:bg-slate-50 transition-colors group" onClick={() => onClick(k)} style={{ width }}>
      <div className="flex items-center gap-1">
        {label} 
        <div className={`transition-opacity ${isS ? 'opacity-100' : 'opacity-0 group-hover:opacity-30'}`}>
          {isS && conf.direction === 'ascending' ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </div>
      </div>
    </th>
  );
}
