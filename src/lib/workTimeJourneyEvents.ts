import { DeviceEventEmitter } from 'react-native';

/** Emitido quando a fila de ponto ou as batidas no servidor mudam — a tab bar atualiza aura/fase. */
export const WORK_TIME_JOURNEY_CHANGED = 'aria_work_time_journey_changed';

export function emitWorkTimeJourneyChanged(): void {
  DeviceEventEmitter.emit(WORK_TIME_JOURNEY_CHANGED);
}
