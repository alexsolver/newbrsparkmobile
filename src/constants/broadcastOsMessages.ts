/**
 * Concorrência (despacho a vários prestadores): quando outro já aceitou primeiro.
 * Textos traduzidos (i18n) alinhados à mensagem devolvida pela API (CLAIM_LOST).
 */
import i18n from '../i18n';

export function getBroadcastOsUnavailableTitle(): string {
  return i18n.t('appAlerts.broadcast.osUnavailableTitle');
}

export function getBroadcastOsUnavailableSubtitle(): string {
  return i18n.t('appAlerts.broadcast.osUnavailableSubtitle');
}
