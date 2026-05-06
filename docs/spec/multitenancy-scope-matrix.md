# Matriz De Escopos Multitenancy Aria

## Escopos
- `platform`: operação da Aria como dona do SaaS
- `network`: gestão da rede / marketplace de técnicos
- `tenant`: workspace isolado de cada parceiro
- `public`: superfícies públicas controladas

## Atores
- `PLATFORM_OWNER`: acesso global da Aria
- `TENANT_ADMIN`: administração de um tenant específico
- `TENANT_MANAGER`: gestão operacional de um tenant específico
- `PROVIDER`: técnico/prestador com atuação por tenant
- `USER`: usuário final do tenant
- `ANON`: não autenticado

## Páginas E APIs Por Escopo

### `platform`
- Páginas:
  - `admin-panel/tenants.html`
  - `admin-panel/users.html` quando o filtro cruza tenants
  - dashboards e páginas globais de administração da Aria
- APIs:
  - `GET /api/tenants`
  - `POST /api/tenants`
  - `PATCH /api/tenants/:id/status`
  - `PATCH /api/tenants/:id/features`

### `network`
- Páginas:
  - fluxos futuros de gestão da rede de prestadores
  - listas consolidadas de vínculos provider-first
- APIs:
  - `GET /api/tenants/:id/providers`
  - fluxos de `ProviderIdentity` e `ProviderTenantAffiliation`

### `tenant`
- Páginas:
  - `admin-panel/technician-applications.html`
  - `admin-panel/operations.html`
  - `admin-panel/users.html` quando o acesso é restrito ao próprio tenant
  - app mobile autenticado
- APIs:
  - `GET /api/users`
  - `PATCH /api/users/:id`
  - `GET /api/operations/tasks`
  - `GET /api/tenants/:id/branding`
  - `PUT /api/tenants/:id/branding`
  - `GET /api/technician-registration`
  - `POST /api/technician-registration/invite`

### `public`
- Páginas:
  - `app/provider-services/[tenantId].tsx`
  - login e onboarding público
- APIs:
  - `POST /api/login`
  - `POST /api/register`
  - `GET /api/technician-registration/public/:token`
  - endpoints públicos do catálogo

## Regras Operacionais
- Escopo de tenant deve ser sempre derivado do token para atores não-platform.
- `tenantId` vindo da query/body só pode funcionar como filtro adicional para `platform`.
- Branding global do app não define poder de autorização.
- Impersonação deve ser auditada e sempre visível na UI.

## Critérios De Aceite
- Nenhum ator `tenant` acessa dados de outro tenant.
- A Aria acessa múltiplos tenants via `platform`, não por exceção de branding/slug.
- O frontend só mostra ações presentes em `capabilities`.

## Matriz Operacional De UX

### Painel Admin
- `admin-panel/dashboard.html`
  - visão global da plataforma: `PLATFORM_OWNER` / `SAAS_ADMIN` com `platform.dashboard.read`
  - visão restrita ao tenant atual: `TENANT_ADMIN` e `MANAGER`
- `admin-panel/tenants.html`
  - listar tenant em modo plataforma: `platform.tenants.read`
  - criar tenant, ativar/suspender tenant: `platform.tenants.write`
  - editar branding do próprio tenant: `tenant.branding.write.self`
  - editar branding de qualquer tenant: `tenant.branding.write.any`
- `admin-panel/users.html`
  - ver lista do próprio tenant: `tenant.users.read.self`
  - filtrar cross-tenant: `platform.users.read`
  - criar usuário no próprio tenant: `tenant.users.write.self` ou `tenant.users.write.limited`
  - criar `SAAS_ADMIN`: `platform.users.write`
  - impersonar qualquer painel: `platform.users.impersonate`
  - impersonar painel do próprio tenant: `tenant.users.impersonate.self`
- `admin-panel/user-edit.html`
  - editar campos gerais do próprio tenant: `tenant.users.write.self` ou `tenant.users.write.limited`
  - editar notas internas / papéis elevados: somente perfis sem limitação de gestor
  - editar `SAAS_ADMIN`: somente `platform.users.write`
- `admin-panel/technician-applications.html`
  - listar candidaturas do próprio tenant: `tenant.technicianRegistration.read.self`
  - convidar, aprovar, pedir revisão, rejeitar: `tenant.technicianRegistration.write.self` ou `tenant.technicianRegistration.write.any`
- `admin-panel/operations.html`
  - operação do próprio tenant: `tenant.operations.read.self`
  - ações operacionais do próprio tenant: `tenant.operations.write.self`
  - visão multi-tenant da plataforma: `tenant.operations.read.any` / `tenant.operations.write.any`
- `admin-panel/work-time.html`
  - ver política e relatórios do tenant: `mobile.workTime.access`
  - editar política do tenant: `tenant.write.self` ou `tenant.operations.write.self`
  - trocar tenant no seletor global: `platform.system.write` ou `platform.tenants.write`
- `admin-panel/stock-critical.html`
  - ver estoque crítico do próprio tenant: escopo `tenant`
  - filtrar vários tenants: `tenant.access.any`
- `admin-panel/evaluations.html`
  - ver analytics, instâncias, ranking e chat de auditoria do próprio tenant: `tenant.operations.read.self`
  - criar/editar template, regenerar token, resolver disputa: `tenant.operations.write.self` ou `tenant.operations.write.any`
  - filtro cross-tenant: `tenant.access.any` ou `platform.dashboard.read`
- `admin-panel/routine-tasks.html`
  - operar RT do tenant atual: `tenant.operations.read.self` / `tenant.operations.write.self`
  - selecionar outro tenant no modo plataforma: `tenant.access.any` ou `platform.dashboard.read`
- `admin-panel/integrations.html`
  - leitura da malha global: `platform.integrations.read`
  - salvar, testar e remover integrações: `platform.integrations.write` ou `platform.system.write`
- `admin-panel/plans.html`
  - catálogo de planos e duplicação: `platform.tenants.write` ou `platform.system.write`
- `admin-panel/subscriptions.html`
  - atribuir, cancelar assinatura, alterar recurso global de plano: `platform.tenants.write` ou `platform.system.write`
- `admin-panel/billing.html`
  - MRR, alteração de plano e cancelamento administrativo: `platform.tenants.write` ou `platform.system.write`

### App Mobile
- modos `SERVICES` e `PROVIDER`
  - modo prestador: `mobile.mode.provider`
  - quick actions operacionais: `mobile.provider.quickActions`
  - busca de OS para prestador: `mobile.provider.osSearch`
  - ponto: `mobile.workTime.access`
  - quick actions administrativas do app: `mobile.admin.quickActions`
- `app/profile.tsx`
  - bloco de hero do diretório/empresa: `mobile.admin.quickActions`

### Regras De Produto E QA
- Sempre que uma página tiver leitura permitida e mutação proibida, a UI deve manter a listagem e esconder somente os CTAs mutáveis.
- Filtros cross-tenant nunca devem aparecer para perfis `tenant-scoped`.
- A nomenclatura da UI deve refletir contexto:
  - `SAAS_ADMIN`: linguagem de plataforma
  - `TENANT_ADMIN`: linguagem de organização própria
  - `MANAGER`: linguagem operacional sem affordances de administração estrutural
- Deep link direto para páginas globais não pode reexpor botões ou formulários de escrita se o perfil não tiver a capability correspondente.
