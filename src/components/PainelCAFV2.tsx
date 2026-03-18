import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Package, AlertTriangle, AlertCircle, CheckCircle, Clock,
  ShoppingCart, Upload, Activity, Database, Search,
  ChevronLeft, ChevronRight, RefreshCw, TrendingDown,
  FileText, Layers, BarChart2, X,
} from 'lucide-react';

// ─── CSV PARSING ──────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (const ch of line) {
    if (ch === '"') inQ = !inQ;
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseBR(s?: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

const TODAY = new Date('2026-03-18');

function diasParaVencer(ddmmyyyy: string): number {
  if (!ddmmyyyy) return 9999;
  const p = ddmmyyyy.trim().split('/');
  if (p.length !== 3) return 9999;
  const d = new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`);
  if (isNaN(d.getTime())) return 9999;
  return Math.floor((d.getTime() - TODAY.getTime()) / 86400000);
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

type ConsumoStatus = 'SEM_ESTOQUE' | 'CRÍTICO' | 'ATENÇÃO' | 'ADEQUADO';
type OCStatus = 'NAO_ATENDIDA' | 'PARCIAL' | 'RECEBIDO';

interface ConsumoItem {
  id: string; nome: string; unidade: string;
  d17: number; d18: number; total: number; media: number;
  saldo: number; proj: number; status: ConsumoStatus;
}
interface LoteItem { lote: string; validade: string; qtd: number; diasVenc: number; }
interface PainelItem {
  id: string; nome: string; unidade: string; estoque: number;
  lotes: LoteItem[]; menorDiasVenc: number;
}
interface OCItem {
  dataPrevista: string; oc: string; nomeFornecedor: string;
  codProduto: string; nomeProduto: string; unidade: string;
  saldoAtual: number; qtComprada: number; qtRecebida: number;
  qtCancelada: number; qtDiferenca: number; ocStatus: OCStatus;
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────

function parseConsumo(text: string): ConsumoItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: ConsumoItem[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const id = c[0]?.trim();
    if (!id || !/^\d+$/.test(id)) continue;
    const saldo = parseBR(c[7]);
    const media = parseBR(c[6]);
    const proj  = parseBR(c[9]);
    let status: ConsumoStatus = 'ADEQUADO';
    if (saldo === 0)              status = 'SEM_ESTOQUE';
    else if (proj > 0 && proj <= 3)  status = 'CRÍTICO';
    else if (proj > 3 && proj <= 7)  status = 'ATENÇÃO';
    result.push({
      id, nome: c[1]?.trim() || '', unidade: c[2]?.trim() || '',
      d17: parseBR(c[3]), d18: parseBR(c[4]),
      total: parseBR(c[5]), media, saldo, proj, status,
    });
  }
  return result;
}

function parsePainel(text: string): PainelItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: PainelItem[] = [];
  let current: PainelItem | null = null;
  for (let i = 1; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const id = c[1]?.trim();
    if (id && /^\d+$/.test(id)) {
      current = { id, nome: c[2]?.trim() || '', unidade: c[4]?.trim() || '', estoque: parseBR(c[6]), lotes: [], menorDiasVenc: 9999 };
      result.push(current);
    }
    if (current) {
      const lote = c[8]?.trim();
      const val  = c[10]?.trim() || '';
      if (lote) {
        const qtd     = parseBR(c[18]);
        const diasVenc = diasParaVencer(val);
        current.lotes.push({ lote, validade: val, qtd, diasVenc });
        if (diasVenc < current.menorDiasVenc) current.menorDiasVenc = diasVenc;
      }
    }
  }
  return result;
}

function parseOC(text: string): OCItem[] {
  if (!text) return [];
  const lines = text.split('\n').filter(l => l.trim());
  const result: OCItem[] = [];
  for (let i = 2; i < lines.length; i++) {
    const c = parseCSVLine(lines[i]);
    const pIdx = /^\d+$/.test(c[6]?.trim() || '') ? 6 : /^\d+$/.test(c[4]?.trim() || '') ? 4 : -1;
    if (pIdx < 0) continue;
    const codProduto = c[pIdx]?.trim() || '';
    if (!codProduto) continue;
    const qtComprada  = parseBR(c[pIdx + 4]);
    const qtRecebida  = parseBR(c[pIdx + 5]);
    const qtCancelada = pIdx === 6 ? parseBR(c[13]) : parseBR(c[pIdx + 7]);
    const qtDiferenca = pIdx === 6 ? parseBR(c[14]) : parseBR(c[pIdx + 8]);
    let ocStatus: OCStatus = 'NAO_ATENDIDA';
    if (qtDiferenca === 0 && qtComprada > 0) ocStatus = 'RECEBIDO';
    else if (qtRecebida > 0 && qtDiferenca > 0) ocStatus = 'PARCIAL';
    result.push({
      dataPrevista: c[0]?.trim() || '',
      oc: (pIdx === 6 ? c[2] : c[1])?.trim() || '',
      nomeFornecedor: (pIdx === 6 ? c[5] : c[3])?.trim() || '',
      codProduto, nomeProduto: c[pIdx + 1]?.trim() || '',
      unidade: c[pIdx + 2]?.trim() || '',
      saldoAtual: parseBR(c[pIdx + 3]), qtComprada, qtRecebida, qtCancelada, qtDiferenca, ocStatus,
    });
  }
  return result;
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STATUS_META: Record<ConsumoStatus, { label: string; bg: string; text: string; color: string }> = {
  SEM_ESTOQUE: { label: 'Sem Estoque', bg: '#f1f5f9', text: '#475569', color: '#94a3b8' },
  CRÍTICO:     { label: 'Crítico ≤3d',  bg: '#fef2f2', text: '#dc2626', color: '#ef4444' },
  ATENÇÃO:     { label: 'Atenção ≤7d',  bg: '#fefce8', text: '#d97706', color: '#f59e0b' },
  ADEQUADO:    { label: 'Adequado',     bg: '#f0fdf4', text: '#059669', color: '#10b981' },
};
const OC_META: Record<OCStatus, { label: string; bg: string; text: string }> = {
  NAO_ATENDIDA: { label: 'Não Atendida', bg: '#fef2f2', text: '#dc2626' },
  PARCIAL:      { label: 'Parcial',      bg: '#fefce8', text: '#d97706' },
  RECEBIDO:     { label: 'Recebido',     bg: '#f0fdf4', text: '#059669' },
};

const PAGE_SIZE = 25;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const truncate = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s;

function StatusBadge({ status }: { status: ConsumoStatus }) {
  const m = STATUS_META[status];
  return (
    <span style={{ background: m.bg, color: m.text, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}
function OCBadge({ status }: { status: OCStatus }) {
  const m = OC_META[status];
  return (
    <span style={{ background: m.bg, color: m.text, padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, whiteSpace: 'nowrap' }}>
      {m.label}
    </span>
  );
}
function Pager({ total, page, onChange }: { total: number; page: number; onChange: (n: number) => void }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', padding: '12px 0' }}>
      <button onClick={() => onChange(Math.max(0, page - 1))} disabled={page === 0}
        style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', opacity: page === 0 ? 0.4 : 1 }}>
        <ChevronLeft size={14} />
      </button>
      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>{page + 1} / {pages} — {total} item(s)</span>
      <button onClick={() => onChange(Math.min(pages - 1, page + 1))} disabled={page >= pages - 1}
        style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', opacity: page >= pages - 1 ? 0.4 : 1 }}>
        <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ─── TABLE STYLES ─────────────────────────────────────────────────────────────

const TH: React.CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em', whiteSpace: 'nowrap', borderBottom: '1px solid #f1f5f9' };
const TD: React.CSSProperties = { padding: '10px 12px', fontSize: 11, color: '#334155', borderBottom: '1px solid #f8fafc', verticalAlign: 'middle' };

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────

type FileKey = 'consumo' | 'painel' | 'oc';
const FILE_CONFIG: { key: FileKey; label: string; hint: string; icon: React.ReactNode; color: string }[] = [
  { key: 'consumo', label: 'Consumo do Painel', hint: 'CONSUMODPAINEL.csv — Produto, Dias, Total, Média, Saldo, Projeção', icon: <Activity size={24} />, color: '#4f46e5' },
  { key: 'painel',  label: 'Painel CAF 2',      hint: 'PAINEL CAF2.csv — Estoque atual, Lotes, Validade',                  icon: <Database size={24} />, color: '#0891b2' },
  { key: 'oc',      label: 'Ordens de Compra',  hint: 'R_ORD_COM_PROD.csv — OC, Fornecedor, Produto, Quantidades',         icon: <ShoppingCart size={24} />, color: '#059669' },
];

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

type DashTab = 'geral' | 'estoque' | 'consumo' | 'oc' | 'alertas';

export const PainelCAFV2: React.FC = () => {
  const [texts, setTexts]     = useState<Record<FileKey, string>>({ consumo: '', painel: '', oc: '' });
  const [activeTab, setActiveTab] = useState<DashTab>('geral');

  // Search & filter per tab
  const [searchConsumo, setSearchConsumo] = useState('');
  const [searchEstoque, setSearchEstoque] = useState('');
  const [searchOC, setSearchOC]           = useState('');
  const [filterConsumo, setFilterConsumo] = useState<'ALL' | ConsumoStatus>('ALL');
  const [filterEstoque, setFilterEstoque] = useState<'ALL' | 'SEM_ESTOQUE' | 'VENCENDO'>('ALL');
  const [filterOC, setFilterOC]           = useState<'ALL' | OCStatus>('ALL');

  // Pages
  const [pageConsumo, setPageConsumo] = useState(0);
  const [pageEstoque, setPageEstoque] = useState(0);
  const [pageOC, setPageOC]           = useState(0);

  // Reset pages on filter change
  useEffect(() => { setPageConsumo(0); }, [filterConsumo, searchConsumo]);
  useEffect(() => { setPageEstoque(0); }, [filterEstoque, searchEstoque]);
  useEffect(() => { setPageOC(0); },      [filterOC, searchOC]);

  const ready = texts.consumo && texts.painel && texts.oc;

  // ── Parsed data ──
  const consumoData = useMemo(() => parseConsumo(texts.consumo), [texts.consumo]);
  const painelData  = useMemo(() => parsePainel(texts.painel),   [texts.painel]);
  const ocData      = useMemo(() => parseOC(texts.oc),           [texts.oc]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    if (!ready) return null;
    const semEstoque  = painelData.filter(p => p.estoque === 0).length;
    const criticos    = consumoData.filter(c => c.status === 'CRÍTICO').length;
    const atencao     = consumoData.filter(c => c.status === 'ATENÇÃO').length;
    const adequados   = consumoData.filter(c => c.status === 'ADEQUADO').length;
    const vencendo90  = painelData.filter(p => p.menorDiasVenc >= 0 && p.menorDiasVenc <= 90).length;
    const vencendo30  = painelData.filter(p => p.menorDiasVenc >= 0 && p.menorDiasVenc <= 30).length;
    const ocNaoAtendidas = ocData.filter(o => o.ocStatus === 'NAO_ATENDIDA').length;
    const ocParciais     = ocData.filter(o => o.ocStatus === 'PARCIAL').length;
    const cobertura   = painelData.length > 0 ? Math.round(((painelData.length - semEstoque) / painelData.length) * 100) : 0;
    const consumoTotal = consumoData.reduce((s, c) => s + c.total, 0);
    return { totalPainel: painelData.length, semEstoque, criticos, atencao, adequados, vencendo90, vencendo30, ocNaoAtendidas, ocParciais, cobertura, consumoTotal, totalConsumo: consumoData.length, totalOC: ocData.length };
  }, [ready, consumoData, painelData, ocData]);

  // ── Chart data ──
  const charts = useMemo(() => {
    if (!ready) return null;

    // Pie: status distribution from consumo
    const pie = (['SEM_ESTOQUE', 'CRÍTICO', 'ATENÇÃO', 'ADEQUADO'] as ConsumoStatus[]).map(k => ({
      name: STATUS_META[k].label,
      value: consumoData.filter(c => c.status === k).length,
      color: STATUS_META[k].color,
    })).filter(x => x.value > 0);

    // Bar: top 12 consumo
    const top12 = [...consumoData]
      .sort((a, b) => b.total - a.total)
      .slice(0, 12)
      .map(c => ({ nome: truncate(c.nome, 28), total: c.total, saldo: c.saldo, status: c.status }));

    // Bar: lotes vencimento
    const vencDist = [
      { periodo: '≤30d', count: 0, fill: '#ef4444' },
      { periodo: '31–60d', count: 0, fill: '#f97316' },
      { periodo: '61–90d', count: 0, fill: '#f59e0b' },
      { periodo: '91–180d', count: 0, fill: '#84cc16' },
    ];
    painelData.forEach(p => p.lotes.forEach(l => {
      if (l.diasVenc < 0) return;
      if (l.diasVenc <= 30)       vencDist[0].count++;
      else if (l.diasVenc <= 60)  vencDist[1].count++;
      else if (l.diasVenc <= 90)  vencDist[2].count++;
      else if (l.diasVenc <= 180) vencDist[3].count++;
    }));

    return { pie, top12, vencDist };
  }, [ready, consumoData, painelData]);

  // ── Alertas ──
  const alertas = useMemo(() => {
    if (!ready) return null;
    const ocPendMap = new Set(ocData.filter(o => o.ocStatus === 'NAO_ATENDIDA' || o.ocStatus === 'PARCIAL').map(o => o.codProduto));

    const rupturaSemCob = painelData.filter(p => p.estoque === 0 && !ocPendMap.has(p.id)).slice(0, 60);
    const criticoSemOC  = consumoData.filter(c => (c.status === 'CRÍTICO' || c.status === 'SEM_ESTOQUE') && !ocPendMap.has(c.id)).slice(0, 40);
    const ocUrgentes    = ocData.filter(o => (o.ocStatus === 'NAO_ATENDIDA' || o.ocStatus === 'PARCIAL') && o.saldoAtual === 0).slice(0, 30);
    const lotesVenc     = painelData.filter(p => p.menorDiasVenc >= 0 && p.menorDiasVenc <= 90).sort((a, b) => a.menorDiasVenc - b.menorDiasVenc).slice(0, 40);

    return { rupturaSemCob, criticoSemOC, ocUrgentes, lotesVenc };
  }, [ready, consumoData, painelData, ocData]);

  // ── Filtered tables ──
  const consumoFilt = useMemo(() => {
    let items = consumoData;
    if (filterConsumo !== 'ALL') items = items.filter(c => c.status === filterConsumo);
    if (searchConsumo) { const q = searchConsumo.toLowerCase(); items = items.filter(c => c.nome.toLowerCase().includes(q) || c.id.includes(q)); }
    return items;
  }, [consumoData, filterConsumo, searchConsumo]);

  const estoqueFilt = useMemo(() => {
    let items = painelData;
    if (filterEstoque === 'SEM_ESTOQUE') items = items.filter(p => p.estoque === 0);
    else if (filterEstoque === 'VENCENDO') items = items.filter(p => p.menorDiasVenc >= 0 && p.menorDiasVenc <= 90);
    if (searchEstoque) { const q = searchEstoque.toLowerCase(); items = items.filter(p => p.nome.toLowerCase().includes(q) || p.id.includes(q)); }
    return items;
  }, [painelData, filterEstoque, searchEstoque]);

  const ocFilt = useMemo(() => {
    let items = ocData;
    if (filterOC !== 'ALL') items = items.filter(o => o.ocStatus === filterOC);
    if (searchOC) { const q = searchOC.toLowerCase(); items = items.filter(o => o.nomeProduto.toLowerCase().includes(q) || o.codProduto.includes(q) || o.oc.includes(q)); }
    return items;
  }, [ocData, filterOC, searchOC]);

  const readFile = useCallback((file: File, key: FileKey) => {
    const reader = new FileReader();
    reader.onload = e => setTexts(prev => ({ ...prev, [key]: e.target?.result as string || '' }));
    reader.readAsText(file, 'latin1');
  }, []);

  const handleReset = () => {
    setTexts({ consumo: '', painel: '', oc: '' });
    setActiveTab('geral');
  };

  // ── UPLOAD SCREEN ──
  if (!ready) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 32, padding: '40px 20px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, background: 'linear-gradient(135deg,#4f46e5,#0891b2)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <BarChart2 size={32} color="white" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', margin: 0 }}>Painel CAF V2</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>Carregue os 3 arquivos CSV para iniciar a análise</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, width: '100%', maxWidth: 800 }}>
          {FILE_CONFIG.map(({ key, label, hint, icon, color }) => (
            <label key={key} style={{ cursor: 'pointer' }}>
              <input type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f, key); e.target.value = ''; }} />
              <div style={{ background: texts[key] ? '#f0fdf4' : 'white', border: `2px dashed ${texts[key] ? '#10b981' : '#e2e8f0'}`, borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, transition: 'all .2s', textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, background: texts[key] ? '#10b981' : color, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
                  {texts[key] ? <CheckCircle size={24} /> : icon}
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: '0 0 4px' }}>{label}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, lineHeight: 1.4 }}>{hint}</p>
                </div>
                <div style={{ background: texts[key] ? '#10b981' : color, color: 'white', padding: '6px 16px', borderRadius: 8, fontSize: 11, fontWeight: 700 }}>
                  {texts[key] ? '✓ Carregado' : 'Selecionar arquivo'}
                </div>
              </div>
            </label>
          ))}
        </div>

        <p style={{ fontSize: 11, color: '#94a3b8' }}>
          {[texts.consumo, texts.painel, texts.oc].filter(Boolean).length}/3 arquivos carregados
        </p>
      </div>
    );
  }

  // ── DASHBOARD ─────────────────────────────────────────────────────────────

  const tabs: { id: DashTab; label: string; icon: React.ReactNode }[] = [
    { id: 'geral',   label: 'Visão Geral',      icon: <BarChart2 size={14} /> },
    { id: 'estoque', label: `Estoque (${painelData.length})`, icon: <Database size={14} /> },
    { id: 'consumo', label: `Consumo (${consumoData.length})`, icon: <Activity size={14} /> },
    { id: 'oc',      label: `Ordens de Compra (${ocData.length})`, icon: <ShoppingCart size={14} /> },
    { id: 'alertas', label: `⚠ Alertas`, icon: <AlertTriangle size={14} /> },
  ];

  return (
    <div style={{ fontFamily: 'sans-serif', color: '#0f172a', background: '#f8fafc', minHeight: '100vh', paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #f1f5f9', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, background: 'linear-gradient(135deg,#4f46e5,#0891b2)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <BarChart2 size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, color: '#0f172a' }}>Painel CAF V2</h1>
            <p style={{ fontSize: 10, color: '#94a3b8', margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Análise integrada · {painelData.length} produtos · {ocData.length} OC
            </p>
          </div>
        </div>
        <button onClick={handleReset} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f1f5f9', border: 'none', borderRadius: 10, padding: '8px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#64748b' }}>
          <RefreshCw size={13} /> Recarregar
        </button>
      </div>

      <div style={{ maxWidth: 1300, margin: '0 auto', padding: '0 20px' }}>

        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Produtos no Painel', value: kpis!.totalPainel.toLocaleString('pt-BR'), sub: `${kpis!.totalConsumo} com dados de consumo`, icon: <Package size={20} />, bg: '#4f46e5', light: '#eef2ff' },
            { label: 'Sem Estoque (Painel)', value: kpis!.semEstoque.toLocaleString('pt-BR'), sub: `${(100 - kpis!.cobertura)}% sem cobertura`, icon: <TrendingDown size={20} />, bg: '#dc2626', light: '#fef2f2' },
            { label: 'Críticos ≤ 3 dias', value: kpis!.criticos.toLocaleString('pt-BR'), sub: `${kpis!.atencao} em atenção (≤7d)`, icon: <AlertTriangle size={20} />, bg: '#ef4444', light: '#fff1f2' },
            { label: 'Cobertura de Estoque', value: `${kpis!.cobertura}%`, sub: `${kpis!.adequados} itens adequados`, icon: <CheckCircle size={20} />, bg: kpis!.cobertura >= 80 ? '#059669' : kpis!.cobertura >= 60 ? '#d97706' : '#dc2626', light: kpis!.cobertura >= 80 ? '#f0fdf4' : kpis!.cobertura >= 60 ? '#fefce8' : '#fef2f2' },
            { label: 'Lotes Vencendo ≤90d', value: kpis!.vencendo90.toLocaleString('pt-BR'), sub: `${kpis!.vencendo30} vencendo em ≤30 dias`, icon: <Clock size={20} />, bg: '#f59e0b', light: '#fefce8' },
            { label: 'OC Não Atendidas / Parciais', value: `${kpis!.ocNaoAtendidas + kpis!.ocParciais}`, sub: `${kpis!.ocNaoAtendidas} não atendidas · ${kpis!.ocParciais} parciais`, icon: <ShoppingCart size={20} />, bg: '#0891b2', light: '#ecfeff' },
          ].map((k, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 16, padding: '18px 20px', border: '1px solid #f1f5f9', boxShadow: '0 1px 4px rgba(0,0,0,.04)', display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, background: k.light, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.bg, flexShrink: 0 }}>
                {k.icon}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 9, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>{k.label}</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: k.bg, margin: '0 0 2px', lineHeight: 1 }}>{k.value}</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 20, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ flex: 1, minWidth: 'max-content', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 800, transition: 'all .2s', background: activeTab === t.id ? 'white' : 'transparent', color: activeTab === t.id ? '#4f46e5' : '#64748b', boxShadow: activeTab === t.id ? '0 1px 4px rgba(0,0,0,.1)' : 'none' }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── TAB: VISÃO GERAL ── */}
        {activeTab === 'geral' && charts && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16 }}>

              {/* Pie */}
              <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 4px' }}>Cobertura de Estoque</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 12px' }}>Distribuição por status de consumo</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={charts.pie} dataKey="value" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {charts.pie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`${v} itens`, '']} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, fontWeight: 700 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top 12 consumo */}
              <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 4px' }}>Top 12 Maior Consumo</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 12px' }}>Total de saídas no período</p>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={charts.top12} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 9 }} />
                    <YAxis type="category" dataKey="nome" tick={{ fontSize: 8.5 }} width={190} />
                    <Tooltip formatter={(v: number) => [v.toLocaleString('pt-BR'), 'Total']} />
                    <Bar dataKey="total" name="Total" radius={[0, 4, 4, 0]}>
                      {charts.top12.map((e, i) => <Cell key={i} fill={STATUS_META[e.status as ConsumoStatus]?.color || '#4f46e5'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Vencimentos */}
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 4px' }}>Lotes por Prazo de Vencimento</p>
              <p style={{ fontSize: 10, color: '#94a3b8', margin: '0 0 16px' }}>Quantidade de lotes por janela de vencimento</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
                {charts.vencDist.map((v, i) => (
                  <div key={i} style={{ background: '#f8fafc', borderRadius: 12, padding: '12px 16px', borderLeft: `4px solid ${v.fill}` }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, margin: '0 0 4px', textTransform: 'uppercase' }}>{v.periodo}</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: v.fill, margin: 0 }}>{v.count}</p>
                    <p style={{ fontSize: 9, color: '#94a3b8', margin: '2px 0 0' }}>lote(s)</p>
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={charts.vencDist}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="periodo" tick={{ fontSize: 10, fontWeight: 700 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Lotes" radius={6}>
                    {charts.vencDist.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Indicadores e Recomendações */}
            <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid #f1f5f9' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: '#334155', margin: '0 0 16px' }}>📋 Indicadores e Recomendações</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10 }}>
                {[
                  kpis!.semEstoque > 50   && { sev: 'danger',  icon: '🚨', title: 'Alta ruptura de estoque', body: `${kpis!.semEstoque} produtos sem estoque (${(100 - kpis!.cobertura)}%). Acionar reposição emergencial.` },
                  kpis!.criticos > 10     && { sev: 'danger',  icon: '🔴', title: 'Múltiplos críticos iminentes', body: `${kpis!.criticos} itens com cobertura ≤ 3 dias. Revisar pedidos com urgência.` },
                  kpis!.vencendo30 > 0    && { sev: 'warning', icon: '⏰', title: 'Lotes vencendo em 30 dias', body: `${kpis!.vencendo30} lotes com vencimento iminente. Acionar distribuição ou devolução.` },
                  kpis!.ocPendentes > 0   && { sev: 'info',    icon: '📦', title: 'OC aguardando recebimento', body: `${kpis!.ocPendentes} ordens de compra pendentes. Acompanhar entrega com fornecedores.` },
                  kpis!.atencao > 20      && { sev: 'warning', icon: '🟡', title: 'Volume elevado em atenção', body: `${kpis!.atencao} itens com cobertura entre 3 e 7 dias. Programar reposição preventiva.` },
                  kpis!.cobertura >= 85   && { sev: 'success', icon: '✅', title: 'Cobertura de estoque satisfatória', body: `${kpis!.cobertura}% dos produtos com estoque disponível. Manter monitoramento.` },
                ].filter(Boolean).map((r: any, i) => (
                  <div key={i} style={{ borderRadius: 10, padding: '12px 16px', borderLeft: `4px solid ${r.sev === 'danger' ? '#ef4444' : r.sev === 'warning' ? '#f59e0b' : r.sev === 'info' ? '#3b82f6' : '#10b981'}`, background: r.sev === 'danger' ? '#fef2f2' : r.sev === 'warning' ? '#fefce8' : r.sev === 'info' ? '#eff6ff' : '#f0fdf4' }}>
                    <p style={{ fontSize: 11, fontWeight: 800, color: '#334155', margin: '0 0 4px' }}>{r.icon} {r.title}</p>
                    <p style={{ fontSize: 10, color: '#64748b', margin: 0, lineHeight: 1.5 }}>{r.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: ESTOQUE ── */}
        {activeTab === 'estoque' && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[
                  { v: 'ALL', label: `Todos (${painelData.length})` },
                  { v: 'SEM_ESTOQUE', label: `Sem Estoque (${painelData.filter(p => p.estoque === 0).length})`, color: '#dc2626' },
                  { v: 'VENCENDO', label: `Vencendo ≤90d (${painelData.filter(p => p.menorDiasVenc >= 0 && p.menorDiasVenc <= 90).length})`, color: '#d97706' },
                ].map(f => (
                  <button key={f.v} onClick={() => setFilterEstoque(f.v as any)} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: filterEstoque === f.v ? (f.color || '#4f46e5') : '#f1f5f9', color: filterEstoque === f.v ? 'white' : '#64748b' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={searchEstoque} onChange={e => setSearchEstoque(e.target.value)} placeholder="Buscar produto ou código…" style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, outline: 'none', width: 220 }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['ID MV', 'Produto', 'Unidade', 'Estoque', 'Lotes', 'Próx. Vencimento', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {estoqueFilt.slice(pageEstoque * PAGE_SIZE, (pageEstoque + 1) * PAGE_SIZE).map((p, i) => {
                    const vencCorGrade = p.menorDiasVenc <= 30 ? '#fef2f2' : p.menorDiasVenc <= 90 ? '#fefce8' : 'transparent';
                    return (
                      <tr key={p.id + i} style={{ background: p.estoque === 0 ? '#fff1f2' : 'white' }}>
                        <td style={{ ...TD, fontFamily: 'monospace', color: '#475569', fontSize: 10 }}>{p.id}</td>
                        <td style={{ ...TD, fontWeight: 600, maxWidth: 280 }}>{truncate(p.nome, 55)}</td>
                        <td style={{ ...TD, color: '#94a3b8', fontSize: 10 }}>{p.unidade}</td>
                        <td style={{ ...TD, fontWeight: 800, color: p.estoque === 0 ? '#dc2626' : '#059669', textAlign: 'right' }}>{p.estoque.toLocaleString('pt-BR')}</td>
                        <td style={{ ...TD, textAlign: 'center' }}>{p.lotes.length > 0 ? <span style={{ background: '#eff6ff', color: '#3b82f6', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700 }}>{p.lotes.length} lote(s)</span> : <span style={{ color: '#94a3b8', fontSize: 10 }}>—</span>}</td>
                        <td style={{ ...TD, background: vencCorGrade }}>
                          {p.menorDiasVenc < 9999 && p.lotes.length > 0 ? (
                            <span style={{ fontSize: 10, fontWeight: 700, color: p.menorDiasVenc <= 30 ? '#dc2626' : '#d97706' }}>
                              {p.lotes.find(l => l.diasVenc === p.menorDiasVenc)?.validade || '—'} ({p.menorDiasVenc}d)
                            </span>
                          ) : <span style={{ color: '#94a3b8', fontSize: 10 }}>—</span>}
                        </td>
                        <td style={TD}>{p.estoque === 0 ? <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Sem Estoque</span> : p.menorDiasVenc <= 90 && p.menorDiasVenc >= 0 ? <span style={{ background: '#fefce8', color: '#d97706', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Vencendo</span> : <span style={{ background: '#f0fdf4', color: '#059669', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Ok</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager total={estoqueFilt.length} page={pageEstoque} onChange={setPageEstoque} />
          </div>
        )}

        {/* ── TAB: CONSUMO ── */}
        {activeTab === 'consumo' && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { v: 'ALL',         label: `Todos (${consumoData.length})`,                                                  color: '#4f46e5' },
                  { v: 'SEM_ESTOQUE', label: `Sem Estoque (${consumoData.filter(c => c.status === 'SEM_ESTOQUE').length})`,   color: '#64748b' },
                  { v: 'CRÍTICO',     label: `Críticos (${consumoData.filter(c => c.status === 'CRÍTICO').length})`,          color: '#dc2626' },
                  { v: 'ATENÇÃO',     label: `Atenção (${consumoData.filter(c => c.status === 'ATENÇÃO').length})`,           color: '#d97706' },
                  { v: 'ADEQUADO',    label: `Adequado (${consumoData.filter(c => c.status === 'ADEQUADO').length})`,         color: '#059669' },
                ] as any[]).map((f: any) => (
                  <button key={f.v} onClick={() => setFilterConsumo(f.v)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: filterConsumo === f.v ? f.color : '#f1f5f9', color: filterConsumo === f.v ? 'white' : '#64748b' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={searchConsumo} onChange={e => setSearchConsumo(e.target.value)} placeholder="Buscar…" style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, outline: 'none', width: 200 }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['ID MV', 'Produto', 'Unidade', 'D17', 'D18', 'Total', 'Média/Dia', 'Saldo', 'Projeção (d)', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {consumoFilt.slice(pageConsumo * PAGE_SIZE, (pageConsumo + 1) * PAGE_SIZE).map((c, i) => (
                    <tr key={c.id + i} style={{ background: c.status === 'CRÍTICO' ? '#fff1f2' : c.status === 'ATENÇÃO' ? '#fffbeb' : c.status === 'SEM_ESTOQUE' ? '#f8fafc' : 'white' }}>
                      <td style={{ ...TD, fontFamily: 'monospace', color: '#475569', fontSize: 10 }}>{c.id}</td>
                      <td style={{ ...TD, fontWeight: 600, maxWidth: 260 }}>{truncate(c.nome, 50)}</td>
                      <td style={{ ...TD, color: '#94a3b8', fontSize: 10 }}>{c.unidade}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#475569' }}>{c.d17.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#475569' }}>{c.d18.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, color: '#334155' }}>{c.total.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{c.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: c.saldo === 0 ? '#dc2626' : c.saldo < c.media * 3 ? '#d97706' : '#059669' }}>
                        {c.saldo.toLocaleString('pt-BR')}
                      </td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: c.proj > 0 && c.proj <= 3 ? '#dc2626' : c.proj > 3 && c.proj <= 7 ? '#d97706' : '#334155' }}>
                        {c.proj > 0 ? c.proj.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : c.saldo === 0 ? '—' : '∞'}
                      </td>
                      <td style={TD}><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={consumoFilt.length} page={pageConsumo} onChange={setPageConsumo} />
          </div>
        )}

        {/* ── TAB: ORDENS DE COMPRA ── */}
        {activeTab === 'oc' && (
          <div style={{ background: 'white', borderRadius: 16, border: '1px solid #f1f5f9', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {([
                  { v: 'ALL',          label: `Todas (${ocData.length})`,                                                              color: '#4f46e5' },
                  { v: 'NAO_ATENDIDA', label: `Não Atendidas (${ocData.filter(o => o.ocStatus === 'NAO_ATENDIDA').length})`,     color: '#dc2626' },
                  { v: 'PARCIAL',      label: `Parciais (${ocData.filter(o => o.ocStatus === 'PARCIAL').length})`,               color: '#d97706' },
                  { v: 'RECEBIDO',     label: `Recebidas (${ocData.filter(o => o.ocStatus === 'RECEBIDO').length})`,             color: '#059669' },
                ] as any[]).map((f: any) => (
                  <button key={f.v} onClick={() => setFilterOC(f.v)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, background: filterOC === f.v ? f.color : '#f1f5f9', color: filterOC === f.v ? 'white' : '#64748b' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input value={searchOC} onChange={e => setSearchOC(e.target.value)} placeholder="Buscar produto, OC…" style={{ paddingLeft: 30, paddingRight: 10, paddingTop: 8, paddingBottom: 8, border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11, outline: 'none', width: 200 }} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8fafc' }}>
                  <tr>
                    {['Data Prevista', 'Nº OC', 'Fornecedor', 'Cód.', 'Produto', 'Saldo', 'Qt. Comp.', 'Qt. Rec.', 'Diferença', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {ocFilt.slice(pageOC * PAGE_SIZE, (pageOC + 1) * PAGE_SIZE).map((o, i) => (
                    <tr key={i} style={{ background: o.ocStatus === 'NAO_ATENDIDA' ? '#fff1f2' : o.ocStatus === 'PARCIAL' ? '#fffbeb' : 'white' }}>
                      <td style={{ ...TD, fontSize: 10, color: '#64748b', whiteSpace: 'nowrap' }}>{o.dataPrevista}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>{o.oc || '—'}</td>
                      <td style={{ ...TD, fontSize: 10, color: '#64748b', maxWidth: 120 }}>{truncate(o.nomeFornecedor, 20) || '—'}</td>
                      <td style={{ ...TD, fontFamily: 'monospace', color: '#475569', fontSize: 10 }}>{o.codProduto}</td>
                      <td style={{ ...TD, fontWeight: 600, maxWidth: 220 }}>{truncate(o.nomeProduto, 40)}</td>
                      <td style={{ ...TD, textAlign: 'right', color: o.saldoAtual === 0 ? '#dc2626' : '#334155', fontWeight: o.saldoAtual === 0 ? 800 : 400 }}>{o.saldoAtual.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{o.qtComprada.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right', color: o.qtRecebida > 0 ? '#059669' : '#94a3b8', fontWeight: o.qtRecebida > 0 ? 700 : 400 }}>{o.qtRecebida.toLocaleString('pt-BR')}</td>
                      <td style={{ ...TD, textAlign: 'right', fontWeight: 800, color: o.qtDiferenca > 0 ? '#d97706' : '#059669' }}>{o.qtDiferenca.toLocaleString('pt-BR')}</td>
                      <td style={TD}><OCBadge status={o.ocStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager total={ocFilt.length} page={pageOC} onChange={setPageOC} />
          </div>
        )}

        {/* ── TAB: ALERTAS ── */}
        {activeTab === 'alertas' && alertas && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'Ruptura s/ cobertura', value: alertas.rupturaSemCob.length, color: '#dc2626', bg: '#fef2f2', icon: '🚨' },
                { label: 'Críticos s/ OC',        value: alertas.criticoSemOC.length, color: '#ef4444', bg: '#fff1f2', icon: '🔴' },
                { label: 'OC não atendidas',       value: alertas.ocUrgentes.length,   color: '#d97706', bg: '#fefce8', icon: '📦' },
                { label: 'Lotes vencendo ≤90d',   value: alertas.lotesVenc.length,     color: '#f59e0b', bg: '#fffbeb', icon: '⏰' },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, borderRadius: 12, padding: '14px 16px', borderLeft: `4px solid ${s.color}` }}>
                  <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 4px' }}>{s.label}</p>
                  <p style={{ fontSize: 26, fontWeight: 900, color: s.color, margin: 0 }}>{s.icon} {s.value}</p>
                </div>
              ))}
            </div>

            {/* Ruptura sem cobertura */}
            {alertas.rupturaSemCob.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #fecaca', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#fef2f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color="#dc2626" />
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#dc2626', margin: 0 }}>🚨 Ruptura sem Cobertura — sem estoque e sem OC pendente ({alertas.rupturaSemCob.length})</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Cód.', 'Produto', 'Unidade', 'Estoque', 'Lotes'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {alertas.rupturaSemCob.slice(0, 20).map((p, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fef2f2' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>{p.id}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>{truncate(p.nome, 60)}</td>
                          <td style={{ ...TD, fontSize: 10, color: '#94a3b8' }}>{p.unidade}</td>
                          <td style={{ ...TD, fontWeight: 900, color: '#dc2626', textAlign: 'right' }}>0</td>
                          <td style={{ ...TD, textAlign: 'center', fontSize: 10, color: '#94a3b8' }}>{p.lotes.length > 0 ? `${p.lotes.length} lote(s)` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {alertas.rupturaSemCob.length > 20 && <p style={{ textAlign: 'center', fontSize: 10, color: '#94a3b8', padding: '10px 0' }}>+ {alertas.rupturaSemCob.length - 20} produtos não exibidos</p>}
              </div>
            )}

            {/* Críticos sem OC */}
            {alertas.criticoSemOC.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #fecaca', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#fff1f2', borderBottom: '1px solid #fecaca', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} color="#ef4444" />
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#ef4444', margin: 0 }}>🔴 Itens Críticos sem Reposição em OC ({alertas.criticoSemOC.length})</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Cód.', 'Produto', 'Saldo', 'Média', 'Projeção', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {alertas.criticoSemOC.map((c, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fff1f2' }}>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>{c.id}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>{truncate(c.nome, 55)}</td>
                          <td style={{ ...TD, fontWeight: 800, color: '#dc2626', textAlign: 'right' }}>{c.saldo.toLocaleString('pt-BR')}</td>
                          <td style={{ ...TD, textAlign: 'right', color: '#64748b' }}>{c.media.toFixed(1)}</td>
                          <td style={{ ...TD, fontWeight: 800, color: '#dc2626', textAlign: 'right' }}>{c.proj > 0 ? c.proj.toFixed(1) + 'd' : '—'}</td>
                          <td style={TD}><StatusBadge status={c.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* OC urgentes */}
            {alertas.ocUrgentes.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #fde68a', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#fefce8', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShoppingCart size={16} color="#d97706" />
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#d97706', margin: 0 }}>📦 OC Não Atendidas — produto zerado aguardando entrega ({alertas.ocUrgentes.length})</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Data', 'OC', 'Produto', 'Qt. Comp.', 'Qt. Rec.', 'Diferença', 'Status'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {alertas.ocUrgentes.map((o, i) => (
                        <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fffbeb' }}>
                          <td style={{ ...TD, fontSize: 10, color: '#64748b' }}>{o.dataPrevista}</td>
                          <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10 }}>{o.oc || '—'}</td>
                          <td style={{ ...TD, fontWeight: 600 }}>{truncate(o.nomeProduto, 50)}</td>
                          <td style={{ ...TD, textAlign: 'right' }}>{o.qtComprada.toLocaleString('pt-BR')}</td>
                          <td style={{ ...TD, textAlign: 'right', color: '#94a3b8' }}>{o.qtRecebida.toLocaleString('pt-BR')}</td>
                          <td style={{ ...TD, fontWeight: 800, color: '#d97706', textAlign: 'right' }}>{o.qtDiferenca.toLocaleString('pt-BR')}</td>
                          <td style={TD}><OCBadge status={o.ocStatus} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lotes vencendo */}
            {alertas.lotesVenc.length > 0 && (
              <div style={{ background: 'white', borderRadius: 16, border: '1px solid #fde68a', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: '#fffbeb', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={16} color="#d97706" />
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#d97706', margin: 0 }}>⏰ Produtos com Lotes Vencendo ≤90 dias ({alertas.lotesVenc.length})</p>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Cód.', 'Produto', 'Estoque', 'Próx. Vencimento', 'Dias', 'Urgência'].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                    <tbody>
                      {alertas.lotesVenc.map((p, i) => {
                        const vencLote = p.lotes.find(l => l.diasVenc === p.menorDiasVenc);
                        return (
                          <tr key={i} style={{ background: p.menorDiasVenc <= 30 ? '#fef2f2' : p.menorDiasVenc <= 60 ? '#fff7ed' : '#fffbeb' }}>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 10, color: '#475569' }}>{p.id}</td>
                            <td style={{ ...TD, fontWeight: 600 }}>{truncate(p.nome, 55)}</td>
                            <td style={{ ...TD, textAlign: 'right' }}>{p.estoque.toLocaleString('pt-BR')}</td>
                            <td style={{ ...TD, fontWeight: 700, color: '#334155' }}>{vencLote?.validade || '—'}</td>
                            <td style={{ ...TD, fontWeight: 900, textAlign: 'right', color: p.menorDiasVenc <= 30 ? '#dc2626' : p.menorDiasVenc <= 60 ? '#ea580c' : '#d97706' }}>{p.menorDiasVenc}d</td>
                            <td style={TD}>
                              {p.menorDiasVenc <= 30
                                ? <span style={{ background: '#fef2f2', color: '#dc2626', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>⚠ Urgente</span>
                                : p.menorDiasVenc <= 60
                                  ? <span style={{ background: '#fff7ed', color: '#ea580c', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Atenção</span>
                                  : <span style={{ background: '#fefce8', color: '#d97706', padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800 }}>Monitorar</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {alertas.rupturaSemCob.length === 0 && alertas.criticoSemOC.length === 0 && alertas.ocUrgentes.length === 0 && alertas.lotesVenc.length === 0 && (
              <div style={{ background: 'white', borderRadius: 16, padding: 40, textAlign: 'center', border: '1px solid #f1f5f9' }}>
                <CheckCircle size={40} color="#10b981" style={{ margin: '0 auto 12px' }} />
                <p style={{ fontSize: 16, fontWeight: 800, color: '#059669', margin: '0 0 6px' }}>Nenhum alerta crítico detectado</p>
                <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Todos os indicadores estão dentro dos parâmetros normais</p>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};
