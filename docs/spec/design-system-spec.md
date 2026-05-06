# Aria — especificação de design system (spec-driven)

Documento normativo para **novas telas**, **refactors de UI** e **paridade app ↔ admin**. Agentes e devs devem consultar isto antes de introduzir cores ou componentes ad‑hoc.

## Fonte única de cor

- **React Native**: [`src/theme/colors.ts`](../../src/theme/colors.ts) + `useTheme()` de [`src/theme/ThemeContext.tsx`](../../src/theme/ThemeContext.tsx).
- **Não** usar hex solto em código novo (exceções: assets, mapas/SDKs de terceiros, previews de PDF quando inevitável).
- Mapas compartilhados: `MEDIA_TAG_COLORS`, `SERVICE_CATEGORY_COLORS`, `MODE_SEGMENT_COLORS` (exportados do mesmo arquivo).

## Idioma (pt-BR)

Todo **texto visível** no app mobile, no painel admin e em **mensagens de API** devolvidas ao usuário final deve seguir **português do Brasil** (vocabulário e ortografia), **não** português de Portugal.

Evitar, entre outros: *equipa* → **equipe**; *ficheiro* → **arquivo**; *utilizador* → **usuário**; *secção* → **seção**; *acção* → **ação**; *registo/registado* → **registro/registrado**; *planeado* → **planejado**; *rastreio* → **rastreamento**; *contactar* → **contatar**; *guardar* (salvar dados) → **salvar**; *eliminar* (UI) → **excluir**; *partilhar* → **compartilhar**; *telemóvel* → **celular**; *definições* → **configurações**; *câmara* → **câmera**; *aceites* (substantivo administrativo) → **aceitas** ou **aceitações** conforme o contexto.

A regra do Cursor em `.cursor/rules/language-pt-br.mdc` reforça o mesmo para respostas de agentes e novos textos.

### Traduções e cópias em código (`*-i18n.js`, JSON de locale, HTML estático)

- A chave **`pt-BR`** em dicionários do painel (ex.: `admin-panel/js/checklists-i18n.js`, `user-pages-i18n.js`) e strings visíveis em **HTML** do admin devem usar **sempre** vocabulário e ortografia **brasileiros**, alinhados ao glossário desta secção.
- **Não** copiar blocos de `pt-PT` nem de produtos europeus: erros típicos são *guardar* (persistir) em vez de **salvar**, *ficheiro* em vez de **arquivo**, *secção* em vez de **seção**, *eliminar* (UI) em vez de **excluir**, *actual* em vez de **atual**.
- Em revisão de PR: se o locale é `pt-BR`, conferir mentalmente os pares do glossário nos arquivos alterados.

## Semântica de estado

Usar `colors.status.{success|warning|danger|info}` com `{ fg, bg, border }` para badges, alertas e chips de estado. Os tokens legacy `success` / `warning` (background/text) mantêm-se por compatibilidade; preferir `status.*` em código novo.

## Layout e tipografia

- Espaços: [`src/theme/layout.ts`](../../src/theme/layout.ts) — `space` 8/12/16/24, `radius` 8/12/16, `fontSize` 12/14/16/18, pesos 500/700/900.
- Botões primários: componente [`src/components/Button.tsx`](../../src/components/Button.tsx) — altura mínima **48**, raio **12**.
- Chips / filtros: [`src/components/Chip.tsx`](../../src/components/Chip.tsx) — texto mínimo **12px**.
- Switches: [`src/components/ThemedSwitch.tsx`](../../src/components/ThemedSwitch.tsx) (derivados de `colors.switch`).

## Ícones

- Preferir **Ionicons** nos tamanhos **20** ou **24** em UI padrão; evitar misturar famílias na mesma barra sem motivo.

## Admin (web)

- Variáveis geradas: [`admin-panel/css/aria-tokens.css`](../../admin-panel/css/aria-tokens.css) (gerar com `npm run theme:export-css` após alterar `webCssVariableMap` em `colors.ts`).
- [`admin-panel/css/main.css`](../../admin-panel/css/main.css) importa `aria-tokens.css`. Preferir `var(--color-…)` a hex em páginas novas ou refactors (ex.: `reports.html`).

### Anatomia das páginas HTML do painel (shell canônico)

Todas as telas internas autenticadas devem seguir o mesmo esqueleto que [`admin-panel/users.html`](../../admin-panel/users.html) (e equivalentes já migrados):

1. `div.admin-layout` → `div.main-content`
2. `div.topbar.topbar--data` com `nav.topbar-breadcrumb` (trilha em pt-BR)
3. `div.page-body`
4. `header.page-hero` → `h1.page-hero-title` + `p.page-hero-sub`
5. **Conteúdo de trabalho** dentro de `section.data-shell` (pode haver mais de uma seção). Listagens: `div.data-toolbar` + `table.table-data` + `div.pagination-pro` quando aplicável. Blocos só leitura ou formulários densos: `div.data-shell-body` opcional.

**Exceções explícitas:** `index.html` (login), `track.html` (mapa visita), `evaluation-survey.html` (formulário público) — mesma marca e tokens onde couber, sem obrigar sidebar nem o mesmo fluxo de scroll do painel.

## Checklist de PR (UI)

1. Substituí hex por tokens ou mapas exportados?
2. Testei **modo claro e escuro** nas áreas tocadas?
3. Texto secundário tem contraste aceitável (meta WCAG AA)?
4. Se alterei paleta: corri `npm run theme:export-css` e commit do CSS gerado?

## Changelog do spec

| Data       | Notas |
|------------|--------|
| 2026-04-08 | Versão inicial: tokens semânticos, Button/Chip/ThemedSwitch, CSS export, legenda de tags de mídia. |
| 2026-04-09 | Idioma (pt-BR): norma e glossário para cópias; alinhamento com regras do Cursor. |
| 2026-04-14 | Admin HTML: anatomia do shell canônico (`page-hero` + `data-shell`) e exceções. |
| 2026-04-14 | Fase C: `reports.html`, `checklists.html` e `cockpit.html` alinhados ao esqueleto; cockpit mantém tema NOC com classes `cockpit-*` nos tokens locais. |
| 2026-04-14 | Fase D: `index.html` (cópia login), `track.html` e `evaluation-survey.html` com `aria-tokens.css` onde aplicável; contraste da trilha no `cockpit.html`. |
| 2026-04-14 | Fase E: `checklists.html` — estilos locais do builder (toolbox/canvas/estados vazios) alinhados a variáveis de `aria-tokens.css` (neutros e destrutivo); mantêm-se hex de acento (índigo/violeta do copiloto) até export de tokens dedicados. |
| 2026-04-15 | Idioma (pt-BR): subsecção explícita para `*-i18n.js` / HTML estático — evitar cópias em português de Portugal na chave `pt-BR`. |
