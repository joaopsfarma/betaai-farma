import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProcessedProduct } from '../types';

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
