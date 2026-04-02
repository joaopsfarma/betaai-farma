/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { usePersistentState } from './hooks/usePersistentState';
import { MOCK_INVENTORY } from './mockData';
import { processInventory } from './logic';
import { InventoryTable } from './components/InventoryTable';
import { TransferRequest } from './components/TransferRequest';
import { VBACodeDisplay } from './components/VBACodeDisplay';
import { CsvUploader } from './components/CsvUploader';
import { ValidityUploader } from './components/ValidityUploader';
import { LayoutDashboard, FileSpreadsheet, Code, Pill, Database, Filter, AlertCircle, PieChart, Download, ListTodo, Activity, ClipboardList, Menu, X, ChevronRight, Clock, Ban, Package, LineChart, Calculator, BarChart2, ShieldAlert, AlertTriangle, ShoppingCart, XCircle, ShieldCheck, TrendingDown, MonitorPlay, ArrowLeftRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dashboard } from './components/Dashboard';
import { FollowUp } from './components/FollowUp';
import { FollowUpUploader } from './components/FollowUpUploader';
import { Product, UnitType, ProductCategory, AlertStatus, FollowUpItem } from './types';
import { MOCK_FOLLOW_UP } from './data/mockFollowUp';
import { DispensaryAnalysis } from './components/DispensaryAnalysis';
import { AnalysePendencies } from './components/AnalysePendencies';
import { DashboardPrevisibilidade, PredictabilityData } from './components/DashboardPrevisibilidade';
import { DashboardEquivalencia } from './components/DashboardEquivalencia';
import { DispensaryProject } from './components/DispensaryProject';
import Pedido24h from './components/Pedido24h';
import { DailyTracking } from './components/DailyTracking';
import { ConciliacaoEmprestimo } from './components/ConciliacaoEmprestimo';
import { DashboardRastreio } from './components/DashboardRastreio';
import { ProductivityTab } from './components/ProductivityTab';
import { PainelCAF } from './components/PainelCAF';
import { PainelCAFV2 } from './components/PainelCAFV2';
import { IndicadoresCAF } from './components/IndicadoresCAF';
import { AnaliseDispensacao } from './components/AnaliseDispensacao';
import { AnaliseDispensacaoV2 } from './components/AnaliseDispensacaoV2';
import { InteligenciaDevolucoes } from './components/InteligenciaDevolucoes';
import { Criticidade } from './components/Criticidade';
import { CheckagemDevolucao } from './components/CheckagemDevolucao';
import { AnaliseDispensariosV2 } from './components/AnaliseDispensariosV2';
import { RastreioFalta } from './components/RastreioFalta';
import { RequisicaoV2 } from './components/RequisicaoV2';
import { CancelamentoV2 } from './components/CancelamentoV2';
import { PrevisibilidadeV2 } from './components/PrevisibilidadeV2';
import { IndicadoresLogisticos } from './components/IndicadoresLogisticos';
import { IndicadoresLogisticosV2 } from './components/IndicadoresLogisticosV2';
import { GeradorDocumentos } from './components/GeradorDocumentos';
import { SupplierEvaluationCAF } from './components/SupplierEvaluationCAF';
import { Ressuprimento } from './components/Ressuprimento';
import { Remanejamento } from './components/Remanejamento';
import { PainelTVRessuprimento } from './components/PainelTVRessuprimento';
import { Supply } from './components/Supply';
import { Multidose } from './components/Multidose';
import { BaixasEstoque } from './components/BaixasEstoque';
import { AnaliseOperacional } from './components/AnaliseOperacional';
import { MobileHeader } from './components/layout/MobileHeader';
import { Sidebar, NavItem, TabId } from './components/layout/Sidebar';
import { exportInventoryToPDF } from './utils/pdfExport';
import { EQUIVALENCE_MAP } from './data/equivalenceMap';
import { DEFAULT_EQUIVALENCES } from './data/equivalences';
import { LandingPage } from './components/LandingPage';

function App() {
  const [showApp, setShowApp] = usePersistentState<boolean>('logistica_farma_show_app', false);
  const [activeTab, setActiveTab] = useState<TabId>('analise_dispensacao');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inventoryData, setInventoryData] = usePersistentState<Product[]>('logistica_farma_inventory', MOCK_INVENTORY);
  const [followUpData, setFollowUpData] = usePersistentState<FollowUpItem[]>('logistica_farma_followup', MOCK_FOLLOW_UP);
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'Todos'>('Todos');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatus | 'Todos'>('Todos');
  const [equivalenceMap, setEquivalenceMap] = usePersistentState<Record<string, string[]>>('logistica_farma_equivalence_map_v3', EQUIVALENCE_MAP);
  const [predictabilityData, setPredictabilityData] = usePersistentState<PredictabilityData[]>('logistica_farma_predictability_data', []);
  const [predictabilityFiles, setPredictabilityFiles] = usePersistentState<{demandas: boolean, itens: boolean, estoque: boolean}>('logistica_farma_predictability_files', {
    demandas: false,
    itens: false,
    estoque: false
  });

  // Garante que as equivalências do DEFAULT_EQUIVALENCES estejam sempre no mapa compartilhado
  React.useEffect(() => {
    setEquivalenceMap(prev => {
      const merged = { ...prev };
      let changed = false;
      DEFAULT_EQUIVALENCES.forEach(eq => {
        if (eq.suggestionId && eq.suggestionId.trim() !== '') {
          if (!merged[eq.id]) {
            merged[eq.id] = [eq.suggestionId];
            changed = true;
          } else if (!merged[eq.id].includes(eq.suggestionId)) {
            merged[eq.id] = [...merged[eq.id], eq.suggestionId];
            changed = true;
          }
        }
      });
      return changed ? merged : prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [predictabilityRawSource, setPredictabilityRawSource] = usePersistentState<any | null>('logistica_farma_predictability_raw_source', null);
  
  const processedData = useMemo(() => processInventory(inventoryData), [inventoryData]);
  
  // Filter out 501 for display, and filter by category and status
  const displayData = useMemo(() => {
    return processedData.filter(p => {
      const isNot501 = p.unit !== '501';
      const matchesCategory = selectedCategory === 'Todos' || p.category === selectedCategory;
      const matchesStatus = selectedStatus === 'Todos' || p.status === selectedStatus;
      return isNot501 && matchesCategory && matchesStatus;
    });
  }, [processedData, selectedCategory, selectedStatus]);

  const handleDataLoaded = (newData: Product[]) => {
    // Replace entire inventory with new data (since it contains units)
    setInventoryData(newData);
    // Don't switch tab immediately, let user import validity if they want
  };

  const handleValidityLoaded = (validityMap: Record<string, { date: string, batch: string }>) => {
    setInventoryData(prev => prev.map(item => {
      if (validityMap[item.id]) {
        return { 
          ...item, 
          expiryDate: validityMap[item.id].date,
          batch: validityMap[item.id].batch
        };
      }
      return item;
    }));
  };

  const handleFollowUpLoaded = (data: FollowUpItem[], isMerge: boolean = false) => {
    if (isMerge) {
      setFollowUpData(prev => {
        // Remove duplicates by ID natively
        const newIds = new Set(data.map(item => item.id));
        const filteredPrev = prev.filter(item => !newIds.has(item.id));
        return [...filteredPrev, ...data];
      });
    } else {
      setFollowUpData(data);
    }
  };

  const handleUpdateStock = (id: string, unit: string, newStock: number) => {
    setInventoryData(prev => prev.map(item => {
      if (item.id === id && item.unit === unit) {
        return { ...item, physicalStock: newStock };
      }
      return item;
    }));
  };

  const handleResetData = () => {
    setInventoryData(MOCK_INVENTORY);
  };

  const stats = {
    total: displayData.length,
    critical: displayData.filter(p => p.status === 'URGENTE!').length,
    warning: displayData.filter(p => p.status === 'VERIFICAR INVENTÁRIO').length,
    order: displayData.filter(p => p.status === 'PEDIR AO RECEBIMENTO').length,
    expiry: displayData.filter(p => p.status === 'REMANEJAR (VALIDADE)').length,
  };

  const exportToPDF = () => {
    exportInventoryToPDF(displayData, stats);
  };

  const G = { activeBg: 'bg-emerald-50', activeText: 'text-emerald-700', activeBorder: 'border-emerald-100', iconActive: 'text-emerald-600', badgeBg: 'bg-emerald-200', badgeText: 'text-emerald-800' };
  const V = { activeBg: 'bg-violet-50',  activeText: 'text-violet-700',  activeBorder: 'border-violet-100',  iconActive: 'text-violet-600',  badgeBg: 'bg-violet-200',  badgeText: 'text-violet-800'  };
  const A = { activeBg: 'bg-amber-50',   activeText: 'text-amber-700',   activeBorder: 'border-amber-100',   iconActive: 'text-amber-600',   badgeBg: 'bg-amber-200',   badgeText: 'text-amber-800'   };

  const navItems = [
    { id: 'analise_dispensacao',       label: 'Análise Dispensação',      icon: <BarChart2 className="w-5 h-5" />,      classes: V },
    { id: 'analise_dispensacao_v2',    label: 'Análise Dispensação V2',   icon: <BarChart2 className="w-5 h-5" />,      classes: G },
    { id: 'dispensary',                label: 'Análise Dispensários',     icon: <Activity className="w-5 h-5" />,       classes: G },
    { id: 'analise_dispensarios_v2',   label: 'Análise Dispensários V2',  icon: <Activity className="w-5 h-5" />,       classes: V },
    { id: 'analise_operacional',       label: 'Análise Operacional',       icon: <Activity className="w-5 h-5" />,       classes: A },
    { id: 'avaliacao_fornecedores',    label: 'Avaliação Fornec.',        icon: <ShieldCheck className="w-5 h-5" />,    classes: V },
    { id: 'baixas_estoque',            label: 'Baixas Estoque',            icon: <TrendingDown className="w-5 h-5" />,   classes: G },
    { id: 'cancelamento_v2',           label: 'Cancelamento V2',          icon: <XCircle className="w-5 h-5" />,        classes: G },
    { id: 'checagem_devolucao',        label: 'Checagem e Devolução',     icon: <ClipboardList className="w-5 h-5" />,  classes: V },
    { id: 'conciliacao',               label: 'Conciliação Empréstimo',   icon: <Calculator className="w-5 h-5" />,     classes: V },
    { id: 'criticidade',               label: 'Criticidade',              icon: <ShieldAlert className="w-5 h-5" />,    classes: G },
    { id: 'equivalencia',              label: 'Equivalência',             icon: <Database className="w-5 h-5" />,       classes: G },
    { id: 'gerador_documentos',        label: 'Gerador de Documentos',    icon: <FileSpreadsheet className="w-5 h-5" />, classes: G },
    { id: 'indicadores_caf',           label: 'Indicadores CAF',          icon: <LineChart className="w-5 h-5" />,      classes: V },
    { id: 'indicadores_logisticos_v2', label: 'Indicadores Logísticos V2',icon: <BarChart2 className="w-5 h-5" />,      classes: G },
    { id: 'analytics',                 label: 'Insights do Farma',        icon: <PieChart className="w-5 h-5" />,       classes: G },
    { id: 'inteligencia_devolucoes',   label: 'Inteligência Devoluções',  icon: <FileSpreadsheet className="w-5 h-5" />, classes: V },
    { id: 'vba',                       label: 'Macro VBA',                icon: <Code className="w-5 h-5" />,           classes: G },
    { id: 'multidose',                 label: 'Multidose',                 icon: <Activity className="w-5 h-5" />,       classes: V },
    { id: 'painel_caf',                label: 'Painel CAF',               icon: <Package className="w-5 h-5" />,        classes: V },
    { id: 'painel_caf_v2',             label: 'Painel CAF V2',            icon: <BarChart2 className="w-5 h-5" />,      classes: G },
    { id: 'pedido24h',                 label: 'Pedido 24h',               icon: <Clock className="w-5 h-5" />,          classes: G },
    { id: 'previsibilidade',           label: 'Previsibilidade',          icon: <AlertCircle className="w-5 h-5" />,    classes: V },
    { id: 'previsibilidade_v2',        label: 'Previsibilidade V2',       icon: <LineChart className="w-5 h-5" />,      classes: G },
    { id: 'rastreio',                  label: 'Rastreio Cancelamento',    icon: <Ban className="w-5 h-5" />,            classes: V },
    { id: 'rastreio_falta',            label: 'Rastreio de Falta',        icon: <AlertTriangle className="w-5 h-5" />,  classes: G },
    { id: 'transfer',                  label: 'Requisição',               icon: <FileSpreadsheet className="w-5 h-5" />, badge: stats.order, classes: G },
    { id: 'requisicao_v2',             label: 'Requisição V2',            icon: <ShoppingCart className="w-5 h-5" />,   classes: V },
    { id: 'remanejamento',              label: 'Remanejamento',             icon: <ArrowLeftRight className="w-5 h-5" />, classes: A },
    { id: 'ressuprimento',             label: 'Ressuprimento',             icon: <ShoppingCart className="w-5 h-5" />,   classes: V },
    { id: 'painel_tv_ressuprimento',   label: 'Painel TV Ressup.',         icon: <MonitorPlay className="w-5 h-5" />,    classes: V },
    { id: 'supply',                    label: 'Supply',                    icon: <Package className="w-5 h-5" />,        classes: G },
    { id: 'daily_tracking',            label: 'Tracking Diário SV',       icon: <Activity className="w-5 h-5" />,       classes: V },
  ] as const;

  if (!showApp) {
    return <LandingPage onEnter={() => setShowApp(true)} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col md:flex-row">
      <MobileHeader 
        isSidebarOpen={isSidebarOpen} 
        setIsSidebarOpen={setIsSidebarOpen} 
      />

      <Sidebar 
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        navItems={navItems}
      />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 md:py-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="w-full"
          >
        {activeTab === 'dispensaryProject' && (
          <div className="max-w-7xl mx-auto">
             <DispensaryProject />
          </div>
        )}

        {activeTab === 'pedido24h' && (
          <div className="max-w-7xl mx-auto">
             <Pedido24h />
          </div>
        )}

        {activeTab === 'daily_tracking' as TabId && (
          <div className="max-w-7xl mx-auto">
             <DailyTracking />
          </div>
        )}


        {activeTab === 'analytics' && (
          <div className="max-w-6xl mx-auto">
             <Dashboard data={displayData} />
          </div>
        )}

        {activeTab === 'dispensary' && (
          <div className="max-w-6xl mx-auto">
             <DispensaryAnalysis />
          </div>
        )}


        {activeTab === 'genesis' && (
          <div className="max-w-6xl mx-auto">
            <AnalysePendencies />
          </div>
        )}

        {activeTab === 'previsibilidade' && (
          <div className="max-w-6xl mx-auto">
            <DashboardPrevisibilidade 
              equivalenceMap={equivalenceMap} 
              setEquivalenceMap={setEquivalenceMap}
              data={predictabilityData}
              setData={setPredictabilityData}
              filesLoaded={predictabilityFiles}
              setFilesLoaded={setPredictabilityFiles}
              rawSource={predictabilityRawSource}
              setRawSource={setPredictabilityRawSource}
            />
          </div>
        )}

        {activeTab === 'equivalencia' && (
          <div className="max-w-6xl mx-auto">
            <DashboardEquivalencia Map={equivalenceMap} setMap={setEquivalenceMap} />
          </div>
        )}

        {activeTab === 'rastreio' && (
          <div className="w-full">
            <DashboardRastreio />
          </div>
        )}

        {activeTab === 'productivity' && (
          <div className="w-full">
            <ProductivityTab />
          </div>
        )}

        {activeTab === 'transfer' && (
          <div className="max-w-full mx-auto">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Requisição Interna de Transferência</h2>
              <p className="text-slate-500 text-sm">
                Geração automática de sugestão de pedido com base na cobertura de estoque e disponibilidade no estoque central (CSV).
                Utiliza a mesma lógica da Macro VBA (padrão 7 dias), com opção de ajuste.
              </p>
            </div>
            <TransferRequest />
          </div>
        )}

        {activeTab === 'painel_caf' && (
          <div className="max-w-full mx-auto">
            <PainelCAF />
          </div>
        )}

        {activeTab === 'painel_caf_v2' && (
          <div className="max-w-full mx-auto">
            <PainelCAFV2 />
          </div>
        )}

        {activeTab === 'indicadores_caf' && (
          <div className="max-w-full mx-auto">
            <IndicadoresCAF />
          </div>
        )}


        {activeTab === 'vba' && (
          <div className="max-w-4xl mx-auto">
            <VBACodeDisplay />
          </div>
        )}

        {activeTab === 'conciliacao' && (
          <div className="max-w-7xl mx-auto">
            <ConciliacaoEmprestimo />
          </div>
        )}
            {activeTab === 'analise_dispensacao' && (
          <div className="max-w-7xl mx-auto">
            <AnaliseDispensacao />
          </div>
        )}
        {activeTab === 'analise_dispensacao_v2' && (
          <div className="max-w-7xl mx-auto">
            <AnaliseDispensacaoV2 />
          </div>
        )}
        {activeTab === 'inteligencia_devolucoes' && (
          <div className="max-w-7xl mx-auto">
            <InteligenciaDevolucoes />
          </div>
        )}
        {activeTab === 'criticidade' && (
          <div className="max-w-6xl mx-auto">
            <Criticidade />
          </div>
        )}
        {activeTab === 'checagem_devolucao' && (
          <div className="max-w-full mx-auto">
            <CheckagemDevolucao />
          </div>
        )}
        {activeTab === 'analise_dispensarios_v2' && (
          <div className="max-w-7xl mx-auto">
            <AnaliseDispensariosV2 />
          </div>
        )}
        {activeTab === 'rastreio_falta' && (
          <div className="max-w-7xl mx-auto">
            <RastreioFalta />
          </div>
        )}
        {activeTab === 'requisicao_v2' && (
          <div className="max-w-7xl mx-auto">
            <RequisicaoV2 />
          </div>
        )}
        {activeTab === 'cancelamento_v2' && (
          <div className="max-w-7xl mx-auto">
            <CancelamentoV2 />
          </div>
        )}
        {activeTab === 'previsibilidade_v2' && (
          <div className="max-w-7xl mx-auto">
            <PrevisibilidadeV2 equivalenceMap={equivalenceMap} />
          </div>
        )}
        {activeTab === 'indicadores_logisticos_v2' && (
          <div className="max-w-7xl mx-auto">
            <IndicadoresLogisticosV2 />
          </div>
        )}
        {activeTab === 'gerador_documentos' && (
          <div className="max-w-7xl mx-auto">
            <GeradorDocumentos />
          </div>
        )}
        {activeTab === 'avaliacao_fornecedores' && (
          <div className="max-w-full mx-auto">
            <SupplierEvaluationCAF />
          </div>
        )}
        {activeTab === 'remanejamento' && (
          <div className="max-w-7xl mx-auto">
            <Remanejamento />
          </div>
        )}
        {activeTab === 'ressuprimento' && (
          <div className="max-w-7xl mx-auto">
            <Ressuprimento />
          </div>
        )}
        {activeTab === 'painel_tv_ressuprimento' && (
          <div className="w-full">
            <PainelTVRessuprimento />
          </div>
        )}
        {activeTab === 'supply' && (
          <div className="max-w-7xl mx-auto">
            <Supply />
          </div>
        )}
        {activeTab === 'multidose' && (
          <div className="max-w-[1400px] mx-auto">
            <Multidose />
          </div>
        )}
        {activeTab === 'baixas_estoque' && (
          <div className="max-w-7xl mx-auto">
            <BaixasEstoque />
          </div>
        )}
        {activeTab === 'analise_operacional' && (
          <div className="max-w-7xl mx-auto">
            <AnaliseOperacional />
          </div>
        )}
      </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

export default App;

