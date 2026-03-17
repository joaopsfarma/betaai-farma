import React from 'react';
import { HelpCircle, ChevronDown, ChevronUp, BookOpen, Info, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GuideSection {
  title: string;
  content: string;
  icon?: React.ReactNode;
}

interface PanelGuideProps {
  title?: string;
  sections: GuideSection[];
}

export const PanelGuide: React.FC<PanelGuideProps> = ({ 
  title = "Como ler este painel?", 
  sections 
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 border ${
          isOpen 
            ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' 
            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 shadow-sm'
        }`}
      >
        <HelpCircle className={`w-4 h-4 transition-transform duration-300 ${isOpen ? 'rotate-12' : ''}`} />
        <span className="text-sm font-semibold">{title}</span>
        {isOpen ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, marginTop: 0 }}
            animate={{ height: 'auto', opacity: 1, marginTop: 16 }}
            exit={{ height: 0, opacity: 0, marginTop: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="bg-gradient-to-br from-white to-blue-50/30 border border-blue-100 rounded-2xl p-6 shadow-sm border-l-4 border-l-blue-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {sections.map((section, idx) => (
                  <div key={idx} className="space-y-3">
                    <div className="flex items-center gap-2 text-blue-800">
                      <div className="p-1.5 bg-blue-100 rounded-lg">
                        {section.icon || <Info className="w-4 h-4" />}
                      </div>
                      <h4 className="font-bold text-sm uppercase tracking-wider">{section.title}</h4>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                      {section.content}
                    </p>
                  </div>
                ))}
              </div>
              
              <div className="mt-8 pt-6 border-t border-blue-100 flex items-center gap-2 text-xs text-blue-400 italic">
                <Target className="w-3 h-3" />
                <span>Esta explicação visa alinhar a interpretação dos dados entre as equipes de Farmácia, Logística e Gestão.</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
