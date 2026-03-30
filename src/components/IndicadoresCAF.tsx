import React, { useState, useMemo, useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  ComposedChart, Line,
} from 'recharts';
import {
  Upload, AlertTriangle, Clock, Search, Package,
  TrendingUp, Activity, Database, DollarSign, AlertCircle,
  ChevronLeft, ChevronRight, ShieldAlert,
} from 'lucide-react';

// ─── TIPOS ────────────────────────────────────────────────────────────────────

interface LoteItem {
  lote: string;
  validade: string;
  diasVenc: number;
  qtd: number;
}

interface EstoqueItem {
  codigo: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
  lotes: LoteItem[];
  menorDiasVenc: number;
}

interface ConsumoItem {
  seq: number;
  codigo: string;
  nome: string;
  unidade: string;
  custoUnit: number;
  qtdConsumo: number;
  vlCustoPeriodo: number;
  custoAcumulado: number;
  percVlTotal: number;
  classeABC: 'A' | 'B' | 'C';
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseBR(s?: string): number {
  if (!s) return 0;
  const clean = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function diasParaVencer(ddmmyyyy: string): number {
  if (!ddmmyyyy || ddmmyyyy.trim() === '') return 9999;
  const p = ddmmyyyy.trim().split('/');
  if (p.length !== 3) return 9999;
  const d = new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((d.getTime() - TODAY.getTime()) / 86400000);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function isExcluded(nome: string): boolean {
  const n = nome.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return n.includes('DIETA PARENTERAL') || n.includes('SYMBICORT') || n.includes('SYMBCORT');
}

// ─── PARSER FILE 1 — ESTOQUE ──────────────────────────────────────────────────
// Formato: ,código,nome,,unidade,,"estoque",,lote,,validade,,endereço,,"0,000",...

function parseEstoque(text: string): EstoqueItem[] {
  if (!text) return [];
  const lines = text.split('\n');
  const items: EstoqueItem[] = [];
  let current: EstoqueItem | null = null;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const c = parseCSVLine(raw);
    if (c.length < 6) continue;

    const col1 = c[1]?.trim() ?? '';
    const col2 = c[2]?.trim() ?? '';

    // Linha de cabeçalho repetido (col[0]='Produto')
    if (c[0]?.trim() === 'Produto' || col1 === 'Produto') continue;

    const isNumericCode = col1 !== '' && /^\d+$/.test(col1);
    const hasLoteInCol8 = (c[8]?.trim() ?? '') !== '';

    if (isNumericCode && col2 !== '') {
      // Nova linha de produto principal
      if (current) items.push(current);
      if (isExcluded(col2)) { current = null; continue; }
      const estoque = parseBR(c[6]);
      const lote = c[8]?.trim() ?? '';
      const validade = c[10]?.trim() ?? '';
      const dias = validade ? diasParaVencer(validade) : 9999;
      const lotes: LoteItem[] = lote ? [{ lote, validade, diasVenc: dias, qtd: parseBR(c[18]) }] : [];
      current = {
        codigo: col1,
        nome: col2,
        unidade: c[4]?.trim() ?? '',
        estoqueAtual: estoque,
        lotes,
        menorDiasVenc: lotes.length > 0 ? dias : 9999,
      };
    } else if (current && col1 === '' && hasLoteInCol8) {
      // Linha de lote adicional para o produto atual
      const lote = c[8]?.trim() ?? '';
      const validade = c[10]?.trim() ?? '';
      const dias = validade ? diasParaVencer(validade) : 9999;
      const loteItem: LoteItem = { lote, validade, diasVenc: dias, qtd: parseBR(c[18]) };
      current.lotes.push(loteItem);
      if (dias < current.menorDiasVenc) current.menorDiasVenc = dias;
    } else if (current && isNumericCode && col2 === '') {
      // Continuação do produto anterior com lote (col[1] tem código mas col[2] vazio)
      const lote = c[8]?.trim() ?? '';
      const validade = c[10]?.trim() ?? '';
      if (lote || validade) {
        const dias = validade ? diasParaVencer(validade) : 9999;
        const loteItem: LoteItem = { lote, validade, diasVenc: dias, qtd: parseBR(c[18]) };
        current.lotes.push(loteItem);
        if (dias < current.menorDiasVenc) current.menorDiasVenc = dias;
      }
    }
  }
  if (current) items.push(current);
  return items;
}

// ─── PARSER FILE 2 — CONSUMO/CUSTO ────────────────────────────────────────────
// Formato: seq,código,,nome,unidade,,,,"custoUnit",,qtdConsumo,,"vlPeriodo",,"custoAcum",,"percVlTotal",

function parseConsumo(text: string): ConsumoItem[] {
  if (!text) return [];
  const lines = text.split('\n');
  const raw: Omit<ConsumoItem, 'classeABC'>[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const c = parseCSVLine(line);
    if (c.length < 12) continue;

    const seq = parseInt(c[0]?.trim() ?? '', 10);
    if (isNaN(seq) || seq <= 0) continue; // skip headers/footers

    const codigo = c[1]?.trim() ?? '';
    if (!codigo || !/^\d+$/.test(codigo)) continue;

    const nomeRaw = c[3]?.trim() ?? c[2]?.trim() ?? '';
    if (isExcluded(nomeRaw)) continue;

    raw.push({
      seq,
      codigo,
      nome: nomeRaw,
      unidade: c[4]?.trim() ?? '',
      custoUnit: parseBR(c[8]),
      qtdConsumo: parseBR(c[10]),
      vlCustoPeriodo: parseBR(c[12]),
      custoAcumulado: parseBR(c[14]),
      percVlTotal: parseBR(c[16]),
    });
  }

  if (raw.length === 0) return [];

  // Calcular classificação ABC baseada no custo acumulado
  const total = raw[raw.length - 1]?.custoAcumulado || raw.reduce((s, r) => s + r.vlCustoPeriodo, 0);

  // Ordenar por vlCustoPeriodo desc para ABC
  const sorted = [...raw].sort((a, b) => b.vlCustoPeriodo - a.vlCustoPeriodo);
  let cumSum = 0;
  const abcMap = new Map<string, 'A' | 'B' | 'C'>();
  for (const item of sorted) {
    cumSum += item.vlCustoPeriodo;
    const pct = total > 0 ? (cumSum / total) * 100 : 0;
    abcMap.set(item.codigo, pct <= 70 ? 'A' : pct <= 90 ? 'B' : 'C');
  }

  return raw.map(r => ({ ...r, classeABC: abcMap.get(r.codigo) ?? 'C' }));
}

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const ABC_COLORS = { A: '#2563eb', B: '#f59e0b', C: '#10b981' };
const ABC_BG    = { A: '#eff6ff', B: '#fefce8', C: '#f0fdf4' };
const PAGE_SIZE = 25;

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

export const IndicadoresCAF: React.FC = () => {
  const [estoqueText, setEstoqueText] = useState('');
  const [consumoText, setConsumoText] = useState('');
  const [estoqueFileName, setEstoqueFileName] = useState('');
  const [consumoFileName, setConsumoFileName] = useState('');
  const [search, setSearch] = useState('');
  const [filterABC, setFilterABC] = useState<'ALL' | 'A' | 'B' | 'C'>('ALL');
  const [page, setPage] = useState(0);
  const [searchVal, setSearchVal] = useState('');
  const [filterVal, setFilterVal] = useState<'ALL' | 'vencido' | 'critico' | 'atencao' | 'seguro'>('ALL');
  const [pageVal, setPageVal] = useState(0);

  const estoqueRef = useRef<HTMLInputElement>(null);
  const consumoRef = useRef<HTMLInputElement>(null);

  function handleFile(
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (t: string) => void,
    nameSetter: (n: string) => void,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    nameSetter(file.name);
    const reader = new FileReader();
    reader.onload = ev => setter(ev.target?.result as string ?? '');
    reader.readAsText(file, 'latin1');
  }

  const estoqueData = useMemo(() => parseEstoque(estoqueText), [estoqueText]);
  const consumoData = useMemo(() => parseConsumo(consumoText),  [consumoText]);

  const hasEstoque = estoqueData.length > 0;
  const hasConsumo = consumoData.length > 0;
  const hasAny     = hasEstoque || hasConsumo;

  // ── KPIs ──
  const kpis = useMemo(() => {
    const custoTotal  = consumoData.length > 0 ? consumoData[consumoData.length - 1].custoAcumulado : 0;
    const volTotal    = consumoData.reduce((s, c) => s + c.qtdConsumo, 0);
    const classeA     = consumoData.filter(c => c.classeABC === 'A').length;
    const semEstoque  = estoqueData.filter(e => e.estoqueAtual === 0).length;
    const venc30      = estoqueData.filter(e => e.menorDiasVenc >= 0 && e.menorDiasVenc <= 30).length;
    const venc90      = estoqueData.filter(e => e.menorDiasVenc >= 0 && e.menorDiasVenc <= 90).length;
    const cobertura   = estoqueData.length > 0 ? Math.round(((estoqueData.length - semEstoque) / estoqueData.length) * 100) : 0;
    return { custoTotal, volTotal, classeA, semEstoque, venc30, venc90, cobertura, totalConsumo: consumoData.length, totalEstoque: estoqueData.length };
  }, [estoqueData, consumoData]);

  // ── Gráficos ──
  const charts = useMemo(() => {
    // Curva ABC: top 20 por custo, ordenado desc
    const top20abc = [...consumoData]
      .sort((a, b) => b.vlCustoPeriodo - a.vlCustoPeriodo)
      .slice(0, 20)
      .map((c, i, arr) => {
        const cumPct = kpis.custoTotal > 0
          ? (arr.slice(0, i + 1).reduce((s, x) => s + x.vlCustoPeriodo, 0) / kpis.custoTotal) * 100
          : 0;
        return {
          nome: truncate(c.nome, 22),
          custo: c.vlCustoPeriodo,
          cumPct: +cumPct.toFixed(1),
          classe: c.classeABC,
        };
      });

    // Top 10 por volume
    const top10vol = [...consumoData]
      .sort((a, b) => b.qtdConsumo - a.qtdConsumo)
      .slice(0, 10)
      .map(c => ({ nome: truncate(c.nome, 26), qtd: c.qtdConsumo, classe: c.classeABC }));

    // Distribuição ABC
    const abcDist = (['A', 'B', 'C'] as const).map(cl => ({
      name: `Classe ${cl}`,
      value: consumoData.filter(c => c.classeABC === cl).length,
      color: ABC_COLORS[cl],
    })).filter(x => x.value > 0);

    // Vencimentos
    const vencDist = [
      { periodo: '≤30d',    count: 0, fill: '#ef4444' },
      { periodo: '31–60d',  count: 0, fill: '#f97316' },
      { periodo: '61–90d',  count: 0, fill: '#f59e0b' },
      { periodo: '91–180d', count: 0, fill: '#84cc16' },
    ];
    estoqueData.forEach(e => e.lotes.forEach(l => {
      if (l.diasVenc < 0) return;
      if (l.diasVenc <= 30)        vencDist[0].count++;
      else if (l.diasVenc <= 60)   vencDist[1].count++;
      else if (l.diasVenc <= 90)   vencDist[2].count++;
      else if (l.diasVenc <= 180)  vencDist[3].count++;
    }));

    // Top 10 mais próximos de vencer (lotes individuais)
    const top10Vencer = estoqueData
      .flatMap(e => e.lotes.map(l => ({ produto: e.nome, codigo: e.codigo, lote: l.lote, validade: l.validade, diasVenc: l.diasVenc })))
      .filter(l => l.diasVenc >= -365)
      .sort((a, b) => a.diasVenc - b.diasVenc)
      .slice(0, 10)
      .map(l => ({ nome: truncate(l.produto, 24), lote: l.lote, dias: l.diasVenc, validade: l.validade,
        fill: l.diasVenc < 0 ? '#dc2626' : l.diasVenc <= 30 ? '#ef4444' : l.diasVenc <= 90 ? '#f59e0b' : '#10b981' }));

    return { top20abc, top10vol, abcDist, vencDist, top10Vencer };
  }, [consumoData, estoqueData, kpis.custoTotal]);

  // ── Tabela combinada ──
  const estoqueMap = useMemo(() => {
    const m = new Map<string, EstoqueItem>();
    estoqueData.forEach(e => m.set(e.codigo, e));
    return m;
  }, [estoqueData]);

  const tableRows = useMemo(() => {
    const src = hasConsumo ? consumoData : estoqueData.map(e => ({
      seq: 0, codigo: e.codigo, nome: e.nome, unidade: e.unidade,
      custoUnit: 0, qtdConsumo: 0, vlCustoPeriodo: 0, custoAcumulado: 0, percVlTotal: 0, classeABC: 'C' as 'C',
    }));

    const q = search.toLowerCase();
    return src
      .filter(r => (filterABC === 'ALL' || r.classeABC === filterABC))
      .filter(r => !q || r.nome.toLowerCase().includes(q) || r.codigo.includes(q))
      .map(r => ({ ...r, est: estoqueMap.get(r.codigo) ?? null }));
  }, [consumoData, estoqueData, estoqueMap, hasConsumo, search, filterABC]);

  // ── Tabela de Validades (todos os lotes individuais) ──
  const validadeRows = useMemo(() => {
    const rows = estoqueData.flatMap(e =>
      e.lotes.map(l => {
        const status: 'vencido' | 'critico' | 'atencao' | 'seguro' =
          l.diasVenc < 0 ? 'vencido' : l.diasVenc <= 30 ? 'critico' : l.diasVenc <= 90 ? 'atencao' : 'seguro';
        return { codigo: e.codigo, produto: e.nome, unidade: e.unidade, lote: l.lote, validade: l.validade, diasVenc: l.diasVenc, qtd: l.qtd, status };
      })
    ).sort((a, b) => a.diasVenc - b.diasVenc);

    const q = searchVal.toLowerCase();
    return rows.filter(r => filterVal === 'ALL' || r.status === filterVal)
               .filter(r => !q || r.produto.toLowerCase().includes(q) || r.lote.toLowerCase().includes(q) || r.codigo.includes(q));
  }, [estoqueData, filterVal, searchVal]);

  const validadeKpis = useMemo(() => {
    const all = estoqueData.flatMap(e => e.lotes.map(l => ({
      diasVenc: l.diasVenc,
      status: l.diasVenc < 0 ? 'vencido' : l.diasVenc <= 30 ? 'critico' : l.diasVenc <= 90 ? 'atencao' : 'seguro',
    })));
    return {
      total: all.length,
      vencido: all.filter(l => l.status === 'vencido').length,
      critico: all.filter(l => l.status === 'critico').length,
      atencao: all.filter(l => l.status === 'atencao').length,
      seguro:  all.filter(l => l.status === 'seguro').length,
    };
  }, [estoqueData]);

  // ─── RENDER ───────────────────────────────────────────────────────────────

  // Estilo compartilhado de cards
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: 'white', borderRadius: 16, padding: '20px 24px',
    border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,.05)',
    ...extra,
  });

  // ─── TELA DE UPLOAD ───────────────────────────────────────────────────────

  if (!hasAny) {
    return (
      <div style={{ fontFamily: 'sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
          <Activity size={26} color="white" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 6px', color: '#0f172a' }}>Indicadores de Performance CAF</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 40px', textAlign: 'center', maxWidth: 420 }}>
          Carregue os arquivos de Estoque e Consumo/Custos para visualizar os indicadores de performance da Central de Abastecimento Farmacêutico.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700, width: '100%' }}>
          {[
            { key: 'estoque', label: 'Estoque CAF', hint: 'central indicador.csv', icon: <Database size={22} />, color: '#10b981', ref: estoqueRef, fileName: estoqueFileName, onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleFile(e, setEstoqueText, setEstoqueFileName) },
            { key: 'consumo', label: 'Consumo & Custos', hint: 'central indicador 2.csv', icon: <DollarSign size={22} />, color: '#2563eb', ref: consumoRef, fileName: consumoFileName, onChange: (e: React.ChangeEvent<HTMLInputElement>) => handleFile(e, setConsumoText, setConsumoFileName) },
          ].map(f => (
            <label key={f.key} style={{ display: 'block', cursor: 'pointer' }}>
              <div style={{ ...card(), border: f.fileName ? `2px solid ${f.color}` : '2px dashed #cbd5e1', textAlign: 'center', padding: 30, transition: 'border-color .2s' }}>
                <div style={{ width: 48, height: 48, background: f.fileName ? f.color : '#f1f5f9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', color: f.fileName ? 'white' : '#94a3b8' }}>
                  {f.icon}
                </div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#334155', margin: '0 0 4px' }}>{f.label}</p>
                <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 14px' }}>{f.fileName || f.hint}</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: f.fileName ? f.color : '#f8fafc', color: f.fileName ? 'white' : '#64748b', borderRadius: 8, padding: '8px 16px', fontSize: 11, fontWeight: 700 }}>
                  <Upload size={13} /> {f.fileName ? 'Alterar arquivo' : 'Selecionar CSV'}
                </div>
              </div>
              <input ref={f.ref} type="file" accept=".csv,.txt" onChange={f.onChange} style={{ display: 'none' }} />
            </label>
          ))}
        </div>
      </div>
    );
  }

  // ─── DASHBOARD ────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100vh', paddingBottom: 60 }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #f1f5f9', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 42, height: 42, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={20} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 900, margin: 0 }}>Indicadores de Performance CAF</h1>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {hasConsumo && `${consumoData.length} itens · Custo total ${fmtBRL(kpis.custoTotal)}`}
              {hasConsumo && hasEstoque && ' · '}
              {hasEstoque && `${estoqueData.length} produtos em estoque`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f0fdf4', border: 'none', borderRadius: 10, padding: '7px 13px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#059669' }}>
            <Upload size={13} /> Estoque {estoqueFileName && `(${estoqueFileName})`}
            <input type="file" accept=".csv,.txt" onChange={e => handleFile(e, setEstoqueText, setEstoqueFileName)} style={{ display: 'none' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#eff6ff', border: 'none', borderRadius: 10, padding: '7px 13px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>
            <Upload size={13} /> Consumo {consumoFileName && `(${consumoFileName})`}
            <input type="file" accept=".csv,.txt" onChange={e => handleFile(e, setConsumoText, setConsumoFileName)} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <div style={{ maxWidth: 1340, margin: '0 auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── KPI CARDS ─────────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
          {[
            {
              label: 'Custo Total do Período', value: fmtBRL(kpis.custoTotal),
              sub: `${kpis.totalConsumo} itens consumidos`, icon: <DollarSign size={20} />, bg: '#2563eb', light: '#eff6ff',
              show: hasConsumo,
            },
            {
              label: 'Volume Total Consumido', value: kpis.volTotal.toLocaleString('pt-BR'),
              sub: 'unidades dispensadas', icon: <TrendingUp size={20} />, bg: '#7c3aed', light: '#f5f3ff',
              show: hasConsumo,
            },
            {
              label: 'Itens Classe A (≥70% custo)', value: kpis.classeA.toLocaleString('pt-BR'),
              sub: `${kpis.totalConsumo > 0 ? Math.round((kpis.classeA / kpis.totalConsumo) * 100) : 0}% do catálogo · alto impacto`, icon: <ShieldAlert size={20} />, bg: '#0891b2', light: '#ecfeff',
              show: hasConsumo,
            },
            {
              label: 'Itens Sem Estoque', value: kpis.semEstoque.toLocaleString('pt-BR'),
              sub: `${kpis.cobertura}% de cobertura`, icon: <AlertCircle size={20} />, bg: '#dc2626', light: '#fef2f2',
              show: hasEstoque,
            },
            {
              label: 'Lotes Vencendo ≤30 dias', value: kpis.venc30.toLocaleString('pt-BR'),
              sub: `${kpis.venc90} lotes vencendo em ≤90 dias`, icon: <AlertTriangle size={20} />, bg: '#d97706', light: '#fefce8',
              show: hasEstoque,
            },
            {
              label: 'Produtos no Painel', value: kpis.totalEstoque.toLocaleString('pt-BR'),
              sub: `${kpis.totalEstoque - kpis.semEstoque} com estoque disponível`, icon: <Package size={20} />, bg: '#059669', light: '#f0fdf4',
              show: hasEstoque,
            },
          ].filter(k => k.show).map((k, i) => (
            <div key={i} style={{ ...card(), display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, background: k.light, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.bg, flexShrink: 0 }}>
                {k.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.06em', margin: '0 0 2px' }}>{k.label}</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: k.bg, margin: '0 0 2px', lineHeight: 1.1 }}>{k.value}</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── SEÇÃO 1: ANÁLISE ABC ──────────────────────────────────────────── */}
        {hasConsumo && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
              <DollarSign size={18} color="#2563eb" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#334155' }}>Análise ABC — Impacto Financeiro</h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>

              {/* Curva ABC — Top 20 por Custo */}
              <div style={card()}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Curva ABC — Top 20 Itens por Custo</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 14px' }}>Custo do período (barras) e % acumulado (linha)</p>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={charts.top20abc} margin={{ left: 10, right: 40, top: 4, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="nome" angle={-40} textAnchor="end" tick={{ fontSize: 8.5 }} interval={0} />
                    <YAxis yAxisId="left" tick={{ fontSize: 9 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <RechartsTooltip
                      formatter={(v: number, name: string) => name === 'cumPct' ? [`${v.toFixed(1)}%`, '% Acum.'] : [fmtBRL(v), 'Custo Período']}
                      contentStyle={{ borderRadius: 8, fontSize: 11 }}
                    />
                    <Bar yAxisId="left" dataKey="custo" name="custo" radius={[4, 4, 0, 0]}>
                      {charts.top20abc.map((e, i) => <Cell key={i} fill={ABC_COLORS[e.classe as 'A' | 'B' | 'C']} />)}
                    </Bar>
                    <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="#94a3b8" strokeWidth={2} dot={false} name="cumPct" />
                  </ComposedChart>
                </ResponsiveContainer>
                {/* Legenda ABC */}
                <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                  {(['A', 'B', 'C'] as const).map(cl => (
                    <div key={cl} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: ABC_COLORS[cl] }} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>Classe {cl}</span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 16, height: 2, background: '#94a3b8' }} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>% Acumulado</span>
                  </div>
                </div>
              </div>

              {/* Distribuição ABC + Top por custo unitário */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                {/* Pie ABC */}
                <div style={card()}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Distribuição por Classe</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 8px' }}>Quantidade de itens A / B / C</p>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie data={charts.abcDist} dataKey="value" cx="50%" cy="50%" outerRadius={70}
                        label={({ name, value, percent }) => `${value} (${(percent * 100).toFixed(0)}%)`}
                        labelLine={false}>
                        {charts.abcDist.map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                      <RechartsTooltip formatter={(v: number, n: string) => [v, n]} contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Top 5 custo unitário */}
                <div style={card({ flex: 1 })}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 12px' }}>Top 5 — Maior Custo Unitário</p>
                  {[...consumoData].sort((a, b) => b.custoUnit - a.custoUnit).slice(0, 5).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 4 ? '1px solid #f8fafc' : 'none' }}>
                      <div style={{ minWidth: 0, flex: 1, marginRight: 8 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: '#334155', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{truncate(c.nome, 28)}</p>
                        <p style={{ fontSize: 9, color: '#94a3b8', margin: 0 }}>Cód: {c.codigo}</p>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: ABC_COLORS[c.classeABC] }}>{fmtBRL(c.custoUnit)}</span>
                        <span style={{ fontSize: 8, background: ABC_BG[c.classeABC], color: ABC_COLORS[c.classeABC], fontWeight: 700, padding: '1px 5px', borderRadius: 4, marginLeft: 4 }}>{c.classeABC}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SEÇÃO 2: VOLUME DE CONSUMO ────────────────────────────────────── */}
        {hasConsumo && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
              <Activity size={18} color="#7c3aed" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#334155' }}>Volume de Consumo</h2>
            </div>
            <div style={card()}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Top 10 por Volume Consumido (Qtd)</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 14px' }}>Quantidade total de unidades dispensadas no período</p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={charts.top10vol} layout="vertical" margin={{ left: 10, right: 40, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => v.toLocaleString('pt-BR')} />
                  <YAxis type="category" dataKey="nome" tick={{ fontSize: 9 }} width={200} />
                  <RechartsTooltip
                    formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Qtd Consumo']}
                    contentStyle={{ borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="qtd" radius={[0, 4, 4, 0]}>
                    {charts.top10vol.map((e, i) => <Cell key={i} fill={ABC_COLORS[e.classe as 'A' | 'B' | 'C']} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── SEÇÃO 3: ESTOQUE E VALIDADES ─────────────────────────────────── */}
        {hasEstoque && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
              <Clock size={18} color="#d97706" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#334155' }}>Estoque e Controle de Validades</h2>
            </div>

            {/* Cards vencimento */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
              {charts.vencDist.map((v, i) => (
                <div key={i} style={{ ...card({ padding: '14px 18px', borderLeft: `4px solid ${v.fill}` }) }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase' }}>{v.periodo}</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: v.fill, margin: 0, lineHeight: 1 }}>{v.count}</p>
                  <p style={{ fontSize: 9, color: '#94a3b8', margin: '4px 0 0' }}>lote(s)</p>
                </div>
              ))}
            </div>

            {/* Bar chart vencimentos + cobertura */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
              <div style={card()}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Distribuição de Vencimentos por Janela</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 14px' }}>Quantidade de lotes por período de vencimento</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={charts.vencDist} margin={{ left: -10, right: 10, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="periodo" tick={{ fontSize: 11, fontWeight: 700 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                    <Bar dataKey="count" name="Lotes" radius={6}>
                      {charts.vencDist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Cobertura card */}
              <div style={card({ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 8 })}>
                <div style={{ width: 80, height: 80, borderRadius: '50%', background: `conic-gradient(${kpis.cobertura >= 80 ? '#10b981' : kpis.cobertura >= 60 ? '#f59e0b' : '#ef4444'} ${kpis.cobertura * 3.6}deg, #f1f5f9 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 16, fontWeight: 900, color: kpis.cobertura >= 80 ? '#059669' : kpis.cobertura >= 60 ? '#d97706' : '#dc2626' }}>{kpis.cobertura}%</span>
                  </div>
                </div>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: 0, textAlign: 'center' }}>Cobertura de Estoque</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, textAlign: 'center' }}>
                  {estoqueData.length - kpis.semEstoque} de {estoqueData.length} produtos com estoque
                </p>
                {kpis.semEstoque > 0 && (
                  <div style={{ background: '#fef2f2', borderRadius: 8, padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#dc2626' }}>
                    {kpis.semEstoque} sem estoque
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── SEÇÃO 4: CONTROLE DE VALIDADES ───────────────────────────────── */}
        {hasEstoque && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
              <Clock size={18} color="#dc2626" />
              <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#334155' }}>Controle de Validades — Todos os Lotes</h2>
            </div>

            {/* KPIs Validade */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12, marginBottom: 16 }}>
              {[
                { label: 'Total de Lotes', value: validadeKpis.total, color: '#334155', bg: '#f8fafc', icon: <Database size={18} /> },
                { label: 'Vencidos', value: validadeKpis.vencido, color: '#dc2626', bg: '#fef2f2', icon: <AlertCircle size={18} /> },
                { label: 'Crítico ≤30d', value: validadeKpis.critico, color: '#ea580c', bg: '#fff7ed', icon: <AlertTriangle size={18} /> },
                { label: 'Atenção ≤90d', value: validadeKpis.atencao, color: '#d97706', bg: '#fefce8', icon: <Clock size={18} /> },
                { label: 'Seguros >90d', value: validadeKpis.seguro, color: '#059669', bg: '#f0fdf4', icon: <Package size={18} /> },
              ].map((k, i) => (
                <div key={i} style={{ ...card({ padding: '14px 18px', borderLeft: `4px solid ${k.color}` }), display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ color: k.color, background: k.bg, borderRadius: 8, padding: 8, flexShrink: 0 }}>{k.icon}</div>
                  <div>
                    <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.05em', margin: '0 0 2px' }}>{k.label}</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: k.color, margin: 0, lineHeight: 1 }}>{k.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Gráficos validade */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16, marginBottom: 16 }}>
              {/* Pie status */}
              <div style={card()}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Status dos Lotes</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 10px' }}>Distribuição por situação de validade</p>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Vencidos', value: validadeKpis.vencido, color: '#dc2626' },
                        { name: 'Crítico ≤30d', value: validadeKpis.critico, color: '#ea580c' },
                        { name: 'Atenção ≤90d', value: validadeKpis.atencao, color: '#d97706' },
                        { name: 'Seguros >90d', value: validadeKpis.seguro, color: '#059669' },
                      ].filter(d => d.value > 0)}
                      dataKey="value" cx="50%" cy="50%" outerRadius={75}
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}
                    >
                      {[validadeKpis.vencido, validadeKpis.critico, validadeKpis.atencao, validadeKpis.seguro]
                        .map((v, i) => v > 0 ? <Cell key={i} fill={['#dc2626','#ea580c','#d97706','#059669'][i]} /> : null)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: 8, fontSize: 11 }} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top 10 próximos a vencer */}
              <div style={card()}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 2px' }}>Lotes Mais Próximos do Vencimento</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 10px' }}>Top 10 por dias restantes (negativos = já vencidos)</p>
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={charts?.top10Vencer ?? []} layout="vertical" margin={{ left: 10, right: 50, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={v => `${v}d`} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 9 }} width={180} />
                    <RechartsTooltip
                      formatter={(v: number, _: string, props: any) => [`${v} dias · Lote: ${props.payload.lote} · Venc: ${props.payload.validade}`, '']}
                      contentStyle={{ borderRadius: 8, fontSize: 11 }}
                    />
                    <Bar dataKey="dias" radius={[0, 4, 4, 0]}>
                      {(charts?.top10Vencer ?? []).map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tabela de lotes */}
            <div style={{ ...card({ padding: 0 }), overflow: 'hidden' }}>
              {/* Filtros */}
              <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input value={searchVal} onChange={e => { setSearchVal(e.target.value); setPageVal(0); }}
                    placeholder="Buscar produto, lote ou código…"
                    style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, outline: 'none', width: 240 }} />
                </div>
                {([
                  { v: 'ALL', label: `Todos (${validadeKpis.total})`, color: '#334155' },
                  { v: 'vencido', label: `Vencidos (${validadeKpis.vencido})`, color: '#dc2626' },
                  { v: 'critico', label: `Crítico ≤30d (${validadeKpis.critico})`, color: '#ea580c' },
                  { v: 'atencao', label: `Atenção ≤90d (${validadeKpis.atencao})`, color: '#d97706' },
                  { v: 'seguro', label: `Seguros (${validadeKpis.seguro})`, color: '#059669' },
                ] as const).map(f => (
                  <button key={f.v} onClick={() => { setFilterVal(f.v as any); setPageVal(0); }}
                    style={{ padding: '6px 13px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      background: filterVal === f.v ? f.color : '#f1f5f9', color: filterVal === f.v ? 'white' : '#64748b' }}>
                    {f.label}
                  </button>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f8fafc' }}>
                    <tr>
                      {['Cód.', 'Produto', 'Lote', 'Validade', 'Dias', 'Qtd', 'Status'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: h === 'Qtd' || h === 'Dias' ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {validadeRows.slice(pageVal * PAGE_SIZE, (pageVal + 1) * PAGE_SIZE).map((r, i) => {
                      const statusMeta = {
                        vencido: { label: 'Vencido', color: '#dc2626', bg: '#fef2f2' },
                        critico: { label: 'Crítico', color: '#ea580c', bg: '#fff7ed' },
                        atencao: { label: 'Atenção', color: '#d97706', bg: '#fefce8' },
                        seguro:  { label: 'Seguro',  color: '#059669', bg: '#f0fdf4' },
                      }[r.status];
                      const diasColor = r.status === 'vencido' ? '#dc2626' : r.status === 'critico' ? '#ea580c' : r.status === 'atencao' ? '#d97706' : '#059669';
                      return (
                        <tr key={r.codigo + r.lote + i} style={{ background: i % 2 === 0 ? 'white' : '#fafbfc' }}>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#64748b' }}>{r.codigo}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#1e293b', fontWeight: 600, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.produto}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#334155', fontFamily: 'monospace' }}>{r.lote || '—'}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: diasColor, fontWeight: 700, whiteSpace: 'nowrap' }}>{r.validade || '—'}</td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: diasColor, fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {r.diasVenc < 0 ? `${r.diasVenc}d` : `+${r.diasVenc}d`}
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 11, color: '#334155', textAlign: 'right' }}>{r.qtd > 0 ? r.qtd.toLocaleString('pt-BR') : '—'}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ fontSize: 10, fontWeight: 800, background: statusMeta.bg, color: statusMeta.color, padding: '2px 8px', borderRadius: 5 }}>{statusMeta.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Paginação validade */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {pageVal * PAGE_SIZE + 1}–{Math.min((pageVal + 1) * PAGE_SIZE, validadeRows.length)} de {validadeRows.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPageVal(p => Math.max(0, p - 1))} disabled={pageVal === 0}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: pageVal === 0 ? 'not-allowed' : 'pointer', background: 'white', color: pageVal === 0 ? '#cbd5e1' : '#334155' }}>
                    <ChevronLeft size={13} />
                  </button>
                  <button onClick={() => setPageVal(p => Math.min(Math.ceil(validadeRows.length / PAGE_SIZE) - 1, p + 1))} disabled={(pageVal + 1) * PAGE_SIZE >= validadeRows.length}
                    style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: (pageVal + 1) * PAGE_SIZE >= validadeRows.length ? 'not-allowed' : 'pointer', background: 'white', color: (pageVal + 1) * PAGE_SIZE >= validadeRows.length ? '#cbd5e1' : '#334155' }}>
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SEÇÃO 5: TABELA DETALHADA ─────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f1f5f9' }}>
            <Database size={18} color="#334155" />
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: 0, color: '#334155' }}>Tabela Detalhada</h2>
            <span style={{ fontSize: 10, color: '#94a3b8', marginLeft: 4 }}>{tableRows.length} itens</span>
          </div>

          {/* Filtros */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
              <input
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Buscar produto ou código…"
                style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 7, paddingBottom: 7, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, outline: 'none', width: 220 }}
              />
            </div>
            {hasConsumo && (['ALL', 'A', 'B', 'C'] as const).map(cl => (
              <button
                key={cl}
                onClick={() => { setFilterABC(cl); setPage(0); }}
                style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                  background: filterABC === cl ? (cl === 'ALL' ? '#334155' : ABC_COLORS[cl]) : '#f1f5f9',
                  color: filterABC === cl ? 'white' : '#64748b' }}
              >
                {cl === 'ALL' ? `Todas (${consumoData.length})` : `Classe ${cl} (${consumoData.filter(c => c.classeABC === cl).length})`}
              </button>
            ))}
          </div>

          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Cód.', 'Produto', 'Un.', hasConsumo && 'Classe', hasConsumo && 'Custo Unit.', hasConsumo && 'Qtd Consumo', hasConsumo && 'Vl Período', hasEstoque && 'Estoque', hasEstoque && 'Próx. Venc.'].filter(Boolean).map(h => (
                      <th key={h as string} style={{ padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', textAlign: h === 'Qtd Consumo' || h === 'Estoque' ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => {
                    const est = r.est;
                    const vencColor = est && est.menorDiasVenc <= 30 ? '#dc2626' : est && est.menorDiasVenc <= 90 ? '#d97706' : '#334155';
                    const rowBg = i % 2 === 0 ? 'white' : '#fafbfc';
                    return (
                      <tr key={r.codigo + i} style={{ background: rowBg }}>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{r.codigo}</td>
                        <td style={{ padding: '8px 12px', fontSize: 11, color: '#1e293b', fontWeight: 600, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nome}</td>
                        <td style={{ padding: '8px 12px', fontSize: 10, color: '#94a3b8' }}>{r.unidade}</td>
                        {hasConsumo && <td style={{ padding: '8px 12px' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, background: ABC_BG[r.classeABC], color: ABC_COLORS[r.classeABC], padding: '2px 8px', borderRadius: 5 }}>{r.classeABC}</span>
                        </td>}
                        {hasConsumo && <td style={{ padding: '8px 12px', fontSize: 11, color: '#334155', whiteSpace: 'nowrap' }}>{fmtBRL(r.custoUnit)}</td>}
                        {hasConsumo && <td style={{ padding: '8px 12px', fontSize: 11, color: '#334155', textAlign: 'right' }}>{r.qtdConsumo.toLocaleString('pt-BR')}</td>}
                        {hasConsumo && <td style={{ padding: '8px 12px', fontSize: 11, color: '#334155', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtBRL(r.vlCustoPeriodo)}</td>}
                        {hasEstoque && <td style={{ padding: '8px 12px', fontSize: 11, textAlign: 'right', color: est && est.estoqueAtual === 0 ? '#dc2626' : '#334155', fontWeight: est && est.estoqueAtual === 0 ? 700 : 400 }}>{est ? est.estoqueAtual.toLocaleString('pt-BR') : '—'}</td>}
                        {hasEstoque && <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                          {(() => {
                            if (!est || est.lotes.length === 0 || est.menorDiasVenc >= 9999) return <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>;
                            const l = [...est.lotes].sort((a, b) => a.diasVenc - b.diasVenc)[0];
                            return (
                              <div>
                                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>{l.lote || '—'}</span>
                                <br />
                                <span style={{ fontSize: 11, color: vencColor, fontWeight: 700 }}>{l.validade}</span>
                              </div>
                            );
                          })()}
                        </td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Paginação */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: '1px solid #f1f5f9' }}>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, tableRows.length)} de {tableRows.length}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: page === 0 ? 'not-allowed' : 'pointer', background: 'white', color: page === 0 ? '#cbd5e1' : '#334155' }}>
                  <ChevronLeft size={13} />
                </button>
                <button onClick={() => setPage(p => Math.min(Math.ceil(tableRows.length / PAGE_SIZE) - 1, p + 1))} disabled={(page + 1) * PAGE_SIZE >= tableRows.length} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e2e8f0', cursor: (page + 1) * PAGE_SIZE >= tableRows.length ? 'not-allowed' : 'pointer', background: 'white', color: (page + 1) * PAGE_SIZE >= tableRows.length ? '#cbd5e1' : '#334155' }}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
