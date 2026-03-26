import React, { useState, useMemo } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { AlertTriangle, TrendingDown, Clock, Package, Upload, Filter, FileText, BarChart2, ShoppingCart, XCircle, CheckCircle, AlertOctagon, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { exportRessuprimentoPDF, exportRessuprimentoDashboardPDF } from '../utils/pdfExport';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
  ScatterChart, Scatter, ZAxis,
  ReferenceLine, LabelList, Label,
} from 'recharts';

import { getRiscoAssistencial } from '../utils/riscoAssistencial';
import { getCategoriaProduto, CategoriaProduto } from '../utils/categorias';

interface OCItem {
  id: string;
  oc: string;
  fornecedor: string;
  quantidadeComprada: number;
  dataPrevista: string;
  atraso: number;
}

interface TrackingItem {
  id: string;
  produto: string;
  unidade: string;
  mediaConsumo: number;
  saldoAtual: number;
  coberturaDias: number;
  status: 'CRÍTICO' | 'ALERTA' | 'OK';
  previsaoRuptura: string;
  pontoRessuprimento: number;
  necessidadeCompra: number;
  tendenciaConsumo: 'ALTA' | 'MÉDIA' | 'BAIXA';
  ocInfo: OCItem[];
  riscoAss: ReturnType<typeof getRiscoAssistencial>;
  categoria: CategoriaProduto;
}

type SubTab = 'dashboard' | 'lista';

const calcAtraso = (dtStr: string) => {
  if (!dtStr || dtStr === 'N/A') return 0;
  try {
    const parts = dtStr.includes('/') ? dtStr.split('/') : dtStr.split('-');
    let dateObj;
    if (dtStr.includes('/')) dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    else dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    dateObj.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((today.getTime() - dateObj.getTime()) / 86400000);
  } catch {
    return 0;
  }
};

// ── Faixas de atraso de OC ────────────────────────────────────────────────────
// Aceitável  : 1–3 dias  → variação logística normal, sem ação imediata
// Atenção    : 4–7 dias  → follow-up com fornecedor necessário
// Inaceitável: > 7 dias  → escalonamento obrigatório
const OC_ATRASO_ACEITAVEL = 3;
const OC_ATRASO_ATENCAO   = 7;

const getAtrasoInfo = (dias: number): { fill: string; label: string; badgeClass: string } => {
  if (dias <= 0)                    return { fill: '#059669', label: 'No prazo',    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (dias <= OC_ATRASO_ACEITAVEL)  return { fill: '#f59e0b', label: 'Aceitável',   badgeClass: 'bg-yellow-50  text-yellow-700  border-yellow-200'  };
  if (dias <= OC_ATRASO_ATENCAO)    return { fill: '#ea580c', label: 'Atenção',     badgeClass: 'bg-orange-50  text-orange-700  border-orange-200'  };
  return                                   { fill: '#dc2626', label: 'Inaceitável', badgeClass: 'bg-red-50     text-red-700     border-red-200'     };
};

const ChartCard: React.FC<{ title: string; subtitle?: string; children: React.ReactNode; height?: number }> =
  ({ title, subtitle, children, height = 240 }) => (
  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 min-w-0">
    <p className="text-sm font-semibold text-slate-800">{title}</p>
    {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
    <div className="mt-3 w-full" style={{ height }}>{children}</div>
  </div>
);

export const Ressuprimento: React.FC = () => {
  const [trackingData, setTrackingData] = usePersistentState<TrackingItem[]>('ressuprimento_tracking_v2', []);
  const [ocData, setOcData] = usePersistentState<Record<string, OCItem[]>>('ressuprimento_oc_v2', {});
  const [filterStatus, setFilterStatus] = useState<'TODOS' | 'CRÍTICO' | 'ALERTA' | 'OK'>('TODOS');
  const [filterCategoria, setFilterCategoria] = useState<'TODOS' | CategoriaProduto>('TODOS');
  const [filterOC, setFilterOC] = useState<'TODOS' | 'COM_OC' | 'SEM_OC'>('TODOS');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('dashboard');
  const [sortBy, setSortBy] = useState<'coberturaAsc' | 'coberturaDesc' | 'necessidadeDesc' | 'necessidadeAsc' | 'mediaDesc' | 'mediaAsc' | 'saldoAsc' | 'saldoDesc' | 'atrasoDesc' | 'riscoDesc' | 'riscoAsc'>('coberturaAsc');
  const normalizeCol = (s: string) => s.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '');

  const handleTrackingUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split(/\r?\n/);
        let headerIdx = -1;
        
        for (let i = 0; i < Math.min(lines.length, 20); i++) {
          const l = lines[i].toUpperCase();
          // Procura por SALDO e algo que pareça MÉDIA ou TOTAL (evita depender do 'é' exato)
          const hasSaldo = l.includes('SALDO');
          const hasMedia = l.includes('MEDIA') || l.includes('M\u00C9DIA') || l.includes('M\uFFFD');
          const hasTotal = l.includes('TOTAL');
          
          if (hasSaldo && (hasMedia || hasTotal)) { 
            headerIdx = i; 
            break; 
          }
        }

        if (headerIdx === -1) {
          // Fallback desesperado: se houver "PRODUTO" e "UNIDADE" na linha
          for (let i = 0; i < Math.min(lines.length, 10); i++) {
            const l = lines[i].toUpperCase();
            if (l.includes('PRODUTO') && l.includes('UNIDADE')) {
              headerIdx = i;
              break;
            }
          }
        }

        if (headerIdx === -1) {
          alert('Não foi possível encontrar o cabeçalho (colunas Média e Saldo) no arquivo. Certifique-se de que o arquivo CSV contém os totais.');
          return;
        }

        const rawHeaders: string[] = [];
        let curH = ''; let inQH = false;
        const hLine = lines[headerIdx];
        for (let ci = 0; ci < hLine.length; ci++) {
          const ch = hLine[ci];
          if (ch === '"') { inQH = !inQH; continue; }
          if (ch === ',' && !inQH) { rawHeaders.push(curH); curH = ''; continue; }
          curH += ch;
        }
        rawHeaders.push(curH);
        
        // Se após o parse da linha temos apenas 1 coluna, pode ser o separador errado (ex: ponto e vírgula)
        let finalRawHeaders = rawHeaders;
        if (rawHeaders.length < 5 && hLine.includes(';')) {
          finalRawHeaders = hLine.split(';');
        }
        
        const headers = finalRawHeaders.map(normalizeCol);

        const pIdx = headers.findIndex(h => h === 'PRODUTO' || h === 'NOME');
        const uIdx = headers.findIndex(h => h === 'UNIDADE' || h === 'UNID');
        const mIdx = headers.findIndex(h => h === 'MEDIA' || h === 'MEDIADIARIA' || h.includes('MEDIA') || h.includes('MEDDIARIA'));
        const sIdx = headers.findIndex(h => h === 'SALDO' || h.includes('SALDO'));
        const idIdx_raw = headers.findIndex(h => h === 'ID' || h === 'CODIGO' || h === 'COD');

        // Lógica para detectar se ID e Produto estão separados (Ex: Produto, , Unidade)
        // Se a coluna 0 é Produto e a 1 é vazia no header, geralmente 0=ID e 1=Nome
        const isSeparado = (pIdx === 0 && headers[1] === '');
        const idIdx = idIdx_raw !== -1 ? idIdx_raw : (isSeparado ? 0 : -1);
        const finalPIdx = isSeparado ? 1 : (pIdx !== -1 ? pIdx : 0);

        const data: TrackingItem[] = [];
        for (let i = headerIdx + 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          
          let cols: string[] = [];
          
          // Se o header usou ponto e vírgula, usa split direto na linha
          if (finalRawHeaders.length > rawHeaders.length) {
            cols = line.split(';');
          } else {
            // Parse CSV respeitando aspas para vírgulas
            let cur = ''; let inQ = false;
            for (let ci = 0; ci < line.length; ci++) {
              const ch = line[ci];
              if (ch === '"') { inQ = !inQ; continue; }
              if (ch === ',' && !inQ) { cols.push(cur); cur = ''; continue; }
              cur += ch;
            }
            cols.push(cur);
          }

          const produto = cols[finalPIdx]?.trim() || '';
          const unidade = cols[uIdx === -1 ? 2 : uIdx]?.trim() || '';
          const mediaRaw = parseFloat(cols[mIdx === -1 ? 11 : mIdx]?.replace(',', '.') || '0') || 0;
          const saldo = Math.max(0, parseFloat(cols[sIdx === -1 ? 12 : sIdx]?.replace(',', '.') || '0') || 0);
          
          let id = '';
          if (idIdx !== -1) {
            id = cols[idIdx]?.trim();
          } else {
            // Se ID ainda não definido, tenta pegar col 0 se for número ou gerar
            const firstCol = cols[0]?.trim() || '';
            if (/^\d+$/.test(firstCol)) {
              id = firstCol;
            } else {
              id = produto.substring(0, 10) + Math.abs(produto.split('').reduce((a,b)=>(((a<<5)-a)+b.charCodeAt(0))|0,0));
            }
          }

          if (!produto || produto.toLowerCase() === 'produto') continue;
          if (['19561', '19562', '19566', '19569', '19570'].includes(id)) continue;
          
          const coberturaRaw = mediaRaw > 0 ? saldo / mediaRaw : (saldo > 0 ? 999 : 0);
          const cobertura = Math.max(0, coberturaRaw);
          
          data.push({
            id, produto, unidade,
            mediaConsumo: mediaRaw,
            saldoAtual: saldo,
            coberturaDias: cobertura,
            status: cobertura <= 3 ? 'CRÍTICO' : cobertura <= 7 ? 'ALERTA' : 'OK',
            previsaoRuptura: cobertura <= 0 ? 'ESGOTADO' : cobertura > 900 ? 'Estoque Alto' : `Em ${Math.ceil(cobertura)} dias`,
            pontoRessuprimento: mediaRaw * 7,
            necessidadeCompra: Math.max(0, mediaRaw * 7 - saldo),
            tendenciaConsumo: mediaRaw >= 15 ? 'ALTA' : mediaRaw >= 3 ? 'MÉDIA' : 'BAIXA',
            ocInfo: [],
            riscoAss: getRiscoAssistencial(produto),
            categoria: getCategoriaProduto(produto),
          });
        }
        setTrackingData(data);
      } catch (error) {
        console.error('Erro ao processar tracking:', error);
        alert('Erro ao processar arquivo de rastreio');
      }
    };
    reader.readAsText(file);
  };

  const handleOCUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string;
        const lines = csv.split('\n');
        const ocMap: Record<string, OCItem[]> = {};
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const cols = line.split(',');
          if (cols.length < 11) continue;
          const dataPrevista = cols[0]?.trim();
          const oc = cols[2]?.trim();
          const fornecedor = cols[5]?.trim();
          const id = cols[6]?.trim();
          const qtComprada = parseFloat(cols[10]?.replace(',', '.') || '0');
          if (id && oc) {
            if (!ocMap[id]) ocMap[id] = [];
            if (!ocMap[id].some(o => o.oc === oc)) {
              const atraso = calcAtraso(dataPrevista);
              ocMap[id].push({ id, oc, fornecedor: fornecedor || 'N/A', quantidadeComprada: qtComprada, dataPrevista: dataPrevista || 'N/A', atraso });
            }
          }
        }
        setOcData(ocMap);
      } catch (error) {
        console.error('Erro ao processar OC:', error);
        alert('Erro ao processar arquivo de ordens de compra');
      }
    };
    reader.readAsText(file);
  };

  const allData = useMemo(() =>
    trackingData.map(item => ({ ...item, ocInfo: ocData[item.id] || [] })),
    [trackingData, ocData]
  );

  const displayData = useMemo(() => {
    let list = allData
      .filter(item => {
        const matchesStatus = filterStatus === 'TODOS' || item.status === filterStatus;
        const matchesCat    = filterCategoria === 'TODOS' || item.categoria === filterCategoria;
        const matchesOC     = filterOC === 'TODOS' || (filterOC === 'COM_OC' ? item.ocInfo.length > 0 : item.ocInfo.length === 0);
        const isExcluded    = ['19561', '19562', '19566', '19569', '19570'].includes(item.id);
        const matchesSearch =
          item.produto.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.id.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesCat && matchesOC && matchesSearch && !isExcluded;
      });

    list.sort((a, b) => {
      if (sortBy === 'coberturaAsc') return a.coberturaDias - b.coberturaDias;
      if (sortBy === 'coberturaDesc') return b.coberturaDias - a.coberturaDias;
      if (sortBy === 'tendenciaDesc') {
        const order = { ALTA: 3, MÉDIA: 2, BAIXA: 1 };
        return order[b.tendenciaConsumo] - order[a.tendenciaConsumo];
      }
      if (sortBy === 'tendenciaAsc') {
        const order = { ALTA: 3, MÉDIA: 2, BAIXA: 1 };
        return order[a.tendenciaConsumo] - order[b.tendenciaConsumo];
      }
      if (sortBy === 'mediaDesc') return b.mediaConsumo - a.mediaConsumo;
      if (sortBy === 'mediaAsc') return a.mediaConsumo - b.mediaConsumo;
      if (sortBy === 'saldoAsc') return a.saldoAtual - b.saldoAtual;
      if (sortBy === 'saldoDesc') return b.saldoAtual - a.saldoAtual;
      if (sortBy === 'riscoDesc') return b.riscoAss.ordem - a.riscoAss.ordem;
      if (sortBy === 'riscoAsc') return a.riscoAss.ordem - b.riscoAss.ordem;
      if (sortBy === 'categoriaAsc') return a.categoria.localeCompare(b.categoria);
      if (sortBy === 'categoriaDesc') return b.categoria.localeCompare(a.categoria);
      if (sortBy === 'atrasoDesc') {
        const aMax = a.ocInfo && a.ocInfo.length > 0 ? Math.max(...a.ocInfo.map(o => o.atraso)) : -999;
        const bMax = b.ocInfo && b.ocInfo.length > 0 ? Math.max(...b.ocInfo.map(o => o.atraso)) : -999;
        return bMax - aMax;
      }
      return 0;
    });

    return list;
  }, [allData, filterStatus, searchTerm, sortBy]);

  const allStats = useMemo(() => {
    const criticos = allData.filter(d => d.status === 'CRÍTICO').length;
    const alertas = allData.filter(d => d.status === 'ALERTA').length;
    const ok = allData.filter(d => d.status === 'OK').length;
    const coberturaMedia = allData.length > 0 ? allData.reduce((s, d) => s + d.coberturaDias, 0) / allData.length : 0;
    const necessidadeTotal = allData.reduce((s, d) => s + d.necessidadeCompra, 0);
    const criticosSemOC = allData.filter(d => d.status === 'CRÍTICO' && (!d.ocInfo || d.ocInfo.length === 0)).length;
    return { criticos, alertas, ok, coberturaMedia, necessidadeTotal, criticosSemOC, total: allData.length };
  }, [allData]);

  const filteredStats = useMemo(() => ({
    totalItens: displayData.length,
    criticos: displayData.filter(d => d.status === 'CRÍTICO').length,
    necessidadeTotal: displayData.reduce((s, d) => s + d.necessidadeCompra, 0),
    coberturaMedia: displayData.length > 0 ? displayData.reduce((s, d) => s + d.coberturaDias, 0) / displayData.length : 0,
  }), [displayData]);

  const statusPieData = useMemo(() => [
    { name: 'CRÍTICO', value: allStats.criticos, color: '#dc2626' },
    { name: 'ALERTA',  value: allStats.alertas,  color: '#d97706' },
    { name: 'OK',      value: allStats.ok,        color: '#059669' },
  ].filter(d => d.value > 0), [allStats]);

  const top10Cobertura = useMemo(() =>
    [...allData].sort((a, b) => a.coberturaDias - b.coberturaDias).slice(0, 10).map(d => ({
      name: d.produto.length > 26 ? d.produto.substring(0, 26) + '…' : d.produto,
      fullName: d.produto,
      cobertura: parseFloat(d.coberturaDias.toFixed(1)),
      status: d.status,
      consumo: parseFloat(d.mediaConsumo.toFixed(2)),
    })), [allData]);

  const top12Necessidade = useMemo(() =>
    [...allData].filter(d => d.status !== 'OK').sort((a, b) => b.necessidadeCompra - a.necessidadeCompra).slice(0, 12).map(d => ({
      name: d.id,
      saldo: Math.round(d.saldoAtual),
      necessidade: Math.round(d.necessidadeCompra),
    })), [allData]);

  const scatterCritico = useMemo(() => allData.filter(d => d.status === 'CRÍTICO').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)), name: d.produto.substring(0, 22) })), [allData]);
  const scatterAlerta  = useMemo(() => allData.filter(d => d.status === 'ALERTA').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)), name: d.produto.substring(0, 22) })), [allData]);
  const scatterOK      = useMemo(() => allData.filter(d => d.status === 'OK').map(d => ({ x: +d.mediaConsumo.toFixed(2), y: +d.coberturaDias.toFixed(1), z: Math.max(30, Math.round(d.necessidadeCompra)), name: d.produto.substring(0, 22) })), [allData]);

  // ── Novos KPI memos ──────────────────────────────────────────────────────────
  const rupturaIminente = useMemo(() => allData.filter(d => d.coberturaDias < 1).length, [allData]);

  const ocsComAtrasoCount = useMemo(() =>
    allData.flatMap(d => d.ocInfo).filter(oc => oc.atraso > 0).length,
    [allData]);

  const taxaAtendimentoOC = useMemo(() => {
    const needAction = allData.filter(d => d.status === 'CRÍTICO' || d.status === 'ALERTA');
    if (needAction.length === 0) return 100;
    return Math.round(needAction.filter(d => d.ocInfo.length > 0).length / needAction.length * 100);
  }, [allData]);

  const riscoCriticoBaixoEstoque = useMemo(() =>
    allData.filter(d => d.riscoAss.level === 'CRITICO' && (d.status === 'CRÍTICO' || d.status === 'ALERTA')).length,
    [allData]);

  // ── Novos gráficos memos ──────────────────────────────────────────────────────
  const coberturaByCategoria = useMemo(() => {
    const cats: CategoriaProduto[] = ['MEDICAMENTO', 'MATERIAL', 'DIETA', 'PSICOTRÓPICO', 'ALTA VIGILÂNCIA'];
    return cats.map(cat => {
      const items = allData.filter(d => d.categoria === cat && d.mediaConsumo > 0);
      const avg = items.length > 0 ? items.reduce((s, d) => s + d.coberturaDias, 0) / items.length : 0;
      const criticos = items.filter(d => d.status === 'CRÍTICO').length;
      return { name: cat, cobertura: parseFloat(avg.toFixed(1)), criticos, total: items.length };
    }).filter(d => d.total > 0).sort((a, b) => a.cobertura - b.cobertura);
  }, [allData]);

  const riscoVsStatus = useMemo(() => {
    const levels = [
      { key: 'CRITICO', label: 'Clínico Crítico' },
      { key: 'ALTO',    label: 'Clínico Alto' },
      { key: 'MEDIO',   label: 'Clínico Médio' },
      { key: 'BAIXO',   label: 'Clínico Baixo' },
    ] as const;
    return levels.map(({ key, label }) => {
      const items = allData.filter(d => d.riscoAss.level === key);
      return {
        name: label,
        'CRÍTICO': items.filter(d => d.status === 'CRÍTICO').length,
        'ALERTA':  items.filter(d => d.status === 'ALERTA').length,
        'OK':      items.filter(d => d.status === 'OK').length,
      };
    }).filter(d => d['CRÍTICO'] + d['ALERTA'] + d['OK'] > 0);
  }, [allData]);

  const ocAtrasoFaixas = useMemo(() => {
    const allOCs = allData.flatMap(d => d.ocInfo);
    if (allOCs.length === 0) return null;
    const noPrazo     = allOCs.filter(oc => oc.atraso <= 0).length;
    const aceitavel   = allOCs.filter(oc => oc.atraso > 0 && oc.atraso <= OC_ATRASO_ACEITAVEL).length;
    const atencao     = allOCs.filter(oc => oc.atraso > OC_ATRASO_ACEITAVEL && oc.atraso <= OC_ATRASO_ATENCAO).length;
    const inaceitavel = allOCs.filter(oc => oc.atraso > OC_ATRASO_ATENCAO).length;
    return { noPrazo, aceitavel, atencao, inaceitavel, total: allOCs.length };
  }, [allData]);

  const ocAtrasoFaixasPie = useMemo(() => {
    if (!ocAtrasoFaixas) return [];
    return [
      { name: 'No prazo',    value: ocAtrasoFaixas.noPrazo,     color: '#059669' },
      { name: 'Aceitável',   value: ocAtrasoFaixas.aceitavel,   color: '#f59e0b' },
      { name: 'Atenção',     value: ocAtrasoFaixas.atencao,     color: '#ea580c' },
      { name: 'Inaceitável', value: ocAtrasoFaixas.inaceitavel, color: '#dc2626' },
    ].filter(d => d.value > 0);
  }, [ocAtrasoFaixas]);

  const ocAtrasos = useMemo(() =>
    allData
      .filter(d => d.ocInfo.some(oc => oc.atraso > 0))
      .map(d => {
        const maxAtraso = Math.max(...d.ocInfo.map(oc => oc.atraso));
        const ocAtrasada = d.ocInfo.find(oc => oc.atraso === maxAtraso)!;
        return {
          name: d.produto.length > 24 ? d.produto.substring(0, 24) + '…' : d.produto,
          atraso: maxAtraso,
          fornecedor: ocAtrasada.fornecedor,
          status: d.status,
          oc: ocAtrasada.oc,
        };
      })
      .sort((a, b) => b.atraso - a.atraso)
      .slice(0, 10),
    [allData]);

  const RADIAN = Math.PI / 180;
  const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  const TooltipDonut = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const pct = allStats.total > 0 ? (d.value / allStats.total * 100).toFixed(1) : '0';
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold" style={{ color: d.payload.color }}>{d.name}</p>
        <p className="text-slate-700 mt-1">{d.value} itens <span className="text-slate-400">({pct}%)</span></p>
      </div>
    );
  };

  const TooltipTop10 = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const entry = top10Cobertura.find(t => t.name === label);
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[230px]">
        <p className="font-bold text-slate-800 mb-1 leading-tight">{entry?.fullName || label}</p>
        <p style={{ color: d.payload.status === 'CRÍTICO' ? '#dc2626' : d.payload.status === 'ALERTA' ? '#d97706' : '#059669' }}>
          Cobertura: <strong>{d.value} dias</strong>
        </p>
        {entry && <p className="text-slate-500 mt-0.5">Consumo/dia: {entry.consumo}</p>}
      </div>
    );
  };

  const TooltipNecessidade = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold text-slate-800 mb-1">ID: {label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.fill }}>{p.name}: <strong>{p.value?.toLocaleString('pt-BR')}</strong></p>
        ))}
      </div>
    );
  };

  const TooltipScatter = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[200px]">
        {d.name && <p className="font-bold text-slate-800 mb-1 leading-tight">{d.name}</p>}
        <p className="text-slate-600">Consumo/dia: <strong>{d.x}</strong></p>
        <p className="text-slate-600">Cobertura: <strong>{d.y} dias</strong></p>
        <p className="text-slate-600">Necessidade: <strong>{d.z?.toLocaleString('pt-BR')}</strong></p>
      </div>
    );
  };

  const TooltipCategoria = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold text-slate-800 mb-1">{label}</p>
        <p style={{ color: d.fill }}>Cobertura Média: <strong>{d.value} dias</strong></p>
        {d.payload && <p className="text-slate-500 mt-0.5">Total: {d.payload.total} itens · {d.payload.criticos} críticos</p>}
      </div>
    );
  };

  const TooltipFaixas = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const d = payload[0];
    const pct = ocAtrasoFaixas ? (d.value / ocAtrasoFaixas.total * 100).toFixed(1) : '0';
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs">
        <p className="font-bold" style={{ color: d.payload.color }}>{d.name}</p>
        <p className="text-slate-700 mt-1">{d.value} OCs <span className="text-slate-400">({pct}%)</span></p>
      </div>
    );
  };

  const TooltipOCAtrasos = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const entry = ocAtrasos.find(o => o.name === label);
    const info = getAtrasoInfo(payload[0]?.value ?? 0);
    return (
      <div className="bg-white border border-slate-200 rounded-xl shadow-lg p-3 text-xs max-w-[230px]">
        <p className="font-bold text-slate-800 mb-1 leading-tight">{entry?.name}</p>
        <p style={{ color: info.fill }}>
          Atraso: <strong>{payload[0]?.value} dias</strong>
          <span className="ml-1.5 font-semibold">— {info.label}</span>
        </p>
        {entry && <>
          <p className="text-slate-500 mt-0.5">OC: {entry.oc}</p>
          <p className="text-slate-500">Fornecedor: {entry.fornecedor}</p>
          <p className="text-slate-500">Status estoque: {entry.status}</p>
        </>}
        <div className="mt-2 pt-2 border-t border-slate-100 space-y-0.5 text-[10px] text-slate-400">
          <p>≤{OC_ATRASO_ACEITAVEL}d = Aceitável &nbsp;·&nbsp; ≤{OC_ATRASO_ATENCAO}d = Atenção &nbsp;·&nbsp; &gt;{OC_ATRASO_ATENCAO}d = Inaceitável</p>
        </div>
      </div>
    );
  };

  const subTabs: { id: SubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'lista', label: 'Lista', icon: <Package className="w-4 h-4" />, count: displayData.length },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50 to-slate-50 p-6 space-y-8">
      {/* Hero Section */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="flex justify-between items-start gap-8">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-3 bg-gradient-to-br from-purple-500 to-emerald-600 rounded-xl shadow-lg">
                <BarChart2 className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-emerald-600 bg-clip-text text-transparent">
                Inteligência de Ressuprimento
              </h1>
            </div>
            <p className="text-slate-600 text-lg leading-relaxed max-w-2xl">
              Cruzamento inteligente de estoque, consumo e ordens de compra para prevenção proativa de rupturas farmacêuticas.
            </p>
          </div>
          <div className="flex gap-3 flex-col">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passo 1: Estoque</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-50 to-emerald-50 text-purple-700 rounded-xl cursor-pointer hover:shadow-md transition border border-purple-200 font-semibold">
                <Upload className="w-4 h-4" />
                <span>{trackingData.length > 0 ? `Rastreio (${trackingData.length})` : 'Importar Rastreio'}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleTrackingUpload} />
              </label>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Passo 2: Compras</label>
              <label className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 rounded-xl cursor-pointer hover:shadow-md transition border border-emerald-200 font-semibold">
                <ShoppingCart className="w-4 h-4" />
                <span>{Object.keys(ocData).length > 0 ? `OCs (${Object.keys(ocData).length})` : 'Importar OCs'}</span>
                <input type="file" accept=".csv" className="hidden" onChange={handleOCUpload} />
              </label>
            </div>
          </div>
        </div>
      </motion.div>

      {trackingData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden">
          {/* Sub-tab nav */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-4 pt-3 gap-1">
            {subTabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveSubTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl border-b-2 transition-all -mb-px
                  ${activeSubTab === tab.id
                    ? 'border-purple-500 text-purple-700 bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${activeSubTab === tab.id ? 'bg-purple-100 text-purple-700' : 'bg-slate-200 text-slate-600'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
          {activeSubTab === 'dashboard' && (
            <div className="p-4 md:p-6 space-y-6">
              {/* Dashboard header + Export */}
              <div className="flex justify-end">
                <button
                  onClick={() => exportRessuprimentoDashboardPDF({
                    allStats,
                    novosKPIs: { rupturaIminente, ocsComAtrasoCount, taxaAtendimentoOC, riscoCriticoBaixoEstoque },
                    top10: top10Cobertura,
                    top12Necessidade,
                    coberturaByCategoria,
                    riscoVsStatus,
                    ocAtrasoFaixas,
                    ocAtrasos,
                    ocAtrasoAceitavel: OC_ATRASO_ACEITAVEL,
                    ocAtrasoAtencao: OC_ATRASO_ATENCAO,
                  })}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
                >
                  <FileText className="w-4 h-4" />
                  Exportar Dashboard PDF
                </button>
              </div>
              {/* 6 KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-red-500">
                  <div className="p-2.5 rounded-xl bg-red-50"><AlertTriangle className="w-5 h-5 text-red-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Críticos</p>
                    <p className="text-2xl font-bold text-red-600 mt-0.5">{allStats.criticos}</p>
                    <p className="text-xs text-slate-400">0–3 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-amber-400">
                  <div className="p-2.5 rounded-xl bg-amber-50"><TrendingDown className="w-5 h-5 text-amber-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Alertas</p>
                    <p className="text-2xl font-bold text-amber-600 mt-0.5">{allStats.alertas}</p>
                    <p className="text-xs text-slate-400">3–7 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-emerald-500">
                  <div className="p-2.5 rounded-xl bg-emerald-50"><CheckCircle className="w-5 h-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">OK</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-0.5">{allStats.ok}</p>
                    <p className="text-xs text-slate-400">&gt;7 dias de cobertura</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-purple-500">
                  <div className="p-2.5 rounded-xl bg-purple-50"><Package className="w-5 h-5 text-purple-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Necessidade Total</p>
                    <p className="text-2xl font-bold text-purple-600 mt-0.5">{Math.round(allStats.necessidadeTotal).toLocaleString('pt-BR')}</p>
                    <p className="text-xs text-slate-400">unidades a comprar</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-emerald-400">
                  <div className="p-2.5 rounded-xl bg-emerald-50"><Clock className="w-5 h-5 text-emerald-500" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Cobertura Média</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-0.5">{allStats.coberturaMedia.toFixed(1)}d</p>
                    <p className="text-xs text-slate-400">dias de estoque (média)</p>
                  </div>
                </div>
                <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-rose-600">
                  <div className="p-2.5 rounded-xl bg-rose-50"><XCircle className="w-5 h-5 text-rose-600" /></div>
                  <div>
                    <p className="text-xs text-slate-500 font-medium">Críticos sem OC</p>
                    <p className="text-2xl font-bold text-rose-600 mt-0.5">{allStats.criticosSemOC}</p>
                    <p className="text-xs text-slate-400">sem ordem de compra</p>
                  </div>
                </div>
              </div>

              {/* Indicadores Operacionais */}
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Indicadores Operacionais</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-red-700">
                    <div className="p-2.5 rounded-xl bg-red-50"><AlertOctagon className="w-5 h-5 text-red-700" /></div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Ruptura Iminente</p>
                      <p className="text-2xl font-bold text-red-700 mt-0.5">{rupturaIminente}</p>
                      <p className="text-xs text-slate-400">em ruptura ou esgotados</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-orange-500">
                    <div className="p-2.5 rounded-xl bg-orange-50"><Clock className="w-5 h-5 text-orange-500" /></div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">OCs com Atraso</p>
                      <p className="text-2xl font-bold text-orange-500 mt-0.5">{ocsComAtrasoCount}</p>
                      <p className="text-xs text-slate-400">ordens de compra atrasadas</p>
                    </div>
                  </div>
                  <div className={`bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 ${taxaAtendimentoOC >= 70 ? 'border-l-emerald-500' : taxaAtendimentoOC >= 40 ? 'border-l-amber-500' : 'border-l-red-500'}`}>
                    <div className={`p-2.5 rounded-xl ${taxaAtendimentoOC >= 70 ? 'bg-emerald-50' : taxaAtendimentoOC >= 40 ? 'bg-amber-50' : 'bg-red-50'}`}>
                      <ShoppingCart className={`w-5 h-5 ${taxaAtendimentoOC >= 70 ? 'text-emerald-600' : taxaAtendimentoOC >= 40 ? 'text-amber-500' : 'text-red-500'}`} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Taxa Atendimento OC</p>
                      <p className={`text-2xl font-bold mt-0.5 ${taxaAtendimentoOC >= 70 ? 'text-emerald-600' : taxaAtendimentoOC >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{taxaAtendimentoOC}%</p>
                      <p className="text-xs text-slate-400">críticos/alerta com OC</p>
                    </div>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm border-l-4 border-l-rose-700">
                    <div className="p-2.5 rounded-xl bg-rose-50"><Activity className="w-5 h-5 text-rose-700" /></div>
                    <div>
                      <p className="text-xs text-slate-500 font-medium">Risco Clínico Crítico</p>
                      <p className="text-2xl font-bold text-rose-700 mt-0.5">{riscoCriticoBaixoEstoque}</p>
                      <p className="text-xs text-slate-400">risco vital c/ estoque baixo</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts row 1: Donut + Horizontal Bar */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <ChartCard title="Distribuição de Status" subtitle="Crítico · Alerta · OK" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={65} outerRadius={105}
                        dataKey="value" labelLine={false} label={renderPieLabel}>
                        <Label value={allStats.total} position="center" fontSize={22} fontWeight={700} fill="#1e293b" dy={-8} />
                        <Label value="itens" position="center" fontSize={11} fill="#64748b" dy={12} />
                        {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip content={<TooltipDonut />} />
                      <Legend iconType="circle" iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Top 10 — Menor Cobertura" subtitle="Itens com risco mais iminente de ruptura" height={260}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top10Cobertura} layout="vertical" margin={{ top: 0, right: 45, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}d`} />
                      <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 9 }} />
                      <Tooltip content={<TooltipTop10 />} />
                      <ReferenceLine x={3} stroke="#dc2626" strokeDasharray="4 2" label={{ value: '3d', position: 'top', fontSize: 8, fill: '#dc2626' }} />
                      <ReferenceLine x={7} stroke="#d97706" strokeDasharray="4 2" label={{ value: '7d', position: 'top', fontSize: 8, fill: '#d97706' }} />
                      <Bar dataKey="cobertura" radius={[0, 6, 6, 0]}>
                        {top10Cobertura.map((entry, i) => (
                          <Cell key={i} fill={entry.status === 'CRÍTICO' ? '#dc2626' : entry.status === 'ALERTA' ? '#d97706' : '#059669'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Charts row 2: Grouped Bar + Scatter */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <ChartCard title="Saldo vs Necessidade de Compra" subtitle="Top 12 críticos/alerta por necessidade" height={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top12Necessidade} margin={{ top: 16, right: 10, left: -10, bottom: 45 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-45} textAnchor="end" interval={0} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip content={<TooltipNecessidade />} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="saldo" name="Saldo Atual" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="necessidade" name="Necessidade" fill="#dc2626" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="necessidade" position="top" fontSize={8} fill="#dc2626" formatter={(v: number) => v > 0 ? v.toLocaleString('pt-BR') : ''} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Consumo × Cobertura" subtitle="Tamanho do ponto = necessidade de compra" height={300}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 20, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" dataKey="x" name="Consumo/dia" tick={{ fontSize: 9 }}
                        label={{ value: 'Consumo/dia', position: 'insideBottom', offset: -10, fontSize: 9 }} />
                      <YAxis type="number" dataKey="y" name="Cobertura (d)" tick={{ fontSize: 9 }}
                        label={{ value: 'Cobertura (d)', angle: -90, position: 'insideLeft', fontSize: 9 }} />
                      <ZAxis type="number" dataKey="z" range={[30, 300]} />
                      <Tooltip cursor={{ strokeDasharray: '3 3' }} content={<TooltipScatter />} />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <ReferenceLine y={3} stroke="#dc2626" strokeDasharray="3 3" label={{ value: 'Crítico', position: 'insideTopRight', fontSize: 8, fill: '#dc2626' }} />
                      <ReferenceLine y={7} stroke="#d97706" strokeDasharray="3 3" label={{ value: 'Alerta', position: 'insideTopRight', fontSize: 8, fill: '#d97706' }} />
                      <Scatter name="CRÍTICO" data={scatterCritico} fill="#dc2626" fillOpacity={0.75} />
                      <Scatter name="ALERTA"  data={scatterAlerta}  fill="#d97706" fillOpacity={0.75} />
                      <Scatter name="OK"      data={scatterOK}      fill="#059669" fillOpacity={0.4} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Charts row 3: Cobertura por Categoria + Risco Clínico × Status */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                <ChartCard title="Cobertura Média por Categoria" subtitle="Média de dias de estoque por grupo (itens ativos)" height={240}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={coberturaByCategoria} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}d`} />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 9 }} />
                      <Tooltip content={<TooltipCategoria />} />
                      <ReferenceLine x={3} stroke="#dc2626" strokeDasharray="4 2" label={{ value: '3d', position: 'top', fontSize: 8, fill: '#dc2626' }} />
                      <ReferenceLine x={7} stroke="#d97706" strokeDasharray="4 2" label={{ value: '7d', position: 'top', fontSize: 8, fill: '#d97706' }} />
                      <Bar dataKey="cobertura" radius={[0, 6, 6, 0]}>
                        {coberturaByCategoria.map((entry, i) => (
                          <Cell key={i} fill={entry.cobertura < 3 ? '#dc2626' : entry.cobertura < 7 ? '#d97706' : '#059669'} />
                        ))}
                        <LabelList dataKey="cobertura" position="right" fontSize={9} formatter={(v: number) => `${v}d`} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Risco Clínico × Status de Estoque" subtitle="Interseção entre risco assistencial e situação de estoque" height={240}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={riscoVsStatus} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Legend iconSize={9} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="CRÍTICO" name="CRÍTICO" stackId="a" fill="#dc2626" />
                      <Bar dataKey="ALERTA"  name="ALERTA"  stackId="a" fill="#d97706" />
                      <Bar dataKey="OK"      name="OK"      stackId="a" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              </div>

              {/* Charts row 4: Faixas de Atraso + OC Atrasos por Item (condicional) */}
              {ocAtrasoFaixas && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-w-0">
                  {/* Donut de faixas */}
                  <ChartCard title="Distribuição de Atrasos de OC" subtitle={`≤${OC_ATRASO_ACEITAVEL}d Aceitável · ≤${OC_ATRASO_ATENCAO}d Atenção · >${OC_ATRASO_ATENCAO}d Inaceitável`} height={280}>
                    <div className="flex flex-col h-full gap-3">
                      <ResponsiveContainer width="100%" height="65%">
                        <PieChart>
                          <Pie data={ocAtrasoFaixasPie} cx="50%" cy="50%" innerRadius={52} outerRadius={85}
                            dataKey="value" labelLine={false} label={renderPieLabel}>
                            <Label value={ocAtrasoFaixas.total} position="center" fontSize={20} fontWeight={700} fill="#1e293b" dy={-7} />
                            <Label value="OCs" position="center" fontSize={10} fill="#64748b" dy={10} />
                            {ocAtrasoFaixasPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip content={<TooltipFaixas />} />
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
                        </PieChart>
                      </ResponsiveContainer>
                      {/* Mini KPI chips */}
                      <div className="grid grid-cols-2 gap-2 px-1">
                        {[
                          { label: 'No prazo',    value: ocAtrasoFaixas.noPrazo,     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
                          { label: 'Aceitável',   value: ocAtrasoFaixas.aceitavel,   color: 'text-yellow-700',  bg: 'bg-yellow-50  border-yellow-200'  },
                          { label: 'Atenção',     value: ocAtrasoFaixas.atencao,     color: 'text-orange-700',  bg: 'bg-orange-50  border-orange-200'  },
                          { label: 'Inaceitável', value: ocAtrasoFaixas.inaceitavel, color: 'text-red-700',     bg: 'bg-red-50     border-red-200'     },
                        ].map(({ label, value, color, bg }) => (
                          <div key={label} className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-semibold ${bg}`}>
                            <span className="text-slate-600">{label}</span>
                            <span className={`font-black text-sm ${color}`}>{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ChartCard>

                  {/* Bar: OC Atrasos por item */}
                  {ocAtrasos.length > 0 ? (
                    <ChartCard title="OCs em Atraso por Item" subtitle="Top 10 itens com ordens de compra vencidas" height={280}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={ocAtrasos} layout="vertical" margin={{ top: 0, right: 55, left: 10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}d`} />
                          <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9 }} />
                          <Tooltip content={<TooltipOCAtrasos />} />
                          <ReferenceLine x={OC_ATRASO_ACEITAVEL} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: `${OC_ATRASO_ACEITAVEL}d`, position: 'top', fontSize: 8, fill: '#d97706' }} />
                          <ReferenceLine x={OC_ATRASO_ATENCAO}   stroke="#ea580c" strokeDasharray="4 2" label={{ value: `${OC_ATRASO_ATENCAO}d`,  position: 'top', fontSize: 8, fill: '#ea580c' }} />
                          <Bar dataKey="atraso" radius={[0, 6, 6, 0]}>
                            {ocAtrasos.map((entry, i) => (
                              <Cell key={i} fill={getAtrasoInfo(entry.atraso).fill} />
                            ))}
                            <LabelList dataKey="atraso" position="right" fontSize={9} formatter={(v: number) => `${v}d`} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  ) : (
                    <ChartCard title="OCs em Atraso por Item" subtitle="Nenhuma OC com atraso registrado" height={280}>
                      <div className="flex h-full items-center justify-center text-slate-400 text-sm font-medium">
                        Todas as OCs estão dentro do prazo
                      </div>
                    </ChartCard>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── LISTA ─────────────────────────────────────────────────────── */}
          {activeSubTab === 'lista' && (
            <>
              <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-white flex-wrap gap-4">
                <div className="flex gap-4 items-start flex-1 min-w-0 flex-col 2xl:flex-row">
                  {/* Busca */}
                  <div className="relative flex-1 max-w-sm w-full">
                    <Filter className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Filtrar por código ou produto..."
                      className="w-full pl-11 pr-4 py-2 border border-slate-200 bg-slate-50 rounded-xl text-sm font-medium focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none transition-all placeholder:text-slate-400"
                      value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  
                  {/* Filtros em linha */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 shadow-inner">
                      {(['TODOS', 'CRÍTICO', 'ALERTA', 'OK'] as const).map(s => (
                        <button key={s} onClick={() => setFilterStatus(s)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all whitespace-nowrap
                            ${filterStatus === s ? 'bg-white text-purple-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                          {s}
                        </button>
                      ))}
                    </div>

                    <select
                      value={filterOC}
                      onChange={(e) => setFilterOC(e.target.value as any)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-purple-500 transition cursor-pointer h-[34px]"
                    >
                      <option value="TODOS">Todas OCs</option>
                      <option value="COM_OC">Com OC</option>
                      <option value="SEM_OC">Sem OC</option>
                    </select>

                    <div className="flex items-center bg-slate-100 border border-slate-200 rounded-xl p-1 shadow-inner overflow-x-auto max-w-[600px] hide-scrollbar">
                      {(['TODOS', 'MEDICAMENTO', 'MATERIAL', 'DIETA', 'PSICOTRÓPICO', 'ALTA VIGILÂNCIA'] as const).map(c => (
                        <button key={c} onClick={() => setFilterCategoria(c as any)}
                          className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wide uppercase transition-all whitespace-nowrap
                            ${filterCategoria === c ? 'bg-white text-purple-600 shadow-sm border border-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>
                          {c === 'TODOS' ? 'Todas Categorias' : c}
                        </button>
                      ))}
                    </div>

                    {/* Dropdown de Ordenação */}
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-purple-500 transition cursor-pointer h-[34px]"
                    >
                      <optgroup label="Prioridade e Risco">
                        <option value="riscoDesc">Risco: Crítico → Baixo</option>
                        <option value="atrasoDesc">Maior Atraso OC</option>
                        <option value="coberturaAsc">Mais Urgente (Menor Cobertura)</option>
                      </optgroup>
                      
                      <optgroup label="Prazo de Estoque">
                        <option value="coberturaDesc">Maior Cobertura</option>
                      </optgroup>

                      <optgroup label="Volume e Planejamento">
                        <option value="categoriaAsc">Categoria (A-Z)</option>
                        <option value="necessidadeDesc">Maior Necessidade de Compra</option>
                        <option value="saldoAsc">Menor Saldo Primeiro</option>
                        <option value="saldoDesc">Maior Saldo Primeiro</option>
                        <option value="mediaDesc">Maior Consumo Diário</option>
                        <option value="mediaAsc">Menor Consumo Diário</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
                <button onClick={() => exportRessuprimentoPDF(displayData, { status: filterStatus, search: searchTerm })}
                  className="flex items-center gap-2 px-5 py-2.5 bg-purple-50 text-purple-700 font-bold text-xs uppercase tracking-wider hover:bg-purple-100 rounded-xl transition border border-purple-100">
                  <FileText className="w-4 h-4" /> Exportar PDF
                </button>
              </div>

              <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-slate-200 m-4">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {[
                        { key: null,              label: 'Produto',            align: 'text-left', extra: 'rounded-tl-xl w-72' },
                        { key: 'risco',           label: 'Risco Assistencial', align: 'text-center' },
                        { key: 'categoria',       label: 'Categoria',          align: 'text-center' },
                        { key: 'media',           label: 'Consumo/dia',        align: 'text-right' },
                        { key: 'saldo',           label: 'Saldo Atual',        align: 'text-right' },
                        { key: 'cobertura',       label: 'Cobertura',          align: 'text-right' },
                        { key: null,              label: 'Status',             align: 'text-center' },
                        { key: 'cobertura',       label: 'Previsão de Ruptura', align: 'text-center', sortAlias: true },
                        { key: 'tendencia',       label: 'Tendência',          align: 'text-center' },
                        { key: null,              label: 'Ordem de Compra',    align: 'text-left', extra: 'rounded-tr-xl' },
                      ].map((col, ci) => {
                        const baseKey = col.key;
                        const isSortable = !!baseKey && !col.sortAlias;
                        const ascKey = `${baseKey}Asc`;
                        const descKey = `${baseKey}Desc`;
                        // Check if this column is currently the active sort
                        const isActiveAsc = sortBy === ascKey;
                        const isActiveDesc = sortBy === descKey;
                        const isActive = isActiveAsc || isActiveDesc;

                        return (
                          <th key={ci}
                            onClick={() => {
                              if (!isSortable) return;
                              // Toggle: if currently ascending, switch to descending; otherwise ascending
                              if (isActiveAsc) setSortBy(descKey as any);
                              else setSortBy(ascKey as any);
                            }}
                            className={`px-6 py-4 text-[10px] font-bold uppercase tracking-widest ${col.align} ${col.extra || ''} ${isSortable ? 'cursor-pointer hover:text-purple-600 hover:bg-slate-100 transition-colors select-none' : 'text-slate-500'} ${isActive ? 'text-purple-600' : 'text-slate-500'}`}>
                            <span className="inline-flex items-center gap-1">
                              {col.label}
                              {isSortable && (
                                <span className="text-[9px]">
                                  {isActiveAsc ? '▲' : isActiveDesc ? '▼' : '⇅'}
                                </span>
                              )}
                            </span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    <AnimatePresence>
                      {displayData.map((item, idx) => {
                        const isCritico = item.status === 'CRÍTICO';
                        const isAlerta  = item.status === 'ALERTA';
                        const isOK      = item.status === 'OK';

                        return (
                          <motion.tr key={`${item.id}-${idx}`}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="hover:bg-slate-50/50 transition-colors group">
                            
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0
                                  ${isCritico ? 'bg-red-50 text-red-600' : isAlerta ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                  {item.id}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-sm font-bold text-slate-900 leading-snug" title={item.produto}>
                                    {item.produto}
                                  </span>
                                  <span className="text-[11px] text-slate-400 font-semibold tracking-wide uppercase mt-0.5">{item.unidade}</span>
                                </div>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider text-white shadow-sm" style={{ backgroundColor: item.riscoAss.text }}>
                                  {item.riscoAss.label}
                                </span>
                                <span className="text-[9px] text-slate-400 font-medium leading-tight max-w-[120px] text-center">{item.riscoAss.impacto}</span>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200 uppercase tracking-tighter">
                                {item.categoria}
                              </span>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex flex-col items-end">
                                <span className="text-sm font-bold text-slate-700">{item.mediaConsumo.toFixed(2)}</span>
                                <span className="text-[10px] text-slate-400 font-medium tracking-wider">MÉDIA</span>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-black text-slate-900">{item.saldoAtual.toFixed(0)}</span>
                                <span className="text-[10px] text-slate-400 font-medium tracking-wider">UNIDADES</span>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex flex-col items-end">
                                <span className={`text-base font-black ${isCritico ? 'text-red-600' : isAlerta ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {item.coberturaDias.toFixed(2)}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium tracking-wider">DIAS</span>
                              </div>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border
                                ${isCritico ? 'bg-red-50 text-red-700 border-red-200' 
                                  : isAlerta ? 'bg-amber-50 text-amber-700 border-amber-200' 
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                                {item.status}
                              </span>
                            </td>

                            <td className="px-6 py-4 text-center">
                              <div className={`text-xs font-bold w-24 mx-auto text-center rounded-lg py-1.5 ${item.coberturaDias <= 0 ? 'bg-red-600 text-white shadow-sm shadow-red-200' : 'text-slate-600 bg-slate-50'}`}>
                                {item.previsaoRuptura}
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              <div className="flex flex-col items-end">
                                <span className="text-base font-black text-purple-600">{item.necessidadeCompra.toFixed(0)}</span>
                                <span className="text-[10px] text-purple-300 font-medium tracking-wider">UNIDADES</span>
                              </div>
                            </td>

                            <td className="px-6 py-4">
                              {item.ocInfo && item.ocInfo.length > 0 ? (
                                <div className="space-y-2">
                                  {item.ocInfo.map((oc, oidx) => (
                                    <div key={oidx} className="border border-slate-200 bg-slate-50 rounded-xl p-3 flex flex-col gap-1.5 shadow-sm hover:border-purple-200 transition-colors">
                                      <div className="flex items-center justify-between gap-4">
                                        <span className="text-[10px] font-black text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-100 shadow-sm">#{oc.oc}</span>
                                        <span className="text-xs font-bold text-emerald-600">{oc.quantidadeComprada} un</span>
                                      </div>
                                      <div className="flex items-start justify-between mt-0.5">
                                        <div className="flex flex-col">
                                          <span className="text-[10px] text-slate-600 font-bold truncate max-w-[120px]" title={oc.fornecedor}>{oc.fornecedor}</span>
                                          <span className="text-[10px] text-slate-400 font-medium">Prev: {oc.dataPrevista}</span>
                                        </div>
                                        {oc.atraso > 0 ? (
                                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap ${getAtrasoInfo(oc.atraso).badgeClass}`}>
                                            {oc.atraso}d — {getAtrasoInfo(oc.atraso).label}
                                          </span>
                                        ) : (
                                          <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 whitespace-nowrap">
                                            No prazo
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className={`flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-wider font-bold px-3 py-2 rounded-xl transition-colors
                                  ${isCritico ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-slate-50 text-slate-400 border border-slate-100'}`}>
                                  {isCritico ? <AlertTriangle className="w-4 h-4" /> : <XCircle className="w-4 h-4 opacity-50" />}
                                  Sem OC (pendente criação)
                                </div>
                              )}
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              <div className="mx-4 mb-4 mt-2 px-6 py-5 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens Visíveis</span>
                    <span className="text-xl font-black text-slate-800">{filteredStats.totalItens}</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Críticos</span>
                    <span className="text-xl font-black text-red-600">{filteredStats.criticos}</span>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Necessidade Total</span>
                    <span className="text-xl font-black text-purple-600">{Math.round(filteredStats.necessidadeTotal)} <span className="text-sm text-purple-400/80 font-bold ml-0.5">UN</span></span>
                  </div>
                  <div className="w-px h-8 bg-slate-200"></div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cobertura Média</span>
                    <span className="text-xl font-black text-slate-800">{filteredStats.coberturaMedia.toFixed(1)} <span className="text-sm text-slate-400 font-bold ml-0.5">DIAS</span></span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {trackingData.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg border border-slate-200 p-12 text-center">
          <Package className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium text-lg">Importe os arquivos CSV para visualizar os dados</p>
          <p className="text-slate-400 text-sm mt-2">Comece importando o arquivo de rastreio de estoque e depois as ordens de compra</p>
        </motion.div>
      )}
    </div>
  );
};
