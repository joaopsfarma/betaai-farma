/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Upload, AlertTriangle, Package, CheckCircle, XCircle,
  Search, RefreshCw, TrendingUp, ShoppingCart, AlertCircle, Download
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie
} from 'recharts';
import { exportToPDF, PDF_COLORS } from '../utils/pdfExport';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface ConferenciaItem { codigo: string; descricao: string; comercial: string; generico: string; unidade: string; estoque: number; }
interface ConsumoItem { codigo: string; descricao: string; comercial: string; generico: string; unidade: string; media: number; saldo: number; dias: number[]; }
interface ReqItem {
  codigo: string; descricao: string; comercial: string; generico: string; unidade: string;
  mediaDiaria: number;
  necessidade5d: number;
  necessidadeSeguranca: number; // ×1.20
  estoqueSat: number;
  estoqueCaf: number;
  qtdePedir: number;        // max(0, ceil(segurança - estoqueSat))
  qtdeRequisitar: number;   // min(qtdePedir, estoqueCaf)
  status: 'ok' | 'pedir' | 'insuficiente_caf' | 'sem_estoque_caf';
}

// ─── BR NUMBER PARSER ─────────────────────────────────────────────────────────
// "1.655,000" → 1655  |  "2,167" → 2.167  |  "1,000" → 1
function parseBrNum(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

// ─── CSV QUOTE-AWARE SPLIT ────────────────────────────────────────────────────
function splitLine(line: string): string[] {
  const r: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { r.push(cur); cur = ''; continue; }
    cur += ch;
  }
  r.push(cur);
  return r;
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────
/** Parse conferencia CSV (332 / 501 / 561).
 *  Products span multiple rows (one per lote). First row of each product has código.
 *  c[1]=código, c[2]=descrição, c[4]=unidade, c[6]=estoque_total, c[12]=estNum */
function parseConferencia(text: string): { items: Map<string, ConferenciaItem>; estNum: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const map = new Map<string, ConferenciaItem>();
  let lastCod = '';
  let estNum = '';

  for (const line of lines) {
    const c = splitLine(line);
    // Skip header repeats
    if (c[0].toLowerCase().includes('produto') || c[3].toLowerCase().includes('unidade')) continue;

    const cod = c[1]?.trim();
    if (cod && !isNaN(parseInt(cod))) {
      // New product row
      lastCod = cod;
      const desc = c[2]?.trim() || '';
      const dash = desc.indexOf('-');
      const comercial = dash > 0 ? desc.substring(0, dash).trim() : desc;
      const generico  = dash > 0 ? desc.substring(dash + 1).trim() : '';
      const estoque = parseBrNum(c[6]);
      if (!estNum) estNum = c[12]?.trim() || '';
      map.set(cod, {
        codigo: cod, descricao: desc, comercial, generico,
        unidade: c[4]?.trim() || '', estoque,
      });
    }
    // Continuation rows (additional lots) — estoque already summed in the total on first row
  }
  return { items: map, estNum };
}

/** Parse consumo CSV (satellite daily consumption, 6 days).
 *  c[0]=código, c[1]=descrição, c[2]=unidade, c[3..8]=daily, c[10]=média, c[11]=saldo */
function parseConsumo(text: string): ConsumoItem[] {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows: ConsumoItem[] = [];

  for (const line of lines) {
    const c = splitLine(line);
    if (!c[0] || isNaN(parseInt(c[0]))) continue; // skip headers / repeats

    const desc = c[1]?.trim() || '';
    const dash = desc.indexOf('-');
    const comercial = dash > 0 ? desc.substring(0, dash).trim() : desc;
    const generico  = dash > 0 ? desc.substring(dash + 1).trim() : '';
    const dias = [c[3], c[4], c[5], c[6], c[7], c[8]].map(parseBrNum);
    const media = parseBrNum(c[10]);
    const saldo = parseBrNum(c[11]);

    rows.push({ codigo: c[0].trim(), descricao: desc, comercial, generico, unidade: c[2]?.trim() || '', media, saldo, dias });
  }
  return rows;
}

/** Detect file type from first ~600 chars */
function detectFile(text: string): 'conferencia' | 'consumo' | 'unknown' {
  const sample = text.substring(0, 600).toLowerCase();
  // Conferencia: has "estoque atual" and "lote" columns
  if (sample.includes('estoque atual') && sample.includes('lote')) return 'conferencia';
  // Consumo: has "saldo" and "total" — conferencia never has "saldo"
  if (sample.includes('saldo') && sample.includes('total')) return 'consumo';
  return 'unknown';
}

// ─── CATEGORY ────────────────────────────────────────────────────────────────
type Category = 'Psicotrópicos' | 'Alta Vigilância' | 'Comprimidos' | 'Injetáveis' | 'Soroterapia' | 'Soluções' | 'Materiais';

function getCategory(descricao: string, unidade: string): Category {
  const text = (descricao + ' ' + unidade)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 1. Psicotrópicos (Portaria 344/1998 - listas B1, B2, C1)
  if (/DIAZEPAM|CLONAZEPAM|ALPRAZOLAM|LORAZEPAM|MIDAZOLAM|BROMAZEPAM|CLORDIAZEPOX|NITRAZEPAM|FLUNITRAZEPAM|TRIAZOLAM|ZOLPIDEM|ZOPICLONA|FENOBARBITAL|CARBAMAZEPINA|FENITOINA|VALPROAT|AMITRIPTILINA|NORTRIPTILINA|IMIPRAMINA|CLOMIPRAMINA|HALOPERIDOL|CLORPROMAZINA|TIORIDAZINA|LEVOMEPROMAZINA|RISPERIDONA|OLANZAPINA|QUETIAPINA|CLOZAPINA|ARIPIPRAZOL|ZIPRASIDONA|LITIO|CARBONATO DE LITIO|BIPERIDENO|PROMETAZINA|MORFINA|CODEINA|FENTANIL|TRAMADOL|METADONA|OXICODONA|BUPRENORFINA|NALOXONA|PETIDINA|SUFENTANIL|REMIFENTANIL/.test(text)) {
    return 'Psicotrópicos';
  }

  // 2. Medicamentos Alta Vigilância (ISMP Brasil)
  if (/INSULINA|HEPARINA|VARFARINA|WARFARINA|ENOXAPARINA|FONDAPARINUX|APIXABANA|ELIQUIS|RIVAROXABANA|XARELTO|VYNAXA|EDOXABANA|LIXIANA|CLORETO\s*(?:DE\s*)?POTASSIO|KCL|POTASSIO|SULFATO\s*(?:DE\s*)?MAGNESIO|MAGNESIO|CLORETO\s*(?:DE\s*)?SODIO.*20%|NACL.*20%|GLUCONATO\s*(?:DE\s*)?CALCIO|CLORETO\s*(?:DE\s*)?CALCIO|BICARBONATO DE SODIO|NOREPINEFRINA|NORADRENALINA|EPINEFRINA|ADRENALINA|DOPAMINA|DOBUTAMINA|VASOPRESSINA|NITROPRUSSIATO|AMIODARONA|DIGOXINA|LIDOCAINA|METFORMINA|GLIBENCLAMIDA|QUIMIOTERAPICO|ANTINEOPLAS|CITOTOX|METOTREXATO|CICLOFOSFAMIDA|CISPLATINA|OXALIPLATINA|CARBOPLATINA|VINCRISTINA|DOXORRUBICINA|BLEOMICINA|CONCENTRADO DE HEMATIES|PLASMA|PLAQUETAS|ALBUMINA|IMUNOGLOBULINA|NEUROBLOQ|SUCCINILCOLINA|PANCURONIO|ROCURONIO|VECURONIO|ATRACURIO|GADOTERICO|GADOBUTROL|IOBITRIDOL|IOPROMIDA|GADOXETATO|DOTAREM|GADOVIST|ULTRAVIST|PRIMOVIST|BARIOGEL|SULFATO BARIO|FOSFATO POTASSIO|GLYCOPHOS|GLICEROFOSFATO|GLICOSE.*50%/.test(text)) {
    return 'Alta Vigilância';
  }

  // 3. Soroterapia — APENAS fluidos base de grande volume (50-1000ml)
  //    Volumes em formato BR: 1.000ML. NÃO captura medicamentos em bolsa.
  if (/SORO\s*FISIOL|SORO\s*GLICOS|CLOR.*SODIO\s*0,9|NACL\s*0,9|GLICOSE\s*(?:5(?!\d)|10(?!\d))|RINGER|MANITOL|\bSF\s*0,9|\bSG\s*5|\bRL\b|AGUA\s*(DEST|P.*INJ|BIDEST)/.test(text)
      && /\b(50|100|250|500|1\.?000)\s*ML\b/.test(text)) {
    return 'Soroterapia';
  }

  // 4. Soluções (orais, tópicas, oftálmicas, nasais, suspensões, gotas, bisnagas)
  //    Formas: FR SUSP, FR GTS, BG (bisnaga), TOP (tópico), OFTAL
  if (/XAROPE|SUSPENS[ÃA]O|\bSUSP\b|\bGOTAS\b|\bGOTA\b|\bGTS\b|\bCREME\b|\bPOMADA\b|\bGEL\b|LO[ÇC][ÃA]O|COL[ÍI]RIO|\bOFTAL\b|\bSPRAY\b|\bENEMA\b|SUPOSIT[ÓO]RIO|\bTOP\b|\bBG\b|\bINAL\b|\bAER\b|\bRETAL\b|\bSOL\b|SOL(U[ÇC][ÃA]O)?\s*(ORAL|T[OÓ]PICA|OFT[ÁA]LM|NASAL)/.test(text)) {
    return 'Soluções';
  }

  // 5. Comprimidos (sólidos orais + sachês)
  if (/\bCOMP\b|COMPRIMIDO|\bCAPS\b|C[ÁA]PSULA|\bDRG\b|DR[ÁA]GEA|\bCP\b|\bCPR\b|SACH[ÊE]|ENVELOPE|\bENV\b|GRANULADO|P[ÓO]\s*ORAL/.test(text)) {
    return 'Comprimidos';
  }

  // 6. Injetáveis (ampolas + frascos + frascos-ampola + seringas + bolsas de medicamentos)
  if (/\bAMP\b|AMPOLA|\bFR\b|FRASCO|FR[/.]?AMP|\bFCO\b|\bFA\b|SER.*PRE|CANETA|INJET[ÁA]VEL|\bINJ\b|LIOFILIZADO|BOLSA|\bBLC\b|\bBLF\b|INFUS[ÃA]O|\bEV\b|\bIM\b|\bSC\b/.test(text)) {
    return 'Injetáveis';
  }

  // 7. Materiais (fallback)
  return 'Materiais';
}

const CATEGORY_CFG: Record<Category, { color: string; bg: string; border: string; emoji: string }> = {
  'Psicotrópicos':   { color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', emoji: '⚠️' },
  'Alta Vigilância': { color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', emoji: '🔴' },
  'Soroterapia':     { color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', emoji: '🩸' },
  'Injetáveis':      { color: '#9333ea', bg: '#faf5ff', border: '#d8b4fe', emoji: '💉' },
  'Comprimidos':     { color: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', emoji: '💊' },
  'Soluções':        { color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', emoji: '🧪' },
  'Materiais':       { color: '#d97706', bg: '#fffbeb', border: '#fcd34d', emoji: '🩺' },
};

const CATEGORY_ORDER: Category[] = ['Psicotrópicos', 'Alta Vigilância', 'Soroterapia', 'Injetáveis', 'Comprimidos', 'Soluções', 'Materiais'];

// ─── STATUS CONFIG ────────────────────────────────────────────────────────────
const STATUS_CFG = {
  pedir:            { label: 'Pedir',           color: '#d97706', bg: '#fffbeb', border: '#fcd34d', badge: 'bg-amber-100 text-amber-700' },
  insuficiente_caf: { label: 'CAF Insuficiente', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', badge: 'bg-violet-100 text-violet-700' },
  sem_estoque_caf:  { label: 'Sem Estoque CAF', color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', badge: 'bg-red-100 text-red-700' },
  ok:               { label: 'OK',              color: '#16a34a', bg: '#f0fdf4', border: '#86efac', badge: 'bg-emerald-100 text-emerald-700' },
};

const PIE_COLORS = ['#d97706', '#7c3aed', '#dc2626', '#16a34a'];

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function RequisicaoV2() {
  const [cafMap,  setCafMap]  = useState<Map<string, ConferenciaItem> | null>(null);
  const [satMap,  setSatMap]  = useState<Map<string, ConferenciaItem> | null>(null);
  const [consumo, setConsumo] = useState<ConsumoItem[]>([]);
  const [cafNum,  setCafNum]  = useState('');
  const [satNum,  setSatNum]  = useState('');
  const [search,  setSearch]  = useState('');
  const [filterStatus, setFilterStatus] = useState<'todos' | ReqItem['status']>('todos');
  const [filterCategory, setFilterCategory] = useState<'todas' | Category>('todas');
  const [sortBy, setSortBy] = useState<'qtde' | 'media' | 'estoque_sat' | 'projecao'>('qtde');

  const CAF_NUMBERS = new Set(['501', '561']);

  const processFile = useCallback((text: string) => {
    const type = detectFile(text);
    if (type === 'conferencia') {
      const { items, estNum } = parseConferencia(text);
      if (CAF_NUMBERS.has(estNum)) { setCafMap(items); setCafNum(estNum); }
      else { setSatMap(items); setSatNum(estNum); }
    } else if (type === 'consumo') {
      setConsumo(parseConsumo(text));
    }
  }, []);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => processFile(e.target?.result as string);
      reader.readAsText(file, 'latin1');
    });
  }, [processFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  const reset = useCallback(() => {
    setCafMap(null); setSatMap(null); setConsumo([]); setCafNum(''); setSatNum('');
    setSearch(''); setFilterStatus('todos');
  }, []);

  // ── Build requisition items ──────────────────────────────────────────────
  const items = useMemo((): ReqItem[] => {
    if (!consumo.length) return [];

    return consumo.map(c => {
      const mediaDiaria = c.media;
      const necessidade5d = mediaDiaria * 5;
      const necessidadeSeguranca = Math.ceil(necessidade5d * 1.20);

      // Satellite stock: prefer conferencia count, fall back to consumo saldo
      const satConf = satMap?.get(c.codigo);
      const estoqueSat = satConf ? satConf.estoque : c.saldo;

      const cafConf = cafMap?.get(c.codigo);
      const estoqueCaf = cafConf ? cafConf.estoque : 0;

      const qtdePedir = Math.max(0, necessidadeSeguranca - estoqueSat);
      const qtdeRequisitar = Math.min(qtdePedir, estoqueCaf);

      let status: ReqItem['status'];
      if (qtdePedir <= 0) status = 'ok';
      else if (estoqueCaf <= 0) status = 'sem_estoque_caf';
      else if (estoqueCaf < qtdePedir) status = 'insuficiente_caf';
      else status = 'pedir';

      const descricao = satConf?.descricao || cafConf?.descricao || c.descricao;
      const comercial = satConf?.comercial || cafConf?.comercial || c.comercial;
      const generico  = satConf?.generico  || cafConf?.generico  || c.generico;
      const unidade   = satConf?.unidade   || c.unidade;

      return { codigo: c.codigo, descricao, comercial, generico, unidade, mediaDiaria, necessidade5d, necessidadeSeguranca, estoqueSat, estoqueCaf, qtdePedir, qtdeRequisitar, status };
    });
  }, [consumo, satMap, cafMap]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!items.length) return null;
    const pedir           = items.filter(r => r.status === 'pedir').length;
    const insuficiente    = items.filter(r => r.status === 'insuficiente_caf').length;
    const semEstoque      = items.filter(r => r.status === 'sem_estoque_caf').length;
    const ok              = items.filter(r => r.status === 'ok').length;
    const totalUnidades   = items.reduce((s, r) => s + r.qtdeRequisitar, 0);
    const totalNecessidade = items.reduce((s, r) => s + r.qtdePedir, 0);

    const top15 = [...items].filter(r => r.qtdeRequisitar > 0).sort((a, b) => b.qtdeRequisitar - a.qtdeRequisitar).slice(0, 15);

    const pieData = [
      { name: 'Pedir', value: pedir },
      { name: 'CAF Insuf.', value: insuficiente },
      { name: 'Sem CAF', value: semEstoque },
      { name: 'OK', value: ok },
    ].filter(d => d.value > 0);

    return { pedir, insuficiente, semEstoque, ok, totalUnidades, totalNecessidade, top15, pieData };
  }, [items]);

  // ── Filtered table ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let rows = [...items];
    if (filterStatus !== 'todos') rows = rows.filter(r => r.status === filterStatus);
    if (filterCategory !== 'todas') rows = rows.filter(r => getCategory(r.descricao, r.unidade) === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r => r.comercial.toLowerCase().includes(q) || r.generico.toLowerCase().includes(q) || r.codigo.includes(q));
    }
    rows.sort((a, b) => {
      if (sortBy === 'qtde')       return b.qtdeRequisitar - a.qtdeRequisitar;
      if (sortBy === 'media')      return b.mediaDiaria - a.mediaDiaria;
      if (sortBy === 'estoque_sat') return a.estoqueSat - b.estoqueSat;
      if (sortBy === 'projecao') {
        const pA = a.mediaDiaria > 0 ? a.estoqueSat / a.mediaDiaria : 999;
        const pB = b.mediaDiaria > 0 ? b.estoqueSat / b.mediaDiaria : 999;
        return pA - pB;
      }
      return 0;
    });
    return rows;
  }, [items, filterStatus, filterCategory, search, sortBy]);

  // ── Grouped by category ───────────────────────────────────────────────────
  const groupedRows = useMemo(() => {
    if (filterCategory !== 'todas') return null; // already filtered to one category
    const groups = new Map<Category, ReqItem[]>();
    CATEGORY_ORDER.forEach(cat => groups.set(cat, []));
    filtered.forEach(r => {
      const cat = getCategory(r.descricao, r.unidade);
      groups.get(cat)!.push(r);
    });
    return groups;
  }, [filtered, filterCategory]);

  const allLoaded = consumo.length > 0;
  const filesLoaded = [cafMap ? `CAF ${cafNum}` : null, satMap ? `Satélite ${satNum}` : null, consumo.length ? `Consumo (${consumo.length} itens)` : null].filter(Boolean);

  // ── PDF Export ───────────────────────────────────────────────────────────
  const exportPDF = useCallback(() => {
    if (!filtered.length || !stats) return;
    const date = new Date().toLocaleDateString('pt-BR');
    exportToPDF({
      title: `Requisição V2 — Satélite ${satNum} → CAF ${cafNum}`,
      subtitle: `${filtered.length} itens · Critério: 5 dias + 20% segurança · ${date}`,
      filename: `requisicao_sat${satNum}_caf${cafNum}_${date.replace(/\//g, '-')}.pdf`,
      isLandscape: true,
      accentColor: PDF_COLORS.indigo,
      kpis: [
        { label: 'Total Produtos',    value: String(items.length),                  color: PDF_COLORS.slate  },
        { label: 'A Requisitar',      value: String(stats.pedir),                   color: PDF_COLORS.amber  },
        { label: 'CAF Insuficiente',  value: String(stats.insuficiente),            color: PDF_COLORS.purple },
        { label: 'Sem Estoque CAF',   value: String(stats.semEstoque),              color: PDF_COLORS.red    },
        { label: 'OK',                value: String(stats.ok),                      color: PDF_COLORS.emerald },
        { label: 'Total Unidades',    value: stats.totalUnidades.toLocaleString('pt-BR'), color: PDF_COLORS.indigo },
      ],
      headers: ['#', 'Cód.', 'Categoria', 'Produto (Comercial)', 'Genérico', 'Unid.', 'Méd/dia', 'Nec.5d', '+20%', `Est.Sat ${satNum}`, `Est.CAF ${cafNum}`, 'Qtde Req.', 'Status'],
      data: filtered.map((r, i) => [
        String(i + 1),
        r.codigo,
        getCategory(r.descricao, r.unidade),
        r.comercial,
        r.generico,
        r.unidade,
        r.mediaDiaria.toFixed(2),
        r.necessidade5d.toFixed(1),
        String(r.necessidadeSeguranca),
        r.estoqueSat.toLocaleString('pt-BR'),
        r.estoqueCaf > 0 ? r.estoqueCaf.toLocaleString('pt-BR') : '0',
        r.qtdeRequisitar > 0 ? r.qtdeRequisitar.toLocaleString('pt-BR') : '—',
        STATUS_CFG[r.status].label,
      ]),
    });
  }, [filtered, stats, items.length, satNum, cafNum]);

  // ── Upload screen ────────────────────────────────────────────────────────
  if (!allLoaded) {
    return (
      <div className="space-y-6">
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full px-4 py-1.5 mb-4">
            <ShoppingCart className="w-3.5 h-3.5 text-indigo-500" />
            <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Requisição V2</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Requisição V2</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Importe os 3 CSVs juntos. Detecção automática de arquivos. Calcula necessidade de 5 dias com 20% de segurança.
          </p>
        </div>

        {/* File type legend */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
          {[
            { label: 'Conferência Satélite', desc: 'CSV conferencia332 — estoque destino', color: 'border-amber-200 bg-amber-50', icon: '📦', done: !!satMap, doneText: satMap ? `✓ Satélite ${satNum}` : '' },
            { label: 'Conferência CAF', desc: 'CSV conferencia501 ou 561 — estoque origem', color: 'border-indigo-200 bg-indigo-50', icon: '🏭', done: !!cafMap, doneText: cafMap ? `✓ CAF ${cafNum}` : '' },
            { label: 'Consumo', desc: 'CSV consumo diário — média e saldo atual', color: 'border-emerald-200 bg-emerald-50', icon: '📊', done: consumo.length > 0, doneText: consumo.length > 0 ? `✓ ${consumo.length} itens` : '' },
          ].map(({ label, desc, color, icon, done, doneText }) => (
            <div key={label} className={`border-2 ${done ? 'border-emerald-400 bg-emerald-50' : color} rounded-xl p-4 text-center transition-all`}>
              <span className="text-2xl">{done ? '✅' : icon}</span>
              <p className="text-xs font-black text-slate-700 mt-2">{done ? doneText : label}</p>
              <p className="text-[10px] text-slate-400 mt-1">{desc}</p>
            </div>
          ))}
        </div>

        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-2xl p-12 text-center transition-colors cursor-pointer max-w-xl mx-auto"
          onClick={() => document.getElementById('rv2-input')?.click()}
        >
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="font-bold text-slate-600 mb-1">Arraste os 3 CSVs aqui de uma vez</p>
          <p className="text-xs text-slate-400">Ou selecione os arquivos — identificação automática</p>
          <button className="mt-4 bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors">
            Selecionar Arquivos
          </button>
          <input id="rv2-input" type="file" accept=".csv,.txt" multiple className="hidden" onChange={onInput} />
        </div>

        {filesLoaded.length > 0 && (
          <p className="text-center text-xs text-emerald-600 font-bold">
            Carregados: {filesLoaded.join(' · ')} — aguardando os demais arquivos
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Requisição V2</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {consumo.length} produtos · Satélite {satNum || '—'} → CAF {cafNum || '—'} · Critério: 5 dias + 20% segurança
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(!cafMap || !satMap) && (
            <label className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-amber-100 transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {!cafMap ? 'Adicionar CAF' : 'Adicionar Satélite'}
              <input type="file" accept=".csv,.txt" multiple className="hidden" onChange={onInput} />
            </label>
          )}
          <button onClick={exportPDF}
            className="flex items-center gap-1.5 text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition-colors rounded-lg px-3 py-1.5 font-bold shadow-sm">
            <Download className="w-3.5 h-3.5" />
            Exportar PDF
          </button>
          <button onClick={reset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-500 transition-colors border border-slate-200 hover:border-indigo-300 rounded-lg px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Novo conjunto
          </button>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Produtos', value: items.length,               color: '#64748b', bg: 'bg-slate-50',    icon: <Package className="w-3.5 h-3.5 text-slate-500" />,    sub: 'analisados' },
          { label: 'A Requisitar',   value: stats?.pedir ?? 0,          color: '#d97706', bg: 'bg-amber-50',   icon: <ShoppingCart className="w-3.5 h-3.5 text-amber-500" />, sub: 'CAF tem estoque' },
          { label: 'CAF Insuf.',     value: stats?.insuficiente ?? 0,   color: '#7c3aed', bg: 'bg-violet-50',  icon: <AlertCircle className="w-3.5 h-3.5 text-violet-500" />,  sub: 'parcial na CAF' },
          { label: 'Sem Estoque CAF',value: stats?.semEstoque ?? 0,     color: '#dc2626', bg: 'bg-red-50',     icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,        sub: 'CAF zerado' },
          { label: 'OK',             value: stats?.ok ?? 0,             color: '#16a34a', bg: 'bg-emerald-50', icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />, sub: 'estoque suficiente' },
        ].map(({ label, value, color, bg, icon, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: color }} />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</span>
                <div className={`p-1.5 rounded-lg ${bg}`}>{icon}</div>
              </div>
              <p className="text-3xl font-black leading-none" style={{ color }}>{value.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Totalizadores ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-amber-200 shadow-sm p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total a Requisitar da CAF</p>
            <p className="text-4xl font-black text-amber-600 leading-none mt-1">{(stats?.totalUnidades ?? 0).toLocaleString('pt-BR')}</p>
            <p className="text-[11px] text-slate-400 mt-1">unidades — {(stats?.pedir ?? 0) + (stats?.insuficiente ?? 0)} itens com necessidade</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-5 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-7 h-7 text-rose-500" />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Déficit Total (sem cobertura CAF)</p>
            <p className="text-4xl font-black text-rose-600 leading-none mt-1">
              {items.reduce((s, r) => s + Math.max(0, r.qtdePedir - r.qtdeRequisitar), 0).toLocaleString('pt-BR')}
            </p>
            <p className="text-[11px] text-slate-400 mt-1">unidades que a CAF não consegue cobrir</p>
          </div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pie */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribuição por Status</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={stats?.pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name"
                label={({ name, value, percent }) => percent > 0.04 ? `${name}: ${value}` : ''}>
                {stats?.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top 15 maior requisição */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 15 — Maior Volume a Requisitar</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats?.top15.map(r => ({ name: r.comercial.substring(0, 25), qtde: r.qtdeRequisitar, status: r.status }))}
              layout="vertical" margin={{ left: 5, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9 }} />
              <YAxis dataKey="name" type="category" width={175} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: any) => [v.toLocaleString('pt-BR'), 'Qtde a requisitar']} />
              <Bar dataKey="qtde" radius={[0, 4, 4, 0]}>
                {stats?.top15.map((r, i) => (
                  <Cell key={i} fill={STATUS_CFG[r.status].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Filtros + Tabela ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          {/* Status filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
              {(['todos', 'pedir', 'insuficiente_caf', 'sem_estoque_caf', 'ok'] as const).map(f => (
                <button key={f} onClick={() => setFilterStatus(f)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${filterStatus === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {f === 'todos'            ? `Todos (${items.length})`
                   : f === 'pedir'          ? `🟡 Pedir (${stats?.pedir})`
                   : f === 'insuficiente_caf' ? `🟣 CAF Insuf. (${stats?.insuficiente})`
                   : f === 'sem_estoque_caf'  ? `🔴 Sem CAF (${stats?.semEstoque})`
                   : `🟢 OK (${stats?.ok})`}
                </button>
              ))}
            </div>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white outline-none">
              <option value="qtde">Ordenar: Maior qtde a pedir</option>
              <option value="media">Ordenar: Maior consumo diário</option>
              <option value="estoque_sat">Ordenar: Menor estoque satélite</option>
              <option value="projecao">Ordenar: Menor projeção satélite</option>
            </select>
          </div>
          {/* Category filters */}
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setFilterCategory('todas')}
              className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all ${filterCategory === 'todas' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'}`}>
              Todas Categorias
            </button>
            {CATEGORY_ORDER.map(cat => {
              const cfg = CATEGORY_CFG[cat];
              const count = items.filter(r => getCategory(r.descricao, r.unidade) === cat).length;
              return (
                <button key={cat} onClick={() => setFilterCategory(cat)}
                  style={filterCategory === cat ? { background: cfg.color, borderColor: cfg.color, color: '#fff' } : { borderColor: cfg.border, color: cfg.color, background: cfg.bg }}
                  className="px-3 py-1 rounded-full text-[11px] font-bold border transition-all hover:opacity-80">
                  {cfg.emoji} {cat} ({count})
                </button>
              );
            })}
          </div>
          {/* Search */}
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input type="text" placeholder="Buscar por nome comercial, genérico ou código..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1"
            />
            <span className="text-xs text-slate-400 shrink-0">{filtered.length} itens</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[640px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800">
                <th className="text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                <th className="text-[11px] font-bold text-white px-3 py-3">Código</th>
                <th className="text-[11px] font-bold text-white px-3 py-3 min-w-[280px]">Produto</th>
                <th className="text-[11px] font-bold text-slate-400 px-3 py-3">Unidade</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Média/dia</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Nec. 5d</th>
                <th className="text-right text-[11px] font-bold text-amber-300 px-3 py-3">+20% Seg.</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Est. Sat. {satNum}</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Est. CAF {cafNum}</th>
                <th className="text-right text-[11px] font-bold text-amber-300 px-3 py-3">Qtde Req.</th>
                <th className="text-center text-[11px] font-bold text-slate-400 px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const renderRow = (row: ReqItem, i: number) => {
                  const cfg = STATUS_CFG[row.status];
                  const projecao = row.mediaDiaria > 0 ? (row.estoqueSat / row.mediaDiaria).toFixed(1) : '—';
                  return (
                    <tr key={row.codigo + i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                      style={{ borderLeft: `3px solid ${cfg.color}` }}>
                      <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{row.codigo}</td>
                      <td className="px-3 py-2.5">
                        <p className="text-xs font-bold text-slate-700 leading-snug">{row.comercial}</p>
                        {row.generico && (
                          <p className="text-[10px] text-slate-400 leading-snug mt-0.5">{row.generico}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">{row.unidade}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-mono text-slate-500">{row.mediaDiaria.toFixed(2)}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-mono text-slate-500">{row.necessidade5d.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-xs text-right font-black text-amber-700">{row.necessidadeSeguranca}</td>
                      <td className={`px-3 py-2.5 text-xs text-right font-mono ${row.estoqueSat < row.necessidadeSeguranca ? 'text-rose-600 font-bold' : 'text-slate-600'}`}>
                        <div>{row.estoqueSat.toLocaleString('pt-BR')}</div>
                        {row.mediaDiaria > 0 && <div className="text-[9px] text-slate-400 font-normal">{projecao}d</div>}
                      </td>
                      <td className={`px-3 py-2.5 text-xs text-right font-mono ${row.estoqueCaf === 0 ? 'text-red-500 font-bold' : row.estoqueCaf < row.qtdePedir ? 'text-violet-600 font-bold' : 'text-slate-600'}`}>
                        {row.estoqueCaf > 0 ? row.estoqueCaf.toLocaleString('pt-BR') : <span className="text-red-500">0</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-right font-black text-indigo-700">
                        {row.qtdeRequisitar > 0 ? row.qtdeRequisitar.toLocaleString('pt-BR') : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${cfg.badge}`}>
                          {cfg.label}
                        </span>
                      </td>
                    </tr>
                  );
                };

                if (groupedRows) {
                  // Render grouped by category
                  let globalIdx = 0;
                  const result: React.ReactNode[] = [];
                  CATEGORY_ORDER.forEach(cat => {
                    const rows = groupedRows.get(cat) || [];
                    if (!rows.length) return;
                    const catCfg = CATEGORY_CFG[cat];
                    result.push(
                      <tr key={`cat-${cat}`} style={{ background: catCfg.bg }}>
                        <td colSpan={11} className="px-4 py-2" style={{ borderLeft: `4px solid ${catCfg.color}` }}>
                          <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: catCfg.color }}>
                            {catCfg.emoji} {cat} — {rows.length} {rows.length === 1 ? 'item' : 'itens'}
                          </span>
                        </td>
                      </tr>
                    );
                    rows.forEach(row => result.push(renderRow(row, ++globalIdx)));
                  });
                  return result;
                }

                // Single category view
                return filtered.slice(0, 400).map((row, i) => renderRow(row, i + 1));
              })()}
            </tbody>
          </table>
          {filtered.length > 400 && (
            <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t">
              Exibindo 400 de {filtered.length} itens. Use os filtros ou busca para refinar.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
