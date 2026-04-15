# Central de Operações — análise de produto, UX e requisitos

Documento de entrega da análise (inventário, personas, governança multi-tenant, i18n, escala e backlog UX).  
Referência de código: [`admin-panel/operations.html`](../../admin-panel/operations.html), [`admin-panel/backend/src/routes/operations.js`](../../admin-panel/backend/src/routes/operations.js).

---

## 1. Inventário funcional atual (UI + API + limites)

### 1.1 Estrutura da página (UI)

| Bloco | Descrição |
|-------|-----------|
| **Shell** | `admin-layout` → `main-content` → `topbar--data` (breadcrumb Painel / Central de operações) → `page-body` → `page-hero` + `section.data-shell`. |
| **Toolbar** | `filter-scope` (OS \| RT \| todas), `filter-email` (técnico; opções carregadas de `/users?limit=500`), `filter-search` (FT, RT, ID, título…), botão **Atualizar**, botão **Despachar OS**. |
| **Quadro Kanban** | 5 colunas: Não iniciadas, Em campo, Concluídas, Erro/Bloqueadas, Canceladas — cada uma com contador, campo “Filtrar…” local e botão de ordenação (“Novas” / toggle). |
| **Indicadores** | `live-dot` no título (auto-refresh); subtítulo descreve escopo OS/RT. |
| **Modal detalhe** | `#detail-modal` — corpo dinâmico, ações incl. cancelar OS (`#detail-cancel-btn` condicional), fechar. |
| **Dialog revisões** | `#revision-picker-modal` (`<dialog>`) — escolher submissão quando há várias. |
| **Modal snapshot** | `#revision-snapshot-modal` — abas Relatório / Metadados / JSON. |
| **Modal reabrir** | `#reopen-revision-modal` — mesmo técnico ou outro (`#reopen-revision-tech-select`). |
| **Modal despacho** | `#dispatch-modal` — designação (e-mail com sugestões, template, título, descrição), agenda (`datetime-local`, duração prevista), geofencing (Ponto, Trecho, Rota KML, Polígono KML/JSON, Livre), mapas Leaflet, geocoding Nominatim. |
| **Impressão / PDF** | `#print-report` (conteúdo gerado para impressão; lógica extensa inline). |

### 1.2 Chamadas HTTP principais (front)

| Uso | Método / caminho |
|-----|------------------|
| Lista do quadro | `GET /api/operations/tasks?scope=…` (+ cache-bust `_t`) |
| Detalhe por id | `GET /api/operations/tasks?id=…` |
| Lista de revisões | `GET /api/operations/tasks/:id/revisions` |
| Snapshot revisão | `GET /api/operations/tasks/:id/revisions/:revision` |
| Export CSV revisões | `GET /api/operations/tasks/:id/revisions/export` (query `includeResponses`, etc.) |
| Cancelar execução | `DELETE /api/operations/tasks/:id` |
| Recusar OS | `POST /api/operations/tasks/:id/reject` — **JWT do painel ou JWT do app** (Live Activity); utilizador só se for `ownerEmail` + mesmo tenant do formulário |
| Reabrir para revisão | `POST /api/operations/tasks/:id/reopen-for-revision` (JSON body) |
| Técnicos no filtro | `GET /api/users?limit=500` |
| Templates despacho | `GET /api/checklists/templates` |
| Criar OS | `POST /api/checklists/dispatch` |
| Presets relatório | `GET /api/reports/presets` |
| Geocoding | `GET https://nominatim.openstreetmap.org/search?…` (com `Accept-Language: pt-BR` em alguns fluxos) |

### 1.3 API `GET /api/operations/tasks` (backend)

- **Query:** `email`, `status`, `id` (cuid ou número FT ou número RT), `scope` ∈ `os` \| `rt` \| `all` (default `os`; com `id` explícito o scope é ignorado), `limit` (default **200**, parse int).
- **Ordenação:** `createdAt` descendente.
- **Includes:** `template`, última revisão (para `effectiveLastSubmittedRevision`).
- **Enriquecimento:** avatares por `ownerEmail`; idade GPS / “signal lost” para execuções com tracking ativo (`OPS_GPS_STALE_SEC` derivado de `TRACKING_GPS_STALE_SEC`).
- **Isolamento tenant (painel):** `TENANT_ADMIN` / `MANAGER` — `where` inclui relação `template.tenantId = JWT.tenantId`. `SAAS_ADMIN` e admin legado (`!panelUser`) — sem filtro extra.
- **Resposta:** `Cache-Control: no-store`.
- **Montagem do cartão:** `mapExecutionToPanelTask` em [`executionTaskPanel`](../../admin-panel/backend/src/lib/executionTaskPanel.js) (não detalhado neste doc).

### 1.4 Outras rotas `operations.js` (implementação atual)

| Rota | Autenticação | Notas |
|------|----------------|--------|
| `POST /tasks/:id/reject` | **`rejectOsAuth`** (painel JWT **ou** JWT do app com `sessionId`) | App: só se `ownerEmail` + `template.tenantId` = utilizador. Painel: `mergeExecutionWhere` como nas outras rotas. |
| Demais (`GET /tasks`, revisões, export, `DELETE`, `POST reopen`) | **`router.use(adminAuthThenPanel)`** após o `reject` | JWT admin/painel obrigatório + `enforcePanelPermissions`. |

**Montagem em** [`index.js`](../../admin-panel/backend/src/index.js): `app.use('/api/operations', require('./routes/operations'))` no mesmo bloco que outras rotas `/api` públicas na ordem de registo; a proteção é **dentro** do router (`rejectOsAuth` + `adminAuthThenPanel`).

### 1.5 Comportamento temporal (front)

- **Auto-refresh:** `setInterval(loadBoard, 30000)` ao fim do script; limpeza em `beforeunload`.
- **Ordenação de nomes** na lista de técnicos: `localeCompare(..., 'pt', …)` (fixo).

### 1.6 Limitações explícitas para escala

- **Teto de 200** execuções na vista padrão sem UI para aumentar ou avisar truncagem.
- **500** utilizadores no máximo no dropdown de filtro por técnico.
- Ficheiro **monolítico** (~7k linhas): manutenção e extensão de i18n/testes mais difíceis.

---

## 2. Matriz persona × jobs-to-be-done × MoSCoW

Legenda: **M** = Must have, **S** = Should have, **C** = Could have, **W** = Won’t (agora).

| Persona | Job-to-be-done | MoSCoW | Notas / lacuna atual |
|---------|----------------|--------|----------------------|
| **Coordenador de campo** | Ver o que está pendente/em campo por técnico e despachar OS com local e horário | **M** | Já coberto (Kanban + filtros + despacho). Falta confiança em truncagem/limit. |
| **Coordenador de campo** | Reabrir revisão e notificar o técnico certo | **M** | Fluxo existe; validação de elegibilidade no backend. |
| **Gestor de operações** | Filtrar por período, formulário, cliente/tenant e exportar visão operacional | **S** | Parcial: export por execução; sem filtro data/template no toolbar; sem export da lista filtrada. |
| **Gestor de operações** | Vistas guardadas (“Erros hoje”, “Minha equipa”) | **C** | Não existe. |
| **Suporte L2** | Localizar OS por ID/FT/RT/email rapidamente | **M** | Busca + API `id` ok. Deep link na URL do browser seria **S**. |
| **Suporte L2** | Ver histórico de submissões e metadados sem ambiguidade | **M** | Picker + snapshot + JSON. |
| **Suporte L2** | Entender última sincronização dos dados do quadro | **S** | Falta timestamp explícito na UI. |
| **SaaS admin / plataforma** | Auditar ações sensíveis e isolar dados por tenant | **M** | Rotas do painel com JWT; `SAAS_ADMIN` vê todas as organizações na listagem. |
| **SaaS admin** | Modo “suporte cross-tenant” explícito, auditado | **C** | Papel `SAAS_ADMIN` já tem visão global; opcional: forçar `?tenantId=` na UI. |
| **Utilizador com necessidades a11y** | Operar Kanban e modais com teclado e leitor de ecrã | **S** | Melhorias pendentes (secção 6). |
| **Utilizador multilíngue** | UI no idioma do painel (pt-BR/en-US) | **S** | Página ainda não usa `getAdminUiLocale` (secção 4). |

---

## 3. Decisão de produto: multi-tenant, RBAC e segurança

### 3.1 Estado atual (factos)

1. **`ChecklistExecution`** não tem `tenantId` direto; o isolamento usa **`ChecklistTemplate.tenantId`**.
2. **`GET /api/operations/tasks`** aplica `mergeExecutionWhere` para utilizadores do painel que **não** são `SAAS_ADMIN`.
3. **`POST /tasks/:id/reject`** é excecão intencional: aceita também JWT do **app** (`rejectOsAuth`) para Live Activity / push, com verificação `ownerEmail` + tenant do template.

### 3.2 Decisão recomendada (produto + engenharia) — estado após implementação

| Decisão | Estado |
|---------|--------|
| **D1 — Autenticação** | **Feito** para todas as rotas exceto `POST …/reject`, que usa **`rejectOsAuth`** (painel **ou** app). |
| **D2 — Isolamento tenant** | **Feito** em listagens e leituras/escritas por `id` via `mergeExecutionWhere` para **TENANT_ADMIN** / **MANAGER**. |
| **D3 — SAAS_ADMIN** | Sem filtro de tenant na listagem (visão global). Opcional futuro: query `tenantId` obrigatória. |
| **D4 — Transparência na UI** | **Feito** no modo tenant: chip `#ops-tenant-chip` (nome · slug), atualizado em cada `loadBoard`. |
| **D5 — Auditoria** | `reject` com app user grava `userId` + `tenantId` no `AuditLog` quando aplicável. |

### 3.3 Critérios de aceitação (resumo)

- Utilizador **MANAGER** de tenant A **nunca** vê execuções cujo template pertence a tenant B.
- **`GET /tasks` sem JWT de painel/admin** → **401**.
- **`POST …/reject` com JWT do app** só altera OS em que o utilizador é **owner** e o formulário pertence ao **mesmo tenant**.
- Testes de integração: recomendado cobrir “dois tenants, lista filtrada” e “reject com app user”.

---

## 4. Paridade i18n com o dashboard (`dashboard-i18n` + `user-pages-i18n`)

### 4.1 Implementação atual (shell do quadro)

- Módulo [`admin-panel/js/operations-i18n.js`](../../admin-panel/js/operations-i18n.js): `opsT`, `applyOperationsStaticI18n`, `opsSortLocale`, `opsSortButtonLabel`, `opsFormatTimeAgo`, `opsFormatCardDateTime`, `refreshOpsTenantChip`.
- [`operations.html`](../../admin-panel/operations.html) chama `applyOperationsStaticI18n()` após `initPage()`; breadcrumb, hero, filtros, colunas Kanban, botões, limite na API, aviso de truncagem e chip de organização usam o locale do painel (`brspark_admin_ui_locale`).
- **Pendente para paridade total:** modais de despacho/detalhe/revisão, mensagens `alert` dispersas, rótulos dinâmicos nos cartões (badges de estado) — podem ir ganhando chaves no mesmo ficheiro.

### 4.2 Padrão (referência)

- **`localeCompare`:** `opsSortLocale()` (`pt` vs `en`) alinhado a `getAdminUiLocale()`.

### 4.3 Catálogo mínimo de chaves (prefixo sugerido `ops_`)

**Shell e lista:** `ops_pageTitle`, `ops_bc_panel`, `ops_bc_current`, `ops_hero_title`, `ops_hero_sub`, `ops_live_dot_title`, `ops_board_title`, `ops_scope_os`, `ops_scope_rt`, `ops_scope_all`, `ops_filter_all_techs`, `ops_search_placeholder`, `ops_refresh`, `ops_dispatch`, `ops_col_pending`, `ops_col_progress`, `ops_col_completed`, `ops_col_error`, `ops_col_cancelled`, `ops_col_filter_placeholder_*`, `ops_sort_toggle_title`, `ops_sort_new_first`, `ops_empty_col`, `ops_last_sync` (texto + `{time}`).

**Modais:** `ops_detail_title`, `ops_detail_close`, `ops_detail_cancel_os`, `ops_revision_picker_title`, `ops_revision_picker_hint`, `ops_revision_snap_*`, `ops_reopen_*`, `ops_dispatch_*` (blocos Designação, Agenda, Localização, abas geo, validações).

**Erros / estados:** `ops_load_error`, `ops_no_tasks_truncated` (com `{limit}`).

**Ações confirmação:** textos de cancelar OS, rejeitar, reabrir (alinhados a mensagens já existentes no backend em pt-BR).

### 4.4 Regra de cópia

- Novos textos visíveis: **pt-BR** como fonte; **en-US** com tradução profissional consistente com [`dashboard-i18n.js`](../../admin-panel/js/dashboard-i18n.js).

---

## 5. Escala: filtros, truncagem, NFRs de listagem

### 5.1 Requisitos funcionais (propostos)

| ID | Requisito | Prioridade |
|----|-----------|------------|
| F1 | Parâmetro `limit` configurável na UI (presets 100/200/500 + máximo seguro definido pelo backend) | **Feito** (select na barra; API limita a 500) |
| F2 | Quando `countReturned >= limit`, mostrar aviso de truncagem | **Feito** (`#ops-trunc-banner` + `ops_trunc_banner` / `opsT`) |
| F3 | Filtro por intervalo de datas: `createdFrom` / `createdTo` e/ou `updatedFrom` / `updatedTo` | Should |
| F4 | Filtro por `templateId` ou nome de formulário | Should |
| F5 | Filtro por `status` no toolbar (além das colunas) para power users | Could |
| F6 | Paginação cursor-based ou “carregar mais” por coluna | Could (complexidade UX alta no Kanban) |

### 5.2 NFRs sugeridos

- **Latência p95** para `GET /tasks` com `limit=200` e filtro tenant: meta a definir por equipa (ex.: &lt; 500 ms intra-DC).
- **Índices DB:** garantir índices compostos alinhados a `where` + `orderBy` (ex.: `tenantId` via template + `createdAt` + `status`).
- **Rate limiting** no endpoint de listagem para evitar abuso pós-D1.
- **Consistência:** manter `Cache-Control: no-store` no painel operacional.

---

## 6. Melhorias UX: refresh, deep links, vistas, colaboração, a11y

### 6.1 Refresh e confiança nos dados

- Controlo **ligado/desligado** e intervalo (30s / 1m / 2m), espelhando o padrão do dashboard (`dash_auto_*`).
- Texto **“Última atualização: {relativo}”** + hora absoluta opcional ao hover.

### 6.2 Deep links e partilha

- Sincronizar estado com querystring: `scope`, `email`, `q`, `id` (abrir detalhe se encontrado).
- Botão **copiar link** na ficha da OS.

### 6.3 Vistas guardadas e densidade

- Guardar filtros em `localStorage` com nomes (“Erros — João”).
- Toggle **compacto** nos cartões (menos meta, mais cartões visíveis).

### 6.4 Colaboração e export

- Comentários internos por `executionId` (API + UI) — Could, depende modelo de dados.
- Linha do tempo: agregar `auditLog` filtrado por `executionId` na modal de detalhe — Should.
- Export CSV da **lista visível** (mesmos filtros que o Kanban) com limite e aviso RGPD — Should.

### 6.5 Integrações de navegação

- Links: **Utilizador** (`user-edit.html?…`), **Template** (`checklists.html` / builder), **Asset**, **Tracking** quando `trackingLive`.

### 6.6 Alinhamento com Cockpit

- Garantir mesmos rótulos de estado e definições que [`cockpitMetrics.js`](../../admin-panel/backend/src/services/cockpitMetrics.js) (`operationsBoard`) para evitar interpretações divergentes.

### 6.7 Acessibilidade (checklist)

- `aria-live="polite"` nas contagens das colunas ao atualizar.
- Foco preso e **Escape** fecha modais; **Tab** não perde foco fora do overlay.
- Kanban: scroll horizontal com **rótulo acessível** por coluna; atalho `/` para focar busca.
- Modal despacho: agrupar em **passos** ou acordeão com headings semânticos (`h2`/`h3`).

---

## 7. Lista numerada de requisitos (consolidada para backlog)

1. ~~Proteger **todas** as rotas `/api/operations/*` com JWT + `enforcePanelPermissions`.~~ **Feito** (`adminAuthThenPanel` + exceção `rejectOsAuth`).
2. ~~Aplicar **filtro tenant** em `GET /tasks` (e rotas relacionadas) para utilizadores de painel com `tenantId`.~~ **Feito** (`mergeExecutionWhere`).
3. Definir comportamento **SAAS_ADMIN** (global vs tenant obrigatório).
4. UI: **aviso de truncagem** + controlo de **limit**.
5. UI + API: filtros **data** e **template**.
6. **`operations-i18n.js`** + aplicação em `operations.html`; `localeCompare` dinâmico.
7. **Última sincronização** + refresh configurável.
8. **Deep links** e copiar URL.
9. **Vistas guardadas** e densidade compacta.
10. **Timeline** de auditoria na ficha; export lista filtrada (fase 2).
11. **Ligações** para utilizador, template, asset, tracking.
12. **A11y** Kanban + modais (passos despacho, `aria-live`).

---

## 8. Referências rápidas

| Artefato | Caminho |
|----------|---------|
| Página | `admin-panel/operations.html` |
| API | `admin-panel/backend/src/routes/operations.js` |
| Montagem Express | `admin-panel/backend/src/index.js` + [`operations.js`](../../admin-panel/backend/src/routes/operations.js) (`rejectOsAuth` + `adminAuthThenPanel`) |
| i18n referência | `admin-panel/js/dashboard-i18n.js`, `admin-panel/js/user-pages-i18n.js` |
| Design system | `docs/spec/design-system-spec.md` |

---

*Documento gerado como entrega da análise; evoluções de produto devem versionar este ficheiro ou tickets ligados a cada ID (secção 7).*
