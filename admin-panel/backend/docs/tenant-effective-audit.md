# Tenant efetivo vs tenant «casa» — auditoria e governança

## Regra de produto (backend)

- O **contexto operacional** do app móvel (JWT) usa `authUser` + `resolveAppEffectiveTenantId` (ver `src/lib/appLoginEffectiveTenant.js`).
- Cálculos que definem **política por organização** (ponto, flags de tenant, etc.) devem usar a **mesma** tenant que o middleware (efetiva), **não** `User.tenantId` recarregado da BD em isolamento.
- Criação de `Tenant` com email sintético: fluxos oficiais em `POST /api/internal/cms-tenant-provision` e `POST /api/me/workspaces` (`src/routes/cmsLaravelBridgeInternal.js`, `src/routes/account.js`). Evitar `Tenant` `COMPANY` com email de login real **fora** destes fluxos sem `laravelTenantId` e sem reconciliação com o CMS.

## Decisão de dados (ex.: tenant «Lansolver» duplicado vs platform)

Antes de SQL destrutivo, alinhar com produto:

- **A** — A tenant empresa (ex. Lansolver) é o workspace operacional: ajustar `WorkTimeSettings`, subscrição e, se aplicável, qual tenant Node recebe o `laravel_tenant_id` (único global no Prisma).
- **B** — Duplicata/legacy: fundir recursos, arquivar afiliações, ou repor o email do `Tenant` para endereço sintético (padrão semelhante a `cms+…@aria.cms.linked`).

## Consultas de auditoria (somente leitura, PostgreSQL)

Ajustar nomes de schema/base conforme o ambiente.

### Tenants COMPANY com email «humano» mas sem utilizadores nesse tenant

```sql
SELECT t.id, t.email, t.slug, t.kind, t.status, t."laravel_tenant_id"
FROM "Tenant" t
WHERE t.kind = 'COMPANY'
  AND t.email NOT LIKE '%@aria.%'
  AND t.email NOT LIKE '%@aria.cms.linked'
  AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u."tenantId" = t.id);
```

### Batidas de ponto com tenantId diferente do afiliado DEDICATED (detetar desvios após correcção de código; histórico antigo pode divergir)

```sql
SELECT w."userId", w."tenantId" AS punch_tenant, pta."tenantId" AS dedicated_tenant, w."deviceTimestamp"
FROM "WorkTimePunch" w
JOIN "User" u ON u.id = w."userId"
JOIN "ProviderIdentity" pi ON pi."userId" = u.id
JOIN "ProviderTenantAffiliation" pta
  ON pta."providerIdentityId" = pi.id
 AND pta."relationshipType" = 'DEDICATED'
 AND pta.status = 'ACTIVE'
WHERE w."tenantId" <> pta."tenantId"
  AND w."deviceTimestamp" > now() - interval '90 days'
LIMIT 200;
```

### Duplicidade de mapeamento Laravel (deve ser vazio)

```sql
SELECT "laravel_tenant_id", count(*) AS n
FROM "Tenant"
WHERE "laravel_tenant_id" IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;
```
