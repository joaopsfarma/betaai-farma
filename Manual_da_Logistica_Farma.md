# Manual do Aplicativo - Logística Farma

## 1. Visão Geral
O **Logística Farma** é um sistema completo desenvolvido para a gestão inteligente e otimizada de estoques farmacêuticos e hospitalares (CAF - Central de Abastecimento Farmacêutico) e dispensários. Ele consolida diversas informações logísticas, analisa o histórico de movimentações, mapeia necessidades de ressuprimento e oferece painéis (dashboards) em tempo real que apoiam a tomada de decisão. 

Através da leitura e processamento de dados (como planilhas CSV e Excel do sistema ERP do hospital), o aplicativo consolida informações de validade, estoque físico e movimentação para gerar sugestões de compra, transferência e analisar a produtividade e rastreabilidade logística.

---

## 2. Princípio de Funcionamento
O aplicativo não requer um banco de dados complexo em nuvem para sua operação diária; em vez disso, ele processa dados ativamente na máquina do usuário, mantendo essas informações salvas no navegador (estado persistente) para agilidade máxima.

**O Fluxo de Trabalho padrão do usuário é:**
1. **Importação dos Dados:** O usuário exporta relatórios do sistema hospitalar (como posição de estoque, validades e histórico de movimentação) em formato CSV/Excel.
2. **Carregamento no App:** Através dos módulos de upload, os dados alimentam a inteligência do sistema.
3. **Análise e Gestão:** O sistema cruza os dados do estoque contra as demandas, gerando alertas de ruptura iminente, itens próximos ao vencimento, excedentes, ou sugestões quantitativas de reabastecimento.
4. **Geração de Saídas:** Documentos PDF, relatórios gerenciais e códigos de integração (como macros VBA) são gerados para efetivar a logística na prática.

---

## 3. Módulos e Funcionalidades Principais

### 3.1 Painel CAF (Central de Abastecimento Farmacêutico)
Um centro de controle global que sumariza o cenário do estoque central através de indicadores-chave de desempenho (KPIs) e inventário. 
- Analisa a distribuição do estoque.
- Classifica o status dos itens como "URGENTE!", "PEDIR AO RECEBIMENTO" ou "VERIFICAR INVENTÁRIO".
- Facilita a gestão visual de alto nível.

### 3.2 Análise de Dispensação e Dispensários
Voltado especificamente para as farmácias satélites ou unidades de dispensação. 
- Compara a movimentação diária com a cota de estoque disponível em cada setor.
- Realiza check de ruptura antes dela acontecer na ponta (gestão proativa em vez de reativa).

### 3.3 Requisição de Transferência
Automatiza a matemática de ressuprimento diário/semanal. 
- Ele calcula exatamente o quanto de cada item precisa ser transferido do CAF para cada dispensário, baseado no consumo médio e na cobertura de dias estipulada.

### 3.4 Gestão de Validade e Inteligência de Devoluções
- **Validades (FEFO):** Gerencia estritamente o princípio de "First Expire, First Out" (Primeiro a Vencer, Primeiro a Sair), alertando sobre lotes que precisam ser remanejados, consumidos primeiro ou trocados com os fornecedores antes que expirem.
- **Checagem e Devolução:** Um módulo de inteligência para organizar itens que voltaram dos setores ou não foram administrados, retornando-os ao estoque físico adequadamente e garantindo uma reconciliação precisa sem perdas.

### 3.5 Previsibilidade
Um módulo avançado que usa o consumo histórico (demandas passadas) para projetar por quanto tempo o estoque atual de cada item será capaz de atender o hospital. É o coração analítico preditivo do Logística Farma.

### 3.6 Equivalências
Módulo onde o usuário cadastra relações entre medicamentos diferentes. Caso falte um medicamento por indisponibilidade na indústria, o sistema avisa quais as opções terapêuticas alternativas que já existem no arsenal da farmácia, mitigando impactos da ruptura na assistência ao paciente.

### 3.7 Criticidade e Rastreio
- **Criticidade:** Foca rapidamente a atenção da equipe para itens de altíssimo custo (curva A) ou medicamentos vitais para a vida.
- **Rastreio de Falta e Cancelamento:** Acompanha ocorrências negativas (prescrições não atendidas por falta) analisando padrões (quais setores mais sofrem, em quais dias, por falha do CAF, da compra ou da indústria).

### 3.8 Gerador de Documentos
O aplicativo traz um gerador dinâmico de relatórios PDF, criando instantaneamente evidências documentais das condições da logística, listas de prioridade para a equipe de separação (picking) ou ofícios de transferências.

---

## 4. Tecnologias Utilizadas
- **Interface e Experiência do Usuário (UX/UI):** React, Tailwind CSS e Framer Motion (animações).
- **Processamento de Dados e Visualização:** PapaParse (processamento pesado de arquivos .csv) e bibliotecas avançadas de gráficos (Chart.js / Recharts).
- **Geração PDF:** Ferramentas nativas do navegador atreladas ao jsPDF.
- **Inteligência Artificial (Opcional):** Integrações preparadas via SDK do Google GenAI para geração de insights contextualizados.

---

## 5. Como Iniciar a Rotina
1. Acesse os menus de importação (Uploaders de CSV).
2. Carregue o CSV de **Posição de Estoque**.
3. (Opcional) Carregue o CSV de **Validades e Lotes**.
4. (Opcional) Carregue o arquivo de **Movimentações/Demandas** para ativar os relatórios de Previsibilidade e Análise de Dispensação.
5. Em caso de pedidos para o sistema hospitalar legado, utilize o menu **Macro VBA** para exportar o script de automação, caso utilize a integração por planilhas.

> Este aplicativo tem como principal objetivo transformar uma imensa massa de dados brutos de logística hospitalar em visões práticas e mastigadas, economizando tempo do farmacêutico logístico e salvando recursos da instituição de saúde através da prevenção de vencimentos e controle rígido do suprimento.
