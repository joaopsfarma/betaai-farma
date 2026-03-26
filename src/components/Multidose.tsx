import React, { useState, useMemo, useEffect } from 'react';
import { FileText, Activity, Package, Search, Download, Filter, FileOutput } from 'lucide-react';

// --- Utilitários de Parsing ---

const parseBrFloat = (str: string | number) => {
  if (!str) return 0;
  if (typeof str === 'number') return str;
  const cleanStr = String(str).replace(/"/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : num;
};

const parseCSV = (text: string, delimiter: string) => {
  let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
  for (l of text) {
    if ('"' === l) {
      if (s && l === p) row[i] += l;
      s = !s;
    } else if (delimiter === l && s) l = row[++i] = '';
    else if ('\n' === l && s) {
      if ('\r' === p) row[i] = row[i].slice(0, -1);
      row = ret[++r] = [l = '']; i = 0;
    } else row[i] += l;
    p = l;
  }
  return ret.filter(r => r.join('').trim() !== '');
};

// Converte nome completo em Iniciais (ex: "JOAO DA SILVA" -> "JS")
const getInitials = (name: string) => {
  if (!name) return '';
  const ignore = ['DE', 'DA', 'DO', 'DAS', 'DOS'];
  return name
    .trim()
    .split(/\s+/)
    .filter(word => !ignore.includes(word.toUpperCase()))
    .map(word => word[0])
    .join('')
    .toUpperCase();
};

// --- Componente Principal ---

export function Multidose() {
  const [files, setFiles] = useState<{ estoque: File | null, multidose: File | null }>({ estoque: null, multidose: null });
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMUC, setFilterMUC] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false); 

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'estoque' | 'multidose') => {
    const file = e.target.files?.[0];
    if (file) setFiles(prev => ({ ...prev, [type]: file }));
  };

  const processFiles = async () => {
    if (!files.estoque && !files.multidose) {
      alert("Por favor, selecione os arquivos de Estoque e Multidose para processar.");
      return;
    }

    setLoading(true);
    
    // Lista atualizada do De-Para de itens prescritos (Marca) para itens do estoque (Genérico)
    const DE_PARA_CODIGOS: Record<string, string> = {
      "1928": "1927",     
      "2035": "181276",   
      "1398": "1398",     
      "1281": "159908",   
      "23863": "23863",   
      "1825": "1825",     
      "16238": "3238",    
      "1296": "1295",     
      "1274": "94106",    
      "2967": "159982",   
      "895": "210355"     
    }; 

    const CODIGOS_PERMITIDOS = new Set(Object.values(DE_PARA_CODIGOS));

    const DESCRICOES_PADRAO_MV: Record<string, string> = {
      "1927": "IBUPROFENO 100MG/ML20ML FR GTS MEDLEY",
      "181276": "IPRATROPIO 0,25 MG/ML20ML FR INAL GTS-PRATI",
      "1398": "BUSCOPAN 10MG/ML20ML FR GTSESCOPOLAMINA",
      "159908": "DIPIRONA 50 MG/ML-100 ML FR SOL-ACHE",
      "23863": "GROW VIT BB 20ML FR GTS-POLIVITAMINICO",
      "1825": "HALDOL 2MG/ML-30ML FR GTS-HALOPERIDOL",
      "3238": "SIMETICONA 75MG/ML15ML FR GTS EMS",
      "1295": "DOMPERIDONA 1MG/ML100ML FR SUSP MEDLEY",
      "94106": "DIPIRONA 500MG/ML-10ML FR GTS EMS",
      "159982": "PREDNISOLONA FOSF SOD 3 MG/ML120 ML FR",
      "210355": "CLOPAM 2,5 MG/ML-20ML FR SOL ORAL (CLONAzepam)"
    };

    const UNIDADES_MEDIDA: Record<string, string> = {
      "1927": "Gotas",
      "181276": "Gotas",
      "1398": "Gotas",
      "159908": "ml",
      "23863": "Gotas",
      "1825": "Gotas",
      "3238": "Gotas",
      "1295": "ml",
      "94106": "Gotas",
      "159982": "ml",
      "210355": "Gotas"
    };

    const stockMap = new Map();
    const reportData: any[] = [];

    try {
      if (files.estoque) {
        const text = await files.estoque.text();
        const rows = parseCSV(text, ',');
        let currentProductCode: string | null = null; 
        
        rows.forEach(row => {
          const codigo = row[1];
          const estoqueStr = row[6] || row[5] || row[7];
          const loteStr = row[8];
          const valStr = row[10];
          const qtdLoteStr = row[18] || row[17] || row[19] || row[16]; 
          
          if (codigo && estoqueStr !== undefined) {
            const estoque = parseBrFloat(estoqueStr);
            if (estoque >= 0) { 
               currentProductCode = String(codigo).trim();
               if (!stockMap.has(currentProductCode)) {
                 stockMap.set(currentProductCode, { lotes: [] });
               }

               if (loteStr && String(loteStr).trim() !== 'Lote' && String(loteStr).trim() !== '') {
                  const qtdLote = parseBrFloat(qtdLoteStr);
                  if (qtdLote > 0) {
                    stockMap.get(currentProductCode).lotes.push({ lote: String(loteStr).trim(), validade: valStr, qtd: qtdLote });
                  }
               }
            } else {
               currentProductCode = null; 
            }
          } else if (!codigo && loteStr && currentProductCode) {
             if (String(loteStr).trim() !== '' && String(loteStr).trim() !== 'Lote') {
                const qtdLote = parseBrFloat(qtdLoteStr);
                if (qtdLote > 0) {
                  stockMap.get(currentProductCode).lotes.push({ lote: String(loteStr).trim(), validade: valStr, qtd: qtdLote });
                }
             }
          }
        });
      }

      if (files.multidose) {
        const text = await files.multidose.text();
        const rows = parseCSV(text, ';');
        
        rows.forEach((row, index) => {
          if (index === 0 || row.length < 10) return; 
          
          const atendimento = row[0];
          const pacienteOriginal = row[1];
          const rawCodigo = row[3]; 
          const itemPresc = row[4]; 
          const nomePrescricao = row[5];   
          const qtdStr = row[9]; 
          const setorOriginal = row[11]; // Nova linha extraindo o Setor / Uni.Inter
          const esquema = row[12] ? String(row[12]).trim().toUpperCase() : '';
          
          if (rawCodigo) {
            const codigoStr = String(rawCodigo).trim();
            const codigoMV = DE_PARA_CODIGOS[codigoStr] || codigoStr;
            
            if (CODIGOS_PERMITIDOS.has(codigoMV)) {
              let rawQtd = parseBrFloat(qtdStr); 
              let qtdConvertida = rawQtd; 
              
              if (UNIDADES_MEDIDA[codigoMV] === "Gotas") {
                qtdConvertida = rawQtd / 20;
              }

              const isMUC = esquema.includes('MUC');
              const stockInfo = stockMap.get(codigoMV) || { lotes: [] };

              reportData.push({
                codigoMV: codigoMV,
                nomeEstoque: DESCRICOES_PADRAO_MV[codigoMV] || '',
                codItemPresc: itemPresc || '-',
                itemPrescNome: nomePrescricao || 'Produto não identificado',
                atendimento: atendimento || '-',
                setor: setorOriginal || '-', // Nova linha associando o Setor ao item
                pacienteOriginal: pacienteOriginal || '-', 
                pacienteIniciais: getInitials(pacienteOriginal) || '-', 
                dose: qtdConvertida,
                doseOriginal: rawQtd,
                unidade: UNIDADES_MEDIDA[codigoMV] || 'Doses',
                lotes: stockInfo.lotes,
                isMUC: isMUC
              });
            }
          }
        });
      }

      reportData.sort((a, b) => {
        if (a.atendimento !== b.atendimento) {
          return a.atendimento.localeCompare(b.atendimento);
        }
        return a.nomeEstoque.localeCompare(b.nomeEstoque);
      });

      setData(reportData);

    } catch (error) {
      console.error("Erro ao processar arquivos:", error);
      alert("Houve um erro ao ler os arquivos. Verifique se o formato está correto.");
    } finally {
      setLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return data.filter(item => {
      if (filterMUC && !item.isMUC) return false;

      const nomeEStr = item.nomeEstoque || '';
      const nomePStr = item.itemPrescNome || '';
      const codigoMVStr = String(item.codigoMV || '');
      const atendimentoStr = String(item.atendimento || '');
      const setorStr = String(item.setor || ''); // Adicionado para pesquisa
      const pacienteOriginalStr = String(item.pacienteOriginal || ''); 
      const searchLower = searchTerm.toLowerCase();
      
      return nomeEStr.toLowerCase().includes(searchLower) || 
             nomePStr.toLowerCase().includes(searchLower) ||
             pacienteOriginalStr.toLowerCase().includes(searchLower) ||
             setorStr.toLowerCase().includes(searchLower) || // Permite filtrar pelo Setor
             atendimentoStr.includes(searchTerm) ||
             codigoMVStr.includes(searchTerm);
    });
  }, [data, searchTerm, filterMUC]);

  const exportToCSV = () => {
    if (filteredData.length === 0) return;
    const headers = [
      "Código MV", "Cód. Item Prescrição", "Item de Prescrição", "Dose Prescrita (ML)", 
      "Atendimento", "Setor", "Paciente", "Lotes e Qtd Disponível", "Qtd. Dispensada (ML)", "Visto Farmácia", "Visto Enfermagem"
    ];
    
    const csvContent = [
      headers.join(";"),
      ...filteredData.map(row => {
        const lotesStr = row.lotes && row.lotes.length > 0 
          ? row.lotes.map((l: any) => `${l.lote} (${l.qtd} ML)`).join(' / ') 
          : 'Sem lotes';
          
        const prescritoStr = row.dose > 0 
          ? (row.unidade === 'Gotas' 
              ? `"${row.dose.toFixed(2)} ML (${row.doseOriginal} Gotas)"` 
              : `"${row.dose.toFixed(2)} ML"`) 
          : '"0"';

        return `"${row.codigoMV}";"${row.codItemPresc}";"${row.itemPrescNome}";${prescritoStr};"${row.atendimento}";"${row.setor}";"${row.pacienteIniciais}";"${lotesStr}";"";"";""`;
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "controle_multidose_uti.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Função para Exportar Word mantendo o Layout
  const exportToWord = () => {
    if (filteredData.length === 0) return;

    let tableHTML = `
      <table border="1" style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 10px; border-color: #999;">
        <thead>
          <tr style="background-color: #f3f4f6; text-transform: uppercase; font-size: 11px;">
            <th style="padding: 6px;">Cód. MV</th>
            <th style="padding: 6px;">Cód. Presc.</th>
            <th style="padding: 6px; width: 220px;">Item Prescrição (Marca)</th>
            <th style="padding: 6px; text-align: center;">Dose Prescrita (ML)</th>
            <th style="padding: 6px; width: 180px;">Atend. / Setor / Paciente</th>
            <th style="padding: 6px; width: 200px;">Lotes & Qtd Disp. (MV)</th>
            <th style="padding: 6px; width: 70px;">Qtd. Disp. (ML)</th>
            <th style="padding: 6px; width: 80px;">Visto Farmácia</th>
            <th style="padding: 6px; width: 80px;">Visto Enferm.</th>
          </tr>
        </thead>
        <tbody>
    `;

    filteredData.forEach(row => {
      const lotesStr = row.lotes && row.lotes.length > 0 
        ? row.lotes.map((l: any) => `<span style="font-family: monospace;"><b>${l.lote}</b></span> <b>Qtd: ${l.qtd} ML</b>`).join('<br>') 
        : '<span style="color: red;">Sem lotes em estoque</span>';
        
      const prescritoStr = row.dose > 0 
        ? (row.unidade === 'Gotas' 
            ? `<b>${row.dose.toFixed(2)} ML</b><br><span style="color: #666; font-size: 8px;">(${row.doseOriginal} gotas)</span>` 
            : `<b>${row.dose.toFixed(2)} ML</b>`) 
        : '-';

      tableHTML += `
        <tr>
          <td style="padding: 6px; font-weight: bold;">${row.codigoMV}</td>
          <td style="padding: 6px; font-family: monospace;">${row.codItemPresc}</td>
          <td style="padding: 6px;"><b>${row.itemPrescNome}</b><br><span style="color: #666; font-size: 9px;">Equiv: ${row.nomeEstoque}</span></td>
          <td style="padding: 6px; text-align: center;">${prescritoStr}</td>
          <td style="padding: 6px;"><b style="color: #1d4ed8;">Atend: ${row.atendimento}</b><br><span style="font-size: 9px; font-weight: bold; color: #555;">${row.setor}</span><br><span style="font-family: monospace;">${row.pacienteIniciais}</span></td>
          <td style="padding: 6px;">${lotesStr}</td>
          <td style="padding: 6px;"></td>
          <td style="padding: 6px;"></td>
          <td style="padding: 6px;"></td>
        </tr>
      `;
    });

    for(let i=0; i<4; i++) {
       tableHTML += `<tr><td style="padding: 15px;"></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }

    tableHTML += `</tbody></table>`;

    // Cabeçalho HTML com regras MSO para forçar o layout em Modo Paisagem (Landscape) no Word
    const header = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Controle Multidose - Farmácia UTI</title>
        <style>
          @page WordSection1 {
            size: 841.9pt 595.3pt; /* A4 Paisagem */
            mso-page-orientation: landscape;
            margin: 0.5in 0.5in 0.5in 0.5in;
          }
          div.WordSection1 { page: WordSection1; }
        </style>
      </head>
      <body>
        <div class="WordSection1">
          <table style="width: 100%; border-bottom: 2px solid #000; margin-bottom: 15px;">
            <tr>
              <td style="vertical-align: bottom; width: 80%;">
                <h2 style="font-family: Arial, sans-serif; text-transform: uppercase; margin: 0 0 5px 0;">Controle Multidose - Farmácia UTI</h2>
                <div style="font-family: Arial, sans-serif; font-size: 11px; color: #333;">
                  <span>Data de Impressão: ${new Date().toLocaleDateString('pt-BR')}</span><br/><br/>
                  <span>Assinatura do Responsável: ______________________________</span>
                </div>
              </td>
              <td style="vertical-align: middle; text-align: center; width: 20%;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=Seringa+Dosadora" width="80" height="80" alt="QR Code Seringa Dosadora" />
                <br/>
                <span style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold;">SERINGA DOSADORA</span>
              </td>
            </tr>
          </table>
          ${tableHTML}
        </div>
      </body>
      </html>
    `;

    const source = 'data:application/vnd.ms-word;charset=utf-8,' + encodeURIComponent(header);
    const fileDownload = document.createElement("a");
    document.body.appendChild(fileDownload);
    fileDownload.href = source;
    fileDownload.download = 'controle_multidose_uti.doc';
    fileDownload.click();
    document.body.removeChild(fileDownload);
  };

  const handleSavePDF = () => {
    try {
      window.print();
    } catch (error) {
      console.warn("A função nativa window.print() foi bloqueada pelo navegador.");
    }
    setShowPdfModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white p-6 print:p-0 font-sans text-gray-800 relative">
      <style>{`
        @media print {
          @page { size: landscape; margin: 10mm; }
        }
      `}</style>

      {showPdfModal && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-60 flex items-center justify-center z-50 print:hidden backdrop-blur-sm">
          <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-gray-100 animate-in fade-in duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <FileOutput size={32} />
              <h3 className="text-2xl font-bold text-gray-800">Salvar como PDF</h3>
            </div>
            
            <p className="text-gray-600 text-sm mb-6 leading-relaxed">
              Para garantir a qualidade máxima e o layout perfeito em modo paisagem, utilizamos o gerador nativo do seu sistema.
            </p>
            
            <div className="bg-red-50 p-5 rounded-xl mb-6 border border-red-100 shadow-inner">
              <p className="text-sm text-red-800 font-medium text-center mb-2">
                Pressione o atalho de impressão:
              </p>
              <div className="flex justify-center items-center gap-2 mb-3">
                <span className="px-4 py-2 bg-white rounded shadow text-xl font-bold text-gray-800 border border-gray-200">Ctrl</span>
                <span className="text-xl font-bold text-gray-400">+</span>
                <span className="px-4 py-2 bg-white rounded shadow text-xl font-bold text-gray-800 border border-gray-200">P</span>
              </div>
              <p className="text-sm text-center text-red-700 font-semibold bg-white p-2 rounded border border-red-200">
                Na janela que abrir, mude o Destino para <br/> "Salvar como PDF".
              </p>
            </div>
            
            <button 
              onClick={() => setShowPdfModal(false)}
              className="w-full py-3.5 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 transition-colors shadow-md"
            >
              Entendido, voltar para a tela
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[1400px] print:max-w-none mx-auto space-y-6 print:space-y-0">
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Activity className="text-blue-600" />
              Controle Multidose - Farmácia UTI
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              Faça o upload do Estoque e Painel Multidose para gerar a lista de picking por paciente.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden group">
            <div className={`p-3 rounded-full ${files.estoque ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
              <Package size={24} />
            </div>
            <div>
              <h3 className="font-semibold">Posição de Estoque</h3>
              <p className="text-xs text-gray-500">Ex: conf334.csv</p>
            </div>
            <input type="file" accept=".csv" onChange={(e) => handleFileChange(e as any, 'estoque')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            {files.estoque && <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">{files.estoque.name}</span>}
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center space-y-3 relative overflow-hidden group">
            <div className={`p-3 rounded-full ${files.multidose ? 'bg-green-100 text-green-600' : 'bg-purple-100 text-purple-600'}`}>
              <FileText size={24} />
            </div>
            <div>
              <h3 className="font-semibold">Painel Multidose (Prescrições)</h3>
              <p className="text-xs text-gray-500">Ex: PAINEL MULTIDOSE.CSV</p>
            </div>
            <input type="file" accept=".csv" onChange={(e) => handleFileChange(e as any, 'multidose')} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
            {files.multidose && <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">{files.multidose.name}</span>}
          </div>
        </div>

        <div className="flex justify-center print:hidden">
          <button 
            onClick={processFiles}
            disabled={loading}
            className={`px-8 py-3 rounded-lg font-medium text-white transition-colors shadow-sm flex items-center gap-2
              ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? 'Processando dados...' : 'Gerar Relatório de Separação'}
          </button>
        </div>

        {data.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 print:border-none print:shadow-none overflow-hidden flex flex-col">
            
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4 bg-gray-50/50 print:hidden">
              <div className="relative w-full sm:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Buscar paciente, atendimento, código..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer bg-white px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={filterMUC}
                    onChange={(e) => setFilterMUC(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <Filter size={16} className="text-gray-500" />
                  <span className="font-medium">Somente MUC</span>
                </label>
                <button 
                  onClick={exportToCSV}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
                >
                  <Download size={16} /> Exportar CSV
                </button>
                <button 
                  onClick={exportToWord}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 border border-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
                >
                  <FileText size={16} /> Salvar Word
                </button>
                <button 
                  onClick={handleSavePDF}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 border border-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium whitespace-nowrap shadow-sm"
                >
                  <FileOutput size={16} /> Salvar PDF
                </button>
              </div>
            </div>

            <div className="hidden print:flex justify-between items-end mb-4 border-b-2 border-gray-800 pb-2">
              <div>
                <h2 className="text-xl font-bold uppercase">Controle Multidose - Farmácia UTI</h2>
                <div className="text-sm mt-2 text-gray-600 space-y-2">
                  <div>Data: {new Date().toLocaleDateString('pt-BR')}</div>
                  <div>Assinatura do Responsável: ______________________________</div>
                </div>
              </div>
              <div className="flex flex-col items-center justify-center">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=Seringa+Dosadora" alt="QR Code Seringa Dosadora" className="w-16 h-16 object-contain" />
                <span className="text-[10px] font-bold mt-1 uppercase tracking-wider text-center">Seringa Dosadora</span>
              </div>
            </div>

            <div className="overflow-x-auto print:overflow-visible">
              <table className="w-full text-left text-[11px] print:text-[10px] whitespace-nowrap print:whitespace-normal border-collapse">
                <thead className="bg-gray-50 print:bg-gray-100 text-gray-700 font-bold border-b-2 border-gray-400 uppercase tracking-tight">
                  <tr>
                    <th className="px-2 py-3 print:border print:border-gray-400">Cód. MV</th>
                    <th className="px-2 py-3 print:border print:border-gray-400">Cód. Presc.</th>
                    <th className="px-2 py-3 min-w-[200px] print:border print:border-gray-400">Item Prescrição (Marca)</th>
                    <th className="px-2 py-3 text-center print:border print:border-gray-400">Dose Prescrita (ML)</th>
                    <th className="px-2 py-3 min-w-[180px] print:border print:border-gray-400">Atend. / Setor / Paciente</th>
                    <th className="px-2 py-3 min-w-[200px] print:border print:border-gray-400">Lotes & Qtd Disp. (MV)</th>
                    <th className="px-2 py-3 text-center w-[70px] print:border print:border-gray-400">Qtd. Disp. (ML)</th>
                    <th className="px-2 py-3 text-center w-[80px] print:border print:border-gray-400">Visto Farmácia</th>
                    <th className="px-2 py-3 text-center w-[80px] print:border print:border-gray-400">Visto Enferm.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 print:divide-gray-400">
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 print:hover:bg-transparent">
                      <td className="px-2 py-3 font-bold text-gray-700 align-middle print:border print:border-gray-400">{row.codigoMV}</td>
                      
                      <td className="px-2 py-3 font-mono text-gray-600 align-middle print:border print:border-gray-400">{row.codItemPresc}</td>

                      <td className="px-2 py-3 whitespace-normal align-middle print:border print:border-gray-400">
                        <div className="font-semibold text-gray-900 leading-tight">{row.itemPrescNome}</div>
                        <div className="text-[9px] text-gray-500 mt-0.5">Equiv: {row.nomeEstoque}</div>
                      </td>

                      <td className="px-2 py-3 text-center align-middle print:border print:border-gray-400">
                        {row.dose > 0 ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="font-bold text-sm">
                              {row.dose.toFixed(2)} <span className="text-[9px] font-bold uppercase">ML</span>
                            </div>
                            {row.unidade === 'Gotas' && (
                              <div className="text-[8px] text-gray-500">
                                ({row.doseOriginal} gotas)
                              </div>
                            )}
                          </div>
                        ) : '-'}
                      </td>
                      
                      <td className="px-2 py-3 whitespace-normal align-middle print:border print:border-gray-400">
                        <div className="font-bold text-blue-700 print:text-black">Atend: {row.atendimento}</div>
                        <div className="text-[10px] font-bold text-gray-600 uppercase mt-0.5">{row.setor}</div>
                        <div className="font-medium text-gray-700 mt-0.5 font-mono text-xs">{row.pacienteIniciais}</div>
                      </td>

                      <td className="px-2 py-3 whitespace-normal align-middle print:border print:border-gray-400">
                        {row.lotes && row.lotes.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {row.lotes.map((l: any, i: number) => (
                              <div key={i} className="px-1.5 py-0.5 bg-gray-100 print:bg-transparent print:border-none rounded text-[9px] text-gray-700 flex justify-between items-center">
                                <span className="font-mono font-bold">{l.lote}</span>
                                <span className="font-bold ml-1 text-blue-700 print:text-black">Qtd: {l.qtd} ML</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-red-500 font-medium text-[10px]">Sem lotes em estoque</span>
                        )}
                      </td>

                      <td className="px-2 py-3 align-middle print:border print:border-gray-400 bg-yellow-50/50 print:bg-transparent">
                        <div className="w-full min-h-[1.5rem]"></div>
                      </td>

                      <td className="px-2 py-3 align-middle print:border print:border-gray-400">
                        <div className="w-full min-h-[1.5rem]"></div>
                      </td>

                      <td className="px-2 py-3 align-middle print:border print:border-gray-400">
                        <div className="w-full min-h-[1.5rem]"></div>
                      </td>
                    </tr>
                  ))}

                  {filteredData.length > 0 && [1, 2, 3, 4].map(emptyRow => (
                    <tr key={`empty-${emptyRow}`} className="h-10 print:h-10">
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                      <td className="px-2 py-3 print:border print:border-gray-400"></td>
                    </tr>
                  ))}

                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center text-gray-500 print:border print:border-gray-400">
                        Nenhuma prescrição encontrada para a lista estrita.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
