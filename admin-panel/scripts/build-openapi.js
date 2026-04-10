'use strict';
/**
 * Gera admin-panel/openapi.json a partir da lista de rotas do backend Express.
 * Ao adicionar rotas em admin-panel/backend/src/index.js ou em routes/*.js,
 * atualize esta lista e execute: node admin-panel/scripts/build-openapi.js
 */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'openapi.json');

const bearerAdmin = [{ bearerAdmin: [] }];
const bearerApp = [{ bearerApp: [] }];

const defaultResponses = {
  200: { description: 'Sucesso' },
  400: { description: 'Requisição inválida', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  401: { description: 'Não autorizado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  403: { description: 'Proibido', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  404: { description: 'Não encontrado', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
  500: { description: 'Erro interno', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
};

function op(summary, tags, security, extra = {}) {
  return {
    summary,
    tags,
    security: security === false ? [] : security,
    responses: { ...defaultResponses, ...(extra.responses || {}) },
    ...extra,
  };
}

/** @type {Array<[string, string, Record<string, unknown>]>} */
const ROUTES = [
  ['get', '/health', op('Health check do servidor (fora de /api)', ['Infraestrutura'], false)],

  // ── Admin auth (montado em /api/auth)
  ['post', '/api/auth/login', op('Login do painel administrativo', ['Admin — Autenticação'], false, {
    requestBody: {
      required: true,
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/AdminLoginBody' },
        },
      },
    },
  })],
  ['get', '/api/auth/me', op('Perfil do admin autenticado', ['Admin — Autenticação'], bearerAdmin)],

  // ── App account (montado em /api)
  ['post', '/api/register', op('Registro de tenant + usuário (app)', ['App — Conta'], false, {
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/AppRegisterBody' } } } },
  })],
  ['post', '/api/login', op('Login do usuário do app (JWT com tenantId)', ['App — Conta'], false, {
    requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/AppLoginBody' } } } },
  })],
  ['get', '/api/me', op('Dados do usuário logado (app)', ['App — Conta'], bearerApp)],
  ['put', '/api/me', op('Atualizar perfil (app)', ['App — Conta'], bearerApp)],
  ['post', '/api/me/technician', op('Criar/atualizar perfil de técnico', ['App — Conta'], bearerApp)],

  // ── Sync core (/api/sync + authUser global no router)
  ['post', '/api/sync/push_token', op('Registrar token Expo para push', ['App — Sincronização'], bearerApp)],
  ['get', '/api/sync/assets', op('Pull de bens do tenant', ['App — Sincronização'], bearerApp)],
  ['post', '/api/sync/push', op('Push de alterações locais (delta)', ['App — Sincronização'], bearerApp)],
  ['post', '/api/sync/asset', op('Criar/atualizar um bem', ['App — Sincronização'], bearerApp)],
  ['get', '/api/sync/providers', op('Lista de prestadores (cache/sync)', ['App — Sincronização'], bearerApp)],
  ['get', '/api/sync/config', op('Configuração de sync para o app', ['App — Sincronização'], bearerApp)],
  ['get', '/api/sync/tasks', op('Tarefas/OS atribuídas ao usuário', ['App — Sincronização'], bearerApp)],

  // ── Sync módulos (mesmo prefixo /api/sync)
  ['get', '/api/sync/costs/expenses', op('Pull despesas (módulo custos)', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/costs/expenses', op('Push despesas', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/costs/recurring', op('Pull recorrentes', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/costs/recurring', op('Push recorrentes', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/costs/budgets', op('Pull orçamentos', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/costs/budgets', op('Push orçamentos', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/insurance', op('Pull apólices', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/insurance', op('Push apólices', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/maintenances', op('Pull manutenções', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/maintenances', op('Push manutenções', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/vault', op('Pull cofre', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/vault', op('Push cofre', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/media', op('Pull índice de mídia remota', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/media', op('Push índice de mídia', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/asset_docs', op('Pull documentos de bens', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/asset_docs', op('Push documentos de bens', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/stock/items', op('Pull itens de estoque', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/stock/items', op('Push itens de estoque', ['App — Módulos sync'], bearerApp)],
  ['get', '/api/sync/stock/movements', op('Pull movimentações de estoque', ['App — Módulos sync'], bearerApp)],
  ['post', '/api/sync/stock/movements', op('Push movimentações', ['App — Módulos sync'], bearerApp)],

  // ── Storage
  ['post', '/api/storage/upload', op('Upload (JSON base64: fileBase64, mimeType, name, path)', ['App — Armazenamento'], bearerApp, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/storage/config', op('Provedor de storage configurado', ['App — Armazenamento'], bearerApp)],
  ['post', '/api/storage/sync-local', op('Sincronizar arquivos locais pendentes', ['App — Armazenamento'], bearerApp)],

  // ── Shares
  ['post', '/api/shares/invite', op('Convidar compartilhamento de bem', ['App — Compartilhamentos'], bearerApp)],
  ['delete', '/api/shares/{assetId}/{sharedWithEmail}', op('Revogar compartilhamento', ['App — Compartilhamentos'], bearerApp, {
    parameters: [
      { name: 'assetId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'sharedWithEmail', in: 'path', required: true, schema: { type: 'string' } },
    ],
  })],
  ['put', '/api/shares/{assetId}/{sharedWithEmail}', op('Atualizar compartilhamento', ['App — Compartilhamentos'], bearerApp, {
    parameters: [
      { name: 'assetId', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'sharedWithEmail', in: 'path', required: true, schema: { type: 'string' } },
    ],
  })],
  ['get', '/api/shares/pending', op('Convites pendentes', ['App — Compartilhamentos'], bearerApp)],
  ['post', '/api/shares/{assetId}/accept', op('Aceitar convite', ['App — Compartilhamentos'], bearerApp, {
    parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/shares/{assetId}/reject', op('Rejeitar convite', ['App — Compartilhamentos'], bearerApp, {
    parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/shares/asset/{assetId}', op('Compartilhamentos de um bem', ['App — Compartilhamentos'], bearerApp, {
    parameters: [{ name: 'assetId', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  // ── Chat
  ['post', '/api/chat/contacts/request', op('Pedir contacto', ['App — Chat'], bearerApp)],
  ['get', '/api/chat/contacts/pending', op('Pedidos pendentes', ['App — Chat'], bearerApp)],
  ['put', '/api/chat/contacts/{id}/status', op('Atualizar estado do pedido', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/chat/contacts', op('Lista de contactos', ['App — Chat'], bearerApp)],
  ['post', '/api/chat/rooms', op('Criar sala', ['App — Chat'], bearerApp)],
  ['put', '/api/chat/rooms/{roomId}/members', op('Atualizar membros da sala', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/chat/rooms', op('Listar salas', ['App — Chat'], bearerApp)],
  ['get', '/api/chat/rooms/{roomId}/messaging-state', op('Estado do envio (chat técnico–cliente)', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/chat/rooms/{roomId}/messages', op('Enviar mensagem', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/chat/rooms/{roomId}/messages', op('Histórico de mensagens', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['put', '/api/chat/rooms/{roomId}/read', op('Marcar como lido', ['App — Chat'], bearerApp, {
    parameters: [{ name: 'roomId', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  // ── Barcode
  ['get', '/api/barcode/{gtin}', op('Proxy de dados de produto por GTIN', ['App — Código de barras'], bearerApp, {
    parameters: [{ name: 'gtin', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  // ── Checklists / Forms (sem auth nas rotas de templates salvo help-image)
  ['post', '/api/checklists/help-image', op('Upload de imagem para instruções (admin)', ['Admin — Formulários'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/checklists/template-folders', op('Pastas de modelos', ['Formulários & OS'], false)],
  ['post', '/api/checklists/template-folders', op('Criar pasta', ['Formulários & OS'], false)],
  ['patch', '/api/checklists/template-folders/{id}', op('Atualizar pasta', ['Formulários & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['delete', '/api/checklists/template-folders/{id}', op('Excluir pasta', ['Formulários & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['patch', '/api/checklists/templates/{id}/folder', op('Mover modelo de pasta', ['Formulários & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/checklists/templates', op('Listar modelos de formulário', ['Formulários & OS'], false)],
  ['get', '/api/checklists/templates/{id}', op('Detalhe do modelo', ['Formulários & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/checklists/templates', op('Criar modelo', ['Formulários & OS'], false, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['delete', '/api/checklists/templates/{id}', op('Excluir modelo', ['Formulários & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/checklists/executions/{taskId}', op('Execução/OS por ID (técnico)', ['App — Formulários & OS'], bearerApp, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['patch', '/api/checklists/executions/{taskId}/status', op('Atualizar estado da execução', ['App — Formulários & OS'], bearerApp, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/checklists/executions', op('Criar/submeter execução', ['App — Formulários & OS'], bearerApp, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/checklists/dispatch', op('Despacho de OS (criação de execuções)', ['Formulários & OS'], false, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  // ── Checklists IA (admin)
  ['post', '/api/checklists/ai/analyze-from-file', op('Analisar ficheiro Excel/Word/JSON (multipart: file)', ['Admin — Formulários IA'], bearerAdmin, {
    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
  })],
  ['post', '/api/checklists/ai/build-form', op('Construir formulário a partir de análise', ['Admin — Formulários IA'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/checklists/ai/draft-from-file', op('Rascunho a partir de Excel/Word/JSON', ['Admin — Formulários IA'], bearerAdmin, {
    requestBody: { content: { 'multipart/form-data': { schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } } } },
  })],
  ['post', '/api/checklists/ai/session/chat', op('Chat da sessão de construção', ['Admin — Formulários IA'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/checklists/ai/suggest-logic', op('Sugerir lógica de formulário', ['Admin — Formulários IA'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  // ── Operations (Kanban — sem adminAuth no router; uma rota usa adminAuth)
  ['get', '/api/operations/tasks', op('Lista execuções/OS (filtros: email, status, id, limit)', ['Operações & OS'], false)],
  ['get', '/api/operations/tasks/{id}/revisions/export', op('Exportar revisões', ['Operações & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/operations/tasks/{id}/revisions/{revision}', op('Uma revisão', ['Operações & OS'], false, {
    parameters: [
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      { name: 'revision', in: 'path', required: true, schema: { type: 'string' } },
    ],
  })],
  ['get', '/api/operations/tasks/{id}/revisions', op('Lista de revisões', ['Operações & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['delete', '/api/operations/tasks/{id}', op('Excluir execução', ['Operações & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/operations/tasks/{id}/reject', op('Rejeitar OS', ['Operações & OS'], false, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/operations/tasks/{id}/reopen-for-revision', op('Reabrir para revisão (admin JWT)', ['Operações & OS'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  // ── Vision
  ['post', '/api/vision/verify-face', op('Verificação facial (motor = plan.features.facialVisionProvider do tenant)', ['App — Visão / biometria'], bearerApp, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  // ── Públicos (app / web sem JWT)
  ['get', '/api/collection-policy/effective', op('Política de coleta efetiva (query: tenantId, sectorCode)', ['Público — Políticas'], false)],
  ['get', '/api/compliance/active', op('Documentos compliance ativos (query: tenantId opcional)', ['Público — Compliance'], false)],
  ['get', '/api/compliance/active/{type}', op('Documento ativo por tipo', ['Público — Compliance'], false, {
    parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/compliance/accept', op('Registar aceite LGPD/consentimento', ['Público — Compliance'], false, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/compliance/consents', op('Histórico de consentimentos (query: ownerEmail)', ['Público — Compliance'], false, {
    parameters: [{ name: 'ownerEmail', in: 'query', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/providers', op('Catálogo de prestadores (query: category, q, city, page, limit)', ['Público — Prestadores'], false)],
  ['get', '/api/config', op('Metatags, categorias, locale, OSRM base (query: tenantId, lang)', ['Público — Config app'], false)],

  // ── i18n
  ['get', '/api/i18n/entries', op('Entradas i18n (admin)', ['Admin — i18n'], bearerAdmin)],
  ['get', '/api/i18n/overrides', op('Overrides por tenant (admin)', ['Admin — i18n'], bearerAdmin)],
  ['post', '/api/i18n/update', op('Atualizar traduções (admin)', ['Admin — i18n'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/i18n/overrides', op('Criar override (admin)', ['Admin — i18n'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/i18n/locales', op('Criar locale (admin)', ['Admin — i18n'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/i18n/bundle', op('Bundle de traduções para o app', ['Público — i18n'], false)],

  // ── Telemetry
  ['post', '/api/telemetry/batch', op('Enviar lote de eventos de telemetria', ['Telemetria'], false, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/telemetry', op('Consultar eventos (query filters)', ['Telemetria'], false)],
  ['get', '/api/telemetry/run-eta', op('Forçar job de cálculo de ETA', ['Telemetria'], false)],
  ['get', '/api/telemetry/stale-reminders', op('Lembretes GPS obsoleto (JWT app)', ['App — Telemetria'], bearerApp)],

  // ── Metrics (admin mount)
  ['post', '/api/metrics/calculate/{executionId}', op('Calcular métricas de uma execução', ['Admin — Métricas'], bearerAdmin, {
    parameters: [{ name: 'executionId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/metrics', op('Listar métricas agregadas', ['Admin — Métricas'], bearerAdmin)],

  // ── Tracking (público / app conforme implementação atual)
  ['post', '/api/tracking/start/{taskId}', op('Iniciar tracking / gerar token público', ['Tracking'], false, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/tracking/end/{taskId}', op('Encerrar deslocamento', ['Tracking'], false, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/tracking/pause/{taskId}', op('Pausar tracking', ['Tracking'], false, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/tracking/resume/{taskId}', op('Retomar tracking', ['Tracking'], false, {
    parameters: [{ name: 'taskId', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/tracking/{token}', op('Estado em tempo real (link público)', ['Tracking'], false, {
    parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  // ── OSRM proxy
  ['get', '/api/osrm/route-polyline', op('Polilinha de rota (query params)', ['Público — OSRM'], false)],
  ['post', '/api/osrm/route-geometry', op('Geometria de rota', ['Público — OSRM'], false, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  // ── Admin CRUD (todos com adminAuth no mount em index.js)
  ['get', '/api/dashboard', op('Resumo do dashboard', ['Admin — Dashboard'], bearerAdmin)],
  ['get', '/api/tenants', op('Listar tenants', ['Admin — Tenants'], bearerAdmin)],
  ['get', '/api/tenants/{id}', op('Detalhe tenant', ['Admin — Tenants'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/tenants', op('Criar tenant', ['Admin — Tenants'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/tenants/{id}/status', op('Atualizar estado do tenant', ['Admin — Tenants'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['put', '/api/tenants/{id}', op('Atualizar tenant', ['Admin — Tenants'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  ['get', '/api/users', op('Listar usuários', ['Admin — Usuários'], bearerAdmin)],
  ['post', '/api/users', op('Criar usuário', ['Admin — Usuários'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/users/{id}/reset-password', op('Redefinir palavra-passe', ['Admin — Usuários'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['patch', '/api/users/{id}/toggle-active', op('Ativar/desativar', ['Admin — Usuários'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/users/{id}/disconnect', op('Invalidar sessões', ['Admin — Usuários'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/plans', op('Listar planos', ['Admin — Planos'], bearerAdmin)],
  ['post', '/api/plans', op('Criar plano', ['Admin — Planos'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['put', '/api/plans/{id}', op('Atualizar plano', ['Admin — Planos'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],

  ['get', '/api/subscriptions', op('Listar subscrições', ['Admin — Subscrições'], bearerAdmin)],
  ['post', '/api/subscriptions', op('Criar subscrição', ['Admin — Subscrições'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/subscriptions/{id}/cancel', op('Cancelar subscrição', ['Admin — Subscrições'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/assets', op('Listar bens (read-only admin)', ['Admin — Bens'], bearerAdmin)],
  ['get', '/api/locations', op('Listar localizações', ['Admin — Localizações'], bearerAdmin)],
  ['post', '/api/locations', op('Criar localização', ['Admin — Localizações'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['put', '/api/locations/{id}', op('Atualizar localização', ['Admin — Localizações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['delete', '/api/locations/{id}', op('Excluir localização', ['Admin — Localizações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/audit', op('Logs de auditoria', ['Admin — Auditoria'], bearerAdmin)],
  ['get', '/api/flags', op('Feature flags', ['Admin — Flags'], bearerAdmin)],
  ['patch', '/api/flags/{key}', op('Atualizar flag', ['Admin — Flags'], bearerAdmin, {
    parameters: [{ name: 'key', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/metatags', op('Listar metatags', ['Admin — Metatags'], bearerAdmin)],
  ['post', '/api/metatags', op('Criar metatag', ['Admin — Metatags'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['put', '/api/metatags/{id}', op('Atualizar metatag', ['Admin — Metatags'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['delete', '/api/metatags/{id}', op('Excluir metatag', ['Admin — Metatags'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/integrations', op('Listar integrações', ['Admin — Integrações'], bearerAdmin)],
  ['post', '/api/integrations', op('Criar integração', ['Admin — Integrações'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['post', '/api/integrations/{id}/test', op('Testar integração', ['Admin — Integrações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['patch', '/api/integrations/{id}', op('Atualizar integração', ['Admin — Integrações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['delete', '/api/integrations/{id}', op('Excluir integração', ['Admin — Integrações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/compliance', op('Listar documentos (admin)', ['Admin — Compliance'], bearerAdmin)],
  ['get', '/api/compliance/{id}', op('Detalhe documento', ['Admin — Compliance'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/compliance', op('Criar documento', ['Admin — Compliance'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/compliance/{id}', op('Atualizar documento', ['Admin — Compliance'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/compliance/{id}/publish', op('Publicar documento', ['Admin — Compliance'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['delete', '/api/compliance/{id}', op('Excluir documento', ['Admin — Compliance'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['get', '/api/compliance/{type}/history', op('Histórico por tipo', ['Admin — Compliance'], bearerAdmin, {
    parameters: [{ name: 'type', in: 'path', required: true, schema: { type: 'string' } }],
  })],

  ['get', '/api/notifications/templates', op('Modelos de notificação', ['Admin — Notificações'], bearerAdmin)],
  ['post', '/api/notifications/templates', op('Criar modelo', ['Admin — Notificações'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['put', '/api/notifications/templates/{id}', op('Atualizar modelo', ['Admin — Notificações'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['get', '/api/notifications/logs', op('Logs de envio', ['Admin — Notificações'], bearerAdmin)],

  ['get', '/api/cockpit/health', op('Health do sync cockpit', ['Admin — Cockpit'], bearerAdmin)],

  ['get', '/api/collection-policy', op('Listar políticas de coleta', ['Admin — Política de coleta'], bearerAdmin)],
  ['get', '/api/collection-policy/{id}', op('Detalhe política', ['Admin — Política de coleta'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
  ['post', '/api/collection-policy', op('Criar política', ['Admin — Política de coleta'], bearerAdmin, {
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['patch', '/api/collection-policy/{id}', op('Atualizar política', ['Admin — Política de coleta'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
    requestBody: { content: { 'application/json': { schema: { type: 'object' } } } },
  })],
  ['delete', '/api/collection-policy/{id}', op('Excluir política', ['Admin — Política de coleta'], bearerAdmin, {
    parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
  })],
];

const tagNames = [...new Set(ROUTES.flatMap(([, , spec]) => spec.tags))];
const tags = tagNames.sort().map((name) => ({ name, description: '' }));

const paths = {};
for (const [method, p, spec] of ROUTES) {
  const m = method.toLowerCase();
  if (!paths[p]) paths[p] = {};
  if (paths[p][m]) {
    throw new Error(`Duplicate ${m.toUpperCase()} ${p}`);
  }
  paths[p][m] = spec;
}

const doc = {
  openapi: '3.0.3',
  info: {
    title: 'BrSpark API',
    version: '1.0.0',
    description:
      'API HTTP do BrSpark (painel admin + app móvel). Todas as rotas usam o prefixo `/api` no mesmo host que serve o painel estático (ex.: `http://localhost:3001`).\n\n' +
      '**Autenticação admin:** `POST /api/auth/login` → header `Authorization: Bearer <jwt>`. O JWT de admin **não** inclui `tenantId`.\n\n' +
      '**Autenticação app:** `POST /api/login` ou `POST /api/register` → `Authorization: Bearer <jwt>`. O JWT de usuário **deve** incluir `tenantId` e `sessionId` válidos (rotas protegidas por `authUser`).\n\n' +
      'Rotas marcadas como públicas não exigem JWT; ainda assim podem exigir query/body específicos.\n\n' +
      'Esta especificação é gerada por `admin-panel/scripts/build-openapi.js`; ao alterar rotas no backend, atualize o script e volte a executá-lo.',
  },
  servers: [
    { url: '/', description: 'Mesmo origem do painel (ex. http://localhost:3001)' },
  ],
  tags,
  paths,
  components: {
    securitySchemes: {
      bearerAdmin: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtido em POST /api/auth/login (usuário administrador do painel).',
      },
      bearerApp: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token obtido em POST /api/login ou POST /api/register (app). Requer tenantId + sessionId no payload.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: { error: { type: 'string' }, code: { type: 'string' } },
      },
      AdminLoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      AppLoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      AppRegisterBody: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
          phone: { type: 'string' },
          defaultLang: { type: 'string', example: 'pt-BR' },
          deviceId: { type: 'string' },
        },
      },
    },
  },
};

fs.writeFileSync(OUT, JSON.stringify(doc, null, 2), 'utf8');
console.log('Wrote', OUT, `(${Object.keys(paths).length} paths)`);
