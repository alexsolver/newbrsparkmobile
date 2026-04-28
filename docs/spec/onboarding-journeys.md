# Jornadas de onboarding (BrSpark)

Referência de produto alinhada ao app + backend. Última revisão: fluxo tenant padrão do app e portal empresarial.

## 1. Cliente comum

1. Instala o app e regista-se (e-mail + senha).
2. Com a tenant COMPANY partilhada resolvida por `APP_REGISTRATION_SHARED_TENANT_*` (omissão de slug: `master` no seed), o utilizador é criado na **tenant partilhada** «BrSpark App» com papel **USER** — não cria empresa própria.
3. Usa os serviços como cliente (tabs, funcionalidades de consumidor).

**Backend:** `POST /api/register` em `admin-panel/backend/src/routes/account.js`.  
**Seed:** tenant `slug: master` em `src/seed.js` (renomeia legado `brspark-app` se existir).

## 2. Prestador (técnico)

1. Mesmo registo que o cliente (tenant padrão BrSpark App).
2. Em **Perfil** → **Quero ser um Prestador** → `POST /api/me/technician` cria `TechnicianProfile` (PENDING) e candidatura com token.
3. Preenche o formulário em `/auth/tech-registration` (dados, documentos, horários, fotos, confirmação de senha).
4. Após envio, a **equipe analisa** no painel (estado SUBMITTED → APPROVED). *Validação automática de dados pode ser introduzida numa fase seguinte.*
5. Com `TechnicianProfile.status === ACTIVE`, o utilizador pode alternar modo **Prestador** no perfil e usar o fluxo técnico.
6. **Ligação a empresas** para prestar serviços: a definir (produto em evolução).

**Backend:** `account.js` (`/me/technician`, `/me/technician-registration`) + rotas `technician-registration`.

> Nota de evolução de produto: este é o fluxo **tenant-first** atualmente em produção.  
> Está em estudo/migração o modelo **provider-first** (cadastro global + parcerias por tenant), descrito em `docs/spec/provider-first-network-migration.md`.

## 3. Cadastrar a minha empresa

1. No app, **Perfil** → secção **Cadastrar minha empresa** → abre o portal web (por defeito `https://www.brspark.com/empresa`).
2. URL configurável: `EXPO_PUBLIC_BRSPARK_COMPANY_SIGNUP_URL` no `.env` do projeto Expo.

**App:** `app/profile.tsx` — `Linking.openURL`.

## Modo legado de registo

O `POST /api/register` actual exige a tenant COMPANY partilhada (`resolveSharedRegistrationTenant`); sem ela o registo falha com erro de configuração.
