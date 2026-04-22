/**
 * Intro de apresentação (antes do login): mostrado sempre que não há sessão,
 * até o utilizador sair do ecrã (uma vez por «visita» como convidado).
 * Reposto em `logout` para voltar a mostrar após terminar sessão.
 */
let appIntroDismissedForGuestSession = false;

export function isAppIntroDismissedForGuestSession(): boolean {
  return appIntroDismissedForGuestSession;
}

export function markAppIntroDismissedForGuestSession(): void {
  appIntroDismissedForGuestSession = true;
}

/** Chamado no logout (e pode ser usado em testes). */
export function resetAppIntroGuestSession(): void {
  appIntroDismissedForGuestSession = false;
}
