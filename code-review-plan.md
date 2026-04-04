# Code Review Master Plan

## Goal
Conduzir uma varredura rigorosa e estruturada em toda a infraestrutura (Mobile Frontend, Backend API e Sync Offline) para identificar e corrigir pequenos erros silenciosos, falhas de tipagem, vazamento de memória e incongruências de estado.

## Tasks

### 1. Auditoria de Sincronização e Offline-First
- [ ] Inspecionar `DataCollectionService` e `CostService` para tratar exceções silenciosas no modo offline. → Verify: Simular desconexão e checar se `AsyncStorage` / fila de mutações não trava.
- [ ] Validar conflitos de concorrência ou mutações repetidas. → Verify: Rodar envio múltiplo simultâneo e verificar se a fila deduplica as requisições.

### 2. Auditoria do Backend e Integração (Admin Panel)
- [ ] Revisar rotas de API em `/admin-panel/backend/src/routes/` contra erros de permissão e falhas sem `try/catch`. → Verify: Identificar rotas que possam retornar timeout ou crashar a porta 3001.
- [ ] Checar manipulação de webhooks e `Prisma Client` (conexões abertas não fechadas). → Verify: Checar uso indiscriminado do prisma sem await ou try/finally.

### 3. Sessão de Auth e Gerenciamento de Estado Global (Frontend)
- [ ] Revisar `useAuth.tsx` para assegurar que tokens decaídos redirecionem para Login limpando Async. → Verify: Alterar JWT fake e verificar se a sessão expira com elegância.
- [ ] Revisar telas com forte amarração em `Context` ou estados pesados, checando possíveis vazamentos de memória (ex: map views recarregando toda hora). → Verify: Navegar entre as views de mapas/gps sem lentidão na aba performance do Expo.

### 4. Interface e Acessibilidade Visual
- [ ] Corrigir qualquer problema gramatical ou ícones faltando (já substituídos em Login e Profile, verificar os outros componentes que acessam traduções locais). → Verify: Garantir que não existam logs the renderização de SVG / Emojis falhando.

### 5. Execução de Scripts de Saúde
- [ ] Executar script `lint_runner.py` sobre /src. → Verify: 0 errors de Lint (Padrões Modernos ativados).
- [ ] Executar `security_scan.py` sob as bibliotecas de token / bcript no backend. → Verify: Checagem limpa de vulnerabilidades NPM.

## Done When
- [ ] Nenhuma rota do node quebra (Backend resiliente).
- [ ] O app reage perfeitamente a perdas e ganhos de sinal sem perder form submission.
- [ ] O eslint / type compiler passam ilesos por todo o ecossistema.
