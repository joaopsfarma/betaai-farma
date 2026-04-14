import { TabId } from '../components/layout/Sidebar';

export interface TutorialData {
  tabId: TabId;
  title: string;
  subtitle: string;
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  description: string;
  dataNeeded: string[];
  keyMetrics: Array<{ label: string; description: string }>;
  pharmContext: string;
  tips: string[];
}

export const TUTORIALS: Partial<Record<TabId, TutorialData>> = {

  analise_dispensacao: {
    tabId: 'analise_dispensacao',
    title: 'Análise de Dispensação',
    subtitle: 'Monitoramento de saídas por dispensário e unidade',
    icon: '📊',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-600',
    description:
      'Este painel consolida os dados de dispensação hospitalar, permitindo visualizar o ' +
      'volume de saídas por dispensário, por classe terapêutica e por período. É a principal ' +
      'ferramenta para identificar padrões de consumo e subsidiar o ressuprimento centralizado.',
    dataNeeded: [
      'CSV de dispensação exportado do sistema de gestão hospitalar (SGH/MV/Tasy)',
      'Colunas obrigatórias: Produto, Código, Dispensário, Data, Quantidade, Unidade',
      'Período recomendado: últimos 30 a 90 dias para análises de tendência',
      'Opcional: arquivo de mapeamento de produtos (de/para de código → nome)',
    ],
    keyMetrics: [
      { label: 'CMM', description: 'Consumo Médio Mensal — base de cálculo para ponto de ressuprimento e estoque de segurança.' },
      { label: 'Cobertura (dias)', description: 'Dias que o estoque atual suporta com base no CMM. Abaixo de 7 dias é crítico.' },
      { label: 'Top 20 ABC', description: 'Classe A: ~20% dos itens representando ~80% do custo ou volume — foco prioritário.' },
      { label: 'Taxa Atendimento', description: 'Percentual de solicitações atendidas integralmente pelo dispensário no período.' },
    ],
    pharmContext:
      'Na farmácia hospitalar, a análise de dispensação é o ponto de partida da gestão por ' +
      'processos. A CAF (Central de Abastecimento Farmacêutico) utiliza esses dados para ' +
      'calibrar os lotes de ressuprimento dos dispensários satélites, respeitando a ' +
      'metodologia FEFO (First Expired, First Out) e as cotas máximas por unidade. ' +
      'Conforme a RDC 67/2007, toda dispensação deve ser rastreável até o prescritor.',
    tips: [
      'Importe o CSV logo após a virada de turno da manhã para refletir o ciclo de 24h completo.',
      'Use o filtro de Classe ABC para priorizar análise nos itens de maior impacto financeiro.',
      'Compare dois períodos lado a lado para identificar sazonalidade ou mudanças de protocolo.',
      'Produtos com cobertura < 3 dias devem ser escalados ao farmacêutico responsável imediatamente.',
    ],
  },

  analise_dispensacao_v2: {
    tabId: 'analise_dispensacao_v2',
    title: 'Análise de Dispensação V2',
    subtitle: 'Cruzamento de requisições com consumo por paciente',
    icon: '📈',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-violet-700',
    description:
      'Versão aprimorada da análise de dispensação com cruzamento entre o relatório 7400 ' +
      '(requisições de dispensário) e o R_CONS_PAC (consumo por paciente). Permite identificar ' +
      'divergências entre o que foi solicitado e o que foi efetivamente consumido, revelando ' +
      'sobras, perdas e não conformidades no ciclo de dispensação.',
    dataNeeded: [
      'CSV do relatório 7400 (requisições dos dispensários ao almoxarifado)',
      'CSV R_CONS_PAC (consumo registrado por paciente no sistema)',
      'Período idêntico nos dois arquivos para garantir comparabilidade',
    ],
    keyMetrics: [
      { label: 'Divergência Prescrito/Dispensado', description: 'Diferença entre quantidade prescrita e efetivamente dispensada ao paciente.' },
      { label: 'Aderência ao Protocolo', description: 'Percentual de atendimentos em que a dispensação seguiu exatamente o protocolo definido.' },
      { label: 'Itens com Retorno', description: 'Medicamentos dispensados mas devolvidos — indicador de superdimensionamento de cota.' },
      { label: 'Pacientes Ativos', description: 'Número de pacientes distintos que geraram demandas de dispensação no período.' },
    ],
    pharmContext:
      'O cruzamento de dados 7400 × R_CONS_PAC é uma das ferramentas mais poderosas da ' +
      'farmácia clínica hospitalar. Ele expõe a brecha entre a "dispensação formal" e o ' +
      '"uso real" — divergências acima de 5% podem indicar erros de registro, desvio de ' +
      'medicamentos ou falhas no processo de devolução. A SBRAFH recomenda essa auditoria ' +
      'quinzenal para itens de alto custo e medicamentos sujeitos à Portaria 344.',
    tips: [
      'Priorize a análise em itens de Classe A com alta divergência — são os de maior impacto financeiro.',
      'Divergências de pacientes específicos podem indicar erros de identificação ou desvio — escale ao farmacêutico clínico.',
      'Use o filtro de período semanal para identificar padrões por dia da semana (fins de semana costumam ter mais divergências).',
    ],
  },

  dispensary: {
    tabId: 'dispensary',
    title: 'Análise de Dispensários',
    subtitle: 'Performance operacional dos dispensários automatizados',
    icon: '🏥',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    description:
      'Dashboard completo de performance dos dispensários automatizados (Pyxis, Omnicell, BD ' +
      'Rowa ou similares). Consolida métricas de abertura de gavetas, retiradas com sucesso, ' +
      'erros de código, aderência à prescrição e transferências entre unidades.',
    dataNeeded: [
      'CSV de eventos do dispensário automatizado (exportado pelo próprio equipamento ou SGH)',
      'Relatório de códigos inválidos e tentativas de abertura sem retirada',
      'Dados de transferências entre dispensários do período',
    ],
    keyMetrics: [
      { label: 'Taxa de Erro', description: 'Percentual de tentativas de abertura de gaveta que resultaram em erro ou não retirada.' },
      { label: 'Aderência Prescrição', description: 'Percentual de retiradas que correspondem exatamente a um item prescrito no prontuário.' },
      { label: 'Códigos Inválidos', description: 'Número de tentativas com código de produto não cadastrado — indica erro de configuração.' },
      { label: 'Transferências', description: 'Volume e taxa de conclusão de transferências entre dispensários satélites.' },
    ],
    pharmContext:
      'Os dispensários automatizados são um pilar da segurança do paciente na farmácia ' +
      'hospitalar moderna. Erros de abertura e códigos inválidos frequentemente indicam ' +
      'falhas no cadastro de produtos ou troca de embalagem pelo fornecedor sem atualização ' +
      'no sistema. A RDC 67/2007 e as normas ISMP Brasil exigem auditoria periódica dos ' +
      'registros de dispensação automatizada, especialmente para medicamentos de alta vigilância.',
    tips: [
      'Taxas de erro acima de 10% em um dispensário específico indicam necessidade de recadastramento de itens.',
      'Monitore o ranking de usuários com mais tentativas inválidas — pode indicar necessidade de treinamento.',
      'Análise horária de demanda ajuda a otimizar os horários de ressuprimento dos dispensários.',
      'Compare a aderência à prescrição por unidade para identificar onde o processo de prescrição precisa de apoio.',
    ],
  },

  analise_dispensarios_v2: {
    tabId: 'analise_dispensarios_v2',
    title: 'Análise Dispensários V2',
    subtitle: 'Visão consolidada e simplificada por unidade',
    icon: '📉',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-purple-700',
    description:
      'Versão simplificada da análise de dispensários, focada nas métricas primárias de ' +
      'volume e atendimento por unidade hospitalar. Ideal para apresentações gerenciais e ' +
      'acompanhamento rápido do estado operacional dos dispensários.',
    dataNeeded: [
      'CSV de dispensação consolidado por unidade e turno',
      'Dados de volume total por dispensário no período',
    ],
    keyMetrics: [
      { label: 'Volume por Unidade', description: 'Total de retiradas em cada dispensário no período — base para dimensionamento de estoque.' },
      { label: 'Atendimento (%)', description: 'Percentual de solicitações atendidas sem interrupção ou falta de item.' },
      { label: 'Pico de Demanda', description: 'Horário ou turno com maior concentração de retiradas — referência para escalonamento de equipe.' },
    ],
    pharmContext:
      'A visão consolidada por dispensário permite ao gestor de farmácia hospitalar ' +
      'comparar a eficiência operacional entre unidades e identificar quais dispensários ' +
      'necessitam de ajuste de cota ou reconfiguração de itens. Hospitais acreditados ' +
      '(ONA, JCI) exigem monitoramento mensal desses indicadores como evidência de ' +
      'controle do ciclo de medicamentos.',
    tips: [
      'Use esta visão para reuniões de gestão — é mais acessível que a V1 para público não-farmacêutico.',
      'Compare mês a mês para identificar crescimento de demanda que justifique expansão de cotas.',
    ],
  },

  analise_operacional: {
    tabId: 'analise_operacional',
    title: 'Análise Operacional',
    subtitle: 'Eficiência do ciclo de abastecimento interno',
    icon: '⚙️',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-600',
    description:
      'Painel de eficiência operacional que avalia todo o ciclo de abastecimento interno — ' +
      'desde a geração da requisição pelo dispensário até a entrega pela CAF. Identifica ' +
      'gargalos no fluxo, tempo médio de atendimento e taxas de falha por etapa do processo.',
    dataNeeded: [
      'CSV de requisições com timestamps de cada etapa (geração, separação, conferência, entrega)',
      'Dados de equipe por turno para cálculo de produtividade por farmacêutico/técnico',
    ],
    keyMetrics: [
      { label: 'Lead Time CAF', description: 'Tempo médio entre a geração da requisição e a entrega ao dispensário (meta: < 60 min).' },
      { label: 'Taxa de Erro Separação', description: 'Percentual de pedidos com divergência identificada na conferência dupla.' },
      { label: 'Produtividade/Turno', description: 'Número de pedidos atendidos por técnico por turno — base para dimensionamento de equipe.' },
      { label: 'Retrabalho', description: 'Percentual de pedidos que precisaram de nova separação por erro — custo oculto da operação.' },
    ],
    pharmContext:
      'A eficiência operacional da CAF impacta diretamente a segurança do paciente. ' +
      'Um lead time elevado aumenta o risco de falta no dispensário; uma taxa de erro de ' +
      'separação alta aumenta o risco de erro de medicação. A metodologia Lean Healthcare ' +
      'aplicada à farmácia hospitalar (amplamente adotada por hospitais de excelência como ' +
      'Sírio-Libanês e Albert Einstein) usa exatamente esses indicadores para mapear perdas ' +
      'e otimizar o fluxo de valor.',
    tips: [
      'Mapeie os horários de pico de requisição para dimensionar equipe nos turnos críticos.',
      'Taxa de erro de separação acima de 2% requer revisão do processo de conferência dupla.',
      'Lead time acima de 90 min deve acionar revisão de priorização de pedidos urgentes.',
    ],
  },

  indicadores_caf: {
    tabId: 'indicadores_caf',
    title: 'Indicadores CAF',
    subtitle: 'KPIs da Central de Abastecimento Farmacêutico',
    icon: '📋',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-600',
    description:
      'Painel completo de KPIs da CAF (Central de Abastecimento Farmacêutico), cobrindo ' +
      'os principais indicadores de qualidade, produtividade e conformidade exigidos por ' +
      'acreditadoras (ONA, JCI) e pela ANVISA. Base para relatórios gerenciais e ' +
      'reuniões de comitê farmacoterapêutico.',
    dataNeeded: [
      'Dados de dispensação, devolução e inventário do período (últimos 30 dias)',
      'Registro de não conformidades e desvios de qualidade do período',
      'Dados de consumo e movimentação financeira (para indicadores de custo)',
    ],
    keyMetrics: [
      { label: 'Giro de Estoque', description: 'Consumo / Estoque médio. Meta: 12–24x/ano. Abaixo indica capital parado.' },
      { label: 'Taxa de Ruptura', description: 'Itens com saldo zero / Total de itens ativos. Meta: < 2%.' },
      { label: 'Acurácia Inventário', description: 'Itens com saldo físico correto / Total. Meta: > 98%.' },
      { label: 'Devolução de Dose', description: 'Doses devolvidas / Doses dispensadas. Meta: < 5%.' },
    ],
    pharmContext:
      'Os indicadores da CAF são a linguagem de gestão da farmácia hospitalar. Segundo o ' +
      'Manual de Indicadores da SBRAFH (2022), instituições que monitoram regularmente esses ' +
      'KPIs reduzem o desperdício de medicamentos em até 23% e melhoram a taxa de ruptura em ' +
      'até 40%. A ANVISA e as acreditadoras exigem que esses indicadores sejam documentados ' +
      'mensalmente e disponibilizados para auditorias.',
    tips: [
      'Giro abaixo de 12x/ano para itens de alto custo sinaliza necessidade de revisão da cota máxima.',
      'Taxa de ruptura acima de 2% deve acionar reunião de análise de causa raiz imediata.',
      'Acompanhe a tendência dos últimos 6 meses — variação isolada é ruído, tendência é sinal.',
      'Documente as metas acordadas com a direção para cada KPI — isso facilita a prestação de contas.',
    ],
  },

  indicadores_logisticos_v2: {
    tabId: 'indicadores_logisticos_v2',
    title: 'Indicadores Logísticos V2',
    subtitle: 'Acurácia, perdas e cobertura na cadeia de suprimentos',
    icon: '🚚',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-green-700',
    description:
      'Painel avançado de indicadores logísticos cobrindo acurácia de atendimento, análise ' +
      'de perdas por tipo (quebra, validade, estabilidade), variação de inventário por local ' +
      'e padrão horário de demanda. Permite visão end-to-end da cadeia de suprimentos farmacêutica.',
    dataNeeded: [
      'CSV de movimentação de estoque com tipos de saída (dispensação, perda, transferência, devolução)',
      'Relatório de perdas classificadas por tipo e setor do período',
      'Dados de inventário por local (CAF, dispensários, farmácias satélites)',
    ],
    keyMetrics: [
      { label: 'Acurácia Atendimento', description: 'Percentual de itens atendidos na quantidade exata solicitada. Meta: > 95%.' },
      { label: 'Perda por Validade', description: 'Valor de medicamentos descartados por vencimento. Meta: < 0,5% do estoque médio.' },
      { label: 'Variação Inventário', description: 'Diferença entre saldo físico e saldo sistema por local. Identifica pontos de desvio.' },
      { label: 'Cobertura por Local', description: 'Dias de estoque disponível em cada ponto da cadeia. Meta mínima: 7 dias.' },
    ],
    pharmContext:
      'Perdas por validade são um dos principais indicadores de ineficiência na gestão ' +
      'farmacêutica e podem representar de 1% a 5% do orçamento de medicamentos em ' +
      'hospitais sem controle estruturado. O método FEFO (First Expired, First Out) é ' +
      'mandatório pela RDC 204/2017 para armazenamento e distribuição de medicamentos. ' +
      'Variações de inventário acima de 2% exigem investigação formal de acordo com as ' +
      'boas práticas de armazenamento (BPA).',
    tips: [
      'Filtre perdas por tipo para identificar se o problema é operacional (quebra) ou de planejamento (validade).',
      'Variação de inventário elevada em um local específico pode indicar furto ou erro sistemático de registro.',
      'O gráfico horário de demanda ajuda a alocar equipe de separação nos momentos certos.',
    ],
  },

  analytics: {
    tabId: 'analytics',
    title: 'Insights do Farma',
    subtitle: 'Dashboard analítico com previsão de cobertura e curva ABC',
    icon: '💡',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-purple-800',
    description:
      'Dashboard central de análise do inventário farmacêutico. Importa CSVs de consumo ' +
      'e lotes para calcular automaticamente a curva ABC, cobertura por item, status de ' +
      'validade e alertas de ruptura. É a visão executiva do estado do estoque.',
    dataNeeded: [
      'CSV de consumo de medicamentos (período mínimo: 30 dias)',
      'CSV de lotes com datas de validade por item',
      'Opcional: CSV de estoque atual para cruzamento com consumo',
    ],
    keyMetrics: [
      { label: 'Curva ABC', description: 'Classificação de itens por impacto financeiro/volume. A (vital), B (importante), C (trivial).' },
      { label: 'Cobertura Média', description: 'Média de dias de estoque disponível considerando o CMM de cada item.' },
      { label: 'Itens em Alerta', description: 'Quantidade de itens com cobertura abaixo do mínimo definido (geralmente 7 dias).' },
      { label: 'Próximos ao Vencimento', description: 'Lotes com validade em até 90 dias — base para o plano de remanejamento FEFO.' },
    ],
    pharmContext:
      'A curva ABC é a ferramenta mais utilizada na gestão de estoques farmacêuticos. ' +
      'Em média, 20% dos itens de uma farmácia hospitalar respondem por 80% do custo total ' +
      '(lei de Pareto). Itens Classe A exigem monitoramento diário, negociação de contratos ' +
      'com fornecedores preferenciais e estoque de segurança calculado com precisão. ' +
      'Este painel automatiza essa classificação com base nos seus dados reais.',
    tips: [
      'Ajuste o "Top N" da análise Pareto conforme o porte do seu estoque — hospitais maiores podem usar Top 50.',
      'Itens Classe A com cobertura abaixo de 7 dias devem ter pedido emergencial gerado imediatamente.',
      'Lotes próximos ao vencimento em Classe A são prioridade máxima para remanejamento ou uso intensivo.',
      'Atualize os dados semanalmente para manter a análise relevante e os alertas precisos.',
    ],
  },

  transfer: {
    tabId: 'transfer',
    title: 'Requisição de Transferência',
    subtitle: 'Geração automática de pedidos por cobertura de 7 dias',
    icon: '📦',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-700',
    description:
      'Módulo de geração automática de requisições de ressuprimento baseado em modelo de ' +
      'cobertura de 7 dias. Importa o inventário atual e calcula quais itens precisam ser ' +
      'pedidos, em qual quantidade e com qual lote (FEFO), para manter a cobertura-alvo.',
    dataNeeded: [
      'CSV de inventário com: código, nome, unidade, consumo médio, saldo atual, preço',
      'CSV de estoque do fornecedor/almoxarifado com lotes e validades disponíveis',
    ],
    keyMetrics: [
      { label: 'Cobertura-Alvo', description: 'Número de dias de estoque que o pedido deve garantir (padrão: 7 dias, ajustável).' },
      { label: 'Qtd. a Pedir', description: 'Volume calculado = (CMM × dias-alvo) − saldo atual. Nunca negativo.' },
      { label: 'Lote FEFO', description: 'Lote selecionado automaticamente pelo critério First Expired, First Out.' },
      { label: 'Valor Total Pedido', description: 'Custo estimado da requisição em R$ para aprovação orçamentária.' },
    ],
    pharmContext:
      'O modelo de cobertura de 7 dias é o padrão mais utilizado em farmácias hospitalares ' +
      'com ressuprimento semanal. Hospitais com ressuprimento quinzenal devem ajustar para ' +
      '15 dias; UTIs e emergências frequentemente usam 3 dias para garantir disponibilidade ' +
      'contínua. O critério FEFO é exigência da RDC 204/2017 e das boas práticas de ' +
      'armazenamento da ANVISA — nunca utilize um lote mais novo enquanto há um mais antigo disponível.',
    tips: [
      'Ajuste o parâmetro de dias de cobertura conforme a frequência de entrega do seu fornecedor.',
      'Revise itens com consumo zero antes de confirmar — podem ser itens descontinuados ou com nome alterado.',
      'Exporte o pedido e envie ao comprador com o número da ata de registro de preços vigente.',
      'Para itens controlados (Portaria 344), gere a requisição separadamente com o número da receita.',
    ],
  },

  requisicao_v2: {
    tabId: 'requisicao_v2',
    title: 'Requisição V2',
    subtitle: 'Gestão avançada de requisições com rastreio de status',
    icon: '📝',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-700',
    description:
      'Versão aprimorada do módulo de requisições, com rastreabilidade completa do ciclo ' +
      'de vida de cada pedido — da geração ao recebimento. Permite acompanhar status em ' +
      'tempo real, registrar divergências e gerar relatórios de conformidade de entrega.',
    dataNeeded: [
      'CSV de requisições com número do pedido, data de geração e status atual',
      'Dados do fornecedor e prazo de entrega contratual para cada item',
    ],
    keyMetrics: [
      { label: 'Pedidos em Aberto', description: 'Requisições geradas ainda não atendidas pelo fornecedor.' },
      { label: 'Atendimento no Prazo', description: 'Percentual de pedidos entregues dentro do prazo contratual (SLA do fornecedor).' },
      { label: 'Divergências', description: 'Pedidos com diferença entre quantidade solicitada e quantidade recebida.' },
      { label: 'Tempo Médio Atendimento', description: 'Lead time médio do fornecedor — base para cálculo do estoque de segurança.' },
    ],
    pharmContext:
      'O rastreio de requisições é fundamental para a gestão de contratos farmacêuticos. ' +
      'A Nova Lei de Licitações (Lei 14.133/2021) exige registro formal de todas as ' +
      'ocorrências de não conformidade para embasar penalizações contratuais. ' +
      'Fornecedores com índice de atraso acima de 10% devem ser notificados formalmente ' +
      'e incluídos no plano de contingência de abastecimento.',
    tips: [
      'Registre divergências de quantidade imediatamente no recebimento para embasar glosa no boleto.',
      'Fornecedores com atrasos recorrentes devem ser avaliados no módulo de Avaliação de Fornecedores.',
      'Use o filtro de "em aberto" para cobrar entregas pendentes antes do fechamento do período.',
    ],
  },

  ressuprimento: {
    tabId: 'ressuprimento',
    title: 'Ressuprimento de Estoque',
    subtitle: 'Previsão de ruptura e geração de pedidos automáticos',
    icon: '🔄',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-purple-700',
    description:
      'O módulo de Ressuprimento calcula automaticamente quais itens estão com cobertura ' +
      'crítica e gera uma lista priorizada de pedidos. Utiliza o CMM dos últimos 30 dias ' +
      'combinado com o saldo atual para projetar a data estimada de ruptura de cada produto.',
    dataNeeded: [
      'CSV de posição de estoque atual (saldo por item e unidade)',
      'CSV ou histórico de consumo dos últimos 30 dias (para cálculo do CMM)',
      'Parâmetros de cobertura mínima e máxima por categoria (definidos pelo farmacêutico)',
    ],
    keyMetrics: [
      { label: 'Prev. Ruptura', description: 'Data estimada em que o item atingirá saldo zero, com base no CMM e saldo atual.' },
      { label: 'Qtd. a Pedir', description: 'Volume de reposição calculado para atingir o estoque máximo sem desperdício.' },
      { label: 'Tendência Consumo', description: 'Indica se o consumo está crescente, estável ou em queda nos últimos 14 dias.' },
      { label: 'Status', description: 'CRÍTICO: ruptura em < 3 dias. ATENÇÃO: 3–7 dias. NORMAL: > 7 dias de cobertura.' },
    ],
    pharmContext:
      'O ressuprimento baseado em dados substitui o modelo reativo ("pediu porque faltou") ' +
      'pelo modelo proativo. Segundo as boas práticas da SBRAFH, a cobertura mínima para ' +
      'medicamentos de uso contínuo deve ser de 7 dias, e de 15 dias para itens de ' +
      'abastecimento quinzenal. Itens classificados como Classe A (protocolo ou alto custo) ' +
      'exigem monitoramento diário e estoque de segurança calculado com desvio padrão do consumo.',
    tips: [
      'Ordene a lista por "Prev. Ruptura" crescente para atuar sempre nos casos mais urgentes primeiro.',
      'Exporte o relatório TXT para compartilhar com a equipe de compras sem acesso ao sistema.',
      'Itens com tendência de consumo crescente devem ter a quantidade pedida majorada em 20%.',
      'Revise os parâmetros de cobertura mínima a cada 6 meses ou após mudanças de protocolo clínico.',
    ],
  },

  supply: {
    tabId: 'supply',
    title: 'Supply Chain',
    subtitle: 'Visão estratégica da cadeia de suprimentos farmacêutica',
    icon: '🔗',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-cyan-700',
    description:
      'Painel estratégico de supply chain com visualizações multidimensionais — radar de ' +
      'desempenho, dispersão de fornecedores e tendências de cobertura. Projetado para ' +
      'gestores que precisam de uma visão consolidada da cadeia de suprimentos para ' +
      'tomada de decisão estratégica.',
    dataNeeded: [
      'Dados consolidados de abastecimento (múltiplos fornecedores e categorias)',
      'Histórico de desempenho de fornecedores (OTD, conformidade, divergências)',
      'Dados de cobertura e inventário dos últimos 3 a 6 meses',
    ],
    keyMetrics: [
      { label: 'Radar de Desempenho', description: 'Visão multidimensional: qualidade, prazo, custo, disponibilidade e conformidade.' },
      { label: 'Dispersão Fornecedores', description: 'Gráfico valor × nota — identifica fornecedores estratégicos e de risco.' },
      { label: 'Tendência Cobertura', description: 'Evolução histórica da cobertura de estoque — detecta deterioração gradual.' },
    ],
    pharmContext:
      'A gestão estratégica de supply chain farmacêutico envolve equilibrar três objetivos ' +
      'frequentemente conflitantes: disponibilidade (zero ruptura), custo (menor desperdício) ' +
      'e qualidade (conformidade ANVISA). Hospitais de referência utilizam matrizes de ' +
      'segmentação de fornecedores para classificar parceiros por criticidade e direcionar ' +
      'esforços de qualificação e desenvolvimento de fornecedores alternativos.',
    tips: [
      'Use o radar de desempenho para identificar dimensões que precisam de melhoria prioritária.',
      'Fornecedores no quadrante "alto valor, baixa nota" são os de maior risco estratégico.',
      'Acompanhe a tendência de cobertura por categoria para antecipar crises sazonais.',
    ],
  },

  'abastecimento-farmaceutico': {
    tabId: 'abastecimento-farmaceutico',
    title: 'Visão de Abastecimento',
    subtitle: 'Monitoramento em tempo real do fluxo de abastecimento',
    icon: '🏭',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    description:
      'Painel principal de monitoramento do fluxo de abastecimento farmacêutico, com ' +
      'visão em tempo real das requisições, status de atendimento e taxa de fulfillment ' +
      'por unidade. Pode ser projetado em TV para acompanhamento pela equipe operacional da CAF.',
    dataNeeded: [
      'Dados de requisições ativas do dia (sincronizados com o SGH ou importados via CSV)',
      'Status de atendimento por requisição (pendente, em separação, entregue, parcial)',
    ],
    keyMetrics: [
      { label: 'Fulfillment Rate', description: 'Percentual de itens da requisição atendidos integralmente. Meta: > 95%.' },
      { label: 'Pendências Críticas', description: 'Requisições de itens com status URGENTE não atendidas há mais de 30 minutos.' },
      { label: 'Em Separação', description: 'Volume de pedidos atualmente sendo processados pela equipe da CAF.' },
      { label: 'Entregues no Período', description: 'Total de requisições concluídas no turno ou dia atual.' },
    ],
    pharmContext:
      'O monitoramento em tempo real do abastecimento é uma prática avançada que elimina ' +
      'a necessidade de ligações telefônicas entre unidades e CAF para verificar status de ' +
      'pedidos. Reduz o lead time médio de atendimento e aumenta a satisfação da equipe de ' +
      'enfermagem. O Painel TV complementa esta visão com uma exibição otimizada para ' +
      'ambientes de trabalho coletivo.',
    tips: [
      'Utilize o botão "Painel TV" para projetar em tela grande na área de separação da CAF.',
      'Requisições com status "parcial" por mais de 1 hora devem ser investigadas pelo farmacêutico de plantão.',
      'O sidebar é automaticamente recolhido nesta aba para maximizar a área de visualização.',
    ],
  },

  painel_caf: {
    tabId: 'painel_caf',
    title: 'Painel CAF',
    subtitle: 'Dashboard operacional da Central de Abastecimento Farmacêutico',
    icon: '🏬',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-700',
    description:
      'Dashboard operacional da CAF com visão consolidada das principais métricas do ' +
      'dia: volume de pedidos, status de atendimento, itens críticos e alertas ativos. ' +
      'Projetado para uso contínuo pela equipe da farmácia durante o expediente.',
    dataNeeded: [
      'Dados operacionais do dia corrente (requisições, status, equipe)',
      'Configuração de alertas e limites críticos para os itens monitorados',
    ],
    keyMetrics: [
      { label: 'Pedidos do Dia', description: 'Volume total de requisições recebidas e processadas no dia atual.' },
      { label: 'Itens Críticos', description: 'Medicamentos com saldo zerado ou abaixo do mínimo de segurança.' },
      { label: 'Alertas Ativos', description: 'Número de alertas não resolvidos que requerem ação imediata da equipe.' },
      { label: 'Eficiência Turno', description: 'Percentual de pedidos do turno atendidos dentro do SLA estabelecido.' },
    ],
    pharmContext:
      'A CAF é o coração operacional da farmácia hospitalar. Seu desempenho impacta ' +
      'diretamente todos os setores do hospital — da UTI ao centro cirúrgico. ' +
      'Um painel operacional eficiente permite que o farmacêutico responsável tome ' +
      'decisões proativas em vez de reativas, antecipando problemas antes que gerem ' +
      'interrupção no cuidado ao paciente.',
    tips: [
      'Verifique os alertas ativos no início de cada turno antes de qualquer outra atividade.',
      'Itens críticos com previsão de entrega definida devem ter essa informação registrada no painel.',
    ],
  },

  painel_caf_v2: {
    tabId: 'painel_caf_v2',
    title: 'Painel CAF V2',
    subtitle: 'Versão aprimorada do dashboard operacional da CAF',
    icon: '🏬',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-700',
    description:
      'Versão evoluída do Painel CAF com interface aprimorada, mais métricas e melhor ' +
      'visualização dos alertas por prioridade. Inclui novas funcionalidades de ' +
      'acompanhamento de metas e comparação com períodos anteriores.',
    dataNeeded: [
      'Mesmos dados do Painel CAF + histórico dos últimos 7 dias para comparação',
    ],
    keyMetrics: [
      { label: 'Meta do Período', description: 'Progresso em relação às metas definidas para o turno ou dia.' },
      { label: 'Comparativo', description: 'Variação percentual em relação ao mesmo período da semana anterior.' },
      { label: 'Prioridade Alta', description: 'Pedidos classificados como urgentes aguardando atendimento imediato.' },
    ],
    pharmContext:
      'A comparação com períodos anteriores é essencial para identificar se o desempenho ' +
      'da CAF está melhorando ou deteriorando. Hospitais com gestão madura de farmácia ' +
      'estabelecem metas mensais para cada KPI e fazem revisões semanais de progresso, ' +
      'conectando o desempenho operacional ao planejamento estratégico.',
    tips: [
      'Compare o desempenho entre semanas para identificar padrões de queda em dias específicos.',
      'Use as metas visuais para motivar a equipe e comunicar expectativas de forma clara.',
    ],
  },

  remanejamento: {
    tabId: 'remanejamento',
    title: 'Remanejamento de Estoque',
    subtitle: 'Redistribuição inteligente entre unidades para evitar rupturas',
    icon: '↔️',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-700',
    description:
      'Sistema de análise e sugestão de remanejamento de estoque entre unidades hospitalares. ' +
      'Processa a posição de estoque de todas as unidades e identifica automaticamente onde ' +
      'há excesso e onde há déficit, sugerindo transferências otimizadas para equilibrar ' +
      'a cobertura sem gerar novos pedidos desnecessários.',
    dataNeeded: [
      'CSV R_POS_EST (posição de estoque por item e unidade — exportado do sistema Genesis)',
      'Histórico de consumo dos últimos 120 dias por unidade (quadrimestre)',
      'Parâmetros de estoque mínimo e máximo por item e unidade (configurados na farmácia)',
    ],
    keyMetrics: [
      { label: 'Itens em Excesso', description: 'Saldo acima do máximo estabelecido — candidatos a remanejamento para unidades deficitárias.' },
      { label: 'Itens Críticos', description: 'Saldo abaixo do mínimo — unidades que devem receber transferência prioritária.' },
      { label: 'Economia Estimada', description: 'Valor financeiro de compras que podem ser evitadas com os remanejamentos sugeridos.' },
      { label: 'Sugestões de Alta Prioridade', description: 'Transferências urgentes — item crítico em uma unidade com excesso em outra.' },
    ],
    pharmContext:
      'O remanejamento é uma ferramenta poderosa de gestão em redes hospitalares ou ' +
      'hospitais com múltiplos centros de custo. Antes de gerar qualquer pedido de compra, ' +
      'o farmacêutico responsável deve verificar se não há estoque disponível em outra ' +
      'unidade. Isso é especialmente relevante para medicamentos de alto custo, ' +
      'biológicos e itens com validade próxima — onde a FEFO torna o remanejamento ' +
      'urgente para evitar perda financeira.',
    tips: [
      'Execute o remanejamento antes de gerar as requisições semanais para evitar compras desnecessárias.',
      'Priorize sugestões de ALTA prioridade — são itens críticos com solução imediata disponível.',
      'Salve o snapshot no bot WhatsApp para consultas rápidas da equipe de plantão.',
      'Itens "SEM CONSUMO" por mais de 90 dias devem ser avaliados para descontinuação do item na unidade.',
    ],
  },

  multidose: {
    tabId: 'multidose',
    title: 'Controle de Multidose',
    subtitle: 'Rastreio de medicamentos de uso fracionado por paciente',
    icon: '💊',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-purple-700',
    description:
      'Painel de controle e rastreio de medicamentos multidose — frascos e embalagens ' +
      'compartilhadas entre pacientes com dispensação fracionada (gotas, ml, comprimidos ' +
      'fracionados). Cruza os dados de estoque com as prescrições ativas para identificar ' +
      'discrepâncias e garantir a rastreabilidade exigida pela ANVISA.',
    dataNeeded: [
      'CSV de estoque de medicamentos multidose (códigos dos frascos em estoque)',
      'CSV de prescrições com medicamentos multidose ativos (códigos prescritos)',
      'Arquivo de mapeamento de/para: código do dispensário → código genérico padronizado',
    ],
    keyMetrics: [
      { label: 'Itens Prescritos sem Estoque', description: 'Medicamentos multidose prescritos ativamente mas sem frasco disponível no dispensário.' },
      { label: 'Itens em Estoque sem Prescrição', description: 'Frascos abertos sem prescrição ativa — risco de descarte e desperdício.' },
      { label: 'Discrepâncias De/Para', description: 'Itens onde o código prescrito não está mapeado para o código em estoque.' },
      { label: 'Rastreabilidade', description: 'Percentual de frascos abertos com registro completo de lote, abertura e responsável.' },
    ],
    pharmContext:
      'O controle de multidose é uma exigência regulatória crítica. A RDC 67/2007 estabelece ' +
      'que medicamentos multidose devem ter registro da data de abertura, validade após ' +
      'abertura e responsável pelo fracionamento. Inconsistências entre prescrição e estoque ' +
      'são um dos principais achados em inspeções da ANVISA e acreditadoras. ' +
      'O mapeamento de/para é fundamental em hospitais com múltiplos sistemas de ' +
      'nomenclatura de medicamentos.',
    tips: [
      'Atualize o arquivo de/para sempre que um novo medicamento multidose for incluído no formulário.',
      'Itens prescritos sem estoque devem ser comunicados ao dispensário imediatamente.',
      'Frascos abertos há mais de 28 dias (padrão para soluções orais) devem ser descartados conforme protocolo.',
      'Gere o relatório PDF para registrar o controle no prontuário eletrônico ou dossiê de qualidade.',
    ],
  },

  rastreio: {
    tabId: 'rastreio',
    title: 'Rastreio de Cancelamentos',
    subtitle: 'Auditoria completa de requisições canceladas',
    icon: '🔍',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-600',
    description:
      'Painel de rastreio e auditoria de requisições canceladas, com análise detalhada dos ' +
      'motivos, setores responsáveis e impacto operacional. Cruza quatro arquivos CSV para ' +
      'reconstruir o histórico completo de cada cancelamento e sua resolução.',
    dataNeeded: [
      'CSV de itens (detalhes das requisições: produto, quantidades, unidade)',
      'CSV de cancelamentos (registros das requisições canceladas com motivo)',
      'CSV de atualizações de status (histórico de mudanças de estado)',
      'CSV de recebimento (confirmações de entrega do período)',
    ],
    keyMetrics: [
      { label: 'Taxa de Cancelamento', description: 'Percentual de requisições canceladas em relação ao total gerado no período.' },
      { label: 'Motivos Principais', description: 'Ranking dos motivos de cancelamento — identifica causas raiz sistêmicas.' },
      { label: 'Taxa de Conclusão', description: 'Requisições que foram canceladas e depois re-geradas e concluídas com sucesso.' },
      { label: 'Cancelamentos por Setor', description: 'Distribuição geográfica dos cancelamentos — identifica unidades problemáticas.' },
    ],
    pharmContext:
      'O rastreio de cancelamentos é um instrumento de auditoria essencial para a ' +
      'conformidade farmacêutica. Cancelamentos recorrentes por "item não disponível" ' +
      'indicam falha no sistema de ressuprimento; por "erro de prescrição" indicam ' +
      'necessidade de treinamento da equipe clínica. Em hospitais acreditados, todo ' +
      'cancelamento de medicamento crítico deve ser registrado como evento de qualidade ' +
      'e analisado em reunião de segurança do paciente.',
    tips: [
      'Filtre por período para identificar padrões — finais de semana e feriados costumam ter mais cancelamentos.',
      'Cancelamentos de medicamentos de protocolo (UTI, emergência) requerem investigação imediata.',
      'Use o relatório PDF para apresentar em reuniões de comitê de farmacoterapêutica.',
      'Correlacione cancelamentos com entregas de fornecedores para verificar relação de causa.',
    ],
  },

  rastreio_falta: {
    tabId: 'rastreio_falta',
    title: 'Rastreio de Falta',
    subtitle: 'Identificação e acompanhamento de rupturas ativas',
    icon: '🚨',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-green-700',
    description:
      'Painel centralizado de rupturas ativas, com rastreio do status de resolução, ' +
      'responsável pela tratativa e impacto clínico estimado de cada falta. É a ' +
      'ferramenta de trabalho do farmacêutico de plantão durante situações de ' +
      'desabastecimento.',
    dataNeeded: [
      'Lista de itens com saldo zero confirmado (dispensário e CAF)',
      'Registro de ocorrências com motivo e responsável pela tratativa',
      'Informações de alternativas terapêuticas e previsão de entrega (quando disponível)',
    ],
    keyMetrics: [
      { label: 'Falta Ativa', description: 'Item com saldo zero em todos os pontos do estoque, sem substituto disponível.' },
      { label: 'Em Resolução', description: 'Falta reconhecida com tratativa em andamento: pedido emergencial ou substituto aprovado.' },
      { label: 'Impacto Clínico', description: 'Crítico (sem substituto), Moderado (substituto disponível), Baixo (item eletivo).' },
      { label: 'Tempo Médio Resolução', description: 'Horas entre registro da falta e reposição — KPI de desempenho da equipe.' },
    ],
    pharmContext:
      'A RDC 67/2007 e as diretrizes da ANVISA exigem que toda falta de medicamento crítico ' +
      'seja registrada, justificada e resolvida com evidência documentada. O rastreio de falta ' +
      'também alimenta a avaliação de fornecedores — itens com ruptura recorrente por falha ' +
      'de entrega devem ter o fornecedor reclassificado. A ANVISA disponibiliza o canal SNPCTS ' +
      'para notificação de desabastecimento de medicamentos essenciais à saúde pública.',
    tips: [
      'Registre o horário exato da identificação da falta para calcular corretamente o tempo de resolução.',
      'Para medicamentos de alto risco (vasoativos, anticoagulantes), escale imediatamente ao farmacêutico sênior.',
      'Vincule a falta ao número do pedido de emergência para rastreabilidade completa do fluxo.',
      'Faltas recorrentes de um mesmo item devem disparar revisão do estoque de segurança calculado.',
    ],
  },

  cancelamento_v2: {
    tabId: 'cancelamento_v2',
    title: 'Cancelamento V2',
    subtitle: 'Gestão aprimorada de requisições canceladas',
    icon: '❌',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-700',
    description:
      'Versão aprimorada do módulo de cancelamentos, com interface mais intuitiva, ' +
      'filtros avançados e melhor rastreabilidade do ciclo de vida de requisições ' +
      'canceladas. Permite ação direta sobre pendências e geração de relatórios ' +
      'formatados para auditorias.',
    dataNeeded: [
      'CSV de cancelamentos do período com campos completos de motivo e responsável',
      'Dados de retentativas (re-geração da requisição após cancelamento)',
    ],
    keyMetrics: [
      { label: 'Cancelamentos Resolvidos', description: 'Percentual de cancelamentos que geraram nova requisição bem-sucedida.' },
      { label: 'Cancelamentos Pendentes', description: 'Itens cancelados sem tratativa definida — requerem ação imediata.' },
      { label: 'Motivo Principal', description: 'Causa raiz mais frequente de cancelamento no período analisado.' },
    ],
    pharmContext:
      'O acompanhamento estruturado de cancelamentos é parte do ciclo PDCA (Plan-Do-Check-Act) ' +
      'da gestão farmacêutica. Sem essa análise, os mesmos erros tendem a se repetir — ' +
      'gerando custo operacional, risco ao paciente e insatisfação das unidades assistenciais. ' +
      'Hospitais acreditados pela ONA Nível III são avaliados pela maturidade do seu ' +
      'processo de tratamento de não conformidades farmacêuticas.',
    tips: [
      'Priorize sempre os cancelamentos de itens de protocolo sobre os eletivos.',
      'Cancelamentos com "motivo: falta" devem ser automaticamente linkados ao Rastreio de Falta.',
    ],
  },

  daily_tracking: {
    tabId: 'daily_tracking',
    title: 'Tracking Diário SV',
    subtitle: 'Acompanhamento de consumo em janela de 5 dias',
    icon: '📅',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-yellow-600',
    description:
      'Ferramenta de acompanhamento diário do consumo por produto em janela deslizante de ' +
      '5 dias. Compara o estoque atual com a tendência de consumo recente, projetando a ' +
      'data de ruptura e sinalizando variações atípicas que podem indicar mudança de ' +
      'protocolo ou surto de demanda.',
    dataNeeded: [
      'CSV com consumo diário dos últimos 5 dias por produto (colunas: produto, dia1, dia2, dia3, dia4, dia5)',
      'Saldo atual de estoque por produto para cálculo de projeção',
    ],
    keyMetrics: [
      { label: 'Consumo 5 Dias', description: 'Histórico de saídas dos últimos 5 dias úteis — base para detecção de tendências.' },
      { label: 'CMM 5 Dias', description: 'Média diária dos 5 dias como estimativa rápida de consumo corrente.' },
      { label: 'Projeção Ruptura', description: 'Data estimada de saldo zero com base no consumo médio dos 5 dias.' },
      { label: 'Tendência', description: 'Sinaliza consumo crescente (↑), estável (→) ou em queda (↓) em relação ao início do período.' },
    ],
    pharmContext:
      'O tracking diário é uma ferramenta operacional de alta sensibilidade — detecta ' +
      'variações de demanda muito antes que os indicadores mensais as evidenciem. ' +
      'Surtos infecciosos, campanhas de vacinação, mudanças de protocolo e sazonalidades ' +
      'aparecem primeiro nos dados diários. A farmácia hospitalar que monitora o consumo ' +
      'diário consegue acionar o ressuprimento emergencial com 3 a 5 dias de antecedência, ' +
      'evitando a ruptura.',
    tips: [
      'Atualize o CSV diariamente, de preferência no início do turno da manhã.',
      'Produtos com tendência crescente por 3 dias consecutivos devem ser escalados para ressuprimento.',
      'Compare com o consumo do mesmo período do mês anterior para eliminar sazonalidade.',
      'Gere o relatório PDF para registro no dossiê diário de farmácia — exigência ONA Nível II.',
    ],
  },

  previsibilidade: {
    tabId: 'previsibilidade',
    title: 'Previsibilidade de Estoque',
    subtitle: 'Projeção de cobertura com base em demanda e equivalências',
    icon: '🔮',
    gradientFrom: 'from-violet-600',
    gradientTo: 'to-purple-800',
    description:
      'Dashboard de previsibilidade que cruza dados de demanda ativa, estoque atual e mapa ' +
      'de equivalências para projetar a cobertura real de cada item — incluindo substitutos ' +
      'terapêuticos. Identifica rupturas que o estoque simples não detecta por não considerar ' +
      'alternativas disponíveis.',
    dataNeeded: [
      'CSV de demandas (requisições ativas e previstas por produto)',
      'CSV de itens (catálogo com codes e descrições padronizadas)',
      'CSV de estoque atual (saldo físico e sistema por item)',
    ],
    keyMetrics: [
      { label: 'Cobertura Real', description: 'Dias de cobertura considerando estoque do item + estoque de equivalentes disponíveis.' },
      { label: 'Demanda Prevista', description: 'Volume de saídas esperado com base no histórico e nas requisições ativas em aberto.' },
      { label: 'Itens sem Cobertura', description: 'Produtos sem cobertura nem mesmo com equivalentes — rupturas reais iminentes.' },
      { label: 'Cobertura por Equivalência', description: 'Dias adicionais de cobertura viabilizados pelos substitutos terapêuticos.' },
    ],
    pharmContext:
      'A previsibilidade com equivalências é um diferencial crítico em contextos de ' +
      'desabastecimento. Durante escassez de um princípio ativo, o farmacêutico clínico ' +
      'pode autorizar substitutos terapêuticos para manter a cobertura — e este painel ' +
      'quantifica exatamente quanto tempo a alternativa prolonga a disponibilidade. ' +
      'Isso embase decisões clínicas com dados, não apenas intuição. ' +
      'Toda substituição terapêutica deve ser validada pelo Comitê de Farmacoterapêutica.',
    tips: [
      'Importe os três arquivos antes de iniciar a análise — a previsibilidade requer os três cruzados.',
      'Configure o mapa de equivalências no módulo Equivalência antes de usar este painel.',
      'Itens sem cobertura real (nem com substitutos) são prioridade máxima para compra emergencial.',
      'Atualize os dados no mínimo duas vezes por semana para manter as projeções precisas.',
    ],
  },

  previsibilidade_v2: {
    tabId: 'previsibilidade_v2',
    title: 'Previsibilidade V2',
    subtitle: 'Previsão avançada com análise de demandas pendentes',
    icon: '📡',
    gradientFrom: 'from-indigo-500',
    gradientTo: 'to-violet-700',
    description:
      'Versão aprimorada do módulo de previsibilidade, com análise detalhada de requisições ' +
      'pendentes, projeção de cobertura com e sem equivalências e geração de relatório PDF ' +
      'formatado para apresentação ao comitê. Inclui alertas automáticos por faixa de risco.',
    dataNeeded: [
      'CSV de itens requisitados com status pendente (campo de status filtrado para "pendente")',
      'Mapa de equivalências atualizado (sincronizado do módulo Equivalência)',
      'Saldo de estoque atual por item para cruzamento',
    ],
    keyMetrics: [
      { label: 'Demandas Pendentes', description: 'Requisições em aberto aguardando atendimento — geram pressão real sobre o estoque.' },
      { label: 'Cobertura s/ Equivalente', description: 'Dias de cobertura usando apenas o item específico solicitado.' },
      { label: 'Cobertura c/ Equivalente', description: 'Dias de cobertura adicionando substitutos aprovados pelo comitê.' },
      { label: 'Risco de Ruptura', description: 'Alto (< 3 dias), Médio (3–7 dias), Baixo (> 7 dias) — inclui equivalentes.' },
    ],
    pharmContext:
      'A análise de demandas pendentes é a lente mais próxima da realidade operacional. ' +
      'Uma requisição pendente representa uma necessidade clínica identificada mas ainda não ' +
      'atendida — cada hora de atraso pode ter implicações no cuidado ao paciente. ' +
      'O relatório PDF desta V2 é formatado para ser enviado diretamente ao diretor clínico ' +
      'e ao comitê de farmacoterapêutica como evidência de gestão proativa.',
    tips: [
      'Execute esta análise no início de cada turno para ter clareza sobre as demandas críticas do dia.',
      'Exporte o PDF e salve no dossiê de qualidade — evidência de monitoramento para acreditação.',
      'Demandas pendentes há mais de 24h devem ser investigadas quanto ao motivo do atraso.',
    ],
  },

  checagem_devolucao: {
    tabId: 'checagem_devolucao',
    title: 'Checagem e Devolução',
    subtitle: 'Verificação de produtos devolvidos por unidade e paciente',
    icon: '✅',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-green-700',
    description:
      'Módulo de verificação e classificação de devoluções de medicamentos pelos dispensários ' +
      'à CAF. Importa dados de retorno e classifica cada item como: administrado, não ' +
      'administrado ou pendente — com identificação de produtos de alto valor em risco de perda.',
    dataNeeded: [
      'CSV de devoluções com: ID atendimento, paciente, produto, quantidade dispensada, quantidade devolvida, unidade, leito',
      'Dados de alta hospitalar do período para correlação com devoluções pós-alta',
    ],
    keyMetrics: [
      { label: 'Não Administrado', description: 'Medicamento dispensado mas confirmado como não aplicado ao paciente.' },
      { label: 'Pendente', description: 'Devolução registrada mas produto ainda não fisicamente retornado à CAF.' },
      { label: 'Alto Risco', description: 'Devoluções de medicamentos de alto custo ou controlados com atenção especial requerida.' },
      { label: 'Taxa de Devolução', description: 'Percentual do total dispensado que retornou — meta: < 5% para uso único.' },
    ],
    pharmContext:
      'A verificação sistemática de devoluções é obrigatória para medicamentos controlados ' +
      '(Portaria 344/1998) e fortemente recomendada para todos os itens de alto custo. ' +
      'Devoluções de psicotrópicos e entorpecentes devem ser escrituradas no SNGPC e ' +
      'no livro de registro da farmácia no mesmo dia do retorno. ' +
      'Produtos com status "não administrado" representam oportunidade de reaproveitamento ' +
      'se ainda estiverem dentro das condições de armazenamento exigidas.',
    tips: [
      'Filtre por "Alto Risco" primeiro — são os itens que demandam verificação física imediata.',
      'Pendências de medicamentos controlados devem ser resolvidas no mesmo turno de trabalho.',
      'Correlacione as devoluções com as altas do dia para antecipar o volume de retorno esperado.',
      'Produtos não administrados em boas condições podem ser reincorporados ao estoque — documente o processo.',
    ],
  },

  inteligencia_devolucoes: {
    tabId: 'inteligencia_devolucoes',
    title: 'Inteligência de Devoluções',
    subtitle: 'Análise de padrões de devolução por unidade e produto',
    icon: '↩️',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-fuchsia-600',
    description:
      'Módulo analítico que consolida os dados de devolução para identificar padrões, ' +
      'tendências e oportunidades de melhoria. Analisa quais unidades devolvem mais, ' +
      'quais produtos têm maior taxa de retorno e quais usuários são responsáveis por ' +
      'maior volume de devoluções — base para otimização de cotas.',
    dataNeeded: [
      'CSV de devoluções consolidadas do período (mínimo: 30 dias para análise estatística)',
      'Dados de volume dispensado por unidade no mesmo período (para cálculo da taxa)',
    ],
    keyMetrics: [
      { label: 'Taxa de Devolução', description: 'Percentual do total dispensado que retornou. Meta ideal: < 5% para medicamentos de uso único.' },
      { label: 'Top 5 Unidades', description: 'Unidades com maior volume absoluto de devoluções — ponto de partida para revisão de cotas.' },
      { label: 'Top Produtos', description: 'Medicamentos com maior taxa de retorno — candidatos a redução de cota de dispensação.' },
      { label: 'Motivo Principal', description: 'Causa mais frequente de devolução — guia intervenções específicas.' },
    ],
    pharmContext:
      'A gestão inteligente de devoluções é um dos maiores vetores de economia em farmácia ' +
      'hospitalar. Estudos publicados no Boletim EPHARMA indicam que hospitais com análise ' +
      'sistemática de devoluções reduzem o desperdício medicamentoso em até 18%. ' +
      'A metodologia recomendada pelo CEBRIM conecta a taxa de devolução diretamente ao ' +
      'IED (Indicador de Eficiência do Dispensário) — um indicador-chave para acreditação ONA.',
    tips: [
      'Filtre por "Não Administrado" e cruze com o Top 10 de consumo para revisar cotas superdimensionadas.',
      'Alta taxa de devolução em uma unidade pode indicar mudança de protocolo não comunicada à farmácia.',
      'Use o gráfico Top 5 Unidades para priorizar visitas técnicas da farmácia clínica.',
      'Devoluções crescentes de um mesmo produto são sinal de desabastecimento do substituto — verifique!',
    ],
  },

  baixas_estoque: {
    tabId: 'baixas_estoque',
    title: 'Baixas de Estoque',
    subtitle: 'Controle de perdas, descartes e movimentações de baixa',
    icon: '📉',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-red-600',
    description:
      'Dashboard completo de gestão de baixas de estoque — perdas por vencimento, quebra, ' +
      'estabilidade e outros motivos. Permite análise por setor, unidade, lote e categoria ' +
      'de produto, com suporte à escrituração exigida pela ANVISA e identificação de ' +
      'padrões de perda recorrente.',
    dataNeeded: [
      'CSV de baixas com: data, motivo, grupo motivo, setor, unidade, lote, validade, quantidade, custo unitário',
      'Classificação de risco assistencial por produto (pré-configurada ou importada)',
    ],
    keyMetrics: [
      { label: 'Perda por Validade', description: 'Custo de medicamentos descartados por vencimento — meta: < 0,5% do estoque médio.' },
      { label: 'Perda por Quebra', description: 'Perdas por dano físico durante armazenamento ou transporte interno.' },
      { label: 'Valor Total Baixado', description: 'Impacto financeiro total das baixas do período em R$.' },
      { label: 'Itens de Evitar', description: 'Produtos com padrão recorrente de perda — candidatos a ajuste de cota ou processo.' },
    ],
    pharmContext:
      'As baixas de estoque são um indicador sensível da qualidade do processo de gestão ' +
      'farmacêutica. A RDC 222/2018 (Resíduos de Serviços de Saúde) exige que todo descarte ' +
      'de medicamento seja documentado e realizado conforme o PGRSS do estabelecimento. ' +
      'Perdas por validade acima de 1% do orçamento geralmente indicam falhas no método ' +
      'FEFO, excesso de cota ou compras mal dimensionadas. O custo real inclui o produto, ' +
      'o descarte e o retrabalho administrativo.',
    tips: [
      'Analise a aba "Itens a Evitar" — são os produtos com padrão recorrente de perda que demandam ação estrutural.',
      'Lotes com alto índice de quebra no mesmo setor podem indicar problema de armazenamento ou manipulação.',
      'Cruze as perdas por validade com o histórico de compras — um item sempre vencendo foi mal programado.',
      'Documente toda baixa de medicamento controlado com assinatura do farmacêutico responsável.',
    ],
  },

  criticidade: {
    tabId: 'criticidade',
    title: 'Criticidade de Estoque',
    subtitle: 'Monitoramento de cobertura e risco de ruptura por item',
    icon: '🛡️',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-cyan-600',
    description:
      'Painel de análise de criticidade que verifica a cobertura real de cada item em ' +
      'múltiplos horizontes de tempo (7, 15, 30, 60 e 90 dias), classificando produtos ' +
      'por nível de risco e identificando as causas raiz das rupturas. Cruza dados do ' +
      'sistema Genesis para análise integrada de materiais e medicamentos.',
    dataNeeded: [
      'CSV Criticidade.csv — posição de estoque, dias de cobertura, variâncias e causas (exportado do Genesis)',
      'CSV Itens.csv — catálogo de materiais com valor de estoque e padrão de consumo',
      'CSV Causas_Ruptura.csv — causas raiz catalogadas com percentuais de ocorrência',
    ],
    keyMetrics: [
      { label: 'Cobertura 7 Dias', description: 'Itens com cobertura inferior a 7 dias — requer ação imediata de ressuprimento.' },
      { label: 'Cobertura c/ Substitutos', description: 'Cobertura real considerando estoque do item + equivalentes terapêuticos disponíveis.' },
      { label: 'Variância CD30 vs CD7', description: 'Diferença entre cobertura mensal e semanal — detecta tendências de consumo recentes.' },
      { label: 'Causa Raiz Ruptura', description: 'Classificação das causas: atraso fornecedor, falha de programação, consumo atípico, etc.' },
    ],
    pharmContext:
      'A análise de criticidade vai além da classificação ABC. Um item de Classe C (baixo ' +
      'custo e baixo volume) pode ser absolutamente crítico se for o único representante ' +
      'de um protocolo de AVC ou ressuscitação — sem ele, o atendimento não pode ser ' +
      'iniciado. A RDC 36/2013 (PNSP) e as diretrizes do CFM obrigam hospitais acreditados ' +
      'a manter estoques mínimos de medicamentos de emergência e protocolo, ' +
      'independentemente do custo unitário.',
    tips: [
      'Ordene por "Cobertura 7 Dias" crescente para focar nos itens mais urgentes.',
      'Itens com causa raiz "atraso fornecedor" recorrente devem ser escalados para qualificação de alternativa.',
      'A variância CD90 vs CD30 detecta tendências de queda gradual antes que virem ruptura.',
      'Use o filtro "Medicamento vs Material" para análises separadas por categoria regulatória.',
    ],
  },

  equivalencia: {
    tabId: 'equivalencia',
    title: 'Mapa de Equivalências',
    subtitle: 'Gestão de substitutos terapêuticos aprovados pelo comitê',
    icon: '🔀',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-600',
    description:
      'Módulo de gestão do mapa de equivalências terapêuticas — o cadastro de quais ' +
      'produtos podem substituir quais em situações de desabastecimento. Este mapa é ' +
      'utilizado por todos os módulos de previsibilidade e análise de cobertura do sistema.',
    dataNeeded: [
      'Pré-carregado com as equivalências padrão do formulário hospitalar',
      'Atualizações manuais pelo farmacêutico responsável quando novos substitutos são aprovados',
    ],
    keyMetrics: [
      { label: 'Itens Mapeados', description: 'Total de produtos que possuem pelo menos um equivalente terapêutico cadastrado.' },
      { label: 'Itens sem Equivalente', description: 'Produtos sem substituto — alto risco em caso de desabastecimento.' },
      { label: 'Equivalências Ativas', description: 'Total de relações de substituição aprovadas e ativas no comitê farmacoterapêutico.' },
    ],
    pharmContext:
      'O mapa de equivalências é uma ferramenta clínico-farmacêutica de alto valor. ' +
      'Toda substituição terapêutica deve ser validada pelo Comitê de Farmacoterapêutica ' +
      'da instituição, conforme as diretrizes do CFM e CFF. Em situações de desabastecimento, ' +
      'a autorização formal de substitutos — com documentação no prontuário — protege o ' +
      'profissional legalmente e garante a segurança do paciente. A RENAME (Relação Nacional ' +
      'de Medicamentos Essenciais) é referência para equivalências em serviços públicos.',
    tips: [
      'Mantenha o mapa atualizado a cada reunião do Comitê Farmacoterapêutico.',
      'Documente o embasamento clínico de cada equivalência (mesmo princípio ativo, mesma classe, etc.).',
      'Produtos sem equivalente cadastrado devem ter plano de contingência de fornecedor alternativo.',
      'Revise as equivalências quando houver mudança no formulário ou protocolo clínico.',
    ],
  },

  painel_nutricao: {
    tabId: 'painel_nutricao',
    title: 'Painel de Nutrição',
    subtitle: 'Monitoramento do abastecimento de dietas e nutrição enteral',
    icon: '🥗',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-lime-600',
    description:
      'Painel especializado no monitoramento do supply chain de nutrição clínica — dietas ' +
      'enterais, fórmulas infantis e suplementos nutricionais. Rastreia disponibilidade, ' +
      'prazo de validade e conformidade com as prescrições dietéticas ativas.',
    dataNeeded: [
      'CSV de estoque de produtos de nutrição enteral e suplementos por unidade',
      'Prescrições dietéticas ativas (número de pacientes em TEN — Terapia de Nutrição Enteral)',
    ],
    keyMetrics: [
      { label: 'Cobertura TEN', description: 'Dias de estoque disponível para atender todos os pacientes em TEN ativos.' },
      { label: 'Fórmulas em Falta', description: 'Dietas prescritas sem estoque disponível — requerem prescrição alternativa urgente.' },
      { label: 'Próximo ao Vencimento', description: 'Produtos de nutrição com validade em até 30 dias — criticidade maior que medicamentos.' },
    ],
    pharmContext:
      'A nutrição enteral é terapia crítica para pacientes em UTI, oncologia e pós-operatório. ' +
      'A EMTN (Equipe Multiprofissional de Terapia Nutricional) depende da disponibilidade ' +
      'contínua dos produtos prescritos — qualquer interrupção tem impacto clínico imediato. ' +
      'A RDC 503/2021 regula as fórmulas enterais e exige rastreabilidade por lote. ' +
      'Produtos vencidos de nutrição enteral representam alto risco microbiológico e ' +
      'devem ser descartados conforme o PGRSS.',
    tips: [
      'Monitore a cobertura por fórmula específica — nem todas as dietas são intercambiáveis clinicamente.',
      'Validades curtas (< 30 dias) em grandes volumes são prioridade para uso imediato ou devolução ao fornecedor.',
      'Alinhe com a EMTN sobre previsão de altas e novos pacientes para ajustar o pedido semanal.',
    ],
  },

  avaliacao_fornecedores: {
    tabId: 'avaliacao_fornecedores',
    title: 'Avaliação de Fornecedores',
    subtitle: 'Scorecard de desempenho e conformidade de fornecedores farmacêuticos',
    icon: '⭐',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-yellow-600',
    description:
      'Sistema de avaliação de desempenho de fornecedores farmacêuticos com scorecard ' +
      'multicritério: pontualidade de entrega (OTD), conformidade de produto, divergências, ' +
      'risco de validade e aderência a horários. Permite classificar fornecedores e ' +
      'fundamentar decisões de compra com dados objetivos.',
    dataNeeded: [
      'CSV de entregas do período com: fornecedor, data prevista, data real, quantidade pedida/entregue, conformidade',
      'Registros de divergências (preço, quantidade, qualidade) por fornecedor',
    ],
    keyMetrics: [
      { label: 'OTD (On Time Delivery)', description: 'Percentual de entregas realizadas dentro do prazo contratual. Meta: > 90%.' },
      { label: 'Conformidade', description: 'Percentual de itens entregues em conformidade com especificações técnicas.' },
      { label: 'Nota Geral', description: 'Score ponderado dos critérios — classifica o fornecedor em A, B ou C.' },
      { label: 'Risco Validade', description: 'Percentual de entregas com lotes próximos ao vencimento (< 6 meses para dispensação).' },
    ],
    pharmContext:
      'A avaliação de fornecedores é exigência da RDC 204/2017 (Boas Práticas de Distribuição) ' +
      'e das acreditadoras para garantia de qualidade na cadeia de suprimentos. ' +
      'A Lei 14.133/2021 (Nova Lei de Licitações) permite rescisão contratual ou ' +
      'suspensão de fornecedores com desempenho abaixo do acordado — mas exige ' +
      'documentação formal do histórico de avaliações. O Certificado de Boas Práticas ' +
      'de Fabricação (CBPF/ANVISA) deve ser verificado anualmente para todos os ' +
      'fabricantes de medicamentos.',
    tips: [
      'Fornecedores com OTD < 80% devem receber notificação formal e inclusão no plano de contingência.',
      'Use o gráfico dispersão (valor × nota) para identificar fornecedores estratégicos de alto risco.',
      'Verifique o CBPF dos fabricantes anualmente — lote entregue por fabricante sem certificado é irregularidade grave.',
      'Exporte o scorecard em PDF para anexar ao processo de renovação de ata de registro de preços.',
    ],
  },

  conciliacao: {
    tabId: 'conciliacao',
    title: 'Conciliação de Empréstimos',
    subtitle: 'Controle de medicamentos emprestados e recebidos entre unidades',
    icon: '🤝',
    gradientFrom: 'from-violet-500',
    gradientTo: 'to-indigo-700',
    description:
      'Módulo de controle e conciliação de empréstimos de medicamentos entre unidades ' +
      'hospitalares ou entre hospitais. Rastreia o ciclo completo: concessão, recebimento, ' +
      'devolução e conciliação financeira — com geração de relatório para acerto de contas.',
    dataNeeded: [
      'CSV de transações de empréstimo com: tipo (recebido/concedido), data, fornecedor/receptor, produto, quantidade, valor',
      'IDs de entrada e saída para rastreio de cada movimentação',
    ],
    keyMetrics: [
      { label: 'Empréstimos Pendentes', description: 'Transações concedidas ainda não devolvidas ou conciliadas financeiramente.' },
      { label: 'A Receber', description: 'Total em R$ de medicamentos emprestados a outras unidades sem acerto financeiro.' },
      { label: 'A Devolver', description: 'Total em R$ de medicamentos recebidos em empréstimo que ainda precisam ser devolvidos.' },
      { label: 'Taxa de Conciliação', description: 'Percentual de empréstimos do período já formalmente conciliados e encerrados.' },
    ],
    pharmContext:
      'O empréstimo de medicamentos entre unidades é uma prática comum em situações de ' +
      'urgência ou desabastecimento, mas exige controle rigoroso. A falta de conciliação ' +
      'gera imprecisões no inventário, divergências contábeis e dificuldade em auditorias. ' +
      'Em redes hospitalares, o processo de empréstimo deve estar normatizado em POP ' +
      '(Procedimento Operacional Padrão) e aprovado pela direção, com registro no ' +
      'sistema de gestão para rastreabilidade completa.',
    tips: [
      'Concilie todos os empréstimos no fechamento de cada mês para evitar acúmulo de pendências.',
      'Empréstimos de medicamentos controlados (Portaria 344) exigem documentação especial e registro no SNGPC.',
      'Gere o relatório PDF para embasar o acerto financeiro entre as unidades envolvidas.',
      'Pendências acima de 30 dias devem ser escaladas à supervisão farmacêutica para resolução.',
    ],
  },

  gerador_documentos: {
    tabId: 'gerador_documentos',
    title: 'Gerador de Documentos',
    subtitle: 'Criação automatizada de documentos farmacêuticos padronizados',
    icon: '📄',
    gradientFrom: 'from-emerald-500',
    gradientTo: 'to-teal-700',
    description:
      'Ferramenta de geração automática de documentos farmacêuticos padronizados — ' +
      'relatórios, POPs, fichas de controle e formulários — a partir dos dados do sistema. ' +
      'Elimina o trabalho manual de formatação e garante padronização documental exigida ' +
      'por acreditadoras e pela ANVISA.',
    dataNeeded: [
      'Dados já importados em outros módulos do sistema (utilizados como fonte)',
      'Templates configurados pelo farmacêutico responsável (logotipo, assinatura, cabeçalho)',
    ],
    keyMetrics: [
      { label: 'Documentos Disponíveis', description: 'Tipos de documentos que podem ser gerados com base nos dados atualmente importados.' },
    ],
    pharmContext:
      'A padronização documental é um pilar da acreditação hospitalar. A ONA exige que ' +
      'todos os processos críticos de farmácia estejam documentados em POP e revisados ' +
      'periodicamente. Relatórios gerados automaticamente a partir de dados reais têm ' +
      'maior confiabilidade e rastreabilidade do que documentos preenchidos manualmente — ' +
      'são preferidos em auditorias por eliminarem erros de transcrição.',
    tips: [
      'Configure os templates com o logotipo e dados institucionais antes de gerar documentos oficiais.',
      'Documentos de controle de medicamentos controlados devem ter assinatura digital ou física do farmacêutico.',
      'Salve os documentos gerados no dossiê eletrônico de qualidade com a data de geração.',
    ],
  },

  vba: {
    tabId: 'vba',
    title: 'Macro VBA',
    subtitle: 'Referência de código VBA para integração com Excel',
    icon: '💻',
    gradientFrom: 'from-amber-500',
    gradientTo: 'to-orange-600',
    description:
      'Painel de referência com o código VBA utilizado para automação de planilhas Excel ' +
      'integradas ao sistema. Utiliza o mesmo modelo de cobertura de 7 dias do módulo de ' +
      'Requisição para geração automatizada de pedidos diretamente no Excel legado.',
    dataNeeded: [
      'Nenhum — este painel é apenas de referência/visualização de código',
      'Para uso: Excel com macro habilitada e planilha de inventário no formato esperado',
    ],
    keyMetrics: [
      { label: 'Modelo de Cobertura', description: 'O mesmo algoritmo de 7 dias usado no módulo de Requisição, adaptado para VBA/Excel.' },
    ],
    pharmContext:
      'A integração via VBA é uma solução de transição comum em hospitais que ainda ' +
      'utilizam planilhas Excel para parte do processo farmacêutico. Permite que equipes ' +
      'sem acesso ao sistema web gerem requisições no mesmo formato padrão, garantindo ' +
      'consistência de dados. A longo prazo, a migração completa para o sistema web é ' +
      'recomendada para eliminar redundância e risco de inconsistência.',
    tips: [
      'Copie o código e cole no editor VBA do Excel (Alt+F11) para ativar a macro.',
      'O modelo usa cobertura de 7 dias — ajuste a variável "diasCobertura" para seu contexto.',
      'Mantenha o código VBA e o sistema web sincronizados — mudanças de lógica devem ser aplicadas em ambos.',
    ],
  },

};
