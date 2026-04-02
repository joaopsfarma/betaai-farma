import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { usePersistentState } from '../hooks/usePersistentState';
import { getRiscoAssistencial } from '../utils/riscoAssistencial';
import { getCategoriaProduto, CategoriaProduto } from '../utils/categorias';
import {
  Siren, Tv2, Play, Pause, Volume2, VolumeX,
  ShieldCheck, Maximize2, Minimize2, Clock,
  PackageX, Pill, FlaskConical, Package, Utensils,
  AlertCircle, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Interfaces ──────────────────────────────────────────────────────────────
interface OCItem {
  id: string;
  oc: string;
  fornecedor: string;
  quantidadeComprada: number;
  dataPrevista: string;
  atraso: number;
}

interface TrackingItem {
  id: string;
  produto: string;
  unidade: string;
  mediaConsumo: number;
  saldoAtual: number;
  coberturaDias: number;
  status: 'CRÍTICO' | 'ALERTA' | 'OK';
  previsaoRuptura: string;
  pontoRessuprimento: number;
  necessidadeCompra: number;
  tendenciaConsumo: 'ALTA' | 'MÉDIA' | 'BAIXA';
  ocInfo: OCItem[];
  riscoAss: ReturnType<typeof getRiscoAssistencial>;
  categoria: CategoriaProduto;
}

const ITEMS_PER_PAGE = 6;
const ROTATION_INTERVAL_MS = 10000;
const SOUND_INTERVAL_MS = 30000;

// ─── Ícone de categoria ───────────────────────────────────────────────────────
function CategoriaIcon({ categoria }: { categoria: CategoriaProduto }) {
  const base = 'w-3.5 h-3.5';
  if (categoria === 'MEDICAMENTO') return <Pill className={base} />;
  if (categoria === 'ALTA VIGILÂNCIA') return <FlaskConical className={base} />;
  if (categoria === 'DIETA') return <Utensils className={base} />;
  return <Package className={base} />;
}

// ─── Componente Principal ────────────────────────────────────────────────────
export const PainelTVRessuprimento: React.FC = () => {
  const [trackingData] = usePersistentState<TrackingItem[]>('ressuprimento_tracking_v2', []);
  const [ocData] = usePersistentState<Record<string, OCItem[]>>('ressuprimento_oc_v2', {});

  const [isPlaying, setIsPlaying] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastSoundTime = useRef<number>(0);

  // ── Relógio ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Fullscreen ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  }, []);

  // ── AudioContext (lazy — iniciado na interação do usuário) ────────────────
  const getOrCreateAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    return audioCtxRef.current;
  }, []);

  const playCriticoAlert = useCallback(() => {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const freqs = [523, 659, 523];
    let t = ctx.currentTime;
    for (let rep = 0; rep < 3; rep++) {
      for (const freq of freqs) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.01);
        gain.gain.setValueAtTime(0.2, t + 0.10);
        gain.gain.linearRampToValueAtTime(0, t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.12);
        t += 0.15;
      }
      t += 0.2;
    }
  }, [getOrCreateAudioCtx]);

  const playAlertaChime = useCallback(() => {
    const ctx = getOrCreateAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    const notes: [number, number][] = [[392, 0.4], [330, 0.4]];
    for (const [freq, dur] of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.05);
      gain.gain.setValueAtTime(0.18, t + dur - 0.1);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
      t += dur + 0.05;
    }
  }, [getOrCreateAudioCtx]);

  // ── Dados ─────────────────────────────────────────────────────────────────
  const allData = useMemo(() => {
    return trackingData.map(item => ({ ...item, ocInfo: ocData[item.id] || [] }));
  }, [trackingData, ocData]);

  const urgencyItems = useMemo(() => {
    let items = allData.filter(d => d.status === 'CRÍTICO' || (d.status === 'ALERTA' && d.riscoAss.level === 'CRITICO'));
    items.sort((a, b) => {
      if (a.status === 'CRÍTICO' && b.status !== 'CRÍTICO') return -1;
      if (b.status === 'CRÍTICO' && a.status !== 'CRÍTICO') return 1;
      if (a.coberturaDias !== b.coberturaDias) return a.coberturaDias - b.coberturaDias;
      return b.riscoAss.ordem - a.riscoAss.ordem;
    });
    return items;
  }, [allData]);

  const totalCritico = useMemo(() => urgencyItems.filter(i => i.status === 'CRÍTICO').length, [urgencyItems]);
  const totalAlerta = useMemo(() => urgencyItems.filter(i => i.status !== 'CRÍTICO').length, [urgencyItems]);
  const totalPages = Math.ceil(urgencyItems.length / ITEMS_PER_PAGE) || 1;

  // ── Rotação automática ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || urgencyItems.length === 0) return;
    const interval = setInterval(() => {
      setCurrentPage(prev => (prev + 1) % totalPages);
    }, ROTATION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPlaying, totalPages, urgencyItems.length]);

  // ── Som ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPlaying || !isSoundEnabled) return;
    const now = Date.now();
    if (now - lastSoundTime.current < SOUND_INTERVAL_MS) return;
    lastSoundTime.current = now;
    const hasCritical = urgencyItems.some(i => i.status === 'CRÍTICO');
    if (hasCritical) playCriticoAlert();
    else if (urgencyItems.length > 0) playAlertaChime();
  }, [isPlaying, isSoundEnabled, currentPage, urgencyItems, playCriticoAlert, playAlertaChime]);

  const toggleStart = () => {
    getOrCreateAudioCtx();
    setIsPlaying(true);
    setIsSoundEnabled(true);
  };

  // ── Formatação de tempo ───────────────────────────────────────────────────
  const timeStr = currentTime.toLocaleTimeString('pt-BR');
  const dateStr = currentTime.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  // ═══════════════════════════════════════════════════════════════════════════
  // TELA DE SPLASH
  // ═══════════════════════════════════════════════════════════════════════════
  if (!isPlaying) {
    return (
      <div ref={containerRef} className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center text-white">
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-pulse scale-150" />
          <div className="relative bg-slate-800/60 border border-slate-700 rounded-3xl p-8 shadow-2xl">
            <Tv2 className="w-24 h-24 text-emerald-400 mx-auto" />
          </div>
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-3">Painel TV de Ressuprimento</h1>
        <p className="text-slate-400 mb-4 max-w-xl text-lg">
          Leitura automática dos dados da aba de ressuprimento. Alertas intermitentes e rotação automática de telas.
        </p>

        {urgencyItems.length > 0 && (
          <div className="mb-8 flex gap-3 flex-wrap justify-center">
            {totalCritico > 0 && (
              <span className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 font-bold text-sm flex items-center gap-2">
                <Zap className="w-4 h-4" /> {totalCritico} CRÍTICO{totalCritico > 1 ? 'S' : ''} aguardando
              </span>
            )}
            {totalAlerta > 0 && (
              <span className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> {totalAlerta} ALERTA{totalAlerta > 1 ? 'S' : ''} aguardando
              </span>
            )}
          </div>
        )}
        {urgencyItems.length === 0 && (
          <div className="mb-8">
            <span className="px-4 py-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 font-bold text-sm flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Sistema limpo — nenhuma urgência detectada
            </span>
          </div>
        )}

        <button
          onClick={toggleStart}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-10 py-5 rounded-2xl font-bold text-2xl shadow-[0_0_40px_rgba(16,185,129,0.4)] transition-all flex items-center gap-4 hover:scale-105"
        >
          <Play fill="currentColor" className="w-8 h-8" />
          INICIAR PAINEL E ÁUDIO
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TELA "TUDO OK"
  // ═══════════════════════════════════════════════════════════════════════════
  if (urgencyItems.length === 0) {
    return (
      <div ref={containerRef} className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white relative overflow-hidden">
        <motion.div
          className="absolute inset-0 opacity-10"
          animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
          style={{ backgroundImage: 'radial-gradient(circle at 20% 50%, #10b981 0%, transparent 60%), radial-gradient(circle at 80% 50%, #059669 0%, transparent 60%)', backgroundSize: '200% 200%' }}
        />
        <button onClick={() => setIsPlaying(false)} className="absolute top-8 right-8 text-slate-500 hover:text-white flex items-center gap-2 z-10">
          <Pause className="w-5 h-5" /> Pausar
        </button>
        <ShieldCheck className="w-32 h-32 text-emerald-400 mb-8 relative z-10" />
        <h1 className="text-4xl font-black text-emerald-400 relative z-10">Tudo sob controle!</h1>
        <p className="text-slate-400 mt-4 text-xl relative z-10">Nenhum item com estoque crítico detectado.</p>
        <p className="text-slate-500 mt-2 text-sm relative z-10">Aguardando dados no Ressuprimento base...</p>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PAINEL PRINCIPAL
  // ═══════════════════════════════════════════════════════════════════════════
  const currentItems = urgencyItems.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
  const critItems = currentItems.filter(i => i.status === 'CRÍTICO');
  const alertItems = currentItems.filter(i => i.status !== 'CRÍTICO');

  return (
    <div ref={containerRef} className="min-h-screen bg-[#080E1A] text-slate-50 font-sans flex flex-col overflow-hidden selection:bg-rose-500/30">

      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/70 bg-[#080E1A]/90 backdrop-blur-md z-10 sticky top-0 shadow-2xl shadow-rose-950/20">

        {/* Linha superior: institucional + relógio */}
        <div className="px-8 py-2 border-b border-slate-800/50 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-slate-600">
            Farmácia Hospitalar · Painel TV Ressuprimento
          </span>
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-mono font-bold">
            <Clock className="w-3.5 h-3.5" />
            <span className="capitalize">{dateStr}</span>
            <span className="text-slate-400 text-sm ml-1">{timeStr}</span>
          </div>
        </div>

        {/* Linha principal */}
        <div className="px-8 py-4 flex justify-between items-center gap-4">
          {/* Esquerda: ícone + título */}
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="absolute inset-0 bg-red-500 rounded-2xl blur-md animate-pulse opacity-50" />
              <div className="relative bg-red-500/10 border border-red-500/40 rounded-2xl p-2.5">
                <Siren className="w-9 h-9 text-red-400" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest uppercase text-slate-100 leading-tight">
                ALERTA DE RUPTURA
              </h1>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-0.5">
                Monitoramento contínuo de estoque
              </p>
            </div>
          </div>

          {/* Centro: contadores */}
          <div className="flex items-center gap-3">
            {totalCritico > 0 && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2">
                <Zap className="w-4 h-4 text-red-400 flex-shrink-0" />
                <div className="text-center">
                  <p className="text-[9px] font-black text-red-400/70 uppercase tracking-widest leading-none mb-0.5">Crítico</p>
                  <p className="text-2xl font-black text-red-400 leading-none">{totalCritico}</p>
                </div>
              </div>
            )}
            {totalAlerta > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-2">
                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                <div className="text-center">
                  <p className="text-[9px] font-black text-amber-400/70 uppercase tracking-widest leading-none mb-0.5">Alerta</p>
                  <p className="text-2xl font-black text-amber-400 leading-none">{totalAlerta}</p>
                </div>
              </div>
            )}
          </div>

          {/* Direita: controles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSoundEnabled(!isSoundEnabled)}
              className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
              title={isSoundEnabled ? 'Silenciar' : 'Ativar som'}
            >
              {isSoundEnabled
                ? <Volume2 className="w-5 h-5 text-emerald-400" />
                : <VolumeX className="w-5 h-5 text-slate-500" />}
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
              title={isFullscreen ? 'Sair de tela cheia' : 'Tela cheia'}
            >
              {isFullscreen
                ? <Minimize2 className="w-5 h-5 text-sky-400" />
                : <Maximize2 className="w-5 h-5 text-slate-300" />}
            </button>
            <button
              onClick={() => setIsPlaying(false)}
              className="p-3 bg-slate-800/80 hover:bg-slate-700 rounded-xl text-slate-300 transition-colors"
              title="Pausar painel"
            >
              <Pause className="w-5 h-5" />
            </button>
            <div className="bg-slate-800 border border-slate-700/50 rounded-xl px-4 py-2 font-mono font-bold text-lg text-slate-400 tracking-wider ml-1">
              {String(currentPage + 1).padStart(2, '0')}/{String(totalPages).padStart(2, '0')}
            </div>
          </div>
        </div>
      </header>

      {/* ── LISTA ─────────────────────────────────────────────────────────── */}
      <main className="flex-1 p-6 xl:px-10 pb-16 overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={currentPage}
            initial={{ opacity: 0, x: 60, filter: 'blur(10px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -60, filter: 'blur(10px)', transition: { duration: 0.3 } }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
            className="flex flex-col gap-5"
          >
            {/* Grupo CRÍTICO */}
            {critItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-red-400">
                    <Zap className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">Crítico</span>
                  </div>
                  <div className="flex-1 h-px bg-red-500/20" />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {critItems.map((item, idx) => (
                    <ItemCard key={item.id + idx} item={item} />
                  ))}
                </div>
              </div>
            )}

            {/* Grupo ALERTA */}
            {alertItems.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-amber-400">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-black uppercase tracking-[0.2em]">Alerta</span>
                  </div>
                  <div className="flex-1 h-px bg-amber-500/20" />
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {alertItems.map((item, idx) => (
                    <ItemCard key={item.id + idx} item={item} />
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── PROGRESS BAR ──────────────────────────────────────────────────── */}
      <div className="h-2 bg-slate-800/80 w-full relative flex-shrink-0">
        <motion.div
          key={`${currentPage}-progress`}
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-red-600 to-rose-400 shadow-[0_0_12px_rgba(239,68,68,0.7)]"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: ROTATION_INTERVAL_MS / 1000, ease: 'linear' }}
        />
      </div>
    </div>
  );
};

// ─── Card de Item ────────────────────────────────────────────────────────────
function ItemCard({ item }: { item: TrackingItem & { ocInfo: OCItem[] } }) {
  const isCritico = item.status === 'CRÍTICO';
  const objOC = item.ocInfo[0];
  const coberturaZero = item.coberturaDias <= 0;
  const coberturaUrgente = item.coberturaDias <= 3 && item.coberturaDias > 0;

  return (
    <div className={`relative rounded-2xl overflow-hidden border-l-[5px] shadow-lg
      ${isCritico ? 'border-red-500 bg-red-950/10' : 'border-amber-500 bg-amber-950/10'}`}
    >
      {/* Stripe topo */}
      <div className={`h-0.5 w-full ${isCritico ? 'bg-red-500/60' : 'bg-amber-500/60'}`} />

      {/* Pulso de fundo para críticos */}
      {isCritico && <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />}

      {/* Corpo principal */}
      <div className="flex items-start gap-4 px-5 pt-4 pb-3">
        {/* Conteúdo esquerdo */}
        <div className="flex-1 min-w-0">
          <p className={`text-2xl font-black leading-tight truncate ${isCritico ? 'text-rose-100' : 'text-amber-100'}`}>
            {item.produto}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs font-bold text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded-md">
              {item.unidade}
            </span>
            <span className="text-xs font-mono text-slate-600 bg-slate-800/40 px-2 py-0.5 rounded-md">
              #{item.id}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider
              ${isCritico ? 'bg-red-500/10 text-red-400/80 border border-red-500/20' : 'bg-amber-500/10 text-amber-400/80 border border-amber-500/20'}`}>
              <CategoriaIcon categoria={item.categoria} />
              {item.categoria}
            </span>
            {item.riscoAss.level === 'CRITICO' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30">
                Risco Clínico
              </span>
            )}
          </div>
        </div>

        {/* Cobertura — destaque máximo */}
        <div className={`flex-shrink-0 flex flex-col items-center justify-center rounded-xl px-4 py-3 border min-w-[90px] shadow-inner
          ${coberturaZero
            ? 'bg-red-500/20 border-red-500/50 animate-pulse'
            : coberturaUrgente
              ? 'bg-rose-500/15 border-rose-500/40'
              : isCritico
                ? 'bg-red-500/10 border-red-500/30'
                : 'bg-amber-500/10 border-amber-500/30'}`}
        >
          {coberturaZero ? (
            <span className="text-lg font-black text-red-400 uppercase tracking-wider leading-none">RUPTURA</span>
          ) : (
            <>
              <span className={`text-4xl font-black leading-none ${isCritico ? 'text-rose-400' : 'text-amber-400'}`}>
                {Math.floor(item.coberturaDias)}
              </span>
              <span className={`text-xs font-bold uppercase tracking-widest mt-0.5 ${isCritico ? 'text-rose-500/70' : 'text-amber-500/70'}`}>
                dias
              </span>
            </>
          )}
        </div>
      </div>

      {/* Rodapé: saldo, consumo, OC */}
      <div className={`border-t px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs
        ${isCritico ? 'border-red-500/10' : 'border-amber-500/10'}`}
      >
        <span className="text-slate-400">
          Estoque: <strong className="text-slate-200 font-bold">{item.saldoAtual.toLocaleString('pt-BR')}</strong>
        </span>
        <span className="text-slate-600">·</span>
        <span className="text-slate-400">
          Média: <strong className="text-slate-200 font-bold">{item.mediaConsumo.toFixed(1)}/dia</strong>
        </span>
        <span className="text-slate-600">·</span>
        {objOC ? (
          <span className="flex items-center gap-2 text-slate-400 flex-wrap">
            OC <strong className="text-slate-300">{objOC.oc}</strong>
            {objOC.atraso > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30 font-black text-[10px] uppercase tracking-wider">
                {objOC.atraso}d atraso
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black text-[10px] uppercase tracking-wider">
                no prazo
              </span>
            )}
            <span className="text-slate-500 truncate max-w-[180px]">{objOC.fornecedor}</span>
            <span className="text-slate-600">· Prev: {objOC.dataPrevista}</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-red-400/80 font-bold">
            <PackageX className="w-3.5 h-3.5" />
            Sem OC no sistema
          </span>
        )}
      </div>
    </div>
  );
}
