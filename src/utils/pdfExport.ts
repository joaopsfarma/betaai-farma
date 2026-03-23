import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProcessedProduct } from '../types';
import { getRiscoAssistencial } from './riscoAssistencial';

export type PDFAccentColor = [number, number, number];

export const PDF_COLORS = {
  emerald: [5, 150, 105] as PDFAccentColor,
  blue: [37, 99, 235] as PDFAccentColor,
  purple: [147, 51, 234] as PDFAccentColor,
  indigo: [79, 70, 229] as PDFAccentColor,
  red: [220, 38, 38] as PDFAccentColor,
  amber: [202, 138, 4] as PDFAccentColor,
  slate: [71, 85, 105] as PDFAccentColor,
  teal: [13, 148, 136] as PDFAccentColor,
  orange: [234, 88, 12] as PDFAccentColor,
};

/**
 * Draws a professional header bar. Returns the next Y position after the header.
 */
export const drawPDFHeader = (
  doc: jsPDF,
  title: string,
  subtitle: string,
  accentColor: PDFAccentColor
): number => {
  const pageWidth = doc.internal.pageSize.width;

  // Main header bar
  doc.setFillColor(...accentColor);
  doc.rect(0, 0, pageWidth, 30, 'F');

  // Subtle lighter strip at bottom
  const lighter: PDFAccentColor = [
    Math.min(accentColor[0] + 50, 255),
    Math.min(accentColor[1] + 50, 255),
    Math.min(accentColor[2] + 50, 255),
  ];
  doc.setFillColor(...lighter);
  doc.rect(0, 28, pageWidth, 2, 'F');

  // System label — top right
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text('FarmaIA  |  Logística Farmacêutica', pageWidth - 12, 7, { align: 'right' });

  // Title
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 12, 13);

  // Subtitle + date
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 12, 21);
  doc.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, pageWidth - 12, 21, { align: 'right' });

  return 36;
};

/**
 * Draws footers on every page (page X / Y + branding).
 * Call AFTER all content has been added.
 */
export const drawPDFFooters = (doc: jsPDF, accentColor: PDFAccentColor): void => {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.4);
    doc.line(12, pageHeight - 14, pageWidth - 12, pageHeight - 14);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('FarmaIA | Sistema de Logística Farmacêutica Hospitalar', 12, pageHeight - 8);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - 12, pageHeight - 8, { align: 'right' });
  }
};

/**
 * Draws a row of KPI cards. Returns Y after the cards.
 */
export const drawKPICards = (
  doc: jsPDF,
  kpis: { label: string; value: string; color?: PDFAccentColor }[],
  startY: number
): number => {
  const pageWidth = doc.internal.pageSize.width;
  const margin = 12;
  const gap = 4;
  const cardWidth = (pageWidth - margin * 2 - gap * (kpis.length - 1)) / kpis.length;
  const cardHeight = 22;

  kpis.forEach((kpi, idx) => {
    const x = margin + (cardWidth + gap) * idx;
    const color = kpi.color ?? PDF_COLORS.slate;

    // Card background + border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    // Accent left bar
    doc.setFillColor(...color);
    doc.rect(x, startY, 3, cardHeight, 'F');

    // Label
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label.toUpperCase(), x + 7, startY + 8);

    // Value
    doc.setTextColor(...color);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(kpi.value, x + 7, startY + 18);
  });

  return startY + cardHeight + 6;
};

// ─── Generic Export ───────────────────────────────────────────────────────────

export interface PDFExportConfig {
  title: string;
  subtitle?: string;
  filename: string;
  headers: string[];
  data: string[][];
  kpis: { label: string; value: string; color?: PDFAccentColor }[];
  accentColor?: PDFAccentColor;
  isLandscape?: boolean;
}

export const exportToPDF = (config: PDFExportConfig) => {
  const orientation = config.isLandscape ? 'landscape' : 'portrait';
  const doc = new jsPDF(orientation as any);
  const color = config.accentColor ?? PDF_COLORS.blue;

  let currentY = drawPDFHeader(doc, config.title, config.subtitle ?? '', color);

  if (config.kpis.length > 0) {
    currentY = drawKPICards(doc, config.kpis, currentY);
  }

  autoTable(doc, {
    startY: currentY + 2,
    head: [config.headers],
    body: config.data,
    theme: 'grid',
    margin: { left: 12, right: 12, bottom: 20 },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  drawPDFFooters(doc, color);
  doc.save(config.filename);
};

// ─── Inventory Export ─────────────────────────────────────────────────────────

export const exportInventoryToPDF = (
  displayData: ProcessedProduct[],
  stats: { critical: number; warning: number; order: number; expiry: number }
) => {
  const doc = new jsPDF();
  const color = PDF_COLORS.emerald;

  let currentY = drawPDFHeader(
    doc,
    'Relatório Geral de Estoque',
    'Inventário consolidado com alertas e cobertura de dias',
    color
  );

  const kpis = [
    { label: 'Urgente (Ruptura)', value: stats.critical.toString(), color: PDF_COLORS.orange },
    { label: 'Divergência Inventário', value: stats.warning.toString(), color: PDF_COLORS.red },
    { label: 'Pedir ao Recebimento', value: stats.order.toString(), color: PDF_COLORS.blue },
    { label: 'Risco de Validade', value: stats.expiry.toString(), color: PDF_COLORS.amber },
    { label: 'Total de Itens', value: displayData.length.toString(), color: PDF_COLORS.slate },
  ];

  currentY = drawKPICards(doc, kpis, currentY);

  const STATUS_COLORS: Record<string, [number, number, number]> = {
    'VERIFICAR INVENTÁRIO': [220, 38, 38],
    'URGENTE!': [234, 88, 12],
    'REMANEJAR (VALIDADE)': [202, 138, 4],
    'PEDIR AO RECEBIMENTO': [37, 99, 235],
    'OK': [22, 163, 74],
  };

  const tableData = displayData.map(item => [
    item.name,
    item.unit,
    item.category,
    item.physicalStock.toString(),
    item.systemStock.toString(),
    item.dailyConsumption.toFixed(1),
    item.coverageDays > 900 ? '∞' : item.coverageDays.toFixed(1),
    new Date(item.expiryDate).toLocaleDateString('pt-BR'),
    item.status,
  ]);

  autoTable(doc, {
    startY: currentY + 2,
    head: [['Produto', 'Un.', 'Categoria', 'Físico', 'Sistema', 'CDM', 'Cobertura', 'Validade', 'Status']],
    body: tableData,
    theme: 'grid',
    margin: { left: 12, right: 12, bottom: 20 },
    styles: {
      fontSize: 7,
      cellPadding: 2.5,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 50, fontStyle: 'bold', textColor: [30, 41, 59] },
      1: { cellWidth: 12, halign: 'center' },
      2: { cellWidth: 22, halign: 'center' },
      3: { cellWidth: 14, halign: 'right' },
      4: { cellWidth: 14, halign: 'right' },
      5: { cellWidth: 14, halign: 'right' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 'auto', fontStyle: 'bold', halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body' && data.column.index === 8) {
        const c = STATUS_COLORS[data.cell.raw as string];
        if (c) data.cell.styles.textColor = c;
      }
    },
  });

  drawPDFFooters(doc, color);
  doc.save('relatorio-estoque.pdf');
};

// ─── Supplier Evaluation Export ────────────────────────────────────────────────

export const exportSupplierEvaluationPDF = (
  displayData: any[],
  metrics: { iqf: string; otd: string; div: string; val: string; conf: string; horario: string }
) => {
  const doc = new jsPDF('landscape');
  const color = PDF_COLORS.indigo;

  let currentY = drawPDFHeader(
    doc,
    'Painel de Performance dos Fornecedores',
    'Avaliação consolidada de Qualidade, SLA e Prazos Logísticos',
    color
  );

  const kpis = [
    { label: 'Qualidade (IQF)', value: `${metrics.iqf}%`, color: PDF_COLORS.indigo },
    { label: 'Entregas no Prazo (OTD)', value: `${metrics.otd}%`, color: PDF_COLORS.blue },
    { label: 'Saúde Física (Conf.)', value: `${metrics.conf}%`, color: PDF_COLORS.emerald },
    { label: 'Divergência Documental', value: `${metrics.div}%`, color: PDF_COLORS.orange },
    { label: 'Risco de Validade', value: `${metrics.val}%`, color: PDF_COLORS.red },
  ];

  currentY = drawKPICards(doc, kpis, currentY);

  const tableData = displayData.map(item => [
    item.nome,
    item.id,
    item.nota !== null ? `${item.nota}` : '-',
    item.mediaAtraso > 0 ? `${item.mediaAtraso.toFixed(1)}d` : '-',
    item.otd !== null ? `${item.otd}%` : '-',
    item.conformidade !== null ? `${item.conformidade}%` : '-',
    item.divergencia !== null ? `${item.divergencia}%` : '-',
    item.riscoValidade !== null ? `${item.riscoValidade}%` : '-',
    item.nota === null ? 'SEM AVAL.' : item.nota >= 90 ? 'APROVADO' : item.nota >= 80 ? 'ATENÇÃO' : 'CRÍTICO'
  ]);

  autoTable(doc, {
    startY: currentY + 4,
    head: [['Fornecedor', 'Cód.', 'IQF', 'Média Atraso', 'OTD (%)', 'Conf. (%)', 'Diverg. (%)', 'Risco Val.', 'Status']],
    body: tableData,
    theme: 'grid',
    margin: { left: 12, right: 12, bottom: 20 },
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'bold', textColor: [30, 41, 59] },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 18, halign: 'center' },
      7: { cellWidth: 20, halign: 'center' },
      8: { cellWidth: 24, fontStyle: 'bold', halign: 'center' },
    },
    didParseCell(data) {
      if (data.section === 'body') {
        if (data.column.index === 8) {
          const val = data.cell.raw as string;
          if (val === 'CRÍTICO') data.cell.styles.textColor = [220, 38, 38];
          else if (val === 'ATENÇÃO') data.cell.styles.textColor = [202, 138, 4];
          else if (val === 'APROVADO') data.cell.styles.textColor = [22, 163, 74];
        }
        if (data.column.index === 2) {
          const val = parseInt(data.cell.raw as string, 10);
          if (!isNaN(val)) {
             if (val < 80) data.cell.styles.textColor = [220, 38, 38];
             else if (val < 90) data.cell.styles.textColor = [202, 138, 4];
             else data.cell.styles.textColor = [22, 163, 74];
          }
        }
      }
    },
  });

  drawPDFFooters(doc, color);
  doc.save('relatorio-fornecedores-srm.pdf');
};

// ─── Ressuprimento PDF ────────────────────────────────────────────────────────

interface RessuprimentoItem {
  id: string;
  produto: string;
  unidade: string;
  mediaConsumo: number;
  saldoAtual: number;
  coberturaDias: number;
  status: 'CRÍTICO' | 'ALERTA' | 'OK';
  previsaoRuptura: string;
  necessidadeCompra: number;
  ocInfo?: { oc: string; quantidadeComprada: number; fornecedor: string; dataPrevista: string };
}

export const exportRessuprimentoPDF = (
  data: RessuprimentoItem[],
  filters: { status: string; search: string },
) => {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Header
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, 297, 20, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('RELATÓRIO DE RESSUPRIMENTO — INTELIGÊNCIA DE ESTOQUE', 14, 13);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}  |  Filtro: ${filters.status}  |  Busca: ${filters.search || '—'}`, 14, 18);

  // Summary row
  const criticos = data.filter(d => d.status === 'CRÍTICO').length;
  const alertas = data.filter(d => d.status === 'ALERTA').length;
  const ok = data.filter(d => d.status === 'OK').length;
  const necessidadeTotal = data.reduce((s, d) => s + d.necessidadeCompra, 0);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Total: ${data.length}  |  Críticos: ${criticos}  |  Alertas: ${alertas}  |  OK: ${ok}  |  Necessidade Total: ${Math.round(necessidadeTotal)} un`,
    14,
    27,
  );

  autoTable(doc, {
    startY: 31,
    head: [['ID', 'Produto / Unidade', 'Consumo/dia', 'Saldo', 'Cobertura (d)', 'Status', 'Previsão', 'Necessidade', 'OC']],
    body: data.map(d => [
      d.id,
      `${d.produto} (${d.unidade})`,
      d.mediaConsumo.toFixed(2),
      d.saldoAtual.toFixed(0),
      d.coberturaDias.toFixed(2),
      d.status,
      d.previsaoRuptura,
      d.necessidadeCompra.toFixed(0),
      d.ocInfo ? `OC ${d.ocInfo.oc}\n${d.ocInfo.quantidadeComprada} un\n${d.ocInfo.dataPrevista}` : 'Sem OC',
    ]),
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    bodyStyles: { fontSize: 7, cellPadding: 2 },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles: {
      0: { cellWidth: 16 },
      1: { cellWidth: 78 },
      2: { cellWidth: 22, halign: 'right' },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 22, halign: 'center' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 32 },
    },
    didParseCell(hookData) {
      if (hookData.section === 'body' && hookData.column.index === 5) {
        const val = hookData.cell.raw as string;
        if (val === 'CRÍTICO') { hookData.cell.styles.textColor = [220, 38, 38]; hookData.cell.styles.fontStyle = 'bold'; }
        else if (val === 'ALERTA') { hookData.cell.styles.textColor = [217, 119, 6]; hookData.cell.styles.fontStyle = 'bold'; }
        else { hookData.cell.styles.textColor = [5, 150, 105]; }
      }
    },
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150);
    doc.text(`Página ${i} de ${pageCount}`, 283, 205, { align: 'right' });
  }

  doc.save('relatorio-ressuprimento.pdf');
};

// ─── PAINEL CAF V2 ───────────────────────────────────────────────────────────

function _riscoColor(label: string): [number, number, number] {
  if (label === 'Crítico') return [220, 38, 38];
  if (label === 'Alto')    return [234, 88, 12];
  if (label === 'Médio')   return [217, 119, 6];
  return [100, 116, 139];
}

interface PainelCAFV2Params {
  criticoSemOC: { id: string; nome: string; saldo: number; media: number; proj: number; status: string }[];
  rupturaSemCob: { id: string; nome: string; estoque: number; lotes: { lote: string }[] }[];
  ocUrgentes: { dataPrevista: string; oc: string; nomeProduto: string; qtComprada: number; qtRecebida: number; qtDiferenca: number; ocStatus: string }[];
  lotesVenc: { id: string; nome: string; estoque: number; menorDiasVenc: number; lotes: { lote: string; validade: string; diasVenc: number }[] }[];
  kpis: {
    totalPainel: number;
    semEstoque: number;
    criticos: number;
    atencao: number;
    criticoSemOC: number;
    rupturaSemCob: number;
  };
}

export const exportPainelCAFV2PDF = ({ criticoSemOC, rupturaSemCob, ocUrgentes, lotesVenc, kpis }: PainelCAFV2Params): void => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const color = PDF_COLORS.blue;
  const pageWidth = doc.internal.pageSize.width;

  let y = drawPDFHeader(doc, 'PAINEL CAF V2 — ALERTAS', `FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}`, color);

  // KPI cards
  const kpiCards = [
    { label: 'Total no Painel', value: kpis.totalPainel.toString(), color: [79, 70, 229] as [number, number, number] },
    { label: 'Sem Estoque',     value: kpis.semEstoque.toString(),   color: [220, 38, 38] as [number, number, number] },
    { label: 'Críticos ≤3d',   value: kpis.criticos.toString(),     color: [239, 68, 68] as [number, number, number] },
    { label: 'Em Atenção ≤7d', value: kpis.atencao.toString(),      color: [217, 119, 6] as [number, number, number] },
    { label: 'Críticos s/ OC', value: kpis.criticoSemOC.toString(), color: [220, 38, 38] as [number, number, number] },
    { label: 'Ruptura s/ OC',  value: kpis.rupturaSemCob.toString(),color: [239, 68, 68] as [number, number, number] },
  ];

  const cardW = (pageWidth - 24) / kpiCards.length;
  kpiCards.forEach((k, i) => {
    const x = 12 + i * cardW;
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x, y, cardW - 4, 22, 3, 3, 'F');
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...k.color);
    doc.text(k.value, x + (cardW - 4) / 2, y + 10, { align: 'center' });
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(k.label, x + (cardW - 4) / 2, y + 17, { align: 'center' });
  });
  y += 28;

  // Section: Críticos sem OC
  if (criticoSemOC.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`🔴 Itens Críticos sem Reposição em OC (${criticoSemOC.length})`, 12, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Cód.', 'Produto', 'Saldo', 'Média', 'Proj.', 'Status', 'Risco', 'Impacto Assistencial']],
      body: criticoSemOC.map(c => {
        const risco = getRiscoAssistencial(c.nome);
        return [
          c.id,
          c.nome,
          c.saldo.toLocaleString('pt-BR'),
          c.media.toFixed(1),
          c.proj > 0 ? c.proj.toFixed(1) + 'd' : '—',
          c.status === 'SEM_ESTOQUE' ? 'Sem Estoque' : c.status === 'CRÍTICO' ? 'Crítico ≤3d' : c.status,
          risco.label,
          risco.impacto,
        ];
      }),
      styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: color, textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 58 }, 2: { cellWidth: 14, halign: 'right' }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 22 }, 6: { cellWidth: 16 }, 7: { cellWidth: 'auto', fontSize: 6 } },
      alternateRowStyles: { fillColor: [255, 241, 242] },
      margin: { left: 12, right: 12, bottom: 20 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          if (hookData.column.index === 5) {
            const v = String(hookData.cell.raw);
            if (v.includes('Crítico') || v === 'Sem Estoque') { hookData.cell.styles.textColor = [220, 38, 38]; hookData.cell.styles.fontStyle = 'bold'; }
          }
          if (hookData.column.index === 6) {
            hookData.cell.styles.textColor = _riscoColor(String(hookData.cell.raw));
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section: Ruptura sem cobertura
  if (rupturaSemCob.length > 0) {
    if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`🚨 Ruptura sem Cobertura — sem estoque e sem OC pendente (${rupturaSemCob.length})`, 12, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Cód.', 'Produto', 'Estoque', 'Lotes', 'Risco', 'Impacto Assistencial']],
      body: rupturaSemCob.map(p => {
        const risco = getRiscoAssistencial(p.nome);
        return [
          p.id,
          p.nome,
          '0',
          p.lotes.length > 0 ? `${p.lotes.length} lote(s)` : '—',
          risco.label,
          risco.impacto,
        ];
      }),
      styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [220, 38, 38] as [number,number,number], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: 62 }, 2: { cellWidth: 16, halign: 'right' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 16 }, 5: { cellWidth: 'auto', fontSize: 6 } },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      margin: { left: 12, right: 12, bottom: 20 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 4) {
          hookData.cell.styles.textColor = _riscoColor(String(hookData.cell.raw));
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  // Section: OC Urgentes
  if (ocUrgentes.length > 0) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += 10;
    if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`OC Nao Atendidas — produto zerado aguardando entrega (${ocUrgentes.length})`, 12, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Data', 'OC', 'Produto', 'Comp.', 'Rec.', 'Dif.', 'Status', 'Risco', 'Impacto Assistencial']],
      body: ocUrgentes.map(o => {
        const risco = getRiscoAssistencial(o.nomeProduto);
        return [
          o.dataPrevista,
          o.oc || '—',
          o.nomeProduto,
          o.qtComprada.toLocaleString('pt-BR'),
          o.qtRecebida.toLocaleString('pt-BR'),
          o.qtDiferenca.toLocaleString('pt-BR'),
          o.qtRecebida > 0 ? 'Parcial' : 'Pendente',
          risco.label,
          risco.impacto,
        ];
      }),
      styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [217, 119, 6] as [number,number,number], textColor: 255, fontStyle: 'bold', fontSize: 6.5 },
      columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 14 }, 2: { cellWidth: 50 }, 3: { cellWidth: 14, halign: 'right' }, 4: { cellWidth: 14, halign: 'right' }, 5: { cellWidth: 14, halign: 'right' }, 6: { cellWidth: 20 }, 7: { cellWidth: 16 }, 8: { cellWidth: 'auto', fontSize: 6 } },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      margin: { left: 12, right: 12, bottom: 20 },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          if (hookData.column.index === 5) {
            hookData.cell.styles.textColor = [217, 119, 6];
            hookData.cell.styles.fontStyle = 'bold';
          }
          if (hookData.column.index === 7) {
            hookData.cell.styles.textColor = _riscoColor(String(hookData.cell.raw));
            hookData.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section: Lotes Vencendo
  if (lotesVenc.length > 0) {
    if (y > doc.internal.pageSize.height - 40) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(217, 119, 6);
    doc.text(`Produtos com Lotes Vencendo <=90 dias (${lotesVenc.length})`, 12, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      head: [['Cód.', 'Produto', 'Estoque', 'Nº Lote', 'Vencimento', 'Dias', 'Urgência']],
      body: lotesVenc.map(p => {
        const vl = p.lotes.find((l: any) => l.diasVenc === p.menorDiasVenc);
        const urg = p.menorDiasVenc <= 30 ? 'Urgente' : p.menorDiasVenc <= 60 ? 'Atenção' : 'Monitorar';
        return [p.id, p.nome, p.estoque.toLocaleString('pt-BR'), vl?.lote || '—', vl?.validade || '—', `${p.menorDiasVenc}d`, urg];
      }),
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [217, 119, 6] as [number,number,number], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 18, halign: 'right' }, 3: { cellWidth: 24 }, 4: { cellWidth: 22 }, 5: { cellWidth: 16, halign: 'right' }, 6: { cellWidth: 22 } },
      alternateRowStyles: { fillColor: [255, 251, 235] },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const v = String(hookData.cell.raw);
          hookData.cell.styles.textColor = v === 'Urgente' ? [220, 38, 38] : v === 'Atenção' ? [234, 88, 12] : [217, 119, 6];
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });
  }

  drawPDFFooters(doc, color);
  doc.save('painel-caf-v2-alertas.pdf');
};

// ─── Indicadores Logísticos PDF ───────────────────────────────────────────────

interface IndicadoresLogisticosParams {
  kpis: {
    taxaAc: number; okAc: number; divergentes: number;
    totalBaixas: number; pctValidade: number; vlValidade: number;
    venc90: number; vencidos: number; vlVencendo: number;
    totalEstoqueVal: number; classeAVal: number; classeACount: number;
  };
  filesLoaded: {
    baixas: boolean; acuracidade: boolean;
    abcConsumo: boolean; abcEstoque: boolean; validade: boolean;
  };
  baixasData: { produto: string; motivo: string; total: number; data: string; estoque: string }[];
  abcEstoqueData: { cod: string; nome: string; classe: string; custoTotal: number; estoque: string }[];
  validadeData: { nome: string; lote: string; validade: string; diasVenc: number; vlTotal: number; quantidade: number }[];
}

export const exportIndicadoresLogisticosPDF = ({
  kpis, filesLoaded, baixasData, abcEstoqueData, validadeData,
}: IndicadoresLogisticosParams): void => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const color = PDF_COLORS.indigo;

  const fmtBRL = (n: number) => `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ── Header ──────────────────────────────────────────────────────────────
  let y = drawPDFHeader(
    doc,
    'Indicadores Logísticos — Farmácia Hospitalar',
    'Acuracidade · Baixas · Curva ABC · Controle de Validade',
    color,
  );

  // ── KPI Row ─────────────────────────────────────────────────────────────
  const kpiCards = [
    { label: 'Acuracidade', value: filesLoaded.acuracidade ? `${kpis.taxaAc.toFixed(1)}%` : 'N/D', color: kpis.taxaAc < 80 ? PDF_COLORS.red : PDF_COLORS.indigo },
    { label: 'Total Baixas', value: filesLoaded.baixas ? fmtBRL(kpis.totalBaixas) : 'N/D', color: PDF_COLORS.red },
    { label: 'Baixas Validade', value: filesLoaded.baixas ? `${kpis.pctValidade.toFixed(1)}%` : 'N/D', color: kpis.pctValidade > 30 ? PDF_COLORS.orange : PDF_COLORS.amber },
    { label: 'Vencendo 90d', value: filesLoaded.validade ? `${kpis.venc90} itens` : 'N/D', color: kpis.vencidos > 0 ? PDF_COLORS.red : PDF_COLORS.purple },
    { label: 'Estoque Total', value: filesLoaded.abcEstoque ? fmtBRL(kpis.totalEstoqueVal) : 'N/D', color: PDF_COLORS.teal },
    { label: 'Itens Classe A', value: filesLoaded.abcEstoque ? `${kpis.classeACount}` : 'N/D', color: PDF_COLORS.emerald },
  ];

  y = drawKPICards(doc, kpiCards, y);
  y += 6;

  // ── Section 1: Baixas por Produto (top 20) ───────────────────────────────
  if (filesLoaded.baixas && baixasData.length > 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text('BAIXAS DE ESTOQUE — TOP 20 POR VALOR', 12, y);
    y += 2;

    const top20 = [...baixasData].sort((a, b) => b.total - a.total).slice(0, 20);

    autoTable(doc, {
      startY: y,
      head: [['Produto', 'Motivo', 'Estoque', 'Data', 'Valor (R$)']],
      body: top20.map(b => [
        b.produto,
        b.motivo,
        b.estoque,
        b.data,
        b.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      ]),
      theme: 'grid',
      margin: { left: 12, right: 12, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' },
        1: { cellWidth: 60 },
        2: { cellWidth: 32, halign: 'center' },
        3: { cellWidth: 24, halign: 'center' },
        4: { cellWidth: 'auto', halign: 'right', fontStyle: 'bold' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Section 2: Itens Vencidos / Vencendo (top 20) ────────────────────────
  if (filesLoaded.validade && validadeData.length > 0) {
    if (y > doc.internal.pageSize.height - 50) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text('CONTROLE DE VALIDADE — ITENS CRÍTICOS (TOP 20)', 12, y);
    y += 2;

    const criticos = [...validadeData]
      .filter(i => i.diasVenc < 90)
      .sort((a, b) => a.diasVenc - b.diasVenc)
      .slice(0, 20);

    autoTable(doc, {
      startY: y,
      head: [['Produto', 'Lote', 'Validade', 'Dias p/ Vencer', 'Qtd', 'Valor (R$)', 'Status']],
      body: criticos.map(i => {
        const isVencido = i.diasVenc < 0;
        const isUrgente = i.diasVenc >= 0 && i.diasVenc <= 30;
        const status = isVencido ? 'VENCIDO' : isUrgente ? 'URGENTE' : 'ATENÇÃO';
        return [
          i.nome,
          i.lote,
          i.validade,
          isVencido ? `${Math.abs(i.diasVenc)}d atrás` : `${i.diasVenc}d`,
          i.quantidade.toLocaleString('pt-BR'),
          i.vlTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
          status,
        ];
      }),
      theme: 'grid',
      margin: { left: 12, right: 12, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: [220, 38, 38] as [number, number, number], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [255, 247, 247] },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' },
        1: { cellWidth: 28 },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 18, halign: 'right' },
        5: { cellWidth: 32, halign: 'right', fontStyle: 'bold' },
        6: { cellWidth: 'auto', halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 6) {
          const val = String(hookData.cell.raw);
          if (val === 'VENCIDO') hookData.cell.styles.textColor = [220, 38, 38];
          else if (val === 'URGENTE') hookData.cell.styles.textColor = [234, 88, 12];
          else hookData.cell.styles.textColor = [202, 138, 4];
          hookData.cell.styles.fontStyle = 'bold';
        }
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Section 3: Curva ABC — Classe A (top 20 por valor) ───────────────────
  if (filesLoaded.abcEstoque && abcEstoqueData.length > 0) {
    if (y > doc.internal.pageSize.height - 50) { doc.addPage(); y = 20; }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...PDF_COLORS.teal);
    doc.text('CURVA ABC — ITENS CLASSE A (TOP 20 POR VALOR)', 12, y);
    y += 2;

    const classeA = [...abcEstoqueData]
      .filter(i => i.classe === 'A')
      .sort((a, b) => b.custoTotal - a.custoTotal)
      .slice(0, 20);

    autoTable(doc, {
      startY: y,
      head: [['Cód.', 'Produto', 'Classe', 'Estoque', 'Valor Total (R$)']],
      body: classeA.map(i => [
        i.cod,
        i.nome,
        i.classe,
        i.estoque,
        i.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
      ]),
      theme: 'grid',
      margin: { left: 12, right: 12, bottom: 20 },
      styles: { fontSize: 7, cellPadding: 2.5, valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: PDF_COLORS.teal, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [240, 253, 250] },
      columnStyles: {
        0: { cellWidth: 20, halign: 'center' },
        1: { cellWidth: 'auto', fontStyle: 'bold' },
        2: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
        3: { cellWidth: 28, halign: 'center' },
        4: { cellWidth: 44, halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 2) {
          hookData.cell.styles.textColor = [220, 38, 38];
        }
      },
    });
  }

  drawPDFFooters(doc, color);
  doc.save(`indicadores-logisticos-${new Date().toISOString().split('T')[0]}.pdf`);
};
