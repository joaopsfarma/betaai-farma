import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Pill, LogIn, ArrowLeft, Layers, UserPlus,
  Activity, ShieldCheck, TrendingUp, Package,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoginPageProps {
  onBack: () => void;
}

type Mode = 'login' | 'register';

const FEATURES = [
  {
    icon: <Activity className="w-3.5 h-3.5 text-white" />,
    title: 'Monitoramento em tempo real',
    desc: 'Rastreie dispensações, devoluções e faltas com atualização contínua.',
  },
  {
    icon: <ShieldCheck className="w-3.5 h-3.5 text-white" />,
    title: 'Segurança e rastreabilidade',
    desc: 'Controle de acesso e log completo de cada movimentação farmacêutica.',
  },
  {
    icon: <TrendingUp className="w-3.5 h-3.5 text-white" />,
    title: 'Previsibilidade de consumo',
    desc: 'IA para projetar demanda e evitar rupturas de estoque hospitalar.',
  },
  {
    icon: <Package className="w-3.5 h-3.5 text-white" />,
    title: 'Gestão de suprimentos',
    desc: 'Ressuprimento, remanejamento e conciliação integrados em um único painel.',
  },
];

export function LoginPage({ onBack }: LoginPageProps) {
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>('login');

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
    setRegSuccess(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error);
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (regPassword !== regConfirm) {
      setError('As senhas não coincidem.');
      return;
    }
    if (regPassword.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: regEmail, password: regPassword }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? 'Erro ao criar conta.');
      } else {
        setRegSuccess(true);
      }
    } catch {
      setError('Erro de conexão. Tente novamente.');
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen w-full overflow-hidden font-sans text-slate-900">

      {/* LEFT PANEL */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="hidden md:flex md:w-[45%] relative flex-col justify-between bg-gradient-to-br from-emerald-500 to-violet-700 px-10 py-12 overflow-hidden"
      >
        {/* Decorative circles */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/5 blur-2xl" />
          <div className="absolute bottom-24 -left-12 w-56 h-56 rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="absolute top-1/2 right-8 w-40 h-40 rounded-full bg-violet-300/10 blur-2xl" />
        </div>

        <div className="relative z-10 flex flex-col h-full justify-between">
          <div>
            {/* Back button */}
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-medium transition-colors mb-10"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar
            </button>

            {/* Logo + Name */}
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-white/20 backdrop-blur-sm p-3 rounded-2xl shadow-lg shadow-black/10">
                <Pill className="w-9 h-9 text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-extrabold text-white tracking-tight">FarmaIA</h1>
                <span className="text-xs font-semibold bg-white/20 text-white px-2.5 py-0.5 rounded-full">
                  BETA 0.1V
                </span>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-white/90 text-lg font-medium leading-snug mb-2">
              Inteligência artificial para logística farmacêutica hospitalar.
            </p>
            <p className="text-white/60 text-sm mb-10">
              Acesso exclusivo para equipes autorizadas.
            </p>

            {/* Feature bullets */}
            <ul className="space-y-5">
              {FEATURES.map((f, i) => (
                <li key={i} className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
                    {f.icon}
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">{f.title}</p>
                    <p className="text-white/60 text-xs leading-relaxed">{f.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Bottom badge */}
          <div className="flex items-center gap-2 text-white/50 text-xs">
            <Layers className="w-3.5 h-3.5" />
            <span>33+ ferramentas disponíveis</span>
          </div>
        </div>
      </motion.div>

      {/* RIGHT PANEL */}
      <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-white px-6 py-10 md:px-12 lg:px-16">

        {/* Mobile-only header */}
        <div className="flex md:hidden w-full max-w-md items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <div className="bg-gradient-to-br from-emerald-500 to-violet-600 p-2 rounded-lg shadow-sm shadow-violet-200">
              <Pill className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent">
              FarmaIA
            </span>
          </div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-violet-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="w-full max-w-md"
        >
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-violet-50 border border-violet-100 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-medium text-violet-700">Acesso restrito a usuários autorizados</span>
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {mode === 'login' ? 'Entrar no Sistema' : 'Criar Conta'}
            </h1>
            <p className="text-slate-500">Logística Farmacêutica Hospitalar</p>
          </div>

          {/* Tabs */}
          <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
            <button
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Criar conta
            </button>
          </div>

          {/* Card */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm shadow-violet-50 p-8">
            <AnimatePresence mode="wait">
              {mode === 'login' ? (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleLogin}
                  className="space-y-5"
                >
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                      placeholder="seu@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                  {error && <ErrorBox message={error} />}
                  <SubmitButton loading={loading} label="Entrar" icon={<LogIn className="w-4 h-4" />} />
                </motion.form>
              ) : (
                <motion.div
                  key="register"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {regSuccess ? (
                    <div className="text-center py-4">
                      <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">✓</span>
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 mb-2">Conta criada!</h3>
                      <p className="text-slate-500 text-sm mb-6">Seu acesso foi confirmado. Faça login para continuar.</p>
                      <button
                        onClick={() => switchMode('login')}
                        className="text-sm font-medium text-violet-600 hover:text-violet-700"
                      >
                        Ir para login →
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleRegister} className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          required
                          autoFocus
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                          placeholder="seu@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Senha</label>
                        <input
                          type="password"
                          value={regPassword}
                          onChange={e => setRegPassword(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                          placeholder="mín. 6 caracteres"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirmar senha</label>
                        <input
                          type="password"
                          value={regConfirm}
                          onChange={e => setRegConfirm(e.target.value)}
                          required
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 transition-all"
                          placeholder="••••••••"
                        />
                      </div>
                      {error && <ErrorBox message={error} />}
                      <SubmitButton loading={loading} label="Criar conta" icon={<UserPlus className="w-4 h-4" />} />
                    </form>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
      <span className="mt-0.5">⚠</span>
      <span>{message}</span>
    </div>
  );
}

function SubmitButton({ loading, label, icon }: { loading: boolean; label: string; icon: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-gradient-to-r from-emerald-500 to-violet-600 hover:from-emerald-600 hover:to-violet-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-sm shadow-violet-200 transition-all"
    >
      {loading ? (
        <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
      ) : icon}
      {loading ? 'Aguarde...' : label}
    </button>
  );
}
