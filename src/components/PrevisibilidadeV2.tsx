import React, { useState, useMemo, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

// ─── THEME ───────────────────────────────────────────────────────────────────
const T = {
  bg: '#f8fafc', card: '#ffffff', text: '#0f172a', text2: '#64748b', text3: '#94a3b8',
  border: '#e2e8f0', border2: '#f1f5f9', input: '#f8fafc', rowAlt: '#f8fafc',
};
const card: React.CSSProperties = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: 22, boxShadow: '0 1px 4px #0000000a' };

// ─── TYPES ────────────────────────────────────────────────────────────────────
type EstoqueItem = { codigo: string; nome: string; unidade: string; estoque: number };
type SolicPendente = { solicitacao: string; data: string; tipo: string; atendimento: string; paciente: string };
type ItemSolicitado = { atendimento: string; solicitacao: string; data: string; codProduto: string; nomeProduto: string; unidade: string; qtdSolicitada: number; qtdAtendida: number; saldo: number };
type Equivalencias = Record<string, string[]>;
type Cobertura = 'total' | 'parcial' | 'sem_estoque';
type EquivInfo = { codigo: string; nome: string; estoqueDisp: number };
type ItemCruzado = ItemSolicitado & {
  estoqueAtual: number; cobertura: Cobertura;
  coberturaEquiv: boolean; equivDisp: EquivInfo[];
  solicPendente: boolean;
};
type Meta = { estoqueId: string; estoqueNome: string; unidId: string; unidNome: string; setorId: string; setorNome: string };

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function parseCSVLine(line: string): string[] {
  const res: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  res.push(cur.trim());
  return res;
}
function parseBR(s: string) { return parseFloat((s || '').replace(/"/g, '').replace(',', '.')) || 0; }
function fmtNum(n: number) { return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); }

// ─── PARSERS ─────────────────────────────────────────────────────────────────
function parseEstoque(text: string): EstoqueItem[] {
  const items: EstoqueItem[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r/g, '');
    const p = parseCSVLine(line);
    const cod = p[1]?.trim();
    const nome = p[2]?.trim();
    if (!cod || !/^\d+$/.test(cod) || !nome || nome === 'Produto') continue;
    if (seen.has(cod)) continue;
    seen.add(cod);
    items.push({ codigo: cod, nome, unidade: p[4]?.trim() || '', estoque: parseBR(p[6] || '0') });
  }
  return items;
}

function parseSolicitacoes(text: string): { meta: Meta; solics: SolicPendente[] } {
  const meta: Meta = { estoqueId: '', estoqueNome: '', unidId: '', unidNome: '', setorId: '', setorNome: '' };
  const solics: SolicPendente[] = [];
  const seen = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r/g, '');
    const p = parseCSVLine(line);
    if (p[1]?.includes('Estoque')) { meta.estoqueId = p[3]?.trim() || ''; meta.estoqueNome = p[5]?.trim() || ''; }
    if (p[1]?.includes('Unid'))    { meta.unidId    = p[3]?.trim() || ''; meta.unidNome    = p[5]?.trim() || ''; }
    if (p[1]?.includes('Setor'))   { meta.setorId   = p[3]?.trim() || ''; meta.setorNome   = p[5]?.trim() || ''; }
    const solic = p[0]?.trim();
    if (!solic || !/^\d{8,}$/.test(solic)) continue;
    if (seen.has(solic)) continue;
    seen.add(solic);
    const tipo     = p[6]?.trim() && p[6].trim() !== '' ? p[6].trim() : p[8]?.trim() || '';
    const atend    = p[6]?.trim() && p[6].trim() !== '' ? p[7]?.trim() : p[9]?.trim() || '';
    const paciente = p[6]?.trim() && p[6].trim() !== '' ? p[8]?.trim() : p[10]?.trim() || '';
    solics.push({ solicitacao: solic, data: p[4]?.trim() || '', tipo, atendimento: atend, paciente });
  }
  return { meta, solics };
}

function parseItens(text: string): ItemSolicitado[] {
  const items: ItemSolicitado[] = [];
  let pending: Partial<ItemSolicitado> | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r/g, '');
    const p = parseCSVLine(line);
    const atend = p[1]?.trim();
    const solic  = p[3]?.trim();
    if (atend && /^\d{7,}$/.test(atend) && solic && /^\d+$/.test(solic)) {
      const prodText = p[6]?.trim() || '';
      const cm = prodText.match(/^(\d+)\s*-\s*/);
      pending = {
        atendimento: atend, solicitacao: solic, data: p[4]?.trim() || '',
        codProduto: cm ? cm[1] : '',
        nomeProduto: cm ? prodText.replace(cm[0], '').trim() : prodText,
        unidade: p[7]?.trim() || '',
        qtdSolicitada: parseBR(p[9] || '0'),
        qtdAtendida:   parseBR(p[11] || '0'),
        saldo: 0,
      };
    } else if (pending) {
      const saldoStr = [...p].reverse().find(v => v && v !== '' && /[\d]/.test(v));
      if (saldoStr !== undefined) {
        pending.saldo = parseBR(saldoStr);
        items.push(pending as ItemSolicitado);
        pending = null;
      }
    }
  }
  return items;
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, light, icon }: any) {
  return (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 4, boxShadow: '0 1px 4px #0000000a', borderTop: `3px solid ${color}` }}>
      <div style={{ background: light, borderRadius: 10, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "'Syne',sans-serif", letterSpacing: -1, marginTop: 6 }}>{typeof value === 'number' ? fmtNum(value) : value}</div>
      <div style={{ fontSize: 12, color: T.text2, fontWeight: 500 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color, fontWeight: 600 }}>{sub}</div>}
    </div>
  );
}

function CobBadge({ cob, equiv }: { cob: Cobertura; equiv: boolean }) {
  if (cob === 'total')   return <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✅ Coberto</span>;
  if (cob === 'parcial') return <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>⚠️ Parcial</span>;
  if (equiv)             return <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>🔄 Substituto</span>;
  return                        <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>❌ Sem Estoque</span>;
}

// ─── UPLOAD SCREEN ────────────────────────────────────────────────────────────
function UploadFile({ label, hint, file, onFile, color, optional }: { label: string; hint: string; file: File | null; onFile: (f: File) => void; color: string; optional?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, cursor: 'pointer' }}>
      <div style={{ background: file ? '#f0fdf4' : '#f8fafc', border: `2px dashed ${file ? '#22c55e' : '#cbd5e1'}`, borderRadius: 14, padding: '20px 24px', textAlign: 'center', transition: 'all .2s' }}>
        <div style={{ fontSize: 28, marginBottom: 6 }}>{file ? '✅' : '📂'}</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: file ? '#15803d' : T.text }}>{file ? file.name : label}</div>
        <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{hint}</div>
        {optional && !file && <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 4, fontWeight: 600 }}>OPCIONAL — usa equivalência global se vazio</div>}
        {file && <div style={{ fontSize: 11, color: '#15803d', marginTop: 4 }}>✓ Arquivo carregado</div>}
      </div>
      <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
    </label>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
type FileState = { estoque: File | null; solics: File | null; itens: File | null; equiv: File | null };
type DataState = { estoque: EstoqueItem[]; solics: SolicPendente[]; itens: ItemSolicitado[]; equiv: Equivalencias; meta: Meta } | null;

interface PrevisibilidadeV2Props {
  equivalenceMap?: Record<string, string[]>;
}

export function PrevisibilidadeV2({ equivalenceMap = {} }: PrevisibilidadeV2Props) {
  const [files, setFiles] = useState<FileState>({ estoque: null, solics: null, itens: null, equiv: null });
  const [data, setData] = useState<DataState>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'visao' | 'solics' | 'cruzamento' | 'equivalencia'>('visao');
  const [filtroCob, setFiltroCob] = useState<'todos' | 'total' | 'parcial' | 'sem_estoque' | 'equiv'>('todos');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [equivSearch, setEquivSearch] = useState('');
  const PAGE = 20;

  const setFile = useCallback((k: keyof FileState) => (f: File) => setFiles(prev => ({ ...prev, [k]: f })), []);

  const canProcess = files.estoque && files.solics && files.itens;

  const readFile = (f: File): Promise<string> =>
    new Promise(res => { const r = new FileReader(); r.onload = e => res((e.target as any).result); r.readAsText(f, 'ISO-8859-1'); });

  // Equivalência ativa = arquivo local se fornecido, senão mapa global
  const activeEquiv = useMemo((): Equivalencias => {
    if (!data) return equivalenceMap;
    const localEquiv = data.equiv;
    const hasLocal = Object.keys(localEquiv).length > 0;
    if (hasLocal) return localEquiv;
    return equivalenceMap;
  }, [data, equivalenceMap]);

  const equivSource = useMemo(() => {
    if (!data) return 'global';
    return Object.keys(data.equiv).length > 0 ? 'local' : 'global';
  }, [data]);

  const process = async () => {
    if (!canProcess) return;
    setLoading(true);
    try {
      const [t1, t2, t3] = await Promise.all([readFile(files.estoque!), readFile(files.solics!), readFile(files.itens!)]);
      const estoque = parseEstoque(t1);
      const { meta, solics } = parseSolicitacoes(t2);
      const itens = parseItens(t3);
      let equiv: Equivalencias = {};
      if (files.equiv) {
        const t4 = await readFile(files.equiv);
        // parse local equiv file
        for (const raw of t4.split('\n')) {
          const line = raw.replace(/\r/g, '').trim();
          if (!line) continue;
          const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
          const parts = line.split(sep).map((p: string) => p.trim()).filter((p: string) => /^\d+$/.test(p));
          if (parts.length < 2) continue;
          const id = parts[0];
          const sims = parts.slice(1);
          if (!equiv[id]) equiv[id] = [];
          sims.forEach((s: string) => { if (!equiv[id].includes(s)) equiv[id].push(s); });
        }
      }
      setData({ estoque, solics, itens, equiv, meta });
      setActiveTab('visao');
    } finally { setLoading(false); }
  };

  // ── CROSS-REFERENCE ──
  const cruzado = useMemo((): ItemCruzado[] => {
    if (!data) return [];
    const { estoque, solics, itens } = data;
    const estoqueMap: Record<string, EstoqueItem> = {};
    estoque.forEach(e => { estoqueMap[e.codigo] = e; });
    const solicPendSet = new Set(solics.map(s => s.solicitacao));

    return itens
      .filter(i => i.saldo > 0)
      .map(item => {
        const est = estoqueMap[item.codProduto];
        const estoqueAtual = est?.estoque || 0;
        let cobertura: Cobertura = 'sem_estoque';
        if (estoqueAtual >= item.saldo) cobertura = 'total';
        else if (estoqueAtual > 0) cobertura = 'parcial';

        // Equivalências disponíveis com info de estoque
        const equivCodes = activeEquiv[item.codProduto] || [];
        const equivDisp: EquivInfo[] = equivCodes
          .filter(ec => (estoqueMap[ec]?.estoque || 0) > 0)
          .map(ec => ({ codigo: ec, nome: estoqueMap[ec]?.nome || ec, estoqueDisp: estoqueMap[ec]?.estoque || 0 }));

        return {
          ...item, estoqueAtual, cobertura,
          coberturaEquiv: cobertura === 'sem_estoque' && equivDisp.length > 0,
          equivDisp,
          solicPendente: solicPendSet.has(item.solicitacao),
        };
      });
  }, [data, activeEquiv]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    const total    = cruzado.length;
    const cobTotal = cruzado.filter(i => i.cobertura === 'total').length;
    const parcial  = cruzado.filter(i => i.cobertura === 'parcial').length;
    const semEst   = cruzado.filter(i => i.cobertura === 'sem_estoque' && !i.coberturaEquiv).length;
    const viaEquiv = cruzado.filter(i => i.coberturaEquiv).length;
    const pctCob   = total > 0 ? ((cobTotal + parcial) / total * 100) : 0;
    const totalUniSalvas = cruzado.filter(i => i.coberturaEquiv).reduce((s, i) => s + i.saldo, 0);
    return { total, cobTotal, parcial, semEst, viaEquiv, pctCob, totalUniSalvas };
  }, [cruzado]);

  // ── PIE DATA ──
  const pieData = useMemo(() => [
    { name: '✅ Coberto',      value: kpis.cobTotal, color: '#22c55e' },
    { name: '⚠️ Parcial',     value: kpis.parcial,  color: '#f59e0b' },
    { name: '🔄 Substituto',   value: kpis.viaEquiv, color: '#f59e0b' },
    { name: '❌ Sem Estoque',  value: kpis.semEst,   color: '#ef4444' },
  ].filter(d => d.value > 0), [kpis]);

  // ── TOP SEM ESTOQUE ──
  const topSemEstoque = useMemo(() => {
    const map: Record<string, { nome: string; qtd: number; atendimentos: Set<string> }> = {};
    cruzado.filter(i => i.cobertura === 'sem_estoque' && !i.coberturaEquiv).forEach(i => {
      if (!map[i.codProduto]) map[i.codProduto] = { nome: i.nomeProduto, qtd: 0, atendimentos: new Set() };
      map[i.codProduto].qtd += i.saldo;
      map[i.codProduto].atendimentos.add(i.atendimento);
    });
    return Object.entries(map).map(([cod, v]) => ({ cod, nome: v.nome, qtd: v.qtd, atends: v.atendimentos.size }))
      .sort((a, b) => b.qtd - a.qtd).slice(0, 10);
  }, [cruzado]);

  // ── EQUIVALÊNCIA STATS ──
  const equivStats = useMemo(() => {
    const itensEquiv = cruzado.filter(i => i.coberturaEquiv);
    // produtos únicos que serviram de substituto
    const substitutosUsados = new Set<string>();
    itensEquiv.forEach(i => i.equivDisp.forEach(e => substitutosUsados.add(e.codigo)));
    // cobertura líquida: soma do estoque dos substitutos vs saldo pedido
    const totalSaldoPedido = itensEquiv.reduce((s, i) => s + i.saldo, 0);
    const totalEquivDisp = itensEquiv.reduce((s, i) => s + Math.max(...i.equivDisp.map(e => e.estoqueDisp), 0), 0);
    const pctCobertura = totalSaldoPedido > 0 ? Math.min(100, (totalEquivDisp / totalSaldoPedido) * 100) : 0;
    return { itensEquiv, substitutosUsados: substitutosUsados.size, totalSaldoPedido, totalEquivDisp, pctCobertura };
  }, [cruzado]);

  // ── FILTERED ROWS (cruzamento tab) ──
  const filteredRows = useMemo(() => {
    let r = cruzado;
    if (filtroCob === 'total')       r = r.filter(i => i.cobertura === 'total');
    if (filtroCob === 'parcial')     r = r.filter(i => i.cobertura === 'parcial');
    if (filtroCob === 'sem_estoque') r = r.filter(i => i.cobertura === 'sem_estoque' && !i.coberturaEquiv);
    if (filtroCob === 'equiv')       r = r.filter(i => i.coberturaEquiv);
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(i => i.nomeProduto.toLowerCase().includes(q) || i.codProduto.includes(q) || i.solicitacao.includes(q) || i.atendimento.includes(q));
    }
    return r;
  }, [cruzado, filtroCob, search]);

  // ── FILTERED EQUIVALÊNCIA ROWS ──
  const filteredEquivRows = useMemo(() => {
    let r = equivStats.itensEquiv;
    if (equivSearch.trim()) {
      const q = equivSearch.toLowerCase();
      r = r.filter(i => i.nomeProduto.toLowerCase().includes(q) || i.codProduto.includes(q) || i.solicitacao.includes(q) || i.equivDisp.some(e => e.nome.toLowerCase().includes(q)));
    }
    return r;
  }, [equivStats.itensEquiv, equivSearch]);

  const pagedRows = filteredRows.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filteredRows.length / PAGE);

  // ─── UPLOAD SCREEN ──
  if (!data) {
    const globalEquivCount = Object.keys(equivalenceMap).length;
    return (
      <div style={{ minHeight: '100vh', background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <div style={{ maxWidth: 700, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🔮</div>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 26, color: T.text }}>Previsibilidade V2</div>
            <div style={{ fontSize: 14, color: T.text2, marginTop: 6 }}>Cruzamento de estoque × solicitações pendentes × itens atendidos</div>
          </div>

          {/* Equivalência global banner */}
          {globalEquivCount > 0 ? (
            <div style={{ background: 'linear-gradient(135deg,#eff6ff,#dbeafe)', border: '1px solid #bfdbfe', borderRadius: 14, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>🔄</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1e40af' }}>Equivalência global carregada</div>
                <div style={{ fontSize: 12, color: '#3b82f6' }}>{fmtNum(globalEquivCount)} produtos mapeados via aba Equivalência — será usada automaticamente</div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 14, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#92400e' }}>Equivalência global não carregada</div>
                <div style={{ fontSize: 12, color: '#b45309' }}>Acesse a aba Equivalência para carregar o mapeamento global, ou envie um arquivo abaixo.</div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <UploadFile label="Estoque Atual (prev1)" hint="Exportação do estoque (.CSV)" file={files.estoque} onFile={setFile('estoque')} color="#22c55e" />
            <UploadFile label="Solicitações Pendentes (prev2)" hint="Lista de pendências (.CSV)" file={files.solics} onFile={setFile('solics')} color="#f59e0b" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
            <UploadFile label="Itens Sol. × Atendidos (prev3)" hint="Relatório de atendimento (.CSV)" file={files.itens} onFile={setFile('itens')} color="#6366f1" />
            <UploadFile label="Equivalência local (opcional)" hint="Substitui o mapeamento global" file={files.equiv} onFile={setFile('equiv')} color="#0284c7" optional />
          </div>
          <button onClick={process} disabled={!canProcess || loading}
            style={{ width: '100%', padding: '14px 0', borderRadius: 14, border: 'none', background: canProcess ? 'linear-gradient(135deg,#6366f1,#7c3aed)' : '#e2e8f0', color: canProcess ? '#fff' : T.text3, fontSize: 15, fontWeight: 800, cursor: canProcess ? 'pointer' : 'not-allowed', transition: 'all .2s', boxShadow: canProcess ? '0 4px 20px #6366f140' : 'none' }}>
            {loading ? '⏳ Processando...' : '🔮 Processar Previsibilidade'}
          </button>
        </div>
      </div>
    );
  }

  const { meta } = data;
  const TABS = [
    { id: 'visao',        label: '📊 Visão Geral' },
    { id: 'solics',       label: `⏳ Sol. Pendentes (${data.solics.length})` },
    { id: 'cruzamento',   label: `📦 Cruzamento (${cruzado.length})` },
    { id: 'equivalencia', label: `🔄 Substitutos (${kpis.viaEquiv})` },
  ] as const;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, fontFamily: "'DM Sans',sans-serif", color: T.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* HEADER */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${T.border}`, padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 8px #00000008' }}>
        <div>
          <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 17, color: T.text }}>🔮 Previsibilidade V2</div>
          <div style={{ fontSize: 12, color: T.text3 }}>
            {meta.estoqueId && `Est. ${meta.estoqueId} — ${meta.estoqueNome}`}
            {meta.setorNome && ` · ${meta.setorNome}`}
            <span style={{ marginLeft: 8, background: equivSource === 'global' ? '#dbeafe' : '#dcfce7', color: equivSource === 'global' ? '#1e40af' : '#15803d', borderRadius: 20, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
              🔄 equiv. {equivSource === 'global' ? 'global' : 'local'} ({fmtNum(Object.keys(activeEquiv).length)} produtos)
            </span>
          </div>
        </div>
        <button onClick={() => setData(null)} style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>↩ Trocar</button>
      </div>

      <div style={{ padding: '22px 28px', maxWidth: 1400, margin: '0 auto' }}>
        {/* TABS */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 26, background: '#f1f5f9', borderRadius: 12, padding: 4, width: 'fit-content', border: `1px solid ${T.border}` }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id as any)}
              style={{ background: activeTab === t.id ? '#fff' : 'transparent', border: `1px solid ${activeTab === t.id ? T.border : 'transparent'}`, color: activeTab === t.id ? T.text : T.text2, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', boxShadow: activeTab === t.id ? '0 1px 4px #00000010' : 'none', transition: 'all .15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── VISÃO GERAL ── */}
        {activeTab === 'visao' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
              <KPICard label="Itens Não Atendidos" value={kpis.total}    icon="📋" color="#6366f1" light="#ede9fe" sub={`de ${fmtNum(data.itens.length)} itens totais`} />
              <KPICard label="✅ Com Estoque"      value={kpis.cobTotal} icon="✅" color="#22c55e" light="#d1fae5" sub={`${kpis.total > 0 ? (kpis.cobTotal/kpis.total*100).toFixed(1) : 0}% do total`} />
              <KPICard label="⚠️ Parcial"          value={kpis.parcial}  icon="⚠️" color="#f59e0b" light="#fef3c7" sub="estoque insuficiente" />
              <KPICard label="❌ Sem Estoque"      value={kpis.semEst}   icon="❌" color="#ef4444" light="#fee2e2" sub="nem direto nem substituto" />
              <KPICard label="🔄 Com Substituto"   value={kpis.viaEquiv} icon="🔄" color="#f59e0b" light="#fef3c7" sub={`${fmtNum(kpis.totalUniSalvas)} uni. salvas`} />
              <KPICard label="Sol. Pendentes"      value={data.solics.length} icon="⏳" color="#7c3aed" light="#ede9ve" sub="aguardando atendimento" />
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Pie cobertura */}
              <div style={{ ...card }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 16 }}>🥧 Cobertura dos Itens Pendentes</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [fmtNum(v), 'Itens']} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {pieData.map((d, i) => (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: T.text2 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, display: 'inline-block' }} />
                      {d.name}: {fmtNum(d.value)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Top sem estoque */}
              <div style={{ ...card }}>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 16 }}>❌ Top Produtos Sem Estoque</div>
                {topSemEstoque.length === 0
                  ? <div style={{ color: T.text3, fontSize: 13 }}>Nenhum produto sem estoque.</div>
                  : <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={topSemEstoque.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} />
                        <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 9 }} tickFormatter={(v: string) => v.slice(0, 22) + (v.length > 22 ? '…' : '')} />
                        <Tooltip formatter={(v: any) => [fmtNum(v), 'Qtd pendente']} />
                        <Bar dataKey="qtd" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                }
              </div>
            </div>

            {/* Cobertura % card */}
            <div style={{ background: 'linear-gradient(135deg,#6366f1,#7c3aed)', borderRadius: 16, padding: '22px 28px', color: '#fff', display: 'flex', alignItems: 'center', gap: 24 }}>
              <div>
                <div style={{ fontSize: 42, fontWeight: 800, fontFamily: "'Syne',sans-serif" }}>{kpis.pctCob.toFixed(1)}%</div>
                <div style={{ fontSize: 14, opacity: 0.85 }}>taxa de cobertura total ou parcial</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ height: 12, background: '#ffffff30', borderRadius: 99, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${kpis.pctCob}%`, background: '#fff', borderRadius: 99, transition: 'width .5s' }} />
                </div>
                <div style={{ fontSize: 12, opacity: .8, marginTop: 8 }}>
                  {fmtNum(kpis.cobTotal + kpis.parcial)} itens com alguma cobertura de {fmtNum(kpis.total)} pendentes
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SOLICITAÇÕES PENDENTES ── */}
        {activeTab === 'solics' && (
          <div style={{ ...card }}>
            <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 14, color: T.text, marginBottom: 16 }}>
              ⏳ Solicitações Pendentes — {fmtNum(data.solics.length)} registros
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#1e293b' }}>
                    {['Solicitação', 'Data / Hora', 'Tipo', 'Atendimento', 'Paciente'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.solics.map((s, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border2}`, background: i % 2 === 0 ? T.rowAlt : '#fff' }}>
                      <td style={{ padding: '8px 12px', color: '#6366f1', fontWeight: 700 }}>{s.solicitacao}</td>
                      <td style={{ padding: '8px 12px', color: T.text2, whiteSpace: 'nowrap' }}>{s.data}</td>
                      <td style={{ padding: '8px 12px', color: T.text2 }}>{s.tipo}</td>
                      <td style={{ padding: '8px 12px', color: '#0284c7', fontWeight: 600 }}>{s.atendimento || '—'}</td>
                      <td style={{ padding: '8px 12px', color: T.text, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={s.paciente}>{s.paciente || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── CRUZAMENTO ── */}
        {activeTab === 'cruzamento' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', padding: 4, borderRadius: 10 }}>
                {([
                  { id: 'todos',       label: `Todos (${cruzado.length})`,          color: '#64748b' },
                  { id: 'total',       label: `✅ Com Estoque (${kpis.cobTotal})`,   color: '#22c55e' },
                  { id: 'parcial',     label: `⚠️ Parcial (${kpis.parcial})`,       color: '#f59e0b' },
                  { id: 'sem_estoque', label: `❌ Sem Est. (${kpis.semEst})`,        color: '#ef4444' },
                  { id: 'equiv',       label: `🔄 Substituto (${kpis.viaEquiv})`,   color: '#f59e0b' },
                ] as const).map(f => (
                  <button key={f.id} onClick={() => { setFiltroCob(f.id); setPage(0); }}
                    style={{ background: filtroCob === f.id ? '#fff' : 'transparent', border: 'none', borderRadius: 7, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: filtroCob === f.id ? f.color : '#64748b', boxShadow: filtroCob === f.id ? '0 1px 4px #00000015' : 'none' }}>
                    {f.label}
                  </button>
                ))}
              </div>
              <input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="🔍  Produto, código, solicitação, atendimento..."
                style={{ flex: 1, minWidth: 240, background: '#f1f5f9', border: `1px solid ${T.border}`, borderRadius: 10, padding: '8px 13px', fontSize: 13, color: T.text, outline: 'none' }} />
              <div style={{ fontSize: 12, color: T.text3 }}>{filteredRows.length} itens</div>
            </div>

            {/* Tabela */}
            <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#1e293b' }}>
                      {['Atendimento', 'Solicitação', 'Data', 'Cód.', 'Produto', 'Qtd Sol.', 'Qtd Atend.', 'Saldo', 'Est. Atual', 'Cobertura', 'Substituto'].map(h => (
                        <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: h === 'Produto' || h === 'Substituto' ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedRows.map((row, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${T.border2}`, background: i % 2 === 0 ? T.rowAlt : '#fff', borderLeft: `3px solid ${row.cobertura === 'total' ? '#22c55e' : row.cobertura === 'parcial' ? '#f59e0b' : row.coberturaEquiv ? '#f59e0b' : '#ef4444'}` }}>
                        <td style={{ padding: '7px 12px', color: '#0284c7', fontWeight: 600, whiteSpace: 'nowrap' }}>{row.atendimento}</td>
                        <td style={{ padding: '7px 12px', color: '#6366f1', fontWeight: 700, whiteSpace: 'nowrap' }}>{row.solicitacao}</td>
                        <td style={{ padding: '7px 12px', color: T.text2, whiteSpace: 'nowrap' }}>{row.data}</td>
                        <td style={{ padding: '7px 12px', color: T.text3, fontSize: 11 }}>{row.codProduto}</td>
                        <td style={{ padding: '7px 12px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={row.nomeProduto}>{row.nomeProduto}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', color: '#6366f1', fontWeight: 700 }}>{row.qtdSolicitada}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center', color: '#059669', fontWeight: 700 }}>{row.qtdAtendida}</td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 20, padding: '2px 8px', fontWeight: 800 }}>{row.saldo}</span>
                        </td>
                        <td style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <span style={{ color: row.estoqueAtual >= row.saldo ? '#059669' : row.estoqueAtual > 0 ? '#d97706' : '#dc2626', fontWeight: 800 }}>{fmtNum(row.estoqueAtual)}</span>
                        </td>
                        <td style={{ padding: '7px 12px' }}><CobBadge cob={row.cobertura} equiv={row.coberturaEquiv} /></td>
                        <td style={{ padding: '7px 12px', maxWidth: 180 }}>
                          {row.equivDisp.length > 0 ? (
                            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '4px 8px' }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#92400e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={row.equivDisp[0].nome}>
                                {row.equivDisp[0].nome.slice(0, 25)}{row.equivDisp[0].nome.length > 25 ? '…' : ''}
                              </div>
                              <div style={{ fontSize: 10, color: '#b45309', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                📦 Saldo: {fmtNum(row.equivDisp[0].estoqueDisp)}{row.equivDisp.length > 1 ? ` +${row.equivDisp.length - 1}` : ''}
                              </div>
                            </div>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {pagedRows.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: T.text3 }}>Nenhum item encontrado.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderTop: `1px solid ${T.border}`, background: T.rowAlt }}>
                  <span style={{ fontSize: 12, color: T.text2 }}>Página {page + 1} de {totalPages} · {filteredRows.length} itens</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {([['«', 0], ['‹', page - 1], ['›', page + 1], ['»', totalPages - 1]] as [string, number][]).map(([l, t], idx) => {
                      const dis = t < 0 || t >= totalPages || t === page;
                      return <button key={idx} onClick={() => !dis && setPage(t)} disabled={dis} style={{ background: T.card, border: `1px solid ${T.border}`, color: dis ? T.text3 : T.text2, borderRadius: 6, padding: '4px 10px', fontSize: 13, cursor: dis ? 'not-allowed' : 'pointer' }}>{l}</button>;
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── EQUIVALÊNCIA / SUBSTITUTOS ── */}
        {activeTab === 'equivalencia' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Header banner */}
            <div style={{ background: equivSource === 'global' ? 'linear-gradient(135deg,#eff6ff,#dbeafe)' : 'linear-gradient(135deg,#f0fdf4,#dcfce7)', border: `1px solid ${equivSource === 'global' ? '#bfdbfe' : '#bbf7d0'}`, borderRadius: 14, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontSize: 28 }}>🔄</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: equivSource === 'global' ? '#1e40af' : '#15803d' }}>
                  Equivalência {equivSource === 'global' ? 'Global' : 'Local'} — {fmtNum(Object.keys(activeEquiv).length)} produtos mapeados
                </div>
                <div style={{ fontSize: 12, color: equivSource === 'global' ? '#3b82f6' : '#22c55e', marginTop: 2 }}>
                  {equivSource === 'global'
                    ? 'Dados carregados da aba Equivalência — compartilhados com o módulo Previsibilidade'
                    : 'Dados do arquivo local enviado nesta sessão'}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "'Syne',sans-serif", color: '#f59e0b' }}>{fmtNum(kpis.viaEquiv)}</div>
                <div style={{ fontSize: 11, color: T.text2 }}>itens com substituto</div>
              </div>
            </div>

            {equivStats.itensEquiv.length === 0 ? (
              <div style={{ ...card, textAlign: 'center', padding: 48 }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🔄</div>
                <div style={{ fontWeight: 700, color: T.text, marginBottom: 8 }}>
                  {Object.keys(activeEquiv).length === 0
                    ? 'Nenhuma equivalência disponível'
                    : 'Nenhum item salvo por substituto'}
                </div>
                <div style={{ fontSize: 13, color: T.text3 }}>
                  {Object.keys(activeEquiv).length === 0
                    ? 'Acesse a aba Equivalência para carregar o mapeamento, ou envie um arquivo ao reprocessar.'
                    : 'Todos os itens pendentes têm estoque direto ou não possuem substituto cadastrado.'}
                </div>
              </div>
            ) : (
              <>
                {/* KPI cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
                  <KPICard label="Itens c/ Substituto" value={kpis.viaEquiv} icon="🔄" color="#f59e0b" light="#fef3c7" sub="falta, mas tem equiv." />
                  <KPICard label="Uni. Pendentes Salvas" value={kpis.totalUniSalvas} icon="📦" color="#0284c7" light="#e0f2fe" sub="via produto substituto" />
                  <KPICard label="Substitutos Distintos" value={equivStats.substitutosUsados} icon="🏷️" color="#7c3aed" light="#ede9fe" sub="produtos únicos usados" />
                  <KPICard label="Cobertura p/ Subst." value={`${equivStats.pctCobertura.toFixed(0)}%`} icon="📊" color="#059669" light="#d1fae5" sub="estoque disp. vs saldo" />
                </div>

                {/* Barra de cobertura */}
                <div style={{ background: 'linear-gradient(135deg,#f59e0b,#d97706)', borderRadius: 14, padding: '18px 24px', color: '#fff', display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div>
                    <div style={{ fontSize: 36, fontWeight: 800, fontFamily: "'Syne',sans-serif" }}>{equivStats.pctCobertura.toFixed(0)}%</div>
                    <div style={{ fontSize: 12, opacity: 0.9 }}>cobertura estimada via substituto</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ height: 10, background: '#ffffff30', borderRadius: 99, overflow: 'hidden', marginBottom: 6 }}>
                      <div style={{ height: '100%', width: `${Math.min(100, equivStats.pctCobertura)}%`, background: '#fff', borderRadius: 99, transition: 'width .5s' }} />
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.85 }}>
                      Est. substituto disponível: {fmtNum(equivStats.totalEquivDisp)} uni. · Saldo pendente: {fmtNum(equivStats.totalSaldoPedido)} uni.
                    </div>
                  </div>
                </div>

                {/* Search */}
                <input value={equivSearch} onChange={e => setEquivSearch(e.target.value)}
                  placeholder="🔍  Buscar produto, código, substituto..."
                  style={{ background: '#f1f5f9', border: `1px solid ${T.border}`, borderRadius: 10, padding: '9px 14px', fontSize: 13, color: T.text, outline: 'none', width: '100%', boxSizing: 'border-box' }} />

                {/* Tabela de substitutos */}
                <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#1e293b' }}>
                        {['Atendimento', 'Solicitação', 'Produto Solicitado', 'Saldo', 'Substituto Disponível', 'Estoque Substituto', 'Cobre?'].map(h => (
                          <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: ['Produto Solicitado', 'Substituto Disponível'].includes(h) ? '#fff' : '#94a3b8', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEquivRows.map((row, i) => (
                        row.equivDisp.map((eq, ei) => (
                          <tr key={`${i}-${ei}`} style={{ borderBottom: `1px solid ${T.border2}`, background: ei === 0 ? (i % 2 === 0 ? '#fffbeb' : '#fff') : '#fffde7', borderLeft: '3px solid #f59e0b' }}>
                            {ei === 0 && (
                              <>
                                <td rowSpan={row.equivDisp.length} style={{ padding: '8px 12px', color: '#0284c7', fontWeight: 600, verticalAlign: 'top' }}>{row.atendimento}</td>
                                <td rowSpan={row.equivDisp.length} style={{ padding: '8px 12px', color: '#6366f1', fontWeight: 700, verticalAlign: 'top' }}>{row.solicitacao}</td>
                                <td rowSpan={row.equivDisp.length} style={{ padding: '8px 12px', fontWeight: 600, verticalAlign: 'top', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${row.codProduto} — ${row.nomeProduto}`}>
                                  <div style={{ fontSize: 11, color: T.text3 }}>{row.codProduto}</div>
                                  <div>{row.nomeProduto.slice(0, 32)}{row.nomeProduto.length > 32 ? '…' : ''}</div>
                                </td>
                                <td rowSpan={row.equivDisp.length} style={{ padding: '8px 12px', textAlign: 'center', verticalAlign: 'top' }}>
                                  <span style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 20, padding: '2px 8px', fontWeight: 800 }}>{row.saldo}</span>
                                </td>
                              </>
                            )}
                            <td style={{ padding: '8px 12px', maxWidth: 220 }}>
                              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 10px' }}>
                                <div style={{ fontSize: 11, color: T.text3 }}>{eq.codigo}</div>
                                <div style={{ fontWeight: 700, fontSize: 12, color: '#92400e' }} title={eq.nome}>{eq.nome.slice(0, 30)}{eq.nome.length > 30 ? '…' : ''}</div>
                              </div>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              <span style={{ fontWeight: 800, color: eq.estoqueDisp >= row.saldo ? '#059669' : '#d97706', fontSize: 13 }}>{fmtNum(eq.estoqueDisp)}</span>
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                              {eq.estoqueDisp >= row.saldo
                                ? <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>✅ Total</span>
                                : <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>⚠️ Parcial</span>
                              }
                            </td>
                          </tr>
                        ))
                      ))}
                      {filteredEquivRows.length === 0 && (
                        <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: T.text3 }}>Nenhum item encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PrevisibilidadeV2;
