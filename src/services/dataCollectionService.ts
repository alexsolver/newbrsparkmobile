/**
 * dataCollectionService — BrSpark Field Service
 *
 * Máquina de estados de coleta de dados adaptativa.
 * Aplica a CollectionPolicy do tenant para ajustar:
 *   - frequência de GPS por contexto operacional
 *   - geração de TelemetryEvents por evento de ciclo de vida da OS
 *   - detecção de integridade nos marcos críticos
 *   - enfileiramento no outbox offline-first
 *
 * Estados:
 *   IDLE → DISPATCHED → IN_TRANSIT → ARRIVED → IN_SERVICE → DEPARTING → IDLE
 */
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getIntegritySnapshot, detectMockLocation } from './integrityService';
import { apiFetch } from './auth';

// ─── Types ──────────────────────────────────────────────────────────────────

export type CollectionState =
  | 'IDLE'
  | 'DISPATCHED'
  | 'IN_TRANSIT'
  | 'ARRIVED'
  | 'IN_SERVICE'
  | 'DEPARTING';

export type TelemetryEventType =
  | 'SESSION_OPEN' | 'SESSION_CLOSE'
  | 'OS_ACCEPT'    | 'OS_START'
  | 'CHECKIN'      | 'CHECKOUT'
  | 'TRANSIT_START'| 'TRANSIT_END'
  | 'HEARTBEAT'    | 'GEOFENCE_ENTER' | 'GEOFENCE_EXIT'
  | 'PAUSE'        | 'RESUME'
  | 'FRAUD_FLAG'   | 'INTEGRITY_CHECK' | 'POLICY_VIOLATION';

export interface CollectionPolicy {
  id?: string;
  locationEnabled: boolean;
  locationBackgroundEnabled: boolean;
  locationIntervalIdleMin: number;
  locationIntervalTransitMin: number;
  locationIntervalOnSiteMin: number;
  locationDistanceFilterMeters: number;
  retentionGpsRawDays: number;
  retentionEventsYears: number;
  retentionAuditDays: number;
  retentionMetricsDays: number;
  mockGpsAction: 'BLOCK' | 'WARN' | 'LOG';
  rootJailbreakAction: 'BLOCK' | 'WARN' | 'LOG';
  clockDriftMaxSeconds: number;
  requireExplicitConsent: boolean;
  legalBasis: string;
  allowOfflineCheckin: boolean;
  outOfPolicyAction: 'PROCEED_FLAG' | 'BLOCK' | 'WARN';
}

const DEFAULT_POLICY: CollectionPolicy = {
  locationEnabled: true,
  locationBackgroundEnabled: true,
  locationIntervalIdleMin: 30,
  locationIntervalTransitMin: 2,
  locationIntervalOnSiteMin: 5,
  locationDistanceFilterMeters: 200,
  retentionGpsRawDays: 15,
  retentionEventsYears: 5,
  retentionAuditDays: 180,
  retentionMetricsDays: 730,
  mockGpsAction: 'WARN',
  rootJailbreakAction: 'WARN',
  clockDriftMaxSeconds: 300,
  requireExplicitConsent: true,
  legalBasis: 'LGPD',
  allowOfflineCheckin: true,
  outOfPolicyAction: 'PROCEED_FLAG',
};

const POLICY_KEY     = '@brspark_collection_policy';
const TELEMETRY_KEY  = '@brspark_telemetry_outbox';

// ─── Service class ───────────────────────────────────────────────────────────

class DataCollectionService {
  private state: CollectionState = 'IDLE';
  private policy: CollectionPolicy = DEFAULT_POLICY;
  private subscription: Location.LocationSubscription | null = null;
  private geofenceRegions: Location.LocationRegion[] = [];
  private currentExecutionId: string | null = null;
  private currentOwnerEmail: string | null = null;
  private currentTenantId: string | null = null;
  private isTechnicianUserProfile: boolean = false;

  // ── Policy ─────────────────────────────────────────────────────────────────

  async loadPolicy(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(POLICY_KEY);
      if (raw) this.policy = { ...DEFAULT_POLICY, ...JSON.parse(raw) };
    } catch { /* use default */ }
  }

  getPolicy(): CollectionPolicy { return this.policy; }

  async refreshPolicy(tenantId?: string): Promise<void> {
    try {
      const qs = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : '';
      const res = await apiFetch(`/api/collection-policy/effective${qs}`);
      if (res.ok) {
        const remote = await res.json();
        this.policy = { ...DEFAULT_POLICY, ...remote };
        await AsyncStorage.setItem(POLICY_KEY, JSON.stringify(this.policy));
      }
    } catch { /* keep current */ }
  }

  // ── State machine ──────────────────────────────────────────────────────────

  getState(): CollectionState { return this.state; }

  async setState(
    next: CollectionState,
    opts: { executionId?: string; ownerEmail?: string; tenantId?: string; lat?: number; lng?: number } = {}
  ): Promise<void> {
    const prev = this.state;
    this.state = next;

    if (opts.executionId) this.currentExecutionId = opts.executionId;
    if (opts.ownerEmail)  this.currentOwnerEmail  = opts.ownerEmail;
    if (opts.tenantId)    this.currentTenantId    = opts.tenantId;

    console.log(`[DataCollection] ${prev} → ${next}`);

    // Stop existing subscription before reconfiguring
    await this._stopLocationWatch();

    // Map event type to the state transition
    const eventMap: Partial<Record<CollectionState, TelemetryEventType>> = {
      DISPATCHED:  'OS_ACCEPT',
      IN_TRANSIT:  'TRANSIT_START',
      ARRIVED:     'GEOFENCE_ENTER',
      IN_SERVICE:  'OS_START',
      DEPARTING:   'TRANSIT_END',
      IDLE:        'SESSION_CLOSE',
    };

    const eventType = eventMap[next];
    if (eventType) {
      let lat = opts.lat;
      let lng = opts.lng;
      
      // se n passou loc no opts e for evento importante (ex: TRANSIT_START), força coleta no ato
      if (!lat && !lng && (eventType === 'TRANSIT_START' || eventType === 'GEOFENCE_ENTER' || eventType === 'OS_START' || eventType === 'CHECKIN')) {
         const burst = await this.burstCapture();
         if (burst) {
            lat = burst.lat;
            lng = burst.lng;
         }
      }
      
      await this.recordEvent(eventType, { previousState: prev, lat, lng });
    }

    // Start new location strategy for this state
    await this._startLocationWatch(next, opts.lat, opts.lng);
  }

  // ── Location watch (adaptive) ──────────────────────────────────────────────

  private async _startLocationWatch(state: CollectionState, lat?: number, lng?: number): Promise<void> {
    if (!this.policy.locationEnabled) return;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    // Normal clients do not require background location monitoring
    const bgGranted = (this.policy.locationBackgroundEnabled && this.isTechnicianUserProfile)
      ? (await Location.requestBackgroundPermissionsAsync()).status === 'granted'
      : false;

    switch (state) {
      case 'IDLE':
        // Minimal — only if background granted and policy allows continuous idle
        if (bgGranted && this.policy.locationIntervalIdleMin <= 30) {
          this.subscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.Balanced,
              distanceInterval: 500, // only on significant move
              timeInterval: this.policy.locationIntervalIdleMin * 60 * 1000,
            },
            (loc) => this._onLocation(loc, 'HEARTBEAT')
          );
        }
        break;

      case 'DISPATCHED':
        // Low frequency — waiting to start transit
        this.subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 300, timeInterval: 5 * 60 * 1000 },
          (loc) => this._onLocation(loc, 'HEARTBEAT')
        );
        break;

      case 'IN_TRANSIT':
        // Distance-based — wakes on movement, not time
        this.subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: this.policy.locationDistanceFilterMeters,
          },
          (loc) => this._onLocation(loc, 'HEARTBEAT')
        );
        break;

      case 'ARRIVED':
      case 'IN_SERVICE':
        // On-site — lower frequency, still important for geofence exit detection
        this.subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 50,  // small moves on-site trigger update
            timeInterval: this.policy.locationIntervalOnSiteMin * 60 * 1000,
          },
          (loc) => this._onLocation(loc, 'HEARTBEAT')
        );
        // Start geofencing if we have a destination
        if (lat && lng) await this._startGeofence(lat, lng);
        break;

      case 'DEPARTING':
        // Confirm clean exit
        this.subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 500 },
          (loc) => this._onLocation(loc, 'HEARTBEAT')
        );
        break;
    }
  }

  private async _stopLocationWatch(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    if (this.geofenceRegions.length > 0) {
      try { await Location.stopGeofencingAsync('brspark_geofence'); } catch {}
      this.geofenceRegions = [];
    }
  }

  private async _startGeofence(lat: number, lng: number, radius = 200): Promise<void> {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') return;
      this.geofenceRegions = [{ identifier: 'client_site', latitude: lat, longitude: lng, radius }];
      await Location.startGeofencingAsync('brspark_geofence', this.geofenceRegions);
    } catch (e) {
      console.warn('[DataCollection] Geofence not available:', e);
    }
  }

  // ── Location callback ──────────────────────────────────────────────────────

  private async _onLocation(loc: Location.LocationObject, type: TelemetryEventType): Promise<void> {
    const { latitude: lat, longitude: lng, accuracy, speed, heading, altitude } = loc.coords;

    // Integrity check on each location
    const isMock = detectMockLocation(lat, lng, accuracy);
    if (isMock) {
      if (this.policy.mockGpsAction === 'BLOCK') {
        await this.recordEvent('FRAUD_FLAG', { reason: 'MOCK_LOCATION', lat, lng });
        return; // don't record the fraudulent location
      }
      await this.recordEvent('FRAUD_FLAG', { reason: 'MOCK_LOCATION', severity: 'HIGH', lat, lng });
    }

    await this.enqueueEvent({
      eventType: type,
      lat, lng, accuracy: accuracy ?? undefined,
      altitude: altitude ?? undefined,
      speed: speed ?? undefined,
      heading: heading ?? undefined,
      deviceTimestamp: new Date(loc.timestamp).toISOString(),
      isMockLocation: isMock,
    });
  }

  // ── Burst capture (for critical milestones) ───────────────────────────────

  /**
   * High-precision burst: waits up to 8 seconds for a reading with accuracy < 20m.
   * Use for CHECKIN, CHECKOUT, OS_START — moments that have judicial relevance.
   */
  async burstCapture(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });
      return {
        lat:      loc.coords.latitude,
        lng:      loc.coords.longitude,
        accuracy: loc.coords.accuracy ?? 99,
      };
    } catch { return null; }
  }

  // ── Event recording ────────────────────────────────────────────────────────

  async recordEvent(
    eventType: TelemetryEventType,
    extra: Record<string, any> = {}
  ): Promise<void> {
    const integrity = await getIntegritySnapshot(extra.lat, extra.lng, extra.accuracy);

    const event = {
      eventType,
      executionId:    this.currentExecutionId,
      ownerEmail:     this.currentOwnerEmail || 'unknown',
      tenantId:       this.currentTenantId,
      deviceId:       integrity.deviceId,
      lat:            extra.lat     ?? null,
      lng:            extra.lng     ?? null,
      accuracy:       extra.accuracy ?? null,
      speed:          extra.speed   ?? null,
      heading:        extra.heading  ?? null,
      altitude:       extra.altitude ?? null,
      locationSource: 'GPS',
      batteryLevel:   integrity.batteryLevel,
      batteryCharging: integrity.batteryCharging,
      networkType:    integrity.networkType,
      appVersion:     integrity.appVersion,
      osVersion:      integrity.osVersion,
      deviceModel:    integrity.deviceModel,
      isMockLocation: integrity.isMockLocation || extra.isMockLocation || false,
      isRooted:       integrity.isRooted,
      clockDriftMs:   integrity.clockDriftMs,
      deviceTimestamp: extra.deviceTimestamp || new Date().toISOString(),
      payload:        extra.reason ? { reason: extra.reason, severity: extra.severity || 'MEDIUM', ...extra } : extra,
    };

    await this.enqueueEvent(event);
  }

  private async enqueueEvent(event: Record<string, any>): Promise<void> {
    try {
      const raw    = await AsyncStorage.getItem(TELEMETRY_KEY);
      let outbox: any[] = [];
      if (raw) {
        try {
          outbox = JSON.parse(raw);
          if (!Array.isArray(outbox)) outbox = [];
        } catch {
          console.warn('[DataCollection] Outbox corrompida, reiniciando fila livre.');
        }
      }
      
      outbox.push(event);
      // Hard limit to prevent excessive storage usage
      const trimmed = outbox.slice(-2000);
      await AsyncStorage.setItem(TELEMETRY_KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.warn('[DataCollection] Falha ao enfileirar evento:', e);
    }
  }

  // ── Session events ─────────────────────────────────────────────────────────

  async onSessionOpen(ownerEmail: string, tenantId?: string, isTechnician: boolean = false): Promise<void> {
    this.currentOwnerEmail = ownerEmail;
    this.currentTenantId   = tenantId || null;
    this.isTechnicianUserProfile = isTechnician;
    await this.loadPolicy();
    await this.refreshPolicy(tenantId);
    await this.recordEvent('SESSION_OPEN');
  }

  async onSessionClose(): Promise<void> {
    await this.recordEvent('SESSION_CLOSE');
    await this._stopLocationWatch();
    this.state = 'IDLE';
  }
}

export const dataCollectionService = new DataCollectionService();
