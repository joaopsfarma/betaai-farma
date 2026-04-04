import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Utensils, Upload, CheckCircle, AlertTriangle, Download,
  ChevronDown, ChevronUp, Search, X, RefreshCw, Package,
  Clock, ShieldAlert,
} from 'lucide-react';
import Papa from 'papaparse';
import { usePersistentState } from '../hooks/usePersistentState';
import { exportNutricaoPDF } from '../utils/pdfExport';

// ── Types ──────────────────────────────────────────────────────────────────────

interface NutricaoLote {
  lote: string;
  validade: string;
  validadeDate: Date | null;
  diasParaVencer: number;
  quantidade: number;
  endereco: string;
}

export interface NutricaoProduto {
  produtoId: string;
  nome: string;
  unidade: string;
  estoqueAtual: number;
  lotes: NutricaoLote[];
  menorDias: number;
  menorValidade: string;
  status: 'URGENTE' | 'ATENCAO' | 'OK';
}

// ── Utils ──────────────────────────────────────────────────────────────────────

function parseDDMMYYYY(s: string): Date | null {
  const t = (s || '').trim();
  const p = t.split('/');
  if (p.length !== 3) return null;
  const d = +p[0], m = +p[1], y = +p[2];
  if (isNaN(d) || isNaN(m) || isNaN(y)) return null;
  return new Date(y, m - 1, d);
}

function diasAteVencer(date: Date | null): number {
  if (!date) return 9999;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function calcStatus(dias: number): NutricaoProduto['status'] {
  if (dias <= 30) return 'URGENTE';
  if (dias <= 60) return 'ATENCAO';
  return 'OK';
}

function parseNum(s: string): number {
  const c = (s || '').replace(/"/g, '').trim();
  if (!c) return 0;
  if (c.includes(',') && c.includes('.')) return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0;
  if (c.includes(',')) return parseFloat(c.replace(',', '.')) || 0;
  return parseFloat(c) || 0;
}

// Remove non-ASCII chars that jsPDF can't render (e.g. non-breaking space encoded as à)
function cleanStr(s: string): string {
  return s
    .replace(/[\u00c0-\u00ff]/g, c => {
      // Map common Latin-1 supplement to ASCII equivalents
      const map: Record<string, string> = {
        'à':'a','á':'a','â':'a','ã':'a','ä':'a','å':'a',
        'è':'e','é':'e','ê':'e','ë':'e',
        'ì':'i','í':'i','î':'i','ï':'i',
        'ò':'o','ó':'o','ô':'o','õ':'o','ö':'o',
        'ù':'u','ú':'u','û':'u','ü':'u',
        'ç':'c','ñ':'n','ý':'y',
        'À':'A','Á':'A','Â':'A','Ã':'A','Ä':'A',
        'È':'E','É':'E','Ê':'E',
        'Ì':'I','Í':'I','Î':'I',
        'Ò':'O','Ó':'O','Ô':'O','Õ':'O',
        'Ù':'U','Ú':'U','Û':'U',
        'Ç':'C','Ñ':'N',
      };
      return map[c] ?? ' ';
    })
    .replace(/[^\x20-\x7E]/g, ' ')   // replace remaining non-printable ASCII
    .replace(/\s+/g, ' ')
    .trim();
}

// ── CSV Parser ─────────────────────────────────────────────────────────────────

function parseNutricaoCSV(file: File): Promise<NutricaoProduto[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: false,
      complete(results) {
        try {
          const rows = results.data as string[][];

          // Find header row by scanning first 15 rows
          // The CSV has merged cells in Excel, so headers are at col N but
          // actual data is at col N+1 (except "Produto" which covers 3 merged cols)
          let headerIdx = -1;
          let colProdId = -1, colNome = -1, colUnidade = -1;
          let colEstoque = -1, colLote = -1, colValidade = -1;
          let colEst = -1, colQtd = -1;

          for (let i = 0; i < Math.min(15, rows.length); i++) {
            const row = rows[i];
            const hasLote = row.some(c => /^lote$/i.test((c || '').trim()));
            const hasValidade = row.some(c => /validade/i.test((c || '').trim()));
            if (hasLote && hasValidade) {
              headerIdx = i;
              row.forEach((cell, idx) => {
                const v = (cell || '').trim();
                // Data is always at headerCol+1 due to merged cells in Excel CSV export
                // "Produto" header covers cols 0,1,2 → produtoId at col 1, nome at col 2
                if (/^produto$/i.test(v) && colProdId === -1) { colProdId = idx + 1; colNome = idx + 2; }
                else if (/unidade/i.test(v) && colUnidade === -1) colUnidade = idx + 1;
                else if (/estoque\s*atual/i.test(v) && colEstoque === -1) colEstoque = idx + 1;
                else if (/^lote$/i.test(v) && colLote === -1) colLote = idx + 1;
                else if (/validade/i.test(v) && colValidade === -1) colValidade = idx + 1;
                else if (/^est\./i.test(v) && colEst === -1) colEst = idx + 1;
                else if (/^quantidade$/i.test(v) && colQtd === -1) colQtd = idx + 1;
              });
              break;
            }
          }

          if (headerIdx === -1 || colLote === -1 || colValidade === -1) {
            reject(new Error('Formato do CSV não reconhecido. Verifique se o arquivo é o "conf lote dieta.csv" correto.'));
            return;
          }

          const map = new Map<string, NutricaoProduto>();
          let lastId = '';

          for (let i = headerIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(c => !(c || '').trim())) continue;

            // Detect repeated header rows (e.g. every ~37 rows in this CSV).
            // The repeat headers can have different structure (one fewer separator col),
            // so we re-scan and update column indices on each occurrence.
            const rowHasLote = row.some(c => /^lote$/i.test((c || '').trim()));
            const rowHasVal  = row.some(c => /^validade$/i.test((c || '').trim()));
            if (rowHasLote && rowHasVal) {
              row.forEach((cell, idx) => {
                const v = (cell || '').trim();
                if (/^produto$/i.test(v))         { colProdId = idx + 1; colNome = idx + 2; }
                else if (/^unidade$/i.test(v))     colUnidade = idx + 1;
                else if (/estoque\s*atual/i.test(v)) colEstoque = idx + 1;
                else if (/^lote$/i.test(v))        colLote    = idx + 1;
                else if (/^validade$/i.test(v))    colValidade = idx + 1;
                else if (/^est\./i.test(v))        colEst     = idx + 1;
                else if (/^quantidade$/i.test(v))  colQtd     = idx + 1;
              });
              continue; // skip the header row itself
            }

            const rawId = colProdId !== -1 ? (row[colProdId] || '').trim() : '';
            const rawNome = colNome !== -1 ? (row[colNome] || '').trim() : '';
            const rawLote = colLote !== -1 ? (row[colLote] || '').trim() : '';
            const rawValidade = colValidade !== -1 ? (row[colValidade] || '').trim() : '';
            const rawQtd = colQtd !== -1 ? (row[colQtd] || '') : '';
            const rawEst = colEst !== -1 ? (row[colEst] || '').trim() : '';

            if (!rawLote && !rawValidade) continue;

            const isPrimary = !!rawId && /^\d+$/.test(rawId);

            if (isPrimary) {
              lastId = rawId;
              if (!map.has(rawId)) {
                const rawEstoque = colEstoque !== -1 ? (row[colEstoque] || '') : '';
                const unidade = colUnidade !== -1 ? (row[colUnidade] || '').trim() : '';
                map.set(rawId, {
                  produtoId: rawId,
                  nome: cleanStr(rawNome) || `Produto ${rawId}`,
                  unidade,
                  estoqueAtual: parseNum(rawEstoque),
                  lotes: [],
                  menorDias: 9999,
                  menorValidade: '',
                  status: 'OK',
                });
              } else {
                // Same product ID after a repeated header → name may have been split
                const existing = map.get(rawId)!;
                const cleaned = cleanStr(rawNome);
                if (cleaned && !existing.nome.includes(cleaned)) {
                  existing.nome = existing.nome + cleaned;
                }
              }
            }

            const targetId = lastId;
            if (!targetId || !map.has(targetId)) continue;

            if (rawLote) {
              const validadeDate = parseDDMMYYYY(rawValidade);
              const dias = diasAteVencer(validadeDate);
              const lote: NutricaoLote = {
                lote: rawLote,
                validade: rawValidade,
                validadeDate,
                diasParaVencer: dias,
                quantidade: parseNum(rawQtd),
                endereco: rawEst,
              };
              map.get(targetId)!.lotes.push(lote);
            }
          }

          // Post-process: compute menorDias, menorValidade, status
          const produtos: NutricaoProduto[] = [];
          map.forEach(p => {
            if (p.lotes.length === 0) return;
            const sorted = [...p.lotes].sort((a, b) => a.diasParaVencer - b.diasParaVencer);
            p.menorDias = sorted[0].diasParaVencer;
            p.menorValidade = sorted[0].validade;
            p.status = calcStatus(p.menorDias);
            // If estoqueAtual is 0, sum quantities from lotes as fallback
            if (p.estoqueAtual === 0) {
              p.estoqueAtual = p.lotes.reduce((s, l) => s + l.quantidade, 0);
            }
            produtos.push(p);
          });

          // Sort alphabetically
          produtos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
          resolve(produtos);
        } catch (err) {
          reject(err);
        }
      },
      error(err) {
        reject(new Error(err.message));
      },
    });
  });
}

// ── Status Badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: NutricaoProduto['status'] }) {
  if (status === 'URGENTE') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
        <ShieldAlert className="w-3 h-3" /> URGENTE
      </span>
    );
  }
  if (status === 'ATENCAO') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
        <AlertTriangle className="w-3 h-3" /> ATENÇÃO
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
      <CheckCircle className="w-3 h-3" /> OK
    </span>
  );
}

function DiasCell({ dias }: { dias: number }) {
  if (dias <= 0) return <span className="font-bold text-red-600">Vencido</span>;
  if (dias <= 30) return <span className="font-bold text-red-600">{dias}d</span>;
  if (dias <= 60) return <span className="font-bold text-amber-600">{dias}d</span>;
  return <span className="text-emerald-700">{dias}d</span>;
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, color,
}: {
  label: string; value: string | number; sub?: string;
  color: 'emerald' | 'red' | 'amber' | 'slate';
}) {
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
  };
  const valColors = {
    emerald: 'text-emerald-800',
    red: 'text-red-800',
    amber: 'text-amber-800',
    slate: 'text-slate-800',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valColors[color]}`}>{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PainelNutricao() {
  const [dados, setDados] = usePersistentState<NutricaoProduto[]>('logistica_farma_nutricao_data', []);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | 'URGENTE' | 'ATENCAO' | 'OK'>('TODOS');
  const [sortField, setSortField] = useState<'nome' | 'menorDias' | 'estoqueAtual'>('nome');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<'tabela' | 'alertas'>('tabela');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const result = await parseNutricaoCSV(file);
      if (result.length === 0) {
        setError('Nenhum produto encontrado no arquivo. Verifique o formato do CSV.');
      } else {
        setDados(result);
        setShowUpload(false);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao processar arquivo.');
    } finally {
      setLoading(false);
    }
  }, [setDados]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const kpis = useMemo(() => ({
    total: dados.length,
    urgente: dados.filter(p => p.menorDias <= 30).length,
    atencao: dados.filter(p => p.menorDias > 30 && p.menorDias <= 60).length,
    estoqueTotal: dados.reduce((s, p) => s + p.estoqueAtual, 0),
  }), [dados]);

  const displayData = useMemo(() => {
    let d = [...dados];
    if (statusFilter !== 'TODOS') d = d.filter(p => p.status === statusFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      d = d.filter(p => p.nome.toLowerCase().includes(q) || p.produtoId.includes(q));
    }
    d.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'nome') cmp = a.nome.localeCompare(b.nome, 'pt-BR');
      else if (sortField === 'menorDias') cmp = a.menorDias - b.menorDias;
      else cmp = b.estoqueAtual - a.estoqueAtual;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return d;
  }, [dados, searchTerm, statusFilter, sortField, sortDir]);

  const alertasData = useMemo(() =>
    [...dados]
      .filter(p => p.menorDias <= 60)
      .sort((a, b) => a.menorDias - b.menorDias),
    [dados]);

  const handleExportPDF = () => {
    exportNutricaoPDF(displayData, {
      total: displayData.length,
      urgente: displayData.filter(p => p.menorDias <= 30).length,
      atencao: displayData.filter(p => p.menorDias > 30 && p.menorDias <= 60).length,
      estoqueTotal: displayData.reduce((s, p) => s + p.estoqueAtual, 0),
    });
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown className="w-3 h-3 opacity-30" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const showUploadZone = dados.length === 0 || showUpload;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100">
            <Utensils className="w-6 h-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Painel da Nutrição</h1>
            <p className="text-sm text-slate-500">Controle de estoque e validade — Dietas Enterais</p>
          </div>
        </div>
        {dados.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowUpload(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              {showUpload ? 'Cancelar' : 'Substituir dados'}
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        )}
      </div>

      {/* Upload zone */}
      <AnimatePresence>
        {showUploadZone && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-emerald-300 rounded-xl bg-emerald-50 p-10 text-center cursor-pointer hover:bg-emerald-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleInputChange}
              />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-emerald-700 font-medium">Processando arquivo…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-10 h-10 text-emerald-500" />
                  <div>
                    <p className="font-semibold text-emerald-800">Clique ou arraste o arquivo CSV</p>
                    <p className="text-sm text-emerald-600 mt-1">conf lote dieta.csv</p>
                  </div>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                <X className="w-4 h-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Cards */}
      {dados.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Total de produtos" value={kpis.total} color="emerald" />
          <KPICard label="Vencendo em ≤30 dias" value={kpis.urgente} color="red" sub="Ação imediata" />
          <KPICard label="Vencendo em ≤60 dias" value={kpis.atencao} color="amber" sub="Monitorar" />
          <KPICard label="Estoque total" value={kpis.estoqueTotal.toLocaleString('pt-BR')} color="slate" sub="unidades" />
        </div>
      )}

      {/* Sub-tabs */}
      {dados.length > 0 && (
        <>
          <div className="flex gap-1 border-b border-slate-200">
            {(['tabela', 'alertas'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab === 'tabela' ? 'Tabela Geral' : `Alertas de Vencimento${alertasData.length > 0 ? ` (${alertasData.length})` : ''}`}
              </button>
            ))}
          </div>

          {/* ── TABELA ── */}
          {activeTab === 'tabela' && (
            <div className="space-y-4">
              {/* Search + filters */}
              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-48">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400"
                  />
                </div>
                {/* Status filter chips */}
                <div className="flex gap-1.5 flex-wrap">
                  {([
                    { key: 'TODOS', label: 'Todos', cls: 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200' },
                    { key: 'URGENTE', label: 'Urgente', cls: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200' },
                    { key: 'ATENCAO', label: 'Atenção', cls: 'bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200' },
                    { key: 'OK', label: 'OK', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200' },
                  ] as const).map(f => (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${f.cls} ${
                        statusFilter === f.key ? 'ring-2 ring-offset-1 ring-current' : ''
                      }`}
                    >
                      {f.label}
                      {f.key !== 'TODOS' && (
                        <span className="ml-1 opacity-60">
                          ({dados.filter(p => p.status === f.key).length})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th
                          className="text-left px-4 py-3 font-semibold cursor-pointer select-none hover:text-emerald-700"
                          onClick={() => toggleSort('nome')}
                        >
                          <span className="flex items-center gap-1">
                            Produto <SortIcon field="nome" />
                          </span>
                        </th>
                        <th className="text-center px-3 py-3 font-semibold">Unidade</th>
                        <th
                          className="text-right px-3 py-3 font-semibold cursor-pointer select-none hover:text-emerald-700"
                          onClick={() => toggleSort('estoqueAtual')}
                        >
                          <span className="flex items-center justify-end gap-1">
                            Estoque <SortIcon field="estoqueAtual" />
                          </span>
                        </th>
                        <th className="text-center px-3 py-3 font-semibold">Validade mais próxima</th>
                        <th
                          className="text-center px-3 py-3 font-semibold cursor-pointer select-none hover:text-emerald-700"
                          onClick={() => toggleSort('menorDias')}
                        >
                          <span className="flex items-center justify-center gap-1">
                            Dias <SortIcon field="menorDias" />
                          </span>
                        </th>
                        <th className="text-center px-3 py-3 font-semibold">Status</th>
                        <th className="text-center px-3 py-3 font-semibold">Lotes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayData.map((p, i) => {
                        const expanded = expandedIds.has(p.produtoId);
                        return (
                          <React.Fragment key={p.produtoId}>
                            <motion.tr
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.02 }}
                              className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                                p.status === 'URGENTE' ? 'bg-red-50/40' :
                                p.status === 'ATENCAO' ? 'bg-amber-50/40' : ''
                              }`}
                            >
                              <td className="px-4 py-3 font-medium text-slate-900 max-w-xs">
                                <div className="flex flex-col">
                                  <span>{p.nome}</span>
                                  <span className="text-xs text-slate-400 font-normal">#{p.produtoId}</span>
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center text-slate-600">{p.unidade}</td>
                              <td className="px-3 py-3 text-right font-semibold text-slate-800">
                                {p.estoqueAtual.toLocaleString('pt-BR')}
                              </td>
                              <td className="px-3 py-3 text-center text-slate-700">
                                <div className="flex items-center justify-center gap-1">
                                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                                  {p.menorValidade || '—'}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center">
                                <DiasCell dias={p.menorDias} />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <StatusBadge status={p.status} />
                              </td>
                              <td className="px-3 py-3 text-center">
                                <button
                                  onClick={() => toggleExpand(p.produtoId)}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                                >
                                  <Package className="w-3 h-3" />
                                  {p.lotes.length}
                                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                </button>
                              </td>
                            </motion.tr>

                            {/* Expanded lotes */}
                            <AnimatePresence>
                              {expanded && (
                                <motion.tr
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                >
                                  <td colSpan={7} className="px-6 pb-3 pt-0 bg-slate-50/70">
                                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="bg-slate-100 text-slate-500">
                                            <th className="text-left px-3 py-2 font-semibold">Lote</th>
                                            <th className="text-center px-3 py-2 font-semibold">Validade</th>
                                            <th className="text-center px-3 py-2 font-semibold">Dias</th>
                                            <th className="text-center px-3 py-2 font-semibold">Endereço</th>
                                            <th className="text-right px-3 py-2 font-semibold">Qtd.</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {p.lotes
                                            .slice()
                                            .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
                                            .map((l, li) => (
                                              <tr key={li} className="border-t border-slate-200">
                                                <td className="px-3 py-1.5 font-mono text-slate-700">{l.lote}</td>
                                                <td className="px-3 py-1.5 text-center text-slate-600">{l.validade}</td>
                                                <td className="px-3 py-1.5 text-center">
                                                  <DiasCell dias={l.diasParaVencer} />
                                                </td>
                                                <td className="px-3 py-1.5 text-center text-slate-600">{l.endereco || '—'}</td>
                                                <td className="px-3 py-1.5 text-right font-medium text-slate-800">
                                                  {l.quantidade.toLocaleString('pt-BR')}
                                                </td>
                                              </tr>
                                            ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </motion.tr>
                              )}
                            </AnimatePresence>
                          </React.Fragment>
                        );
                      })}
                      {displayData.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                            Nenhum produto encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
                  {displayData.length} produto{displayData.length !== 1 ? 's' : ''} exibido{displayData.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          )}

          {/* ── ALERTAS ── */}
          {activeTab === 'alertas' && (
            <div className="space-y-3">
              {alertasData.length === 0 ? (
                <div className="text-center py-16 text-slate-400">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 text-emerald-400" />
                  <p className="font-medium">Nenhum produto vencendo nos próximos 60 dias.</p>
                </div>
              ) : (
                alertasData.map((p, i) => (
                  <motion.div
                    key={p.produtoId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-xl border p-4 ${
                      p.status === 'URGENTE'
                        ? 'bg-red-50 border-red-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className={`font-semibold ${p.status === 'URGENTE' ? 'text-red-900' : 'text-amber-900'}`}>
                          {p.nome}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">#{p.produtoId} · {p.unidade} · Estoque: {p.estoqueAtual.toLocaleString('pt-BR')}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={`text-2xl font-bold ${p.status === 'URGENTE' ? 'text-red-700' : 'text-amber-700'}`}>
                            {p.menorDias <= 0 ? 'Vencido' : `${p.menorDias}d`}
                          </p>
                          <p className="text-xs text-slate-500">Validade: {p.menorValidade}</p>
                        </div>
                        <StatusBadge status={p.status} />
                      </div>
                    </div>
                    {/* Lotes list */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {p.lotes
                        .slice()
                        .sort((a, b) => a.diasParaVencer - b.diasParaVencer)
                        .map((l, li) => (
                          <span
                            key={li}
                            className={`text-xs px-2 py-1 rounded-md font-mono ${
                              l.diasParaVencer <= 30
                                ? 'bg-red-100 text-red-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}
                          >
                            {l.lote} · {l.validade} · {l.quantidade.toLocaleString('pt-BR')} un.
                          </span>
                        ))}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
