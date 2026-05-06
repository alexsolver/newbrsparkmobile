# Plano de Correcao de Bugs - 2026-04-15

## Escopo da varredura
- Codigo varrido: app mobile (`app/`, `src/`), admin web (`admin-panel/js`), backend (`admin-panel/backend/src`).
- Total de arquivos no repo: ~775.
- Checks executados:
  - `npx tsc --noEmit`
  - `npm run i18n:check`
  - `find admin-panel/backend/src -name '*.js' | xargs node --check`
  - `find admin-panel/js -name '*.js' | xargs node --check`
  - Smoke HTTP no backend em execucao (`/api/config`, `/api/providers`).

## Bugs identificados (ordenados por severidade)

### 1) [Critico] SyntaxError no Form Builder (admin nao carrega)
- Arquivo: `admin-panel/js/checklists-builder.js:37` e `admin-panel/js/checklists-builder.js:41`
- Evidencia:
  - `node --check admin-panel/js/checklists-builder.js`
  - Erro: `Identifier 'MAX_VISION_SIMNAO_QUESTIONS' has already been declared`
- Impacto:
  - Quebra de parsing JS no carregamento do builder de checklists.
  - Funcionalidade de criacao/edicao de formularios pode ficar indisponivel no admin.
- Causa provavel:
  - Declaracao duplicada da constante apos merge/manual edit.
- Correcao proposta:
  - Remover a declaracao duplicada e manter apenas 1 definicao da constante.

### 2) [Critico] Import invalido de keep-awake no app (build/typecheck quebrado)
- Arquivo: `app/checklist/LiveRouteMapCard.tsx:30` (uso em `:1776` e `:1837`)
- Evidencia:
  - `npx tsc --noEmit`
  - Erro: `expo-keep-awake has no exported member 'KeepAwake'`
- Impacto:
  - Pipeline TS falha; risco de quebra em runtime dependendo do bundling.
- Causa provavel:
  - API atual do pacote expo-keep-awake expoe `useKeepAwake`/funcoes async, nao componente `KeepAwake`.
- Correcao proposta:
  - Trocar para `useKeepAwake()` condicionado ao estado de visibilidade/transito (ou `activateKeepAwakeAsync`/`deactivateKeepAwake`).

### 3) [Alta] Fluxo de validacao de visao com nulabilidade incorreta
- Arquivo: `app/checklist/[id].tsx:1504`
- Evidencia:
  - `npx tsc --noEmit`
  - Erro: `Record<string, any> | null` nao atribuivel para `Record<string, any>`
- Impacto:
  - Build TS bloqueado.
  - Risco de erro de runtime se funcao for chamada com objeto nulo em alteracoes futuras.
- Causa provavel:
  - `parseVisionChecklistStored` pode retornar `null`, mas `visionStoredHasRunnableMedia` exige objeto nao nulo.
- Correcao proposta:
  - Ajustar guarda local (`if (!o) return null`) antes de chamar `visionStoredHasRunnableMedia`.
  - Alternativa robusta: transformar `isVisionPendingAnalysisRecord` em type guard TS.

### 4) [Alta] Backend mascara falha do CMS de diretorio com HTTP 200 vazio
- Arquivo: `admin-panel/backend/src/index.js:302-307`
- Evidencia:
  - `GET /api/providers` retornando:
    - Status `200`
    - Header `X-Aria-Directory-Source: laravel-error`
    - Body vazio (`data: []`) quando CMS falha (`fetch failed` em log).
- Impacto:
  - Falhas de integracao parecem "sem dados" para o app.
  - Operacao degradada sem sinalizacao de erro para UX/fallback adequados.
- Causa provavel:
  - Tratamento atual retorna payload vazio em vez de status de erro quando CMS indisponivel e fallback PG desabilitado.
- Correcao proposta:
  - Retornar `502` (ou `503`) com payload de erro padronizado quando source for `laravel-error` sem fallback.

### 5) [Alta] App nao aciona fallback local quando diretorio falha no backend
- Arquivo: `src/services/api.ts:83-109`
- Evidencia:
  - `ProviderService.search()` so usa cache local em `catch` (falha de rede/HTTP nao-ok).
  - Com bug #4, backend responde `200` + lista vazia, entao `catch` nao dispara.
- Impacto:
  - Lista de prestadores fica vazia mesmo havendo cache local util.
- Causa provavel:
  - Logica de fallback baseada apenas em excecao/`!res.ok`, sem considerar header de erro de origem.
- Correcao proposta:
  - Tratar `X-Aria-Directory-Source=laravel-error` como erro logico para disparar fallback local.
  - Opcional: fallback quando `data=[]` + `source=laravel-error` na primeira pagina.

## Plano de execucao da correcao (priorizado)

### Fase 0 - Hotfix de indisponibilidade (mesmo dia)
1. Corrigir declaracao duplicada em `admin-panel/js/checklists-builder.js`.
2. Corrigir integracao de keep-awake em `app/checklist/LiveRouteMapCard.tsx`.
3. Corrigir nulabilidade em `app/checklist/[id].tsx`.
4. Validar com `npx tsc --noEmit` e `node --check admin-panel/js/checklists-builder.js`.

### Fase 1 - Robustez de diretorio (1-2 dias)
1. Backend: alterar `/api/providers` para retornar erro HTTP apropriado quando CMS indisponivel e sem fallback PG.
2. Mobile: interpretar `X-Aria-Directory-Source` e cair para cache local quando houver erro de origem.
3. Adicionar logs estruturados para distinguir "sem dados reais" de "erro upstream".

### Fase 2 - Testes de regressao (1 dia)
1. Teste backend para `/api/providers` em 3 cenarios:
   - CMS ok
   - CMS indisponivel sem fallback
   - CMS indisponivel com fallback PG
2. Teste mobile de `ProviderService.search()` validando fallback local em erro de origem.
3. Smoke em ambiente dev com CMS desligado e ligado.

### Fase 3 - Hardening (opcional, 1 dia)
1. Padronizar contrato de erro de diretorio (codigo, source, message).
2. Instrumentar metrica/alerta para taxa de `laravel-error`.

## Checklist de validacao final
- [x] `npx tsc --noEmit` sem erros (verificado 2026-04-28).
- [x] `node --check admin-panel/js/checklists-builder.js` sem erros — duplicata `MAX_VISION_SIMNAO_QUESTIONS` corrigida no código actual.
- [x] `/api/providers` não retorna **200** vazio quando CMS falha sem fallback — resposta **503** + `X-Aria-Directory-Source: laravel-error` + `error: CMS_DIRECTORY_UNAVAILABLE` (`admin-panel/backend/src/index.js`).
- [x] App mobile: `ProviderService.search` usa cache local em `!res.ok` **e** se `res.ok` mas header `X-Aria-Directory-Source` ∈ `{ laravel-error, cms-not-configured }` (`src/services/api.ts`, 2026-04-28).
- [ ] Testes automatizados da Fase 2 do plano (cenários CMS ok / indisponível / fallback PG) — pendente.
