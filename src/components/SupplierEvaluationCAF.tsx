import React, { useState, useMemo, useRef } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Clock, 
  FileWarning, ShieldCheck, DollarSign, Search, 
  Package, Activity, UploadCloud, CheckCircle2, Info
} from 'lucide-react';

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
            if (!isNaN(atraso) && atraso <= 0) {
              supplier.entregas_prazo++; // Entrega perfeitamente no prazo ou adiantada
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

      const finalValor = s.valor > 0 ? s.valor : 0;

      return {
        id: s.id,
        nome: s.nome,
        valor: finalValor,
        nota: notaFinal,
        otd: otd,
        conformidade: conformidade,
        horario: horario,
        divergencia: divergencia,
        riscoValidade: riscoValidade,
        avaliacoesCount: s.avaliacoes,
        raw: {
          ...p,
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


  // --- LÓGICA DE APRESENTAÇÃO E MÉTRICAS GLOBAIS ---

  // Filtro
  const filteredFornecedores = useMemo(() => {
    return fornecedoresData.filter(fornecedor => 
      fornecedor.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fornecedor.id.toString().includes(searchTerm)
    );
  }, [searchTerm, fornecedoresData]);

  // Top 5 Financeiro para o Gráfico
  const top5Financeiro = [...fornecedoresData].sort((a, b) => b.valor - a.valor).slice(0, 5);

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

        {/* KPI Cards (Dinâmicos) */}
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
          
          {/* Top Fornecedores (BarChart) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 lg:col-span-2">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800 flex items-center">
                <DollarSign className="w-5 h-5 mr-2 text-indigo-500" />
                Curva A - Top Fornecedores (Volume vs IQF)
              </h3>
            </div>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Financeiro} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" tickFormatter={(val) => `R$ ${(val/1000000).toFixed(0)}M`} axisLine={false} tickLine={false} />
                  <YAxis dataKey="nome" type="category" width={180} tick={{fontSize: 11, fill: '#64748b'}} axisLine={false} tickLine={false} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}} 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any, name: string) => [name === 'valor' ? formatCurrency(value) : value, name === 'valor' ? 'Volume' : name]} 
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>
                  <Bar dataKey="valor" name="Volume Comprado" fill="#4f46e5" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Conformidade no Recebimento (Donut Chart) */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <h3 className="text-lg font-bold text-slate-800 mb-2 flex items-center">
              <ShieldCheck className="w-5 h-5 mr-2 text-indigo-500" />
              Média de Conformidade Física
            </h3>
            <p className="text-xs text-slate-500 mb-4">Embalagem, Temperatura e Avarias consolidadas.</p>
            <div className="flex-grow min-h-[250px] relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie 
                    data={conformidadeData} innerRadius="65%" outerRadius="90%" 
                    paddingAngle={4} dataKey="value" stroke="none"
                  >
                    {conformidadeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#1e293b', fontWeight: 600 }}
                    formatter={(value: any) => `${Number(value).toFixed(1)}%`}
                  />
                  <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                </PieChart>
              </ResponsiveContainer>
              {/* Texto Central do Donut */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                <span className="text-3xl font-bold text-slate-800">
                  {conformidadeData[0] ? conformidadeData[0].value.toFixed(1) : '0'}%
                </span>
                <span className="text-xs text-emerald-600 font-medium">Conforme</span>
              </div>
            </div>
          </div>

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

            {/* LEGENDA EXPLICATIVA DO IQF */}
            <div className="bg-slate-50/80 p-5 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-slate-800">O que é a Nota (IQF)?</h4>
                  <p className="text-sm text-slate-600 mt-1 max-w-5xl leading-relaxed">
                    O <strong>Índice de Qualidade do Fornecedor (IQF)</strong> é a nota de avaliação global (0 a 100). A base de cálculo é a média das métricas de sucesso (<strong>OTD, Conformidade Física e Horário</strong>). Desse valor base, são subtraídos pontos de penalização direta em caso de falhas críticas (<strong>Divergência Documental</strong> e <strong>Risco de Validade</strong>).
                  </p>
                  <div className="flex flex-wrap gap-6 mt-3">
                    <span className="inline-flex items-center text-xs font-bold text-slate-700">
                      <span className="w-3 h-3 rounded-full bg-emerald-500 mr-2 shadow-sm"></span> APROVADO (90 a 100)
                    </span>
                    <span className="inline-flex items-center text-xs font-bold text-slate-700">
                      <span className="w-3 h-3 rounded-full bg-amber-500 mr-2 shadow-sm"></span> ATENÇÃO (80 a 89)
                    </span>
                    <span className="inline-flex items-center text-xs font-bold text-slate-700">
                      <span className="w-3 h-3 rounded-full bg-rose-500 mr-2 shadow-sm"></span> CRÍTICO (&lt; 80)
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Fornecedor</th>
                    <th className="px-6 py-4 font-semibold text-center">Nota (IQF)</th>
                    <th className="px-6 py-4 font-semibold text-center">OTD (%)</th>
                    <th className="px-6 py-4 font-semibold text-center">Conformidade (%)</th>
                    <th className="px-6 py-4 font-semibold text-center">Horário (%)</th>
                    <th className="px-6 py-4 font-semibold text-center">Divergência (%)</th>
                    <th className="px-6 py-4 font-semibold text-center">Risco Validade (%)</th>
                    <th className="px-6 py-4 font-semibold text-center">Status</th>
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
