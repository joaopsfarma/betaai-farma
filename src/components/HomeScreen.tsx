import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Pill, Sparkles } from 'lucide-react';
import { NavGroup, TabId } from './layout/Sidebar';

interface HomeScreenProps {
  navGroups: NavGroup[];
  setActiveTab: (tab: TabId) => void;
  userEmail?: string;
}

const GROUP_STYLE: Record<string, {
  gradient: string;
  border: string;
  iconBg: string;
  iconText: string;
  badge: string;
  accent: string;
  dot: string;
}> = {
  analises:   { gradient: 'from-violet-50 to-white', border: 'border-violet-100', iconBg: 'bg-violet-100', iconText: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', accent: 'text-violet-500 group-hover:text-violet-700', dot: 'bg-violet-300' },
  requisicao: { gradient: 'from-emerald-50 to-white', border: 'border-emerald-100', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', accent: 'text-emerald-500 group-hover:text-emerald-700', dot: 'bg-emerald-300' },
  rastreio:   { gradient: 'from-violet-50 to-white', border: 'border-violet-100', iconBg: 'bg-violet-100', iconText: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', accent: 'text-violet-500 group-hover:text-violet-700', dot: 'bg-violet-300' },
  devolucoes: { gradient: 'from-amber-50 to-white', border: 'border-amber-100', iconBg: 'bg-amber-100', iconText: 'text-amber-600', badge: 'bg-amber-100 text-amber-700', accent: 'text-amber-500 group-hover:text-amber-700', dot: 'bg-amber-300' },
  estoque:    { gradient: 'from-emerald-50 to-white', border: 'border-emerald-100', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', accent: 'text-emerald-500 group-hover:text-emerald-700', dot: 'bg-emerald-300' },
  gestao:     { gradient: 'from-violet-50 to-white', border: 'border-violet-100', iconBg: 'bg-violet-100', iconText: 'text-violet-600', badge: 'bg-violet-100 text-violet-700', accent: 'text-violet-500 group-hover:text-violet-700', dot: 'bg-violet-300' },
  ferramentas:{ gradient: 'from-amber-50 to-white', border: 'border-amber-100', iconBg: 'bg-amber-100', iconText: 'text-amber-600', badge: 'bg-amber-100 text-amber-700', accent: 'text-amber-500 group-hover:text-amber-700', dot: 'bg-amber-300' },
};

const DEFAULT_STYLE = GROUP_STYLE.analises;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

function getFirstName(email?: string) {
  if (!email) return 'Usuário';
  const local = email.split('@')[0];
  const part = local.split(/[._-]/)[0];
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const card = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.38, ease: 'easeOut' } },
};

export const HomeScreen: React.FC<HomeScreenProps> = ({ navGroups, setActiveTab, userEmail }) => {
  const name = getFirstName(userEmail);
  const greeting = getGreeting();
  const totalTools = navGroups.reduce((s, g) => s + g.items.length, 0);

  return (
    <div className="max-w-6xl mx-auto pb-12">

      {/* Hero header */}
      <motion.div
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="mb-10"
      >
        <div className="bg-gradient-to-r from-emerald-500 to-violet-600 rounded-2xl p-6 sm:p-8 text-white shadow-lg shadow-violet-300/30 relative overflow-hidden">
          {/* Decorative blobs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/10" />
            <div className="absolute -bottom-12 -left-6 w-40 h-40 rounded-full bg-white/5" />
          </div>

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 backdrop-blur-sm p-3 rounded-xl border border-white/30">
                <Pill className="w-7 h-7 text-white" />
              </div>
              <div>
                <p className="text-white/70 text-sm font-medium">{greeting},</p>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{name}</h1>
                <p className="text-white/70 text-sm mt-0.5">Selecione um módulo para começar</p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:text-right">
              <div className="bg-white/15 rounded-xl px-4 py-2 border border-white/20 text-center">
                <p className="text-2xl font-bold">{navGroups.length}</p>
                <p className="text-white/70 text-xs">módulos</p>
              </div>
              <div className="bg-white/15 rounded-xl px-4 py-2 border border-white/20 text-center">
                <p className="text-2xl font-bold">{totalTools}</p>
                <p className="text-white/70 text-xs">ferramentas</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Section label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex items-center gap-2 mb-5"
      >
        <Sparkles className="w-4 h-4 text-violet-400" />
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Módulos disponíveis</span>
      </motion.div>

      {/* Module grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {navGroups.map((group) => {
          const style = GROUP_STYLE[group.id] ?? DEFAULT_STYLE;
          const firstTab = group.items[0]?.id;

          return (
            <motion.button
              key={group.id}
              variants={card}
              onClick={() => firstTab && setActiveTab(firstTab)}
              className={`group bg-gradient-to-br ${style.gradient} border ${style.border} rounded-2xl p-5 text-left transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 w-full`}
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${style.iconBg} ${style.iconText} flex items-center justify-center flex-shrink-0`}>
                  {group.icon}
                </div>
                <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${style.badge}`}>
                  {group.items.length} {group.items.length === 1 ? 'ferramenta' : 'ferramentas'}
                </span>
              </div>

              {/* Title */}
              <h3 className="font-semibold text-slate-900 mb-2 leading-snug">{group.label}</h3>

              {/* Tool list */}
              <ul className="space-y-1.5 mb-4">
                {group.items.slice(0, 4).map(item => (
                  <li key={item.id} className="flex items-center gap-2 text-xs text-slate-500">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                    {item.label}
                  </li>
                ))}
                {group.items.length > 4 && (
                  <li className="text-xs text-slate-400 pl-3.5">
                    +{group.items.length - 4} mais
                  </li>
                )}
              </ul>

              {/* CTA */}
              <div className={`flex items-center gap-1.5 text-xs font-semibold ${style.accent} transition-colors`}>
                Acessar módulo
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </div>
  );
};
