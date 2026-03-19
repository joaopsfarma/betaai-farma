/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useCallback } from 'react';
import {
  Upload, AlertTriangle, Package, Users, Activity, TrendingUp,
  CheckCircle, XCircle, Clock, Search, BarChart3, RefreshCw,
  Layers, ChevronRight, FileText
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend,
  ComposedChart, Line
} from 'recharts';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface TransacaoRow {
  id: string; operacao: string; dispensario: string; dataHora: string;
  usuario: string; gaveta: string; codigoLido: string; codProduto: string;
  descProduto: string; tipo: string; qtde: number; saldo: number;
  atendimento: string; evento: string; prescricao: string; integracao: string;
}

interface SaldoRow {
  gaveta: string; celula: string; codigo: string; descricao: string;
  saldoWL: number; saldoHosp: number; saldoTrn: number; igual: string; qtTrn: number;
}

interface ConsumoRow {
  produto: string; descricao: string; unidade: string; quantidade: number;
}

// ─── PARSERS ──────────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const cols: string[] = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur); cur = ''; }
    else cur += c;
  }
  cols.push(cur); return cols;
}

function parseTransacoes(text: string): TransacaoRow[] {
  const lines = text.split(/\r?\n/); const rows: TransacaoRow[] = [];
  let start = 1;
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    if (lines[i].includes('Opera') && lines[i].includes('Data Hora')) { start = i + 1; break; }
  }
  for (let i = start; i < lines.length; i++) {
    const c = lines[i].split(';'); if (c.length < 10 || !c[0]?.trim()) continue;
    rows.push({
      id: c[0], operacao: c[1] || '', dispensario: c[2] || '', dataHora: c[3] || '',
      usuario: c[4] || '', gaveta: (c[5] || '').trim(), codigoLido: c[6] || '',
      codProduto: c[7] || '', descProduto: c[8] || '', tipo: c[9] || '',
      qtde: parseInt(c[10]) || 0, saldo: parseInt(c[11]) || 0,
      atendimento: c[12] || '', evento: c[13] || '',
      prescricao: c[14] || '', integracao: c[18] || '',
    });
  }
  return rows;
}

function parseSaldos(text: string): { dispensario: string; rows: SaldoRow[] } {
  const lines = text.split(/\r?\n/); const rows: SaldoRow[] = [];
  let dispensario = ''; let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const dispParts = l.split(';;');
    if (l.includes('Dispens') && dispParts[1]) dispensario = dispParts[1].replace(/;.*/,'').trim();
    if (l.includes('Gaveta') && l.includes('digo') && l.includes('Saldo')) { start = i + 1; break; }
  }
  if (start === -1) return { dispensario, rows };
  for (let i = start; i < lines.length; i++) {
    const c = lines[i].split(';'); if (c.length < 10 || !c[5]?.trim()) continue;
    if ((c[6] || '').toUpperCase().includes('(MESTRE)')) continue;
    rows.push({
      gaveta: c[3] || '', celula: c[4] || '', codigo: c[5] || '', descricao: c[6] || '',
      saldoWL: parseFloat(c[7]) || 0, saldoHosp: parseFloat(c[8]) || 0,
      saldoTrn: parseFloat(c[9]) || 0, igual: (c[10] || 'S').trim(),
      qtTrn: parseFloat(c[13]) || 0,
    });
  }
  return { dispensario, rows };
}

function parseConsumo(text: string): ConsumoRow[] {
  const lines = text.split(/\r?\n/); const rows: ConsumoRow[] = [];
  let start = 1;
  for (let i = 0; i < Math.min(4, lines.length); i++) {
    const l = lines[i].toLowerCase();
    if (l.includes('produto') && l.includes('descri')) { start = i + 1; break; }
  }
  for (let i = start; i < lines.length; i++) {
    const c = parseCsvLine(lines[i]); if (!c[0] || isNaN(parseInt(c[0]))) continue;
    const qtdStr = (c[4] || c[3] || '0').replace(',', '.');
    rows.push({ produto: c[0].trim(), descricao: (c[1] || '').replace(/^"|"$/g,'').trim(), unidade: c[2] || '', quantidade: parseFloat(qtdStr) || 0 });
  }
  return rows;
}

// ─── PLANO DE AÇÃO ───────────────────────────────────────────────────────────
interface PlanoAcao {
  label: string; detalhe: string; color: string; bg: string; border: string;
  priority: 'critica' | 'alta' | 'media' | 'baixa';
}

function getPlanoAcao(row: SaldoRow): PlanoAcao {
  const { saldoWL: wl, saldoHosp: hosp, saldoTrn: trn, igual } = row;
  if (igual === 'S') return { label: 'Consistente', detalhe: 'Todos os sistemas concordam', color: '#059669', bg: '#ecfdf5', border: '#6ee7b7', priority: 'baixa' };
  if (wl === 0 && hosp === 0 && trn === 0) return { label: 'Conferir Cadastro', detalhe: 'Saldos zerados em todos os sistemas', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', priority: 'baixa' };
  if (wl > 0 && hosp === 0 && trn === 0) return { label: 'Inventário Físico', detalhe: 'WL mostra saldo mas físico/Hosp zerado', color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', priority: 'critica' };
  if (wl === 0 && hosp > 0 && trn === 0) return { label: 'Regularizar no WL', detalhe: 'Hosp tem estoque mas WL está zerado', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', priority: 'alta' };
  if (wl === 0 && hosp > 0 && trn > 0) return { label: 'Integrar Entrada no WL', detalhe: 'Saldo físico e Hosp presentes, WL zerado', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', priority: 'alta' };
  if (wl === trn && hosp !== wl) return { label: 'Checar Sist. Hospitalar', detalhe: 'WL e Físico batem — Hosp diverge', color: '#2563eb', bg: '#eff6ff', border: '#93c5fd', priority: 'media' };
  if (wl === hosp && trn !== wl) return { label: 'Contagem Física', detalhe: 'WL = Hosp, mas Físico (Trn) difere', color: '#7c3aed', bg: '#f5f3ff', border: '#c4b5fd', priority: 'media' };
  if (wl > 0 && hosp > 0 && trn > 0 && wl !== hosp && hosp !== trn && wl !== trn) return { label: 'Inventário Urgente', detalhe: 'Tripla divergência — todos os sistemas diferem', color: '#9f1239', bg: '#fff1f2', border: '#fb7185', priority: 'critica' };
  if (wl > hosp) return { label: 'Saída Não Registrada', detalhe: 'WL acima do Hosp — possível consumo não lançado', color: '#dc2626', bg: '#fff1f2', border: '#fca5a5', priority: 'alta' };
  if (wl < hosp) return { label: 'Entrada Não Integrada', detalhe: 'Hosp acima do WL — entrada pendente de integração', color: '#d97706', bg: '#fffbeb', border: '#fcd34d', priority: 'alta' };
  return { label: 'Revisar Manualmente', detalhe: 'Padrão não identificado automaticamente', color: '#64748b', bg: '#f8fafc', border: '#cbd5e1', priority: 'media' };
}

const PRIORITY_ORDER = { critica: 0, alta: 1, media: 2, baixa: 3 };

function detectFile(text: string): 'transacoes' | 'saldos' | 'consumo' | null {
  const first = text.substring(0, 500).toLowerCase();
  if (first.includes('comparaçao de saldo') || first.includes('comparacao de saldo') || first.includes('weblogis') || first.includes('saldo weblogis')) return 'saldos';
  if (first.includes('retirada') || (first.includes('opera') && first.includes('dispens') && first.includes('gaveta'))) return 'transacoes';
  if ((first.includes('produto,') || first.includes('produto;')) && first.includes('quantidade')) return 'consumo';
  return null;
}

// ─── COLORS ───────────────────────────────────────────────────────────────────
const PIE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value?.toLocaleString('pt-BR')}
        </p>
      ))}
    </div>
  );
};

// ─── KPI CARD ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon: Icon, accent }: {
  label: string; value: string | number; sub?: string; color: string; icon: any; accent: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className={`h-[3px] w-full ${accent}`} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-3">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{label}</span>
          <div className={`p-1.5 rounded-lg bg-${color}-50`}>
            <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
          </div>
        </div>
        <p className={`text-3xl font-black leading-none text-${color}-600`}>
          {typeof value === 'number' ? value.toLocaleString('pt-BR') : value}
        </p>
        {sub && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{sub}</p>}
      </div>
    </div>
  );
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────
type ActiveTab = 'geral' | 'transacoes' | 'saldos' | 'consumo';

export function AnaliseDispensariosV2() {
  const [transacoes, setTransacoes] = useState<TransacaoRow[]>([]);
  const [saldoData, setSaldoData] = useState<{ dispensario: string; rows: SaldoRow[] } | null>(null);
  const [consumo, setConsumo] = useState<ConsumoRow[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('geral');
  const [isDragging, setIsDragging] = useState(false);
  const [saldoFilter, setSaldoFilter] = useState<'todos' | 'divergencias'>('divergencias');
  const [saldoSearch, setSaldoSearch] = useState('');
  const [consumoSearch, setConsumoSearch] = useState('');
  const [anomaliaAtiva, setAnomaliaAtiva] = useState<string | null>(null);
  const [anomaliaSearch, setAnomaliaSearch] = useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const text = e.target?.result as string;
        const type = detectFile(text);
        if (type === 'transacoes') setTransacoes(parseTransacoes(text));
        else if (type === 'saldos') setSaldoData(parseSaldos(text));
        else if (type === 'consumo') setConsumo(parseConsumo(text));
      };
      reader.readAsText(file, 'latin1');
    });
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false); handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const hasAny = transacoes.length > 0 || (saldoData?.rows.length ?? 0) > 0 || consumo.length > 0;

  // ─── Analytics ───────────────────────────────────────────────────────────
  const trxStats = useMemo(() => {
    if (!transacoes.length) return null;
    const movs = transacoes.filter(t => t.evento === 'Movimentação' && t.codProduto);
    const semRetirada = transacoes.filter(t => t.evento.toLowerCase().includes('sem retirada'));
    const substitutos = transacoes.filter(t => t.evento.toLowerCase().includes('substituto'));
    const assistidas = movs.filter(t => t.operacao.toLowerCase().includes('assistida'));

    const prodMap: Record<string, { desc: string; count: number; tipo: string }> = {};
    movs.forEach(t => {
      if (!prodMap[t.codProduto]) prodMap[t.codProduto] = { desc: t.descProduto, count: 0, tipo: t.tipo };
      prodMap[t.codProduto].count += t.qtde || 1;
    });
    const topProdutos = Object.entries(prodMap)
      .map(([cod, v]) => ({ name: v.desc.length > 28 ? v.desc.substring(0, 28) + '…' : v.desc, cod, count: v.count, tipo: v.tipo }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    const tipoMap: Record<string, number> = {};
    movs.forEach(t => { const k = t.tipo || '?'; tipoMap[k] = (tipoMap[k] || 0) + 1; });
    const tipoPie = Object.entries(tipoMap).map(([name, value]) => ({ name, value }));

    const userMap: Record<string, number> = {};
    transacoes.forEach(t => { if (t.usuario) userMap[t.usuario] = (userMap[t.usuario] || 0) + 1; });
    const topUsuarios = Object.entries(userMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count).slice(0, 10);

    const horaMap: Record<string, number> = {};
    movs.forEach(t => {
      const hora = (t.dataHora.split(' ')[1] || '00:00').substring(0, 2);
      horaMap[hora] = (horaMap[hora] || 0) + 1;
    });
    const porHora = Array.from({ length: 24 }, (_, i) => {
      const h = String(i).padStart(2, '0');
      return { hora: `${h}h`, count: horaMap[h] || 0 };
    });

    const dispensario = movs[0]?.dispensario?.replace('DISPENSARIO ', '').replace('UNIDADE ', '') || 'A1';

    // Tipos de operação (Avulsa / Conferida / Assistida)
    const opMap2: Record<string, { total: number; movs: number; tipo: string }> = {};
    transacoes.forEach(t => {
      const op = t.operacao || 'Outro';
      if (!opMap2[op]) opMap2[op] = { total: 0, movs: 0, tipo: op };
      opMap2[op].total++;
      if (t.evento === 'Movimentação' && t.codProduto) opMap2[op].movs++;
    });
    const opBreakdown = Object.values(opMap2).sort((a, b) => b.total - a.total);

    // Erros detalhados
    const gavetaAbertas = transacoes.filter(t =>
      t.evento.toLowerCase().includes('aberta pelo') && !t.codProduto);
    // qtde > 0 sem produto → possível retirada sem bipar
    const retiradaNaoRastreada = gavetaAbertas.filter(t => t.qtde > 0);
    // qtde = 0 → só abriu e fechou (improdutiva)
    const gavetaSemProduto = gavetaAbertas.filter(t => t.qtde === 0);
    const gavetaSemRetirada = transacoes.filter(t =>
      t.evento.toLowerCase().includes('sem retirada')).length;
    const codigoNaoLido = movs.filter(t => !t.codigoLido).length;
    const semIntegracao = movs.filter(t => t.integracao !== 'S').length;
    const substitutiChoices = transacoes.filter(t => t.evento.toLowerCase().includes('substituto escolhido')).length;
    const erros = [
      { label: 'Retirada sem bipar produto', count: retiradaNaoRastreada.length, desc: 'Gaveta aberta pelo usuário com qtde registrada mas sem produto identificado — possível retirada não rastreada', color: '#dc2626', severity: retiradaNaoRastreada.length > 0 ? 'critica' : 'baixa' },
      { label: 'Gaveta aberta sem retirada', count: gavetaSemRetirada, desc: 'Usuário abriu e fechou sem registrar nenhuma retirada', color: '#f59e0b', severity: gavetaSemRetirada / transacoes.length > 0.15 ? 'alta' : 'media' },
      { label: 'Abertura improdutiva (sem produto)', count: gavetaSemProduto.length, desc: 'Gaveta aberta pelo usuário sem produto e sem quantidade — abertura sem finalidade registrada', color: '#6366f1', severity: gavetaSemProduto.length / transacoes.length > 0.2 ? 'alta' : 'media' },
      { label: 'Retirada sem código lido', count: codigoNaoLido, desc: 'Produto dispensado sem leitura do código de barras', color: '#ef4444', severity: codigoNaoLido > 50 ? 'alta' : 'media' },
      { label: 'Sem integração hospitalar', count: semIntegracao, desc: 'Retirada não integrada com sistema hospitalar', color: '#b91c1c', severity: semIntegracao > 0 ? 'critica' : 'baixa' },
      { label: 'Substituto escolhido pelo usuário', count: substitutiChoices, desc: 'Item original indisponível, usuário selecionou substituto', color: '#06b6d4', severity: substitutiChoices > 20 ? 'alta' : 'media' },
    ].filter(e => e.count > 0);

    // Riscos assistenciais e financeiros
    const mecAvulso = movs.filter(t => t.tipo === 'MEC' && t.operacao.toLowerCase().includes('avulsa')).length;
    const medSemPrescrição = movs.filter(t => t.tipo === 'MED' && !t.prescricao && t.operacao.toLowerCase().includes('avulsa')).length;
    const riscos = {
      assistencial: [
        { titulo: 'Substitutos Utilizados', valor: substitutos.length, desc: 'Paciente pode ter recebido item diferente do prescrito', icon: '💊', severity: substitutos.length > 10 ? 'alta' : 'media' },
        { titulo: 'MEC Retirado sem Assistência', valor: mecAvulso, desc: 'Controlados dispensados sem supervisão de enfermeiro', icon: '🔴', severity: mecAvulso > 0 ? 'critica' : 'baixa' },
        { titulo: 'Sem Integração no Prontuário', valor: semIntegracao, desc: 'Medicação administrada sem registro hospitalar', icon: '📋', severity: semIntegracao > 0 ? 'critica' : 'baixa' },
        { titulo: 'Medicamento sem Prescrição', valor: medSemPrescrição, desc: 'MED retirado via avulsa sem prescrição vinculada', icon: '⚠️', severity: medSemPrescrição > 5 ? 'alta' : 'media' },
      ],
      financeiro: [
        { titulo: 'Itens não Faturáveis', valor: semIntegracao, desc: 'Dispensações não integradas = item não cobrado ao convênio', icon: '💸', severity: semIntegracao > 0 ? 'critica' : 'baixa' },
        { titulo: 'Aberturas Improdutivas', valor: gavetaSemRetirada + gavetaSemProduto.length, desc: 'Aberturas sem retirada geram custo operacional e desgaste no dispensário', icon: '⏱️', severity: (gavetaSemRetirada + gavetaSemProduto.length) / transacoes.length > 0.2 ? 'alta' : 'media' },
        { titulo: 'Código não Rastreado', valor: codigoNaoLido, desc: 'Sem rastreabilidade = auditoria comprometida', icon: '🔍', severity: codigoNaoLido > 30 ? 'alta' : 'media' },
        { titulo: 'Retiradas sem Confirmar Prescrição', valor: movs.filter(t => t.operacao.toLowerCase().includes('avulsa')).length, desc: 'Avulsas não vinculadas a aprazamento validado', icon: '📄', severity: 'media' },
      ],
    };

    const rowsByErro: Record<string, TransacaoRow[]> = {
      'Retirada sem bipar produto': retiradaNaoRastreada,
      'Gaveta aberta sem retirada': transacoes.filter(t => t.evento.toLowerCase().includes('sem retirada')),
      'Abertura improdutiva (sem produto)': gavetaSemProduto,
      'Retirada sem código lido': movs.filter(t => !t.codigoLido),
      'Sem integração hospitalar': movs.filter(t => t.integracao !== 'S'),
      'Substituto escolhido pelo usuário': transacoes.filter(t => t.evento.toLowerCase().includes('substituto escolhido')),
    };

    return {
      total: transacoes.length, movs: movs.length, semRetirada: semRetirada.length,
      pctSem: transacoes.length > 0 ? ((semRetirada.length / transacoes.length) * 100).toFixed(1) : '0',
      substitutos: substitutos.length, assistidas: assistidas.length,
      topProdutos, tipoPie, topUsuarios, porHora, dispensario,
      opBreakdown, erros, riscos, rowsByErro,
    };
  }, [transacoes]);

  const saldoStats = useMemo(() => {
    if (!saldoData?.rows.length) return null;
    const r = saldoData.rows;
    const div = r.filter(x => x.igual === 'N');
    const semWL = r.filter(x => x.saldoWL === 0 && x.saldoHosp > 0);
    return {
      total: r.length, div: div.length, semWL: semWL.length,
      precisao: ((r.length - div.length) / r.length * 100).toFixed(1),
    };
  }, [saldoData]);

  const planoStats = useMemo(() => {
    if (!saldoData?.rows.length) return [];
    const map: Record<string, { plano: PlanoAcao; count: number }> = {};
    saldoData.rows.filter(r => r.igual === 'N').forEach(r => {
      const p = getPlanoAcao(r);
      if (!map[p.label]) map[p.label] = { plano: p, count: 0 };
      map[p.label].count++;
    });
    return Object.values(map).sort((a, b) => PRIORITY_ORDER[a.plano.priority] - PRIORITY_ORDER[b.plano.priority]);
  }, [saldoData]);

  const consumoStats = useMemo(() => {
    if (!consumo.length) return null;
    const sorted = [...consumo].sort((a, b) => b.quantidade - a.quantidade);
    const totalUnits = consumo.reduce((s, r) => s + r.quantidade, 0);
    const top20 = sorted.slice(0, 20);
    const top1 = sorted[0];
    const media = totalUnits / consumo.length;

    // Classificação ABC
    const altaRot = consumo.filter(r => r.quantidade > media).length;
    const mediaRot = consumo.filter(r => r.quantidade > media * 0.25 && r.quantidade <= media).length;
    const baixaRot = consumo.filter(r => r.quantidade <= media * 0.25).length;

    // Pareto: quantos SKUs = 80% do consumo
    let cum = 0; let pareto80 = 0;
    for (const item of sorted) {
      cum += item.quantidade; pareto80++;
      if (cum / totalUnits >= 0.8) break;
    }

    // Concentração top 10
    const top10Total = sorted.slice(0, 10).reduce((s, r) => s + r.quantidade, 0);
    const top10Pct = totalUnits > 0 ? (top10Total / totalUnits * 100).toFixed(1) : '0';

    // Por tipo de unidade
    const unidMap: Record<string, number> = {};
    consumo.forEach(r => {
      const u = (r.unidade || 'N/A').trim();
      unidMap[u] = (unidMap[u] || 0) + r.quantidade;
    });
    const porUnidade = Object.entries(unidMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name: name.length > 18 ? name.substring(0, 18) + '…' : name, value }));

    // Curva de Pareto (top 30, acumulado %)
    let acc = 0;
    const paretoCurve = sorted.slice(0, 30).map((r, i) => {
      acc += r.quantidade;
      return {
        rank: i + 1,
        name: r.descricao.length > 22 ? r.descricao.substring(0, 22) + '…' : r.descricao,
        qtde: r.quantidade,
        pct: parseFloat((acc / totalUnits * 100).toFixed(1)),
      };
    });

    return {
      items: consumo.length, totalUnits, top20, top1, media,
      altaRot, mediaRot, baixaRot, pareto80,
      top10Pct, porUnidade, paretoCurve,
    };
  }, [consumo]);

  const alertasCruzados = useMemo(() => {
    if (!consumo.length || !saldoData?.rows.length) return [];
    const divSet = new Set(saldoData.rows.filter(r => r.igual === 'N').map(r => r.codigo));
    return consumo.filter(c => divSet.has(c.produto) && c.quantidade > 0)
      .sort((a, b) => b.quantidade - a.quantidade).slice(0, 8);
  }, [consumo, saldoData]);

  const filteredSaldos = useMemo(() => {
    if (!saldoData?.rows) return [];
    let rows = saldoData.rows;
    if (saldoFilter === 'divergencias') rows = rows.filter(r => r.igual === 'N');
    if (saldoSearch) {
      const s = saldoSearch.toLowerCase();
      rows = rows.filter(r => r.codigo.includes(s) || r.descricao.toLowerCase().includes(s) || r.gaveta.includes(s));
    }
    return rows;
  }, [saldoData, saldoFilter, saldoSearch]);

  const filteredConsumo = useMemo(() => {
    let rows = [...consumo].sort((a, b) => b.quantidade - a.quantidade);
    if (consumoSearch) {
      const s = consumoSearch.toLowerCase();
      rows = rows.filter(r => r.produto.includes(s) || r.descricao.toLowerCase().includes(s));
    }
    return rows;
  }, [consumo, consumoSearch]);

  // Mapa gaveta → produtos cadastrados (do arquivo de Saldos)
  const gavetaMap = useMemo(() => {
    if (!saldoData?.rows.length) return {} as Record<string, SaldoRow[]>;
    const map: Record<string, SaldoRow[]> = {};
    saldoData.rows.forEach(r => {
      const g = (r.gaveta || '').trim();
      if (!g) return;
      if (!map[g]) map[g] = [];
      map[g].push(r);
    });
    return map;
  }, [saldoData]);

  // ─── CRUZAMENTO POR SOLICITAÇÃO ───────────────────────────────────────────
  // Agrupa movimentações por atendimento + produto → identifica falsos positivos
  // (itens com dispensa e devolução na mesma solicitação cujo net = 0)
  const cruzamentoSolic = useMemo(() => {
    if (!transacoes.length) return null;
    const movs = transacoes.filter(t => t.evento === 'Movimentação' && t.codProduto && t.atendimento);

    // Chave: atendimento|codProduto
    type Linha = {
      atendimento: string; codProduto: string; descProduto: string;
      tipo: string; usuario: string;
      dispensas: number; devolucoes: number; net: number;
      nMovs: number;
      classe: 'compensado' | 'excesso' | 'normal' | 'devolucao_pura';
      movimentos: TransacaoRow[];
    };

    const map = new Map<string, Linha>();
    movs.forEach(t => {
      const key = `${t.atendimento}|${t.codProduto}`;
      if (!map.has(key)) {
        map.set(key, {
          atendimento: t.atendimento, codProduto: t.codProduto,
          descProduto: t.descProduto, tipo: t.tipo, usuario: t.usuario,
          dispensas: 0, devolucoes: 0, net: 0, nMovs: 0,
          classe: 'normal', movimentos: [],
        });
      }
      const l = map.get(key)!;
      const q = t.qtde ?? 0;
      if (q > 0) l.dispensas += q;
      else if (q < 0) l.devolucoes += Math.abs(q);
      l.net += q;
      l.nMovs++;
      l.movimentos.push(t);
    });

    // Classificar
    map.forEach(l => {
      if (l.devolucoes > 0 && l.net === 0) l.classe = 'compensado';       // falso positivo: dispensou e devolveu tudo
      else if (l.devolucoes > 0 && l.net > 0) l.classe = 'excesso';       // dispensou a mais (net > prescrito?)
      else if (l.dispensas === 0 && l.devolucoes > 0) l.classe = 'devolucao_pura'; // só devolução
      else l.classe = 'normal';
    });

    const linhas = Array.from(map.values());

    const compensados   = linhas.filter(l => l.classe === 'compensado');
    const excessos      = linhas.filter(l => l.classe === 'excesso');
    const devolucaoPura = linhas.filter(l => l.classe === 'devolucao_pura');
    const normais       = linhas.filter(l => l.classe === 'normal');

    // Produtos mais frequentemente compensados (falsos positivos)
    const topCompensados: Record<string, { produto: string; vezes: number; unidades: number }> = {};
    compensados.forEach(l => {
      if (!topCompensados[l.codProduto])
        topCompensados[l.codProduto] = { produto: l.descProduto, vezes: 0, unidades: 0 };
      topCompensados[l.codProduto].vezes++;
      topCompensados[l.codProduto].unidades += l.dispensas;
    });
    const rankCompensados = Object.values(topCompensados)
      .sort((a, b) => b.vezes - a.vezes).slice(0, 10);

    // Unidades totais devolvidas
    const totalDevolvidas = linhas.reduce((s, l) => s + l.devolucoes, 0);
    const totalDispensadas = linhas.reduce((s, l) => s + l.dispensas, 0);

    return {
      linhas,
      compensados, excessos, devolucaoPura, normais,
      totalDevolvidas, totalDispensadas,
      rankCompensados,
      atendimentosUnicos: new Set(movs.map(t => t.atendimento)).size,
    };
  }, [transacoes]);

  const [cruzSearch, setCruzSearch] = useState('');
  const [cruzFilter, setCruzFilter] = useState<'todos' | 'compensado' | 'excesso' | 'devolucao_pura'>('todos');
  const [trxSubTab, setTrxSubTab] = useState<'anomalias' | 'cruzamento'>('anomalias');

  const filteredCruz = useMemo(() => {
    if (!cruzamentoSolic) return [];
    let rows = cruzamentoSolic.linhas.filter(l => l.classe !== 'normal' || cruzFilter === 'todos');
    if (cruzFilter !== 'todos') rows = cruzamentoSolic.linhas.filter(l => l.classe === cruzFilter);
    else rows = cruzamentoSolic.linhas.filter(l => l.classe !== 'normal'); // oculta normais por default
    if (cruzSearch.trim()) {
      const q = cruzSearch.toLowerCase();
      rows = rows.filter(l =>
        l.descProduto.toLowerCase().includes(q) ||
        l.atendimento.includes(q) ||
        l.codProduto.includes(q)
      );
    }
    return rows.sort((a, b) => {
      // compensados primeiro, depois excesso, depois devolução pura
      const order = { compensado: 0, excesso: 1, devolucao_pura: 2, normal: 3 };
      return order[a.classe] - order[b.classe];
    });
  }, [cruzamentoSolic, cruzFilter, cruzSearch]);

  // ─── EMPTY STATE ─────────────────────────────────────────────────────────
  if (!hasAny) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4 border border-indigo-100">
            <Activity className="w-3.5 h-3.5" /> DISPENSÁRIO INTELIGENTE
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Análise Dispensários V2</h1>
          <p className="text-slate-500 text-sm max-w-md mx-auto">
            Importe os arquivos do dispensário para análise integrada de transações, saldos e consumo.
          </p>
        </div>

        {/* 3 file type cards */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          {[
            { icon: Activity, color: 'indigo', title: 'Análise Transações', desc: 'CSV de movimentações do dispensário (separador ;)' },
            { icon: BarChart3, color: 'emerald', title: 'Comparação de Saldos', desc: 'CSV de comparação WL × Hosp × Trn (separador ;)' },
            { icon: Package, color: 'amber', title: 'Consumo', desc: 'CSV de consumo por produto (separador ,)' },
          ].map(({ icon: Icon, color, title, desc }) => (
            <div key={title} className={`bg-${color}-50 border border-${color}-100 rounded-xl p-4 text-center`}>
              <Icon className={`w-6 h-6 text-${color}-500 mx-auto mb-2`} />
              <p className={`text-xs font-bold text-${color}-700 mb-1`}>{title}</p>
              <p className="text-[11px] text-slate-500">{desc}</p>
            </div>
          ))}
        </div>

        {/* Dropzone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all duration-200 ${
            isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:border-indigo-300 hover:bg-indigo-50/50'
          }`}
        >
          <Upload className={`w-10 h-10 mx-auto mb-3 transition-colors ${isDragging ? 'text-indigo-500' : 'text-slate-300'}`} />
          <p className="text-sm font-bold text-slate-600 mb-1">Arraste os CSVs aqui</p>
          <p className="text-xs text-slate-400">Pode soltar 1, 2 ou 3 arquivos de uma vez — identificação automática</p>
          <button className="mt-4 px-6 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition-colors">
            Selecionar Arquivos
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" multiple className="hidden"
            onChange={e => handleFiles(e.target.files)} />
        </div>
      </div>
    );
  }

  // ─── LOADED STATE ─────────────────────────────────────────────────────────
  const tabs: { id: ActiveTab; label: string; icon: any; active: boolean }[] = [
    { id: 'geral', label: 'Visão Geral', icon: Layers, active: true },
    { id: 'transacoes', label: 'Transações', icon: Activity, active: transacoes.length > 0 },
    { id: 'saldos', label: 'Comparação Saldos', icon: BarChart3, active: (saldoData?.rows.length ?? 0) > 0 },
    { id: 'consumo', label: 'Consumo', icon: Package, active: consumo.length > 0 },
  ];

  return (
    <div className="space-y-6">
      {/* ─── HEADER ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-5 h-5 text-indigo-600" />
              <h1 className="text-xl font-black text-slate-900">Análise Dispensários V2</h1>
              {trxStats?.dispensario && (
                <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">
                  {trxStats.dispensario}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                transacoes.length > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {transacoes.length > 0 ? `✓ Transações (${transacoes.length.toLocaleString('pt-BR')})` : '○ Transações'}
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                (saldoData?.rows.length ?? 0) > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {(saldoData?.rows.length ?? 0) > 0 ? `✓ Saldos (${saldoData!.rows.length.toLocaleString('pt-BR')})` : '○ Saldos'}
              </span>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                consumo.length > 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-400 border-slate-200'
              }`}>
                {consumo.length > 0 ? `✓ Consumo (${consumo.length.toLocaleString('pt-BR')})` : '○ Consumo'}
              </span>
            </div>
          </div>
          <div
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileRef.current?.click()}
            className={`flex items-center gap-2 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer text-xs font-bold transition-all ${
              isDragging ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-300 text-slate-400 hover:border-indigo-300 hover:text-indigo-600'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            {isDragging ? 'Solte aqui' : 'Adicionar arquivo'}
            <input ref={fileRef} type="file" accept=".csv,.txt" multiple className="hidden"
              onChange={e => handleFiles(e.target.files)} />
          </div>
        </div>
      </div>

      {/* ─── TABS ─────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => tab.active && setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-sm'
                : tab.active
                  ? 'text-slate-500 hover:text-slate-700'
                  : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
            {!tab.active && <span className="text-[10px] opacity-60">(sem dados)</span>}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TAB: VISÃO GERAL
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'geral' && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${transacoes.length > 0 ? 'bg-indigo-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Movimentações</span>
                  <div className="p-1.5 rounded-lg bg-indigo-50"><Activity className="w-3.5 h-3.5 text-indigo-500" /></div>
                </div>
                <p className={`text-3xl font-black leading-none ${transacoes.length > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                  {(trxStats?.movs ?? 0).toLocaleString('pt-BR')}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Retiradas com produto</p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${saldoStats ? (parseFloat(saldoStats.precisao) >= 90 ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Precisão Saldo</span>
                  <div className={`p-1.5 rounded-lg ${saldoStats ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                    <BarChart3 className={`w-3.5 h-3.5 ${saldoStats ? 'text-emerald-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${saldoStats ? (parseFloat(saldoStats.precisao) >= 90 ? 'text-emerald-600' : 'text-rose-600') : 'text-slate-300'}`}>
                  {saldoStats ? `${saldoStats.precisao}%` : '—'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                  {saldoStats ? `${saldoStats.div} divergências` : 'Sem dados'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${consumo.length > 0 ? 'bg-amber-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Itens Consumidos</span>
                  <div className="p-1.5 rounded-lg bg-amber-50"><Package className="w-3.5 h-3.5 text-amber-500" /></div>
                </div>
                <p className={`text-3xl font-black leading-none ${consumo.length > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                  {consumoStats ? consumoStats.totalUnits.toLocaleString('pt-BR') : '—'}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">
                  {consumoStats ? `${consumoStats.items} produtos distintos` : 'Sem dados'}
                </p>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${alertasCruzados.length > 0 ? 'bg-rose-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Alertas Cruzados</span>
                  <div className={`p-1.5 rounded-lg ${alertasCruzados.length > 0 ? 'bg-rose-50' : 'bg-slate-50'}`}>
                    <AlertTriangle className={`w-3.5 h-3.5 ${alertasCruzados.length > 0 ? 'text-rose-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${alertasCruzados.length > 0 ? 'text-rose-600' : 'text-slate-300'}`}>
                  {alertasCruzados.length}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Consumo alto + divergência</p>
              </div>
            </div>
          </div>

          {/* Alertas cruzados */}
          {alertasCruzados.length > 0 && (
            <div className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-rose-500" />
              <div className="p-5">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  <h3 className="text-sm font-black text-slate-900">Produtos com Alto Consumo e Divergência de Saldo</h3>
                  <span className="text-[11px] font-bold bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">{alertasCruzados.length} itens</span>
                </div>
                <div className="space-y-2">
                  {alertasCruzados.map((item, i) => {
                    const saldo = saldoData?.rows.find(r => r.codigo === item.produto);
                    return (
                      <div key={i} className="flex items-center gap-3 p-3 bg-rose-50/50 rounded-lg border border-rose-100">
                        <span className="text-[11px] font-black text-rose-400 w-5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-700 truncate">{item.descricao}</p>
                          <p className="text-[11px] text-slate-400">Cód: {item.produto} · Gaveta: {saldo?.gaveta || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-amber-600">{item.quantidade.toFixed(0)} un.</p>
                          <p className="text-[11px] text-slate-400">consumido</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-black text-rose-600">WL: {saldo?.saldoWL ?? '—'}</p>
                          <p className="text-[11px] text-slate-400">Hosp: {saldo?.saldoHosp ?? '—'}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Quick summary cards */}
          {!alertasCruzados.length && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-800">Análise cruzada indisponível</p>
                <p className="text-xs text-emerald-600">Importe os arquivos de Saldos e Consumo juntos para detectar alertas de divergência.</p>
              </div>
            </div>
          )}

          {/* Quick-access buttons */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'transacoes' as ActiveTab, icon: Activity, color: 'indigo', label: 'Ver Análise de Transações', active: transacoes.length > 0 },
              { id: 'saldos' as ActiveTab, icon: BarChart3, color: 'emerald', label: 'Ver Comparação de Saldos', active: (saldoData?.rows.length ?? 0) > 0 },
              { id: 'consumo' as ActiveTab, icon: Package, color: 'amber', label: 'Ver Ranking de Consumo', active: consumo.length > 0 },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => item.active && setActiveTab(item.id)}
                className={`flex items-center justify-between p-4 rounded-xl border transition-all ${
                  item.active
                    ? `bg-${item.color}-50 border-${item.color}-200 hover:bg-${item.color}-100 cursor-pointer`
                    : 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <item.icon className={`w-4 h-4 text-${item.color}-500`} />
                  <span className={`text-xs font-bold ${item.active ? `text-${item.color}-700` : 'text-slate-400'}`}>{item.label}</span>
                </div>
                <ChevronRight className={`w-4 h-4 ${item.active ? `text-${item.color}-400` : 'text-slate-300'}`} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: TRANSAÇÕES
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'transacoes' && trxStats && (
        <div className="space-y-5">

          {/* ── Sub-tabs Anomalias | Cruzamento ──────────────────────────── */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
            <button onClick={() => setTrxSubTab('anomalias')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all ${
                trxSubTab === 'anomalias' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <AlertTriangle className="w-3.5 h-3.5" />
              Anomalias & Riscos
            </button>
            <button onClick={() => setTrxSubTab('cruzamento')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all ${
                trxSubTab === 'cruzamento' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              <Layers className="w-3.5 h-3.5" />
              Cruzamento por Solicitação
              {cruzamentoSolic && cruzamentoSolic.compensados.length > 0 && (
                <span className="bg-violet-100 text-violet-700 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                  {cruzamentoSolic.compensados.length} falsos +
                </span>
              )}
            </button>
          </div>

          {/* ── CRUZAMENTO POR SOLICITAÇÃO ───────────────────────────────── */}
          {trxSubTab === 'cruzamento' && cruzamentoSolic && (
            <div className="space-y-5">

              {/* Callout explicativo */}
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Layers className="w-4 h-4 text-violet-600" />
                </div>
                <div>
                  <p className="text-xs font-black text-violet-900 mb-1">O que é o cruzamento por solicitação?</p>
                  <p className="text-xs text-violet-700 leading-relaxed">
                    Agrupa todas as movimentações pelo par <b>Atendimento + Produto</b> e calcula o saldo líquido (dispensas − devoluções).
                    Se o mesmo produto foi dispensado <b>+1</b> e depois devolvido <b>-1</b> na mesma solicitação, o net é <b>zero</b> —
                    isso é um <b>falso positivo</b>: aparece como anomalia individual mas na prática não houve erro líquido.
                    Já se o net for positivo com devoluções, significa que parte foi devolvida mas ainda saiu mais do que o esperado (<b>excesso real</b>).
                  </p>
                </div>
              </div>

              {/* KPIs cruzamento */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Falso Positivo (net=0)', value: cruzamentoSolic.compensados.length, color: '#7c3aed', bg: 'bg-violet-50', desc: 'dispensado e devolvido na mesma solic.' },
                  { label: 'Excesso Real (net>0)',   value: cruzamentoSolic.excessos.length,     color: '#dc2626', bg: 'bg-red-50',    desc: 'devolução parcial mas ainda sobrou' },
                  { label: 'Devolução Pura',         value: cruzamentoSolic.devolucaoPura.length,color: '#d97706', bg: 'bg-amber-50',  desc: 'só devolveu, sem dispensa registrada' },
                  { label: 'Un. Devolvidas',         value: cruzamentoSolic.totalDevolvidas,      color: '#2563eb', bg: 'bg-blue-50',   desc: `de ${cruzamentoSolic.totalDispensadas.toLocaleString('pt-BR')} dispensadas` },
                ].map(({ label, value, color, bg, desc }) => (
                  <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="h-[3px] w-full" style={{ background: color }} />
                    <div className="p-4">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2 leading-tight">{label}</p>
                      <p className="text-3xl font-black" style={{ color }}>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Top produtos compensados */}
              {cruzamentoSolic.rankCompensados.length > 0 && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
                  <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">
                    Produtos com Mais Falsos Positivos (Auto-Compensados)
                  </h3>
                  <div className="space-y-2">
                    {cruzamentoSolic.rankCompensados.map((r, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[11px] font-black text-slate-400 w-5 text-right shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-bold text-slate-700 truncate" title={r.produto}>
                              {r.produto.length > 55 ? r.produto.substring(0, 55) + '…' : r.produto}
                            </span>
                            <span className="text-[11px] font-black text-violet-700 shrink-0 ml-2">{r.vezes}x</span>
                          </div>
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-violet-400 rounded-full"
                              style={{ width: `${(r.vezes / cruzamentoSolic.rankCompensados[0].vezes) * 100}%` }} />
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 w-20 text-right">{r.unidades.toLocaleString('pt-BR')} un.</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtros + Tabela */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-lg flex-wrap">
                      {([
                        { id: 'todos',          label: `Todos c/ movim. (${(cruzamentoSolic.compensados.length + cruzamentoSolic.excessos.length + cruzamentoSolic.devolucaoPura.length)})` },
                        { id: 'compensado',     label: `🟣 Falso Positivo (${cruzamentoSolic.compensados.length})` },
                        { id: 'excesso',        label: `🔴 Excesso Real (${cruzamentoSolic.excessos.length})` },
                        { id: 'devolucao_pura', label: `🟡 Devolução Pura (${cruzamentoSolic.devolucaoPura.length})` },
                      ] as const).map(f => (
                        <button key={f.id} onClick={() => setCruzFilter(f.id)}
                          className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold transition-all whitespace-nowrap ${
                            cruzFilter === f.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                          }`}>
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input type="text" placeholder="Buscar por produto, atendimento ou código..."
                      value={cruzSearch} onChange={e => setCruzSearch(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 border-b border-slate-200 pb-1" />
                    <span className="text-xs text-slate-400 shrink-0">{filteredCruz.length} itens</span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 z-10">
                      <tr className="bg-slate-800">
                        <th className="text-[11px] font-bold text-slate-400 px-3 py-3">#</th>
                        <th className="text-[11px] font-bold text-white px-3 py-3">Atendimento</th>
                        <th className="text-[11px] font-bold text-white px-3 py-3">Produto</th>
                        <th className="text-[11px] font-bold text-slate-400 px-3 py-3">Tipo</th>
                        <th className="text-right text-[11px] font-bold text-emerald-400 px-3 py-3">Dispensado</th>
                        <th className="text-right text-[11px] font-bold text-rose-400 px-3 py-3">Devolvido</th>
                        <th className="text-right text-[11px] font-bold text-white px-3 py-3">Net</th>
                        <th className="text-[11px] font-bold text-slate-400 px-3 py-3">Movs</th>
                        <th className="text-center text-[11px] font-bold text-white px-3 py-3">Classificação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCruz.slice(0, 400).map((l, i) => {
                        const classCfg = {
                          compensado:     { bg: 'bg-violet-100 text-violet-700', label: '🟣 Falso Positivo', border: '#7c3aed' },
                          excesso:        { bg: 'bg-red-100 text-red-700',       label: '🔴 Excesso Real',   border: '#dc2626' },
                          devolucao_pura: { bg: 'bg-amber-100 text-amber-700',   label: '🟡 Dev. Pura',      border: '#d97706' },
                          normal:         { bg: 'bg-slate-100 text-slate-500',   label: '— Normal',          border: '#cbd5e1' },
                        }[l.classe];
                        return (
                          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50 transition-colors"
                            style={{ borderLeft: `3px solid ${classCfg.border}` }}>
                            <td className="px-3 py-2.5 text-xs text-slate-400 font-black">{i + 1}</td>
                            <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{l.atendimento}</td>
                            <td className="px-3 py-2.5 max-w-[260px]">
                              <p className="text-xs font-bold text-slate-700 leading-snug truncate" title={l.descProduto}>
                                {l.descProduto.length > 42 ? l.descProduto.substring(0, 42) + '…' : l.descProduto}
                              </p>
                              <p className="text-[10px] font-mono text-slate-400">{l.codProduto}</p>
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-slate-500">{l.tipo || '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-black text-emerald-600">{l.dispensas > 0 ? `+${l.dispensas}` : '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-black text-rose-600">{l.devolucoes > 0 ? `-${l.devolucoes}` : '—'}</td>
                            <td className="px-3 py-2.5 text-xs text-right font-black">
                              <span className={l.net === 0 ? 'text-violet-600' : l.net > 0 ? 'text-slate-700' : 'text-amber-600'}>
                                {l.net > 0 ? `+${l.net}` : l.net}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-center text-slate-400">{l.nMovs}</td>
                            <td className="px-3 py-2.5 text-center">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${classCfg.bg}`}>
                                {classCfg.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filteredCruz.length === 0 && (
                    <div className="p-8 text-center text-xs text-slate-400">
                      Nenhum item encontrado com os filtros atuais.
                    </div>
                  )}
                  {filteredCruz.length > 400 && (
                    <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t">
                      Exibindo 400 de {filteredCruz.length} itens. Use a busca para refinar.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── ANOMALIAS (sub-tab) ────────── só renderiza se sub-tab = anomalias ── */}
          {trxSubTab === 'anomalias' && (
          <div className="space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-indigo-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Movimentações</span>
                  <div className="p-1.5 rounded-lg bg-indigo-50"><Activity className="w-3.5 h-3.5 text-indigo-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-indigo-600">{trxStats.movs.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">de {trxStats.total.toLocaleString('pt-BR')} eventos</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${parseFloat(trxStats.pctSem) > 15 ? 'bg-rose-500' : 'bg-amber-400'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sem Retirada</span>
                  <div className={`p-1.5 rounded-lg ${parseFloat(trxStats.pctSem) > 15 ? 'bg-rose-50' : 'bg-amber-50'}`}>
                    <XCircle className={`w-3.5 h-3.5 ${parseFloat(trxStats.pctSem) > 15 ? 'text-rose-500' : 'text-amber-500'}`} />
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <p className={`text-3xl font-black leading-none ${parseFloat(trxStats.pctSem) > 15 ? 'text-rose-600' : 'text-amber-600'}`}>{trxStats.pctSem}%</p>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{trxStats.semRetirada.toLocaleString('pt-BR')} aberturas</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-violet-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Assistidas</span>
                  <div className="p-1.5 rounded-lg bg-violet-50"><Users className="w-3.5 h-3.5 text-violet-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-violet-600">{trxStats.assistidas.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Retiradas com enfermeiro</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${trxStats.substitutos > 0 ? 'bg-cyan-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Substitutos</span>
                  <div className={`p-1.5 rounded-lg ${trxStats.substitutos > 0 ? 'bg-cyan-50' : 'bg-slate-50'}`}>
                    <RefreshCw className={`w-3.5 h-3.5 ${trxStats.substitutos > 0 ? 'text-cyan-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${trxStats.substitutos > 0 ? 'text-cyan-600' : 'text-slate-300'}`}>
                  {trxStats.substitutos.toLocaleString('pt-BR')}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Produtos substitutos usados</p>
              </div>
            </div>
          </div>

          {/* Pie + Area */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribuição por Tipo</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={trxStats.tipoPie} cx="50%" cy="50%" outerRadius={75} dataKey="value" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {trxStats.tipoPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => v.toLocaleString('pt-BR')} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Atividade por Hora</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={trxStats.porHora}>
                  <defs>
                    <linearGradient id="colorHora" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval={3} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" name="Movimentos" stroke="#6366f1" fill="url(#colorHora)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top produtos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 10 Produtos Mais Retirados</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trxStats.topProdutos} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={220} tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Qtde retirada" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Top usuários */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Top Usuários por Nº de Eventos</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="text-left text-[11px] font-bold text-white px-4 py-3">#</th>
                    <th className="text-left text-[11px] font-bold text-white px-4 py-3">Usuário</th>
                    <th className="text-right text-[11px] font-bold text-white px-4 py-3">Eventos</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">% Total</th>
                  </tr>
                </thead>
                <tbody>
                  {trxStats.topUsuarios.map((u, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-4 py-3 text-xs font-black text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-700">{u.name}</td>
                      <td className="px-4 py-3 text-xs font-black text-indigo-600 text-right">{u.count.toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3 text-xs text-slate-400 text-right">{((u.count / trxStats.total) * 100).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ─── TIPOS DE OPERAÇÃO ──────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Tipos de Operação</h3>
              <span className="text-[11px] text-slate-400">{trxStats.opBreakdown.length} tipos identificados</span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {trxStats.opBreakdown.map((op, i) => {
                const efic = op.total > 0 ? (op.movs / op.total * 100) : 0;
                const color = i === 0 ? '#6366f1' : i === 1 ? '#8b5cf6' : i === 2 ? '#06b6d4' : '#64748b';
                return (
                  <div key={op.tipo} className="rounded-xl border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-700 leading-tight">{op.tipo}</span>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: color }}>
                        {op.total.toLocaleString('pt-BR')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">Movimentações efetivas</span>
                        <span className="font-black" style={{ color }}>{op.movs.toLocaleString('pt-BR')}</span>
                      </div>
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">Eficiência da operação</span>
                        <span className={`font-black ${efic >= 50 ? 'text-emerald-600' : 'text-amber-600'}`}>{efic.toFixed(1)}%</span>
                      </div>
                    </div>
                    {/* Barra de eficiência */}
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(efic, 100)}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── ERROS IDENTIFICADOS ─────────────────────────────────────── */}
          {trxStats.erros.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-400" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Erros e Anomalias</h3>
                <span className="text-[11px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">
                  {trxStats.erros.reduce((s, e) => s + e.count, 0).toLocaleString('pt-BR')} ocorrências
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-800">
                      <th className="text-left text-[11px] font-bold text-white px-4 py-3">Tipo de Erro</th>
                      <th className="text-left text-[11px] font-bold text-slate-400 px-4 py-3">Descrição</th>
                      <th className="text-right text-[11px] font-bold text-white px-4 py-3">Ocorrências</th>
                      <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">% do Total</th>
                      <th className="text-center text-[11px] font-bold text-slate-400 px-4 py-3">Severidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trxStats.erros.map((e, i) => {
                      const isActive = anomaliaAtiva === e.label;
                      return (
                        <tr key={i}
                          onClick={() => { setAnomaliaAtiva(isActive ? null : e.label); setAnomaliaSearch(''); }}
                          className={`cursor-pointer transition-colors ${isActive ? 'bg-slate-100' : i % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}`}
                          style={{ borderLeft: `3px solid ${e.color}` }}>
                          <td className="px-4 py-3 text-xs font-black" style={{ color: e.color }}>
                            <span className="flex items-center gap-1.5">
                              <span className={`transition-transform text-slate-400 text-[10px] ${isActive ? 'rotate-90' : ''}`}>▶</span>
                              {e.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 max-w-[280px]">{e.desc}</td>
                          <td className="px-4 py-3 text-xs font-black text-right" style={{ color: e.color }}>
                            {e.count.toLocaleString('pt-BR')}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 text-right">
                            {(e.count / trxStats.total * 100).toFixed(1)}%
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{
                              background: e.severity === 'critica' ? '#fff1f2' : e.severity === 'alta' ? '#fff7ed' : '#fefce8',
                              color: e.severity === 'critica' ? '#dc2626' : e.severity === 'alta' ? '#ea580c' : '#ca8a04'
                            }}>
                              {e.severity === 'critica' ? '🔴 CRÍTICA' : e.severity === 'alta' ? '🟠 ALTA' : '🟡 MÉDIA'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ─── DETALHAMENTO DE ANOMALIAS ───────────────────────────────── */}
          {anomaliaAtiva && trxStats?.rowsByErro[anomaliaAtiva] && (() => {
            const erroObj = trxStats.erros.find(e => e.label === anomaliaAtiva)!;
            const allRows = trxStats.rowsByErro[anomaliaAtiva];
            const filtered = anomaliaSearch
              ? allRows.filter(r =>
                  r.descProduto.toLowerCase().includes(anomaliaSearch.toLowerCase()) ||
                  r.codProduto.includes(anomaliaSearch) ||
                  r.usuario.toLowerCase().includes(anomaliaSearch.toLowerCase()) ||
                  r.atendimento.includes(anomaliaSearch) ||
                  r.gaveta.toLowerCase().includes(anomaliaSearch.toLowerCase())
                )
              : allRows;
            const shown = filtered.slice(0, 200);
            return (
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: erroObj.color + '55' }}>
                <div className="px-5 py-4 border-b flex items-center gap-3 flex-wrap" style={{ borderColor: erroObj.color + '33', background: erroObj.color + '08' }}>
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: erroObj.color }} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-black text-slate-900">{anomaliaAtiva}</h3>
                    <p className="text-[11px] text-slate-400">{erroObj.desc}</p>
                  </div>
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white shrink-0" style={{ background: erroObj.color }}>
                    {allRows.length.toLocaleString('pt-BR')} registros
                  </span>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-1.5 min-w-[200px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Filtrar por produto, usuário, atendimento..."
                      value={anomaliaSearch}
                      onChange={e => setAnomaliaSearch(e.target.value)}
                      onClick={ev => ev.stopPropagation()}
                      className="text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400 w-full"
                    />
                  </div>
                  <button
                    onClick={() => setAnomaliaAtiva(null)}
                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded transition-colors shrink-0"
                  >✕ Fechar</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-left">
                        <th className="px-3 py-2.5 text-[11px] font-bold text-white whitespace-nowrap">Data / Hora</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-white whitespace-nowrap">Operação</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-white whitespace-nowrap">Gaveta</th>
                        {Object.keys(gavetaMap).length > 0 && (
                          <th className="px-3 py-2.5 text-[11px] font-bold text-amber-300 whitespace-nowrap">
                            Produtos na Gaveta
                          </th>
                        )}
                        <th className="px-3 py-2.5 text-[11px] font-bold text-white whitespace-nowrap">Cód. Produto</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-white">Descrição do Produto</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-right whitespace-nowrap">Qtde</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 whitespace-nowrap">Usuário</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 whitespace-nowrap">Atendimento</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 whitespace-nowrap">Prescrição</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 text-center whitespace-nowrap">Integração</th>
                        <th className="px-3 py-2.5 text-[11px] font-bold text-slate-400 whitespace-nowrap">Evento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((row, i) => {
                        const prodsDaGaveta = gavetaMap[(row.gaveta || '').trim()] || [];
                        return (
                        <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'} style={{ borderLeft: `3px solid ${erroObj.color}` }}>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.dataHora}</td>
                          <td className="px-3 py-2 font-semibold text-slate-700 whitespace-nowrap">{row.operacao}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{row.gaveta || '—'}</td>
                          {Object.keys(gavetaMap).length > 0 && (
                            <td className="px-3 py-2 max-w-[220px]">
                              {prodsDaGaveta.length === 0 ? (
                                <span className="text-[10px] text-slate-300">Gaveta não encontrada no arquivo de saldos</span>
                              ) : (
                                <div className="space-y-1">
                                  {prodsDaGaveta.slice(0, 2).map((p, pi) => (
                                    <div key={pi} className="flex items-start gap-1">
                                      <span className="text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">{p.codigo}</span>
                                      <span className="text-[10px] text-slate-600 leading-tight truncate" title={p.descricao}>{p.descricao}</span>
                                      {p.igual === 'N' && (
                                        <span className="text-[9px] font-bold text-rose-500 bg-rose-50 px-1 rounded shrink-0">⚠</span>
                                      )}
                                    </div>
                                  ))}
                                  {prodsDaGaveta.length > 2 && (
                                    <span className="text-[10px] font-bold text-indigo-400">
                                      +{prodsDaGaveta.length - 2} produto{prodsDaGaveta.length - 2 > 1 ? 's' : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">{row.codProduto || '—'}</td>
                          <td className="px-3 py-2 text-slate-700 max-w-[240px] truncate" title={row.descProduto}>{row.descProduto || '—'}</td>
                          <td className="px-3 py-2 font-black text-right whitespace-nowrap" style={{ color: erroObj.color }}>
                            {row.qtde > 0 ? row.qtde : '—'}
                          </td>
                          <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate" title={row.usuario}>{row.usuario || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.atendimento || '—'}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{row.prescricao || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            {row.integracao === 'S'
                              ? <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✓ Sim</span>
                              : <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">✗ Não</span>
                            }
                          </td>
                          <td className="px-3 py-2 text-slate-400 max-w-[160px] truncate" title={row.evento}>{row.evento}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > 200 && (
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center text-[11px] text-slate-400">
                    Mostrando 200 de {filtered.length.toLocaleString('pt-BR')} registros
                    {anomaliaSearch ? ` (filtrado de ${allRows.length.toLocaleString('pt-BR')})` : ''}.
                    Use o filtro acima para refinar.
                  </div>
                )}
                {filtered.length === 0 && (
                  <div className="px-5 py-8 text-center text-xs text-slate-400">
                    Nenhum registro encontrado para "{anomaliaSearch}".
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── RISCOS ASSISTENCIAIS E FINANCEIROS ─────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-500" />
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Riscos Assistenciais e Financeiros</h3>
            </div>
            <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Assistencial */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Risco Assistencial</span>
                </div>
                {trxStats.riscos.assistencial.map((r, i) => {
                  const sevColor = r.severity === 'critica' ? { bg: '#fff1f2', border: '#fca5a5', text: '#dc2626', badge: '🔴 CRÍTICO' }
                    : r.severity === 'alta' ? { bg: '#fff7ed', border: '#fdba74', text: '#ea580c', badge: '🟠 ALTO' }
                    : { bg: '#fefce8', border: '#fde047', text: '#ca8a04', badge: '🟡 MÉDIO' };
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border"
                      style={{ background: r.valor === 0 ? '#f8fafc' : sevColor.bg, borderColor: r.valor === 0 ? '#e2e8f0' : sevColor.border }}>
                      <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs font-black" style={{ color: r.valor === 0 ? '#64748b' : sevColor.text }}>{r.titulo}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black" style={{ color: r.valor === 0 ? '#94a3b8' : sevColor.text }}>
                              {r.valor.toLocaleString('pt-BR')}
                            </span>
                            {r.valor > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: sevColor.bg, color: sevColor.text }}>
                                {sevColor.badge}
                              </span>
                            )}
                            {r.valor === 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✅ OK</span>}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{r.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Financeiro */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-black text-slate-700 uppercase tracking-widest">Risco Financeiro</span>
                </div>
                {trxStats.riscos.financeiro.map((r, i) => {
                  const sevColor = r.severity === 'critica' ? { bg: '#fff1f2', border: '#fca5a5', text: '#dc2626', badge: '🔴 CRÍTICO' }
                    : r.severity === 'alta' ? { bg: '#fff7ed', border: '#fdba74', text: '#ea580c', badge: '🟠 ALTO' }
                    : { bg: '#fefce8', border: '#fde047', text: '#ca8a04', badge: '🟡 MÉDIO' };
                  return (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border"
                      style={{ background: r.valor === 0 ? '#f8fafc' : sevColor.bg, borderColor: r.valor === 0 ? '#e2e8f0' : sevColor.border }}>
                      <span className="text-lg leading-none mt-0.5">{r.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-xs font-black" style={{ color: r.valor === 0 ? '#64748b' : sevColor.text }}>{r.titulo}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-black" style={{ color: r.valor === 0 ? '#94a3b8' : sevColor.text }}>
                              {r.valor.toLocaleString('pt-BR')}
                            </span>
                            {r.valor > 0 && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                style={{ background: sevColor.bg, color: sevColor.text }}>
                                {sevColor.badge}
                              </span>
                            )}
                            {r.valor === 0 && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">✅ OK</span>}
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{r.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: SALDOS
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'saldos' && saldoData && (
        <div className="space-y-5">
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-emerald-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Produtos</span>
                  <div className="p-1.5 rounded-lg bg-emerald-50"><Package className="w-3.5 h-3.5 text-emerald-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-emerald-600">{saldoData.rows.length.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">No dispensário</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${(saldoStats?.div ?? 0) > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Divergências</span>
                  <div className={`p-1.5 rounded-lg ${(saldoStats?.div ?? 0) > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                    <XCircle className={`w-3.5 h-3.5 ${(saldoStats?.div ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${(saldoStats?.div ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {(saldoStats?.div ?? 0).toLocaleString('pt-BR')}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Saldo WL ≠ Saldo Hosp</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${parseFloat(saldoStats?.precisao ?? '0') >= 90 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Precisão</span>
                  <div className={`p-1.5 rounded-lg ${parseFloat(saldoStats?.precisao ?? '0') >= 90 ? 'bg-emerald-50' : 'bg-amber-50'}`}>
                    <TrendingUp className={`w-3.5 h-3.5 ${parseFloat(saldoStats?.precisao ?? '0') >= 90 ? 'text-emerald-500' : 'text-amber-500'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${parseFloat(saldoStats?.precisao ?? '0') >= 90 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {saldoStats?.precisao ?? '—'}%
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Inventário correto</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className={`h-[3px] w-full ${(saldoStats?.semWL ?? 0) > 0 ? 'bg-amber-500' : 'bg-slate-200'}`} />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Sem Saldo WL</span>
                  <div className={`p-1.5 rounded-lg ${(saldoStats?.semWL ?? 0) > 0 ? 'bg-amber-50' : 'bg-slate-50'}`}>
                    <AlertTriangle className={`w-3.5 h-3.5 ${(saldoStats?.semWL ?? 0) > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
                  </div>
                </div>
                <p className={`text-3xl font-black leading-none ${(saldoStats?.semWL ?? 0) > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                  {(saldoStats?.semWL ?? 0).toLocaleString('pt-BR')}
                </p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Saldo 0 WL, estoque Hosp</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {(['todos', 'divergencias'] as const).map(f => (
                  <button key={f} onClick={() => setSaldoFilter(f)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      saldoFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}>
                    {f === 'todos' ? `Todos (${saldoData.rows.length})` : `Só Divergências (${saldoStats?.div ?? 0})`}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text" placeholder="Buscar código, descrição ou gaveta..."
                  value={saldoSearch} onChange={e => setSaldoSearch(e.target.value)}
                  className="flex-1 text-xs bg-transparent border-b border-slate-200 pb-1 outline-none text-slate-700 placeholder-slate-400"
                />
              </div>
              <span className="text-xs text-slate-400">{filteredSaldos.length} itens</span>
            </div>
          </div>

          {/* Plano de ação — resumo */}
          {planoStats.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-500" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Resumo do Plano de Ação</h3>
                <span className="text-[11px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{planoStats.reduce((s, p) => s + p.count, 0)} divergências</span>
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {planoStats.map(({ plano, count }) => (
                  <div key={plano.label} className="flex items-start gap-3 p-3 rounded-lg border"
                    style={{ background: plano.bg, borderColor: plano.border }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-black"
                      style={{ background: plano.color }}>
                      {count}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black leading-tight" style={{ color: plano.color }}>{plano.label}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{plano.detalhe}</p>
                      <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: plano.color + '20', color: plano.color }}>
                        {plano.priority === 'critica' ? '🔴 CRÍTICA' : plano.priority === 'alta' ? '🟠 ALTA' : plano.priority === 'media' ? '🟡 MÉDIA' : '🟢 BAIXA'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Table com colunas agrupadas */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 z-10">
                  {/* Linha 1 — grupos */}
                  <tr>
                    <th colSpan={3} className="px-4 py-2 text-left text-[10px] font-black text-white uppercase tracking-widest bg-slate-800 border-r border-slate-600">
                      Produto
                    </th>
                    <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest border-r border-cyan-700"
                      style={{ background: '#164e63', color: '#67e8f9' }}>
                      FÍSICO · TRN
                    </th>
                    <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest border-r border-indigo-700"
                      style={{ background: '#1e1b4b', color: '#a5b4fc' }}>
                      WEBLOGIS
                    </th>
                    <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest border-r border-emerald-700"
                      style={{ background: '#052e16', color: '#6ee7b7' }}>
                      HOSPITAL
                    </th>
                    <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black uppercase tracking-widest border-r border-amber-700"
                      style={{ background: '#431407', color: '#fcd34d' }}>
                      DIFERENÇA
                    </th>
                    <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest bg-slate-900">
                      PLANO DE AÇÃO
                    </th>
                  </tr>
                  {/* Linha 2 — sub-headers */}
                  <tr className="bg-slate-800">
                    <th className="text-left text-[10px] font-bold text-slate-400 px-3 py-2 w-12">Gav.</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 px-3 py-2 w-20">Código</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 px-3 py-2 border-r border-slate-600">Descrição</th>
                    <th className="text-right text-[10px] font-bold px-3 py-2 border-r border-slate-600" style={{ color: '#67e8f9' }}>Saldo Trn</th>
                    <th className="text-right text-[10px] font-bold px-3 py-2 border-r border-slate-600" style={{ color: '#a5b4fc' }}>Saldo WL</th>
                    <th className="text-right text-[10px] font-bold px-3 py-2 border-r border-slate-600" style={{ color: '#6ee7b7' }}>Saldo Hosp</th>
                    <th className="text-right text-[10px] font-bold px-3 py-2 border-r border-slate-600" style={{ color: '#fcd34d' }}>Hosp − WL</th>
                    <th className="text-left text-[10px] font-bold text-slate-400 px-3 py-2">Ação Sugerida</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSaldos.slice(0, 300).map((row, i) => {
                    const plano = getPlanoAcao(row);
                    const diff = row.saldoHosp - row.saldoWL;
                    const wlOk = row.saldoWL === row.saldoHosp;
                    const hospOk = row.saldoHosp === row.saldoTrn;
                    const trnOk = row.saldoTrn === row.saldoWL;
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/70'}
                        style={{ borderLeft: `3px solid ${plano.color}` }}>
                        <td className="px-3 py-2.5 text-xs font-bold text-slate-500 w-12">{row.gaveta || '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-mono text-slate-500">{row.codigo}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-700 max-w-[220px] truncate border-r border-slate-100" title={row.descricao}>{row.descricao}</td>
                        {/* FÍSICO */}
                        <td className="px-3 py-2.5 text-xs font-black text-right border-r border-slate-100"
                          style={{ color: trnOk ? '#475569' : '#0891b2', background: trnOk ? undefined : '#ecfeff' }}>
                          {row.saldoTrn}
                        </td>
                        {/* WEBLOGIS */}
                        <td className="px-3 py-2.5 text-xs font-black text-right border-r border-slate-100"
                          style={{ color: wlOk ? '#475569' : '#6366f1', background: wlOk ? undefined : '#eef2ff' }}>
                          {row.saldoWL}
                        </td>
                        {/* HOSPITAL */}
                        <td className="px-3 py-2.5 text-xs font-black text-right border-r border-slate-100"
                          style={{ color: hospOk ? '#475569' : '#059669', background: hospOk ? undefined : '#f0fdf4' }}>
                          {row.saldoHosp}
                        </td>
                        {/* DIFERENÇA */}
                        <td className="px-3 py-2.5 text-xs font-black text-right border-r border-slate-100">
                          <span className={`font-black ${diff === 0 ? 'text-slate-400' : diff > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </td>
                        {/* PLANO DE AÇÃO */}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-black leading-tight" style={{ color: plano.color }}>{plano.label}</span>
                            <span className="text-[10px] text-slate-400 leading-tight">{plano.detalhe}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredSaldos.length > 300 && (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                  Exibindo 300 de {filteredSaldos.length} itens. Refine a busca para ver mais.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          TAB: CONSUMO
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'consumo' && consumo.length > 0 && consumoStats && (
        <div className="space-y-5">

          {/* ── KPIs principais ─────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total SKUs */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-amber-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">SKUs Ativos</span>
                  <div className="p-1.5 rounded-lg bg-amber-50"><Package className="w-3.5 h-3.5 text-amber-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-amber-600">{consumoStats.items.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Produtos com consumo</p>
              </div>
            </div>
            {/* Total unidades */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-orange-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Total Consumido</span>
                  <div className="p-1.5 rounded-lg bg-orange-50"><TrendingUp className="w-3.5 h-3.5 text-orange-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-orange-600">{consumoStats.totalUnits.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Unidades dispensadas</p>
              </div>
            </div>
            {/* Média por SKU */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-indigo-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Média / Produto</span>
                  <div className="p-1.5 rounded-lg bg-indigo-50"><BarChart3 className="w-3.5 h-3.5 text-indigo-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-indigo-600">{consumoStats.media.toFixed(1)}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Unidades por SKU</p>
              </div>
            </div>
            {/* Top produto */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="h-[3px] w-full bg-rose-500" />
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Maior Consumo</span>
                  <div className="p-1.5 rounded-lg bg-rose-50"><TrendingUp className="w-3.5 h-3.5 text-rose-500" /></div>
                </div>
                <p className="text-3xl font-black leading-none text-rose-600">{consumoStats.top1?.quantidade.toLocaleString('pt-BR')}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2 truncate" title={consumoStats.top1?.descricao}>
                  {consumoStats.top1?.descricao.substring(0, 28)}…
                </p>
              </div>
            </div>
          </div>

          {/* ── KPIs secundários (Pareto + Rotatividade + Concentração) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pareto 80/20 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-violet-500" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Curva de Pareto</h3>
              </div>
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-4xl font-black text-violet-600">{consumoStats.pareto80}</p>
                  <p className="text-[11px] text-slate-400 mt-1">SKUs = <strong>80%</strong> do consumo total</p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>de {consumoStats.items} produtos</p>
                  <p className="font-black text-violet-400">{((consumoStats.pareto80 / consumoStats.items) * 100).toFixed(0)}% do mix</p>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(consumoStats.pareto80 / consumoStats.items) * 100}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Foque nesses {consumoStats.pareto80} itens para controlar 80% do gasto.</p>
            </div>

            {/* Concentração top 10 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-amber-500" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Concentração Top 10</h3>
              </div>
              <div className="flex items-end gap-4 mb-4">
                <div>
                  <p className="text-4xl font-black text-amber-600">{consumoStats.top10Pct}%</p>
                  <p className="text-[11px] text-slate-400 mt-1">do consumo vem dos top 10</p>
                </div>
                <div className="text-right text-[11px] text-slate-400">
                  <p>{consumoStats.items - 10} itens</p>
                  <p className="font-black text-slate-400">{(100 - parseFloat(consumoStats.top10Pct)).toFixed(1)}% restante</p>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${consumoStats.top10Pct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-2">Alta concentração indica risco de ruptura crítica nos top itens.</p>
            </div>

            {/* Rotatividade ABC */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">Curva ABC</h3>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Alta rotatividade', count: consumoStats.altaRot, color: '#dc2626', bg: '#fff1f2', desc: 'Acima da média' },
                  { label: 'Média rotatividade', count: consumoStats.mediaRot, color: '#d97706', bg: '#fffbeb', desc: '25% – 100% da média' },
                  { label: 'Baixa rotatividade', count: consumoStats.baixaRot, color: '#64748b', bg: '#f8fafc', desc: 'Abaixo de 25% da média' },
                ].map(({ label, count, color, bg, desc }) => (
                  <div key={label} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: bg }}>
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: color }}>
                      {count}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-700">{label}</p>
                      <p className="text-[10px] text-slate-400">{desc}</p>
                    </div>
                    <span className="text-[10px] font-black shrink-0" style={{ color }}>
                      {((count / consumoStats.items) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Gráficos: Pareto + Distribuição por Unidade ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Curva de Pareto */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1">Curva de Pareto — Top 30</h3>
              <p className="text-[11px] text-slate-400 mb-4">Barras = qtde individual · Linha = % acumulado</p>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={consumoStats.paretoCurve} margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="rank" tick={{ fontSize: 9 }} label={{ value: 'Ranking', position: 'insideBottom', offset: -2, fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9 }} />
                  <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 9 }} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const d = consumoStats.paretoCurve[Number(label) - 1];
                    return (
                      <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs max-w-[200px]">
                        <p className="font-bold text-slate-700 mb-1">#{label} · {d?.name}</p>
                        <p className="text-amber-600 font-semibold">Qtde: {payload[0]?.value?.toLocaleString('pt-BR')}</p>
                        <p className="text-violet-600 font-semibold">Acumulado: {payload[1]?.value}%</p>
                      </div>
                    );
                  }} />
                  <Bar yAxisId="left" dataKey="qtde" name="Qtde" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="pct" name="% Acum." stroke="#7c3aed" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Distribuição por tipo de unidade */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribuição por Tipo de Unidade</h3>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={consumoStats.porUnidade} cx="50%" cy="50%" outerRadius={90}
                    dataKey="value" nameKey="name"
                    label={({ name, percent }) => percent > 0.04 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}>
                    {consumoStats.porUnidade.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => v.toLocaleString('pt-BR')} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Top 20 horizontal ───────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Top 20 Produtos Mais Consumidos</h3>
            <ResponsiveContainer width="100%" height={420}>
              <BarChart data={consumoStats.top20.map(r => ({ name: r.descricao.substring(0, 30), count: r.quantidade }))} layout="vertical" margin={{ left: 10, right: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="name" type="category" width={230} tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="Qtde consumida" fill="#f59e0b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Tabela completa ─────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text" placeholder="Buscar produto ou descrição..."
                value={consumoSearch} onChange={e => setConsumoSearch(e.target.value)}
                className="flex-1 text-xs bg-transparent outline-none text-slate-700 placeholder-slate-400"
              />
              <span className="text-xs text-slate-400 shrink-0">{filteredConsumo.length} itens</span>
            </div>
            <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-slate-800">
                    <th className="text-left text-[11px] font-bold text-white px-4 py-3">#</th>
                    <th className="text-left text-[11px] font-bold text-white px-4 py-3">Código</th>
                    <th className="text-left text-[11px] font-bold text-white px-4 py-3">Descrição</th>
                    <th className="text-left text-[11px] font-bold text-slate-400 px-4 py-3">Unidade</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">Qtde</th>
                    <th className="text-right text-[11px] font-bold text-slate-400 px-4 py-3">% do Total</th>
                    <th className="text-center text-[11px] font-bold text-slate-400 px-4 py-3">Rotatividade</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConsumo.slice(0, 200).map((row, i) => {
                    const pct = consumoStats.totalUnits > 0 ? (row.quantidade / consumoStats.totalUnits * 100) : 0;
                    const rot = row.quantidade > consumoStats.media ? 'alta'
                      : row.quantidade > consumoStats.media * 0.25 ? 'media' : 'baixa';
                    return (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="px-4 py-2.5 text-xs font-black text-slate-400">{i + 1}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-500">{row.produto}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-700">{row.descricao}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-500">{row.unidade}</td>
                        <td className="px-4 py-2.5 text-xs font-black text-amber-600 text-right">{row.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-400 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(pct * 5, 100)}%` }} />
                            </div>
                            {pct.toFixed(1)}%
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{
                            background: rot === 'alta' ? '#fff1f2' : rot === 'media' ? '#fffbeb' : '#f8fafc',
                            color: rot === 'alta' ? '#dc2626' : rot === 'media' ? '#d97706' : '#64748b',
                          }}>
                            {rot === 'alta' ? '▲ Alta' : rot === 'media' ? '● Média' : '▼ Baixa'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredConsumo.length > 200 && (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
                  Exibindo 200 de {filteredConsumo.length} itens. Use a busca para filtrar.
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
