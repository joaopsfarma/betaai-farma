import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  Upload, TrendingDown, Package, AlertTriangle, CheckCircle,
  BarChart2, ChevronLeft, ChevronRight, Database, Search,
  RefreshCw, FileText, Activity, Layers, Clock, ShieldCheck,
  Brain, X, AlertCircle,
} from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface PerdaMesItem { mes: string; perda: number; pctPerda: string; }
interface PerdaTipoItem {
  periodo: string; unidade: string; vlEstoqueGeral: number;
  estabilidade: number; quebraAvaria: number; validade: number;
  outros: number; total: number; pctPerda: string;
}
interface Top10PerdaItem { produto: string; perda: number; }
interface DifEstoqueItem { localEstoque: string; vlDif: number; }
interface DifProdutoItem {
  codProduto: string; descProduto: string;
  vlEntrada: number; vlSaida: number; vlDif: number;
}
interface DevProdutoItem {
  descUnidade: string; localEstoque: string; setorConsumo: string;
  codProduto: string; descProduto: string;
  qtdDevolvida: number; qtdMovimentada: number; pctDev: number;
}
interface SaidaEstoqueItem {
  codEspecie: string; especie: string; codProduto: string; produto: string;
  unidade: string; qtdeSaida: number; qtdeDevolvida: number;
  vlTotal: number; codEstoque: string; estoque: string;
}
interface MovEstoqueItem {
  codEmpresa: string; codEstoque: string; estoque: string;
  codSetor: string; setor: string;
  devolucao: number; saida: number; total: number;
}
interface SolicitacaoHorarioItem {
  tipo: string; h0006: number; h0612: number;
  h1218: number; h1824: number; total: number;
}
interface AcuradidadeItem {
  descTipoSol: string; descSituacao: string;
  qtSolicitado: number; qtAtendida: number; alcancado: number;
}

type SubTab = 'resumo' | 'perdas' | 'inventario' | 'movimentacao' | 'atendimento';
type FilesLoaded = {
  perdaMes: boolean; perdaTipo: boolean; top10Perda: boolean;
  difEstoque: boolean; difProduto: boolean; devProduto: boolean;
  saidas3012: boolean; mov3830: boolean; horarios3189: boolean;
  acuradidade: boolean;
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

function parseSemiLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ';' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parseCommaLine(line: string): string[] {
  const result: string[] = [];
  let cur = '', inQ = false;
  for (const c of line) {
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  result.push(cur.trim());
  return result;
}

function parseBR(s?: string): number {
  if (!s) return 0;
  const clean = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

function parseBRLValue(raw: string): number {
  const s = (raw || '').replace(/"/g, '').trim();
  const isNeg = s.startsWith('-');
  const stripped = s.replace(/^-?\s*R\$\s*/, '').trim();
  const val = parseBR(stripped);
  return isNeg ? -val : val;
}

function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtNum(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function stripBOM(text: string): string {
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────
function parsePerdaMes(text: string): PerdaMesItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: PerdaMesItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!c[0] || c[0] === 'ds_mes') continue;
    const perda = parseFloat(c[1]);
    if (isNaN(perda)) continue;
    result.push({ mes: c[0], perda, pctPerda: c[2] || '' });
  }
  return result;
}

function parsePerdaTipo(text: string): PerdaTipoItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: PerdaTipoItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!c[0] || c[0] === 'Período') continue;
    result.push({
      periodo: c[0],
      unidade: c[1] || '',
      vlEstoqueGeral: parseBRLValue(c[2]),
      estabilidade: parseFloat(c[3]) || 0,
      quebraAvaria: parseFloat(c[4]) || 0,
      validade: parseFloat(c[5]) || 0,
      outros: parseBRLValue(c[6]),
      total: parseBRLValue(c[7]),
      pctPerda: c[8] || '',
    });
  }
  return result;
}

function parseTop10Perda(text: string): Top10PerdaItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: Top10PerdaItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!c[0] || c[0] === 'ds_produto') continue;
    const perda = parseFloat(c[1]);
    if (isNaN(perda)) continue;
    result.push({ produto: c[0], perda });
  }
  return result.sort((a, b) => b.perda - a.perda);
}

function parseDifEstoque(text: string): DifEstoqueItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: DifEstoqueItem[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!c[0] || c[0] === 'Local de Estoque') continue;
    result.push({ localEstoque: c[0], vlDif: parseBRLValue(c[1]) });
  }
  return result.sort((a, b) => Math.abs(b.vlDif) - Math.abs(a.vlDif));
}

function parseDifProduto(text: string): DifProdutoItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: DifProdutoItem[] = [];
  let headerFound = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!headerFound) {
      if (c[0] === 'Cd. Produto' || c[1] === 'Desc. Produto') { headerFound = true; }
      continue;
    }
    if (!c[0] || isNaN(Number(c[0]))) continue;
    result.push({
      codProduto: c[0],
      descProduto: c[1] || '',
      vlEntrada: parseBRLValue(c[2]),
      vlSaida: parseBRLValue(c[3]),
      vlDif: parseBRLValue(c[4]),
    });
  }
  return result.sort((a, b) => Math.abs(b.vlDif) - Math.abs(a.vlDif));
}

function parseDevProduto(text: string): DevProdutoItem[] {
  const lines = stripBOM(text).split(/\r?\n/);
  const result: DevProdutoItem[] = [];
  let headerFound = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCommaLine(line);
    if (!headerFound) {
      if (c[0] === 'Desc. Unidade' || c[4] === 'Descrição Produto') { headerFound = true; }
      continue;
    }
    if (!c[0]) continue;
    const pctRaw = (c[7] || '').replace('%', '').replace(/\s/g, '');
    result.push({
      descUnidade: c[0], localEstoque: c[1], setorConsumo: c[2],
      codProduto: c[3], descProduto: c[4],
      qtdDevolvida: parseBR(c[5]),
      qtdMovimentada: parseBR(c[6]),
      pctDev: parseBR(pctRaw),
    });
  }
  return result;
}

function parseSaidas3012(text: string): SaidaEstoqueItem[] {
  const lines = text.split(/\r?\n/);
  const result: SaidaEstoqueItem[] = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const c = parseSemiLine(lines[i]);
    if (c[6] && (c[6].includes('Qtde') || c[6].includes('Saida'))) {
      headerIdx = i; break;
    }
    if (c[2] && c[2].includes('Cód') && c[6]) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return result;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = parseSemiLine(line);
    if (!c[2] || isNaN(Number(c[2]))) continue;
    result.push({
      codEspecie: c[0], especie: c[1], codProduto: c[2], produto: c[3],
      unidade: c[4],
      qtdeSaida: parseBR(c[6]),
      qtdeDevolvida: parseBR(c[7]),
      vlTotal: parseBR(c[8]),
      codEstoque: c[9] || '', estoque: c[10] || '',
    });
  }
  return result;
}

function parseMov3830(text: string): MovEstoqueItem[] {
  const lines = text.split(/\r?\n/);
  const result: MovEstoqueItem[] = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const c = parseSemiLine(lines[i]);
    if (c[2] && (c[2].includes('Estoque')) && c[7] && c[7].includes('Saida')) {
      headerIdx = i; break;
    }
    if (c[1] && c[1].includes('Cód') && c[7]) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return result;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = parseSemiLine(line);
    if (!c[1] || !c[2]) continue;
    result.push({
      codEmpresa: c[0], codEstoque: c[1], estoque: c[2],
      codSetor: c[3], setor: c[4],
      devolucao: parseBR(c[6]),
      saida: parseBR(c[7]),
      total: parseBR(c[8]),
    });
  }
  return result;
}

function parseHorarios3189(text: string): SolicitacaoHorarioItem[] {
  const lines = text.split(/\r?\n/);
  const result: SolicitacaoHorarioItem[] = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const c = parseSemiLine(lines[i]);
    if (c[0] && (c[0].includes('Tipo') || c[0].includes('tipo')) && c[1] && c[1].includes('00')) {
      headerIdx = i; break;
    }
    if (c[1] && c[1].includes('00:00')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return result;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = parseSemiLine(line);
    if (!c[0] || !c[0].trim()) continue;
    result.push({
      tipo: c[0].trim(),
      h0006: parseBR(c[1]), h0612: parseBR(c[2]),
      h1218: parseBR(c[3]), h1824: parseBR(c[4]),
      total: parseBR(c[5]),
    });
  }
  return result;
}

function parseAcuradidade(text: string): AcuradidadeItem[] {
  const lines = text.split(/\r?\n/);
  const result: AcuradidadeItem[] = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const c = parseSemiLine(lines[i]);
    if (c[0] && c[0].includes('DESCRICAO_TIPO')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) return result;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const c = parseSemiLine(line);
    if (!c[0] || !c[0].trim()) continue;
    result.push({
      descTipoSol: c[0].trim(),
      descSituacao: c[1].trim(),
      qtSolicitado: parseBR(c[2]),
      qtAtendida: parseBR(c[3]),
      alcancado: parseBR(c[4]),
    });
  }
  return result;
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: 'red' | 'emerald' | 'amber' | 'violet' | 'blue' | 'slate';
}
const KpiCard: React.FC<KpiCardProps> = ({ icon, label, value, sub, color }) => {
  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
    slate: 'bg-slate-50 text-slate-500',
  };
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-start gap-3">
      <div className={`rounded-lg p-2 flex-shrink-0 ${colorMap[color]}`}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className="text-lg font-bold text-gray-800 leading-tight">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
};

interface PagerProps { page: number; total: number; onPrev: () => void; onNext: () => void; }
const Pager: React.FC<PagerProps> = ({ page, total, onPrev, onNext }) => (
  <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100 text-xs text-gray-500">
    <span>Página {page} de {total}</span>
    <div className="flex gap-1">
      <button onClick={onPrev} disabled={page === 1} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
        <ChevronLeft className="w-4 h-4" />
      </button>
      <button onClick={onNext} disabled={page === total} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);

interface UploadZoneProps {
  label: string;
  loaded: boolean;
  onFiles: (files: FileList) => void;
  icon: React.ReactNode;
  accent: string;
  hint?: string;
}
const UploadZone: React.FC<UploadZoneProps> = ({ label, loaded, onFiles, icon, accent, hint }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setHover(false);
    if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
  };
  return (
    <div
      className={`relative rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all text-center
        ${loaded ? 'border-emerald-400 bg-emerald-50' : hover ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setHover(true); }}
      onDragLeave={() => setHover(false)}
      onDrop={handleDrop}
    >
      <input ref={inputRef} type="file" accept=".csv,.CSV" className="hidden"
        onChange={e => e.target.files && onFiles(e.target.files)} />
      {loaded
        ? <CheckCircle className="w-6 h-6 text-emerald-500 mx-auto mb-1" />
        : <div className={`mx-auto mb-1 w-6 h-6 ${accent}`}>{icon}</div>
      }
      <p className={`text-xs font-medium ${loaded ? 'text-emerald-700' : 'text-gray-600'}`}>{label}</p>
      {hint && !loaded && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
      {loaded && <p className="text-[10px] text-emerald-500 mt-0.5">Carregado ✓</p>}
    </div>
  );
};

const ChartCard: React.FC<{ title: string; children: React.ReactNode; className?: string }> = ({ title, children, className = '' }) => (
  <div className={`bg-white rounded-xl p-4 shadow-sm border border-gray-100 ${className}`}>
    <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
    {children}
  </div>
);

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export const PerdasInventario: React.FC = () => {
  // DATA
  const [perdaMesData, setPerdaMesData] = useState<PerdaMesItem[]>([]);
  const [perdaTipoData, setPerdaTipoData] = useState<PerdaTipoItem[]>([]);
  const [top10PerdaData, setTop10PerdaData] = useState<Top10PerdaItem[]>([]);
  const [difEstoqueData, setDifEstoqueData] = useState<DifEstoqueItem[]>([]);
  const [difProdutoData, setDifProdutoData] = useState<DifProdutoItem[]>([]);
  const [devProdutoData, setDevProdutoData] = useState<DevProdutoItem[]>([]);
  const [saidas3012Data, setSaidas3012Data] = useState<SaidaEstoqueItem[]>([]);
  const [mov3830Data, setMov3830Data] = useState<MovEstoqueItem[]>([]);
  const [horarios3189Data, setHorarios3189Data] = useState<SolicitacaoHorarioItem[]>([]);
  const [acuradidadeData, setAcuradidadeData] = useState<AcuradidadeItem[]>([]);

  const [filesLoaded, setFilesLoaded] = useState<FilesLoaded>({
    perdaMes: false, perdaTipo: false, top10Perda: false,
    difEstoque: false, difProduto: false, devProduto: false,
    saidas3012: false, mov3830: false, horarios3189: false,
    acuradidade: false,
  });

  // UI
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('resumo');
  const [showUpload, setShowUpload] = useState(false);
  const [searchDif, setSearchDif] = useState('');
  const [difFilter, setDifFilter] = useState<'ALL' | 'POS' | 'NEG'>('ALL');
  const [pageDif, setPageDif] = useState(1);

  // AI
  const [aiInsight, setAiInsight] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiExpanded, setAiExpanded] = useState(false);
  const dashboardRef = useRef<HTMLDivElement>(null);

  const hasData = Object.values(filesLoaded).some(Boolean);

  // ─── FILE READERS ──────────────────────────────────────────────────────────
  const readFileISO = useCallback((file: File): Promise<string> =>
    new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve((e.target?.result as string) || '');
      r.readAsText(file, 'ISO-8859-1');
    }), []);

  const readFileUTF8 = useCallback((file: File): Promise<string> =>
    new Promise(resolve => {
      const r = new FileReader();
      r.onload = e => resolve((e.target?.result as string) || '');
      r.readAsText(file, 'UTF-8');
    }), []);

  // ─── UPLOAD HANDLERS ───────────────────────────────────────────────────────
  const handlePerdaMes = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setPerdaMesData(parsePerdaMes(text));
    setFilesLoaded(p => ({ ...p, perdaMes: true }));
  }, [readFileUTF8]);

  const handlePerdaTipo = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setPerdaTipoData(parsePerdaTipo(text));
    setFilesLoaded(p => ({ ...p, perdaTipo: true }));
  }, [readFileUTF8]);

  const handleTop10Perda = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setTop10PerdaData(parseTop10Perda(text));
    setFilesLoaded(p => ({ ...p, top10Perda: true }));
  }, [readFileUTF8]);

  const handleDifEstoque = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setDifEstoqueData(parseDifEstoque(text));
    setFilesLoaded(p => ({ ...p, difEstoque: true }));
  }, [readFileUTF8]);

  const handleDifProduto = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setDifProdutoData(parseDifProduto(text));
    setFilesLoaded(p => ({ ...p, difProduto: true }));
  }, [readFileUTF8]);

  const handleDevProduto = useCallback(async (files: FileList) => {
    const text = await readFileUTF8(files[0]);
    setDevProdutoData(parseDevProduto(text));
    setFilesLoaded(p => ({ ...p, devProduto: true }));
  }, [readFileUTF8]);

  const handleSaidas3012 = useCallback(async (files: FileList) => {
    const text = await readFileISO(files[0]);
    setSaidas3012Data(parseSaidas3012(text));
    setFilesLoaded(p => ({ ...p, saidas3012: true }));
  }, [readFileISO]);

  const handleMov3830 = useCallback(async (files: FileList) => {
    const text = await readFileISO(files[0]);
    setMov3830Data(parseMov3830(text));
    setFilesLoaded(p => ({ ...p, mov3830: true }));
  }, [readFileISO]);

  const handleHorarios3189 = useCallback(async (files: FileList) => {
    const text = await readFileISO(files[0]);
    setHorarios3189Data(parseHorarios3189(text));
    setFilesLoaded(p => ({ ...p, horarios3189: true }));
  }, [readFileISO]);

  const handleAcuradidade = useCallback(async (files: FileList) => {
    const text = await readFileISO(files[0]);
    setAcuradidadeData(parseAcuradidade(text));
    setFilesLoaded(p => ({ ...p, acuradidade: true }));
  }, [readFileISO]);

  // ─── KPIS ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalPerdas = perdaMesData.reduce((s, i) => s + i.perda, 0);
    const mediaPerdaMes = perdaMesData.length ? totalPerdas / perdaMesData.length : 0;
    const maiorPerdaMes = perdaMesData.length ? Math.max(...perdaMesData.map(i => i.perda)) : 0;
    const maiorMes = perdaMesData.find(i => i.perda === maiorPerdaMes)?.mes || '-';

    const tipo0 = perdaTipoData[0];
    const vlEstoqueGeral = tipo0?.vlEstoqueGeral ?? 0;
    const pctPerdaRaw = (tipo0?.pctPerda ?? '').replace('%', '').trim();
    const pctPerdaEstoque = parseBR(pctPerdaRaw);
    const perdaEstabilidade = perdaTipoData.reduce((s, i) => s + i.estabilidade, 0);
    const perdaQuebraAvaria = perdaTipoData.reduce((s, i) => s + i.quebraAvaria, 0);
    const perdaValidade = perdaTipoData.reduce((s, i) => s + i.validade, 0);
    const perdaOutros = perdaTipoData.reduce((s, i) => s + i.outros, 0);
    const tiposPerda = { Estabilidade: perdaEstabilidade, 'Quebra/Avaria': perdaQuebraAvaria, Validade: perdaValidade, Outros: perdaOutros };
    const topLossReason = Object.entries(tiposPerda).reduce((a, b) => b[1] > a[1] ? b : a, ['—', 0] as [string, number])[0];

    const difInvPositiva = difEstoqueData.filter(i => i.vlDif >= 0).reduce((s, i) => s + i.vlDif, 0);
    const difInvNegativa = difEstoqueData.filter(i => i.vlDif < 0).reduce((s, i) => s + i.vlDif, 0);
    const difInvTotal = difEstoqueData.reduce((s, i) => s + Math.abs(i.vlDif), 0);
    const locMaiorDif = difEstoqueData[0]?.localEstoque || '-';

    const totalSaidas = saidas3012Data.reduce((s, i) => s + i.qtdeSaida, 0);
    const totalDev3012 = saidas3012Data.reduce((s, i) => s + i.qtdeDevolvida, 0);
    const taxaDevolucao = totalSaidas > 0 ? (totalDev3012 / totalSaidas) * 100 : 0;
    const vlTotalSaidas = saidas3012Data.reduce((s, i) => s + i.vlTotal, 0);

    const horHoras = [
      horarios3189Data.reduce((s, i) => s + i.h0006, 0),
      horarios3189Data.reduce((s, i) => s + i.h0612, 0),
      horarios3189Data.reduce((s, i) => s + i.h1218, 0),
      horarios3189Data.reduce((s, i) => s + i.h1824, 0),
    ];
    const peakIdx = horHoras.indexOf(Math.max(...horHoras));
    const peakLabels = ['00h–06h', '06h–12h', '12h–18h', '18h–24h'];
    const peakHorario = horHoras[peakIdx] > 0 ? peakLabels[peakIdx] : '-';

    const acuValidas = acuradidadeData.filter(i => i.alcancado > 0);
    const avgAlcancado = acuValidas.length
      ? acuValidas.reduce((s, i) => s + i.alcancado, 0) / acuValidas.length * 100
      : 0;
    const tiposUnicos = [...new Set(acuradidadeData.map(i => i.descTipoSol))];
    const tiposAbaixo70 = tiposUnicos.filter(t => {
      const rows = acuradidadeData.filter(i => i.descTipoSol === t && i.alcancado > 0);
      if (!rows.length) return false;
      return rows.reduce((s, r) => s + r.alcancado, 0) / rows.length < 0.70;
    }).length;

    return {
      totalPerdas, mediaPerdaMes, maiorPerdaMes, maiorMes,
      vlEstoqueGeral, pctPerdaEstoque,
      perdaEstabilidade, perdaQuebraAvaria, perdaValidade, perdaOutros, topLossReason,
      difInvTotal, difInvPositiva, difInvNegativa, locMaiorDif,
      totalSaidas, totalDev3012, taxaDevolucao, vlTotalSaidas,
      peakHorario, avgAlcancado, tiposAbaixo70,
    };
  }, [perdaMesData, perdaTipoData, difEstoqueData, saidas3012Data, horarios3189Data, acuradidadeData]);

  // ─── CHART DATA ────────────────────────────────────────────────────────────
  const perdaTipoChartData = useMemo(() => perdaTipoData.map(r => ({
    periodo: r.periodo,
    Estabilidade: r.estabilidade,
    'Quebra/Avaria': r.quebraAvaria,
    Validade: r.validade,
    Outros: r.outros,
  })), [perdaTipoData]);

  const saidasByEstoque = useMemo(() => {
    const map = new Map<string, { totalSaidas: number; totalDev: number }>();
    for (const row of saidas3012Data) {
      const key = row.estoque || row.codEstoque || '—';
      const cur = map.get(key) ?? { totalSaidas: 0, totalDev: 0 };
      map.set(key, { totalSaidas: cur.totalSaidas + row.qtdeSaida, totalDev: cur.totalDev + row.qtdeDevolvida });
    }
    return [...map.entries()]
      .map(([estoque, v]) => ({ estoque, ...v }))
      .sort((a, b) => b.totalSaidas - a.totalSaidas)
      .slice(0, 15);
  }, [saidas3012Data]);

  const mov3830ByEstoque = useMemo(() => {
    const map = new Map<string, { saida: number; devolucao: number }>();
    for (const row of mov3830Data) {
      const key = row.estoque || row.codEstoque || '—';
      const cur = map.get(key) ?? { saida: 0, devolucao: 0 };
      map.set(key, { saida: cur.saida + row.saida, devolucao: cur.devolucao + row.devolucao });
    }
    return [...map.entries()]
      .map(([estoque, v]) => ({ estoque, ...v }))
      .sort((a, b) => b.saida - a.saida)
      .slice(0, 12);
  }, [mov3830Data]);

  const acuByTipo = useMemo(() => {
    const tipos = [...new Set(acuradidadeData.map(i => i.descTipoSol))];
    return tipos.map(t => {
      const rows = acuradidadeData.filter(i => i.descTipoSol === t);
      const validas = rows.filter(r => r.alcancado > 0);
      const media = validas.length ? validas.reduce((s, r) => s + r.alcancado, 0) / validas.length : 0;
      const totalSol = rows.reduce((s, r) => s + r.qtSolicitado, 0);
      const totalAt = rows.reduce((s, r) => s + r.qtAtendida, 0);
      return { tipo: t, media, totalSol, totalAt, rows };
    });
  }, [acuradidadeData]);

  // ─── FILTERED TABLE ────────────────────────────────────────────────────────
  const filteredDifProduto = useMemo(() => {
    let data = difProdutoData;
    if (difFilter === 'POS') data = data.filter(i => i.vlDif >= 0);
    else if (difFilter === 'NEG') data = data.filter(i => i.vlDif < 0);
    if (searchDif) {
      const q = searchDif.toLowerCase();
      data = data.filter(i => i.descProduto.toLowerCase().includes(q) || i.codProduto.includes(q));
    }
    return data;
  }, [difProdutoData, difFilter, searchDif]);

  const totalPagesDif = Math.max(1, Math.ceil(filteredDifProduto.length / PAGE_SIZE));
  const pagedDifProduto = filteredDifProduto.slice((pageDif - 1) * PAGE_SIZE, pageDif * PAGE_SIZE);

  useEffect(() => { setPageDif(1); }, [searchDif, difFilter]);

  // ─── AI ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!(window as any).__html2canvasLoaded) {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.onload = () => { (window as any).__html2canvasLoaded = true; };
      document.head.appendChild(s);
    }
    const style = document.createElement('style');
    style.textContent = `@keyframes pi-pulse{0%,100%{opacity:1;}50%{opacity:.5;}}`;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  const handleAiAnalysis = async () => {
    setIsAnalyzing(true); setAiExpanded(true);
    try {
      const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY || '' });
      const prompt = `Você é um farmacêutico hospitalar sênior analisando indicadores operacionais de estoque.

=== PERDAS ===
Total de perdas: ${fmtBRL(kpis.totalPerdas)}
Estoque geral: ${fmtBRL(kpis.vlEstoqueGeral)}
% Perda x Estoque: ${fmtNum(kpis.pctPerdaEstoque, 2)}%
Principal causa: ${kpis.topLossReason}
Por tipo — Estabilidade: ${fmtBRL(kpis.perdaEstabilidade)} | Quebra/Avaria: ${fmtBRL(kpis.perdaQuebraAvaria)} | Validade: ${fmtBRL(kpis.perdaValidade)} | Outros: ${fmtBRL(kpis.perdaOutros)}
Mês de maior perda: ${kpis.maiorMes} (${fmtBRL(kpis.maiorPerdaMes)})

=== TOP 10 PRODUTOS COM MAIOR PERDA ===
${top10PerdaData.slice(0, 5).map((t, i) => `${i + 1}. ${t.produto}: ${fmtBRL(t.perda)}`).join('\n')}

=== INVENTÁRIO ===
Diferença total (valor absoluto): ${fmtBRL(kpis.difInvTotal)}
Diferença positiva: ${fmtBRL(kpis.difInvPositiva)}
Diferença negativa: ${fmtBRL(kpis.difInvNegativa)}
Local com maior impacto: ${kpis.locMaiorDif}

=== MOVIMENTAÇÃO ===
Total de saídas: ${fmtNum(kpis.totalSaidas)}
Taxa de devolução: ${fmtNum(kpis.taxaDevolucao, 1)}%
Valor total de saídas: ${fmtBRL(kpis.vlTotalSaidas)}
Horário de pico: ${kpis.peakHorario}

=== ACURACIDADE DE ATENDIMENTO ===
Média geral: ${fmtNum(kpis.avgAlcancado, 1)}%
Tipos abaixo de 70%: ${kpis.tiposAbaixo70}
${acuByTipo.slice(0, 3).map(t => `${t.tipo}: ${fmtNum(t.media * 100, 1)}%`).join(' | ')}

Com base nesses dados, forneça 5 pontos de ação priorizados para o gestor de farmácia hospitalar. Seja direto e prático. Use linguagem técnica brasileira.`;

      const res = await ai.models.generateContent({ model: 'gemini-2.0-flash', contents: prompt });
      setAiInsight(res.text || 'Sem resposta.');
    } catch (err) {
      setAiInsight('Erro ao gerar análise. Verifique a chave de API.');
    }
    setIsAnalyzing(false);
  };

  // ─── UPLOAD SCREEN ─────────────────────────────────────────────────────────
  if (!hasData || showUpload) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-emerald-100 rounded-xl p-2.5">
              <TrendingDown className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Perdas & Inventário</h1>
              <p className="text-sm text-gray-500">Carregue os CSVs do sistema para gerar os indicadores</p>
            </div>
            {hasData && (
              <button onClick={() => setShowUpload(false)}
                className="ml-auto text-sm text-emerald-600 hover:text-emerald-800 font-medium flex items-center gap-1">
                <X className="w-4 h-4" /> Fechar
              </button>
            )}
          </div>

          {/* Grupo 1: Perdas */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" /> Perdas
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <UploadZone label="Perdas por Mês" loaded={filesLoaded.perdaMes} onFiles={handlePerdaMes}
                icon={<TrendingDown className="w-6 h-6" />} accent="text-red-500"
                hint="Valor de perdas por mês.csv" />
              <UploadZone label="Perdas por Tipo" loaded={filesLoaded.perdaTipo} onFiles={handlePerdaTipo}
                icon={<BarChart2 className="w-6 h-6" />} accent="text-orange-500"
                hint="Valor de perdas por tipo.csv" />
              <UploadZone label="Top 10 por Produto" loaded={filesLoaded.top10Perda} onFiles={handleTop10Perda}
                icon={<Package className="w-6 h-6" />} accent="text-red-600"
                hint="Top 10 perda por produto.csv" />
              <UploadZone label="Outros Motivos" loaded={filesLoaded.difEstoque && false /* placeholder */} onFiles={() => {}}
                icon={<FileText className="w-6 h-6" />} accent="text-slate-400"
                hint="data.csv (opcional)" />
            </div>
          </div>

          {/* Grupo 2: Inventário */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Database className="w-4 h-4 text-violet-400" /> Inventário
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <UploadZone label="Diferença por Estoque" loaded={filesLoaded.difEstoque} onFiles={handleDifEstoque}
                icon={<Database className="w-6 h-6" />} accent="text-violet-500"
                hint="Diferença por Estoque.csv" />
              <UploadZone label="Diferença por Produto" loaded={filesLoaded.difProduto} onFiles={handleDifProduto}
                icon={<Search className="w-6 h-6" />} accent="text-purple-500"
                hint="Valor de diferencia por produto.csv" />
              <UploadZone label="Taxa de Devolução" loaded={filesLoaded.devProduto} onFiles={handleDevProduto}
                icon={<RefreshCw className="w-6 h-6" />} accent="text-cyan-500"
                hint="data (1).csv" />
            </div>
          </div>

          {/* Grupo 3: Movimentação */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Movimentação
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <UploadZone label="Saídas e Devoluções" loaded={filesLoaded.saidas3012} onFiles={handleSaidas3012}
                icon={<Activity className="w-6 h-6" />} accent="text-blue-500"
                hint="3012___Saidas_e_Devolucoes.CSV" />
              <UploadZone label="Estatística Movimentação" loaded={filesLoaded.mov3830} onFiles={handleMov3830}
                icon={<Layers className="w-6 h-6" />} accent="text-emerald-500"
                hint="3830___Estatistica_movimentacao.CSV" />
              <UploadZone label="Horários por Solicitação" loaded={filesLoaded.horarios3189} onFiles={handleHorarios3189}
                icon={<Clock className="w-6 h-6" />} accent="text-amber-500"
                hint="3189___Quantidade_de_Solicitacoes.CSV" />
            </div>
          </div>

          {/* Grupo 4: Atendimento */}
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Atendimento
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <UploadZone label="Acuracidade de Atendimento" loaded={filesLoaded.acuradidade} onFiles={handleAcuradidade}
                icon={<ShieldCheck className="w-6 h-6" />} accent="text-emerald-500"
                hint="Acuradidade do atendimento.CSV" />
            </div>
          </div>

          {hasData && (
            <div className="text-center mt-4">
              <button onClick={() => setShowUpload(false)}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-emerald-700 transition">
                Ver Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ─────────────────────────────────────────────────────────────
  const subTabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'resumo', label: 'Resumo', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'perdas', label: 'Perdas', icon: <TrendingDown className="w-4 h-4" /> },
    { id: 'inventario', label: 'Inventário', icon: <Database className="w-4 h-4" /> },
    { id: 'movimentacao', label: 'Movimentação', icon: <Activity className="w-4 h-4" /> },
    { id: 'atendimento', label: 'Atendimento', icon: <ShieldCheck className="w-4 h-4" /> },
  ];

  return (
    <div ref={dashboardRef} className="space-y-4 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 rounded-xl p-2.5">
            <TrendingDown className="w-6 h-6 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Perdas & Inventário</h1>
            <p className="text-xs text-gray-500">
              {Object.values(filesLoaded).filter(Boolean).length} de 10 arquivos carregados
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handleAiAnalysis} disabled={isAnalyzing}
            className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white px-3 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition disabled:opacity-60">
            <Brain className="w-4 h-4" />
            {isAnalyzing ? 'Analisando...' : 'Análise IA'}
          </button>
          <button onClick={() => setShowUpload(true)}
            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-2 rounded-xl text-sm font-medium hover:bg-emerald-100 transition">
            <Upload className="w-4 h-4" /> Arquivos
          </button>
        </div>
      </div>

      {/* AI Card */}
      {(aiInsight || isAnalyzing) && (
        <div className="bg-gradient-to-r from-indigo-600 to-violet-700 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              <span className="font-semibold text-sm">Análise Farmacêutica — IA</span>
            </div>
            <button onClick={() => setAiExpanded(!aiExpanded)} className="text-white/70 hover:text-white text-xs">
              {aiExpanded ? 'Recolher' : 'Expandir'}
            </button>
          </div>
          {isAnalyzing && (
            <div className="space-y-2">
              {[80, 60, 70].map((w, i) => (
                <div key={i} className="h-3 bg-white/20 rounded-full" style={{ width: `${w}%`, animation: 'pi-pulse 1.5s ease-in-out infinite' }} />
              ))}
            </div>
          )}
          {!isAnalyzing && aiExpanded && (
            <p className="text-sm text-white/90 whitespace-pre-wrap leading-relaxed">{aiInsight}</p>
          )}
        </div>
      )}

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 overflow-x-auto">
        {subTabs.map(t => (
          <button key={t.id} onClick={() => setActiveSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition whitespace-nowrap
              ${activeSubTab === t.id
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── RESUMO ─────────────────────────────────────────────────────────── */}
      {activeSubTab === 'resumo' && (
        <div className="space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Perdas</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<TrendingDown className="w-5 h-5" />} label="Total Perdas" value={fmtBRL(kpis.totalPerdas)} sub={`Média: ${fmtBRL(kpis.mediaPerdaMes)}/mês`} color="red" />
            <KpiCard icon={<BarChart2 className="w-5 h-5" />} label="% Perda x Estoque" value={`${fmtNum(kpis.pctPerdaEstoque, 2)}%`} sub={`Estoque: ${fmtBRL(kpis.vlEstoqueGeral)}`} color="amber" />
            <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Principal Causa" value={kpis.topLossReason} color="red" />
            <KpiCard icon={<Package className="w-5 h-5" />} label="Maior Perda Mensal" value={fmtBRL(kpis.maiorPerdaMes)} sub={kpis.maiorMes} color="amber" />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">Inventário</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<Database className="w-5 h-5" />} label="Dif. Total (absoluta)" value={fmtBRL(kpis.difInvTotal)} color="violet" />
            <KpiCard icon={<CheckCircle className="w-5 h-5" />} label="Dif. Positiva" value={fmtBRL(kpis.difInvPositiva)} color="emerald" />
            <KpiCard icon={<AlertCircle className="w-5 h-5" />} label="Dif. Negativa" value={fmtBRL(kpis.difInvNegativa)} color="red" />
            <KpiCard icon={<Search className="w-5 h-5" />} label="Local Maior Impacto" value={kpis.locMaiorDif} color="violet" />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-2">Movimentação & Atendimento</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard icon={<Activity className="w-5 h-5" />} label="Total Saídas" value={fmtNum(kpis.totalSaidas)} sub={`Valor: ${fmtBRL(kpis.vlTotalSaidas)}`} color="blue" />
            <KpiCard icon={<RefreshCw className="w-5 h-5" />} label="Taxa de Devolução" value={`${fmtNum(kpis.taxaDevolucao, 1)}%`} color="emerald" />
            <KpiCard icon={<Clock className="w-5 h-5" />} label="Horário de Pico" value={kpis.peakHorario} color="amber" />
            <KpiCard icon={<ShieldCheck className="w-5 h-5" />} label="Acuracidade Média" value={`${fmtNum(kpis.avgAlcancado, 1)}%`} sub={`${kpis.tiposAbaixo70} tipos abaixo de 70%`} color={kpis.avgAlcancado >= 90 ? 'emerald' : kpis.avgAlcancado >= 70 ? 'amber' : 'red'} />
          </div>
        </div>
      )}

      {/* ── PERDAS ─────────────────────────────────────────────────────────── */}
      {activeSubTab === 'perdas' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filesLoaded.perdaMes && (
              <ChartCard title="Perdas por Mês (R$)">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={perdaMesData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Perda']} />
                    <Bar dataKey="perda" fill="#ef4444" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}

            {filesLoaded.perdaTipo && perdaTipoChartData.length > 0 && (
              <ChartCard title="Perdas por Tipo">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={perdaTipoChartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Estabilidade" stackId="a" fill="#8b5cf6" />
                    <Bar dataKey="Quebra/Avaria" stackId="a" fill="#f97316" />
                    <Bar dataKey="Validade" stackId="a" fill="#ef4444" />
                    <Bar dataKey="Outros" stackId="a" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            )}
          </div>

          {filesLoaded.top10Perda && top10PerdaData.length > 0 && (
            <ChartCard title="Top 10 Produtos — Maior Perda">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={top10PerdaData} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 200 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="produto" width={195} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtBRL(v), 'Perda']} />
                  <Bar dataKey="perda" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Tabela de tipos */}
          {filesLoaded.perdaTipo && perdaTipoData.length > 0 && (
            <ChartCard title="Detalhamento por Tipo de Perda">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-2 text-gray-500 font-medium">Período</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Estabilidade</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Quebra/Avaria</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Validade</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Outros</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">Total</th>
                      <th className="text-right py-2 px-2 text-gray-500 font-medium">% Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perdaTipoData.map((r, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2 px-2 font-medium text-gray-700">{r.periodo}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(r.estabilidade)}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(r.quebraAvaria)}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(r.validade)}</td>
                        <td className="py-2 px-2 text-right text-gray-600">{fmtBRL(r.outros)}</td>
                        <td className="py-2 px-2 text-right font-semibold text-red-600">{fmtBRL(r.total)}</td>
                        <td className="py-2 px-2 text-right text-amber-600">{r.pctPerda}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {!filesLoaded.perdaMes && !filesLoaded.perdaTipo && !filesLoaded.top10Perda && (
            <div className="text-center py-12 text-gray-400">
              <TrendingDown className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Carregue os arquivos de perdas para visualizar os dados.</p>
              <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-emerald-600 underline">Carregar arquivos</button>
            </div>
          )}
        </div>
      )}

      {/* ── INVENTÁRIO ────────────────────────────────────────────────────── */}
      {activeSubTab === 'inventario' && (
        <div className="space-y-4">
          {filesLoaded.difEstoque && difEstoqueData.length > 0 && (
            <ChartCard title="Diferença de Inventário por Local de Estoque">
              <ResponsiveContainer width="100%" height={Math.max(260, difEstoqueData.length * 30)}>
                <BarChart data={difEstoqueData} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 220 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="localEstoque" width={215} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [fmtBRL(v), 'Diferença']} />
                  <ReferenceLine x={0} stroke="#94a3b8" />
                  <Bar dataKey="vlDif" radius={[0, 4, 4, 0]}>
                    {difEstoqueData.map((entry, i) => (
                      <Cell key={i} fill={entry.vlDif >= 0 ? '#10b981' : '#ef4444'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {filesLoaded.difProduto && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="p-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Diferença por Produto ({fmtNum(filteredDifProduto.length)} registros)</h3>
                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-40">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input value={searchDif} onChange={e => setSearchDif(e.target.value)}
                      placeholder="Buscar produto..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-400" />
                  </div>
                  {(['ALL', 'POS', 'NEG'] as const).map(f => (
                    <button key={f} onClick={() => setDifFilter(f)}
                      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition
                        ${difFilter === f
                          ? f === 'POS' ? 'bg-emerald-100 text-emerald-700' : f === 'NEG' ? 'bg-red-100 text-red-700' : 'bg-gray-200 text-gray-700'
                          : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                      {f === 'ALL' ? 'Todos' : f === 'POS' ? '▲ Positivo' : '▼ Negativo'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Cód.</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Produto</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Vl. Entrada</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Vl. Saída</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedDifProduto.map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-3 text-gray-400">{row.codProduto}</td>
                        <td className="py-1.5 px-3 text-gray-700 max-w-xs truncate">{row.descProduto}</td>
                        <td className="py-1.5 px-3 text-right text-gray-500">{fmtBRL(row.vlEntrada)}</td>
                        <td className="py-1.5 px-3 text-right text-gray-500">{fmtBRL(row.vlSaida)}</td>
                        <td className={`py-1.5 px-3 text-right font-semibold ${row.vlDif >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {fmtBRL(row.vlDif)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPagesDif > 1 && (
                <Pager page={pageDif} total={totalPagesDif}
                  onPrev={() => setPageDif(p => Math.max(1, p - 1))}
                  onNext={() => setPageDif(p => Math.min(totalPagesDif, p + 1))} />
              )}
            </div>
          )}

          {!filesLoaded.difEstoque && !filesLoaded.difProduto && (
            <div className="text-center py-12 text-gray-400">
              <Database className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Carregue os arquivos de inventário para visualizar os dados.</p>
              <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-emerald-600 underline">Carregar arquivos</button>
            </div>
          )}
        </div>
      )}

      {/* ── MOVIMENTAÇÃO ─────────────────────────────────────────────────── */}
      {activeSubTab === 'movimentacao' && (
        <div className="space-y-4">
          {filesLoaded.saidas3012 && saidasByEstoque.length > 0 && (
            <ChartCard title="Saídas vs Devoluções por Local de Estoque (Top 15)">
              <ResponsiveContainer width="100%" height={Math.max(300, saidasByEstoque.length * 28)}>
                <BarChart data={saidasByEstoque} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 220 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="estoque" width={215} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number, name: string) => [fmtNum(v), name === 'totalSaidas' ? 'Saídas' : 'Devoluções']} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}
                    formatter={v => v === 'totalSaidas' ? 'Saídas' : 'Devoluções'} />
                  <Bar dataKey="totalSaidas" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="totalDev" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {filesLoaded.mov3830 && mov3830ByEstoque.length > 0 && (
            <ChartCard title="Movimentação por Estoque — Estatística (3830)">
              <ResponsiveContainer width="100%" height={Math.max(260, mov3830ByEstoque.length * 28)}>
                <BarChart data={mov3830ByEstoque} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 220 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtNum(v)} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="estoque" width={215} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number, name: string) => [fmtNum(v), name === 'saida' ? 'Saídas' : 'Devoluções']} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }}
                    formatter={v => v === 'saida' ? 'Saídas' : 'Devoluções'} />
                  <Bar dataKey="saida" fill="#6366f1" radius={[0, 3, 3, 0]} />
                  <Bar dataKey="devolucao" fill="#10b981" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {filesLoaded.horarios3189 && horarios3189Data.length > 0 && (
            <ChartCard title="Solicitações por Faixa Horária e Tipo">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={horarios3189Data} margin={{ top: 4, right: 8, bottom: 60, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="tipo" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="h0006" name="00h–06h" fill="#6366f1" stackId="h" />
                  <Bar dataKey="h0612" name="06h–12h" fill="#f59e0b" stackId="h" />
                  <Bar dataKey="h1218" name="12h–18h" fill="#10b981" stackId="h" />
                  <Bar dataKey="h1824" name="18h–24h" fill="#ef4444" stackId="h" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {filesLoaded.devProduto && devProdutoData.length > 0 && (
            <ChartCard title={`Taxa de Devolução por Produto (${fmtNum(devProdutoData.length)} itens)`}>
              <div className="overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Produto</th>
                      <th className="text-left py-2 px-3 text-gray-500 font-medium">Local</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Devolvida</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">Movimentada</th>
                      <th className="text-right py-2 px-3 text-gray-500 font-medium">% Dev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devProdutoData.slice(0, 50).map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-1.5 px-3 text-gray-700 max-w-xs truncate">{row.descProduto}</td>
                        <td className="py-1.5 px-3 text-gray-500 truncate max-w-[120px]">{row.localEstoque}</td>
                        <td className="py-1.5 px-3 text-right text-gray-600">{fmtNum(row.qtdDevolvida)}</td>
                        <td className="py-1.5 px-3 text-right text-gray-600">{fmtNum(row.qtdMovimentada)}</td>
                        <td className={`py-1.5 px-3 text-right font-medium ${row.pctDev >= 80 ? 'text-emerald-600' : row.pctDev >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                          {fmtNum(row.pctDev, 1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          )}

          {!filesLoaded.saidas3012 && !filesLoaded.mov3830 && !filesLoaded.horarios3189 && (
            <div className="text-center py-12 text-gray-400">
              <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Carregue os arquivos de movimentação para visualizar os dados.</p>
              <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-emerald-600 underline">Carregar arquivos</button>
            </div>
          )}
        </div>
      )}

      {/* ── ATENDIMENTO ────────────────────────────────────────────────────── */}
      {activeSubTab === 'atendimento' && (
        <div className="space-y-4">
          {filesLoaded.acuradidade && acuradidadeData.length > 0 && (
            <>
              <ChartCard title="Acuracidade de Atendimento por Tipo (%)">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={acuByTipo} margin={{ top: 4, right: 8, bottom: 60, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="tipo" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" />
                    <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Acuracidade']} />
                    <ReferenceLine y={0.95} stroke="#10b981" strokeDasharray="5 5" label={{ value: 'Meta 95%', position: 'right', fontSize: 10, fill: '#10b981' }} />
                    <ReferenceLine y={0.70} stroke="#ef4444" strokeDasharray="5 5" label={{ value: '70%', position: 'right', fontSize: 10, fill: '#ef4444' }} />
                    <Bar dataKey="media" radius={[4, 4, 0, 0]}>
                      {acuByTipo.map((entry, i) => (
                        <Cell key={i} fill={entry.media >= 0.95 ? '#10b981' : entry.media >= 0.80 ? '#f59e0b' : '#ef4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <div className="bg-white rounded-xl shadow-sm border border-gray-100">
                <div className="p-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Detalhamento por Tipo de Solicitação</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left py-2 px-3 text-gray-500 font-medium">Tipo</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">Solicitado</th>
                        <th className="text-right py-2 px-3 text-gray-500 font-medium">Atendido</th>
                        <th className="text-left py-2 px-3 text-gray-500 font-medium min-w-[140px]">% Alcançado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {acuByTipo.map((row, i) => {
                        const pct = row.media * 100;
                        const barColor = pct >= 95 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444';
                        const textColor = pct >= 95 ? 'text-emerald-600' : pct >= 80 ? 'text-amber-600' : 'text-red-600';
                        return (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-2 px-3 font-medium text-gray-700">{row.tipo}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{fmtNum(row.totalSol)}</td>
                            <td className="py-2 px-3 text-right text-gray-500">{fmtNum(row.totalAt)}</td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
                                </div>
                                <span className={`font-semibold w-12 text-right ${textColor}`}>{fmtNum(pct, 1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Detalhamento por situação */}
                <div className="p-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-500 mb-2">Detalhamento por Situação</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Tipo</th>
                          <th className="text-left py-1.5 px-2 text-gray-400 font-medium">Situação</th>
                          <th className="text-right py-1.5 px-2 text-gray-400 font-medium">Qtd Solicitado</th>
                          <th className="text-right py-1.5 px-2 text-gray-400 font-medium">Qtd Atendida</th>
                          <th className="text-right py-1.5 px-2 text-gray-400 font-medium">Alcançado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {acuradidadeData.map((row, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="py-1.5 px-2 text-gray-600">{row.descTipoSol}</td>
                            <td className="py-1.5 px-2 text-gray-500">{row.descSituacao}</td>
                            <td className="py-1.5 px-2 text-right text-gray-500">{fmtNum(row.qtSolicitado)}</td>
                            <td className="py-1.5 px-2 text-right text-gray-500">{fmtNum(row.qtAtendida)}</td>
                            <td className={`py-1.5 px-2 text-right font-medium ${row.alcancado >= 0.95 ? 'text-emerald-600' : row.alcancado >= 0.80 ? 'text-amber-600' : row.alcancado > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                              {row.alcancado > 0 ? `${fmtNum(row.alcancado * 100, 1)}%` : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}

          {!filesLoaded.acuradidade && (
            <div className="text-center py-12 text-gray-400">
              <ShieldCheck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Carregue o arquivo de acuracidade de atendimento.</p>
              <button onClick={() => setShowUpload(true)} className="mt-3 text-xs text-emerald-600 underline">Carregar arquivos</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
