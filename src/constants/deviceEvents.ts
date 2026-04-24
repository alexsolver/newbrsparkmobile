/** Emitido após `pullTasks` gravar o cache FT/RT (ofertas broadcast podem atualizar fora do dashboard). */
export const BRSPARK_CLOUD_TASKS_UPDATED = 'BRSPARK_CLOUD_TASKS_UPDATED';

/** Conclusão de checklist gravada localmente — o dashboard actualiza abas antes do próximo `loadData`. */
export const BRSPARK_PROVIDER_TASK_COMPLETED_LOCALLY = 'BRSPARK_PROVIDER_TASK_COMPLETED_LOCALLY';

export type BrsparkProviderTaskCompletedPayload = {
  taskId: string;
  completedAt: string;
  refId?: string;
  title?: string;
};
