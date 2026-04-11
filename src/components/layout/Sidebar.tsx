import React, { useState, useEffect } from 'react';
import { Menu, X, Pill, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type TabId =
  | 'analytics'
  | 'transfer'
  | 'vba'
  | 'dispensary'
  | 'genesis'
  | 'previsibilidade'
  | 'equivalencia'
  | 'dispensaryProject'
  | 'pedido24h'
  | 'rastreio'
  | 'productivity'
  | 'painel_caf'
  | 'indicadores_caf'
  | 'conciliacao'
  | 'analise_dispensacao'
  | 'analise_dispensacao_v2'
  | 'inteligencia_devolucoes'
  | 'criticidade'
  | 'checagem_devolucao'
  | 'analise_dispensarios_v2'
  | 'rastreio_falta'
  | 'requisicao_v2'
  | 'cancelamento_v2'
  | 'previsibilidade_v2'
  | 'painel_caf_v2'
  | 'indicadores_logisticos'
  | 'gerador_documentos'
  | 'avaliacao_fornecedores'
  | 'ressuprimento'
  | 'supply'
  | 'multidose'
  | 'baixas_estoque'
  | 'perdas_inventario'
  | 'analise_operacional'
  | 'remanejamento'
  | 'indicadores_logisticos_v2'
  | 'daily_tracking'
  | 'painel_tv_ressuprimento'
  | 'painel_nutricao'
  | 'abastecimento-farmaceutico';

export interface NavItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  classes: {
    activeBg: string;
    activeText: string;
    activeBorder: string;
    iconActive: string;
    badgeBg: string;
    badgeText: string;
  };
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: readonly NavItem[];
}

interface SidebarProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  navGroups: NavGroup[];
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  activeTab,
  setActiveTab,
  navGroups,
  isCollapsed,
  setIsCollapsed,
}) => {
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = navGroups.find(g => g.items.some(i => i.id === activeTab));
    return new Set(initial ? [initial.id] : navGroups[0] ? [navGroups[0].id] : []);
  });

  useEffect(() => {
    const group = navGroups.find(g => g.items.some(i => i.id === activeTab));
    if (group) {
      setOpenGroups(prev => new Set([...prev, group.id]));
    }
  }, [activeTab, navGroups]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // ── COLLAPSED (mini) sidebar ──────────────────────────────────────────────
  if (isCollapsed) {
    return (
      <>
        <AnimatePresence>
          {isSidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
            />
          )}
        </AnimatePresence>

        <aside
          className={`
            fixed md:sticky top-0 left-0 h-screen bg-white border-r border-violet-100 z-50
            w-16 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out shadow-xl shadow-violet-100/50 md:shadow-none
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          {/* Mini header */}
          <div className="p-3 border-b border-violet-100 hidden md:flex flex-col items-center gap-3 bg-gradient-to-br from-emerald-50 to-violet-50">
            <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-2 rounded-xl shadow-md shadow-violet-200">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <button
              onClick={() => setIsCollapsed(false)}
              title="Expandir menu"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-violet-500 hover:bg-violet-100 transition-colors"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>

          {/* Flat icon list */}
          <div className="flex-1 overflow-y-auto py-3 px-1.5 custom-scrollbar">
            <div className="space-y-0.5">
              {navGroups.flatMap(g => g.items).map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsSidebarOpen(false);
                    }}
                    title={item.label}
                    className={`
                      w-full flex justify-center items-center p-2.5 rounded-xl transition-all
                      ${isActive
                        ? `${item.classes.activeBg} ${item.classes.iconActive} shadow-sm border ${item.classes.activeBorder}`
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50 border border-transparent'
                      }
                    `}
                  >
                    <div className={isActive ? item.classes.iconActive : ''}>
                      {item.icon}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Mini footer */}
          <div className="p-2 border-t border-violet-100 flex justify-center">
            <div className="w-2 h-2 rounded-full bg-emerald-400" title="Sistema Atualizado" />
          </div>
        </aside>
      </>
    );
  }

  // ── EXPANDED sidebar (default) ────────────────────────────────────────────
  return (
    <>
      {/* Sidebar Overlay (Mobile) */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`
          fixed md:sticky top-0 left-0 h-screen bg-white border-r border-violet-100 z-50
          w-72 flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out shadow-xl shadow-violet-100/50 md:shadow-none
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-4 border-b border-violet-100 hidden md:flex items-center justify-between bg-gradient-to-br from-emerald-50 to-violet-50">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-2.5 rounded-xl shadow-md shadow-violet-200">
              <Pill className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent leading-tight">FarmaIA</h1>
              <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mt-1">Sistema Farmacêutico</p>
            </div>
          </div>
          <button
            onClick={() => setIsCollapsed(true)}
            title="Recolher menu"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-violet-400 hover:text-violet-600 hover:bg-violet-100 transition-colors"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 custom-scrollbar">
          <div className="space-y-1">
            {navGroups.map(group => {
              const isOpen = openGroups.has(group.id);
              const hasActive = group.items.some(i => i.id === activeTab);

              return (
                <div key={group.id}>
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className={`
                      w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all
                      ${hasActive
                        ? 'text-violet-700 bg-violet-50'
                        : isOpen
                          ? 'text-slate-600 bg-slate-50'
                          : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                      }
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className={hasActive ? 'text-violet-500' : 'text-slate-400'}>
                        {group.icon}
                      </span>
                      <span>{group.label}</span>
                    </div>
                    <ChevronRight
                      className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                    />
                  </button>

                  {/* Group items */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="pl-2 pt-0.5 pb-1 space-y-0.5">
                          {group.items.map(item => {
                            const isActive = activeTab === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  setActiveTab(item.id);
                                  setIsSidebarOpen(false);
                                }}
                                className={`
                                  w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all group relative overflow-hidden
                                  ${isActive
                                    ? `${item.classes.activeBg} ${item.classes.activeText} shadow-sm border ${item.classes.activeBorder}`
                                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50 border border-transparent'}
                                `}
                              >
                                <div className="flex items-center gap-3 relative z-10">
                                  <div className={`
                                    transition-colors
                                    ${isActive ? item.classes.iconActive : 'text-slate-400 group-hover:text-slate-600'}
                                  `}>
                                    {item.icon}
                                  </div>
                                  {item.label}
                                </div>

                                {isActive && (
                                  <motion.div
                                    layoutId="sidebar-active"
                                    className={`absolute inset-0 ${item.classes.activeBg} opacity-50 pointer-events-none`}
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  />
                                )}

                                <div className="flex items-center gap-2 relative z-10">
                                  {item.badge !== undefined && item.badge > 0 ? (
                                    <span className={`
                                      px-2 py-0.5 rounded-full text-[10px] font-bold
                                      ${isActive ? `${item.classes.badgeBg} ${item.classes.badgeText}` : 'bg-slate-200 text-slate-600'}
                                    `}>
                                      {item.badge}
                                    </span>
                                  ) : null}
                                  {isActive && <ChevronRight className="w-4 h-4 opacity-50" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 border-t border-violet-100">
           <div className="bg-gradient-to-r from-emerald-50 to-violet-50 p-4 rounded-2xl border border-violet-100 text-center">
             <p className="text-xs text-violet-600 font-medium">Sistema Atualizado</p>
             <p className="text-[10px] text-violet-400 mt-1">v2.0.0 • Hoje</p>
           </div>
        </div>
      </aside>
    </>
  );
};
