import React, { useState, useMemo } from 'react';
import {
  Activity, Upload, CheckCircle, AlertTriangle, Package,
  Clock, TrendingDown, BarChart2, X, DollarSign, Users,
  ArrowDownUp, ShoppingCart
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ReferenceLine,
} from 'recharts';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AcuracidadeRow {
  tipo: string;
  situacao: string;
  qtSolicitado: number;
  qtAtendida: number;
  alcancado: number;
}

interface HorarioRow {
  tipo: string;
  h0006: number;
  h0612: number;
  h1218: number;
  h1824: number;
  total: number;
}

interface MovimentacaoRow {
  codEstoque: string;
  estoque: string;
  codSetor: string;
  setor: string;
  devolucao: number;
  saida: number;
  total: number;
}

interface SaidaRow {
  codEspecie: string;
  especie: string;
  codProduto: string;
  produto: string;
  unidade: string;
  qtdeSaida: number;
  qtdeDevolvida: number;
  vlTotal: number;
  codEstoque: string;
  estoque: string;
}

interface ConsumoRow {
  seq: number;
  cod: string;
  produto: string;
  unidade: string;
  custoUnit: number;
  qtdConsumo: number;
  vlCustoPeriodo: number;
  custoAcumulado: number;
  pctSobreTotal: number;
}

// ─── Parsers & Helpers ───────────────────────────────────────────────────────

function parseSemi(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ';' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

function parseComma(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

function parseBR(s: string): number {
  const c = (s || '').replace(/\s/g, '').replace('%', '').replace(/\./g, '').replace(',', '.');
  return parseFloat(c) || 0;
}

function fmtNum(v: number, d = 0): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ─── CSV Parsers ─────────────────────────────────────────────────────────────

function parseAcuracidade(text: string): AcuracidadeRow[] {
  const lines = text.split(/\r?\n/);
  const results: AcuracidadeRow[] = [];
  let headerFound = false;
  for (const raw of lines) {
    const cols = parseSemi(raw);
    if (!headerFound) {
      const n = cols[0]?.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (n.includes('DESCRICAO') || n.includes('DESCRI')) {
        headerFound = true;
      }
      continue;
    }
    const tipo = cols[0]?.trim();
    if (!tipo) continue;
    results.push({
      tipo,
      situacao: cols[1]?.trim() || '',
      qtSolicitado: parseBR(cols[2]),
      qtAtendida: parseBR(cols[3]),
      alcancado: parseBR(cols[4]),
    });
  }
  return results;
}

function parseHorarios(text: string): HorarioRow[] {
  const lines = text.split(/\r?\n/);
  const results: HorarioRow[] = [];
  let headerFound = false;
  for (const raw of lines) {
    const cols = parseSemi(raw);
    if (!headerFound) {
      if (cols[0]?.trim().toUpperCase().includes('TIPO')) {
        headerFound = true;
      }
      continue;
    }
    const tipo = cols[0]?.trim();
    if (!tipo) continue;
    results.push({
      tipo,
      h0006: parseBR(cols[1]),
      h0612: parseBR(cols[2]),
      h1218: parseBR(cols[3]),
      h1824: parseBR(cols[4]),
      total: parseBR(cols[5]),
    });
  }
  return results;
}

function parseMovimentacao(text: string): MovimentacaoRow[] {
  const lines = text.split(/\r?\n/);
  const results: MovimentacaoRow[] = [];
  let headerFound = false;
  for (const raw of lines) {
    const cols = parseSemi(raw);
    if (!headerFound) {
      const n0 = cols[0]?.trim().toUpperCase().replace(/[^A-Z]/g, '');
      const n2 = cols[2]?.trim().toUpperCase();
      if (n0.includes('COD') || n2.includes('ESTOQUE')) {
        headerFound = true;
      }
      continue;
    }
    const setor = cols[4]?.trim();
    if (!setor) continue;
    results.push({
      codEstoque: cols[1]?.trim() || '',
      estoque: cols[2]?.trim() || '',
      codSetor: cols[3]?.trim() || '',
      setor,
      devolucao: parseBR(cols[6]),
      saida: parseBR(cols[7]),
      total: parseBR(cols[8]),
    });
  }
  return results;
}

function parseSaidas(text: string): SaidaRow[] {
  const lines = text.split(/\r?\n/);
  const results: SaidaRow[] = [];
  let headerFound = false;
  for (const raw of lines) {
    const cols = parseSemi(raw);
    if (!headerFound) {
      const n0 = cols[0]?.trim().toUpperCase().replace(/[^A-Z]/g, '');
      const n2 = cols[2]?.trim().toUpperCase().replace(/[^A-Z]/g, '');
      if ((n0.includes('COD') || n0.includes('ESP')) && n2.includes('COD')) {
        headerFound = true;
      }
      continue;
    }
    const produto = cols[3]?.trim();
    if (!produto) continue;
    results.push({
      codEspecie: cols[0]?.trim() || '',
      especie: cols[1]?.trim() || '',
      codProduto: cols[2]?.trim() || '',
      produto,
      unidade: cols[4]?.trim() || '',
      qtdeSaida: parseBR(cols[6]),
      qtdeDevolvida: parseBR(cols[7]),
      vlTotal: parseBR(cols[8]),
      codEstoque: cols[9]?.trim() || '',
      estoque: cols[10]?.trim() || '',
    });
  }
  return results;
}

function parseConsumo332(text: string): ConsumoRow[] {
  const lines = text.replace(/\r/g, '').split('\n');
  const results: ConsumoRow[] = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const cols = parseComma(raw);
    const seq = parseInt(cols[0] || '', 10);
    if (isNaN(seq) || seq <= 0) continue;
    const pctStr = (cols[16] || cols[15] || '').replace('%', '').trim();
    results.push({
      seq,
      cod: cols[1]?.trim() || '',
      produto: (cols[3] || cols[2] || '').trim(),
      unidade: (cols[4] || '').trim(),
      custoUnit: parseBR(cols[8] || cols[7] || ''),
      qtdConsumo: parseBR(cols[10] || cols[9] || ''),
      vlCustoPeriodo: parseBR(cols[12] || cols[11] || ''),
      custoAcumulado: parseBR(cols[14] || cols[13] || ''),
      pctSobreTotal: parseBR(pctStr) / 100,
    });
  }
  return results;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const COLORS_AMBER = ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7'];
const COLORS_CHART = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444'];

type KpiColor = 'amber' | 'emerald' | 'red' | 'violet' | 'blue';

const KpiCard: React.FC<{
  label: string;
  value: string;
  sub?: string;
  color: KpiColor;
  icon: React.ReactNode;
}> = ({ label, value, sub, color, icon }) => {
  const cls: Record<KpiColor, string> = {
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    violet:  'bg-violet-50 text-violet-700 border-violet-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
  };
  const iconCls: Record<KpiColor, string> = {
    amber:   'text-amber-500',
    emerald: 'text-emerald-500',
    red:     'text-red-500',
    violet:  'text-violet-500',
    blue:    'text-blue-500',
  };
  return (
    <div className={`bg-white rounded-2xl border ${cls[color]} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <div className={iconCls[color]}>{icon}</div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
};

const ChartCard: React.FC<{
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  height?: number;
}> = ({ title, subtitle, children, height = 260 }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
    <div className="mb-3">
      <h3 className="font-semibold text-slate-900 text-sm">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
    <div style={{ height: `${height}px` }}>{children}</div>
  </div>
);

const AlertCard: React.FC<{
  title: string;
  items: string[];
  color?: 'red' | 'amber';
}> = ({ title, items, color = 'red' }) => {
  if (!items.length) return null;
  const cls = color === 'amber'
    ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-red-50 border-red-200 text-red-800';
  return (
    <div className={`rounded-2xl border p-4 ${cls}`}>
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 8).map((item, i) => (
          <li key={i} className="text-xs">• {item}</li>
        ))}
        {items.length > 8 && <li className="text-xs italic">…e mais {items.length - 8} itens</li>}
      </ul>
    </div>
  );
};

const SectionHeader: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}> = ({ title, subtitle, icon }) => (
  <div className="flex items-center gap-3 pb-3 border-b border-amber-100">
    <div className="bg-amber-100 p-2 rounded-xl text-amber-600">{icon}</div>
    <div>
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  </div>
);

const UploadCard: React.FC<{
  title: string;
  description: string;
  count: number;
  loaded: boolean;
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}> = ({ title, description, count, loaded, onUpload, onClear }) => (
  <div className={`bg-white rounded-2xl border p-4 flex flex-col gap-3 transition-colors ${loaded ? 'border-amber-300' : 'border-slate-200'}`}>
    <div>
      <div className="flex items-center gap-2">
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        {loaded && <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />}
      </div>
      <p className="text-xs text-slate-400 mt-0.5">{description}</p>
    </div>
    <div className="flex items-center gap-2 flex-wrap">
      <label className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors">
        <Upload className="w-3.5 h-3.5" />
        Importar CSV
        <input type="file" accept=".csv,.txt,.CSV" className="hidden" onChange={onUpload} />
      </label>
      {loaded && (
        <>
          <span className="border border-amber-200 text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700">
            {fmtNum(count)} registros
          </span>
          <button onClick={onClear} title="Limpar" className="text-slate-400 hover:text-red-500 transition-colors ml-auto">
            <X className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

export const AnaliseOperacional: React.FC = () => {
  const [acuracidadeData, setAcuracidadeData] = useState<AcuracidadeRow[]>([]);
  const [horariosData, setHorariosData] = useState<HorarioRow[]>([]);
  const [movimentacaoData, setMovimentacaoData] = useState<MovimentacaoRow[]>([]);
  const [saidasData, setSaidasData] = useState<SaidaRow[]>([]);
  const [consumoData, setConsumoData] = useState<ConsumoRow[]>([]);
  const [filesLoaded, setFilesLoaded] = useState({
    acuracidade: false,
    horarios: false,
    movimentacao: false,
    saidas: false,
    consumo: false,
  });

  const handleUpload = <T,>(
    parser: (text: string) => T[],
    setter: (d: T[]) => void,
    key: keyof typeof filesLoaded
  ) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parser(ev.target?.result as string || '');
        setter(parsed);
        setFilesLoaded(p => ({ ...p, [key]: true }));
      } catch {
        alert('Erro ao processar o arquivo. Verifique o formato CSV.');
      }
    };
    reader.readAsText(file, 'ISO-8859-1');
    e.target.value = '';
  };

  const clearFile = (key: keyof typeof filesLoaded) => {
    setFilesLoaded(p => ({ ...p, [key]: false }));
    if (key === 'acuracidade') setAcuracidadeData([]);
    if (key === 'horarios') setHorariosData([]);
    if (key === 'movimentacao') setMovimentacaoData([]);
    if (key === 'saidas') setSaidasData([]);
    if (key === 'consumo') setConsumoData([]);
  };

  // ── KPIs: Acurácia ──────────────────────────────────────────────────────
  // Meta padrão farmácia hospitalar
  const META_ACURACIA = 0.95;

  const acuraciaKpis = useMemo(() => {
    if (!acuracidadeData.length) return null;

    // ─ Separar por natureza dos dados:
    // SITUACAO = PEDIDO  → QT_SOLICITADO = N° de SOLICITAÇÕES abertas (requests, não itens)
    // SITUACAO = CONFIRMADO / ATEND. PARCIAL → QT_SOLICITADO e QT_ATENDIDA = ITENS dispensados
    const linhasItens    = acuracidadeData.filter(r => r.situacao !== 'PEDIDO');
    const linhasPedidos  = acuracidadeData.filter(r => r.situacao === 'PEDIDO');

    // Solicitações abertas por tipo (unidade = n° de solicitações, não itens)
    const pedidosPorTipo = linhasPedidos.map(r => ({
      tipo: r.tipo,
      nSolicitacoes: r.qtSolicitado, // N° de requests em aberto
    }));
    const totalSolicitacoesAbertas = linhasPedidos.reduce((s, r) => s + r.qtSolicitado, 0);

    // Acurácia de itens por tipo (excluindo PEDIDO)
    const byTipo = new Map<string, { sol: number; at: number }>();
    linhasItens.forEach(r => {
      const cur = byTipo.get(r.tipo) || { sol: 0, at: 0 };
      byTipo.set(r.tipo, { sol: cur.sol + r.qtSolicitado, at: cur.at + r.qtAtendida });
    });

    const tipoChart = Array.from(byTipo.entries())
      .map(([tipo, d]) => ({
        tipo,
        acuracia: d.sol > 0 ? Math.min(d.at / d.sol, 1) : 0,
        acuraciaReal: d.sol > 0 ? d.at / d.sol : 0,
        itensSol: d.sol,
        itensAt: d.at,
      }))
      .sort((a, b) => a.acuraciaReal - b.acuraciaReal);

    const metaAtingida = tipoChart.filter(t => t.acuraciaReal >= META_ACURACIA);
    const abaixoMeta   = tipoChart.filter(t => t.acuraciaReal < META_ACURACIA);
    const maisCritico  = tipoChart[0];

    // Tabela de itens: ALCANCADO direto do CSV por tipo × situação (CONFIRMADO + ATEND. PARCIAL)
    const detalheItens = linhasItens.map(r => ({
      tipo: r.tipo,
      situacao: r.situacao,
      itensSolicitados: r.qtSolicitado,
      itensAtendidos: r.qtAtendida,
      alcancado: r.alcancado,
      metaOk: r.alcancado >= META_ACURACIA,
    }));

    return {
      tipoChart, metaAtingida, abaixoMeta, maisCritico,
      detalheItens, pedidosPorTipo, totalSolicitacoesAbertas,
    };
  }, [acuracidadeData]);

  // ── KPIs: Horários ──────────────────────────────────────────────────────
  const horariosKpis = useMemo(() => {
    if (!horariosData.length) return null;
    const totalGeral = horariosData.reduce((s, r) => s + r.total, 0);
    const pedidoPaciente = horariosData.find(r => r.tipo.toUpperCase().includes('PACIENTE'));
    const noturno = horariosData.reduce((s, r) => s + r.h0006, 0);
    const pctNoturno = totalGeral > 0 ? noturno / totalGeral : 0;

    const periods = [
      { periodo: '00:00–06:00', total: horariosData.reduce((s, r) => s + r.h0006, 0) },
      { periodo: '06:01–12:00', total: horariosData.reduce((s, r) => s + r.h0612, 0) },
      { periodo: '12:01–18:00', total: horariosData.reduce((s, r) => s + r.h1218, 0) },
      { periodo: '18:01–23:59', total: horariosData.reduce((s, r) => s + r.h1824, 0) },
    ];
    const pico = periods.reduce((a, b) => b.total > a.total ? b : a);

    // Grouped bar data: row per period, col per tipo
    const chartData = periods.map(p => {
      const row: Record<string, unknown> = { periodo: p.periodo };
      horariosData.forEach(r => {
        const key = truncate(r.tipo, 18);
        if (p.periodo === '00:00–06:00') row[key] = r.h0006;
        else if (p.periodo === '06:01–12:00') row[key] = r.h0612;
        else if (p.periodo === '12:01–18:00') row[key] = r.h1218;
        else row[key] = r.h1824;
      });
      return row;
    });

    const tipos = horariosData.map(r => truncate(r.tipo, 18));

    return { totalGeral, pedidoPaciente, pctNoturno, pico, periods, chartData, tipos };
  }, [horariosData]);

  // ── KPIs: Movimentação ──────────────────────────────────────────────────
  const movimentacaoKpis = useMemo(() => {
    if (!movimentacaoData.length) return null;
    const totalSaidas = movimentacaoData.reduce((s, r) => s + r.saida, 0);
    const totalDevolucoes = movimentacaoData.reduce((s, r) => s + r.devolucao, 0);
    const taxaDevolucao = totalSaidas > 0 ? totalDevolucoes / totalSaidas : 0;

    const bySetor = new Map<string, { saida: number; dev: number }>();
    movimentacaoData.forEach(r => {
      const cur = bySetor.get(r.setor) || { saida: 0, dev: 0 };
      bySetor.set(r.setor, { saida: cur.saida + r.saida, dev: cur.dev + r.devolucao });
    });

    const top15 = Array.from(bySetor.entries())
      .map(([setor, d]) => ({
        setor: truncate(setor, 22),
        saida: d.saida,
        devolucao: d.dev,
        taxa: d.saida > 0 ? d.dev / d.saida : 0,
      }))
      .sort((a, b) => b.saida - a.saida)
      .slice(0, 15);

    const altaDevolucao = top15.filter(s => s.taxa > 0.15);

    return { totalSaidas, totalDevolucoes, taxaDevolucao, top15, altaDevolucao };
  }, [movimentacaoData]);

  // ── KPIs: Saídas ────────────────────────────────────────────────────────
  const saidasKpis = useMemo(() => {
    if (!saidasData.length) return null;

    const byProd = new Map<string, { produto: string; saida: number; dev: number; vl: number }>();
    saidasData.forEach(r => {
      const cur = byProd.get(r.codProduto) || { produto: r.produto, saida: 0, dev: 0, vl: 0 };
      byProd.set(r.codProduto, {
        produto: cur.produto,
        saida: cur.saida + r.qtdeSaida,
        dev: cur.dev + r.qtdeDevolvida,
        vl: cur.vl + r.vlTotal,
      });
    });

    const totalProdutos = byProd.size;
    const totalSaida = saidasData.reduce((s, r) => s + r.qtdeSaida, 0);
    const totalDevolvido = saidasData.reduce((s, r) => s + r.qtdeDevolvida, 0);
    const taxaDevolucao = totalSaida > 0 ? totalDevolvido / totalSaida : 0;

    const top10 = Array.from(byProd.values())
      .sort((a, b) => b.saida - a.saida)
      .slice(0, 10)
      .map(d => ({
        produto: truncate(d.produto, 24),
        saidaLiquida: Math.max(0, d.saida - d.dev),
        devolucao: d.dev,
        taxa: d.saida > 0 ? d.dev / d.saida : 0,
      }));

    const altasDevolucoes = Array.from(byProd.values())
      .filter(d => d.saida > 10 && d.dev / d.saida > 0.20)
      .sort((a, b) => (b.dev / b.saida) - (a.dev / a.saida))
      .slice(0, 8)
      .map(d => `${truncate(d.produto, 35)}: ${fmtNum(d.dev / d.saida * 100, 1)}% de devolução`);

    return { totalProdutos, totalSaida, totalDevolvido, taxaDevolucao, top10, altasDevolucoes };
  }, [saidasData]);

  // ── KPIs: Consumo ───────────────────────────────────────────────────────
  const consumoKpis = useMemo(() => {
    if (!consumoData.length) return null;
    const totalItens = consumoData.length;
    const custoTotal = consumoData.reduce((s, r) => s + r.vlCustoPeriodo, 0);
    const sorted = [...consumoData].sort((a, b) => b.vlCustoPeriodo - a.vlCustoPeriodo);
    const topProduto = sorted[0];

    let acum = 0;
    const comClasse = sorted.map(r => {
      acum += r.vlCustoPeriodo;
      const pct = custoTotal > 0 ? acum / custoTotal : 0;
      return { ...r, classe: pct <= 0.80 ? 'A' : pct <= 0.95 ? 'B' : 'C' };
    });

    const classeA = comClasse.filter(r => r.classe === 'A');
    const classeB = comClasse.filter(r => r.classe === 'B');
    const classeC = comClasse.filter(r => r.classe === 'C');

    const top10Custo = sorted.slice(0, 10).map(r => ({
      produto: truncate(r.produto, 22),
      custo: r.vlCustoPeriodo,
    }));

    const pieData = [
      { name: `A — ${classeA.length} itens (80% custo)`, value: classeA.length, fill: '#ef4444' },
      { name: `B — ${classeB.length} itens (15% custo)`, value: classeB.length, fill: '#f59e0b' },
      { name: `C — ${classeC.length} itens (5% custo)`,  value: classeC.length, fill: '#10b981' },
    ];

    return { totalItens, custoTotal, topProduto, classeA, classeB, classeC, top10Custo, pieData };
  }, [consumoData]);

  const hasData = Object.values(filesLoaded).some(Boolean);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-7 h-7 text-amber-500" />
              Análise Operacional
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Acurácia · Horários · Movimentação · Saídas · Consumo — importe os CSVs do MV Soul para visualizar os indicadores
            </p>
          </div>
          {hasData && (
            <div className="flex gap-2 flex-wrap">
              {filesLoaded.acuracidade && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">Acurácia ✓</span>}
              {filesLoaded.horarios    && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">Horários ✓</span>}
              {filesLoaded.movimentacao && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">Movimentação ✓</span>}
              {filesLoaded.saidas      && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">Saídas ✓</span>}
              {filesLoaded.consumo     && <span className="bg-amber-100 text-amber-700 text-xs font-medium px-2 py-1 rounded-full">Consumo ✓</span>}
            </div>
          )}
        </div>
      </div>

      {/* Upload Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <UploadCard
          title="Acurácia do Atendimento"
          description="Acuradidade do atendimento.CSV"
          count={acuracidadeData.length}
          loaded={filesLoaded.acuracidade}
          onUpload={handleUpload(parseAcuracidade, setAcuracidadeData, 'acuracidade')}
          onClear={() => clearFile('acuracidade')}
        />
        <UploadCard
          title="Solicitações por Horário"
          description="3189___Quantidade_de_Solicitacoes.CSV"
          count={horariosData.length}
          loaded={filesLoaded.horarios}
          onUpload={handleUpload(parseHorarios, setHorariosData, 'horarios')}
          onClear={() => clearFile('horarios')}
        />
        <UploadCard
          title="Movimentação por Setor"
          description="3830___Estatistica_movimentacao_estoque.CSV"
          count={movimentacaoData.length}
          loaded={filesLoaded.movimentacao}
          onUpload={handleUpload(parseMovimentacao, setMovimentacaoData, 'movimentacao')}
          onClear={() => clearFile('movimentacao')}
        />
        <UploadCard
          title="Saídas e Devoluções"
          description="3012___Saidas_e_Devolucoes_de_Estoque.CSV"
          count={saidasData.length}
          loaded={filesLoaded.saidas}
          onUpload={handleUpload(parseSaidas, setSaidasData, 'saidas')}
          onClear={() => clearFile('saidas')}
        />
        <UploadCard
          title="Consumo e Custo (332)"
          description="consumo 332.csv"
          count={consumoData.length}
          loaded={filesLoaded.consumo}
          onUpload={handleUpload(parseConsumo332, setConsumoData, 'consumo')}
          onClear={() => clearFile('consumo')}
        />
      </div>

      {/* Empty State */}
      {!hasData && (
        <div className="bg-white rounded-2xl border border-dashed border-amber-300 p-12 text-center">
          <Activity className="w-12 h-12 text-amber-300 mx-auto mb-4" />
          <p className="text-slate-600 font-semibold">Nenhum arquivo importado</p>
          <p className="text-slate-400 text-sm mt-1">
            Importe um ou mais CSVs acima para visualizar os KPIs e análises operacionais
          </p>
        </div>
      )}

      {/* ─── Seção 1: Acurácia ─────────────────────────────────────────── */}
      {filesLoaded.acuracidade && acuraciaKpis && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <SectionHeader
            title="Acurácia do Atendimento"
            subtitle="Qtd Atendida / Qtd Solicitada por tipo (excluindo pendências) — Fev/2026"
            icon={<CheckCircle className="w-5 h-5" />}
          />

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Meta Padrão (Itens)"
              value="≥ 95%"
              sub="Farmácia Hospitalar"
              color="amber"
              icon={<BarChart2 className="w-4 h-4" />}
            />
            <KpiCard
              label="Tipos com Meta Atingida"
              value={`${acuraciaKpis.metaAtingida.length} / ${acuraciaKpis.tipoChart.length}`}
              sub={acuraciaKpis.metaAtingida.map(t => t.tipo).join(', ') || '—'}
              color={acuraciaKpis.metaAtingida.length === acuraciaKpis.tipoChart.length ? 'emerald' : 'red'}
              icon={<CheckCircle className="w-4 h-4" />}
            />
            <KpiCard
              label="Tipo Mais Crítico"
              value={`${fmtNum(acuraciaKpis.maisCritico.acuraciaReal * 100, 2)}%`}
              sub={acuraciaKpis.maisCritico.tipo}
              color="red"
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <KpiCard
              label="Solicitações em Aberto"
              value={fmtNum(acuraciaKpis.totalSolicitacoesAbertas)}
              sub="N° de pedidos pendentes (não processados)"
              color="blue"
              icon={<Clock className="w-4 h-4" />}
            />
          </div>

          {/* Gráfico com linha de meta */}
          <ChartCard
            title="Acurácia por Tipo — vs Meta 95%"
            subtitle="Qtd Atendida / Qtd Solicitada (CONFIRMADO + ATEND. PARCIAL). Linha vermelha = meta ≥ 95%"
            height={240}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={acuraciaKpis.tipoChart}
                margin={{ left: 8, right: 60, top: 4, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 1.1]}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                  tick={{ fontSize: 11 }}
                />
                <YAxis type="category" dataKey="tipo" width={170} tick={{ fontSize: 10 }} />
                <Tooltip
                  formatter={(v: number, name: string) =>
                    name === 'acuracia'
                      ? [`${(v * 100).toFixed(2)}%`, 'Acurácia']
                      : [v, name]
                  }
                />
                <ReferenceLine
                  x={0.95}
                  stroke="#ef4444"
                  strokeDasharray="5 3"
                  strokeWidth={2}
                  label={{ value: 'Meta 95%', position: 'right', fontSize: 10, fill: '#ef4444' }}
                />
                <Bar dataKey="acuracia" name="Acurácia" radius={[0, 4, 4, 0]}>
                  {acuraciaKpis.tipoChart.map((entry, i) => (
                    <Cell key={i} fill={entry.acuraciaReal >= 0.95 ? '#10b981' : '#ef4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Tabela 1: ITENS — CONFIRMADO + ATEND. PARCIAL */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Acurácia de Itens — CONFIRMADO e ATEND. PARCIAL (QT_SOLICITADO e QT_ATENDIDA em itens)
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-left">
                    <th className="px-3 py-2 font-semibold">Tipo</th>
                    <th className="px-3 py-2 font-semibold">Situação</th>
                    <th className="px-3 py-2 font-semibold text-right">Itens Solicitados</th>
                    <th className="px-3 py-2 font-semibold text-right">Itens Atendidos</th>
                    <th className="px-3 py-2 font-semibold text-right">ALCANCADO</th>
                    <th className="px-3 py-2 font-semibold text-center">vs Meta 95%</th>
                  </tr>
                </thead>
                <tbody>
                  {acuraciaKpis.detalheItens.map((r, i) => (
                    <tr key={i} className={`border-t border-slate-100 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/40'}`}>
                      <td className="px-3 py-2 font-medium text-slate-800">{r.tipo}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          r.situacao === 'CONFIRMADO'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-orange-100 text-orange-700'
                        }`}>{r.situacao}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNum(r.itensSolicitados, 2)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNum(r.itensAtendidos, 2)}</td>
                      <td className={`px-3 py-2 text-right font-bold ${r.alcancado >= 0.95 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {fmtNum(r.alcancado * 100, 2)}%
                      </td>
                      <td className="px-3 py-2 text-center">
                        {r.metaOk
                          ? <span className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">✓ Atingida</span>
                          : <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">✗ Abaixo</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tabela 2: SOLICITAÇÕES EM ABERTO (PEDIDO) — N° de pedidos, não itens */}
          {acuraciaKpis.pedidosPorTipo.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                Solicitações em Aberto — Situação PEDIDO (unidade = N° de solicitações, não itens)
              </p>
              <div className="overflow-x-auto rounded-xl border border-blue-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-blue-50 text-slate-600 text-left">
                      <th className="px-3 py-2 font-semibold">Tipo de Solicitação</th>
                      <th className="px-3 py-2 font-semibold text-right">N° Solicitações Abertas</th>
                      <th className="px-3 py-2 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acuraciaKpis.pedidosPorTipo.map((r, i) => (
                      <tr key={i} className={`border-t border-blue-50 ${i % 2 === 0 ? 'bg-white' : 'bg-blue-50/30'}`}>
                        <td className="px-3 py-2 font-medium text-slate-800">{r.tipo}</td>
                        <td className="px-3 py-2 text-right font-bold text-blue-700">{fmtNum(r.nSolicitacoes, 2)}</td>
                        <td className="px-3 py-2 text-center">
                          <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">Pendente</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Alertas */}
          <AlertCard
            title={`${acuraciaKpis.abaixoMeta.length} tipo(s) abaixo da meta de 95% de itens atendidos`}
            items={acuraciaKpis.abaixoMeta.map(t =>
              `${t.tipo}: ${fmtNum(t.acuraciaReal * 100, 2)}% — ${fmtNum(t.itensAt, 0)} itens atendidos de ${fmtNum(t.itensSol, 0)} solicitados`
            )}
            color="red"
          />
          {!acuraciaKpis.abaixoMeta.length && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-2 text-emerald-700 text-sm">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Todos os tipos atingiram a meta de 95% de acurácia de itens.
            </div>
          )}
        </div>
      )}

      {/* ─── Seção 2: Horários ─────────────────────────────────────────── */}
      {filesLoaded.horarios && horariosKpis && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <SectionHeader
            title="Solicitações por Horário"
            subtitle="Volume de solicitações distribuídas nos turnos do dia — Fev 2026"
            icon={<Clock className="w-5 h-5" />}
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Total de Solicitações"
              value={fmtNum(horariosKpis.totalGeral)}
              sub="Todos os tipos no período"
              color="amber"
              icon={<BarChart2 className="w-4 h-4" />}
            />
            <KpiCard
              label="Pedido de Paciente"
              value={fmtNum(horariosKpis.pedidoPaciente?.total ?? 0)}
              sub={`${fmtNum(horariosKpis.totalGeral > 0 ? (horariosKpis.pedidoPaciente?.total ?? 0) / horariosKpis.totalGeral * 100 : 0, 1)}% do total`}
              color="violet"
              icon={<Users className="w-4 h-4" />}
            />
            <KpiCard
              label="Horário de Pico"
              value={horariosKpis.pico.periodo}
              sub={`${fmtNum(horariosKpis.pico.total)} solicitações`}
              color="amber"
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <KpiCard
              label="Carga Noturna (00–06h)"
              value={`${fmtNum(horariosKpis.pctNoturno * 100, 1)}%`}
              sub={`${fmtNum(horariosKpis.periods[0].total)} solicitações`}
              color={horariosKpis.pctNoturno > 0.10 ? 'red' : 'emerald'}
              icon={<Clock className="w-4 h-4" />}
            />
          </div>

          <ChartCard
            title="Distribuição por Período e Tipo"
            subtitle="Quantidade de solicitações atendidas por turno"
            height={280}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={horariosKpis.chartData} margin={{ left: 8, right: 8, top: 8, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="periodo" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                {horariosKpis.tipos.map((tipo, i) => (
                  <Bar key={tipo} dataKey={tipo} fill={COLORS_CHART[i % COLORS_CHART.length]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {horariosKpis.pctNoturno > 0.05 && (
            <AlertCard
              title={`Alta carga no turno noturno (00:00–06:00): ${fmtNum(horariosKpis.pctNoturno * 100, 1)}% do total`}
              items={[
                `${fmtNum(horariosKpis.periods[0].total)} solicitações entre 00:00 e 06:00h`,
                'Avalie dimensionamento da equipe noturna e automação de dispensação.',
              ]}
              color="amber"
            />
          )}
        </div>
      )}

      {/* ─── Seção 3: Movimentação por Setor ───────────────────────────── */}
      {filesLoaded.movimentacao && movimentacaoKpis && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <SectionHeader
            title="Movimentação por Setor"
            subtitle="Saídas e devoluções de estoque por setor hospitalar"
            icon={<ArrowDownUp className="w-5 h-5" />}
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Total Saídas"
              value={fmtNum(movimentacaoKpis.totalSaidas)}
              sub="Todos os setores"
              color="amber"
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <KpiCard
              label="Total Devoluções"
              value={fmtNum(movimentacaoKpis.totalDevolucoes)}
              sub="Todos os setores"
              color="blue"
              icon={<ArrowDownUp className="w-4 h-4" />}
            />
            <KpiCard
              label="Taxa de Devolução"
              value={`${fmtNum(movimentacaoKpis.taxaDevolucao * 100, 2)}%`}
              sub="Devolvido / Saída total"
              color={movimentacaoKpis.taxaDevolucao > 0.15 ? 'red' : 'emerald'}
              icon={<BarChart2 className="w-4 h-4" />}
            />
          </div>

          <ChartCard
            title="Top 15 Setores por Volume de Saída"
            subtitle="Saída vs Devolução por setor"
            height={340}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={movimentacaoKpis.top15} margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="setor" width={180} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="saida" name="Saída" fill="#f59e0b" stackId="a" />
                <Bar dataKey="devolucao" name="Devolução" fill="#fde68a" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <AlertCard
            title={`${movimentacaoKpis.altaDevolucao.length} setor(es) com taxa de devolução acima de 15%`}
            items={movimentacaoKpis.altaDevolucao.map(s => `${s.setor}: ${fmtNum(s.taxa * 100, 1)}% — ${fmtNum(s.devolucao)} devolvidos / ${fmtNum(s.saida)} saídas`)}
            color="red"
          />
        </div>
      )}

      {/* ─── Seção 4: Saídas e Devoluções por Produto ──────────────────── */}
      {filesLoaded.saidas && saidasKpis && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <SectionHeader
            title="Saídas e Devoluções por Produto"
            subtitle="Volume de saídas e percentual de retorno por medicamento/material"
            icon={<Package className="w-5 h-5" />}
          />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label="Produtos Únicos"
              value={fmtNum(saidasKpis.totalProdutos)}
              sub="Itens distintos movimentados"
              color="amber"
              icon={<Package className="w-4 h-4" />}
            />
            <KpiCard
              label="Total Saída (qtd)"
              value={fmtNum(saidasKpis.totalSaida)}
              sub="Unidades dispensadas"
              color="amber"
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <KpiCard
              label="Total Devolvido (qtd)"
              value={fmtNum(saidasKpis.totalDevolvido)}
              sub="Unidades retornadas"
              color="blue"
              icon={<ArrowDownUp className="w-4 h-4" />}
            />
            <KpiCard
              label="Taxa de Devolução"
              value={`${fmtNum(saidasKpis.taxaDevolucao * 100, 2)}%`}
              sub="Devolvido / Saída geral"
              color={saidasKpis.taxaDevolucao > 0.15 ? 'red' : 'emerald'}
              icon={<BarChart2 className="w-4 h-4" />}
            />
          </div>

          <ChartCard
            title="Top 10 Produtos por Saída"
            subtitle="Saída líquida (azul) + Devolução (amarelo claro)"
            height={300}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={saidasKpis.top10} margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tickFormatter={(v: number) => fmtNum(v)} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="produto" width={200} tick={{ fontSize: 9 }} />
                <Tooltip formatter={(v: number) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="saidaLiquida" name="Saída Líquida" fill="#3b82f6" stackId="a" />
                <Bar dataKey="devolucao" name="Devolução" fill="#fcd34d" stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {saidasKpis.altasDevolucoes.length > 0 && (
            <AlertCard
              title={`${saidasKpis.altasDevolucoes.length} produto(s) com taxa de devolução acima de 20% (mín. 10 saídas)`}
              items={saidasKpis.altasDevolucoes}
              color="red"
            />
          )}
        </div>
      )}

      {/* ─── Seção 5: Consumo e Custo ABC ──────────────────────────────── */}
      {filesLoaded.consumo && consumoKpis && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <SectionHeader
            title="Consumo e Custo — Curva ABC"
            subtitle="Análise de custo por produto e classificação ABC (80/95/100)"
            icon={<DollarSign className="w-5 h-5" />}
          />
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard
              label="Total de Itens"
              value={fmtNum(consumoKpis.totalItens)}
              sub={`A: ${consumoKpis.classeA.length} · B: ${consumoKpis.classeB.length} · C: ${consumoKpis.classeC.length}`}
              color="amber"
              icon={<Package className="w-4 h-4" />}
            />
            <KpiCard
              label="Custo Total do Período"
              value={fmtBRL(consumoKpis.custoTotal)}
              sub="Soma de Vl Custo Período"
              color="amber"
              icon={<DollarSign className="w-4 h-4" />}
            />
            <KpiCard
              label="Top Produto (custo)"
              value={fmtBRL(consumoKpis.topProduto?.vlCustoPeriodo ?? 0)}
              sub={truncate(consumoKpis.topProduto?.produto ?? '', 30)}
              color="red"
              icon={<ShoppingCart className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChartCard title="Top 10 Produtos por Custo do Período" height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={consumoKpis.top10Custo} margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v: number) => fmtBRL(v)} tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="produto" width={170} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: number) => [fmtBRL(v), 'Custo']} />
                  <Bar dataKey="custo" name="Custo" radius={[0, 4, 4, 0]}>
                    {consumoKpis.top10Custo.map((_, i) => (
                      <Cell key={i} fill={COLORS_AMBER[Math.min(i, COLORS_AMBER.length - 1)]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Distribuição ABC — Quantidade de Itens" subtitle="A = 80% do custo · B = 15% · C = 5%" height={300}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={consumoKpis.pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    outerRadius={90}
                    label={({ name, value }: { name: string; value: number }) => `${value}`}
                    labelLine
                  >
                    {consumoKpis.pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v} itens`, '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          <AlertCard
            title={`Classe A: ${consumoKpis.classeA.length} itens representam 80% do custo total (${fmtBRL(consumoKpis.custoTotal * 0.8)})`}
            items={consumoKpis.classeA.slice(0, 8).map(r => `${truncate(r.produto, 40)}: ${fmtBRL(r.vlCustoPeriodo)}`)}
            color="amber"
          />
        </div>
      )}
    </div>
  );
};
