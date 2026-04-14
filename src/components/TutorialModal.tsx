import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, BookOpen, Database, BarChart2, Pill, Lightbulb, HelpCircle, CheckCircle2 } from 'lucide-react';
import { TutorialData } from '../data/tutorials';

// ── Main Modal ────────────────────────────────────────────────────────────────

interface TutorialModalProps {
  tutorial: TutorialData;
  onDismiss: (neverShowAgain: boolean) => void;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({ tutorial, onDismiss }) => {
  const [neverShowAgain, setNeverShowAgain] = useState(true);

  const modal = (
    <AnimatePresence>
      <motion.div
        key="tutorial-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={() => onDismiss(neverShowAgain)}
      >
        <motion.div
          key="tutorial-modal"
          initial={{ opacity: 0, scale: 0.92, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 24 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-white rounded-3xl shadow-2xl shadow-slate-900/30 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* ── GRADIENT HEADER ── */}
          <div className={`bg-gradient-to-br ${tutorial.gradientFrom} ${tutorial.gradientTo} px-7 pt-7 pb-10 relative overflow-hidden`}>
            <div className="absolute -top-8 -right-8 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-black/10 blur-2xl pointer-events-none" />

            <button
              onClick={() => onDismiss(neverShowAgain)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              aria-label="Fechar tutorial"
            >
              <X className="w-4 h-4 text-white" />
            </button>

            <div className="flex items-center gap-4 relative z-10">
              <div className="text-4xl leading-none select-none">{tutorial.icon}</div>
              <div>
                <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Tutorial</p>
                <h2 className="text-white text-2xl font-extrabold leading-tight">{tutorial.title}</h2>
                <p className="text-white/80 text-sm mt-0.5">{tutorial.subtitle}</p>
              </div>
            </div>
          </div>

          {/* ── SCROLLABLE BODY ── */}
          <div className="flex-1 overflow-y-auto -mt-6 bg-white rounded-t-3xl px-7 pt-7 pb-4 space-y-6">

            {/* O que é */}
            <section>
              <SectionHeader icon={<BookOpen className="w-4 h-4" />} label="O que é este painel?" />
              <p className="text-slate-600 text-sm leading-relaxed mt-2">{tutorial.description}</p>
            </section>

            {/* Dados necessários */}
            <section>
              <SectionHeader icon={<Database className="w-4 h-4" />} label="Dados necessários" />
              <ul className="mt-2 space-y-1.5">
                {tutorial.dataNeeded.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            {/* Métricas principais */}
            <section>
              <SectionHeader icon={<BarChart2 className="w-4 h-4" />} label="Métricas principais" />
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {tutorial.keyMetrics.map((m, i) => (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">{m.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5 leading-snug">{m.description}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Contexto farmacêutico */}
            <section>
              <SectionHeader icon={<Pill className="w-4 h-4" />} label="Contexto farmacêutico" />
              <p className="text-slate-600 text-sm leading-relaxed mt-2 bg-violet-50 border border-violet-100 rounded-xl px-4 py-3">
                {tutorial.pharmContext}
              </p>
            </section>

            {/* Dicas */}
            {tutorial.tips.length > 0 && (
              <section>
                <SectionHeader icon={<Lightbulb className="w-4 h-4" />} label="Dicas de uso" />
                <ul className="mt-2 space-y-1.5">
                  {tutorial.tips.map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-amber-500 font-bold flex-shrink-0 mt-0.5">→</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* ── FOOTER ── */}
          <div className="px-7 py-5 border-t border-slate-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={neverShowAgain}
                onChange={e => setNeverShowAgain(e.target.checked)}
                className="w-4 h-4 rounded accent-violet-600 cursor-pointer"
              />
              Não mostrar novamente para este painel
            </label>

            <button
              onClick={() => onDismiss(neverShowAgain)}
              className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-500 to-violet-600 hover:from-emerald-600 hover:to-violet-700 shadow-md shadow-violet-200 transition-all active:scale-95"
            >
              Entendido, vamos começar! 🚀
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return ReactDOM.createPortal(modal, document.body);
};

// ── Section Header ────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <div className="flex items-center gap-2">
    <div className="p-1.5 bg-violet-100 rounded-lg text-violet-600">{icon}</div>
    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{label}</h3>
  </div>
);

// ── Floating Help Button ──────────────────────────────────────────────────────

interface HelpButtonProps {
  onClick: () => void;
}

export const TutorialHelpButton: React.FC<HelpButtonProps> = ({ onClick }) => (
  <motion.button
    onClick={onClick}
    title="Ver tutorial deste painel"
    whileHover={{ scale: 1.1 }}
    whileTap={{ scale: 0.95 }}
    className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-violet-600 text-white shadow-lg shadow-violet-300/50 flex items-center justify-center transition-shadow hover:shadow-xl hover:shadow-violet-300/60"
  >
    <HelpCircle className="w-5 h-5" />
  </motion.button>
);
