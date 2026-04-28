# Row-Level Security (PostgreSQL) — API `admin-panel/backend`

## Objectivo

Reforçar o isolamento por **tenant** (empresa / workspace) no PostgreSQL, em complemento aos filtros Prisma e às regras de autorização em Node. Um bug que omita `tenantId` num `where` deixa de expor linhas de outro tenant **se** a política RLS não permitir.

## Mecanismo

1. **Funções SQL** `public._brspark_rls_privileged()`, `_brspark_rls_tenant_allowed(text)`, `_brspark_rls_tenant_or_global(text)` (migration `20260429180000_row_level_security_brspark`).
2. **Variáveis de sessão** (GUCs com `set_config(..., true)` = escopo da transacção):
   - `app.admin_is_platform` — admin SaaS / legado sem filtro de tenant no painel.
   - `app.admin_panel_tenant_id` — tenant efectiva do painel (TENANT_ADMIN / MANAGER ou filtro de contexto SaaS).
   - `app.current_tenant_id`, `app.current_user_id`, `app.current_user_email` — JWT do **app** móvel.
   - `app.bridge_internal` — pedidos `/api/internal/*` autenticados com `X-Bridge-Secret` (Laravel).
   - `app.reports_api` — integrações com `REPORTS_API_KEY`.
3. **Uma transacção PostgreSQL por pedido** autenticado: `src/middleware/prismaRlsRequestContext.js` abre `prisma.$transaction`, aplica GUCs e mantém o `TransactionClient` no `AsyncLocalStorage`; `src/db.js` encaminha todas as operações Prisma para esse cliente até `res` terminar.

## Desactivar (emergência / testes)

`BRSPARK_RLS_DISABLE=1` — o middleware deixa de abrir a transacção; as políticas continuam definidas no Postgres mas o processo Node não fixa GUCs por pedido (em geral o **dono das tabelas** ignora RLS; não confiar para segurança real).

## Tabelas cobertas

Ver o ficheiro SQL da migration: `Asset`, `Location`, `Tenant`, `Subscription`, `ChecklistExecution`, avaliações, afiliações prestador, ponto (`WorkTime*`), bibliotecas de referência, etc.

**Sem RLS nesta fase** (login público, contas globais, etc.): `User`, `AppAccount`, `OtpLoginChallenge`, `Admin`, `Plan`, `Integration`, `Metatag`, `ComplianceDoc`, `ConsentRecord`, chat corporativo, `UserModuleData`, entre outras — podem ser fases seguintes.

## Operações longas

Uploads ou pedidos muito longos partilham o **timeout** da transacção (`BRSPARK_RLS_TX_TIMEOUT_MS`, predefinido 300000 ms). Ajustar se necessário.

## BrsparkWeb (Laravel)

Esta camada aplica-se **só** ao backend Node do BrsparkMobile. O CRM Laravel, se usar o mesmo Postgres, deve definir os mesmos GUCs por sessão ou usar um role com políticas alinhadas.
