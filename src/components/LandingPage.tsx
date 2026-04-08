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
          <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-transparent to-transparent z-10 bottom-0 h-32 top-auto" />
          <div className="rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-100/50 overflow-hidden">
            <div className="h-8 bg-gradient-to-r from-emerald-50 to-violet-50 border-b border-violet-100 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-amber-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="ml-3 text-xs text-slate-400 font-mono">farmaia — painel principal</span>
            </div>
            <div className="p-3 bg-slate-50 aspect-[16/9] flex items-center justify-center relative overflow-hidden">
              <div
                className="absolute inset-0 opacity-20"
                style={{ backgroundImage: 'radial-gradient(#a78bfa 1px, transparent 1px)', backgroundSize: '20px 20px' }}
              />
              <div className="grid grid-cols-3 gap-3 w-full h-full p-3 z-10">
                <div className="col-span-2 bg-white rounded-xl shadow-sm border border-violet-100 p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-5 rounded bg-violet-200" />
                    <div className="h-4 w-1/3 bg-violet-100 rounded-md" />
                  </div>
                  <div className="flex-1 bg-gradient-to-br from-emerald-50 to-violet-50 rounded-lg border border-violet-100 p-3 flex flex-col justify-end gap-1">
                    <div className="flex items-end gap-1 h-16">
                      {[40, 65, 45, 80, 55, 70, 90, 60, 75, 85].map((h, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-t"
                          style={{
                            height: `${h}%`,
                            background: i % 2 === 0
                              ? 'linear-gradient(to top, #10b981, #34d399)'
                              : 'linear-gradient(to top, #7c3aed, #a78bfa)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="col-span-1 flex flex-col gap-3">
                  <div className="bg-gradient-to-br from-emerald-50 to-violet-50 rounded-xl border border-violet-100 p-3 flex flex-col gap-2">
                    <div className="h-3 w-1/2 bg-violet-200 rounded" />
                    <div className="h-8 w-3/4 bg-emerald-100 rounded-md" />
                    <div className="h-2 w-full bg-violet-100 rounded-full">
                      <div className="h-2 w-3/4 bg-emerald-400 rounded-full" />
                    </div>
                  </div>
                  <div className="bg-white rounded-xl shadow-sm border border-violet-100 p-3 flex flex-col gap-2 flex-1">
                    <div className="h-3 w-2/3 bg-slate-100 rounded" />
                    {[1, 2, 3].map(i => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        <div className="h-2 flex-1 bg-slate-100 rounded" />
                      </div>
                    ))}
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
