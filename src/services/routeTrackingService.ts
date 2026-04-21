/**
 * routeTrackingService — GPS contínuo na rota.
 * Usa startLocationUpdatesAsync + TaskManager em builds nativos para continuar com o app em segundo plano
 * (ex.: Waze). watchPositionAsync só funciona em primeiro plano (documentação expo-location).
 */
import * as Location from 'expo-location';
import { Platform } from 'react-native';
import type { LocationObject } from 'expo-location';
import {
  computePatrolCompliance,
  type PatrolComplianceResult,
  type PatrolSample,
} from './patrolRouteMetrics';

export const ROUTE_TRACKING_TASK_NAME = 'brspark-route-tracking-v1';

export type RouteEvent = 'ROUTE_ON_TRACK' | 'ROUTE_DEVIATION' | 'ROUTE_COMPLETED';

export interface RouteUpdate {
  event: RouteEvent;
  distanceFromRoute: number;
  progressPercent: number;
  currentLat: number;
  currentLng: number;
  closestPointIndex: number;
  /** Cobertura estimada da rota de referência (patrulha), % */
  patrolCoveragePercent?: number;
  /** Velocidade do GPS (m/s), quando disponível — para rumo estável no mapa de deslocamento. */
  speedMps?: number | null;
  /** Rumo de curso do GPS (graus, 0=N); em muitos dispositivos inválido quando parado. */
  courseDeg?: number | null;
  /** Precisão horizontal declarada pelo GPS (m). */
  horizontalAccuracyM?: number | null;
}

type Listener = (data: any) => void;

const DEFAULT_DEVIATION_M = 100;
const COMPLETE_THRESHOLD = 0.95;

class RouteTrackingService {
  private subscription: Location.LocationSubscription | null = null;
  private usingBackgroundTask = false;
  private route: number[][] = [];
  private _active = false;
  private _paused = false;
  private listeners: Map<string, Set<Listener>> = new Map();

  private traversedPath: number[][] = [];
  private patrolSamples: PatrolSample[] = [];
  private maxAccuracyMForPatrol = 55;
  private lastPatrolComputeAt = 0;

  /** Comprimento total da polilinha de referência (m). */
  private totalRouteLenM = 0;
  /**
   * Arco (m) ao longo da polilinha até à projeção do GPS na **primeira** amostra após `start` / `rebaseline`.
   * O % mede quanto se avançou em **metros** até ao fim da linha a partir dessa base — não o índice de segmento
   * (vértices irregulares geravam ~95% sem percorrer o trajeto).
   */
  private sessionBaselineArcM: number | null = null;
  /** Maior arco (m) já atingido nesta sessão (monótono). */
  private furthestArcM = 0;
  private lastLat: number | null = null;
  private lastLng: number | null = null;
  private lastEmittedUpdate: RouteUpdate | null = null;

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
  }
  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((fn) => fn(data));
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000,
      toRad = (d: number) => (d * Math.PI) / 180;
    const a =
      Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  /** Projeção do ponto na polilinha: distância (m), arco desde o 1.º vértice (m), índice do segmento. */
  private projectToRoute(lat: number, lng: number): { distM: number; arcM: number; idx: number } {
    const poly = this.route;
    if (!poly || poly.length < 2) return { distM: Infinity, arcM: 0, idx: 0 };
    let bestDist = Infinity;
    let bestArc = 0;
    let bestIdx = 0;
    let arcBefore = 0;
    for (let i = 0; i < poly.length - 1; i++) {
      const [aL, aG] = poly[i];
      const [bL, bG] = poly[i + 1];
      const segLen = this.haversine(aL, aG, bL, bG);
      const dx = bG - aG;
      const dy = bL - aL;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const pL = aL + t * dy;
      const pG = aG + t * dx;
      const d = this.haversine(lat, lng, pL, pG);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
        bestArc = arcBefore + t * segLen;
      }
      arcBefore += segLen;
    }
    return { distM: bestDist, arcM: bestArc, idx: bestIdx };
  }

  private deviationThreshold = DEFAULT_DEVIATION_M;

  /** Chamado pelo TaskManager em segundo plano. */
  ingestLocationsFromTask(locations: LocationObject[]) {
    if (!this._active) return;
    for (const loc of locations) {
      this.applyLocationObject(loc);
    }
  }

  private applyLocationObject(loc: LocationObject) {
    if (!this._active || this._paused) return;
    const lat = loc.coords.latitude;
    const lng = loc.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const { distM: dist, arcM, idx } = this.projectToRoute(lat, lng);

    if (this.sessionBaselineArcM === null) {
      this.sessionBaselineArcM = arcM;
      this.furthestArcM = arcM;
    } else {
      this.furthestArcM = Math.max(this.furthestArcM, arcM);
    }
    const base = this.sessionBaselineArcM;
    const furthest = this.furthestArcM;
    const remaining = Math.max(this.totalRouteLenM - base, 0);
    const denom = Math.max(remaining, 1e-3);
    let progressPercent = Math.round(((furthest - base) / denom) * 100);
    progressPercent = Math.max(0, Math.min(100, progressPercent));

    this.lastLat = lat;
    this.lastLng = lng;

    this.traversedPath.push([lat, lng]);

    const acc = loc.coords.accuracy;
    const accOk =
      acc == null ||
      !Number.isFinite(acc) ||
      acc <= this.maxAccuracyMForPatrol;
    if (accOk) {
      this.patrolSamples.push({
        lat,
        lng,
        ...(Number.isFinite(acc as number) ? { accuracy: acc as number } : {}),
      });
    }

    let patrolCoveragePercent: number | undefined;
    const now = Date.now();
    if (this.route.length >= 2 && now - this.lastPatrolComputeAt > 2500) {
      this.lastPatrolComputeAt = now;
      const pc = computePatrolCompliance(this.route, this.patrolSamples, {
        toleranceM: this.deviationThreshold,
        maxAccuracyM: this.maxAccuracyMForPatrol,
      });
      patrolCoveragePercent = pc.coveragePercent;
    }

    const event: RouteEvent =
      progressPercent >= COMPLETE_THRESHOLD * 100
        ? 'ROUTE_COMPLETED'
        : dist > this.deviationThreshold
          ? 'ROUTE_DEVIATION'
          : 'ROUTE_ON_TRACK';

    const speed = loc.coords.speed;
    const course = loc.coords.heading;
    const update: RouteUpdate = {
      event,
      distanceFromRoute: Math.round(dist),
      progressPercent,
      currentLat: lat,
      currentLng: lng,
      closestPointIndex: idx,
      ...(patrolCoveragePercent !== undefined ? { patrolCoveragePercent } : {}),
      speedMps:
        typeof speed === 'number' && Number.isFinite(speed) && speed >= 0 ? speed : null,
      courseDeg:
        typeof course === 'number' && Number.isFinite(course) && course >= 0 && course <= 360
          ? course
          : null,
      horizontalAccuracyM:
        typeof acc === 'number' && Number.isFinite(acc) && acc >= 0 ? acc : null,
    };

    this.lastEmittedUpdate = update;

    this.emit(event, update);
    this.emit('update', update);
    this.emit('traversed_update', this.traversedPath);
  }

  async start(
    routeCoords: number[][],
    deviationThresholdMeters = DEFAULT_DEVIATION_M,
    opts?: { maxAccuracyM?: number }
  ) {
    if (this._active) await this.stop();

    this.route = routeCoords;
    let totLen = 0;
    for (let i = 0; i < this.route.length - 1; i++) {
      totLen += this.haversine(
        this.route[i][0],
        this.route[i][1],
        this.route[i + 1][0],
        this.route[i + 1][1],
      );
    }
    this.totalRouteLenM = totLen;
    this.traversedPath = [];
    this.patrolSamples = [];
    this.lastPatrolComputeAt = 0;
    this.sessionBaselineArcM = null;
    this.furthestArcM = 0;
    this.lastLat = null;
    this.lastLng = null;
    this.lastEmittedUpdate = null;
    this.maxAccuracyMForPatrol =
      opts?.maxAccuracyM != null && Number.isFinite(opts.maxAccuracyM) ? opts.maxAccuracyM : 55;
    this.deviationThreshold = deviationThresholdMeters;
    this.usingBackgroundTask = false;

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.warn('[RouteTracking] permissão de localização negada');
      return;
    }

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      console.warn(
        '[RouteTracking] Sem permissão "sempre" / segundo plano — ao abrir outra app (Waze) o GPS pode parar. Conceda localização em segundo plano nas configurações.'
      );
    }

    try {
      const initLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const ila = initLoc.coords.latitude;
      const ilg = initLoc.coords.longitude;
      this.traversedPath.push([ila, ilg]);
      const iacc = initLoc.coords.accuracy;
      if (
        iacc == null ||
        !Number.isFinite(iacc) ||
        iacc <= this.maxAccuracyMForPatrol
      ) {
        this.patrolSamples.push({
          lat: ila,
          lng: ilg,
          ...(Number.isFinite(iacc as number) ? { accuracy: iacc as number } : {}),
        });
      }
    } catch {
      /* ignore */
    }

    this._active = true;

    const watchFallback = async () => {
      try {
        this.subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 2500, distanceInterval: 7 },
          (loc) => this.applyLocationObject(loc)
        );
        this.usingBackgroundTask = false;
      } catch (e) {
        console.warn('[RouteTracking] watchPositionAsync falhou:', e);
        this._active = false;
      }
    };

    if (Platform.OS === 'web') {
      await watchFallback();
      return;
    }

    const taskOptions: Location.LocationTaskOptions = {
      accuracy: Location.Accuracy.High,
      timeInterval: 2500,
      distanceInterval: 8,
      activityType: Location.ActivityType.AutomotiveNavigation,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    };

    if (Platform.OS === 'android') {
      taskOptions.foregroundService = {
        notificationTitle: 'Deslocamento em andamento',
        notificationBody: 'A BrSpark está a registar a sua rota. Toque para voltar à app.',
        notificationColor: '#EA580C',
      };
    }

    try {
      await Location.startLocationUpdatesAsync(ROUTE_TRACKING_TASK_NAME, taskOptions);
      this.usingBackgroundTask = true;
    } catch (e) {
      console.warn('[RouteTracking] startLocationUpdatesAsync indisponível, modo só primeiro plano:', e);
      await watchFallback();
    }
  }

  async stop() {
    this._active = false;
    this._paused = false;
    this.subscription?.remove();
    this.subscription = null;

    if (this.usingBackgroundTask && Platform.OS !== 'web') {
      try {
        const running = await Location.hasStartedLocationUpdatesAsync(ROUTE_TRACKING_TASK_NAME);
        if (running) {
          await Location.stopLocationUpdatesAsync(ROUTE_TRACKING_TASK_NAME);
        }
      } catch (e) {
        console.warn('[RouteTracking] stopLocationUpdatesAsync:', e);
      }
    }
    this.usingBackgroundTask = false;
    this.route = [];
    this.patrolSamples = [];
    this.totalRouteLenM = 0;
    this.sessionBaselineArcM = null;
    this.furthestArcM = 0;
    this.lastLat = null;
    this.lastLng = null;
    this.lastEmittedUpdate = null;
  }

  pause() {
    this._paused = true;
    this.emit('status_changed', { status: 'PAUSED' });
  }

  resume() {
    this._paused = false;
    this.emit('status_changed', { status: 'ACTIVE' });
  }

  /**
   * Redefine a linha de base do % (ex.: ao tocar «Iniciar deslocamento»).
   * Emite já um `update` com 0% para a UI não ficar com o valor antigo até ao próximo fix GPS.
   * Passe `overrideLat`/`overrideLng` quando acabou de obter o fix do SAIDA (mais fiável que o último ponto do tracker).
   */
  rebaselineSessionProgress(overrideLat?: number, overrideLng?: number) {
    if (!this._active) return;
    this.sessionBaselineArcM = null;
    this.furthestArcM = 0;

    const lat =
      overrideLat != null && Number.isFinite(overrideLat) ? overrideLat : this.lastLat;
    const lng =
      overrideLng != null && Number.isFinite(overrideLng) ? overrideLng : this.lastLng;

    if (lat != null && lng != null && this.route.length >= 2) {
      const { distM, arcM, idx } = this.projectToRoute(lat, lng);
      this.sessionBaselineArcM = arcM;
      this.furthestArcM = arcM;
      this.lastLat = lat;
      this.lastLng = lng;
      const prev = this.lastEmittedUpdate;
      const event: RouteEvent = distM > this.deviationThreshold ? 'ROUTE_DEVIATION' : 'ROUTE_ON_TRACK';
      const update: RouteUpdate = {
        event,
        distanceFromRoute: Math.round(distM),
        progressPercent: 0,
        currentLat: lat,
        currentLng: lng,
        closestPointIndex: idx,
        speedMps: prev?.speedMps ?? null,
        courseDeg: prev?.courseDeg ?? null,
        horizontalAccuracyM: prev?.horizontalAccuracyM ?? null,
        ...(prev?.patrolCoveragePercent != null ? { patrolCoveragePercent: prev.patrolCoveragePercent } : {}),
      };
      this.lastEmittedUpdate = update;
      this.emit(event, update);
      this.emit('update', update);
    }
  }

  isActive() {
    return this._active;
  }
  isPaused() {
    return this._paused;
  }
  getTraversedPath() {
    return [...this.traversedPath];
  }
  getRouteLength() {
    return this.route.length;
  }

  getPatrolSamples(): PatrolSample[] {
    return [...this.patrolSamples];
  }

  /** Relatório de patrulha (OS tipo rota) antes de `stop()`. */
  getPatrolComplianceSnapshot(
    reference: number[][],
    toleranceM: number
  ): PatrolComplianceResult | null {
    if (!reference || reference.length < 2) return null;
    return computePatrolCompliance(reference, this.patrolSamples, {
      toleranceM,
      maxAccuracyM: this.maxAccuracyMForPatrol,
    });
  }
}

export const routeTracker = new RouteTrackingService();
