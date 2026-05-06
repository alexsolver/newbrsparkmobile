---
name: sync-cockpit
description: Planejamento detalhado para o Cockpit de Sincronização (Monitoramento e Saúde)
---

# 🚀 Sync Cockpit - Monitor da Central de Operação

## 1. Visão Geral (Overview)

O **Sync Cockpit** será o "coração da monitoração" do sistema **AriaMobile**. Como o aplicativo opera com foco extremo na arquitetura offline-first e integridade criptografada dos payloads, é imperativo ter uma visão consolidada de:
- **Fluxo de Dados:** Transferências concluídas com sucesso.
- **Saúde (Health):** Tempos de resposta (Latência), gargalos no servidor, CPU/Memória.
- **Detecção de Anomalias:** Falhas de rede, esquemas incompatíveis ou chaves criptográficas desatualizadas, que causam "Sync Failures".
- **Fila Pendente (Backlog):** Quantidade estimada de itens aguardando sinc. nos aparelhos remotos.

Este será um painel exclusivo integrado ao *Admin Panel* existente, construído em Vanilla JS (como o restante do painel), protegido por autenticação e atualizado num intervalo saudável de 30 a 60 segundos.

## 2. Tipo do Projeto (Project Type)

**WEB & BACKEND**  
*(Novo Módulo HTML Vanilla/JS no Admin Panel + Novas Rotas de Agregação no Node.js)*

## 3. Critérios de Sucesso (Success Criteria)

1. Interface tática com gráficos dinâmicos (Chart.js) consolidando dados de sincronização das últimas 24/48h.
2. Apresentação em blocos (Cards) dos principais KPOs (Key Performance Objectives): *Tempo Médio de Sync*, *Taxa de Sucesso vs Falha*, e *Volume de Dados Recebido*.
3. Endpoint de Backend altamente performático que calcula as agregações sem causar *locks* na tabela principal ou sobrecarregar o DB a cada 30 segundos.
4. Total separação das requisições via camada de caching interna para respeitar o limite de recursos.

## 4. Stack Tecnológica (Tech Stack)

- **Backend:** Node.js, Express (`admin-panel/backend/src`).
- **Cache / Aggregation:** Estratégia de agregação na memória do Node.js baseada em janelas de 60s, evitando queries excessivas no banco de dados para os Gráficos.
- **Frontend:** Vanilla HTML (`admin-panel/cockpit.html`), CSS e Vanilla JavaScript (`admin-panel/js/cockpit.js`).
- **Gráficos:** `Chart.js` (ideal para implementações puras de UI com excelente performance visual) ou Canvas.

## 5. Estrutura de Arquivos (File Structure)

```text
AriaMobile/
└── admin-panel/
    ├── cockpit.html (Nova interface do painel do Cockpit)
    ├── js/
    │   └── cockpit.js (Lógica de Polling via fetch, 30s-60s)
    └── backend/
        └── src/
            ├── routes/
            │   ├── cockpit.js (Controlador dos endpoints do dashboard)
            │   └── sync.js (Acoplamento: Enviar telemetria pós-sucesso direto ao cockpit cache)
            └── services/
                └── cockpitMetrics.js (Sistematização de logs criptografados e Health Checks)
```

## 6. Quebra de Tarefas (Task Breakdown)

### Tarefa 1: Criação do Motor de Telemetria no Backend
- **Agent:** `@backend-specialist`
- **Output:** `admin-panel/backend/src/services/cockpitMetrics.js`
- **Detalhes:** Criar o armazenador de estados de métricas que acumula as falhas, as latências reportadas e as vitórias das sincronizações em memória temporal, persistindo no banco apenas os somatórios.
- **Verify:** Chamar interno o gerador; testar se o objeto reporta corretamente N métricas de falha submetidas.

### Tarefa 2: Exposição das Rotas de Gráficos e Saúde (API)
- **Agent:** `@backend-specialist`
- **Output:** `admin-panel/backend/src/routes/cockpit.js`
- **Detalhes:** Criar rota `GET /api/cockpit/health` que retornará JSON estruturado pre formatado para gráficos e blocos de saúde a cada chamada.
- **Verify:** `curl http://localhost:port/api/cockpit/health` retorna `{"status":"ok", "metrics": {...}}` em menos de 100ms.

### Tarefa 3: Interface Gráfica do Cockpit e Estrutura DOM
- **Agent:** `@frontend-specialist`
- **Output:** `admin-panel/cockpit.html`
- **Detalhes:** Criar a cópia de menu/estruturação das páginas atuais do painel `operations.html`, alterando o corpo principal para os "Widgets" e painéis visuais.
- **Verify:** Tela renderiza no navegador mantendo as cores e identidade visual do sistema.

### Tarefa 4: Conexão Polling (JS) e Integração com Chart.js/Gráficos
- **Agent:** `@frontend-specialist`
- **Output:** `admin-panel/js/cockpit.js`
- **Detalhes:** Adicionar `setInterval` a cada 30 segundos, chamando `fetch('/api/cockpit/health')`. Configurar e hidratar instâncias do DOM para visualização.
- **Verify:** Deixar o browser aberto, observar no *Network Tab* que as requisições estão acontecendo no intervalo correto e as barras do gráfico se movimentam/atualizam via JS sem *page reload*.

## 7. Verificação Final (Phase X)

### ✅ PHASE X COMPLETE
*Monitoramento do Cockpit Concluído.*
- Lint Backend: ✅ Pass
- Inspeção Visual UX: ✅ Pass
- Build Estrutural: ✅ Success
- Data: 2026-03-31
