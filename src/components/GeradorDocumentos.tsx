/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
import {
  Upload, Printer, FileText, AlertTriangle, CheckCircle,
  ClipboardList, Users, Package, RefreshCw
} from 'lucide-react';

// ─── ESTRUTURA DOS DISPENSÁRIOS ──────────────────────────────────────────────
const estruturaDispensarios: Record<string, Record<string, string[]>> = {
  "Dispensário A1": {
    "Módulo 1": ["007","008","009","010","011","012","013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
    "Módulo 3": ["050","051","052","053","054","055","056","057"],
  },
  "Dispensário A2": {
    "Módulo 1": ["007","008","009","010","011","012","013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
    "Módulo 3": ["050","051","052","053","054","055","056","057"],
  },
  "Dispensário E2": {
    "Módulo 1": ["007","008","009","010","011","012","013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
    "Módulo 3": ["050","051","052","053","054","055","056","057"],
  },
  "Dispensário UTI 4": {
    "Módulo 1": ["013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
  },
  "Dispensário UTI 5": {
    "Módulo 1": ["013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
  },
  "Dispensário UTI 6": {
    "Módulo 1": ["013","014","015","016","017","018","019","020","021","022","023","024","025","026","027","028","029","030","031","032","033","034","035","036","037","038","039","040","041","042","043","044","045"],
    "Módulo 2": ["046","047","048","049"],
  },
  "Radiologia": {
    "Módulo Único": ["001","002","003","004","005","006","007","008","009","010","011","012","013","014","015","016","017","018","019","020"],
  },
};

type ViewMode = 'modulos' | 'alertas' | 'enfermagem';
type CsvAlerts = Record<string, Record<string, { desc: string; user: string; date: string; op: string }[]>>;

// ─── COMPONENT ───────────────────────────────────────────────────────────────
export function GeradorDocumentos() {
  const [viewMode, setViewMode] = useState<ViewMode>('modulos');
  const [activeDispensario, setActiveDispensario] = useState('Dispensário A1');
  const [activeSubTab, setActiveSubTab] = useState('Módulo 1');
  const [rows, setRows] = useState<{ id: string; items: any[] }[]>([]);
  const [drawerNumbers, setDrawerNumbers] = useState<string[]>([]);
  const [allDrawersForAlertDiagram, setAllDrawersForAlertDiagram] = useState<string[]>([]);
  const [csvAlerts, setCsvAlerts] = useState<CsvAlerts>({});
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let nums: string[] = [];
    if (viewMode === 'alertas' || viewMode === 'enfermagem') {
      nums = Object.keys(csvAlerts[activeDispensario] || {}).sort((a, b) => parseInt(a) - parseInt(b));
      let all: string[] = [];
      Object.values(estruturaDispensarios[activeDispensario] || {}).forEach(m => { all = [...all, ...m]; });
      setAllDrawersForAlertDiagram(all);
    } else {
      nums = estruturaDispensarios[activeDispensario]?.[activeSubTab] || [];
    }
    setDrawerNumbers(nums);
    setRows(nums.map(num => ({ id: num, items: csvAlerts[activeDispensario]?.[num] || [] })));
  }, [activeDispensario, activeSubTab, csvAlerts, viewMode]);

  const showMessage = (text: string, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: '', type: '' }), 6000);
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const lines = text.split('\n');
        const headers = lines[0].split(',');
        const gIdx    = headers.findIndex(h => h.trim().toLowerCase().includes('gaveta'));
        const dIdx    = headers.findIndex(h => h.trim().toLowerCase().includes('descrição') || h.trim().toLowerCase().includes('produto'));
        const dispIdx = headers.findIndex(h => h.trim().toLowerCase().includes('dispensário') || h.trim().toLowerCase().includes('dispensario'));
        const userIdx = headers.findIndex(h => h.trim().toLowerCase().includes('usuário') || h.trim().toLowerCase().includes('usuario'));
        const dateIdx = headers.findIndex(h => h.trim().toLowerCase().includes('data/hora') || h.trim().toLowerCase().includes('data'));
        const opIdx   = headers.findIndex(h => h.trim().toLowerCase().includes('operação') || h.trim().toLowerCase().includes('operacao'));
        const idxGaveta = gIdx >= 0 ? gIdx : 1;
        const idxDesc   = dIdx >= 0 ? dIdx : 3;
        const idxDisp   = dispIdx >= 0 ? dispIdx : 10;
        const parsed: CsvAlerts = { ...csvAlerts };
        for (let i = 1; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          const cols = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
          if (cols.length > Math.max(idxGaveta, idxDesc)) {
            const gaveta = cols[idxGaveta]?.replace(/"/g, '').trim();
            const desc   = cols[idxDesc]?.replace(/"/g, '').trim();
            const disp   = cols[idxDisp]?.replace(/"/g, '').trim() || '';
            const user   = userIdx >= 0 ? cols[userIdx]?.replace(/"/g, '').trim() : 'Não Identificado';
            const dateStr = dateIdx >= 0 ? cols[dateIdx]?.replace(/"/g, '').trim() : '';
            const op     = opIdx >= 0 ? cols[opIdx]?.replace(/"/g, '').trim() : '-';
            let date = dateStr;
            if (dateStr?.includes('-')) {
              const parts = dateStr.split(' ');
              const dp = parts[0].split('-');
              if (dp.length === 3) date = `${dp[2]}/${dp[1]}/${dp[0]} ${parts[1]?.substring(0, 5) || ''}`;
            }
            if (gaveta && desc) {
              let targetDisp = 'Dispensário A1';
              if (disp.includes('A1'))     targetDisp = 'Dispensário A1';
              else if (disp.includes('A2'))     targetDisp = 'Dispensário A2';
              else if (disp.includes('E2'))     targetDisp = 'Dispensário E2';
              else if (disp.includes('UTI 4')) targetDisp = 'Dispensário UTI 4';
              else if (disp.includes('UTI 5')) targetDisp = 'Dispensário UTI 5';
              else if (disp.includes('UTI 6')) targetDisp = 'Dispensário UTI 6';
              else if (disp.includes('RADIO')) targetDisp = 'Radiologia';
              if (!parsed[targetDisp]) parsed[targetDisp] = {};
              if (!parsed[targetDisp][gaveta]) parsed[targetDisp][gaveta] = [];
              const exists = parsed[targetDisp][gaveta].some(item => item.desc === desc && item.date === date);
              if (!exists) parsed[targetDisp][gaveta].push({ desc, user, date, op });
            }
          }
        }
        setCsvAlerts(parsed);
        setViewMode('enfermagem');
        showMessage('CSV importado com sucesso! Dados extraídos.', 'success');
      } catch {
        showMessage('Erro ao processar o CSV.', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportPDF = () => {
    const element = document.getElementById('doc-container');
    if (!element) return;
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.no-export').forEach(el => el.remove());
    const printWindow = window.open('', '_blank');
    if (!printWindow) { showMessage("Bloqueio do navegador: use Ctrl+P para imprimir.", 'error'); return; }
    let title = `Controle_Limpeza_${activeSubTab}_${activeDispensario}`;
    if (viewMode === 'alertas')    title = `Alertas_Estoque_${activeDispensario}`;
    if (viewMode === 'enfermagem') title = `Feedback_Farmacia_${activeDispensario}`;
    showMessage('Preparando PDF numa nova aba...', 'success');
    printWindow.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <script src="https://cdn.tailwindcss.com"><\/script>
      <style>
        @page{margin:8mm;size:A4 landscape;}
        body{background:white!important;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-family:ui-sans-serif,system-ui,sans-serif;}
        .page-container{width:100%!important;max-width:none!important;box-shadow:none!important;border:none!important;}
        table{width:100%!important;table-layout:fixed!important;border-collapse:collapse!important;}
        tr{page-break-inside:avoid!important;break-inside:avoid!important;}
        td,th{page-break-inside:avoid!important;break-inside:avoid!important;}
        thead{display:table-header-group!important;}
      </style></head><body>
      <div class="page-container p-6 bg-white w-full max-w-[1123px] mx-auto">${clone.innerHTML}</div>
      <script>setTimeout(()=>window.print(),1200);<\/script></body></html>`);
    printWindow.document.close();
  };

  const modeConfig = {
    modulos:    { color: 'indigo', label: 'Rotina / Limpeza',       accentBg: '#2b4c7e', accentLight: '#e8eef5', border: '#2b4c7e' },
    alertas:    { color: 'amber',  label: 'Reposição Farmácia',     accentBg: '#d97706', accentLight: '#fffbeb', border: '#d97706' },
    enfermagem: { color: 'rose',   label: 'Feedback Enfermagem',    accentBg: '#be123c', accentLight: '#fff1f2', border: '#be123c' },
  };
  const cfg = modeConfig[viewMode];

  return (
    <div className="space-y-5">
      {/* Toast */}
      {message.text && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-2xl z-50 text-white text-sm font-bold flex items-center gap-2 transition-all ${
          message.type === 'error' ? 'bg-red-600' : message.type === 'success' ? 'bg-emerald-600' : 'bg-blue-600'
        }`}>
          {message.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h1 className="text-xl font-black text-slate-900">Gerador de Documentos</h1>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full">
              {activeDispensario}
            </span>
          </div>
          <p className="text-xs text-slate-400">Folhas de controle, reposição e feedback para dispensários hospitalares</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="file" accept=".csv" ref={csvInputRef} onChange={handleCSVUpload} className="hidden" />
          <button onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-slate-700 hover:bg-slate-800 rounded-lg px-3 py-1.5 shadow-sm transition-colors">
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Importar CSV
          </button>
          <button onClick={handleExportPDF}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg px-3 py-1.5 shadow-sm transition-colors">
            <Printer className="w-3.5 h-3.5" />
            Exportar / Imprimir PDF
          </button>
        </div>
      </div>

      {/* ── Painel de controle ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-5">

        {/* Seletor de modo */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
          {([
            { id: 'modulos',    label: 'Rotina / Limpeza',    icon: <ClipboardList className="w-3.5 h-3.5" /> },
            { id: 'alertas',    label: 'Reposição Farmácia',  icon: <Package className="w-3.5 h-3.5" /> },
            { id: 'enfermagem', label: 'Feedback Enfermagem', icon: <Users className="w-3.5 h-3.5" /> },
          ] as { id: ViewMode; label: string; icon: React.ReactNode }[]).map(({ id, label, icon }) => {
            const active = viewMode === id;
            const colors: Record<ViewMode, string> = {
              modulos:    'bg-white text-indigo-700 shadow-sm',
              alertas:    'bg-white text-amber-700 shadow-sm',
              enfermagem: 'bg-white text-rose-700 shadow-sm',
            };
            return (
              <button key={id} onClick={() => setViewMode(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-bold transition-all ${
                  active ? colors[id] : 'text-slate-500 hover:text-slate-700'
                }`}>
                {icon}{label}
              </button>
            );
          })}
        </div>

        {/* Seleção do dispensário */}
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Dispensário</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {Object.keys(estruturaDispensarios).map(disp => {
              const active = activeDispensario === disp;
              const border = active
                ? viewMode === 'alertas'    ? 'border-amber-400 bg-amber-50 text-amber-700'
                : viewMode === 'enfermagem' ? 'border-rose-400 bg-rose-50 text-rose-700'
                : 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50';
              return (
                <button key={disp}
                  onClick={() => { setActiveDispensario(disp); setActiveSubTab(Object.keys(estruturaDispensarios[disp])[0]); }}
                  className={`px-3 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wide border-2 transition-all ${border}`}>
                  {disp}
                </button>
              );
            })}
          </div>
        </div>

        {/* Seleção de módulo (só no modo limpeza) */}
        {viewMode === 'modulos' && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Módulo</p>
            <div className="flex flex-wrap gap-2">
              {Object.keys(estruturaDispensarios[activeDispensario]).map(sub => (
                <button key={sub} onClick={() => setActiveSubTab(sub)}
                  className={`px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wide border-2 transition-all ${
                    activeSubTab === sub
                      ? 'bg-slate-800 text-white border-slate-800 shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}>
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Banners contextuais */}
        {viewMode === 'alertas' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            Lista para <strong>Reposicionamento Farmacêutico</strong> das gavetas com alertas do {activeDispensario}.
            {Object.keys(csvAlerts).length === 0 && <span className="ml-1 text-amber-600">— Importe um CSV para popular os dados.</span>}
          </div>
        )}
        {viewMode === 'enfermagem' && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 text-xs text-rose-800">
            Formulário <strong>Farmácia → Enfermagem</strong> para apuração e justificativa dos alertas de estoque.
            {Object.keys(csvAlerts).length === 0 && <span className="ml-1 text-rose-600">— Importe um CSV para popular os dados.</span>}
          </div>
        )}
      </div>

      {/* ── Prévia do documento ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Barra de preview */}
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400 font-mono ml-2">
              {viewMode === 'modulos' ? `controle_limpeza_${activeSubTab.toLowerCase().replace(' ', '_')}.pdf`
               : viewMode === 'alertas' ? `alertas_reposicao_${activeDispensario.toLowerCase().replace(/\s/g, '_')}.pdf`
               : `feedback_enfermagem_${activeDispensario.toLowerCase().replace(/\s/g, '_')}.pdf`}
            </span>
          </div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            {cfg.label} · {drawerNumbers.length} gaveta(s)
          </span>
        </div>

        {/* Documento */}
        <div id="doc-container" className="p-8 bg-white min-h-[600px]">

          {/* ─── MODO 1: LIMPEZA ────────────────────────────────────────── */}
          {viewMode === 'modulos' && (
            <>
              <div style={{ borderBottom: `4px solid #2b4c7e`, paddingBottom: '12px', marginBottom: '20px' }}>
                <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '-0.3px', margin: 0 }}>
                  FOLHA DE LIMPEZA E CONTROLE DE VALIDADE
                </h1>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#1d4ed8', textTransform: 'uppercase', marginTop: '4px', margin: 0 }}>
                  — {activeSubTab.toUpperCase()} · {activeDispensario.toUpperCase()}
                </h2>
                <p style={{ fontSize: '10px', color: '#64748b', marginTop: '6px', margin: '6px 0 0' }}>
                  Data: ___/___/________ &nbsp;&nbsp; Turno: _________ &nbsp;&nbsp; Responsável: _________________________________
                </p>
              </div>

              {/* Diagrama de gavetas (sem-export) */}
              <div className="no-export" style={{ background: '#f4f7fa', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', margin: '0 0 8px' }}>
                  Mapa de Gavetas — {activeSubTab}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', background: '#d1d5db', borderRadius: '4px', padding: '2px', overflow: 'hidden' }}>
                  {drawerNumbers.map((num, i) => (
                    <div key={i} style={{ background: '#e2e8f0', minWidth: '44px', flex: '1 1 10%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: '#374151', padding: '6px 0', borderRadius: '2px' }}>
                      {num}
                    </div>
                  ))}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#2b4c7e', color: 'white' }}>
                    <th style={{ border: '1px solid #94a3b8', padding: '6px 4px', width: '5%', textAlign: 'center' }}>GAV.</th>
                    <th colSpan={3} style={{ border: '1px solid #94a3b8', padding: '6px 4px', width: '26%', textAlign: 'center' }}>CONTROLE DE LIMPEZA</th>
                    <th colSpan={5} style={{ border: '1px solid #94a3b8', padding: '6px 4px', width: '44%', textAlign: 'center' }}>CONTROLE DE VALIDADE</th>
                    <th colSpan={2} style={{ border: '1px solid #94a3b8', padding: '6px 4px', width: '25%', textAlign: 'center' }}>AÇÕES / OBS.</th>
                  </tr>
                  <tr style={{ background: '#466a9c', color: 'white', fontSize: '8px', textTransform: 'uppercase' }}>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', textAlign: 'center' }}>ID</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '7%', textAlign: 'center' }}>Últ. Limpeza</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '7%', textAlign: 'center' }}>Próx. Limpeza</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '12%', textAlign: 'center' }}>Responsável</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '14%', textAlign: 'center' }}>Conteúdo (Item)</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '6%', textAlign: 'center' }}>Lote</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '8%', textAlign: 'center' }}>Validade</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '8%', textAlign: 'center' }}>Prazo Curto</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '8%', textAlign: 'center' }}>Status Visual</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '12%', textAlign: 'center' }}>AÇÃO</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '4px 2px', width: '13%', textAlign: 'center' }}>OBSERVAÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#eff6ff' : 'white', pageBreakInside: 'avoid', minHeight: '60px' }}>
                      <td style={{ border: '1px solid #cbd5e1', textAlign: 'center', fontWeight: 700, background: '#e8eef5', color: '#334155', height: '60px', fontSize: '11px' }}>{row.id}</td>
                      <td style={{ border: '1px solid #cbd5e1' }} />
                      <td style={{ border: '1px solid #cbd5e1' }} />
                      <td style={{ border: '1px solid #cbd5e1' }} />
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontSize: '8px', fontWeight: 700, color: '#1e293b', verticalAlign: 'middle', lineHeight: '1.4' }}>
                        {row.items.map((it: any) => it.desc).join('\n')}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1' }} />
                      <td style={{ border: '1px solid #cbd5e1' }} />
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontSize: '8px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>[ ] &lt; 30d</span><span>[ ] &lt; 60d</span><span>[ ] &lt; 90d</span>
                        </div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontSize: '8.5px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span>[ ] Conf.</span><span>[ ] Não Conf.</span>
                        </div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '4px', fontSize: '8.5px', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span>[ ] Reabastecer</span><span>[ ] Descartar</span><span>[ ] Reembalar</span>
                        </div>
                      </td>
                      <td style={{ border: '1px solid #cbd5e1' }} />
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: '48px', paddingBottom: '16px' }}>
                <div style={{ width: '240px', borderTop: '1px solid #1e293b', textAlign: 'center', paddingTop: '4px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Supervisor / Responsável
                </div>
              </div>
            </>
          )}

          {/* ─── MODO 2: REPOSIÇÃO ──────────────────────────────────────── */}
          {viewMode === 'alertas' && (
            <>
              <div style={{ borderBottom: '4px solid #d97706', paddingBottom: '12px', marginBottom: '20px', position: 'relative' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, background: '#fef3c7', color: '#92400e', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #fcd34d', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Ação Prioritária
                </div>
                <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', margin: 0 }}>RELATÓRIO DE REABASTECIMENTO E ALERTAS</h1>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', margin: '4px 0 0' }}>— {activeDispensario.toUpperCase()}</h2>
                <p style={{ fontSize: '10px', color: '#64748b', margin: '6px 0 0' }}>
                  Data: ___/___/________ &nbsp;&nbsp; Responsável Reposição: _________________________________
                </p>
              </div>

              {/* Mapa de calor (no-export) */}
              <div className="no-export" style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '10px', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 8px' }}>
                  Mapa de Gavetas em Alerta:
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', background: '#d1d5db', borderRadius: '4px', padding: '2px' }}>
                  {allDrawersForAlertDiagram.map((num, i) => {
                    const isAlert = drawerNumbers.includes(num);
                    return (
                      <div key={i} style={{ background: isAlert ? '#f59e0b' : '#f3f4f6', color: isAlert ? 'white' : '#d1d5db', minWidth: '32px', flex: '1 1 8%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, padding: '5px 0', borderRadius: '2px', transition: 'all 0.2s' }}>
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#d97706', color: 'white', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                    <th style={{ border: '1px solid #94a3b8', padding: '8px', width: '10%', textAlign: 'center' }}>Gaveta</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '8px', width: '45%', textAlign: 'left' }}>Descrição do Produto / Item</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '8px', width: '15%', textAlign: 'center' }}>Qtd. Reposta</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '8px', width: '15%', textAlign: 'center' }}>Observações</th>
                    <th style={{ border: '1px solid #94a3b8', padding: '8px', width: '15%', textAlign: 'center' }}>Visto Farmácia</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? rows.map((row, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? '#fffbeb' : 'white', height: '54px', pageBreakInside: 'avoid' }}>
                      <td style={{ border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '14px', fontWeight: 900, background: '#fef3c7', color: '#92400e' }}>{row.id}</td>
                      <td style={{ border: '1px solid #cbd5e1', padding: '6px 10px', fontWeight: 700, color: '#1e293b', fontSize: '9.5px', lineHeight: '1.5' }}>
                        {row.items.length > 0
                          ? row.items.map((it: any) => it.desc).join('\n\n')
                          : <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 400 }}>Item desconhecido</span>}
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                      </td>
                      <td style={{ border: '1px solid #cbd5e1', position: 'relative' }}>
                        <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5} style={{ border: '1px solid #cbd5e1', textAlign: 'center', padding: '48px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
                          <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          <span style={{ fontWeight: 700, fontSize: '14px' }}>Sem alertas pendentes!</span>
                          <span style={{ fontSize: '12px', opacity: 0.7 }}>Importe um CSV para popular os dados.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-around', paddingTop: '56px', paddingBottom: '16px' }}>
                <div style={{ width: '220px', borderTop: '1px solid #1e293b', textAlign: 'center', paddingTop: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Responsável Reposição</div>
                <div style={{ width: '220px', borderTop: '1px solid #1e293b', textAlign: 'center', paddingTop: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Conferência</div>
              </div>
            </>
          )}

          {/* ─── MODO 3: FEEDBACK ENFERMAGEM ────────────────────────────── */}
          {viewMode === 'enfermagem' && (
            <>
              <div style={{ borderBottom: '4px solid #be123c', paddingBottom: '12px', marginBottom: '16px', position: 'relative' }}>
                <div style={{ position: 'absolute', right: 0, top: 0, background: '#fff1f2', color: '#9f1239', fontWeight: 700, padding: '4px 10px', borderRadius: '6px', fontSize: '11px', border: '1px solid #fda4af', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Farmácia ↔ Enfermagem
                </div>
                <h1 style={{ fontSize: '20px', fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', margin: 0 }}>FEEDBACK DE REPOSIÇÃO: FARMÁCIA → ENFERMAGEM</h1>
                <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#be123c', textTransform: 'uppercase', margin: '4px 0 0' }}>— {activeDispensario.toUpperCase()}</h2>
              </div>
              <div style={{ background: '#fff1f2', border: '1px solid #fda4af', borderRadius: '8px', padding: '10px 12px', fontSize: '10px', color: '#9f1239', marginBottom: '16px', lineHeight: '1.6' }}>
                <strong>Objetivo:</strong> Este relatório é emitido pela Farmácia para notificar a equipe de Enfermagem sobre as gavetas que geraram alertas de estoque. Constam abaixo os dados da última movimentação sistêmica antes do alerta de ruptura. <strong>Solicitamos apuração, justificativa e ciência do colaborador envolvido.</strong>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', tableLayout: 'fixed' }}>
                <thead>
                  <tr style={{ background: '#be123c', color: 'white', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                    <th style={{ border: '1px solid #9f1239', padding: '8px', width: '7%', textAlign: 'center' }}>Gaveta</th>
                    <th style={{ border: '1px solid #9f1239', padding: '8px', width: '32%', textAlign: 'left' }}>Item com Alerta</th>
                    <th style={{ border: '1px solid #9f1239', padding: '8px', width: '25%', textAlign: 'left' }}>Última Movimentação</th>
                    <th style={{ border: '1px solid #9f1239', padding: '8px', width: '21%', textAlign: 'left' }}>Justificativa Enfermagem</th>
                    <th style={{ border: '1px solid #9f1239', padding: '8px', width: '15%', textAlign: 'center' }}>Visto Colaborador</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length > 0 ? rows.map((row, i) =>
                    row.items.length > 0
                      ? row.items.map((item: any, j: number) => (
                          <tr key={`${i}-${j}`} style={{ background: 'white', borderBottom: '2px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                            <td style={{ border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '14px', fontWeight: 900, background: '#fff1f2', color: '#9f1239', verticalAlign: 'middle' }}>
                              {row.id}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontWeight: 700, color: '#1e293b', fontSize: '10px', lineHeight: '1.4', verticalAlign: 'middle' }}>
                              {item.desc}
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', padding: '8px 10px', fontSize: '9px', color: '#475569', verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <span style={{ fontWeight: 700, color: '#1e293b' }}>👤 {item.user}</span>
                                <span style={{ color: '#be123c', fontWeight: 600 }}>⚡ {item.op}</span>
                                <span style={{ color: '#64748b' }}>📅 {item.date || 'Sem data'}</span>
                              </div>
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', position: 'relative', height: '60px' }}>
                              <div style={{ position: 'absolute', bottom: '10px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                              <div style={{ position: 'absolute', bottom: '28px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                            </td>
                            <td style={{ border: '1px solid #cbd5e1', position: 'relative' }}>
                              <div style={{ position: 'absolute', bottom: '12px', left: '8px', right: '8px', borderBottom: '1px dashed #94a3b8' }} />
                            </td>
                          </tr>
                        ))
                      : (
                          <tr key={i} style={{ background: 'white', borderBottom: '2px solid #e2e8f0' }}>
                            <td style={{ border: '1px solid #cbd5e1', textAlign: 'center', fontSize: '14px', fontWeight: 900, background: '#fff1f2', color: '#9f1239', height: '40px' }}>{row.id}</td>
                            <td colSpan={4} style={{ border: '1px solid #cbd5e1', padding: '10px', color: '#94a3b8', fontStyle: 'italic', fontSize: '10px' }}>Sem detalhes registrados.</td>
                          </tr>
                        )
                  ) : (
                    <tr>
                      <td colSpan={5} style={{ border: '1px solid #cbd5e1', textAlign: 'center', padding: '48px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: '#16a34a' }}>
                          <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          <span style={{ fontWeight: 700, fontSize: '14px' }}>Sem ocorrências!</span>
                          <span style={{ fontSize: '12px', opacity: 0.7 }}>Importe um CSV para popular os dados.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-around', paddingTop: '56px', paddingBottom: '16px' }}>
                <div style={{ width: '240px', borderTop: '1px solid #1e293b', textAlign: 'center', paddingTop: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Assinatura (Farmacêutico)</div>
                <div style={{ width: '240px', borderTop: '1px solid #1e293b', textAlign: 'center', paddingTop: '6px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Ciente Liderança (Enfermagem)</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
