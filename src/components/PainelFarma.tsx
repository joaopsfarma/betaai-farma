import React, { useState, useEffect, useMemo } from 'react';
import {
  UploadCloud, Play, Pause, ChevronLeft, ChevronRight,
  PackageX, Clock, AlertCircle, ShieldCheck, DollarSign,
  TrendingDown, Activity, Layers, CheckCircle2, X,
  BarChart2, FlaskConical, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

// ── Parsers ───────────────────────────────────────────────────────────────────

const parseBrNumber = (s: string) =>
  parseFloat((s || '0').replace('R$', '').replace(/\./g, '').replace(',', '.').trim()) || 0;

const parseCSVSemi = (text: string): Record<string, string>[] => {
  const lines = text.split('\n');
  if (lines.length < 2) return [];
  const delim = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(delim).map(h => h.replace(/(^"|"$)/g, '').trim());
  const result: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const obj: Record<string, string> = {};
    let inQ = false, val = '', hi = 0;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === delim && !inQ) { if (headers[hi]) obj[headers[hi]] = val.trim(); val = ''; hi++; }
      else { val += ch; }
    }
    if (headers[hi]) obj[headers[hi]] = val.trim();
    result.push(obj);
  }
  return result;
};

const parseValidCSV = (text: string): Record<string, string>[] => {
  const lines = text.split('\n');
  const result: Record<string, string>[] = [];
  let especie = '', classe = '';
  let headers: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    const cols: string[] = [];
    let inQ = false, val = '';
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ';' && !inQ) { cols.push(val.trim()); val = ''; }
      else { val += ch; }
    }
    cols.push(val.trim());
    const first = (cols[0] || '').replace(/(^"|"$)/g, '').trim();
    if (first.toLowerCase().startsWith('esp')) { especie = cols[2]?.replace(/^\d+\s+/, '').trim() || cols[1]?.trim() || ''; continue; }
    if (first.toLowerCase().startsWith('class')) { classe = cols[2]?.replace(/^\d+\s+/, '').trim() || cols[1]?.trim() || ''; continue; }
    if (first.toLowerCase().startsWith('sub')) { continue; }
    if (first === 'Produto' || (first === '' && (cols[1] || '').trim() === 'Produto')) {
      headers = cols.map(c => c.replace(/(^"|"$)/g, '').trim()); continue;
    }
    if (!first || first.toLowerCase().startsWith('total')) continue;
    if (headers.length > 0) {
      const obj: Record<string, string> = { Espécie: especie, Classe: classe };
      headers.forEach((h, idx) => { if (h) obj[h] = (cols[idx] || '').replace(/(^"|"$)/g, '').trim(); });
      if (obj['Produto'] || obj['Descrição Medicamento']) result.push(obj);
    }
  }
  return result;
};

const parseBrDate = (s: string): Date | null => {
  if (!s) return null;
  const [d, m, y] = s.split('/');
  if (!d || !m || !y) return null;
  return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
};

const MONTHS = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

type CsvKind = 'supply' | 'abc' | 'valid' | 'unknown';
const detectKind = (rows: Record<string, string>[]): CsvKind => {
  if (!rows.length) return 'unknown';
  const cols = Object.keys(rows[0]);
  if (cols.some(c => c === 'Em Falta' || c === 'Atrasado' || c === 'Cobertura')) return 'supply';
  if (cols.some(c => c === 'C*' || c.includes('Custo') || c.includes('Consumo'))) return 'abc';
  if (cols.some(c => c === 'Validade' || c === 'Lote')) return 'valid';
  return 'unknown';
};

// ── Animated Counter ──────────────────────────────────────────────────────────

function AnimatedCount({ target, duration = 800 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const steps = 40, step = target / steps, interval = duration / steps;
    let cur = 0;
    const t = setInterval(() => {
      cur = Math.min(cur + step, target);
      setCount(Math.round(cur));
      if (cur >= target) clearInterval(t);
    }, interval);
    return () => clearInterval(t);
  }, [target, duration]);
  return <>{count}</>;
}

// ── KPI types ─────────────────────────────────────────────────────────────────

interface FarmaKpis {
  // supply
  emFalta: number; atrasados: number; cobMedia: number; valorRisco: number;
  coberturaCritica: number; total: number; taxaRuptura: number;
  // abc
  itensA: number; itensB: number; itensC: number;
  gastoTotal: number; gastoA: number; gastoB: number; gastoC: number;
  // valid
  vencidos: number; venc30: number; venc90: number; totalValidos: number; valorEstoque: number;
}

// ── Slide: Dashboard ──────────────────────────────────────────────────────────

function DashboardSlide({ kpis, hasSupply, hasAbc, hasValid }: {
  kpis: FarmaKpis; hasSupply: boolean; hasAbc: boolean; hasValid: boolean;
}) {
  const status: 'CRÍTICO' | 'ALERTA' | 'OK' =
    kpis.emFalta > 0 || kpis.vencidos > 0 ? 'CRÍTICO' :
    kpis.atrasados > 0 || kpis.venc30 > 0 ? 'ALERTA' : 'OK';

  const statusCfg = {
    'CRÍTICO': { cls: 'text-red-400 border-red-500/50 bg-red-500/10', label: 'SITUAÇÃO CRÍTICA', icon: <AlertCircle className="w-7 h-7 text-red-400 animate-pulse" /> },
    'ALERTA':  { cls: 'text-amber-400 border-amber-500/50 bg-amber-500/10', label: 'EM ALERTA', icon: <AlertCircle className="w-7 h-7 text-amber-400 animate-pulse" /> },
    'OK':      { cls: 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10', label: 'TUDO SOB CONTROLE', icon: <ShieldCheck className="w-7 h-7 text-emerald-400" /> },
  };
  const sc = statusCfg[status];

  const cards = [
    hasSupply && { label: 'Rupturas / Em Falta', value: kpis.emFalta, Icon: PackageX, col: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/40', glow: kpis.emFalta > 0 },
    hasSupply && { label: 'Pedidos Atrasados', value: kpis.atrasados, Icon: Clock, col: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/40', glow: kpis.atrasados > 0 },
    hasAbc    && { label: 'Itens Classe A', value: kpis.itensA, Icon: Layers, col: 'text-violet-400', bg: 'bg-violet-500/20', border: 'border-violet-500/40', glow: false },
    hasValid  && { label: 'Vencendo em 30d', value: kpis.venc30, Icon: AlertTriangle, col: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/40', glow: kpis.venc30 > 0 },
  ].filter(Boolean) as { label: string; value: number; Icon: any; col: string; bg: string; border: string; glow: boolean }[];

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className={`flex items-center justify-center gap-3 py-3 rounded-2xl border ${sc.cls}`}>
        {sc.icon}
        <span className={`text-2xl font-black tracking-widest uppercase ${sc.cls.split(' ')[0]}`}>{sc.label}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        {cards.map(card => (
          <div key={card.label}
            className={`rounded-2xl border ${card.bg} ${card.border} p-5 flex flex-col items-center justify-center gap-3 relative overflow-hidden ${card.glow ? 'shadow-lg' : ''}`}>
            {card.glow && <div className={`absolute inset-0 ${card.bg} animate-pulse opacity-40`} />}
            <div className={`p-3 rounded-xl ${card.bg} relative z-10`}>
              <card.Icon className={`w-8 h-8 ${card.col}`} />
            </div>
            <div className={`text-6xl font-black ${card.col} relative z-10`}>
              <AnimatedCount target={card.value} />
            </div>
            <div className="text-slate-400 text-sm font-semibold text-center relative z-10">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {hasSupply && (
          <>
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Taxa de Ruptura</div>
              <div className={`text-3xl font-black ${kpis.taxaRuptura > 2 ? 'text-red-400' : 'text-emerald-400'}`}>
                {kpis.taxaRuptura.toFixed(1)}<span className="text-lg">%</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Meta: &lt; 2%</div>
            </div>
            <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
              <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Cobertura Média</div>
              <div className={`text-3xl font-black ${kpis.cobMedia < 7 ? 'text-red-400' : kpis.cobMedia <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {Math.round(kpis.cobMedia)}<span className="text-lg"> dias</span>
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Meta: 15–30 dias</div>
            </div>
          </>
        )}
        {hasAbc && (
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Gasto Total Período</div>
            <div className="text-2xl font-black text-violet-400">
              R$ {(kpis.gastoTotal / 1000).toFixed(0)}k
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{kpis.itensA + kpis.itensB + kpis.itensC} medicamentos</div>
          </div>
        )}
        {hasValid && (
          <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Valor Estoque</div>
            <div className="text-2xl font-black text-emerald-400">
              R$ {(kpis.valorEstoque / 1000).toFixed(0)}k
            </div>
            <div className="text-[10px] text-slate-500 mt-1">{kpis.totalValidos} itens validados</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide: Itens lista genérica ───────────────────────────────────────────────

interface SupplyItem {
  cod: string; desc: string; fornec: string;
  emFalta: boolean; atrasado: boolean; diasAtraso: number;
  cobertura: number; estoqDisp: string; ocNum: string; ocEntrega: string;
  valorTotal: string; abc: string;
}

function ItemCard({ item, theme }: { item: SupplyItem; theme: 'red' | 'orange' | 'amber' }) {
  const colors = {
    red:    { border: 'border-l-red-500',    bg: 'bg-red-500/5',    badge: 'bg-red-500/20 text-red-300 border-red-500/40',    cov: 'text-red-400'    },
    orange: { border: 'border-l-orange-500', bg: 'bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', cov: 'text-orange-400' },
    amber:  { border: 'border-l-amber-500',  bg: 'bg-amber-500/5',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',  cov: 'text-amber-400'  },
  };
  const c = colors[theme];
  const covDisplay = item.emFalta
    ? <span className="text-red-400 font-black text-2xl animate-pulse">RUPTURA</span>
    : item.cobertura >= 999
      ? <span className="text-slate-400 text-2xl">—</span>
      : <span className={`${c.cov} font-black text-3xl`}>{Math.round(item.cobertura)}<span className="text-base font-medium"> dias</span></span>;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`relative flex items-stretch bg-slate-800/70 rounded-xl border border-slate-700/50 border-l-4 ${c.border} overflow-hidden`}
    >
      {item.emFalta && <div className={`absolute inset-0 ${c.bg} animate-pulse pointer-events-none`} />}
      <div className="flex-1 p-4 relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{item.cod}</span>
              {item.abc && <span className="text-[10px] font-bold text-slate-400">Curva {item.abc}</span>}
            </div>
            <p className="text-white font-bold text-base leading-snug line-clamp-2">{item.desc}</p>
            <p className="text-slate-400 text-xs mt-1 truncate">{item.fornec}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            {covDisplay}
            {item.diasAtraso > 0 && (
              <div className={`text-xs font-semibold mt-1 border rounded px-1.5 py-0.5 ${c.badge}`}>
                {item.diasAtraso}d atraso
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500 border-t border-slate-700/50 pt-2">
          <span>Estoque: <strong className="text-slate-300">{item.estoqDisp}</strong></span>
          {item.ocNum && <span>OC: <strong className="text-slate-300">{item.ocNum}</strong></span>}
          {item.ocEntrega && <span>Entrega: <strong className="text-slate-300">{item.ocEntrega}</strong></span>}
          {item.valorTotal && <span>Valor: <strong className="text-slate-300">{item.valorTotal}</strong></span>}
        </div>
      </div>
    </motion.div>
  );
}

function ItemListSlide({ items, theme, subtitle }: {
  items: SupplyItem[]; theme: 'red' | 'orange' | 'amber'; subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-slate-400 text-sm font-medium">{subtitle}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1">
        {items.map((item, idx) => <ItemCard key={`${item.cod}-${idx}`} item={item} theme={theme} />)}
      </div>
    </div>
  );
}

// ── Slide: Curva ABC ──────────────────────────────────────────────────────────

function CurvaABCSlide({ kpis, abcData }: { kpis: FarmaKpis; abcData: Record<string, string>[] }) {
  const total = kpis.itensA + kpis.itensB + kpis.itensC;
  const valTotal = kpis.gastoA + kpis.gastoB + kpis.gastoC;

  const top10 = useMemo(() => [...abcData]
    .sort((a, b) => parseBrNumber(b['Vl Custo Período'] || '0') - parseBrNumber(a['Vl Custo Período'] || '0'))
    .slice(0, 8)
    .map(r => ({
      nome: (r['Descrição Produto'] || '').slice(0, 32),
      valor: parseBrNumber(r['Vl Custo Período'] || '0'),
      curva: (r['C*'] || 'C').toUpperCase(),
    })), [abcData]);

  const ABC_COLORS: Record<string, string> = { A: '#f87171', B: '#fb923c', C: '#4ade80' };

  const classes = [
    { label: 'A', count: kpis.itensA, value: kpis.gastoA, desc: 'Alto impacto financeiro', meta: '~80% do valor total', bg: 'bg-red-500/15', border: 'border-red-500/40', badge: 'bg-red-500/20 text-red-300 border-red-500/40', text: 'text-red-400' },
    { label: 'B', count: kpis.itensB, value: kpis.gastoB, desc: 'Impacto intermediário',   meta: '~15% do valor total', bg: 'bg-amber-500/15', border: 'border-amber-500/40', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'text-amber-400' },
    { label: 'C', count: kpis.itensC, value: kpis.gastoC, desc: 'Baixo impacto financeiro',meta: '~5% do valor total',  bg: 'bg-slate-700/40', border: 'border-slate-600/40', badge: 'bg-slate-700/40 text-slate-300 border-slate-600/40', text: 'text-slate-300' },
  ];

  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="text-slate-400 text-sm font-medium">Classificação ABC por valor — {total} medicamentos analisados</p>

      <div className="grid grid-cols-3 gap-4">
        {classes.map(c => {
          const pctCount = total > 0 ? ((c.count / total) * 100).toFixed(1) : '0.0';
          const pctVal   = valTotal > 0 ? ((c.value / valTotal) * 100).toFixed(1) : '0.0';
          return (
            <motion.div key={c.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
              className={`rounded-2xl border ${c.bg} ${c.border} p-5 flex flex-col gap-3`}>
              <div className="flex items-center justify-between">
                <span className={`text-4xl font-black ${c.text}`}>{c.label}</span>
                <span className={`px-2 py-0.5 rounded-xl border text-xs font-bold ${c.badge}`}>{pctCount}% itens</span>
              </div>
              <div className={`text-5xl font-black ${c.text}`}>{c.count}</div>
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/40">
                <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Valor Total</div>
                <div className={`text-lg font-black ${c.text}`}>R$ {c.value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</div>
                <div className="text-xs text-slate-500 mt-0.5">{pctVal}% do gasto total</div>
              </div>
              <p className="text-xs text-slate-500">{c.desc} · {c.meta}</p>
            </motion.div>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Top medicamentos por custo</p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top10} layout="vertical" margin={{ left: 10, right: 60, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickFormatter={v => `R$ ${(v / 1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="nome" tick={{ fill: '#e2e8f0', fontSize: 10 }} width={200} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }}
              formatter={(v: any) => [`R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`, 'Custo']}
            />
            <Bar dataKey="valor" name="Custo" radius={[0, 4, 4, 0]}>
              {top10.map((e, i) => <Cell key={i} fill={ABC_COLORS[e.curva] || '#8b5cf6'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Slide: Validade ───────────────────────────────────────────────────────────

function ValidadeSlide({ validData, kpis }: { validData: Record<string, string>[]; kpis: FarmaKpis }) {
  const hoje = new Date();
  const d30  = new Date(hoje.getTime() + 30 * 86400000);

  const mesesChart = useMemo(() => {
    const counts: Record<string, number> = {};
    validData.forEach(r => {
      const d = parseBrDate(r['Validade'] || '');
      if (!d) return;
      const key = `${MONTHS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => {
        const toTs = ([k]: [string, number]) => {
          const [m, y] = k.split('/');
          return new Date(`20${y}-${String(MONTHS.indexOf(m) + 1).padStart(2, '0')}-01`).getTime();
        };
        return toTs(a as any) - toTs(b as any);
      })
      .slice(0, 12)
      .map(([name, qty]) => ({ name, qty }));
  }, [validData]);

  const barFill = (name: string) => {
    const [m, y] = name.split('/');
    const d = new Date(`20${y}-${String(MONTHS.indexOf(m) + 1).padStart(2, '0')}-01`);
    const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    if (endOfMonth < hoje) return '#475569';
    if (d <= d30) return '#f87171';
    return '#4ade80';
  };

  const urgentes = validData
    .filter(r => { const d = parseBrDate(r['Validade'] || ''); return d && d >= hoje && d <= d30; })
    .sort((a, b) => {
      const da = parseBrDate(a['Validade'] || '')?.getTime() ?? 0;
      const db = parseBrDate(b['Validade'] || '')?.getTime() ?? 0;
      return da - db;
    })
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="text-slate-400 text-sm font-medium">Controle de vencimentos — {kpis.totalValidos} itens monitorados</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-500/15 rounded-2xl border border-red-500/40 p-5 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-red-400 font-bold uppercase tracking-wider">Vencidos</p>
          <p className="text-6xl font-black text-red-400">{kpis.vencidos}</p>
          <p className="text-xs text-slate-500">itens expirados</p>
        </div>
        <div className="bg-amber-500/15 rounded-2xl border border-amber-500/40 p-5 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-amber-400 font-bold uppercase tracking-wider">Próx. 30 dias</p>
          <p className={`text-6xl font-black text-amber-400 ${kpis.venc30 > 0 ? 'animate-pulse' : ''}`}>{kpis.venc30}</p>
          <p className="text-xs text-slate-500">vencendo em breve</p>
        </div>
        <div className="bg-slate-700/40 rounded-2xl border border-slate-600/40 p-5 flex flex-col items-center justify-center gap-2">
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">31–90 dias</p>
          <p className="text-6xl font-black text-slate-300">{kpis.venc90}</p>
          <p className="text-xs text-slate-500">atenção moderada</p>
        </div>
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <div className="flex-1 min-h-0">
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Vencimentos por mês</p>
          <ResponsiveContainer width="100%" height="90%">
            <BarChart data={mesesChart} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 11 }} />
              <Bar dataKey="qty" name="Itens" radius={[4, 4, 0, 0]}>
                {mesesChart.map((e, i) => <Cell key={i} fill={barFill(e.name)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {urgentes.length > 0 && (
          <div className="w-72 flex flex-col gap-2 overflow-hidden">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Vencendo em breve</p>
            {urgentes.map((r, i) => {
              const d = parseBrDate(r['Validade'] || '');
              const dias = d ? Math.ceil((d.getTime() - hoje.getTime()) / 86400000) : 0;
              return (
                <div key={i} className="bg-slate-800/70 rounded-xl border border-slate-700/50 border-l-4 border-l-amber-500 px-3 py-2.5">
                  <p className="text-white text-xs font-semibold line-clamp-1">{r['Descrição Medicamento'] || '–'}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[11px] text-slate-500">{r['Lote'] || '–'} · {r['Validade'] || '–'}</span>
                    <span className={`text-xs font-black ${dias <= 7 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`}>{dias}d</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide Header helper ───────────────────────────────────────────────────────

function SlideTitle({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: { n: number; color: string } }) {
  return (
    <div className="flex items-center gap-3 mb-1">
      {/* Rede Américas stripe */}
      <div className="flex flex-col gap-0.5">
        <div className="h-1.5 w-10 rounded-full bg-violet-700" />
        <div className="h-1.5 w-8 rounded-full bg-violet-500" />
        <div className="h-1.5 w-6 rounded-full bg-violet-300" />
        <div className="h-1.5 w-4 rounded-full bg-lime-400" />
      </div>
      <div className="p-2 rounded-xl bg-slate-800 border border-slate-700/50 text-violet-400">{icon}</div>
      <h2 className="text-2xl font-black text-white">{title}</h2>
      {badge && badge.n > 0 && (
        <span className={`px-3 py-0.5 rounded-full text-sm font-black text-white animate-pulse`}
          style={{ background: badge.color }}>{badge.n}</span>
      )}
    </div>
  );
}

// ── Upload Screen ─────────────────────────────────────────────────────────────

function UploadScreen({ onStart }: {
  onStart: (s: Record<string, string>[] | null, a: Record<string, string>[] | null, v: Record<string, string>[] | null) => void;
}) {
  const [supply, setSupply] = useState<Record<string, string>[] | null>(null);
  const [abc,    setAbc]    = useState<Record<string, string>[] | null>(null);
  const [valid,  setValid]  = useState<Record<string, string>[] | null>(null);
  const [log,    setLog]    = useState<string[]>([]);
  const [drag,   setDrag]   = useState(false);

  const process = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const text = ev.target?.result as string;
        // Try hierarchical valid parser first
        const vRows = parseValidCSV(text);
        if (vRows.length > 0 && Object.keys(vRows[0]).includes('Validade')) {
          setValid(vRows);
          setLog(p => [...p, `✓ ${file.name} → Controle de Validade (${vRows.length} itens)`]);
          return;
        }
        const rows = parseCSVSemi(text);
        const kind = detectKind(rows);
        if (kind === 'supply') {
          setSupply(rows);
          setLog(p => [...p, `✓ ${file.name} → Supply Chain (${rows.length} itens)`]);
        } else if (kind === 'abc') {
          setAbc(rows);
          setLog(p => [...p, `✓ ${file.name} → Curva ABC (${rows.length} itens)`]);
        } else {
          setLog(p => [...p, `⚠ ${file.name} → tipo não identificado`]);
        }
      };
      reader.readAsText(file, 'ISO-8859-1');
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-8 p-8">
      {/* Rede Américas header */}
      <div className="text-center">
        <div className="flex flex-col gap-1.5 items-center mb-5">
          <div className="h-2 w-36 rounded-full bg-violet-800" />
          <div className="h-2 w-28 rounded-full bg-violet-600" />
          <div className="h-2 w-20 rounded-full bg-violet-400" />
          <div className="h-2 w-12 rounded-full bg-lime-400" />
        </div>
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="p-3 rounded-2xl bg-violet-600/20 border border-violet-500/30">
            <FlaskConical className="w-8 h-8 text-violet-400" />
          </div>
          <h1 className="text-5xl font-black text-white">Painel do Farma</h1>
        </div>
        <p className="text-slate-400 text-lg">Rede Américas · Gestão Farmacêutica Hospitalar · Painel TV</p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); process(e.dataTransfer.files); }}
        className={`w-full max-w-2xl rounded-3xl border-2 border-dashed p-12 flex flex-col items-center gap-5 text-center cursor-pointer transition-all duration-300
          ${drag ? 'border-violet-500 bg-violet-500/10' : 'border-slate-600 bg-slate-800/50 hover:border-violet-600'}`}>
        <div className="p-5 rounded-2xl bg-violet-600/20 border border-violet-500/30">
          <UploadCloud className="w-12 h-12 text-violet-400" />
        </div>
        <div>
          <p className="text-2xl font-bold text-white">Arraste os 3 arquivos CSV aqui</p>
          <p className="mt-2 text-slate-400">ou clique para selecionar · todos de uma vez</p>
          <p className="mt-3 text-sm text-slate-500">
            <span className="text-slate-300 font-semibold">result.csv</span> ·{' '}
            <span className="text-slate-300 font-semibold">R_C_ABC_CONSUMO_CONSO.csv</span> ·{' '}
            <span className="text-slate-300 font-semibold">R_CONT_VALID.csv</span>
          </p>
        </div>
        <label className="px-8 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-xl cursor-pointer transition-colors text-lg">
          Selecionar arquivos
          <input type="file" accept=".csv" multiple onChange={e => process(e.target.files)} className="hidden" />
        </label>
      </div>

      {/* Status */}
      <div className="flex gap-4">
        {(['supply', 'abc', 'valid'] as const).map(k => {
          const map = { supply: ['Supply Chain', !!supply], abc: ['Curva ABC', !!abc], valid: ['Validade', !!valid] };
          const [label, ok] = map[k];
          return (
            <div key={k} className={`px-4 py-2 rounded-xl flex items-center gap-2 text-sm font-semibold border transition-all
              ${ok ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}>
              {ok ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-slate-600" />}
              {label as string}
            </div>
          );
        })}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="w-full max-w-2xl bg-slate-800/80 border border-slate-700 rounded-2xl p-5 space-y-2">
          {log.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${l.startsWith('⚠') ? 'text-amber-400' : 'text-emerald-400'}`} />
              <span className={l.startsWith('⚠') ? 'text-amber-300' : 'text-slate-200'}>{l}</span>
            </div>
          ))}
        </div>
      )}

      {(supply || abc || valid) && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          onClick={() => onStart(supply, abc, valid)}
          className="px-14 py-4 rounded-2xl text-xl font-black text-white flex items-center gap-3 bg-gradient-to-r from-violet-600 to-lime-500 hover:opacity-90 transition-opacity shadow-2xl shadow-violet-900/50">
          <Play className="w-6 h-6" /> Iniciar Painel TV
        </motion.button>
      )}
    </div>
  );
}

// ── Live Clock ────────────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <span className="font-mono font-bold text-white">{now.toLocaleTimeString('pt-BR')}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

const SLIDE_MS = 10000;
const ITEMS_PER_SLIDE = 6;

export default function PainelFarma() {
  const [supplyData, setSupplyData] = useState<Record<string, string>[] | null>(null);
  const [abcData,    setAbcData]    = useState<Record<string, string>[] | null>(null);
  const [validData,  setValidData]  = useState<Record<string, string>[] | null>(null);
  const [started,    setStarted]    = useState(false);
  const [slideIdx,   setSlideIdx]   = useState(0);
  const [playing,    setPlaying]    = useState(true);
  const [progress,   setProgress]   = useState(0);

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo((): FarmaKpis => {
    const today = new Date();
    const d30 = new Date(today.getTime() + 30 * 86400000);
    const d90 = new Date(today.getTime() + 90 * 86400000);

    // supply
    const emFalta   = supplyData?.filter(r => r['Em Falta']?.toLowerCase() === 'sim').length ?? 0;
    const atrasados = supplyData?.filter(r => r['Atrasado']?.toLowerCase() === 'sim' || parseInt(r['Dias Atraso'] || '0') > 0).length ?? 0;
    const cobs = supplyData?.map(r => parseBrNumber(r['Cobertura'] || '0')).filter(v => v > 0 && v < 999) ?? [];
    const cobMedia = cobs.length ? cobs.reduce((a, b) => a + b, 0) / cobs.length : 0;
    const valorRisco = supplyData?.filter(r => r['Em Falta']?.toLowerCase() === 'sim')
      .reduce((a, r) => a + parseBrNumber(r['Valor total'] || r['Valor Total'] || '0'), 0) ?? 0;
    const total = supplyData?.length ?? 0;
    const coberturaCritica = supplyData?.filter(r => { const c = parseBrNumber(r['Cobertura'] || '999'); return c > 0 && c < 7 && r['Em Falta']?.toLowerCase() !== 'sim'; }).length ?? 0;
    const taxaRuptura = total > 0 ? parseFloat(((emFalta / total) * 100).toFixed(1)) : 0;

    // abc
    const abcRows = abcData || [];
    const itensA = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'A').length;
    const itensB = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'B').length;
    const itensC = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'C').length;
    const gastoTotal = abcRows.reduce((a, r) => a + parseBrNumber(r['Vl Custo Período'] || '0'), 0);
    const gastoA = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'A').reduce((a, r) => a + parseBrNumber(r['Vl Custo Período'] || '0'), 0);
    const gastoB = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'B').reduce((a, r) => a + parseBrNumber(r['Vl Custo Período'] || '0'), 0);
    const gastoC = abcRows.filter(r => (r['C*'] || '').toUpperCase() === 'C').reduce((a, r) => a + parseBrNumber(r['Vl Custo Período'] || '0'), 0);

    // valid
    const vRows = validData || [];
    const vencidos = vRows.filter(r => { const d = parseBrDate(r['Validade'] || ''); return d && d < today; }).length;
    const venc30   = vRows.filter(r => { const d = parseBrDate(r['Validade'] || ''); return d && d >= today && d <= d30; }).length;
    const venc90   = vRows.filter(r => { const d = parseBrDate(r['Validade'] || ''); return d && d > d30 && d <= d90; }).length;
    const totalValidos = vRows.length;
    const valorEstoque = vRows.reduce((a, r) => a + parseBrNumber(r['Vl Total'] || '0'), 0);

    return { emFalta, atrasados, cobMedia, valorRisco, coberturaCritica, total, taxaRuptura,
             itensA, itensB, itensC, gastoTotal, gastoA, gastoB, gastoC,
             vencidos, venc30, venc90, totalValidos, valorEstoque };
  }, [supplyData, abcData, validData]);

  // ── Supply items for slides ───────────────────────────────────────────────

  const supplyItems = useMemo((): SupplyItem[] =>
    (supplyData || []).map(r => ({
      cod: r['Cod Item'] || '',
      desc: r['Desc Item'] || '',
      fornec: r['Fornecedor'] || r['Fornec'] || '',
      emFalta: r['Em Falta']?.toLowerCase() === 'sim',
      atrasado: r['Atrasado']?.toLowerCase() === 'sim' || parseInt(r['Dias Atraso'] || '0') > 0,
      diasAtraso: parseInt(r['Dias Atraso'] || '0') || 0,
      cobertura: parseBrNumber(r['Cobertura'] || '999') || 999,
      estoqDisp: r['Estoq Disp'] || '0',
      ocNum: r['OC - Núm'] || '',
      ocEntrega: r['Nova Data Ent'] || r['OC - Entrega'] || '',
      valorTotal: r['Valor total'] || r['Valor Total'] || '',
      abc: r['ABC'] || r['Curva ABC'] || '',
    })), [supplyData]);

  const rupturas   = useMemo(() => supplyItems.filter(i => i.emFalta), [supplyItems]);
  const cobCritica = useMemo(() => supplyItems.filter(i => !i.emFalta && i.cobertura < 7 && i.cobertura > 0), [supplyItems]);
  const atrasados  = useMemo(() => supplyItems.filter(i => i.atrasado && !i.emFalta).sort((a, b) => b.diasAtraso - a.diasAtraso), [supplyItems]);

  // ── Build slide list ──────────────────────────────────────────────────────

  type Slide = { id: string; label: string; page?: number };
  const slides = useMemo((): Slide[] => {
    const s: Slide[] = [{ id: 'dashboard', label: 'Visão Geral' }];
    if (supplyData?.length) {
      for (let p = 0; p < Math.max(1, Math.ceil(rupturas.length / ITEMS_PER_SLIDE)); p++)
        s.push({ id: 'rupturas', label: 'Rupturas', page: p });
      for (let p = 0; p < Math.max(1, Math.ceil(cobCritica.length / ITEMS_PER_SLIDE)); p++)
        s.push({ id: 'cob_critica', label: 'Cob. Crítica', page: p });
      if (atrasados.length)
        for (let p = 0; p < Math.ceil(atrasados.length / ITEMS_PER_SLIDE); p++)
          s.push({ id: 'atrasados', label: 'Atrasados', page: p });
    }
    if (abcData?.length) s.push({ id: 'abc', label: 'Curva ABC' });
    if (validData?.length) s.push({ id: 'validade', label: 'Validade' });
    return s;
  }, [supplyData, abcData, validData, rupturas, cobCritica, atrasados]);

  // ── Auto-advance ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!started || !playing || slides.length === 0) return;
    setProgress(0);
    const tick = 100, steps = SLIDE_MS / tick;
    let cur = 0;
    const t = setInterval(() => {
      cur++;
      setProgress((cur / steps) * 100);
      if (cur >= steps) { setSlideIdx(i => (i + 1) % slides.length); cur = 0; setProgress(0); }
    }, tick);
    return () => clearInterval(t);
  }, [started, playing, slideIdx, slides.length]);

  const goTo = (i: number) => { setSlideIdx(i); setProgress(0); };

  // ── Render slide ──────────────────────────────────────────────────────────

  const current = slides[slideIdx];
  const renderSlide = () => {
    if (!current) return null;
    const p = current.page ?? 0;
    switch (current.id) {
      case 'dashboard':
        return <DashboardSlide kpis={kpis} hasSupply={!!supplyData} hasAbc={!!abcData} hasValid={!!validData} />;
      case 'rupturas':
        return (
          <>
            <SlideTitle icon={<PackageX className="w-5 h-5" />} title="Rupturas / Em Falta" badge={{ n: rupturas.length, color: '#ef4444' }} />
            <ItemListSlide items={rupturas.slice(p * ITEMS_PER_SLIDE, (p + 1) * ITEMS_PER_SLIDE)}
              theme="red" subtitle={`${rupturas.length} item${rupturas.length !== 1 ? 'ns' : ''} em ruptura — pág. ${p + 1}`} />
          </>
        );
      case 'cob_critica':
        return (
          <>
            <SlideTitle icon={<TrendingDown className="w-5 h-5" />} title="Cobertura Crítica" badge={{ n: cobCritica.length, color: '#ea580c' }} />
            <ItemListSlide items={cobCritica.slice(p * ITEMS_PER_SLIDE, (p + 1) * ITEMS_PER_SLIDE)}
              theme="orange" subtitle={`${cobCritica.length} item${cobCritica.length !== 1 ? 'ns' : ''} com cobertura < 7 dias — pág. ${p + 1}`} />
          </>
        );
      case 'atrasados':
        return (
          <>
            <SlideTitle icon={<Clock className="w-5 h-5" />} title="Pedidos Atrasados" badge={{ n: atrasados.length, color: '#d97706' }} />
            <ItemListSlide items={atrasados.slice(p * ITEMS_PER_SLIDE, (p + 1) * ITEMS_PER_SLIDE)}
              theme="amber" subtitle={`${atrasados.length} pedido${atrasados.length !== 1 ? 's' : ''} em atraso — pág. ${p + 1}`} />
          </>
        );
      case 'abc':
        return abcData ? (
          <>
            <SlideTitle icon={<Layers className="w-5 h-5" />} title="Curva ABC — Consumo" />
            <CurvaABCSlide kpis={kpis} abcData={abcData} />
          </>
        ) : null;
      case 'validade':
        return validData ? (
          <>
            <SlideTitle icon={<Clock className="w-5 h-5" />} title="Controle de Validade" badge={{ n: kpis.venc30, color: '#f59e0b' }} />
            <ValidadeSlide validData={validData} kpis={kpis} />
          </>
        ) : null;
      default: return null;
    }
  };

  // ── Upload screen ─────────────────────────────────────────────────────────

  if (!started) {
    return (
      <UploadScreen onStart={(s, a, v) => {
        setSupplyData(s); setAbcData(a); setValidData(v);
        setStarted(true); setSlideIdx(0);
      }} />
    );
  }

  // ── TV Panel ──────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-800/80 border-b border-slate-700/50 flex-shrink-0">
        {/* Logo Rede Américas */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="h-1.5 w-12 rounded-full bg-violet-700" />
            <div className="h-1.5 w-9 rounded-full bg-violet-500" />
            <div className="h-1.5 w-6 rounded-full bg-violet-300" />
            <div className="h-1.5 w-4 rounded-full bg-lime-400" />
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Rede Américas</p>
            <p className="text-lg font-black text-white leading-tight flex items-center gap-2">
              <FlaskConical className="w-5 h-5 text-violet-400 inline" /> Painel do Farma
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="hidden lg:flex items-center gap-1 flex-1 justify-center px-6 overflow-x-auto">
          {slides.map((s, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex-shrink-0
                ${slideIdx === i ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}>
              {s.label}{s.page !== undefined ? ` ${s.page + 1}` : ''}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button onClick={() => goTo((slideIdx - 1 + slides.length) % slides.length)}
            className="p-2 rounded-xl bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button onClick={() => setPlaying(p => !p)}
            className="p-2 rounded-xl bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button onClick={() => goTo((slideIdx + 1) % slides.length)}
            className="p-2 rounded-xl bg-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
          <button onClick={() => setStarted(false)}
            className="p-2 rounded-xl bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all ml-1">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-700/50 flex-shrink-0">
        <motion.div className="h-full bg-gradient-to-r from-violet-500 to-lime-400 rounded-r-full"
          style={{ width: `${progress}%` }} transition={{ ease: 'linear' }} />
      </div>

      {/* Slide */}
      <div className="flex-1 p-8 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div key={`${current?.id}-${current?.page}-${slideIdx}`}
            className="h-full flex flex-col gap-4"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}>
            {renderSlide()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-6 py-2.5 bg-slate-800/80 border-t border-slate-700/50 flex-shrink-0">
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${slideIdx === i ? 'w-6 bg-violet-400' : 'w-1.5 bg-slate-600 hover:bg-slate-500'}`} />
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-500">
          {supplyData && <span>{supplyData.length} itens supply</span>}
          {abcData    && <span>{abcData.length} itens ABC</span>}
          {validData  && <span>{validData.length} itens validade</span>}
          <LiveClock />
        </div>
      </div>
    </div>
  );
}
