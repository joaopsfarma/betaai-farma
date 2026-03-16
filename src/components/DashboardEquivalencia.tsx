import React, { useState, useRef } from 'react';
import { EQUIVALENCE_MAP } from '../data/equivalenceMap';
import { Search, Database, ArrowRight, Pill, AlertCircle, Upload, Layers, Target, RefreshCw } from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';

interface DashboardEquivalenciaProps {
  Map: Record<string, string[]>;
  setMap: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
}

export const DashboardEquivalencia: React.FC<DashboardEquivalenciaProps> = ({ Map, setMap }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/);
      const newMap: Record<string, string[]> = { ...Map };

      lines.forEach((line, index) => {
        if (index === 0 || line.trim() === '') return;
        
        // Try to detect delimiter: Tab, Semicolon or Comma
        let delimiter = '\t';
        if (line.includes(';')) delimiter = ';';
        else if (line.includes(',')) delimiter = ',';

        const parts = line.split(delimiter).map(s => s.trim().replace(/^"|"$/g, ''));
        
        // Logic: Search for Product ID and Similar IDs columns
        // We look for common headers or indices
        let id = '';
        let similars: string[] = [];

        if (parts.length >= 2) {
          // Fallback simple logic: first column is ID, the rest are similars if they look like IDs
          id = parts[0];
          similars = parts.slice(1).filter(p => /^\d+$/.test(p) && p !== id);
          
          // If the line had headers or specific format, adjust:
          if (parts[2] && /^\d+$/.test(parts[2])) {
             id = parts[2];
             similars = parts.slice(3).filter(p => /^\d+$/.test(p) && p !== id);
          }
        }

        if (id && similars.length > 0) {
          newMap[id] = [...(newMap[id] || []), ...similars].filter((v, i, a) => a.indexOf(v) === i);
        }
      });

      if (Object.keys(newMap).length > Object.keys(Map).length || lines.length > 2) {
        setMap(newMap);
      }
    };
    reader.readAsText(file);
  };

  const filteredIds = Object.keys(Map).filter(id => 
    id.includes(searchTerm) || 
    Map[id].some(sid => sid.includes(searchTerm))
  );

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
          <Database className="w-48 h-48 text-teal-600" />
        </div>
        <div className="flex items-center justify-between mb-8 relative z-10">
          <div className="flex items-center gap-3">
            <div className="bg-teal-100 p-2 rounded-lg text-teal-700">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Base de Equivalências</h2>
              <p className="text-slate-500 text-sm font-medium">Gestão de substitutos e sinônimos farmacêuticos.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileImport} 
              accept=".csv,.txt" 
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition-all text-sm font-bold shadow-lg shadow-teal-100"
            >
              <Upload className="w-4 h-4" />
              Importar Lista
            </button>
          </div>
        </div>

        <PanelGuide 
          sections={[
            {
              title: "Dicionário de Sinônimos",
              content: "Mapeia medicamentos com a mesma composição ou finalidade terapêutica (ex: Dipirona vs Metamizol) para sugerir trocas seguras.",
              icon: <Layers className="w-4 h-4" />
            },
            {
              title: "Indicação Automática",
              content: "Quando um item entra em ruptura nos painéis de Previsibilidade, este dicionário é consultado para oferecer alternativas imediatas.",
              icon: <RefreshCw className="w-4 h-4" />
            },
            {
              title: "Importação Customizada",
              content: "Permite atualizar a base de equivalências com a lista aprovada pela farmácia clínica local, garantindo conformidade com protocolos internos.",
              icon: <Target className="w-4 h-4" />
            }
          ]}
        />

        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou ID do produto ou substituto..."
            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 bg-slate-50 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Produto Principal (ID)</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Qtd Similares</th>
                <th className="px-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">IDs de Produtos Semelhantes/Substitutos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredIds.length > 0 ? (
                filteredIds.map((id) => (
                  <tr key={id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="bg-slate-100 p-1.5 rounded text-slate-500">
                          <Pill className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900 font-mono">{id}</p>
                          <p className="text-[10px] text-slate-400 uppercase tracking-tight">Código do Produto</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800">
                        {Map[id].length} itens
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-2">
                        {Map[id].map(sid => (
                          <span key={sid} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-mono border border-slate-200">
                            <Layers className="w-3 h-3 text-slate-400" />
                            {sid}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-6 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="w-8 h-8 text-slate-300" />
                      <p>Nenhuma equivalência encontrada para "{searchTerm}"</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-slate-500">
            Total de {filteredIds.length} produtos principais com substitutos mapeados.
          </p>
        </div>
      </div>
    </div>
  );
};
