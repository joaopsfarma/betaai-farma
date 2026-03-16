import React, { useState, useMemo } from 'react';
import { Upload, Users, Package, Timer, Clock, FileSpreadsheet, Target, BarChart3, TrendingUp } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

// Registar os componentes do Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// --- TIPAGENS ---
interface CSVRow {
  NM_USUARIO?: string;
  NUMPEDIDO?: string;
  HRPEDIDO?: string;
  QT_SOLICITADO?: string;
  [key: string]: any;
}

interface ColaboradorStat {
  nome: string;
  totalPedidos: number;
  totalItens: number;
  itensPorPedido: number;
  tempoMedio: number;
}

interface GlobalStats {
  totalColaboradores: number;
  totalPedidos: number;
  tempoMedioGlobal: number;
}

// --- FUNÇÕES UTILITÁRIAS ---
function parseCSV(text: string, delimiter = ';'): CSVRow[] {
  const lines = text.split(/\r?\n/);
  // Limpeza básica do CSV (remover primeira linha vazia se existir)
  if (lines[0] && lines[0].replace(new RegExp(delimiter, 'g'), '').trim() === '') {
    lines.shift();
  }
  if (lines.length === 0) return [];

  const headers = lines[0].split(delimiter).map(h => h.trim());
  const data: CSVRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = line.split(delimiter);
    const row: CSVRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
    });
    data.push(row);
  }
  return data;
}

function parseDate(dateStr?: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.trim().split(/[\s/:]+/);
  if (parts.length >= 6) {
    return new Date(
      parseInt(parts[2]),
      parseInt(parts[1]) - 1,
      parseInt(parts[0]),
      parseInt(parts[3]),
      parseInt(parts[4]),
      parseInt(parts[5])
    );
  }
  return null;
}

export const ProductivityTab: React.FC = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [stats, setStats] = useState<ColaboradorStat[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats | null>(null);

  // --- PROCESSAMENTO DE DADOS ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const parsedData = parseCSV(text, ';');
      processProductivityData(parsedData);
    };
    reader.readAsText(file);
  };

  const processProductivityData = (data: CSVRow[]) => {
    const colaboradores: Record<string, { nome: string; pedidos: Set<string>; itens: number; tempos: Set<string> }> = {};
    const totalPedidosGlobais = new Set<string>();
    let somaTemposGlobais = 0;
    let contagemTemposGlobais = 0;

    // 1. Agrupar dados por colaborador
    data.forEach(row => {
      const colab = row.NM_USUARIO?.trim();
      const pedido = row.NUMPEDIDO;
      const horaStr = row.HRPEDIDO;
      const qt = parseFloat(row.QT_SOLICITADO || '0') || 0;

      if (!colab || !pedido) return;

      if (!colaboradores[colab]) {
        colaboradores[colab] = {
          nome: colab,
          pedidos: new Set(),
          itens: 0,
          tempos: new Set()
        };
      }

      colaboradores[colab].pedidos.add(pedido);
      colaboradores[colab].itens += qt;
      totalPedidosGlobais.add(pedido);
      
      if (horaStr) {
        colaboradores[colab].tempos.add(horaStr);
      }
    });

    // 2. Calcular métricas
    const processado = Object.values(colaboradores).map(c => {
      const totalPedidos = c.pedidos.size;
      const totalItens = c.itens;
      
      const datas = Array.from(c.tempos)
        .map(parseDate)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());
      
      let somaDiferencasMin = 0;
      let contagensValidas = 0;

      for (let i = 1; i < datas.length; i++) {
        const diffMs = datas[i].getTime() - datas[i - 1].getTime();
        const diffMin = diffMs / (1000 * 60);
        
        // Se for menor que 2h (120 min), assumimos mesma jornada
        if (diffMin > 0 && diffMin <= 120) {
          somaDiferencasMin += diffMin;
          contagensValidas++;
          somaTemposGlobais += diffMin;
          contagemTemposGlobais++;
        }
      }

      const tempoMedio = contagensValidas > 0 ? (somaDiferencasMin / contagensValidas) : 0;

      return {
        nome: c.nome,
        totalPedidos,
        totalItens,
        itensPorPedido: totalPedidos > 0 ? (totalItens / totalPedidos) : 0,
        tempoMedio: parseFloat(tempoMedio.toFixed(1))
      };
    });

    // Ordenar por volume de pedidos (descendente)
    processado.sort((a, b) => b.totalPedidos - a.totalPedidos);

    setStats(processado);
    setGlobalStats({
      totalColaboradores: processado.length,
      totalPedidos: totalPedidosGlobais.size,
      tempoMedioGlobal: contagemTemposGlobais > 0 ? parseFloat((somaTemposGlobais / contagemTemposGlobais).toFixed(1)) : 0
    });
  };

  // --- DADOS PARA OS GRÁFICOS ---
  const top10Stats = useMemo(() => stats.slice(0, 10), [stats]);
  const validTimeStats = useMemo(() => top10Stats.filter(s => s.tempoMedio > 0), [top10Stats]);

  const pedidosChartData = {
    labels: top10Stats.map(s => {
      const parts = s.nome.split(' ');
      return `${parts[0]} ${parts[1] || ''}`.trim();
    }),
    datasets: [
      {
        label: 'Pedidos Atendidos',
        data: top10Stats.map(s => s.totalPedidos),
        backgroundColor: '#6366f1',
        borderRadius: 4
      }
    ]
  };

  const tempoChartData = {
    labels: validTimeStats.map(s => {
      const parts = s.nome.split(' ');
      return `${parts[0]} ${parts[1] || ''}`.trim();
    }),
    datasets: [
      {
        label: 'Tempo Médio (min)',
        data: validTimeStats.map(s => s.tempoMedio),
        backgroundColor: validTimeStats.map(s => 
          s.tempoMedio < 15 ? '#10b981' : (s.tempoMedio > 30 ? '#f59e0b' : '#3b82f6')
        ),
        borderRadius: 4
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    }
  };

  return (
    <div className="bg-slate-50 text-slate-800 font-sans min-h-screen flex flex-col rounded-3xl overflow-hidden border border-slate-200 shadow-sm">
      {/* Cabeçalho */}
      <header className="bg-indigo-800 text-white shadow-md">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-3">
            <Clock className="w-6 h-6" />
            Produtividade da Equipa (Farmácia/Estoque)
          </h1>
          <div className="hidden md:block text-sm opacity-80">
            Análise de Desempenho por Colaborador
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="container mx-auto px-6 py-8 flex-grow">
        
        {/* Área de Carregamento de Ficheiro */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-700 mb-1">Fonte de Dados</h2>
            <p className="text-sm text-slate-500">
              {fileName ? `Ficheiro carregado: ${fileName}` : 'Carregue o CSV para gerar o relatório de produtividade.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="cursor-pointer bg-indigo-50 text-indigo-700 border border-indigo-200 px-5 py-2.5 rounded-lg hover:bg-indigo-100 transition flex items-center gap-2 font-medium shadow-sm">
              <Upload className="w-5 h-5" /> Carregar CSV
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </div>

        {/* Estado Vazio */}
        {stats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <FileSpreadsheet className="w-20 h-20 mb-4 opacity-50" />
            <p className="text-xl">A aguardar ficheiro...</p>
          </div>
        ) : (
          /* Dashboard */
          <div className="space-y-8">
            
            {/* Cards de Resumo Global */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-indigo-500">
                <div className="bg-indigo-100 text-indigo-600 p-3 rounded-full flex items-center justify-center w-12 h-12">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium uppercase">Colaboradores Ativos</p>
                  <p className="text-2xl font-bold text-slate-800">{globalStats?.totalColaboradores}</p>
                </div>
              </div>
              
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-blue-500">
                <div className="bg-blue-100 text-blue-600 p-3 rounded-full flex items-center justify-center w-12 h-12">
                  <Package className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium uppercase">Pedidos Processados</p>
                  <p className="text-2xl font-bold text-slate-800">{globalStats?.totalPedidos.toLocaleString('pt-PT')}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex items-center gap-4 border-l-4 border-emerald-500">
                <div className="bg-emerald-100 text-emerald-600 p-3 rounded-full flex items-center justify-center w-12 h-12">
                  <Timer className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-sm text-slate-500 font-medium uppercase">Tempo Médio Global (Min)</p>
                  <p className="text-2xl font-bold text-slate-800">{globalStats?.tempoMedioGlobal}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Users className="w-8 h-8 text-indigo-600" />
            Produtividade da Equipe
          </h2>
          <p className="text-slate-500 font-medium">Análise de eficiência operacional e densidade de pedidos por colaborador.</p>
        </div>
        {/* ... stats ... */}
      </div>

      <PanelGuide 
        sections={[
          {
            title: "Performance Individual",
            content: "Calcula o volume de itens bipados e pedidos processados por cada colaborador, permitindo identificar padrões de eficiência.",
            icon: <TrendingUp className="w-4 h-4" />
          },
          {
            title: "Itens por Pedido",
            content: "Mede a densidade das solicitações. Pedidos com poucos itens podem indicar ineficiência na consolidação das demandas.",
            icon: <Target className="w-4 h-4" />
          },
          {
            title: "Ritmo de Trabalho",
            content: "Analisa a carga horária de bipagem para identificar horários de pico e otimizar o dimensionamento da equipe na logística.",
            icon: <BarChart3 className="w-4 h-4" />
          }
        ]}
      />

            {/* Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                <h3 className="text-lg font-semibold mb-4 text-slate-700">Volume de Pedidos (Top 10)</h3>
                <div className="relative h-64 w-full">
                  <Bar data={pedidosChartData} options={chartOptions} />
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col">
                <h3 className="text-lg font-semibold mb-1 text-slate-700">Tempo Médio entre Pedidos</h3>
                <p className="text-xs text-slate-500 mb-4">* Menor é mais rápido. Exclui pausas &gt; 2 horas.</p>
                <div className="relative h-64 w-full">
                  <Bar data={tempoChartData} options={{...chartOptions, scales: { y: { title: { display: true, text: 'Minutos' } } }}} />
                </div>
              </div>
            </div>

            {/* Tabela Detalhada */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                <h3 className="text-lg font-semibold text-slate-700">Relatório Detalhado de Produtividade</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white text-slate-500 text-sm uppercase tracking-wider">
                      <th className="px-6 py-4 border-b font-medium">Colaborador</th>
                      <th className="px-6 py-4 border-b font-medium text-center">Pedidos Atendidos</th>
                      <th className="px-6 py-4 border-b font-medium text-center">Itens Separados</th>
                      <th className="px-6 py-4 border-b font-medium text-center">Média Itens/Pedido</th>
                      <th className="px-6 py-4 border-b font-medium text-right">Tempo Médio (min)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-700">
                    {stats.map((row, index) => {
                      let corTempo = 'text-slate-700';
                      if (row.tempoMedio > 0) {
                        if (row.tempoMedio < 10) corTempo = 'text-emerald-600 font-bold';
                        else if (row.tempoMedio > 30) corTempo = 'text-amber-600 font-bold';
                      }

                      return (
                        <tr key={row.nome} className={index % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}>
                          <td className="px-6 py-3 border-b border-slate-100 font-medium flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0">
                              {row.nome.substring(0, 2).toUpperCase()}
                            </div>
                            <span className="truncate">{row.nome}</span>
                          </td>
                          <td className="px-6 py-3 border-b border-slate-100 text-center">{row.totalPedidos.toLocaleString('pt-PT')}</td>
                          <td className="px-6 py-3 border-b border-slate-100 text-center">{row.totalItens.toLocaleString('pt-PT')}</td>
                          <td className="px-6 py-3 border-b border-slate-100 text-center">{row.itensPorPedido.toFixed(1)}</td>
                          <td className={`px-6 py-3 border-b border-slate-100 text-right ${corTempo}`}>
                            {row.tempoMedio > 0 ? `${row.tempoMedio} min` : <span className="text-slate-400 text-sm font-normal">S/ Dados</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
};
