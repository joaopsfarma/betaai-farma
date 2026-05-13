import React, { useState, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  ScatterChart, Scatter, ZAxis,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Treemap, ComposedChart, Line, ReferenceLine,
} from 'recharts';
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Search,
  Download, ChevronRight, ChevronLeft, ArrowUpDown, Scissors, Package,
  ClipboardList, Link2, Loader2, RotateCcw, Filter, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Cirurgia {
  codigo: string;
  descricao: string;
  quantidade: number;
}

interface KitItem {
  codigoProduto: string;
  descricao: string;
  unidade: string;
  qtPadrao: number;
}

interface Kit {
  formulaId: string;
  codigoKit: string;
  nomeKit: string;
  itens: KitItem[];
}

interface EstoqueItem {
  codigoProduto: string;
  descricao: string;
  unidade: string;
  estoqueAtual: number;
}

interface MatchCirurgiaKit {
  cirurgia: Cirurgia;
  kitIndex: number | null;
  kitSedacaoIndex: number | null;
  score: number;
  manual: boolean;
}

interface ProdutoEquiv {
  kitCode: string;
  kitDesc: string;
  estCode: string;
  estDesc: string;
  score: number;
  method: 'codigo' | 'descricao' | 'nenhum';
}

interface DemandaItem {
  codigoProduto: string;
  descricao: string;
  unidade: string;
  demandaTotal: number;
  estoqueAtual: number;
  saldo: number;
  status: 'suficiente' | 'critico' | 'sem_estoque';
  kitsOrigem: string[];
  equivMethod: 'codigo' | 'descricao' | 'nenhum';
  equivEstCode: string;
  equivEstDesc: string;
}

type Step = 'upload' | 'matching' | 'equivalencia' | 'resultado';
type SortField = 'descricao' | 'demandaTotal' | 'estoqueAtual' | 'saldo';
type SortDir = 'asc' | 'desc';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseBrNumber(val: string): number {
  if (!val) return 0;
  const cleaned = val.toString().trim().replace(/\./g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calcMatchScore(cirurgiaDesc: string, kitNome: string): number {
  const normCir = normalizeText(cirurgiaDesc);
  const normKit = normalizeText(kitNome.replace(/^HBR_HAC-KIT\s*/i, '').replace(/^KIT\s*/i, ''));
  if (!normKit || !normCir) return 0;

  const kitWords = normKit.split(' ').filter(w => w.length > 2);
  const cirWords = normCir.split(' ').filter(w => w.length > 2);
  if (kitWords.length === 0) return 0;

  let matchCount = 0;
  for (const kw of kitWords) {
    if (cirWords.some(cw => cw.includes(kw) || kw.includes(cw))) {
      matchCount++;
    }
  }
  return matchCount / kitWords.length;
}

function extractPharmaTokens(desc: string): { principal: string[]; concentracao: string[]; forma: string[] } {
  const norm = normalizeText(desc);

  // Extract active ingredient from parentheses or after last dash
  const parenMatch = desc.match(/\(([^)]+)\)/);
  const principal: string[] = [];
  if (parenMatch) {
    principal.push(...normalizeText(parenMatch[1]).split(/[\s\/]+/).filter(w => w.length > 2));
  }

  // Generic name patterns: after last dash before form, or first word
  const parts = norm.split(/[-\/\s]+/);
  for (const p of parts) {
    if (p.length > 3 && !/^\d/.test(p) && !['AMP', 'COMP', 'UNIDADE', 'FRASC', 'BISN', 'SERINGA', 'BOLSA', 'PREEN', 'ESTERIL', 'DESCART', 'CIRURGICA'].includes(p)) {
      if (!principal.includes(p)) principal.push(p);
    }
  }

  // Concentration: patterns like 1MG/ML, 0.5%, 500MG, 100MCG
  const concMatches = norm.match(/\d+[\.,]?\d*\s*(MG|MCG|UI|ML|G|MG\/ML|MCG\/ML|UI\/ML|MG\/G|%)/g) || [];
  const concentracao = concMatches.map(c => c.replace(/\s+/g, ''));

  // Form: AMP, FR, COMP, BISN, FRASC, UNIDADE, SERINGA, BOLSA
  const formaWords = ['AMP', 'AMPOLA', 'COMP', 'FRASCO', 'FRASC', 'BISN', 'BISNAGA', 'SERINGA', 'BOLSA', 'UNIDADE', 'FA', 'FR'];
  const forma = parts.filter(p => formaWords.some(f => p.startsWith(f)));

  return { principal, concentracao, forma };
}

function calcProdutoDescScore(kitDesc: string, estDesc: string): number {
  const kit = extractPharmaTokens(kitDesc);
  const est = extractPharmaTokens(estDesc);

  if (kit.principal.length === 0 || est.principal.length === 0) return 0;

  // Principal ingredient match (weight: 0.6)
  let principalScore = 0;
  const kitPrincipal = kit.principal.slice(0, 5);
  const estPrincipal = est.principal.slice(0, 5);
  let principalMatches = 0;
  for (const kp of kitPrincipal) {
    if (estPrincipal.some(ep => ep.includes(kp) || kp.includes(ep))) {
      principalMatches++;
    }
  }
  if (kitPrincipal.length > 0) {
    principalScore = principalMatches / Math.max(kitPrincipal.length, 1);
  }

  // Concentration match (weight: 0.25)
  let concScore = 0;
  if (kit.concentracao.length > 0 && est.concentracao.length > 0) {
    const kitConcs = new Set(kit.concentracao);
    const estConcs = new Set(est.concentracao);
    let concMatches = 0;
    for (const kc of kitConcs) {
      if (estConcs.has(kc)) concMatches++;
    }
    concScore = concMatches / Math.max(kitConcs.size, 1);
  } else if (kit.concentracao.length === 0 && est.concentracao.length === 0) {
    concScore = 1; // both are materials without concentration
  }

  // Form match (weight: 0.15)
  let formaScore = 0;
  if (kit.forma.length > 0 && est.forma.length > 0) {
    formaScore = kit.forma.some(kf => est.forma.some(ef => kf === ef || kf.startsWith(ef) || ef.startsWith(kf))) ? 1 : 0;
  } else if (kit.forma.length === 0 && est.forma.length === 0) {
    formaScore = 0.5;
  }

  return principalScore * 0.6 + concScore * 0.25 + formaScore * 0.15;
}

function buildProdutoEquivalencias(kitItems: KitItem[], estoque: EstoqueItem[]): Map<string, ProdutoEquiv> {
  const equivMap = new Map<string, ProdutoEquiv>();
  const estoqueByCode = new Map<string, EstoqueItem>();
  for (const e of estoque) {
    estoqueByCode.set(e.codigoProduto, e);
  }

  const uniqueKitItems = new Map<string, KitItem>();
  for (const item of kitItems) {
    if (!uniqueKitItems.has(item.codigoProduto)) {
      uniqueKitItems.set(item.codigoProduto, item);
    }
  }

  for (const [code, item] of uniqueKitItems) {
    // 1. Exact code match
    if (estoqueByCode.has(code)) {
      const est = estoqueByCode.get(code)!;
      equivMap.set(code, {
        kitCode: code,
        kitDesc: item.descricao,
        estCode: est.codigoProduto,
        estDesc: est.descricao,
        score: 1,
        method: 'codigo',
      });
      continue;
    }

    // 2. Fuzzy description match
    let bestScore = 0;
    let bestEst: EstoqueItem | null = null;
    for (const est of estoque) {
      const score = calcProdutoDescScore(item.descricao, est.descricao);
      if (score > bestScore) {
        bestScore = score;
        bestEst = est;
      }
    }

    if (bestScore >= 0.45 && bestEst) {
      equivMap.set(code, {
        kitCode: code,
        kitDesc: item.descricao,
        estCode: bestEst.codigoProduto,
        estDesc: bestEst.descricao,
        score: bestScore,
        method: 'descricao',
      });
    } else {
      equivMap.set(code, {
        kitCode: code,
        kitDesc: item.descricao,
        estCode: '',
        estDesc: '',
        score: 0,
        method: 'nenhum',
      });
    }
  }

  return equivMap;
}

// ─── CSV Parsers ─────────────────────────────────────────────────────────────

function parseCirurgias(csvText: string): Cirurgia[] {
  const result = Papa.parse(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data as string[][];
  const cirurgias: Cirurgia[] = [];

  for (const row of rows) {
    if (row.length < 10) continue;
    const codeRaw = (row[2] || '').trim();
    const descRaw = (row[5] || '').trim();
    const qtyRaw = (row[9] || '').trim();

    if (!codeRaw || !descRaw || !qtyRaw) continue;
    if (!/^\d{4}$/.test(codeRaw)) continue;
    if (!/^\d+$/.test(qtyRaw)) continue;

    const qty = parseInt(qtyRaw, 10);
    if (qty <= 0) continue;

    cirurgias.push({ codigo: codeRaw, descricao: descRaw, quantidade: qty });
  }

  // Some rows have the code at col[0] and desc at col[1] (shifted format)
  for (const row of rows) {
    if (row.length < 3) continue;
    const codeRaw = (row[0] || '').trim();
    const descRaw = (row[1] || '').trim();

    if (!/^\d{4}$/.test(codeRaw)) continue;
    if (!descRaw || descRaw.startsWith('Centro') || descRaw.startsWith('Cirurgia')) continue;

    const existingCodes = new Set(cirurgias.map(c => c.codigo));
    if (existingCodes.has(codeRaw)) continue;

    // Find quantity - could be at different positions
    let qty = 0;
    for (let i = 2; i < row.length; i++) {
      const v = (row[i] || '').trim();
      if (/^0{2,}\d+$/.test(v)) {
        qty = parseInt(v, 10);
        break;
      }
    }
    if (qty > 0) {
      cirurgias.push({ codigo: codeRaw, descricao: descRaw, quantidade: qty });
    }
  }

  return cirurgias;
}

function parseFormulasKit(csvText: string): Kit[] {
  const result = Papa.parse(csvText, { header: false, skipEmptyLines: false });
  const rows = result.data as string[][];
  const kits: Kit[] = [];
  let currentKit: Kit | null = null;
  let inItens = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const joined = row.join(',');

    // Detect kit header: "Produto:,,,,CODE,,NAME"
    if (joined.includes('Produto:')) {
      let codigoKit = '';
      let nomeKit = '';
      for (let j = 0; j < row.length; j++) {
        const cell = (row[j] || '').trim();
        if (/^\d{4,6}$/.test(cell) && !codigoKit) {
          codigoKit = cell;
        }
        if (cell.startsWith('HBR_') || cell.startsWith('KIT ')) {
          nomeKit = cell;
        }
      }
      if (codigoKit && nomeKit) {
        if (currentKit && currentKit.itens.length > 0) {
          kits.push(currentKit);
        }
        const formulaRow = i > 0 ? rows[i - 2] || rows[i - 1] : row;
        let formulaId = '';
        for (const cell of formulaRow) {
          if (/^\d{1,4}$/.test((cell || '').trim())) {
            formulaId = (cell || '').trim();
            break;
          }
        }
        currentKit = { formulaId, codigoKit, nomeKit, itens: [] };
        inItens = false;
      }
      continue;
    }

    // Detect items section start
    if (joined.includes('Materiais e Medicamentos')) {
      inItens = true;
      continue;
    }

    // Detect Total Itens (end of kit items)
    if (joined.includes('Total Itens:')) {
      if (currentKit && currentKit.itens.length > 0) {
        kits.push(currentKit);
        currentKit = null;
      }
      inItens = false;
      continue;
    }

    if (!currentKit || !inItens) continue;

    // Parse item row - try standard format (code at col 2, desc at col 3)
    let code = '';
    let desc = '';
    let unit = '';
    let qty = 0;

    // Standard layout: code at index 2, desc at 3
    const col2 = (row[2] || '').trim();
    const col3 = (row[3] || '').trim();
    if (/^\d{3,6}$/.test(col2) && col3 && col3.length > 3) {
      code = col2;
      desc = col3;
      // Find unit (usually at col 12 area)
      for (let j = 10; j < Math.min(row.length, 16); j++) {
        const cell = (row[j] || '').trim();
        if (cell && cell.length > 2 && !/^\d/.test(cell) && !cell.includes('Consig')) {
          unit = cell;
          break;
        }
      }
      // Find qty (usually at col 16 area, format "3,0000")
      for (let j = 14; j < row.length; j++) {
        const cell = (row[j] || '').trim();
        if (cell && /^\d/.test(cell) && cell.includes(',')) {
          qty = parseBrNumber(cell);
          break;
        }
      }
    }

    // Shifted layout: code at index 0, desc at 1
    if (!code) {
      const col0 = (row[0] || '').trim();
      const col1 = (row[1] || '').trim();
      if (/^\d{3,6}$/.test(col0) && col1 && col1.length > 3) {
        code = col0;
        desc = col1;
        for (let j = 2; j < row.length; j++) {
          const cell = (row[j] || '').trim();
          if (cell && cell.length > 2 && !/^\d/.test(cell) && !cell.includes(',')) {
            unit = cell;
            break;
          }
        }
        for (let j = 2; j < row.length; j++) {
          const cell = (row[j] || '').trim();
          if (cell && /^\d/.test(cell) && cell.includes(',')) {
            qty = parseBrNumber(cell);
            break;
          }
        }
      }
    }

    if (code && desc && qty > 0) {
      currentKit.itens.push({ codigoProduto: code, descricao: desc, unidade: unit, qtPadrao: qty });
    }
  }

  if (currentKit && currentKit.itens.length > 0) {
    kits.push(currentKit);
  }

  return kits;
}

function parseEstoque(csvText: string): EstoqueItem[] {
  const result = Papa.parse(csvText, { header: false, skipEmptyLines: true });
  const rows = result.data as string[][];
  const estoqueMap = new Map<string, EstoqueItem>();

  for (const row of rows) {
    if (row.length < 6) continue;
    const joined = row.join(',');
    if (joined.includes('Produto') && joined.includes('Unidade') && joined.includes('Estoque')) continue;

    // Standard format: empty col 0, code at col 1, desc at col 2
    let code = (row[1] || '').trim();
    let desc = (row[2] || '').trim();
    let unit = (row[4] || '').trim();
    let stock = (row[6] || '').trim();

    if (!/^\d{2,6}$/.test(code)) continue;
    if (!desc || desc.length < 3) continue;
    // Skip continuation rows (empty desc means same product, different lot)
    if (!desc || /^ML\s|^MG\s/.test(desc)) continue;

    const stockNum = parseBrNumber(stock);

    if (estoqueMap.has(code)) {
      // Already tracked - stock is total, not per lot, so don't add
    } else {
      estoqueMap.set(code, {
        codigoProduto: code,
        descricao: desc,
        unidade: unit,
        estoqueAtual: stockNum
      });
    }
  }

  return Array.from(estoqueMap.values());
}

// ─── Components ──────────────────────────────────────────────────────────────

function KitSearchSelect({ kits, value, onChange }: {
  kits: Kit[];
  value: number | null;
  onChange: (idx: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = React.useRef<HTMLDivElement>(null);

  const sorted = useMemo(() =>
    [...kits]
      .map((k, i) => ({ kit: k, idx: i }))
      .sort((a, b) => a.kit.nomeKit.localeCompare(b.kit.nomeKit)),
    [kits]
  );

  const filtered = useMemo(() => {
    if (!search) return sorted;
    const s = normalizeText(search);
    return sorted.filter(({ kit }) => normalizeText(kit.nomeKit).includes(s));
  }, [sorted, search]);

  const selected = value !== null ? kits[value] : null;

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        className="w-full text-left text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white hover:border-violet-300 focus:ring-1 focus:ring-violet-300 focus:outline-none flex items-center justify-between gap-1"
      >
        <span className={selected ? 'text-slate-700 truncate' : 'text-slate-400'}>
          {selected ? `${selected.nomeKit} (${selected.itens.length} itens)` : '— Sem kit vinculado —'}
        </span>
        <ChevronDown className="w-3 h-3 flex-shrink-0 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar kit..."
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-300 focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto custom-scrollbar">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left text-xs px-3 py-2 text-slate-400 hover:bg-slate-50"
            >
              — Sem kit vinculado —
            </button>
            {filtered.map(({ kit, idx }) => (
              <button
                key={idx}
                type="button"
                onClick={() => { onChange(idx); setOpen(false); }}
                className={`w-full text-left text-xs px-3 py-2 hover:bg-violet-50 hover:text-violet-700 truncate ${value === idx ? 'bg-violet-50 text-violet-700 font-medium' : 'text-slate-700'}`}
              >
                {kit.nomeKit} <span className="text-slate-400">({kit.itens.length} itens)</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-xs text-slate-400 text-center py-3">Nenhum kit encontrado</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DropZone({ label, icon, accepted, onFile, fileName }: {
  label: string;
  icon: React.ReactNode;
  accepted: boolean;
  onFile: (text: string, name: string) => void;
  fileName: string;
}) {
  const onDrop = useCallback((files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      onFile(text, file.name);
    };
    reader.readAsText(file, 'latin1');
  }, [onFile]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={`relative rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-all ${
        accepted
          ? 'border-emerald-300 bg-emerald-50/50'
          : isDragActive
          ? 'border-violet-400 bg-violet-50/50'
          : 'border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/30'
      }`}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center gap-2">
        {accepted ? (
          <CheckCircle2 className="w-8 h-8 text-emerald-500" />
        ) : (
          <div className="text-slate-400">{icon}</div>
        )}
        <p className="font-semibold text-sm text-slate-700">{label}</p>
        {accepted ? (
          <p className="text-xs text-emerald-600 truncate max-w-full">{fileName}</p>
        ) : (
          <p className="text-xs text-slate-400">Arraste o CSV ou clique para selecionar</p>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon, color }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color] || colors.slate}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-75">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const PlanejamentoKitsCirurgicos: React.FC = () => {
  const [step, setStep] = useState<Step>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');

  // Upload state
  const [cirurgias, setCirurgias] = useState<Cirurgia[]>([]);
  const [kits, setKits] = useState<Kit[]>([]);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [fileNames, setFileNames] = useState({ cir: '', kit: '', est: '' });

  // Matching state
  const [matches, setMatches] = useState<MatchCirurgiaKit[]>([]);

  // Equivalence state
  const [prodEquiv, setProdEquiv] = useState<Map<string, ProdutoEquiv>>(new Map());
  const [equivSearch, setEquivSearch] = useState('');
  const [equivFilter, setEquivFilter] = useState<string>('todos');
  const [showEquivPanel, setShowEquivPanel] = useState(false);

  // Dashboard state
  const [periodDays, setPeriodDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [kitFilter, setKitFilter] = useState<string>('todos');
  const [sortField, setSortField] = useState<SortField>('saldo');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Upload handlers
  const handleCirurgias = useCallback((text: string, name: string) => {
    const parsed = parseCirurgias(text);
    setCirurgias(parsed);
    setFileNames(f => ({ ...f, cir: name }));
  }, []);

  const handleKits = useCallback((text: string, name: string) => {
    const parsed = parseFormulasKit(text);
    setKits(parsed);
    setFileNames(f => ({ ...f, kit: name }));
  }, []);

  const handleEstoque = useCallback((text: string, name: string) => {
    const parsed = parseEstoque(text);
    setEstoque(parsed);
    setFileNames(f => ({ ...f, est: name }));
  }, []);

  // Find special kits indices
  const kitGeralIndex = useMemo(() => {
    return kits.findIndex(k => normalizeText(k.nomeKit).includes('KIT GERAL'));
  }, [kits]);

  const kitPsicoboxIndex = useMemo(() => {
    return kits.findIndex(k => normalizeText(k.nomeKit).includes('PSICOBOX') || normalizeText(k.nomeKit).includes('SEDACAO') || normalizeText(k.nomeKit).includes('SEDACAO'));
  }, [kits]);

  // Auto-matching
  const generateMatches = useCallback(() => {
    setIsLoading(true);
    setLoadingMsg('Vinculando cirurgias aos kits...');
    setTimeout(() => {
      const matchList: MatchCirurgiaKit[] = cirurgias.map(cir => {
        let bestIdx = -1;
        let bestScore = 0;
        kits.forEach((kit, idx) => {
          const score = calcMatchScore(cir.descricao, kit.nomeKit);
          if (score > bestScore) {
            bestScore = score;
            bestIdx = idx;
          }
        });

        let finalIdx = bestScore >= 0.4 ? bestIdx : null;
        let finalScore = bestScore;

        if (finalIdx === null && kitGeralIndex >= 0) {
          finalIdx = kitGeralIndex;
          finalScore = 0.1;
        }

        return {
          cirurgia: cir,
          kitIndex: finalIdx,
          kitSedacaoIndex: kitPsicoboxIndex >= 0 ? kitPsicoboxIndex : null,
          score: finalScore,
          manual: false,
        };
      });
      setMatches(matchList);
      setIsLoading(false);
      setStep('matching');
    }, 50);
  }, [cirurgias, kits, kitGeralIndex, kitPsicoboxIndex]);

  // Generate product equivalences
  const generateEquivalencias = useCallback(() => {
    setIsLoading(true);
    setLoadingMsg('Calculando equivalencias de produtos...');
    setTimeout(() => {
      const allKitItems: KitItem[] = [];
      for (const match of matches) {
        if (match.kitIndex !== null && match.kitIndex >= 0) {
          const kit = kits[match.kitIndex];
          if (kit) allKitItems.push(...kit.itens);
        }
        if (match.kitSedacaoIndex !== null && match.kitSedacaoIndex >= 0) {
          const sedKit = kits[match.kitSedacaoIndex];
          if (sedKit) allKitItems.push(...sedKit.itens);
        }
      }
      const eqMap = buildProdutoEquivalencias(allKitItems, estoque);
      setProdEquiv(eqMap);
      setIsLoading(false);
      setStep('equivalencia');
    }, 50);
  }, [matches, kits, estoque]);

  // Equivalence stats
  const equivStats = useMemo(() => {
    const arr = Array.from(prodEquiv.values());
    return {
      total: arr.length,
      porCodigo: arr.filter(e => e.method === 'codigo').length,
      porDescricao: arr.filter(e => e.method === 'descricao').length,
      semMatch: arr.filter(e => e.method === 'nenhum').length,
    };
  }, [prodEquiv]);

  // Filtered equivalences
  const filteredEquiv = useMemo(() => {
    let arr = Array.from(prodEquiv.values());
    if (equivSearch) {
      const s = normalizeText(equivSearch);
      arr = arr.filter(e =>
        normalizeText(e.kitDesc).includes(s) || normalizeText(e.estDesc).includes(s) || e.kitCode.includes(equivSearch)
      );
    }
    if (equivFilter !== 'todos') {
      arr = arr.filter(e => e.method === equivFilter);
    }
    return arr.sort((a, b) => {
      if (a.method === 'nenhum' && b.method !== 'nenhum') return -1;
      if (a.method !== 'nenhum' && b.method === 'nenhum') return 1;
      if (a.method === 'descricao' && b.method === 'codigo') return -1;
      if (a.method === 'codigo' && b.method === 'descricao') return 1;
      return a.score - b.score;
    });
  }, [prodEquiv, equivSearch, equivFilter]);

  // Compute demand using equivalences
  const demandaItems = useMemo<DemandaItem[]>(() => {
    if (step !== 'resultado') return [];

    const estoqueMap = new Map<string, number>();
    const estoqueDescMap = new Map<string, string>();
    for (const e of estoque) {
      estoqueMap.set(e.codigoProduto, e.estoqueAtual);
      estoqueDescMap.set(e.codigoProduto, e.descricao);
    }

    const demandaMap = new Map<string, { desc: string; unit: string; total: number; kitsOrigem: Set<string>; equivMethod: 'codigo' | 'descricao' | 'nenhum'; equivEstCode: string; equivEstDesc: string }>();

    const addKitDemanda = (kit: Kit, qtCirurgias: number) => {
      for (const item of kit.itens) {
        const key = item.codigoProduto;
        const needed = item.qtPadrao * qtCirurgias;

        const existing = demandaMap.get(key);
        if (existing) {
          existing.total += needed;
          existing.kitsOrigem.add(kit.nomeKit);
        } else {
          const equiv = prodEquiv.get(key);
          demandaMap.set(key, {
            desc: item.descricao,
            unit: item.unidade,
            total: needed,
            kitsOrigem: new Set([kit.nomeKit]),
            equivMethod: equiv?.method ?? 'nenhum',
            equivEstCode: equiv?.estCode ?? '',
            equivEstDesc: equiv?.estDesc ?? '',
          });
        }
      }
    };

    for (const match of matches) {
      if (match.kitIndex !== null && match.kitIndex >= 0) {
        const kit = kits[match.kitIndex];
        if (kit) addKitDemanda(kit, match.cirurgia.quantidade);
      }
      if (match.kitSedacaoIndex !== null && match.kitSedacaoIndex >= 0) {
        const sedKit = kits[match.kitSedacaoIndex];
        if (sedKit) addKitDemanda(sedKit, match.cirurgia.quantidade);
      }
    }

    const items: DemandaItem[] = [];
    for (const [code, data] of demandaMap) {
      let est = 0;
      if (data.equivMethod === 'codigo' && data.equivEstCode) {
        est = estoqueMap.get(data.equivEstCode) ?? 0;
      } else if (data.equivMethod === 'codigo') {
        est = estoqueMap.get(code) ?? 0;
      } else if (data.equivMethod === 'descricao' && data.equivEstCode) {
        est = estoqueMap.get(data.equivEstCode) ?? 0;
      }
      const saldo = est - data.total;
      items.push({
        codigoProduto: code,
        descricao: data.desc,
        unidade: data.unit,
        demandaTotal: Math.round(data.total * 100) / 100,
        estoqueAtual: est,
        saldo: Math.round(saldo * 100) / 100,
        status: est === 0 && data.equivMethod === 'nenhum' ? 'sem_estoque' : est === 0 ? 'sem_estoque' : saldo < 0 ? 'critico' : 'suficiente',
        kitsOrigem: Array.from(data.kitsOrigem),
        equivMethod: data.equivMethod,
        equivEstCode: data.equivEstCode,
        equivEstDesc: data.equivEstDesc,
      });
    }

    return items;
  }, [step, matches, kits, estoque, prodEquiv]);

  // Filtered and sorted data
  const filteredData = useMemo(() => {
    let data = [...demandaItems];
    if (searchTerm) {
      const s = normalizeText(searchTerm);
      data = data.filter(d =>
        normalizeText(d.descricao).includes(s) || d.codigoProduto.includes(searchTerm)
      );
    }
    if (statusFilter !== 'todos') {
      data = data.filter(d => d.status === statusFilter);
    }
    if (kitFilter !== 'todos') {
      data = data.filter(d => d.kitsOrigem.includes(kitFilter));
    }
    data.sort((a, b) => {
      const av = a[sortField];
      const bv = b[sortField];
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return data;
  }, [demandaItems, searchTerm, statusFilter, kitFilter, sortField, sortDir]);

  const pagedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / pageSize);

  // Stats
  const stats = useMemo(() => {
    const total = demandaItems.length;
    const criticos = demandaItems.filter(d => d.status === 'critico').length;
    const semEstoque = demandaItems.filter(d => d.status === 'sem_estoque').length;
    const suficientes = demandaItems.filter(d => d.status === 'suficiente').length;
    const totalCirurgias = matches.filter(m => m.kitIndex !== null).reduce((s, m) => s + m.cirurgia.quantidade, 0);
    const kitsUsados = new Set(matches.filter(m => m.kitIndex !== null).map(m => m.kitIndex)).size;
    return { total, criticos, semEstoque, suficientes, totalCirurgias, kitsUsados };
  }, [demandaItems, matches]);

  // Chart data
  const chartCriticos = useMemo(() => {
    return demandaItems
      .filter(d => d.saldo < 0)
      .sort((a, b) => a.saldo - b.saldo)
      .slice(0, 20)
      .map(d => ({
        name: d.descricao.length > 30 ? d.descricao.slice(0, 30) + '...' : d.descricao,
        demanda: d.demandaTotal,
        estoque: d.estoqueAtual,
        deficit: Math.abs(d.saldo),
      }));
  }, [demandaItems]);

  const chartPie = useMemo(() => [
    { name: 'Suficiente', value: stats.suficientes, color: '#10b981' },
    { name: 'Critico', value: stats.criticos, color: '#f59e0b' },
    { name: 'Sem Estoque', value: stats.semEstoque, color: '#ef4444' },
  ], [stats]);

  // Scatter: demanda vs estoque por produto
  const chartScatter = useMemo(() => {
    return demandaItems
      .filter(d => d.demandaTotal > 0)
      .map(d => ({
        x: d.demandaTotal,
        y: d.estoqueAtual,
        z: Math.abs(d.saldo) + 1,
        name: d.descricao.length > 28 ? d.descricao.slice(0, 28) + '…' : d.descricao,
        status: d.status,
      }));
  }, [demandaItems]);

  // Treemap: demanda total por kit
  const chartTreemap = useMemo(() => {
    const byKit = new Map<string, number>();
    for (const d of demandaItems) {
      for (const k of d.kitsOrigem) {
        byKit.set(k, (byKit.get(k) ?? 0) + d.demandaTotal);
      }
    }
    return Array.from(byKit.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, value]) => ({
        name: name.replace('HBR_HAC-', '').replace('KIT ', ''),
        value: Math.round(value),
      }));
  }, [demandaItems]);

  // Radar: cobertura (% suficiente) por kit - top 8 kits por nº de cirurgias
  const chartRadar = useMemo(() => {
    const kitOrder = new Map<string, number>();
    for (const m of matches) {
      if (m.kitIndex === null) continue;
      const k = kits[m.kitIndex];
      if (!k) continue;
      kitOrder.set(k.nomeKit, (kitOrder.get(k.nomeKit) ?? 0) + m.cirurgia.quantidade);
    }
    const topKits = Array.from(kitOrder.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome]) => nome);

    return topKits.map(nome => {
      const prods = demandaItems.filter(d => d.kitsOrigem.includes(nome));
      const total = prods.length;
      const suf = prods.filter(d => d.status === 'suficiente').length;
      const pct = total > 0 ? Math.round((suf / total) * 100) : 0;
      return {
        kit: nome.replace('HBR_HAC-', '').replace('KIT ', '').slice(0, 18),
        cobertura: pct,
        risco: 100 - pct,
      };
    });
  }, [demandaItems, matches, kits]);

  // Heatmap: top 12 produtos × top 8 kits (demanda por célula)
  const chartHeatmap = useMemo(() => {
    const kitOrder = new Map<string, number>();
    for (const m of matches) {
      if (m.kitIndex === null) continue;
      const k = kits[m.kitIndex];
      if (!k) continue;
      kitOrder.set(k.nomeKit, (kitOrder.get(k.nomeKit) ?? 0) + m.cirurgia.quantidade);
    }
    const topKitNames = Array.from(kitOrder.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([n]) => n);

    const topProds = [...demandaItems]
      .sort((a, b) => b.demandaTotal - a.demandaTotal)
      .slice(0, 12);

    // For each product, compute demand coming from each kit
    const cellMap = new Map<string, number>();
    for (const m of matches) {
      if (m.kitIndex === null) continue;
      const k = kits[m.kitIndex];
      if (!k) continue;
      if (!topKitNames.includes(k.nomeKit)) continue;
      for (const item of k.itens) {
        const prod = topProds.find(p => p.codigoProduto === item.codigoProduto);
        if (!prod) continue;
        const key = `${prod.codigoProduto}||${k.nomeKit}`;
        cellMap.set(key, (cellMap.get(key) ?? 0) + item.qtPadrao * m.cirurgia.quantidade);
      }
    }

    const maxVal = Math.max(1, ...Array.from(cellMap.values()));
    return { topKitNames, topProds, cellMap, maxVal };
  }, [demandaItems, matches, kits]);

  // ComposedChart: demanda vs estoque top 15 produtos por demanda
  const chartComposed = useMemo(() => {
    return [...demandaItems]
      .sort((a, b) => b.demandaTotal - a.demandaTotal)
      .slice(0, 15)
      .map(d => ({
        name: d.descricao.length > 22 ? d.descricao.slice(0, 22) + '…' : d.descricao,
        demanda: d.demandaTotal,
        estoque: d.estoqueAtual,
        saldo: d.saldo,
        status: d.status,
      }));
  }, [demandaItems]);

  // Coverage days per product
  const coverageDaysData = useMemo(() => {
    return demandaItems.map(d => {
      const dailyDemand = d.demandaTotal / periodDays;
      const dias = dailyDemand > 0 ? d.estoqueAtual / dailyDemand : d.estoqueAtual > 0 ? 999 : 0;
      return { ...d, diasCobertura: Math.round(dias) };
    });
  }, [demandaItems, periodDays]);

  const avgCoverageDays = useMemo(() => {
    const valid = coverageDaysData.filter(d => d.demandaTotal > 0 && d.diasCobertura < 999);
    if (!valid.length) return 0;
    return Math.round(valid.reduce((s, d) => s + d.diasCobertura, 0) / valid.length);
  }, [coverageDaysData]);

  const chartCoverageDays = useMemo(() => {
    return [...coverageDaysData]
      .filter(d => d.demandaTotal > 0 && d.diasCobertura < 999)
      .sort((a, b) => a.diasCobertura - b.diasCobertura)
      .slice(0, 15)
      .map(d => ({
        name: d.descricao.length > 22 ? d.descricao.slice(0, 22) + '…' : d.descricao,
        dias: d.diasCobertura,
        alerta: d.diasCobertura < periodDays,
      }));
  }, [coverageDaysData, periodDays]);

  // Unique kit names for filter
  const kitNames = useMemo(() => {
    const names = new Set<string>();
    demandaItems.forEach(d => d.kitsOrigem.forEach(k => names.add(k)));
    return Array.from(names).sort();
  }, [demandaItems]);

  // Export to XLSX
  const exportXLSX = () => {
    const data = filteredData.map(d => ({
      'Codigo Kit': d.codigoProduto,
      'Produto': d.descricao,
      'Unidade': d.unidade,
      'Demanda Total': d.demandaTotal,
      'Codigo Estoque': d.equivEstCode || d.codigoProduto,
      'Produto Estoque': d.equivEstDesc || d.descricao,
      'Equivalencia': d.equivMethod === 'codigo' ? 'Por Codigo' : d.equivMethod === 'descricao' ? 'Por Descricao' : 'Sem Match',
      'Estoque Atual': d.estoqueAtual,
      'Saldo': d.saldo,
      'Status': d.status === 'suficiente' ? 'Suficiente' : d.status === 'critico' ? 'Critico' : 'Sem Estoque',
      'Kits': d.kitsOrigem.join('; '),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Demanda vs Estoque');
    XLSX.writeFile(wb, 'planejamento_kits_cirurgicos.xlsx');
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  const handleReset = () => {
    setCirurgias([]);
    setKits([]);
    setEstoque([]);
    setFileNames({ cir: '', kit: '', est: '' });
    setMatches([]);
    setProdEquiv(new Map());
    setSearchTerm('');
    setStatusFilter('todos');
    setKitFilter('todos');
    setEquivSearch('');
    setEquivFilter('todos');
    setStep('upload');
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Loading overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex flex-col items-center justify-center gap-4"
          >
            <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 min-w-[280px]">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
              <p className="text-sm font-medium text-slate-700">{loadingMsg}</p>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2, ease: 'easeInOut' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Scissors className="w-6 h-6 text-violet-600" />
              Planejamento de Kits Cirurgicos
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Importe cirurgias, formulas de kits e estoque para calcular a demanda de materiais e medicamentos
            </p>
          </div>
          {step !== 'upload' && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              <RotateCcw className="w-4 h-4" /> Recomecar
            </button>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          {(['upload', 'matching', 'equivalencia', 'resultado'] as Step[]).map((s, i) => {
            const labels: Record<Step, string> = { upload: '1. Upload CSVs', matching: '2. Vincular Kits', equivalencia: '3. Equivalencias', resultado: '4. Dashboard' };
            const steps: Step[] = ['upload', 'matching', 'equivalencia', 'resultado'];
            return (
              <React.Fragment key={s}>
                {i > 0 && <ChevronRight className="w-4 h-4 text-slate-300" />}
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                  step === s
                    ? 'bg-violet-100 text-violet-700'
                    : steps.indexOf(step) > i
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-100 text-slate-400'
                }`}>
                  {labels[s]}
                </span>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step 1: Upload */}
      <AnimatePresence mode="wait">
        {step === 'upload' && (
          <motion.div
            key="upload"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DropZone
                label="Cirurgias por Periodo"
                icon={<Scissors className="w-8 h-8" />}
                accepted={cirurgias.length > 0}
                onFile={handleCirurgias}
                fileName={fileNames.cir}
              />
              <DropZone
                label="Formulas dos Kits"
                icon={<ClipboardList className="w-8 h-8" />}
                accepted={kits.length > 0}
                onFile={handleKits}
                fileName={fileNames.kit}
              />
              <DropZone
                label="Posicao de Estoque"
                icon={<Package className="w-8 h-8" />}
                accepted={estoque.length > 0}
                onFile={handleEstoque}
                fileName={fileNames.est}
              />
            </div>

            {/* Upload summary */}
            {(cirurgias.length > 0 || kits.length > 0 || estoque.length > 0) && (
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Dados importados</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-violet-600">{cirurgias.length}</p>
                    <p className="text-xs text-slate-500">Tipos de cirurgia</p>
                    {cirurgias.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        Total: {cirurgias.reduce((s, c) => s + c.quantidade, 0).toLocaleString('pt-BR')} procedimentos
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600">{kits.length}</p>
                    <p className="text-xs text-slate-500">Kits cadastrados</p>
                    {kits.length > 0 && (
                      <p className="text-xs text-slate-400 mt-1">
                        {kits.reduce((s, k) => s + k.itens.length, 0)} itens no total
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">{estoque.length}</p>
                    <p className="text-xs text-slate-500">Produtos no estoque</p>
                  </div>
                </div>
              </div>
            )}

            {cirurgias.length > 0 && kits.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={generateMatches}
                  className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-lg font-medium text-sm hover:bg-violet-700 transition shadow-sm"
                >
                  <Link2 className="w-4 h-4" /> Vincular Cirurgias aos Kits
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Step 2: Matching */}
        {step === 'matching' && (
          <motion.div
            key="matching"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-700">
                  Vinculacao Cirurgia → Kit ({matches.filter(m => m.kitIndex !== null).length}/{matches.length} vinculados)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('upload')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                  <button
                    onClick={generateEquivalencias}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition"
                  >
                    Equivalencias de Produtos <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      <th className="text-left p-2 font-medium text-slate-500">Codigo</th>
                      <th className="text-left p-2 font-medium text-slate-500">Cirurgia</th>
                      <th className="text-right p-2 font-medium text-slate-500">Qtd</th>
                      <th className="text-center p-2 font-medium text-slate-500">Score</th>
                      <th className="text-left p-2 font-medium text-slate-500 min-w-[250px]">Kit Vinculado</th>
                      <th className="text-left p-2 font-medium text-slate-500 min-w-[180px]">Kit Sedacao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matches.map((m, idx) => (
                      <tr key={idx} className={`${
                        m.kitIndex !== null
                          ? m.score >= 0.6
                            ? 'bg-emerald-50/40'
                            : 'bg-amber-50/40'
                          : 'bg-red-50/30'
                      }`}>
                        <td className="p-2 font-mono text-xs text-slate-500">{m.cirurgia.codigo}</td>
                        <td className="p-2 text-slate-700 max-w-xs truncate" title={m.cirurgia.descricao}>
                          {m.cirurgia.descricao}
                        </td>
                        <td className="p-2 text-right font-medium">{m.cirurgia.quantidade}</td>
                        <td className="p-2 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                            m.score >= 0.6 ? 'bg-emerald-100 text-emerald-700' :
                            m.score >= 0.3 ? 'bg-amber-100 text-amber-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {Math.round(m.score * 100)}%
                          </span>
                        </td>
                        <td className="p-2">
                          <KitSearchSelect
                            kits={kits}
                            value={m.kitIndex}
                            onChange={val => setMatches(prev => prev.map((p, i) =>
                              i === idx ? { ...p, kitIndex: val, manual: true, score: val !== null ? 1 : 0 } : p
                            ))}
                          />
                        </td>
                        <td className="p-2 text-xs text-slate-500">
                          {m.kitSedacaoIndex !== null && m.kitSedacaoIndex >= 0 && kits[m.kitSedacaoIndex]
                            ? <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">{kits[m.kitSedacaoIndex].nomeKit}</span>
                            : <span className="text-slate-300">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 3: Equivalencias */}
        {step === 'equivalencia' && (
          <motion.div
            key="equivalencia"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* Equiv KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Total Produtos" value={equivStats.total} icon={<Package className="w-4 h-4" />} color="slate" />
              <KpiCard label="Match por Codigo" value={equivStats.porCodigo} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
              <KpiCard label="Match por Descricao" value={equivStats.porDescricao} icon={<Link2 className="w-4 h-4" />} color="blue" />
              <KpiCard label="Sem Equivalencia" value={equivStats.semMatch} icon={<XCircle className="w-4 h-4" />} color="red" />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-semibold text-slate-700">
                  Equivalencia de Produtos (Kit → Estoque)
                </h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setStep('matching')}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                  >
                    <ChevronLeft className="w-3 h-3" /> Voltar
                  </button>
                  <button
                    onClick={() => { setStep('resultado'); setCurrentPage(1); }}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-violet-600 text-white font-medium hover:bg-violet-700 transition"
                  >
                    Calcular Demanda <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 mb-3">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto..."
                    value={equivSearch}
                    onChange={e => setEquivSearch(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-300 focus:outline-none"
                  />
                </div>
                <select
                  value={equivFilter}
                  onChange={e => setEquivFilter(e.target.value)}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-300 focus:outline-none"
                >
                  <option value="todos">Todos</option>
                  <option value="codigo">Match por Codigo</option>
                  <option value="descricao">Match por Descricao</option>
                  <option value="nenhum">Sem Match</option>
                </select>
              </div>

              <div className="text-xs text-slate-500 mb-2">{filteredEquiv.length} produtos</div>

              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 z-10">
                    <tr>
                      <th className="text-left p-2 font-medium text-slate-500 w-16">Cod. Kit</th>
                      <th className="text-left p-2 font-medium text-slate-500">Produto no Kit</th>
                      <th className="text-center p-2 font-medium text-slate-500 w-20">Metodo</th>
                      <th className="text-center p-2 font-medium text-slate-500 w-16">Score</th>
                      <th className="text-left p-2 font-medium text-slate-500 w-16">Cod. Est.</th>
                      <th className="text-left p-2 font-medium text-slate-500 min-w-[250px]">Produto no Estoque</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredEquiv.map((eq, idx) => (
                      <tr key={eq.kitCode + '-' + idx} className={`${
                        eq.method === 'codigo' ? 'bg-emerald-50/30' :
                        eq.method === 'descricao' ? 'bg-blue-50/30' :
                        'bg-red-50/20'
                      }`}>
                        <td className="p-2 font-mono text-xs text-slate-400">{eq.kitCode}</td>
                        <td className="p-2 text-slate-700 text-xs max-w-xs" title={eq.kitDesc}>
                          <span className="line-clamp-2">{eq.kitDesc}</span>
                        </td>
                        <td className="p-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            eq.method === 'codigo' ? 'bg-emerald-100 text-emerald-700' :
                            eq.method === 'descricao' ? 'bg-blue-100 text-blue-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {eq.method === 'codigo' ? 'Codigo' : eq.method === 'descricao' ? 'Descricao' : 'Nenhum'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          {eq.method !== 'nenhum' && (
                            <span className="text-xs font-medium text-slate-600">
                              {Math.round(eq.score * 100)}%
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs text-slate-400">{eq.estCode || '—'}</td>
                        <td className="p-2">
                          <select
                            value={eq.estCode || '__none__'}
                            onChange={e => {
                              const val = e.target.value;
                              setProdEquiv(prev => {
                                const next = new Map(prev);
                                if (val === '__none__') {
                                  next.set(eq.kitCode, { ...eq, estCode: '', estDesc: '', score: 0, method: 'nenhum' });
                                } else {
                                  const est = estoque.find(x => x.codigoProduto === val);
                                  if (est) {
                                    next.set(eq.kitCode, { ...eq, estCode: est.codigoProduto, estDesc: est.descricao, score: 1, method: 'descricao' });
                                  }
                                }
                                return next;
                              });
                            }}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:ring-1 focus:ring-violet-300 focus:outline-none"
                          >
                            <option value="__none__">— Sem equivalencia —</option>
                            {estoque.map(est => (
                              <option key={est.codigoProduto} value={est.codigoProduto}>
                                [{est.codigoProduto}] {est.descricao.substring(0, 60)} (Est: {est.estoqueAtual})
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 4: Dashboard */}
        {step === 'resultado' && (
          <motion.div
            key="resultado"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              <KpiCard label="Total Cirurgias" value={stats.totalCirurgias.toLocaleString('pt-BR')} icon={<Scissors className="w-4 h-4" />} color="violet" />
              <KpiCard label="Kits Utilizados" value={stats.kitsUsados} icon={<ClipboardList className="w-4 h-4" />} color="blue" />
              <KpiCard label="Produtos na Demanda" value={stats.total} icon={<Package className="w-4 h-4" />} color="slate" />
              <KpiCard label="Suficientes" value={stats.suficientes} icon={<CheckCircle2 className="w-4 h-4" />} color="emerald" />
              <KpiCard label="Criticos" value={stats.criticos} icon={<AlertTriangle className="w-4 h-4" />} color="amber" />
              <KpiCard label="Sem Estoque" value={stats.semEstoque} icon={<XCircle className="w-4 h-4" />} color="red" />
              <KpiCard label="Equiv. por Descricao" value={demandaItems.filter(d => d.equivMethod === 'descricao').length} icon={<Link2 className="w-4 h-4" />} color="blue" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Bar chart - critical items */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Top 20 Produtos com Maior Deficit</h3>
                {chartCriticos.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={chartCriticos} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="demanda" name="Demanda" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="estoque" name="Estoque" fill="#10b981" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-12">Nenhum produto em deficit</p>
                )}
              </div>

              {/* Pie chart */}
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Status dos Produtos</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <PieChart>
                    <Pie
                      data={chartPie}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {chartPie.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Filters and Table */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto ou codigo..."
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-violet-300 focus:outline-none"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-300 focus:outline-none"
                >
                  <option value="todos">Todos os status</option>
                  <option value="suficiente">Suficiente</option>
                  <option value="critico">Critico</option>
                  <option value="sem_estoque">Sem Estoque</option>
                </select>
                <select
                  value={kitFilter}
                  onChange={e => { setKitFilter(e.target.value); setCurrentPage(1); }}
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-violet-300 focus:outline-none max-w-[250px]"
                >
                  <option value="todos">Todos os kits</option>
                  {kitNames.map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <button
                  onClick={() => setStep('equivalencia')}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  <ChevronLeft className="w-3 h-3" /> Ajustar Equivalencias
                </button>
                <button
                  onClick={exportXLSX}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition"
                >
                  <Download className="w-3 h-3" /> Exportar XLSX
                </button>
              </div>

              <div className="text-xs text-slate-500 mb-2">{filteredData.length} produtos encontrados</div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left p-2 font-medium text-slate-500">Cod.</th>
                      <th
                        className="text-left p-2 font-medium text-slate-500 cursor-pointer hover:text-violet-600"
                        onClick={() => handleSort('descricao')}
                      >
                        <span className="flex items-center gap-1">Produto <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-left p-2 font-medium text-slate-500">Unid.</th>
                      <th
                        className="text-right p-2 font-medium text-slate-500 cursor-pointer hover:text-violet-600"
                        onClick={() => handleSort('demandaTotal')}
                      >
                        <span className="flex items-center justify-end gap-1">Demanda <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th
                        className="text-right p-2 font-medium text-slate-500 cursor-pointer hover:text-violet-600"
                        onClick={() => handleSort('estoqueAtual')}
                      >
                        <span className="flex items-center justify-end gap-1">Estoque <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th
                        className="text-right p-2 font-medium text-slate-500 cursor-pointer hover:text-violet-600"
                        onClick={() => handleSort('saldo')}
                      >
                        <span className="flex items-center justify-end gap-1">Saldo <ArrowUpDown className="w-3 h-3" /></span>
                      </th>
                      <th className="text-center p-2 font-medium text-slate-500">Status</th>
                      <th className="text-center p-2 font-medium text-slate-500">Equiv.</th>
                      <th className="text-left p-2 font-medium text-slate-500">Kits</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedData.map((d, i) => (
                      <tr key={d.codigoProduto + '-' + i} className="hover:bg-slate-50/50">
                        <td className="p-2 font-mono text-xs text-slate-400">{d.codigoProduto}</td>
                        <td className="p-2 text-slate-700 max-w-xs truncate" title={d.descricao}>{d.descricao}</td>
                        <td className="p-2 text-xs text-slate-500">{d.unidade}</td>
                        <td className="p-2 text-right font-medium">{d.demandaTotal.toLocaleString('pt-BR')}</td>
                        <td className="p-2 text-right">{d.estoqueAtual.toLocaleString('pt-BR')}</td>
                        <td className={`p-2 text-right font-bold ${
                          d.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {d.saldo > 0 ? '+' : ''}{d.saldo.toLocaleString('pt-BR')}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            d.status === 'suficiente'
                              ? 'bg-emerald-100 text-emerald-700'
                              : d.status === 'critico'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {d.status === 'suficiente' ? 'OK' : d.status === 'critico' ? 'Critico' : 'Sem Est.'}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full ${
                              d.equivMethod === 'codigo' ? 'bg-emerald-100 text-emerald-700' :
                              d.equivMethod === 'descricao' ? 'bg-blue-100 text-blue-700' :
                              'bg-red-100 text-red-600'
                            }`}
                            title={d.equivMethod === 'descricao' ? `Equivalente: [${d.equivEstCode}] ${d.equivEstDesc}` : ''}
                          >
                            {d.equivMethod === 'codigo' ? 'Cod' : d.equivMethod === 'descricao' ? 'Desc' : '—'}
                          </span>
                        </td>
                        <td className="p-2 text-xs text-slate-500 max-w-[200px] truncate" title={d.kitsOrigem.join(', ')}>
                          {d.kitsOrigem.length <= 2
                            ? d.kitsOrigem.map(k => k.replace('HBR_HAC-', '')).join(', ')
                            : `${d.kitsOrigem[0].replace('HBR_HAC-', '')} +${d.kitsOrigem.length - 1}`
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <span className="text-xs text-slate-500">
                    Pagina {currentPage} de {totalPages}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Anterior
                    </button>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-xs rounded border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
                    >
                      Proximo
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── PAINEL BI RESUMO ─────────────────────────────────────────── */}
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
                <div className="flex items-center gap-3">
                  <div className="bg-violet-100 p-2 rounded-xl">
                    <ClipboardList className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Resumo Executivo — Planejamento Cirurgico</h2>
                    <p className="text-xs text-slate-500">Visao consolidada da demanda vs. estoque disponivel</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-3 py-2">
                  <span className="text-xs font-medium text-violet-700">Periodo do planejamento:</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={periodDays}
                    onChange={e => setPeriodDays(Math.max(1, parseInt(e.target.value) || 30))}
                    className="w-14 text-sm font-bold text-violet-800 bg-transparent border-b border-violet-300 focus:outline-none text-center"
                  />
                  <span className="text-xs text-violet-600">dias</span>
                </div>
              </div>

              {/* Linha 1: indicadores principais */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
                {[
                  {
                    label: 'Total de Cirurgias',
                    value: stats.totalCirurgias.toLocaleString('pt-BR'),
                    sub: `${matches.length} procedimentos`,
                    bg: 'bg-violet-50', border: 'border-violet-200',
                    textVal: 'text-violet-800', textSub: 'text-violet-500', textLabel: 'text-violet-600',
                    icon: <Scissors className="w-5 h-5 text-violet-500" />,
                  },
                  {
                    label: 'Kits Necessarios',
                    value: stats.kitsUsados,
                    sub: `${demandaItems.length} produtos totais`,
                    bg: 'bg-blue-50', border: 'border-blue-200',
                    textVal: 'text-blue-800', textSub: 'text-blue-500', textLabel: 'text-blue-600',
                    icon: <Package className="w-5 h-5 text-blue-500" />,
                  },
                  {
                    label: 'Cobertura OK',
                    value: `${stats.total > 0 ? Math.round((stats.suficientes / stats.total) * 100) : 0}%`,
                    sub: `${stats.suficientes} de ${stats.total} produtos`,
                    bg: 'bg-emerald-50', border: 'border-emerald-200',
                    textVal: 'text-emerald-800', textSub: 'text-emerald-500', textLabel: 'text-emerald-600',
                    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
                  },
                  {
                    label: 'Requer Atencao',
                    value: stats.criticos + stats.semEstoque,
                    sub: `${stats.criticos} criticos · ${stats.semEstoque} sem est.`,
                    bg: 'bg-red-50', border: 'border-red-200',
                    textVal: 'text-red-700', textSub: 'text-red-400', textLabel: 'text-red-600',
                    icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
                  },
                  {
                    label: `Cobertura Media`,
                    value: `${avgCoverageDays}d`,
                    sub: `base: ${periodDays} dias · ${coverageDaysData.filter(d => d.diasCobertura < periodDays && d.demandaTotal > 0).length} abaixo do periodo`,
                    bg: avgCoverageDays >= periodDays ? 'bg-teal-50' : 'bg-amber-50',
                    border: avgCoverageDays >= periodDays ? 'border-teal-200' : 'border-amber-200',
                    textVal: avgCoverageDays >= periodDays ? 'text-teal-800' : 'text-amber-700',
                    textSub: avgCoverageDays >= periodDays ? 'text-teal-500' : 'text-amber-500',
                    textLabel: avgCoverageDays >= periodDays ? 'text-teal-600' : 'text-amber-600',
                    icon: <Filter className="w-5 h-5" style={{ color: avgCoverageDays >= periodDays ? '#0d9488' : '#d97706' }} />,
                  },
                ].map(({ label, value, sub, bg, border, textVal, textSub, textLabel, icon }) => (
                  <div key={label} className={`${bg} border ${border} rounded-xl p-4`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className={`text-xs font-semibold uppercase tracking-wider ${textLabel}`}>{label}</p>
                      {icon}
                    </div>
                    <p className={`text-3xl font-bold ${textVal}`}>{value}</p>
                    <p className={`text-xs mt-1 ${textSub}`}>{sub}</p>
                  </div>
                ))}
              </div>

              {/* Linha 2: barra de status + top criticos */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
                {/* Barra de cobertura */}
                <div className="lg:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cobertura de Estoque</p>
                  {[
                    { label: 'Suficiente', count: stats.suficientes, total: stats.total, color: 'bg-emerald-400' },
                    { label: 'Critico', count: stats.criticos, total: stats.total, color: 'bg-amber-400' },
                    { label: 'Sem Estoque', count: stats.semEstoque, total: stats.total, color: 'bg-red-400' },
                  ].map(({ label, count, total, color }) => {
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>{label}</span>
                          <span className="font-semibold text-slate-700">{count} <span className="text-slate-400">({pct}%)</span></span>
                        </div>
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}

                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-400 mb-2">Equivalencias identificadas</p>
                    <div className="flex gap-3">
                      {[
                        { label: 'Por codigo', count: demandaItems.filter(d => d.equivMethod === 'codigo').length, color: 'text-emerald-600' },
                        { label: 'Por descricao', count: demandaItems.filter(d => d.equivMethod === 'descricao').length, color: 'text-blue-600' },
                        { label: 'Sem match', count: demandaItems.filter(d => d.equivMethod === 'nenhum').length, color: 'text-red-500' },
                      ].map(({ label, count, color }) => (
                        <div key={label} className="flex-1 text-center">
                          <p className={`text-lg font-bold ${color}`}>{count}</p>
                          <p className="text-[10px] text-slate-400">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Top 5 produtos criticos */}
                <div className="lg:col-span-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Top 5 Maiores Deficits</p>
                  <div className="space-y-2">
                    {demandaItems
                      .filter(d => d.saldo < 0)
                      .sort((a, b) => a.saldo - b.saldo)
                      .slice(0, 5)
                      .map((d, i) => {
                        const cd = coverageDaysData.find(x => x.codigoProduto === d.codigoProduto);
                        const maxDeficit = Math.abs(demandaItems.filter(x => x.saldo < 0).sort((a, b) => a.saldo - b.saldo)[0]?.saldo ?? 1);
                        const pct = Math.round((Math.abs(d.saldo) / maxDeficit) * 100);
                        return (
                          <div key={d.codigoProduto} className="flex items-center gap-3">
                            <span className="text-xs text-slate-300 w-4 font-bold">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-700 truncate" title={d.descricao}>{d.descricao}</p>
                              <div className="mt-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                <div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-xs font-bold text-red-600">{d.saldo.toLocaleString('pt-BR')}</p>
                              <p className="text-[10px] text-slate-400">{cd?.diasCobertura === 0 ? 'sem estoque' : `${cd?.diasCobertura ?? 0}d cobertura`}</p>
                            </div>
                          </div>
                        );
                      })}
                    {demandaItems.filter(d => d.saldo < 0).length === 0 && (
                      <div className="flex items-center justify-center h-20 gap-2 text-emerald-600">
                        <CheckCircle2 className="w-5 h-5" />
                        <p className="text-sm font-medium">Estoque suficiente para todos os produtos</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Linha 3: demanda por kit */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Demanda por Kit (top 10 por qtd de cirurgias)</p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                  {(() => {
                    const byKit = new Map<string, { nome: string; cirurgias: number; produtos: number }>();
                    for (const m of matches) {
                      if (m.kitIndex === null) continue;
                      const kit = kits[m.kitIndex];
                      if (!kit) continue;
                      const k = byKit.get(kit.codigoKit) ?? { nome: kit.nomeKit.replace('HBR_HAC-', ''), cirurgias: 0, produtos: kit.itens.length };
                      k.cirurgias += m.cirurgia.quantidade;
                      byKit.set(kit.codigoKit, k);
                    }
                    return Array.from(byKit.values())
                      .sort((a, b) => b.cirurgias - a.cirurgias)
                      .slice(0, 10)
                      .map(({ nome, cirurgias, produtos }) => (
                        <div key={nome} className="bg-white rounded-lg p-3 border border-slate-200 shadow-sm">
                          <p className="text-[10px] text-slate-400 uppercase tracking-wider truncate" title={nome}>{nome}</p>
                          <p className="text-xl font-bold text-slate-800 mt-1">{cirurgias.toLocaleString('pt-BR')}</p>
                          <p className="text-[10px] text-slate-400">{produtos} produtos/kit</p>
                        </div>
                      ));
                  })()}
                </div>
              </div>

              {/* ── GRÁFICOS EXTRAS ─────────────────────────────────────── */}

              {/* Linha 4: Scatter + Radar */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

                {/* Scatter: demanda vs estoque */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Dispersão — Demanda vs Estoque</p>
                  <p className="text-[10px] text-slate-400 mb-3">Cada ponto = produto · Verde = suficiente · Amarelo = crítico · Vermelho = sem estoque</p>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="x" name="Demanda" type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Demanda', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#94a3b8' }} />
                      <YAxis dataKey="y" name="Estoque" type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} label={{ value: 'Estoque', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#94a3b8' }} />
                      <ZAxis dataKey="z" range={[30, 200]} />
                      <Tooltip
                        cursor={{ strokeDasharray: '3 3', stroke: '#cbd5e1' }}
                        contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }}
                        formatter={(v: number, n: string) => [v.toLocaleString('pt-BR'), n]}
                        labelFormatter={(_: unknown, payload: { payload: { name: string } }[]) => payload?.[0]?.payload?.name ?? ''}
                      />
                      <Scatter name="Suficiente" data={chartScatter.filter(d => d.status === 'suficiente')} fill="#10b981" fillOpacity={0.75} />
                      <Scatter name="Critico" data={chartScatter.filter(d => d.status === 'critico')} fill="#f59e0b" fillOpacity={0.85} />
                      <Scatter name="Sem Estoque" data={chartScatter.filter(d => d.status === 'sem_estoque')} fill="#ef4444" fillOpacity={0.85} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>

                {/* Radar: cobertura por kit */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Radar — Cobertura por Kit</p>
                  <p className="text-[10px] text-slate-400 mb-3">% de produtos com estoque suficiente nos 8 kits mais demandados</p>
                  {chartRadar.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <RadarChart data={chartRadar} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                        <PolarGrid stroke="#e2e8f0" />
                        <PolarAngleAxis dataKey="kit" tick={{ fontSize: 9, fill: '#64748b' }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <Radar name="Cobertura %" dataKey="cobertura" stroke="#10b981" fill="#10b981" fillOpacity={0.2} />
                        <Radar name="Risco %" dataKey="risco" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v}%`]} />
                      </RadarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-16">Sem dados suficientes</p>
                  )}
                </div>
              </div>

              {/* Linha 5: ComposedChart demanda+estoque */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Top 15 Produtos por Demanda — Demanda vs Estoque</p>
                <p className="text-[10px] text-slate-400 mb-3">Barras roxas = demanda · Barras verdes = estoque atual · Linha amarela = curva de demanda</p>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={chartComposed} margin={{ top: 8, right: 16, bottom: 60, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-40} textAnchor="end" interval={0} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} formatter={(v: number, n: string) => [v.toLocaleString('pt-BR'), n]} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="demanda" name="Demanda" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="estoque" name="Estoque" fill="#10b981" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="demanda" name="Curva Demanda" stroke="#f59e0b" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                    <ReferenceLine y={0} stroke="#cbd5e1" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Linha 6: Dias de cobertura */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Dias de Cobertura — Top 15 Produtos mais Criticos</p>
                  <span className="text-[10px] text-slate-400 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Linha vermelha = {periodDays} dias (periodo)</span>
                </div>
                <p className="text-[10px] text-slate-400 mb-3">Quantos dias o estoque atual cobre a demanda diaria prevista</p>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={chartCoverageDays} layout="vertical" margin={{ top: 4, right: 60, bottom: 4, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, Math.max(periodDays * 1.5, ...chartCoverageDays.map(d => d.dias))]} />
                    <YAxis dataKey="name" type="category" width={170} tick={{ fontSize: 9, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`${v} dias`]} />
                    <ReferenceLine x={periodDays} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" label={{ value: `${periodDays}d`, position: 'top', fontSize: 10, fill: '#ef4444' }} />
                    <Bar dataKey="dias" name="Dias de cobertura" radius={[0, 4, 4, 0]}>
                      {chartCoverageDays.map((entry, i) => (
                        <Cell key={i} fill={entry.alerta ? '#f59e0b' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Linha 7: Treemap + Heatmap */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">

                {/* Treemap: volume de demanda por kit */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Treemap — Volume de Demanda por Kit</p>
                  <p className="text-[10px] text-slate-400 mb-3">Tamanho proporcional ao total de itens demandados</p>
                  {chartTreemap.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <Treemap
                        data={chartTreemap}
                        dataKey="value"
                        nameKey="name"
                        content={({ x, y, width, height, name, value, depth }: { x?: number; y?: number; width?: number; height?: number; name?: string; value?: number; depth?: number }) => {
                          if (!x || !y || !width || !height || (width < 20) || (height < 20)) return <g />;
                          const colors = ['#7c3aed','#6d28d9','#8b5cf6','#a78bfa','#5b21b6','#4c1d95','#c4b5fd','#ddd6fe'];
                          const fill = colors[(depth ?? 0) % colors.length];
                          return (
                            <g>
                              <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#fff" strokeWidth={2} rx={4} />
                              {width > 50 && height > 30 && (
                                <>
                                  <text x={x + width / 2} y={y + height / 2 - 6} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={600}>
                                    {(name ?? '').length > 14 ? (name ?? '').slice(0, 14) + '…' : name}
                                  </text>
                                  <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize={9}>
                                    {(value ?? 0).toLocaleString('pt-BR')}
                                  </text>
                                </>
                              )}
                            </g>
                          );
                        }}
                      />
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-16">Sem dados</p>
                  )}
                </div>

                {/* Heatmap: produto × kit */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Heatmap — Produto × Kit</p>
                  <p className="text-[10px] text-slate-400 mb-3">Intensidade = demanda total do produto naquele kit</p>
                  {chartHeatmap.topProds.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[9px]" style={{ borderCollapse: 'separate', borderSpacing: '2px' }}>
                        <thead>
                          <tr>
                            <th className="text-left text-slate-400 pr-2 font-normal w-32">Produto</th>
                            {chartHeatmap.topKitNames.map(k => (
                              <th key={k} className="text-slate-500 font-medium" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 72, verticalAlign: 'bottom', paddingBottom: 4 }}>
                                {k.replace('HBR_HAC-', '').replace('KIT ', '').slice(0, 16)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {chartHeatmap.topProds.map(prod => (
                            <tr key={prod.codigoProduto}>
                              <td className="text-slate-600 pr-2 truncate max-w-[120px]" title={prod.descricao}>
                                {prod.descricao.slice(0, 18)}
                              </td>
                              {chartHeatmap.topKitNames.map(kitName => {
                                const val = chartHeatmap.cellMap.get(`${prod.codigoProduto}||${kitName}`) ?? 0;
                                const intensity = val / chartHeatmap.maxVal;
                                const alpha = intensity > 0 ? Math.max(0.1, intensity) : 0;
                                return (
                                  <td key={kitName} title={val > 0 ? `${val.toLocaleString('pt-BR')} ${prod.unidade}` : '—'}
                                    style={{
                                      background: val > 0 ? `rgba(124,58,237,${alpha})` : '#f8fafc',
                                      border: '1px solid #e2e8f0',
                                      borderRadius: 3,
                                      textAlign: 'center',
                                      color: intensity > 0.5 ? '#fff' : '#64748b',
                                      padding: '3px 2px',
                                      minWidth: 28,
                                    }}
                                  >
                                    {val > 0 ? val.toLocaleString('pt-BR') : ''}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-16">Sem dados</p>
                  )}
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
