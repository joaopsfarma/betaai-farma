/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Upload, AlertTriangle, Package, CheckCircle, XCircle,
  Search, RefreshCw, TrendingDown, BarChart3, Ban, AlertCircle, GitMerge, Download
} from 'lucide-react';
import { exportToPDF, PDF_COLORS } from '../utils/pdfExport';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie, ComposedChart, Line, Legend
} from 'recharts';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface CancelRow {
  estoque: string;
  motivo: string;
  motivoCod: string;
  codUI: string;
  nomeUI: string;
  setor: string;
  solicit: string;
  dataSolic: string;
  tipo: string;
  dataCancel: string;
  horaCancel: string; // HH:MM extraído de dataCancel
}

interface ProdutoRow {
  atendimento: string;
  solicit: string;
  data: string;
  codProd: string;
  nomeProd: string;
  unidade: string;
  qtSol: number;
  qtAtend: number;
  saldo: number;
  taxaAtend: number;
}

// ─── PARSERS ─────────────────────────────────────────────────────────────────
function parseBrNum(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function splitCSVLine(line: string): string[] {
  const r: string[] = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { r.push(cur); cur = ''; continue; }
    cur += ch;
  }
  r.push(cur);
  return r;
}

function parseCancel(text: string): CancelRow[] {
  const lines = text.split(/\r?\n/);
  const rows: CancelRow[] = [];
  let estoque = '';
  let motivo = '';
  let motivoCod = '';
  let pending: Partial<CancelRow> | null = null;

  for (const raw of lines) {
    const cols = raw.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (!cols.some(c => c)) continue;

    // ESTOQUE header
    if (cols[0] === 'ESTOQUE:') {
      const val = cols.find((c, i) => i > 0 && c && c.length > 1);
      if (val) estoque = val;
      pending = null;
      continue;
    }

    // MOTIVO CANCEL header
    if (cols[0] === 'MOTIVO CANCEL:' || cols[1] === 'MOTIVO CANCEL:') {
      const val = cols.find(c => /^\d+\s*-\s*/.test(c));
      if (val) {
        const m = val.match(/^(\d+)\s*-\s*(.+)/);
        motivoCod = m?.[1] || '';
        motivo = m?.[2]?.trim() || val;
      }
      pending = null;
      continue;
    }

    // Skip header/totals
    if (cols[0]?.includes('UNID') || cols.join('').includes('N\u00b0 Solicita') ||
        cols.join('').includes('Total Estoque') || cols.join('').includes('Total Geral') ||
        cols.join('').includes('N? Solicita')) continue;

    // Unit row: col[0] is 2-3 digit number
    if (/^\d{2,3}$/.test(cols[0])) {
      const codUI = cols[0];
      const nomeUI = cols[1]?.trim() || '';
      // Find setor (4-digit code)
      let setor = '';
      for (let i = 2; i < cols.length; i++) {
        if (/^\d{4}$/.test(cols[i])) {
          setor = `${cols[i]}${cols[i + 1] ? ' - ' + cols[i + 1].trim() : ''}`;
          break;
        }
      }
      // Find solicit (8-digit number starting with 5)
      const solicit = cols.find(c => /^5\d{7}$/.test(c)) || '';
      pending = { estoque, motivo, motivoCod, codUI, nomeUI, setor: setor.trim(), solicit };
      continue;
    }

    // Date row: col[0] empty, pending set
    if (!cols[0] && pending) {
      const joined = cols.join(',');
      // Captura data + hora opcionais: "16/03/2026 00:16" ou "16/03/2026"
      const datetimes = joined.match(/\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2})?/g) || [];
      // Find tipo solicitação
      const tipo = cols.find(c =>
        c.length > 5 && !/\d{2}\/\d{2}/.test(c) && !/^\d+$/.test(c)
      )?.trim() || '';

      const dt1 = datetimes[0] || '';
      const dt2 = datetimes[1] || datetimes[0] || '';
      // Separa data e hora do cancelamento
      const [cancelDate, cancelTime] = dt2.includes(' ') ? dt2.split(' ') : [dt2, ''];

      if (pending.solicit) {
        rows.push({
          ...(pending as CancelRow),
          dataSolic: dt1.split(' ')[0] || '',
          tipo,
          dataCancel: cancelDate,
          horaCancel: cancelTime,
        });
      }
      pending = null;
    }
  }
  return rows;
}

function parseProdutos(text: string): ProdutoRow[] {
  const lines = text.split(/\r?\n/);
  const rows: ProdutoRow[] = [];
  for (const raw of lines) {
    const cols = splitCSVLine(raw);
    // Product row: col[1] is 7-8 digit atendimento
    if (!cols[1] || !/^\d{7,8}$/.test(cols[1].trim())) continue;
    const produtoRaw = (cols[6] || '').trim();
    if (!produtoRaw) continue;
    const qtSol = parseBrNum(cols[9] || '');
    if (qtSol <= 0) continue;
    const qtAtend = parseBrNum(cols[11] || '');
    const saldo = Math.max(0, qtSol - qtAtend);
    const dashIdx = produtoRaw.indexOf(' - ');
    const codProd = dashIdx > 0 ? produtoRaw.substring(0, dashIdx) : '';
    const nomeProd = dashIdx > 0 ? produtoRaw.substring(dashIdx + 3) : produtoRaw;
    rows.push({
      atendimento: cols[1].trim(),
      solicit: cols[3]?.trim() || '',
      data: cols[4]?.trim() || '',
      codProd, nomeProd,
      unidade: (cols[7] || '').trim(),
      qtSol, qtAtend, saldo,
      taxaAtend: qtSol > 0 ? (qtAtend / qtSol) * 100 : 0,
    });
  }
  return rows;
}

function detectFile(text: string): 'cancelamentos' | 'produtos' | 'unknown' {
  const s = text.substring(0, 600).toLowerCase();
  if (s.includes('motivo cancel') || (s.includes('estoque:') && s.includes('solicit'))) return 'cancelamentos';
  if (s.includes('atendimento') && (s.includes('qt. solicitada') || s.includes('qt solicitada'))) return 'produtos';
  return 'unknown';
}

// ─── COLORS ──────────────────────────────────────────────────────────────────
const MOTIVO_COLORS = ['#7c3aed', '#dc2626', '#d97706', '#2563eb', '#059669', '#0891b2', '#db2777'];
const PIE_COLORS = ['#7c3aed', '#dc2626', '#d97706', '#2563eb', '#059669'];

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function CancelamentoV2() {
  const [cancelamentos, setCancelamentos] = useState<CancelRow[]>([]);
  const [produtos, setProdutos] = useState<ProdutoRow[]>([]);
  const [activeTab, setActiveTab] = useState<'cancelamentos' | 'produtos' | 'cruzamento'>('cancelamentos');
  const [searchCancel, setSearchCancel] = useState('');
  const [searchProd, setSearchProd] = useState('');
  const [filterMotivo, setFilterMotivo] = useState('todos');
  const [filterAtend, setFilterAtend] = useState<'todos' | 'atendido' | 'parcial' | 'nao_atendido'>('todos');
  const [sortProd, setSortProd] = useState<'deficit' | 'solicitado' | 'taxa'>('deficit');

  const processFile = useCallback((text: string) => {
    const type = detectFile(text);
    if (type === 'cancelamentos') setCancelamentos(parseCancel(text));
    else if (type === 'produtos') setProdutos(parseProdutos(text));
  }, []);

  const handleFiles = useCallback((files: FileList | File[]) => {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => processFile(e.target?.result as string);
      reader.readAsText(file, 'latin1');
    });
  }, [processFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const onInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  }, [handleFiles]);

  const reset = useCallback(() => {
    setCancelamentos([]); setProdutos([]);
    setSearchCancel(''); setSearchProd('');
    setFilterMotivo('todos'); setFilterAtend('todos');
  }, []);

  // ── Cancel stats ────────────────────────────────────────────────────────
  const cancelStats = useMemo(() => {
    if (!cancelamentos.length) return null;
    const byMotivo: Record<string, number> = {};
    cancelamentos.forEach(r => {
      const k = r.motivo || 'Não especificado';
      byMotivo[k] = (byMotivo[k] || 0) + 1;
    });
    const topMotivos = Object.entries(byMotivo)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({
        name: name.length > 40 ? name.substring(0, 40) + '…' : name,
        fullName: name, value
      }));

    const byUnidade: Record<string, number> = {};
    cancelamentos.forEach(r => {
      const k = r.nomeUI || r.codUI || 'N/I';
      byUnidade[k] = (byUnidade[k] || 0) + 1;
    });
    const topUnidades = Object.entries(byUnidade)
      .sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([name, value]) => ({
        name: name.length > 28 ? name.substring(0, 28) + '…' : name, value
      }));

    const byTipo: Record<string, number> = {};
    cancelamentos.forEach(r => { byTipo[r.tipo || 'N/I'] = (byTipo[r.tipo || 'N/I'] || 0) + 1; });
    const pieData = Object.entries(byTipo).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    const byDate: Record<string, number> = {};
    cancelamentos.forEach(r => {
      const d = r.dataCancel?.substring(0, 10);
      if (d) byDate[d] = (byDate[d] || 0) + 1;
    });
    const timeline = Object.entries(byDate).sort()
      .map(([date, count]) => ({ date: date.substring(0, 5), count }));

    const estoques = [...new Set(cancelamentos.map(r => r.estoque).filter(Boolean))];
    const motivos = [...new Set(cancelamentos.map(r => r.motivo).filter(Boolean))];

    return { total: cancelamentos.length, topMotivos, topUnidades, pieData, timeline, estoques, motivos, byMotivo };
  }, [cancelamentos]);

  // ── Produto stats ────────────────────────────────────────────────────────
  const prodStats = useMemo(() => {
    if (!produtos.length) return null;
    const totalSol = produtos.reduce((s, r) => s + r.qtSol, 0);
    const totalAtend = produtos.reduce((s, r) => s + r.qtAtend, 0);
    const taxaGeral = totalSol > 0 ? (totalAtend / totalSol) * 100 : 0;

    // Group by produto
    const byProd: Record<string, { qtSol: number; qtAtend: number; saldo: number; unidade: string; count: number }> = {};
    produtos.forEach(r => {
      if (!byProd[r.nomeProd]) byProd[r.nomeProd] = { qtSol: 0, qtAtend: 0, saldo: 0, unidade: r.unidade, count: 0 };
      byProd[r.nomeProd].qtSol += r.qtSol;
      byProd[r.nomeProd].qtAtend += r.qtAtend;
      byProd[r.nomeProd].saldo += r.saldo;
      byProd[r.nomeProd].count++;
    });

    const topSolicitados = Object.entries(byProd)
      .sort((a, b) => b[1].qtSol - a[1].qtSol).slice(0, 15)
      .map(([nome, d]) => ({
        name: nome.length > 30 ? nome.substring(0, 30) + '…' : nome,
        sol: d.qtSol, atend: d.qtAtend, saldo: d.saldo,
        taxa: d.qtSol > 0 ? Math.round(d.qtAtend / d.qtSol * 100) : 0,
      }));

    const topDeficit = Object.entries(byProd)
      .filter(([, d]) => d.saldo > 0)
      .sort((a, b) => b[1].saldo - a[1].saldo).slice(0, 15)
      .map(([nome, d]) => ({
        name: nome.length > 30 ? nome.substring(0, 30) + '…' : nome,
        saldo: d.saldo,
        taxa: d.qtSol > 0 ? Math.round(d.qtAtend / d.qtSol * 100) : 0,
      }));

    const totalComPendencia = Object.values(byProd).filter(d => d.saldo > 0).length;
    const totalZerados = Object.values(byProd).filter(d => d.qtAtend === 0 && d.qtSol > 0).length;
    const atendimentosUnicos = new Set(produtos.map(r => r.atendimento)).size;
    const solicitacoesUnicas = new Set(produtos.map(r => r.solicit)).size;

    // Taxa distribution for pie
    const taxaDist = [
      { name: '100%', value: 0 },
      { name: '50–99%', value: 0 },
      { name: '1–49%', value: 0 },
      { name: '0%', value: 0 },
    ];
    Object.values(byProd).forEach(d => {
      const t = d.qtSol > 0 ? d.qtAtend / d.qtSol * 100 : 0;
      if (t >= 100) taxaDist[0].value++;
      else if (t >= 50) taxaDist[1].value++;
      else if (t > 0) taxaDist[2].value++;
      else taxaDist[3].value++;
    });

    return { totalSol, totalAtend, taxaGeral, topSolicitados, topDeficit, totalComPendencia, totalZerados, atendimentosUnicos, solicitacoesUnicas, taxaDist, byProd };
  }, [produtos]);

  // ── Filtered tables ───────────────────────────────────────────────────────
  const filteredCancel = useMemo(() => {
    let rows = [...cancelamentos];
    if (filterMotivo !== 'todos') rows = rows.filter(r => r.motivo === filterMotivo);
    if (searchCancel.trim()) {
      const q = searchCancel.toLowerCase();
      rows = rows.filter(r =>
        r.nomeUI.toLowerCase().includes(q) ||
        r.setor.toLowerCase().includes(q) ||
        r.motivo.toLowerCase().includes(q) ||
        r.solicit.includes(q) ||
        r.tipo.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [cancelamentos, filterMotivo, searchCancel]);

  const filteredProd = useMemo(() => {
    // Aggregate by product first
    if (!prodStats) return [];
    let entries = (Object.entries(prodStats.byProd) as [string, { qtSol: number; qtAtend: number; saldo: number; unidade: string; count: number }][]).map(([nome, d]) => ({
      nome,
      qtSol: d.qtSol,
      qtAtend: d.qtAtend,
      saldo: d.saldo,
      unidade: d.unidade,
      count: d.count,
      taxa: d.qtSol > 0 ? Math.round(d.qtAtend / d.qtSol * 100) : 0,
    }));

    if (filterAtend === 'atendido') entries = entries.filter(e => e.saldo === 0);
    else if (filterAtend === 'parcial') entries = entries.filter(e => e.saldo > 0 && e.qtAtend > 0);
    else if (filterAtend === 'nao_atendido') entries = entries.filter(e => e.qtAtend === 0);

    if (searchProd.trim()) {
      const q = searchProd.toLowerCase();
      entries = entries.filter(e => e.nome.toLowerCase().includes(q));
    }

    if (sortProd === 'deficit') entries.sort((a, b) => b.saldo - a.saldo);
    else if (sortProd === 'solicitado') entries.sort((a, b) => b.qtSol - a.qtSol);
    else entries.sort((a, b) => a.taxa - b.taxa);

    return entries;
  }, [prodStats, filterAtend, searchProd, sortProd]);

  // ── Cruzamento ───────────────────────────────────────────────────────────
  const cruzamento = useMemo(() => {
    if (!cancelamentos.length || !produtos.length) return null;

    // Build map solicit → cancel info
    const cancelMap = new Map<string, CancelRow>();
    cancelamentos.forEach(r => { if (r.solicit) cancelMap.set(r.solicit, r); });

    // Find produtos whose solicit appears in cancelados
    type Enriched = ProdutoRow & { cancel: CancelRow };
    const enriched: Enriched[] = produtos
      .filter(r => cancelMap.has(r.solicit))
      .map(r => ({ ...r, cancel: cancelMap.get(r.solicit)! }));

    if (!enriched.length) return { total: 0, totalUnidades: 0, uniqueProds: 0, uniqueSolicits: 0, topProdutos: [], topMotivos: [], enriched: [] as Enriched[], searchFiltered: [] as Enriched[] };

    // Aggregate by produto
    const byProd: Record<string, { unidades: number; motivos: Set<string>; count: number; unidade: string }> = {};
    enriched.forEach(r => {
      if (!byProd[r.nomeProd]) byProd[r.nomeProd] = { unidades: 0, motivos: new Set(), count: 0, unidade: r.unidade };
      byProd[r.nomeProd].unidades += r.qtSol;
      byProd[r.nomeProd].motivos.add(r.cancel.motivo);
      byProd[r.nomeProd].count++;
    });

    // Aggregate by motivo
    const byMotivo: Record<string, { count: number; unidades: number; prods: Set<string> }> = {};
    enriched.forEach(r => {
      const m = r.cancel.motivo || 'N/I';
      if (!byMotivo[m]) byMotivo[m] = { count: 0, unidades: 0, prods: new Set() };
      byMotivo[m].count++;
      byMotivo[m].unidades += r.qtSol;
      byMotivo[m].prods.add(r.nomeProd);
    });

    // Aggregate by unidade
    const byUnidade: Record<string, { count: number; unidades: number }> = {};
    enriched.forEach(r => {
      const u = r.cancel.nomeUI || r.cancel.codUI || 'N/I';
      if (!byUnidade[u]) byUnidade[u] = { count: 0, unidades: 0 };
      byUnidade[u].count++;
      byUnidade[u].unidades += r.qtSol;
    });

    const topProdutos = (Object.entries(byProd) as [string, { unidades: number; motivos: Set<string>; count: number; unidade: string }][])
      .sort((a, b) => b[1].unidades - a[1].unidades).slice(0, 15)
      .map(([nome, d]) => ({
        name: nome.length > 30 ? nome.substring(0, 30) + '…' : nome,
        fullName: nome, unidades: d.unidades, count: d.count,
        motivos: d.motivos.size,
      }));

    const topMotivos = (Object.entries(byMotivo) as [string, { count: number; unidades: number; prods: Set<string> }][])
      .sort((a, b) => b[1].unidades - a[1].unidades)
      .map(([name, d]) => ({
        name: name.length > 42 ? name.substring(0, 42) + '…' : name,
        fullName: name, unidades: d.unidades, count: d.count, skus: d.prods.size,
      }));

    const topUnidades = (Object.entries(byUnidade) as [string, { count: number; unidades: number }][])
      .sort((a, b) => b[1].unidades - a[1].unidades).slice(0, 10)
      .map(([name, d]) => ({ name: name.length > 26 ? name.substring(0, 26) + '…' : name, unidades: d.unidades, count: d.count }));

    return {
      total: enriched.length,
      totalUnidades: enriched.reduce((s, r) => s + r.qtSol, 0),
      uniqueProds: Object.keys(byProd).length,
      uniqueSolicits: new Set(enriched.map(r => r.solicit)).size,
      topProdutos, topMotivos, topUnidades, enriched,
    };
  }, [cancelamentos, produtos]);

  const [searchCruz, setSearchCruz] = useState('');
  const [filterCruzMotivo, setFilterCruzMotivo] = useState('todos');

  const filteredCruz = useMemo(() => {
    if (!cruzamento?.enriched.length) return [];
    type Enriched = (typeof cruzamento.enriched)[0];
    let rows: Enriched[] = [...cruzamento.enriched];
    if (filterCruzMotivo !== 'todos') rows = rows.filter(r => r.cancel.motivo === filterCruzMotivo);
    if (searchCruz.trim()) {
      const q = searchCruz.toLowerCase();
      rows = rows.filter(r =>
        r.nomeProd.toLowerCase().includes(q) ||
        r.solicit.includes(q) ||
        r.cancel.nomeUI.toLowerCase().includes(q) ||
        r.cancel.motivo.toLowerCase().includes(q)
      );
    }
    return rows.sort((a, b) => b.qtSol - a.qtSol);
  }, [cruzamento, filterCruzMotivo, searchCruz]);

  // ── PDF Exports ──────────────────────────────────────────────────────────
  const exportCancelPDF = useCallback(() => {
    if (!filteredCancel.length || !cancelStats) return;
    const date = new Date().toLocaleDateString('pt-BR');
    exportToPDF({
      title: 'Cancelamento V2 — Solicitações Canceladas',
      subtitle: `${filteredCancel.length} cancelamentos · ${date}`,
      filename: `cancelamentos_${date.replace(/\//g, '-')}.pdf`,
      isLandscape: true,
      accentColor: PDF_COLORS.purple,
      kpis: [
        { label: 'Total Cancelamentos', value: String(cancelamentos.length),                              color: PDF_COLORS.purple },
        { label: 'Motivos Distintos',   value: String(cancelStats.motivos.length),                        color: PDF_COLORS.red    },
        { label: 'Unidades Afetadas',   value: String(new Set(cancelamentos.map(r => r.codUI)).size),     color: PDF_COLORS.amber  },
        { label: 'Setores Afetados',    value: String(new Set(cancelamentos.map(r => r.setor).filter(Boolean)).size), color: PDF_COLORS.slate },
      ],
      headers: ['#', 'Solicitação', 'Cód. UI', 'Unidade Internação', 'Setor', 'Motivo', 'Tipo', 'Dt. Solic.', 'Dt. Cancel.', 'Hora Cancel.'],
      data: filteredCancel.map((r, i) => [
        String(i + 1), r.solicit, r.codUI,
        r.nomeUI.length > 28 ? r.nomeUI.substring(0, 28) + '…' : r.nomeUI,
        r.setor.length > 24 ? r.setor.substring(0, 24) + '…' : r.setor,
        `${r.motivoCod} — ${r.motivo.length > 38 ? r.motivo.substring(0, 38) + '…' : r.motivo}`,
        r.tipo, r.dataSolic, r.dataCancel, r.horaCancel || '—',
      ]),
    });
  }, [filteredCancel, cancelStats, cancelamentos]);

  const exportProdPDF = useCallback(() => {
    if (!filteredProd.length || !prodStats) return;
    const date = new Date().toLocaleDateString('pt-BR');
    exportToPDF({
      title: 'Cancelamento V2 — Produtos Solicitados vs Atendidos',
      subtitle: `${filteredProd.length} SKUs · Taxa geral: ${prodStats.taxaGeral.toFixed(1)}% · ${date}`,
      filename: `produtos_atendidos_${date.replace(/\//g, '-')}.pdf`,
      isLandscape: true,
      accentColor: PDF_COLORS.emerald,
      kpis: [
        { label: 'Solicitações',      value: String(prodStats.solicitacoesUnicas),                                   color: PDF_COLORS.blue    },
        { label: 'Un. Solicitadas',   value: prodStats.totalSol.toLocaleString('pt-BR'),                             color: PDF_COLORS.purple  },
        { label: 'Un. Atendidas',     value: prodStats.totalAtend.toLocaleString('pt-BR'),                           color: PDF_COLORS.emerald },
        { label: 'Déficit Total',     value: (prodStats.totalSol - prodStats.totalAtend).toLocaleString('pt-BR'),    color: PDF_COLORS.red     },
        { label: 'Taxa Atendimento',  value: `${prodStats.taxaGeral.toFixed(1)}%`,                                   color: PDF_COLORS.amber   },
        { label: 'c/ Pendência',      value: String(prodStats.totalComPendencia),                                    color: PDF_COLORS.slate   },
      ],
      headers: ['#', 'Produto', 'Unidade', 'Solicitado', 'Atendido', 'Déficit', 'Taxa %', 'Status'],
      data: filteredProd.map((row, i) => {
        const taxa = row.taxa;
        const status = taxa >= 100 ? '100%' : taxa >= 50 ? 'Parcial' : taxa > 0 ? 'Baixo' : 'Zerado';
        return [
          String(i + 1),
          row.nome.length > 44 ? row.nome.substring(0, 44) + '…' : row.nome,
          row.unidade,
          row.qtSol.toLocaleString('pt-BR'),
          row.qtAtend.toLocaleString('pt-BR'),
          row.saldo > 0 ? row.saldo.toLocaleString('pt-BR') : '—',
          `${taxa}%`,
          status,
        ];
      }),
    });
  }, [filteredProd, prodStats]);

  const exportCruzPDF = useCallback(() => {
    if (!filteredCruz.length || !cruzamento) return;
    const date = new Date().toLocaleDateString('pt-BR');
    exportToPDF({
      title: 'Cancelamento V2 — Cruzamento Produtos × Solicitações Canceladas',
      subtitle: `${filteredCruz.length} itens · ${cruzamento.uniqueSolicits} solicitações · ${date}`,
      filename: `cruzamento_cancelamentos_${date.replace(/\//g, '-')}.pdf`,
      isLandscape: true,
      accentColor: PDF_COLORS.purple,
      kpis: [
        { label: 'Solicitações Cruzadas', value: String(cruzamento.uniqueSolicits),                         color: PDF_COLORS.purple  },
        { label: 'Itens Cancelados',      value: String(cruzamento.total),                                  color: PDF_COLORS.red     },
        { label: 'Unidades Impactadas',   value: cruzamento.totalUnidades.toLocaleString('pt-BR'),          color: PDF_COLORS.amber   },
        { label: 'SKUs Distintos',        value: String(cruzamento.uniqueProds),                            color: PDF_COLORS.blue    },
      ],
      headers: ['#', 'Produto', 'Unidade', 'Qtde', 'Solicitação', 'Unid. Internação', 'Motivo Cancelamento', 'Dt. Solic.', 'Dt. Cancel.'],
      data: filteredCruz.map((r, i) => [
        String(i + 1),
        r.nomeProd.length > 40 ? r.nomeProd.substring(0, 40) + '…' : r.nomeProd,
        r.unidade,
        r.qtSol.toLocaleString('pt-BR'),
        r.solicit,
        `${r.cancel.codUI} — ${r.cancel.nomeUI.length > 22 ? r.cancel.nomeUI.substring(0, 22) + '…' : r.cancel.nomeUI}`,
        `${r.cancel.motivoCod} — ${r.cancel.motivo.length > 36 ? r.cancel.motivo.substring(0, 36) + '…' : r.cancel.motivo}`,
        r.cancel.dataSolic,
        r.cancel.dataCancel,
      ]),
    });
  }, [filteredCruz, cruzamento]);

  const allLoaded = cancelamentos.length > 0 || produtos.length > 0;

  // ── Upload screen ────────────────────────────────────────────────────────
  if (!allLoaded) {
    return (
      <div className="space-y-6">
        <div className="text-center pt-4">
          <div className="inline-flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-full px-4 py-1.5 mb-4">
            <Ban className="w-3.5 h-3.5 text-violet-500" />
            <span className="text-xs font-bold text-violet-600 uppercase tracking-widest">Cancelamento V2</span>
          </div>
          <h2 className="text-3xl font-black text-slate-900 mb-2">Cancelamento V2</h2>
          <p className="text-sm text-slate-500 max-w-lg mx-auto">
            Importe os CSVs de cancelamentos e/ou produtos solicitados. Detecção automática de arquivos.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-2xl mx-auto">
          {[
            { label: 'Cancelamentos', desc: 'R_ESTAT_CANC_SOLIC.csv — motivos e unidades', icon: '🚫', done: false },
            { label: 'Produtos Atendidos', desc: 'R_PROD_SOLICITADO_ATEND.csv — solicita,ões vs entregas', icon: '📦', done: false },
          ].map(({ label, desc, icon }) => (
            <div key={label} className="border-2 border-violet-100 bg-violet-50 rounded-xl p-4 text-center">
              <span className="text-2xl">{icon}</span>
              <p className="text-xs font-black text-slate-700 mt-2">{label}</p>
              <p className="text-[10px] text-slate-400 mt-1">{desc}</p>
            </div>
          ))}
        </div>

        <div
          onDrop={onDrop} onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-slate-300 hover:border-violet-400 rounded-2xl p-12 text-center transition-colors cursor-pointer max-w-xl mx-auto"
          onClick={() => document.getElementById('cv2-input')?.click()}
        >
          <Upload className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="font-bold text-slate-600 mb-1">Arraste os CSVs aqui (1 ou 2 arquivos)</p>
          <p className="text-xs text-slate-400">Identificação automática pelo conteúdo</p>
          <button className="mt-4 bg-violet-500 hover:bg-violet-600 text-white text-xs font-bold px-5 py-2 rounded-lg transition-colors">
            Selecionar Arquivos
          </button>
          <input id="cv2-input" type="file" accept=".csv,.txt" multiple className="hidden" onChange={onInput} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-black text-slate-900">Cancelamento V2</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {cancelamentos.length > 0 && `${cancelamentos.length} cancelamentos`}
            {cancelamentos.length > 0 && produtos.length > 0 && ' · '}
            {produtos.length > 0 && `${new Set(produtos.map(r => r.solicit)).size} solicitações · ${produtos.length} itens`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === 'cancelamentos' && cancelamentos.length > 0 && (
            <button onClick={exportCancelPDF}
              className="flex items-center gap-1.5 text-xs text-white bg-violet-600 hover:bg-violet-700 transition-colors rounded-lg px-3 py-1.5 font-bold shadow-sm">
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
          )}
          {activeTab === 'produtos' && produtos.length > 0 && (
            <button onClick={exportProdPDF}
              className="flex items-center gap-1.5 text-xs text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg px-3 py-1.5 font-bold shadow-sm">
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
          )}
          {activeTab === 'cruzamento' && cruzamento && cruzamento.total > 0 && (
            <button onClick={exportCruzPDF}
              className="flex items-center gap-1.5 text-xs text-white bg-violet-600 hover:bg-violet-700 transition-colors rounded-lg px-3 py-1.5 font-bold shadow-sm">
              <Download className="w-3.5 h-3.5" />
              Exportar PDF
            </button>
          )}
          <label className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-violet-100 transition-colors">
            <Upload className="w-3.5 h-3.5" />
            Adicionar arquivo
            <input type="file" accept=".csv,.txt" multiple className="hidden" onChange={onInput} />
          </label>
          <button onClick={reset}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-violet-500 transition-colors border border-slate-200 hover:border-violet-300 rounded-lg px-3 py-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>
      </div>

      {/* ── Macro KPIs ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Cancelamentos', value: cancelamentos.length,
            color: '#7c3aed', bg: 'bg-violet-50',
            icon: <Ban className="w-3.5 h-3.5 text-violet-500" />,
            sub: cancelStats?.motivos.length ? `${cancelStats.motivos.length} motivos` : 'carregar CSV',
            show: true,
          },
          {
            label: 'Motivo Principal', value: cancelStats?.topMotivos[0]?.value ?? 0,
            color: '#dc2626', bg: 'bg-red-50',
            icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
            sub: cancelStats?.topMotivos[0]?.fullName
              ? (cancelStats.topMotivos[0].fullName.length > 28
                ? cancelStats.topMotivos[0].fullName.substring(0, 28) + '…'
                : cancelStats.topMotivos[0].fullName)
              : '—',
            show: true,
          },
          {
            label: 'Taxa de Atendimento', value: prodStats ? `${prodStats.taxaGeral.toFixed(1)}%` : '—',
            color: prodStats && prodStats.taxaGeral >= 90 ? '#059669' : prodStats && prodStats.taxaGeral >= 70 ? '#d97706' : '#dc2626',
            bg: 'bg-emerald-50',
            icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />,
            sub: prodStats ? `${prodStats.totalAtend.toLocaleString('pt-BR')} / ${prodStats.totalSol.toLocaleString('pt-BR')} un.` : 'carregar CSV',
            show: true,
          },
          {
            label: 'Itens c/ Déficit', value: prodStats?.totalComPendencia ?? 0,
            color: '#d97706', bg: 'bg-amber-50',
            icon: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />,
            sub: prodStats ? `${prodStats.totalZerados} não atendidos (0%)` : 'carregar CSV',
            show: true,
          },
        ].map(({ label, value, color, bg, icon, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="h-[3px] w-full" style={{ background: color }} />
            <div className="p-4">
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest leading-tight">{label}</span>
                <div className={`p-1.5 rounded-lg ${bg}`}>{icon}</div>
              </div>
              <p className="text-3xl font-black leading-none" style={{ color }}>{value}</p>
              <p className="text-[10px] text-slate-400 mt-2 leading-snug">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Inner Tabs ────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
        {([
          { id: 'cancelamentos', label: `Cancelamentos (${cancelamentos.length})`, icon: <Ban className="w-3.5 h-3.5" /> },
          { id: 'produtos', label: `Produtos Atendidos (${prodStats?.solicitacoesUnicas ?? 0} solicit.)`, icon: <Package className="w-3.5 h-3.5" /> },
          { id: 'cruzamento', label: `Cruzamento (${cruzamento?.uniqueSolicits ?? 0} solicit.)`, icon: <GitMerge className="w-3.5 h-3.5" /> },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all ${
              activeTab === t.id ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: CANCELAMENTOS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cancelamentos' && cancelamentos.length > 0 && (
        <div className="space-y-5">
          {/* KPIs cancelamentos */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Solicitações', value: cancelamentos.length, color: '#7c3aed', sub: 'canceladas' },
              { label: 'Motivos Distintos', value: cancelStats?.motivos.length ?? 0, color: '#dc2626', sub: 'tipos de cancelamento' },
              { label: 'Unidades Afetadas', value: new Set(cancelamentos.map(r => r.codUI)).size, color: '#d97706', sub: 'unidades de internação' },
              { label: 'Setores Afetados', value: new Set(cancelamentos.map(r => r.setor).filter(Boolean)).size, color: '#2563eb', sub: 'setores distintos' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2">{label}</p>
                <p className="text-3xl font-black" style={{ color }}>{value.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Charts row 1 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Por motivo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Cancelamentos por Motivo</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={cancelStats?.topMotivos} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(v: any) => [v, 'Cancelamentos']} labelFormatter={(l: any) => cancelStats?.topMotivos.find(m => m.name === l)?.fullName || l} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {cancelStats?.topMotivos.map((_, i) => (
                      <Cell key={i} fill={MOTIVO_COLORS[i % MOTIVO_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Por tipo de solicitação */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Por Tipo de Solicitação</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={cancelStats?.pieData} cx="50%" cy="50%" outerRadius={80}
                    dataKey="value" nameKey="name"
                    label={({ name, value, percent }) => percent > 0.05 ? `${name}: ${value}` : ''}>
                    {cancelStats?.pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Charts row 2 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top unidades */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top Unidades — Mais Cancelamentos</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={cancelStats?.topUnidades} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={190} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(v: any) => [v, 'Cancelamentos']} />
                  <Bar dataKey="value" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Timeline */}
            {cancelStats && cancelStats.timeline.length > 1 && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Timeline — Cancelamentos por Data</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={cancelStats.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <Tooltip />
                    <Bar dataKey="count" name="Cancelamentos" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="count" stroke="#dc2626" dot={false} strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Filtros + Tabela */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
                  <button onClick={() => setFilterMotivo('todos')}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterMotivo === 'todos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                    Todos ({cancelamentos.length})
                  </button>
                  {cancelStats?.topMotivos.slice(0, 4).map(m => (
                    <button key={m.fullName} onClick={() => setFilterMotivo(m.fullName)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${filterMotivo === m.fullName ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>
                      {m.name} ({m.value})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input type="text" placeholder="Buscar por unidade, setor, motivo, solicitação..."
                  value={searchCancel} onChange={e => setSearchCancel(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1" />
                <span className="text-xs text-slate-400 shrink-0">{filteredCancel.length} itens</span>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800">
                    <th className="text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                    <th className="text-left text-[11px] font-bold text-white px-3 py-3">Solicitação</th>
                    <th className="text-left text-[11px] font-bold text-white px-3 py-3">Unidade</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Setor</th>
                    <th className="text-left text-[11px] font-bold text-white px-3 py-3">Motivo</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Tipo</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Dt. Solic.</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Dt. Cancel.</th>
                    <th className="text-center text-[11px] font-bold text-red-400 px-3 py-3">Hora Cancel.</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCancel.slice(0, 400).map((row, i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                      style={{ borderLeft: `3px solid ${MOTIVO_COLORS[(cancelStats?.topMotivos.findIndex(m => m.fullName === row.motivo) ?? 0) % MOTIVO_COLORS.length]}` }}>
                      <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-600">{row.solicit}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 max-w-[160px]">
                        <p className="font-bold leading-snug">{row.codUI}</p>
                        <p className="text-[10px] text-slate-400 truncate">{row.nomeUI}</p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 max-w-[140px] truncate">{row.setor}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 max-w-[220px]">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 whitespace-nowrap">
                          {row.motivoCod} — {row.motivo.length > 36 ? row.motivo.substring(0, 36) + '…' : row.motivo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.tipo}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-400">{row.dataSolic}</td>
                      <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{row.dataCancel}</td>
                      <td className="px-3 py-2.5 text-center">
                        {row.horaCancel ? (
                          <span className="text-xs font-black font-mono text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                            {row.horaCancel}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredCancel.length > 400 && (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t">
                  Exibindo 400 de {filteredCancel.length} itens.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: PRODUTOS
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'produtos' && produtos.length > 0 && (
        <div className="space-y-5">
          {/* KPIs produtos */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Atendimentos', value: prodStats?.atendimentosUnicos ?? 0, color: '#64748b', sub: 'pacientes únicos' },
              { label: 'Solicitações', value: prodStats?.solicitacoesUnicas ?? 0, color: '#2563eb', sub: 'solicit. únicas' },
              { label: 'Un. Solicitadas', value: prodStats?.totalSol.toLocaleString('pt-BR') ?? 0, color: '#7c3aed', sub: 'unidades pedidas' },
              { label: 'Un. Atendidas', value: prodStats?.totalAtend.toLocaleString('pt-BR') ?? 0, color: '#059669', sub: 'unidades entregues' },
              { label: 'Déficit Total', value: ((prodStats?.totalSol ?? 0) - (prodStats?.totalAtend ?? 0)).toLocaleString('pt-BR'), color: '#dc2626', sub: 'unidades pendentes' },
            ].map(({ label, value, color, sub }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 overflow-hidden">
                <div className="h-[3px] w-full mb-3" style={{ background: color }} />
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">{label}</p>
                <p className="text-2xl font-black" style={{ color }}>{value}</p>
                <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
              </div>
            ))}
          </div>

          {/* Taxa de atendimento geral */}
          {prodStats && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Taxa de Atendimento Geral</h3>
                <span className="text-2xl font-black" style={{
                  color: prodStats.taxaGeral >= 90 ? '#059669' : prodStats.taxaGeral >= 70 ? '#d97706' : '#dc2626'
                }}>{prodStats.taxaGeral.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{
                  width: `${prodStats.taxaGeral}%`,
                  background: prodStats.taxaGeral >= 90 ? '#059669' : prodStats.taxaGeral >= 70 ? '#d97706' : '#dc2626'
                }} />
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-slate-400">
                <span>0%</span>
                <span className="text-slate-500 font-bold">{prodStats.totalAtend.toLocaleString('pt-BR')} atendidas de {prodStats.totalSol.toLocaleString('pt-BR')} solicitadas</span>
                <span>100%</span>
              </div>
            </div>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Top produtos solicitados */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 15 — Maior Volume Solicitado</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={prodStats?.topSolicitados} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(v: any, name: string) => [v.toLocaleString('pt-BR'), name === 'sol' ? 'Solicitado' : 'Atendido']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="sol" name="Solicitado" fill="#7c3aed" radius={[0, 2, 2, 0]} opacity={0.5} />
                  <Bar dataKey="atend" name="Atendido" fill="#059669" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top produtos com deficit */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 15 — Maior Déficit (Não Atendido)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={prodStats?.topDeficit} layout="vertical" margin={{ left: 8, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9 }} />
                  <YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 8 }} />
                  <Tooltip formatter={(v: any) => [v.toLocaleString('pt-BR'), 'Déficit']} />
                  <Bar dataKey="saldo" name="Déficit" radius={[0, 4, 4, 0]}>
                    {prodStats?.topDeficit.map((r, i) => (
                      <Cell key={i} fill={r.taxa < 30 ? '#dc2626' : r.taxa < 70 ? '#d97706' : '#2563eb'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição por taxa */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribuição por Taxa de Atendimento (SKUs)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={prodStats?.taxaDist.filter(d => d.value > 0)} cx="50%" cy="50%" outerRadius={80}
                    dataKey="value" nameKey="name"
                    label={({ name, value, percent }) => percent > 0.05 ? `${name}: ${value}` : ''}>
                    {prodStats?.taxaDist.map((_, i) => (
                      <Cell key={i} fill={['#059669', '#2563eb', '#d97706', '#dc2626'][i]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-slate-400 mt-2 text-center">
                Verde=100% · Azul=50–99% · Laranja=1–49% · Vermelho=0%
              </p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-3">Resumo de Atendimento</h3>
              <div className="space-y-3">
                {[
                  { label: '100% Atendidos', value: prodStats?.taxaDist[0].value ?? 0, color: '#059669', bg: 'bg-emerald-50', pct: ((prodStats?.taxaDist[0].value ?? 0) / Object.keys(prodStats?.byProd ?? {}).length * 100) },
                  { label: '50–99% Atendidos', value: prodStats?.taxaDist[1].value ?? 0, color: '#2563eb', bg: 'bg-blue-50', pct: ((prodStats?.taxaDist[1].value ?? 0) / Object.keys(prodStats?.byProd ?? {}).length * 100) },
                  { label: '1–49% Atendidos', value: prodStats?.taxaDist[2].value ?? 0, color: '#d97706', bg: 'bg-amber-50', pct: ((prodStats?.taxaDist[2].value ?? 0) / Object.keys(prodStats?.byProd ?? {}).length * 100) },
                  { label: '0% Atendidos', value: prodStats?.taxaDist[3].value ?? 0, color: '#dc2626', bg: 'bg-red-50', pct: ((prodStats?.taxaDist[3].value ?? 0) / Object.keys(prodStats?.byProd ?? {}).length * 100) },
                ].map(({ label, value, color, bg, pct }) => (
                  <div key={label} className={`${bg} rounded-lg p-3`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-700">{label}</span>
                      <span className="text-sm font-black" style={{ color }}>{value} SKUs</span>
                    </div>
                    <div className="h-1.5 bg-white rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{pct.toFixed(1)}% dos SKUs</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filtros + tabela produtos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                  {([
                    { id: 'todos', label: 'Todos' },
                    { id: 'atendido', label: '✅ 100%' },
                    { id: 'parcial', label: '⚠️ Parcial' },
                    { id: 'nao_atendido', label: '❌ Zerado' },
                  ] as const).map(f => (
                    <button key={f.id} onClick={() => setFilterAtend(f.id)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${filterAtend === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <select value={sortProd} onChange={e => setSortProd(e.target.value as any)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 bg-white outline-none">
                  <option value="deficit">Ordenar: Maior déficit</option>
                  <option value="solicitado">Ordenar: Mais solicitado</option>
                  <option value="taxa">Ordenar: Menor taxa atendimento</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input type="text" placeholder="Buscar produto..."
                  value={searchProd} onChange={e => setSearchProd(e.target.value)}
                  className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1" />
                <span className="text-xs text-slate-400 shrink-0">{filteredProd.length} produtos</span>
              </div>
            </div>

            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800">
                    <th className="text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                    <th className="text-left text-[11px] font-bold text-white px-3 py-3">Produto</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Unidade</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Solicitado</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 px-3 py-3">Atendido</th>
                    <th className="text-right text-[11px] font-bold text-amber-300 px-3 py-3">Déficit</th>
                    <th className="text-left text-[11px] font-bold text-white px-3 py-3 min-w-[130px]">Taxa</th>
                    <th className="text-center text-[11px] font-bold text-slate-400 px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProd.slice(0, 400).map((row, i) => {
                    const taxa = row.taxa;
                    const color = taxa >= 100 ? '#059669' : taxa >= 50 ? '#2563eb' : taxa > 0 ? '#d97706' : '#dc2626';
                    const badge = taxa >= 100 ? 'bg-emerald-100 text-emerald-700' : taxa >= 50 ? 'bg-blue-100 text-blue-700' : taxa > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
                    const statusLabel = taxa >= 100 ? '100%' : taxa >= 50 ? 'Parcial' : taxa > 0 ? 'Baixo' : 'Zerado';
                    return (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                        style={{ borderLeft: `3px solid ${color}` }}>
                        <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                        <td className="px-3 py-2.5 max-w-[260px]">
                          <p className="text-xs font-bold text-slate-700 leading-snug" title={row.nome}>
                            {row.nome.length > 42 ? row.nome.substring(0, 42) + '…' : row.nome}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{row.count} solicitações</p>
                        </td>
                        <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.unidade}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-mono text-slate-600">{row.qtSol.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-mono text-emerald-600">{row.qtAtend.toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-2.5 text-xs text-right font-black text-red-500">
                          {row.saldo > 0 ? row.saldo.toLocaleString('pt-BR') : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 min-w-[130px]">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min(taxa, 100)}%`, background: color }} />
                            </div>
                            <span className="text-[10px] font-black w-9 text-right" style={{ color }}>{taxa.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge}`}>{statusLabel}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredProd.length > 400 && (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t">
                  Exibindo 400 de {filteredProd.length} itens.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          TAB: CRUZAMENTO
      ══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'cruzamento' && (
        <>
          {(!cancelamentos.length || !produtos.length) ? (
            <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
              <GitMerge className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-400">Carregue os dois arquivos para cruzar</p>
              <p className="text-xs text-slate-400 mt-1">São necessários R_ESTAT_CANC_SOLIC.csv e R_PROD_SOLICITADO_ATEND.csv</p>
            </div>
          ) : cruzamento && cruzamento.total === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-amber-200 p-12 text-center">
              <AlertTriangle className="w-10 h-10 text-amber-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-500">Nenhuma solicitação em comum encontrada</p>
              <p className="text-xs text-slate-400 mt-1">Os números de solicitação dos dois arquivos não se cruzam.</p>
            </div>
          ) : cruzamento ? (
            <div className="space-y-5">

              {/* KPIs cruzamento */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Solicitações Cruzadas', value: cruzamento.uniqueSolicits, color: '#7c3aed', sub: 'canceladas com produto vinculado' },
                  { label: 'Itens Cancelados', value: cruzamento.total, color: '#dc2626', sub: 'linhas de produto' },
                  { label: 'Unidades Impactadas', value: cruzamento.totalUnidades.toLocaleString('pt-BR'), color: '#d97706', sub: 'unidades de produto canceladas' },
                  { label: 'SKUs Distintos', value: cruzamento.uniqueProds, color: '#2563eb', sub: 'produtos diferentes afetados' },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="h-[3px] w-full" style={{ background: color }} />
                    <div className="p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">{label}</p>
                      <p className="text-3xl font-black" style={{ color }}>{value}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Top produtos impactados */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top Produtos Cancelados — por Unidades</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={cruzamento.topProdutos} layout="vertical" margin={{ left: 8, right: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis dataKey="name" type="category" width={200} tick={{ fontSize: 8 }} />
                      <Tooltip
                        formatter={(v: any, n: string) => [n === 'unidades' ? v.toLocaleString('pt-BR') + ' un.' : v, n === 'unidades' ? 'Unidades canceladas' : 'Solicitações']}
                        labelFormatter={(l: any) => cruzamento.topProdutos.find(p => p.name === l)?.fullName || l}
                      />
                      <Bar dataKey="unidades" name="unidades" fill="#dc2626" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Impacto por motivo */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Impacto por Motivo de Cancelamento</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={cruzamento.topMotivos} layout="vertical" margin={{ left: 8, right: 50 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9 }} />
                      <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 8 }} />
                      <Tooltip
                        formatter={(v: any, n: string) => [v.toLocaleString('pt-BR'), n === 'unidades' ? 'Unidades' : 'Solicitações']}
                        labelFormatter={(l: any) => cruzamento.topMotivos.find(m => m.name === l)?.fullName || l}
                      />
                      <Legend wrapperStyle={{ fontSize: '10px' }} />
                      <Bar dataKey="unidades" name="Unidades" fill="#7c3aed" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="count" name="Solicitações" fill="#e2e8f0" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabela motivos resumo */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Resumo por Motivo de Cancelamento</h3>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800">
                      <th className="text-left text-[11px] font-bold text-white px-4 py-3">Motivo</th>
                      <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">Solicit.</th>
                      <th className="text-right text-[11px] font-bold text-amber-300 px-4 py-3">Unidades Canceladas</th>
                      <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">SKUs Afetados</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cruzamento.topMotivos.map((m, i) => (
                      <tr key={i} className={`border-b border-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50'}`}>
                        <td className="px-4 py-3 text-xs text-slate-700 max-w-[340px]">
                          <span className="font-bold">{m.fullName}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-right font-mono text-slate-500">{m.count}</td>
                        <td className="px-4 py-3 text-xs text-right font-black text-amber-700">{m.unidades.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-3 text-xs text-right font-mono text-slate-500">{m.skus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Filtros + Tabela detalhada */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Detalhamento: Produto × Solicitação Cancelada</h3>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
                      <button onClick={() => setFilterCruzMotivo('todos')}
                        className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all ${filterCruzMotivo === 'todos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                        Todos ({cruzamento.total})
                      </button>
                      {cruzamento.topMotivos.slice(0, 4).map(m => (
                        <button key={m.fullName} onClick={() => setFilterCruzMotivo(m.fullName)}
                          className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${filterCruzMotivo === m.fullName ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500'}`}>
                          {m.name} ({m.count})
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input type="text" placeholder="Buscar por produto, solicitação, unidade ou motivo..."
                      value={searchCruz} onChange={e => setSearchCruz(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1" />
                    <span className="text-xs text-slate-400 shrink-0">{filteredCruz.length} itens</span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-800">
                        <th className="text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                        <th className="text-left text-[11px] font-bold text-white px-3 py-3">Produto</th>
                        <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Unidade</th>
                        <th className="text-right text-[11px] font-bold text-amber-300 px-3 py-3">Qtde</th>
                        <th className="text-left text-[11px] font-bold text-white px-3 py-3">Solicitação</th>
                        <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Unid. Internação</th>
                        <th className="text-left text-[11px] font-bold text-white px-3 py-3">Motivo Cancelamento</th>
                        <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Dt. Solic.</th>
                        <th className="text-left text-[11px] font-bold text-slate-400 px-3 py-3">Dt. Cancel.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCruz.slice(0, 500).map((row, i) => (
                        <tr key={i} className="border-b border-slate-50 hover:bg-violet-50 transition-colors"
                          style={{ borderLeft: '3px solid #7c3aed' }}>
                          <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                          <td className="px-3 py-2.5 max-w-[220px]">
                            <p className="text-xs font-bold text-slate-700 leading-snug" title={row.nomeProd}>
                              {row.nomeProd.length > 38 ? row.nomeProd.substring(0, 38) + '…' : row.nomeProd}
                            </p>
                            {row.codProd && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.codProd}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-slate-500">{row.unidade}</td>
                          <td className="px-3 py-2.5 text-xs text-right font-black text-amber-700">{row.qtSol.toLocaleString('pt-BR')}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-slate-600">{row.solicit}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[140px]">
                            <p className="font-bold">{row.cancel.codUI}</p>
                            <p className="text-[10px] text-slate-400 truncate">{row.cancel.nomeUI}</p>
                          </td>
                          <td className="px-3 py-2.5 max-w-[200px]">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 whitespace-nowrap">
                              {row.cancel.motivoCod} — {row.cancel.motivo.length > 34 ? row.cancel.motivo.substring(0, 34) + '…' : row.cancel.motivo}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs font-mono text-slate-400">{row.cancel.dataSolic}</td>
                          <td className="px-3 py-2.5 text-xs font-mono text-red-500 font-bold">{row.cancel.dataCancel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredCruz.length > 500 && (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t">
                      Exibindo 500 de {filteredCruz.length} itens.
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {/* Empty state */}
      {activeTab === 'cancelamentos' && cancelamentos.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Ban className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">Arquivo de cancelamentos não carregado</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Adicionar arquivo" e selecione o R_ESTAT_CANC_SOLIC.csv</p>
        </div>
      )}
      {activeTab === 'produtos' && produtos.length === 0 && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-400">Arquivo de produtos não carregado</p>
          <p className="text-xs text-slate-400 mt-1">Clique em "Adicionar arquivo" e selecione o R_PROD_SOLICITADO_ATEND.csv</p>
        </div>
      )}
    </div>
  );
}
