/**
 * Remove prefixo literal «Formulário» (qualquer capitalização) antes do nome do modelo,
 * comum em títulos vindos do despacho ou metadata — o badge da lista deve mostrar só o nome.
 */
export function stripFormTemplateTitleLabelPrefix(title: string): string {
  return String(title ?? '')
    .trim()
    .replace(/^formulário\s*[:\-–]?\s*/iu, '')
    .trim();
}
