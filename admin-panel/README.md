# Aria Admin Panel

Painel web exclusivo para administradores da plataforma. Backend Node.js + Express + Prisma + **PostgreSQL**. Frontend HTML/CSS/JS puro — sem build step.

---

## Quick Start

### 1. Configure o banco de dados
```bash
cd admin-panel/backend

# Copie e configure o .env
cp .env.example .env
# Edite DATABASE_URL com suas credenciais PostgreSQL:
# postgresql://USER:PASSWORD@localhost:5432/aria_admin
```

### 2. Inicialize o banco e o seed
```bash
npm run db:migrate   # cria todas as tabelas
npm run db:seed      # cria admin, planos, flags, metatags
```

### 3. Inicie o servidor
```bash
npm run dev          # http://localhost:3001
```

### 4. Abra o painel no browser
```bash
# Na pasta admin-panel/:
npx serve .          # ou Live Server no VS Code
# Acesse http://localhost:5500
```

---

## Estrutura

```
admin-panel/
  backend/
    prisma/
      schema.prisma          20 modelos — PostgreSQL
    src/
      index.js               Express server (porta 3001)
      db.js                  Prisma client singleton
      seed.js                Seed inicial do banco
      middleware/auth.js     JWT guard
      routes/
        auth.js              POST /api/auth/login
        dashboard.js         GET  /api/dashboard
        tenants.js           CRUD /api/tenants
        users.js             CRUD /api/users
        plans.js             CRUD /api/plans
        subscriptions.js     CRUD /api/subscriptions
        locations.js         CRUD /api/locations
        audit.js             GET  /api/audit
        flags.js             GET/PATCH /api/flags
        metatags.js          CRUD /api/metatags
        integrations.js      CRUD /api/integrations
        compliance.js        CRUD /api/compliance
        notifications.js     CRUD /api/notifications/templates
        assets.js            GET  /api/assets (read-only)
  
  css/main.css               Design system dark premium
  js/
    config.js                API base URL + fetch wrappers
    sidebar.js               Sidebar component compartilhado
    auth.js                  (legado — não usado)
  
  index.html                 Login → JWT real
  dashboard.html             Overview com stats do DB
  tenants.html               Gestão de tenants
  users.html                 Gestão de usuários
  subscriptions.html         Planos e assinaturas
  locations.html             Multi-location
  metatags.html              Categorias e tags
  integrations.html          APIs externas (AI, email…)
  notifications.html         Templates e histórico
  compliance.html            LGPD, Termos, Privacidade
  api-docs.html              Documentação da API
  audit.html                 Log de auditoria
  system.html                Feature flags e config
  billing.html               MRR e faturas
```

## Comandos úteis

```bash
npm run db:studio    # Visualizar banco no Prisma Studio
npm run db:reset     # Resetar banco (cuidado!)
```
