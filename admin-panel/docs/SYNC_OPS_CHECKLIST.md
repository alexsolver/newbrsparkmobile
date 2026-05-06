# Checklist de operações — sincronização em escala (~100k ciclos/dia)

Este documento complementa o **cockpit móvel** (`Perfil → Cockpit de sincronização`), que mostra apenas **estado local** no aparelho. Para produção em volume, a equipa de operações e backend deve cobrir o seguinte.

## 1. Observabilidade (APM / métricas)

- Taxa de pedidos por rota relevante: `POST /api/sync/push`, `GET /api/sync/tasks`, `POST /api/checklists/executions`, uploads de ficheiros.
- Latência p50 / p95 / p99 por rota e por tenant (se aplicável).
- Taxa de erros HTTP 4xx e 5xx por rota; distinguir 401/403 de validação de negócio.
- Tamanho médio e p95 do payload de `pullTasks` e de checklist POST (para detetar regressões de payload).

## 2. Alertas

- Picos de 5xx ou latência p99 acima do SLO acordado.
- Queda anómala no número de syncs bem-sucedidos (pode indicar bloqueio no cliente, rede ou API).
- Filas internas do servidor (se existirem workers) com backlog persistente.

## 3. Capacidade e testes de carga

- Estimar picos (ex.: 5–10× a média) para manhãs de expediente.
- Teste de carga nas rotas mais pesadas: `pullTasks`, checklist com mídia, `POST /api/sync/push`.
- Rever limites de conexão à base de dados e timeouts de `apiFetch` no cliente vs timeouts no balanceador.

## 4. Segurança multi-tenant

- O header `x-owner-email` (ou equivalente) deve ser **sempre** validado contra o utilizador autenticado (JWT); o cliente não é fonte de verdade.

## 5. Cliente móvel (referência)

- Coalescing de `pushSyncQueue` quando um segundo pedido chega durante um ciclo ativo.
- Lock por chave na outbox de checklist (`@aria_outbox`) durante o envio, com escritas auxiliares via `updateStoredJsonArrayWhileLockHeld` quando já sob lock.
- Registo de `LAST_SUCCESSFUL_FULL_SYNC_AT_MS_KEY` ao concluir `fullSync` (timestamp local do último ciclo completo).

## 6. O que não substitui o APM

O ecrã **Cockpit de sincronização** no app mostra contagens locais (filas, conflitos, telemetria pendente). **Não** substitui dashboards de servidor nem o painel web `cockpit.html` para visão global de produção.
