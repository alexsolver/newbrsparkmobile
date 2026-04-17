# Redesenho da Jornada de Cadastro de Prestadores (SaaS)

Data: 2026-04-16  
Status: Proposta executável (MVP + escala)

## 1. Objetivo

Aumentar conversão e velocidade de ativação do cadastro de prestadores, reduzindo abandono e tempo de análise manual, sem perder segurança (KYC/biometria).

Metas iniciais (90 dias):
- +25% em conversão `iniciado -> SUBMITTED`
- -35% em tempo mediano de conclusão
- -40% em tempo de fila `SUBMITTED -> decisão`
- >=30% dos casos aprovados por fluxo semi-automático (baixo risco)

## 2. Diagnóstico atual (resumo)

Fluxo atual:
1. Usuário pede habilitação em `Perfil -> Quero ser um Prestador`.
2. App força passos de foto/biometria/documento antes do formulário principal.
3. Envio exige senha novamente.
4. Painel revisa manualmente por candidatura.

Principais fricções:
- Fricção alta no início (valor percebido baixo antes de KYC pesado).
- Reautenticação com senha no mobile.
- Falta de progressão orientada por tempo/etapas concluídas.
- Revisão manual sem priorização por risco.
- Comunicação de status ainda pouco proativa.

## 3. Jornada-alvo (inspirada em SaaS de alta conversão)

## 3.1 Etapas do usuário (app)

1. Pré-check (30-60s)
- Confirma e-mail, tenant e elegibilidade.
- Exibe estimativa de duração e checklist do que será pedido.
- Salva evento analítico de entrada.

2. Perfil essencial (2 min)
- Nome, contato, especialidade principal, região macro.
- Entrega valor: "após esta etapa você já entra na fila preliminar".

3. Identidade e prova (KYC)
- Selfie validada.
- Documento com foto + OCR.
- Feedback em tempo real com mensagens de correção.

4. Habilitação operacional
- Agenda de disponibilidade, áreas atendidas, docs profissionais (condicional por tenant/regra).

5. Revisão final + envio
- Checklist de pendências por seção.
- Sem senha; confirmar por sessão ativa + OTP curto quando necessário.

6. Pós-envio
- Status transparente (`em análise`, `ajustes solicitados`, `aprovado`, `reprovado`) com ETA e CTA de próxima ação.

## 3.2 Etapas internas (painel)

1. Triagem automática
- Score de risco por candidatura.
- Classificação: `baixo`, `médio`, `alto`.

2. Fila por exceção
- Baixo risco: sugestão de aprovação com checklist auto-preenchida.
- Médio/alto: revisão manual com motivos estruturados.

3. Decisão e comunicação
- Aprovar / pedir ajustes / rejeitar com templates.
- Notificação automática por push + e-mail.

## 4. Mudanças de produto por fase

## Fase 1 (0-30 dias): Conversão e clareza (quick wins)

Escopo:
- Barra de progresso com etapas e tempo estimado no app.
- Checklist de pendências no rodapé antes de `submit`.
- Trocar confirmação por senha para OTP (ou sessão recente) no submit.
- Templates de mensagens para `NEEDS_REVISION` no painel.
- Notificações automáticas em mudanças de status.

Impacto esperado:
- Queda imediata de abandono no meio/final da jornada.

Mapeamento técnico:
- App: `app/auth/tech-registration.tsx`
- App perfil/resumo: `app/profile.tsx`
- Backend submit/auth: `admin-panel/backend/src/routes/technicianRegistration.js`
- Backend notificações: integrar com serviço de e-mail/push já existente
- Painel: `admin-panel/js/technician-applications-page.js`

## Fase 2 (31-60 dias): Eficiência operacional

Escopo:
- Score de risco de candidatura (regras + sinais de validação já disponíveis).
- Fila do painel com ordenação por risco + SLA + idade.
- Motivos estruturados de revisão/rejeição (evitar texto livre apenas).
- Métricas por etapa e funil de abandono.

Impacto esperado:
- Redução de lead time de aprovação e de retrabalho.

Mapeamento técnico:
- Backend: `admin-panel/backend/src/routes/technicianRegistration.js`
- Backend lib: criar `admin-panel/backend/src/lib/technicianRegistrationRisk.js`
- Prisma: adicionar colunas de score/risk/sla em `TechnicianRegistrationApplication`
- Painel lista/detalhe: `admin-panel/js/technician-applications-page.js`

## Fase 3 (61-90 dias): Escala e automação segura

Escopo:
- Aprovação assistida para baixo risco (human-in-the-loop opcional).
- Regras por tenant (documentos obrigatórios, mínimo de fotos, bloqueios regionais).
- Retomada inteligente (nudges automáticos para drafts abandonados).

Impacto esperado:
- Escala sem crescimento linear do time de revisão.

Mapeamento técnico:
- Backend: política por tenant + worker de lembretes
- App: retomada contextual e UX orientada por pendência
- Painel: fila com ações em lote e motivos padronizados

## 5. KPIs e instrumentação

Eventos mínimos (app):
- `provider_signup_started`
- `provider_signup_step_completed` (com `step_name`)
- `provider_signup_step_failed` (com `reason_code`)
- `provider_signup_submitted`

Eventos mínimos (painel):
- `tech_reg_review_opened`
- `tech_reg_approved`
- `tech_reg_revision_requested`
- `tech_reg_rejected`

Métricas operacionais:
- Conversão por etapa.
- Tempo por etapa.
- Tempo em fila por status.
- Taxa de retrabalho (`NEEDS_REVISION`).
- Taxa de aprovação por faixa de risco.

## 6. Backlog técnico priorizado

P0 (primeiro ciclo)
1. Implementar componente de progresso e pendências no formulário.
2. Substituir confirmação por senha no submit por OTP/sessão recente.
3. Criar templates de revisão no painel.
4. Disparar notificação automática em transições de status.

P1
1. Persistir score de risco por candidatura.
2. Exibir score e SLA na lista do painel.
3. Adicionar motivos estruturados (enum + texto opcional).

P2
1. Aprovação assistida para baixo risco.
2. Nudges automáticos para rascunhos abandonados.
3. Regras configuráveis por tenant.

## 7. Guardrails de segurança e compliance

- Manter bloqueio de identidade para perfis `ACTIVE`.
- Trilha de auditoria obrigatória em qualquer transição de status.
- Não remover validações biométricas; apenas mover fricção para momento certo.
- Garantir fallback quando provedores externos (IA/visão) estiverem indisponíveis.

## 8. Plano de rollout

1. Feature flag por tenant para novo fluxo.
2. A/B entre fluxo atual e novo (10% -> 50% -> 100%).
3. Critérios de rollback:
- Queda >10% em submit rate por 24h.
- Aumento anormal de rejeição por fraude.

## 9. Próxima execução recomendada

Sprint 1 (5-7 dias úteis):
1. Progresso + checklist de pendências no app.
2. Templates de revisão no painel.
3. Notificação automática em status.
4. Dashboard simples de funil (início, passo, envio).

Isso entrega ganho de conversão rápido sem quebrar modelo atual de aprovação.
