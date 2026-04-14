import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Tv2, Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  Clock, PackageX, AlertCircle, ShieldCheck, Users,
  TrendingDown, ChevronLeft, ChevronRight, Activity, Monitor,
  ArrowLeft, Zap, AlertTriangle, DollarSign, BarChart2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ── Tipos ──────────────────────────────────────────────────────────────────

interface TVKpis {
  emFalta: number;
  atrasados: number;
  altoCusto: number;
  coberturaCritica: number;
  comDependencia: number;
  coberturaMedia: number;
  taxaRuptura: number;
  taxaConformidade: number;
  total: number;
}

interface TVItem {
  codItem: string;
  descItem: string;
  fornec: string;
  emFalta: boolean;
  ruptura: boolean;
  diasAtraso: number;
  cobertura: number;
  estoqDisp: number;
  estoqTot: number;
  qtdPend: number;
  atrasado: boolean;
  ocNum: string;
  ocEntrega: string;
  nfNum: string;
  valorTotal: string;
  vlUnit: string;
  altoCusto: boolean;
  importado: boolean;
  dependencia: string;
  curvABC: string;
}

interface TVSupplier {
  nome: string;
  total: number;
  atrasados: number;
  emFalta: number;
  diasAtrasoMedio: number;
  coberturaMedia: number;
  pontualidade: number;
}

interface AbastecimentoTVData {
  savedAt: string;
  kpis: TVKpis;
  items: TVItem[];
  suppliers: TVSupplier[];
}

type SlideType = 'dashboard' | 'rupturas' | 'cobertura_critica' | 'atrasados' | 'fornecedores';

interface Slide {
  type: SlideType;
  pageIndex: number;
  totalPages: number;
}

// ── Constantes ─────────────────────────────────────────────────────────────

const ITEMS_PER_SLIDE = 6;
const ROTATION_INTERVAL_MS = 10000;
const TV_DATA_KEY = 'abastecimento_tv_data';

// ── Utilitário ─────────────────────────────────────────────────────────────

const toTitleCase = (str: string) =>
  str.replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"')
    .replace(/\w\S*/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

// ── Props ──────────────────────────────────────────────────────────────────

interface PainelTVAbastecimentoProps {
  onBack?: () => void;
}

// ── Sub-componente: Contador animado ───────────────────────────────────────

function AnimatedCount({ target, duration = 800 }: { target: number; duration?: number }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (target === 0) { setCount(0); return; }
    const steps = 40;
    const step = target / steps;
    const interval = duration / steps;
    let current = 0;
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      setCount(Math.round(current));
      if (current >= target) clearInterval(timer);
    }, interval);
    return () => clearInterval(timer);
  }, [target, duration]);
  return <>{count}</>;
}

// ── Sub-componente: Dashboard ──────────────────────────────────────────────

function DashboardSlide({ kpis, healthStatus, savedAt }: {
  kpis: TVKpis;
  healthStatus: 'CRÍTICO' | 'ALERTA' | 'OK';
  savedAt: string;
}) {
  const savedDate = new Date(savedAt).toLocaleString('pt-BR');

  const kpiCards = [
    {
      label: 'Rupturas / Em Falta',
      value: kpis.emFalta,
      icon: PackageX,
      color: 'text-red-400',
      bg: 'bg-red-500/20',
      border: 'border-red-500/40',
      glow: kpis.emFalta > 0,
    },
    {
      label: 'Cobertura Crítica',
      value: kpis.coberturaCritica,
      icon: TrendingDown,
      color: 'text-orange-400',
      bg: 'bg-orange-500/20',
      border: 'border-orange-500/40',
      glow: kpis.coberturaCritica > 0,
    },
    {
      label: 'Pedidos Atrasados',
      value: kpis.atrasados,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/20',
      border: 'border-amber-500/40',
      glow: kpis.atrasados > 0,
    },
    {
      label: 'Alto Custo',
      value: kpis.altoCusto,
      icon: DollarSign,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/20',
      border: 'border-indigo-500/40',
      glow: false,
    },
  ];

  const statusConfig = {
    'CRÍTICO': { color: 'text-red-400', bg: 'bg-red-500/20', border: 'border-red-500/50', label: 'SITUAÇÃO CRÍTICA' },
    'ALERTA':  { color: 'text-amber-400', bg: 'bg-amber-500/20', border: 'border-amber-500/50', label: 'EM ALERTA' },
    'OK':      { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/50', label: 'TUDO SOB CONTROLE' },
  };
  const sc = statusConfig[healthStatus];

  return (
    <div className="flex flex-col gap-6 h-full">
      {/* Status global */}
      <div className={`flex items-center justify-center gap-3 py-3 rounded-2xl border ${sc.bg} ${sc.border}`}>
        {healthStatus === 'OK'
          ? <ShieldCheck className={`w-7 h-7 ${sc.color}`} />
          : <AlertCircle className={`w-7 h-7 ${sc.color} animate-pulse`} />
        }
        <span className={`text-2xl font-black tracking-widest uppercase ${sc.color}`}>{sc.label}</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 flex-1">
        {kpiCards.map((card) => (
          <div
            key={card.label}
            className={`rounded-2xl border ${card.bg} ${card.border} p-5 flex flex-col items-center justify-center gap-3 relative overflow-hidden ${card.glow ? 'shadow-lg' : ''}`}
          >
            {card.glow && (
              <div className={`absolute inset-0 ${card.bg} animate-pulse opacity-40`} />
            )}
            <div className={`p-3 rounded-xl ${card.bg} relative z-10`}>
              <card.icon className={`w-8 h-8 ${card.color}`} />
            </div>
            <div className={`text-6xl font-black ${card.color} relative z-10`}>
              <AnimatedCount target={card.value} />
            </div>
            <div className="text-slate-400 text-sm font-semibold text-center relative z-10">{card.label}</div>
          </div>
        ))}
      </div>

      {/* Métricas complementares */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Taxa de Ruptura</div>
          <div className={`text-3xl font-black ${kpis.taxaRuptura > 2 ? 'text-red-400' : 'text-emerald-400'}`}>
            {kpis.taxaRuptura}<span className="text-lg">%</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Meta: &lt; 2%</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Cobertura Média</div>
          <div className={`text-3xl font-black ${kpis.coberturaMedia < 7 ? 'text-red-400' : kpis.coberturaMedia <= 30 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {kpis.coberturaMedia}<span className="text-lg"> dias</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Meta: 15–30 dias</div>
        </div>
        <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 p-4 text-center">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total de Itens</div>
          <div className="text-3xl font-black text-blue-400">
            {kpis.total}
          </div>
          <div className="text-[10px] text-slate-500 mt-1">Atualizado: {savedDate}</div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-componente: Lista de Itens ─────────────────────────────────────────

function ItemCard({ item, theme }: { item: TVItem; theme: 'red' | 'orange' | 'amber' }) {
  const colors = {
    red:    { border: 'border-l-red-500',    bg: 'bg-red-500/5',    badge: 'bg-red-500/20 text-red-300 border-red-500/40',    cov: 'text-red-400' },
    orange: { border: 'border-l-orange-500', bg: 'bg-orange-500/5', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/40', cov: 'text-orange-400' },
    amber:  { border: 'border-l-amber-500',  bg: 'bg-amber-500/5',  badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',  cov: 'text-amber-400' },
  };
  const c = colors[theme];

  const covDisplay = item.emFalta
    ? <span className="text-red-400 font-black text-2xl animate-pulse">RUPTURA</span>
    : item.cobertura >= 999
      ? <span className="text-slate-400 text-2xl">—</span>
      : <span className={`${c.cov} font-black text-3xl`}>{Math.round(item.cobertura)}<span className="text-base font-medium"> dias</span></span>;

  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className={`relative flex items-stretch bg-slate-800/70 rounded-xl border border-slate-700/50 border-l-4 ${c.border} overflow-hidden`}
    >
      {item.emFalta && <div className={`absolute inset-0 ${c.bg} animate-pulse pointer-events-none`} />}
      <div className="flex-1 p-4 relative z-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{item.codItem}</span>
              {item.curvABC && (
                <span className="text-[10px] font-bold text-slate-400">Curva {item.curvABC}</span>
              )}
            </div>
            <p className="text-white font-bold text-base leading-snug line-clamp-2">{item.descItem}</p>
            <p className="text-slate-400 text-xs mt-1 truncate">{toTitleCase(item.fornec)}</p>
          </div>
          <div className="flex-shrink-0 text-right">
            {covDisplay}
            {item.diasAtraso > 0 && (
              <div className={`text-xs font-semibold mt-1 border rounded px-1.5 py-0.5 ${c.badge}`}>
                {item.diasAtraso}d atraso
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-3 text-[11px] text-slate-500 border-t border-slate-700/50 pt-2">
          <span>Estoque: <strong className="text-slate-300">{item.estoqDisp}</strong></span>
          {item.ocNum && <span>OC: <strong className="text-slate-300">{item.ocNum}</strong></span>}
          {item.ocEntrega && <span>Entrega: <strong className="text-slate-300">{item.ocEntrega}</strong></span>}
          {item.altoCusto && <span className="text-indigo-400 font-semibold">• ALTO CUSTO</span>}
          {item.importado && <span className="text-blue-400 font-semibold">• IMPORTADO</span>}
        </div>
      </div>
    </motion.div>
  );
}

function ItemListSlide({ items, theme, subtitle }: {
  items: TVItem[];
  theme: 'red' | 'orange' | 'amber';
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-slate-400 text-sm font-medium">{subtitle}</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1">
        {items.map((item, idx) => (
          <ItemCard key={`${item.codItem}-${idx}`} item={item} theme={theme} />
        ))}
      </div>
    </div>
  );
}

// ── Sub-componente: Fornecedores ───────────────────────────────────────────

function SupplierSlide({ suppliers }: { suppliers: TVSupplier[] }) {
  const sorted = [...suppliers]
    .sort((a, b) => (b.emFalta * 3 + b.atrasados) - (a.emFalta * 3 + a.atrasados))
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-3 h-full">
      <p className="text-slate-400 text-sm font-medium">Ranking por risco assistencial — top {sorted.length} fornecedores</p>
      <div className="flex flex-col gap-2 flex-1">
        {sorted.map((sup, idx) => {
          const riskScore = sup.emFalta * 3 + sup.atrasados;
          const status = sup.emFalta > 0 ? 'CRÍTICO' : sup.atrasados > 0 ? 'ATENÇÃO' : 'OK';
          const statusColors = {
            CRÍTICO: 'bg-red-500/20 text-red-300 border-red-500/40',
            ATENÇÃO: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
            OK:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          };
          const pontColor = sup.pontualidade >= 90 ? 'bg-emerald-500' : sup.pontualidade >= 70 ? 'bg-amber-500' : 'bg-red-500';

          return (
            <motion.div
              key={sup.nome}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05, duration: 0.3 }}
              className="flex items-center gap-4 bg-slate-800/70 rounded-xl border border-slate-700/50 px-4 py-3"
            >
              {/* Rank */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${idx === 0 ? 'bg-red-500/30 text-red-300' : idx === 1 ? 'bg-orange-500/30 text-orange-300' : 'bg-slate-700 text-slate-400'}`}>
                {idx + 1}
              </div>

              {/* Nome */}
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-sm truncate">{toTitleCase(sup.nome)}</p>
                <p className="text-slate-500 text-[11px]">{sup.total} itens · {sup.diasAtrasoMedio.toFixed(0)}d atraso médio</p>
              </div>

              {/* Pontualidade */}
              <div className="w-24 flex-shrink-0">
                <div className="text-[10px] text-slate-500 mb-1">Pontualidade</div>
                <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pontColor} transition-all`} style={{ width: `${sup.pontualidade}%` }} />
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{sup.pontualidade.toFixed(0)}%</div>
              </div>

              {/* Rupturas */}
              {sup.emFalta > 0 && (
                <div className="bg-red-500/20 text-red-300 border border-red-500/40 rounded-lg px-2 py-1 text-xs font-bold flex-shrink-0">
                  {sup.emFalta} ruptura{sup.emFalta > 1 ? 's' : ''}
                </div>
              )}

              {/* Status */}
              <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex-shrink-0 ${statusColors[status]}`}>
                {status}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente Principal ───────────────────────────────────────────────────

export function PainelTVAbastecimento({ onBack }: PainelTVAbastecimentoProps) {
  const [tvData, setTvData] = useState<AbastecimentoTVData | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const prevSlideTypeRef = useRef<SlideType | null>(null);

  // ── Carregar dados do localStorage ──
  useEffect(() => {
    const raw = localStorage.getItem(TV_DATA_KEY);
    if (!raw) return;
    try {
      setTvData(JSON.parse(raw) as AbastecimentoTVData);
    } catch {
      console.warn('[PainelTVAbastecimento] Dados inválidos no localStorage');
    }
  }, []);

  // ── Relógio ──
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Fullscreen ──
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  // ── Audio Context (lazy init) ──
  const getOrCreateAudioCtx = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  const playCriticoAlert = useCallback(() => {
    const ctx = getOrCreateAudioCtx();
    const notes = [523, 659, 523];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.14);
    });
  }, [getOrCreateAudioCtx]);

  const playAlertaChime = useCallback(() => {
    const ctx = getOrCreateAudioCtx();
    const notes = [392, 330];
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * 0.45;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  }, [getOrCreateAudioCtx]);

  const playSoftPulse = useCallback(() => {
    const ctx = getOrCreateAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(261, ctx.currentTime);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  }, [getOrCreateAudioCtx]);

  // ── Slides ──
  const slides = useMemo<Slide[]>(() => {
    if (!tvData) return [];
    const result: Slide[] = [];

    result.push({ type: 'dashboard', pageIndex: 0, totalPages: 1 });

    const rupturaItems = tvData.items.filter(i => i.emFalta);
    if (rupturaItems.length > 0) {
      const pages = Math.ceil(rupturaItems.length / ITEMS_PER_SLIDE);
      for (let p = 0; p < pages; p++) result.push({ type: 'rupturas', pageIndex: p, totalPages: pages });
    }

    const critItems = tvData.items.filter(i => !i.emFalta && i.cobertura < 7 && i.cobertura >= 0);
    if (critItems.length > 0) {
      const pages = Math.ceil(critItems.length / ITEMS_PER_SLIDE);
      for (let p = 0; p < pages; p++) result.push({ type: 'cobertura_critica', pageIndex: p, totalPages: pages });
    }

    const atrasadoItems = tvData.items.filter(i => i.atrasado && !i.emFalta);
    if (atrasadoItems.length > 0) {
      const pages = Math.ceil(atrasadoItems.length / ITEMS_PER_SLIDE);
      for (let p = 0; p < pages; p++) result.push({ type: 'atrasados', pageIndex: p, totalPages: pages });
    }

    if (tvData.suppliers.length > 0) {
      result.push({ type: 'fornecedores', pageIndex: 0, totalPages: 1 });
    }

    return result;
  }, [tvData]);

  // ── Status de saúde global ──
  const healthStatus = useMemo<'CRÍTICO' | 'ALERTA' | 'OK'>(() => {
    if (!tvData) return 'OK';
    if (tvData.kpis.emFalta > 0 || tvData.kpis.taxaRuptura > 5) return 'CRÍTICO';
    if (tvData.kpis.coberturaCritica > 0 || tvData.kpis.atrasados > 0) return 'ALERTA';
    return 'OK';
  }, [tvData]);

  // ── Auto-rotação ──
  useEffect(() => {
    if (!isPlaying || slides.length === 0) return;
    const id = setInterval(() => {
      setSlideIndex(prev => (prev + 1) % slides.length);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isPlaying, slides.length]);

  // ── Áudio por transição de tipo de slide ──
  useEffect(() => {
    if (!isPlaying || !isSoundEnabled || slides.length === 0) return;
    const current = slides[slideIndex];
    if (!current) return;
    if (current.type === prevSlideTypeRef.current) return;
    prevSlideTypeRef.current = current.type;

    if (current.type === 'rupturas') playCriticoAlert();
    else if (current.type === 'cobertura_critica' || current.type === 'atrasados') playAlertaChime();
    else if (current.type === 'dashboard' && healthStatus !== 'OK') playSoftPulse();
  }, [slideIndex, isPlaying, isSoundEnabled, slides, healthStatus, playCriticoAlert, playAlertaChime, playSoftPulse]);

  // ── Dados filtrados por slide ──
  const currentSlideItems = useMemo(() => {
    if (!tvData || slides.length === 0) return [];
    const current = slides[slideIndex];
    if (!current) return [];

    let pool: TVItem[] = [];
    if (current.type === 'rupturas') pool = tvData.items.filter(i => i.emFalta);
    else if (current.type === 'cobertura_critica') pool = tvData.items.filter(i => !i.emFalta && i.cobertura < 7 && i.cobertura >= 0);
    else if (current.type === 'atrasados') pool = tvData.items.filter(i => i.atrasado && !i.emFalta);

    const start = current.pageIndex * ITEMS_PER_SLIDE;
    return pool.slice(start, start + ITEMS_PER_SLIDE);
  }, [tvData, slides, slideIndex]);

  // ── Config por tipo de slide ──
  const slideConfig = useMemo(() => {
    const current = slides[slideIndex];
    if (!current) return null;

    const configs = {
      dashboard: {
        title: 'PAINEL GERAL',
        icon: Activity,
        iconColor: 'text-blue-400',
        iconPulse: false,
        progressColor: 'from-blue-600 to-indigo-400',
        theme: 'blue' as const,
      },
      rupturas: {
        title: 'RUPTURAS / EM FALTA',
        icon: PackageX,
        iconColor: 'text-red-400',
        iconPulse: true,
        progressColor: 'from-red-600 to-red-400',
        theme: 'red' as const,
      },
      cobertura_critica: {
        title: 'COBERTURA CRÍTICA',
        icon: TrendingDown,
        iconColor: 'text-orange-400',
        iconPulse: false,
        progressColor: 'from-orange-600 to-orange-400',
        theme: 'orange' as const,
      },
      atrasados: {
        title: 'PEDIDOS ATRASADOS',
        icon: Clock,
        iconColor: 'text-amber-400',
        iconPulse: false,
        progressColor: 'from-amber-600 to-amber-400',
        theme: 'amber' as const,
      },
      fornecedores: {
        title: 'AVALIAÇÃO DE FORNECEDORES',
        icon: Users,
        iconColor: 'text-violet-400',
        iconPulse: false,
        progressColor: 'from-violet-600 to-violet-400',
        theme: 'blue' as const,
      },
    };

    return { ...configs[current.type], slide: current };
  }, [slides, slideIndex]);

  const handleStart = () => {
    getOrCreateAudioCtx();
    prevSlideTypeRef.current = null;
    setSlideIndex(0);
    setIsPlaying(true);
    setIsSoundEnabled(true);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 1: Sem dados
  // ─────────────────────────────────────────────────────────────────────────

  if (!tvData) {
    return (
      <div ref={containerRef} className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
        <div className="max-w-md w-full mx-auto p-8 text-center">
          <div className="w-20 h-20 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-700">
            <Tv2 className="w-10 h-10 text-slate-500" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Nenhum dado disponível</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Para usar o Painel TV, acesse primeiro a aba{' '}
            <strong className="text-blue-400">Visão de Abastecimento</strong> e importe
            um arquivo CSV. Os dados serão salvos automaticamente para exibição aqui.
          </p>
          <button
            onClick={onBack}
            className="flex items-center gap-2 mx-auto text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 px-5 py-2.5 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Ir para Visão de Abastecimento
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 2: Splash
  // ─────────────────────────────────────────────────────────────────────────

  if (!isPlaying) {
    const savedDate = new Date(tvData.savedAt).toLocaleString('pt-BR');
    const alertBadges = [
      { label: 'rupturas', value: tvData.kpis.emFalta, color: 'bg-red-500/20 text-red-300 border-red-500/40' },
      { label: 'cob. crítica', value: tvData.kpis.coberturaCritica, color: 'bg-orange-500/20 text-orange-300 border-orange-500/40' },
      { label: 'atrasados', value: tvData.kpis.atrasados, color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
      { label: 'total itens', value: tvData.kpis.total, color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
    ];

    return (
      <div ref={containerRef} className="min-h-screen bg-slate-900 flex items-center justify-center font-sans">
        <div className="max-w-lg w-full mx-auto p-8 text-center">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-900/50">
            <Monitor className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-black text-white mb-1">Painel TV</h1>
          <p className="text-blue-300 font-semibold mb-2">Visão de Abastecimento Farmacêutico</p>
          <p className="text-slate-500 text-xs mb-8">Dados salvos em: {savedDate}</p>

          <div className="grid grid-cols-2 gap-3 mb-8">
            {alertBadges.map(b => (
              <div key={b.label} className={`rounded-xl border px-4 py-3 ${b.color}`}>
                <div className="text-3xl font-black">{b.value}</div>
                <div className="text-xs font-semibold uppercase tracking-wider opacity-80 mt-0.5">{b.label}</div>
              </div>
            ))}
          </div>

          <button
            onClick={handleStart}
            className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-lg py-4 rounded-2xl shadow-xl shadow-blue-900/40 transition-all"
          >
            <Play className="w-6 h-6" /> INICIAR PAINEL E ÁUDIO
          </button>

          <button
            onClick={onBack}
            className="mt-4 text-slate-500 hover:text-slate-300 text-sm flex items-center gap-1.5 mx-auto transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar para Abastecimento
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 3: Tudo OK (apenas dashboard + fornecedores, sem alertas)
  // ─────────────────────────────────────────────────────────────────────────

  if (isPlaying && healthStatus === 'OK' && slides.length <= 2) {
    return (
      <div ref={containerRef} className="min-h-screen bg-slate-900 flex flex-col items-center justify-center font-sans gap-6">
        <ShieldCheck className="w-24 h-24 text-emerald-400" />
        <h2 className="text-4xl font-black text-white">Estoque Sob Controle</h2>
        <p className="text-emerald-400 text-xl font-semibold">Sem rupturas ou alertas críticos</p>
        <p className="text-slate-500 text-sm">{tvData.kpis.total} itens analisados · Cobertura média: {tvData.kpis.coberturaMedia} dias</p>
        <button
          onClick={() => setIsPlaying(false)}
          className="mt-4 flex items-center gap-2 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 px-4 py-2 rounded-xl transition-colors text-sm"
        >
          <Pause className="w-4 h-4" /> Pausar
        </button>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATE 4: Painel Principal
  // ─────────────────────────────────────────────────────────────────────────

  const cfg = slideConfig!;
  const currentSlide = slides[slideIndex];

  const statusBadgeColors = {
    CRÍTICO: 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse',
    ALERTA:  'bg-amber-500/20 text-amber-400 border-amber-500/40',
    OK:      'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
  };

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-slate-900 flex flex-col font-sans select-none"
    >
      {/* ── HEADER ── */}
      <header className="bg-slate-950/80 border-b border-slate-800/60 backdrop-blur-sm px-6 py-3 flex-shrink-0">
        {/* Linha superior: info geral */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-slate-500 text-xs">
            <Monitor className="w-3.5 h-3.5" />
            <span>Painel TV · Abastecimento Farmacêutico</span>
          </div>
          <div className="flex items-center gap-2 text-slate-400 text-sm font-mono">
            <Clock className="w-4 h-4" />
            {currentTime.toLocaleTimeString('pt-BR')}
          </div>
          <div className="text-slate-500 text-xs">
            Slide {slideIndex + 1} / {slides.length}
          </div>
        </div>

        {/* Linha principal */}
        <div className="flex items-center justify-between gap-4">
          {/* Título do slide */}
          <div className="flex items-center gap-3">
            <div className={cfg.iconPulse ? 'animate-pulse' : ''}>
              <cfg.icon className={`w-7 h-7 ${cfg.iconColor}`} />
            </div>
            <div>
              <h2 className="text-white font-black text-xl tracking-wide">{cfg.title}</h2>
              {currentSlide.totalPages > 1 && (
                <p className="text-slate-500 text-xs">
                  Página {currentSlide.pageIndex + 1} de {currentSlide.totalPages}
                </p>
              )}
            </div>
          </div>

          {/* Status badge */}
          <div className={`px-4 py-1.5 rounded-xl border text-sm font-black tracking-widest ${statusBadgeColors[healthStatus]}`}>
            {healthStatus === 'CRÍTICO' && <Zap className="w-4 h-4 inline mr-1.5" />}
            {healthStatus === 'ALERTA' && <AlertTriangle className="w-4 h-4 inline mr-1.5" />}
            {healthStatus === 'OK' && <ShieldCheck className="w-4 h-4 inline mr-1.5" />}
            {healthStatus}
          </div>

          {/* Controles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSlideIndex(prev => (prev - 1 + slides.length) % slides.length)}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="Slide anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSlideIndex(prev => (prev + 1) % slides.length)}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="Próximo slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsSoundEnabled(s => !s)}
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isSoundEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
              title={isSoundEnabled ? 'Desativar som' : 'Ativar som'}
            >
              {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title={isFullscreen ? 'Sair do fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsPlaying(false)}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="Pausar painel"
            >
              <Pause className="w-4 h-4" />
            </button>
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              title="Voltar para Abastecimento"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── CONTEÚDO DO SLIDE ── */}
      <main className="flex-1 p-6 overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={`${slideIndex}-${currentSlide.type}-${currentSlide.pageIndex}`}
            initial={{ opacity: 0, x: 60, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -60, filter: 'blur(8px)', transition: { duration: 0.25 } }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="h-full"
          >
            {currentSlide.type === 'dashboard' && (
              <DashboardSlide kpis={tvData!.kpis} healthStatus={healthStatus} savedAt={tvData!.savedAt} />
            )}
            {currentSlide.type === 'rupturas' && (
              <ItemListSlide
                items={currentSlideItems}
                theme="red"
                subtitle={`${tvData!.items.filter(i => i.emFalta).length} itens em ruptura/falta — Risco Assistencial Máximo`}
              />
            )}
            {currentSlide.type === 'cobertura_critica' && (
              <ItemListSlide
                items={currentSlideItems}
                theme="orange"
                subtitle={`${tvData!.items.filter(i => !i.emFalta && i.cobertura < 7 && i.cobertura >= 0).length} itens com cobertura inferior a 7 dias`}
              />
            )}
            {currentSlide.type === 'atrasados' && (
              <ItemListSlide
                items={currentSlideItems}
                theme="amber"
                subtitle={`${tvData!.items.filter(i => i.atrasado && !i.emFalta).length} itens com pedido de compra em atraso`}
              />
            )}
            {currentSlide.type === 'fornecedores' && (
              <SupplierSlide suppliers={tvData!.suppliers} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── BARRA DE PROGRESSO ── */}
      <div className="h-1 bg-slate-800/60 flex-shrink-0 relative overflow-hidden">
        <motion.div
          key={slideIndex}
          className={`absolute top-0 left-0 h-full bg-gradient-to-r ${cfg.progressColor}`}
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: ROTATION_INTERVAL_MS / 1000, ease: 'linear' }}
        />
      </div>
    </div>
  );
}
