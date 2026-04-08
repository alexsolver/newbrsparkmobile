# BrSpark — especificação de design system (spec-driven)

Documento normativo para **novas telas**, **refactors de UI** e **paridade app ↔ admin**. Agentes e devs devem consultar isto antes de introduzir cores ou componentes ad‑hoc.

## Fonte única de cor

- **React Native**: [`src/theme/colors.ts`](../../src/theme/colors.ts) + `useTheme()` de [`src/theme/ThemeContext.tsx`](../../src/theme/ThemeContext.tsx).
- **Não** usar hex solto em código novo (exceções: assets, mapas/SDKs de terceiros, previews de PDF quando inevitável).
- Mapas partilhados: `MEDIA_TAG_COLORS`, `SERVICE_CATEGORY_COLORS`, `MODE_SEGMENT_COLORS` (exportados do mesmo ficheiro).

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

- Variáveis geradas: [`admin-panel/css/brspark-tokens.css`](../../admin-panel/css/brspark-tokens.css) (gerar com `npm run theme:export-css` após alterar `webCssVariableMap` em `colors.ts`).
- [`admin-panel/css/main.css`](../../admin-panel/css/main.css) importa `brspark-tokens.css`. Preferir `var(--color-…)` a hex em páginas novas ou refactors (ex.: `reports.html`).

## Checklist de PR (UI)

1. Substituí hex por tokens ou mapas exportados?
2. Testei **modo claro e escuro** nas áreas tocadas?
3. Texto secundário tem contraste aceitável (meta WCAG AA)?
4. Se alterei paleta: corri `npm run theme:export-css` e commit do CSS gerado?

## Changelog do spec

| Data       | Notas |
|------------|--------|
| 2026-04-08 | Versão inicial: tokens semânticos, Button/Chip/ThemedSwitch, CSS export, legenda de tags de mídia. |
