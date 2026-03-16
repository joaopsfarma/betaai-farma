import React, { useState, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle, ShoppingCart, Download, Search, AlertCircle, Package, ArrowRight, Layers, TrendingUp, Calculator, FileDown, Target, Clock } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { EQUIVALENCE_MAP } from '../data/equivalenceMap';

// --- Utilitários de Processamento de CSV ---

// Parseia números no formato brasileiro (ex: "1.234,56" -> 1234.56)
const parseBrNumber = (str: any) => {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  let clean = str.replace(/\./g, '').replace(',', '.').replace(/"/g, '').trim();
  return parseFloat(clean) || 0;
};

// Parser robusto de CSV que lida com aspas duplas e vírgulas internas
const parseCSV = (text: string) => {
  const result = Papa.parse(text, { skipEmptyLines: true });
  let rows = result.data as string[][];
  
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
  
  return rows;
};

// Formata moeda BRL
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

// Função para alocar lotes (FEFO)
const allocateLots = (lots: any[], qtyToAllocate: number) => {
  if (!lots || lots.length === 0 || qtyToAllocate <= 0) return [];
  let remaining = qtyToAllocate;
  const allocated = [];

  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(lot.quantidade, remaining);
    if (take > 0) {
      allocated.push({
        lote: lot.lote,
        validade: lot.validade,
        qty: take
      });
      remaining -= take;
    }
  }

  // Se sobrou necessidade e não há lotes/estoque suficientes no fornecedor
  if (remaining > 0) {
    allocated.push({
      lote: "Falta na CAF",
      validade: "-",
      qty: remaining,
      isWarning: true
    });
  }

  return allocated;
};

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  media: number;
  stock: number;
  price: number;
  suggested: number;
  orderQty: number;
  supplierStock: number;
  supplierLots: any[];
  equivalentStock?: number;
}

export const TransferRequest: React.FC = () => {
  const [targetDays, setTargetDays] = useState(7);
  const [consumptionDays, setConsumptionDays] = useState(5);
  const [safetyMargin, setSafetyMargin] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'medicamento' | 'material' | 'dieta'>('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState<'all' | 'comprimido' | 'frasco' | 'bolsa'>('all');
  const [filesData, setFilesData] = useState<{
    consumo: string | null;
    movi: string | null;
    caf: string | null;
    destino: string | null;
  }>({
    consumo: null,
    movi: null,
    caf: null,
    destino: null
  });
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // --- Lógica de Upload ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: keyof typeof filesData) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setFilesData(prev => ({
        ...prev,
        [type]: event.target?.result as string
      }));
    };
    reader.readAsText(file, 'UTF-8');
  };

  // --- Lógica de Parse dos Lotes (FEFO) ---
  const parseStockFile = (csvText: string) => {
    const rows = parseCSV(csvText);
    const lotsMap: Record<string, any[]> = {};
    const totalsMap: Record<string, number> = {};
    let currentProductId = null;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 18) continue;

      // Se a coluna 1 tem valor, é o cabeçalho de um novo produto (ID)
      if (row[1] && row[1].trim() !== '') {
        currentProductId = row[1].trim();
        // Coluna 6 tem o Estoque Atual Total do produto
        if (row[6] && row[6].trim() !== '') {
          totalsMap[currentProductId] = Math.round(parseBrNumber(row[6]));
        }
      }

      if (!currentProductId) continue;

      // Dados específicos do lote
      const lote = row[8]?.trim();
      const validade = row[10]?.trim(); // DD/MM/YYYY
      const quantidade = Math.round(parseBrNumber(row[18]));

      if (lote && validade && quantidade > 0) {
        const parts = validade.split('/');
        let validadeMs = 0;
        if (parts.length === 3) {
          validadeMs = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0])).getTime();
        }
        
        if (!lotsMap[currentProductId]) lotsMap[currentProductId] = [];
        lotsMap[currentProductId].push({ lote, validade, quantidade, validadeMs });
      }
    }

    // Ordenar lotes por data de validade ascendente (Mais próximo ao vencimento primeiro - FEFO)
    for (const pid in lotsMap) {
      lotsMap[pid].sort((a, b) => a.validadeMs - b.validadeMs);
    }

    return { lotsMap, totalsMap };
  };

  // --- Lógica Central de Cruzamento de Dados ---
  const processData = useCallback(() => {
    setIsProcessing(true);
    setTimeout(() => {
      let productsMap: Record<string, InventoryItem> = {};

      // 1. Processar CONSUMO DIÁRIO (Define o Solicitante: Média)
      if (filesData.consumo) {
        const rows = parseCSV(filesData.consumo);
        const headerRow = rows[0] || [];
        
        let totalIdx = headerRow.findIndex(h => h && h.trim().toLowerCase() === 'total');
        let saldoIdx = headerRow.findIndex(h => h && h.trim().toLowerCase() === 'saldo');
        let mediaIdx = headerRow.findIndex(h => h && (h.trim().toLowerCase() === 'média' || h.trim().toLowerCase() === 'media'));
        
        if (totalIdx === -1) totalIdx = 9;
        if (mediaIdx === -1) mediaIdx = 10;
        if (saldoIdx === -1) saldoIdx = 11;

        const dailyCols = [];
        for (let c = 3; c < totalIdx; c++) {
            dailyCols.push(c);
        }

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (row.length <= saldoIdx || !row[0]) continue;
          
          const id = row[0].trim();
          
          // Calcular média baseada dinamicamente nos últimos dias de consumo selecionados
          let sum = 0;
          let count = 0;
          const colsToUse = dailyCols.slice(-consumptionDays);
          
          if (colsToUse.length > 0) {
            colsToUse.forEach(c => {
               sum += parseBrNumber(row[c]);
               count++;
            });
          }
          
          let media = count > 0 ? sum / count : parseBrNumber(row[mediaIdx]); 
          const saldoSolicitante = parseBrNumber(row[saldoIdx]); 

          productsMap[id] = {
            id,
            name: row[1]?.replace(/"/g, ''),
            unit: row[2]?.replace(/"/g, ''),
            media: media,
            stock: saldoSolicitante, // Fallback stock
            price: 0,
            suggested: 0,
            orderQty: 0,
            supplierStock: 0,
            supplierLots: []
          };
        }
      }

      // 2. Processar Estoque CAF (Fornecedor)
      if (filesData.caf) {
        const { lotsMap, totalsMap } = parseStockFile(filesData.caf);
        for (const id in productsMap) {
          if (totalsMap[id] !== undefined) {
            productsMap[id].supplierStock = totalsMap[id];
          }
          if (lotsMap[id]) {
            productsMap[id].supplierLots = lotsMap[id];
          }
        }
      }

      // 3. Processar Estoque Destino (Solicitante)
      if (filesData.destino) {
        const { totalsMap } = parseStockFile(filesData.destino);
        for (const id in productsMap) {
          if (totalsMap[id] !== undefined) {
            productsMap[id].stock = totalsMap[id];
          }
        }
      }

      // 4. Processar MOVI_ESTOQ (Para preços)
      if (filesData.movi) {
        const rows = parseCSV(filesData.movi);
        for (let i = 2; i < rows.length; i++) {
          const row = rows[i];
          if (row.length < 10 || !row[0]) continue;
          
          const id = row[0].trim();
          if (productsMap[id]) {
            productsMap[id].price = parseBrNumber(row[9]); 
          }
        }
      }

      // 5. Calcular Sugestões
      const finalInventory = Object.values(productsMap).map(p => {
        const targetStock = p.media * targetDays;
        
        // Calcular estoque dos equivalentes no destino
        const equivalentIds = EQUIVALENCE_MAP[p.id] || [];
        const equivalentStockAtDestino = equivalentIds.reduce((total, eqId) => {
          return total + (productsMap[eqId]?.stock || 0);
        }, 0);

        let suggestion = targetStock - (p.stock + equivalentStockAtDestino);
        
        if (suggestion > 0) {
          // Aplica a margem de segurança de 20% sobre o pedido calculado
          suggestion = Math.round(suggestion * (1 + (safetyMargin / 100)));
        } else {
          suggestion = 0;
        }
        
        return {
          ...p,
          suggested: suggestion,
          orderQty: suggestion,
          equivalentStock: equivalentStockAtDestino // Adicionando para exibição na UI
        };
      });

      // Ordenar por produtos em ordem alfabética
      finalInventory.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      
      setInventory(finalInventory);
      setIsProcessing(false);
    }, 500);
  }, [filesData, targetDays, consumptionDays, safetyMargin]);

  // Atualizar a quantidade do pedido manualmente
  const updateOrderQty = (id: string, newQty: string) => {
    setInventory(prev => prev.map(item => 
      item.id === id ? { ...item, orderQty: Math.round(Number(newQty)) || 0 } : item
    ));
  };

  // Exportar pedido para PDF
  const exportToPDF = () => {
    const itemsToOrder = inventory.filter(item => item.orderQty > 0);
    if (itemsToOrder.length === 0) return alert("Nenhum item com quantidade maior que zero para pedir.");

    // Modo Paisagem (Landscape)
    const doc = new jsPDF({ orientation: 'l', unit: 'mm', format: 'a4' });
    const date = new Date().toLocaleDateString('pt-BR');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(30, 41, 59); // Slate-800
    doc.text('Solicitação de Transferência - CAF', 14, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(`Data de Geração: ${date}`, 14, 28);
    doc.text(`Configurações: Meta ${targetDays} dias | Segurança ${safetyMargin}% | Dias Consumo ${consumptionDays}`, 14, 34);

    const tableData = itemsToOrder.map(item => {
      const allocatedLots = allocateLots(item.supplierLots, item.orderQty);
      const lotsStr = allocatedLots.map(l => `${l.lote} (${l.qty})`).join(', ');
      
      return [
        item.id,
        item.name,
        item.orderQty,
        item.unit,
        lotsStr,
        formatCurrency(item.price),
        formatCurrency(item.orderQty * item.price)
      ];
    });

    autoTable(doc, {
      startY: 40,
      head: [['ID', 'Produto', 'Qtd', 'Un', 'Lotes Sugeridos (FEFO)', 'V. Unit', 'V. Total']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' }, // Indigo-600
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 80 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 75 },
        5: { cellWidth: 28, halign: 'right' },
        6: { cellWidth: 30, halign: 'right' }
      }
    });

    const totalValue = itemsToOrder.reduce((acc, item) => acc + (item.orderQty * item.price), 0);
    const totalQty = itemsToOrder.reduce((acc, item) => acc + item.orderQty, 0);
    const finalY = (doc as any).lastAutoTable.finalY + 15;

    // Resumo de Totais
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'bold');
    
    const totalsX = pageWidth - 14;
    doc.text(`TOTAL DE ITENS: ${itemsToOrder.length}`, totalsX, finalY, { align: 'right' });
    doc.text(`TOTAL DE UNIDADES: ${totalQty}`, totalsX, finalY + 6, { align: 'right' });
    
    doc.setFontSize(13);
    const totalText = `VALOR TOTAL DO PEDIDO: ${formatCurrency(totalValue)}`;
    doc.text(totalText, totalsX, finalY + 14, { align: 'right' });

    // Rodapé - Responsável e Data
    const footerY = finalY + 35;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    
    // Linha para assinatura
    doc.line(14, footerY, 100, footerY);
    doc.text('Responsável pelo pedido', 14, footerY + 5);
    
    // Campo de data manual
    doc.line(120, footerY, 160, footerY);
    doc.text('Data do Recebimento', 120, footerY + 5);

    doc.save(`pedido_caf_paisagem_${date.replace(/\//g, '-')}.pdf`);
  };

  // Exportar pedido para CSV
  const exportOrderCSV = () => {
    const itemsToOrder = inventory.filter(item => item.orderQty > 0);
    if (itemsToOrder.length === 0) return alert("Nenhum item com quantidade maior que zero para pedir.");

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "ID,Produto,Unidade,Estoque Solicitante (Local),Estoque CAF (Fornecedor),Média Diária,Sugestão,Quantidade Pedida,Montagem/Lotes Sugeridos (FEFO),Valor Unitário,Valor Total\n";

    itemsToOrder.forEach(item => {
      const allocatedLots = allocateLots(item.supplierLots, item.orderQty);
      const lotsStr = allocatedLots.map(l => `${l.lote} (${l.qty} un - Val: ${l.validade})`).join(' | ');

      const row = [
        item.id,
        `"${item.name}"`,
        `"${item.unit}"`,
        item.stock,
        item.supplierStock,
        item.media.toFixed(3).replace('.', ','),
        item.suggested,
        item.orderQty,
        `"${lotsStr}"`,
        item.price.toFixed(4).replace('.', ','),
        (item.orderQty * item.price).toFixed(2).replace('.', ',')
      ].join(",");
      csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `solicitacao_caf_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Filtros e Totais ---
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           item.id.includes(searchTerm);
      
      if (!matchesSearch) return false;

      const name = item.name.toUpperCase();
      const unit = item.unit.toUpperCase();

      // Lógica de Categorização
      const isDieta = name.includes("DIETA") || name.includes("NUTRIFICA") || name.includes("ENTERAL") || name.includes("PARENTERAL") || name.includes("SUPLEMENTO") || name.includes("MODULO ALIMENTAR");
      
      const isComprimido = name.includes("COMP") || name.includes(" CP") || name.includes("CPR") || name.includes("TAB") || unit.includes("COMP") || unit.includes("CP") || unit.includes("CPR");
      const isFrasco = name.includes("FRASCO") || name.includes(" FR") || name.includes(" FA") || name.includes("AMP") || unit.includes("FR") || unit.includes("FA") || unit.includes("AMP");
      const isBolsa = name.includes("BOLSA") || name.includes(" BS") || unit.includes("BOLSA") || unit.includes("BS");
      
      const matKeywords = [
        "SERINGA", "AGULHA", "SONDA", "COMPRESSA", "FRALDA", "EXTENSOR", 
        "CURATIVO", "COLETORA", "PROTETOR", "CLAMP", "GUIA", "DISPOSITIVO", 
        "IMPLANON", "CLOREXEDINA", "GAZE", "LUVA", "EQUIPO", "CATETER", 
        "ESPARADRAPO", "ALCOOL", "MASCARA", "TOUCA", "AVENTAL", "TUBO", 
        "DRENO", "ELETRODO", "FITA", "PAPEL", "COLETOR", "ALGODAO", "GAZ", "FIXADOR", "POSIFLUSH"
      ];
      const isExplicitMat = matKeywords.some(k => name.includes(k) || unit.includes(k));

      const medKeywords = ["MG", "MCG", "G/", "ML", "UI", "MEQ", "CAPS", "DRAGEA"];
      const isMed = !isDieta && !isExplicitMat && (isComprimido || isFrasco || isBolsa || medKeywords.some(k => name.includes(k) || unit.includes(k)));
      
      const isMat = !isDieta && (isExplicitMat || (!isMed && !isComprimido && !isFrasco && !isBolsa));

      if (categoryFilter === 'dieta') {
        if (!isDieta) return false;
      } else if (categoryFilter === 'medicamento') {
        if (!isMed) return false;
        if (subCategoryFilter === 'comprimido' && !isComprimido) return false;
        if (subCategoryFilter === 'frasco' && !isFrasco) return false;
        if (subCategoryFilter === 'bolsa' && !isBolsa) return false;
      } else if (categoryFilter === 'material') {
        if (!isMat) return false;
      }

      return true;
    });
  }, [inventory, searchTerm, categoryFilter, subCategoryFilter]);

  const orderTotals = useMemo(() => {
    return inventory.reduce((acc, item) => {
      if (item.orderQty > 0) {
        acc.items += 1;
        acc.totalValue += (item.orderQty * item.price);
      }
      return acc;
    }, { items: 0, totalValue: 0 });
  }, [inventory]);

  // --- Componentes Visuais ---
  const FileUploadCard = ({ title, type, isRequired, subtitle }: { title: string, type: keyof typeof filesData, isRequired: boolean, subtitle: string }) => (
    <div className={`p-4 rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-center transition-colors relative
      ${filesData[type] ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-indigo-500 bg-white'}`}>
      
      <input 
        type="file" 
        accept=".csv"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={(e) => handleFileUpload(e, type)}
      />
      
      {filesData[type] ? (
        <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
      ) : (
        <Upload className="w-8 h-8 text-slate-400 mb-2" />
      )}
      
      <h3 className="font-semibold text-slate-700 leading-tight">{title}</h3>
      <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>
      {isRequired && !filesData[type] && (
        <span className="mt-2 text-[10px] uppercase font-bold tracking-wider text-red-500 bg-red-100 px-2 py-1 rounded">Obrigatório</span>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <ShoppingCart className="w-8 h-8 text-indigo-600" />
            Sugestão de Transferência
          </h1>
          <p className="text-slate-500 font-medium">Cálculo inteligente de ressuprimento baseado em consumo médio e cobertura desejada.</p>
        </div>
        <div className="flex gap-3">
          {/* ... buttons ... */}
        </div>
      </div>

      <PanelGuide 
        sections={[
          {
            title: "Cobertura de 7 Dias",
            content: "A lógica de transferência visa equalizar o estoque para garantir pelo menos 7 dias de consumo em cada unidade, evitando rupturas.",
            icon: <Clock className="w-4 h-4" />
          },
          {
            title: "Saldo Global e Remanejamento",
            content: "O sistema verifica se outras unidades possuem excesso (cobertura > 30 dias) para sugerir a transferência interna antes de novas compras.",
            icon: <Layers className="w-4 h-4" />
          },
          {
            title: "Prioridade Assistencial",
            content: "Itens de Curva A ou de uso contínuo são priorizados na fila de separação para garantir a continuidade da terapia medicamentosa.",
            icon: <Target className="w-4 h-4" />
          }
        ]}
      />
      {/* Settings Header */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-3 text-slate-800">
            <Package className="text-indigo-600 w-6 h-6" />
            Gestor de Pedidos & Picking (CAF)
          </h2>
          <p className="text-slate-500 text-sm mt-1">Gere sugestões de reposição e otimize a separação de lotes via FEFO.</p>
        </div>
        
        <div className="mt-6 xl:mt-0 flex flex-wrap items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200 w-full xl:w-auto">
          <div className="flex flex-col">
            <label className="text-xs font-semibold text-slate-500 uppercase">Fornecedor</label>
            <div className="flex items-center gap-2 mt-1">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span className="text-sm font-bold text-slate-700">CAF (Central)</span>
            </div>
          </div>
          
          <div className="w-px h-8 bg-slate-300 hidden md:block"></div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Dias Consumo</label>
            <input 
              type="number" 
              value={consumptionDays}
              onChange={(e) => setConsumptionDays(Number(e.target.value))}
              className="w-16 mt-1 bg-white border border-slate-300 rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none text-center"
              min="1"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Meta (Dias)</label>
            <input 
              type="number" 
              value={targetDays}
              onChange={(e) => setTargetDays(Number(e.target.value))}
              className="w-16 mt-1 bg-white border border-slate-300 rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none text-center"
              min="1"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[10px] font-semibold text-slate-500 uppercase">Segurança (%)</label>
            <input 
              type="number" 
              value={safetyMargin}
              onChange={(e) => setSafetyMargin(Number(e.target.value))}
              className="w-16 mt-1 bg-white border border-slate-300 rounded px-2 py-1 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none text-center"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Upload Section */}
      {inventory.length === 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-lg font-semibold mb-6 flex items-center gap-2 text-slate-800">
            <FileText className="w-5 h-5 text-indigo-600" />
            1. Importar Bases de Dados
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <FileUploadCard 
              title="Consumo Diário" 
              subtitle="Média de Consumo" 
              type="consumo" 
              isRequired={true} 
            />
            <FileUploadCard 
              title="Movimentação" 
              subtitle="Custos Unitários" 
              type="movi" 
              isRequired={false} 
            />
            <FileUploadCard 
              title="Estoque CAF" 
              subtitle="Lotes Fornecedor (CAF)" 
              type="caf" 
              isRequired={true} 
            />
            <FileUploadCard 
              title="Estoque Destino" 
              subtitle="Saldo Atual Solicitante" 
              type="destino" 
              isRequired={true} 
            />
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between p-4 bg-indigo-50 rounded-xl border border-indigo-100 gap-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-medium text-indigo-900">Como o sistema processa:</h4>
                <p className="text-sm text-indigo-700 mt-1">
                  O <strong>Consumo Diário</strong> dita a necessidade. 
                  O <strong>Estoque CAF</strong> fornece os lotes (FEFO). 
                  O <strong>Estoque Destino</strong> é subtraído da meta para gerar o pedido.
                </p>
              </div>
            </div>
            
            <button 
              onClick={processData}
              disabled={!filesData.consumo || !filesData.caf || !filesData.destino || isProcessing}
              className={`px-8 py-3 rounded-xl font-bold text-white transition-all shadow-md shrink-0 w-full md:w-auto
                ${(!filesData.consumo || !filesData.caf || !filesData.destino) ? 'bg-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:scale-95'}`}
            >
              {isProcessing ? 'Processando...' : 'Gerar Solicitação e Lotes'}
            </button>
          </div>
        </div>
      )}

      {/* Main Data View */}
      {inventory.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
          
          {/* Tabela de Produtos */}
          <div className="xl:col-span-3 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-[750px]">
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between bg-slate-50/80 gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-semibold text-lg text-slate-800 flex items-center gap-2">
                  <span>Lista de Reposição</span>
                </h2>
                
                <div className="flex bg-white border border-slate-200 rounded-lg p-1 shadow-sm">
                  <button 
                    onClick={() => { setCategoryFilter('all'); setSubCategoryFilter('all'); }}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${categoryFilter === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Todos
                  </button>
                  <button 
                    onClick={() => setCategoryFilter('medicamento')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${categoryFilter === 'medicamento' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Medicamentos
                  </button>
                  <button 
                    onClick={() => setCategoryFilter('material')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${categoryFilter === 'material' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Material Hospitalar
                  </button>
                  <button 
                    onClick={() => setCategoryFilter('dieta')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${categoryFilter === 'dieta' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Dietas
                  </button>
                </div>

                {categoryFilter === 'medicamento' && (
                  <div className="flex bg-white border border-emerald-200 rounded-lg p-1 shadow-sm animate-in fade-in slide-in-from-left-2">
                    <button 
                      onClick={() => setSubCategoryFilter('all')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'all' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      Todos Meds
                    </button>
                    <button 
                      onClick={() => setSubCategoryFilter('comprimido')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'comprimido' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      Comprimidos
                    </button>
                    <button 
                      onClick={() => setSubCategoryFilter('frasco')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'frasco' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      Frascos/Amp
                    </button>
                    <button 
                      onClick={() => setSubCategoryFilter('bolsa')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'bolsa' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'}`}
                    >
                      Bolsas
                    </button>
                  </div>
                )}
              </div>

              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Buscar por nome ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="overflow-auto flex-1">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider w-[25%]">Produto</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right bg-slate-100/50" title="Saldo atual do local que pediu">Est. Destino</th>
                    <th className="py-3 px-4 text-xs font-semibold text-indigo-700 uppercase tracking-wider text-right bg-indigo-50/50" title="Saldo atual na CAF">Est. CAF</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right" title={`Média calculada sobre os últimos ${consumptionDays} dias`}>Média/Dia</th>
                    <th className="py-3 px-4 text-xs font-semibold text-slate-600 uppercase tracking-wider text-center border-l border-r border-slate-200" title={`Inclui ${safetyMargin}% de segurança`}>Pedir Qtde</th>
                    <th className="py-3 px-4 text-xs font-semibold text-emerald-700 uppercase tracking-wider w-[30%] bg-emerald-50/50">Sugestão de Lotes (FEFO)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item) => (
                    <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 text-sm leading-tight mb-1">{item.name}</div>
                        <div className="text-[11px] text-slate-500 font-mono">ID: {item.id} | {item.unit}</div>
                      </td>
                      
                      <td className="py-3 px-4 text-right bg-slate-50/30">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold ${item.stock <= item.media * 3 ? 'text-red-500' : 'text-slate-700'}`}>
                            {item.stock}
                          </span>
                          {item.equivalentStock && item.equivalentStock > 0 ? (
                            <span className="text-[9px] text-teal-600 font-bold bg-teal-50 px-1 rounded">
                              +{item.equivalentStock} Similares
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Sug. {item.suggested}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right bg-indigo-50/30">
                        <span className={`font-bold ${item.supplierStock < item.orderQty ? 'text-orange-500' : 'text-indigo-700'}`}>
                          {item.supplierStock}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right text-slate-600 text-sm">
                        {item.media.toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center border-l border-r border-slate-100 bg-white">
                        <input 
                          type="number"
                          value={item.orderQty}
                          onChange={(e) => updateOrderQty(item.id, e.target.value)}
                          className={`w-20 text-center border rounded-lg py-1.5 font-bold outline-none transition-all
                            ${item.orderQty > 0 ? 'border-indigo-300 text-indigo-700 bg-indigo-50/50 focus:ring-2 focus:ring-indigo-200' : 'border-slate-200 text-slate-400 focus:border-slate-400'}`}
                          min="0"
                        />
                      </td>

                      <td className="py-3 px-4 bg-emerald-50/20">
                        {item.orderQty > 0 ? (
                          <div className="flex flex-col gap-1">
                            {allocateLots(item.supplierLots, item.orderQty).map((lot, idx) => (
                              <div key={idx} className={`flex justify-between items-center px-2 py-1 rounded text-xs border
                                ${lot.isWarning ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-white border-slate-200 shadow-sm'}`}>
                                <span className="font-semibold truncate max-w-[120px]" title={lot.lote}>
                                  {lot.isWarning ? 'Falta na CAF' : `Lote: ${lot.lote}`}
                                </span>
                                <div className="flex items-center gap-2 whitespace-nowrap">
                                  <span className={lot.isWarning ? 'font-bold' : 'text-emerald-700 font-bold'}>{lot.qty} un</span>
                                  <span className="text-slate-400 text-[10px] w-14 text-right">{lot.validade}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="w-3 h-3" /> Sem solicitação
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredInventory.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                  <Package className="w-12 h-12 mb-3 opacity-20" />
                  <p>Nenhum produto corresponde à busca.</p>
                </div>
              )}
            </div>
          </div>

          {/* Resumo do Pedido (Sidebar) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 h-fit sticky top-6">
            <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-6">
              <ShoppingCart className="text-indigo-600" />
              Resumo da Separação
            </h2>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-500">Itens diferentes</span>
                <span className="font-bold text-slate-800 text-lg">{orderTotals.items}</span>
              </div>
              <div className="flex justify-between items-center py-3 border-b border-slate-100">
                <span className="text-slate-500">Fornecedor</span>
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">CAF (Central)</span>
              </div>
              <div className="pt-2">
                <span className="block text-slate-500 text-sm mb-1">Custo Estimado</span>
                <span className="block text-3xl font-black text-slate-800 tracking-tight">
                  {formatCurrency(orderTotals.totalValue)}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button 
                onClick={exportToPDF}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-md shadow-indigo-600/20"
              >
                <FileDown className="w-5 h-5" />
                Baixar Pedido (PDF)
              </button>

              <button 
                onClick={exportOrderCSV}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
              >
                <Download className="w-5 h-5" />
                Baixar Picking (CSV)
              </button>

              <button 
                onClick={() => setInventory([])}
                className="w-full mt-3 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-medium transition-all"
              >
                Refazer / Mudar Base
              </button>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
