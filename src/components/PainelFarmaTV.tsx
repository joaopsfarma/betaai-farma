import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Monitor, Play, Pause, ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Clock, Wifi, WifiOff, AlertTriangle, CheckCircle, Package,
  TrendingDown, TrendingUp, Shield, BarChart2, Activity, Zap, RefreshCw, ArrowLeft,
  Database, Layers, ArrowRightLeft, Calendar, Truck, Users, Star,
  ThumbsUp, ThumbsDown, Target, Award, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, CartesianGrid, LineChart, Line, RadialBarChart, RadialBar, Legend
} from 'recharts';
import type { InsightsPayload, RastreioPayload, PrevisibilidadePayload, AbastecimentoPayload } from '../types/painelFarmaTV';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROTATION_MS = 9000;

const LS_KEYS = {
  insights:        'farma_tv_insights',
  rastreio:        'farma_tv_rastreio',
  previsibilidade: 'farma_tv_previsibilidade',
  abastecimento:   'abastecimento_tv_data',
} as const;

type SlideId =
  | 'insights' | 'rastreio' | 'previsibilidade' | 'abastecimento'
  | 'pareto' | 'seguranca' | 'validades' | 'transferencias'
  | 'rastreio_top20' | 'rastreio_tendencias'
  | 'previs_top20' | 'previs_substitutos'
  | 'fornecedores' | 'itens_falta' | 'ruptura_fornecedor'
  | 'cobertura_dist' | 'conformidade' | 'abc_detalhado'
  | 'status_dia' | 'resumo_executivo';

const SLIDE_CONFIG: Record<SlideId, { label: string; icon: React.ReactNode; color: string }> = {
  insights:            { label: 'Insights do Farma',       icon: <BarChart2 className="w-5 h-5" />,      color: '#6366f1' },
  rastreio:            { label: 'Rastreio de Falta',        icon: <AlertTriangle className="w-5 h-5" />,  color: '#ef4444' },
  previsibilidade:     { label: 'Previsibilidade',          icon: <Activity className="w-5 h-5" />,       color: '#f59e0b' },
  abastecimento:       { label: 'Abastecimento',            icon: <Package className="w-5 h-5" />,        color: '#10b981' },
  pareto:              { label: 'Pareto — Top Consumo',     icon: <BarChart2 className="w-5 h-5" />,      color: '#8b5cf6' },
  seguranca:           { label: 'Estoque de Segurança',     icon: <Shield className="w-5 h-5" />,         color: '#f97316' },
  validades:           { label: 'Validades Críticas',       icon: <Calendar className="w-5 h-5" />,       color: '#ec4899' },
  transferencias:      { label: 'Transferências',           icon: <ArrowRightLeft className="w-5 h-5" />, color: '#06b6d4' },
  rastreio_top20:      { label: 'Top 20 — Rastreio',        icon: <AlertTriangle className="w-5 h-5" />,  color: '#ef4444' },
  rastreio_tendencias: { label: 'Tendências de Falta',      icon: <TrendingDown className="w-5 h-5" />,   color: '#f59e0b' },
  previs_top20:        { label: 'Top 20 — Risco',           icon: <Activity className="w-5 h-5" />,       color: '#f59e0b' },
  previs_substitutos:  { label: 'Substitutos Disponíveis',  icon: <RefreshCw className="w-5 h-5" />,      color: '#a78bfa' },
  fornecedores:        { label: 'Fornecedores',             icon: <Truck className="w-5 h-5" />,          color: '#14b8a6' },
  itens_falta:         { label: 'Itens em Falta',           icon: <Package className="w-5 h-5" />,        color: '#ef4444' },
  ruptura_fornecedor:  { label: 'Ruptura por Fornecedor',   icon: <Users className="w-5 h-5" />,          color: '#f97316' },
  cobertura_dist:      { label: 'Distribuição Cobertura',   icon: <Layers className="w-5 h-5" />,         color: '#3b82f6' },
  conformidade:        { label: 'Conformidade',             icon: <Award className="w-5 h-5" />,          color: '#22c55e' },
  abc_detalhado:       { label: 'Curva ABC',                icon: <Star className="w-5 h-5" />,           color: '#f59e0b' },
  status_dia:          { label: 'Status do Dia',            icon: <Target className="w-5 h-5" />,         color: '#6366f1' },
  resumo_executivo:    { label: 'Resumo Executivo',         icon: <Monitor className="w-5 h-5" />,        color: '#10b981' },
};

const SLIDES: SlideId[] = [
  'insights', 'rastreio', 'previsibilidade', 'abastecimento',
  'pareto', 'seguranca', 'validades', 'transferencias',
  'rastreio_top20', 'rastreio_tendencias',
  'previs_top20', 'previs_substitutos',
  'fornecedores', 'itens_falta', 'ruptura_fornecedor',
  'cobertura_dist', 'conformidade', 'abc_detalhado',
  'status_dia', 'resumo_executivo',
];

// ── Props ─────────────────────────────────────────────────────────────────────
interface PainelFarmaTVProps { onBack?: () => void; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtTime(d: Date) { return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function fmtDate(d: Date) { return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function timeSince(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min}min`;
  const h = Math.floor(min / 60);
  return `há ${h}h${min % 60 > 0 ? `${min % 60}min` : ''}`;
}

// ── Shared UI ─────────────────────────────────────────────────────────────────
function NoData({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-5 text-slate-600">
      <div className="w-24 h-24 rounded-3xl bg-slate-800/60 flex items-center justify-center">
        <WifiOff className="w-10 h-10 opacity-30" />
      </div>
      <div className="text-center">
        <p className="text-xl font-bold text-slate-400">Sem dados disponíveis</p>
        <p className="text-sm text-slate-600 mt-1">
          Acesse a aba <span className="text-slate-300 font-semibold">"{label}"</span> para carregar os dados
        </p>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string; color: string; icon?: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
        {icon && <span style={{ color }} className="opacity-70">{icon}</span>}
      </div>
      <p className="text-4xl font-black leading-none tracking-tight" style={{ color }}>
        {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
      </p>
      {sub && <p className="text-[11px] text-slate-500 font-medium">{sub}</p>}
    </div>
  );
}

const TT_STYLE = { background: '#1e293b', border: '1px solid #334155', borderRadius: 10, color: '#e2e8f0', fontSize: 11 };

// ── Slide 1: Insights do Farma ────────────────────────────────────────────────
function SlideInsights({ data }: { data: InsightsPayload | null }) {
  if (!data) return <NoData label="Insights do Farma" />;
  const { stats, paretoData, paretoTop5, securityAlerts, abcDistribution } = data;
  const top5 = paretoData?.slice(0, 5) ?? paretoTop5 ?? [];
  const abcData = [
    { name: 'Curva A', value: abcDistribution.curvaA, color: '#ef4444' },
    { name: 'Curva B', value: abcDistribution.curvaB, color: '#f59e0b' },
    { name: 'Curva C', value: abcDistribution.curvaC, color: '#6366f1' },
  ].filter(d => d.value > 0);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Itens"   value={stats.total}                          sub="monitorados"    color="#94a3b8" icon={<Layers className="w-4 h-4" />} />
        <KpiCard label="Rupturas"      value={stats.critical}                       sub="estoque zerado" color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Cobertura Méd" value={`${stats.avgCoverage.toFixed(1)}d`}  sub="dias médios"    color="#6366f1" icon={<Clock className="w-4 h-4" />} />
        <KpiCard label="Giro Diário"   value={`${stats.turnover.toFixed(2)}x`}     sub="meta: 0.5–1.5"  color="#10b981" icon={<Activity className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
        <div className="col-span-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Distribuição ABC</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={abcData} cx="50%" cy="45%" innerRadius="45%" outerRadius="70%" dataKey="value" paddingAngle={3}>
                  {abcData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-3 mt-1">
            {abcData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[11px] text-slate-400">{d.name}: <strong className="text-white">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Pareto — Top 5 Consumo</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top5} layout="vertical" margin={{ left: 0, right: 30 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={90} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [`${v} un/dia`, 'Consumo']} />
                <Bar dataKey="consumption" name="Consumo/dia" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-span-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Estoque de Segurança</h3>
          <div className="flex-1 overflow-y-auto space-y-2">
            {securityAlerts.length === 0 ? (
              <div className="flex items-center justify-center h-full"><CheckCircle className="w-8 h-8 text-emerald-500 mx-auto" /></div>
            ) : securityAlerts.slice(0, 6).map((a, i) => {
              const isRupture = a.coverageDays <= 0;
              return (
                <div key={i} className={`p-3 rounded-xl border ${isRupture ? 'border-red-800/40 bg-red-950/30' : 'border-amber-800/30 bg-amber-950/20'}`}>
                  <p className="text-xs font-bold text-white truncate">{a.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-slate-500">{a.dailyConsumption.toFixed(1)} un/dia</span>
                    <span className={`text-xs font-black ${isRupture ? 'text-red-400' : 'text-amber-400'}`}>
                      {isRupture ? '⚠ RUPTURA' : `${a.coverageDays.toFixed(1)}d`}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${isRupture ? 'bg-red-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.min((a.coverageDays / 3) * 100, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 2: Rastreio de Falta ────────────────────────────────────────────────
function SlideRastreio({ data }: { data: RastreioPayload | null }) {
  if (!data) return <NoData label="Rastreio de Falta" />;
  const barData = data.top10.map(r => ({
    name: r.comercial.substring(0, 22),
    dias: r.projecao <= 0 ? 0 : parseFloat(r.projecao.toFixed(1)),
    nivel: r.nivel,
  }));
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total"   value={data.total}   sub="produtos monitorados" color="#94a3b8" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Crítico" value={data.critico} sub="≤ 7 dias"             color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Alerta"  value={data.alerta}  sub="8–15 dias"            color="#f59e0b" icon={<Zap className="w-4 h-4" />} />
        <KpiCard label="Atenção" value={data.atencao} sub="16–30 dias"           color="#3b82f6" icon={<Shield className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
        <div className="col-span-6 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top 10 — Menor Projeção (dias)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" width={145} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [`${v} dias`, 'Projeção']} />
                <Bar dataKey="dias" radius={[0, 4, 4, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.nivel === 'critico' ? '#ef4444' : '#f59e0b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="col-span-6 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Itens Críticos / Alerta</h3>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                  <th className="text-left pb-2 font-bold">Produto</th>
                  <th className="text-right pb-2 font-bold">Saldo</th>
                  <th className="text-right pb-2 font-bold">Méd/dia</th>
                  <th className="text-right pb-2 font-bold">Proj.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {data.top10.map((r, i) => {
                  const isCrit = r.nivel === 'critico';
                  return (
                    <tr key={i} className="text-xs">
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCrit ? 'bg-red-500' : 'bg-amber-500'}`} />
                          <span className="text-slate-200 font-medium truncate max-w-[160px]">{r.comercial}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right text-slate-400">{r.saldo.toLocaleString('pt-BR')}</td>
                      <td className="py-2 text-right text-slate-400">{r.media.toFixed(1)}</td>
                      <td className={`py-2 text-right font-black ${isCrit ? 'text-red-400' : 'text-amber-400'}`}>
                        {r.projecao <= 0 ? '—' : `${r.projecao.toFixed(0)}d`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 3: Previsibilidade ──────────────────────────────────────────────────
function SlidePrevisibilidade({ data }: { data: PrevisibilidadePayload | null }) {
  if (!data) return <NoData label="Previsibilidade" />;
  const top10 = data.top20Risk?.slice(0, 10) ?? data.top10Risk ?? [];
  const pieData = [
    { name: 'Coberto',    value: data.suficiente,   color: '#22c55e' },
    { name: 'Parcial',    value: data.parcial,       color: '#f59e0b' },
    { name: 'Substituto', value: data.comSubstituto, color: '#a78bfa' },
    { name: 'Ruptura',    value: data.semSubstituto, color: '#ef4444' },
  ].filter(d => d.value > 0);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Itens"      value={data.total}          sub="solicitações cruzadas" color="#94a3b8" icon={<Layers className="w-4 h-4" />} />
        <KpiCard label="Ruptura Prevista" value={data.rupturaPredita} sub="sem cobertura"         color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Com Substituto"   value={data.comSubstituto}  sub="via equivalência"      color="#a78bfa" icon={<RefreshCw className="w-4 h-4" />} />
        <KpiCard label="Coberto"          value={data.suficiente}     sub="estoque suficiente"    color="#22c55e" icon={<CheckCircle className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-12 gap-5 min-h-0">
        <div className="col-span-5 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Cobertura das Solicitações</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius="40%" outerRadius="68%" dataKey="value" paddingAngle={3}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {pieData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-[11px] text-slate-400">{d.name}: <strong className="text-white">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </div>
        <div className="col-span-7 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top 10 — Risco de Ruptura</h3>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                  <th className="text-left pb-2 font-bold">#</th>
                  <th className="text-left pb-2 font-bold">Produto</th>
                  <th className="text-right pb-2 font-bold">Saldo</th>
                  <th className="text-right pb-2 font-bold">Solicitado</th>
                  <th className="text-center pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {top10.map((r, i) => (
                  <tr key={i} className="text-xs">
                    <td className="py-2 text-slate-600 w-7">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span className="text-slate-200 font-medium truncate max-w-[200px] block">{r.nome}</span>
                      <span className="text-slate-600 font-mono text-[10px]">#{r.id}</span>
                    </td>
                    <td className="py-2 text-right text-slate-400">{r.saldo.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right text-slate-400">{r.qtdSolicitada.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${r.coberturaEquiv ? 'bg-purple-900/50 text-purple-300' : 'bg-red-900/50 text-red-300'}`}>
                        {r.coberturaEquiv ? 'Substituto' : 'Ruptura'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 4: Abastecimento ────────────────────────────────────────────────────
function SlideAbastecimento({ data }: { data: AbastecimentoPayload | null }) {
  if (!data?.kpis) return <NoData label="Abastecimento" />;
  const { kpis, rupturas = [] } = data;
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Em Falta"          value={kpis.emFalta}                      sub="itens sem estoque" color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Atrasados"         value={kpis.atrasados}                    sub="pedidos vencidos"  color="#f59e0b" icon={<Clock className="w-4 h-4" />} />
        <KpiCard label="Cobertura Crítica" value={kpis.coberturaCritica}             sub="< 7 dias"          color="#a78bfa" icon={<Shield className="w-4 h-4" />} />
        <KpiCard label="Taxa de Ruptura"   value={`${kpis.taxaRuptura.toFixed(1)}%`} sub="% do catálogo"    color="#6366f1" icon={<TrendingDown className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Top Rupturas — Itens Em Falta</h3>
        {rupturas.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center"><CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" /><p className="text-slate-400">Nenhuma ruptura</p></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                  <th className="text-left pb-2 font-bold">Produto</th>
                  <th className="text-left pb-2 font-bold">Fornecedor</th>
                  <th className="text-right pb-2 font-bold">Dias Atraso</th>
                  <th className="text-right pb-2 font-bold">Cobertura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {rupturas.slice(0, 10).map((r, i) => (
                  <tr key={i} className="text-xs">
                    <td className="py-2 pr-3">
                      <span className="text-slate-200 font-medium truncate max-w-[260px] block">{r.descItem}</span>
                      <span className="text-slate-600 font-mono text-[10px]">#{r.codItem}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-400 truncate max-w-[140px]">{r.fornecedor}</td>
                    <td className="py-2 text-right">
                      <span className={`font-black text-sm ${r.diasAtraso > 7 ? 'text-red-400' : 'text-amber-400'}`}>{r.diasAtraso}d</span>
                    </td>
                    <td className="py-2 text-right text-slate-400">{r.cobertura.toFixed(1)}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide 5: Pareto Completo ──────────────────────────────────────────────────
function SlidePareto({ data }: { data: InsightsPayload | null }) {
  if (!data) return <NoData label="Insights do Farma" />;
  const list = (data.paretoData ?? data.paretoTop5 ?? []).slice(0, 15);
  const total = list.reduce((s, d) => s + d.consumption, 0);
  let cumPct = 0;
  const enriched = list.map(d => {
    cumPct += (d.consumption / (total || 1)) * 100;
    return { ...d, cumPct: parseFloat(cumPct.toFixed(1)), shortName: d.name.substring(0, 20) };
  });
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Itens no Pareto" value={list.length}                        sub="top consumidores"    color="#8b5cf6" icon={<BarChart2 className="w-4 h-4" />} />
        <KpiCard label="Consumo Total"   value={total.toLocaleString('pt-BR')}      sub="unidades/dia"        color="#6366f1" icon={<Activity className="w-4 h-4" />} />
        <KpiCard label="Top 3 Representam" value={`${enriched[2]?.cumPct ?? 0}%`}  sub="do consumo total"    color="#a78bfa" icon={<Star className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Consumo por Item (un/dia) — Curva de Pareto</h3>
        <div className="h-full" style={{ height: 'calc(100% - 24px)' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={enriched} layout="vertical" margin={{ left: 0, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis dataKey="shortName" type="category" width={150} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number, name: string) => name === 'cumPct' ? [`${v}%`, 'Acumulado'] : [`${v} un/dia`, 'Consumo']} />
              <Bar dataKey="consumption" name="Consumo/dia" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Slide 6: Estoque de Segurança Completo ────────────────────────────────────
function SlideSeguranca({ data }: { data: InsightsPayload | null }) {
  if (!data) return <NoData label="Insights do Farma" />;
  const alerts = data.securityAlerts;
  const rupturas = alerts.filter(a => a.coverageDays <= 0);
  const criticos = alerts.filter(a => a.coverageDays > 0 && a.coverageDays <= 1);
  const alerta   = alerts.filter(a => a.coverageDays > 1 && a.coverageDays <= 3);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Alertas" value={alerts.length}   sub="abaixo do estoque seg." color="#94a3b8" icon={<Shield className="w-4 h-4" />} />
        <KpiCard label="Rupturas"      value={rupturas.length} sub="estoque zerado"          color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Crítico < 1d"  value={criticos.length} sub="menos de 1 dia"          color="#f97316" icon={<Zap className="w-4 h-4" />} />
        <KpiCard label="Alerta 1–3d"   value={alerta.length}   sub="1 a 3 dias cobertura"    color="#f59e0b" icon={<Clock className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Todos os Alertas de Estoque de Segurança</h3>
        {alerts.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center"><CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" /><p className="text-slate-400">Estoque seguro — nenhum alerta</p></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                  <th className="text-left pb-2 font-bold">Produto</th>
                  <th className="text-right pb-2 font-bold">Consumo/dia</th>
                  <th className="text-right pb-2 font-bold">Cobertura</th>
                  <th className="text-center pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {alerts.map((a, i) => {
                  const isRup  = a.coverageDays <= 0;
                  const isCrit = !isRup && a.coverageDays <= 1;
                  const cls    = isRup ? 'text-red-400' : isCrit ? 'text-orange-400' : 'text-amber-400';
                  const badge  = isRup ? 'bg-red-900/50 text-red-300' : isCrit ? 'bg-orange-900/50 text-orange-300' : 'bg-amber-900/50 text-amber-300';
                  const label  = isRup ? 'Ruptura' : isCrit ? 'Crítico' : 'Alerta';
                  return (
                    <tr key={i} className="text-xs">
                      <td className="py-1.5 pr-3 text-slate-200 font-medium truncate max-w-[300px]">{a.name}</td>
                      <td className="py-1.5 text-right text-slate-400">{a.dailyConsumption.toFixed(1)}</td>
                      <td className={`py-1.5 text-right font-black ${cls}`}>{isRup ? '—' : `${a.coverageDays.toFixed(1)}d`}</td>
                      <td className="py-1.5 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide 7: Validades Críticas ───────────────────────────────────────────────
function SlideValidades({ data }: { data: InsightsPayload | null }) {
  if (!data?.expiryItems?.length) return <NoData label="Insights do Farma" />;
  const items = data.expiryItems.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const total = items.reduce((s, d) => s + d.count, 0);
  const próx30 = items.filter(d => {
    const diff = (new Date(d.date).getTime() - Date.now()) / 86400000;
    return diff <= 30;
  }).reduce((s, d) => s + d.count, 0);
  const barItems = items.slice(0, 12).map(d => ({
    label: `${d.day.toString().padStart(2, '0')}/${d.month.toString().padStart(2, '0')}`,
    count: d.count,
  }));
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Lotes Vencendo"   value={total}   sub="total de lotes"         color="#ec4899" icon={<Calendar className="w-4 h-4" />} />
        <KpiCard label="Nos Próximos 30d" value={próx30}  sub="atenção imediata"        color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Datas Distintas"  value={items.length} sub="datas de vencimento" color="#a78bfa" icon={<Info className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Lotes Vencendo — Próximas Datas</h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barItems} margin={{ left: 0, right: 10, top: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [`${v} lotes`, 'Vencendo']} />
              <Bar dataKey="count" name="Lotes" fill="#ec4899" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Slide 8: Transferências ───────────────────────────────────────────────────
function SlideTransferencias({ data }: { data: InsightsPayload | null }) {
  if (!data?.transferOpportunities?.length) return <NoData label="Insights do Farma" />;
  const ops = data.transferOpportunities;
  const totalItens = ops.length;
  const totalStock = ops.reduce((s, o) => s + o.physicalStock, 0);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Oportunidades"    value={totalItens}                      sub="itens p/ transferir"  color="#06b6d4" icon={<ArrowRightLeft className="w-4 h-4" />} />
        <KpiCard label="Estoque Disponível" value={totalStock.toLocaleString('pt-BR')} sub="unidades totais" color="#22c55e" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Cobertura Média"  value={`${(ops.reduce((s,o)=>s+o.coverageDays,0)/ops.length).toFixed(1)}d`} sub="média dos itens" color="#a78bfa" icon={<Clock className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Itens com Estoque Acima do Necessário</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">Produto</th>
                <th className="text-right pb-2 font-bold">Estoque</th>
                <th className="text-right pb-2 font-bold">Consumo/dia</th>
                <th className="text-right pb-2 font-bold">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {ops.map((o, i) => (
                <tr key={i} className="text-xs">
                  <td className="py-2 pr-3">
                    <span className="text-slate-200 font-medium truncate max-w-[280px] block">{o.name}</span>
                    <span className="text-slate-600 font-mono text-[10px]">#{o.id}</span>
                  </td>
                  <td className="py-2 text-right text-cyan-400 font-bold">{o.physicalStock.toLocaleString('pt-BR')}</td>
                  <td className="py-2 text-right text-slate-400">{o.dailyConsumption.toFixed(1)}</td>
                  <td className="py-2 text-right text-emerald-400 font-bold">{o.coverageDays.toFixed(0)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 9: Top 20 Rastreio ──────────────────────────────────────────────────
function SlideRastreioTop20({ data }: { data: RastreioPayload | null }) {
  if (!data) return <NoData label="Rastreio de Falta" />;
  const list = data.top20 ?? data.top10;
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total"   value={data.total}   sub="monitorados"    color="#94a3b8" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Crítico" value={data.critico} sub="≤ 7 dias"       color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Alerta"  value={data.alerta}  sub="8–15 dias"      color="#f59e0b" icon={<Zap className="w-4 h-4" />} />
        <KpiCard label="OK"      value={data.ok}      sub="sem risco"      color="#22c55e" icon={<CheckCircle className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top 20 — Menor Projeção de Estoque</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">#</th>
                <th className="text-left pb-2 font-bold">Produto</th>
                <th className="text-right pb-2 font-bold">Cód.</th>
                <th className="text-right pb-2 font-bold">Saldo</th>
                <th className="text-right pb-2 font-bold">Méd/dia</th>
                <th className="text-right pb-2 font-bold">Proj.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {list.map((r, i) => {
                const isCrit = r.nivel === 'critico';
                const isAlerta = r.nivel === 'alerta';
                const cls = isCrit ? 'text-red-400' : isAlerta ? 'text-amber-400' : 'text-blue-400';
                return (
                  <tr key={i} className="text-xs">
                    <td className="py-1.5 text-slate-600 w-7">{i + 1}</td>
                    <td className="py-1.5 pr-2 text-slate-200 font-medium truncate max-w-[200px]">{r.comercial}</td>
                    <td className="py-1.5 text-right text-slate-600 font-mono">{r.codigo}</td>
                    <td className="py-1.5 text-right text-slate-400">{r.saldo.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 text-right text-slate-400">{r.media.toFixed(1)}</td>
                    <td className={`py-1.5 text-right font-black ${cls}`}>{r.projecao <= 0 ? '—' : `${r.projecao.toFixed(0)}d`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 10: Tendências ──────────────────────────────────────────────────────
function SlideRastreioTendencias({ data }: { data: RastreioPayload | null }) {
  if (!data) return <NoData label="Rastreio de Falta" />;
  const { tendAlta, tendQueda, ok, critico, alerta, atencao, total } = data;
  const barData = [
    { name: 'Crítico',  value: critico,   fill: '#ef4444' },
    { name: 'Alerta',   value: alerta,    fill: '#f59e0b' },
    { name: 'Atenção',  value: atencao,   fill: '#3b82f6' },
    { name: 'OK',       value: ok,        fill: '#22c55e' },
  ];
  const tendData = [
    { name: 'Em Alta ↑', value: tendAlta,  fill: '#ef4444' },
    { name: 'Em Queda ↓', value: tendQueda, fill: '#22c55e' },
    { name: 'Estável',   value: total - tendAlta - tendQueda, fill: '#64748b' },
  ].filter(d => d.value > 0);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total"     value={total}     sub="monitorados"    color="#94a3b8" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Tendência Alta"  value={tendAlta}  sub="piorando"  color="#ef4444" icon={<TrendingDown className="w-4 h-4" />} />
        <KpiCard label="Tendência Queda" value={tendQueda} sub="melhorando" color="#22c55e" icon={<TrendingUp className="w-4 h-4" />} />
        <KpiCard label="Estáveis"  value={total - tendAlta - tendQueda} sub="sem variação" color="#64748b" icon={<Activity className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Distribuição por Nível</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="value" name="Itens" radius={[4, 4, 0, 0]}>
                  {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Tendência de Consumo</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tendData} cx="50%" cy="45%" innerRadius="38%" outerRadius="65%" dataKey="value" paddingAngle={3}>
                  {tendData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-1">
            {tendData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.fill }} />
                <span className="text-[11px] text-slate-400">{d.name}: <strong className="text-white">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 11: Top 20 Previsibilidade ──────────────────────────────────────────
function SlidePrevisTop20({ data }: { data: PrevisibilidadePayload | null }) {
  if (!data) return <NoData label="Previsibilidade" />;
  const list = data.top20Risk ?? data.top10Risk ?? [];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total"          value={data.total}         sub="solicitações"       color="#94a3b8" icon={<Layers className="w-4 h-4" />} />
        <KpiCard label="Sem Cobertura"  value={data.semSubstituto} sub="ruptura pura"       color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Com Substituto" value={data.comSubstituto} sub="cobertura parcial"  color="#a78bfa" icon={<RefreshCw className="w-4 h-4" />} />
        <KpiCard label="Coberto"        value={data.suficiente}    sub="estoque suficiente" color="#22c55e" icon={<CheckCircle className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Top 20 — Maior Risco de Ruptura</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">#</th>
                <th className="text-left pb-2 font-bold">Produto</th>
                <th className="text-right pb-2 font-bold">Saldo</th>
                <th className="text-right pb-2 font-bold">Solicitado</th>
                <th className="text-right pb-2 font-bold">Déficit</th>
                <th className="text-center pb-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {list.map((r, i) => {
                const deficit = r.qtdSolicitada - r.saldo;
                return (
                  <tr key={i} className="text-xs">
                    <td className="py-1.5 text-slate-600 w-7">{i + 1}</td>
                    <td className="py-1.5 pr-2">
                      <span className="text-slate-200 font-medium truncate max-w-[220px] block">{r.nome}</span>
                      <span className="text-slate-600 font-mono text-[10px]">#{r.id}</span>
                    </td>
                    <td className="py-1.5 text-right text-slate-400">{r.saldo.toLocaleString('pt-BR')}</td>
                    <td className="py-1.5 text-right text-slate-400">{r.qtdSolicitada.toLocaleString('pt-BR')}</td>
                    <td className={`py-1.5 text-right font-bold ${deficit > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {deficit > 0 ? `-${deficit.toLocaleString('pt-BR')}` : '—'}
                    </td>
                    <td className="py-1.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${r.coberturaEquiv ? 'bg-purple-900/50 text-purple-300' : 'bg-red-900/50 text-red-300'}`}>
                        {r.coberturaEquiv ? 'Substituto' : 'Ruptura'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 12: Substitutos ─────────────────────────────────────────────────────
function SlidePrevisSubstitutos({ data }: { data: PrevisibilidadePayload | null }) {
  if (!data?.substituteList?.length) return <NoData label="Previsibilidade" />;
  const list = data.substituteList;
  const totalDisp = list.reduce((s, d) => s + d.saldo, 0);
  const totalSolic = list.reduce((s, d) => s + d.qtdSolicitada, 0);
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Substitutos"      value={list.length}                          sub="itens disponíveis"   color="#a78bfa" icon={<RefreshCw className="w-4 h-4" />} />
        <KpiCard label="Estoque Total"    value={totalDisp.toLocaleString('pt-BR')}   sub="unidades disponíveis" color="#22c55e" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Total Solicitado" value={totalSolic.toLocaleString('pt-BR')}  sub="unidades necessárias"  color="#f59e0b" icon={<Activity className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Substitutos Disponíveis para Cobertura</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">#</th>
                <th className="text-left pb-2 font-bold">Produto Substituto</th>
                <th className="text-right pb-2 font-bold">Saldo</th>
                <th className="text-right pb-2 font-bold">Solicitado</th>
                <th className="text-right pb-2 font-bold">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {list.map((r, i) => {
                const cov = r.saldo >= r.qtdSolicitada;
                return (
                  <tr key={i} className="text-xs">
                    <td className="py-2 text-slate-600 w-7">{i + 1}</td>
                    <td className="py-2 pr-2">
                      <span className="text-slate-200 font-medium truncate max-w-[280px] block">{r.nome}</span>
                      <span className="text-slate-600 font-mono text-[10px]">#{r.id}</span>
                    </td>
                    <td className="py-2 text-right text-purple-400 font-bold">{r.saldo.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right text-slate-400">{r.qtdSolicitada.toLocaleString('pt-BR')}</td>
                    <td className="py-2 text-right">
                      <span className={`font-black text-sm ${cov ? 'text-emerald-400' : 'text-amber-400'}`}>{cov ? '100%' : `${Math.floor((r.saldo / r.qtdSolicitada) * 100)}%`}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 13: Fornecedores ────────────────────────────────────────────────────
function SlideFornecedores({ data }: { data: AbastecimentoPayload | null }) {
  if (!data?.suppliers?.length) return <NoData label="Abastecimento" />;
  const sup = data.suppliers.sort((a, b) => b.pontualidade - a.pontualidade);
  const avgPontualidade = sup.reduce((s, d) => s + d.pontualidade, 0) / sup.length;
  const maisAtrasos = [...sup].sort((a, b) => b.diasAtrasoMedio - a.diasAtrasoMedio)[0];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Fornecedores"     value={sup.length}                          sub="ativos"               color="#14b8a6" icon={<Truck className="w-4 h-4" />} />
        <KpiCard label="Pontualidade Méd" value={`${avgPontualidade.toFixed(1)}%`}   sub="média geral"          color="#22c55e" icon={<ThumbsUp className="w-4 h-4" />} />
        <KpiCard label="Pior Atraso"      value={maisAtrasos ? `${maisAtrasos.diasAtrasoMedio.toFixed(0)}d` : '—'} sub={maisAtrasos?.nome?.substring(0, 18) ?? ''} color="#ef4444" icon={<ThumbsDown className="w-4 h-4" />} />
        <KpiCard label="Com Pendências"   value={sup.filter(s => s.atrasados > 0).length} sub="têm itens atrasados" color="#f59e0b" icon={<AlertTriangle className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Performance por Fornecedor</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">Fornecedor</th>
                <th className="text-right pb-2 font-bold">Total</th>
                <th className="text-right pb-2 font-bold">Atrasados</th>
                <th className="text-right pb-2 font-bold">Em Falta</th>
                <th className="text-right pb-2 font-bold">Atraso Méd</th>
                <th className="text-right pb-2 font-bold">Pontualidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {sup.map((s, i) => {
                const pont = s.pontualidade;
                const cls = pont >= 90 ? 'text-emerald-400' : pont >= 70 ? 'text-amber-400' : 'text-red-400';
                return (
                  <tr key={i} className="text-xs">
                    <td className="py-2 pr-3 text-slate-200 font-medium truncate max-w-[200px]">{s.nome}</td>
                    <td className="py-2 text-right text-slate-400">{s.total}</td>
                    <td className="py-2 text-right text-amber-400">{s.atrasados}</td>
                    <td className="py-2 text-right text-red-400">{s.emFalta}</td>
                    <td className="py-2 text-right text-slate-400">{s.diasAtrasoMedio.toFixed(1)}d</td>
                    <td className={`py-2 text-right font-black ${cls}`}>{pont.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 14: Itens em Falta Detalhado ────────────────────────────────────────
function SlideItensFalta({ data }: { data: AbastecimentoPayload | null }) {
  if (!data?.items?.length) return <NoData label="Abastecimento" />;
  const emFalta = data.items.filter(i => i.emFalta || i.ruptura);
  if (!emFalta.length) return (
    <div className="h-full flex items-center justify-center">
      <div className="text-center"><CheckCircle className="w-14 h-14 text-emerald-500 mx-auto mb-3" /><p className="text-xl font-bold text-slate-300">Nenhum item em falta</p></div>
    </div>
  );
  const rupturasCount = emFalta.filter(i => i.ruptura).length;
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Em Falta"   value={emFalta.length}  sub="itens sem estoque"  color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Ruptura"    value={rupturasCount}   sub="estoque zerado"     color="#dc2626" icon={<Package className="w-4 h-4" />} />
        <KpiCard label="Atrasados"  value={emFalta.filter(i => i.diasAtraso > 0).length} sub="pedido vencido" color="#f59e0b" icon={<Clock className="w-4 h-4" />} />
        <KpiCard label="Cob. Média" value={`${(emFalta.reduce((s,i)=>s+i.cobertura,0)/emFalta.length).toFixed(1)}d`} sub="dias médios" color="#6366f1" icon={<Shield className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Itens em Falta — Detalhe</h3>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-slate-500 uppercase tracking-widest border-b border-slate-700/50">
                <th className="text-left pb-2 font-bold">Produto</th>
                <th className="text-left pb-2 font-bold">Fornecedor</th>
                <th className="text-right pb-2 font-bold">Estq. Disp.</th>
                <th className="text-right pb-2 font-bold">Dias Atraso</th>
                <th className="text-right pb-2 font-bold">Cobertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/30">
              {emFalta.slice(0, 15).map((item, i) => (
                <tr key={i} className="text-xs">
                  <td className="py-1.5 pr-2">
                    <span className="text-slate-200 font-medium truncate max-w-[220px] block">{item.descItem}</span>
                    <span className="text-slate-600 font-mono text-[10px]">#{item.codItem}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-slate-400 truncate max-w-[120px]">{item.fornec}</td>
                  <td className="py-1.5 text-right text-slate-400">{item.estoqDisp.toLocaleString('pt-BR')}</td>
                  <td className="py-1.5 text-right">
                    <span className={`font-bold ${item.diasAtraso > 7 ? 'text-red-400' : 'text-amber-400'}`}>{item.diasAtraso > 0 ? `${item.diasAtraso}d` : '—'}</span>
                  </td>
                  <td className="py-1.5 text-right text-slate-400">{item.cobertura.toFixed(1)}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Slide 15: Rupturas por Fornecedor ────────────────────────────────────────
function SlideRupturaFornecedor({ data }: { data: AbastecimentoPayload | null }) {
  if (!data?.rupturas?.length) return <NoData label="Abastecimento" />;
  const grouped: Record<string, { count: number; diasAtrasoMax: number }> = {};
  data.rupturas.forEach(r => {
    const key = r.fornecedor || 'Sem fornecedor';
    if (!grouped[key]) grouped[key] = { count: 0, diasAtrasoMax: 0 };
    grouped[key].count++;
    grouped[key].diasAtrasoMax = Math.max(grouped[key].diasAtrasoMax, r.diasAtraso);
  });
  const barData = Object.entries(grouped)
    .map(([nome, d]) => ({ nome: nome.substring(0, 22), ...d }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const piorFornecedor = barData[0];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Rupturas"    value={data.rupturas.length}      sub="itens sem cobertura" color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Fornecedores"      value={barData.length}            sub="com rupturas"        color="#f97316" icon={<Truck className="w-4 h-4" />} />
        <KpiCard label="Maior Problema"    value={piorFornecedor?.count ?? 0} sub={piorFornecedor?.nome ?? '—'} color="#dc2626" icon={<Users className="w-4 h-4" />} />
        <KpiCard label="Maior Atraso"      value={`${Math.max(...data.rupturas.map(r=>r.diasAtraso))}d`} sub="dias em atraso" color="#f59e0b" icon={<Clock className="w-4 h-4" />} />
      </div>
      <div className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col min-h-0">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Rupturas por Fornecedor</h3>
        <div className="flex-1 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} layout="vertical" margin={{ left: 0, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis dataKey="nome" type="category" width={160} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TT_STYLE} formatter={(v: number) => [`${v} itens`, 'Rupturas']} />
              <Bar dataKey="count" name="Rupturas" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ── Slide 16: Distribuição de Cobertura ───────────────────────────────────────
function SlideCoberturaDistribuicao({ insightsData }: { insightsData: InsightsPayload | null }) {
  if (!insightsData) return <NoData label="Insights do Farma" />;
  const { stats, securityAlerts } = insightsData;
  const buckets = [
    { name: 'Ruptura', min: -Infinity, max: 0,  color: '#ef4444' },
    { name: '< 7d',    min: 0, max: 7,           color: '#f97316' },
    { name: '7–15d',   min: 7, max: 15,          color: '#f59e0b' },
    { name: '15–30d',  min: 15, max: 30,         color: '#3b82f6' },
    { name: '> 30d',   min: 30, max: Infinity,   color: '#22c55e' },
  ];
  const bucketData = buckets.map(b => ({
    name: b.name,
    value: securityAlerts.filter(a => a.coverageDays >= b.min && a.coverageDays < b.max).length,
    color: b.color,
  }));
  const total = stats.total;
  const withAlerts = securityAlerts.length;
  const safe = total - withAlerts;
  const fullData = [...bucketData, { name: 'Seguro', value: safe, color: '#10b981' }];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total"       value={total}                             sub="itens monitorados"  color="#94a3b8" icon={<Layers className="w-4 h-4" />} />
        <KpiCard label="Em Risco"    value={withAlerts}                        sub="abaixo do mínimo"   color="#ef4444" icon={<AlertTriangle className="w-4 h-4" />} />
        <KpiCard label="Seguros"     value={safe}                              sub="cobertura adequada" color="#22c55e" icon={<CheckCircle className="w-4 h-4" />} />
        <KpiCard label="Cob. Média"  value={`${stats.avgCoverage.toFixed(1)}d`} sub="média geral"      color="#6366f1" icon={<Clock className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Itens por Faixa de Cobertura</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bucketData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={TT_STYLE} />
                <Bar dataKey="value" name="Itens" radius={[4, 4, 0, 0]}>
                  {bucketData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Distribuição Total</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={fullData.filter(d => d.value > 0)} cx="50%" cy="45%" innerRadius="35%" outerRadius="65%" dataKey="value" paddingAngle={2}>
                  {fullData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-2 mt-1">
            {fullData.filter(d => d.value > 0).map(d => (
              <div key={d.name} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                <span className="text-[10px] text-slate-400">{d.name}: <strong className="text-white">{d.value}</strong></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 17: Conformidade ────────────────────────────────────────────────────
function SlideConformidade({ data }: { data: AbastecimentoPayload | null }) {
  if (!data?.kpis) return <NoData label="Abastecimento" />;
  const { kpis } = data;
  const conformidade = kpis.taxaConformidade ?? (100 - kpis.taxaRuptura);
  const cobMedia = kpis.coberturaMedia ?? 0;
  const radialData = [
    { name: 'Conformidade', value: parseFloat(conformidade.toFixed(1)), fill: conformidade >= 90 ? '#22c55e' : conformidade >= 70 ? '#f59e0b' : '#ef4444' },
  ];
  const gaugeData = [
    { name: 'Preenchido', value: conformidade, fill: conformidade >= 90 ? '#22c55e' : conformidade >= 70 ? '#f59e0b' : '#ef4444' },
    { name: 'Vazio', value: 100 - conformidade, fill: '#1e293b' },
  ];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Conformidade"     value={`${conformidade.toFixed(1)}%`}  sub="taxa geral"          color={conformidade >= 90 ? '#22c55e' : '#f59e0b'} icon={<Award className="w-4 h-4" />} />
        <KpiCard label="Cobertura Média"  value={`${cobMedia.toFixed(1)}d`}      sub="dias médios"         color="#6366f1" icon={<Clock className="w-4 h-4" />} />
        <KpiCard label="Alto Custo"       value={kpis.altoCusto ?? '—'}          sub="itens monitorados"   color="#a78bfa" icon={<Star className="w-4 h-4" />} />
        <KpiCard label="Taxa de Ruptura"  value={`${kpis.taxaRuptura.toFixed(1)}%`} sub="% do catálogo"   color="#ef4444" icon={<TrendingDown className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col items-center justify-center">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Taxa de Conformidade</h3>
          <div className="w-full" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="90%" data={radialData} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-4xl font-black" style={{ color: radialData[0].fill }}>{conformidade.toFixed(1)}%</p>
          <p className="text-xs text-slate-500 mt-1">Meta: ≥ 90%</p>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Indicadores de Qualidade</h3>
          <div className="flex-1 space-y-4">
            {[
              { label: 'Conformidade do Catálogo', value: conformidade, meta: 90, color: '#22c55e' },
              { label: 'Cobertura Adequada',        value: Math.min((cobMedia / 30) * 100, 100), meta: 70, color: '#6366f1' },
              { label: 'Itens Sem Ruptura',         value: 100 - kpis.taxaRuptura, meta: 95, color: '#10b981' },
              { label: 'Pedidos no Prazo',          value: kpis.total ? ((kpis.total - kpis.atrasados) / kpis.total) * 100 : 0, meta: 85, color: '#f59e0b' },
            ].map((ind, i) => (
              <div key={i}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-slate-300 font-medium">{ind.label}</span>
                  <span className="text-xs font-bold" style={{ color: ind.value >= ind.meta ? '#22c55e' : '#f59e0b' }}>{ind.value.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(ind.value, 100)}%`, background: ind.value >= ind.meta ? ind.color : '#f59e0b' }} />
                </div>
                <p className="text-[10px] text-slate-600 mt-0.5">Meta: {ind.meta}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slide 18: ABC Detalhado ───────────────────────────────────────────────────
function SlideABCDetalhado({ data }: { data: InsightsPayload | null }) {
  if (!data) return <NoData label="Insights do Farma" />;
  const { abcDistribution, stats } = data;
  const total = abcDistribution.curvaA + abcDistribution.curvaB + abcDistribution.curvaC;
  const abcItems = [
    { name: 'Curva A', count: abcDistribution.curvaA, pct: total ? (abcDistribution.curvaA / total) * 100 : 0, color: '#ef4444', desc: 'Alto valor, alto consumo — controle intensivo' },
    { name: 'Curva B', count: abcDistribution.curvaB, pct: total ? (abcDistribution.curvaB / total) * 100 : 0, color: '#f59e0b', desc: 'Valor intermediário — controle periódico' },
    { name: 'Curva C', count: abcDistribution.curvaC, pct: total ? (abcDistribution.curvaC / total) * 100 : 0, color: '#6366f1', desc: 'Baixo valor, alto volume — controle simplificado' },
  ];
  const pieData = abcItems.map(d => ({ name: d.name, value: d.count, color: d.color }));
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total Itens"  value={total}                   sub="classificados"   color="#94a3b8" icon={<Layers className="w-4 h-4" />} />
        <KpiCard label="Curva A"      value={abcDistribution.curvaA}  sub="alto impacto"    color="#ef4444" icon={<Star className="w-4 h-4" />} />
        <KpiCard label="Curva B"      value={abcDistribution.curvaB}  sub="médio impacto"   color="#f59e0b" icon={<Activity className="w-4 h-4" />} />
        <KpiCard label="Curva C"      value={abcDistribution.curvaC}  sub="baixo impacto"   color="#6366f1" icon={<Package className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Distribuição ABC</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} cx="50%" cy="45%" innerRadius="40%" outerRadius="68%" dataKey="value" paddingAngle={3}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TT_STYLE} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4">
            {abcItems.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-slate-300">{d.name}: <strong style={{ color: d.color }}>{d.pct.toFixed(1)}%</strong></span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Estratégia por Curva</h3>
          {abcItems.map((item, i) => (
            <div key={i} className="rounded-xl border p-4" style={{ borderColor: item.color + '30', background: item.color + '08' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-black" style={{ color: item.color }}>{item.name}</span>
                <div className="text-right">
                  <span className="text-xl font-black text-white">{item.count}</span>
                  <span className="text-xs text-slate-500 ml-1">itens ({item.pct.toFixed(1)}%)</span>
                </div>
              </div>
              <div className="h-1.5 bg-slate-700 rounded-full mb-2">
                <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
              </div>
              <p className="text-[11px] text-slate-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Slide 19: Status do Dia ───────────────────────────────────────────────────
function SlideStatusDia({ insightsData, rastreioData, previsData, abastecData }: {
  insightsData: InsightsPayload | null;
  rastreioData: RastreioPayload | null;
  previsData: PrevisibilidadePayload | null;
  abastecData: AbastecimentoPayload | null;
}) {
  const sources = [
    {
      label: 'Insights do Farma', color: '#6366f1', icon: <BarChart2 className="w-5 h-5" />, loaded: !!insightsData,
      metrics: insightsData ? [
        { k: 'Total', v: insightsData.stats.total, ok: true },
        { k: 'Rupturas', v: insightsData.stats.critical, ok: insightsData.stats.critical === 0 },
        { k: 'Alertas Seg.', v: insightsData.securityAlerts.length, ok: insightsData.securityAlerts.length === 0 },
      ] : [],
    },
    {
      label: 'Rastreio de Falta', color: '#ef4444', icon: <AlertTriangle className="w-5 h-5" />, loaded: !!rastreioData,
      metrics: rastreioData ? [
        { k: 'Crítico', v: rastreioData.critico, ok: rastreioData.critico === 0 },
        { k: 'Alerta', v: rastreioData.alerta, ok: rastreioData.alerta === 0 },
        { k: 'Tende Alta', v: rastreioData.tendAlta, ok: rastreioData.tendAlta === 0 },
      ] : [],
    },
    {
      label: 'Previsibilidade', color: '#f59e0b', icon: <Activity className="w-5 h-5" />, loaded: !!previsData,
      metrics: previsData ? [
        { k: 'Ruptura Prev.', v: previsData.rupturaPredita, ok: previsData.rupturaPredita === 0 },
        { k: 'Sem Substituto', v: previsData.semSubstituto, ok: previsData.semSubstituto === 0 },
        { k: 'Coberto', v: previsData.suficiente, ok: true },
      ] : [],
    },
    {
      label: 'Abastecimento', color: '#10b981', icon: <Package className="w-5 h-5" />, loaded: !!abastecData,
      metrics: abastecData?.kpis ? [
        { k: 'Em Falta', v: abastecData.kpis.emFalta, ok: abastecData.kpis.emFalta === 0 },
        { k: 'Atrasados', v: abastecData.kpis.atrasados, ok: abastecData.kpis.atrasados === 0 },
        { k: 'Ruptura %', v: `${abastecData.kpis.taxaRuptura.toFixed(1)}%`, ok: abastecData.kpis.taxaRuptura < 5 },
      ] : [],
    },
  ];
  const loaded = sources.filter(s => s.loaded).length;
  const hasIssues = sources.some(s => s.metrics.some(m => !m.ok && Number(m.v) > 0));
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Módulos Ativos" value={loaded}       sub={`de ${sources.length} disponíveis`} color="#6366f1" icon={<Monitor className="w-4 h-4" />} />
        <KpiCard label="Status Geral"   value={hasIssues ? 'ATENÇÃO' : 'OK'} sub={hasIssues ? 'há pendências' : 'tudo normal'} color={hasIssues ? '#f59e0b' : '#22c55e'} icon={hasIssues ? <AlertTriangle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />} />
        <KpiCard label="Data"           value={new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} sub="hoje" color="#94a3b8" icon={<Calendar className="w-4 h-4" />} />
        <KpiCard label="Hora"           value={new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} sub="atualizado" color="#94a3b8" icon={<Clock className="w-4 h-4" />} />
      </div>
      <div className="flex-1 grid grid-cols-2 gap-5 min-h-0">
        {sources.map((src, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-5 flex flex-col gap-3" style={{ borderColor: src.loaded ? src.color + '30' : undefined }}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: src.color + '20', color: src.color }}>
                {src.icon}
              </div>
              <div>
                <h3 className="text-sm font-black text-white">{src.label}</h3>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {src.loaded ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-slate-600" />}
                  <span className={`text-[10px] font-bold ${src.loaded ? 'text-emerald-400' : 'text-slate-600'}`}>{src.loaded ? 'Dados carregados' : 'Sem dados'}</span>
                </div>
              </div>
            </div>
            {src.metrics.length > 0 && (
              <div className="grid grid-cols-3 gap-2 flex-1">
                {src.metrics.map((m, j) => (
                  <div key={j} className={`rounded-xl p-3 border ${m.ok ? 'border-emerald-800/30 bg-emerald-950/20' : 'border-amber-800/30 bg-amber-950/20'}`}>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">{m.k}</p>
                    <p className={`text-lg font-black mt-1 ${m.ok ? 'text-emerald-400' : 'text-amber-400'}`}>{m.v}</p>
                  </div>
                ))}
              </div>
            )}
            {!src.loaded && (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-slate-600">Carregue os dados na aba correspondente</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Slide 20: Resumo Executivo ────────────────────────────────────────────────
function SlideResumoExecutivo({ insightsData, rastreioData, previsData, abastecData }: {
  insightsData: InsightsPayload | null;
  rastreioData: RastreioPayload | null;
  previsData: PrevisibilidadePayload | null;
  abastecData: AbastecimentoPayload | null;
}) {
  const metricas = [
    { label: 'Total Itens Monitorados', value: insightsData?.stats.total ?? '—',                        color: '#94a3b8', icon: <Layers className="w-4 h-4" /> },
    { label: 'Rupturas de Estoque',     value: insightsData?.stats.critical ?? '—',                     color: '#ef4444', icon: <AlertTriangle className="w-4 h-4" /> },
    { label: 'Cobertura Média (dias)',  value: insightsData ? `${insightsData.stats.avgCoverage.toFixed(1)}d` : '—', color: '#6366f1', icon: <Clock className="w-4 h-4" /> },
    { label: 'Alertas Seg. Estoque',   value: insightsData?.securityAlerts.length ?? '—',               color: '#f97316', icon: <Shield className="w-4 h-4" /> },
    { label: 'Rastreio — Crítico',     value: rastreioData?.critico ?? '—',                             color: '#ef4444', icon: <AlertTriangle className="w-4 h-4" /> },
    { label: 'Rastreio — Alerta',      value: rastreioData?.alerta ?? '—',                              color: '#f59e0b', icon: <Zap className="w-4 h-4" /> },
    { label: 'Rupturas Previstas',     value: previsData?.rupturaPredita ?? '—',                        color: '#ef4444', icon: <Activity className="w-4 h-4" /> },
    { label: 'Com Substituto',         value: previsData?.comSubstituto ?? '—',                         color: '#a78bfa', icon: <RefreshCw className="w-4 h-4" /> },
    { label: 'Em Falta (Abastecer)',   value: abastecData?.kpis?.emFalta ?? '—',                        color: '#ef4444', icon: <Package className="w-4 h-4" /> },
    { label: 'Pedidos Atrasados',      value: abastecData?.kpis?.atrasados ?? '—',                      color: '#f59e0b', icon: <Truck className="w-4 h-4" /> },
    { label: 'Taxa de Ruptura',        value: abastecData?.kpis ? `${abastecData.kpis.taxaRuptura.toFixed(1)}%` : '—', color: '#6366f1', icon: <TrendingDown className="w-4 h-4" /> },
    { label: 'Fornecedores',           value: abastecData?.suppliers?.length ?? '—',                    color: '#14b8a6', icon: <Users className="w-4 h-4" /> },
  ];
  return (
    <div className="h-full flex flex-col gap-5">
      <div className="flex items-center gap-3 bg-slate-800/60 border border-indigo-700/30 rounded-2xl px-6 py-4">
        <Monitor className="w-6 h-6 text-indigo-400" />
        <div>
          <h2 className="text-base font-black text-white">Resumo Executivo — Logística Farmacêutica</h2>
          <p className="text-[11px] text-slate-500">{fmtDate(new Date())}</p>
        </div>
      </div>
      <div className="flex-1 grid grid-cols-4 gap-4 content-start">
        {metricas.map((m, i) => (
          <div key={i} className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide leading-tight">{m.label}</span>
              <span style={{ color: m.color }} className="opacity-60 shrink-0 ml-1">{m.icon}</span>
            </div>
            <p className="text-3xl font-black leading-none" style={{ color: m.color }}>
              {typeof m.value === 'number' ? m.value.toLocaleString('pt-BR') : m.value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function PainelFarmaTV({ onBack }: PainelFarmaTVProps) {
  const [insightsData, setInsightsData] = useState<InsightsPayload | null>(null);
  const [rastreioData, setRastreioData] = useState<RastreioPayload | null>(null);
  const [previsData,   setPrevisData]   = useState<PrevisibilidadePayload | null>(null);
  const [abastecData,  setAbastecData]  = useState<AbastecimentoPayload | null>(null);

  const [slideIndex,    setSlideIndex]    = useState(0);
  const [isPlaying,     setIsPlaying]     = useState(true);
  const [progress,      setProgress]      = useState(0);
  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const [now,           setNow]           = useState(new Date());

  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef  = useRef<number>(0);
  const startRef     = useRef<number>(Date.now());
  const animFrameRef = useRef<number>(0);

  const loadData = useCallback(() => {
    try { const v = localStorage.getItem(LS_KEYS.insights);        if (v) setInsightsData(JSON.parse(v)); } catch { /* ignore */ }
    try { const v = localStorage.getItem(LS_KEYS.rastreio);        if (v) setRastreioData(JSON.parse(v)); } catch { /* ignore */ }
    try { const v = localStorage.getItem(LS_KEYS.previsibilidade); if (v) setPrevisData(JSON.parse(v));   } catch { /* ignore */ }
    try { const v = localStorage.getItem(LS_KEYS.abastecimento);   if (v) setAbastecData(JSON.parse(v));  } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    if (!isPlaying) { cancelAnimationFrame(animFrameRef.current); return; }
    startRef.current = Date.now() - progressRef.current * ROTATION_MS;
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / ROTATION_MS) * 100, 100);
      progressRef.current = pct / 100;
      setProgress(pct);
      if (pct >= 100) {
        progressRef.current = 0; startRef.current = Date.now();
        setSlideIndex(prev => (prev + 1) % SLIDES.length);
        setProgress(0);
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) containerRef.current?.requestFullscreen();
    else document.exitFullscreen();
  };

  const goTo = (idx: number) => { progressRef.current = 0; startRef.current = Date.now(); setProgress(0); setSlideIndex(idx); };
  const prev = () => goTo((slideIndex - 1 + SLIDES.length) % SLIDES.length);
  const next = () => goTo((slideIndex + 1) % SLIDES.length);

  const currentSlide = SLIDES[slideIndex];
  const cfg = SLIDE_CONFIG[currentSlide];

  const dataSources = [
    { key: 'insights'        as const, label: 'Insights',  savedAt: insightsData?.savedAt },
    { key: 'rastreio'        as const, label: 'Rastreio',  savedAt: rastreioData?.savedAt },
    { key: 'previsibilidade' as const, label: 'Previs.',   savedAt: previsData?.savedAt   },
    { key: 'abastecimento'   as const, label: 'Abastec.',  savedAt: abastecData?.savedAt  },
  ];
  const hasAnyData = insightsData || rastreioData || previsData || abastecData;

  function renderSlide() {
    switch (currentSlide) {
      case 'insights':            return <SlideInsights data={insightsData} />;
      case 'rastreio':            return <SlideRastreio data={rastreioData} />;
      case 'previsibilidade':     return <SlidePrevisibilidade data={previsData} />;
      case 'abastecimento':       return <SlideAbastecimento data={abastecData} />;
      case 'pareto':              return <SlidePareto data={insightsData} />;
      case 'seguranca':           return <SlideSeguranca data={insightsData} />;
      case 'validades':           return <SlideValidades data={insightsData} />;
      case 'transferencias':      return <SlideTransferencias data={insightsData} />;
      case 'rastreio_top20':      return <SlideRastreioTop20 data={rastreioData} />;
      case 'rastreio_tendencias': return <SlideRastreioTendencias data={rastreioData} />;
      case 'previs_top20':        return <SlidePrevisTop20 data={previsData} />;
      case 'previs_substitutos':  return <SlidePrevisSubstitutos data={previsData} />;
      case 'fornecedores':        return <SlideFornecedores data={abastecData} />;
      case 'itens_falta':         return <SlideItensFalta data={abastecData} />;
      case 'ruptura_fornecedor':  return <SlideRupturaFornecedor data={abastecData} />;
      case 'cobertura_dist':      return <SlideCoberturaDistribuicao insightsData={insightsData} />;
      case 'conformidade':        return <SlideConformidade data={abastecData} />;
      case 'abc_detalhado':       return <SlideABCDetalhado data={insightsData} />;
      case 'status_dia':          return <SlideStatusDia insightsData={insightsData} rastreioData={rastreioData} previsData={previsData} abastecData={abastecData} />;
      case 'resumo_executivo':    return <SlideResumoExecutivo insightsData={insightsData} rastreioData={rastreioData} previsData={previsData} abastecData={abastecData} />;
    }
  }

  return (
    <div ref={containerRef} className="w-full min-h-screen bg-slate-950 text-white flex flex-col select-none" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-slate-800/70 bg-slate-900/60 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-indigo-600/20 border border-indigo-500/30">
              <Monitor className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tight text-white">PAINEL DO FARMA</h1>
              <p className="text-[11px] text-slate-500 font-medium">Logística Farmacêutica — TV Interativo</p>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-2">
          {dataSources.map(ds => (
            <div key={ds.key} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${ds.savedAt ? 'bg-emerald-900/30 border-emerald-700/40 text-emerald-400' : 'bg-slate-800/40 border-slate-700/40 text-slate-600'}`}>
              {ds.savedAt ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {ds.label}
              {ds.savedAt && <span className="text-emerald-600 text-[10px] font-normal">{timeSince(ds.savedAt)}</span>}
            </div>
          ))}
          <button onClick={loadData} title="Recarregar" className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-500 hover:text-slate-300 transition-colors ml-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xl font-black text-white tracking-tight tabular-nums">{fmtTime(now)}</p>
            <p className="text-[11px] text-slate-500 capitalize">{fmtDate(now)}</p>
          </div>
          <button onClick={toggleFullscreen} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Slide Header ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 py-3 border-b border-slate-800/40" style={{ background: `${cfg.color}08`, borderColor: `${cfg.color}18` }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: `${cfg.color}20`, color: cfg.color }}>{cfg.icon}</div>
          <div>
            <h2 className="text-base font-black text-white">{cfg.label}</h2>
            <p className="text-[11px] text-slate-500">Slide {slideIndex + 1} de {SLIDES.length}</p>
          </div>
        </div>
        {/* Dot navigation */}
        <div className="flex items-center gap-1.5 flex-wrap justify-end max-w-2xl">
          {SLIDES.map((s, i) => {
            const c = SLIDE_CONFIG[s];
            return (
              <button key={s} onClick={() => goTo(i)}
                className="w-2.5 h-2.5 rounded-full transition-all"
                style={{ background: i === slideIndex ? c.color : '#334155', transform: i === slideIndex ? 'scale(1.4)' : 'scale(1)' }}
                title={c.label}
              />
            );
          })}
        </div>
      </div>

      {/* ── Progress bar ────────────────────────────────────────────────────── */}
      <div className="h-0.5 bg-slate-800 relative">
        <div className="absolute inset-y-0 left-0" style={{ width: `${progress}%`, background: cfg.color, transition: 'none' }} />
      </div>

      {/* ── Slide Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 px-8 py-6 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={currentSlide} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.35, ease: 'easeInOut' }} className="h-full">
            {renderSlide()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Footer controls ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 py-4 border-t border-slate-800/70 bg-slate-900/40">
        <button onClick={prev} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-bold transition-colors">
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600 font-mono">{slideIndex + 1} / {SLIDES.length}</span>
          <button onClick={() => setIsPlaying(p => !p)} className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-colors"
            style={{ background: isPlaying ? `${cfg.color}20` : '#1e293b', color: isPlaying ? cfg.color : '#64748b', border: `1px solid ${isPlaying ? cfg.color + '30' : '#334155'}` }}>
            {isPlaying ? <><Pause className="w-4 h-4" /> Pausar</> : <><Play className="w-4 h-4" /> Reproduzir</>}
          </button>
        </div>
        <button onClick={next} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-sm font-bold transition-colors">
          Próximo <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── No data warning ──────────────────────────────────────────────────── */}
      {!hasAnyData && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center bg-slate-900/90 border border-slate-700 rounded-3xl p-10 shadow-2xl pointer-events-auto">
            <Database className="w-14 h-14 text-slate-600 mx-auto mb-4" />
            <h3 className="text-xl font-black text-white mb-2">Sem dados ainda</h3>
            <p className="text-sm text-slate-400 max-w-sm">
              Acesse as abas <strong className="text-white">Insights do Farma</strong>, <strong className="text-white">Rastreio de Falta</strong>,{' '}
              <strong className="text-white">Previsibilidade</strong> e <strong className="text-white">Abastecimento</strong> e importe os dados.
            </p>
            {onBack && (
              <button onClick={onBack} className="mt-6 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-colors">
                Voltar ao Menu
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
