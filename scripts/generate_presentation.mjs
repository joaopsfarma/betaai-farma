// scripts/generate_presentation.mjs
// FarmaIA — Logística Farma | Gerador de Apresentação PPTX
// Run: node scripts/generate_presentation.mjs

import PptxGenJS from 'pptxgenjs';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, '../apresentacao/screenshots');
const OUTPUT_FILE = path.join(__dirname, '../apresentacao/FarmaIA_Apresentacao.pptx');

// ── COLORS ─────────────────────────────────────────────────────
const C = {
  darkBg:     '0F172A',
  darkAccent: '1E293B',
  violet:     '7C3AED',
  emerald:    '059669',
  amber:      'D97706',
  red:        'EF4444',
  lightBg:    'F8FAFC',
  cardBg:     'FFFFFF',
  white:      'FFFFFF',
  textDark:   '0F172A',
  textMed:    '475569',
  textLight:  'CBD5E1',
  textMuted:  '94A3B8',
  border:     'E2E8F0',
  slate700:   '334155',
};

// ── FONTS ───────────────────────────────────────────────────────
const F = { title: 'Calibri', body: 'Calibri', mono: 'Courier New' };

// ── DIMENSIONS ─────────────────────────────────────────────────
const W = 10;
const H = 5.625;
const M = 0.3; // margin

// ── HELPER: Load screenshot as base64 ──────────────────────────
function ss(label) {
  const p = path.join(SCREENSHOTS_DIR, `${label}.png`);
  if (!existsSync(p)) { console.warn(`  ⚠ Screenshot não encontrado: ${label}.png`); return null; }
  return `data:image/png;base64,${readFileSync(p).toString('base64')}`;
}

// ── HELPER: Header bar (used in content slides) ────────────────
function addHeaderBar(slide, pptx, tabLabel, slideTitle) {
  // Dark header bar
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: W, h: 0.65,
    fill: { color: C.darkBg }, line: { type: 'none' },
  });
  // Left emerald accent
  slide.addShape(pptx.ShapeType.rect, {
    x: 0, y: 0, w: 0.07, h: 0.65,
    fill: { color: C.emerald }, line: { type: 'none' },
  });
  // Tab ID pill
  slide.addText(tabLabel, {
    x: 0.18, y: 0.14, w: 1.7, h: 0.36,
    fontSize: 7.5, bold: true, color: C.white, fontFace: F.mono,
    fill: { color: C.violet }, align: 'center', valign: 'middle',
    margin: 0,
  });
  // Slide title in header
  slide.addText(slideTitle, {
    x: 2.05, y: 0.14, w: 7.7, h: 0.38,
    fontSize: 15, bold: true, color: C.white, fontFace: F.title,
  });
}

// ── LAYOUT A: Title Slide ──────────────────────────────────────
function addTitleSlide(pptx, { screenshotLabel }) {
  const slide = pptx.addSlide();
  const img = ss(screenshotLabel);

  // Background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.darkBg}, line:{type:'none'} });

  // Decorative circles
  slide.addShape(pptx.ShapeType.ellipse, { x:6.8, y:-0.9, w:4.2, h:4.2, fill:{color:C.violet, transparency:87}, line:{type:'none'} });
  slide.addShape(pptx.ShapeType.ellipse, { x:7.5, y:2.0,  w:3.8, h:3.8, fill:{color:C.emerald, transparency:90}, line:{type:'none'} });

  // Left vertical accent bar
  slide.addShape(pptx.ShapeType.rect, { x:M, y:1.0, w:0.07, h:4.0, fill:{color:C.violet}, line:{type:'none'} });

  // App name + badge
  slide.addText('FarmaIA', {
    x: 0.5, y: 0.28, w: 2.0, h: 0.42,
    fontSize: 13, bold: true, color: C.emerald, fontFace: F.title,
  });
  slide.addText('BETA 0.1V', {
    x: 2.6, y: 0.3, w: 1.05, h: 0.35,
    fontSize: 8, bold: true, color: C.violet, fontFace: F.body,
    fill: { color: C.darkAccent }, align: 'center', valign: 'middle',
    line: { color: C.violet, width: 0.5 }, margin: 0,
  });

  // Main title
  slide.addText('Logística Farma', {
    x: 0.5, y: 1.15, w: 7.0, h: 1.3,
    fontSize: 48, bold: true, color: C.white, fontFace: F.title,
  });

  // Subtitle
  slide.addText('Farmácia Hospitalar Inteligente', {
    x: 0.5, y: 2.6, w: 6.8, h: 0.58,
    fontSize: 20, color: C.textLight, fontFace: F.title,
  });

  // Description
  slide.addText(
    'Plataforma completa de controle de estoque, dispensação e\nrastreabilidade de medicamentos com IA integrada.',
    { x:0.5, y:3.3, w:6.0, h:0.85, fontSize:11, color:'94A3B8', fontFace:F.body, lineSpacingMultiple:1.35 }
  );

  // Stat pills (3)
  const pills = ['33 Painéis Analíticos', 'Gemini AI Integrado', 'React + TypeScript'];
  pills.forEach((text, i) => {
    slide.addText(text, {
      x: 0.5 + i * 2.0, y: 4.55, w: 1.85, h: 0.38,
      fontSize: 9, color: C.textLight, fontFace: F.body,
      fill: { color: C.darkAccent }, align: 'center', valign: 'middle',
      line: { color: C.violet, width: 0.5 }, margin: 0,
    });
  });

  // Date
  slide.addText('Março 2026', {
    x: 8.6, y: 5.35, w: 1.2, h: 0.22,
    fontSize: 8, color: C.textMuted, fontFace: F.body, align: 'right',
  });

  // Landing screenshot (right side, smaller)
  if (img) {
    slide.addImage({ data: img, x: 6.6, y: 1.1, w: 3.15, h: 2.1 });
  }

  console.log('  ✓ Slide 1: Title');
}

// ── LAYOUT B: Section Divider ──────────────────────────────────
function addSectionDivider(pptx, { num, title, description }) {
  const slide = pptx.addSlide();

  // Dark background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.darkBg}, line:{type:'none'} });

  // Left emerald stripe
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.15, h:H, fill:{color:C.emerald}, line:{type:'none'} });

  // Ghost section number (background)
  slide.addText(String(num).padStart(2,'0'), {
    x: 7.2, y: 0.1, w: 2.7, h: 3.0,
    fontSize: 150, bold: true, color: C.violet, transparency: 88, fontFace: F.title, align: 'right',
  });

  // Section label
  slide.addText(`SEÇÃO ${String(num).padStart(2,'0')}`, {
    x: 0.55, y: 1.65, w: 5.0, h: 0.4,
    fontSize: 10, bold: true, color: C.emerald, fontFace: F.body, charSpacing: 3,
  });

  // Title
  slide.addText(title, {
    x: 0.55, y: 2.1, w: 8.8, h: 1.15,
    fontSize: 36, bold: true, color: C.white, fontFace: F.title,
  });

  // Horizontal rule
  slide.addShape(pptx.ShapeType.line, {
    x: 0.55, y: 3.42, w: 4.5, h: 0,
    line: { color: C.violet, width: 1.0, transparency: 50 },
  });

  // Description
  slide.addText(description, {
    x: 0.55, y: 3.58, w: 8.0, h: 0.72,
    fontSize: 13, color: C.textLight, fontFace: F.body, lineSpacingMultiple: 1.4, transparency: 20,
  });

  console.log(`  ✓ Seção ${num}: ${title}`);
}

// ── LAYOUT C: Screenshot + Bullets ────────────────────────────
function addScreenshotBulletsSlide(pptx, { tabId, title, screenshotLabel, bullets, badges }) {
  const slide = pptx.addSlide();
  const img = ss(screenshotLabel);

  // Light background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.lightBg}, line:{type:'none'} });

  // Header bar
  addHeaderBar(slide, pptx, tabId, title);

  // Screenshot shadow
  slide.addShape(pptx.ShapeType.rect, {
    x: 0.32, y: 0.87, w: 5.6, h: 4.0,
    fill: { color: '94A3B8', transparency: 75 }, line: { type: 'none' },
  });
  // Screenshot
  if (img) {
    slide.addImage({ data: img, x: 0.3, y: 0.85, w: 5.6, h: 4.0, sizing: { type: 'contain', w: 5.6, h: 4.0 } });
  } else {
    slide.addShape(pptx.ShapeType.rect, { x:0.3, y:0.85, w:5.6, h:4.0, fill:{color:C.border}, line:{color:C.border, width:1} });
    slide.addText('[Screenshot]', { x:0.3, y:0.85, w:5.6, h:4.0, fontSize:14, color:C.textMuted, align:'center', valign:'middle' });
  }

  // Right column title
  slide.addText(title, {
    x: 6.2, y: 0.85, w: 3.55, h: 0.58,
    fontSize: 13, bold: true, color: C.textDark, fontFace: F.title,
  });

  // Divider under title
  slide.addShape(pptx.ShapeType.line, {
    x: 6.2, y: 1.49, w: 3.2, h: 0,
    line: { color: C.violet, width: 1.5 },
  });

  // Bullets
  bullets.forEach((text, i) => {
    const y = 1.62 + i * 0.57;
    // Violet dot
    slide.addShape(pptx.ShapeType.ellipse, {
      x: 6.2, y: y + 0.1, w: 0.1, h: 0.1,
      fill: { color: C.violet }, line: { type: 'none' },
    });
    slide.addText(text, {
      x: 6.38, y: y, w: 3.35, h: 0.52,
      fontSize: 9.5, color: C.textDark, fontFace: F.body, lineSpacingMultiple: 1.25,
    });
  });

  // KPI badges
  if (badges && badges.length > 0) {
    badges.forEach((badge, i) => {
      slide.addText(badge, {
        x: 6.2 + i * 1.22, y: 5.15, w: 1.15, h: 0.34,
        fontSize: 8, bold: true, color: C.white, fontFace: F.body,
        fill: { color: i % 2 === 0 ? C.violet : C.emerald },
        align: 'center', valign: 'middle', margin: 0,
      });
    });
  }

  // Tab ID watermark
  slide.addText(tabId, {
    x: 8.5, y: 5.38, w: 1.3, h: 0.2,
    fontSize: 7, color: C.textMuted, fontFace: F.mono, italic: true, align: 'right',
  });

  console.log(`  ✓ Slide C: ${title}`);
}

// ── LAYOUT D: Full Screenshot ──────────────────────────────────
function addFullScreenshotSlide(pptx, { title, screenshotLabel, caption }) {
  const slide = pptx.addSlide();
  const img = ss(screenshotLabel);

  // Light background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.lightBg}, line:{type:'none'} });

  // Header bar
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:0.65, fill:{color:C.darkBg}, line:{type:'none'} });
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:0.07, h:0.65, fill:{color:C.violet}, line:{type:'none'} });
  slide.addText(title, {
    x: 0.25, y: 0.14, w: 9.5, h: 0.38,
    fontSize: 15, bold: true, color: C.white, fontFace: F.title,
  });

  // Screenshot
  if (img) {
    slide.addImage({ data: img, x: 0.25, y: 0.75, w: 9.5, h: 4.55, sizing: { type: 'contain', w: 9.5, h: 4.55 } });
  }

  // Caption bar
  slide.addShape(pptx.ShapeType.rect, { x:0, y:5.3, w:W, h:0.325, fill:{color:'F1F5F9'}, line:{type:'none'} });
  slide.addText(caption || '', {
    x: M, y: 5.32, w: 9.4, h: 0.27,
    fontSize: 8.5, color: C.textMed, fontFace: F.body, italic: true, align: 'center',
  });

  console.log(`  ✓ Slide D: ${title}`);
}

// ── LAYOUT E: Stats Grid + Screenshot ─────────────────────────
function addStatsGridSlide(pptx, { tabId, title, screenshotLabel, kpis, note }) {
  const slide = pptx.addSlide();
  const img = ss(screenshotLabel);

  // Light background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.lightBg}, line:{type:'none'} });

  // Header bar
  addHeaderBar(slide, pptx, tabId, title);

  // KPI cards 2×2
  const positions = [
    { x: 0.3,  y: 0.85 }, { x: 2.35, y: 0.85 },
    { x: 0.3,  y: 2.75 }, { x: 2.35, y: 2.75 },
  ];
  kpis.forEach((kpi, i) => {
    const p = positions[i];
    // Card background
    slide.addShape(pptx.ShapeType.rect, {
      x: p.x, y: p.y, w: 1.95, h: 1.8,
      fill: { color: C.cardBg }, line: { color: C.border, width: 0.75 },
    });
    // Accent top bar
    slide.addShape(pptx.ShapeType.rect, {
      x: p.x, y: p.y, w: 1.95, h: 0.09,
      fill: { color: kpi.color || C.violet }, line: { type: 'none' },
    });
    // Label
    slide.addText(kpi.label, {
      x: p.x + 0.1, y: p.y + 0.18, w: 1.75, h: 0.38,
      fontSize: 8.5, color: C.textMed, fontFace: F.body,
    });
    // Value
    slide.addText(kpi.value, {
      x: p.x + 0.1, y: p.y + 0.6, w: 1.75, h: 0.72,
      fontSize: 26, bold: true, color: kpi.color || C.violet, fontFace: F.title,
    });
    // Sub label
    slide.addText(kpi.sub || '', {
      x: p.x + 0.1, y: p.y + 1.35, w: 1.75, h: 0.35,
      fontSize: 7.5, color: C.textMed, fontFace: F.body, italic: true,
    });
  });

  // Screenshot (right)
  if (img) {
    slide.addImage({ data: img, x: 4.5, y: 0.85, w: 5.25, h: 4.55, sizing: { type: 'contain', w: 5.25, h: 4.55 } });
  }

  // Bottom note bar
  slide.addShape(pptx.ShapeType.rect, { x:0, y:5.35, w:W, h:0.275, fill:{color:C.darkAccent}, line:{type:'none'} });
  slide.addText(note || `Painel: ${tabId}`, {
    x: M, y: 5.37, w: 9.4, h: 0.22,
    fontSize: 7, color: C.textMuted, fontFace: F.mono,
  });

  console.log(`  ✓ Slide E: ${title}`);
}

// ── LAYOUT F: Closing Slide ────────────────────────────────────
function addClosingSlide(pptx) {
  const slide = pptx.addSlide();

  // Dark background
  slide.addShape(pptx.ShapeType.rect, { x:0, y:0, w:W, h:H, fill:{color:C.darkBg}, line:{type:'none'} });
  // Violet overlay (right half)
  slide.addShape(pptx.ShapeType.rect, { x:5, y:0, w:5, h:H, fill:{color:C.violet, transparency:65}, line:{type:'none'} });
  // Emerald horizontal accent
  slide.addShape(pptx.ShapeType.rect, { x:0, y:2.62, w:W, h:0.04, fill:{color:C.emerald, transparency:40}, line:{type:'none'} });

  // Decorative circles
  slide.addShape(pptx.ShapeType.ellipse, { x:7.5, y:0.2, w:3.0, h:3.0, fill:{color:C.violet, transparency:80}, line:{type:'none'} });
  slide.addShape(pptx.ShapeType.ellipse, { x:8.0, y:3.0, w:2.5, h:2.5, fill:{color:C.emerald, transparency:85}, line:{type:'none'} });

  // Logo pill
  slide.addText('FarmaIA', {
    x: 4.1, y: 0.45, w: 1.8, h: 0.52,
    fontSize: 15, bold: true, color: C.emerald, fontFace: F.title,
    fill: { color: C.darkAccent }, align: 'center', valign: 'middle',
    line: { color: C.emerald, width: 0.5 }, margin: 0,
  });

  // Main closing text
  slide.addText('Obrigado!', {
    x: 1.5, y: 1.3, w: 7.0, h: 1.15,
    fontSize: 52, bold: true, color: C.white, fontFace: F.title, align: 'center',
  });

  // Subtext
  slide.addText(
    'Transformando a Farmácia Hospitalar\ncom Dados e Inteligência Artificial',
    {
      x: 1.0, y: 2.7, w: 8.0, h: 0.72,
      fontSize: 12, color: C.textLight, fontFace: F.body, align: 'center', lineSpacingMultiple: 1.4,
    }
  );

  // Divider
  slide.addShape(pptx.ShapeType.line, {
    x: 3.5, y: 3.55, w: 3.0, h: 0,
    line: { color: C.violet, width: 1.0, transparency: 40 },
  });

  // Version
  slide.addText('Versão BETA 0.1 — Março 2026', {
    x: 3.0, y: 3.72, w: 4.0, h: 0.35,
    fontSize: 10, color: C.textMuted, fontFace: F.body, align: 'center',
  });

  // Decorative dots
  [4.65, 5.05, 5.45].forEach(x => {
    slide.addShape(pptx.ShapeType.ellipse, {
      x, y: 4.9, w: 0.1, h: 0.1,
      fill: { color: C.violet, transparency: 40 }, line: { type: 'none' },
    });
  });

  console.log('  ✓ Slide 18: Closing');
}

// ── MAIN ───────────────────────────────────────────────────────
async function main() {
  console.log('\n🎨 Gerando apresentação FarmaIA — Logística Farma...\n');

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 10 × 5.625 in
  pptx.title = 'Logística Farma — FarmaIA';
  pptx.subject = 'Farmácia Hospitalar Inteligente';
  pptx.author = 'FarmaIA';

  // ── Slide 1: Title ──────────────────────────────────────────
  addTitleSlide(pptx, { screenshotLabel: 'landing_page' });

  // ── Slide 2: Seção 01 — Visão Geral ─────────────────────────
  addSectionDivider(pptx, {
    num: 1,
    title: 'Visão Geral da Plataforma',
    description: 'Sistema React/TypeScript com 33 painéis especializados para farmácia hospitalar',
  });

  // ── Slide 3: Landing Page Full ──────────────────────────────
  addFullScreenshotSlide(pptx, {
    title: 'FarmaIA — Interface de Apresentação',
    screenshotLabel: 'landing_full',
    caption: 'Landing page com animações Framer Motion — ponto de entrada para o sistema de logística farmacêutica',
  });

  // ── Slide 4: Seção 02 — Analytics e IA ──────────────────────
  addSectionDivider(pptx, {
    num: 2,
    title: 'Analytics e Inteligência Artificial',
    description: 'Painéis analíticos com Recharts v3, integração Gemini AI e importação de dados CSV',
  });

  // ── Slide 5: Insights do Farma ──────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'analytics',
    title: 'Insights do Farma',
    screenshotLabel: 'insights_farma',
    bullets: [
      'Bar, Pie, Area e Radar charts com Recharts v3',
      'Integração com Gemini AI para análise automática de estoque',
      'Importação de CSV de consumo e lotes via PapaCSV',
      'Análise Pareto — top produtos por criticidade e valor',
      'KPIs visuais: URGENTE / VERIFICAR / PEDIR / REMANEJAR',
    ],
    badges: ['Gemini AI', 'CSV Upload', 'Pareto'],
  });

  // ── Slide 6: Análise Dispensação ────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'analise_dispensacao',
    title: 'Análise Dispensação',
    screenshotLabel: 'analise_disp',
    bullets: [
      'Taxa de atendimento consolidada por tipo de solicitação',
      'Distribuição horária — identificação do pico de demanda',
      'Top produtos dispensados com volume e frequência',
      'Performance individual dos usuários dispensadores',
      'Filtros combinados por status, tipo e período',
    ],
    badges: ['Taxa Atend.', 'Análise Horária'],
  });

  // ── Slide 7: Seção 03 — Dispensários e Estoque ──────────────
  addSectionDivider(pptx, {
    num: 3,
    title: 'Controle de Dispensários e Estoque',
    description: 'Dispensários automatizados CAF, acurácia de inventário e gestão de lotes e validades',
  });

  // ── Slide 8: Análise Dispensários V2 ────────────────────────
  addStatsGridSlide(pptx, {
    tabId: 'analise_dispensarios_v2',
    title: 'Análise Dispensários V2',
    screenshotLabel: 'dispensarios_v2',
    kpis: [
      { label: 'Acurácia de Serviço',    value: '98%', color: C.emerald, sub: 'por transação' },
      { label: 'Perdas por Validade',     value: '—',   color: C.amber,   sub: 'itens em risco' },
      { label: 'Variância Inventário',    value: '—',   color: C.violet,  sub: 'diferença física' },
      { label: 'Alertas Ativos',          value: '—',   color: C.amber,   sub: 'abaixo do mínimo' },
    ],
    note: 'Import XLSX | Sub-tabs: Dashboard / Transações / Saldos / Alertas | Dispensários A1 · A2 · E2 · UTIs',
  });

  // ── Slide 9: Indicadores CAF ─────────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'indicadores_caf',
    title: 'Indicadores CAF',
    screenshotLabel: 'indicadores_caf',
    bullets: [
      'KPI cards: acurácia, baixas, validades vencendo e classe A',
      'Classificação ABC por valor de consumo acumulado',
      'Gráfico composto (Bar + Line) de consumo histórico',
      'Validades em risco — dias para vencer + valor R$ total',
      'Diagnóstico automático via Gemini AI + exportação PDF',
    ],
    badges: ['ABC Class', 'PDF Export', 'Gemini AI'],
  });

  // ── Slide 10: Painel CAF V2 ──────────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'painel_caf_v2',
    title: 'Painel CAF V2',
    screenshotLabel: 'painel_caf_v2',
    bullets: [
      'Controle de acesso físico por dispensário e módulo',
      'Sub-tabs: Consumo diário / Estoque atual / Ordens de Compra',
      'Gerenciamento de lotes com contagem de dias para vencer',
      'Projeção de ruptura por média de consumo (D19–D23)',
      'Exportação PDF individual por painel — consumo e OC',
    ],
    badges: ['Lote Mgmt', 'OC Tracking'],
  });

  // ── Slide 11: Seção 04 — Planejamento ───────────────────────
  addSectionDivider(pptx, {
    num: 4,
    title: 'Planejamento e Ressuprimento',
    description: 'Previsão de demanda, cobertura de estoque e geração automática de requisições',
  });

  // ── Slide 12: Requisição V2 ──────────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'requisicao_v2',
    title: 'Requisição / Ressuprimento',
    screenshotLabel: 'requisicao_v2',
    bullets: [
      'Sugestão automática de pedido por cobertura de 5 dias',
      'Margem de segurança ×1.20 sobre necessidade calculada',
      'Status por item: OK / PEDIR / Insuficiente CAF',
      'Cálculo diferencial: quantidade a pedir vs. disponível no CAF',
      'Exportação PDF do relatório consolidado de requisição',
    ],
    badges: ['Auto-Suggest', 'Safety Stock'],
  });

  // ── Slide 13: Previsibilidade V2 ─────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'previsibilidade_v2',
    title: 'Previsibilidade V2',
    screenshotLabel: 'previsib_v2',
    bullets: [
      'Cruzamento de solicitações pendentes vs. estoque real',
      'Cobertura com equivalências farmacêuticas substitutas',
      'Classificação: cobertura total / parcial / sem estoque',
      'Identificação de itens sem equivalente disponível',
      'Exportação PDF do mapa de cobertura por unidade',
    ],
    badges: ['Equivalência', 'Coverage Map'],
  });

  // ── Slide 14: Seção 05 — Perdas e Qualidade ─────────────────
  addSectionDivider(pptx, {
    num: 5,
    title: 'Gestão de Perdas e Qualidade',
    description: 'Baixas de estoque, análise operacional consolidada e avaliação de fornecedores',
  });

  // ── Slide 15: Baixas e Perdas de Estoque ────────────────────
  addStatsGridSlide(pptx, {
    tabId: 'baixas_estoque',
    title: 'Baixas e Perdas de Estoque',
    screenshotLabel: 'baixas_estoque',
    kpis: [
      { label: 'Baixas por Validade',     value: '—', color: C.amber,   sub: 'unidades perdidas' },
      { label: 'Perdas por Quebra',        value: '—', color: C.red,     sub: 'incidentes físicos' },
      { label: 'Transferências em Risco',  value: '—', color: C.violet,  sub: 'redistribuições' },
      { label: 'Lotes a Evitar (< 90d)',   value: '—', color: C.amber,   sub: 'próx. ao vencimento' },
    ],
    note: 'Sub-tabs: Dashboard / Baixas / A Evitar / Transferências / Lotes / Consumo | Categorização farmacêutica + Risco Assistencial',
  });

  // ── Slide 16: Análise Operacional ────────────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'analise_operacional',
    title: 'Análise Operacional',
    screenshotLabel: 'analise_op',
    bullets: [
      'Multi-CSV: acurácia de atendimento, horários, movimentos',
      'Taxa alcançada por tipo: Normal, Urgente, Satélite',
      'Distribuição horária: 00–06h / 06–12h / 12–18h / 18–24h',
      'Perdas mensais consolidadas em valor R$ e % do estoque',
      'Análise de saídas e devoluções por estoque e espécie',
    ],
    badges: ['Multi-CSV', 'R$ Perdas'],
  });

  // ── Slide 17: Avaliação de Fornecedores ──────────────────────
  addScreenshotBulletsSlide(pptx, {
    tabId: 'avaliacao_fornecedores',
    title: 'Avaliação de Fornecedores',
    screenshotLabel: 'fornecedores',
    bullets: [
      'KPIs ponderados: OTD, Conformidade, Divergência, Validade',
      'Grade automática: Excelente (≥90) / Bom / Regular / Crítico',
      'Matriz desempenho vs. valor de compras (scatter plot)',
      'Radar chart comparativo multi-fornecedor por dimensão',
      'Importação múltipla de CSVs de recebimento de NF',
    ],
    badges: ['OTD Score', 'Radar Chart'],
  });

  // ── Slide 18: Closing ────────────────────────────────────────
  addClosingSlide(pptx);

  // ── Write file ───────────────────────────────────────────────
  console.log(`\n💾 Salvando em: ${OUTPUT_FILE}`);
  await pptx.writeFile({ fileName: OUTPUT_FILE });
  console.log('\n✅ Apresentação gerada com sucesso!');
  console.log(`📊 Total de slides: 18`);
  console.log(`📁 Arquivo: ${OUTPUT_FILE}`);
}

main().catch(err => {
  console.error('\n❌ Erro:', err.message);
  process.exit(1);
});
