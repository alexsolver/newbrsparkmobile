/** IDs alinhados ao servidor (Expo Push `categoryId`) e às ações registadas no dispositivo. */
export const PUSH_CATEGORY_TECH_ACTIVITY = 'ARIA_TECH_ACTIVITY';
export const PUSH_CATEGORY_CLIENT_TRACKING = 'ARIA_CLIENT_TRACKING';

export const TECH_PUSH_ACTION_ACCEPT = 'TECH_ACCEPT';
export const TECH_PUSH_ACTION_REJECT = 'TECH_REJECT';
export const TECH_PUSH_ACTION_OPEN = 'TECH_OPEN';

export const CLIENT_PUSH_ACTION_TRACK = 'CLIENT_TRACK';

/** Canais Android (registados em `NotificationService.registerForPushNotificationsAsync`). */
export const ANDROID_CHANNEL_TECH = 'aria-tecnico';
export const ANDROID_CHANNEL_CLIENT = 'aria-cliente';
/** Chat do link de acompanhamento — som discreto; alerta visual suprimido em primeiro plano no handler. */
export const ANDROID_CHANNEL_TRACKING_CLIENT_CHAT = 'aria-tracking-client-chat';
