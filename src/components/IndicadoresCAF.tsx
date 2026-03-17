import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { 
  Upload, AlertOctagon, AlertTriangle, Clock, Search, CalendarDays, 
  Package, TrendingUp, Activity, Layers, ArrowDownToLine, Database, Target, ShieldCheck, DollarSign
} from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';

// CSV Unificado (Consumo + Validade) gerado dinamicamente para ter datas relativas ao dia de hoje
const generateMockCsv = () => {
  const today = new Date();
  const addDays = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  return `Codigo,Produto,Unidade,D07,D08,D09,D10,D11,D12,Total,Media,Saldo,Projecao,Lote,Validade
19,DIAMOX 250MG COMP,COMP,0,0,0,0,4,2,6,1,51,51,L1029,${addDays(150)}
38,ACICLOVIR 200MG COMP,COMP,15,8,8,10,8,3,52,8.66,601,69.3,L9920,${addDays(15)}
41,UNI VIR 250MG EV,AMP,12,2,4,14,14,23,69,11.5,264,22.9,L1234,${addDays(-5)}
47,SOMALGIN CARDIO 100MG,COMP,5,1,5,1,0,0,12,2,1752,876,L5541,${addDays(20)}
59,AAS 100MG COMP,COMP,38,4,26,31,18,23,140,23.3,1473,63.1,L9988,${addDays(80)}
82,ENDOFOLIN 5MG COMP,COMP,1,1,2,2,2,1,9,1.5,400,266.6,L0012,${addDays(-12)}
19561,DIETA PARENTERAL NUTRIFICA PADRAO GERAL 1.000 A 1799ML,UND,10,10,10,10,10,10,60,10,500,50,L999,${addDays(30)}
210698,CURATIVO FILME 15CM,UND,0,0,8,0,16,0,24,4,29,7.2,L774,${addDays(45)}
211955,CONECTOR TRANSICAO,UND,0,0,0,1,0,0,1,0.16,1651,9904,L112,${addDays(200)}
212443,VYNAXA 10 MG COMP,COMP,0,0,0,0,0,2,2,0.33,126,378,L889,${addDays(25)}
212581,CAPA EQUIPAMENTO,UND,0,32,31,15,60,0,138,23,1163,50,L003,${addDays(110)}
212726,FIO SUTURA VICRYL,UND,4,6,4,9,6,3,32,5.33,140,26.2,L445,${addDays(5)}`;
};

// Cores de Status de Validade e Gráficos
const STATUS_COLORS: Record<string, string> = {
  vencido: '#dc2626', // Vermelho escuro
  critico: '#ea580c', // Laranja (<= 30 dias)
  atencao: '#eab308', // Amarelo (<= 90 dias)
  seguro: '#16a34a',  // Verde (> 90 dias)
  desconhecido: '#9ca3af' // Cinza
};

const CHART_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

const parseDateString = (dateStr: string) => {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
  return null;
};

const getDaysToExpire = (expireDate: Date | null) => {
  if (!expireDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expireDate.setHours(0, 0, 0, 0);
  const diffTime = expireDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

const parseNum = (val: string | undefined) => {
  if (!val) return 0;
  let clean = val.replace(/"/g, '').trim();
  if (clean === '') return 0;
  clean = clean.replace(',', '.');
  return parseFloat(clean) || 0;
};

const parseCSV = (csvText: string) => {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l !== '');
  const data = [];
  
  for (let i = 1; i < lines.length; i++) {
    let vals = [];
    let item = '';
    let inQuotes = false;
    for (let char of lines[i]) {
      if (char === '"') inQuotes = !inQuotes;
      else if ((char === ',' || char === ';') && !inQuotes) { vals.push(item); item = ''; }
      else item += char;
    }
    vals.push(item);

    if (vals.length >= 10) {
      const id = vals[0] || i.toString();
      const produto = vals[1] || 'Desconhecido';

      // --- REGRA DE EXCLUSÃO ---
      if (String(id).trim() === '19561' || String(produto).toUpperCase().includes('DIETA PARENTERAL NUTRIFICA')) {
        continue;
      }

      const projecaoVal = parseNum(vals[12] || vals[vals.length - 1]);
      const loteVal = vals.length >= 14 ? vals[13].trim() : '-';
      const validadeStr = vals.length >= 15 ? vals[14].trim() : '';
      const validadeData = parseDateString(validadeStr);
      const diasRestantes = validadeData ? getDaysToExpire(validadeData) : null;
      
      let status = 'desconhecido';
      if (diasRestantes !== null) {
        if (diasRestantes < 0) status = 'vencido';
        else if (diasRestantes <= 30) status = 'critico';
        else if (diasRestantes <= 90) status = 'atencao';
        else status = 'seguro';
      }

      data.push({
        id: id,
        produto: produto,
        unidade: vals[2] || '',
        d07: parseNum(vals[3]), d08: parseNum(vals[4]), d09: parseNum(vals[5]),
        d10: parseNum(vals[6]), d11: parseNum(vals[7]), d12: parseNum(vals[8]),
        total: parseNum(vals[9]),
        media: parseNum(vals[10]),
        saldo: parseNum(vals[11]),
        projecao: projecaoVal,
        lote: loteVal,
        validadeStr,
        validadeData,
        diasRestantes,
        status
      });
    }
  }
  return data;
};

export const IndicadoresCAF: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [fileName, setFileName] = useState('Dados Unificados.csv');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setData(parseCSV(generateMockCsv()));
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => setData(parseCSV(event.target?.result as string));
      reader.readAsText(file);
    }
  };

  const analytics = useMemo(() => {
    let totalConsumo = 0, totalSaldo = 0, estoqueCritico = 0;
    const valKpis = { vencidos: 0, critico: 0, atencao: 0, seguro: 0 };
    const dailySum = { d07: 0, d08: 0, d09: 0, d10: 0, d11: 0, d12: 0 };
    
    const searchLower = searchTerm.toLowerCase();
    const filtered = data.filter(item => 
      item.produto.toLowerCase().includes(searchLower) || 
      item.id.toLowerCase().includes(searchLower) ||
      (item.lote && item.lote.toLowerCase().includes(searchLower))
    );

    data.forEach(item => {
      // Consumo
      totalConsumo += item.total;
      totalSaldo += item.saldo;
      if (item.projecao > 0 && item.projecao <= 15) estoqueCritico++;
      dailySum.d07 += item.d07; dailySum.d08 += item.d08; dailySum.d09 += item.d09;
      dailySum.d10 += item.d10; dailySum.d11 += item.d11; dailySum.d12 += item.d12;

      // Validade
      if (item.status === 'vencido') valKpis.vencidos++;
      else if (item.status === 'critico') valKpis.critico++;
      else if (item.status === 'atencao') valKpis.atencao++;
      else if (item.status === 'seguro') valKpis.seguro++;
    });

    const formatName = (name: string) => name.length > 20 ? name.substring(0, 20) + '...' : name;

    return {
      consumoKpis: {
        totalProdutos: data.length,
        totalConsumo,
        estoqueCritico,
        mediaGlobal: data.length > 0 ? (totalConsumo / (data.length * 6)).toFixed(1) : 0
      },
      validadeKpis: {
        totalLotes: data.length,
        ...valKpis
      },
      chartDataConsumo: [
        { name: 'Dia 07', consumo: dailySum.d07 }, { name: 'Dia 08', consumo: dailySum.d08 },
        { name: 'Dia 09', consumo: dailySum.d09 }, { name: 'Dia 10', consumo: dailySum.d10 },
        { name: 'Dia 11', consumo: dailySum.d11 }, { name: 'Dia 12', consumo: dailySum.d12 },
      ],
      // Novos Gráficos:
      topProducts: [...data].sort((a, b) => b.total - a.total).slice(0, 5),
      topSaldos: [...data].sort((a, b) => b.saldo - a.saldo).slice(0, 5).map(i => ({
        name: formatName(i.produto), fullName: i.produto, saldo: i.saldo
      })),
      riscoRuptura: [...data].filter(i => i.projecao > 0).sort((a, b) => a.projecao - b.projecao).slice(0, 5).map(i => ({
        name: formatName(i.produto), fullName: i.produto, projecao: i.projecao
      })),
      
      chartDataValidade: [
        { name: 'Vencidos', value: valKpis.vencidos, color: STATUS_COLORS.vencido },
        { name: 'Crítico (≤30d)', value: valKpis.critico, color: STATUS_COLORS.critico },
        { name: 'Atenção (≤90d)', value: valKpis.atencao, color: STATUS_COLORS.atencao },
        { name: 'Seguro (>90d)', value: valKpis.seguro, color: STATUS_COLORS.seguro },
      ].filter(d => d.value > 0),
      topProximos: [...data].filter(i => i.diasRestantes !== null && i.diasRestantes >= 0)
        .sort((a, b) => a.diasRestantes - b.diasRestantes).slice(0, 5)
        .map(i => ({ name: formatName(i.produto), fullName: i.produto, dias: i.diasRestantes, fill: STATUS_COLORS[i.status] })),
      
      filteredData: [...filtered]
    };
  }, [data, searchTerm]);

  return (
    <div className="bg-gray-50 text-gray-800 font-sans p-4 md:p-8">
      <div className="max-w-[1400px] mx-auto space-y-8">
        
        {/* CABEÇALHO GLOBAL */}
        <header className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 md:p-6 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-4 z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-indigo-600" />
            Indicadores de Performance: CAF
          </h1>
          <p className="text-slate-500 font-medium">Monitoramento de kpis logísticos, rupturas e eficiência financeira.</p>
        </div>
        <div className="flex gap-3">
           {/* ... filters ... */}
        </div>
      </div>

      <PanelGuide 
        sections={[
          {
            title: "Eficiência de Suprimento",
            content: "Mede a adesão entre o estoque planejado e o recebido, identificando falhas críticas na cadeia de abastecimento.",
            icon: <Target className="w-4 h-4" />
          },
          {
            title: "Ruptura de Estoque",
            content: "Percentual de itens zerados no almoxarifado central, impactando diretamente o abastecimento das farmácias satélites.",
            icon: <ShieldCheck className="w-4 h-4" />
          },
          {
            title: "Visão Financeira",
            content: "Consolida o valor do patrimônio armazenado, permitindo o controle de custos e a otimização do capital de giro operacional.",
            icon: <DollarSign className="w-4 h-4" />
          }
        ]}
      />
          
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Pesquisar produto ou lote..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-colors"
              />
            </div>
            <div className="flex items-center gap-3 w-full sm:w-auto justify-between">
              <span className="text-sm text-gray-500 truncate max-w-[100px] sm:max-w-[150px]" title={fileName}>{fileName}</span>
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0"
              >
                <Upload size={16} />
                <span className="hidden sm:inline">Importar CSV</span>
              </button>
            </div>
          </div>
        </header>


        {/* SESSÃO 1: CONSUMO E ESTOQUE */}
        <section className="space-y-6">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
            <Activity className="text-blue-600" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Métricas de Consumo e Cobertura de Estoque</h2>
          </div>

          {/* KPIs Consumo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Itens em Catálogo', value: analytics.consumoKpis.totalProdutos, icon: Package, color: 'text-gray-700', bg: 'bg-gray-100' },
              { label: 'Volume Consumido', value: analytics.consumoKpis.totalConsumo, icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Ruptura Eminente (<15d)', value: analytics.consumoKpis.estoqueCritico, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50' },
              { label: 'Média/Dia Global', value: analytics.consumoKpis.mediaGlobal, icon: Activity, color: 'text-green-600', bg: 'bg-green-50' }
            ].map((kpi, idx) => (
              <div key={idx} className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <div className={`p-3 rounded-xl ${kpi.bg} ${kpi.color}`}><kpi.icon size={24} /></div>
                <div>
                  <p className="text-sm text-gray-500 font-medium">{kpi.label}</p>
                  <h3 className="text-2xl font-bold text-gray-900">{kpi.value}</h3>
                </div>
              </div>
            ))}
          </div>

          {/* Grid de Gráficos de Consumo */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Gráfico 1: Tendência (Ocupa 2 colunas) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
              <h3 className="text-base font-semibold text-gray-800 mb-6">Tendência de Consumo Diário Geral</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={analytics.chartDataConsumo} margin={{ top: 5, right: 20, bottom: 5, left: -20 }}>
                    <defs>
                      <linearGradient id="colorConsumo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }} />
                    <Area type="monotone" dataKey="consumo" stroke="#2563eb" strokeWidth={3} fill="url(#colorConsumo)" activeDot={{r: 6}} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 2: Top Consumo */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
              <h3 className="text-base font-semibold text-gray-800 mb-6">Top 5 - Maior Consumo</h3>
              <div className="flex-1 flex flex-col justify-center space-y-4">
                {analytics.topProducts.map((prod, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg">
                    <div className="flex flex-col overflow-hidden pr-4">
                      <span className="text-sm font-medium text-gray-800 truncate" title={prod.produto}>
                        {prod.produto.length > 22 ? prod.produto.substring(0,22) + '...' : prod.produto}
                      </span>
                      <span className="text-xs text-gray-500">Cód: {prod.id}</span>
                    </div>
                    <div className="text-right whitespace-nowrap">
                      <span className="text-sm font-bold text-blue-600">{prod.total}</span>
                      <span className="text-xs text-gray-500 ml-1">unid.</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico 3: Risco de Ruptura (Menor Projeção) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex items-center gap-2 mb-6">
                <ArrowDownToLine className="text-red-500" size={18} />
                <h3 className="text-base font-semibold text-gray-800">Risco de Falta (Menor Cobertura)</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.riscoRuptura} layout="vertical" margin={{ top: 0, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{fill: '#4b5563', fontSize: 11}} width={120} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: '#fef2f2'}}
                      formatter={(value: any) => [`${parseFloat(value).toFixed(1)} dias`, 'Projeção Restante']}
                      labelFormatter={(label, props) => props.length > 0 ? props[0].payload.fullName : label}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="projecao" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Gráfico 4: Maiores volumes em Estoque (Ocupa 2 colunas) */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <Database className="text-indigo-500" size={18} />
                <h3 className="text-base font-semibold text-gray-800">Maiores Volumes em Estoque Físico (Top Saldo)</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topSaldos} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{fill: '#6b7280', fontSize: 11}} axisLine={false} tickLine={false} />
                    <YAxis tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: '#f5f3ff'}}
                      formatter={(value: any) => [value, 'Saldo Total']}
                      labelFormatter={(label, props) => props.length > 0 ? props[0].payload.fullName : label}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="saldo" radius={[4, 4, 0, 0]} barSize={40}>
                      {analytics.topSaldos.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        </section>


        {/* SESSÃO 2: VALIDADES */}
        <section className="space-y-6 pt-6 border-t border-gray-200">
          <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
            <CalendarDays className="text-orange-500" size={20} />
            <h2 className="text-lg font-bold text-gray-800">Controle de Validades e Vencimentos</h2>
          </div>

          {/* KPIs Validade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4"><div className="p-3 rounded-xl bg-gray-100 text-gray-700"><ShieldCheck size={24} /></div><div><p className="text-sm text-gray-500 font-medium">Lotes Monitorados</p><h3 className="text-2xl font-bold text-gray-900">{analytics.validadeKpis.totalLotes}</h3></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 border-l-4 border-l-red-600"><div className="p-3 rounded-xl bg-red-50 text-red-600"><AlertOctagon size={24} /></div><div><p className="text-sm text-gray-500 font-medium">Produtos Vencidos</p><h3 className="text-2xl font-bold text-red-600">{analytics.validadeKpis.vencidos}</h3></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 border-l-4 border-l-orange-500"><div className="p-3 rounded-xl bg-orange-50 text-orange-600"><AlertTriangle size={24} /></div><div><p className="text-sm text-gray-500 font-medium">Crítico (≤30 dias)</p><h3 className="text-2xl font-bold text-orange-600">{analytics.validadeKpis.critico}</h3></div></div>
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4 border-l-4 border-l-yellow-400"><div className="p-3 rounded-xl bg-yellow-50 text-yellow-600"><Clock size={24} /></div><div><p className="text-sm text-gray-500 font-medium">Atenção (≤90 dias)</p><h3 className="text-2xl font-bold text-yellow-600">{analytics.validadeKpis.atencao}</h3></div></div>
          </div>

          {/* Gráficos Validade */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center">
              <h3 className="text-base font-semibold text-gray-800 w-full mb-2">Saúde do Inventário</h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={analytics.chartDataValidade} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {analytics.chartDataValidade.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                    </Pie>
                    <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm lg:col-span-2">
              <h3 className="text-base font-semibold text-gray-800 mb-6">Próximos a Vencer (Lotes Críticos)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topProximos} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                    <YAxis dataKey="name" type="category" tick={{fill: '#4b5563', fontSize: 11}} width={120} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      cursor={{fill: '#f3f4f6'}}
                      formatter={(value) => [`${value} dias`, 'Tempo Restante']}
                      labelFormatter={(label, props) => props.length > 0 ? props[0].payload.fullName : label}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
                    />
                    <Bar dataKey="dias" radius={[0, 4, 4, 0]} barSize={28}>
                      {analytics.topProximos.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>


        {/* SESSÃO 3: TABELA GERAL UNIFICADA */}
        <section className="space-y-6 pt-6 border-t border-gray-200">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-800">Tabela de Dados: Consumo, Saldo e Vencimentos</h3>
              <span className="text-sm text-gray-500">{analytics.filteredData.length} itens encontrados</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs">Produto e Lote</th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-center">Volume (Período)</th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-center">Média Diária</th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-center">Saldo Atual</th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-center">Projeção (Dias)</th>
                    <th className="px-6 py-4 font-semibold uppercase tracking-wider text-xs text-right">Situação (Validade)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700">
                  {analytics.filteredData.map((item, idx) => {
                    const statusColor = STATUS_COLORS[item.status] || STATUS_COLORS.desconhecido;
                    
                    return (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-gray-900 truncate max-w-[280px]" title={item.produto}>{item.produto}</span>
                            <div className="flex gap-2 text-xs text-gray-500 mt-1">
                              <span>Cód: {item.id}</span>
                              {item.lote && item.lote !== '-' && (
                                <><span>•</span><span className="font-mono bg-gray-100 px-1.5 rounded">Lote: {item.lote}</span></>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium">{item.total}</td>
                        <td className="px-6 py-4 text-center text-gray-500">{item.media.toFixed(1)}</td>
                        <td className="px-6 py-4 text-center font-bold text-gray-800">{item.saldo}</td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.projecao < 15 ? 'bg-red-100 text-red-700 border border-red-200' : 
                            item.projecao < 30 ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                            'bg-green-100 text-green-700 border border-green-200'
                          }`}>
                            {item.projecao.toFixed(0)} d
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {item.status !== 'desconhecido' ? (
                            <div className="flex flex-col items-end">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className={`inline-block w-2 h-2 rounded-full`} style={{backgroundColor: statusColor}}></span>
                                <span className="text-xs font-bold uppercase tracking-wider" style={{color: statusColor}}>{item.status}</span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {item.diasRestantes < 0 ? `Venceu há ${Math.abs(item.diasRestantes)} d` : `Vence em ${item.diasRestantes} d`}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">Sem data</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {analytics.filteredData.length === 0 && (
                    <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum resultado encontrado para esta pesquisa.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
