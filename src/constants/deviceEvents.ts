/** Emitido após `pullTasks` gravar o cache FT/RT (ofertas broadcast podem atualizar fora do dashboard). */
export const ARIA_CLOUD_TASKS_UPDATED = 'ARIA_CLOUD_TASKS_UPDATED';

/** Conclusão de checklist gravada localmente — o dashboard actualiza abas antes do próximo `loadData`. */
export const ARIA_PROVIDER_TASK_COMPLETED_LOCALLY = 'ARIA_PROVIDER_TASK_COMPLETED_LOCALLY';

export type AriaProviderTaskCompletedPayload = {
  taskId: string;
  completedAt: string;
  refId?: string;
  title?: string;
};

/** Lock global de deslocamento em aberto — `taskId` null quando não há trecho aberto. */
export const ARIA_OPEN_TRANSIT_CHANGED = 'ARIA_OPEN_TRANSIT_CHANGED';

export type AriaOpenTransitPayload = {
  taskId: string | null;
};
