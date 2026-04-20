import React, { useState, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { UploadCloud, TrendingUp, TrendingDown, Minus, Calendar, BarChart3, Search, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  coeficienteVariacao,
  classificarXYZ,
  regressaoLinearSimples,
  mediaMovelPonderada,
  desvioPadrao,
  type ClasseXYZ,
} from '../utils/supplyScore';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface PeriodoConsumo {
  label: string;      // e.g. "Jan/2026", "Fev/2026"
  valor: number;
}

interface ProdutoHistorico {
  id: string;
  nome: string;
  periodos: PeriodoConsumo[];
  mediaGeral: number;
  mediaPonderada: number;
  dp: number;
  cv: number;
  classeXYZ: ClasseXYZ;
  tendencia: 'CRESCENTE' | 'ESTAVEL' | 'DECRESCENTE';
  inclinacao: number;
  variacaoMesAnterior: number; // % variação vs mês anterior
}

// ─── Componente ─────────────────────────────────────────────────────────────

export const HistoricoConsumo: React.FC = () => {
  const [produtos, setProdutos] = useState<ProdutoHistorico[]>([]);
  const [periodoLabels, setPeriodoLabels] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroTendencia, setFiltroTendencia] = useState<string | null>(null);
  const [produtosSelecionados, setProdutosSelecionados] = useState<Set<string>>(new Set());

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
    // Formato esperado: ID | Nome | Periodo1 | Periodo2 | ... | PeriodoN
    // Cada coluna após Nome = consumo no período (mês, semana, etc.)
    const allData: string[][] = [];

    for (const file of files) {
      const csv = await parseCSV(file);
      allData.push(...csv);
    }

    if (allData.length < 2) return;

    const header = allData[0];
    const labels = header.slice(2).map(h => h?.trim() || '');
    setPeriodoLabels(labels);

    const resultado: ProdutoHistorico[] = [];

    for (let i = 1; i < allData.length; i++) {
      const row = allData[i];
      if (!row[0]) continue;

      const id = row[0].trim();
      const nome = row[1]?.trim() || id;
      const valores: number[] = [];
      const periodos: PeriodoConsumo[] = [];

      for (let j = 2; j < row.length; j++) {
        const v = parseFloat(row[j]?.replace(/\./g, '').replace(',', '.') || '0');
        const val = isNaN(v) ? 0 : v;
        valores.push(val);
        periodos.push({ label: labels[j - 2] || `P${j - 1}`, valor: val });
      }

      if (valores.length < 2) continue;

      const mediaGeral = valores.reduce((a, b) => a + b, 0) / valores.length;
      const mp = mediaMovelPonderada(valores);
      const dp_val = desvioPadrao(valores);
      const cv = coeficienteVariacao(valores);
      const classeXYZ = classificarXYZ(cv);
      const { tendencia, inclinacao } = regressaoLinearSimples(valores);

      const ultimoMes = valores[valores.length - 1] || 0;
      const penultimoMes = valores[valores.length - 2] || 0;
      const variacao = penultimoMes > 0 ? ((ultimoMes - penultimoMes) / penultimoMes) * 100 : 0;

      resultado.push({
        id,
        nome,
        periodos,
        mediaGeral,
        mediaPonderada: mp,
        dp: dp_val,
        cv,
        classeXYZ,
        tendencia,
        inclinacao,
        variacaoMesAnterior: variacao,
      });
    }

    setProdutos(resultado);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processarDados,
    accept: { 'text/csv': ['.csv', '.txt'] },
    multiple: true,
  } as any);

  // Filtros
  const filtrado = useMemo(() => {
    let list = produtos;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(s) || p.id.includes(s));
    }
    if (filtroTendencia) {
      list = list.filter(p => p.tendencia === filtroTendencia);
    }
    return list;
  }, [produtos, searchTerm, filtroTendencia]);

  // Heatmap de sazonalidade (top 20 selecionados ou mais consumidos)
  const produtosHeatmap = useMemo(() => {
    if (produtosSelecionados.size > 0) {
      return produtos.filter(p => produtosSelecionados.has(p.id));
    }
    return [...produtos].sort((a, b) => b.mediaGeral - a.mediaGeral).slice(0, 20);
  }, [produtos, produtosSelecionados]);

  const toggleSelecionado = (id: string) => {
    setProdutosSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Calcular max para normalização do heatmap
  const maxConsumo = useMemo(() => {
    let max = 0;
    produtosHeatmap.forEach(p => p.periodos.forEach(per => { if (per.valor > max) max = per.valor; }));
    return max || 1;
  }, [produtosHeatmap]);

  const heatColor = (valor: number) => {
    const ratio = valor / maxConsumo;
    if (ratio === 0) return 'bg-slate-50 text-slate-300';
    if (ratio < 0.2) return 'bg-blue-50 text-blue-600';
    if (ratio < 0.4) return 'bg-blue-100 text-blue-700';
    if (ratio < 0.6) return 'bg-amber-100 text-amber-700';
    if (ratio < 0.8) return 'bg-orange-200 text-orange-800';
    return 'bg-rose-200 text-rose-800';
  };

  return (
    <div className="p-6 max-w-[100rem] mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-600 to-cyan-700 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur p-2.5 rounded-xl">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                Supply Intelligence
              </span>
              <h1 className="text-xl font-black text-white leading-tight">Histórico e Tendência de Consumo</h1>
              <p className="text-sky-200 text-sm mt-0.5">
                Análise temporal — sazonalidade, tendências e variabilidade por produto
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
            ${isDragActive ? 'border-sky-500 bg-sky-50/80' : 'border-slate-300 hover:border-sky-300 bg-white shadow-sm'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className={`w-12 h-12 ${isDragActive ? 'text-sky-500' : 'text-slate-400'}`} />
            <h3 className="text-lg font-medium text-slate-700">Arraste o CSV de Consumo Mensal</h3>
            <p className="text-sm text-slate-500 max-w-md">
              Formato: ID | Nome | Jan/2025 | Fev/2025 | ... | Dez/2025<br />
              Cada coluna após "Nome" é um período (mês, semana, etc.)
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Produtos</p>
              <p className="text-3xl font-black text-sky-600 mt-1">{produtos.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Períodos</p>
              <p className="text-3xl font-black text-indigo-600 mt-1">{periodoLabels.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-rose-500" /> Crescente
              </p>
              <p className="text-3xl font-black text-rose-600 mt-1">
                {produtos.filter(p => p.tendencia === 'CRESCENTE').length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-emerald-500" /> Decrescente
              </p>
              <p className="text-3xl font-black text-emerald-600 mt-1">
                {produtos.filter(p => p.tendencia === 'DECRESCENTE').length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Classe Z (Errática)</p>
              <p className="text-3xl font-black text-amber-600 mt-1">
                {produtos.filter(p => p.classeXYZ === 'Z').length}
              </p>
            </div>
          </div>

          {/* Heatmap de Sazonalidade */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-bold text-slate-700">Heatmap de Sazonalidade</h3>
              <span className="text-xs text-slate-400 ml-2">
                ({produtosSelecionados.size > 0 ? `${produtosSelecionados.size} selecionados` : 'Top 20 por consumo'})
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="p-3 text-xs font-bold text-slate-300 uppercase sticky left-0 bg-slate-800 z-10 min-w-[180px]">
                      Produto
                    </th>
                    {periodoLabels.map(l => (
                      <th key={l} className="p-2 text-[10px] font-bold text-slate-300 uppercase text-center min-w-[70px]">
                        {l}
                      </th>
                    ))}
                    <th className="p-2 text-[10px] font-bold text-slate-300 uppercase text-center min-w-[60px]">Tend.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {produtosHeatmap.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50/50">
                      <td className="p-2 sticky left-0 bg-white z-10">
                        <span className="font-semibold text-slate-800 text-xs line-clamp-1">{p.nome}</span>
                      </td>
                      {p.periodos.map((per, i) => (
                        <td key={i} className="p-1 text-center">
                          <div className={`rounded px-1 py-1 text-[10px] font-bold ${heatColor(per.valor)}`}>
                            {per.valor > 0 ? per.valor.toLocaleString('pt-BR') : '—'}
                          </div>
                        </td>
                      ))}
                      <td className="p-2 text-center">
                        {p.tendencia === 'CRESCENTE' && <TrendingUp className="w-4 h-4 text-rose-500 mx-auto" />}
                        {p.tendencia === 'DECRESCENTE' && <TrendingDown className="w-4 h-4 text-emerald-500 mx-auto" />}
                        {p.tendencia === 'ESTAVEL' && <Minus className="w-4 h-4 text-slate-400 mx-auto" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 flex items-center gap-3 text-[10px] text-slate-500">
              <span>Intensidade:</span>
              {['bg-slate-50', 'bg-blue-50', 'bg-blue-100', 'bg-amber-100', 'bg-orange-200', 'bg-rose-200'].map((c, i) => (
                <span key={i} className={`w-5 h-3 rounded ${c}`} />
              ))}
              <span>Baixo → Alto</span>
            </div>
          </div>

          {/* Filtros + Tabela detalhada */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {[
                { key: null, label: 'Todos' },
                { key: 'CRESCENTE', label: '↑ Crescente' },
                { key: 'ESTAVEL', label: '— Estável' },
                { key: 'DECRESCENTE', label: '↓ Decrescente' },
              ].map(f => (
                <button
                  key={f.key || 'all'}
                  onClick={() => setFiltroTendencia(f.key)}
                  className={`px-4 py-2 text-xs font-bold transition-colors ${filtroTendencia === f.key ? 'bg-sky-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div
              {...getRootProps()}
              className="px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 cursor-pointer hover:border-sky-400"
            >
              <input {...getInputProps()} />
              Reimportar
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="p-3 w-8"></th>
                    {['Produto', 'Média', 'Méd. Ponderada', 'Desvio Padrão', 'CV', 'XYZ', 'Tendência', 'Var. Último Mês', 'Últimos 3 Períodos'].map(h => (
                      <th key={h} className="p-3 text-xs font-bold text-slate-300 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrado.map(p => (
                    <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${produtosSelecionados.has(p.id) ? 'bg-sky-50/50' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={produtosSelecionados.has(p.id)}
                          onChange={() => toggleSelecionado(p.id)}
                          className="rounded border-slate-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                      </td>
                      <td className="p-3">
                        <span className="font-bold text-slate-800 text-sm">{p.nome}</span>
                        <span className="text-xs text-slate-400 ml-1 font-mono">#{p.id}</span>
                      </td>
                      <td className="p-3 font-mono text-sm font-semibold text-slate-700">{p.mediaGeral.toFixed(1)}</td>
                      <td className="p-3 font-mono text-sm text-slate-600">{p.mediaPonderada.toFixed(1)}</td>
                      <td className="p-3 font-mono text-sm text-slate-600">{p.dp.toFixed(1)}</td>
                      <td className="p-3 font-mono text-sm text-slate-600">{p.cv.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black border ${
                          p.classeXYZ === 'X' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          p.classeXYZ === 'Y' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-rose-50 text-rose-700 border-rose-200'
                        }`}>
                          {p.classeXYZ}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="flex items-center gap-1 text-xs font-semibold">
                          {p.tendencia === 'CRESCENTE' && <><TrendingUp className="w-3.5 h-3.5 text-rose-500" /> <span className="text-rose-600">Crescente</span></>}
                          {p.tendencia === 'DECRESCENTE' && <><TrendingDown className="w-3.5 h-3.5 text-emerald-500" /> <span className="text-emerald-600">Decrescente</span></>}
                          {p.tendencia === 'ESTAVEL' && <><Minus className="w-3.5 h-3.5 text-slate-400" /> <span className="text-slate-500">Estável</span></>}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`font-bold text-sm ${
                          p.variacaoMesAnterior > 10 ? 'text-rose-600' :
                          p.variacaoMesAnterior < -10 ? 'text-emerald-600' :
                          'text-slate-500'
                        }`}>
                          {p.variacaoMesAnterior > 0 ? '+' : ''}{p.variacaoMesAnterior.toFixed(1)}%
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex items-end gap-0.5 h-6">
                          {p.periodos.slice(-3).map((per, i) => {
                            const max = Math.max(...p.periodos.slice(-3).map(x => x.valor), 1);
                            const h = Math.max(4, (per.valor / max) * 24);
                            return (
                              <div
                                key={i}
                                className={`w-4 rounded-t ${
                                  i === 2 ? 'bg-sky-500' : i === 1 ? 'bg-sky-300' : 'bg-sky-200'
                                }`}
                                style={{ height: `${h}px` }}
                                title={`${per.label}: ${per.valor}`}
                              />
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
