import React, { useState, useMemo, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import { UploadCloud, MapPin, Package, ArrowRightLeft, Download, Search, AlertTriangle, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getRiscoAssistencial } from '../utils/riscoAssistencial';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ProdutoUnidade {
  produtoId: string;
  produtoNome: string;
  unidade: string;
  estoque: number;
  consumoDiario: number;
  coberturaDias: number;
}

interface ProdutoConsolidado {
  id: string;
  nome: string;
  unidades: Map<string, { estoque: number; consumo: number; cobertura: number }>;
  riscoLevel: string;
}

interface Remanejamento {
  produtoId: string;
  produtoNome: string;
  origem: string;
  destino: string;
  quantidade: number;
  motivo: string;
}

// ─── Componente ─────────────────────────────────────────────────────────────

export const CoberturaMultiUnidade: React.FC = () => {
  const [dados, setDados] = useState<ProdutoUnidade[]>([]);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'critico' | 'oportunidade'>('todos');

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
    const todosItens: ProdutoUnidade[] = [];
    const unidadeSet = new Set<string>();

    for (const file of files) {
      const csv = await parseCSV(file);
      // Detectar nome da unidade: do nome do arquivo ou da primeira linha
      let unidadeNome = file.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ').trim();

      // Tentar extrair do header do CSV se tem uma coluna "Unidade"
      const header = csv[0]?.map(c => c.toLowerCase().trim()) || [];
      const prodIdx = header.findIndex(c => c.includes('produto') || c.includes('descri'));
      const estoqueIdx = header.findIndex(c => c.includes('estoque') || c.includes('qtd atual') || c.includes('saldo'));
      const consumoIdx = header.findIndex(c => c.includes('consumo') || c.includes('media') || c.includes('média') || c.includes('saida'));
      const unidadeIdx = header.findIndex(c => c === 'unidade' || c.includes('setor') || c.includes('local'));

      for (let i = 1; i < csv.length; i++) {
        const row = csv[i];
        if (!row || row.length < 2) continue;

        const prodRaw = row[prodIdx >= 0 ? prodIdx : 0] || '';
        let prodId = '', prodNome = '';
        if (prodRaw.includes('-') && /^\d+\s*-/.test(prodRaw.trim())) {
          const parts = prodRaw.split('-');
          prodId = parts[0].trim();
          prodNome = parts.slice(1).join('-').trim();
        } else {
          prodId = row[0]?.trim() || '';
          prodNome = prodRaw || row[1]?.trim() || '';
        }

        const estoque = parseFloat((row[estoqueIdx >= 0 ? estoqueIdx : 2] || '0').replace(/\./g, '').replace(',', '.')) || 0;
        const consumo = parseFloat((row[consumoIdx >= 0 ? consumoIdx : 3] || '0').replace(/\./g, '').replace(',', '.')) || 0;
        const unidade = unidadeIdx >= 0 ? row[unidadeIdx]?.trim() || unidadeNome : unidadeNome;
        const cobertura = consumo > 0 ? estoque / consumo : estoque > 0 ? 999 : 0;

        if (prodId) {
          unidadeSet.add(unidade);
          todosItens.push({
            produtoId: prodId,
            produtoNome: prodNome,
            unidade,
            estoque,
            consumoDiario: consumo,
            coberturaDias: cobertura,
          });
        }
      }
    }

    setDados(todosItens);
    setUnidades(Array.from(unidadeSet).sort());
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: processarDados,
    accept: { 'text/csv': ['.csv', '.txt'] },
    multiple: true,
  } as any);

  // Consolidar por produto
  const consolidado = useMemo(() => {
    const map = new Map<string, ProdutoConsolidado>();
    dados.forEach(d => {
      if (!map.has(d.produtoId)) {
        map.set(d.produtoId, {
          id: d.produtoId,
          nome: d.produtoNome,
          unidades: new Map(),
          riscoLevel: getRiscoAssistencial(d.produtoNome).level,
        });
      }
      const prod = map.get(d.produtoId)!;
      prod.unidades.set(d.unidade, {
        estoque: d.estoque,
        consumo: d.consumoDiario,
        cobertura: d.coberturaDias,
      });
    });
    return Array.from(map.values());
  }, [dados]);

  // Identificar oportunidades de remanejamento
  const remanejamentos = useMemo((): Remanejamento[] => {
    const sugestoes: Remanejamento[] = [];
    consolidado.forEach(prod => {
      const unidadesArr = Array.from(prod.unidades.entries());
      const comExcesso = unidadesArr.filter(([, v]) => v.cobertura > 30 && v.estoque > 0);
      const comFalta = unidadesArr.filter(([, v]) => v.cobertura < 7 && v.consumo > 0);

      comFalta.forEach(([destino, dInfo]) => {
        const necessidade = Math.ceil(dInfo.consumo * 15 - dInfo.estoque); // cobrir 15 dias
        if (necessidade <= 0) return;

        let restante = necessidade;
        comExcesso.forEach(([origem, oInfo]) => {
          if (restante <= 0) return;
          const disponivel = Math.floor(oInfo.estoque - oInfo.consumo * 15); // manter 15 dias na origem
          if (disponivel <= 0) return;
          const qtd = Math.min(restante, disponivel);
          sugestoes.push({
            produtoId: prod.id,
            produtoNome: prod.nome,
            origem,
            destino,
            quantidade: qtd,
            motivo: `Cobertura destino: ${Math.round(dInfo.cobertura)}d → origem tem ${Math.round(oInfo.cobertura)}d`,
          });
          restante -= qtd;
        });
      });
    });
    return sugestoes;
  }, [consolidado]);

  // Filtro
  const filtrado = useMemo(() => {
    let list = consolidado;
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      list = list.filter(p => p.nome.toLowerCase().includes(s) || p.id.includes(s));
    }
    if (filtroStatus === 'critico') {
      list = list.filter(p => Array.from(p.unidades.values()).some(u => u.cobertura < 7));
    }
    if (filtroStatus === 'oportunidade') {
      list = list.filter(p => remanejamentos.some(r => r.produtoId === p.id));
    }
    return list;
  }, [consolidado, searchTerm, filtroStatus, remanejamentos]);

  // Cor da cobertura
  const coberturaColor = (dias: number) => {
    if (dias <= 0) return 'bg-rose-600 text-white';
    if (dias <= 3) return 'bg-rose-500 text-white';
    if (dias <= 7) return 'bg-amber-500 text-white';
    if (dias <= 15) return 'bg-amber-300 text-amber-900';
    if (dias <= 30) return 'bg-emerald-200 text-emerald-900';
    return 'bg-emerald-100 text-emerald-800';
  };

  return (
    <div className="p-6 max-w-[100rem] mx-auto space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-teal-600 to-emerald-700 px-6 py-5">
          <div className="flex items-center gap-4">
            <div className="bg-white/10 backdrop-blur p-2.5 rounded-xl">
              <MapPin className="w-6 h-6 text-white" />
            </div>
            <div>
              <span className="bg-white/20 text-white text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full">
                Supply Intelligence
              </span>
              <h1 className="text-xl font-black text-white leading-tight">Cobertura Multi-Unidade</h1>
              <p className="text-teal-200 text-sm mt-0.5">
                Heatmap de cobertura entre unidades — identifique oportunidades de remanejamento
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Dropzone */}
      {dados.length === 0 ? (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer
            ${isDragActive ? 'border-teal-500 bg-teal-50/80' : 'border-slate-300 hover:border-teal-300 bg-white shadow-sm'}
          `}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center gap-3">
            <UploadCloud className={`w-12 h-12 ${isDragActive ? 'text-teal-500' : 'text-slate-400'}`} />
            <h3 className="text-lg font-medium text-slate-700">Arraste CSVs de múltiplas unidades</h3>
            <p className="text-sm text-slate-500 max-w-md">
              Um CSV por unidade com colunas: Produto | Estoque | Consumo Diário<br />
              O nome do arquivo será usado como nome da unidade.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Unidades</p>
              <p className="text-3xl font-black text-teal-600 mt-1">{unidades.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Produtos</p>
              <p className="text-3xl font-black text-indigo-600 mt-1">{consolidado.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Itens Críticos</p>
              <p className="text-3xl font-black text-rose-600 mt-1">
                {consolidado.filter(p => Array.from(p.unidades.values()).some(u => u.cobertura < 3)).length}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Remanejamentos</p>
              <p className="text-3xl font-black text-amber-600 mt-1">{remanejamentos.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <p className="text-[11px] font-bold text-slate-400 uppercase">Un. a Transferir</p>
              <p className="text-3xl font-black text-violet-600 mt-1">
                {remanejamentos.reduce((acc, r) => acc + r.quantidade, 0).toLocaleString('pt-BR')}
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar produto..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              {[
                { key: 'todos', label: 'Todos' },
                { key: 'critico', label: 'Críticos' },
                { key: 'oportunidade', label: 'Com Remanejamento' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFiltroStatus(f.key as any)}
                  className={`px-4 py-2 text-xs font-bold transition-colors ${filtroStatus === f.key ? 'bg-teal-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div
              {...getRootProps()}
              className="px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 cursor-pointer hover:border-teal-400"
            >
              <input {...getInputProps()} />
              Reimportar
            </div>
          </div>

          {/* Heatmap Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800">
                    <th className="p-3 text-xs font-bold text-slate-300 uppercase tracking-widest sticky left-0 bg-slate-800 z-10 min-w-[200px]">
                      Produto
                    </th>
                    <th className="p-3 text-xs font-bold text-slate-300 uppercase tracking-widest text-center w-16">
                      Risco
                    </th>
                    {unidades.map(u => (
                      <th key={u} className="p-3 text-xs font-bold text-slate-300 uppercase tracking-widest text-center min-w-[100px]">
                        {u}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtrado.map(prod => (
                    <tr key={prod.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-3 sticky left-0 bg-white z-10">
                        <span className="font-bold text-slate-800 text-sm">{prod.nome}</span>
                        <span className="text-xs text-slate-400 ml-1 font-mono">#{prod.id}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                          prod.riscoLevel === 'CRITICO' ? 'bg-rose-100 text-rose-700' :
                          prod.riscoLevel === 'ALTO' ? 'bg-orange-100 text-orange-700' :
                          prod.riscoLevel === 'MEDIO' ? 'bg-amber-100 text-amber-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>
                          {prod.riscoLevel.slice(0, 4)}
                        </span>
                      </td>
                      {unidades.map(u => {
                        const info = prod.unidades.get(u);
                        if (!info) return <td key={u} className="p-3 text-center text-slate-200">—</td>;
                        const dias = Math.min(info.cobertura, 999);
                        return (
                          <td key={u} className="p-2 text-center">
                            <div className={`rounded-lg px-2 py-1.5 ${coberturaColor(dias)}`}>
                              <span className="text-sm font-black">{dias < 999 ? Math.round(dias) : '∞'}</span>
                              <span className="text-[9px] font-bold ml-0.5">d</span>
                            </div>
                            <span className="text-[9px] text-slate-400 mt-0.5 block">{info.estoque} un</span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sugestões de Remanejamento */}
          {remanejamentos.length > 0 && (
            <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
              <div className="bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-3 flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-white" />
                <h3 className="text-white font-bold text-sm">Sugestões de Remanejamento ({remanejamentos.length})</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Produto', 'Origem', 'Destino', 'Quantidade', 'Motivo'].map(h => (
                        <th key={h} className="p-3 text-xs font-bold text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {remanejamentos.map((r, i) => (
                      <tr key={i} className="hover:bg-amber-50/50">
                        <td className="p-3 font-semibold text-slate-700 text-sm">{r.produtoNome}</td>
                        <td className="p-3 text-sm text-slate-600">{r.origem}</td>
                        <td className="p-3 text-sm font-bold text-amber-700">{r.destino}</td>
                        <td className="p-3 font-black text-slate-800">{r.quantidade.toLocaleString('pt-BR')}</td>
                        <td className="p-3 text-xs text-slate-500">{r.motivo}</td>
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
