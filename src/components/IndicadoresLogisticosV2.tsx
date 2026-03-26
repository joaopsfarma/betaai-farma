import React, { useState, useMemo, useCallback } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
  LineChart, Line, AreaChart, Area
} from 'recharts';
import {
  Upload, TrendingDown, Package, AlertTriangle, CheckCircle,
  BarChart2, Target, Activity, Clock, DollarSign, 
  ChevronLeft, ChevronRight, Search, FileDown, ArrowRight,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- TYPES ---

interface ServiceAccuracyItem {
  type: string;
  situation: string;
  requested: number;
  attended: number;
  reached: number;
  status: string;
}

interface OutflowReturnItem {
  species: string;
  product: string;
  outflowQty: number;
  returnQty: number;
  totalValue: number;
  stock: string;
}

interface HourlyDemandItem {
  type: string;
  '00:00_AS_06:00': number;
  '06:01_AS_12:00': number;
  '12:01_AS_18:00': number;
  '18:01_AS_23:59': number;
  total: number;
}

interface MonthlyLossItem {
  month: string;
  consolidated: number;
  percentStock: string;
}

interface LossByTypeItem {
  period: string;
  unit: string;
  stockValue: number;
  stability: number;
  breakage: number;
  validity: number;
  others: number;
  total: number;
}

interface ProductLossItem {
  product: string;
  loss: number;
}

interface InventoryVarianceItem {
  stockLocation: string;
  varianceValue: number;
}

interface UnitAccuracyItem {
  unit: string;
  stockLocation: string;
  percentage: number;
}

interface ProductVarianceItem {
  product: string;
  variance: number;
}

// --- PARSING HELPERS ---

function parseCSV(text: string, separator: string = ';'): string[][] {
  if (!text) return [];
  const lines = text.split('\n');
  return lines.map(line => {
    const result: string[] = [];
    let cur = '';
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (ch === separator && !inQ) { result.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    result.push(cur.trim());
    return result;
  });
}

function parseBR(s?: string): number {
  if (!s) return 0;
  const clean = s.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- MAIN COMPONENT ---

export const IndicadoresLogisticosV2: React.FC = () => {
  const [accuracyData, setAccuracyData] = useState<ServiceAccuracyItem[]>([]);
  const [outflowData, setOutflowData] = useState<OutflowReturnItem[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyDemandItem[]>([]);
  const [monthlyLossData, setMonthlyLossData] = useState<MonthlyLossItem[]>([]);
  const [lossByTypeData, setLossByTypeData] = useState<LossByTypeItem[]>([]);
  const [productLossData, setProductLossData] = useState<ProductLossItem[]>([]);
  const [inventoryVarianceData, setInventoryVarianceData] = useState<InventoryVarianceItem[]>([]);
  const [unitAccuracyData, setUnitAccuracyData] = useState<UnitAccuracyItem[]>([]);
  const [productVarianceData, setProductVarianceData] = useState<ProductVarianceItem[]>([]);
  
  const [filesLoaded, setFilesLoaded] = useState({
    accuracy: false,
    outflow: false,
    hourly: false,
    losses: false,
    variance: false,
    unitAccuracy: false
  });

  const [activeTab, setActiveTab] = useState<'geral' | 'acuracidade' | 'movimentacao' | 'perdas' | 'horarios' | 'inventario'>('geral');

  // --- HANDLERS ---

  const handleFileUpload = useCallback(async (file: File, type: keyof typeof filesLoaded) => {
    const text = await file.text();
    const rows = parseCSV(text, file.name.endsWith('.csv') ? (text.includes(';') ? ';' : ',') : ';');

    if (type === 'accuracy') {
      // Find where data starts (header is DESCRICAO_TIPO_SOLICITACAO)
      const dataStart = rows.findIndex(r => r[0] === 'DESCRICAO_TIPO_SOLICITACAO');
      if (dataStart !== -1) {
        const data = rows.slice(dataStart + 1)
          .filter(r => r[0])
          .map(r => ({
            type: r[0],
            situation: r[1],
            requested: parseBR(r[2]),
            attended: parseBR(r[3]),
            reached: parseBR(r[4]),
            status: r[5]
          }));
        setAccuracyData(data);
        setFilesLoaded(prev => ({ ...prev, accuracy: true }));
      }
    } else if (type === 'outflow') {
      // 3012___Saidas_e_Devolucoes_de_Estoque.CSV
      const data = rows.slice(1)
        .filter(r => r[3]) // product exists
        .map(r => ({
          species: r[1],
          product: r[3],
          outflowQty: parseBR(r[6]),
          returnQty: parseBR(r[7]),
          totalValue: parseBR(r[8]),
          stock: r[10]
        }));
      setOutflowData(data);
      setFilesLoaded(prev => ({ ...prev, outflow: true }));
    } else if (type === 'hourly') {
      const dataStart = rows.findIndex(r => r[0] === 'Tipo de Solicitação');
      if (dataStart !== -1) {
        const data = rows.slice(dataStart + 1)
          .filter(r => r[0] && r[0] !== 'TOTAL')
          .map(r => ({
            type: r[0],
            '00:00_AS_06:00': parseBR(r[1]),
            '06:01_AS_12:00': parseBR(r[2]),
            '12:01_AS_18:00': parseBR(r[3]),
            '18:01_AS_23:59': parseBR(r[4]),
            total: parseBR(r[5])
          }));
        setHourlyData(data);
        setFilesLoaded(prev => ({ ...prev, hourly: true }));
      }
    } else if (type === 'losses') {
      // Valor de perdas por mês.csv
      if (file.name.includes('por mês')) {
        const data = rows.slice(1)
          .filter(r => r[0])
          .map(r => ({
            month: r[0],
            consolidated: parseBR(r[1]),
            percentStock: r[2]
          }));
        setMonthlyLossData(data);
      } else if (file.name.includes('por tipo')) {
        const data = rows.slice(1)
          .filter(r => r[0])
          .map(r => ({
            period: r[0],
            unit: r[1],
            stockValue: parseBR(r[2]),
            stability: parseBR(r[3]),
            breakage: parseBR(r[4]),
            validity: parseBR(r[5]),
            others: parseBR(r[6]),
            total: parseBR(r[7])
          }));
        setLossByTypeData(data);
      } else if (file.name.includes('por produto')) {
        const data = rows.slice(1)
          .filter(r => r[0])
          .map(r => ({
            product: r[0],
            loss: parseBR(r[1])
          }));
        setProductLossData(data);
      }
      setFilesLoaded(prev => ({ ...prev, losses: true }));
    } else if (type === 'variance') {
      if (file.name.toLowerCase().includes('produto')) {
        const data = rows.slice(1)
          .filter(r => r[0])
          .map(r => ({
            product: r[1],
            variance: parseBR(r[5]) // Value is in index 5 based on previous peek
          }));
        setProductVarianceData(data);
      } else {
        const data = rows.slice(1)
          .filter(r => r[0])
          .map(r => ({
            stockLocation: r[0],
            varianceValue: parseBR(r[1])
          }));
        setInventoryVarianceData(data);
      }
      setFilesLoaded(prev => ({ ...prev, variance: true }));
    } else if (type === 'unitAccuracy') {
      const data = rows.slice(1)
        .filter(r => r[1])
        .map(r => ({
          unit: r[0],
          stockLocation: r[1],
          percentage: parseBR(r[4])
        }));
      setUnitAccuracyData(data);
      setFilesLoaded(prev => ({ ...prev, unitAccuracy: true }));
    }
  }, []);

  // --- KPIs ---

  const kpis = useMemo(() => {
    const totalReq = accuracyData.reduce((s, i) => s + i.requested, 0);
    const totalAtt = accuracyData.reduce((s, i) => s + i.attended, 0);
    const accuracyV2 = totalReq > 0 ? (totalAtt / totalReq) * 100 : 0;

    const totalOutVal = outflowData.reduce((s, i) => s + i.totalValue, 0);
    const totalOutQty = outflowData.reduce((s, i) => s + i.outflowQty, 0);
    const totalRetQty = outflowData.reduce((s, i) => s + i.returnQty, 0);
    const returnRate = totalOutQty > 0 ? (totalRetQty / totalOutQty) * 100 : 0;

    const totalLoss = monthlyLossData.reduce((s, i) => s + i.consolidated, 0);
    const lastMonthLoss = monthlyLossData[monthlyLossData.length - 1]?.consolidated || 0;

    const totalVariance = inventoryVarianceData.reduce((s, i) => s + Math.abs(i.varianceValue), 0);
    const avgUnitAccuracy = unitAccuracyData.length > 0 
      ? unitAccuracyData.reduce((s, i) => s + i.percentage, 0) / unitAccuracyData.length 
      : 0;

    return {
      accuracyV2,
      totalOutVal,
      returnRate,
      totalLoss,
      lastMonthLoss,
      totalReq,
      totalAtt,
      totalVariance,
      avgUnitAccuracy
    };
  }, [accuracyData, outflowData, monthlyLossData, inventoryVarianceData, unitAccuracyData]);

  const lossReasonData = useMemo(() => {
    if (lossByTypeData.length === 0) return [];
    const latest = lossByTypeData[lossByTypeData.length - 1];
    return [
      { name: 'Validade', value: latest.validity, color: '#ef4444' },
      { name: 'Quebra|Avaria', value: latest.breakage, color: '#f59e0b' },
      { name: 'Estabilidade', value: latest.stability, color: '#3b82f6' },
      { name: 'Outros', value: latest.others, color: '#94a3b8' },
    ].filter(i => i.value > 0);
  }, [lossByTypeData]);

  const hourlyDistribution = useMemo(() => {
    return [
      { time: '00:00 - 06:00', total: hourlyData.reduce((s, i) => s + i['00:00_AS_06:00'], 0) },
      { time: '06:01 - 12:00', total: hourlyData.reduce((s, i) => s + i['06:01_AS_12:00'], 0) },
      { time: '12:01 - 18:00', total: hourlyData.reduce((s, i) => s + i['12:01_AS_18:00'], 0) },
      { time: '18:01 - 23:59', total: hourlyData.reduce((s, i) => s + i['18:01_AS_23:59'], 0) },
    ];
  }, [hourlyData]);

  // --- UI COMPONENTS ---

  const TabButton = ({ id, label, icon }: { id: typeof activeTab, label: string, icon: React.ReactNode }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-all duration-200 ${
        activeTab === id 
          ? 'bg-violet-600 text-white shadow-lg shadow-violet-200' 
          : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-100'
      }`}
    >
      {icon}
      <span className="font-bold text-sm">{label}</span>
    </button>
  );

  const Dropzone = ({ label, type, description }: { label: string, type: keyof typeof filesLoaded, description: string }) => (
    <div className="relative group">
      <input 
        type="file" 
        multiple={type === 'losses'}
        onChange={(e) => {
          if (e.target.files) {
            Array.from(e.target.files).forEach(f => handleFileUpload(f, type));
          }
        }}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className={`p-6 rounded-2xl border-2 border-dashed transition-all duration-300 text-center ${
        filesLoaded[type] 
          ? 'bg-emerald-50 border-emerald-300' 
          : 'bg-slate-50 border-slate-200 group-hover:border-violet-300 group-hover:bg-violet-50'
      }`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${
          filesLoaded[type] ? 'bg-emerald-500' : 'bg-slate-200 group-hover:bg-violet-500'
        }`}>
          {filesLoaded[type] ? <CheckCircle className="text-white" /> : <Upload className={filesLoaded[type] ? 'text-white' : 'text-slate-500 group-hover:text-white'} />}
        </div>
        <h3 className="font-bold text-slate-800 text-sm mb-1">{label}</h3>
        <p className="text-slate-400 text-xs px-4">{filesLoaded[type] ? 'Arquivo carregado' : description}</p>
      </div>
    </div>
  );

  // --- RENDER ---

  const handleBulkUpload = useCallback(async (files: FileList) => {
    for (const file of Array.from(files)) {
      const name = file.name.toLowerCase();
      if (name.includes('acuradidade')) {
        await handleFileUpload(file, 'accuracy');
      } else if (name.includes('3012') || name.includes('saidas')) {
        await handleFileUpload(file, 'outflow');
      } else if (name.includes('3189') || name.includes('horario')) {
        await handleFileUpload(file, 'hourly');
      } else if (name.includes('perda')) {
        await handleFileUpload(file, 'losses');
      } else if (name.includes('diferenca') || name.includes('variancia')) {
        await handleFileUpload(file, 'variance');
      } else if (name.includes('data (1)') || (name.includes('accuracy') && name.includes('unit'))) {
        await handleFileUpload(file, 'unitAccuracy');
      }
    }
  }, [handleFileUpload]);

  const hasAnyData = Object.values(filesLoaded).some(Boolean);

  if (!hasAnyData) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-violet-100 text-violet-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BarChart2 size={32} />
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Indicadores Logísticos V2</h1>
          <p className="text-slate-500">Dashboard de performance operacional e financeira</p>
        </div>

        <div className="bg-white p-12 rounded-3xl border-2 border-dashed border-slate-200 hover:border-violet-300 hover:bg-violet-50/50 transition-all duration-300 relative group cursor-pointer text-center">
          <input 
            type="file" 
            multiple 
            onChange={(e) => e.target.files && handleBulkUpload(e.target.files)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="w-20 h-20 bg-violet-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-violet-200 group-hover:scale-110 transition-transform">
            <Upload size={32} />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Carregar Todos os Arquivos</h2>
          <p className="text-slate-400 mb-8">Arraste e solte todos os CSVs do zip aqui de uma vez</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
            {[
              { label: 'Acuracidade', key: 'accuracy' },
              { label: 'Movimentação', key: 'outflow' },
              { label: 'Perdas', key: 'losses' },
              { label: 'Horários', key: 'hourly' }
            ].map(item => (
              <div key={item.key} className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg border text-[10px] font-black uppercase tracking-tighter ${
                filesLoaded[item.key as keyof typeof filesLoaded] 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600' 
                  : 'bg-slate-50 border-slate-100 text-slate-400'
              }`}>
                {filesLoaded[item.key as keyof typeof filesLoaded] ? <CheckCircle size={12} /> : <div className="w-3 h-3 rounded-full border border-slate-300" />}
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Indicadores Logísticos V2</h1>
          <p className="text-slate-500 text-sm">Monitoramento de eficiência e controle de perdas</p>
        </div>
        
        <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0">
          <TabButton id="geral" label="Visão Geral" icon={<Activity size={18} />} />
          <TabButton id="acuracidade" label="Qualidade" icon={<Target size={18} />} />
          <TabButton id="inventario" label="Inventário" icon={<Package size={18} />} />
          <TabButton id="perdas" label="Perdas" icon={<TrendingDown size={18} />} />
          <TabButton id="horarios" label="Operação" icon={<Clock size={18} />} />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'geral' && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Scorecards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Acuracidade Atend.</span>
                  <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center">
                    <CheckCircle size={20} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">{kpis.accuracyV2.toFixed(1)}%</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{kpis.totalAtt.toLocaleString()} atendidos</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Acuracidade Inv.</span>
                  <div className="w-10 h-10 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center">
                    <Target size={20} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">{kpis.avgUnitAccuracy.toFixed(1)}%</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">Média entre unidades</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Divergência Total</span>
                  <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                    <Package size={20} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{fmtBRL(kpis.totalVariance)}</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">Valor absoluto (Insumo/Sobra)</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Taxa Devolução</span>
                  <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                    <TrendingDown size={20} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black text-slate-900">{kpis.returnRate.toFixed(2)}%</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">Impacto de logística reversa</p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">Perda Total</span>
                  <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center">
                    <AlertTriangle size={20} />
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-black text-slate-900">{fmtBRL(kpis.totalLoss)}</span>
                </div>
                <p className="text-slate-400 text-xs mt-1">Perda consolidada no ano</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Main Chart: Losses Trend */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800">Evolução de Perdas Financeiras</h3>
                  <TrendingDown className="text-rose-500" size={18} />
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyLossData}>
                    <defs>
                      <linearGradient id="colorLoss" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                    <Tooltip 
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      formatter={(v: number) => [fmtBRL(v), 'Perda']}
                    />
                    <Area type="monotone" dataKey="consolidated" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorLoss)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Hourly Intensity */}
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-slate-800">Intensidade Operacional por Horário</h3>
                  <Clock className="text-violet-500" size={18} />
                </div>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={hourlyDistribution}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="total" fill="#8b5cf6" radius={[6, 6, 0, 0]} barSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'inventario' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Divergência por Local de Estoque</h3>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={inventoryVarianceData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} tickFormatter={v => fmtBRL(v)} />
                    <YAxis dataKey="stockLocation" type="category" width={180} tick={{ fontSize: 9, fontWeight: 700 }} />
                    <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                    <Bar dataKey="varianceValue" radius={[0, 4, 4, 0]}>
                      {inventoryVarianceData.map((e, i) => (
                        <Cell key={i} fill={e.varianceValue < 0 ? '#f43f5e' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6">Acuracidade por Unidade / Estoque</h3>
                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {unitAccuracyData.sort((a, b) => a.percentage - b.percentage).map((item, idx) => (
                    <div key={idx} className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-bold text-slate-700">{item.stockLocation}</span>
                          <span className={`text-[10px] font-black ${item.percentage >= 98 ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {item.percentage.toFixed(2)}%
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-1000 ${
                              item.percentage >= 98 ? 'bg-emerald-500' : item.percentage >= 90 ? 'bg-amber-400' : 'bg-rose-500'
                            }`}
                            style={{ width: `${item.percentage}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Detailed Variance Table */}
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mt-6">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center justify-between">
                Detalhamento de Divergências por Estoque
                <div className="text-[10px] text-slate-400 font-normal">Baseado em Valor de Diferença por Produto</div>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 italic text-slate-400">
                      <th className="pb-3 pr-4 font-normal">Local de Estoque</th>
                      <th className="pb-3 pr-4 text-right font-normal">Divergência BRL</th>
                      <th className="pb-3 text-right font-normal">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryVarianceData.sort((a,b) => Math.abs(b.varianceValue) - Math.abs(a.varianceValue)).map((item, idx) => (
                      <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                        <td className="py-4 pr-4 font-bold text-slate-700">{item.stockLocation}</td>
                        <td className={`py-4 pr-4 text-right font-black ${item.varianceValue < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {fmtBRL(item.varianceValue)}
                        </td>
                        <td className="py-4 text-right">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                            Math.abs(item.varianceValue) < 1000 ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                          }`}>
                            {Math.abs(item.varianceValue) < 1000 ? 'CONTROLADO' : 'CRÍTICO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mt-6">
              <h3 className="font-bold text-slate-800 mb-6 flex items-center justify-between">
                Maiores Divergências por Produto
                <Package className="text-violet-500" size={18} />
              </h3>
              <div className="space-y-3">
                {productVarianceData.sort((a,b) => Math.abs(b.variance) - Math.abs(a.variance)).slice(0, 10).map((p, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-slate-300 w-4 tracking-tighter">#{i+1}</span>
                      <span className="text-sm font-bold text-slate-700 truncate max-w-[400px]">{p.product}</span>
                    </div>
                    <span className={`text-sm font-black ${p.variance < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {fmtBRL(p.variance)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'movimentacao' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <h3 className="font-bold text-slate-800 mb-6 font-black uppercase tracking-tight">Análise de Saídas vs Devoluções</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {Array.from(new Set(outflowData.map(d => d.species))).map((species, idx) => {
                  const speciesData = outflowData.filter(d => d.species === species);
                  const totalOut = speciesData.reduce((s, i) => s + i.outflowQty, 0);
                  const totalRet = speciesData.reduce((s, i) => s + i.returnQty, 0);
                  const retRate = totalOut > 0 ? (totalRet / totalOut) * 100 : 0;
                  
                  return (
                    <div key={idx} className="p-5 rounded-2xl border border-slate-50 bg-slate-50/30 group">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-black text-slate-700 uppercase tracking-tighter text-sm">{species}</h4>
                          <p className="text-[10px] text-slate-400 font-bold">{speciesData.length} ITENS ÚNICOS</p>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-black ${retRate > 5 ? 'text-orange-500' : 'text-emerald-500'}`}>
                            {retRate.toFixed(2)}%
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">Taxa Reversa</div>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-[10px] font-black text-slate-400 mb-1">
                            <span>TOTAL SAÍDAS</span>
                            <span className="text-slate-600">{totalOut.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div className="bg-blue-500 h-full rounded-full" style={{ width: '100%' }} />
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-black text-slate-400 mb-1">
                            <span>TOTAL DEVOLUÇÕES</span>
                            <span className="text-slate-600">{totalRet.toLocaleString()}</span>
                          </div>
                          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${retRate > 5 ? 'bg-orange-400' : 'bg-emerald-400'}`} 
                              style={{ width: `${Math.min(100, (totalRet/totalOut)*100)}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'perdas' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="font-bold text-slate-800 mb-6">Motivo das Perdas</h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={lossReasonData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5}>
                    {lossReasonData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtBRL(v)} contentStyle={{ borderRadius: '12px', border: 'none' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <h3 className="font-bold text-slate-800 mb-6">Top Perdas por Produto</h3>
              <div className="space-y-4">
                {productLossData.slice(0, 8).map((p, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex justify-between mb-1">
                        <span className="text-sm font-bold text-slate-700 truncate max-w-[300px]">{p.product}</span>
                        <span className="text-sm font-black text-rose-500">{fmtBRL(p.loss)}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div 
                          className="bg-rose-400 h-full rounded-full" 
                          style={{ width: `${(p.loss / productLossData[0].loss) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'acuracidade' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <h3 className="font-bold text-slate-800 mb-6">Eficiência por Tipo de Solicitação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accuracyData.map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-slate-50 bg-slate-50/50">
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-xs font-black text-slate-500 uppercase tracking-tighter">{item.type}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.reached >= 90 ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {item.reached}%
                    </span>
                  </div>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-2xl font-black text-slate-800">{item.attended}</p>
                      <p className="text-[10px] text-slate-400">Atendidos</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-600">{item.requested}</p>
                      <p className="text-[10px] text-slate-400">Solicitados</p>
                    </div>
                  </div>
                  <div className="mt-3 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${item.reached >= 90 ? 'bg-emerald-500' : 'bg-orange-500'}`}
                      style={{ width: `${item.reached}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
