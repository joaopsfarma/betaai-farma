import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProcessedProduct } from '../types';
import { getRiscoAssistencial } from './riscoAssistencial';

export type PDFAccentColor = [number, number, number];

export const PDF_COLORS = {
  emerald: [16, 185, 129] as PDFAccentColor,
  blue: [124, 58, 237] as PDFAccentColor,
  purple: [139, 92, 246] as PDFAccentColor,
  indigo: [109, 40, 217] as PDFAccentColor,
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
  const doc = new jsPDF({ orientation });
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
  necessidadeCompra?: number;
  tendenciaConsumo?: 'ALTA' | 'MÉDIA' | 'BAIXA';
  ocInfo?: { oc: string; quantidadeComprada: number; fornecedor: string; dataPrevista: string; atraso: number }[];
  riscoAss: { label: string; level: string; bg: string; text: string; impacto: string; ordem: number };
}

export const exportRessuprimentoPDF = (
  data: RessuprimentoItem[],
  filters: { status: string; search: string },
) => {
  const date = new Date().toLocaleDateString('pt-BR');
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const criticos = data.filter(d => d.status === 'CRÍTICO').length;
  const alertas  = data.filter(d => d.status === 'ALERTA').length;
  const ok       = data.filter(d => d.status === 'OK').length;
  const necessidadeTotal = data.reduce((s, d) => s + (d.necessidadeCompra || 0), 0);

  const kpis = [
    { label: 'Total de Itens',    value: String(data.length),                   color: '#4f46e5' },
    { label: 'Críticos',          value: String(criticos),                       color: '#dc2626' },
    { label: 'Alertas',           value: String(alertas),                        color: '#d97706' },
    { label: 'OK',                value: String(ok),                             color: '#16a34a' },
    { label: 'Necessidade Total', value: `${Math.round(necessidadeTotal).toLocaleString('pt-BR')} un`, color: '#7c3aed' },
  ];

  const kpisHtml = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-value" style="color:${k.color}">${k.value}</div>
      <div class="kpi-label">${k.label}</div>
    </div>`).join('');

  const riscoColor = (label: string) => {
    if (label === 'Crítico') return '#dc2626';
    if (label === 'Alto')    return '#ea580c';
    if (label === 'Médio')   return '#d97706';
    return '#64748b';
  };

  const statusStyle = (s: string) => {
    if (s === 'CRÍTICO') return { color: '#be123c', bg: '#fff1f2', border: '#fda4af' };
    if (s === 'ALERTA')  return { color: '#b45309', bg: '#fffbeb', border: '#fcd34d' };
    return                      { color: '#15803d', bg: '#f0fdf4', border: '#86efac' };
  };

  const tendIcon = (t: string) => {
    if (t === 'ALTA')  return '<span style="color:#dc2626;font-weight:700">↑ ALTA</span>';
    if (t === 'MÉDIA') return '<span style="color:#d97706;font-weight:700">→ MÉDIA</span>';
    return                    '<span style="color:#64748b">↓ BAIXA</span>';
  };

  const rowsHtml = data.map((d, i) => {
    const ss = statusStyle(d.status);
    const bg = i % 2 === 1 ? '#f8fafc' : '#ffffff';
    const rowBg = d.status === 'CRÍTICO' ? '#fff1f2' : d.status === 'ALERTA' ? '#fffbeb' : bg;
    const risco = d.riscoAss?.label || 'N/A';

    let ocHtml = '<span class="empty">Sem OC (pendente criação)</span>';
    if (d.ocInfo && d.ocInfo.length > 0) {
      ocHtml = d.ocInfo.map(oc =>
        `<div class="oc-item"><strong>OC ${oc.oc}</strong>: ${oc.quantidadeComprada.toLocaleString('pt-BR')} un` +
        `<br><span class="oc-forn">${oc.fornecedor}</span>` +
        `<br><span class="oc-prev">Prev: ${oc.dataPrevista}${oc.atraso > 0 ? ` <span class="oc-atraso">(${oc.atraso}d atraso)</span>` : ''}</span></div>`
      ).join('');
    }

    const cobColor = d.coberturaDias <= 3 ? '#dc2626' : d.coberturaDias <= 7 ? '#d97706' : '#1e293b';

    return `
      <tr style="background:${rowBg}">
        <td class="td-id">${d.id}</td>
        <td class="td-prod">${d.produto}<span class="td-un"> · ${d.unidade}</span></td>
        <td class="td-risco" style="color:${riscoColor(risco)}">${risco}</td>
        <td class="td-num">${d.mediaConsumo.toFixed(2)}</td>
        <td class="td-num">${d.saldoAtual.toFixed(0)}</td>
        <td class="td-num" style="color:${cobColor};font-weight:700">${d.coberturaDias.toFixed(2)}</td>
        <td class="td-status">
          <span class="status-badge" style="color:${ss.color};background:${ss.bg};border:1px solid ${ss.border}">${d.status}</span>
        </td>
        <td class="td-center">${d.previsaoRuptura || '—'}</td>
        <td class="td-center">${tendIcon(d.tendenciaConsumo || 'BAIXA')}</td>
        <td class="td-oc">${ocHtml}</td>
      </tr>`;
  }).join('');

  const filterDesc = [
    filters.status && filters.status !== 'TODOS' ? `Status: ${filters.status}` : 'Todos os status',
    filters.search ? `Busca: "${filters.search}"` : null,
  ].filter(Boolean).join(' · ');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  @page { size: A4 landscape; margin: 10mm 12mm 14mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 9px; color: #1e293b; background: #fff; }

  .header {
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(135deg, #4c1d95 0%, #7c3aed 100%);
    color: white; padding: 10px 14px; border-radius: 5px; margin-bottom: 10px;
  }
  .header h1 { font-size: 16px; font-weight: 700; letter-spacing: 0.3px; }
  .header .sub { font-size: 8px; opacity: 0.8; margin-top: 3px; }
  .header-right { text-align: right; font-size: 8.5px; opacity: 0.9; line-height: 1.8; }
  .header-right strong { font-size: 11px; }

  .kpis { display: flex; gap: 8px; margin-bottom: 10px; }
  .kpi-card {
    flex: 1; background: white; border: 1px solid #e2e8f0;
    border-radius: 5px; padding: 8px 10px; text-align: center;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  }
  .kpi-value { font-size: 22px; font-weight: 800; line-height: 1; }
  .kpi-label { font-size: 8px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 3px; }

  table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid #d1d9e6; overflow: hidden; }
  thead tr { background: #4c1d95; color: white; }
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

  col.c-id   { width: 5%; }
  col.c-prod { width: 26%; }
  col.c-risk { width: 6%; }
  col.c-cons { width: 7%; }
  col.c-sal  { width: 6%; }
  col.c-cob  { width: 7%; }
  col.c-sta  { width: 8%; }
  col.c-prev { width: 10%; }
  col.c-tend { width: 8%; }
  col.c-oc   { width: 17%; }

  .td-id     { text-align: center; font-family: monospace; font-size: 7.5px; color: #64748b; vertical-align: middle; }
  .td-prod   { font-weight: 600; color: #1e293b; word-break: break-word; line-height: 1.35; vertical-align: middle; }
  .td-un     { font-weight: 400; font-size: 7.5px; color: #64748b; }
  .td-risco  { text-align: center; font-weight: 700; font-size: 8px; vertical-align: middle; }
  .td-num    { text-align: center; font-weight: 600; vertical-align: middle; }
  .td-status { text-align: center; vertical-align: middle; }
  .td-center { text-align: center; vertical-align: middle; font-size: 8px; }
  .td-oc     { font-size: 7.5px; line-height: 1.5; vertical-align: top; }

  .status-badge {
    display: inline-block; border-radius: 4px;
    padding: 2px 5px; font-size: 7.5px; font-weight: 700;
  }

  .oc-item   { margin-bottom: 4px; padding-bottom: 3px; border-bottom: 1px solid #f1f5f9; }
  .oc-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .oc-forn   { color: #64748b; }
  .oc-prev   { color: #475569; }
  .oc-atraso { color: #dc2626; font-weight: 700; }
  .empty     { color: #94a3b8; font-style: italic; }

  .footer { margin-top: 8px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; }

  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>RELATÓRIO DE RESSUPRIMENTO — INTELIGÊNCIA DE ESTOQUE</h1>
    <div class="sub">FarmaIA &nbsp;|&nbsp; Gerado em ${date}, ${time} &nbsp;|&nbsp; Filtro: ${filterDesc}</div>
  </div>
  <div class="header-right">
    <div>Emitido em: <strong>${date}, ${time}</strong></div>
    <div>FarmaIA &nbsp;|&nbsp; Logística Farmacêutica</div>
  </div>
</div>

<div class="kpis">${kpisHtml}</div>

<table>
  <colgroup>
    <col class="c-id"><col class="c-prod"><col class="c-risk"><col class="c-cons">
    <col class="c-sal"><col class="c-cob"><col class="c-sta"><col class="c-prev">
    <col class="c-tend"><col class="c-oc">
  </colgroup>
  <thead>
    <tr>
      <th>ID</th>
      <th class="th-left">Produto / Unid.</th>
      <th>Risco</th>
      <th>Consumo/dia</th>
      <th>Saldo</th>
      <th>Cobertura (d)</th>
      <th>Status</th>
      <th>Previsão de Ruptura</th>
      <th>Tendência</th>
      <th class="th-left">OCs Pendentes</th>
    </tr>
  </thead>
  <tbody>${rowsHtml}</tbody>
</table>

<div class="footer">
  <span>Total: ${data.length} itens${filters.search ? ` · Busca: "${filters.search}"` : ''}</span>
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

// ─── RESSUPRIMENTO — DASHBOARD PDF ──────────────────────────────────────────

export interface RessuprimentoDashboardParams {
  allStats: {
    criticos: number; alertas: number; ok: number;
    coberturaMedia: number; necessidadeTotal: number; criticosSemOC: number; total: number;
  };
  novosKPIs: {
    rupturaIminente: number; ocsComAtrasoCount: number;
    taxaAtendimentoOC: number; riscoCriticoBaixoEstoque: number;
  };
  top10: { name: string; cobertura: number; status: string }[];
  top12Necessidade: { name: string; saldo: number; necessidade: number }[];
  coberturaByCategoria: { name: string; cobertura: number; criticos: number; total: number }[];
  riscoVsStatus: { name: string; CRÍTICO: number; ALERTA: number; OK: number }[];
  ocAtrasoFaixas: { noPrazo: number; aceitavel: number; atencao: number; inaceitavel: number; total: number } | null;
  ocAtrasos: { name: string; atraso: number; fornecedor: string; status: string; oc: string }[];
  ocAtrasoAceitavel: number;
  ocAtrasoAtencao: number;
}

export const exportRessuprimentoDashboardPDF = (p: RessuprimentoDashboardParams) => {
  const PURPLE: [number, number, number] = [124, 58, 237];
  const EMERALD: [number, number, number] = [5, 150, 105];
  const RED: [number, number, number] = [220, 38, 38];
  const AMBER: [number, number, number] = [217, 119, 6];
  const ORANGE: [number, number, number] = [234, 88, 12];
  const SLATE: [number, number, number] = [71, 85, 105];

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.width;   // 297
  const H = doc.internal.pageSize.height;  // 210
  const now = new Date().toLocaleString('pt-BR');

  // ── helpers ────────────────────────────────────────────────────────────────
  const header = (title: string, sub: string) => {
    doc.setFillColor(...PURPLE);
    doc.rect(0, 0, W, 26, 'F');
    doc.setFillColor(160, 100, 255);
    doc.rect(0, 24, W, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text('FarmaIA  |  Inteligência de Ressuprimento', W - 10, 7, { align: 'right' });
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(title, 10, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(sub, 10, 20);
    doc.text(`Emitido em: ${now}`, W - 10, 20, { align: 'right' });
  };

  const footer = () => {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      doc.setDrawColor(...SLATE); doc.setLineWidth(0.3);
      doc.line(10, H - 12, W - 10, H - 12);
      doc.setFontSize(7); doc.setTextColor(...SLATE);
      doc.text('FarmaIA  —  Inteligência de Ressuprimento', 10, H - 7);
      doc.text(`Página ${i} de ${n}`, W - 10, H - 7, { align: 'right' });
    }
  };

  const kpiBox = (x: number, y: number, w: number, label: string, value: string,
                  color: [number, number, number], accent: [number, number, number]) => {
    doc.setFillColor(...color); doc.roundedRect(x, y, w, 18, 2, 2, 'F');
    doc.setFillColor(...accent); doc.rect(x, y, 2.5, 18, 'F');
    doc.setTextColor(71, 85, 105); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
    doc.text(label, x + 5, y + 6);
    doc.setTextColor(15, 23, 42); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text(value, x + 5, y + 14);
  };

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — KPIs + Faixas de Atraso
  // ══════════════════════════════════════════════════════════════════════════
  header('Dashboard de Ressuprimento', `Total de itens: ${p.allStats.total}`);

  // Section label
  let y = 32;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
  doc.text('STATUS DE ESTOQUE', 10, y); y += 4;

  // KPI row 1 — 6 cards
  const bw = (W - 20 - 10) / 6;
  const row1 = [
    { label: 'Críticos (0–3d)',    value: String(p.allStats.criticos),              accent: RED },
    { label: 'Alertas (3–7d)',     value: String(p.allStats.alertas),               accent: AMBER },
    { label: 'OK (>7d)',           value: String(p.allStats.ok),                    accent: EMERALD },
    { label: 'Necessidade Total',  value: `${Math.round(p.allStats.necessidadeTotal).toLocaleString('pt-BR')} un`, accent: [139, 92, 246] as [number,number,number] },
    { label: 'Cobertura Média',    value: `${p.allStats.coberturaMedia.toFixed(1)}d`, accent: EMERALD },
    { label: 'Críticos sem OC',    value: String(p.allStats.criticosSemOC),         accent: [225, 29, 72] as [number,number,number] },
  ];
  row1.forEach((k, i) => kpiBox(10 + i * (bw + 2), y, bw, k.label, k.value, [248, 250, 252], k.accent));
  y += 22;

  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
  doc.text('INDICADORES OPERACIONAIS', 10, y); y += 4;

  // KPI row 2 — 4 cards
  const bw2 = (W - 20 - 6) / 4;
  const row2 = [
    { label: 'Ruptura Iminente',      value: String(p.novosKPIs.rupturaIminente),          accent: [185, 28, 28]  as [number,number,number] },
    { label: 'OCs com Atraso',        value: String(p.novosKPIs.ocsComAtrasoCount),         accent: ORANGE },
    { label: 'Taxa Atendimento OC',   value: `${p.novosKPIs.taxaAtendimentoOC}%`,           accent: p.novosKPIs.taxaAtendimentoOC >= 70 ? EMERALD : p.novosKPIs.taxaAtendimentoOC >= 40 ? AMBER : RED },
    { label: 'Risco Clínico Crítico', value: String(p.novosKPIs.riscoCriticoBaixoEstoque),  accent: [159, 18, 57]  as [number,number,number] },
  ];
  row2.forEach((k, i) => kpiBox(10 + i * (bw2 + 2), y, bw2, k.label, k.value, [248, 250, 252], k.accent));
  y += 24;

  // Faixas de atraso de OC
  if (p.ocAtrasoFaixas) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
    doc.text('FAIXAS DE ATRASO DE ORDENS DE COMPRA', 10, y); y += 4;

    const faixas = [
      { label: 'No prazo',    value: p.ocAtrasoFaixas.noPrazo,     color: EMERALD, bg: [240, 253, 244] as [number,number,number] },
      { label: 'Aceitável',   value: p.ocAtrasoFaixas.aceitavel,   color: [161, 98, 7] as [number,number,number], bg: [255, 251, 235] as [number,number,number] },
      { label: 'Atenção',     value: p.ocAtrasoFaixas.atencao,     color: ORANGE,  bg: [255, 247, 237] as [number,number,number] },
      { label: 'Inaceitável', value: p.ocAtrasoFaixas.inaceitavel, color: RED,     bg: [254, 242, 242] as [number,number,number] },
    ];
    const fw = (W - 20 - 6) / 4;
    faixas.forEach((f, i) => {
      const fx = 10 + i * (fw + 2);
      doc.setFillColor(...f.bg); doc.roundedRect(fx, y, fw, 16, 2, 2, 'F');
      doc.setFillColor(...f.color); doc.rect(fx, y, 2.5, 16, 'F');
      const pct = p.ocAtrasoFaixas!.total > 0 ? (f.value / p.ocAtrasoFaixas!.total * 100).toFixed(0) : '0';
      doc.setTextColor(71, 85, 105); doc.setFontSize(7); doc.setFont('helvetica', 'normal');
      doc.text(f.label, fx + 5, y + 5.5);
      doc.setTextColor(...f.color); doc.setFontSize(13); doc.setFont('helvetica', 'bold');
      doc.text(String(f.value), fx + 5, y + 12.5);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
      doc.text(`${pct}%`, fx + fw - 6, y + 12.5, { align: 'right' });
    });
    y += 20;

    // Legenda das faixas
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 116, 139);
    doc.text(`Faixas: No prazo ≤ 0d  ·  Aceitável 1–${p.ocAtrasoAceitavel}d  ·  Atenção ${p.ocAtrasoAceitavel + 1}–${p.ocAtrasoAtencao}d  ·  Inaceitável > ${p.ocAtrasoAtencao}d  ·  Total: ${p.ocAtrasoFaixas.total} OCs`, 10, y);
    y += 6;
  }

  // Cobertura por categoria (tabela compacta)
  if (p.coberturaByCategoria.length > 0) {
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
    doc.text('COBERTURA MÉDIA POR CATEGORIA', 10, y); y += 3;

    autoTable(doc, {
      startY: y,
      head: [['Categoria', 'Cobertura Média (d)', 'Críticos', 'Total Itens', 'Situação']],
      body: p.coberturaByCategoria.map(c => [
        c.name,
        c.cobertura.toFixed(1),
        c.criticos,
        c.total,
        c.cobertura < 3 ? 'CRÍTICO' : c.cobertura < 7 ? 'ATENÇÃO' : 'OK',
      ]),
      headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 38, halign: 'right' },
        2: { cellWidth: 22, halign: 'center' },
        3: { cellWidth: 22, halign: 'center' },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell(h) {
        if (h.section === 'body' && h.column.index === 4) {
          const v = h.cell.raw as string;
          if (v === 'CRÍTICO') h.cell.styles.textColor = RED;
          else if (v === 'ATENÇÃO') h.cell.styles.textColor = AMBER;
          else h.cell.styles.textColor = EMERALD;
        }
      },
      margin: { left: 10, right: 10 },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 2 — Top 10 Cobertura + Risco × Status + OC Atrasos
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage();
  header('Dashboard de Ressuprimento — Análise Detalhada', `Continuação — ${now}`);
  y = 32;

  // Top 10 menor cobertura
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
  doc.text('TOP 10 — MENOR COBERTURA DE ESTOQUE', 10, y); y += 3;

  autoTable(doc, {
    startY: y,
    head: [['#', 'Produto', 'Cobertura (d)', 'Status']],
    body: p.top10.map((item, i) => [i + 1, item.name, item.cobertura.toFixed(1), item.status]),
    headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 1.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 120 },
      2: { cellWidth: 30, halign: 'right' },
      3: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell(h) {
      if (h.section === 'body' && h.column.index === 3) {
        const v = h.cell.raw as string;
        if (v === 'CRÍTICO') h.cell.styles.textColor = RED;
        else if (v === 'ALERTA') h.cell.styles.textColor = AMBER;
        else h.cell.styles.textColor = EMERALD;
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Risco Clínico × Status
  const afterTop10 = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
  doc.text('RISCO CLÍNICO × STATUS DE ESTOQUE', 10, afterTop10);

  autoTable(doc, {
    startY: afterTop10 + 3,
    head: [['Nível de Risco Clínico', 'CRÍTICO', 'ALERTA', 'OK', 'Total']],
    body: p.riscoVsStatus.map(r => [r.name, r['CRÍTICO'], r['ALERTA'], r['OK'], r['CRÍTICO'] + r['ALERTA'] + r['OK']]),
    headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: 'bold', fontSize: 7 },
    bodyStyles: { fontSize: 7, cellPadding: 1.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 55 },
      1: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      2: { cellWidth: 22, halign: 'center', fontStyle: 'bold' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 22, halign: 'center' },
    },
    didParseCell(h) {
      if (h.section === 'body') {
        if (h.column.index === 1) h.cell.styles.textColor = RED;
        if (h.column.index === 2) h.cell.styles.textColor = AMBER;
        if (h.column.index === 3) h.cell.styles.textColor = EMERALD;
      }
    },
    margin: { left: 10, right: 10 },
  });

  // OC Atrasos por item
  if (p.ocAtrasos.length > 0) {
    const afterRisco = (doc as any).lastAutoTable.finalY + 6;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...SLATE);
    doc.text('OCs EM ATRASO — TOP 10 ITENS', 10, afterRisco);

    autoTable(doc, {
      startY: afterRisco + 3,
      head: [['Produto', 'OC', 'Fornecedor', 'Atraso (d)', 'Classificação', 'Status Estoque']],
      body: p.ocAtrasos.map(o => {
        const cls = o.atraso <= p.ocAtrasoAceitavel ? 'Aceitável' : o.atraso <= p.ocAtrasoAtencao ? 'Atenção' : 'Inaceitável';
        return [o.name, o.oc, o.fornecedor, o.atraso, cls, o.status];
      }),
      headStyles: { fillColor: PURPLE, textColor: 255, fontStyle: 'bold', fontSize: 7 },
      bodyStyles: { fontSize: 7, cellPadding: 1.5 },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 25 },
        2: { cellWidth: 60 },
        3: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
        5: { cellWidth: 25, halign: 'center' },
      },
      didParseCell(h) {
        if (h.section === 'body') {
          if (h.column.index === 4) {
            const v = h.cell.raw as string;
            if (v === 'Inaceitável') h.cell.styles.textColor = RED;
            else if (v === 'Atenção') h.cell.styles.textColor = ORANGE;
            else h.cell.styles.textColor = [161, 98, 7];
          }
          if (h.column.index === 5) {
            const v = h.cell.raw as string;
            if (v === 'CRÍTICO') h.cell.styles.textColor = RED;
            else if (v === 'ALERTA') h.cell.styles.textColor = AMBER;
            else h.cell.styles.textColor = EMERALD;
          }
        }
      },
      margin: { left: 10, right: 10 },
    });
  }

  footer();
  doc.save(`dashboard-ressuprimento-${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`);
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
  const color = PDF_COLORS.purple;
  const pageWidth = doc.internal.pageSize.width;

  let y = drawPDFHeader(doc, 'PAINEL CAF V2 — ALERTAS', `FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}`, color);

  // KPI cards
  const kpiCards = [
    { label: 'Total no Painel', value: kpis.totalPainel.toString(), color: [124, 58, 237] as [number, number, number] },
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

// ─── Consumo Tab PDF ─────────────────────────────────────────────────────────

export const exportConsumoTabPDF = ({ items, filterLabel, dayLabels }: {
  items: any[];
  filterLabel: string;
  dayLabels: string[];
}): void => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const color = PDF_COLORS.indigo;

  const filterName =
    filterLabel === 'ALL'         ? 'Todos' :
    filterLabel === 'SEM_ESTOQUE' ? 'Sem Estoque' :
    filterLabel === 'CRÍTICO'     ? 'Críticos' :
    filterLabel === 'ATENÇÃO'     ? 'Atenção' : 'Adequado';

  const statusLabel = (s: string) =>
    s === 'CRÍTICO'     ? 'Crítico ≤3d' :
    s === 'ATENÇÃO'     ? 'Atenção ≤7d' :
    s === 'SEM_ESTOQUE' ? 'Sem Estoque' : 'Adequado';

  const statusColor = (s: string): [number, number, number] =>
    s === 'Crítico ≤3d' ? [220, 38, 38] :
    s === 'Atenção ≤7d' ? [217, 119, 6] :
    s === 'Sem Estoque' ? [71, 85, 105] : [5, 150, 105];

  // Número dinâmico de colunas de dias
  const nDays = dayLabels.length;
  const dayColWidth = 9;

  // Índices das colunas finais (após as colunas de dias)
  const totalColIdx  = 3 + nDays;
  const mediaColIdx  = totalColIdx + 1;
  const saldoColIdx  = totalColIdx + 2;
  const projColIdx   = totalColIdx + 3;
  const statusColIdx = totalColIdx + 4;

  let y = drawPDFHeader(
    doc,
    `Consumo — ${filterName} (${items.length} itens)`,
    `FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}`,
    color,
  );

  const dayColStyles: Record<number, any> = {};
  for (let d = 0; d < nDays; d++) {
    dayColStyles[3 + d] = { cellWidth: dayColWidth, halign: 'right' };
  }

  autoTable(doc, {
    startY: y,
    head: [['ID MV', 'Produto', 'Und', ...dayLabels, 'Total', 'Méd/Dia', 'Saldo', 'Proj.(d)', 'Status']],
    body: items.map(c => [
      c.id,
      c.nome,
      c.unidade,
      ...(c.dias as number[]).map(v => v),
      c.total,
      c.media.toFixed(1),
      c.saldo,
      c.proj > 0 ? c.proj.toFixed(1) : c.saldo === 0 ? '—' : '∞',
      statusLabel(c.status),
    ]),
    styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 14, fontStyle: 'bold' },
      1: { cellWidth: 55 },
      2: { cellWidth: 10 },
      ...dayColStyles,
      [totalColIdx]:  { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      [mediaColIdx]:  { cellWidth: 14, halign: 'right' },
      [saldoColIdx]:  { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      [projColIdx]:   { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      [statusColIdx]: { cellWidth: 'auto' },
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 12, right: 12, bottom: 20 },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === statusColIdx) {
        hookData.cell.styles.textColor = statusColor(String(hookData.cell.raw));
        hookData.cell.styles.fontStyle = 'bold';
      }
      if (hookData.section === 'body' && hookData.column.index === saldoColIdx) {
        const v = Number(hookData.cell.raw);
        if (v === 0) hookData.cell.styles.textColor = [220, 38, 38];
        else if (v < 10) hookData.cell.styles.textColor = [217, 119, 6];
      }
    },
  });

  drawPDFFooters(doc, color);
  doc.save(`consumo-${filterName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

// ─── Ordens de Compra Tab PDF ─────────────────────────────────────────────────

export const exportOCTabPDF = ({ items, filterLabel }: {
  items: any[];
  filterLabel: string;
}): void => {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const color = PDF_COLORS.blue;

  const filterName =
    filterLabel === 'ALL'          ? 'Todas' :
    filterLabel === 'NAO_ATENDIDA' ? 'Pendentes' :
    filterLabel === 'PARCIAL'      ? 'Parciais' : 'Recebidas';

  const statusLabel = (s: string) =>
    s === 'NAO_ATENDIDA' ? 'Pendente' :
    s === 'PARCIAL'      ? 'Parcial'  : 'Recebido';

  let y = drawPDFHeader(
    doc,
    `Ordens de Compra — ${filterName} (${items.length} itens)`,
    `FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}`,
    color,
  );

  autoTable(doc, {
    startY: y,
    head: [['Data Prev.', 'Nº OC', 'Fornecedor', 'Cód.', 'Produto', 'Saldo', 'Qt. Comp.', 'Qt. Rec.', 'Diferença', 'Status']],
    body: items.map(o => [
      o.dataPrevista,
      o.oc || '—',
      o.nomeFornecedor || '—',
      o.codProduto,
      o.nomeProduto,
      o.saldoAtual,
      o.qtComprada,
      o.qtRecebida,
      o.qtDiferenca,
      statusLabel(o.ocStatus),
    ]),
    styles: { fontSize: 6.5, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 6.5 },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 18, fontStyle: 'bold' },
      2: { cellWidth: 38 },
      3: { cellWidth: 16 },
      4: { cellWidth: 60 },
      5: { cellWidth: 14, halign: 'right', fontStyle: 'bold' },
      6: { cellWidth: 16, halign: 'right' },
      7: { cellWidth: 16, halign: 'right', fontStyle: 'bold' },
      8: { cellWidth: 16, halign: 'right' },
      9: { cellWidth: 'auto' },
    },
    alternateRowStyles: { fillColor: [239, 246, 255] },
    margin: { left: 12, right: 12, bottom: 20 },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 9) {
        const v = String(hookData.cell.raw);
        hookData.cell.styles.textColor =
          v === 'Recebido' ? [5, 150, 105] :
          v === 'Parcial'  ? [217, 119, 6] : [37, 99, 235];
        hookData.cell.styles.fontStyle = 'bold';
      }
      if (hookData.section === 'body' && hookData.column.index === 5) {
        if (Number(hookData.cell.raw) === 0) hookData.cell.styles.textColor = [220, 38, 38];
      }
    },
  });

  drawPDFFooters(doc, color);
  doc.save(`ordens-compra-${filterName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`);
};

// ─── Nutrição Export ──────────────────────────────────────────────────────────

interface NutricaoPDFLote {
  lote: string;
  validade: string;
  diasParaVencer: number;
  quantidade: number;
}

interface NutricaoPDFRow {
  produtoId: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
  menorDias: number;
  menorValidade: string;
  status: 'URGENTE' | 'ATENCAO' | 'OK';
  lotes: NutricaoPDFLote[];
}

interface NutricaoKPIs {
  total: number;
  urgente: number;
  atencao: number;
  estoqueTotal: number;
}

export const exportNutricaoPDF = (
  produtos: NutricaoPDFRow[],
  kpis: NutricaoKPIs
): void => {
  const doc = new jsPDF({ orientation: 'landscape' });
  const color = PDF_COLORS.teal;

  let currentY = drawPDFHeader(
    doc,
    'Painel da Nutricao',
    'Controle de Validade e Estoque — Dietas Enterais',
    color
  );

  currentY = drawKPICards(doc, [
    { label: 'Total de Produtos', value: kpis.total.toString(), color: PDF_COLORS.teal },
    { label: 'Vencendo <=30 dias', value: kpis.urgente.toString(), color: PDF_COLORS.red },
    { label: 'Vencendo <=60 dias', value: kpis.atencao.toString(), color: PDF_COLORS.amber },
    { label: 'Estoque Total', value: kpis.estoqueTotal.toLocaleString('pt-BR'), color: PDF_COLORS.slate },
  ], currentY);

  // Sanitize non-ASCII chars that helvetica can't render
  const ascii = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();

  // Split into two groups
  const urgentes = [...produtos]
    .filter(p => p.menorDias <= 60)
    .sort((a, b) => a.menorDias - b.menorDias);

  const demais = [...produtos]
    .filter(p => p.menorDias > 60)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const STATUS_COLORS_NUT: Record<string, [number, number, number]> = {
    URGENTE: [220, 38, 38],
    'ATEN\u00C7\u00C3O': [202, 138, 4],
    OK: [22, 163, 74],
  };

  const buildRows = (rows: NutricaoPDFRow[]) =>
    rows.map(p => [
      ascii(p.nome),
      p.produtoId,
      p.unidade,
      p.estoqueAtual.toLocaleString('pt-BR'),
      p.menorValidade || '\u2014',
      p.menorDias <= 0 ? 'Vencido' : `${p.menorDias}d`,
      p.status === 'ATENCAO' ? 'ATEN\u00C7\u00C3O' : p.status,
      p.lotes.map(l => `${l.lote} (${l.validade} · ${l.quantidade.toLocaleString('pt-BR')}un)`).join('\n'),
    ]);

  const TABLE_HEAD = [['Produto', 'Cod.', 'Un.', 'Estoque', 'Validade', 'Dias', 'Status', 'Lotes']];

  const sharedTableOptions = {
    theme: 'grid' as const,
    margin: { left: 12, right: 12, bottom: 20 },
    styles: {
      fontSize: 7,
      cellPadding: 2.5,
      valign: 'middle' as const,
      overflow: 'linebreak' as const,
    },
    headStyles: {
      fillColor: color,
      textColor: [255, 255, 255] as [number, number, number],
      fontStyle: 'bold' as const,
      halign: 'center' as const,
    },
    columnStyles: {
      0: { cellWidth: 75, fontStyle: 'bold' as const, textColor: [30, 41, 59] as [number, number, number] },
      1: { cellWidth: 14, halign: 'center' as const },
      2: { cellWidth: 16, halign: 'center' as const },
      3: { cellWidth: 16, halign: 'right' as const },
      4: { cellWidth: 20, halign: 'center' as const },
      5: { cellWidth: 12, halign: 'center' as const, fontStyle: 'bold' as const },
      6: { cellWidth: 16, halign: 'center' as const, fontStyle: 'bold' as const },
      7: { cellWidth: 'auto' as const },
    },
    didParseCell(data: any) {
      if (data.section === 'body' && data.column.index === 6) {
        const c = STATUS_COLORS_NUT[data.cell.raw as string];
        if (c) data.cell.styles.textColor = c;
      }
      if (data.section === 'body' && data.column.index === 5) {
        const raw = data.cell.raw as string;
        if (raw === 'Vencido' || raw.includes('d')) {
          const dias = parseInt(raw, 10);
          if (raw === 'Vencido' || dias <= 30) data.cell.styles.textColor = [220, 38, 38];
          else if (dias <= 60) data.cell.styles.textColor = [202, 138, 4];
          else data.cell.styles.textColor = [22, 163, 74];
        }
      }
    },
  };

  // ── Seção 1: Vencimentos Próximos (página 1) ─────────────────────────────
  if (urgentes.length > 0) {
    currentY += 3;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(220, 38, 38);
    doc.text(`Vencimentos Proximos — URGENTE / ATENCAO (${urgentes.length} produto${urgentes.length !== 1 ? 's' : ''})`, 12, currentY);

    autoTable(doc, {
      startY: currentY + 5,
      head: TABLE_HEAD,
      body: buildRows(urgentes),
      ...sharedTableOptions,
      alternateRowStyles: { fillColor: [255, 247, 247] },
    });
  }

  // ── Seção 2: Demais Dietas ────────────────────────────────────────────────
  if (demais.length > 0) {
    if (urgentes.length > 0) {
      doc.addPage();
      currentY = 20;
    } else {
      currentY += 3;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(color[0], color[1], color[2]);
    doc.text(`Demais Dietas — OK (${demais.length} produto${demais.length !== 1 ? 's' : ''})`, 12, currentY);

    autoTable(doc, {
      startY: currentY + 5,
      head: TABLE_HEAD,
      body: buildRows(demais),
      ...sharedTableOptions,
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
  }

  drawPDFFooters(doc, color);
  doc.save('painel-nutricao.pdf');
};
