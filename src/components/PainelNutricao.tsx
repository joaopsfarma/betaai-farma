import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Utensils, Upload, CheckCircle, AlertTriangle, Download,
  Search, X, RefreshCw, Clock, ShieldAlert, Package,
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
  categoria: string;
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

function cleanStr(s: string): string {
  return s
    .replace(/[À-ÿ]/g, c => {
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
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── CSV Parser ─────────────────────────────────────────────────────────────────

function categorizarProduto(nome: string): string {
  const n = nome.toUpperCase();
  if (n.includes('DIETA') || n.includes('ENTERAL') || n.includes('ISOSOURCE') || n.includes('NOVASOURCE') || n.includes('TROPHIC') || n.includes('OSMOLITE') || n.includes('PEPTAMEN') || n.includes('JEVITY') || n.includes('NUTRISON') || n.includes('PLUMYCARE') || n.includes('SONDA') || n.includes('SURE C')) {
    return 'Dietas Enterais';
  }
  if (n.includes('SUPLEMENTO') || n.includes('ENSURE') || n.includes('NUTREN') || n.includes('FRESUBIN') || n.includes('CUBITAN') || n.includes('IMPACT') || n.includes('FORTINI') || n.includes('FORTIMEL') || n.includes('RESOURCE') || n.includes('SUSTAGEN') || n.includes('ORAL') || n.includes('GLUCERNA')) {
    return 'Suplementos';
  }
  if (n.includes('INFANTIL') || n.includes('APTAMIL') || n.includes('NAN ') || n.includes('NANCOMFORT') || n.includes('ALFARE') || n.includes('NEOCATE') || n.includes('INFATRINI') || n.includes('PREGOMIN') || n.includes('LEITE') || n.includes('FORMULA') || n.includes('MATERNO') || n.includes('ALFAMINO') || n.includes('NINHO')) {
    return 'Fórmulas Infantis';
  }
  if (n.includes('ESPESSANTE') || n.includes('THICKEN') || n.includes('FIBRA') || n.includes('FIBER') || n.includes('TCM') || n.includes('GLUTAMINA') || n.includes('WHEY') || n.includes('PROTEIN') || n.includes('MODULO') || n.includes('BIFIDO') || n.includes('PROBIOTICO') || n.includes('SIMBIOTICO') || n.includes('MALTODEXTRINA') || n.includes('CALORIA') || n.includes('CASEINATO')) {
    return 'Módulos e Espessantes';
  }
  return 'Outros / Diversos';
}

function parseNutricaoCSV(file: File): Promise<NutricaoProduto[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<string[]>(file, {
      header: false,
      skipEmptyLines: false,
      complete(results) {
        try {
          const rows = results.data as string[][];
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
              continue;
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
                  categoria: 'Outros / Diversos',
                });
              } else {
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

          const produtos: NutricaoProduto[] = [];
          map.forEach(p => {
            if (p.lotes.length === 0) return;
            const sorted = [...p.lotes].sort((a, b) => a.diasParaVencer - b.diasParaVencer);
            p.menorDias = sorted[0].diasParaVencer;
            p.menorValidade = sorted[0].validade;
            p.status = calcStatus(p.menorDias);
            p.categoria = categorizarProduto(p.nome);
            if (p.estoqueAtual === 0) {
              p.estoqueAtual = p.lotes.reduce((s, l) => s + l.quantidade, 0);
            }
            produtos.push(p);
          });

          // Sort alphabetically by name
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

// ── Urgency bar ────────────────────────────────────────────────────────────────

function UrgencyBar({ dias }: { dias: number }) {
  const pct = dias <= 0 ? 100 : Math.min(100, Math.round((dias / 30) * 100));
  const color = dias <= 0 ? 'bg-red-600' : dias <= 10 ? 'bg-red-500' : dias <= 20 ? 'bg-orange-500' : 'bg-amber-400';
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-200 mt-2">
      <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ── KPI Card ───────────────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color, icon }: {
  label: string; value: string | number; sub?: string;
  color: 'emerald' | 'red' | 'amber' | 'slate';
  icon?: React.ReactNode;
}) {
  const colors = {
    emerald: 'bg-emerald-50 border-emerald-200',
    red:     'bg-red-50 border-red-200',
    amber:   'bg-amber-50 border-amber-200',
    slate:   'bg-slate-50 border-slate-200',
  };
  const valColors = {
    emerald: 'text-emerald-800',
    red:     'text-red-700',
    amber:   'text-amber-700',
    slate:   'text-slate-800',
  };
  return (
    <div className={`rounded-2xl border p-5 ${colors[color]} flex items-start gap-4`}>
      {icon && <div className="mt-0.5 opacity-70">{icon}</div>}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-3xl font-black mt-1 ${valColors[color]}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Alert Card (30 dias) ───────────────────────────────────────────────────────

function AlertCard({ p, i }: { p: NutricaoProduto; i: number }) {
  const isVencido = p.menorDias <= 0;
  const diasLabel = isVencido ? 'VENCIDO' : `${p.menorDias}d`;
  const bgClass   = isVencido || p.menorDias <= 10
    ? 'bg-red-50 border-red-300'
    : p.menorDias <= 20
      ? 'bg-orange-50 border-orange-300'
      : 'bg-amber-50 border-amber-200';
  const diasClass = isVencido || p.menorDias <= 10
    ? 'text-red-700 bg-red-100'
    : p.menorDias <= 20
      ? 'text-orange-700 bg-orange-100'
      : 'text-amber-700 bg-amber-100';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.04 }}
      className={`rounded-2xl border p-4 flex items-center gap-4 ${bgClass}`}
    >
      {/* Countdown */}
      <div className={`shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center font-black text-lg leading-none ${diasClass}`}>
        <span>{diasLabel}</span>
        {!isVencido && <span className="text-[10px] font-semibold opacity-70 mt-0.5">dias</span>}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-900 leading-snug truncate">{p.nome}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Validade: <span className="font-semibold">{p.menorValidade || '—'}</span>
          &nbsp;·&nbsp; Estoque: <span className="font-semibold">{p.estoqueAtual.toLocaleString('pt-BR')} {p.unidade}</span>
        </p>
        <UrgencyBar dias={p.menorDias} />
      </div>

      {/* Badge */}
      <div className="shrink-0">
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${
          isVencido ? 'bg-red-700 text-white' : diasClass
        }`}>
          {p.categoria.split(' ')[0]}
        </span>
      </div>
    </motion.div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PainelNutricao() {
  const [dados, setDados] = usePersistentState<NutricaoProduto[]>('logistica_farma_nutricao_data', []);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [catFilter, setCatFilter] = useState<string>('TODOS');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const result = await parseNutricaoCSV(file);
      if (result.length === 0) {
        setError('Nenhum produto encontrado. Verifique o formato do CSV.');
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

  // KPIs
  const kpis = useMemo(() => ({
    total: dados.length,
    urgente30: dados.filter(p => p.menorDias <= 30).length,
    estoqueTotal: dados.reduce((s, p) => s + p.estoqueAtual, 0),
  }), [dados]);

  // Próximos a vencer ≤ 30 dias, ordem alfabética
  const proxVencer = useMemo(() =>
    [...dados]
      .filter(p => p.menorDias <= 30)
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
    [dados]
  );

  // Lista geral filtrada, ordem alfabética
  const categorias = useMemo(() => {
    const cats = new Set(dados.map(p => p.categoria));
    return ['TODOS', ...Array.from(cats).sort()];
  }, [dados]);

  const listaGeral = useMemo(() => {
    let d = [...dados];
    if (catFilter !== 'TODOS') d = d.filter(p => p.categoria === catFilter);
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      d = d.filter(p => p.nome.toLowerCase().includes(q) || p.produtoId.includes(q));
    }
    return d.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [dados, catFilter, searchTerm]);

  const showUploadZone = dados.length === 0 || showUpload;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
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
              onClick={() => exportNutricaoPDF(dados, kpis)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors font-medium"
            >
              <Download className="w-4 h-4" />
              Exportar PDF
            </button>
          </div>
        )}
      </div>

      {/* ── Upload zone ── */}
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
              className="border-2 border-dashed border-emerald-300 rounded-2xl bg-emerald-50 p-12 text-center cursor-pointer hover:bg-emerald-100 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleInputChange} />
              {loading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-emerald-700 font-medium">Processando arquivo…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <Upload className="w-12 h-12 text-emerald-400" />
                  <div>
                    <p className="font-bold text-emerald-800 text-lg">Clique ou arraste o arquivo CSV</p>
                    <p className="text-sm text-emerald-600 mt-1">conf lote dieta.csv</p>
                  </div>
                </div>
              )}
            </div>
            {error && (
              <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <X className="w-4 h-4 mt-0.5 shrink-0" /> {error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {dados.length > 0 && (
        <>
          {/* ── KPIs ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KPICard
              label="Total de produtos"
              value={kpis.total}
              color="emerald"
              icon={<Package className="w-6 h-6 text-emerald-600" />}
            />
            <KPICard
              label="Vencendo em ≤ 30 dias"
              value={kpis.urgente30}
              sub="Ação imediata necessária"
              color="red"
              icon={<ShieldAlert className="w-6 h-6 text-red-500" />}
            />
            <KPICard
              label="Estoque total"
              value={kpis.estoqueTotal.toLocaleString('pt-BR')}
              sub="unidades"
              color="slate"
              icon={<Clock className="w-6 h-6 text-slate-400" />}
            />
          </div>

          {/* ── Próximos a Vencer (30 dias) ── */}
          {proxVencer.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                <h2 className="font-bold text-red-800 text-base">
                  Próximos a Vencer — 30 dias
                  <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-200 text-red-700">
                    {proxVencer.length} item{proxVencer.length !== 1 ? 's' : ''}
                  </span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {proxVencer.map((p, i) => (
                  <AlertCard key={p.produtoId} p={p} i={i} />
                ))}
              </div>
            </div>
          )}

          {proxVencer.length === 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 flex items-center gap-4">
              <CheckCircle className="w-10 h-10 text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-emerald-800">Tudo em dia!</p>
                <p className="text-sm text-emerald-600">Nenhum produto vencendo nos próximos 30 dias.</p>
              </div>
            </div>
          )}

          {/* ── Lista Geral ── */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                Lista Geral de Produtos
              </h2>
              <div className="flex gap-2 flex-wrap">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar produto…"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 w-52"
                  />
                </div>
                {/* Category filter */}
                <select
                  value={catFilter}
                  onChange={e => setCatFilter(e.target.value)}
                  className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
                >
                  {categorias.map(c => (
                    <option key={c} value={c}>{c === 'TODOS' ? 'Todas as categorias' : c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                    <th className="text-left px-5 py-3 font-semibold">Descrição</th>
                    <th className="text-left px-3 py-3 font-semibold">Categoria</th>
                    <th className="text-center px-3 py-3 font-semibold">Unidade</th>
                    <th className="text-right px-5 py-3 font-semibold">Estoque</th>
                    <th className="text-center px-3 py-3 font-semibold">Validade</th>
                  </tr>
                </thead>
                <tbody>
                  {listaGeral.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-12 text-center text-slate-400">
                        Nenhum produto encontrado.
                      </td>
                    </tr>
                  ) : listaGeral.map((p, i) => {
                    const isUrgente = p.menorDias <= 30;
                    const isAtencao = p.menorDias > 30 && p.menorDias <= 60;
                    return (
                      <motion.tr
                        key={p.produtoId}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: Math.min(i * 0.015, 0.3) }}
                        className={`border-b border-slate-100 transition-colors ${
                          isUrgente ? 'bg-red-50/50 hover:bg-red-50' :
                          isAtencao ? 'bg-amber-50/40 hover:bg-amber-50' :
                          'hover:bg-slate-50'
                        }`}
                      >
                        <td className="px-5 py-3 font-medium text-slate-900">
                          {p.nome}
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-xs">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                            {p.categoria}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center text-slate-600">{p.unidade}</td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-xl font-black text-slate-800">
                            {p.estoqueAtual.toLocaleString('pt-BR')}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`font-medium ${
                            isUrgente ? 'text-red-700' :
                            isAtencao ? 'text-amber-700' :
                            'text-slate-600'
                          }`}>
                            {p.menorValidade || '—'}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
              {listaGeral.length} produto{listaGeral.length !== 1 ? 's' : ''} · ordenado por descrição
            </div>
          </div>
        </>
      )}
    </div>
  );
}
