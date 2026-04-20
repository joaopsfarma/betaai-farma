import React, { useState, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { UploadCloud, BarChart3, Package, TrendingUp, TrendingDown, Download, Info, AlertTriangle, CheckCircle, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  coeficienteVariacao,
  classificarXYZ,
  regressaoLinearSimples,
  mediaMovelPonderada,
  type ClasseXYZ,
} from '../utils/supplyScore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type CurvaABC = 'A' | 'B' | 'C';

interface ProdutoABCXYZ {
  id: string;
  nome: string;
  custoTotal: number;
  consumoDiario: number[];
  mediaConsumo: number;
  cv: number;
  curvaABC: CurvaABC;
  classeXYZ: ClasseXYZ;
  tendencia: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE';
  estrategia: string;
}

// ─── Estratégias por quadrante ──────────────────────────────────────────────

const ESTRATEGIAS: Record<string, { label: string; descricao: string; cor: string }> = {
  AX: { label: 'Reposição Contínua', descricao: 'Alto valor + demanda estável → JIT, contratos firmes, revisão contínua', cor: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  AY: { label: 'Revisão Periódica', descricao: 'Alto valor + demanda moderada → revisão semanal, safety stock moderado', cor: 'bg-amber-100 text-amber-800 border-amber-300' },
  AZ: { label: 'Alto Safety Stock', descricao: 'Alto valor + demanda errática → estoque segurança elevado, revisão frequente', cor: 'bg-rose-100 text-rose-800 border-rose-300' },
  BX: { label: 'Reposição Automática', descricao: 'Valor médio + estável → ponto de pedido fixo, kanban eletrônico', cor: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  BY: { label: 'Revisão Quinzenal', descricao: 'Valor médio + moderada → revisão quinzenal, ajuste por demanda', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
  BZ: { label: 'Safety Stock Médio', descricao: 'Valor médio + errática → estoque de segurança médio, monitoramento', cor: 'bg-orange-50 text-orange-700 border-orange-200' },
  CX: { label: 'Kanban Simples', descricao: 'Baixo valor + estável → kanban visual, pedido por lote econômico', cor: 'bg-slate-100 text-slate-700 border-slate-300' },
  CY: { label: 'Revisão Mensal', descricao: 'Baixo valor + moderada → revisão mensal, pedido por quantidade fixa', cor: 'bg-slate-50 text-slate-600 border-slate-200' },
  CZ: { label: 'Sob Demanda', descricao: 'Baixo valor + errática → compra sob demanda ou estoque mínimo', cor: 'bg-slate-50 text-slate-500 border-slate-200' },
};

function getEstrategia(abc: CurvaABC, xyz: ClasseXYZ): string {
  return `${abc}${xyz}`;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export const CurvaABCXYZ: React.FC = () => {
  const [produtos, setProdutos] = useState<ProdutoABCXYZ[]>([]);
  const [filtroQuadrante, setFiltroQuadrante] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const parseCSV = (file: File): Promise<string[][]> =>
    new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: false,
        skipEmptyLines: true,
        complete: r => resolve(r.data as string[][]),
        error: reject,
      });
    });

  const processarDados = useCallback(async (files: File[]) => {
    // Esperamos 2 CSVs: consumo (com histórico diário) e custos
    let dadosConsumo: string[][] = [];
    let dadosCusto: string[][] = [];

    for (const file of files) {
      const csv = await parseCSV(file);
      const header = csv[0]?.join(' ').toLowerCase() || '';
      if (header.includes('custo') || header.includes('valor') || header.includes('preço') || header.includes('preco')) {
        dadosCusto = csv;
      } else {
        dadosConsumo = csv;
      }
    }

    if (dadosConsumo.length === 0) return;

    // Parsear consumo: cada coluna após as 2 primeiras (ID, Nome) = um dia
    const headerConsumo = dadosConsumo[0];
    const prodMap = new Map<string, { nome: string; dias: number[]; custo: number }>();

    for (let i = 1; i < dadosConsumo.length; i++) {
      const row = dadosConsumo[i];
      if (!row[0]) continue;
      const id = row[0].trim();
      const nome = row[1]?.trim() || id;
      const dias: number[] = [];
      for (let j = 2; j < row.length; j++) {
        const v = parseFloat(row[j]?.replace(',', '.') || '0');
        if (!isNaN(v)) dias.push(v);
      }
      prodMap.set(id, { nome, dias, custo: 0 });
    }

    // Parsear custos
    if (dadosCusto.length > 1) {
      for (let i = 1; i < dadosCusto.length; i++) {
        const row = dadosCusto[i];
        const id = row[0]?.trim();
        const custoRaw = row[row.length - 1]?.replace(',', '.') || '0';
        const custo = parseFloat(custoRaw) || 0;
        if (id && prodMap.has(id)) {
          prodMap.get(id)!.custo = custo;
        }
      }
    }

    // Calcular Curva ABC (por custo total = custo × média consumo)
    const items: { id: string; nome: string; dias: number[]; custo: number; custoTotal: number }[] = [];
    prodMap.forEach((v, id) => {
      const media = v.dias.length > 0 ? v.dias.reduce((a, b) => a + b, 0) / v.dias.length : 0;
      items.push({ id, nome: v.nome, dias: v.dias, custo: v.custo, custoTotal: v.custo * media * 30 });
    });

    items.sort((a, b) => b.custoTotal - a.custoTotal);
    const custoTotalGeral = items.reduce((acc, i) => acc + i.custoTotal, 0) || 1;

    let acumulado = 0;
    const resultado: ProdutoABCXYZ[] = items.map(item => {
      acumulado += item.custoTotal;
      const pctAcum = (acumulado / custoTotalGeral) * 100;

      const curvaABC: CurvaABC = pctAcum <= 80 ? 'A' : pctAcum <= 95 ? 'B' : 'C';
      const cv = coeficienteVariacao(item.dias);
      const classeXYZ = classificarXYZ(cv);
      const { tendencia } = regressaoLinearSimples(item.dias);
      const mediaConsumo = mediaMovelPonderada(item.dias);

      return {
        id: item.id,
        nome: item.nome,
        custoTotal: item.custoTotal,
        consumoDiario: item.dias,
        mediaConsumo,
        cv,
        curvaABC,
        classeXYZ,
        tendencia,
        estrategia: getEstrategia(curvaABC, classeXYZ),
      };
    });

    setProdutos(resultado);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processarDados,
    accept: { 'text/csv': ['.csv', '.txt'] },
    multiple: true,
  } as any);

  // Matriz 3x3
  const matrizContagem = useMemo(() => {
    const m: Record<string, number> = {};
    ['A', 'B', 'C'].forEach(abc => ['X', 'Y', 'Z'].forEach(xyz => { m[`${abc}${xyz}`] = 0; }));
    produtos.forEach(p => { m[p.estrategia] = (m[p.estrategia] || 0) + 1; });
    return m;
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    let list = produtos;
    if (filtroQuadrante) list = list.filter(p => p.estrategia === filtroQuadrante);
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(s) || p.id.includes(s));
    }
    return list;
  }, [produtos, filtroQuadrante, searchTerm]);

  const abcColors = { A: 'text-rose-600', B: 'text-amber-600', C: 'text-slate-500' };
  const xyzColors = { X: 'bg-emerald-50 text-emerald-700', Y: 'bg-amber-50 text-amber-700', Z: 'bg-rose-50 text-rose-700' };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur p-2.5 rounded-xl">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                Supply Intelligence
              </span>
              <h1 className="text-xl font-black text-white leading-tight">Curva ABC/XYZ</h1>
              <p className="text-purple-200 text-sm mt-0.5">
                Matriz cruzada custo × variabilidade — estratégia de ressuprimento por quadrante
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dropzone */}
      {produtos.length === 0 ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
            ${isDragActive ? 'border-violet-500 bg-violet-50/80' : 'border-slate-300 hover:border-violet-300 bg-white shadow-sm'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className={`w-12 h-12 ${isDragActive ? 'text-violet-500' : 'text-slate-400'}`} />
            <h3 className="text-lg font-medium text-slate-700">Arraste os CSVs de Consumo e Custos</h3>
            <p className="text-sm text-slate-500 max-w-md">
              1. <strong>CSV de Consumo:</strong> ID | Nome | Dia1 | Dia2 | ... | DiaN<br />
              2. <strong>CSV de Custos:</strong> ID | Nome | ... | Custo Unitário
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Matriz 3×3 */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-violet-500" />
              Matriz ABC/XYZ — Clique para filtrar
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-2 text-xs font-bold text-slate-500"></th>
                    <th className="p-2 text-center text-xs font-bold text-emerald-600 uppercase">X (Estável)</th>
                    <th className="p-2 text-center text-xs font-bold text-amber-600 uppercase">Y (Moderada)</th>
                    <th className="p-2 text-center text-xs font-bold text-rose-600 uppercase">Z (Errática)</th>
                  </tr>
                </thead>
                <tbody>
                  {(['A', 'B', 'C'] as CurvaABC[]).map(abc => (
                    <tr key={abc}>
                      <td className={`p-2 text-center font-black text-lg ${abcColors[abc]}`}>{abc}</td>
                      {(['X', 'Y', 'Z'] as ClasseXYZ[]).map(xyz => {
                        const key = `${abc}${xyz}`;
                        const count = matrizContagem[key] || 0;
                        const est = ESTRATEGIAS[key];
                        const isActive = filtroQuadrante === key;
                        return (
                          <td key={key} className="p-1.5">
                            <button
                              onClick={() => setFiltroQuadrante(isActive ? null : key)}
                              className={`w-full p-3 rounded-xl border-2 transition-all text-left ${
                                isActive ? 'ring-2 ring-violet-500 border-violet-400 bg-violet-50' :
                                count > 0 ? `${est.cor} hover:shadow-md` : 'bg-slate-50 border-slate-100 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-black uppercase">{key}</span>
                                <span className="text-2xl font-black">{count}</span>
                              </div>
                              <p className="text-[10px] font-semibold leading-tight">{est.label}</p>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtroQuadrante && (
              <div className={`mt-4 p-3 rounded-lg border ${ESTRATEGIAS[filtroQuadrante].cor}`}>
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span className="text-sm font-bold">{filtroQuadrante} — {ESTRATEGIAS[filtroQuadrante].label}</span>
                </div>
                <p className="text-xs mt-1">{ESTRATEGIAS[filtroQuadrante].descricao}</p>
              </div>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: produtos.length, color: 'indigo' },
              { label: 'Curva A', value: produtos.filter(p => p.curvaABC === 'A').length, color: 'rose' },
              { label: 'Classe Z', value: produtos.filter(p => p.classeXYZ === 'Z').length, color: 'amber' },
              { label: 'Tendência ↑', value: produtos.filter(p => p.tendencia === 'CRESCENTE').length, color: 'orange' },
              { label: 'AZ (Crítico)', value: matrizContagem['AZ'] || 0, color: 'red' },
            ].map((kpi, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{kpi.label}</p>
                <p className={`text-3xl font-black text-${kpi.color}-600 mt-1`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Tabela */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center gap-3">
              <input
                type="text"
                placeholder="Buscar por nome ou ID..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500"
              />
              {filtroQuadrante && (
                <button onClick={() => setFiltroQuadrante(null)}
                  className="px-3 py-2 bg-violet-100 text-violet-700 rounded-lg text-xs font-bold">
                  Limpar filtro ({filtroQuadrante})
                </button>
              )}
              <div
                {...getRootProps()}
                className="px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 cursor-pointer hover:border-violet-400"
              >
                <input {...getInputProps()} />
                Reimportar
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    {['Produto', 'ABC', 'XYZ', 'CV', 'Tendência', 'Média/dia', 'Custo Total', 'Estratégia'].map(h => (
                      <th key={h} className="p-3 text-xs font-bold text-slate-300 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtosFiltrados.map(p => {
                    const est = ESTRATEGIAS[p.estrategia];
                    return (
                      <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-3">
                          <span className="font-bold text-slate-800 text-sm">{p.nome}</span>
                          <span className="text-xs text-slate-400 ml-2 font-mono">#{p.id}</span>
                        </td>
                        <td className="p-3">
                          <span className={`text-lg font-black ${abcColors[p.curvaABC]}`}>{p.curvaABC}</span>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black border ${xyzColors[p.classeXYZ]}`}>
                            {p.classeXYZ}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-sm text-slate-600">{p.cv.toFixed(2)}</td>
                        <td className="p-3">
                          <span className="flex items-center gap-1 text-xs font-semibold">
                            {p.tendencia === 'CRESCENTE' && <><TrendingUp className="w-3.5 h-3.5 text-rose-500" /> <span className="text-rose-600">Crescente</span></>}
                            {p.tendencia === 'DECRESCENTE' && <><TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-emerald-600">Decrescente</span></>}
                            {p.tendencia === 'ESTAVEL' && <><Minus className="w-3.5 h-3.5 text-slate-400" /> <span className="text-slate-500">Estável</span></>}
                          </span>
                        </td>
                        <td className="p-3 font-mono text-sm font-semibold text-slate-700">{p.mediaConsumo.toFixed(1)}</td>
                        <td className="p-3 font-mono text-sm text-slate-600">
                          {p.custoTotal > 0 ? `R$ ${p.custoTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border ${est.cor}`}>
                            {p.estrategia} — {est.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
