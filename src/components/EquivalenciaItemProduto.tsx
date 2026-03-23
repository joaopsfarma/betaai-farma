import React, { useState, useMemo, useRef } from 'react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import {
  Search, UploadCloud, CheckCircle2, XCircle, AlertTriangle,
  Layers, Package, ClipboardList, Download, Filter, Info
} from 'lucide-react';
import { exportToPDF, PDF_COLORS } from '../utils/pdfExport';

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface ItemRow {
  codigo: string;
  descricao: string;
}

type ViewFilter = 'todos' | 'vinculados' | 'sem_prescricao' | 'sem_estoque';

const CHART_COLORS = {
  ok: '#10b981',
  warning: '#f59e0b',
  danger: '#e11d48',
  info: '#6366f1',
};

// ─── Componente Principal ─────────────────────────────────────────────────────
export const EquivalenciaItemProduto: React.FC = () => {
  const [estoqueData, setEstoqueData] = useState<ItemRow[]>([]);
  const [prescricaoData, setPrescricaoData] = useState<ItemRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<ViewFilter>('todos');
  const [uploadStatus, setUploadStatus] = useState<{ estoque: boolean; prescricao: boolean }>({ estoque: false, prescricao: false });

  const estoqueRef = useRef<HTMLInputElement>(null);
  const prescricaoRef = useRef<HTMLInputElement>(null);

  // ─── CSV Parser ──────────────────────────────────────────────────────
  const parseCSV = async (file: File): Promise<ItemRow[]> => {
    const buffer = await file.arrayBuffer();
    const decoder = new TextDecoder('windows-1252');
    let text = decoder.decode(buffer);

    // Remove BOM if present
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');

    // Encontrar header
    let headerIdx = -1;
    for (let i = 0; i < Math.min(5, lines.length); i++) {
      const upper = lines[i].toUpperCase();
      if (upper.includes('DESCRI') && (upper.includes('CÓD') || upper.includes('COD'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1 && lines.length > 0) headerIdx = 0;

    const items: ItemRow[] = [];
    for (let i = (headerIdx >= 0 ? headerIdx + 1 : 1); i < lines.length; i++) {
      const parts = lines[i].split(';').map(p => p.trim().replace(/"/g, ''));
      if (parts.length >= 2 && parts[0]) {
        items.push({ codigo: parts[0], descricao: parts[1] || 'Sem Descrição' });
      }
    }
    return items;
  };

  const handleEstoqueUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const data = await parseCSV(e.target.files[0]);
      setEstoqueData(data);
      setUploadStatus(prev => ({ ...prev, estoque: true }));
      setTimeout(() => setUploadStatus(prev => ({ ...prev, estoque: false })), 2500);
    }
  };

  const handlePrescricaoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const data = await parseCSV(e.target.files[0]);
      setPrescricaoData(data);
      setUploadStatus(prev => ({ ...prev, prescricao: true }));
      setTimeout(() => setUploadStatus(prev => ({ ...prev, prescricao: false })), 2500);
    }
  };

  // ─── Cálculos de Equivalência ────────────────────────────────────────
  const analysis = useMemo(() => {
    if (estoqueData.length === 0 && prescricaoData.length === 0) {
      return { vinculados: [], semPrescricao: [], semEstoque: [], totalEstoque: 0, totalPrescricao: 0 };
    }

    const estoqueMap = new Map<string, string>();
    estoqueData.forEach(e => estoqueMap.set(e.codigo, e.descricao));

    const prescricaoMap = new Map<string, string>();
    prescricaoData.forEach(p => prescricaoMap.set(p.codigo, p.descricao));

    // Vinculados: código existe nas DUAS listas
    const vinculados: { codigo: string; descricaoEstoque: string; descricaoPrescricao: string }[] = [];
    estoqueMap.forEach((descE, cod) => {
      if (prescricaoMap.has(cod)) {
        vinculados.push({ codigo: cod, descricaoEstoque: descE, descricaoPrescricao: prescricaoMap.get(cod)! });
      }
    });

    // Sem Prescrição: está no estoque mas NÃO está na prescrição
    const semPrescricao: ItemRow[] = estoqueData.filter(e => !prescricaoMap.has(e.codigo));

    // Sem Estoque: está na prescrição mas NÃO está no estoque
    const semEstoque: ItemRow[] = prescricaoData.filter(p => !estoqueMap.has(p.codigo));

    return {
      vinculados,
      semPrescricao,
      semEstoque,
      totalEstoque: estoqueData.length,
      totalPrescricao: prescricaoData.length,
    };
  }, [estoqueData, prescricaoData]);

  // ─── Dados Filtrados ─────────────────────────────────────────────────
  const displayRows = useMemo(() => {
    let rows: { codigo: string; descricao: string; status: string; statusColor: string }[] = [];

    if (viewFilter === 'todos' || viewFilter === 'vinculados') {
      analysis.vinculados.forEach(v => {
        rows.push({ codigo: v.codigo, descricao: v.descricaoEstoque, status: 'Vinculado', statusColor: 'emerald' });
      });
    }
    if (viewFilter === 'todos' || viewFilter === 'sem_prescricao') {
      analysis.semPrescricao.forEach(s => {
        rows.push({ codigo: s.codigo, descricao: s.descricao, status: 'Sem Prescrição', statusColor: 'amber' });
      });
    }
    if (viewFilter === 'todos' || viewFilter === 'sem_estoque') {
      analysis.semEstoque.forEach(s => {
        rows.push({ codigo: s.codigo, descricao: s.descricao, status: 'Sem Estoque', statusColor: 'rose' });
      });
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      rows = rows.filter(r =>
        r.codigo.toLowerCase().includes(term) ||
        r.descricao.toLowerCase().includes(term)
      );
    }

    return rows;
  }, [analysis, viewFilter, searchTerm]);

  // ─── Chart Data ──────────────────────────────────────────────────────
  const pieData = useMemo(() => [
    { name: 'Vinculados', value: analysis.vinculados.length, color: CHART_COLORS.ok },
    { name: 'Sem Prescrição', value: analysis.semPrescricao.length, color: CHART_COLORS.warning },
    { name: 'Sem Estoque', value: analysis.semEstoque.length, color: CHART_COLORS.danger },
  ].filter(d => d.value > 0), [analysis]);

  const pctVinculados = analysis.totalEstoque > 0
    ? ((analysis.vinculados.length / analysis.totalEstoque) * 100).toFixed(1)
    : '0.0';

  // ─── PDF Export ──────────────────────────────────────────────────────
  const handleExportPDF = () => {
    exportToPDF({
      title: 'Equivalência Item-Produto',
      subtitle: 'Cruzamento entre Estoque Atual e Itens de Prescrição',
      filename: 'equivalencia-item-produto.pdf',
      isLandscape: true,
      accentColor: PDF_COLORS.indigo,
      kpis: [
        { label: 'Total Estoque', value: analysis.totalEstoque.toString(), color: PDF_COLORS.blue },
        { label: 'Total Prescrição', value: analysis.totalPrescricao.toString(), color: PDF_COLORS.purple },
        { label: 'Vinculados', value: analysis.vinculados.length.toString(), color: PDF_COLORS.emerald },
        { label: 'Sem Prescrição', value: analysis.semPrescricao.length.toString(), color: PDF_COLORS.orange },
        { label: 'Sem Estoque', value: analysis.semEstoque.length.toString(), color: PDF_COLORS.red },
      ],
      headers: ['Código', 'Descrição', 'Status'],
      data: displayRows.map(r => [r.codigo, r.descricao, r.status]),
    });
  };

  // ─── UI ──────────────────────────────────────────────────────────────
  const hasData = estoqueData.length > 0 || prescricaoData.length > 0;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-900 pb-12">

      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Layers className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">Equivalência Item × Produto</h1>
            <p className="text-xs font-medium text-slate-500">Cruzamento entre Estoque Atual e Itens de Prescrição</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {hasData && (
            <button
              onClick={handleExportPDF}
              className="flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600"
            >
              <Download className="w-4 h-4 mr-2" />
              Baixar PDF
            </button>
          )}

          <input type="file" accept=".csv,.CSV" ref={estoqueRef} className="hidden" onChange={handleEstoqueUpload} />
          <button
            onClick={() => estoqueRef.current?.click()}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
              uploadStatus.estoque
                ? 'bg-emerald-500 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200'
            }`}
          >
            {uploadStatus.estoque ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <Package className="w-4 h-4 mr-2" />}
            {uploadStatus.estoque ? 'Carregado!' : 'Estoque Atual'}
          </button>

          <input type="file" accept=".csv,.CSV" ref={prescricaoRef} className="hidden" onChange={handlePrescricaoUpload} />
          <button
            onClick={() => prescricaoRef.current?.click()}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
              uploadStatus.prescricao
                ? 'bg-emerald-500 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-200'
            }`}
          >
            {uploadStatus.prescricao ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <ClipboardList className="w-4 h-4 mr-2" />}
            {uploadStatus.prescricao ? 'Carregado!' : 'Prescrição'}
          </button>
        </div>
      </nav>

      <main className="px-8 max-w-[1600px] mx-auto mt-8">

        {/* Título */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Painel de Equivalência</h2>
          <p className="text-slate-500 mt-1">Identifique rapidamente os itens prescritos sem produto no estoque e vice-versa.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <KPICard title="Itens no Estoque" value={analysis.totalEstoque.toString()} icon={<Package className="w-5 h-5" />} color="text-blue-600" bg="bg-blue-100" />
          <KPICard title="Itens de Prescrição" value={analysis.totalPrescricao.toString()} icon={<ClipboardList className="w-5 h-5" />} color="text-purple-600" bg="bg-purple-100" />
          <KPICard title="Vinculados" value={analysis.vinculados.length.toString()} icon={<CheckCircle2 className="w-5 h-5" />} color="text-emerald-600" bg="bg-emerald-100" />
          <KPICard title="Sem Prescrição" value={analysis.semPrescricao.length.toString()} icon={<AlertTriangle className="w-5 h-5" />} color="text-amber-600" bg="bg-amber-100" />
          <KPICard title="Sem Estoque" value={analysis.semEstoque.length.toString()} icon={<XCircle className="w-5 h-5" />} color="text-rose-600" bg="bg-rose-100" />
        </div>

        {/* Gráficos */}
        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Donut */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
              <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
                <Layers className="w-5 h-5 mr-2 text-indigo-500" />
                Distribuição de Equivalência
              </h3>
              <p className="text-xs text-slate-500 mb-4">Proporção de itens vinculados, sem prescrição e sem estoque.</p>
              <div className="flex-grow min-h-[280px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData} innerRadius="55%" outerRadius="80%"
                      paddingAngle={3} dataKey="value" stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                    />
                    <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                  <span className="text-3xl font-bold text-slate-800">{pctVinculados}%</span>
                  <span className="text-[10px] text-emerald-600 font-medium uppercase tracking-widest mt-1">Cobertura</span>
                </div>
              </div>
            </div>

            {/* Barras Comparativas */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center">
                <Filter className="w-5 h-5 mr-2 text-indigo-500" />
                Comparativo Quantitativo
              </h3>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[
                      { name: 'Estoque', value: analysis.totalEstoque, fill: '#3b82f6' },
                      { name: 'Prescrição', value: analysis.totalPrescricao, fill: '#a855f7' },
                      { name: 'Vinculados', value: analysis.vinculados.length, fill: '#10b981' },
                      { name: 'S/ Prescrição', value: analysis.semPrescricao.length, fill: '#f59e0b' },
                      { name: 'S/ Estoque', value: analysis.semEstoque.length, fill: '#e11d48' },
                    ]}
                    margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="value" name="Qtd" radius={[6, 6, 0, 0]} barSize={40}>
                      {[
                        { fill: '#3b82f6' },
                        { fill: '#a855f7' },
                        { fill: '#10b981' },
                        { fill: '#f59e0b' },
                        { fill: '#e11d48' },
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Tabela */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">

          {/* Header da Tabela */}
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-lg font-bold text-slate-800">Detalhe de Itens</h3>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Filtros */}
              {(['todos', 'vinculados', 'sem_prescricao', 'sem_estoque'] as ViewFilter[]).map(f => {
                const labels: Record<ViewFilter, string> = {
                  todos: 'Todos',
                  vinculados: 'Vinculados',
                  sem_prescricao: 'Sem Prescrição',
                  sem_estoque: 'Sem Estoque',
                };
                return (
                  <button
                    key={f}
                    onClick={() => setViewFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      viewFilter === f
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}

              {/* Busca */}
              <div className="relative w-56">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar item..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Alerta informativo */}
          <div className="bg-slate-50/80 p-4 border-b border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>Sem Prescrição:</strong> Produto cadastrado no estoque mas sem vínculo com nenhum item de prescrição. Pode indicar item obsoleto, de uso raro ou cadastro pendente na prescrição médica.
                </p>
              </div>
              <div className="flex items-start gap-2 bg-white p-3 rounded-xl border border-rose-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                <XCircle className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong className="text-rose-700">Sem Estoque:</strong> Item prescrito pelo corpo clínico mas <b>sem produto físico</b>. Risco direto de falha no atendimento e necessidade de compra emergencial.
                </p>
              </div>
            </div>
          </div>

          {/* Tabela de dados */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Código</th>
                  <th className="px-6 py-4 font-semibold">Descrição</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayRows.length > 0 ? (
                  displayRows.slice(0, 200).map((r, i) => (
                    <tr key={`${r.codigo}-${r.status}-${i}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-800">{r.codigo}</td>
                      <td className="px-6 py-3 text-slate-600 truncate max-w-[400px]" title={r.descricao}>{r.descricao}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                          r.statusColor === 'emerald' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                          r.statusColor === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                          'bg-rose-100 text-rose-800 border-rose-200'
                        }`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={3} className="px-6 py-10 text-center text-slate-500">
                      {hasData ? 'Nenhum item encontrado para o filtro atual.' : 'Importe os dois arquivos CSV para iniciar a análise de equivalência.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {displayRows.length > 200 && (
              <div className="px-6 py-3 bg-slate-50 text-xs text-slate-500 text-center border-t border-slate-200">
                Exibindo 200 de {displayRows.length} resultados. Use a busca para refinar.
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  );
};

// ─── Componentes Auxiliares ────────────────────────────────────────────────────

function KPICard({ title, value, icon, color, bg }: { title: string; value: string; icon: React.ReactNode; color: string; bg: string }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className={`p-2.5 rounded-xl ${bg} ${color}`}>
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-2xl font-extrabold text-slate-800">{value}</h3>
        <p className="text-xs font-medium text-slate-500 mt-1">{title}</p>
      </div>
    </div>
  );
}

export default EquivalenciaItemProduto;
