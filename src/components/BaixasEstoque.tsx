import React, { useState, useMemo } from 'react';
import { TrendingDown, Upload, CheckCircle, BarChart2, Search, Package, X, AlertTriangle, ShieldAlert } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';
import { getCategoriaProduto, CategoriaProduto } from '../utils/categorias';
import { getRiscoAssistencial, RiscoInfo } from '../utils/riscoAssistencial';

// ── Types ──────────────────────────────────────────────────────────────────────
interface BaixaItem {
  id: string;
  nome: string;
  data: string;
  motivo: string;
  motivoGrupo: string;
  setor: string;
  unidade: string;
  lote: string;
  validade: string;
  quantidade: number;
  valorUnit: number;
  valorTotal: number;
  categoria: CategoriaProduto;
  risco: RiscoInfo;
}

interface TransferenciaItem {
  id: string;
  produto: string;
  unidade: string;
  origem: string;
  destino: string;
  quantidade: number;
  valorUnit: number;
  valorTotal: number;
  categoria: CategoriaProduto;
  risco: RiscoInfo;
  isRiskRedistribution?: boolean;
}

interface ConsumoItem {
  id: string;
  produto: string;
  consumoMes: number;
  valorUnit: number;
}

interface LoteItem {
  idProduto: string;
  nomeProduto: string;
  unidade: string;
  lote: string;
  validade: string;
  quantidade: number;
  vencido: boolean;
  diasRestantes: number;
}

interface AEvitarItem extends LoteItem {
  valorPotencial: number;
  urgencia: 'VENCIDO' | 'CRÍTICO' | 'ALERTA' | 'ATENÇÃO';
}

type SubTab = 'dashboard' | 'baixas' | 'a_evitar' | 'transferencias' | 'lotes' | 'consumo';

// ── Utils ──────────────────────────────────────────────────────────────────────
const norm = (s: string) =>
  (s || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');

const normId = (s: string) => {
  const t = (s || '').trim();
  if (/^\d+$/.test(t)) return t.replace(/^0+/, '') || '0';
  return t;
};

function parseCSVLine(line: string, sep = ','): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function parseNum(s: string): number {
  const c = (s || '').replace(/"/g, '').trim();
  if (!c) return 0;
  if (c.includes(',') && c.includes('.')) return parseFloat(c.replace(/\./g, '').replace(',', '.')) || 0;
  if (c.includes(',')) return parseFloat(c.replace(',', '.')) || 0;
  return parseFloat(c) || 0;
}

function parseDate(s: string): Date | null {
  if (!s) return null;
  const p = s.includes('/') ? s.split('/') : s.split('-');
  if (p.length !== 3) return null;
  try {
    if (s.includes('/')) return new Date(+p[2], +p[1] - 1, +p[0]);
    return new Date(+p[0], +p[1] - 1, +p[2]);
  } catch { return null; }
}

function motivoGrupo(m: string): string {
  const u = m.toUpperCase();
  if (u.includes('QUEBRA') || u.includes('ACIDENTAL') || u.includes('QUEDA')) return 'Quebra Acidental';
  if (u.includes('VALIDADE') || u.includes('VENCIDO') || u.includes('EXPIRADO') || u.includes('PRAZO')) return 'Vencimento';
  if (u.includes('AVARIA') || u.includes('DANO') || u.includes('DETERIORA')) return 'Avaria/Dano';
  if (u.includes('RECALL') || u.includes('DESVIO') || u.includes('QUALIDADE')) return 'Recall/Desvio';
  if (u.includes('PSICOTROPICO') || u.includes('PSICOTR') || u.includes('CONTROLADO')) return 'Controlado-Quebra';
  return m || 'Outros';
}

const fmtBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const HOJE = new Date();
HOJE.setHours(0, 0, 0, 0);

const CHART_COLORS = ['#ef4444', '#f97316', '#eab308', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

// ── Parsers ────────────────────────────────────────────────────────────────────

// R_BAIXA_PROD.csv — repeating header groups
function parseBaixaProd(csv: string): BaixaItem[] {
  const lines = csv.split(/\r?\n/);
  const items: BaixaItem[] = [];
  let currentDate = '';
  let colMotivo = 1, colProduto = 2, colUnidade = 3, colLote = 4;
  let colValidade = 5, colQtd = 6, colVlrUnit = 7, colVlrTotal = 8;
  let colSetor = 0;
  let headerFound = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = parseCSVLine(line, ',');
    const lineNorm = norm(line);

    // Extract date from "Dt Mvto:" metadata
    if (lineNorm.startsWith('DTMVTO') || norm(cols[0] || '').startsWith('DTMVTO')) {
      currentDate = (cols[1] || '').replace(/"/g, '').trim();
      continue;
    }

    // Skip other metadata lines
    if (lineNorm.startsWith('CODIGO') || lineNorm.startsWith('ESTOQUE') || lineNorm.startsWith('DT')) {
      continue;
    }

    // Detect header row (Setor + Motivo)
    const c0 = norm(cols[0] || '');
    const c1 = norm(cols[1] || '');
    if (c0 === 'SETOR' || (c0.includes('SETOR') && c1.includes('MOTIVO'))) {
      headerFound = true;
      const headers = cols.map(c => norm(c));
      const fi = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));
      colSetor    = fi(['SETOR']);
      colMotivo   = fi(['MOTIVODABAIXA', 'MOTIVO']);
      colProduto  = fi(['PRODUTO']);
      colUnidade  = fi(['UNIDADE', 'UNID']);
      colLote     = fi(['LOTE']);
      colValidade = fi(['VALIDADE']);
      colQtd      = fi(['QTD', 'QUANTIDADE']);
      colVlrUnit  = fi(['VLUNITARIO', 'UNITARIO', 'VLUNIT']);
      colVlrTotal = fi(['VLTOTAL', 'TOTAL']);
      continue;
    }

    // Skip subtotal / empty-first-col lines
    if (!cols[0] || lineNorm.includes('TOTALPORDATA') || lineNorm.includes('TOTALPOR')) continue;

    // Skip repeated header variants
    if (!headerFound) continue;
    if (c0 === 'SETOR') continue;

    const produtoRaw = (cols[colProduto] || '').trim();
    if (!produtoRaw) continue;

    // Extract ID and name: "36811 - DORMIRE 5MG/ML..."
    const match = produtoRaw.match(/^(\d+)\s*-\s*(.+)$/);
    const id = match ? normId(match[1]) : normId(`nocode_${produtoRaw.substring(0, 8)}`);
    const nome = match ? match[2].trim() : produtoRaw;

    const quantidade = parseNum(cols[colQtd] || '0');
    const valorUnit  = parseNum(cols[colVlrUnit] || '0');
    const valorTotal = parseNum(cols[colVlrTotal] || '0') || quantidade * valorUnit;

    if (!nome) continue;

    items.push({
      id,
      nome,
      data: currentDate,
      motivo: (cols[colMotivo] || '').trim(),
      motivoGrupo: motivoGrupo((cols[colMotivo] || '').trim()),
      setor: (cols[colSetor] || '').trim(),
      unidade: (cols[colUnidade] || '').trim(),
      lote: (cols[colLote] || '').trim(),
      validade: (cols[colValidade] || '').trim(),
      quantidade,
      valorUnit,
      valorTotal,
      categoria: getCategoriaProduto(nome),
      risco: getRiscoAssistencial(nome),
    });
  }

  return items;
}

// R_TRANS_EFET.csv — simple header, product ID in col 0
function parseTransEfet(csv: string): TransferenciaItem[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Find header
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const n = norm(lines[i]);
    if (n.includes('CODIGO') && n.includes('PRODUTO')) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const sep = lines[headerIdx].includes(';') ? ';' : ',';
  const headers = parseCSVLine(lines[headerIdx], sep).map(c => norm(c));
  const fi = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));

  const colCod     = fi(['CODIGO', 'COD']);
  const colProd    = fi(['PRODUTO', 'NOME']);
  const colUnid    = fi(['UNIDADE', 'UNID']);
  const colOrigem  = fi(['ESTOQUEORIGEM', 'ORIGEM']);
  const colDestino = fi(['ESTOQUEDESTINO', 'DESTINO']);
  const colQtd     = fi(['QTD', 'QUANTIDADE']);
  const colVlrUnit = fi(['VLUNITARIO', 'UNITARIO', 'VLUNIT']);
  const colVlrTot  = fi(['VLTOTAL', 'TOTAL']);

  const items: TransferenciaItem[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line, sep);
    const produto = (cols[colProd] || '').trim();
    if (!produto) continue;

    const id       = normId((cols[colCod] || `${i}`).trim());
    const qtd      = parseNum(cols[colQtd]     || '0');
    const vlrUnit  = parseNum(cols[colVlrUnit] || '0');
    const vlrTotal = parseNum(cols[colVlrTot]  || '0') || qtd * vlrUnit;

    items.push({
      id,
      produto,
      unidade: (cols[colUnid]    || '').trim(),
      origem:  (cols[colOrigem]  || '').trim(),
      destino: (cols[colDestino] || '').trim(),
      quantidade: qtd,
      valorUnit: vlrUnit,
      valorTotal: vlrTotal,
      categoria: getCategoriaProduto(produto),
      risco: getRiscoAssistencial(produto),
    });
  }
  return items;
}

// Consumo 332.csv — robust parser
function parseConsumo332(csv: string): ConsumoItem[] {
  const lines = csv.split(/\r?\n/);
  if (lines.length < 2) return [];

  // Find header: look for a row with at least 2 relevant keywords
  let headerIdx = -1;
  let sep = ',';
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;
    
    const currentSep = rawLine.includes(';') ? ';' : ',';
    const colsNorm = parseCSVLine(rawLine, currentSep).map(c => norm(c));
    
    const keywords = ['PRODUTO', 'DESCRI', 'CODIGO', 'CUSTO', 'UNITARIO', 'QTD', 'QUANTIDADE', 'CONSUMO', 'SAIDA', 'VLUNIT'];
    const matchCount = colsNorm.filter(c => keywords.some(k => c.includes(k))).length;
    
    // Title lines often have only 1 keyword ("Relatório de Consumo..."). 
    // Data headers usually have 2 or more (Code, Product, Qty, Cost).
    if (matchCount >= 2) {
      headerIdx = i;
      sep = currentSep;
      break;
    }
  }

  if (headerIdx === -1) {
    // If no header found with 2+ keywords, fallback to first row that just contains 'PRODUTO'
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      if (norm(lines[i]).includes('PRODUTO')) { headerIdx = i; break; }
    }
  }
  
  if (headerIdx === -1) headerIdx = 0; // Final fallback

  const headers = parseCSVLine(lines[headerIdx], sep).map(c => norm(c));
  const fi = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)));

  const colCod = fi(['CODIGO', 'COD']);
  const colProd = fi(['PRODUTO', 'NOME', 'DESCRI', 'ITEM']);
  const colConsumo = fi(['CONSUMO', 'QTD', 'QUANTIDADE', 'SAIDA', 'TOTAL']);
  const colVlrUnit = fi(['CUSTO', 'UNITARIO', 'VLUNIT', 'MEDIO', 'PRECO', 'VALOR']);

  const items: ConsumoItem[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const cols = parseCSVLine(line, sep);

    let id = colCod !== -1 ? normId((cols[colCod] || '').trim()) : '';
    let produto = colProd !== -1 ? (cols[colProd] || '').trim() : '';

    // If product name is purely numeric and the NEXT column has text, 
    // then the current column is likely a row offset/index.
    if (/^\d+$/.test(produto) && colProd + 1 < cols.length && cols[colProd + 1].trim().length > 3) {
      if (!id) id = normId(produto);
      produto = cols[colProd + 1].trim();
    }

    if (!produto && !id) continue;
    
    // In some MV Soul reports, product column is "COD_ID - NOME_DO_PRODUTO"
    const match = produto.match(/^(\d+)\s*-\s*(.+)$/);
    if (match) {
      if (!id || !/^\d+$/.test(id)) id = normId(match[1]);
      produto = match[2].trim();
    }

    // Still no ID? Use a fallback but flag it for debugging
    if (!id) id = `row_${i}`;

    const consumoMes = colConsumo !== -1 ? parseNum(cols[colConsumo]) : 0;
    const valorUnit = colVlrUnit !== -1 ? parseNum(cols[colVlrUnit]) : 0;

    // Filter out title/garbage rows: must have a name that isn't just a tiny number
    if (produto.length < 2 || (/^\d+$/.test(produto) && produto.length < 5)) continue;

    items.push({
      id,
      produto,
      consumoMes,
      valorUnit,
    });
  }
  return items;
}

// baixas2.csv — complex: product row + lot sub-rows
function parseLoteInv(csv: string): LoteItem[] {
  const lines = csv.split(/\r?\n/);
  const items: LoteItem[] = [];
  let currentId   = '';
  let currentNome = '';
  let currentUnid = '';

  // Fixed column indices based on the MV Soul export structure:
  // Product row: col1=ID, col2=nome, col4=unidade, col8=lote, col10=validade, col18=qt_dig
  // Lot sub-row: col1-7 empty, col8=lote, col10=validade, col18=qt_dig
  const COL_ID   = 1;
  const COL_NOME = 2;
  const COL_UNID = 4;
  const COL_LOTE = 8;
  const COL_VAL  = 10;
  const COL_QTD  = 18;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const cols = parseCSVLine(line, ',');

    // Skip pure header rows
    if (norm(cols[0] || '').includes('PRODUTO') && cols[0] && norm(cols[COL_LOTE] || '').includes('LOTE')) continue;

    const maybeId   = (cols[COL_ID]   || '').trim();
    const maybeNome = (cols[COL_NOME] || '').trim();
    const maybeLote = (cols[COL_LOTE] || '').trim();

    // Product row: col1 is numeric ID, col2 is name
    if (maybeId && /^\d+$/.test(maybeId) && maybeNome) {
      currentId   = normId(maybeId);
      currentNome = maybeNome;
      currentUnid = (cols[COL_UNID] || '').trim();
    }

    // Process lot data (both product rows and sub-rows have lot at col 8)
    if (!maybeLote || !currentNome) continue;

    const valStr = (cols[COL_VAL] || '').trim();
    const qtd    = parseNum(cols[COL_QTD] || '0');
    const valDate = parseDate(valStr);
    const diasRestantes = valDate
      ? Math.floor((valDate.getTime() - HOJE.getTime()) / 86400000)
      : 9999;

    items.push({
      idProduto:   currentId,
      nomeProduto: currentNome,
      unidade:     currentUnid,
      lote:        maybeLote,
      validade:    valStr,
      quantidade:  qtd,
      vencido:     diasRestantes < 0,
      diasRestantes,
    });
  }

  return items;
}

// ── Sub-components ──────────────────────────────────────────────────────────────

const UploadCard: React.FC<{
  title: string; subtitle: string; description: string;
  color: 'red' | 'emerald' | 'amber';
  count: number; onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
}> = ({ title, subtitle, description, color, count, onUpload, onClear }) => {
  const cls = {
    red:     { border: 'border-red-200',     bg: 'bg-red-50',     icon: 'text-red-400',     badge: 'bg-red-100 text-red-700 border-red-200',     btn: 'bg-red-600 hover:bg-red-700' },
    emerald: { border: 'border-emerald-200', bg: 'bg-emerald-50', icon: 'text-emerald-400', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', btn: 'bg-emerald-600 hover:bg-emerald-700' },
    amber:   { border: 'border-amber-200',   bg: 'bg-amber-50',   icon: 'text-amber-400',   badge: 'bg-amber-100 text-amber-700 border-amber-200',   btn: 'bg-amber-600 hover:bg-amber-700' },
  }[color];

  return (
    <div className={`bg-white rounded-2xl border ${cls.border} p-5 flex flex-col gap-3`}>
      <div>
        <p className="font-semibold text-slate-800 text-sm">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className={`${cls.btn} text-white text-xs font-medium px-3 py-1.5 rounded-lg cursor-pointer flex items-center gap-1.5 transition-colors`}>
          <Upload className="w-3.5 h-3.5" />
          Importar CSV
          <input type="file" accept=".csv,.txt" className="hidden" onChange={onUpload} />
        </label>
        {count > 0 && (
          <>
            <span className={`border text-xs font-medium px-2 py-1 rounded-full ${cls.badge}`}>
              {count} registros
            </span>
            <button onClick={onClear} className="text-slate-400 hover:text-red-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

const KpiCard: React.FC<{
  label: string; value: string; sub: string;
  color: 'red' | 'emerald' | 'amber' | 'violet';
  icon: React.ReactNode;
}> = ({ label, value, sub, color, icon }) => {
  const cls = {
    red:     'from-red-50 to-red-100/50 border-red-200 text-red-700',
    emerald: 'from-emerald-50 to-emerald-100/50 border-emerald-200 text-emerald-700',
    amber:   'from-amber-50 to-amber-100/50 border-amber-200 text-amber-700',
    violet:  'from-violet-50 to-violet-100/50 border-violet-200 text-violet-700',
  }[color];

  return (
    <div className={`bg-gradient-to-br ${cls} border rounded-2xl p-4`}>
      <div className="flex items-center gap-2 mb-1 opacity-70">{icon}<span className="text-xs font-semibold uppercase tracking-wide">{label}</span></div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{sub}</p>
    </div>
  );
};

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; height?: number }> = ({ title, subtitle, children, height = 240 }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    <div className="mt-3 w-full" style={{ height }}>{children}</div>
  </div>
);

// ── Main Component ──────────────────────────────────────────────────────────────

export const BaixasEstoque: React.FC = () => {
  const [baixaData, setBaixaData]   = useState<BaixaItem[]>([]);
  const [transData, setTransData]   = useState<TransferenciaItem[]>([]);
  const [loteData,  setLoteData]    = useState<LoteItem[]>([]);
  const [consumoData, setConsumoData] = useState<ConsumoItem[]>([]);

  const [activeSubTab,    setActiveSubTab]    = useState<SubTab>('dashboard');
  const [searchTerm,      setSearchTerm]      = useState('');
  const [filterCategoria, setFilterCategoria] = useState<'TODOS' | CategoriaProduto>('TODOS');
  const [filterMotivo,    setFilterMotivo]    = useState('TODOS');

  // ── Upload handlers ──────────────────────────────────────────────────────────

  const handleUpload = (parser: (csv: string) => any, setter: (d: any) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const csv = ev.target?.result as string;
          setter(parser(csv));
        } catch { alert('Erro ao processar o arquivo. Verifique o formato CSV.'); }
      };
      reader.readAsText(file, 'ISO-8859-1');
      e.target.value = '';
    };

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  // Mapa de preço unitário por produto (de baixas + transferências + consumo)
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    // Prioritize Consumo 332 prices if available
    consumoData.forEach(c => { if (c.valorUnit > 0) map.set(c.id, c.valorUnit); });
    baixaData.forEach(b => { if (b.valorUnit > 0 && !map.has(b.id)) map.set(b.id, b.valorUnit); });
    transData.forEach(t => { if (t.valorUnit > 0 && !map.has(t.id)) map.set(t.id, t.valorUnit); });
    return map;
  }, [baixaData, transData, consumoData]);

  // Enrich write-offs with prioritized unit prices and recalculate totals
  const baixasEnriched = useMemo(() => baixaData.map(b => {
    const unitPrice = priceMap.get(b.id) || b.valorUnit;
    return {
      ...b,
      valorUnit: unitPrice,
      valorTotal: b.quantidade * unitPrice
    };
  }), [baixaData, priceMap]);

  const perdaRealTotal = useMemo(() => baixasEnriched.reduce((s, b) => s + b.valorTotal, 0), [baixasEnriched]);
  const skusPerdidos   = useMemo(() => new Set(baixasEnriched.map(b => b.id)).size, [baixasEnriched]);

  // Mapa de consumo por produto
  const consumoMap = useMemo(() => {
    const map = new Map<string, number>();
    consumoData.forEach(c => map.set(c.id, (map.get(c.id) || 0) + c.consumoMes));
    return map;
  }, [consumoData]);

  // Lotes com saldo > 0 e vencimento ≤ 180 dias (inclui já vencidos)
  const aEvitarItems = useMemo((): AEvitarItem[] =>
    loteData
      .filter(l => l.quantidade > 0 && l.diasRestantes <= 180)
      .map(l => ({
        ...l,
        valorPotencial: l.quantidade * (priceMap.get(l.idProduto) || 0),
        urgencia: l.vencido
          ? 'VENCIDO'
          : l.diasRestantes <= 30
          ? 'CRÍTICO'
          : l.diasRestantes <= 90
          ? 'ALERTA'
          : 'ATENÇÃO',
      } as AEvitarItem))
      .sort((a, b) => a.diasRestantes - b.diasRestantes),
    [loteData, priceMap]
  );

  // Perda a Evitar = lotes com saldo > 0, ainda não vencidos, ≤ 90 dias
  const perdaAEvitarTotal = useMemo(
    () => aEvitarItems.filter(l => !l.vencido && l.diasRestantes <= 90).reduce((s, l) => s + l.valorPotencial, 0),
    [aEvitarItems]
  );
  // Risco imediato = lotes já vencidos ainda em estoque
  const riscoVencidoTotal = useMemo(
    () => aEvitarItems.filter(l => l.vencido).reduce((s, l) => s + l.valorPotencial, 0),
    [aEvitarItems]
  );

  // ── Chart Data ────────────────────────────────────────────────────────────────

  const motivoData = useMemo(() => {
    const map = new Map<string, number>();
    baixasEnriched.forEach(b => map.set(b.motivoGrupo, (map.get(b.motivoGrupo) || 0) + b.valorTotal));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [baixasEnriched]);

  const categoriaData = useMemo(() => {
    const map = new Map<string, number>();
    baixasEnriched.forEach(b => map.set(b.categoria, (map.get(b.categoria) || 0) + b.valorTotal));
    return Array.from(map.entries()).map(([name, valor]) => ({ name, valor })).sort((a, b) => b.valor - a.valor);
  }, [baixasEnriched]);

  const top10 = useMemo(() => {
    const map = new Map<string, { nome: string; valor: number }>();
    baixasEnriched.forEach(b => {
      const cur = map.get(b.id) || { nome: b.nome, valor: 0 };
      map.set(b.id, { nome: b.nome, valor: cur.valor + b.valorTotal });
    });
    return Array.from(map.values()).sort((a, b) => b.valor - a.valor).slice(0, 10);
  }, [baixasEnriched]);

  const comparativoData = useMemo(() => [
    { name: 'Perda Real', valor: perdaRealTotal, fill: '#ef4444' },
    { name: 'A Evitar (≤90d)', valor: perdaAEvitarTotal, fill: '#f97316' },
    { name: 'Vencido Estoque', valor: riscoVencidoTotal, fill: '#7f1d1d' },
  ], [perdaRealTotal, perdaAEvitarTotal, riscoVencidoTotal]);

  const urgenciaData = useMemo(() => {
    const grp = new Map<string, number>();
    aEvitarItems.forEach(l => grp.set(l.urgencia, (grp.get(l.urgencia) || 0) + l.valorPotencial));
    return ['VENCIDO', 'CRÍTICO', 'ALERTA', 'ATENÇÃO']
      .filter(u => grp.has(u))
      .map(u => ({ name: u, valor: grp.get(u)! }));
  }, [aEvitarItems]);

  // ── Filters ───────────────────────────────────────────────────────────────────

  // IDs de produtos que possuem lotes em risco (≤ 180 dias)
  const riskProductIds = useMemo(() => new Set(aEvitarItems.map(l => l.idProduto)), [aEvitarItems]);

  // Enrich transferences with prioritized unit prices and risk status
  const transEnriched = useMemo(() => transData.map(t => {
    const unitPrice = priceMap.get(t.id) || t.valorUnit;
    const isRisk = riskProductIds.has(t.id);
    return {
      ...t,
      valorUnit: unitPrice,
      valorTotal: t.quantidade * unitPrice,
      isRiskRedistribution: isRisk,
    };
  }), [transData, priceMap, riskProductIds]);

  const totalSavedRiskValue = useMemo(() => 
    transEnriched.filter(t => t.isRiskRedistribution).reduce((s, t) => s + t.valorTotal, 0),
  [transEnriched]);

  const motivosUnicos = useMemo(() => ['TODOS', ...Array.from(new Set(baixasEnriched.map(b => b.motivoGrupo))).sort()], [baixasEnriched]);

  const baixasFiltradas = useMemo(() => baixasEnriched.filter(b => {
    const s = searchTerm.toLowerCase();
    return (!searchTerm || b.nome.toLowerCase().includes(s) || b.id.includes(searchTerm))
      && (filterCategoria === 'TODOS' || b.categoria === filterCategoria)
      && (filterMotivo === 'TODOS' || b.motivoGrupo === filterMotivo);
  }), [baixasEnriched, searchTerm, filterCategoria, filterMotivo]);

  const transFiltradas = useMemo(() => transEnriched.filter(t => {
    const s = searchTerm.toLowerCase();
    return t.isRiskRedistribution && (!searchTerm || t.produto.toLowerCase().includes(s) || t.id.includes(searchTerm))
      && (filterCategoria === 'TODOS' || t.categoria === filterCategoria);
  }), [transEnriched, searchTerm, filterCategoria]);

  const lotesFiltrados = useMemo(() => loteData.filter(l => {
    const s = searchTerm.toLowerCase();
    return (!searchTerm || l.nomeProduto.toLowerCase().includes(s) || l.idProduto.includes(searchTerm));
  }), [loteData, searchTerm]);

  const hasData = baixaData.length > 0 || transData.length > 0 || loteData.length > 0 || consumoData.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <TrendingDown className="w-7 h-7 text-red-500" />
              Painel de Baixas do Estoque
            </h2>
            <p className="text-slate-500 text-sm mt-1">
              Análise de Perda Real e Perda Evitada — MV Soul / Suprimentos
            </p>
          </div>
          {hasData && (
            <div className="flex gap-2 flex-wrap text-xs">
              {baixaData.length > 0 && <span className="bg-red-50 text-red-700 border border-red-200 rounded-lg px-3 py-1 font-medium">{baixaData.length} baixas</span>}
              {transData.length > 0 && <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-1 font-medium">{transData.length} transferências</span>}
              {loteData.length > 0  && <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-3 py-1 font-medium">{loteData.length} lotes</span>}
              {consumoData.length > 0  && <span className="bg-violet-50 text-violet-700 border border-violet-200 rounded-lg px-3 py-1 font-medium">{consumoData.length} itens consumo</span>}
            </div>
          )}
        </div>
      </div>

      {/* Upload cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <UploadCard
          title="Relatório de Baixas (R_BAIXA_PROD)"
          subtitle="Suprimentos › Estoque › Baixas"
          description="Colunas: Setor, Motivo, Produto, Lote, Validade, Qtd, Vl Unitário, Vl Total"
          color="red"
          count={baixaData.length}
          onUpload={handleUpload(parseBaixaProd, setBaixaData)}
          onClear={() => setBaixaData([])}
        />
        <UploadCard
          title="Transferências Efetivadas (R_TRANS_EFET)"
          subtitle="Suprimentos › Estoque › Transferências"
          description="Colunas: Código, Produto, Estoque Origem/Destino, Qtd, Vl Total"
          color="emerald"
          count={transData.length}
          onUpload={handleUpload(parseTransEfet, setTransData)}
          onClear={() => setTransData([])}
        />
        <UploadCard
          title="Inventário de Lotes (baixas2)"
          subtitle="Suprimentos › Inventário › Contagem de Lotes"
          description="Colunas: Produto, Unidade, Estoque Atual, Lote, Validade, Quantidade"
          color="amber"
          count={loteData.length}
          onUpload={handleUpload(parseLoteInv, setLoteData)}
          onClear={() => setLoteData([])}
        />
        <UploadCard
          title="Consumo 332"
          subtitle="Consumo e Custo Unitário Mensal"
          description="Colunas: Produto, Consumo (Mensal), Custo Unitário"
          color="amber" // Pode ser 'amber' ou outra cor se você expandir as props do UploadCard
          count={consumoData.length}
          onUpload={handleUpload(parseConsumo332, setConsumoData)}
          onClear={() => setConsumoData([])}
        />
      </div>

      {/* Empty state */}
      {!hasData && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <TrendingDown className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Importe os relatórios do MV Soul para iniciar a análise</p>
          <p className="text-slate-400 text-sm mt-1">Os arquivos CSV devem ser exportados como texto separado por vírgulas</p>
        </div>
      )}

      {hasData && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Perda Real" value={fmtBRL(perdaRealTotal)} sub={`${baixaData.length} registros`} color="red" icon={<TrendingDown className="w-4 h-4" />} />
            <KpiCard
              label="Perda a Evitar (≤90d)"
              value={fmtBRL(perdaAEvitarTotal)}
              sub={`${aEvitarItems.filter(l => !l.vencido && l.diasRestantes <= 90).length} lotes em risco`}
              color="amber"
              icon={<AlertTriangle className="w-4 h-4" />}
            />
            <KpiCard
              label="Já Vencido em Estoque"
              value={fmtBRL(riscoVencidoTotal)}
              sub={`${aEvitarItems.filter(l => l.vencido).length} lotes vencidos c/ saldo`}
              color="red"
              icon={<ShieldAlert className="w-4 h-4" />}
            />
            <KpiCard label="SKUs Afetados" value={skusPerdidos.toString()} sub="produtos únicos com baixa" color="violet" icon={<Package className="w-4 h-4" />} />
          </div>

          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-slate-200">
            {([
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'baixas', label: `Baixas Reais (${baixaData.length})` },
              { id: 'a_evitar', label: `A Evitar (${aEvitarItems.length})` },
              { id: 'transferencias', label: `Transferências (${transData.length})` },
              ...(loteData.length > 0 ? [{ id: 'lotes', label: `Lotes (${loteData.length})` }] : []),
              ...(consumoData.length > 0 ? [{ id: 'consumo', label: `Consumo 332 (${consumoData.length})` }] : []),
            ] as { id: SubTab; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? 'border-red-500 text-red-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Dashboard */}
          {activeSubTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ChartCard title="Perda Real · A Evitar · Vencido em Estoque" subtitle="Impacto financeiro (R$)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparativoData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Valor']} />
                    <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                      {comparativoData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Perda a Evitar por Urgência" subtitle="Valor potencial por nível de risco (R$)">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={urgenciaData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Valor']} />
                    <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                      {urgenciaData.map((e) => (
                        <Cell key={e.name} fill={e.name === 'VENCIDO' ? '#7f1d1d' : e.name === 'CRÍTICO' ? '#ef4444' : e.name === 'ALERTA' ? '#f97316' : '#eab308'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Perda Real por Motivo" subtitle="Distribuição (R$)">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={motivoData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name.split(' ')[0]} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {motivoData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Valor']} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Perda Real por Categoria">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoriaData} layout="vertical" margin={{ top: 5, right: 30, left: 90, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Valor']} />
                    <Bar dataKey="valor" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Top 10 — Maior Perda Financeira" subtitle="Valor total baixado por produto" height={280}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={top10} layout="vertical" margin={{ top: 5, right: 30, left: 180, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(1)}k`} />
                    <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={180} />
                    <Tooltip formatter={(v: number) => [fmtBRL(v), 'Valor']} />
                    <Bar dataKey="valor" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}

          {/* Filters bar for tables */}
          {(activeSubTab === 'baixas' || activeSubTab === 'a_evitar' || activeSubTab === 'transferencias' || activeSubTab === 'lotes') && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar produto ou código..." className="bg-transparent text-sm outline-none flex-1 text-slate-700 placeholder:text-slate-400" />
              </div>
              <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value as any)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none">
                {(['TODOS', 'MEDICAMENTO', 'MATERIAL', 'DIETA', 'PSICOTRÓPICO', 'ALTA VIGILÂNCIA'] as const).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {activeSubTab === 'baixas' && (
                <select value={filterMotivo} onChange={e => setFilterMotivo(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 outline-none">
                  {motivosUnicos.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </div>
          )}

          {/* Tabela Baixas Reais */}
          {activeSubTab === 'baixas' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <p className="font-semibold text-slate-800">Baixas Reais ({baixasFiltradas.length})</p>
                <p className="text-sm text-red-700 font-semibold">{fmtBRL(baixasFiltradas.reduce((s, b) => s + b.valorTotal, 0))}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Código', 'Produto', 'Data', 'Motivo', 'Lote', 'Validade', 'Categoria', 'Risco', 'Consumo Mês', 'Qtd Baixa', 'Custo Unit.', 'Vl Total'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {baixasFiltradas.slice(0, 300).map((b, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{b.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{b.nome}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{b.data}</td>
                        <td className="px-4 py-3">
                          <span className="bg-red-50 text-red-700 border border-red-100 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">{b.motivoGrupo}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 font-mono">{b.lote}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{b.validade}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{b.categoria}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: b.risco.bg, color: b.risco.text }}>{b.risco.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500 font-medium">
                          {consumoMap.get(b.id) != null ? consumoMap.get(b.id)?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">{b.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">
                          {b.valorUnit > 0 ? fmtBRL(b.valorUnit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-red-700 whitespace-nowrap">{fmtBRL(b.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {baixasFiltradas.length > 300 && <p className="p-4 text-center text-sm text-slate-400">Exibindo 300 de {baixasFiltradas.length} registros</p>}
              </div>
            </div>
          )}

          {/* Tabela A Evitar */}
          {activeSubTab === 'a_evitar' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="font-semibold text-slate-800">Perda a Evitar — Lotes em Estoque ({aEvitarItems.length})</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Lotes com saldo &gt; 0 e validade ≤ 180 dias · preço calculado via R_BAIXA_PROD / R_TRANS_EFET
                    {priceMap.size === 0 && <span className="text-amber-600 ml-1">⚠ Sem arquivo de preços — importe Baixas ou Transferências primeiro</span>}
                  </p>
                </div>
                <p className="text-sm font-semibold text-orange-700">{fmtBRL(aEvitarItems.reduce((s, l) => s + l.valorPotencial, 0))}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Código', 'Produto', 'Lote', 'Validade', 'Dias', 'Consumo Mês', 'Qtd em Estoque', 'Vlr Unit', 'Perda Potencial', 'Urgência'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {aEvitarItems
                      .filter(l => {
                        const s = searchTerm.toLowerCase();
                        return (!searchTerm || l.nomeProduto.toLowerCase().includes(s) || l.idProduto.includes(searchTerm));
                      })
                      .slice(0, 400)
                      .map((l, i) => {
                        const urgCls = l.urgencia === 'VENCIDO'
                          ? 'bg-red-900 text-white'
                          : l.urgencia === 'CRÍTICO'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : l.urgencia === 'ALERTA'
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200';
                        return (
                          <tr key={i} className={`transition-colors ${l.vencido ? 'bg-red-50/40' : 'hover:bg-slate-50'}`}>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{l.idProduto}</td>
                            <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px] truncate">{l.nomeProduto}</td>
                            <td className="px-4 py-3 text-xs font-mono text-slate-500">{l.lote}</td>
                            <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.validade}</td>
                            <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${l.vencido ? 'text-red-700' : l.diasRestantes <= 30 ? 'text-orange-600' : 'text-amber-600'}`}>
                              {l.vencido ? `${l.diasRestantes}d` : `${l.diasRestantes}d`}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-500 font-medium">
                              {consumoMap.get(l.idProduto) != null ? consumoMap.get(l.idProduto)?.toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-700 font-medium">{l.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                            <td className="px-4 py-3 text-right text-slate-500 text-xs">
                              {priceMap.has(l.idProduto) ? fmtBRL(priceMap.get(l.idProduto)!) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-orange-700 whitespace-nowrap">
                              {l.valorPotencial > 0 ? fmtBRL(l.valorPotencial) : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${urgCls}`}>{l.urgencia}</span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
                {aEvitarItems.length > 400 && <p className="p-4 text-center text-sm text-slate-400">Exibindo 400 de {aEvitarItems.length} lotes</p>}
              </div>
            </div>
          )}

          {/* Tabela Transferências */}
          {activeSubTab === 'transferencias' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 border-b border-slate-100">
                  <div>
                    <p className="font-semibold text-slate-800">Transferências de Risco ({transFiltradas.length})</p>
                    <p className="text-xs text-slate-400 mt-0.5">Itens com risco de vencimento redirecionados para outras unidades — perda evitada</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-emerald-700 font-bold">{fmtBRL(transFiltradas.reduce((s, t) => s + t.valorTotal, 0))}</p>
                  </div>
                </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Código', 'Produto', 'Origem', 'Destino', 'Categoria', 'Risco', 'Status', 'Qtd', 'Vlr Unit', 'Total Evitado'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transFiltradas.slice(0, 300).map((t, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{t.id}</td>
                        <td className="px-4 py-3 font-medium text-slate-800 max-w-[200px] truncate">{t.produto}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.origem}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{t.destino}</td>
                        <td className="px-4 py-3 text-xs text-slate-600">{t.categoria}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: t.risco.bg, color: t.risco.text }}>{t.risco.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          {t.isRiskRedistribution ? (
                            <span className="bg-orange-100 text-orange-800 border border-orange-200 text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-tighter">ITEM RISCO</span>
                          ) : (
                            <span className="text-slate-300 text-[10px]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 font-medium">{t.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}</td>
                        <td className="px-4 py-3 text-right text-slate-500 text-xs">
                          {t.valorUnit > 0 ? fmtBRL(t.valorUnit) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmtBRL(t.valorTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {transFiltradas.length > 300 && <p className="p-4 text-center text-sm text-slate-400">Exibindo 300 de {transFiltradas.length} registros</p>}
              </div>
            </div>
          )}

          {/* Tabela Lotes */}
          {activeSubTab === 'lotes' && loteData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">Inventário de Lotes ({lotesFiltrados.length})</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    <span className="text-red-600 font-medium">{lotesFiltrados.filter(l => l.vencido).length} vencidos</span>
                    {' · '}
                    <span className="text-amber-600 font-medium">{lotesFiltrados.filter(l => !l.vencido && l.diasRestantes <= 90).length} vencem em ≤90 dias</span>
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Código', 'Produto', 'Lote', 'Validade', 'Dias Restantes', 'Qtd', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {lotesFiltrados.slice(0, 500).sort((a, b) => a.diasRestantes - b.diasRestantes).map((l, i) => {
                      const status = l.vencido
                        ? { label: 'VENCIDO', cls: 'bg-red-50 text-red-700 border-red-200' }
                        : l.diasRestantes <= 30
                        ? { label: 'CRÍTICO', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
                        : l.diasRestantes <= 90
                        ? { label: 'ALERTA', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
                        : { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{l.idProduto}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 max-w-[220px] truncate">{l.nomeProduto}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{l.lote}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{l.validade}</td>
                          <td className="px-4 py-3 text-right text-slate-700 font-medium">
                            {l.vencido ? <span className="text-red-600">{l.diasRestantes}d</span> : `${l.diasRestantes}d`}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600">{l.quantidade}</td>
                          <td className="px-4 py-3">
                            <span className={`border rounded-full px-2 py-0.5 text-xs font-semibold ${status.cls}`}>{status.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {lotesFiltrados.length > 500 && <p className="p-4 text-center text-sm text-slate-400">Exibindo 500 de {lotesFiltrados.length} lotes</p>}
              </div>
            </div>
          )}

          {/* Tabela Consumo (View only) */}
          {activeSubTab === 'consumo' && consumoData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">Consumo 332 ({consumoData.length})</p>
                  <p className="text-xs text-slate-400 mt-0.5">Visão geral do consumo mensal e preço unitário informados</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {['Código', 'Produto', 'Consumo (Mês)', 'Custo Unit.'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consumoData
                      .filter(c => {
                        const s = searchTerm.toLowerCase();
                        return (!searchTerm || c.produto.toLowerCase().includes(s) || c.id.includes(searchTerm));
                      })
                      .slice(0, 500)
                      .map((c, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{c.id}</td>
                          <td className="px-4 py-3 font-medium text-slate-800 max-w-[250px] truncate">{c.produto}</td>
                          <td className="px-4 py-3 text-right text-slate-700 font-medium">{c.consumoMes.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
                          <td className="px-4 py-3 text-right text-slate-600 font-semibold whitespace-nowrap">{c.valorUnit > 0 ? fmtBRL(c.valorUnit) : '—'}</td>
                        </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
