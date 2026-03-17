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
  Clock
} from 'lucide-react';

interface LandingPageProps {
  onEnter: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onEnter }) => {
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
              <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full ml-2">
                BETA 0.1V
              </span>
            </div>
            <button
              onClick={onEnter}
              className="text-sm font-medium text-slate-600 hover:text-violet-600 transition-colors"
            >
              Entrar no Sistema
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-50 to-violet-50 border border-violet-100 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-sm font-medium text-violet-700">Sistema ativo e em evolução</span>
            </div>
            <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 mb-6">
              FarmaIA — <br className="hidden sm:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-violet-600">
                Farmácia Hospitalar
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed">
              O FarmaIA revoluciona o controle de estoque, dispensação e rastreabilidade de medicamentos.
              Tome decisões baseadas em dados com previsibilidade e segurança.
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
                onClick={() => {
                  document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="w-full sm:w-auto px-8 py-4 bg-white hover:bg-violet-50 text-violet-700 border border-violet-200 rounded-xl font-semibold text-lg transition-all flex items-center justify-center"
              >
                Conhecer Recursos
              </button>
            </div>
          </motion.div>
        </div>

        {/* Dashboard Preview Mockup */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="mt-20 relative mx-auto max-w-5xl"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-50 via-transparent to-transparent z-10 bottom-0 h-32 top-auto"></div>
          <div className="rounded-2xl border border-violet-100 bg-white shadow-2xl shadow-violet-100/50 overflow-hidden">
            <div className="h-8 bg-gradient-to-r from-emerald-50 to-violet-50 border-b border-violet-100 flex items-center px-4 gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <div className="w-3 h-3 rounded-full bg-amber-400"></div>
              <div className="w-3 h-3 rounded-full bg-emerald-400"></div>
            </div>
            <div className="p-2 bg-slate-50 aspect-[16/9] flex items-center justify-center relative overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#a78bfa 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
              <div className="grid grid-cols-3 gap-4 w-full h-full p-4 z-10">
                <div className="col-span-2 bg-white rounded-xl shadow-sm border border-violet-100 p-4 flex flex-col gap-4">
                  <div className="h-8 w-1/3 bg-violet-100 rounded-md"></div>
                  <div className="flex-1 bg-gradient-to-br from-emerald-50 to-violet-50 rounded-md border border-violet-100"></div>
                </div>
                <div className="col-span-1 flex flex-col gap-4">
                  <div className="h-32 bg-gradient-to-br from-emerald-50 to-violet-50 rounded-xl border border-violet-100 p-4">
                    <div className="h-6 w-1/2 bg-violet-200 rounded-md mb-2"></div>
                    <div className="h-10 w-3/4 bg-emerald-100 rounded-md"></div>
                  </div>
                  <div className="flex-1 bg-white rounded-xl shadow-sm border border-violet-100"></div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white border-t border-violet-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-violet-700 bg-clip-text text-transparent mb-4">Módulos Integrados</h2>
            <p className="text-slate-600 max-w-2xl mx-auto">
              Uma suíte completa de ferramentas desenhada especificamente para os desafios da farmácia hospitalar moderna.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-gradient-to-br from-emerald-50 to-slate-50 rounded-2xl p-8 border border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 transition-shadow">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                <TrendingUp className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Previsibilidade</h3>
              <p className="text-slate-600">
                Análise preditiva de demanda baseada no histórico de consumo. Evite rupturas e excessos de estoque com cálculos automáticos de ressuprimento.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gradient-to-br from-violet-50 to-slate-50 rounded-2xl p-8 border border-violet-100 hover:shadow-lg hover:shadow-violet-100/50 transition-shadow">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center mb-6">
                <Activity className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Dispensação e Rastreio</h3>
              <p className="text-slate-600">
                Acompanhe o fluxo completo do medicamento, desde a CAF até o paciente. Identifique gargalos e melhore o tempo de atendimento (SLA).
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gradient-to-br from-emerald-50 to-slate-50 rounded-2xl p-8 border border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 transition-shadow">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Conciliação e Empréstimos</h3>
              <p className="text-slate-600">
                Controle rigoroso de empréstimos entre unidades e devoluções. Garanta que nenhum item se perca nas transferências inter-hospitalares.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-gradient-to-br from-violet-50 to-slate-50 rounded-2xl p-8 border border-violet-100 hover:shadow-lg hover:shadow-violet-100/50 transition-shadow">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center mb-6">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Painel CAF</h3>
              <p className="text-slate-600">
                Visão centralizada da Central de Abastecimento Farmacêutico. Monitore validades, lotes e movimentações em tempo real.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-gradient-to-br from-emerald-50 to-slate-50 rounded-2xl p-8 border border-emerald-100 hover:shadow-lg hover:shadow-emerald-100/50 transition-shadow">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center mb-6">
                <BarChart2 className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Indicadores e Produtividade</h3>
              <p className="text-slate-600">
                Dashboards gerenciais com métricas de desempenho da equipe, volume de atendimentos e qualidade da dispensação.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-gradient-to-br from-violet-50 to-slate-50 rounded-2xl p-8 border border-violet-100 hover:shadow-lg hover:shadow-violet-100/50 transition-shadow">
              <div className="w-12 h-12 bg-violet-100 text-violet-600 rounded-xl flex items-center justify-center mb-6">
                <Clock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Pedidos 24h</h3>
              <p className="text-slate-600">
                Gestão ágil de requisições urgentes e rotineiras, garantindo que a assistência ao paciente nunca seja interrompida por falta de insumos.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 text-white">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">Pronto para otimizar sua farmácia?</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Acesse agora o ambiente BETA e experimente todas as funcionalidades do FarmaIA.
          </p>
          <button
            onClick={onEnter}
            className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-violet-600 hover:from-emerald-400 hover:to-violet-500 text-white rounded-xl font-bold text-lg transition-all shadow-lg shadow-violet-500/30"
          >
            Acessar FarmaIA Agora
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-950 py-8 border-t border-violet-900/30 text-center text-slate-500 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Pill className="w-5 h-5 text-violet-500" />
          <span className="font-bold bg-gradient-to-r from-emerald-400 to-violet-400 bg-clip-text text-transparent">FarmaIA</span>
        </div>
        <p>© {new Date().getFullYear()} FarmaIA. Todos os direitos reservados.</p>
        <p className="mt-2 text-xs">Versão BETA 0.1V</p>
      </footer>
    </div>
  );
};
