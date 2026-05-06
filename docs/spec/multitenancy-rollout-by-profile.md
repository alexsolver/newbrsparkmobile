# Rollout Multitenancy Por Perfil

Objetivo: executar a homologação final e o rollout operacional do modelo multitenant da Aria com uma sequência clara por perfil, superfície e risco.

## Resultado Esperado

- `SAAS_ADMIN` opera a plataforma inteira sem depender de tenant especial.
- `TENANT_ADMIN` administra apenas a própria organização.
- `MANAGER` atua nas rotinas operacionais do próprio tenant sem acessar controles estruturais.
- `PROVIDER` usa apenas superfícies técnicas liberadas por capability.
- `USER` permanece na experiência de cliente, sem affordances de operação interna.

## Perfis Obrigatórios

- `SAAS_ADMIN` da Aria
- `TENANT_ADMIN` do tenant A
- `MANAGER` do tenant A
- `TENANT_ADMIN` do tenant B
- `PROVIDER` ativo do tenant A
- `USER` comum do tenant A

## Ordem Recomendada De Homologação

### Fase 0: Pré-checagem

1. Confirmar ambiente com pelo menos dois tenants reais ou seedados.
2. Confirmar login novo no painel e no app para atualizar bootstrap/capabilities.
3. Rodar:
   - `npm run test:multitenancy-regression-suite`
4. Confirmar que logs/auditoria estão acessíveis para inspeção.

Critério de saída:
- suíte automatizada verde
- contas de teste válidas
- dados mínimos disponíveis nos tenants A e B

### Fase 1: Plataforma Aria

Perfil: `SAAS_ADMIN`

Objetivo:
- validar superfícies globais e administração multi-tenant

Superfícies:
- `dashboard`
- `tenants`
- `users` com filtro cross-tenant
- `plans`
- `subscriptions`
- `billing`
- `integrations`

Verificações:
- vê múltiplos tenants sem fallback legado
- pode criar/suspender tenant
- pode operar catálogo global de planos e assinaturas
- pode operar integrações globais
- pode impersonar tenant admin

Critério de saída:
- nenhum bloqueio indevido em área global
- impersonação funcionando com retorno seguro
- auditoria preenchida com `actorScope`, `actorRole` e `contextTenantId`

### Fase 2: Administração Do Tenant

Perfil: `TENANT_ADMIN`

Objetivo:
- validar administração completa da própria organização sem vazamento cross-tenant

Superfícies:
- `users`
- `user-edit`
- `technician-applications`
- `operations`
- `work-time`
- `evaluations`
- `stock-critical`
- `routine-tasks`
- `tenants` no contexto “Minha organização”

Verificações:
- só vê dados do próprio tenant
- não vê affordances globais de plataforma
- pode editar branding e configurações da própria organização
- pode convidar/aprovar técnico no próprio tenant
- pode operar usuários e rotinas do tenant

Critério de saída:
- nenhum dado do tenant B aparece
- nenhum botão global é exibido
- gravações do próprio tenant persistem normalmente

### Fase 3: Gestão Operacional

Perfil: `MANAGER`

Objetivo:
- validar operação diária sem privilégios estruturais

Superfícies:
- `operations`
- `technician-applications`
- `work-time`
- `evaluations`
- `routine-tasks`
- `users` em modo restrito

Verificações:
- consegue operar fluxos do próprio tenant
- não consegue impersonar
- não consegue criar `TENANT_ADMIN` nem `SAAS_ADMIN`
- não acessa notas internas ou controles estruturais reservados
- no chat/admin, só vê ações compatíveis com capability

Critério de saída:
- perfil operacional funciona sem atrito
- nenhum controle de plataforma ou administração estrutural aparece

### Fase 4: Experiência Do Prestador

Perfil: `PROVIDER`

Objetivo:
- validar que o app mostra apenas o que o backend autorizou

Superfícies:
- modo prestador
- agenda
- quick actions
- busca de OS
- work time

Verificações:
- modo prestador depende de `mobile.mode.provider`
- ações rápidas dependem de capability
- work time só aparece quando liberado
- deep link direto não abre tela sem capability

Critério de saída:
- experiência técnica coerente com `appContext.capabilities`

### Fase 5: Experiência Do Usuário Final

Perfil: `USER`

Objetivo:
- confirmar ausência total de superfícies operacionais indevidas

Superfícies:
- home/tabs
- perfil
- serviços

Verificações:
- não vê modo prestador
- não vê work time
- não vê quick actions administrativas
- permanece na jornada de cliente

Critério de saída:
- nenhuma affordance interna ou operacional aparece para cliente comum

## Matriz De Aprovação

### Go / No-Go Técnico

- `SAAS_ADMIN` aprovado
- `TENANT_ADMIN` aprovado
- `MANAGER` aprovado
- `PROVIDER` aprovado
- `USER` aprovado
- auditoria validada
- tentativa manual de trocar `tenantId` bloqueada
- acesso direto por URL sem capability bloqueado

Se qualquer item acima falhar, status do rollout = `NO-GO`.

## Plano De Execução Em Produção

### Etapa 1: Ativação Controlada

1. Validar primeiro com tenant interno Aria.
2. Validar depois com 1 tenant parceiro piloto.
3. Acompanhar logs de:
   - login
   - impersonação
   - CRUD de usuários
   - convites de técnico
   - branding
   - work time

### Etapa 2: Expansão

1. Liberar tenant admins parceiros.
2. Liberar managers.
3. Validar providers e app mobile.
4. Só então comunicar rollout completo.

## Sinais De Regressão Que Bloqueiam O Go-Live

- tenant-scoped enxergando outro tenant
- `SAAS_ADMIN` ausente de páginas globais
- botão global visível para `TENANT_ADMIN` ou `MANAGER`
- app mostrando modo prestador ou ponto sem capability
- impersonação sem troca correta de contexto
- auditoria sem metadados mínimos

## Riscos Residuais Após As Correções

Os itens abaixo permanecem como risco operacional ou de processo, não como lacuna principal de código:

- necessidade de execução disciplinada do QA manual por perfil real
- risco de sessão antiga manter bootstrap defasado até novo login
- risco de nova feature futura ser entregue sem seguir o padrão capability-first
- risco de homologação insuficiente em tenant piloto antes da expansão total
- necessidade de monitorar auditoria e logs sensíveis nas primeiras ondas de rollout

Mitigações obrigatórias:

- rodar a suíte `test:multitenancy-regression-suite` antes de cada promoção
- executar o checklist manual por perfil
- homologar primeiro em tenant interno e depois em tenant parceiro piloto
- revisar auditoria de login, impersonação, branding, users e technician registration no início do rollout

## Registro De Homologação

Preencher por execução:

- data
- ambiente
- perfil
- tenant
- superfície
- cenário
- resultado
- evidência
- decisão: `ok`, `bug`, `bloqueado`

## Responsáveis

- Produto: valida UX e nomenclatura por contexto
- QA: executa cenários e registra evidências
- Engenharia: corrige desvios e reexecuta cenários afetados
- Operação Aria: aprova entrada em produção com base nos perfis reais
