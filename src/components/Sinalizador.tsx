import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import {
  AlertTriangle, Upload, Package, TrendingDown, TrendingUp,
  ShoppingCart, Activity, ChevronUp, ChevronDown, Search, Filter,
  AlertCircle, CheckCircle, DollarSign, Clock
} from 'lucide-react';

/* ─────────────────────────── Types ─────────────────────────── */
interface SkuRow {
  codItem: string;
  descItem: string;
  abc: string;
  pqr: string;
  xyz: string;
  categoria: string;
  vlMedio: number;
  estoqDisp: number;
  estoqTot: number;
  excessoReais: number;
  cobertura: number;
  media6m: number;
  media3m: number;
  qtSC: number;
  qtOC: number;
  dtProxOC: string;
  min: number;
  alvo: number;
  max: number;
  sinalizador: string;
  cons1d: number;
  sugUrg: number;
  sugPlan: number;
  ltTotal: number;
  varCmd: number | null;
}

/* ─────────────────────────── Helpers ─────────────────────────── */
function parseBrNumber(s: string): number {
  if (!s || s.trim() === '' || s.trim() === '-') return 0;
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ';' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCsv(text: string): SkuRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);

  const idx = (name: string) => headers.findIndex(h => h.replace(/"/g, '').trim() === name);

  const iCod     = idx('Cod Item');
  const iDesc    = idx('Desc Item');
  const iABC     = idx('ABC');
  const iPQR     = idx('PQR');
  const iXYZ     = idx('XYZ');
  const iCat     = idx('Categoria');
  const iVlMed   = idx('VL Médio (R$)');
  const iEdDisp  = idx('Estoq Disp');
  const iEdTot   = idx('Estoq Tot');
  const iExcR    = idx('Excesso (R$)');
  const iCob     = idx('Cobertura');
  const iM6      = idx('Média 6M');
  const iM3      = idx('Média 3M');
  const iQtSC    = idx('QT SC');
  const iQtOC    = idx('QT OC');
  const iDtOC    = idx('DT Próx OC');
  const iMin     = idx('Mín');
  const iAlvo    = idx('Alvo');
  const iMax     = idx('Máx.');
  const iSinal   = idx('Sinalizador');
  const iCons1   = idx('Cons 1D');
  const iSugUrg  = idx('Sug Urg');
  const iSugPlan = idx('Sug Plan');
  const iLT      = idx('LT Total');
  const iVar     = idx('Variação CMD7 x CMD30');

  const rows: SkuRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    if (cols.length < 5) continue;
    const ativo = cols[0]?.toLowerCase();
    if (ativo !== 'ativo') continue;

    const varRaw = iVar >= 0 ? cols[iVar] : '';
    const varVal = varRaw.trim() === '' ? null : parseBrNumber(varRaw);

    rows.push({
      codItem:    iCod  >= 0 ? cols[iCod].replace(/"/g, '')  : '',
      descItem:   iDesc >= 0 ? cols[iDesc].replace(/"/g, '') : '',
      abc:        iABC  >= 0 ? cols[iABC].toUpperCase()       : '',
      pqr:        iPQR  >= 0 ? cols[iPQR].toUpperCase()       : '',
      xyz:        iXYZ  >= 0 ? cols[iXYZ].toUpperCase()       : '',
      categoria:  iCat  >= 0 ? cols[iCat].toLowerCase()       : '',
      vlMedio:    iVlMed  >= 0 ? parseBrNumber(cols[iVlMed])  : 0,
      estoqDisp:  iEdDisp >= 0 ? parseBrNumber(cols[iEdDisp]) : 0,
      estoqTot:   iEdTot  >= 0 ? parseBrNumber(cols[iEdTot])  : 0,
      excessoReais: iExcR >= 0 ? parseBrNumber(cols[iExcR])   : 0,
      cobertura:  iCob  >= 0 ? parseBrNumber(cols[iCob])      : 0,
      media6m:    iM6   >= 0 ? parseBrNumber(cols[iM6])       : 0,
      media3m:    iM3   >= 0 ? parseBrNumber(cols[iM3])       : 0,
      qtSC:       iQtSC >= 0 ? parseBrNumber(cols[iQtSC])     : 0,
      qtOC:       iQtOC >= 0 ? parseBrNumber(cols[iQtOC])     : 0,
      dtProxOC:   iDtOC >= 0 ? cols[iDtOC]                    : '',
      min:        iMin  >= 0 ? parseBrNumber(cols[iMin])      : 0,
      alvo:       iAlvo >= 0 ? parseBrNumber(cols[iAlvo])     : 0,
      max:        iMax  >= 0 ? parseBrNumber(cols[iMax])      : 0,
      sinalizador: iSinal >= 0 ? cols[iSinal].replace(/"/g, '').trim() : '',
      cons1d:     iCons1  >= 0 ? parseBrNumber(cols[iCons1])  : 0,
      sugUrg:     iSugUrg >= 0 ? parseBrNumber(cols[iSugUrg]) : 0,
      sugPlan:    iSugPlan >= 0 ? parseBrNumber(cols[iSugPlan]): 0,
      ltTotal:    iLT   >= 0 ? parseBrNumber(cols[iLT])       : 0,
      varCmd:     varVal,
    });
  }
  return rows;
}

/* ─────────────────────────── Color maps ─────────────────────────── */
const SINAL_ORDER = ['Muito Baixo', 'Baixo', 'Normal', 'Alto', 'Muito Alto'];

const SINAL_COLOR: Record<string, string> = {
  'Muito Baixo': '#ef4444',
  'Baixo':       '#f97316',
  'Normal':      '#22c55e',
  'Alto':        '#3b82f6',
  'Muito Alto':  '#8b5cf6',
};

const SINAL_BG: Record<string, string> = {
  'Muito Baixo': 'bg-red-100 text-red-800',
  'Baixo':       'bg-orange-100 text-orange-800',
  'Normal':      'bg-green-100 text-green-800',
  'Alto':        'bg-blue-100 text-blue-800',
  'Muito Alto':  'bg-purple-100 text-purple-800',
};

const ROW_BG: Record<string, string> = {
  'Muito Baixo': 'bg-red-50',
  'Baixo':       'bg-orange-50',
  'Normal':      '',
  'Alto':        '',
  'Muito Alto':  '',
};

const PQR_COLOR: Record<string, string> = {
  'P': '#22c55e',
  'Q': '#f97316',
  'R': '#ef4444',
  'S': '#6b7280',
};

const ABC_COLOR: Record<string, string> = {
  'A': '#8b5cf6',
  'B': '#3b82f6',
  'C': '#94a3b8',
};

/* ─────────────────────────── Formatters ─────────────────────────── */
function fmtBrl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function fmtNum(v: number, dec = 1) {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

/* ─────────────────────────── Sub-components ─────────────────────────── */
interface KpiCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  bg: string;
}
function KpiCard({ icon, label, value, sub, color, bg }: KpiCardProps) {
  return (
    <div className={`rounded-xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 ${bg}`}>
      <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-slate-800 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Upload State ─────────────────────────── */
function UploadScreen({ onFile }: { onFile: (rows: SkuRow[]) => void }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const handle = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Selecione um arquivo .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const rows = parseCsv(text);
        if (rows.length === 0) {
          setError('Nenhum item ativo encontrado no CSV.');
          return;
        }
        onFile(rows);
      } catch {
        setError('Erro ao processar o CSV. Verifique o formato.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }, [onFile]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="text-center">
        <div className="mx-auto w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center mb-4">
          <Activity className="w-8 h-8 text-violet-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800">Sinalizador de Estoque</h2>
        <p className="text-slate-500 mt-2 max-w-md">
          Carregue o arquivo SKU (.csv) para visualizar os indicadores de suprimentos farmacêuticos
        </p>
      </div>

      <label
        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors
          ${dragging ? 'border-violet-500 bg-violet-50' : 'border-slate-300 hover:border-violet-400 hover:bg-slate-50'}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      >
        <Upload className="w-8 h-8 text-slate-400" />
        <div className="text-center">
          <span className="text-violet-600 font-medium">Clique para selecionar</span>
          <span className="text-slate-500"> ou arraste o arquivo aqui</span>
        </div>
        <p className="text-xs text-slate-400">Arquivo SKU exportado do sistema (CSV separado por ponto-e-vírgula)</p>
        <input type="file" accept=".csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
      </label>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Main Component ─────────────────────────── */
export function Sinalizador() {
  const [rows, setRows] = useState<SkuRow[] | null>(null);

  // Table state
  const [filterSinal, setFilterSinal] = useState('Todos');
  const [filterABC, setFilterABC] = useState('Todos');
  const [filterPQR, setFilterPQR] = useState('Todos');
  const [filterCat, setFilterCat] = useState('Todos');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<keyof SkuRow>('sinalizador');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    if (!rows) return null;
    const total = rows.length;
    const ruptura = rows.filter(r => r.sinalizador === 'Muito Baixo').length;
    const semCobertura = rows.filter(r => r.cobertura === 0 && r.estoqDisp === 0).length;
    const sugUrg = rows.filter(r => r.sugUrg > 0).length;
    const excessoTotal = rows.reduce((acc, r) => acc + r.excessoReais, 0);
    const cobMediana = rows.filter(r => r.cobertura > 0).map(r => r.cobertura).sort((a, b) => a - b);
    const cobMed = cobMediana.length ? cobMediana[Math.floor(cobMediana.length / 2)] : 0;
    return { total, ruptura, semCobertura, sugUrg, excessoTotal, cobMed };
  }, [rows]);

  /* ── Charts ── */
  const chartSinal = useMemo(() => {
    if (!rows) return [];
    const counts: Record<string, number> = {};
    rows.forEach(r => { counts[r.sinalizador] = (counts[r.sinalizador] || 0) + 1; });
    return SINAL_ORDER.map(s => ({ name: s, value: counts[s] || 0 })).filter(d => d.value > 0);
  }, [rows]);

  const chartAbcSinal = useMemo(() => {
    if (!rows) return [];
    const map: Record<string, Record<string, number>> = {};
    ['A', 'B', 'C'].forEach(a => { map[a] = {}; SINAL_ORDER.forEach(s => { map[a][s] = 0; }); });
    rows.forEach(r => {
      const a = r.abc || 'C';
      if (map[a]) map[a][r.sinalizador] = (map[a][r.sinalizador] || 0) + 1;
    });
    return ['A', 'B', 'C'].map(a => ({ abc: a, ...map[a] }));
  }, [rows]);

  const chartPQR = useMemo(() => {
    if (!rows) return [];
    const counts: Record<string, number> = {};
    rows.forEach(r => { counts[r.pqr] = (counts[r.pqr] || 0) + 1; });
    const labels: Record<string, string> = { P: 'P — Suave', Q: 'Q — Errático', R: 'R — Intermitente', S: 'S — Sem demanda' };
    return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({ name: labels[k] || k, valor: v, key: k }));
  }, [rows]);

  const chartVarCmd = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter(r => r.varCmd !== null)
      .map(r => ({ name: r.descItem.substring(0, 30), varAbs: Math.abs(r.varCmd!), varReal: r.varCmd!, cod: r.codItem }))
      .sort((a, b) => b.varAbs - a.varAbs)
      .slice(0, 10);
  }, [rows]);

  const chartOC = useMemo(() => {
    if (!rows) return [];
    const counts: Record<string, number> = {};
    rows.forEach(r => {
      if (r.dtProxOC && r.dtProxOC.trim() !== '') {
        counts[r.dtProxOC] = (counts[r.dtProxOC] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([data, qtd]) => ({ data, qtd }))
      .sort((a, b) => {
        const [da, ma, ya] = a.data.split('/').map(Number);
        const [db, mb, yb] = b.data.split('/').map(Number);
        return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
      })
      .slice(0, 15);
  }, [rows]);

  /* ── Filtered Table ── */
  const filtered = useMemo(() => {
    if (!rows) return [];
    let r = rows;
    if (filterSinal !== 'Todos') r = r.filter(x => x.sinalizador === filterSinal);
    if (filterABC !== 'Todos') r = r.filter(x => x.abc === filterABC);
    if (filterPQR !== 'Todos') r = r.filter(x => x.pqr === filterPQR);
    if (filterCat !== 'Todos') r = r.filter(x => x.categoria === filterCat);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(x => x.descItem.toLowerCase().includes(q) || x.codItem.includes(q));
    }
    return [...r].sort((a, b) => {
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      const sinalRankA = SINAL_ORDER.indexOf(a.sinalizador);
      const sinalRankB = SINAL_ORDER.indexOf(b.sinalizador);
      if (sortKey === 'sinalizador') return sortDir === 'asc' ? sinalRankA - sinalRankB : sinalRankB - sinalRankA;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }, [rows, filterSinal, filterABC, filterPQR, filterCat, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (key: keyof SkuRow) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const SortIcon = ({ k }: { k: keyof SkuRow }) => (
    sortKey === k
      ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />
      : null
  );

  if (!rows) return <UploadScreen onFile={setRows} />;

  return (
    <div className="space-y-8 pb-12">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Activity className="w-6 h-6 text-violet-600" />
            Sinalizador de Estoque
          </h1>
          <p className="text-slate-500 text-sm mt-1">{rows.length} SKUs ativos · I-8-HAC</p>
        </div>
        <button
          onClick={() => setRows(null)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm transition-colors"
        >
          <Upload className="w-4 h-4" /> Novo arquivo
        </button>
      </div>

      {/* ── KPI Cards ── */}
      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard icon={<Package className="w-5 h-5" />} label="Total SKUs" value={kpis.total} sub="itens ativos" color="text-slate-600 bg-slate-100" bg="bg-white" />
          <KpiCard icon={<AlertTriangle className="w-5 h-5" />} label="Risco de Ruptura" value={kpis.ruptura} sub="sinalizador Muito Baixo" color="text-red-600 bg-red-100" bg="bg-red-50" />
          <KpiCard icon={<TrendingDown className="w-5 h-5" />} label="Sem Cobertura" value={kpis.semCobertura} sub="estoque zero" color="text-red-500 bg-red-100" bg="bg-red-50" />
          <KpiCard icon={<ShoppingCart className="w-5 h-5" />} label="Sug. Urgente" value={kpis.sugUrg} sub="compra emergencial" color="text-orange-600 bg-orange-100" bg="bg-orange-50" />
          <KpiCard icon={<DollarSign className="w-5 h-5" />} label="Excesso em Estoque" value={fmtBrl(kpis.excessoTotal)} sub="capital imobilizado" color="text-yellow-600 bg-yellow-100" bg="bg-yellow-50" />
          <KpiCard icon={<Clock className="w-5 h-5" />} label="Cobertura Mediana" value={`${fmtNum(kpis.cobMed, 0)} dias`} sub="meta: 15–30 dias" color="text-emerald-600 bg-emerald-100" bg="bg-emerald-50" />
        </div>
      )}

      {/* ── Charts row 1 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Sinalizador */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Distribuição do Sinalizador</h3>
          <p className="text-xs text-slate-400 mb-4">Posição de estoque relativa ao ponto de pedido</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={chartSinal} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false}>
                {chartSinal.map(entry => (
                  <Cell key={entry.name} fill={SINAL_COLOR[entry.name] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => [v, 'itens']} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-3 mt-2 justify-center">
            {chartSinal.map(e => (
              <div key={e.name} className="flex items-center gap-1 text-xs text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: SINAL_COLOR[e.name] }} />
                {e.name}: <strong>{e.value}</strong>
              </div>
            ))}
          </div>
        </div>

        {/* Barras ABC × Sinalizador */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Sinalizador por Classe ABC</h3>
          <p className="text-xs text-slate-400 mb-4">Identificação de itens críticos por valor estratégico</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartAbcSinal} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="abc" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {SINAL_ORDER.filter(s => chartAbcSinal.some(d => (d as any)[s] > 0)).map(s => (
                <Bar key={s} dataKey={s} stackId="a" fill={SINAL_COLOR[s]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Charts row 2 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PQR */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Perfil de Demanda (PQR)</h3>
          <p className="text-xs text-slate-400 mb-4">P = Suave · Q = Errático · R = Intermitente</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartPQR} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v, 'itens']} />
              {chartPQR.map(d => (
                <Bar key={d.key} dataKey="valor" data={[d]} fill={PQR_COLOR[d.key] || '#94a3b8'} name={d.name} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Próximas OCs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Próximas Ordens de Compra</h3>
          <p className="text-xs text-slate-400 mb-4">Itens com OC programada nos próximos dias</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartOC} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="data" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: number) => [v, 'itens']} />
              <Bar dataKey="qtd" fill="#8b5cf6" name="Itens" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top 10 Variação CMD ── */}
      {chartVarCmd.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Top 10 — Variação CMD7 × CMD30</h3>
          <p className="text-xs text-slate-400 mb-4">
            Itens com maior instabilidade de demanda recente · Positivo = aceleração · Negativo = queda
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartVarCmd} layout="vertical" barSize={16}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" width={200} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Variação CMD7 × CMD30']} />
              <Bar dataKey="varReal" name="Variação %" fill="#3b82f6"
                   cell={chartVarCmd.map(d => (
                     <Cell key={d.cod} fill={d.varReal >= 0 ? '#22c55e' : '#ef4444'} />
                   ))}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Tabela ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {/* Filtros */}
        <div className="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2 flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              className="bg-transparent text-sm outline-none w-full placeholder-slate-400"
              placeholder="Buscar por código ou descrição..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
          {[
            { label: 'Sinalizador', value: filterSinal, set: setFilterSinal, options: ['Todos', ...SINAL_ORDER] },
            { label: 'ABC', value: filterABC, set: setFilterABC, options: ['Todos', 'A', 'B', 'C'] },
            { label: 'PQR', value: filterPQR, set: setFilterPQR, options: ['Todos', 'P', 'Q', 'R', 'S'] },
            { label: 'Categoria', value: filterCat, set: setFilterCat, options: ['Todos', 'med', 'mat', 'div'] },
          ].map(f => (
            <select
              key={f.label}
              value={f.value}
              onChange={e => { f.set(e.target.value); setPage(1); }}
              className="text-sm rounded-lg border border-slate-200 px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              {f.options.map(o => <option key={o} value={o}>{f.label === 'Sinalizador' && o !== 'Todos' ? o : o === 'Todos' ? `Todos (${f.label})` : o.toUpperCase()}</option>)}
            </select>
          ))}
          <span className="text-xs text-slate-400 ml-auto">{filtered.length} itens</span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {[
                  { k: 'codItem' as keyof SkuRow, label: 'Cód.' },
                  { k: 'descItem' as keyof SkuRow, label: 'Descrição' },
                  { k: 'abc' as keyof SkuRow, label: 'ABC' },
                  { k: 'pqr' as keyof SkuRow, label: 'PQR' },
                  { k: 'sinalizador' as keyof SkuRow, label: 'Sinalizador' },
                  { k: 'estoqDisp' as keyof SkuRow, label: 'Estoq. Disp.' },
                  { k: 'cobertura' as keyof SkuRow, label: 'Cobertura (d)' },
                  { k: 'media6m' as keyof SkuRow, label: 'CMM 6M' },
                  { k: 'dtProxOC' as keyof SkuRow, label: 'Próx. OC' },
                  { k: 'sugUrg' as keyof SkuRow, label: 'Sug. Urg.' },
                  { k: 'varCmd' as keyof SkuRow, label: 'Var. CMD %' },
                ].map(col => (
                  <th
                    key={col.k}
                    className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 whitespace-nowrap"
                    onClick={() => handleSort(col.k)}
                  >
                    {col.label}<SortIcon k={col.k} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageRows.map((r, i) => (
                <tr key={`${r.codItem}-${i}`} className={`hover:bg-slate-50 transition-colors ${ROW_BG[r.sinalizador] || ''}`}>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{r.codItem}</td>
                  <td className="px-3 py-2.5 text-slate-700 max-w-[280px] truncate" title={r.descItem}>{r.descItem}</td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: ABC_COLOR[r.abc] + '22', color: ABC_COLOR[r.abc] }}>{r.abc}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="px-2 py-0.5 rounded text-xs font-bold" style={{ background: PQR_COLOR[r.pqr] + '22', color: PQR_COLOR[r.pqr] }}>{r.pqr}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${SINAL_BG[r.sinalizador] || 'bg-slate-100 text-slate-700'}`}>{r.sinalizador}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium text-slate-700">{fmtNum(r.estoqDisp, 0)}</td>
                  <td className={`px-3 py-2.5 text-right font-medium ${r.cobertura === 0 ? 'text-red-600' : r.cobertura < 7 ? 'text-orange-600' : 'text-slate-700'}`}>
                    {r.cobertura === 0 ? '—' : fmtNum(r.cobertura, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-slate-600">{fmtNum(r.media6m, 1)}</td>
                  <td className="px-3 py-2.5 text-slate-600 whitespace-nowrap">{r.dtProxOC || '—'}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${r.sugUrg > 0 ? 'text-red-600' : 'text-slate-400'}`}>{r.sugUrg > 0 ? fmtNum(r.sugUrg, 0) : '—'}</td>
                  <td className={`px-3 py-2.5 text-right text-xs ${r.varCmd === null ? 'text-slate-400' : r.varCmd > 50 ? 'text-green-600 font-semibold' : r.varCmd < -50 ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                    {r.varCmd === null ? '—' : `${r.varCmd > 0 ? '+' : ''}${fmtNum(r.varCmd, 1)}%`}
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Nenhum item encontrado com os filtros selecionados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">Página {page} de {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                Anterior
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 transition-colors">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Legenda técnica ── */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
        <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-500" /> Referência — Indicadores de Suprimentos Farmacêuticos
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-500">
          <div><strong className="text-slate-700">Sinalizador</strong> — Relação estoque atual × ponto de pedido. "Muito Baixo" = ruptura iminente.</div>
          <div><strong className="text-slate-700">Cobertura (dias)</strong> — Estoq. Disp ÷ CMM. Meta: 15–30 dias (RDC 204/2017).</div>
          <div><strong className="text-slate-700">PQR</strong> — Perfil de demanda: P (suave), Q (errático), R (intermitente). Orienta política de ressuprimento.</div>
          <div><strong className="text-slate-700">Variação CMD7×CMD30</strong> — Sinal de aceleração/desaceleração de consumo. Alertas {'>'} ±50%.</div>
        </div>
      </div>
    </div>
  );
}
