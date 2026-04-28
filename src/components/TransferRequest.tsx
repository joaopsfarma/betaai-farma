import React, { useState, useMemo, useCallback } from 'react';
import Papa from 'papaparse';
import { Upload, FileText, CheckCircle, ShoppingCart, Download, Search, AlertCircle, Package, ArrowRight, Layers, TrendingUp, Calculator, FileDown, Target, Clock } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import { motion, AnimatePresence } from 'motion/react';
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

interface RawItem {
  id: string;
  name: string;
  unit: string;
  dailyValues: number[];
  stock: number;
  price: number;
  supplierStock: number;
  supplierLots: any[];
}

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
  trend: 'up' | 'down' | 'stable';
}

type UrgencyLevel = 'critical' | 'urgent' | 'attention' | 'ok';
const URGENCY_SCORE: Record<UrgencyLevel, number> = { critical: 3, urgent: 2, attention: 1, ok: 0 };

function getUrgency(item: InventoryItem, targetDays: number): { level: UrgencyLevel; coverageDays: number; score: number } {
  const effectiveStock = item.stock + (item.equivalentStock || 0);
  const coverageDays = item.media > 0 ? effectiveStock / item.media : Infinity;

  let level: UrgencyLevel;
  if (item.stock === 0 && item.media > 0) {
    level = 'critical';
  } else if (item.media > 0 && coverageDays < 2) {
    level = 'urgent';
  } else if (item.media > 0 && coverageDays < targetDays * 0.5) {
    level = 'attention';
  } else {
    level = 'ok';
  }

  return { level, coverageDays: coverageDays === Infinity ? -1 : coverageDays, score: URGENCY_SCORE[level] };
}

const MAV_REGEX = /INSULINA|HEPARINA|VARFARINA|WARFARINA|ENOXAPARINA|FONDAPARINUX|APIXABANA|ELIQUIS|RIVAROXABANA|XARELTO|VYNAXA|EDOXABANA|LIXIANA|CLORETO\s*(?:DE\s*)?POTASSIO|KCL|FOSFATO POTASSIO|SULFATO\s*(?:DE\s*)?MAGNESIO|CLORETO\s*(?:DE\s*)?SODIO.*20%|NACL.*20%|GLUCONATO\s*(?:DE\s*)?CALCIO|CLORETO\s*(?:DE\s*)?CALCIO|BICARBONATO DE SODIO|NOREPINEFRINA|NORADRENALINA|EPINEFRINA|ADRENALINA|DOPAMINA|DOBUTAMINA|VASOPRESSINA|NITROPRUSSIATO|AMIODARONA|DIGOXINA|LIDOCAINA|SUCCINILCOLINA|PANCURONIO|ROCURONIO|VECURONIO|ATRACURIO|METOPROLOL|GADOTERICO|GADOBUTROL|IOBITRIDOL|IOPROMIDA|GADOXETATO|DOTAREM|GADOVIST|ULTRAVIST|PRIMOVIST|BARIOGEL|SULFATO BARIO|GLYCOPHOS|GLICEROFOSFATO|GLICOSE.*50%/;

function isItemAltaVigilancia(name: string): boolean {
  const n = name.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return MAV_REGEX.test(n);
}

export const TransferRequest: React.FC = () => {
  const [targetDays, setTargetDays] = useState(7);
  const [consumptionDays, setConsumptionDays] = useState(5);
  const [safetyMargin, setSafetyMargin] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'medicamento' | 'material' | 'dieta'>('all');
  const [subCategoryFilter, setSubCategoryFilter] = useState<'all' | 'comprimido' | 'injetavel' | 'soroterapia' | 'solucao' | 'altavigilancia'>('all');
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
  const [rawItems, setRawItems] = useState<RawItem[]>([]);
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({});
  const [draftQtys, setDraftQtys] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [manualAddId, setManualAddId] = useState('');
  const [manualAddQty, setManualAddQty] = useState(10);
  const [manualAddSearch, setManualAddSearch] = useState('');

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
    let rawMap: Record<string, RawItem & { dailyValues: number[] }> = {};

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

      const dailyCols: number[] = [];
      for (let c = 3; c < totalIdx; c++) {
        dailyCols.push(c);
      }

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length <= saldoIdx || !row[0]) continue;

        const id = row[0].trim();
        const dailyValues = dailyCols.map(c => parseBrNumber(row[c]));
        // Fallback: se não há colunas diárias, usa a coluna média
        if (dailyValues.length === 0) {
          dailyValues.push(parseBrNumber(row[mediaIdx]));
        }
        const saldoSolicitante = parseBrNumber(row[saldoIdx]);

        rawMap[id] = {
          id,
          name: row[1]?.replace(/"/g, ''),
          unit: row[2]?.replace(/"/g, ''),
          dailyValues,
          stock: saldoSolicitante,
          price: 0,
          supplierStock: 0,
          supplierLots: []
        };
      }
    }

    // 2. Processar Estoque CAF (Fornecedor)
    if (filesData.caf) {
      const { lotsMap, totalsMap } = parseStockFile(filesData.caf);
      for (const id in rawMap) {
        if (totalsMap[id] !== undefined) rawMap[id].supplierStock = totalsMap[id];
        if (lotsMap[id]) rawMap[id].supplierLots = lotsMap[id];
      }
    }

    // 3. Processar Estoque Destino (Solicitante)
    if (filesData.destino) {
      const { totalsMap } = parseStockFile(filesData.destino);
      for (const id in rawMap) {
        if (totalsMap[id] !== undefined) rawMap[id].stock = totalsMap[id];
      }
    }

    // 4. Processar MOVI_ESTOQ (Para preços)
    if (filesData.movi) {
      const rows = parseCSV(filesData.movi);
      for (let i = 2; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 10 || !row[0]) continue;
        const id = row[0].trim();
        if (rawMap[id]) rawMap[id].price = parseBrNumber(row[9]);
      }
    }

    const sorted = Object.values(rawMap).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    setRawItems(sorted);
    setManualOverrides({});
    setIsProcessing(false);
  }, [filesData]);

  // --- Cálculo reativo das sugestões ---
  const inventory = useMemo<InventoryItem[]>(() => {
    if (rawItems.length === 0) return [];

    // Mapa de stocks por id para cálculo de equivalentes
    const stockMap: Record<string, number> = {};
    rawItems.forEach(p => { stockMap[p.id] = p.stock; });

    return rawItems.map(p => {
      const colsToUse = p.dailyValues.slice(-consumptionDays);
      const sum = colsToUse.reduce((a, v) => a + v, 0);
      const media = colsToUse.length > 0 ? sum / colsToUse.length : 0;

      const equivalentIds = EQUIVALENCE_MAP[p.id] || [];
      const equivalentStockAtDestino = equivalentIds.reduce((total, eqId) => {
        return total + (stockMap[eqId] || 0);
      }, 0);

      const targetStock = media * targetDays;
      let suggestion = targetStock - (p.stock + equivalentStockAtDestino);
      suggestion = suggestion > 0 ? Math.ceil(suggestion * (1 + safetyMargin / 100) / 10) * 10 : 0;

      const orderQty = manualOverrides[p.id] !== undefined ? manualOverrides[p.id] : suggestion;

      const half = Math.floor(p.dailyValues.length / 2);
      const recentAvg = half > 0 ? p.dailyValues.slice(-half).reduce((s, v) => s + v, 0) / half : media;
      const olderAvg  = half > 0 ? p.dailyValues.slice(0, half).reduce((s, v) => s + v, 0) / half : media;
      const trend: 'up' | 'down' | 'stable' =
        (olderAvg > 0 && recentAvg > olderAvg * 1.15) ? 'up' :
        (olderAvg > 0 && recentAvg < olderAvg * 0.85) ? 'down' : 'stable';

      return {
        ...p,
        media,
        trend,
        suggested: suggestion,
        orderQty,
        equivalentStock: equivalentStockAtDestino
      };
    });
  }, [rawItems, consumptionDays, targetDays, safetyMargin, manualOverrides]);

  const filteredManualItems = useMemo(() => {
    if (!manualAddSearch.trim()) return rawItems;
    const q = manualAddSearch.toLowerCase();
    return rawItems.filter(i => i.name.toLowerCase().includes(q) || i.id.includes(q));
  }, [rawItems, manualAddSearch]);

  const handleManualAdd = () => {
    if (!manualAddId) return;
    const qty = manualAddQty > 0 ? Math.ceil(manualAddQty / 10) * 10 : 0;
    setManualOverrides(prev => ({ ...prev, [manualAddId]: qty }));
    setManualAddId('');
    setManualAddQty(10);
    setManualAddSearch('');
  };

  // Zera todas as quantidades do pedido
  const handleZerarPedido = useCallback(() => {
    const zeros: Record<string, number> = {};
    rawItems.forEach(item => { zeros[item.id] = 0; });
    setManualOverrides(zeros);
    setDraftQtys({});
  }, [rawItems]);

  // Atualiza rascunho durante digitação (sem arredondamento)
  const handleQtyChange = (id: string, val: string) => {
    setDraftQtys(prev => ({ ...prev, [id]: val }));
  };

  // Arredonda e salva ao sair do campo
  const handleQtyBlur = (id: string, val: string) => {
    const raw = Number(val) || 0;
    const rounded = raw > 0 ? Math.ceil(raw / 10) * 10 : 0;
    setManualOverrides(prev => ({ ...prev, [id]: rounded }));
    setDraftQtys(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // Exportar pedido para PDF
  const exportToPDF = () => {
    const itemsToOrder = filteredInventory.filter(item => item.orderQty > 0);
    if (itemsToOrder.length === 0) return alert("Nenhum item com quantidade maior que zero para pedir.");

    const date = new Date().toLocaleDateString('pt-BR');
    const totalQty = itemsToOrder.reduce((acc, item) => acc + item.orderQty, 0);

    // Cada produto gera N linhas (uma por lote), com rowspan nas colunas fixas
    const rowsHtml = itemsToOrder.map((item, idx) => {
      const allocatedLots = allocateLots(item.supplierLots, item.orderQty);
      const rowspan = Math.max(allocatedLots.length, 1);

      // Urgência
      const urg = getUrgency(item, targetDays);
      const rowBg =
        urg.level === 'critical'  ? '#fff1f2' :
        urg.level === 'urgent'    ? '#fff7ed' :
        urg.level === 'attention' ? '#fffbeb' :
        idx % 2 === 0 ? '#ffffff' : '#f8fafc';
      const leftBorder =
        urg.level === 'critical'  ? 'border-left:3px solid #ef4444;' :
        urg.level === 'urgent'    ? 'border-left:3px solid #f97316;' :
        urg.level === 'attention' ? 'border-left:3px solid #f59e0b;' : '';
      const borderTop = idx > 0 ? 'border-top: 2px solid #e2e8f0;' : '';

      const urgBadgeBg =
        urg.level === 'critical'  ? '#ef4444' :
        urg.level === 'urgent'    ? '#f97316' :
        urg.level === 'attention' ? '#f59e0b' : '';
      const urgBadgeFg =
        urg.level === 'attention' ? '#78350f' : 'white';
      const urgLabel =
        urg.level === 'critical'  ? 'CRITICO' :
        urg.level === 'urgent'    ? 'URGENTE' :
        urg.level === 'attention' ? 'ATENCAO' : '';
      const urgTextColor =
        urg.level === 'critical'  ? '#dc2626' :
        urg.level === 'urgent'    ? '#ea580c' : '#d97706';
      const coverageText = urg.coverageDays <= 0 ? 'Estoque zerado' : `${urg.coverageDays.toFixed(1)} dias`;
      const trendHtml =
        item.trend === 'up'   ? '<span style="color:#ef4444;font-weight:900;font-size:9px;margin-left:2px;">&#8593;</span>' :
        item.trend === 'down' ? '<span style="color:#16a34a;font-weight:900;font-size:9px;margin-left:2px;">&#8595;</span>' : '';

      const urgRowHtml = urg.level !== 'ok' ? `
        <div style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
          <span style="font-size:7px;font-weight:900;padding:1px 5px;border-radius:3px;letter-spacing:0.5px;background:${urgBadgeBg};color:${urgBadgeFg};">${urgLabel}</span>
          <span style="font-size:7.5px;font-weight:600;color:${urgTextColor};">${coverageText}</span>
          ${trendHtml}
        </div>` : (item.trend === 'up' ? `<div style="margin-bottom:2px;"><span style="font-size:7.5px;color:#f97316;font-weight:700;">&#8593; consumo em alta</span></div>` : '');

      const lotRows = allocatedLots.length === 0
        ? [`<td class="td-lot-cell" style="color:#b0bec5;font-style:italic;">Sem lotes disponíveis na CAF</td>`]
        : allocatedLots.map((l, li) => {
            const isLast  = li === allocatedLots.length - 1;
            const lotBadge = l.isWarning
              ? `<span class="badge-warn">&#9888; Falta na CAF</span>`
              : `<span class="badge-lot">${l.lote}</span>`;
            const valBadge = !l.isWarning && l.validade
              ? `<span class="badge-val">Val: ${l.validade}</span>`
              : '';
            const qtyBadge = `<span class="badge-qty">${l.qty} un</span>`;
            const borderB = isLast ? '' : 'border-bottom: 1px solid #e8edf4;';
            return `<td class="td-lot-cell" style="${borderB}">
              <div class="lot-line">
                <span class="chk">&#9744;</span>
                ${lotBadge}
                ${valBadge}
                ${qtyBadge}
                <span class="atd-label">Atendido:</span>
                <span class="atd-field"></span>
              </div>
            </td>`;
          });

      return lotRows.map((lotCell, li) => {
        if (li === 0) {
          return `<tr style="background:${rowBg};${borderTop}${leftBorder}">
            <td class="td-id" rowspan="${rowspan}">${item.id}</td>
            <td class="td-produto" rowspan="${rowspan}">${urgRowHtml}${item.name}</td>
            <td class="td-un" rowspan="${rowspan}">${item.unit}</td>
            <td class="td-qtd" rowspan="${rowspan}">${item.orderQty}</td>
            <td class="td-caf" rowspan="${rowspan}">${item.supplierStock}</td>
            ${lotCell}
            <td class="td-atd-final" rowspan="${rowspan}"></td>
          </tr>`;
        }
        return `<tr style="background:${rowBg};">${lotCell}</tr>`;
      }).join('');
    }).join('');

    // Segunda página: registro de faltas
    const faltaRowsHtml = itemsToOrder.map((item, idx) => {
      const allocatedLots = allocateLots(item.supplierLots, item.orderQty);
      const faltaQty = allocatedLots.filter(l => l.isWarning).reduce((s, l) => s + l.qty, 0);
      const hasFalta = faltaQty > 0;
      const rowBg = hasFalta ? '#fff8f0' : (idx % 2 === 0 ? '#ffffff' : '#f8fafc');
      return `<tr style="background:${rowBg};">
        <td class="td-check-col">
          <div class="check-box${hasFalta ? ' check-box-alert' : ''}">
            ${hasFalta ? '<span class="alert-mark">!</span>' : ''}
          </div>
        </td>
        <td class="td-id">${item.id}</td>
        <td class="td-produto${hasFalta ? ' produto-falta' : ''}">${item.name}</td>
        <td class="td-un">${item.unit}</td>
        <td class="td-qtd">${item.orderQty}</td>
        <td class="td-falta-qty${hasFalta ? ' falta-qty-warn' : ''}">${hasFalta ? faltaQty + ' un' : '—'}</td>
        <td class="td-obs"><div class="obs-line"></div></td>
      </tr>`;
    }).join('');

    const totalFaltaItens = itemsToOrder.filter(item => {
      const lots = allocateLots(item.supplierLots, item.orderQty);
      return lots.some(l => l.isWarning);
    }).length;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 10mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #1e293b; background: #fff; }

  /* ─── CABEÇALHO ─── */
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    background: #1e3a5f;
    color: white;
    padding: 10px 14px 9px;
    margin-bottom: 10px;
    border-radius: 4px;
  }
  .header-falta { background: #7c2d12; }
  .header-left h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
  .header-left .sub { font-size: 8.5px; opacity: 0.75; margin-top: 3px; }
  .header-right { text-align: right; font-size: 8.5px; opacity: 0.85; line-height: 1.7; }
  .header-right strong { font-size: 10px; opacity: 1; }

  /* ─── TABELA ─── */
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    border: 1px solid #d1d9e6;
    border-radius: 4px;
    overflow: hidden;
  }
  col.c-id   { width: 5%; }
  col.c-prod { width: 34%; }
  col.c-un   { width: 7%; }
  col.c-qtd  { width: 4%; }
  col.c-caf  { width: 6%; }
  col.c-lot  { width: 34%; }
  col.c-atd  { width: 10%; }

  col.f-chk  { width: 5%; }
  col.f-id   { width: 6%; }
  col.f-prod { width: 40%; }
  col.f-un   { width: 8%; }
  col.f-qtd  { width: 6%; }
  col.f-falta{ width: 9%; }
  col.f-obs  { width: 26%; }

  thead tr { background: #2d5282; color: white; }
  thead.thead-falta tr { background: #9a3412; }
  th {
    padding: 7px 8px;
    font-size: 8px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    text-align: left;
    border-right: 1px solid rgba(255,255,255,0.15);
  }
  th:last-child { border-right: none; }
  th.right { text-align: right; }

  td {
    padding: 6px 8px;
    vertical-align: middle;
    font-size: 9px;
    border-right: 1px solid #e8edf4;
    overflow: hidden;
  }
  td:last-child { border-right: none; }

  .td-id      { font-size: 8px; color: #7c8db0; font-family: monospace; }
  .td-produto { font-size: 9px; font-weight: 600; color: #1e293b; word-break: break-word; line-height: 1.35; }
  .td-un      { font-size: 8px; color: #4a5568; word-break: break-word; line-height: 1.3; }
  .td-qtd     { text-align: center; font-size: 13px; font-weight: 800; color: #2d5282; padding: 6px 4px; }
  .td-caf     { text-align: center; font-size: 11px; font-weight: 700; color: #7c3aed; }
  .td-lot-cell { padding: 5px 8px; width: 100%; }

  /* ─── LINHA DE LOTE ─── */
  .lot-line {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 18px;
    width: 100%;
  }
  .chk {
    font-size: 13px;
    color: #90a4c0;
    flex-shrink: 0;
    line-height: 1;
  }
  .badge-lot {
    flex-shrink: 0;
    background: #e8f0fe;
    border: 1px solid #a8c4f0;
    border-radius: 3px;
    padding: 2px 9px;
    font-size: 10px;
    font-weight: 700;
    color: #1a4b8f;
    letter-spacing: 0.3px;
    font-family: monospace;
  }
  .badge-val {
    flex-shrink: 0;
    background: #f3f0ff;
    border: 1px solid #c4b5fd;
    border-radius: 3px;
    padding: 2px 7px;
    font-size: 9px;
    font-weight: 600;
    color: #5b21b6;
  }
  .badge-warn {
    flex-shrink: 0;
    background: #fff3e0;
    border: 1px solid #ffb74d;
    border-radius: 3px;
    padding: 1px 7px;
    font-size: 8.5px;
    font-weight: 700;
    color: #e65100;
  }
  .badge-qty {
    flex-shrink: 0;
    background: #e8f5e9;
    border: 1px solid #a5d6a7;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 8px;
    font-weight: 700;
    color: #2e7d32;
  }
  .atd-label {
    flex-shrink: 0;
    font-size: 7.5px;
    color: #90a4c0;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-left: 4px;
  }
  .atd-field {
    flex: 1;
    border-bottom: 1.5px solid #b0bec5;
    min-width: 30px;
    height: 11px;
    display: inline-block;
  }
  .td-atd-final {
    text-align: center;
    border-left: 2px solid #d1d9e6;
    vertical-align: middle;
  }

  /* ─── RODAPÉ TOTAIS ─── */
  .footer-totais {
    display: flex;
    justify-content: flex-end;
    gap: 24px;
    margin-top: 8px;
    padding: 6px 10px;
    background: #f0f4f9;
    border-radius: 4px;
    border: 1px solid #d1d9e6;
  }
  .total-item { font-size: 9px; color: #4a5568; }
  .total-item strong { font-size: 11px; color: #1e3a5f; margin-left: 4px; }

  /* ─── ASSINATURAS ─── */
  .assinaturas {
    display: flex;
    gap: 18px;
    margin-top: 22px;
    page-break-inside: avoid;
  }
  .assin { flex: 1; }
  .assin.small { flex: 0 0 105px; }
  .assin-line {
    border-top: 1.5px solid #2d5282;
    margin-top: 18px;
    padding-top: 5px;
  }
  .assin-line.falta { border-top-color: #9a3412; }
  .assin-label {
    font-size: 8px;
    font-weight: 700;
    color: #2d5282;
    text-transform: uppercase;
    letter-spacing: 0.7px;
  }
  .assin-label.falta { color: #9a3412; }

  /* ─── SEGUNDA PÁGINA: FALTAS ─── */
  .page-falta { page-break-before: always; }

  .legenda-falta {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 8px;
    padding: 6px 10px;
    background: #fff8f0;
    border: 1px solid #fed7aa;
    border-radius: 4px;
  }
  .legenda-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 8px;
    color: #7c2d12;
    font-weight: 600;
  }

  /* Caixa grande para marcar X */
  .td-check-col { text-align: center; padding: 4px; }
  .check-box {
    width: 26px;
    height: 26px;
    border: 2.5px solid #64748b;
    border-radius: 4px;
    margin: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }
  .check-box-alert {
    border-color: #ea580c;
    background: #fff7ed;
  }
  .alert-mark {
    font-size: 13px;
    font-weight: 900;
    color: #ea580c;
    line-height: 1;
  }

  .produto-falta { color: #9a3412 !important; }

  .td-falta-qty { text-align: center; font-size: 10px; font-weight: 700; color: #94a3b8; }
  .falta-qty-warn {
    color: #c2410c !important;
    background: #fff7ed;
    font-size: 11px;
  }

  .td-obs { padding: 4px 8px; }
  .obs-line {
    border-bottom: 1px solid #cbd5e1;
    height: 18px;
    width: 100%;
  }

  .instrucao-box {
    margin-bottom: 10px;
    padding: 8px 12px;
    background: #fef3c7;
    border: 1px solid #fcd34d;
    border-left: 4px solid #f59e0b;
    border-radius: 4px;
    font-size: 8.5px;
    color: #78350f;
    line-height: 1.6;
  }
  .instrucao-box strong { font-size: 10px; display: block; margin-bottom: 2px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

<!-- ═══════════════════ PÁGINA 1: SEPARAÇÃO ═══════════════════ -->
<div class="header">
  <div class="header-left">
    <h1>Solicitação de Transferência — CAF</h1>
    <div class="sub">Separação de medicamentos e materiais com base em consumo médio e cobertura de estoque</div>
  </div>
  <div class="header-right">
    <div>Data: <strong>${date}</strong></div>
    <div>Meta ${targetDays} dias &nbsp;·&nbsp; Segurança ${safetyMargin}% &nbsp;·&nbsp; Consumo ${consumptionDays} dias</div>
  </div>
</div>

<table>
  <colgroup>
    <col class="c-id"><col class="c-prod"><col class="c-un"><col class="c-qtd"><col class="c-caf"><col class="c-lot"><col class="c-atd">
  </colgroup>
  <thead>
    <tr>
      <th>ID</th>
      <th>Produto</th>
      <th>Unidade</th>
      <th style="text-align:center">Qtd</th>
      <th style="text-align:center">Est. CAF</th>
      <th>Lotes Sugeridos (FEFO) &nbsp;·&nbsp; &#9744; Conferido &nbsp;·&nbsp; Atendido</th>
      <th style="text-align:center;border-left:2px solid rgba(255,255,255,0.25)">Qtd Atendida Final</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>

<div class="footer-totais">
  <div class="total-item">Itens diferentes: <strong>${itemsToOrder.length}</strong></div>
  <div class="total-item">Total de unidades: <strong>${totalQty}</strong></div>
</div>

<div class="assinaturas">
  <div class="assin">
    <div class="assin-line"><div class="assin-label">Separado por</div></div>
  </div>
  <div class="assin">
    <div class="assin-line"><div class="assin-label">Conferido por</div></div>
  </div>
  <div class="assin small">
    <div class="assin-line"><div class="assin-label">Data</div></div>
  </div>
</div>

<!-- ═══════════════════ PÁGINA 2: REGISTRO DE FALTAS ═══════════════════ -->
<div class="page-falta">

  <div class="header header-falta">
    <div class="header-left">
      <h1>&#9888; Registro de Faltas na CAF</h1>
      <div class="sub">Marque um X na caixa dos produtos que NÃO foram atendidos por falta de estoque na CAF</div>
    </div>
    <div class="header-right">
      <div>Data: <strong>${date}</strong></div>
      <div>Total pedido: <strong>${itemsToOrder.length} itens</strong> &nbsp;·&nbsp; Faltas identificadas: <strong>${totalFaltaItens} itens</strong></div>
    </div>
  </div>

  <div class="instrucao-box">
    <strong>&#9998; Como usar esta folha:</strong>
    Itens com <strong>!</strong> já têm falta identificada pelo sistema (estoque CAF insuficiente).
    Para os demais, caso a separação física não seja possível, <strong>marque um X grande na caixa</strong> e registre a observação.
    Esta folha deve ser arquivada junto à solicitação original após conferência.
  </div>

  <div class="legenda-falta">
    <div class="legenda-item">
      <div style="width:18px;height:18px;border:2.5px solid #64748b;border-radius:3px;"></div>
      Sem falta identificada — marque X se não foi atendido
    </div>
    <div class="legenda-item">
      <div style="width:18px;height:18px;border:2.5px solid #ea580c;border-radius:3px;background:#fff7ed;display:flex;align-items:center;justify-content:center;font-weight:900;color:#ea580c;font-size:11px;">!</div>
      Falta já identificada pelo sistema — confirme e marque X
    </div>
  </div>

  <table>
    <colgroup>
      <col class="f-chk"><col class="f-id"><col class="f-prod"><col class="f-un"><col class="f-qtd"><col class="f-falta"><col class="f-obs">
    </colgroup>
    <thead class="thead-falta">
      <tr>
        <th style="text-align:center">Falta?</th>
        <th>ID</th>
        <th>Produto</th>
        <th>Unidade</th>
        <th style="text-align:center">Qtd Pedida</th>
        <th style="text-align:center">Qtd em Falta</th>
        <th>Observação / Justificativa</th>
      </tr>
    </thead>
    <tbody>${faltaRowsHtml}</tbody>
  </table>

  <div class="assinaturas">
    <div class="assin">
      <div class="assin-line falta"><div class="assin-label falta">Farmacêutico Responsável</div></div>
    </div>
    <div class="assin">
      <div class="assin-line falta"><div class="assin-label falta">CRF / Matrícula</div></div>
    </div>
    <div class="assin small">
      <div class="assin-line falta"><div class="assin-label falta">Data / Hora</div></div>
    </div>
  </div>

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

  // Exportar pedido para CSV
  const exportOrderCSV = () => {
    const itemsToOrder = filteredInventory.filter(item => item.orderQty > 0);
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

      // Normaliza acentos: SÓDIO → SODIO, CÁPSULA → CAPSULA, etc.
      const _norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const name = _norm(item.name);
      const unit = _norm(item.unit);

      // Lógica de Categorização
      const txt = name + ' ' + unit;

      const matKeywords = [
        "SERINGA", "AGULHA", "SONDA", "COMPRESSA", "FRALDA", "EXTENSOR",
        "CURATIVO", "COLETORA", "PROTETOR", "CLAMP", "GUIA", "DISPOSITIVO",
        "IMPLANON", "CLOREXEDINA", "CLOREXIDINA", "GAZE", "LUVA", "EQUIPO", "CATETER",
        "ESPARADRAPO", "ALCOOL", "MASCARA", "TOUCA", "AVENTAL", "TUBO",
        "DRENO", "ELETRODO", "FITA", "PAPEL", "COLETOR", "ALGODAO", "GAZ", "FIXADOR", "POSIFLUSH"
      ];
      const isExplicitMat = matKeywords.some(k => name.includes(k) || unit.includes(k));

      // Materiais explícitos (ex: EQUIPO PARENTERAL) não devem ser classificados como dieta
      const isDieta = !isExplicitMat && (name.includes("DIETA") || name.includes("NUTRIFICA") || name.includes("ENTERAL") || name.includes("PARENTERAL") || name.includes("SUPLEMENTO") || name.includes("MODULO ALIMENTAR"));

      const isComprimido = /\bCOMP\b|COMPRIMIDO|\bCP\b|\bCPR\b|\bTAB\b|C[AA]PSULA|\bCAPS\b|DR[AA]GEA|\bDRG\b|SACH[EE]|ENVELOPE|\bENV\b|GRANULADO|P[OO]\s*ORAL/.test(txt);

      const isAltaVigilancia = isItemAltaVigilancia(item.name);

      // Soroterapia: fluidos base de grande volume (50-1000ml) + Água Destilada + NaCl 0,9% em ampola (10ml)
      // GLICOSE\s*(?:5(?!\d)|10(?!\d)) — captura 5% e 10% mas NÃO 50%
      const isSoroterapia = (
        /SORO\s*FISIOL|SORO\s*GLICOS|CLOR.*SODIO\s*0,9|NACL\s*0,9|GLICOSE\s*(?:5(?!\d)|10(?!\d))|RINGER|MANITOL|\bSF\s*0,9|\bSG\s*5|\bRL\b/.test(name)
        && /\b(50|100|250|500|1\.?000)\s*ML\b/.test(name)
      ) || /AGUA\s*(DEST|P.*INJ|BIDEST)/.test(name)
        || (/CLORETO\s*SODIO\s*9\s*MG/.test(name) && /10\s*ML/.test(name));

      // Soluções: orais, tópicas, oftálmicas, nasais, suspensões, gotas, bisnagas, tubos
      // Comprimidos (CAPS GEL = cápsula gelatinosa) não devem ser classificados como solução
      const isSolucao = !isComprimido && /XAROPE|SUSPENS[ÃA]O|\bSUSP\b|\bGOTAS\b|\bGOTA\b|\bGTS\b|\bCREME\b|\bPOMADA\b|\bGEL\b|LO[ÇC][ÃA]O|COL[ÍI]RIO|\bOFTAL\b|\bSPRAY\b|\bENEMA\b|SUPOSIT[ÓO]RIO|\bTOP\b|\bBG\b|\bINAL\b|\bAER\b|\bRETAL\b|\bSOL\b|SOL(U[ÇC][ÃA]O)?\s*(ORAL|T[OÓ]PICA|OFT[ÁA]LM|NASAL)/.test(txt);

      // Injetáveis: ampolas + frascos + frascos-ampola + seringas + bolsas de medicamentos
      // Exclui o que já foi classificado como soroterapia ou solução
      const isInjetavel = !isSoroterapia && !isSolucao && !name.includes('POSIFLUSH') && (
        /\bAMP\b|AMPOLA|\bFR\b|FRASCO|FR[/.]?AMP|\bFCO\b|\bFA\b|SER.*PRE|CANETA|INJET[ÁA]VEL|\bINJ\b|LIOFILIZADO|BOLSA|\bBLC\b|\bBLF\b|INFUS[ÃA]O|\bEV\b|\bIM\b|\bSC\b/.test(txt)
      );

      // Compat: isFrasco mantido para lógica de isMed abaixo
      const isFrasco = isInjetavel || isSoroterapia || isSolucao;

      const medKeywords = ["MG", "MCG", "G/", "ML", "UI", "MEQ", "CAPS", "DRAGEA"];
      const isMed = !isDieta && !isExplicitMat && (isComprimido || isFrasco || medKeywords.some(k => name.includes(k) || unit.includes(k)));

      const isMat = !isDieta && (isExplicitMat || (!isMed && !isComprimido && !isFrasco));

      if (categoryFilter === 'dieta') {
        if (!isDieta) return false;
      } else if (categoryFilter === 'medicamento') {
        if (!isMed) return false;
        if (subCategoryFilter === 'comprimido' && !isComprimido) return false;
        if (subCategoryFilter === 'injetavel' && !isInjetavel) return false;
        if (subCategoryFilter === 'soroterapia' && !isSoroterapia) return false;
        if (subCategoryFilter === 'solucao' && !isSolucao) return false;
        if (subCategoryFilter === 'altavigilancia' && !isAltaVigilancia) return false;
      } else if (categoryFilter === 'material') {
        if (!isMat) return false;
      }

      return true;
    }).sort((a, b) => {
      const ua = getUrgency(a, targetDays);
      const ub = getUrgency(b, targetDays);
      if (ub.score !== ua.score) return ub.score - ua.score;
      const ca = ua.coverageDays < 0 ? 9999 : ua.coverageDays;
      const cb = ub.coverageDays < 0 ? 9999 : ub.coverageDays;
      return ca - cb;
    });
  }, [inventory, searchTerm, categoryFilter, subCategoryFilter, targetDays]);

  const urgencyMap = useMemo(() => {
    const map: Record<string, { level: UrgencyLevel; coverageDays: number; score: number }> = {};
    filteredInventory.forEach(item => { map[item.id] = getUrgency(item, targetDays); });
    return map;
  }, [filteredInventory, targetDays]);

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
              <span className="text-sm font-bold text-slate-700">CAF</span>
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
      {rawItems.length === 0 && (
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
      {rawItems.length > 0 && (
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
                  <div className="flex flex-wrap bg-white border border-emerald-200 rounded-lg p-1 shadow-sm animate-in fade-in slide-in-from-left-2">
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
                      💊 Comprimidos
                    </button>
                    <button
                      onClick={() => setSubCategoryFilter('injetavel')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'injetavel' ? 'bg-purple-600 text-white' : 'text-purple-600 hover:bg-purple-50'}`}
                    >
                      💉 Injetáveis
                    </button>
                    <button
                      onClick={() => setSubCategoryFilter('soroterapia')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'soroterapia' ? 'bg-blue-600 text-white' : 'text-blue-600 hover:bg-blue-50'}`}
                    >
                      🩸 Soroterapia
                    </button>
                    <button
                      onClick={() => setSubCategoryFilter('solucao')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'solucao' ? 'bg-teal-600 text-white' : 'text-teal-600 hover:bg-teal-50'}`}
                    >
                      🧪 Soluções
                    </button>
                    <button
                      onClick={() => setSubCategoryFilter('altavigilancia')}
                      className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${subCategoryFilter === 'altavigilancia' ? 'bg-red-600 text-white' : 'text-red-600 hover:bg-red-50'}`}
                    >
                      🔴 Alta Vigilância
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

            <div className="overflow-y-auto overflow-x-hidden flex-1">
              <table className="w-full text-left border-collapse table-fixed">
                <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm border-b border-slate-200">
                  <tr>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase tracking-wider w-[28%]">Produto</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right bg-slate-100/50 w-[10%]" title="Saldo atual do local que pediu">Est. Dest.</th>
                    <th className="py-2 px-2 text-xs font-semibold text-indigo-700 uppercase tracking-wider text-right bg-indigo-50/50 w-[9%]" title="Saldo atual na CAF">Est. CAF</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase tracking-wider text-right w-[9%]" title={`Média calculada sobre os últimos ${consumptionDays} dias`}>Méd/Dia</th>
                    <th className="py-2 px-2 text-xs font-semibold text-slate-600 uppercase tracking-wider text-center border-l border-r border-slate-200 w-[13%]" title={`Inclui ${safetyMargin}% de segurança`}>Pedir Qtde</th>
                    <th className="py-2 px-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider w-[31%] bg-emerald-50/50">Lotes (FEFO)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item) => (
                    <tr key={item.id} className={`transition-colors group ${
                      urgencyMap[item.id]?.level === 'critical' ? 'border-l-[3px] border-l-red-500 bg-red-50/50' :
                      urgencyMap[item.id]?.level === 'urgent'   ? 'border-l-[3px] border-l-orange-400 bg-orange-50/40' :
                      urgencyMap[item.id]?.level === 'attention'? 'border-l-[3px] border-l-amber-400 bg-amber-50/30' :
                      'border-l-[3px] border-l-transparent hover:bg-indigo-50/30'}`}>
                      <td className="py-2 px-2">
                        {urgencyMap[item.id]?.level !== 'ok' && (
                          <div className={`flex items-center gap-1 mb-1 ${urgencyMap[item.id]?.level === 'critical' ? 'animate-pulse' : ''}`}>
                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide ${urgencyMap[item.id]?.level === 'critical' ? 'bg-red-600 text-white' : urgencyMap[item.id]?.level === 'urgent' ? 'bg-orange-500 text-white' : 'bg-amber-400 text-amber-900'}`}>
                              {urgencyMap[item.id]?.level === 'critical' ? 'CRITICO' : urgencyMap[item.id]?.level === 'urgent' ? 'URGENTE' : 'ATENCAO'}
                            </span>
                            <span className={`text-[9px] font-semibold ${urgencyMap[item.id]?.level === 'critical' ? 'text-red-600' : urgencyMap[item.id]?.level === 'urgent' ? 'text-orange-500' : 'text-amber-600'}`}>
                              {(urgencyMap[item.id]?.coverageDays ?? -1) <= 0 ? 'Estoque zerado' : `${(urgencyMap[item.id]?.coverageDays ?? 0).toFixed(1)} dias`}
                            </span>
                            {item.trend === 'up'   && <span className="text-[11px] text-red-500 font-black leading-none">↑</span>}
                            {item.trend === 'down' && <span className="text-[11px] text-emerald-500 font-black leading-none">↓</span>}
                          </div>
                        )}
                        {urgencyMap[item.id]?.level === 'ok' && item.trend === 'up' && (
                          <span className="text-[9px] text-orange-500 font-bold mb-0.5 block">↑ consumo em alta</span>
                        )}
                        <div className="font-medium text-slate-800 text-sm leading-tight mb-0.5 truncate" title={item.name}>{item.name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-slate-400 font-mono">#{item.id} · {item.unit}</span>
                          {isItemAltaVigilancia(item.name) && (
                            <span className="text-[9px] font-bold text-red-600 bg-red-50 border border-red-200 px-1 rounded">ALTA VIG.</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-right bg-slate-50/30">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold text-sm ${item.stock <= item.media * 3 ? 'text-red-500' : 'text-slate-700'}`}>
                            {item.stock}
                          </span>
                          {item.equivalentStock && item.equivalentStock > 0 ? (
                            <span className="text-[9px] text-teal-600 font-bold bg-teal-50 px-1 rounded">+{item.equivalentStock}</span>
                          ) : (
                            <span className="text-[9px] text-slate-400">Sug. {item.suggested}</span>
                          )}
                        </div>
                      </td>

                      <td className="py-2 px-2 text-right bg-indigo-50/30">
                        <span className={`font-bold text-sm ${item.supplierStock < item.orderQty ? 'text-orange-500' : 'text-indigo-700'}`}>
                          {item.supplierStock}
                        </span>
                      </td>

                      <td className="py-2 px-2 text-right text-slate-600 text-sm">
                        {item.media.toFixed(2)}
                      </td>

                      <td className="py-2 px-2 text-center border-l border-r border-slate-100 bg-white">
                        <input
                          type="number"
                          value={draftQtys[item.id] !== undefined ? draftQtys[item.id] : item.orderQty}
                          onChange={(e) => handleQtyChange(item.id, e.target.value)}
                          onBlur={(e) => handleQtyBlur(item.id, e.target.value)}
                          onFocus={(e) => e.target.select()}
                          className={`w-full text-center border rounded-lg py-1 font-bold outline-none transition-all text-sm
                            ${item.orderQty > 0 ? 'border-indigo-300 text-indigo-700 bg-indigo-50/50 focus:ring-2 focus:ring-indigo-200' : 'border-slate-200 text-slate-400 focus:border-slate-400'}`}
                          min="0"
                          step="10"
                        />
                      </td>

                      <td className="py-2 px-2 bg-emerald-50/20">
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
                <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded">CAF</span>
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
                onClick={handleZerarPedido}
                className="w-full py-3 bg-white border border-red-200 hover:bg-red-50 text-red-600 rounded-xl font-medium transition-all flex justify-center items-center gap-2"
              >
                <span className="text-base leading-none">✕</span>
                Zerar Pedido
              </button>

              <button
                onClick={() => { setRawItems([]); setManualOverrides({}); }}
                className="w-full mt-1 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-medium transition-all"
              >
                Refazer / Mudar Base
              </button>
            </div>
          </div>

        </div>
      )}

      {/* Adicionar Produto Manualmente */}
      {rawItems.length > 0 && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-base text-slate-800 flex items-center gap-2 mb-4">
            <Calculator className="text-indigo-600 w-5 h-5" />
            Adicionar Produto Manualmente
          </h2>

          <div className="flex flex-col md:flex-row gap-3 items-end">
            <div className="flex-1 min-w-0">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Filtrar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Digite nome ou ID..."
                  value={manualAddSearch}
                  onChange={e => setManualAddSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex-[2] min-w-0">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">
                Produto ({filteredManualItems.length} disponíveis)
              </label>
              <select
                value={manualAddId}
                onChange={e => setManualAddId(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
              >
                <option value="">Selecione um produto...</option>
                {filteredManualItems.map(item => (
                  <option key={item.id} value={item.id}>
                    #{item.id} — {item.name} ({item.unit})
                  </option>
                ))}
              </select>
            </div>

            <div className="shrink-0">
              <label className="text-xs font-semibold text-slate-500 uppercase mb-1 block">Quantidade</label>
              <input
                type="number"
                value={manualAddQty}
                onChange={e => setManualAddQty(Number(e.target.value))}
                min="0"
                step="10"
                className="w-28 border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-center focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>

            <button
              onClick={handleManualAdd}
              disabled={!manualAddId}
              className={`shrink-0 px-6 py-2 rounded-xl font-bold text-white transition-all
                ${manualAddId ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-600/20' : 'bg-slate-300 cursor-not-allowed'}`}
            >
              Adicionar ao Pedido
            </button>
          </div>

          {manualAddId && (
            <div className="mt-3 p-3 bg-indigo-50 rounded-lg border border-indigo-100 text-sm text-indigo-700 flex items-center gap-2">
              <Package className="w-4 h-4 shrink-0" />
              <span>
                <strong>{rawItems.find(i => i.id === manualAddId)?.name}</strong> — será adicionado com <strong>{Math.ceil(manualAddQty / 10) * 10} un</strong>
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
