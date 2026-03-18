/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Upload, AlertTriangle, Package, TrendingUp, TrendingDown,
  CheckCircle, XCircle, Search, RefreshCw, Minus
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface TrackingRow {
  codigo: string;
  descricao: string;       // full name
  comercial: string;       // before "-"
  generico: string;        // after "-"
  unidade: string;
  dia1: number;
  dia2: number;
  total: number;
  media: number;
  saldo: number;
  projecao: number;        // dias restantes
  tendencia: 'alta' | 'queda' | 'estavel';
  nivel: 'critico' | 'alerta' | 'atencao' | 'ok';
}

// ─── PARSER ──────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

function parseNum(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function getNivel(row: Omit<TrackingRow, 'nivel' | 'tendencia'>): TrackingRow['nivel'] {
  if (row.saldo <= 0) return 'critico';
  if (row.media <= 0) return 'ok';
  if (row.projecao <= 7) return 'critico';
  if (row.projecao <= 15) return 'alerta';
  if (row.projecao <= 30) return 'atencao';
  return 'ok';
}

function getTendencia(dia1: number, dia2: number): TrackingRow['tendencia'] {
  if (dia1 <= 0 && dia2 <= 0) return 'estavel';
  if (dia2 > dia1 * 1.25) return 'alta';
  if (dia1 > 0 && dia2 < dia1 * 0.75) return 'queda';
  return 'estavel';
}

function parseTracking(text: string): { rows: TrackingRow[]; dia1Label: string; dia2Label: string } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const rows: TrackingRow[] = [];
  let dia1Label = 'Dia 1';
  let dia2Label = 'Dia 2';

  // Extract day labels from first header row
  const header = parseCsvLine(lines[0]);
  if (header.length >= 5) {
    dia1Label = header[3] || 'Dia 1';
    dia2Label = header[4] || 'Dia 2';
  }

  for (const line of lines) {
    const c = parseCsvLine(line);
    // Skip header repeat lines
    if (!c[0] || c[0].toLowerCase().includes('produto') || c[0].toLowerCase().includes('cod')) continue;
    if (isNaN(parseInt(c[0]))) continue;

    const dia1 = parseNum(c[3]);
    const dia2 = parseNum(c[4]);
    const media = parseNum(c[6]);
    const saldo = parseNum(c[7]);
    const projecao = parseNum(c[9]);

    const raw = {
      codigo: c[0] || '',
      descricao: c[1] || '',
      comercial: (c[1] || '').split('-')[0]?.trim() || c[1] || '',
      generico: (c[1] || '').includes('-') ? (c[1] || '').split('-').slice(1).join('-').trim() : '',
      unidade: c[2] || '',
      dia1, dia2,
      total: parseNum(c[5]),
      media, saldo, projecao,
      tendencia: getTendencia(dia1, dia2) as TrackingRow['tendencia'],
    };

    rows.push({ ...raw, nivel: getNivel(raw) });
  }

  return { rows, dia1Label, dia2Label };
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const NIVEL_CONFIG = {
  critico: { label: 'Crítico',  color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', badge: 'bg-red-100 text-red-700',    dot: 'bg-red-500'    },
  alerta:  { label: 'Alerta',   color: '#d97706', bg: '#fffbeb', border: '#fcd34d', badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500'  },
  atencao: { label: 'Atenção',  color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', badge: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500'   },
  ok:      { label: 'OK',       color: '#16a34a', bg: '#f0fdf4', border: '#86efac', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
};

const PIE_COLORS = ['#dc2626', '#d97706', '#2563eb', '#16a34a'];

function ProjecaoBar({ dias, max = 30 }: { dias: number; max?: number }) {
  const pct = Math.min((dias / max) * 100, 100);
  const color = dias <= 7 ? '#dc2626' : dias <= 15 ? '#d97706' : dias <= 30 ? '#2563eb' : '#16a34a';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-black w-10 text-right" style={{ color }}>
        {dias <= 0 ? '—' : `${dias.toFixed(0)}d`}
      </span>
    </div>
  );
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function RastreioFalta() {
  const [data, setData] = useState<{ rows: TrackingRow[]; dia1Label: string; dia2Label: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterNivel, setFilterNivel] = useState<'todos' | TrackingRow['nivel']>('todos');
  const [filterTend, setFilterTend] = useState<'todos' | TrackingRow['tendencia']>('todos');
  const [sortBy, setSortBy] = useState<'projecao' | 'total' | 'saldo' | 'media'>('projecao');

  const handleFile = useCallback((file: File) => {
    setLoading(true);
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = parseTracking(e.target?.result as string);
        setData(result);
      } catch (err) {
        console.error('Erro ao processar CSV:', err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file, 'latin1');
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!data?.rows.length) return null;
    const { rows } = data;

    const critico  = rows.filter(r => r.nivel === 'critico').length;
    const alerta   = rows.filter(r => r.nivel === 'alerta').length;
    const atencao  = rows.filter(r => r.nivel === 'atencao').length;
    const ok       = rows.filter(r => r.nivel === 'ok').length;

    const tendAlta  = rows.filter(r => r.tendencia === 'alta').length;
    const tendQueda = rows.filter(r => r.tendencia === 'queda').length;

    const top20consumo = [...rows]
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 20);

    const top10risco = [...rows]
      .filter(r => r.nivel === 'critico' || r.nivel === 'alerta')
      .sort((a, b) => a.projecao - b.projecao)
      .slice(0, 10);

    const pieData = [
      { name: 'Crítico',  value: critico  },
      { name: 'Alerta',   value: alerta   },
      { name: 'Atenção',  value: atencao  },
      { name: 'OK',       value: ok       },
    ].filter(d => d.value > 0);

    return { critico, alerta, atencao, ok, tendAlta, tendQueda, top20consumo, top10risco, pieData };
  }, [data]);

  // ── Filtered table ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!data?.rows.length) return [];
    let rows = [...data.rows];

    if (filterNivel !== 'todos') rows = rows.filter(r => r.nivel === filterNivel);
    if (filterTend !== 'todos') rows = rows.filter(r => r.tendencia === filterTend);

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.comercial.toLowerCase().includes(q) ||
        r.generico.toLowerCase().includes(q) ||
        r.codigo.includes(q) ||
        r.unidade.toLowerCase().includes(q)
      );
    }

    rows.sort((a, b) => {
      if (sortBy === 'projecao') {
        // Zeros (not-consuming) go to the end
        if (a.projecao === 0 && b.projecao === 0) return 0;
        if (a.projecao === 0) return 1;
        if (b.projecao === 0) return -1;
        return a.projecao - b.projecao;
      }
      if (sortBy === 'total')  return b.total - a.total;
      if (sortBy === 'saldo')  return a.saldo - b.saldo;
      if (sortBy === 'media')  return b.media - a.media;
      return 0;
    });

    return rows;
  }, [data, search, filterNivel, filterTend, sortBy]);

  // ── Upload screen ────────────────────────────────────────────────────────
  if (!data) {
    return (
      <div className="space-y-6">
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-full px-4 py-1.5 mb-4">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-xs font-bold text-rose-600 uppercase tracking-widest">Rastreio de Falta</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Rastreio de Falta</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Importe o CSV de tracking diário para visualizar o risco de falta por produto — projeção de dias, tendência e alertas automáticos.
          </p>
        </div>

        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 hover:border-rose-400 rounded-2xl p-12 text-center transition-colors cursor-pointer max-w-xl mx-auto"
          onClick={() => document.getElementById('rf-input')?.click()}
        >
          {loading ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="w-10 h-10 text-rose-400 animate-spin" />
              <p className="text-sm font-bold text-slate-500">Processando…</p>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
              <p className="font-bold text-slate-600 mb-1">Arraste o CSV aqui</p>
              <p className="text-xs text-slate-400">Tracking Global — separador vírgula (,)</p>
              <button className="mt-4 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors">
                Selecionar Arquivo
              </button>
            </>
          )}
          <input id="rf-input" type="file" accept=".csv,.txt" className="hidden" onChange={onInput} />
        </div>
      </div>
    );
  }

  const { rows, dia1Label, dia2Label } = data;

  return (
    <div className="space-y-5">

      {/* ── Header + reset ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Rastreio de Falta</h2>
          <p className="text-xs text-slate-400 mt-0.5">{rows.length} produtos monitorados · Dias analisados: {dia1Label} e {dia2Label}</p>
        </div>
        <button onClick={() => { setData(null); setSearch(''); setFilterNivel('todos'); }}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-rose-500 transition-colors border border-slate-200 hover:border-rose-300 rounded-lg px-3 py-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          Novo arquivo
        </button>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Produtos', value: rows.length, color: '#64748b', bg: 'bg-slate-50', icon: <Package className="w-3.5 h-3.5 text-slate-500" />, sub: 'monitorados' },
          { label: 'Crítico',  value: stats?.critico ?? 0,  color: '#dc2626', bg: 'bg-red-50',     icon: <XCircle className="w-3.5 h-3.5 text-red-500" />,    sub: '≤ 7 dias' },
          { label: 'Alerta',   value: stats?.alerta ?? 0,   color: '#d97706', bg: 'bg-amber-50',   icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />, sub: '8–15 dias' },
          { label: 'Atenção',  value: stats?.atencao ?? 0,  color: '#2563eb', bg: 'bg-blue-50',    icon: <AlertTriangle className="w-3.5 h-3.5 text-blue-500" />,  sub: '16–30 dias' },
          { label: 'OK',       value: stats?.ok ?? 0,       color: '#16a34a', bg: 'bg-emerald-50', icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />, sub: '> 30 dias' },
        ].map(({ label, value, color, bg, icon, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: color }} />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
                <div className={`p-1.5 rounded-lg ${bg}`}>{icon}</div>
              </div>
              <p className="text-3xl font-black leading-none" style={{ color }}>{value.toLocaleString('pt-BR')}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tendência cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-rose-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
            <TrendingUp className="w-6 h-6 text-rose-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-rose-600">{stats?.tendAlta ?? 0}</p>
            <p className="text-xs font-bold text-slate-600">Consumo em alta</p>
            <p className="text-[10px] text-slate-400">Dia {dia2Label} &gt; 25% acima do dia {dia1Label}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
            <Minus className="w-6 h-6 text-slate-400" />
          </div>
          <div>
            <p className="text-2xl font-black text-slate-600">{(rows.length - (stats?.tendAlta ?? 0) - (stats?.tendQueda ?? 0)).toLocaleString('pt-BR')}</p>
            <p className="text-xs font-bold text-slate-600">Consumo estável</p>
            <p className="text-[10px] text-slate-400">Variação &lt; 25% entre os dias</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 shadow-sm p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <TrendingDown className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-black text-emerald-600">{stats?.tendQueda ?? 0}</p>
            <p className="text-xs font-bold text-slate-600">Consumo em queda</p>
            <p className="text-[10px] text-slate-400">Dia {dia2Label} &gt; 25% abaixo do dia {dia1Label}</p>
          </div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Distribuição de risco */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribuição por Nível de Risco</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={stats?.pieData} cx="50%" cy="50%" outerRadius={85}
                dataKey="value" nameKey="name"
                label={({ name, value, percent }) => percent > 0.04 ? `${name}: ${value}` : ''}>
                {stats?.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top 10 em risco */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 10 Mais Críticos — Menor Projeção</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats?.top10risco.map(r => ({
              name: r.comercial.substring(0, 28),
              dias: parseFloat(r.projecao.toFixed(1)),
              fill: r.nivel === 'critico' ? '#dc2626' : '#d97706',
            }))} layout="vertical" margin={{ left: 10, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9 }} label={{ value: 'Dias restantes', position: 'insideBottom', offset: -2, fontSize: 9 }} />
              <YAxis dataKey="name" type="category" width={180} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v: any) => [`${v} dias`, 'Projeção']} />
              <Bar dataKey="dias" name="Projeção (dias)" radius={[0, 4, 4, 0]}>
                {stats?.top10risco.map((r, i) => (
                  <Cell key={i} fill={r.nivel === 'critico' ? '#dc2626' : '#d97706'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top 20 consumo */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 20 Maior Consumo Total (Dias {dia1Label}+{dia2Label})</h3>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={stats?.top20consumo.map(r => ({
            name: r.comercial.substring(0, 32),
            total: r.total,
            nivel: r.nivel,
          }))} layout="vertical" margin={{ left: 10, right: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis dataKey="name" type="category" width={240} tick={{ fontSize: 9 }} />
            <Tooltip formatter={(v: any) => [v.toLocaleString('pt-BR'), 'Total consumido']} />
            <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
              {stats?.top20consumo.map((r, i) => (
                <Cell key={i} fill={
                  r.nivel === 'critico' ? '#dc2626' :
                  r.nivel === 'alerta'  ? '#d97706' :
                  r.nivel === 'atencao' ? '#2563eb' : '#16a34a'
                } />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="text-[10px] text-slate-400 mt-2">Cor da barra = nível de risco do produto (vermelho = crítico, amarelo = alerta, azul = atenção, verde = OK).</p>
      </div>

      {/* ── Filtros + Tabela ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="px-5 py-4 border-b border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Nivel filter */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(['todos', 'critico', 'alerta', 'atencao', 'ok'] as const).map(f => (
                <button key={f} onClick={() => setFilterNivel(f)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${
                    filterNivel === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {f === 'todos' ? `Todos (${rows.length})`
                    : f === 'critico' ? `🔴 Crítico (${stats?.critico})`
                    : f === 'alerta'  ? `🟠 Alerta (${stats?.alerta})`
                    : f === 'atencao' ? `🔵 Atenção (${stats?.atencao})`
                    : `🟢 OK (${stats?.ok})`}
                </button>
              ))}
            </div>

            {/* Tendência filter */}
            <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
              {(['todos', 'alta', 'estavel', 'queda'] as const).map(f => (
                <button key={f} onClick={() => setFilterTend(f)}
                  className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${
                    filterTend === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {f === 'todos' ? 'Todas tendências' : f === 'alta' ? '↑ Alta' : f === 'queda' ? '↓ Queda' : '→ Estável'}
                </button>
              ))}
            </div>

            {/* Sort */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white outline-none">
              <option value="projecao">Ordenar: Menor projeção</option>
              <option value="total">Ordenar: Maior consumo</option>
              <option value="saldo">Ordenar: Menor saldo</option>
              <option value="media">Ordenar: Maior média</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text" placeholder="Buscar por nome comercial, genérico, código ou unidade..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1"
            />
            <span className="text-xs text-slate-400 shrink-0">{filtered.length} itens</span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-slate-800">
                <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                <th className="text-left text-[11px] font-bold text-white px-3 py-3">Código</th>
                <th className="text-left text-[11px] font-bold text-white px-3 py-3">Produto</th>
                <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Unidade</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Dia {dia1Label}</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Dia {dia2Label}</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Média</th>
                <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Saldo</th>
                <th className="text-left text-[11px] font-bold text-white px-3 py-3 min-w-[140px]">Projeção (dias)</th>
                <th className="text-center text-[11px] font-bold text-slate-400 px-3 py-3">Tend.</th>
                <th className="text-center text-[11px] font-bold text-slate-400 px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 300).map((row, i) => {
                const cfg = NIVEL_CONFIG[row.nivel];
                return (
                  <tr key={i}
                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                    style={{ borderLeft: `3px solid ${cfg.color}` }}>
                    <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                    <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{row.codigo}</td>
                    <td className="px-3 py-2.5 max-w-[260px]">
                      <p className="text-xs font-bold text-slate-700 leading-snug" title={row.comercial}>
                        {row.comercial.length > 38 ? row.comercial.substring(0, 38) + '…' : row.comercial}
                      </p>
                      {row.generico && (
                        <p className="text-[10px] text-slate-400 leading-snug mt-0.5" title={row.generico}>
                          {row.generico.length > 40 ? row.generico.substring(0, 40) + '…' : row.generico}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.unidade}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono text-slate-600">{row.dia1}</td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono">
                      <span className={
                        row.tendencia === 'alta'  ? 'text-rose-600 font-bold' :
                        row.tendencia === 'queda' ? 'text-emerald-600 font-bold' : 'text-slate-600'
                      }>{row.dia2}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-right font-mono text-slate-500">{row.media.toFixed(1)}</td>
                    <td className={`px-3 py-2.5 text-xs text-right font-black ${row.saldo <= 0 ? 'text-red-600' : 'text-slate-700'}`}>
                      {row.saldo.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-3 py-2.5 min-w-[140px]">
                      <ProjecaoBar dias={row.projecao} />
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      {row.tendencia === 'alta'  ? <span title="Consumo em alta">↑</span> :
                       row.tendencia === 'queda' ? <span title="Consumo em queda" className="text-emerald-500">↓</span> :
                       <span className="text-slate-300">→</span>}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.badge}`}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 300 && (
            <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
              Exibindo 300 de {filtered.length} itens. Use os filtros ou busca para refinar.
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
