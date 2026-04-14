import React from 'react';
import { motion } from 'motion/react';
import {
  Pill,
  Activity,
  ShieldCheck,
  TrendingUp,
  ArrowRight,
  Database,
  BarChart2,
  Clock,
  Layers,
  ShoppingCart,
  Package,
  Ban,
  ClipboardList,
  Code,
  Zap,
  CheckCircle,
  ChevronRight,
  Wrench,
} from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

interface ModuleCardData {
  id: string;
  label: string;
  icon: React.ReactNode;
  tools: string[];
  colorScheme: 'emerald' | 'violet' | 'amber';
  description: string;
}

const MODULE_CARDS: ModuleCardData[] = [
  {
    id: 'analises',
    label: 'Análises & Indicadores',
    icon: <BarChart2 className="w-6 h-6" />,
    tools: [
      'Análise Dispensação',
      'Análise Dispensação V2',
      'Análise Dispensários',
      'Análise Dispensários V2',
      'Análise Operacional',
      'Indicadores CAF',
      'Indicadores Logísticos V2',
      'Insights do Farma',
    ],
    colorScheme: 'violet',
    description: 'Dashboards analíticos para todos os fluxos de dispensação e logística.',
  },
  {
    id: 'requisicao',
    label: 'Requisição & Supply',
    icon: <ShoppingCart className="w-6 h-6" />,
    tools: [
      'Requisição',
      'Requisição V2',
      'Ressuprimento',
      'Painel TV Ressup.',
      'Supply',
      'Painel CAF',
      'Painel CAF V2',
      'Remanejamento',
    ],
    colorScheme: 'emerald',
    description: 'Gestão de pedidos, ressuprimento, CAF e remanejamento entre unidades.',
  },
  {
    id: 'rastreio',
    label: 'Rastreio & Cancelamento',
    icon: <Ban className="w-6 h-6" />,
    tools: [
      'Multidose',
      'Rastreio Cancelamento',
      'Rastreio de Falta',
      'Cancelamento V2',
      'Tracking Diário SV',
      'Previsibilidade',
      'Previsibilidade V2',
    ],
    colorScheme: 'violet',
    description: 'Acompanhamento em tempo real de cancelamentos, faltas e previsibilidade.',
  },
  {
    id: 'devolucoes',
    label: 'Devoluções',
    icon: <ClipboardList className="w-6 h-6" />,
    tools: ['Checagem e Devolução', 'Inteligência Devoluções'],
    colorScheme: 'violet',
    description: 'Fluxo inteligente de checagem e devolução de medicamentos.',
  },
  {
    id: 'estoque',
    label: 'Estoque',
    icon: <Package className="w-6 h-6" />,
    tools: ['Baixas Estoque', 'Criticidade', 'Equivalência', 'Painel Nutrição'],
    colorScheme: 'emerald',
    description: 'Visibilidade total do estoque: criticidade, validade e equivalências.',
  },
  {
    id: 'gestao',
    label: 'Gestão & Fornecedores',
    icon: <ShieldCheck className="w-6 h-6" />,
    tools: ['Avaliação Fornecedores', 'Conciliação Empréstimo'],
    colorScheme: 'violet',
    description: 'Avaliação de fornecedores e controle de empréstimos inter-hospitalares.',
  },
  {
    id: 'ferramentas',
    label: 'Ferramentas',
    icon: <Code className="w-6 h-6" />,
    tools: ['Gerador de Documentos', 'Macro VBA'],
    colorScheme: 'amber',
    description: 'Utilitários para automação, geração de documentos e macros.',
  },
];

const METRICS = [
  { value: '7', label: 'módulos integrados', icon: <Layers className="w-5 h-5" /> },
  { value: '33+', label: 'ferramentas especializadas', icon: <Wrench className="w-5 h-5" /> },
  { value: 'Claude', label: 'Anthropic AI nativo', icon: <Zap className="w-5 h-5" /> },
  { value: '24/7', label: 'monitoramento contínuo', icon: <Clock className="w-5 h-5" /> },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: 'easeOut' } },
};

function getCardColors(scheme: ModuleCardData['colorScheme']) {
  if (scheme === 'violet') {
    return {
      bg: 'bg-gradient-to-br from-violet-50 to-slate-50',
      border: 'border-violet-100',
      iconBg: 'bg-violet-100',
      iconText: 'text-violet-600',
      badge: 'bg-violet-100 text-violet-700',
      bullet: 'text-violet-400',
    };
  }
  if (scheme === 'amber') {
    return {
      bg: 'bg-gradient-to-br from-amber-50 to-slate-50',
      border: 'border-amber-100',
      iconBg: 'bg-amber-100',
      iconText: 'text-amber-600',
      badge: 'bg-amber-100 text-amber-700',
      bullet: 'text-amber-400',
    };
  }
  return {
    bg: 'bg-gradient-to-br from-emerald-50 to-slate-50',
    border: 'border-emerald-100',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    bullet: 'text-emerald-400',
  };
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
  const scrollToModules = () => {
    document.getElementById('modules')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md border-b border-violet-100 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-2 rounded-lg shadow-sm shadow-violet-200">
                <Pill className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent">
                FarmaIA
              </span>
              <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full ml-1">
                BETA 0.1V
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full ml-1">
                <Layers className="w-3 h-3" />
                33+ ferramentas
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={scrollToModules}
                className="hidden sm:block text-sm font-medium text-slate-500 hover:text-violet-600 transition-colors"
              >
                Ver Módulos
              </button>
              <button
                onClick={onEnter}
                className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors"
              >
                Entrar no Sistema
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-violet-50 border border-violet-100 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-violet-700">
                Powered by Anthropic Claude • Sistema ativo e em evolução
              </span>
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 leading-tight">
              FarmaIA —{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-violet-600">
                Inteligência Operacional
              </span>
              <br className="hidden sm:block" />
              para Farmácia Hospitalar
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed">
              7 módulos integrados. 33+ ferramentas especializadas. Análise preditiva com IA.
              <br className="hidden sm:block" />
              Tudo o que a farmácia hospitalar moderna precisa em uma única plataforma.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onEnter}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-violet-600 hover:from-emerald-600 hover:to-violet-700 text-white rounded-xl font-semibold text-lg transition-all shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2 group"
              >
                Acessar o Sistema
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={scrollToModules}
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2"
              >
                <Layers className="w-5 h-5" />
                Ver os 7 Módulos
              </button>
            </div>
          </motion.div>
        </div>

        {/* Metrics Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mt-16 bg-white border border-violet-100 rounded-2xl shadow-sm shadow-violet-50 overflow-hidden"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-violet-100">
            {METRICS.map((m, i) => (
              <motion.div
                key={m.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.08 }}
                className="flex flex-col items-center justify-center py-8 px-4 gap-2 text-center"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-50 to-violet-50 border border-violet-100 flex items-center justify-center text-violet-500">
                  {m.icon}
                </div>
                <span className="text-3xl font-extrabold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent">
                  {m.value}
                </span>
                <span className="text-sm text-slate-500">{m.label}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Dashboard Preview Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-12 relative mx-auto max-w-5xl"
        >
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Painel Operacional ao Vivo
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-slate-50 via-slate-50/60 to-transparent z-10 pointer-events-none" />
          <div className="rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-100/50 overflow-hidden">
            {/* Browser Chrome */}
            <div className="h-8 bg-gradient-to-r from-emerald-50 to-violet-50 border-b border-violet-100 flex items-center px-4 gap-2 flex-shrink-0">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-slate-400 font-mono">farmaia — painel principal</span>
              <div className="ml-4 flex-1 max-w-xs h-4 bg-white/70 border border-violet-100 rounded-full flex items-center px-2 gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-[9px] text-slate-400 font-mono truncate">app.farmaia.com.br/painel</span>
              </div>
            </div>
            {/* Dashboard Shell */}
            <div className="aspect-[16/9] flex overflow-hidden bg-slate-100">
              {/* Sidebar */}
              <div className="w-14 bg-gradient-to-b from-slate-800 to-violet-950 flex flex-col items-center py-2 gap-1 flex-shrink-0">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-violet-600 flex items-center justify-center mb-2">
                  <Pill className="w-4 h-4 text-white" />
                </div>
                {[
                  { icon: <BarChart2 className="w-3.5 h-3.5" />, label: 'Painel', active: true },
                  { icon: <Package className="w-3.5 h-3.5" />, label: 'Estoque', active: false },
                  { icon: <Activity className="w-3.5 h-3.5" />, label: 'Alertas', active: false },
                  { icon: <ShoppingCart className="w-3.5 h-3.5" />, label: 'Pedidos', active: false },
                  { icon: <Zap className="w-3.5 h-3.5" />, label: 'IA', active: false },
                ].map((item) => (
                  <div
                    key={item.label}
                    className={`w-10 rounded-lg flex flex-col items-center py-1.5 gap-0.5 cursor-default ${
                      item.active ? 'bg-violet-600 text-white' : 'text-slate-400'
                    }`}
                  >
                    {item.icon}
                    <span className="text-[7px] font-medium leading-none">{item.label}</span>
                  </div>
                ))}
              </div>
              {/* Main Content */}
              <div className="flex-1 flex flex-col p-2.5 gap-2 overflow-hidden bg-slate-50 min-w-0">
                <div className="flex items-center justify-between flex-shrink-0">
                  <div>
                    <p className="text-[10px] font-bold text-slate-800 leading-none">Painel Operacional</p>
                    <p className="text-[8px] text-slate-400 mt-0.5">Atualizado agora • Segunda-feira, 13 Abr 2026</p>
                  </div>
                  <div className="h-5 px-2 bg-emerald-500 rounded-md flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                    <span className="text-[8px] text-white font-semibold">AO VIVO</span>
                  </div>
                </div>
                {/* KPI Row */}
                <div className="grid grid-cols-3 gap-1.5 flex-shrink-0">
                  {[
                    { label: 'Itens Ativos', value: '1.247', sub: '+12 hoje', color: 'emerald', icon: <Package className="w-3 h-3" /> },
                    { label: 'Disponibilidade', value: '98,2%', sub: 'Meta: 95%', color: 'violet', icon: <ShieldCheck className="w-3 h-3" /> },
                    { label: 'Alertas Críticos', value: '47', sub: '8 novos', color: 'red', icon: <Activity className="w-3 h-3" /> },
                  ].map((kpi) => (
                    <div key={kpi.label} className="bg-white rounded-lg border border-violet-100 p-2 flex flex-col gap-1 shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-[8px] font-medium text-slate-500 uppercase tracking-wide">{kpi.label}</span>
                        <div className={`w-4 h-4 rounded flex items-center justify-center ${kpi.color === 'emerald' ? 'bg-emerald-100 text-emerald-600' : kpi.color === 'violet' ? 'bg-violet-100 text-violet-600' : 'bg-red-100 text-red-500'}`}>
                          {kpi.icon}
                        </div>
                      </div>
                      <p className={`text-sm font-extrabold leading-none ${kpi.color === 'emerald' ? 'text-emerald-600' : kpi.color === 'violet' ? 'text-violet-700' : 'text-red-500'}`}>{kpi.value}</p>
                      <p className="text-[8px] text-slate-400">{kpi.sub}</p>
                    </div>
                  ))}
                </div>
                {/* Bar Chart */}
                <div className="bg-white rounded-lg border border-violet-100 p-2 shadow-sm flex-shrink-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[9px] font-bold text-slate-700">Dispensações por Dia</span>
                    <span className="text-[8px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">Esta semana</span>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex flex-col justify-between items-end pb-4" style={{ width: 18 }}>
                      {['300', '200', '100', '0'].map((l) => (
                        <span key={l} className="text-[7px] text-slate-300 leading-none">{l}</span>
                      ))}
                    </div>
                    <div className="flex-1 flex flex-col gap-0">
                      <div className="flex items-end gap-1" style={{ height: 44 }}>
                        {[
                          { day: 'Seg', pct: 72, val: '214', color: 'emerald' },
                          { day: 'Ter', pct: 88, val: '264', color: 'violet' },
                          { day: 'Qua', pct: 65, val: '195', color: 'emerald' },
                          { day: 'Qui', pct: 95, val: '285', color: 'violet' },
                          { day: 'Sex', pct: 80, val: '241', color: 'emerald' },
                          { day: 'Sáb', pct: 40, val: '118', color: 'violet' },
                          { day: 'Dom', pct: 28, val: '83', color: 'violet' },
                        ].map((bar) => (
                          <div key={bar.day} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
                            <span className="text-[6px] text-slate-400 leading-none">{bar.val}</span>
                            <div className="w-full rounded-t" style={{ height: `${bar.pct}%`, background: bar.color === 'emerald' ? 'linear-gradient(to top, #10b981, #34d399)' : 'linear-gradient(to top, #7c3aed, #a78bfa)' }} />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-100">
                        {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
                          <div key={d} className="flex-1 text-center">
                            <span className="text-[7px] text-slate-400">{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                {/* Mini Table */}
                <div className="bg-white rounded-lg border border-violet-100 shadow-sm overflow-hidden flex-shrink-0">
                  <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-100">
                    <span className="text-[9px] font-bold text-slate-700">Itens em Atenção</span>
                    <span className="text-[7px] text-violet-600 font-semibold">Ver todos →</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {[
                      { nome: 'Dipirona 500mg EV', qtd: '18 un', status: 'Crítico', statusColor: 'red' },
                      { nome: 'Amoxicilina 250mg', qtd: '124 un', status: 'Normal', statusColor: 'emerald' },
                      { nome: 'Insulina NPH 100UI', qtd: '7 frascos', status: 'Baixo', statusColor: 'amber' },
                    ].map((row) => (
                      <div key={row.nome} className="flex items-center gap-2 px-2 py-1">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${row.statusColor === 'red' ? 'bg-red-400' : row.statusColor === 'amber' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                        <span className="text-[8px] font-medium text-slate-700 flex-1 truncate">{row.nome}</span>
                        <span className="text-[8px] text-slate-400">{row.qtd}</span>
                        <span className={`text-[7px] font-semibold px-1 py-0.5 rounded-full ${row.statusColor === 'red' ? 'bg-red-100 text-red-600' : row.statusColor === 'amber' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{row.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Right Panel */}
              <div className="w-36 flex flex-col gap-2 p-2 bg-white border-l border-violet-100 flex-shrink-0">
                <div className="bg-gradient-to-br from-emerald-50 to-violet-50 rounded-lg border border-violet-100 p-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-wide">Nível de Estoque</span>
                    <TrendingUp className="w-3 h-3 text-emerald-500" />
                  </div>
                  <p className="text-lg font-extrabold text-emerald-600 leading-none">82,4%</p>
                  <p className="text-[8px] text-slate-500">Capacidade utilizada</p>
                  <div className="h-1.5 w-full bg-violet-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-violet-500" style={{ width: '82%' }} />
                  </div>
                  <p className="text-[7px] text-emerald-600 font-medium">↑ +3,1% vs semana anterior</p>
                </div>
                <div className="bg-white rounded-lg border border-violet-100 flex flex-col gap-1 flex-1">
                  <div className="px-2 pt-2 pb-1 border-b border-slate-100">
                    <span className="text-[8px] font-bold text-slate-700">Alertas Recentes</span>
                  </div>
                  <div className="flex flex-col gap-1 px-2 py-1">
                    {[
                      { msg: 'Dipirona abaixo do mínimo', type: 'red' },
                      { msg: 'Pedido #4821 aprovado', type: 'emerald' },
                      { msg: 'Vencimento em 3 dias: Heparina', type: 'amber' },
                      { msg: 'IA: Sugestão de ressuprimento', type: 'violet' },
                    ].map((alert, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <div className={`w-1 h-1 rounded-full flex-shrink-0 mt-0.5 ${alert.type === 'red' ? 'bg-red-400' : alert.type === 'amber' ? 'bg-amber-400' : alert.type === 'violet' ? 'bg-violet-400' : 'bg-emerald-400'}`} />
                        <span className="text-[8px] text-slate-600 leading-tight">{alert.msg}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="bg-gradient-to-br from-violet-600 to-violet-800 rounded-lg p-2 flex flex-col gap-1">
                  <div className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-violet-200" />
                    <span className="text-[8px] font-bold text-white">IA Ativa</span>
                    <div className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse ml-auto" />
                  </div>
                  <p className="text-[8px] text-violet-200 leading-tight">3 análises em execução</p>
                  <div className="h-1 w-full bg-violet-900/50 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-400 to-violet-300 rounded-full" style={{ width: '65%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Modules Showcase */}
      <section id="modules" className="py-24 bg-white border-t border-violet-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block text-xs font-bold tracking-widest uppercase text-violet-500 mb-3">
              Plataforma Completa
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              7 Módulos.{' '}
              <span className="bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent">
                33+ Ferramentas.
              </span>
            </h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Cada módulo foi construído para um domínio operacional específico da farmácia hospitalar,
              integrado em uma única plataforma coesa.
            </p>
          </div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {MODULE_CARDS.map((card) => {
              const colors = getCardColors(card.colorScheme);
              return (
                <motion.div
                  key={card.id}
                  variants={cardVariants}
                  whileHover={{ y: -4, transition: { type: 'spring', stiffness: 300, damping: 20 } }}
                  className={`${colors.bg} ${colors.border} border rounded-2xl p-6 flex flex-col gap-4 cursor-default`}
                >
                  {/* Icon + Title */}
                  <div className="flex items-start gap-3">
                    <div className={`w-11 h-11 ${colors.iconBg} ${colors.iconText} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      {card.icon}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 leading-snug">{card.label}</h3>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{card.description}</p>
                    </div>
                  </div>

                  {/* Tool list */}
                  <ul className="flex flex-col gap-1.5 flex-1">
                    {card.tools.map((tool) => (
                      <li key={tool} className="flex items-center gap-1.5">
                        <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${colors.bullet}`} />
                        <span className="text-sm text-slate-600">{tool}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Badge count */}
                  <div className="pt-2 border-t border-white/60">
                    <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${colors.badge}`}>
                      {card.tools.length} {card.tools.length === 1 ? 'ferramenta' : 'ferramentas'}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* AI Highlight Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-16 items-center">

            {/* Left col */}
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            >
              <div className="inline-flex items-center gap-2 bg-violet-900/60 border border-violet-500/30 rounded-full px-4 py-1.5 mb-6">
                <Zap className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium text-violet-300">Anthropic Claude</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-6 leading-tight">
                Inteligência Artificial nativa,{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-violet-400">
                  não um add-on
                </span>
              </h2>
              <p className="text-slate-400 mb-8 leading-relaxed text-lg">
                O FarmaIA integra o Claude da Anthropic diretamente nos fluxos operacionais.
                Análise de linguagem natural dos dados farmacêuticos, geração automática de
                documentos e insights preditivos — tudo sem sair do sistema.
              </p>
              <ul className="flex flex-col gap-4">
                {[
                  'Geração de documentos com IA (Gerador de Documentos)',
                  'Interpretação de padrões de consumo e cancelamento',
                  'Alertas inteligentes baseados em contexto clínico',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <span className="text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Right col — Claude mockup */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
              className="relative"
            >
              <div className="absolute -inset-4 bg-violet-600/10 rounded-3xl blur-2xl" />
              <div className="relative bg-slate-800/60 border border-violet-500/30 rounded-2xl p-6 backdrop-blur-sm">
                {/* Header */}
                <div className="flex items-center gap-3 mb-5 pb-4 border-b border-violet-500/20">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-violet-600 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">FarmaIA · IA Analítica</p>
                    <p className="text-xs text-violet-400">Powered by Claude</p>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs text-emerald-400">ao vivo</span>
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-4 mb-6">
                  <div className="bg-slate-700/50 rounded-xl p-4 text-sm text-slate-300 leading-relaxed border border-violet-500/10">
                    Detectei aumento de{' '}
                    <span className="text-emerald-400 font-semibold">23%</span> no cancelamento do
                    Dispensário A1 nas últimas{' '}
                    <span className="text-violet-300 font-semibold">72h</span>. Recomendo revisar o
                    fluxo de requisição e verificar estoque crítico para os itens mais afetados.
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs text-slate-500 uppercase tracking-wider">Itens críticos identificados</p>
                    {[
                      { name: 'Dipirona 500mg', level: 85, color: 'bg-red-400' },
                      { name: 'Omeprazol 20mg', level: 60, color: 'bg-amber-400' },
                      { name: 'Ceftriaxona 1g', level: 35, color: 'bg-emerald-400' },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-32 truncate">{item.name}</span>
                        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${item.color} rounded-full`}
                            style={{ width: `${item.level}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-8 text-right">{item.level}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={onEnter}
                    className="flex-1 py-2 text-sm font-medium bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors"
                  >
                    Ver Análise
                  </button>
                  <button
                    onClick={onEnter}
                    className="flex-1 py-2 text-sm font-medium bg-violet-500/20 hover:bg-violet-500/30 text-violet-300 border border-violet-500/30 rounded-lg transition-colors"
                  >
                    Gerar Relatório
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white border-t border-violet-900/30">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-6 leading-tight">
              Pronto para ver seus dados farmacêuticos{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-violet-400">
                de outro ângulo?
              </span>
            </h2>
            <p className="text-slate-400 mb-10 text-lg">
              Acesse agora o ambiente BETA. 7 módulos disponíveis, sem configuração — entre e explore.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <button
                onClick={onEnter}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-violet-600 hover:from-emerald-400 hover:to-violet-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-violet-500/30 flex items-center justify-center gap-2 group"
              >
                Acessar FarmaIA Agora
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={scrollToModules}
                className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl font-semibold text-lg transition-all"
              >
                Ver todos os módulos ↑
              </button>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-slate-500 text-sm">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                <span>Dados seguros</span>
              </div>
              <div className="w-px h-4 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-violet-400" />
                <span>Sem instalação</span>
              </div>
              <div className="w-px h-4 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Atualização contínua</span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-violet-900/30 text-slate-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">

            {/* Col 1 — Brand */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-1.5 rounded-lg">
                  <Pill className="w-5 h-5 text-white" />
                </div>
                <span className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">
                  FarmaIA
                </span>
                <span className="text-xs font-semibold bg-violet-900/60 text-violet-400 px-2 py-0.5 rounded-full">
                  BETA
                </span>
              </div>
              <p className="text-slate-500 text-sm leading-relaxed">
                Inteligência operacional para farmácia hospitalar. Dados em tempo real, IA integrada e
                33+ ferramentas especializadas.
              </p>
            </div>

            {/* Col 2 — Módulos */}
            <div>
              <h4 className="text-slate-300 font-semibold mb-4">Módulos</h4>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
                {MODULE_CARDS.map((card) => (
                  <li key={card.id}>
                    <button
                      onClick={onEnter}
                      className="text-slate-500 hover:text-violet-400 transition-colors text-left text-sm"
                    >
                      {card.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Col 3 — Sistema */}
            <div>
              <h4 className="text-slate-300 font-semibold mb-4">Sistema</h4>
              <ul className="flex flex-col gap-2 text-slate-500 text-sm">
                <li className="flex items-center gap-2">
                  <span className="text-violet-500">v</span>
                  Versão BETA 0.1V
                </li>
                <li className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-violet-500" />
                  Powered by Anthropic Claude
                </li>
                <li className="flex items-center gap-2">
                  <Code className="w-3.5 h-3.5 text-emerald-500" />
                  React 19 + Tailwind CSS 4
                </li>
                <li className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  Em desenvolvimento ativo
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-violet-900/20 text-center text-slate-600 text-xs">
            © {new Date().getFullYear()} FarmaIA. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
};
