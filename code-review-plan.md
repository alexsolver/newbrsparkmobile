# Code Review Master Plan

**Estado (última actualização: 2026-04-28):** parte das verificações automáticas e melhorias pontuais foram executadas; itens que exigem QA manual prolongado, migração SQL ou auditoria linha-a-linha de centenas de ficheiros mantêm-se abertos.

## Goal
Conduzir uma varredura rigorosa e estruturada em toda a infraestrutura (Mobile Frontend, Backend API e Sync Offline) para identificar e corrigir pequenos erros silenciosos, falhas de tipagem, vazamento de memória e incongruências de estado.

## Tasks

### 1. Auditoria de Sincronização e Offline-First
- [x] Inspecionar `DataCollectionService` — `catch` vazios em `loadPolicy`, `refreshPolicy` e `stopGeofencingAsync` passam a `console.warn` com contexto (diagnóstico em campo/offline).
- [ ] Validar conflitos de concorrência ou mutações repetidas. → Verify: Rodar envio múltiplo simultâneo e verificar se a fila deduplica as requisições.
- [ ] `CostService` — notificações com `catch` silencioso: avaliar se convém log estruturado (baixo ruído).

### 2. Auditoria do Backend e Integração (Admin Panel)
- [ ] Revisar rotas de API em `/admin-panel/backend/src/routes/` contra erros de permissão e falhas sem `try/catch`. → Verify: Identificar rotas que possam retornar timeout ou crashar a porta 3001.
- [ ] Checar manipulação de webhooks e `Prisma Client` (conexões abertas não fechadas). → Verify: padrão RLS + pool já documentados em `docs/spec/row-level-security.md` e `db.js`; revisão contínua.

### 3. Sessão de Auth e Gerenciamento de Estado Global (Frontend)
- [ ] Revisar `useAuth.tsx` para assegurar que tokens decaídos redirecionem para Login limpando Async. → Verify: Alterar JWT fake e verificar se a sessão expira com elegância.
- [ ] Revisar telas com forte amarração em `Context` ou estados pesados, checando possíveis vazamentos de memória (ex: map views recarregando toda hora). → Verify: Navegar entre as views de mapas/gps sem lentidão na aba performance do Expo.

### 4. Interface e Acessibilidade Visual
- [ ] Corrigir qualquer problema gramatical ou ícones faltando (já substituídos em Login e Profile, verificar os outros componentes que acessam traduções locais). → Verify: Garantir que não existam logs the renderização de SVG / Emojis falhando.

### 5. Execução de Scripts de Saúde
- [x] `npx tsc --noEmit` na raiz do BrsparkMobile — **sem erros** (2026-04-28).
- [x] `python3 .agent/skills/lint-and-validate/scripts/lint_runner.py .` — executa `tsc` no projecto Node; **PASS** (2026-04-28).
- [x] `python3 .agent/skills/vulnerability-scanner/scripts/security_scan.py . --scan-type patterns` — executado; devolveu alertas de padrões (ex.: `innerHTML` no painel) para triagem futura — **não** “checagem limpa” global.
- [ ] `npm audit` / scan de dependências com remediação — backlog.

### 6. Catálogo de prestadores (alinhado a `docs/plano-correcao-bugs-2026-04-15.md`)
- [x] Backend `GET /api/providers`: com CMS configurado e falha upstream **sem** `DIRECTORY_POSTGRES_FALLBACK`, resposta **503** + `X-BrSpark-Directory-Source: laravel-error` + payload com `error` (já estava implementado).
- [x] App `ProviderService.search`: se a resposta for **200** mas o header indicar `laravel-error` ou `cms-not-configured`, usar cache SQLite local (defesa em profundidade).

## Done When
- [ ] Nenhuma rota do node quebra (Backend resiliente). — *contínuo*
- [ ] O app reage perfeitamente a perdas e ganhos de sinal sem perder form submission. — *requer QA manual*
- [x] O type compiler (`tsc`) passa na raiz do ecossistema mobile. — **feito 2026-04-28**

## Fora de âmbito deste documento (outros planos)
- **RLS fase 2+** (`docs/spec/row-level-security.md`): tabelas `User`, `AppAccount`, etc.
- **Rollout multitenancy** (`docs/spec/multitenancy-rollout-by-profile.md`): fases 0–5 e registo de homologação.
