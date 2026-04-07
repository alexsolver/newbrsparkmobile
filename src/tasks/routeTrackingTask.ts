/**
 * Registo global da tarefa de localização em segundo plano (expo-task-manager).
 * Deve ser importado no arranque da app (app/_layout.tsx) antes de qualquer startLocationUpdatesAsync.
 */
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import { routeTracker, ROUTE_TRACKING_TASK_NAME } from '../services/routeTrackingService';

TaskManager.defineTask(ROUTE_TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('[RouteTracking] tarefa em segundo plano:', error);
    return;
  }
  const locations = (data as { locations?: LocationObject[] } | undefined)?.locations;
  if (!locations?.length) return;
  routeTracker.ingestLocationsFromTask(locations);
});
