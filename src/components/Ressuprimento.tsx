import React, { useState, useMemo } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { AlertTriangle, TrendingDown, Clock, Package, Upload, Filter, FileText, BarChart2, ShoppingCart, XCircle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { exportRessuprimentoPDF } from '../utils/pdfExport';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis,
} from 'recharts';

interface OCItem {
  id: string;
  oc: string;
  fornecedor: string;
  quantidadeComprada: number;
  dataPrevista: string;
}

interface TrackingItem {
  id: string;
  produto: string;
  unidade: string;
  mediaConsumo: number;
  saldoAtual: number;
  coberturaDias: number;
  status: 'CRÍTICO' | 'ALERTA' | 'OK';
  previsaoRuptura: string;
  pontoRessuprimento: number;
  necessidadeCompra: number;
  ocInfo?: OCItem;
}

type SubTab = 'dashboard' | 'lista';

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; height?: number }> =
  ({ title, subtitle, children, height = 240 }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 min-w-0">
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    <div className="mt-3 w-full" style={{ height }}>{children}</div>
  </div>
);

export const Ressuprimento: React.FC = () => {
  const [trackingData, setTrackingData] = usePersistentState<TrackingItem[]>('ressuprimento_tracking', []);
  const [ocData, setOcData] = usePersistentState<Record<string, OCItem>>('ressuprimento_oc', {});
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'CRÍTICO' | 'ALERTA' | 'OK'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('dashboard');

  const handleTrackingUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        let headerIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Média')) { headerIdx = i; break; }
        }
        const data: TrackingItem[] = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',');
          if (cols.length < 9) continue;
          const id = cols[0]?.trim() || '';
          const produto = cols[1]?.trim() || '';
          const unidade = cols[2]?.trim() || '';
          const mediaRaw = parseFloat(cols[7]?.replace(',', '.') || '0') || 0;
          const saldo = parseFloat(cols[8]?.replace(',', '.') || '0') || 0;
          if (!id || !produto || id === 'ID') continue;
          if (mediaRaw <= 0) continue;
          const cobertura = saldo / mediaRaw;
          data.push({
            id, produto, unidade,
            mediaConsumo: mediaRaw,
            saldoAtual: saldo,
            coberturaDias: cobertura,
            status: cobertura <= 3 ? 'CRÍTICO' : cobertura <= 7 ? 'ALERTA' : 'OK',
            previsaoRuptura: cobertura <= 0 ? 'ESGOTADO' : `Em ${Math.ceil(cobertura)} dias`,
            pontoRessuprimento: mediaRaw * 7,
            necessidadeCompra: Math.max(0, mediaRaw * 7 - saldo),
          });
        }
        setTrackingData(data);
      } catch (error) {
        console.error('Erro ao processar tracking:', error);
        alert('Erro ao processar arquivo de rastreio');
      }
    };
    reader.readAsText(file);
  };

  const handleOCUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        const ocMap: Record<string, OCItem> = {};
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',');
          if (cols.length < 11) continue;
          const dataPrevista = cols[0]?.trim();
          const oc = cols[2]?.trim();
          const fornecedor = cols[5]?.trim();
          const id = cols[6]?.trim();
          const qtComprada = parseFloat(cols[10]?.replace(',', '.') || '0');
          if (id && oc && !ocMap[id]) {
            ocMap[id] = { id, oc, fornecedor: fornecedor || 'N/A', quantidadeComprada: qtComprada, dataPrevista: dataPrevista || 'N/A' };
          }
        }
        setOcData(ocMap);
      } catch (error) {
        console.error('Erro ao processar OC:', error);
        alert('Erro ao processar arquivo de ordens de compra');
      }
    };
    reader.readAsText(file);
  };

  const allData = useMemo(() =>
    trackingData.map(item => ({ ...item, ocInfo: ocData[item.id] })),
    [trackingData, ocData]
  );

  const displayData = useMemo(() =>
    allData
      .filter(item => {
        const matchesStatus = filterStatus === 'TODOS' || item.status === filterStatus;
        const matchesSearch =
          item.produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.id.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesSearch;
      })
      .sort((a, b) => a.coberturaDias - b.coberturaDias),
    [allData, filterStatus, searchTerm]
  );

  const allStats = useMemo(() => {
    const criticos = allData.filter(d => d.status === 'CRÍTICO').length;
    const alertas = allData.filter(d => d.status === 'ALERTA').length;
    const ok = allData.filter(d => d.status === 'OK').length;
    const coberturaMedia = allData.length > 0 ? allData.reduce((s, d) => s + d.coberturaDias, 0) / allData.length : 0;
    const necessidadeTotal = allData.reduce((s, d) => s + d.necessidadeCompra, 0);
    const criticosSemOC = allData.filter(d => d.status === 'CRÍTICO' && !d.ocInfo).length;
    return { criticos, alertas, ok, coberturaMedia, necessidadeTotal, criticosSemOC, total: allData.length };
  }, [allData]);

  const filteredStats = useMemo(() => ({
    totalItens: displayData.length,
    criticos: displayData.filter(d => d.status === 'CRÍTICO').length,
    necessidadeTotal: displayData.reduce((s, d) => s + d.necessidadeCompra, 0),
    coberturaMedia: displayData.length > 0 ? displayData.reduce((s, d) => s + d.coberturaDias, 0) / displayData.length : 0,
  }), [displayData]);

  const statusPieData = useMemo(() => [
    { name: 'CRÍTICO', value: allStats.criticos, color: '#dc2626' },
    { name: 'ALERTA',  value: allStats.alertas,  color: '#d97706' },
    { name: 'OK',      value: allStats.ok,        color: '#059669' },
  ].filter(d => d.value > 0), [allStats]);

  const top10Cobertura = useMemo(() =>
    [...allData].sort((a, b) => a.coberturaDias - b.coberturaDias).slice(0, 10).map(d => ({
      name: d.produto.length > 26 ? d.produto.substring(0, 26) + '…' : d.produto,
      cobertura: parseFloat(d.coberturaDias.toFixed(1)),
      status: d.status,
    })), [allData]);

  const top12Necessidade = useMemo(() =>
    [...allData].filter(d => d.status !== 'OK').sort((a, b) => b.necessidadeCompra - a.necessidadeCompra).slice(0, 12).map(d => ({
      name: d.id,
      saldo: Math.round(d.saldoAtual),
      necessidade: Math.round(d.necessidadeCompra),
    })), [allData]);

  const scatterCritico = useMemo(() => allData.filter(d => d.status === 'CRÍTICO').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)) })), [allData]);
  const scatterAlerta  = useMemo(() => allData.filter(d => d.status === 'ALERTA').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)) })), [allData]);
  const scatterOK      = useMemo(() => allData.filter(d => d.status === 'OK').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)) })), [allData]);

  const RADIAN = Math.PI / 180;
  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'lista', label: 'Lista', icon: <Package className="w-4 h-4" />, count: displayData.length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-6 space-y-8">
      {/* Hero Section */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex justify-between items-start gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl shadow-lg">
                <BarChart2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-blue-600 bg-clip-text text-transparent">
                Inteligência de Ressuprimento
              </h1>
            </div>
            <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
              Cruzamento inteligente de estoque, consumo e ordens de compra para prevenção proativa de rupturas farmacêuticas.
            </p>
          </div>
          <div className="flex gap-3 flex-col">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passo 1: Estoque</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 rounded-xl cursor-pointer hover:shadow-md transition border border-indigo-200 font-semibold">
                <Upload className="w-4 h-4" />
                <span>{trackingData.length > 0 ? `Rastreio (${trackingData.length})` : 'Importar Rastreio'}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleTrackingUpload} />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passo 2: Compras</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 rounded-xl cursor-pointer hover:shadow-md transition border border-emerald-200 font-semibold">
                <ShoppingCart className="w-4 h-4" />
                <span>{Object.keys(ocData).length > 0 ? `OCs (${Object.keys(ocData).length})` : 'Importar OCs'}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleOCUpload} />
              </label>
            </div>
          </div>
        </div>
      </motion.div>

      {trackingData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* Sub-tab nav */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-1">
            {subTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all -mb-px
                  ${activeSubTab === tab.id
                    ? 'border-indigo-500 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-600'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
          {activeSubTab === 'dashboard' && (
            <div className="p-4 md:p-6 space-y-6">
              {/* 6 KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-red-500">
                  <div className="p-2.5 rounded-xl bg-red-50"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Críticos</p>
                    <p className="text-2xl font-bold text-red-600 mt-0.5">{allStats.criticos}</p>
                    <p className="text-xs text-slate-400">0–3 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-amber-400">
                  <div className="p-2.5 rounded-xl bg-amber-50"><TrendingDown className="w-5 h-5 text-amber-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Alertas</p>
                    <p className="text-2xl font-bold text-amber-600 mt-0.5">{allStats.alertas}</p>
                    <p className="text-xs text-slate-400">3–7 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-emerald-500">
                  <div className="p-2.5 rounded-xl bg-emerald-50"><CheckCircle className="w-5 h-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">OK</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-0.5">{allStats.ok}</p>
                    <p className="text-xs text-slate-400">&gt;7 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-indigo-500">
                  <div className="p-2.5 rounded-xl bg-indigo-50"><Package className="w-5 h-5 text-indigo-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Necessidade Total</p>
                    <p className="text-2xl font-bold text-indigo-600 mt-0.5">{Math.round(allStats.necessidadeTotal).toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-slate-400">unidades a comprar</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-blue-400">
                  <div className="p-2.5 rounded-xl bg-blue-50"><Clock className="w-5 h-5 text-blue-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Cobertura Média</p>
                    <p className="text-2xl font-bold text-blue-600 mt-0.5">{allStats.coberturaMedia.toFixed(1)}d</p>
                    <p className="text-xs text-slate-400">dias de estoque (média)</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-rose-600">
                  <div className="p-2.5 rounded-xl bg-rose-50"><XCircle className="w-5 h-5 text-rose-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Críticos sem OC</p>
                    <p className="text-2xl font-bold text-rose-600 mt-0.5">{allStats.criticosSemOC}</p>
                    <p className="text-xs text-slate-400">sem ordem de compra</p>
                  </div>
                </div>
              </div>

              {/* Charts row 1: Donut + Horizontal Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <ChartCard title="Distribuição de Status" subtitle="Crítico · Alerta · OK" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={105}
                        dataKey="value" labelLine={false} label={renderPieLabel}>
                        {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(v: any, name: any) => [v, name]} />
                      <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top 10 — Menor Cobertura" subtitle="Itens com risco mais iminente de ruptura" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top10Cobertura} layout="vertical" margin={{ top: 0, right: 45, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}d`} />
                      <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 9 }} />
                      <Tooltip formatter={(v: any) => [`${v} dias`, 'Cobertura']} />
                      <Bar dataKey="cobertura" radius={[0, 6, 6, 0]}>
                        {top10Cobertura.map((entry, i) => (
                          <Cell key={i} fill={entry.status === 'CRÍTICO' ? '#dc2626' : entry.status === 'ALERTA' ? '#d97706' : '#059669'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Charts row 2: Grouped Bar + Scatter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <ChartCard title="Saldo vs Necessidade de Compra" subtitle="Top 12 críticos/alerta por necessidade" height={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top12Necessidade} margin={{ top: 5, right: 10, left: -10, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="saldo" name="Saldo Atual" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="necessidade" name="Necessidade" fill="#dc2626" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Consumo × Cobertura" subtitle="Tamanho do ponto = necessidade de compra" height={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="x" name="Consumo/dia" tick={{ fontSize: 9 }}
                        label={{ value: 'Consumo/dia', position: 'insideBottom', offset: -10, fontSize: 9 }} />
                      <YAxis type="number" dataKey="y" name="Cobertura (d)" tick={{ fontSize: 9 }}
                        label={{ value: 'Cobertura (d)', angle: -90, position: 'insideLeft', fontSize: 9 }} />
                      <ZAxis type="number" dataKey="z" range={[30, 300]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <Scatter name="CRÍTICO" data={scatterCritico} fill="#dc2626" fillOpacity={0.7} />
                      <Scatter name="ALERTA"  data={scatterAlerta}  fill="#d97706" fillOpacity={0.7} />
                      <Scatter name="OK"      data={scatterOK}      fill="#059669" fillOpacity={0.7} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>
            </div>
          )}

          {/* ── LISTA ─────────────────────────────────────────────────────── */}
          {activeSubTab === 'lista' && (
            <>
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50 to-blue-50 flex-wrap gap-4">
                <div className="flex gap-4 items-center flex-1 min-w-0">
                  <div className="relative flex-1 max-w-sm">
                    <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Filtrar por ID ou produto..."
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition"
                      value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
                    {(['TODOS', 'CRÍTICO', 'ALERTA', 'OK'] as const).map(s => (
                      <button key={s} onClick={() => setFilterStatus(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap ${filterStatus === s ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => exportRessuprimentoPDF(displayData, { status: filterStatus, search: searchTerm })}
                  className="flex items-center gap-2 px-4 py-2.5 text-indigo-600 font-bold text-sm hover:bg-indigo-50 rounded-xl transition border border-indigo-200">
                  <FileText className="w-4 h-4" />Exportar PDF
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-xs font-bold uppercase tracking-wider border-b-2 border-indigo-700">
                      <th className="px-6 py-4 text-left">ID - Produto - Unidade</th>
                      <th className="px-6 py-4 text-right">Consumo Médio</th>
                      <th className="px-6 py-4 text-right">Saldo Atual</th>
                      <th className="px-6 py-4 text-right">Cobertura (dias)</th>
                      <th className="px-6 py-4 text-center">Status</th>
                      <th className="px-6 py-4 text-center">Previsão de Ruptura</th>
                      <th className="px-6 py-4 text-right">Necessidade Compra</th>
                      <th className="px-6 py-4 text-left">Ordem de Compra</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <AnimatePresence>
                      {displayData.map((item, idx) => (
                        <motion.tr key={`${item.id}-${idx}`}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className={`hover:bg-slate-50/80 transition border-l-4 ${
                            item.status === 'CRÍTICO' ? 'border-l-red-500 bg-red-50/30'
                            : item.status === 'ALERTA' ? 'border-l-amber-500 bg-amber-50/30'
                            : 'border-l-emerald-500 bg-emerald-50/30'}`}>
                          <td className="px-6 py-4">
                            <div className="text-sm font-semibold text-slate-900 whitespace-nowrap overflow-hidden text-ellipsis">
                              <span className="text-indigo-600 font-bold">{item.id}</span>{' '}
                              <span className="text-slate-700">{item.produto}</span>{' '}
                              <span className="inline-block px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-semibold">{item.unidade}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-semibold text-slate-900">{item.mediaConsumo.toFixed(2)}</div>
                            <div className="text-xs text-slate-400">/dia</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-bold text-slate-900">{item.saldoAtual.toFixed(0)}</div>
                            <div className="text-xs text-slate-400">unidades</div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className={`text-lg font-bold ${item.coberturaDias <= 3 ? 'text-red-600' : item.coberturaDias <= 7 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {item.coberturaDias.toFixed(2)}
                            </div>
                            <div className="text-xs text-slate-400">dias</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${
                              item.status === 'CRÍTICO' ? 'bg-red-100 text-red-700 border border-red-300'
                              : item.status === 'ALERTA' ? 'bg-amber-100 text-amber-700 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-300'}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className={`text-xs font-bold ${item.coberturaDias <= 0 ? 'text-red-600' : 'text-slate-700'}`}>
                              {item.previsaoRuptura}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="text-sm font-bold text-indigo-600">{item.necessidadeCompra.toFixed(0)}</div>
                            <div className="text-xs text-slate-400">unidades</div>
                          </td>
                          <td className="px-6 py-4">
                            {item.ocInfo ? (
                              <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-2.5 space-y-1">
                                <div className="text-[11px] font-bold text-emerald-700 uppercase">OC: {item.ocInfo.oc}</div>
                                <div className="text-xs font-semibold text-emerald-900">{item.ocInfo.quantidadeComprada} un</div>
                                <div className="text-[10px] text-emerald-600">{item.ocInfo.fornecedor}</div>
                                <div className="text-[10px] text-emerald-600">{item.ocInfo.dataPrevista}</div>
                              </div>
                            ) : (
                              <div className={`flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg ${item.status === 'CRÍTICO' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                <XCircle className="w-3.5 h-3.5" />Sem OC
                              </div>
                            )}
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              <div className="px-6 py-4 bg-gradient-to-r from-slate-50 to-blue-50 border-t border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-slate-600 font-medium">Total de Itens:</span><span className="ml-2 font-bold text-slate-900">{filteredStats.totalItens}</span></div>
                  <div><span className="text-slate-600 font-medium">Críticos:</span><span className="ml-2 font-bold text-red-600">{filteredStats.criticos}</span></div>
                  <div><span className="text-slate-600 font-medium">Necessidade Total:</span><span className="ml-2 font-bold text-indigo-600">{Math.round(filteredStats.necessidadeTotal)} un</span></div>
                  <div><span className="text-slate-600 font-medium">Cobertura Média:</span><span className="ml-2 font-bold text-slate-900">{filteredStats.coberturaMedia.toFixed(1)} dias</span></div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {trackingData.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium text-lg">Importe os arquivos CSV para visualizar os dados</p>
          <p className="text-slate-400 text-sm mt-2">Comece importando o arquivo de rastreio de estoque e depois as ordens de compra</p>
        </motion.div>
      )}
    </div>
  );
};
