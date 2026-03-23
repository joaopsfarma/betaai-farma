import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area,
  ScatterChart, Scatter, ZAxis, ReferenceLine,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Clock, 
  FileWarning, ShieldCheck, DollarSign, Search, 
  Package, Activity, UploadCloud, CheckCircle2, Info,
  Target, BarChart2, AlertCircle, PieChart as PieChartIcon, LayoutGrid, Download
} from 'lucide-react';

import { exportSupplierEvaluationPDF } from '../utils/pdfExport';

// --- DADOS SIMULADOS (Iniciais) ---
const mockFornecedores = [
  { id: 701485, nome: 'ONCO PROD DISTRIBUIDORA DE PRODUTOS HOSPITALARES', valor: 30023004, nota: 98, otd: 99, conformidade: 100, divergencia: 0, riscoValidade: 0, horario: 95 },
  { id: 759542, nome: 'CM HOSPITALAR S.A.', valor: 21735209, nota: 95, otd: 92, conformidade: 98, divergencia: 2, riscoValidade: 1, horario: 90 },
];

// Formatação de Moeda
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);
};

export const SupplierEvaluationCAF: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [fornecedoresData, setFornecedoresData] = useState<any[]>(mockFornecedores);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const kpiChartsRef = useRef<HTMLDivElement>(null);
  const [sortSupplier, setSortSupplier] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);

  // Load html2canvas CDN
  useEffect(() => {
    if (!document.getElementById('html2canvas-cdn')) {
      const s = document.createElement('script');
      s.id = 'html2canvas-cdn';
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  const toggleSortSupplier = (col: string) => {
    setSortSupplier(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };

  // --- LÓGICA DE IMPORTAÇÃO E PROCESSAMENTO DE CSV ---
  
  const processCSVFiles = async (files: FileList) => {
    setIsProcessing(true);
    const allSuppliersMap = new Map();
    let totalEntradasGlobais = 0;

    // Função auxiliar para inicializar fornecedor no Map
    const getOrInitSupplier = (id: string, nome: string) => {
      if (!allSuppliersMap.has(id)) {
        allSuppliersMap.set(id, {
          id: id,
          nome: nome || 'Fornecedor Desconhecido',
          valor: 0,
          avaliacoes: 0,
          recebimentos_set: new Set(), // Evita duplicar a contagem da mesma nota
          entregas_totais: 0,
          entregas_prazo: 0,
          atrasos: [],
          perguntas: {
            otd_total: 0, otd_ok: 0,
            conf_total: 0, conf_ok: 0,
            div_total: 0, div_falha: 0,
            val_total: 0, val_falha: 0,
            horario_total: 0, horario_ok: 0
          }
        });
      }
      return allSuppliersMap.get(id);
    };

    // Lê os arquivos
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // USANDO WINDOWS-1252 PARA LER ACENTOS DO SISTEMA BRASILEIRO CORRETAMENTE
      const buffer = await file.arrayBuffer();
      const decoder = new TextDecoder('windows-1252');
      const text = decoder.decode(buffer);
      
      const lines = text.split(/\r?\n/);
      
      // Encontrar a linha de cabeçalho (precisa ter as colunas chave e separador ';')
      let headerIdx = -1;
      for (let i = 0; i < Math.min(15, lines.length); i++) {
        const lineUpper = lines[i].toUpperCase();
        if (lineUpper.includes(';') && 
           (lineUpper.includes('FORN') || lineUpper.includes('DESCRI')) && 
           (lineUpper.includes('CÓD') || lineUpper.includes('COD'))) {
          headerIdx = i; 
          break;
        }
      }
      if (headerIdx === -1) continue; // Pula se não achar cabeçalho válido

      const headers = lines[headerIdx].split(';').map(h => h.trim().replace(/"/g, ''));
      
      // Processar linhas de dados
      for (let i = headerIdx + 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(';').map(v => v.trim().replace(/"/g, ''));
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });

        // BUSCA FLEXÍVEL DE COLUNAS (Evita quebrar por causa de um ponto final ou espaço a mais)
        const getCleanKey = (k: string) => k.toUpperCase().trim();
        const idKey = Object.keys(row).find(k => { const ku = getCleanKey(k); return ku.includes('FORN') && (ku.includes('CÓD') || ku.includes('COD')); });
        const nomeKey = Object.keys(row).find(k => { const ku = getCleanKey(k); return ku.includes('DESCRI') || ku === 'FORNECEDOR'; });
        
        const idRaw = idKey ? row[idKey] : null;
        if (!idRaw || !idRaw.trim() || idRaw.trim() === '') continue;
        
        const idForn = idRaw.trim();
        const nomeForn = nomeKey && row[nomeKey] ? row[nomeKey].trim() : 'Fornecedor Desconhecido';

        const supplier = getOrInitSupplier(idForn, nomeForn);

        // --- CÁLCULO DE OTD REAL MATEMÁTICO (Baseado no ERP: Dias Atraso) ---
        const codEntKey = Object.keys(row).find(k => { const ku = getCleanKey(k); return ku.includes('CÓD') && ku.includes('ENT'); });
        const diasAtrasoKey = Object.keys(row).find(k => getCleanKey(k).includes('ATRASO'));

        if (codEntKey && diasAtrasoKey && row[codEntKey] && row[diasAtrasoKey] !== undefined) {
          const codEnt = row[codEntKey].trim();
          if (codEnt !== '' && !supplier.recebimentos_set.has(codEnt)) {
            supplier.recebimentos_set.add(codEnt);
            supplier.entregas_totais++;
            const atraso = parseInt(row[diasAtrasoKey], 10);
            if (!isNaN(atraso)) {
              supplier.atrasos.push(atraso);
              if (atraso <= 0) {
                supplier.entregas_prazo++; // Entrega perfeitamente no prazo ou adiantada
              }
            }
          }
        }

        // Cenário 1: Arquivo de Valores/Rank (Ex: 6663)
        const valorKey = Object.keys(row).find(k => getCleanKey(k).includes('VALOR TOTAL'));
        if (valorKey && row[valorKey]) {
          const valStr = row[valorKey].replace(/\./g, '').replace(',', '.');
          const valor = parseFloat(valStr);
          if (!isNaN(valor)) supplier.valor += valor;
          continue; // Pula o resto pois não tem perguntas aqui
        }

        // Cenário 2: Arquivo em Colunas (Ex: 6662)
        const horarioKey = Object.keys(row).find(k => getCleanKey(k).includes('HORARIOS DE RECEBIMENTO') || getCleanKey(k).includes('HORÁRIOS DE RECEBIMENTO'));
        const otdKey = Object.keys(row).find(k => getCleanKey(k).includes('DATA PREVISTA'));
        const confKey = Object.keys(row).find(k => getCleanKey(k).includes('CONFORMIDADE'));
        const divKey = Object.keys(row).find(k => getCleanKey(k).includes('DIVERGÊNCIA') || getCleanKey(k).includes('DIVERGENCIA'));
        const valKey = Object.keys(row).find(k => getCleanKey(k).includes('VALIDADE'));

        const checkAns = (ans: string) => {
          const a = (ans || '').toUpperCase();
          return {
            valid: a.includes('SIM') || a.includes('NÃO') || a.includes('NAO'),
            isSim: a.includes('SIM')
          };
        };

        // Cenário 3: Arquivo em Linhas (Ex: 4984 / 4985)
        const perguntaKey = Object.keys(row).find(k => getCleanKey(k).includes('PERGUNTA'));
        const respostaKey = Object.keys(row).find(k => getCleanKey(k).includes('RESPOSTA'));

        if (!perguntaKey && (horarioKey || otdKey || confKey || divKey || valKey)) {
          supplier.avaliacoes++;
          
          const rHorario = horarioKey ? checkAns(row[horarioKey]) : {valid: false, isSim: false};
          const rOtd = otdKey ? checkAns(row[otdKey]) : {valid: false, isSim: false};
          const rConf = confKey ? checkAns(row[confKey]) : {valid: false, isSim: false};
          const rDiv = divKey ? checkAns(row[divKey]) : {valid: false, isSim: false};
          const rVal = valKey ? checkAns(row[valKey]) : {valid: false, isSim: false};

          if (rHorario.valid) { supplier.perguntas.horario_total++; if(rHorario.isSim) supplier.perguntas.horario_ok++; }
          if (rOtd.valid) { supplier.perguntas.otd_total++; if(rOtd.isSim) supplier.perguntas.otd_ok++; }
          if (rConf.valid) { supplier.perguntas.conf_total++; if(rConf.isSim) supplier.perguntas.conf_ok++; }
          if (rDiv.valid) { supplier.perguntas.div_total++; if(rDiv.isSim) supplier.perguntas.div_falha++; }
          if (rVal.valid) { supplier.perguntas.val_total++; if(rVal.isSim) supplier.perguntas.val_falha++; }
        }

        if (perguntaKey && respostaKey && row[perguntaKey] && row[respostaKey]) {
          const pergunta = row[perguntaKey].toUpperCase();
          const r = checkAns(row[respostaKey]);
          
          supplier.avaliacoes++;

          if (r.valid) {
            if (pergunta.includes('HORARIO') || pergunta.includes('HORÁRIO')) { supplier.perguntas.horario_total++; if(r.isSim) supplier.perguntas.horario_ok++; }
            else if (pergunta.includes('DATA PREVISTA')) { supplier.perguntas.otd_total++; if(r.isSim) supplier.perguntas.otd_ok++; }
            else if (pergunta.includes('CONFORMIDADE')) { supplier.perguntas.conf_total++; if(r.isSim) supplier.perguntas.conf_ok++; }
            else if (pergunta.includes('DIVERGÊNCIA') || pergunta.includes('DIVERGENCIA')) { supplier.perguntas.div_total++; if(r.isSim) supplier.perguntas.div_falha++; }
            else if (pergunta.includes('VALIDADE')) { supplier.perguntas.val_total++; if(r.isSim) supplier.perguntas.val_falha++; }
          }
        }
      }
    }

    // Consolidar Médias
    const consolidatedData = Array.from(allSuppliersMap.values()).map(s => {
      const p = s.perguntas;
      
      const calcPct = (ok: number, total: number) => total > 0 ? Math.round((ok / total) * 100) : null;
      
      // Priorizar o OTD Real (Dias de Atraso). Se o arquivo não tiver essa coluna, cai no OTD subjetivo
      const otd_real = s.entregas_totais > 0 ? Math.round((s.entregas_prazo / s.entregas_totais) * 100) : null;
      const otd_subjetivo = calcPct(p.otd_ok, p.otd_total);
      const otd = otd_real !== null ? otd_real : otd_subjetivo;

      const conformidade = calcPct(p.conf_ok, p.conf_total);
      const horario = calcPct(p.horario_ok, p.horario_total);
      
      const divergencia = p.div_total > 0 ? Math.round((p.div_falha / p.div_total) * 100) : null;
      const riscoValidade = p.val_total > 0 ? Math.round((p.val_falha / p.val_total) * 100) : null;

      // Nota Final (IQF) - Média Ponderada apenas com os indicadores que possuem dados
      const indicadoresPositivos = [];
      if (otd !== null) indicadoresPositivos.push(otd);
      if (conformidade !== null) indicadoresPositivos.push(conformidade);
      if (horario !== null) indicadoresPositivos.push(horario);

      let notaFinal = null;
      if (indicadoresPositivos.length > 0) {
        const mediaBase = Math.round(indicadoresPositivos.reduce((a, b) => a + b, 0) / indicadoresPositivos.length);
        notaFinal = mediaBase - ((divergencia || 0) * 0.5) - ((riscoValidade || 0) * 0.5); 
        notaFinal = Math.max(0, Math.min(100, Math.round(notaFinal)));
      }

      // Calcular a média de dias de atraso
      let somaAtrasos = 0;
      let countAtrasos = 0;
      s.atrasos.forEach((a: number) => {
        if (a > 0) {
           somaAtrasos += a;
           countAtrasos++;
        }
      });
      const mediaAtraso = countAtrasos > 0 ? somaAtrasos / countAtrasos : 0;

      const finalValor = s.valor > 0 ? s.valor : 0;

      return {
        id: s.id,
        nome: s.nome,
        valor: finalValor,
        nota: notaFinal,
        otd: otd,
        mediaAtraso: mediaAtraso,
        conformidade: conformidade,
        horario: horario,
        divergencia: divergencia,
        riscoValidade: riscoValidade,
        avaliacoesCount: s.avaliacoes,
        raw: {
          ...p,
          atrasos: s.atrasos,
          otd_real_ok: s.entregas_prazo,
          otd_real_total: s.entregas_totais
        }
      };
    }).filter(s => s.avaliacoesCount > 0 || s.valor > 0);

    if (consolidatedData.length > 0) {
      setFornecedoresData(consolidatedData);
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    }
    setIsProcessing(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processCSVFiles(e.target.files);
    }
  };

  const handleExportPDF = async () => {
    if (!kpiChartsRef.current) {
      exportSupplierEvaluationPDF(filteredFornecedores, globalMetrics);
      return;
    }
    try {
      // @ts-ignore
      const html2canvas = window.html2canvas;
      if (!html2canvas) {
        exportSupplierEvaluationPDF(filteredFornecedores, globalMetrics);
        return;
      }
      const canvas = await html2canvas(kpiChartsRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#f8fafc',
        logging: false,
      });
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();

      // Header
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageW, 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text('PAINEL DE PERFORMANCE DOS FORNECEDORES', 14, 13);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`FarmaIA  |  Gerado em ${new Date().toLocaleString('pt-BR')}`, 14, 18);

      // Add KPI+charts image (multi-page if needed)
      const imgRatio = canvas.height / canvas.width;
      const imgW = pageW - 20;
      const imgH = imgW * imgRatio;
      const startY = 24;
      const availH = pageH - startY - 10;

      if (imgH <= availH) {
        doc.addImage(imgData, 'PNG', 10, startY, imgW, imgH);
      } else {
        // Multi-page: slice canvas
        const sliceH = Math.floor(canvas.width * (availH / imgW));
        let y = 0;
        let firstPage = true;
        while (y < canvas.height) {
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = canvas.width;
          tmpCanvas.height = Math.min(sliceH, canvas.height - y);
          const ctx = tmpCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, -y);
          const slice = tmpCanvas.toDataURL('image/png');
          if (!firstPage) doc.addPage();
          const sliceImgH = availH * (tmpCanvas.height / sliceH);
          doc.addImage(slice, 'PNG', 10, firstPage ? startY : 10, imgW, sliceImgH);
          y += sliceH;
          firstPage = false;
        }
      }

      // Add table on new page
      doc.addPage();
      doc.setFillColor(79, 70, 229);
      doc.rect(0, 0, pageW, 14, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('DETALHE ANALÍTICO POR FORNECEDOR', 14, 9);

      const tableData = filteredFornecedores.map(item => [
        item.nome,
        item.id,
        item.nota !== null ? `${item.nota}` : '-',
        item.mediaAtraso > 0 ? `${item.mediaAtraso.toFixed(1)}d` : '-',
        item.otd !== null ? `${item.otd}%` : '-',
        item.conformidade !== null ? `${item.conformidade}%` : '-',
        item.divergencia !== null ? `${item.divergencia}%` : '-',
        item.riscoValidade !== null ? `${item.riscoValidade}%` : '-',
        item.nota === null ? 'SEM AVAL.' : item.nota >= 90 ? 'APROVADO' : item.nota >= 80 ? 'ATENÇÃO' : 'CRÍTICO'
      ]);

      autoTable(doc, {
        startY: 18,
        head: [['Fornecedor', 'Cód.', 'IQF', 'Média Atraso', 'OTD (%)', 'Conf. (%)', 'Diverg. (%)', 'Risco Val.', 'Status']],
        body: tableData,
        theme: 'grid',
        margin: { left: 12, right: 12, bottom: 20 },
        styles: { fontSize: 7.5, cellPadding: 3, valign: 'middle', overflow: 'linebreak' },
        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 80, fontStyle: 'bold', textColor: [30, 41, 59] },
          1: { cellWidth: 18, halign: 'center' },
          2: { cellWidth: 15, halign: 'center', fontStyle: 'bold' },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 16, halign: 'center' },
          6: { cellWidth: 18, halign: 'center' },
          7: { cellWidth: 20, halign: 'center' },
          8: { cellWidth: 24, fontStyle: 'bold', halign: 'center' },
        },
        didParseCell(data) {
          if (data.section === 'body') {
            if (data.column.index === 8) {
              const val = data.cell.raw as string;
              if (val === 'CRÍTICO') data.cell.styles.textColor = [220, 38, 38];
              else if (val === 'ATENÇÃO') data.cell.styles.textColor = [202, 138, 4];
              else if (val === 'APROVADO') data.cell.styles.textColor = [22, 163, 74];
            }
            if (data.column.index === 2) {
              const val = parseInt(data.cell.raw as string, 10);
              if (!isNaN(val)) {
                if (val < 80) data.cell.styles.textColor = [220, 38, 38];
                else if (val < 90) data.cell.styles.textColor = [202, 138, 4];
                else data.cell.styles.textColor = [22, 163, 74];
              }
            }
          }
        },
      });

      // Footers
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(`FarmaIA | Sistema de Logística Farmacêutica Hospitalar`, 12, pageH - 8);
        doc.text(`Página ${i} de ${pageCount}`, pageW - 12, pageH - 8, { align: 'right' });
      }

      doc.save('relatorio-fornecedores-srm.pdf');
    } catch (e) {
      console.error('Erro ao exportar PDF com imagem:', e);
      exportSupplierEvaluationPDF(filteredFornecedores, globalMetrics);
    }
  };

  // --- LÓGICA DE APRESENTAÇÃO E MÉTRICAS GLOBAIS ---

  // Filtro + Ordenação
  const filteredFornecedores = useMemo(() => {
    let items = fornecedoresData.filter(f =>
      f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      f.id.toString().includes(searchTerm)
    );
    if (sortSupplier) {
      const { col, dir } = sortSupplier;
      const mult = dir === 'asc' ? 1 : -1;
      items = [...items].sort((a, b) => {
        const va = a[col] ?? -1;
        const vb = b[col] ?? -1;
        if (col === 'nome') return String(a.nome).localeCompare(String(b.nome)) * mult;
        return (va - vb) * mult;
      });
    }
    return items;
  }, [searchTerm, fornecedoresData, sortSupplier]);

  // Top 10 por categoria
  const top10Aprovado = useMemo(() =>
    [...fornecedoresData].filter(f => f.nota !== null && f.nota >= 90).sort((a, b) => b.nota - a.nota).slice(0, 10),
    [fornecedoresData]);
  const top10Atencao = useMemo(() =>
    [...fornecedoresData].filter(f => f.nota !== null && f.nota >= 80 && f.nota < 90).sort((a, b) => b.nota - a.nota).slice(0, 10),
    [fornecedoresData]);
  const top10Critico = useMemo(() =>
    [...fornecedoresData].filter(f => f.nota !== null && f.nota < 80).sort((a, b) => a.nota - b.nota).slice(0, 10),
    [fornecedoresData]);

  // Top 5 Piores Atrasos (Média em Dias)
  const topPioresAtrasos = [...fornecedoresData].filter(f => f.mediaAtraso > 0).sort((a, b) => b.mediaAtraso - a.mediaAtraso).slice(0, 5);

  const deliveryBucketsData = useMemo(() => {
    let noPrazo = 0, leve = 0, medio = 0, grave = 0;
    fornecedoresData.forEach(f => {
      if (f.raw && f.raw.atrasos) {
        f.raw.atrasos.forEach((a: number) => {
          if (a <= 0) noPrazo++;
          else if (a <= 3) leve++;
          else if (a <= 7) medio++;
          else grave++;
        });
      }
    });

    return [
      { name: 'No Prazo (≤0d)', value: noPrazo, color: '#10b981' },
      { name: 'Atraso Leve (1-3d)', value: leve, color: '#facc15' },
      { name: 'Atraso Médio (4-7d)', value: medio, color: '#f97316' },
      { name: 'Atraso Grave (>7d)', value: grave, color: '#e11d48' },
    ].filter(d => d.value > 0);
  }, [fornecedoresData]);

  // Médias Globais (KPIs)
  const globalMetrics = useMemo(() => {
    if (fornecedoresData.length === 0) return { iqf: '0.0', otd: '0.0', div: '0.0', val: '0.0', conf: '0.0', horario: '0.0' };
    
    let otdOk = 0, otdTot = 0;
    let confOk = 0, confTot = 0;
    let divFalha = 0, divTot = 0;
    let valFalha = 0, valTot = 0;
    let horOk = 0, horTot = 0;
    let iqfSum = 0, iqfCount = 0;

    fornecedoresData.forEach(f => {
      if (f.raw) {
        // Usa a contagem matemática real para o cálculo Global de OTD
        if (f.raw.otd_real_total > 0) {
          otdOk += f.raw.otd_real_ok; otdTot += f.raw.otd_real_total;
        } else {
          otdOk += f.raw.otd_ok; otdTot += f.raw.otd_total;
        }
        confOk += f.raw.conf_ok; confTot += f.raw.conf_total;
        divFalha += f.raw.div_falha; divTot += f.raw.div_total;
        valFalha += f.raw.val_falha; valTot += f.raw.val_total;
        horOk += f.raw.horario_ok; horTot += f.raw.horario_total;
      } else {
        // Suporte para o Mock Data inicial
        otdOk += f.otd; otdTot += 100;
        confOk += f.conformidade; confTot += 100;
        divFalha += f.divergencia; divTot += 100;
        valFalha += f.riscoValidade; valTot += 100;
        horOk += f.horario; horTot += 100;
      }
      if (f.nota !== null) {
        iqfSum += f.nota;
        iqfCount++;
      }
    });

    return {
      iqf: iqfCount > 0 ? (iqfSum / iqfCount).toFixed(1) : '0.0',
      otd: otdTot > 0 ? ((otdOk / otdTot) * 100).toFixed(1) : '0.0',
      div: divTot > 0 ? ((divFalha / divTot) * 100).toFixed(1) : '0.0',
      val: valTot > 0 ? ((valFalha / valTot) * 100).toFixed(1) : '0.0',
      conf: confTot > 0 ? ((confOk / confTot) * 100).toFixed(1) : '0.0',
      horario: horTot > 0 ? ((horOk / horTot) * 100).toFixed(1) : '0.0'
    };
  }, [fornecedoresData]);

  // Conformidade Global para o Gráfico de Rosca
  const conformidadeData = useMemo(() => {
    if (fornecedoresData.length === 0) return [];
    const avgConf = parseFloat(globalMetrics.conf);
    return [
      { name: 'Sem Avarias / Temp Ideal', value: avgConf, color: '#10b981' },
      { name: 'Falhas Físicas/Temp.', value: 100 - avgConf, color: '#f59e0b' },
    ];
  }, [fornecedoresData, globalMetrics]);

  // NOVOS INDICADORES DE AVALIAÇÃO E PRAZOS
  const scatterData = useMemo(() => {
    return fornecedoresData
      .filter(f => (f.nota || 0) > 0)
      .map(f => ({
        nome: f.nome,
        nota: f.nota || 0,
        valor: f.mediaAtraso !== undefined && f.mediaAtraso !== null ? parseFloat(f.mediaAtraso.toFixed(1)) : 0,
        id: f.id
      }));
  }, [fornecedoresData]);

  const statusDistribData = useMemo(() => {
    let aprovado = 0, atencao = 0, critico = 0;
    fornecedoresData.forEach(f => {
      if (f.nota !== null) {
        if (f.nota >= 90) aprovado++;
        else if (f.nota >= 80) atencao++;
        else critico++;
      }
    });
    return [
      { name: 'Aprovado (≥ 90)', value: aprovado, color: '#10b981' },
      { name: 'Atenção (80-89)', value: atencao, color: '#f59e0b' },
      { name: 'Crítico (< 80)', value: critico, color: '#e11d48' }
    ].filter(d => d.value > 0);
  }, [fornecedoresData]);

  const radarData = useMemo(() => {
    return [
      { subject: 'O.T.D.', value: parseFloat(globalMetrics.otd) },
      { subject: 'Horário', value: parseFloat(globalMetrics.horario) },
      { subject: 'Conformidade', value: parseFloat(globalMetrics.conf) },
      { subject: 'Doc. Correta', value: 100 - parseFloat(globalMetrics.div) },
      { subject: 'Validade Segura', value: 100 - parseFloat(globalMetrics.val) }
    ];
  }, [globalMetrics]);

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 selection:bg-indigo-100 selection:text-indigo-900 pb-12">
      
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 px-8 py-4 sticky top-0 z-10 shadow-sm flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <Activity className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 leading-tight">CAF Analytics Pro</h1>
            <p className="text-xs font-medium text-slate-500">Hospital Águas Claras • Gestão de Suprimentos</p>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-sm font-medium text-slate-500 bg-slate-100 px-4 py-2 rounded-full hidden sm:flex items-center">
            <Clock className="w-4 h-4 mr-2 text-slate-400" />
            Período: Dados Atuais
          </div>
          
          {/* BOTÃO EXPORTAR PDF */}
          <button 
            onClick={handleExportPDF}
            disabled={fornecedoresData.length === 0}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm ${
              fornecedoresData.length === 0 ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-indigo-600'
            }`}
          >
            <Download className="w-4 h-4 mr-2" />
            Baixar PDF
          </button>
          
          {/* BOTÃO DE IMPORTAÇÃO CSV */}
          <input 
            type="file" 
            multiple 
            accept=".csv" 
            ref={fileInputRef} 
            className="hidden" 
            onChange={handleFileChange}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${
              uploadSuccess ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-200' :
              isProcessing ? 'bg-slate-300 text-slate-500 cursor-not-allowed' :
              'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200'
            }`}
          >
            {uploadSuccess ? <CheckCircle2 className="w-4 h-4 mr-2" /> : <UploadCloud className="w-4 h-4 mr-2" />}
            {isProcessing ? 'Lendo...' : uploadSuccess ? 'Atualizado!' : 'Importar CSVs'}
          </button>
        </div>
      </nav>

      <main className="px-8 max-w-[1600px] mx-auto mt-8">
        
        {/* Cabeçalho da Seção */}
        <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-800 tracking-tight">Painel de Performance dos Fornecedores</h2>
            <p className="text-slate-500 mt-1">Acompanhamento consolidado automático baseado nos arquivos de Recebimento e Avaliação.</p>
          </div>
        </div>

        {/* KPI Cards + Gráficos (capturados para PDF) */}
        <div ref={kpiChartsRef}>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
          <KPICard 
            title="Média Geral de Qualidade (IQF)" 
            value={`${globalMetrics.iqf}%`} 
            icon={<TrendingUp className="w-6 h-6" />} 
            color="text-emerald-600" bg="bg-emerald-100" 
          />
          <KPICard 
            title="Entregas no Prazo (OTD)" 
            value={`${globalMetrics.otd}%`} 
            icon={<Package className="w-6 h-6" />} 
            color="text-indigo-600" bg="bg-indigo-100" 
          />
          <KPICard 
            title="Cumprimento de Horário" 
            value={`${globalMetrics.horario}%`} 
            icon={<Clock className="w-6 h-6" />} 
            color="text-blue-600" bg="bg-blue-100" 
          />
          <KPICard 
            title="Divergência Documental" 
            value={`${globalMetrics.div}%`} 
            icon={<FileWarning className="w-6 h-6" />} 
            color="text-amber-600" bg="bg-amber-100" 
          />
          <KPICard 
            title="Risco de Validade (< 6m)" 
            value={`${globalMetrics.val}%`} 
            icon={<ShieldCheck className="w-6 h-6" />} 
            color="text-rose-600" bg="bg-rose-100" 
          />
        </div>

        {/* Seção Principal de Gráficos */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          
          {/* Matriz Estratégica (Scatter) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Target className="w-5 h-5 mr-2 text-indigo-500" />
                Matriz de Desempenho: Atraso Médio vs Qualidade (IQF)
              </h3>
              <span className="text-xs font-medium text-slate-400 bg-slate-100 px-3 py-1 rounded-full">Avaliação vs Prazos</span>
            </div>
            <div className="h-80 w-full relative">
              {/* Overlay Quadrant Labels */}
              <div className="absolute inset-0 pointer-events-none z-0 flex flex-col justify-between p-4 px-12 pb-10">
                 <div className="flex justify-between w-full opacity-30 text-xs font-bold text-slate-400">
                    <span className="bg-slate-50 px-2 py-1 rounded">Risco Assistencial (Baixa Nota, Alto Atraso)</span>
                    <span className="bg-slate-50 px-2 py-1 rounded">Excelência Operacional (Alta Nota, Menor Atraso)</span>
                 </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" dataKey="nota" name="IQF" domain={[0, 100]} unit=" pts" tick={{fontSize: 12, fill: '#64748b'}} />
                  <YAxis type="number" dataKey="valor" name="Média Atraso" tickFormatter={(val) => `${val}d`} width={40} tick={{fontSize: 12, fill: '#64748b'}} />
                  <ZAxis type="number" range={[100, 300]} />
                  <Tooltip 
                    cursor={{strokeDasharray: '3 3'}}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string) => [name === 'Média Atraso' ? `${value} dias` : value, name]}
                    labelFormatter={() => ''}
                  />
                  <ReferenceLine x={85} stroke="#e2e8f0" strokeDasharray="3 3" />
                  <Scatter name="Fornecedores" data={scatterData} fill="#6366f1" opacity={0.7}>
                    {scatterData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.nota >= 90 ? '#10b981' : entry.nota >= 80 ? '#f59e0b' : '#e11d48'} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Distribuição de Status */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
              <PieChartIcon className="w-5 h-5 mr-2 text-indigo-500" />
              Saúde do Padronizado
            </h3>
            <p className="text-xs text-slate-500 mb-4">Divisão da base de fornecedores avaliados.</p>
            <div className="flex-grow min-h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={statusDistribData} innerRadius="55%" outerRadius="80%" 
                    paddingAngle={3} dataKey="value" stroke="none"
                  >
                    {statusDistribData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8 mt-4">
                <span className="text-3xl font-bold text-slate-800">
                  {scatterData.length}
                </span>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">Total</span>
              </div>
            </div>
          </div>

          {/* Top Fornecedores Atrasos */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <Clock className="w-5 h-5 mr-2 text-rose-500" />
                Maiores Gaps de Prazo (Média de Dias de Atraso)
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topPioresAtrasos} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={(val) => `${val} dias`} axisLine={false} tickLine={false} />
                  <YAxis dataKey="nome" type="category" width={180} tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: '#fef2f2'}} 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`${Number(value).toFixed(1)} dias`, 'Média Gafes/Atraso']} 
                  />
                  <Bar dataKey="mediaAtraso" name="Média Atraso" fill="#fb7185" radius={[0, 6, 6, 0]} barSize={24}>
                     {topPioresAtrasos.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.nota >= 90 ? '#fcd34d' : entry.nota >= 80 ? '#f97316' : '#e11d48'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Distribuição de Prazos */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
              <Package className="w-5 h-5 mr-2 text-indigo-500" />
              Perfil de Entregas
            </h3>
            <p className="text-xs text-slate-500 mb-4">Volume de recebimentos segmentado pelo tempo de chegada.</p>
            <div className="flex-grow min-h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={deliveryBucketsData} innerRadius="55%" outerRadius="80%" 
                    paddingAngle={3} dataKey="value" stroke="none"
                  >
                    {deliveryBucketsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '11px' }}/>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8 mt-4">
                <span className="text-3xl font-bold text-slate-800">
                  {deliveryBucketsData.reduce((acc, obj) => acc + obj.value, 0)}
                </span>
                <span className="text-[10px] text-slate-500 font-medium uppercase tracking-widest mt-1">Entregas</span>
              </div>
            </div>
          </div>
          
          {/* Radar Global */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex flex-col w-full text-center">
              <span className="flex items-center justify-center"><LayoutGrid className="w-5 h-5 mr-2 text-indigo-500" /> Raio-X Geral</span>
              <span className="text-xs font-normal text-slate-400 mt-1">Média Hospitalar dos Fatores</span>
            </h3>
            <div className="h-72 w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                  <PolarGrid stroke="#e2e8f0" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar name="Média Hospital" dataKey="value" stroke="#6366f1" fill="#818cf8" fillOpacity={0.6} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} 
                    formatter={(val) => `${val}%`}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
        </div>
        </div> {/* end kpiChartsRef */}

        {/* Top 10 por Categoria */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {([
            { title: 'Top 10 Aprovados', items: top10Aprovado, color: 'emerald', label: 'APROVADO', textColor: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
            { title: 'Top 10 Atenção',   items: top10Atencao,  color: 'amber',   label: 'ATENÇÃO',  textColor: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   dot: 'bg-amber-500'   },
            { title: 'Top 10 Críticos',  items: top10Critico,  color: 'rose',    label: 'CRÍTICO',  textColor: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    dot: 'bg-rose-500'    },
          ] as any[]).map((cat: any) => (
            <div key={cat.title} className={`bg-white rounded-2xl shadow-sm border ${cat.border} overflow-hidden`}>
              <div className={`px-5 py-4 ${cat.bg} border-b ${cat.border} flex items-center gap-2`}>
                <span className={`w-2.5 h-2.5 rounded-full ${cat.dot}`}></span>
                <h3 className={`text-sm font-bold ${cat.textColor}`}>{cat.title}</h3>
                <span className={`ml-auto text-xs font-semibold ${cat.textColor} opacity-70`}>{cat.items.length} fornecedor(es)</span>
              </div>
              {cat.items.length === 0 ? (
                <div className="px-5 py-6 text-center text-xs text-slate-400">Nenhum fornecedor nesta faixa.</div>
              ) : (
                <ol className="divide-y divide-slate-50">
                  {cat.items.map((f: any, idx: number) => (
                    <li key={f.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors">
                      <span className="text-xs font-bold text-slate-400 w-5 text-right flex-shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate" title={f.nome}>{f.nome}</p>
                        <p className="text-[10px] text-slate-400">ID: {f.id}</p>
                      </div>
                      <span className={`text-sm font-extrabold ${cat.textColor} flex-shrink-0`}>{f.nota}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          ))}
        </div>

        {/* Tabela de Fornecedores */}
        <div className="grid grid-cols-1 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <h3 className="text-lg font-bold text-slate-800">Detalhe Analítico por Fornecedor</h3>
              
              {/* Barra de Busca */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input 
                  type="text" 
                  placeholder="Buscar fornecedor..." 
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* LEGENDA EXPLICATIVA DO IQF E ALERTAS DE RISCO */}
            <div className="bg-slate-50/80 p-5 border-b border-slate-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-slate-800">O que é a Nota (IQF)?</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      O <strong>Índice de Qualidade do Fornecedor (IQF)</strong> é a nota global baseada na média de OTD, Conformidade e Horários de entrega, subtraindo pontos em caso de Divergências Documentais.
                    </p>
                    <div className="flex flex-wrap gap-4 mt-3">
                      <span className="inline-flex items-center text-xs font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-full bg-emerald-500 mr-1.5 shadow-sm"></span> APROVADO (≥90)
                      </span>
                      <span className="inline-flex items-center text-xs font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-full bg-amber-500 mr-1.5 shadow-sm"></span> ATENÇÃO (80-89)
                      </span>
                      <span className="inline-flex items-center text-xs font-bold text-slate-700">
                        <span className="w-3 h-3 rounded-full bg-rose-500 mr-1.5 shadow-sm"></span> CRÍTICO (&lt;80)
                      </span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-start gap-3 bg-white p-4 rounded-xl border border-rose-100 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>
                  <AlertCircle className="w-5 h-5 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-rose-800">Alerta: Risco Assistencial Direto</h4>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Fornecedores no quadrante de <strong>Alta Média de Atraso e Baixo IQF</strong> disparam imediato <b>Risco Assistencial</b>. Impactos incluem: desabastecimento da Curva A, cancelamento de cirurgias, falhas operacionais e prolongamento de internação.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    {([
                      { label: 'Fornecedor',       col: 'nome',         align: 'text-left'   },
                      { label: 'Nota (IQF)',        col: 'nota',         align: 'text-center' },
                      { label: 'OTD (%)',           col: 'otd',          align: 'text-center' },
                      { label: 'Conformidade (%)',  col: 'conformidade', align: 'text-center' },
                      { label: 'Horário (%)',       col: 'horario',      align: 'text-center' },
                      { label: 'Divergência (%)',   col: 'divergencia',  align: 'text-center' },
                      { label: 'Risco Validade (%)',col: 'riscoValidade',align: 'text-center' },
                      { label: 'Status',            col: null,           align: 'text-center' },
                    ] as { label: string; col: string | null; align: string }[]).map(h => (
                      <th
                        key={h.label}
                        className={`px-6 py-4 font-semibold ${h.align} ${h.col ? 'cursor-pointer select-none hover:text-indigo-600' : ''}`}
                        onClick={h.col ? () => toggleSortSupplier(h.col!) : undefined}
                      >
                        {h.label}{h.col && (
                          <span className="ml-1 opacity-40" style={{ opacity: sortSupplier?.col === h.col ? 1 : 0.3, fontSize: 9 }}>
                            {sortSupplier?.col === h.col ? (sortSupplier.dir === 'asc' ? '▲' : '▼') : '▲'}
                          </span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredFornecedores.length > 0 ? (
                    filteredFornecedores.map((f, i) => (
                      <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-800 truncate max-w-[250px]" title={f.nome}>{f.nome}</span>
                            <span className="text-xs text-slate-400">ID: {f.id}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center">
                            <span className={`font-bold mr-2 ${f.nota >= 90 ? 'text-emerald-600' : f.nota >= 80 ? 'text-amber-600' : f.nota === null ? 'text-slate-400' : 'text-rose-600'}`}>
                              {f.nota !== null ? f.nota : '-'}
                            </span>
                            {f.nota !== null && (
                              <div className="w-16 bg-slate-100 rounded-full h-1.5 hidden sm:block">
                                <div 
                                  className={`h-1.5 rounded-full ${f.nota >= 90 ? 'bg-emerald-500' : f.nota >= 80 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                                  style={{width: `${f.nota}%`}}
                                ></div>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-medium text-slate-600">{f.otd !== null ? `${f.otd}%` : '-'}</td>
                        <td className="px-6 py-4 text-center font-medium text-slate-600">{f.conformidade !== null ? `${f.conformidade}%` : '-'}</td>
                        <td className="px-6 py-4 text-center font-medium text-slate-600">{f.horario !== null ? `${f.horario}%` : '-'}</td>
                        <td className="px-6 py-4 text-center font-medium text-slate-600">{f.divergencia !== null ? `${f.divergencia}%` : '-'}</td>
                        <td className="px-6 py-4 text-center font-medium text-slate-600">{f.riscoValidade !== null ? `${f.riscoValidade}%` : '-'}</td>
                        <td className="px-6 py-4 text-center">
                          <StatusBadge nota={f.nota} />
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-6 py-8 text-center text-slate-500">
                        Nenhum fornecedor encontrado para exibir. Importe os CSVs ou ajuste a busca.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---

function KPICard({ title, value, icon, color, bg }: { title: string, value: string, icon: React.ReactNode, color: string, bg: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden group hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-4">
        <div className={`p-3 rounded-xl ${bg} ${color}`}>
          {icon}
        </div>
      </div>
      <div>
        <h3 className="text-3xl font-extrabold text-slate-800">{value}</h3>
        <p className="text-sm font-medium text-slate-500 mt-1">{title}</p>
      </div>
      <div className={`absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 blur-2xl group-hover:opacity-20 transition-opacity ${bg.replace('100', '500')}`}></div>
    </div>
  );
}

function StatusBadge({ nota }: { nota: number | null }) {
  if (nota === null || nota === undefined) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">SEM AVALIAÇÃO</span>;
  }
  if (nota >= 90) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">APROVADO</span>;
  }
  if (nota >= 80) {
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">ATENÇÃO</span>;
  }
  return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">CRÍTICO</span>;
}
