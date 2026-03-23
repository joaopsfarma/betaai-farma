import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Upload, TrendingDown, Package, AlertTriangle, CheckCircle,
  BarChart2, ChevronLeft, ChevronRight, Target, Activity,
  Database, Search, RefreshCw, FileText, X, TrendingUp,
  ShieldCheck, AlertCircle, Layers, Brain, Image as ImageIcon, FileDown,
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { exportIndicadoresLogisticosPDF } from '../utils/pdfExport';

// ─── PARSING HELPERS ──────────────────────────────────────────────────────────

function parseSemiLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ';' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseCommaLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseBR(s?: string): number {
  if (!s) return 0;
  const clean = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

const TODAY_IL = new Date('2026-03-18');

function diasParaVencerIL(ddmmyyyy: string): number {
  if (!ddmmyyyy) return 9999;
  const p = ddmmyyyy.trim().split('/');
  if (p.length !== 3) return 9999;
  const d = new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((d.getTime() - TODAY_IL.getTime()) / 86400000);
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

// ─── AI PROMPT BUILDER ────────────────────────────────────────────────────────

function buildGeminiPrompt(
  kpis: { taxaAc: number; okAc: number; divergentes: number; totalBaixas: number; pctValidade: number; vlValidade: number; venc90: number; vencidos: number; vlVencendo: number; totalEstoqueVal: number; classeAVal: number; classeACount: number },
  filesLoaded: { baixas: boolean; acuracidade: boolean; abcConsumo: boolean; abcEstoque: boolean; validade: boolean },
  baixasData: { produto: string; motivo: string; total: number }[],
  abcEstoqueData: { nome: string; classe: string; custoTotal: number }[],
  validadeData: { nome: string; diasVenc: number; vlTotal: number }[]
): string {
  const classeAPercent = kpis.totalEstoqueVal > 0
    ? ((kpis.classeAVal / kpis.totalEstoqueVal) * 100).toFixed(1)
    : '—';

  const top5Baixas = [...baixasData]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(b => `  • ${b.produto} (R$ ${b.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}) — ${b.motivo}`)
    .join('\n') || '  Nenhuma baixa registrada.';

  const itensVencidos = validadeData
    .filter(i => i.diasVenc < 0)
    .slice(0, 5)
    .map(v => `  • ${v.nome} — vencido há ${Math.abs(v.diasVenc)}d (R$ ${v.vlTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`)
    .join('\n') || '  Nenhum item vencido.';

  const classeAItens = [...abcEstoqueData]
    .filter(i => i.classe === 'A')
    .sort((a, b) => b.custoTotal - a.custoTotal)
    .slice(0, 5)
    .map(i => `  • ${i.nome} — R$ ${i.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    .join('\n') || '  Dados não carregados.';

  return `Você é um especialista sênior em gestão de logística farmacêutica hospitalar, com profundo conhecimento em acurácia de inventário, curva ABC, controle de validade, perdas operacionais e conformidade ANVISA.

Analise os indicadores abaixo e forneça uma análise crítica estruturada com exatamente 5 pontos de ação, priorizados por impacto operacional e financeiro.

═══════════════════════════════════════════
INDICADORES LOGÍSTICOS — FARMÁCIA HOSPITALAR
═══════════════════════════════════════════

1. ACURÁCIA DE INVENTÁRIO${filesLoaded.acuracidade ? '' : ' (dados não carregados)'}
   - Taxa de Acuracidade: ${filesLoaded.acuracidade ? `${kpis.taxaAc.toFixed(1)}%` : 'N/D'} ${kpis.taxaAc < 80 ? '⚠️ ABAIXO DO MÍNIMO ACEITÁVEL (meta: ≥ 98% — ANVISA/boas práticas)' : '✓ Dentro do padrão'}
   - Itens OK: ${filesLoaded.acuracidade ? kpis.okAc : 'N/D'} | Divergentes: ${filesLoaded.acuracidade ? kpis.divergentes : 'N/D'}

2. BAIXAS DE ESTOQUE${filesLoaded.baixas ? '' : ' (dados não carregados)'}
   - Valor Total de Baixas: ${filesLoaded.baixas ? `R$ ${kpis.totalBaixas.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/D'}
   - Baixas por Validade: ${filesLoaded.baixas ? `${kpis.pctValidade.toFixed(1)}% (R$ ${kpis.vlValidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })})` : 'N/D'} ${kpis.pctValidade > 30 ? '⚠️ ACIMA DO LIMITE CRÍTICO (meta: < 5%)' : ''}
   - Top 5 Produtos com Maiores Baixas:
${top5Baixas}

3. CONTROLE DE VALIDADE${filesLoaded.validade ? '' : ' (dados não carregados)'}
   - Itens Vencendo em 90 dias: ${filesLoaded.validade ? kpis.venc90 : 'N/D'}
   - Itens Vencidos: ${filesLoaded.validade ? kpis.vencidos : 'N/D'} ${kpis.vencidos > 0 ? '⚠️ AÇÃO IMEDIATA — RDC 204/2017 exige retirada imediata de vencidos' : ''}
   - Valor em Risco (90d): ${filesLoaded.validade ? `R$ ${kpis.vlVencendo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/D'}
   - Itens já vencidos (amostra):
${itensVencidos}

4. CURVA ABC — ESTOQUE${filesLoaded.abcEstoque ? '' : ' (dados não carregados)'}
   - Valor Total de Estoque: ${filesLoaded.abcEstoque ? `R$ ${kpis.totalEstoqueVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/D'}
   - Valor Classe A: ${filesLoaded.abcEstoque ? `R$ ${kpis.classeAVal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${classeAPercent}% do total)` : 'N/D'}
   - Quantidade de Itens Classe A: ${filesLoaded.abcEstoque ? kpis.classeACount : 'N/D'}
   - Maiores Itens Classe A (por valor):
${classeAItens}

═══════════════════════════════════════════

FORMATO DE RESPOSTA OBRIGATÓRIO:
Forneça exatamente 5 pontos de análise. Cada ponto deve ter:
- Título curto em negrito (ex: **Risco de Perda Financeira por Validade**)
- Diagnóstico objetivo em 1-2 frases com base nos dados apresentados
- Ação recomendada específica, imediata e aplicável em farmácia hospitalar brasileira

Use linguagem técnica, direta e executiva. Priorize achados com maior impacto financeiro ou regulatório. Evite generalidades. Considere as boas práticas da ANVISA, FEFO, curva ABC e gestão de riscos de desabastecimento.`;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface BaixaItem {
  data: string; estoque: string; motivo: string; produto: string; total: number;
}

interface AcuracidadeItem {
  contagem: string; dtContagem: string; usuario: string;
  estoque: string; especie: string;
  cod: string; nome: string;
  saldoInicial: number; contagemQtd: number; ok: boolean;
}

interface ABCConsumoItem {
  cod: string; nome: string; unidade: string; custoUnit: number;
  qtdConsumo: number; vlCusto: number; classe: string;
}

interface ABCEstoqueItem {
  cod: string; nome: string; unidade: string; custoUnit: number;
  qtdEstoque: number; custoTotal: number; classe: string; estoque: string;
}

interface ValidadeItem {
  cod: string; nome: string; unidade: string; lote: string;
  validade: string; quantidade: number; vlTotal: number;
  diasVenc: number; especie: string;
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────

function parseBaixas(text: string): BaixaItem[] {
  if (!text) return [];
  const result: BaixaItem[] = [];
  for (const line of text.split('\n')) {
    const c = parseSemiLine(line);
    if (!c[0] || !/^\d{2}\/\d{2}\/\d{4}/.test(c[0].trim())) continue;
    result.push({
      data: c[0].trim(),
      estoque: c[2]?.trim() || '',
      motivo: c[6]?.trim() || '',
      produto: c[8]?.trim() || '',
      total: parseBR(c[14]),
    });
  }
  return result;
}

function parseAcuracidade(text: string): AcuracidadeItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: AcuracidadeItem[] = [];
  // row 0 is empty or blank, row 1 is header, data from row 2
  for (let i = 1; i < lines.length; i++) {
    const c = parseSemiLine(lines[i]);
    // skip header row
    if (c[0]?.trim() === 'Contagem') continue;
    const cod = c[7]?.trim();
    if (!cod || !/^\d+$/.test(cod)) continue;
    const saldo = parseBR(c[9]);
    const contagemQtd = parseBR(c[10]);
    // col[11] = 1 means accurate, 0 means divergent
    const ok = c[11]?.trim() === '1';
    result.push({
      contagem: c[0]?.trim() || '',
      dtContagem: c[1]?.trim() || '',
      usuario: c[3]?.trim() || '',
      estoque: c[4]?.trim() || '',
      especie: c[5]?.trim() || '',
      cod, nome: c[8]?.trim() || '',
      saldoInicial: saldo, contagemQtd, ok,
    });
  }
  return result;
}

function parseABCConsumo(text: string): ABCConsumoItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: ABCConsumoItem[] = [];
  for (let i = 2; i < lines.length; i++) {
    const c = parseCommaLine(lines[i]);
    const cod = c[3]?.trim();
    if (!cod || !/^\d+$/.test(cod)) continue;
    const classe = c[12]?.trim().toUpperCase();
    if (!['A', 'B', 'C'].includes(classe)) continue;
    result.push({
      cod, nome: c[4]?.trim() || '', unidade: c[6]?.trim() || '',
      custoUnit: parseBR(c[8]), qtdConsumo: parseBR(c[9]),
      vlCusto: parseBR(c[10]), classe,
    });
  }
  return result;
}

function parseABCEstoque(text: string, estoqueName: string): ABCEstoqueItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: ABCEstoqueItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCommaLine(lines[i]);
    const cod = c[1]?.trim();
    if (!cod || !/^\d+$/.test(cod)) continue;
    const classe = c[12]?.trim().toUpperCase();
    if (!['A', 'B', 'C'].includes(classe)) continue;
    result.push({
      cod, nome: c[2]?.trim() || '', unidade: c[3]?.trim() || '',
      custoUnit: parseBR(c[5]), qtdEstoque: parseBR(c[7]),
      custoTotal: parseBR(c[9]), classe, estoque: estoqueName,
    });
  }
  return result;
}

function parseValidades(text: string): ValidadeItem[] {
  if (!text) return [];
  const result: ValidadeItem[] = [];
  let currentEspecie = '';
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const c = parseCommaLine(line);
    // Section header detection
    const firstCol = c[0]?.trim().toLowerCase() || '';
    if (firstCol.startsWith('esp') || firstCol === 'classe' || firstCol === 'sub-classe' || firstCol.includes('sub')) {
      if (c[1]?.trim()) currentEspecie = c[1].trim();
      continue;
    }
    const cod = c[0]?.trim();
    if (!cod || !/^\d+$/.test(cod)) continue;
    const validade = c[9]?.trim() || '';
    result.push({
      cod, nome: c[2]?.trim() || '', unidade: c[5]?.trim() || '',
      lote: c[7]?.trim() || '', validade,
      quantidade: parseBR(c[11]), vlTotal: parseBR(c[12]),
      diasVenc: diasParaVencerIL(validade), especie: currentEspecie,
    });
  }
  return result;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 25;

const Pager: React.FC<{ total: number; page: number; setPage: (p: number) => void }> = ({ total, page, setPage }) => {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '12px 0' }}>
      <button
        disabled={page === 1}
        onClick={() => setPage(page - 1)}
        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', background: page === 1 ? '#f8fafc' : '#fff', cursor: page === 1 ? 'default' : 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
      >
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: 12, color: '#64748b' }}>
        {page} / {pages} &nbsp;·&nbsp; {fmtNum(total)} registros
      </span>
      <button
        disabled={page === pages}
        onClick={() => setPage(page + 1)}
        style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 10px', background: page === pages ? '#f8fafc' : '#fff', cursor: page === pages ? 'default' : 'pointer', color: '#64748b', display: 'flex', alignItems: 'center' }}
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
};

// ─── ABC COLORS ───────────────────────────────────────────────────────────────

const ABC_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  A: { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' },
  B: { bg: '#fffbeb', text: '#d97706', border: '#fcd34d' },
  C: { bg: '#f0fdf4', text: '#16a34a', border: '#86efac' },
};

const PIE_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────

interface UploadZoneProps {
  label: string; description: string; icon: React.ReactNode;
  color: string; accept?: string; multiple?: boolean; loaded: boolean;
  onFiles: (files: FileList) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ label, description, icon, color, accept = '.csv,.CSV', multiple = false, loaded, onFiles }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
      onClick={() => ref.current?.click()}
      style={{
        border: `2px dashed ${drag ? color : loaded ? '#22c55e' : '#e2e8f0'}`,
        borderRadius: 16, padding: '24px 20px', cursor: 'pointer', textAlign: 'center',
        background: loaded ? '#f0fdf4' : drag ? '#f8fafc' : '#fafafa',
        transition: 'all 0.2s',
      }}
    >
      <input ref={ref} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={e => { if (e.target.files?.length) { onFiles(e.target.files); e.target.value = ''; } }}
      />
      <div style={{ fontSize: 28, marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
        {loaded ? <CheckCircle size={28} color="#22c55e" /> : icon}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: loaded ? '#16a34a' : '#1e293b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: '#94a3b8' }}>{loaded ? 'Carregado com sucesso' : description}</div>
    </div>
  );
};

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const IndicadoresLogisticos: React.FC = () => {
  const [baixasData, setBaixasData] = useState<BaixaItem[]>([]);
  const [acuracidadeData, setAcuracidadeData] = useState<AcuracidadeItem[]>([]);
  const [abcConsumoData, setAbcConsumoData] = useState<ABCConsumoItem[]>([]);
  const [abcEstoqueData, setAbcEstoqueData] = useState<ABCEstoqueItem[]>([]);
  const [validadeData, setValidadeData] = useState<ValidadeItem[]>([]);
  const [filesLoaded, setFilesLoaded] = useState({ baixas: false, acuracidade: false, abcConsumo: false, abcEstoque: false, validade: false });

  const [activeTab, setActiveTab] = useState<'visao_geral' | 'acuracidade' | 'baixas' | 'abc' | 'validade'>('visao_geral');
  const [showUpload, setShowUpload] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [abcFilter, setAbcFilter] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [abcSource, setAbcSource] = useState<'consumo' | 'estoque'>('estoque');
  const [pageB, setPageB] = useState(1);
  const [pageA, setPageA] = useState(1);
  const [pageABC, setPageABC] = useState(1);
  const [pageV, setPageV] = useState(1);
  const [validFilter, setValidFilter] = useState<'ALL' | 'VENCIDO' | '30' | '90' | 'OK'>('ALL');

  // ─── EXPORT + AI STATE ─────────────────────────────────────────────────────
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const readFile = useCallback((file: File): Promise<string> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string || '');
      reader.readAsText(file, 'ISO-8859-1');
    }), []);

  const handleBaixas = useCallback(async (files: FileList) => {
    const text = await readFile(files[0]);
    setBaixasData(parseBaixas(text));
    setFilesLoaded(p => ({ ...p, baixas: true }));
  }, [readFile]);

  const handleAcuracidade = useCallback(async (files: FileList) => {
    const text = await readFile(files[0]);
    setAcuracidadeData(parseAcuracidade(text));
    setFilesLoaded(p => ({ ...p, acuracidade: true }));
  }, [readFile]);

  const handleABCConsumo = useCallback(async (files: FileList) => {
    const text = await readFile(files[0]);
    setAbcConsumoData(parseABCConsumo(text));
    setFilesLoaded(p => ({ ...p, abcConsumo: true }));
  }, [readFile]);

  const handleABCEstoque = useCallback(async (files: FileList) => {
    setAbcEstoqueData([]);
    const all: ABCEstoqueItem[] = [];
    for (const file of Array.from(files)) {
      const text = await readFile(file);
      // Extract location number from filename
      const match = file.name.match(/(\d+)/g);
      const loc = match ? match[match.length - 1] : file.name.replace(/\.[^.]+$/, '');
      all.push(...parseABCEstoque(text, loc));
    }
    setAbcEstoqueData(all);
    setFilesLoaded(p => ({ ...p, abcEstoque: true }));
  }, [readFile]);

  const handleValidade = useCallback(async (files: FileList) => {
    const text = await readFile(files[0]);
    setValidadeData(parseValidades(text));
    setFilesLoaded(p => ({ ...p, validade: true }));
  }, [readFile]);

  const hasData = Object.values(filesLoaded).some(Boolean);

  // ─── CDN + KEYFRAMES ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!document.getElementById('html2canvas-cdn')) {
      const script = document.createElement('script');
      script.id = 'html2canvas-cdn';
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      script.async = true;
      document.body.appendChild(script);
    }
    if (!document.getElementById('il-keyframes')) {
      const style = document.createElement('style');
      style.id = 'il-keyframes';
      style.textContent = '@keyframes il-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}} @keyframes il-pulse{0%,100%{opacity:1}50%{opacity:0.35}}';
      document.head.appendChild(style);
    }
  }, []);

  // ─── EXPORT + AI HANDLERS ──────────────────────────────────────────────────
  const handleExportPng = async () => {
    if (!dashboardRef.current) return;
    setIsExportingPng(true);
    try {
      // @ts-ignore
      const canvas = await window.html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#f8fafc', logging: false });
      const link = document.createElement('a');
      link.download = `indicadores-logisticos-${new Date().toISOString().split('T')[0]}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (e) {
      console.error('PNG export error:', e);
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleExportPdf = () => {
    exportIndicadoresLogisticosPDF({ kpis, filesLoaded, baixasData, abcEstoqueData, validadeData });
  };

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true);
    setAiInsight('');
    setAiExpanded(false);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
      const prompt = buildGeminiPrompt(kpis, filesLoaded, baixasData, abcEstoqueData, validadeData);
      const response = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: prompt });
      setAiInsight(response.text || 'Não foi possível gerar análise no momento.');
    } catch (err) {
      console.error('AI analysis error:', err);
      setAiInsight('Erro ao conectar com a inteligência artificial. Verifique sua conexão e a chave de API.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ─── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const totalBaixas = baixasData.reduce((s, i) => s + i.total, 0);
    const vlValidade = baixasData.filter(i => i.motivo.toUpperCase().includes('PRAZO') || i.motivo.toUpperCase().includes('VALID')).reduce((s, i) => s + i.total, 0);
    const vlQuebra = baixasData.filter(i => i.motivo.toUpperCase().includes('QUEBRA')).reduce((s, i) => s + i.total, 0);

    const totalAc = acuracidadeData.length;
    const okAc = acuracidadeData.filter(i => i.ok).length;
    const taxaAc = totalAc > 0 ? (okAc / totalAc) * 100 : 0;
    const divergentes = totalAc - okAc;

    const totalEstoqueVal = abcEstoqueData.reduce((s, i) => s + i.custoTotal, 0);
    const classeAItems = abcEstoqueData.filter(i => i.classe === 'A');
    const classeAVal = classeAItems.reduce((s, i) => s + i.custoTotal, 0);

    const vencidos = validadeData.filter(i => i.diasVenc < 0).length;
    const venc30 = validadeData.filter(i => i.diasVenc >= 0 && i.diasVenc <= 30).length;
    const venc90 = validadeData.filter(i => i.diasVenc >= 0 && i.diasVenc <= 90).length;
    const vlVencendo = validadeData.filter(i => i.diasVenc >= 0 && i.diasVenc <= 90).reduce((s, i) => s + i.vlTotal, 0);

    return {
      totalBaixas, vlValidade, vlQuebra,
      pctValidade: totalBaixas > 0 ? (vlValidade / totalBaixas) * 100 : 0,
      pctQuebra: totalBaixas > 0 ? (vlQuebra / totalBaixas) * 100 : 0,
      totalAc, okAc, divergentes, taxaAc,
      totalEstoqueVal, classeAVal, classeACount: classeAItems.length,
      vencidos, venc30, venc90, vlVencendo,
    };
  }, [baixasData, acuracidadeData, abcEstoqueData, validadeData]);

  // ─── CHART DATA ────────────────────────────────────────────────────────────

  const baixasByMotivo = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of baixasData) {
      const m = b.motivo || 'Outros';
      map.set(m, (map.get(m) || 0) + b.total);
    }
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [baixasData]);

  const baixasByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of baixasData) {
      const parts = b.data.split('/');
      if (parts.length === 3) {
        const key = `${parts[1]}/${parts[2].slice(2)}`;
        map.set(key, (map.get(key) || 0) + b.total);
      }
    }
    return Array.from(map.entries())
      .map(([mes, valor]) => ({ mes, valor }))
      .sort((a, b) => a.mes.localeCompare(b.mes));
  }, [baixasData]);

  const abcChartData = useMemo(() => {
    const src = abcSource === 'estoque' ? abcEstoqueData : abcConsumoData;
    const groups = ['A', 'B', 'C'].map(cl => ({
      classe: cl,
      qtd: src.filter(i => i.classe === cl).length,
      valor: src.filter(i => i.classe === cl).reduce((s, i) => s + (abcSource === 'estoque' ? (i as ABCEstoqueItem).custoTotal : (i as ABCConsumoItem).vlCusto), 0),
    }));
    return groups;
  }, [abcEstoqueData, abcConsumoData, abcSource]);

  const vencimentosChart = useMemo(() => [
    { label: 'Vencidos', qtd: validadeData.filter(i => i.diasVenc < 0).length, fill: '#ef4444' },
    { label: '0–30 dias', qtd: validadeData.filter(i => i.diasVenc >= 0 && i.diasVenc <= 30).length, fill: '#f97316' },
    { label: '31–60 dias', qtd: validadeData.filter(i => i.diasVenc > 30 && i.diasVenc <= 60).length, fill: '#eab308' },
    { label: '61–90 dias', qtd: validadeData.filter(i => i.diasVenc > 60 && i.diasVenc <= 90).length, fill: '#84cc16' },
    { label: '> 90 dias', qtd: validadeData.filter(i => i.diasVenc > 90 && i.diasVenc < 9999).length, fill: '#22c55e' },
  ], [validadeData]);

  const acuracidadeByLoc = useMemo(() => {
    const map = new Map<string, { total: number; ok: number }>();
    for (const a of acuracidadeData) {
      const cur = map.get(a.estoque) || { total: 0, ok: 0 };
      map.set(a.estoque, { total: cur.total + 1, ok: cur.ok + (a.ok ? 1 : 0) });
    }
    return Array.from(map.entries()).map(([estoque, v]) => ({
      estoque, total: v.total, ok: v.ok,
      pct: v.total > 0 ? (v.ok / v.total) * 100 : 0,
    })).sort((a, b) => b.pct - a.pct);
  }, [acuracidadeData]);

  // ─── FILTERED TABLES ───────────────────────────────────────────────────────

  const filteredBaixas = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return baixasData.filter(i =>
      !s || i.produto.toLowerCase().includes(s) || i.motivo.toLowerCase().includes(s) || i.estoque.toLowerCase().includes(s)
    );
  }, [baixasData, searchTerm]);

  const filteredABC = useMemo(() => {
    const src = abcSource === 'estoque' ? abcEstoqueData : abcConsumoData;
    const s = searchTerm.toLowerCase();
    return src.filter(i =>
      (abcFilter === 'ALL' || i.classe === abcFilter) &&
      (!s || i.nome.toLowerCase().includes(s) || i.cod.includes(s))
    );
  }, [abcEstoqueData, abcConsumoData, abcSource, abcFilter, searchTerm]);

  const [acFilter, setAcFilter] = useState<'ALL' | 'OK' | 'DIV'>('ALL');

  const filteredAcuracidade = useMemo(() => {
    const s = searchTerm.toLowerCase();
    return acuracidadeData.filter(i =>
      (acFilter === 'ALL' || (acFilter === 'OK' ? i.ok : !i.ok)) &&
      (!s || i.nome.toLowerCase().includes(s) || i.cod.includes(s) || i.estoque.toLowerCase().includes(s) || i.especie.toLowerCase().includes(s))
    );
  }, [acuracidadeData, searchTerm, acFilter]);

  const filteredValidade = useMemo(() => {
    const s = searchTerm.toLowerCase();
    let data = validadeData;
    if (validFilter === 'VENCIDO') data = data.filter(i => i.diasVenc < 0);
    else if (validFilter === '30') data = data.filter(i => i.diasVenc >= 0 && i.diasVenc <= 30);
    else if (validFilter === '90') data = data.filter(i => i.diasVenc >= 0 && i.diasVenc <= 90);
    else if (validFilter === 'OK') data = data.filter(i => i.diasVenc > 90);
    if (s) data = data.filter(i => i.nome.toLowerCase().includes(s) || i.lote.toLowerCase().includes(s) || i.cod.includes(s));
    return data.sort((a, b) => a.diasVenc - b.diasVenc);
  }, [validadeData, validFilter, searchTerm]);

  // ─── UPLOAD SCREEN ─────────────────────────────────────────────────────────

  const uploadScreen = (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 16px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <BarChart2 size={28} color="#fff" />
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Indicadores Logísticos</h2>
        <p style={{ color: '#64748b', fontSize: 14 }}>Carregue os arquivos CSV para visualizar os indicadores de desempenho logístico</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16, marginBottom: 24 }}>
        <UploadZone label="Baixas de Estoque" description="4036___Baixas.CSV" color="#ef4444"
          icon={<TrendingDown size={28} color="#ef4444" />} loaded={filesLoaded.baixas} onFiles={handleBaixas} />
        <UploadZone label="Acuracidade de Estoque" description="4104___Acuracidade.CSV" color="#6366f1"
          icon={<Target size={28} color="#6366f1" />} loaded={filesLoaded.acuracidade} onFiles={handleAcuracidade} />
        <UploadZone label="Curva ABC — Consumo" description="R_C_ABC_CONSUMO_CONSO.csv" color="#f59e0b"
          icon={<Activity size={28} color="#f59e0b" />} loaded={filesLoaded.abcConsumo} onFiles={handleABCConsumo} />
        <UploadZone label="Curva ABC — Estoque" description="R_C_ABC_ESTOQUE*.csv (múltiplos)" color="#10b981" multiple
          icon={<Database size={28} color="#10b981" />} loaded={filesLoaded.abcEstoque} onFiles={handleABCEstoque} />
        <UploadZone label="Controle de Validade" description="R_CONT_VALID.CSV" color="#8b5cf6"
          icon={<Package size={28} color="#8b5cf6" />} loaded={filesLoaded.validade} onFiles={handleValidade} />
      </div>

      {hasData && (
        <div style={{ textAlign: 'center' }}>
          <button onClick={() => setShowUpload(false)}
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 32px', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
            Ver Dashboard →
          </button>
        </div>
      )}
    </div>
  );

  if (!hasData || showUpload) return uploadScreen;

  // ─── TAB DEFINITIONS ───────────────────────────────────────────────────────

  const tabs = [
    { id: 'visao_geral' as const, label: 'Visão Geral', icon: <BarChart2 size={15} /> },
    { id: 'acuracidade' as const, label: 'Acuracidade', icon: <Target size={15} />, hidden: !filesLoaded.acuracidade },
    { id: 'baixas' as const, label: 'Baixas', icon: <TrendingDown size={15} />, hidden: !filesLoaded.baixas },
    { id: 'abc' as const, label: 'Curva ABC', icon: <Layers size={15} />, hidden: !filesLoaded.abcConsumo && !filesLoaded.abcEstoque },
    { id: 'validade' as const, label: 'Validade', icon: <Package size={15} />, hidden: !filesLoaded.validade },
  ].filter(t => !t.hidden);

  // ─── KPI CARDS ─────────────────────────────────────────────────────────────

  const kpiCards = [
    {
      label: 'Taxa de Acuracidade',
      value: filesLoaded.acuracidade ? `${fmtNum(kpis.taxaAc, 1)}%` : '—',
      sub: filesLoaded.acuracidade ? `${kpis.okAc} OK · ${kpis.divergentes} divergentes` : 'Arquivo não carregado',
      color: '#6366f1', bg: '#eef2ff', icon: <Target size={20} color="#6366f1" />,
      alert: kpis.taxaAc < 80,
    },
    {
      label: 'Valor Total de Baixas',
      value: filesLoaded.baixas ? fmtBRL(kpis.totalBaixas) : '—',
      sub: filesLoaded.baixas ? `${baixasData.length} ocorrências` : 'Arquivo não carregado',
      color: '#ef4444', bg: '#fef2f2', icon: <TrendingDown size={20} color="#ef4444" />,
      alert: false,
    },
    {
      label: 'Baixas por Validade',
      value: filesLoaded.baixas ? `${fmtNum(kpis.pctValidade, 1)}%` : '—',
      sub: filesLoaded.baixas ? fmtBRL(kpis.vlValidade) : 'Arquivo não carregado',
      color: '#f97316', bg: '#fff7ed', icon: <AlertTriangle size={20} color="#f97316" />,
      alert: kpis.pctValidade > 30,
    },
    {
      label: 'Itens Vencendo (90d)',
      value: filesLoaded.validade ? fmtNum(kpis.venc90) : '—',
      sub: filesLoaded.validade ? `${kpis.vencidos} vencidos · ${fmtBRL(kpis.vlVencendo)}` : 'Arquivo não carregado',
      color: '#8b5cf6', bg: '#f5f3ff', icon: <Package size={20} color="#8b5cf6" />,
      alert: kpis.vencidos > 0,
    },
    {
      label: 'Estoque Total (ABC)',
      value: filesLoaded.abcEstoque ? fmtBRL(kpis.totalEstoqueVal) : '—',
      sub: filesLoaded.abcEstoque ? `Classe A: ${fmtBRL(kpis.classeAVal)}` : 'Arquivo não carregado',
      color: '#10b981', bg: '#f0fdf4', icon: <Database size={20} color="#10b981" />,
      alert: false,
    },
    {
      label: 'Itens Classe A',
      value: filesLoaded.abcEstoque ? fmtNum(kpis.classeACount) : '—',
      sub: filesLoaded.abcEstoque ? `${kpis.totalEstoqueVal > 0 ? fmtNum((kpis.classeAVal / kpis.totalEstoqueVal) * 100, 1) : 0}% do valor total` : 'Arquivo não carregado',
      color: '#dc2626', bg: '#fef2f2', icon: <ShieldCheck size={20} color="#dc2626" />,
      alert: false,
    },
  ];

  // ─── TABLE STYLES ──────────────────────────────────────────────────────────

  const thStyle: React.CSSProperties = { padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '2px solid #f1f5f9', background: '#f8fafc', whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: '#334155', borderBottom: '1px solid #f1f5f9' };

  // ─── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div ref={dashboardRef} style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', margin: 0 }}>Indicadores Logísticos</h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Acuracidade · Baixas · Curva ABC · Controle de Validade</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={handleAiAnalysis} disabled={isAnalyzing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', borderRadius: 10, padding: '8px 16px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', cursor: isAnalyzing ? 'wait' : 'pointer', fontSize: 13, color: '#fff', fontWeight: 700, opacity: isAnalyzing ? 0.75 : 1 }}>
            {isAnalyzing
              ? <RefreshCw size={14} style={{ animation: 'il-spin 1s linear infinite' }} />
              : <Brain size={14} />}
            {isAnalyzing ? 'Analisando…' : 'Análise IA'}
          </button>
          <button onClick={handleExportPng} disabled={isExportingPng} title="Exportar como imagem PNG"
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', background: '#fff', cursor: isExportingPng ? 'wait' : 'pointer', fontSize: 13, color: '#475569', fontWeight: 600, opacity: isExportingPng ? 0.6 : 1 }}>
            {isExportingPng ? <RefreshCw size={14} style={{ animation: 'il-spin 1s linear infinite' }} /> : <ImageIcon size={14} />} PNG
          </button>
          <button onClick={handleExportPdf} title="Exportar relatório PDF"
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 14px', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600 }}>
            <FileDown size={14} /> PDF
          </button>
          <button onClick={() => setShowUpload(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #e2e8f0', borderRadius: 10, padding: '8px 16px', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#475569', fontWeight: 600 }}>
            <Upload size={14} /> Carregar Arquivos
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        {kpiCards.map((k, idx) => (
          <div key={idx} style={{ background: '#fff', border: `1px solid ${k.alert ? '#fca5a5' : '#e2e8f0'}`, borderRadius: 16, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{k.label}</span>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: k.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k.icon}</div>
            </div>
            <span style={{ fontSize: 22, fontWeight: 800, color: k.alert ? '#dc2626' : '#1e293b' }}>{k.value}</span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{k.sub}</span>
          </div>
        ))}
      </div>

      {/* AI Analysis Card */}
      {(aiInsight || isAnalyzing) && (
        <div style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)', borderRadius: 16, padding: '20px 24px', marginBottom: 24, boxShadow: '0 4px 24px rgba(99,102,241,0.18)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -10, right: -10, opacity: 0.07, pointerEvents: 'none' }}>
            <Brain size={120} color="#fff" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Análise Crítica — IA Gemini</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>Logística Farmacêutica Hospitalar</div>
              </div>
            </div>
            {aiInsight && !isAnalyzing && (
              <button onClick={() => setAiExpanded(e => !e)}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '4px 14px', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                {aiExpanded ? 'Recolher ↑' : 'Expandir ↓'}
              </button>
            )}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 1.75, maxHeight: aiExpanded ? 'none' : 140, overflow: 'hidden', position: 'relative' }}>
            {isAnalyzing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[92, 76, 60, 84, 50].map((w, i) => (
                  <div key={i} style={{ height: 12, borderRadius: 6, background: 'rgba(255,255,255,0.18)', width: `${w}%`, animation: `il-pulse 1.5s ease-in-out ${i * 0.15}s infinite` }} />
                ))}
              </div>
            ) : (
              <>
                {aiInsight.split('\n').map((line, i) => (
                  <p key={i} style={{ margin: '0 0 4px 0' }}>{line || '\u00A0'}</p>
                ))}
                {!aiExpanded && aiInsight.length > 300 && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 48, background: 'linear-gradient(to bottom, transparent, rgba(79,70,229,0.96))' }} />
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #f1f5f9', marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setActiveTab(t.id); setSearchTerm(''); setPageB(1); setPageA(1); setPageABC(1); setPageV(1); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: '10px 10px 0 0', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
              background: activeTab === t.id ? '#6366f1' : 'transparent',
              color: activeTab === t.id ? '#fff' : '#64748b',
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── VISÃO GERAL ──────────────────────────────────────────────────── */}
      {activeTab === 'visao_geral' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
          {/* Baixas por Motivo */}
          {filesLoaded.baixas && baixasByMotivo.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Baixas por Motivo (R$)</h3>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={baixasByMotivo} cx="50%" cy="50%" outerRadius={100} dataKey="value" nameKey="name" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                    {baixasByMotivo.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Legend formatter={(v) => <span style={{ fontSize: 11 }}>{v.length > 30 ? v.slice(0, 30) + '…' : v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* ABC por Classe (Valor) */}
          {(filesLoaded.abcEstoque || filesLoaded.abcConsumo) && abcChartData.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', margin: 0 }}>Distribuição ABC — Valor (R$)</h3>
                <select value={abcSource} onChange={e => setAbcSource(e.target.value as any)}
                  style={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 8px', color: '#475569' }}>
                  {filesLoaded.abcEstoque && <option value="estoque">Estoque</option>}
                  {filesLoaded.abcConsumo && <option value="consumo">Consumo</option>}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={abcChartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="classe" tick={{ fontSize: 13, fontWeight: 700 }} />
                  <YAxis tickFormatter={v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="valor" radius={[8, 8, 0, 0]}>
                    {abcChartData.map((entry, i) => <Cell key={i} fill={entry.classe === 'A' ? '#ef4444' : entry.classe === 'B' ? '#f59e0b' : '#22c55e'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                {abcChartData.map(d => (
                  <div key={d.classe} style={{ fontSize: 12, color: '#475569' }}>
                    <b>{d.classe}:</b> {d.qtd} itens · {fmtBRL(d.valor)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vencimentos */}
          {filesLoaded.validade && vencimentosChart.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Controle de Validade — Distribuição</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={vencimentosChart} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="qtd" radius={[6, 6, 0, 0]}>
                    {vencimentosChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Baixas por Mês */}
          {filesLoaded.baixas && baixasByMonth.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Evolução Mensal de Baixas (R$)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={baixasByMonth} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={v => `${(v / 1e3).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmtBRL(v)} />
                  <Bar dataKey="valor" fill="#6366f1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Acuracidade Summary */}
          {filesLoaded.acuracidade && acuracidadeByLoc.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Acuracidade por Localização</h3>
              {acuracidadeByLoc.map((loc, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>{loc.estoque}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: loc.pct >= 80 ? '#16a34a' : loc.pct >= 60 ? '#d97706' : '#dc2626' }}>
                      {fmtNum(loc.pct, 1)}%
                    </span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.min(loc.pct, 100)}%`, borderRadius: 4, background: loc.pct >= 80 ? '#22c55e' : loc.pct >= 60 ? '#f59e0b' : '#ef4444' }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{loc.ok} acurados / {loc.total} total</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ACURACIDADE ─────────────────────────────────────────────────── */}
      {activeTab === 'acuracidade' && (
        <div>
          {/* Summary mini-cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {[
              { label: 'Total de Itens', value: fmtNum(acuracidadeData.length), color: '#6366f1', bg: '#eef2ff' },
              { label: 'Acurados (OK)', value: fmtNum(acuracidadeData.filter(i => i.ok).length), color: '#16a34a', bg: '#f0fdf4' },
              { label: 'Divergentes', value: fmtNum(acuracidadeData.filter(i => !i.ok).length), color: '#dc2626', bg: '#fef2f2' },
            ].map((c, i) => (
              <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '12px 18px', border: `1px solid ${c.color}22` }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginBottom: 4 }}>{c.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
              </div>
            ))}
          </div>

          {/* Bar chart by location */}
          {acuracidadeByLoc.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Acuracidade por Local de Estoque (%)</h3>
              <ResponsiveContainer width="100%" height={Math.max(180, acuracidadeByLoc.length * 44)}>
                <BarChart data={acuracidadeByLoc} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 140 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="estoque" tick={{ fontSize: 12 }} width={130} />
                  <Tooltip formatter={(v: number) => `${fmtNum(v, 1)}%`} />
                  <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                    {acuracidadeByLoc.map((e, i) => <Cell key={i} fill={e.pct >= 80 ? '#22c55e' : e.pct >= 60 ? '#f59e0b' : '#ef4444'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Filters + Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {([['ALL', 'Todos'], ['OK', 'Acurados'], ['DIV', 'Divergentes']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setAcFilter(v); setPageA(1); }}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  borderColor: acFilter === v ? (v === 'OK' ? '#16a34a' : v === 'DIV' ? '#dc2626' : '#6366f1') : '#e2e8f0',
                  background: acFilter === v ? (v === 'OK' ? '#f0fdf4' : v === 'DIV' ? '#fef2f2' : '#eef2ff') : '#fff',
                  color: acFilter === v ? (v === 'OK' ? '#16a34a' : v === 'DIV' ? '#dc2626' : '#4f46e5') : '#64748b',
                }}>
                {l}
              </button>
            ))}
            <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPageA(1); }}
                placeholder="Buscar produto, código, espécie…" style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <span style={{ fontSize: 13, color: '#64748b' }}>{fmtNum(filteredAcuracidade.length)} itens</span>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>Espécie</th>
                    <th style={thStyle}>Estoque</th>
                    <th style={thStyle}>Data Contagem</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saldo Inicial</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Contagem</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Divergência</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAcuracidade.slice((pageA - 1) * PAGE_SIZE, pageA * PAGE_SIZE).map((item, idx) => {
                    const div = item.contagemQtd - item.saldoInicial;
                    return (
                      <tr key={idx} style={{ background: !item.ok ? '#fff8f8' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{item.cod}</td>
                        <td style={{ ...tdStyle, maxWidth: 260 }}>{item.nome}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>
                          <span style={{ padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569' }}>{item.especie}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{item.estoque}</td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{item.dtContagem}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(item.saldoInicial, 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(item.contagemQtd, 0)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: div === 0 ? '#16a34a' : div > 0 ? '#2563eb' : '#dc2626' }}>
                          {div > 0 ? '+' : ''}{fmtNum(div, 0)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: item.ok ? '#f0fdf4' : '#fef2f2', color: item.ok ? '#16a34a' : '#dc2626', border: `1px solid ${item.ok ? '#86efac' : '#fca5a5'}` }}>
                            {item.ok ? <CheckCircle size={11} /> : <X size={11} />}
                            {item.ok ? 'OK' : 'Divergente'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredAcuracidade.length === 0 && (
                    <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>Nenhum registro encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={filteredAcuracidade.length} page={pageA} setPage={setPageA} />
          </div>
        </div>
      )}

      {/* ── BAIXAS ──────────────────────────────────────────────────────── */}
      {activeTab === 'baixas' && (
        <div>
          {/* Charts */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 20 }}>
            {baixasByMotivo.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Top Motivos por Valor (R$)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={baixasByMotivo.slice(0, 6)} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 200 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `${(v / 1e3).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={195} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {baixasByMonth.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Evolução Mensal de Baixas (R$)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={baixasByMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `${(v / 1e3).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Bar dataKey="valor" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPageB(1); }}
                placeholder="Buscar produto, motivo, estoque…" style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <span style={{ fontSize: 13, color: '#64748b' }}>{fmtNum(filteredBaixas.length)} baixas · {fmtBRL(filteredBaixas.reduce((s, i) => s + i.total, 0))}</span>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Data</th>
                    <th style={thStyle}>Estoque</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>Motivo</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Valor (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBaixas.slice((pageB - 1) * PAGE_SIZE, pageB * PAGE_SIZE).map((item, idx) => {
                    const isValidade = item.motivo.toUpperCase().includes('PRAZO') || item.motivo.toUpperCase().includes('VALID');
                    const isQuebra = item.motivo.toUpperCase().includes('QUEBRA');
                    return (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#64748b' }}>{item.data}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{item.estoque}</td>
                        <td style={tdStyle}>{item.produto}</td>
                        <td style={{ ...tdStyle }}>
                          <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: isValidade ? '#fff7ed' : isQuebra ? '#fef2f2' : '#f8fafc', color: isValidade ? '#c2410c' : isQuebra ? '#dc2626' : '#64748b' }}>
                            {item.motivo.length > 45 ? item.motivo.slice(0, 45) + '…' : item.motivo}
                          </span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#334155' }}>{fmtBRL(item.total)}</td>
                      </tr>
                    );
                  })}
                  {filteredBaixas.length === 0 && (
                    <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>Nenhum registro encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={filteredBaixas.length} page={pageB} setPage={setPageB} />
          </div>
        </div>
      )}

      {/* ── CURVA ABC ───────────────────────────────────────────────────── */}
      {activeTab === 'abc' && (
        <div>
          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {filesLoaded.abcEstoque && (
                <button onClick={() => { setAbcSource('estoque'); setPageABC(1); }}
                  style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: abcSource === 'estoque' ? '#6366f1' : '#e2e8f0', background: abcSource === 'estoque' ? '#eef2ff' : '#fff', color: abcSource === 'estoque' ? '#4f46e5' : '#64748b' }}>
                  Estoque
                </button>
              )}
              {filesLoaded.abcConsumo && (
                <button onClick={() => { setAbcSource('consumo'); setPageABC(1); }}
                  style={{ padding: '7px 14px', borderRadius: 10, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer', borderColor: abcSource === 'consumo' ? '#6366f1' : '#e2e8f0', background: abcSource === 'consumo' ? '#eef2ff' : '#fff', color: abcSource === 'consumo' ? '#4f46e5' : '#64748b' }}>
                  Consumo
                </button>
              )}
            </div>
            {(['ALL', 'A', 'B', 'C'] as const).map(cl => (
              <button key={cl} onClick={() => { setAbcFilter(cl); setPageABC(1); }}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  borderColor: abcFilter === cl ? (cl === 'ALL' ? '#6366f1' : cl === 'A' ? '#dc2626' : cl === 'B' ? '#d97706' : '#16a34a') : '#e2e8f0',
                  background: abcFilter === cl ? (cl === 'ALL' ? '#eef2ff' : cl === 'A' ? '#fef2f2' : cl === 'B' ? '#fffbeb' : '#f0fdf4') : '#fff',
                  color: abcFilter === cl ? (cl === 'ALL' ? '#4f46e5' : cl === 'A' ? '#dc2626' : cl === 'B' ? '#d97706' : '#16a34a') : '#64748b',
                }}>
                {cl === 'ALL' ? 'Todos' : `Classe ${cl}`}
              </button>
            ))}
            <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPageABC(1); }}
                placeholder="Buscar produto…" style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Summary cards per class */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
            {(['A', 'B', 'C'] as const).map(cl => {
              const src = abcSource === 'estoque' ? abcEstoqueData : abcConsumoData;
              const items = src.filter(i => i.classe === cl);
              const valor = items.reduce((s, i) => s + (abcSource === 'estoque' ? (i as ABCEstoqueItem).custoTotal : (i as ABCConsumoItem).vlCusto), 0);
              const total = src.reduce((s, i) => s + (abcSource === 'estoque' ? (i as ABCEstoqueItem).custoTotal : (i as ABCConsumoItem).vlCusto), 0);
              const c = ABC_COLORS[cl];
              return (
                <div key={cl} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 14, padding: '14px 18px' }}>
                  <div style={{ fontSize: 22, fontWeight: 900, color: c.text, marginBottom: 4 }}>Classe {cl}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{fmtBRL(valor)}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                    {items.length} itens · {total > 0 ? fmtNum((valor / total) * 100, 1) : 0}% do total
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, textAlign: 'center', width: 60 }}>Classe</th>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>Unidade</th>
                    {abcSource === 'estoque' && <th style={{ ...thStyle, textAlign: 'right' }}>Qtd Estoque</th>}
                    {abcSource === 'consumo' && <th style={{ ...thStyle, textAlign: 'right' }}>Qtd Consumo</th>}
                    <th style={{ ...thStyle, textAlign: 'right' }}>Custo Unit.</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>{abcSource === 'estoque' ? 'Custo Total' : 'Vl. Período'}</th>
                    {abcSource === 'estoque' && <th style={thStyle}>Estoque</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredABC.slice((pageABC - 1) * PAGE_SIZE, pageABC * PAGE_SIZE).map((item, idx) => {
                    const c = ABC_COLORS[item.classe] || ABC_COLORS['C'];
                    return (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 12, fontWeight: 800, background: c.bg, color: c.text, border: `1px solid ${c.border}` }}>{item.classe}</span>
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{item.cod}</td>
                        <td style={tdStyle}>{item.nome}</td>
                        <td style={{ ...tdStyle, fontSize: 12 }}>{item.unidade}</td>
                        {abcSource === 'estoque' && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum((item as ABCEstoqueItem).qtdEstoque, 2)}</td>}
                        {abcSource === 'consumo' && <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum((item as ABCConsumoItem).qtdConsumo, 2)}</td>}
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: 12 }}>{fmtBRL(item.custoUnit)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                          {fmtBRL(abcSource === 'estoque' ? (item as ABCEstoqueItem).custoTotal : (item as ABCConsumoItem).vlCusto)}
                        </td>
                        {abcSource === 'estoque' && <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{(item as ABCEstoqueItem).estoque}</td>}
                      </tr>
                    );
                  })}
                  {filteredABC.length === 0 && (
                    <tr><td colSpan={9} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>Nenhum registro encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={filteredABC.length} page={pageABC} setPage={setPageABC} />
          </div>
        </div>
      )}

      {/* ── VALIDADE ────────────────────────────────────────────────────── */}
      {activeTab === 'validade' && (
        <div>
          {/* Chart */}
          {vencimentosChart.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 16 }}>Distribuição de Vencimentos</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={vencimentosChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="qtd" radius={[6, 6, 0, 0]}>
                    {vencimentosChart.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            {([['ALL', 'Todos'], ['VENCIDO', 'Vencidos'], ['30', 'Até 30d'], ['90', 'Até 90d'], ['OK', '> 90d']] as const).map(([v, l]) => (
              <button key={v} onClick={() => { setValidFilter(v as any); setPageV(1); }}
                style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  borderColor: validFilter === v ? '#8b5cf6' : '#e2e8f0', background: validFilter === v ? '#f5f3ff' : '#fff', color: validFilter === v ? '#7c3aed' : '#64748b',
                }}>
                {l}
              </button>
            ))}
            <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setPageV(1); }}
                placeholder="Buscar produto, lote, código…" style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 7, paddingBottom: 7, border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <span style={{ fontSize: 13, color: '#64748b' }}>{fmtNum(filteredValidade.length)} itens</span>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Código</th>
                    <th style={thStyle}>Produto</th>
                    <th style={thStyle}>Nº Lote</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Validade</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Dias p/ Vencer</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Quantidade</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Valor (R$)</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredValidade.slice((pageV - 1) * PAGE_SIZE, pageV * PAGE_SIZE).map((item, idx) => {
                    const isVencido = item.diasVenc < 0;
                    const isUrgente = item.diasVenc >= 0 && item.diasVenc <= 30;
                    const isAtencao = item.diasVenc > 30 && item.diasVenc <= 90;
                    const statusColor = isVencido ? '#dc2626' : isUrgente ? '#ea580c' : isAtencao ? '#d97706' : '#16a34a';
                    const statusBg = isVencido ? '#fef2f2' : isUrgente ? '#fff7ed' : isAtencao ? '#fffbeb' : '#f0fdf4';
                    const statusLabel = isVencido ? 'Vencido' : isUrgente ? 'Urgente' : isAtencao ? 'Atenção' : 'OK';
                    return (
                      <tr key={idx} style={{ background: isVencido ? '#fff5f5' : idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>{item.cod}</td>
                        <td style={tdStyle}>{item.nome}</td>
                        <td style={{ ...tdStyle, fontSize: 12, fontFamily: 'monospace', color: '#475569' }}>{item.lote}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontSize: 12 }}>{item.validade}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: statusColor }}>
                          {item.diasVenc < 9999 ? (item.diasVenc < 0 ? `${Math.abs(item.diasVenc)}d atrás` : `${item.diasVenc}d`) : '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(item.quantidade, 2)}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtBRL(item.vlTotal)}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: statusBg, color: statusColor }}>
                            {statusLabel}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredValidade.length === 0 && (
                    <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 32 }}>Nenhum registro encontrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Pager total={filteredValidade.length} page={pageV} setPage={setPageV} />
          </div>
        </div>
      )}
    </div>
  );
};
