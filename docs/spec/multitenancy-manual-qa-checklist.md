# Checklist De QA Manual Multitenancy

Objetivo: validar, em ambiente real, que o modelo de escopos `platform`, `network`, `tenant` e `public` está refletido no painel admin, no app mobile e nas APIs críticas.

Documento complementar para condução executiva do rollout:
- `docs/spec/multitenancy-rollout-by-profile.md`

## Perfis mínimos de teste

- `SAAS_ADMIN` da BrSpark com acesso global.
- `TENANT_ADMIN` de um tenant parceiro A.
- `MANAGER` de um tenant parceiro A.
- `TENANT_ADMIN` de um tenant parceiro B.
- `PROVIDER` ativo no tenant A.
- `USER` comum no tenant A.

## Preparação do ambiente

1. Garantir dois tenants distintos com dados reais ou seedados: `tenant A` e `tenant B`.
2. Garantir pelo menos:
   - 2 usuários comuns em cada tenant.
   - 1 prestador ativo em `tenant A`.
   - 1 candidatura de técnico pendente em `tenant A`.
   - 1 OS/checklist em `tenant A`.
   - 1 OS/checklist em `tenant B`.
3. Confirmar que as contas de painel recebem bootstrap com `authz`, `context` e `capabilities`.
4. Confirmar que o app foi autenticado novamente após as mudanças, para receber `appContext.capabilities`.
5. Rodar antes do QA manual:
   - `npm run test:multitenancy-regression-suite`

## Bloco 1: Plataforma BrSpark

### 1.1 Login global no painel

1. Entrar com `SAAS_ADMIN`.
2. Confirmar que o painel mostra contexto de plataforma.
3. Confirmar que a listagem de tenants mostra `tenant A` e `tenant B`.
4. Confirmar que é possível abrir detalhes de ambos os tenants.

Resultado esperado:
- O contexto visual e a sessão indicam plataforma BrSpark.
- O usuário enxerga múltiplos tenants sem depender de branding, slug especial ou fallback legado.

### 1.2 Gestão global de tenants

1. Como `SAAS_ADMIN`, acessar `tenants`.
2. Alterar status ou features de um tenant de teste.
3. Voltar à lista e validar persistência.

Resultado esperado:
- Apenas `SAAS_ADMIN` consegue criar tenant, alterar status e alterar features.

### 1.3 Impersonação

1. Como `SAAS_ADMIN`, impersonar um `TENANT_ADMIN` do `tenant A`.
2. Validar que o painel muda para contexto do `tenant A`.
3. Encerrar a impersonação e retornar ao contexto global.

Resultado esperado:
- A impersonação funciona.
- O contexto muda para tenant.
- O retorno ao contexto anterior funciona sem perder bootstrap/capabilities.
- A operação fica auditável.

## Bloco 2: Isolamento por tenant no painel

### 2.1 `TENANT_ADMIN` do tenant A

1. Entrar com `TENANT_ADMIN` do `tenant A`.
2. Abrir `users`.
3. Confirmar que só aparecem usuários do `tenant A`.
4. Tentar filtrar/manualmente acessar usuários do `tenant B`.
5. Abrir `technician-applications`.
6. Confirmar que só aparecem candidaturas do `tenant A`.
7. Abrir operações/OS.
8. Confirmar que só aparecem execuções do `tenant A`.

Resultado esperado:
- Nenhum dado do `tenant B` aparece.
- Filtros por query/body não quebram o isolamento.
- A UI não expõe ações globais de plataforma.

### 2.2 `MANAGER` do tenant A

1. Entrar com `MANAGER`.
2. Validar acesso às áreas operacionais do próprio tenant.
3. Tentar impersonar outro usuário.
4. Tentar acessar tela global de tenants.

Resultado esperado:
- O `MANAGER` opera apenas dentro do próprio tenant.
- Não consegue impersonar.
- Não recebe ações globais de plataforma.

### 2.3 Separação entre tenant A e tenant B

1. Abrir duas sessões: `TENANT_ADMIN` do `tenant A` e `TENANT_ADMIN` do `tenant B`.
2. Comparar usuários, candidaturas, branding e operações.

Resultado esperado:
- Cada sessão enxerga exclusivamente o próprio tenant.
- Não existe vazamento cruzado de contagens, nomes, OS, branding ou prestadores.

## Bloco 3: Branding e contexto

### 3.1 Branding por tenant

1. Como `TENANT_ADMIN` do `tenant A`, abrir branding do tenant.
2. Alterar um campo permitido.
3. Validar retorno e persistência.
4. Repetir no `tenant B`.

Resultado esperado:
- Cada tenant altera apenas o próprio branding.
- Tenant sem permissão/plano compatível recebe bloqueio adequado.

### 3.2 Tenant global do app

1. Validar endpoint/fluxo de branding do tenant global do app.
2. Confirmar que branding global do app não concede acesso global de dados.

Resultado esperado:
- Branding global é apenas branding.
- Não existe elevação de autorização por slug ou marca.

## Bloco 4: Fluxo de técnico e provider-first

### 4.1 Candidatura legada por tenant

1. Como `TENANT_ADMIN` do `tenant A`, convidar técnico.
2. Confirmar que a candidatura nasce no `tenant A`.
3. Tentar abrir a mesma candidatura com sessão do `tenant B`.

Resultado esperado:
- O `tenant B` não consegue ver nem operar a candidatura.

### 4.2 Provider-first / rede

1. Validar convite de onboarding global de prestador.
2. Validar convite de afiliação por tenant.
3. Ativar afiliação no tenant correto.
4. Tentar operar a afiliação a partir de tenant não autorizado.

Resultado esperado:
- Convites e afiliações respeitam o tenant correto.
- Apenas atores autorizados conseguem criar e ativar vínculos.

## Bloco 5: App mobile por capability

### 5.1 Usuário comum (`USER`)

1. Entrar no app com `USER`.
2. Confirmar ausência de modo prestador.
3. Confirmar ausência de busca de OS prestador.
4. Confirmar ausência de work time.

Resultado esperado:
- O app abre em experiência de cliente.
- Nenhuma superfície de prestador aparece.

### 5.2 Prestador ativo (`PROVIDER` ou perfil técnico ativo)

1. Entrar com prestador ativo.
2. Confirmar que o app recebe capability de modo prestador.
3. Alternar para modo prestador.
4. Validar:
   - menu radial de ações rápidas.
   - agenda em modo prestador.
   - OS search, se habilitado.
   - work time, se habilitado.

Resultado esperado:
- Todas as superfícies exibidas batem com `capabilities`.
- Acesso direto por rota não funciona quando a capability não existe.

### 5.3 Conta interna de gestão no app

1. Entrar com conta `MANAGER` ou `TENANT_ADMIN` no app.
2. Validar capabilities de quick actions administrativas, quando aplicável.

Resultado esperado:
- O app não depende apenas de `role`.
- O comportamento segue `appContext.capabilities`.

## Bloco 6: Regressões críticas de segurança

### 6.1 Troca manual de `tenantId` em requests

1. Autenticar como ator tenant-scoped.
2. Repetir requests críticos (`users`, `tenants`, `technician-registration`, `operations`) alterando `tenantId` manualmente.

Resultado esperado:
- O backend ignora ou bloqueia o `tenantId` externo quando o ator não é `platform`.

### 6.2 Acesso direto por URL

1. Navegar diretamente para páginas/telas de tenant diferente.
2. Tentar abrir rotas profundas do app associadas ao modo prestador sem capability.

Resultado esperado:
- O acesso é bloqueado ou redirecionado.

### 6.3 SAAS_ADMIN oculto para perfis não plataforma

1. Como `TENANT_ADMIN` e `MANAGER`, abrir listagem de usuários.
2. Tentar localizar contas `SAAS_ADMIN`.

Resultado esperado:
- Contas de plataforma não aparecem para atores tenant-scoped.

## Bloco 7: Auditoria

Validar no banco/logs ao menos estes eventos:

- `LOGIN`
- `PANEL_TENANT_LOGIN`
- `PANEL_IMPERSONATE`
- `TENANT_CREATE`
- `TENANT_UPDATE`
- `TENANT_BRANDING_UPDATE`
- `USER_CREATE`
- `USER_RESET_PASSWORD`
- `TECH_REGISTRATION_INVITE`
- `TECH_REGISTRATION_APPROVED`
- `PROVIDER_ONBOARDING_INVITE_CREATE`
- `PROVIDER_AFFILIATION_INVITED`
- `PROVIDER_AFFILIATION_ACTIVATED`

Resultado esperado:
- Os registros trazem contexto suficiente para investigação:
  - `actorScope`
  - `actorRole`
  - `contextTenantId`
  - `targetTenantId`
  - `targetUserId`, quando aplicável

## Critérios de aprovação

- Nenhum ator tenant-scoped acessa dados de outro tenant.
- O `SAAS_ADMIN` opera multi-tenant via escopo `platform`.
- A UI do painel e do app só exibe ações coerentes com `capabilities`.
- Rotas profundas do app e requests manuais não furam os guards.
- Auditoria registra contexto suficiente para rastrear ações sensíveis.

## Resultado do ciclo

Ao executar este checklist, registrar:

- conta usada
- tenant
- superfície testada
- resultado observado
- evidência
- status final: `ok`, `bug`, `bloqueado`
