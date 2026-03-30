import React, { useState, useRef, useMemo } from 'react';
import { 
  Upload, AlertCircle, CheckCircle, Package, 
  Building2, Pill, UserX, Search, 
  FileSpreadsheet, Info, Filter, X, Printer
} from 'lucide-react';
import { PanelGuide } from './common/PanelGuide';

export const InteligenciaDevolucoes: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados principais
  const [ficheiroAtivo, setFicheiroAtivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [termoPesquisa, setTermoPesquisa] = useState('');
  
  // Estados dos Filtros
  const [filtroUnidade, setFiltroUnidade] = useState('Todas');
  const [filtroAlta, setFiltroAlta] = useState('Todas');
  const [filtroPendencia, setFiltroPendencia] = useState('Todos');
  
  // Estado dos dados
  const [dados, setDados] = useState({
    totais: { naoAdministrado: 0, devolvido: 0, pendente: 0 },
    linhas: [] as any[],
    unidades: [] as any[], // Para o gráfico Top 5
    listaTodasUnidades: [] as string[], // Para o dropdown de filtros
    produtos: [] as any[],
    pendentesAlta: 0
  });

  // Função principal de processamento do CSV
  const parseCSV = (text: string) => {
    let rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      let char = text[i];
      let nextChar = text[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          currentCell += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ';') {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
          if (char === '\r') i++;
        } else {
          currentCell += char;
        }
      }
    }
    if (currentRow.length > 0 || currentCell !== '') {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  };

  const processarCSV = (texto: string) => {
    try {
      const linhas = parseCSV(texto);
      let cabecalhoIndex = -1;
      let indices = {
        atendimento: -1, paciente: -1, codProduto: -1, produto: -1,
        naoAdministrado: -1, devolvido: -1, pendente: -1,
        solicitacoes: -1, prescricao: -1, unidade: -1, leito: -1, alta: -1
      };

      // 1. Identificar Cabeçalho e Índices
      for (let i = 0; i < linhas.length; i++) {
        const linhaStr = linhas[i].join(' ').toLowerCase();
        if (linhaStr.includes('atendimento') && linhaStr.includes('paciente')) {
          cabecalhoIndex = i;
          const colunas = linhas[i];
          
          colunas.forEach((coluna, index) => {
            const colLimpa = coluna.toLowerCase().replace(/<br>/g, ' ').trim();
            if (colLimpa === 'atendimento') indices.atendimento = index;
            if (colLimpa === 'paciente') indices.paciente = index;
            if (colLimpa.includes('cód. produto') || colLimpa.includes('cod. produto')) indices.codProduto = index;
            else if (colLimpa === 'produto') indices.produto = index;
            if (colLimpa.includes('não administrado')) indices.naoAdministrado = index;
            if (colLimpa.includes('devolvido') && !colLimpa.includes('pendente')) indices.devolvido = index;
            if (colLimpa.includes('pendente de devolução') || colLimpa === 'pendente') indices.pendente = index;
            if (colLimpa.includes('solicitações pendentes') || colLimpa.includes('solicitacoes pendentes')) indices.solicitacoes = index;
            if (colLimpa.includes('prescrição pendente') || colLimpa.includes('prescricao pendente')) indices.prescricao = index;
            if (colLimpa === 'unidade') indices.unidade = index;
            if (colLimpa === 'leito') indices.leito = index;
            if (colLimpa === 'alta') indices.alta = index;
          });
          break;
        }
      }

      if (cabecalhoIndex === -1) throw new Error("Cabeçalho do CSV não encontrado.");

      // Fallbacks
      if (indices.atendimento === -1) indices.atendimento = 0;
      if (indices.paciente === -1) indices.paciente = 1;
      if (indices.codProduto === -1) indices.codProduto = 2;
      if (indices.produto === -1) indices.produto = 3;
      if (indices.naoAdministrado === -1) indices.naoAdministrado = 5;
      if (indices.devolvido === -1) indices.devolvido = 6;
      if (indices.pendente === -1) indices.pendente = 7;
      if (indices.solicitacoes === -1) indices.solicitacoes = 8;
      if (indices.prescricao === -1) indices.prescricao = 9;
      if (indices.unidade === -1) indices.unidade = 10;
      if (indices.leito === -1) indices.leito = 11;
      if (indices.alta === -1) indices.alta = 12;

      let tNaoAdmin = 0, tDev = 0, tPend = 0, pendentesComAlta = 0;
      const linhasProcessadas = [];
      const mapaUnidadesPendentes: Record<string, number> = {};
      const conjuntoTodasUnidades = new Set<string>();
      const mapaProdutos: Record<string, number> = {};

      // 2. Extrair Dados
      for (let i = cabecalhoIndex + 1; i < linhas.length; i++) {
        const cols = linhas[i];
        if (cols.length < 8) continue;

        const naoAdmin = parseInt(cols[indices.naoAdministrado]) || 0;
        const dev = parseInt(cols[indices.devolvido]) || 0;
        const pend = parseInt(cols[indices.pendente]) || 0;
        const produto = cols[indices.produto] || 'Desconhecido';
        const unidade = cols[indices.unidade] || 'Não informada';
        const temAlta = cols[indices.alta] && cols[indices.alta].trim() !== '';
        
        conjuntoTodasUnidades.add(unidade);

        tNaoAdmin += naoAdmin;
        tDev += dev;
        tPend += pend;
        
        if (pend > 0 && temAlta) {
          pendentesComAlta += pend;
        }

        linhasProcessadas.push({
          id: i,
          atendimento: cols[indices.atendimento] || 'N/A',
          paciente: cols[indices.paciente] || 'N/A',
          codProduto: cols[indices.codProduto] || 'N/A',
          produto: produto,
          unidade: unidade,
          leito: cols[indices.leito] || '-',
          naoAdmin: naoAdmin,
          dev: dev,
          pend: pend,
          solicitacoes: cols[indices.solicitacoes] || '-',
          prescricao: cols[indices.prescricao] || '-',
          altaOriginal: cols[indices.alta] || '',
          alta: temAlta ? 'Sim' : 'Não'
        });

        if (pend > 0) {
          mapaUnidadesPendentes[unidade] = (mapaUnidadesPendentes[unidade] || 0) + pend;
          mapaProdutos[produto] = (mapaProdutos[produto] || 0) + pend;
        }
      }

      // 3. Formatar Top Unidades e Produtos
      const topUnidades = Object.entries(mapaUnidadesPendentes)
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);
        
      const listaUnidadesOrdenada = Array.from(conjuntoTodasUnidades).sort();

      const topProdutos = Object.entries(mapaProdutos)
        .map(([nome, valor]) => ({ nome, valor }))
        .sort((a, b) => b.valor - a.valor)
        .slice(0, 5);

      setDados({
        totais: { naoAdministrado: tNaoAdmin, devolvido: tDev, pendente: tPend },
        linhas: linhasProcessadas,
        unidades: topUnidades,
        listaTodasUnidades: listaUnidadesOrdenada,
        produtos: topProdutos,
        pendentesAlta: pendentesComAlta
      });
      setErro(null);
      
      // Reset filtros
      setTermoPesquisa('');
      setFiltroUnidade('Todas');
      setFiltroAlta('Todas');
      setFiltroPendencia('Todos');

    } catch (err: any) {
      setErro(err.message);
      setFicheiroAtivo(null);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const ficheiro = event.target.files?.[0];
    if (!ficheiro) return;
    setFicheiroAtivo(ficheiro.name);
    
    const leitor = new FileReader();
    leitor.onload = (e) => processarCSV(e.target?.result as string);
    leitor.onerror = () => setErro("Erro ao ler o ficheiro.");
    leitor.readAsText(ficheiro, 'ISO-8859-1'); 
  };
  
  const limparFiltros = () => {
    setTermoPesquisa('');
    setFiltroUnidade('Todas');
    setFiltroAlta('Todas');
    setFiltroPendencia('Todos');
  };

  const linhasFiltradas = useMemo(() => {
    return dados.linhas.filter(linha => {
      const matchPesquisa = termoPesquisa === '' || 
        linha.produto.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        linha.paciente.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        linha.atendimento.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        linha.leito.toLowerCase().includes(termoPesquisa.toLowerCase()) ||
        linha.codProduto.toLowerCase().includes(termoPesquisa.toLowerCase());
        
      const matchUnidade = filtroUnidade === 'Todas' || linha.unidade === filtroUnidade;
      const matchAlta = filtroAlta === 'Todas' || linha.alta === filtroAlta;
      
      let matchPendencia = true;
      if (filtroPendencia === 'Com Pendencia') matchPendencia = linha.pend > 0;
      if (filtroPendencia === 'Sem Pendencia') matchPendencia = linha.pend === 0;

      return matchPesquisa && matchUnidade && matchAlta && matchPendencia;
    });
  }, [dados.linhas, termoPesquisa, filtroUnidade, filtroAlta, filtroPendencia]);

  const temDados = dados.totais.naoAdministrado > 0;
  const filtrosAtivos = termoPesquisa !== '' || filtroUnidade !== 'Todas' || filtroAlta !== 'Todas' || filtroPendencia !== 'Todos';
  const taxaDevolucao = temDados ? ((dados.totais.devolvido / dados.totais.naoAdministrado) * 100).toFixed(1) : 0;
  const maxUnidadePendente = dados.unidades.length > 0 ? Math.max(...dados.unidades.map(u => u.valor)) : 1;

  return (
    <div className="bg-slate-50 font-sans text-slate-800">
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
            background-color: white !important;
          }
          @page { size: landscape; margin: 10mm; }
          .print-break-inside-avoid { page-break-inside: avoid; }
        }
      `}</style>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* CABEÇALHO */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-xl text-white">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              Inteligência de Devoluções
            </h1>
            <p className="text-slate-500 font-medium mt-1 print:hidden">
              Painel analítico detalhado de checagem e devolução de estoque.
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-end gap-3 w-full md:w-auto print:hidden">
            <input 
              type="file" accept=".csv" className="hidden" 
              ref={fileInputRef} onChange={handleFileUpload}
            />
            {temDados && (
              <button 
                onClick={() => window.print()}
                className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2 w-full md:w-auto justify-center"
              >
                <Printer size={18} />
                Exportar PDF
              </button>
            )}
            <div className="flex flex-col w-full md:w-auto">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium shadow-sm transition-all flex items-center gap-2 w-full md:w-auto justify-center"
              >
                <Upload size={18} />
                {ficheiroAtivo ? 'Substituir Ficheiro' : 'Carregar CSV'}
              </button>
              {ficheiroAtivo && (
                <span className="text-xs font-medium text-slate-400 mt-2 bg-slate-100 px-2 py-1 rounded-md text-center">
                  {ficheiroAtivo}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* SECÇÃO DE GUIA */}
        <div className="mt-8">
          <PanelGuide 
            sections={[
              {
                title: "Total Não Administrado",
                content: "Soma de todos os itens dispensados que não foram administrados ao paciente. Representa o volume total passível de devolução.",
                icon: <Package className="w-4 h-4" />
              },
              {
                title: "Eficiência de Devolução",
                content: "Percentual de itens já devolvidos em relação ao total não administrado. Uma taxa baixa indica represamento de estoque nas unidades.",
                icon: <CheckCircle className="w-4 h-4" />
              },
              {
                title: "Risco de Perda (Altas)",
                content: "Cruzamento crítico de pendências com pacientes que já receberam alta. Estes itens têm o maior risco de perda definitiva ou extravio.",
                icon: <UserX className="w-4 h-4" />
              },
              {
                title: "Top Pendências",
                content: "Identificação das unidades e produtos com maior volume de devolução pendente, direcionando as ações de recolha da farmácia.",
                icon: <Building2 className="w-4 h-4" />
              }
            ]}
          />
        </div>

        {erro && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl flex items-start gap-3 mt-4">
            <AlertCircle className="text-red-500" />
            <div>
              <h3 className="text-red-800 font-bold">Erro de processamento</h3>
              <p className="text-red-600 text-sm">{erro}</p>
            </div>
          </div>
        )}

        {temDados ? (
          <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
            
            {/* LINHA 1: KPIs Principais */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-slate-100 rounded-lg text-slate-600"><Package size={20} /></div>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total N. Admin</span>
                </div>
                <h3 className="text-3xl font-black text-slate-800">{dados.totais.naoAdministrado}</h3>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600"><CheckCircle size={20} /></div>
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Devolvido</span>
                </div>
                <h3 className="text-3xl font-black text-emerald-600">{dados.totais.devolvido}</h3>
                <div className="mt-2 text-sm text-slate-500 font-medium flex items-center gap-1">
                  Taxa: <span className="text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{taxaDevolucao}%</span>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-2 bg-amber-100 rounded-lg text-amber-600"><AlertCircle size={20} /></div>
                  <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">Pendente</span>
                </div>
                <h3 className="text-3xl font-black text-amber-500">{dados.totais.pendente}</h3>
                <p className="text-xs text-slate-400 mt-2">A aguardar devolução ao estoque</p>
              </div>

              <div className="bg-rose-50 p-5 rounded-2xl shadow-sm border border-rose-100 relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-rose-100 opacity-50"><UserX size={100} /></div>
                <div className="relative z-10">
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-2 bg-rose-200 rounded-lg text-rose-700"><UserX size={20} /></div>
                    <span className="text-xs font-bold text-rose-700 uppercase tracking-wider">Risco (Altas)</span>
                  </div>
                  <h3 className="text-3xl font-black text-rose-600">{dados.pendentesAlta}</h3>
                  <p className="text-xs text-rose-500 mt-2 font-medium leading-tight">
                    Pendentes de doentes com alta.
                  </p>
                </div>
              </div>
            </div>

            {/* LINHA 2: Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print-break-inside-avoid">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                  <Building2 className="text-blue-500" size={20}/>
                  Top 5 Unidades com Pendências
                </h3>
                <div className="space-y-4">
                  {dados.unidades.map((unidade, idx) => (
                    <div key={idx} className="relative">
                      <div className="flex justify-between text-sm font-medium mb-1">
                        <span className="text-slate-700 truncate pr-4">{unidade.nome}</span>
                        <span className="text-amber-600 font-bold">{unidade.valor} unid.</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div 
                          className="bg-amber-400 h-2 rounded-full transition-all duration-1000"
                          style={{ width: `${(unidade.valor / maxUnidadePendente) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                  {dados.unidades.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Sem pendências.</p>}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 mb-6">
                  <Pill className="text-indigo-500" size={20}/>
                  Produtos Mais Críticos (Pendentes)
                </h3>
                <div className="space-y-3">
                  {dados.produtos.map((prod, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="bg-indigo-100 text-indigo-600 font-bold w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0">
                          {idx + 1}
                        </div>
                        <p className="text-sm font-medium text-slate-700 truncate" title={prod.nome}>
                          {prod.nome.split('-')[0]}
                        </p>
                      </div>
                      <span className="text-lg font-black text-indigo-600 ml-4">{prod.valor}</span>
                    </div>
                  ))}
                  {dados.produtos.length === 0 && <p className="text-slate-400 text-sm text-center py-4">Sem produtos pendentes.</p>}
                </div>
              </div>
            </div>

            {/* LINHA 3: Explorador de Dados (Tabela + Filtros) */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex flex-col items-start gap-4">
                <div className="flex justify-between items-center w-full">
                  <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Filter className="text-blue-500 print:hidden" size={20}/>
                    Explorador de Dados
                  </h3>
                  
                  {filtrosAtivos && (
                    <button 
                      onClick={limparFiltros}
                      className="text-xs flex items-center gap-1 text-slate-500 hover:text-rose-600 transition-colors bg-slate-100 hover:bg-rose-50 px-3 py-1.5 rounded-full font-medium print:hidden"
                    >
                      <X size={14} /> Limpar Filtros
                    </button>
                  )}
                </div>
                
                {/* BARRA DE FILTROS */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 w-full bg-slate-50 p-4 rounded-xl border border-slate-200 print:hidden">
                  <div className="relative w-full">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Pesquisa Livre</label>
                    <div className="absolute inset-y-0 bottom-0 left-0 pl-3 flex items-center pointer-events-none pb-0 mt-[26px]">
                      <Search className="text-slate-400" size={16} />
                    </div>
                    <input
                      type="text"
                      placeholder="Produto, Paciente, Leito..."
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                      value={termoPesquisa}
                      onChange={(e) => setTermoPesquisa(e.target.value)}
                    />
                  </div>

                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Unidade</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700"
                      value={filtroUnidade}
                      onChange={(e) => setFiltroUnidade(e.target.value)}
                    >
                      <option value="Todas">Todas as Unidades</option>
                      {dados.listaTodasUnidades.map((unidade, idx) => (
                        <option key={idx} value={unidade}>{unidade}</option>
                      ))}
                    </select>
                  </div>

                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Status Pendência</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700"
                      value={filtroPendencia}
                      onChange={(e) => setFiltroPendencia(e.target.value)}
                    >
                      <option value="Todos">Mostrar Todos</option>
                      <option value="Com Pendencia">Apenas Com Pendências (&gt; 0)</option>
                      <option value="Sem Pendencia">Apenas Devolvidos (Pendência = 0)</option>
                    </select>
                  </div>

                  <div className="w-full">
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Status do Paciente (Alta)</label>
                    <select
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-slate-700"
                      value={filtroAlta}
                      onChange={(e) => setFiltroAlta(e.target.value)}
                    >
                      <option value="Todas">Ambos</option>
                      <option value="Sim">Apenas Pacientes com Alta (Risco)</option>
                      <option value="Não">Pacientes Internados</option>
                    </select>
                  </div>
                </div>
                
                <div className="text-xs text-slate-500 font-medium print:mt-2">
                  Exibindo <span className="text-blue-600 font-bold">{linhasFiltradas.length}</span> resultados de um total de {dados.linhas.length} registros.
                </div>
              </div>

              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-4 whitespace-nowrap">Atend.</th>
                      <th className="px-4 py-4 whitespace-nowrap">Paciente</th>
                      <th className="px-4 py-4 whitespace-nowrap">Cód. Prod</th>
                      <th className="px-6 py-4">Produto</th>
                      <th className="px-4 py-4 whitespace-nowrap">Unidade</th>
                      <th className="px-4 py-4 whitespace-nowrap">Leito</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Não Admin.</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Devolvido</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Pendente</th>
                      <th className="px-6 py-4">Solicitações</th>
                      <th className="px-6 py-4">Prescrição Pendente</th>
                      <th className="px-4 py-4 text-center whitespace-nowrap">Alta?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linhasFiltradas.map((linha) => (
                      <tr key={linha.id} className="hover:bg-blue-50/50 transition-colors text-xs">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{linha.atendimento}</td>
                        <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">{linha.paciente}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{linha.codProduto}</td>
                        <td className="px-6 py-3 text-slate-800 font-medium whitespace-normal break-words" title={linha.produto}>
                          {linha.produto}
                        </td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{linha.unidade}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{linha.leito}</td>
                        <td className="px-4 py-3 text-center font-medium text-slate-600">{linha.naoAdmin}</td>
                        <td className="px-4 py-3 text-center font-medium text-emerald-600">{linha.dev}</td>
                        <td className="px-4 py-3 text-center">
                          {linha.pend > 0 ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-amber-100 text-amber-700 font-bold">
                              {linha.pend}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-slate-500 whitespace-normal break-words" title={linha.solicitacoes}>
                          {linha.solicitacoes}
                        </td>
                        <td className="px-6 py-3 text-slate-500 whitespace-normal break-words" title={linha.prescricao}>
                          {linha.prescricao.split('||').map((item: string, i: number) => (
                            item.trim() ? <div key={i} className="mb-1">{item.trim()}</div> : null
                          ))}
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                           {linha.alta === 'Sim' ? (
                             <span className="inline-flex items-center gap-1 font-bold text-rose-600 bg-rose-50 px-2 py-1 rounded-md" title={linha.altaOriginal}>
                               Sim
                             </span>
                           ) : (
                             <span className="text-slate-400">Não</span>
                           )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {linhasFiltradas.length === 0 && (
                  <div className="p-12 text-center flex flex-col items-center justify-center">
                    <Filter size={48} className="text-slate-300 mb-4" />
                    <h3 className="text-lg font-medium text-slate-600 mb-1">Nenhum registro corresponde aos filtros</h3>
                    <p className="text-slate-400 text-sm mb-4">Tente alterar ou limpar os filtros atuais para ver mais resultados.</p>
                    <button 
                      onClick={limparFiltros}
                      className="text-blue-600 hover:text-blue-800 font-medium text-sm underline underline-offset-2"
                    >
                      Limpar todos os filtros
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        ) : !erro && (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 border-dashed p-16 text-center text-slate-500 mt-8">
            <div className="w-24 h-24 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileSpreadsheet size={48} />
            </div>
            <h3 className="text-2xl font-bold text-slate-700 mb-2">Pronto para Analisar</h3>
            <p className="max-w-md mx-auto text-slate-400">
              Carregue o arquivo <strong className="font-semibold">checagem e devolução.CSV</strong> para gerar instantaneamente o painel de inteligência de estoque.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
