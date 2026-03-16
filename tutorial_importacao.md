# 📘 Guia de Importação de Dados

Este guia detalha quais arquivos e formatos são necessários para que cada aba do sistema realize as análises corretamente. Praticamente todos os relatórios são extrações do sistema MV em formato **CSV (Separado por Ponto e Vírgula)** ou **Texto (ISO-8859-1)**.

---

## 🏗️ 1. Logística e Suprimentos (CAF)

### [Aba: Painel CAF]
*   **Objetivo:** Visão geral de saldo e consumo ABC.
*   **Arquivo Principal:** `R_LIS_POSIC_ESTOQUE_LOTE` (Posição de Estoque por Lote).
*   **Colunas Essenciais:** `Produto`, `Qt Atual`, `Lote`, `Dt Validade`.
*   **Arquivo de Consumo (Opcional):** `SAD_R_HIST_CONSUMO_PRODUTO_ABC` (Histórico de Consumo).

### [Aba: Reposição Urgente]
*   **Objetivo:** Acompanhamento de Follow-up de compras.
*   **Arquivos Aceitos:** 
    *   `R_SOLIC_COMP` (Resumo)
    *   `R_LIS_CON_SOLIC_COMP` (Detalhado)
*   **Dica:** O sistema identifica o layout automaticamente (Resumo ou Detalhado).

### [Aba: Gestão de Validade]
*   **Objetivo:** Alerta de produtos próximos ao vencimento.
*   **Arquivo:** `R_LIS_POSIC_ESTOQUE_LOTE` (Formatos TXT/CSV exportados do MV).
*   **Frequência:** Semanal.

---

## 💊 2. Farmácia e Dispensários

### [Aba: Pedido 24h]
*   **Objetivo:** Reposição diária baseada em consumo real.
*   **Requer 3 arquivos simultâneos:**
    1.  `R_LIST_CONS_PAC_txt.csv` (Consumo por Paciente) - Identifica o que saiu para os pacientes.
    2.  `R_CONF_LOTE.csv` (Conferência de Lotes) - Traz a validade atual no estoque central.
    3.  `ExportStockComparison.CSV` - Compara saldo lógico vs real no dispensário.

### [Aba: Projeto Gênesis]
*   **Objetivo:** Identificar rupturas e oportunidades de inclusão em kits.
*   **Arquivos:**
    *   **Inclusão:** `R_CON_IT_SOL_txt.csv` (Relatório de Itens de Solicitação).
    *   **Ruptura:** `R_LIST_CONS_PAC_txt.csv` (Consumo por Paciente).

### [Aba: Conciliação de Empréstimo]
*   **Objetivo:** Cruzamento de entradas e saídas de empréstimos.
*   **Colunas Obrigatórias:** O arquivo deve conter os cabeçalhos `Tp. Emp.` e `Status`.

### [Aba: Análise Dispensação]
*   **Objetivo:** Painel de desempenho de entrega (Service Level) e horários de pico.
*   **Arquivo Requerido:** Relatório de Solicitações x Materiais do MV.
*   **Colunas Identificadas:** `Codigo Solicitacao`, `Status`, `Qtd Solicitada`, `Qtd Dispensada`, `Produto`.
*   **Dica:** Identifica automaticamente horários de pico e principais usuários.

### [Aba: Inteligência de Devoluções]
*   **Objetivo:** Monitorar itens não administrados e pendências de devolução física.
*   **Arquivo Requerido:** Relatório de Checagem e Devolução do MV.
*   **Colunas Essenciais:** `Atendimento`, `Paciente`, `Produto`, `Não Administrado`, `Devolvido`, `Pendente de Devolução`, `Alta`.
*   **Dica:** Identifica riscos graves em itens pendentes de doentes que já receberam alta.

---

## 📊 3. Inteligência e Operação

### [Aba: Previsibilidade]
*   **Objetivo:** Antecipar faltas cruzando pedidos pendentes com estoque.
*   **Requer importação em massa:**
    1.  **Demandas:** Relatório de Solicitações MV (Pendentes).
    2.  **Itens:** Relatório de Itens da Solicitação.
    3.  **Estoque:** Posição de Estoque Atual.
    4.  **Equivalências (Opcional):** Lista de substitutos configurados.

### [Aba: Análise de Pendências]
*   **Objetivo:** Calcular o custo financeiro das faltas.
*   **Arquivos:** `Solicitações`, `Saldos` e `Custo Médio` (Exportado em CSV).

### [Aba: Produtividade]
*   **Objetivo:** Analisar performance de separação por usuário.
*   **Arquivo:** `R_HIST_MOV_USUARIO` (Histórico de Movimentação por Usuário).

---

## 💡 Dicas Gerais para Exportação (MV)

1.  **Formato:** Sempre que possível, escolha **CSV** ou **Texto (Layout MV)**.
2.  **Codificação:** Utilize **ISO-8859-1** (padrão Brasil/Windows) para evitar erros de acentuação.
3.  **Separador:** O sistema prefere `;` (ponto e vírgula), mas detecta automaticamente se for `,`.
4.  **Data:** O padrão esperado é `DD/MM/AAAA`.

---
> [!IMPORTANT]
> Se uma aba aparecer "vazia" após a importação, verifique se o cabeçalho do arquivo MV foi exportado. O sistema utiliza os nomes das colunas para localizar os dados.
