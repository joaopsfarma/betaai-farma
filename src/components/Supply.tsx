import React, { useState, useMemo, useCallback } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  Upload, Search, Package, TrendingDown, AlertTriangle,
  DollarSign, X, ChevronUp, ChevronDown, Pill, Truck, BarChart2
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, ComposedChart, ScatterChart, Scatter,
  ZAxis, LabelList, ReferenceLine
} from 'recharts';

// ─── Palette ─────────────────────────────────────────────────────────────────
const C = {
  violet:  ['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'],
  emerald: ['#059669','#10b981','#34d399','#6ee7b7','#a7f3d0'],
  red:     ['#dc2626','#ef4444','#f87171','#fca5a5','#fecaca'],
  blue:    ['#2563eb','#3b82f6','#60a5fa','#93c5fd','#bfdbfe'],
  orange:  ['#d97706','#f59e0b','#fbbf24','#fcd34d','#fde68a'],
  slate:   ['#334155','#475569','#64748b','#94a3b8','#cbd5e1'],
  mixed:   ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#0891b2','#db2777','#65a30d'],
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface CriticidadeItem {
  dataLC: string; hosp: string; codItem: string; descItem: string;
  estoqDisp: number; cobDisp: number; estoqDispSubs: number; cobDispSubs: number;
  estoqTotal: number; cobTotal: number; dataEntrada: string;
  cd7: number; cd15: number; cd30: number; cd60: number; cd90: number;
  varCD30CD7: string; varCD90CD30: string; causa: string;
  setorResponsavel: string; observacao: string; acao: string;
  gestor: string; sub1: string; sub2: string; sub3: string;
}
interface ItensItem {
  hosp: string; codProduto: string; produto: string; gestao: string;
  padronizado: string; especie: string; classificacao: string;
  qtdEstoque: number; valorEstoque: number; qtdConsumo30D: number;
  consumo30D: number; consumo2M: number; consumo3M: number;
  consumo4M: number; consumo5M: number; consumo6M: number; pme: number;
}
interface CausasRupturaItem {
  causa: string;
  percentual: number; // 0-100
}

type SortDir = 'asc' | 'desc';
type SubTab = 'criticidade' | 'materiais' | 'medicamentos' | 'causas_ruptura';

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  fields.push(cur.trim());
  return fields;
}
const pn = (v?: string) => parseFloat((v || '').replace(',', '.')) || 0;

function parseCriticidade(csv: string): CriticidadeItem[] {
  return csv.split('\n').slice(1).map(l => { const r = parseCSVLine(l.trim()); return r[2] ? {
    dataLC:r[0],hosp:r[1],codItem:r[2],descItem:r[3],
    estoqDisp:pn(r[4]),cobDisp:pn(r[5]),estoqDispSubs:pn(r[6]),cobDispSubs:pn(r[7]),
    estoqTotal:pn(r[8]),cobTotal:pn(r[9]),dataEntrada:r[10],
    cd7:pn(r[11]),cd15:pn(r[12]),cd30:pn(r[13]),cd60:pn(r[14]),cd90:pn(r[15]),
    varCD30CD7:r[16],varCD90CD30:r[17],causa:r[18],setorResponsavel:r[19],
    observacao:r[20],acao:r[21],gestor:r[22],sub1:r[23],sub2:r[24],sub3:r[25],
  } : null; }).filter(Boolean) as CriticidadeItem[];
}
function parseItens(csv: string): ItensItem[] {
  return csv.split('\n').slice(1).map(l => { const r = parseCSVLine(l.trim()); return r[1] ? {
    hosp:r[0],codProduto:r[1],produto:r[2],gestao:r[3],padronizado:r[4],
    especie:r[5],classificacao:r[6],qtdEstoque:pn(r[7]),valorEstoque:pn(r[8]),
    qtdConsumo30D:pn(r[9]),consumo30D:pn(r[10]),consumo2M:pn(r[11]),
    consumo3M:pn(r[12]),consumo4M:pn(r[13]),consumo5M:pn(r[14]),
    consumo6M:pn(r[15]),pme:pn(r[16]),
  } : null; }).filter(Boolean) as ItensItem[];
}

function parseCausasRuptura(csv: string): CausasRupturaItem[] {
  return csv.split('\n').slice(1).map(l => {
    const r = parseCSVLine(l.trim());
    const causa = r[0]?.trim() || 'Outros';
    const pctStr = (r[1] || '').replace('%','').replace(',','.').trim();
    const percentual = parseFloat(pctStr) || 0;
    return percentual > 0 ? { causa: causa || 'Outros', percentual } : null;
  }).filter(Boolean) as CausasRupturaItem[];
}

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtN = new Intl.NumberFormat('pt-BR');
const fmtBRL = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const fmtM = (v: number) => v >= 1e6 ? `R$${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `R$${(v/1e3).toFixed(0)}k` : `R$${v.toFixed(0)}`;
const fmtK = (v: number) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1e3 ? `${(v/1e3).toFixed(0)}k` : String(v);

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cobBadge(cob: number) {
  if (cob === 0) return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">ZERO</span>;
  if (cob <= 3)  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700">{cob}d</span>;
  if (cob <= 7)  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">{cob}d</span>;
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{cob}d</span>;
}
function pmeBadge(pme: number) {
  if (pme <= 10) return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700">{pme}d</span>;
  if (pme <= 20) return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-700">{pme}d</span>;
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">{pme}d</span>;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const TT: React.FC<any> = ({ active, payload, label, currency }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
      {label !== undefined && <p className="font-semibold text-slate-700 mb-1.5">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color || p.fill }} className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-slate-500">{p.name}:</span>
          <span className="font-semibold text-slate-900">
            {currency ? fmtBRL.format(p.value) : fmtN.format(p.value)}
          </span>
        </p>
      ))}
    </div>
  );
};

// ─── Chart Card wrapper ───────────────────────────────────────────────────────
const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; className?: string; height?: number }> =
  ({ title, subtitle, children, className = '', height = 220 }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 p-4 shadow-sm min-w-0 ${className}`}>
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5 mb-3">{subtitle}</p>}
    <div className="mt-3 w-full" style={{ height }}>{children}</div>
  </div>
);

// ─── Sort hook ────────────────────────────────────────────────────────────────
function useSortState(defaultKey: string) {
  const [sortKey, setSortKey] = useState(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const toggle = useCallback((k: string) => {
    setSortKey(prev => { if (k === prev) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; } setSortDir('asc'); return k; });
  }, []);
  const Th: React.FC<{ k: string; children: React.ReactNode; className?: string }> = ({ k, children, className }) => (
    <th className={`px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-700 select-none whitespace-nowrap ${className}`} onClick={() => toggle(k)}>
      <span className="flex items-center gap-1">{children}
        {sortKey === k ? sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" /> : <span className="w-3" />}
      </span>
    </th>
  );
  return { sortKey, sortDir, Th };
}

// ─── Upload Card ──────────────────────────────────────────────────────────────
const UploadCard: React.FC<{
  label: string; icon: React.ReactNode; loaded: boolean; count: number;
  colorClass: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void;
}> = ({ label, icon, loaded, count, colorClass, onChange, onClear }) => (
  <div className={`relative rounded-2xl border-2 p-4 transition-all ${loaded ? `${colorClass} border-current` : 'border-dashed border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
    {loaded && <button onClick={onClear} className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>}
    <div className="flex items-center gap-3 mb-3">
      <div className="p-2 rounded-xl bg-white/60">{icon}</div>
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500">{loaded ? `${count} itens` : 'Nenhum arquivo'}</p>
      </div>
    </div>
    <label className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl text-xs font-medium cursor-pointer bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all">
      <Upload className="w-3 h-3" />{loaded ? 'Trocar arquivo' : 'Carregar CSV'}
      <input type="file" accept=".csv" className="hidden" onChange={onChange} />
    </label>
  </div>
);

// ─── KPI Card ─────────────────────────────────────────────────────────────────
const KpiCard: React.FC<{ label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }> =
  ({ label, value, sub, icon, accent }) => (
  <div className={`bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 ${accent}`}>
    <div className="p-2.5 rounded-xl bg-slate-50">{icon}</div>
    <div>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
      <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICIDADE CHARTS
// ═══════════════════════════════════════════════════════════════════════════════
const CriticidadeCharts: React.FC<{ data: CriticidadeItem[] }> = ({ data }) => {
  // 1. Por Causa — Pie
  const causaData = useMemo(() => {
    const m: Record<string,number> = {};
    data.forEach(d => { const k = d.causa || 'Sem causa'; m[k] = (m[k]||0)+1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value);
  }, [data]);

  // 2. Por Cobertura Total — Bar
  const cobData = useMemo(() => [
    { faixa:'Zerado',    qt: data.filter(d => d.cobTotal === 0).length },
    { faixa:'1-3 dias',  qt: data.filter(d => d.cobTotal > 0 && d.cobTotal <= 3).length },
    { faixa:'4-7 dias',  qt: data.filter(d => d.cobTotal > 3 && d.cobTotal <= 7).length },
    { faixa:'8-15 dias', qt: data.filter(d => d.cobTotal > 7 && d.cobTotal <= 15).length },
    { faixa:'>15 dias',  qt: data.filter(d => d.cobTotal > 15).length },
  ], [data]);
  const cobColors = [C.red[0], C.orange[0], C.orange[2], C.emerald[1], C.emerald[0]];

  // 3. Top 10 por CD30 — Horizontal Bar
  const top10cd30 = useMemo(() =>
    [...data].sort((a,b)=>b.cd30-a.cd30).slice(0,10).map(d => ({
      name: d.descItem.substring(0,28)+'…',
      cd30: d.cd30,
      cd7:  d.cd7,
    })), [data]);

  // 4. Por Setor Responsável — Donut
  const setorData = useMemo(() => {
    const m: Record<string,number> = {};
    data.forEach(d => { const k = d.setorResponsavel || 'N/A'; m[k] = (m[k]||0)+1; });
    return Object.entries(m).map(([name, value]) => ({ name, value })).sort((a,b) => b.value-a.value);
  }, [data]);

  // 5. Tendência CD7→CD90 — Line (média geral)
  const tendencia = useMemo(() => [
    { periodo:'CD7',  media: data.length ? data.reduce((s,d)=>s+d.cd7,0)/data.length : 0 },
    { periodo:'CD15', media: data.length ? data.reduce((s,d)=>s+d.cd15,0)/data.length : 0 },
    { periodo:'CD30', media: data.length ? data.reduce((s,d)=>s+d.cd30,0)/data.length : 0 },
    { periodo:'CD60', media: data.length ? data.reduce((s,d)=>s+d.cd60,0)/data.length : 0 },
    { periodo:'CD90', media: data.length ? data.reduce((s,d)=>s+d.cd90,0)/data.length : 0 },
  ], [data]);

  // 6. Estoque Disp vs Total — Composed (Bar + Line)
  const estoqComp = useMemo(() =>
    [...data].sort((a,b)=>b.estoqTotal-a.estoqTotal).slice(0,12).map(d => ({
      name: d.codItem,
      total: d.estoqTotal,
      disp:  d.estoqDisp,
      cob:   d.cobTotal,
    })), [data]);

  // 7. Radar — perfil da criticidade
  const radarData = useMemo(() => {
    if (!data.length) return [];
    const avg = (fn: (d: CriticidadeItem) => number) => data.reduce((s,d)=>s+fn(d),0)/data.length;
    const max = (fn: (d: CriticidadeItem) => number) => Math.max(...data.map(fn)) || 1;
    return [
      { metric:'CD7',    valor: avg(d=>d.cd7)/max(d=>d.cd7)*100 },
      { metric:'CD30',   valor: avg(d=>d.cd30)/max(d=>d.cd30)*100 },
      { metric:'CD90',   valor: avg(d=>d.cd90)/max(d=>d.cd90)*100 },
      { metric:'EstDisp',valor: avg(d=>d.estoqDisp)/max(d=>d.estoqDisp)*100 },
      { metric:'CobTotal',valor: avg(d=>d.cobTotal)/max(d=>d.cobTotal)*100 },
    ];
  }, [data]);

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
      fill="white" textAnchor="middle" dominantBaseline="central" className="text-[10px]" fontSize={10} fontWeight={700}>
      {`${(percent*100).toFixed(0)}%`}
    </text>;
  };

  return (
    <div className="space-y-4 mb-6">
      {/* Row 1: Pie + Bar cobertura + Donut setor */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-w-0">
        <ChartCard title="Causa da Criticidade" subtitle="Distribuição por motivo" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={causaData} cx="50%" cy="50%" outerRadius={80} dataKey="value" labelLine={false} label={renderLabel}>
                {causaData.map((_,i) => <Cell key={i} fill={C.mixed[i % C.mixed.length]} />)}
              </Pie>
              <Tooltip content={<TT />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuição por Cobertura" subtitle="Faixas de dias de estoque total" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={cobData} margin={{ top:5, right:10, left:-20, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="faixa" tick={{ fontSize:10 }} />
              <YAxis tick={{ fontSize:10 }} />
              <Tooltip content={<TT />} />
              <Bar dataKey="qt" name="Itens" radius={[6,6,0,0]}>
                {cobData.map((_,i) => <Cell key={i} fill={cobColors[i]} />)}
                <LabelList dataKey="qt" position="top" style={{ fontSize:10, fill:'#475569', fontWeight:700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Setor Responsável" subtitle="Distribuição por área" height={220}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={setorData} cx="50%" cy="50%" innerRadius={45} outerRadius={80} dataKey="value" labelLine={false} label={renderLabel}>
                {setorData.map((_,i) => <Cell key={i} fill={C.violet[i % C.violet.length]} />)}
              </Pie>
              <Tooltip content={<TT />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Top10 CD30 horizontal + Line tendência */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Top 10 — Maior Consumo CD30" subtitle="Itens com maior demanda nos últimos 30 dias" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10cd30} layout="vertical" margin={{ top:0, right:40, left:10, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="name" width={160} tick={{ fontSize:9 }} />
              <Tooltip content={<TT />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="cd30" name="CD30" fill={C.violet[0]} radius={[0,6,6,0]}>
                <LabelList dataKey="cd30" position="right" style={{ fontSize:9, fill:'#475569' }} formatter={fmtK} />
              </Bar>
              <Bar dataKey="cd7" name="CD7" fill={C.blue[2]} radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Tendência de Consumo Médio" subtitle="Evolução dos consumos diários médios" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tendencia} margin={{ top:5, right:20, left:-10, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="periodo" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip content={<TT />} />
              <ReferenceLine y={tendencia[2]?.media} stroke={C.orange[0]} strokeDasharray="4 4" label={{ value:'CD30', fill:C.orange[0], fontSize:10 }} />
              <Line type="monotone" dataKey="media" name="Consumo Médio" stroke={C.violet[0]} strokeWidth={2.5} dot={{ fill:C.violet[0], r:5 }} activeDot={{ r:7 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Composed estoque + Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Estoque Disponível vs Total" subtitle="Top 12 itens — barras empilhadas" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={estoqComp} margin={{ top:5, right:20, left:-10, bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize:9 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtK} />
              <Tooltip content={<TT />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="total" name="Estq. Total" fill={C.blue[2]} radius={[4,4,0,0]} />
              <Bar dataKey="disp"  name="Estq. Disp." fill={C.emerald[0]} radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="cob" name="Cob. Total (d)" stroke={C.orange[0]} strokeWidth={2} dot={{ r:3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Radar de Perfil da Criticidade" subtitle="Indicadores normalizados (0–100)" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize:11, fill:'#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0,100]} tick={{ fontSize:9 }} tickCount={4} />
              <Radar name="Perfil" dataKey="valor" stroke={C.violet[0]} fill={C.violet[0]} fillOpacity={0.25} strokeWidth={2} dot={{ fill:C.violet[0], r:4 }} />
              <Tooltip content={<TT />} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ITENS CHARTS (shared for Materiais and Medicamentos)
// ═══════════════════════════════════════════════════════════════════════════════
const ItensCharts: React.FC<{ data: ItensItem[]; accent: string[] }> = ({ data, accent }) => {
  // 1. Top 10 por Valor Estoque — Bar vertical
  const top10Valor = useMemo(() =>
    [...data].sort((a,b)=>b.valorEstoque-a.valorEstoque).slice(0,10).map(d => ({
      name: d.produto.substring(0,22)+'…',
      valor: Math.round(d.valorEstoque),
      qtd: d.qtdEstoque,
    })), [data]);

  // 2. Distribuição PME — Bar
  const pmeData = useMemo(() => [
    { faixa:'≤10d',    qt: data.filter(d=>d.pme<=10).length },
    { faixa:'11-20d',  qt: data.filter(d=>d.pme>10&&d.pme<=20).length },
    { faixa:'21-30d',  qt: data.filter(d=>d.pme>20&&d.pme<=30).length },
    { faixa:'31-60d',  qt: data.filter(d=>d.pme>30&&d.pme<=60).length },
    { faixa:'>60d',    qt: data.filter(d=>d.pme>60).length },
  ], [data]);
  const pmeColors = [C.red[0], C.orange[0], C.orange[2], C.emerald[1], C.emerald[0]];

  // 3. Evolução consumo médio — Area
  const consumoTrend = useMemo(() => {
    if (!data.length) return [];
    const avg = (fn: (d: ItensItem)=>number) => data.reduce((s,d)=>s+fn(d),0)/data.length;
    return [
      { mes:'30D', media: avg(d=>d.consumo30D) },
      { mes:'2M',  media: avg(d=>d.consumo2M)/2 },
      { mes:'3M',  media: avg(d=>d.consumo3M)/3 },
      { mes:'4M',  media: avg(d=>d.consumo4M)/4 },
      { mes:'5M',  media: avg(d=>d.consumo5M)/5 },
      { mes:'6M',  media: avg(d=>d.consumo6M)/6 },
    ];
  }, [data]);

  // 4. Gestão PME — Donut
  const gestaoData = useMemo(() => {
    const m: Record<string,number> = {};
    data.forEach(d => { const k = d.gestao || 'N/A'; m[k] = (m[k]||0)+1; });
    return Object.entries(m).map(([name,value]) => ({ name, value })).sort((a,b)=>b.value-a.value);
  }, [data]);

  // 5. Scatter — Qtd Estoque vs Valor Estoque (top 60)
  const scatterData = useMemo(() =>
    [...data].sort((a,b)=>b.valorEstoque-a.valorEstoque).slice(0,60).map(d => ({
      x: d.qtdEstoque,
      y: Math.round(d.valorEstoque),
      z: d.pme,
      name: d.produto.substring(0,24),
    })), [data]);

  // 6. Consumo 30D vs 6M Top 10 — Composed
  const consComp = useMemo(() =>
    [...data].sort((a,b)=>b.consumo30D-a.consumo30D).slice(0,10).map(d => ({
      name: d.codProduto,
      c30: Math.round(d.consumo30D),
      c6m: Math.round(d.consumo6M/6),
      pme: d.pme,
    })), [data]);

  // 7. Radar — métricas normalizadas
  const radarData = useMemo(() => {
    if (!data.length) return [];
    const avg = (fn: (d: ItensItem)=>number) => data.reduce((s,d)=>s+fn(d),0)/data.length;
    const mx  = (fn: (d: ItensItem)=>number) => Math.max(...data.map(fn)) || 1;
    return [
      { metric:'Estoque', valor: avg(d=>d.qtdEstoque)/mx(d=>d.qtdEstoque)*100 },
      { metric:'Valor',   valor: avg(d=>d.valorEstoque)/mx(d=>d.valorEstoque)*100 },
      { metric:'C30D',    valor: avg(d=>d.consumo30D)/mx(d=>d.consumo30D)*100 },
      { metric:'C6M',     valor: avg(d=>d.consumo6M)/mx(d=>d.consumo6M)*100 },
      { metric:'PME',     valor: avg(d=>d.pme)/mx(d=>d.pme)*100 },
    ];
  }, [data]);

  return (
    <div className="space-y-4 mb-6">
      {/* Row 1: Top10 valor + PME dist */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Top 10 por Valor de Estoque" subtitle="Itens com maior valor financeiro" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top10Valor} layout="vertical" margin={{ top:0, right:60, left:10, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize:10 }} tickFormatter={fmtM} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fontSize:9 }} />
              <Tooltip content={<TT currency />} />
              <Bar dataKey="valor" name="Valor Estoque" fill={accent[0]} radius={[0,6,6,0]}>
                <LabelList dataKey="valor" position="right" style={{ fontSize:9, fill:'#475569' }} formatter={fmtM} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Distribuição por PME" subtitle="Prazo médio de estoque em faixas" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pmeData} margin={{ top:5, right:10, left:-20, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="faixa" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} />
              <Tooltip content={<TT />} />
              <Bar dataKey="qt" name="Itens" radius={[6,6,0,0]}>
                {pmeData.map((_,i) => <Cell key={i} fill={pmeColors[i]} />)}
                <LabelList dataKey="qt" position="top" style={{ fontSize:10, fill:'#475569', fontWeight:700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Area tendência consumo + Donut gestão */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Evolução do Consumo Médio Mensal" subtitle="Consumo médio por item ao longo dos períodos" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={consumoTrend} margin={{ top:5, right:20, left:-10, bottom:5 }}>
              <defs>
                <linearGradient id="gradConsume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accent[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={accent[0]} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize:11 }} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtM} />
              <Tooltip content={<TT currency />} />
              <Area type="monotone" dataKey="media" name="Consumo Médio/Mês" stroke={accent[0]} fill="url(#gradConsume)" strokeWidth={2.5} dot={{ fill:accent[0], r:4 }} activeDot={{ r:7 }} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Gestão PME" subtitle="Distribuição por tipo de gestão" height={240}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={gestaoData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value"
                label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent*100).toFixed(0)}%` : ''}
                labelLine={{ stroke:'#94a3b8', strokeWidth:1 }}>
                {gestaoData.map((_,i) => <Cell key={i} fill={accent[i % accent.length] || C.slate[i % C.slate.length]} />)}
              </Pie>
              <Tooltip content={<TT />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 3: Composed C30 vs C6M + Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Consumo 30D vs Média Mensal 6M" subtitle="Top 10 por consumo — comparativo de ritmo" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={consComp} margin={{ top:5, right:20, left:-10, bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize:9 }} angle={-45} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={fmtM} />
              <Tooltip content={<TT currency />} />
              <Legend iconSize={8} wrapperStyle={{ fontSize:11 }} />
              <Bar dataKey="c30" name="Consumo 30D" fill={accent[0]} radius={[4,4,0,0]} />
              <Bar dataKey="c6m" name="Média/Mês 6M" fill={accent[2] || C.slate[2]} radius={[4,4,0,0]} />
              <Line type="monotone" dataKey="pme" name="PME (d)" stroke={C.orange[0]} strokeWidth={2} dot={{ r:3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Radar de Métricas" subtitle="Indicadores médios normalizados (0–100)" height={260}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} cx="50%" cy="50%" outerRadius={90}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize:11, fill:'#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0,100]} tick={{ fontSize:9 }} tickCount={4} />
              <Radar name="Perfil" dataKey="valor" stroke={accent[0]} fill={accent[0]} fillOpacity={0.25} strokeWidth={2} dot={{ fill:accent[0], r:4 }} />
              <Tooltip content={<TT />} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 4: Scatter */}
      <ChartCard title="Scatter — Quantidade vs Valor de Estoque" subtitle="Cada ponto = 1 item (tamanho proporcional ao PME)" height={280}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top:10, right:30, left:0, bottom:10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis type="number" dataKey="x" name="Qtd Estoque" tick={{ fontSize:10 }} tickFormatter={fmtK} label={{ value:'Qtd. Estoque', position:'insideBottom', offset:-5, fontSize:11, fill:'#64748b' }} />
            <YAxis type="number" dataKey="y" name="Valor Estoque" tick={{ fontSize:10 }} tickFormatter={fmtM} label={{ value:'Valor (R$)', angle:-90, position:'insideLeft', fontSize:11, fill:'#64748b' }} />
            <ZAxis type="number" dataKey="z" range={[30,300]} name="PME (d)" />
            <Tooltip cursor={{ strokeDasharray:'3 3' }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]?.payload;
              return <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[180px]">
                <p className="font-semibold text-slate-800 mb-1">{d?.name}</p>
                <p className="text-slate-500">Qtd: <span className="font-bold text-slate-900">{fmtN.format(d?.x)}</span></p>
                <p className="text-slate-500">Valor: <span className="font-bold text-slate-900">{fmtBRL.format(d?.y)}</span></p>
                <p className="text-slate-500">PME: <span className="font-bold text-slate-900">{d?.z}d</span></p>
              </div>;
            }} />
            <Scatter name="Itens" data={scatterData} fill={accent[0]} fillOpacity={0.6} />
          </ScatterChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRITICIDADE TABLE
// ═══════════════════════════════════════════════════════════════════════════════
const CriticidadeTab: React.FC<{ data: CriticidadeItem[] }> = ({ data }) => {
  const [search, setSearch] = useState('');
  const [filterCausa, setFilterCausa] = useState('Todos');
  const { sortKey, sortDir, Th } = useSortState('cobTotal');
  const causas = useMemo(() => ['Todos', ...Array.from(new Set(data.map(d=>d.causa).filter(Boolean))).sort()], [data]);
  const filtered = useMemo(() => {
    let d = data;
    if (search) { const q=search.toLowerCase(); d=d.filter(i=>i.descItem.toLowerCase().includes(q)||i.codItem.includes(q)||i.gestor.toLowerCase().includes(q)); }
    if (filterCausa !== 'Todos') d=d.filter(i=>i.causa===filterCausa);
    return [...d].sort((a,b) => { let va=(a as any)[sortKey], vb=(b as any)[sortKey]; if(typeof va==='string'){va=va.toLowerCase();vb=(vb as string).toLowerCase();} return va<vb?(sortDir==='asc'?-1:1):va>vb?(sortDir==='asc'?1:-1):0; });
  }, [data,search,filterCausa,sortKey,sortDir]);

  return (
    <div>
      <CriticidadeCharts data={data} />
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="Buscar item, código, gestor..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" value={filterCausa} onChange={e=>setFilterCausa(e.target.value)}>
          {causas.map(c=><option key={c}>{c}</option>)}
        </select>
        <span className="self-center text-xs text-slate-400">{filtered.length} itens</span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <Th k="codItem">Código</Th><Th k="descItem">Descrição</Th>
              <Th k="estoqDisp">Estq.Disp.</Th><Th k="cobDisp">Cob.Disp.</Th>
              <Th k="estoqTotal">Estq.Total</Th><Th k="cobTotal">Cob.Total</Th>
              <Th k="cd30">CD30</Th><Th k="cd90">CD90</Th>
              <Th k="causa">Causa</Th><Th k="gestor">Gestor</Th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Observação</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length===0 && <tr><td colSpan={12} className="py-12 text-center text-slate-400 text-sm">Nenhum item encontrado</td></tr>}
            {filtered.map((item,i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{item.codItem}</td>
                <td className="px-3 py-2.5 text-slate-900 font-medium max-w-[200px]"><span className="line-clamp-2 capitalize text-xs">{item.descItem}</span></td>
                <td className="px-3 py-2.5 text-center text-xs">{fmtN.format(item.estoqDisp)}</td>
                <td className="px-3 py-2.5 text-center">{cobBadge(item.cobDisp)}</td>
                <td className="px-3 py-2.5 text-center text-xs">{fmtN.format(item.estoqTotal)}</td>
                <td className="px-3 py-2.5 text-center">{cobBadge(item.cobTotal)}</td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-600">{fmtN.format(item.cd30)}</td>
                <td className="px-3 py-2.5 text-center text-xs text-slate-600">{fmtN.format(item.cd90)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">{item.causa && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700">{item.causa}</span>}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{item.gestor}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[180px]"><span className="line-clamp-2">{item.observacao}</span></td>
                <td className="px-3 py-2.5 text-xs">{item.acao && <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{item.acao}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// ITENS TABLE
// ═══════════════════════════════════════════════════════════════════════════════
const ItensTab: React.FC<{ data: ItensItem[]; accentColors: string[] }> = ({ data, accentColors }) => {
  const [search, setSearch] = useState('');
  const [filterGestao, setFilterGestao] = useState('Todos');
  const { sortKey, sortDir, Th } = useSortState('valorEstoque');
  const gestoes = useMemo(() => ['Todos', ...Array.from(new Set(data.map(d=>d.gestao).filter(Boolean))).sort()], [data]);
  const filtered = useMemo(() => {
    let d = data;
    if (search) { const q=search.toLowerCase(); d=d.filter(i=>i.produto.toLowerCase().includes(q)||i.codProduto.includes(q)); }
    if (filterGestao !== 'Todos') d=d.filter(i=>i.gestao===filterGestao);
    return [...d].sort((a,b) => { let va=(a as any)[sortKey], vb=(b as any)[sortKey]; if(typeof va==='string'){va=va.toLowerCase();vb=(vb as string).toLowerCase();} return va<vb?(sortDir==='asc'?-1:1):va>vb?(sortDir==='asc'?1:-1):0; });
  }, [data,search,filterGestao,sortKey,sortDir]);

  const totalValor = useMemo(() => data.reduce((s,i)=>s+i.valorEstoque,0), [data]);

  return (
    <div>
      <ItensCharts data={data} accent={accentColors} />
      <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 mb-4 flex flex-wrap gap-6 text-sm">
        <div><span className="text-slate-500">Total itens: </span><span className="font-bold text-slate-900">{fmtN.format(data.length)}</span></div>
        <div><span className="text-slate-500">Valor total: </span><span className="font-bold text-slate-900">{fmtBRL.format(totalValor)}</span></div>
        <div><span className="text-slate-500">PME médio: </span><span className="font-bold text-slate-900">{data.length ? Math.round(data.reduce((s,i)=>s+i.pme,0)/data.length) : 0}d</span></div>
      </div>
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-300" placeholder="Buscar produto ou código..." value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-violet-300" value={filterGestao} onChange={e=>setFilterGestao(e.target.value)}>
          {gestoes.map(g=><option key={g}>{g}</option>)}
        </select>
        <span className="self-center text-xs text-slate-400">{filtered.length} itens</span>
      </div>
      <div className="overflow-auto rounded-xl border border-slate-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
            <tr>
              <Th k="codProduto">Código</Th><Th k="produto">Produto</Th>
              <Th k="gestao">Gestão</Th><Th k="qtdEstoque">Qtd.Estoque</Th>
              <Th k="valorEstoque">Valor Estoque</Th><Th k="qtdConsumo30D">C30D Qtd</Th>
              <Th k="consumo30D">C30D R$</Th><Th k="consumo6M">C6M R$</Th><Th k="pme">PME</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length===0 && <tr><td colSpan={9} className="py-12 text-center text-slate-400 text-sm">Nenhum item encontrado</td></tr>}
            {filtered.map((item,i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{item.codProduto}</td>
                <td className="px-3 py-2.5 text-slate-900 font-medium max-w-[240px]"><span className="line-clamp-2 text-xs">{item.produto}</span></td>
                <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">{item.gestao}</span></td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-700">{fmtN.format(item.qtdEstoque)}</td>
                <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-900">{fmtBRL.format(item.valorEstoque)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-600">{fmtN.format(item.qtdConsumo30D)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-600">{fmtBRL.format(item.consumo30D)}</td>
                <td className="px-3 py-2.5 text-right text-xs text-slate-600">{fmtBRL.format(item.consumo6M)}</td>
                <td className="px-3 py-2.5 text-center">{pmeBadge(item.pme)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CAUSAS DE RUPTURA TAB
// ═══════════════════════════════════════════════════════════════════════════════
const CausasRupturaTab: React.FC<{ data: CausasRupturaItem[] }> = ({ data }) => {
  const sorted = useMemo(() => [...data].sort((a,b) => b.percentual - a.percentual), [data]);
  const COLORS = [C.red[0], C.orange[0], C.violet[0], C.blue[0], C.emerald[0], C.slate[0], C.orange[2]];

  // Donut data
  const pieData = sorted.map(d => ({ name: d.causa, value: d.percentual }));

  // Waterfall-style: cumulative
  const waterfall = useMemo(() => {
    let cum = 0;
    return sorted.map(d => {
      const prev = cum;
      cum += d.percentual;
      return { causa: d.causa.length > 22 ? d.causa.substring(0,22)+'…' : d.causa, pct: d.percentual, base: prev };
    });
  }, [sorted]);

  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.04) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return <text x={cx + r*Math.cos(-midAngle*RADIAN)} y={cy + r*Math.sin(-midAngle*RADIAN)}
      fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
      {`${(percent*100).toFixed(1)}%`}
    </text>;
  };

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {sorted.slice(0,4).map((item, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm" style={{ borderLeftColor: COLORS[i], borderLeftWidth: 4 }}>
            <p className="text-xs text-slate-500 font-medium leading-tight">{item.causa}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: COLORS[i] }}>{item.percentual.toFixed(2).replace('.',',')}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width:`${item.percentual}%`, background: COLORS[i] }} />
            </div>
          </div>
        ))}
      </div>

      {/* Charts row 1: Donut + Horizontal bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Distribuição de Causas de Ruptura" subtitle="% do total de itens em criticidade" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={65} outerRadius={110}
                dataKey="value" labelLine={false} label={renderLabel}>
                {pieData.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(2).replace('.',',')}%`} />
              <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize:11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Ranking de Causas" subtitle="Ordenado por participação percentual" height={300}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted.map(d=>({ ...d, pct: d.percentual }))} layout="vertical"
              margin={{ top:0, right:55, left:10, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize:10 }} domain={[0,50]} tickFormatter={v=>`${v}%`} />
              <YAxis type="category" dataKey="causa" width={160} tick={{ fontSize:10 }} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(2).replace('.',',')}%`} />
              <Bar dataKey="pct" name="Participação" radius={[0,6,6,0]}>
                {sorted.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                <LabelList dataKey="pct" position="right" style={{ fontSize:10, fill:'#475569', fontWeight:600 }}
                  formatter={(v: number) => `${v.toFixed(1).replace('.',',')}%`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Chart row 2: Waterfall acumulado + Radar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
        <ChartCard title="Acumulado de Causas (Pareto)" subtitle="Contribuição cumulativa das causas" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={waterfall} margin={{ top:5, right:20, left:-10, bottom:40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="causa" tick={{ fontSize:9 }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize:10 }} tickFormatter={v=>`${v}%`} domain={[0,55]} />
              <Tooltip formatter={(v: any, name: string) =>
                name === 'pct' ? [`${Number(v).toFixed(2).replace('.',',')}%`, 'Participação'] :
                [`${Number(v).toFixed(2).replace('.',',')}%`, 'Acumulado base']} />
              <Bar dataKey="base" stackId="a" fill="transparent" stroke="none" />
              <Bar dataKey="pct" stackId="a" name="Participação" radius={[4,4,0,0]}>
                {waterfall.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                <LabelList dataKey="pct" position="top" style={{ fontSize:9, fill:'#475569', fontWeight:600 }}
                  formatter={(v: number) => `${v.toFixed(1).replace('.',',')}%`} />
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Perfil de Risco por Causa" subtitle="Radar de participação relativa" height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={sorted.map(d => ({ metric: d.causa.substring(0,18), valor: d.percentual }))}
              cx="50%" cy="50%" outerRadius={95}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize:9, fill:'#64748b' }} />
              <PolarRadiusAxis angle={30} domain={[0, Math.max(...sorted.map(d=>d.percentual))]}
                tick={{ fontSize:8 }} tickCount={4} />
              <Radar name="% Ruptura" dataKey="valor" stroke={C.red[0]} fill={C.red[0]} fillOpacity={0.25} strokeWidth={2}
                dot={{ fill: C.red[0], r:4 }} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(2).replace('.',',')}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Detail table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
          <p className="text-sm font-semibold text-slate-800">Detalhamento por Causa</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider">Causa</th>
              <th className="px-4 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-wider">Participação</th>
              <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider w-1/2">Distribuição</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((item, i) => (
              <tr key={i} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800 text-xs">{item.causa}</td>
                <td className="px-4 py-3 text-right font-bold text-sm" style={{ color: COLORS[i % COLORS.length] }}>
                  {item.percentual.toFixed(2).replace('.',',')}%
                </td>
                <td className="px-4 py-3">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width:`${item.percentual}%`, background: COLORS[i % COLORS.length] }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export const Supply: React.FC = () => {
  const [criticidadeData,  setCriticidadeData]  = usePersistentState<CriticidadeItem[]>('supply_criticidade', []);
  const [materiaisData,    setMateriaisData]    = usePersistentState<ItensItem[]>('supply_materiais', []);
  const [medicamentosData, setMedicamentosData] = usePersistentState<ItensItem[]>('supply_medicamentos', []);
  const [causasRupturaData,setCausasRupturaData]= usePersistentState<CausasRupturaItem[]>('supply_causas_ruptura', []);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('criticidade');

  const loadFile = (setter: (rows: any[]) => void, parser: (csv: string) => any[]) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => setter(parser(ev.target?.result as string));
      reader.readAsText(file, 'UTF-8');
      e.target.value = '';
    };

  const valorTotalMat = useMemo(() => materiaisData.reduce((s,i)=>s+i.valorEstoque,0), [materiaisData]);
  const valorTotalMed = useMemo(() => medicamentosData.reduce((s,i)=>s+i.valorEstoque,0), [medicamentosData]);
  const itensSemEstoque = criticidadeData.filter(i=>i.estoqTotal===0).length;

  const anyLoaded = criticidadeData.length>0 || materiaisData.length>0 || medicamentosData.length>0 || causasRupturaData.length>0;

  const subTabs: { id: SubTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id:'criticidade',   label:'Criticidade',      count:criticidadeData.length,   icon:<AlertTriangle className="w-4 h-4" /> },
    { id:'materiais',     label:'Materiais',        count:materiaisData.length,     icon:<Package className="w-4 h-4" /> },
    { id:'medicamentos',  label:'Medicamentos',     count:medicamentosData.length,  icon:<Pill className="w-4 h-4" /> },
    { id:'causas_ruptura',label:'Causas de Ruptura',count:causasRupturaData.length, icon:<BarChart2 className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Truck className="w-6 h-6 text-violet-600" />
          Supply — Monitoramento de Estoque
        </h1>
        <p className="text-slate-500 text-sm mt-1">Criticidade · Materiais · Medicamentos · Causas de Ruptura — gráficos e tabelas interativas</p>
      </div>

      {/* Upload cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <UploadCard label="Lista de Criticidade" icon={<AlertTriangle className="w-5 h-5 text-red-500" />}
          loaded={criticidadeData.length>0} count={criticidadeData.length} colorClass="bg-red-50 border-red-200 text-red-700"
          onChange={loadFile(setCriticidadeData, parseCriticidade)} onClear={()=>setCriticidadeData([])} />
        <UploadCard label="Itens — Materiais" icon={<Package className="w-5 h-5 text-blue-500" />}
          loaded={materiaisData.length>0} count={materiaisData.length} colorClass="bg-blue-50 border-blue-200 text-blue-700"
          onChange={loadFile(setMateriaisData, parseItens)} onClear={()=>setMateriaisData([])} />
        <UploadCard label="Itens — Medicamentos" icon={<Pill className="w-5 h-5 text-violet-500" />}
          loaded={medicamentosData.length>0} count={medicamentosData.length} colorClass="bg-violet-50 border-violet-200 text-violet-700"
          onChange={loadFile(setMedicamentosData, parseItens)} onClear={()=>setMedicamentosData([])} />
        <UploadCard label="Causas de Ruptura" icon={<BarChart2 className="w-5 h-5 text-orange-500" />}
          loaded={causasRupturaData.length>0} count={causasRupturaData.length} colorClass="bg-orange-50 border-orange-200 text-orange-700"
          onChange={loadFile(setCausasRupturaData, parseCausasRuptura)} onClear={()=>setCausasRupturaData([])} />
      </div>

      {/* KPIs */}
      {anyLoaded && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard label="Itens em Criticidade" value={fmtN.format(criticidadeData.length)} sub="na lista de ruptura"
            icon={<AlertTriangle className="w-5 h-5 text-red-500" />} accent="border-red-400" />
          <KpiCard label="Sem Estoque Total" value={fmtN.format(itensSemEstoque)}
            sub={`${criticidadeData.length ? Math.round(itensSemEstoque/criticidadeData.length*100) : 0}% da criticidade`}
            icon={<TrendingDown className="w-5 h-5 text-orange-500" />} accent="border-orange-400" />
          <KpiCard label="Estoque Materiais" value={fmtBRL.format(valorTotalMat)} sub={`${fmtN.format(materiaisData.length)} itens`}
            icon={<Package className="w-5 h-5 text-blue-500" />} accent="border-blue-400" />
          <KpiCard label="Estoque Medicamentos" value={fmtBRL.format(valorTotalMed)} sub={`${fmtN.format(medicamentosData.length)} itens`}
            icon={<DollarSign className="w-5 h-5 text-violet-500" />} accent="border-violet-400" />
        </div>
      )}

      {/* Content */}
      {anyLoaded && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-1">
            {subTabs.map(tab => (
              <button key={tab.id} onClick={()=>setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all -mb-px
                  ${activeSubTab===tab.id ? 'border-violet-500 text-violet-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.icon}{tab.label}
                {tab.count>0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab===tab.id ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>{tab.count}</span>}
              </button>
            ))}
          </div>
          <div className="p-4">
            {activeSubTab==='criticidade' && (criticidadeData.length>0
              ? <CriticidadeTab data={criticidadeData} />
              : <EmptyState label="Carregue o arquivo de Criticidade acima" icon={<AlertTriangle className="w-8 h-8 text-slate-300" />} />)}
            {activeSubTab==='materiais' && (materiaisData.length>0
              ? <ItensTab data={materiaisData} accentColors={C.blue} />
              : <EmptyState label="Carregue o arquivo de Materiais acima" icon={<Package className="w-8 h-8 text-slate-300" />} />)}
            {activeSubTab==='medicamentos' && (medicamentosData.length>0
              ? <ItensTab data={medicamentosData} accentColors={C.violet} />
              : <EmptyState label="Carregue o arquivo de Medicamentos acima" icon={<Pill className="w-8 h-8 text-slate-300" />} />)}
            {activeSubTab==='causas_ruptura' && (causasRupturaData.length>0
              ? <CausasRupturaTab data={causasRupturaData} />
              : <EmptyState label="Carregue o arquivo de Causas de Ruptura acima" icon={<BarChart2 className="w-8 h-8 text-slate-300" />} />)}
          </div>
        </div>
      )}

      {!anyLoaded && (
        <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-16 text-center">
          <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Carregue os CSVs acima para visualizar dados e gráficos</p>
          <p className="text-slate-400 text-sm mt-1">Criticidade · Materiais · Medicamentos · Causas de Ruptura</p>
        </div>
      )}
    </div>
  );
};

const EmptyState: React.FC<{ label: string; icon: React.ReactNode }> = ({ label, icon }) => (
  <div className="py-16 text-center"><div className="flex justify-center mb-3">{icon}</div><p className="text-slate-400 text-sm">{label}</p></div>
);
