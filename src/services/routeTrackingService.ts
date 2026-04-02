/**
 * routeTrackingService — Opção D
 * Continuous GPS watch for route tracking. No external EventEmitter dependency.
 */
import * as Location from 'expo-location';

export type RouteEvent = 'ROUTE_ON_TRACK' | 'ROUTE_DEVIATION' | 'ROUTE_COMPLETED';

export interface RouteUpdate {
  event: RouteEvent;
  distanceFromRoute: number;
  progressPercent: number;
  currentLat: number;
  currentLng: number;
  closestPointIndex: number;
}

type Listener = (data: any) => void;

const DEFAULT_DEVIATION_M = 100;
const COMPLETE_THRESHOLD  = 0.95;

class RouteTrackingService {
  private subscription: Location.LocationSubscription | null = null;
  private route: number[][] = [];
  private _active = false;
  private _paused = false;
  private listeners: Map<string, Set<Listener>> = new Map();

  private traversedPath: number[][] = [];

  // ── Simple event emitter ─────────────────────────────────────
  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }
  off(event: string, fn: Listener) {
    this.listeners.get(event)?.delete(fn);
  }
  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(fn => fn(data));
  }

  // ── Geo helpers ──────────────────────────────────────────────
  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
    const a = Math.sin(toRad(lat2-lat1)/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(toRad(lng2-lng1)/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  private distanceToRoute(lat: number, lng: number): { dist: number; idx: number } {
    if (!this.route || this.route.length < 2) return { dist: 0, idx: 0 };
    let minDist = Infinity, closestIdx = 0;
    for (let i = 0; i < this.route.length - 1; i++) {
      const [aL, aG] = this.route[i], [bL, bG] = this.route[i+1];
      const dx = bG-aG, dy = bL-aL, len2 = dx*dx+dy*dy;
      let t = len2 > 0 ? ((lng-aG)*dx+(lat-aL)*dy)/len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const d = this.haversine(lat, lng, aL+t*dy, aG+t*dx);
      if (d < minDist) { minDist = d; closestIdx = i; }
    }
    return { dist: minDist, idx: closestIdx };
  }

  private deviationThreshold = DEFAULT_DEVIATION_M;

  // ── Public API ───────────────────────────────────────────────
  async start(routeCoords: number[][], deviationThresholdMeters = DEFAULT_DEVIATION_M) {
    if (this._active) await this.stop();
    this.route = routeCoords;
    this.traversedPath = [];
    this.deviationThreshold = deviationThresholdMeters;
    this._active = true;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { console.warn('[RouteTracking] GPS denied'); return; }

    try {
        const initLoc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        this.traversedPath.push([initLoc.coords.latitude, initLoc.coords.longitude]);
    } catch(e) {}

    this.subscription = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (loc) => {
        if (!this._active || this._paused) return;
        const { latitude: lat, longitude: lng } = loc.coords;
        const { dist, idx } = this.distanceToRoute(lat, lng);
        const progressPercent = Math.round((idx / Math.max(this.route.length - 1, 1)) * 100);

        this.traversedPath.push([lat, lng]);

        let event: RouteEvent =
          progressPercent >= COMPLETE_THRESHOLD * 100 ? 'ROUTE_COMPLETED' :
          dist > this.deviationThreshold ? 'ROUTE_DEVIATION' : 'ROUTE_ON_TRACK';

        const update: RouteUpdate = {
          event, distanceFromRoute: Math.round(dist),
          progressPercent, currentLat: lat, currentLng: lng,
          closestPointIndex: idx,
        };

        this.emit(event, update);
        this.emit('update', update);
        this.emit('traversed_update', this.traversedPath);
      }
    );
  }

  async stop() {
    this._active = false;
    this.subscription?.remove();
    this.subscription = null;
    this.route = [];
  }

  pause() {
    this._paused = true;
    this.emit('status_changed', { status: 'PAUSED' });
  }

  resume() {
    this._paused = false;
    this.emit('status_changed', { status: 'ACTIVE' });
  }

  isActive() { return this._active; }
  isPaused() { return this._paused; }
  getTraversedPath() { return [...this.traversedPath]; }
  getRouteLength() { return this.route.length; }
}

export const routeTracker = new RouteTrackingService();
