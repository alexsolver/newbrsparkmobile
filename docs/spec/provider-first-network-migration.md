# Migração para Modelo Provider-First (Global + Parcerias por Tenant)

Data: 2026-04-16  
Status: Proposta de arquitetura e rollout incremental

## 1. Problema atual

No desenho atual, o cadastro de prestador nasce dentro de um tenant (`TechnicianRegistrationApplication.tenantId`) e o convite exige que o usuário já exista naquele tenant.

Consequências:
- Fricção alta no convite inicial.
- Duplicação de onboarding/KYC em cenários multi-tenant.
- Acoplamento entre identidade do prestador e vínculo comercial.

## 2. Objetivo da migração

Separar:
1. Identidade e habilitação do prestador (global/plataforma).
2. Vínculo de parceria por tenant (afiliado, convidado, ativo, suspenso).

Resultado esperado:
- Prestador cadastra uma vez, envia documentos uma vez, e pode receber convites de múltiplas tenants.

## 3. Modelo alvo

## 3.1 Conceitos

1. `ProviderIdentity` (global)
- Perfil global do prestador, independente de tenant.
- Estado de KYC global.
- Documentos base e biometria base.

2. `ProviderTenantAffiliation` (tenant)
- Relação entre prestador global e tenant.
- Estado operacional para despacho de OS naquele tenant.

3. `ProviderOnboardingApplication` (global)
- Jornada de cadastro/KYC sem tenant obrigatório.
- Revisão central (ou por operação Aria).

## 3.2 Proposta de entidades (Prisma conceitual)

```prisma
model ProviderIdentity {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  globalStatus    String   @default("PENDING") // PENDING, VERIFIED, REJECTED, SUSPENDED
  kycStatus       String   @default("PENDING") // PENDING, APPROVED, REJECTED
  kycReviewedAt   DateTime?
  kycReviewNote   String?
  score           Float    @default(5.0)
  cft             String?
  specialty       String?
  skillsJson      Json?
  profileJson     Json?    // campos globais adicionais
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  affiliations    ProviderTenantAffiliation[]
  applications    ProviderOnboardingApplication[]
}

model ProviderTenantAffiliation {
  id                    String   @id @default(cuid())
  tenantId              String
  tenant                Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  providerIdentityId    String
  providerIdentity      ProviderIdentity @relation(fields: [providerIdentityId], references: [id], onDelete: Cascade)

  status                String   @default("INVITED")
  // INVITED, REQUESTED, ACTIVE, INACTIVE, SUSPENDED, REJECTED

  invitationToken       String?  @unique
  invitedByUserId       String?
  invitedByUser         User?    @relation("ProviderAffiliationInvitedBy", fields: [invitedByUserId], references: [id], onDelete: SetNull)
  requestedAt           DateTime?
  invitedAt             DateTime?
  activatedAt           DateTime?
  suspendedAt           DateTime?
  note                  String?

  tenantScheduleJson    Json?
  tenantServiceLocationIds Json?
  tenantDocsJson        Json?

  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  @@unique([tenantId, providerIdentityId])
  @@index([tenantId, status])
  @@index([providerIdentityId, status])
}

model ProviderOnboardingApplication {
  id                  String   @id @default(cuid())
  providerIdentityId  String
  providerIdentity    ProviderIdentity @relation(fields: [providerIdentityId], references: [id], onDelete: Cascade)

  status              String   @default("DRAFT")
  // DRAFT, SUBMITTED, NEEDS_REVISION, APPROVED, REJECTED

  inviteToken         String?  @unique
  responsesJson       Json     @default("{}")
  revisionNote        String?
  submittedAt         DateTime?
  resolvedAt          DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
}
```

## 3.3 Relação com modelos atuais

- `User` continua tenant-scoped (não quebra auth atual).
- `TechnicianProfile` vira camada de compatibilidade durante transição.
- `TechnicianRegistrationApplication` é gradualmente substituído por `ProviderOnboardingApplication`.

## 4. APIs alvo

## 4.1 Onboarding global (app)

1. `POST /api/providers/me/onboarding/start`
- Cria/retoma aplicação global (`DRAFT`).

2. `PATCH /api/providers/me/onboarding/draft`
- Salva progresso global.

3. `POST /api/providers/me/onboarding/submit`
- Submete KYC global.

4. `GET /api/providers/me/onboarding/status`
- Retorna estado e pendências.

## 4.2 Parcerias tenant

1. `POST /api/providers/affiliations/invite`
- Tenant convida prestador por e-mail mesmo sem vínculo prévio.
- Se provider não existir, cria convite pendente (claim posterior).

2. `POST /api/providers/affiliations/:token/accept`
- Prestador aceita parceria (com conta autenticada).

3. `POST /api/providers/affiliations/:id/activate`
- Tenant ativa para despacho de OS (após KYC global aprovado).

4. `GET /api/tenants/:id/providers`
- Lista parceiros da tenant por status.

## 5. Estratégia de migração sem ruptura

## Fase 0 — Preparação (sem mudança de comportamento)

1. Criar novas tabelas (`ProviderIdentity`, `ProviderTenantAffiliation`, `ProviderOnboardingApplication`).
2. Adicionar feature flag `provider_first_network` por tenant.

## Fase 1 — Espelhamento

1. Ao aprovar `TechnicianRegistrationApplication`, criar/atualizar `ProviderIdentity` em paralelo.
2. Criar `ProviderTenantAffiliation` `ACTIVE` para o tenant de origem.
3. Manter `TechnicianProfile` como fonte para o app legado.

## Fase 2 — Novo onboarding global

1. Liberar endpoints globais de onboarding para tenants com flag.
2. Novo app usa fluxo global; legado continua funcional.

## Fase 3 — Convite de parceria desacoplado

1. Habilitar convite por tenant sem exigir `User` prévio no tenant.
2. Fluxo de aceite por token + claim da conta.

## Fase 4 — Corte gradual do legado

1. Painel passa a usar `ProviderIdentity/Affiliation` como fonte principal.
2. `TechnicianRegistrationApplication` vira somente histórico.
3. Migração final de dashboards e regras de despacho para `ProviderTenantAffiliation.status`.

## 6. Compatibilidade operacional

Durante transição, regra de despacho:
- Compatibilidade: permitir despacho se `TechnicianProfile.status === ACTIVE`.
- Novo modelo: permitir despacho se `ProviderTenantAffiliation.status === ACTIVE` e `ProviderIdentity.kycStatus === APPROVED`.

Regra final (cutover):
- usar somente `ProviderTenantAffiliation + ProviderIdentity`.

## 7. Segurança e compliance

1. Consentimento explícito de compartilhamento de dados com cada tenant (na aceitação de parceria).
2. Trilhas de auditoria para: convite, aceite, ativação, suspensão.
3. Escopo de visibilidade por tenant:
- Tenant vê apenas dados necessários para operação.
- Documento bruto global pode ficar mascarado/centralizado.

## 8. Riscos e mitigação

1. Duplicidade de fonte (`TechnicianProfile` vs novo modelo)
- Mitigar com sync unidirecional e métricas de consistência.

2. Complexidade de claim de convite
- Mitigar com token assinado + expiração + idempotência.

3. Multi-instância no OTP e desafios efêmeros
- Mover armazenamento de desafios para Redis/DB compartilhado antes de escalar.

## 9. Backlog técnico recomendado

P0
1. Migração Prisma para novas tabelas.
2. Serviço de sync legado -> novo modelo no approve.
3. Read-model no painel com fallback legado.

P1
1. Endpoints globais de onboarding.
2. Endpoints de parceria por tenant.
3. UI de aceite de parceria no app.

P2
1. Corte de despacho para novo modelo.
2. Desativação progressiva das rotas antigas de convite tenant-first.

## 10. Decisões de produto pendentes

1. Quem aprova KYC global: operação central Aria ou tenant patrocinadora?
2. Quais dados globais podem ser visíveis para tenant antes do aceite?
3. Tenant pode exigir documentos adicionais locais? (sim/não e como versionar)
4. Prestador pode atuar simultaneamente em tenants concorrentes? (política comercial)
