import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import {
  Upload, ArrowLeftRight, Package, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, Search, Filter, FileText, Copy,
  X, ChevronUp, ChevronDown, RefreshCw, Info
} from 'lucide-react';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface PosEstoqueRow {
  produto: string;
  estoqueId: string;
  unidade: string;
  estMin: number;
  estMax: number;
  pPedido: number;
  estoqueAtual: number;
  custoMedio: number;
}

interface ConsumoAgregado {
  produto: string;
  estoqueId: string;
  estoqueName: string;
  qtdConsumo: number; // total quadrimestral (120 dias)
  unidade: string;
}

interface AnaliseItem {
  produto: string;
  unidade: string;
  estoqueId: string;
  estoqueName: string;
  saldoAtual: number;
  consumoTotal: number;
  consumoDiario: number;
  coberturaDias: number;
  status: 'EXCESSO' | 'NORMAL' | 'ALERTA' | 'CRÍTICO' | 'SEM CONSUMO';
  estMin: number;
  estMax: number;
  custoMedio: number;
}

interface SugestaoRemanejamento {
  produto: string;
  unidade: string;
  origemId: string;
  origemNome: string;
  saldoOrigem: number;
  coberturaOrigem: number;
  destinoId: string;
  destinoNome: string;
  saldoDestino: number;
  coberturaDestino: number;
  qtdSugerida: number;
  prioridade: 'ALTA' | 'MÉDIA' | 'BAIXA';
  custoMedio: number;
}

// ─── Helpers de parse ─────────────────────────────────────────────────────────

function parseBRNumber(s: string): number {
  if (!s) return 0;
  const cleaned = s.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function normalizeProduto(nome: string): string {
  return nome.trim().toUpperCase().replace(/\s+/g, ' ');
}

// ─── Parser: R_POS_EST.csv ────────────────────────────────────────────────────
// Estrutura real do Genesis:
//   col[0]: vazio
//   col[1]: vazio
//   col[2]: "  285   AMBISOME 50MG FR/AMP EV-..." (código + nome do produto)
//   col[3]: ID do estoque (ex: 332, 334)
//   col[4]: Unidade
//   col[5]: Est. Mínimo
//   col[6]: Est. Máximo
//   col[7]: P. Pedido
//   col[8]: Estoque Atual
//   col[9]: Custo Médio
//   col[10]: Vl. Total
// O mesmo produto aparece em múltiplas linhas, uma por estoque.
function parsePosEstoque(text: string): PosEstoqueRow[] {
  const rows: PosEstoqueRow[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    if (!line.trim()) continue;

    // Ignora linhas de metadados e cabeçalhos
    const lower = line.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (
      lower.startsWith('especie:') ||
      lower.startsWith('classe:') ||
      lower.startsWith('sub-classe:') ||
      lower.includes('total da especie') ||
      lower.includes('total geral') ||
      lower.includes('est. minimo') ||
      lower.includes('estoque atual') ||
      lower.includes(',produto,')
    ) continue;

    const cols = splitCSVLine(line);

    // Linha de dado: col[2] contém "  CODIGO   NOME DO PRODUTO"
    const rawProduto = (cols[2] ?? '').trim();
    if (!rawProduto) continue;

    // col[3] = ID do estoque — deve ser número inteiro
    const estoqueId = (cols[3] ?? '').trim();
    if (!estoqueId || !/^\d+$/.test(estoqueId)) continue;

    // Remove o prefixo de código numérico: "  285   AMBISOME..." → "AMBISOME..."
    const produto = rawProduto.replace(/^\s*\d+\s+/, '').trim();
    if (!produto) continue;

    rows.push({
      produto: normalizeProduto(produto),
      estoqueId,
      unidade: (cols[4] ?? '').trim(),
      estMin: parseBRNumber(cols[5] ?? ''),
      estMax: parseBRNumber(cols[6] ?? ''),
      pPedido: parseBRNumber(cols[7] ?? ''),
      estoqueAtual: parseBRNumber(cols[8] ?? ''),
      custoMedio: parseBRNumber(cols[9] ?? ''),
    });
  }

  return rows;
}

// ─── Parser: R_CONS_SETOR_QBR.csv ─────────────────────────────────────────────
// Ignora setores, agrega consumo por (produto, estoqueId)
// "Estoque:" header → lê ID + nome
// Data rows: col[2]=Produto, col[6]=Unidade, col[12]=Qtd Consumo
function parseConsumoEstoque(text: string): ConsumoAgregado[] {
  const map = new Map<string, ConsumoAgregado>();
  const lines = text.split(/\r?\n/);

  let currentEstoqueId = '';
  let currentEstoqueName = '';

  for (const line of lines) {
    if (!line.trim()) continue;

    const cols = splitCSVLine(line);

    // Detecta linha "Estoque:"
    if ((cols[1] ?? '').trim().toLowerCase() === 'estoque:') {
      currentEstoqueId = (cols[3] ?? '').trim();
      currentEstoqueName = (cols[5] ?? '').trim() || (cols[4] ?? '').trim();
      continue;
    }

    // Ignora linhas de totais, cabeçalhos e setores
    const col1 = (cols[1] ?? '').trim().toLowerCase();
    if (
      col1 === 'setor:' ||
      col1 === 'num.' ||
      col1 === 'total selecionado:' ||
      col1 === 'total do setor:' ||
      col1.includes('total')
    ) continue;

    // Linha de dado: col[0] deve ser número sequencial
    const num = (cols[0] ?? '').trim();
    if (!num || !/^\d+$/.test(num)) continue;

    if (!currentEstoqueId) continue;

    const produto = (cols[2] ?? '').trim();
    if (!produto) continue;

    const unidade = (cols[6] ?? '').trim();
    // Qtd Consumo está na coluna 12 com base na estrutura do CSV
    const qtdConsumo = parseBRNumber(cols[12] ?? '');

    const key = `${currentEstoqueId}||${normalizeProduto(produto)}`;
    if (map.has(key)) {
      map.get(key)!.qtdConsumo += qtdConsumo;
    } else {
      map.set(key, {
        produto: normalizeProduto(produto),
        estoqueId: currentEstoqueId,
        estoqueName: currentEstoqueName,
        qtdConsumo,
        unidade,
      });
    }
  }

  return Array.from(map.values());
}

// ─── CSV line splitter (respeita campos entre aspas) ─────────────────────────
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// ─── Lógica de análise ────────────────────────────────────────────────────────

function calcularStatus(coberturaDias: number, saldo: number, consumoDiario: number): AnaliseItem['status'] {
  if (saldo === 0 && consumoDiario === 0) return 'SEM CONSUMO';
  if (consumoDiario === 0) return 'EXCESSO';
  if (coberturaDias < 15) return 'CRÍTICO';
  if (coberturaDias < 30) return 'ALERTA';
  if (coberturaDias < 90) return 'NORMAL';
  return 'EXCESSO';
}

function gerarAnalise(posRows: PosEstoqueRow[], conRows: ConsumoAgregado[]): AnaliseItem[] {
  // Mapa de consumo: estoqueId||produto → ConsumoAgregado
  const consumoMap = new Map<string, ConsumoAgregado>();
  for (const c of conRows) {
    consumoMap.set(`${c.estoqueId}||${c.produto}`, c);
  }

  // Mapa de nomes de estoque do CSV de consumo
  const estoqueNomes = new Map<string, string>();
  for (const c of conRows) {
    if (c.estoqueName) estoqueNomes.set(c.estoqueId, c.estoqueName);
  }

  const items: AnaliseItem[] = [];

  for (const pos of posRows) {
    const key = `${pos.estoqueId}||${pos.produto}`;
    const consumo = consumoMap.get(key);
    const qtdConsumo = consumo?.qtdConsumo ?? 0;
    const consumoDiario = qtdConsumo / 120;
    const coberturaDias = consumoDiario > 0 ? pos.estoqueAtual / consumoDiario : (pos.estoqueAtual > 0 ? 9999 : 0);
    const estoqueName = estoqueNomes.get(pos.estoqueId) || consumo?.estoqueName || `Estoque ${pos.estoqueId}`;

    items.push({
      produto: pos.produto,
      unidade: pos.unidade || consumo?.unidade || '',
      estoqueId: pos.estoqueId,
      estoqueName,
      saldoAtual: pos.estoqueAtual,
      consumoTotal: qtdConsumo,
      consumoDiario,
      coberturaDias,
      status: calcularStatus(coberturaDias, pos.estoqueAtual, consumoDiario),
      estMin: pos.estMin,
      estMax: pos.estMax,
      custoMedio: pos.custoMedio,
    });
  }

  // Adicionar produtos que só aparecem no consumo (sem posição de estoque)
  for (const c of conRows) {
    const key = `${c.estoqueId}||${c.produto}`;
    if (!posRows.some(p => `${p.estoqueId}||${p.produto}` === key)) {
      const consumoDiario = c.qtdConsumo / 120;
      items.push({
        produto: c.produto,
        unidade: c.unidade,
        estoqueId: c.estoqueId,
        estoqueName: c.estoqueName || `Estoque ${c.estoqueId}`,
        saldoAtual: 0,
        consumoTotal: c.qtdConsumo,
        consumoDiario,
        coberturaDias: 0,
        status: consumoDiario > 0 ? 'CRÍTICO' : 'SEM CONSUMO',
        estMin: 0,
        estMax: 0,
        custoMedio: 0,
      });
    }
  }

  return items;
}

function gerarSugestoes(analise: AnaliseItem[]): SugestaoRemanejamento[] {
  const sugestoes: SugestaoRemanejamento[] = [];

  // Agrupar por produto
  const porProduto = new Map<string, AnaliseItem[]>();
  for (const item of analise) {
    const lista = porProduto.get(item.produto) ?? [];
    lista.push(item);
    porProduto.set(item.produto, lista);
  }

  for (const [, itens] of porProduto) {
    if (itens.length < 2) continue;

    // Doadores: estoques com saldo disponível e cobertura confortável
    // Inclui farmácias satélites (consumoDiario = 0) que têm saldo ocioso
    const doadores = itens.filter(i =>
      i.saldoAtual > 0 && (
        i.status === 'EXCESSO' ||
        (i.status === 'SEM CONSUMO' && i.saldoAtual > 0) ||
        (i.status === 'NORMAL' && i.coberturaDias > 60)
      )
    );

    // Receptores: estoques com cobertura crítica ou em alerta
    const receptores = itens.filter(i => i.status === 'CRÍTICO' || i.status === 'ALERTA');

    for (const receptor of receptores) {
      for (const doador of doadores) {
        if (doador.estoqueId === receptor.estoqueId) continue;

        // Quanto o doador pode ceder:
        // Se tem consumo próprio → mantém 30 dias de cobertura
        // Se não tem consumo (satélite ocioso) → pode ceder tudo
        const reservaMinima = doador.consumoDiario > 0 ? doador.consumoDiario * 30 : 0;
        const podeDoar = doador.saldoAtual - reservaMinima;
        if (podeDoar <= 0) continue;

        // Quanto o receptor precisa para atingir 30 dias de cobertura
        const precisaReceber = (receptor.consumoDiario * 30) - receptor.saldoAtual;
        if (precisaReceber <= 0) continue;

        const qtdSugerida = Math.floor(Math.min(podeDoar, precisaReceber));
        if (qtdSugerida <= 0) continue;

        const prioridade: SugestaoRemanejamento['prioridade'] =
          receptor.coberturaDias < 15 ? 'ALTA' :
          receptor.coberturaDias < 30 ? 'MÉDIA' : 'BAIXA';

        sugestoes.push({
          produto: receptor.produto,
          unidade: receptor.unidade,
          origemId: doador.estoqueId,
          origemNome: doador.estoqueName,
          saldoOrigem: doador.saldoAtual,
          coberturaOrigem: doador.coberturaDias,
          destinoId: receptor.estoqueId,
          destinoNome: receptor.estoqueName,
          saldoDestino: receptor.saldoAtual,
          coberturaDestino: receptor.coberturaDias,
          qtdSugerida,
          prioridade,
          custoMedio: receptor.custoMedio || doador.custoMedio,
        });
      }
    }
  }

  // Ordena: ALTA primeiro, depois menor cobertura destino
  return sugestoes.sort((a, b) => {
    const prio = { ALTA: 0, MÉDIA: 1, BAIXA: 2 };
    if (prio[a.prioridade] !== prio[b.prioridade]) return prio[a.prioridade] - prio[b.prioridade];
    return a.coberturaDestino - b.coberturaDestino;
  });
}

// ─── Exportação TXT ───────────────────────────────────────────────────────────

function exportarTXT(sugestoes: SugestaoRemanejamento[]) {
  const now = new Date();
  const linhas = [
    '='.repeat(80),
    'RELATÓRIO DE REMANEJAMENTO DE ESTOQUE',
    `Gerado em: ${now.toLocaleString('pt-BR')}`,
    `Total de sugestões: ${sugestoes.length}`,
    '='.repeat(80),
    '',
  ];

  const alta = sugestoes.filter(s => s.prioridade === 'ALTA');
  const media = sugestoes.filter(s => s.prioridade === 'MÉDIA');
  const baixa = sugestoes.filter(s => s.prioridade === 'BAIXA');

  const bloco = (titulo: string, itens: SugestaoRemanejamento[]) => {
    if (!itens.length) return;
    linhas.push(titulo);
    linhas.push('-'.repeat(80));
    for (const s of itens) {
      linhas.push(`Produto   : ${s.produto}`);
      linhas.push(`De        : ${s.origemNome} (${s.origemId}) — Saldo: ${s.saldoOrigem} ${s.unidade} | Cobertura: ${s.coberturaOrigem.toFixed(0)} dias`);
      linhas.push(`Para      : ${s.destinoNome} (${s.destinoId}) — Saldo: ${s.saldoDestino} ${s.unidade} | Cobertura: ${s.coberturaDestino.toFixed(0)} dias`);
      linhas.push(`Qtd. Mover: ${s.qtdSugerida} ${s.unidade}${s.custoMedio > 0 ? `  |  Valor estimado: R$ ${(s.qtdSugerida * s.custoMedio).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}`);
      linhas.push('');
    }
  };

  bloco('🚨 PRIORIDADE ALTA (receptor < 15 dias de cobertura)', alta);
  bloco('🟡 PRIORIDADE MÉDIA (receptor < 30 dias de cobertura)', media);
  bloco('🟢 PRIORIDADE BAIXA', baixa);

  const blob = new Blob([linhas.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `remanejamento_${now.toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function gerarTextoWhatsApp(sugestoes: SugestaoRemanejamento[]): string {
  const date = new Date().toLocaleDateString('pt-BR');
  const alta = sugestoes.filter(s => s.prioridade === 'ALTA').slice(0, 5);
  const media = sugestoes.filter(s => s.prioridade === 'MÉDIA').slice(0, 3);

  let msg = `🔄 *REMANEJAMENTO DE ESTOQUE — ${date}*\n`;
  msg += `Total de sugestões: ${sugestoes.length}\n\n`;

  if (alta.length) {
    msg += `🚨 *ALTA PRIORIDADE (${sugestoes.filter(s => s.prioridade === 'ALTA').length} itens)*\n`;
    for (const s of alta) {
      msg += `• *${s.produto}*\n`;
      msg += `  De: ${s.origemNome} → Para: ${s.destinoNome}\n`;
      msg += `  Qtd: ${s.qtdSugerida} ${s.unidade} | Destino cobre ${s.coberturaDestino.toFixed(0)}d\n`;
    }
    msg += '\n';
  }

  if (media.length) {
    msg += `🟡 *MÉDIA PRIORIDADE (${sugestoes.filter(s => s.prioridade === 'MÉDIA').length} itens)*\n`;
    for (const s of media) {
      msg += `• *${s.produto}*\n`;
      msg += `  De: ${s.origemNome} → Para: ${s.destinoNome} | Qtd: ${s.qtdSugerida} ${s.unidade}\n`;
    }
  }

  msg += `\n_Gerado pelo FarmaIA — use *remanejamento* para detalhes._`;
  return msg;
}

// ─── Subcomponentes UI ────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: AnaliseItem['status'] }> = ({ status }) => {
  const cfg = {
    'CRÍTICO':    { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    label: 'CRÍTICO' },
    'ALERTA':     { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200',  label: 'ALERTA' },
    'NORMAL':     { bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200',label: 'NORMAL' },
    'EXCESSO':    { bg: 'bg-blue-100',   text: 'text-blue-700',   border: 'border-blue-200',   label: 'EXCESSO' },
    'SEM CONSUMO':{ bg: 'bg-slate-100',  text: 'text-slate-600',  border: 'border-slate-200',  label: 'S/CONSUMO' },
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {cfg.label}
    </span>
  );
};

const PrioridadeBadge: React.FC<{ prioridade: SugestaoRemanejamento['prioridade'] }> = ({ prioridade }) => {
  const cfg = {
    'ALTA':  { bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200' },
    'MÉDIA': { bg: 'bg-amber-100',  text: 'text-amber-700',  border: 'border-amber-200' },
    'BAIXA': { bg: 'bg-emerald-100',text: 'text-emerald-700',border: 'border-emerald-200' },
  }[prioridade];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      {prioridade}
    </span>
  );
};

type SortDir = 'asc' | 'desc';

// ─── Componente principal ─────────────────────────────────────────────────────

export const Remanejamento: React.FC = () => {
  const [posText, setPosText] = usePersistentState<string>('remanejamento_pos_csv', '');
  const [conText, setConText] = usePersistentState<string>('remanejamento_con_csv', '');
  const [posFileName, setPosFileName] = usePersistentState<string>('remanejamento_pos_name', '');
  const [conFileName, setConFileName] = usePersistentState<string>('remanejamento_con_name', '');
  const [innerTab, setInnerTab] = useState<'analise' | 'sugestoes'>('sugestoes');
  const [filterStatus, setFilterStatus] = useState<string>('TODOS');
  const [filterEstoque, setFilterEstoque] = useState<string>('TODOS');
  const [filterPrioridade, setFilterPrioridade] = useState<string>('TODOS');
  const [search, setSearch] = useState('');
  const [copiadoMsg, setCopiadoMsg] = useState(false);
  const [sortField, setSortField] = useState<string>('coberturaDias');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Armazena snapshot para o bot WhatsApp
  const [, setRemanejamentoSnapshot] = usePersistentState<string>('remanejamento_whatsapp_snapshot', '');
  const [botSyncStatus, setBotSyncStatus] = useState<'idle' | 'syncing' | 'ok' | 'erro'>('idle');
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleFileLoad = useCallback((
    e: React.ChangeEvent<HTMLInputElement>,
    tipo: 'pos' | 'con'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (tipo === 'pos') { setPosText(text); setPosFileName(file.name); }
      else                { setConText(text); setConFileName(file.name); }
    };
    reader.readAsText(file, 'ISO-8859-1');
    e.target.value = '';
  }, [setPosText, setPosFileName, setConText, setConFileName]);

  const posRows = useMemo(() => posText ? parsePosEstoque(posText) : [], [posText]);
  const conRows = useMemo(() => conText ? parseConsumoEstoque(conText) : [], [conText]);

  const analise = useMemo(() => gerarAnalise(posRows, conRows), [posRows, conRows]);
  const sugestoes = useMemo(() => gerarSugestoes(analise), [analise]);

  // Sincroniza automaticamente com o bot WhatsApp quando ambos os CSVs estão carregados
  useEffect(() => {
    if (!posText || !conText || sugestoes === undefined) return;

    const texto = gerarTextoWhatsApp(sugestoes);
    setRemanejamentoSnapshot(texto);
    setBotSyncStatus('syncing');

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);

    fetch('/api/save-remanejamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: texto }),
    })
      .then(r => {
        setBotSyncStatus(r.ok ? 'ok' : 'erro');
      })
      .catch(() => setBotSyncStatus('erro'))
      .finally(() => {
        // Volta ao estado neutro depois de 4s para não poluir a UI
        syncTimeoutRef.current = setTimeout(() => setBotSyncStatus('idle'), 4000);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posText, conText, sugestoes]);

  const estoques = useMemo(() => {
    const set = new Set<string>();
    analise.forEach(i => set.add(`${i.estoqueId}|${i.estoqueName}`));
    return Array.from(set).sort();
  }, [analise]);

  const analiseFiltered = useMemo(() => {
    let data = [...analise];
    if (filterStatus !== 'TODOS') data = data.filter(i => i.status === filterStatus);
    if (filterEstoque !== 'TODOS') data = data.filter(i => i.estoqueId === filterEstoque.split('|')[0]);
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(i => i.produto.toLowerCase().includes(s) || i.estoqueId.includes(s));
    }
    data.sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      if (sortField === 'produto') { av = a.produto; bv = b.produto; }
      else if (sortField === 'saldoAtual') { av = a.saldoAtual; bv = b.saldoAtual; }
      else if (sortField === 'consumoDiario') { av = a.consumoDiario; bv = b.consumoDiario; }
      else if (sortField === 'coberturaDias') { av = a.coberturaDias; bv = b.coberturaDias; }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return data;
  }, [analise, filterStatus, filterEstoque, search, sortField, sortDir]);

  const sugestoesFiltered = useMemo(() => {
    let data = [...sugestoes];
    if (filterPrioridade !== 'TODOS') data = data.filter(s => s.prioridade === filterPrioridade);
    if (filterEstoque !== 'TODOS') {
      const id = filterEstoque.split('|')[0];
      data = data.filter(s => s.origemId === id || s.destinoId === id);
    }
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(i => i.produto.toLowerCase().includes(s));
    }
    return data;
  }, [sugestoes, filterPrioridade, filterEstoque, search]);

  const stats = useMemo(() => ({
    total: analise.length,
    criticos: analise.filter(i => i.status === 'CRÍTICO').length,
    alertas: analise.filter(i => i.status === 'ALERTA').length,
    excessos: analise.filter(i => i.status === 'EXCESSO').length,
    sugestoesAlta: sugestoes.filter(s => s.prioridade === 'ALTA').length,
    estoques: new Set(analise.map(i => i.estoqueId)).size,
    valorRisco: sugestoes.reduce((acc, s) => acc + (s.qtdSugerida * s.custoMedio), 0),
  }), [analise, sugestoes]);

  const handleCopiarWhatsApp = () => {
    const texto = gerarTextoWhatsApp(sugestoes);
    setRemanejamentoSnapshot(texto);
    navigator.clipboard.writeText(texto).then(() => {
      setCopiadoMsg(true);
      setTimeout(() => setCopiadoMsg(false), 2500);
    });
    // Persiste no KV para o bot WhatsApp responder consultas de remanejamento
    fetch('/api/save-remanejamento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot: texto }),
    }).catch(() => { /* ignora silenciosamente se KV não estiver configurado */ });
  };

  const toggleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon: React.FC<{ field: string }> = ({ field }) => {
    if (sortField !== field) return <ChevronUp className="w-3 h-3 opacity-20" />;
    return sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  };

  const hasData = analise.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-2.5 rounded-xl shadow-md shadow-amber-200">
          <ArrowLeftRight className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Remanejamento de Estoque</h1>
          <p className="text-sm text-slate-500">Análise cruzada de posição × consumo para identificar oportunidades de redistribuição entre estoques</p>
        </div>
      </div>

      {/* Import Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* POS EST */}
        <div className={`relative border-2 border-dashed rounded-2xl p-5 transition-colors ${posText ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/30'}`}>
          <label className="cursor-pointer block">
            <input type="file" accept=".csv,.txt" className="hidden" onChange={e => handleFileLoad(e, 'pos')} />
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${posText ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                <Package className={`w-6 h-6 ${posText ? 'text-emerald-600' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-700 text-sm">Posição de Estoque</p>
                <p className="text-xs text-slate-500 mt-0.5">R_POS_EST.csv — saldo atual por estoque</p>
                {posText ? (
                  <div className="mt-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs text-emerald-700 font-medium truncate">{posFileName} ({posRows.length} linhas)</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">Clique para importar</span>
                  </div>
                )}
              </div>
              {posText && (
                <button
                  onClick={e => { e.preventDefault(); setPosText(''); setPosFileName(''); }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </label>
        </div>

        {/* CONS SETOR */}
        <div className={`relative border-2 border-dashed rounded-2xl p-5 transition-colors ${conText ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50/30'}`}>
          <label className="cursor-pointer block">
            <input type="file" accept=".csv,.txt" className="hidden" onChange={e => handleFileLoad(e, 'con')} />
            <div className="flex items-start gap-4">
              <div className={`p-3 rounded-xl ${conText ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                <TrendingUp className={`w-6 h-6 ${conText ? 'text-emerald-600' : 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-700 text-sm">Consumo Quadrimestral</p>
                <p className="text-xs text-slate-500 mt-0.5">R_CONS_SETOR_QBR.csv — consumo por estoque (setores ignorados)</p>
                {conText ? (
                  <div className="mt-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span className="text-xs text-emerald-700 font-medium truncate">{conFileName} ({conRows.length} produtos)</span>
                  </div>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <span className="text-xs text-slate-500">Clique para importar</span>
                  </div>
                )}
              </div>
              {conText && (
                <button
                  onClick={e => { e.preventDefault(); setConText(''); setConFileName(''); }}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </label>
        </div>
      </div>

      {/* Aviso de uso de apenas um CSV */}
      {(posText || conText) && !(posText && conText) && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            {posText
              ? 'Posição de estoque carregada. Importe também o CSV de consumo para gerar sugestões de remanejamento.'
              : 'Consumo carregado. Importe também o CSV de posição de estoque para cruzar os dados.'}
          </p>
        </div>
      )}

      {!hasData && !posText && !conText && (
        <div className="bg-gradient-to-br from-slate-50 to-amber-50/30 border border-slate-200 rounded-2xl p-8 text-center">
          <ArrowLeftRight className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600 font-medium">Nenhum dado carregado</p>
          <p className="text-sm text-slate-400 mt-1">Importe os dois CSVs acima para iniciar a análise de remanejamento</p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 max-w-lg mx-auto text-left">
            <div className="bg-white rounded-xl p-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-1">R_POS_EST.csv</p>
              <p className="text-xs text-slate-400">Posição atual de estoque com saldo por estoque e produto</p>
            </div>
            <div className="bg-white rounded-xl p-3 border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-1">R_CONS_SETOR_QBR.csv</p>
              <p className="text-xs text-slate-400">Consumo quadrimestral por setor — setores são ignorados e o consumo é somado por estoque</p>
            </div>
          </div>
        </div>
      )}

      {hasData && (
        <>
          {/* Dashboard Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Produtos Analisados</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{stats.total}</p>
              <p className="text-xs text-slate-400 mt-1">{stats.estoques} estoques envolvidos</p>
            </div>
            <div className="bg-white rounded-2xl border border-red-200 p-4 shadow-sm bg-red-50/30">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wider">Críticos / Alerta</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{stats.criticos + stats.alertas}</p>
              <p className="text-xs text-red-400 mt-1">{stats.criticos} críticos, {stats.alertas} em alerta</p>
            </div>
            <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm bg-amber-50/30">
              <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider">Sugestões Alta Prior.</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{stats.sugestoesAlta}</p>
              <p className="text-xs text-amber-400 mt-1">{sugestoes.length} sugestões no total</p>
            </div>
            <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-sm bg-blue-50/30">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Estoques em Excesso</p>
              <p className="text-3xl font-bold text-blue-600 mt-1">{stats.excessos}</p>
              {stats.valorRisco > 0 && (
                <p className="text-xs text-blue-400 mt-1">
                  R$ {stats.valorRisco.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} est. remanejável
                </p>
              )}
            </div>
          </div>

          {/* Tabs internas + Ações */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
              <button
                onClick={() => setInnerTab('sugestoes')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${innerTab === 'sugestoes' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Sugestões de Remanejamento
                {sugestoes.length > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${innerTab === 'sugestoes' ? 'bg-amber-100 text-amber-700' : 'bg-slate-200 text-slate-600'}`}>
                    {sugestoes.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setInnerTab('analise')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${innerTab === 'analise' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Análise por Estoque
                <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${innerTab === 'analise' ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600'}`}>
                  {analise.length}
                </span>
              </button>
            </div>

            <div className="flex gap-2 flex-wrap items-center">
              {/* Indicador de sincronização automática com o bot */}
              {botSyncStatus === 'syncing' && (
                <span className="text-xs text-slate-500 flex items-center gap-1 animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Sincronizando bot...
                </span>
              )}
              {botSyncStatus === 'ok' && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Bot sincronizado
                </span>
              )}
              {botSyncStatus === 'erro' && (
                <span className="text-xs text-amber-600 flex items-center gap-1" title="KV não configurado — use o botão para copiar manualmente">
                  <AlertTriangle className="w-3 h-3" /> Bot offline
                </span>
              )}
              <button
                onClick={handleCopiarWhatsApp}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              >
                {copiadoMsg ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copiadoMsg ? 'Copiado!' : 'Copiar WhatsApp'}
              </button>
              <button
                onClick={() => exportarTXT(sugestoes)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <FileText className="w-4 h-4" />
                Exportar TXT
              </button>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <select
                value={filterEstoque}
                onChange={e => setFilterEstoque(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="TODOS">Todos os Estoques</option>
                {estoques.map(e => (
                  <option key={e} value={e}>{e.split('|')[1] || e.split('|')[0]}</option>
                ))}
              </select>
              {innerTab === 'analise' ? (
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="TODOS">Todos os Status</option>
                  <option value="CRÍTICO">Crítico</option>
                  <option value="ALERTA">Alerta</option>
                  <option value="NORMAL">Normal</option>
                  <option value="EXCESSO">Excesso</option>
                  <option value="SEM CONSUMO">Sem Consumo</option>
                </select>
              ) : (
                <select
                  value={filterPrioridade}
                  onChange={e => setFilterPrioridade(e.target.value)}
                  className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="TODOS">Todas as Prioridades</option>
                  <option value="ALTA">Alta</option>
                  <option value="MÉDIA">Média</option>
                  <option value="BAIXA">Baixa</option>
                </select>
              )}
              <button
                onClick={() => { setSearch(''); setFilterStatus('TODOS'); setFilterEstoque('TODOS'); setFilterPrioridade('TODOS'); }}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                title="Limpar filtros"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tabela de Sugestões */}
          {innerTab === 'sugestoes' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {sugestoesFiltered.length === 0 ? (
                <div className="p-10 text-center">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                  <p className="text-slate-600 font-medium">
                    {sugestoes.length === 0
                      ? 'Nenhuma sugestão de remanejamento necessária'
                      : 'Nenhuma sugestão para os filtros selecionados'}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">
                    {sugestoes.length === 0
                      ? 'Os estoques estão bem distribuídos ou não há produtos em múltiplos estoques com desequilíbrio'
                      : 'Tente remover os filtros ativos'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Produto</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">De (Origem)</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Saldo / Cobertura</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Para (Destino)</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Saldo / Cobertura</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Qtd. Sugerida</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Prioridade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sugestoesFiltered.map((s, idx) => (
                        <tr
                          key={idx}
                          className={`border-b border-slate-100 hover:bg-amber-50/30 transition-colors ${s.prioridade === 'ALTA' ? 'bg-red-50/20' : ''}`}
                        >
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-800 text-xs leading-tight max-w-[220px]">{s.produto}</p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{s.unidade}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-slate-700">{s.origemNome}</p>
                            <p className="text-[10px] text-slate-400">ID: {s.origemId}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-xs font-semibold text-blue-700">{s.saldoOrigem.toLocaleString('pt-BR')} {s.unidade}</p>
                            <p className="text-[10px] text-blue-400">{s.coberturaOrigem >= 9999 ? '999+' : s.coberturaOrigem.toFixed(0)} dias</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-xs font-medium text-slate-700">{s.destinoNome}</p>
                            <p className="text-[10px] text-slate-400">ID: {s.destinoId}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className={`text-xs font-semibold ${s.coberturaDestino < 15 ? 'text-red-700' : 'text-amber-700'}`}>
                              {s.saldoDestino.toLocaleString('pt-BR')} {s.unidade}
                            </p>
                            <p className={`text-[10px] ${s.coberturaDestino < 15 ? 'text-red-400' : 'text-amber-400'}`}>
                              {s.coberturaDestino.toFixed(0)} dias
                            </p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <p className="text-sm font-bold text-slate-800">{s.qtdSugerida.toLocaleString('pt-BR')}</p>
                            <p className="text-[10px] text-slate-400">{s.unidade}</p>
                            {s.custoMedio > 0 && (
                              <p className="text-[10px] text-slate-400">
                                R$ {(s.qtdSugerida * s.custoMedio).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <PrioridadeBadge prioridade={s.prioridade} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                    {sugestoesFiltered.length} de {sugestoes.length} sugestões
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tabela de Análise */}
          {innerTab === 'analise' && (
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th
                        className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                        onClick={() => toggleSort('produto')}
                      >
                        <div className="flex items-center gap-1">Produto <SortIcon field="produto" /></div>
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Estoque</th>
                      <th
                        className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                        onClick={() => toggleSort('saldoAtual')}
                      >
                        <div className="flex items-center justify-end gap-1">Saldo Atual <SortIcon field="saldoAtual" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                        onClick={() => toggleSort('consumoDiario')}
                      >
                        <div className="flex items-center justify-end gap-1">Cons./dia <SortIcon field="consumoDiario" /></div>
                      </th>
                      <th
                        className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider cursor-pointer select-none hover:text-slate-700"
                        onClick={() => toggleSort('coberturaDias')}
                      >
                        <div className="flex items-center justify-end gap-1">Cobertura <SortIcon field="coberturaDias" /></div>
                      </th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Est.Min / Est.Max</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analiseFiltered.map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800 text-xs leading-tight max-w-[220px]">{item.produto}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{item.unidade}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs font-medium text-slate-700">{item.estoqueName}</p>
                          <p className="text-[10px] text-slate-400">ID: {item.estoqueId}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs font-semibold text-slate-800">{item.saldoAtual.toLocaleString('pt-BR')}</p>
                          <p className="text-[10px] text-slate-400">{item.unidade}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs text-slate-700">
                            {item.consumoDiario > 0 ? item.consumoDiario.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—'}
                          </p>
                          {item.consumoTotal > 0 && (
                            <p className="text-[10px] text-slate-400">{item.consumoTotal.toLocaleString('pt-BR')} qtd/QBR</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className={`text-xs font-semibold ${item.coberturaDias < 15 ? 'text-red-700' : item.coberturaDias < 30 ? 'text-amber-700' : item.coberturaDias >= 90 ? 'text-blue-700' : 'text-emerald-700'}`}>
                            {item.coberturaDias >= 9999 ? '999+' : item.coberturaDias.toFixed(0)} dias
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <p className="text-xs text-slate-500">
                            {item.estMin > 0 || item.estMax > 0
                              ? `${item.estMin.toLocaleString('pt-BR')} / ${item.estMax.toLocaleString('pt-BR')}`
                              : '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={item.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 text-xs text-slate-500">
                  {analiseFiltered.length} de {analise.length} produtos
                </div>
              </div>
            </div>
          )}

          {/* Legenda */}
          <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
            <p className="text-xs font-semibold text-slate-600 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" /> Legenda — Critérios de Cobertura
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
              {[
                { label: 'CRÍTICO', desc: '< 15 dias', bg: 'bg-red-100', text: 'text-red-700' },
                { label: 'ALERTA', desc: '15 a 29 dias', bg: 'bg-amber-100', text: 'text-amber-700' },
                { label: 'NORMAL', desc: '30 a 89 dias', bg: 'bg-emerald-100', text: 'text-emerald-700' },
                { label: 'EXCESSO', desc: '≥ 90 dias', bg: 'bg-blue-100', text: 'text-blue-700' },
                { label: 'SEM CONSUMO', desc: 'Sem mov. registrada', bg: 'bg-slate-100', text: 'text-slate-600' },
              ].map(l => (
                <div key={l.label} className={`${l.bg} rounded-xl px-3 py-2`}>
                  <p className={`font-bold ${l.text}`}>{l.label}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5">{l.desc}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 mt-3">
              Cobertura = Saldo Atual ÷ Consumo Diário &nbsp;|&nbsp; Consumo Diário = Consumo Quadrimestral ÷ 120 dias &nbsp;|&nbsp;
              Sugestão: mantém 30 dias de cobertura na origem ao transferir
            </p>
          </div>
        </>
      )}
    </div>
  );
};
