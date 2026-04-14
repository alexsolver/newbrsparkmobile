import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, Polyline } from 'react-native-maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { routeTracker, RouteUpdate } from '../../src/services/routeTrackingService';
import { Ionicons, FontAwesome5 } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../src/services/api';
import { enqueueTrackingSync } from '../../src/services/trackingSyncQueue';
import { fetchDrivingLegEtaMinutes, fetchDrivingGeometryLatLng } from '../../src/services/osrmClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../src/hooks/useAuth';
import { useResolvedAvatarUri } from '../../src/hooks/useResolvedAvatarUri';

const TRANSIT_MAP_HINTS_KEY = '@brspark_transit_map_hints_v1';

type TrackingChatRow = {
  id: string;
  role: string;
  text: string;
  at: string;
  senderLabel?: string | null;
  kind?: string | null;
};

function mapServerChatMessages(raw: unknown): TrackingChatRow[] {
  if (!Array.isArray(raw)) return [];
  const next: TrackingChatRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === 'string' ? o.id : '';
    const text = typeof o.text === 'string' ? o.text : '';
    const at = typeof o.at === 'string' ? o.at : '';
    const role = o.role === 'tech' ? 'tech' : o.role === 'system' ? 'system' : 'client';
    const senderLabel = typeof o.senderLabel === 'string' ? o.senderLabel : null;
    const kind = typeof o.kind === 'string' ? o.kind : null;
    if (!id || !text) continue;
    next.push({ id, text, at: at || new Date().toISOString(), role, senderLabel, kind });
  }
  return next;
}

/** Modal: todas as orientações usuais (tipo mutável para compatibilidade com `ModalProps`). */
const TRANSIT_MODAL_SUPPORTED_ORIENTATIONS: NonNullable<
  React.ComponentProps<typeof Modal>['supportedOrientations']
> = ['portrait', 'portrait-upside-down', 'landscape', 'landscape-left', 'landscape-right'];

/**
 * Android: `react-native-maps` usa Google Maps e precisa de API key no manifest.
 * Se o bundle Expo não tiver `android.config.googleMaps.apiKey`, o mapa nativo costuma fechar o app.
 * Neste caso usamos painel sem MapView; navegação = apps externos (Waze / Google Maps via URL).
 *
 * `EXPO_PUBLIC_FORCE_TRANSIT_SIMPLE_MAP=1` força sempre o modo simples (útil em testes).
 */
function shouldEmbedNativeTransitMap(): boolean {
  if (Platform.OS !== 'android') return true;
  if (process.env.EXPO_PUBLIC_FORCE_TRANSIT_SIMPLE_MAP === '1') return false;
  const k = (Constants.expoConfig as { android?: { config?: { googleMaps?: { apiKey?: string } } } })
    ?.android?.config?.googleMaps?.apiKey;
  return typeof k === 'string' && k.trim().length >= 20;
}

interface Props {
  route: number[][];      // [[lat,lng], ...]
  visible: boolean;       // set true when transit_start is pressed
  zoneType?: string | null;
  /** Destino explícito; pode omitir se `route` tiver pontos (o mapa usa o último vértice). */
  targetLoc?: { lat?: number | null; lng?: number | null };
  etaMinutes?: number | null;
  /** ISO do `transit_start` (campo SAÍDA) — para mostrar tempo em deslocamento quando não há ETA. */
  transitStartedAtIso?: string | null;
  onEndTransit?: () => void | Promise<void>;
  /** Enquanto o checklist corre `handleTransit` (GPS) para o fim de deslocamento. */
  endTransitLoading?: boolean;
  taskId?: string | null;
  /** OS tipo rota: tolerância (m) = `locationRadius` no despacho — corredor e métricas de patrulha. */
  corridorToleranceM?: number;
}

/** Destino OSRM: target explícito ou último vértice da rota (evita lista vazia só com polígono) */
export function pickDestinationForOsrm(
  targetLoc: Props['targetLoc'],
  route: number[][]
): { lat: number; lng: number } | null {
  const tlat = targetLoc?.lat;
  const tlng = targetLoc?.lng;
  if (
    tlat != null &&
    tlng != null &&
    Number.isFinite(Number(tlat)) &&
    Number.isFinite(Number(tlng))
  ) {
    return { lat: Number(tlat), lng: Number(tlng) };
  }
  if (Array.isArray(route) && route.length >= 1) {
    const last = route[route.length - 1];
    if (Array.isArray(last) && last.length >= 2) {
      const a = Number(last[0]);
      const b = Number(last[1]);
      if (Number.isFinite(a) && Number.isFinite(b)) return { lat: a, lng: b };
    }
  }
  return null;
}

/** Rumo em graus (0 = N, horário) de (lat1,lng1) → (lat2,lng2). */
function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Distância ao longo da polilinha desde o 1.º vértice até à projeção ortogonal do ponto (lat,lng). */
function closestPointOnPolylineArcM(
  poly: number[][],
  lat: number,
  lng: number
): { arcM: number; distM: number } {
  if (!poly || poly.length < 2) return { arcM: 0, distM: Infinity };
  let bestDist = Infinity;
  let bestArc = 0;
  let arcBefore = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [aL, aG] = poly[i];
    const [bL, bG] = poly[i + 1];
    const segLen = haversineM(aL, aG, bL, bG);
    const dx = bG - aG;
    const dy = bL - aL;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const pL = aL + t * dy;
    const pG = aG + t * dx;
    const d = haversineM(lat, lng, pL, pG);
    if (d < bestDist) {
      bestDist = d;
      bestArc = arcBefore + t * segLen;
    }
    arcBefore += segLen;
  }
  return { arcM: bestArc, distM: bestDist };
}

/** Corta a polilinha no comprimento de arco acumulado (metros): percorrido vs restante. */
function splitPolylineByArcM(poly: number[][], targetArcM: number): { covered: number[][]; remaining: number[][] } {
  if (!poly || poly.length < 2 || targetArcM <= 0) {
    return { covered: [], remaining: poly && poly.length >= 2 ? poly.map((c) => [c[0], c[1]]) : [] };
  }
  let acc = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [la, ln] = poly[i];
    const [lb, ln2] = poly[i + 1];
    const segLen = haversineM(la, ln, lb, ln2);
    if (acc + segLen >= targetArcM) {
      const t = segLen > 0 ? (targetArcM - acc) / segLen : 0;
      const tc = Math.max(0, Math.min(1, t));
      const pl = la + (lb - la) * tc;
      const pLn = ln + (ln2 - ln) * tc;
      const covered = [...poly.slice(0, i + 1).map((c) => [c[0], c[1]] as number[]), [pl, pLn]];
      const remaining: number[][] = [[pl, pLn], ...poly.slice(i + 1).map((c) => [c[0], c[1]] as number[])];
      return { covered, remaining };
    }
    acc += segLen;
  }
  const last = poly[poly.length - 1];
  return { covered: poly.map((c) => [c[0], c[1]]), remaining: [[last[0], last[1]]] };
}

/** Mapa de navegação em 2D (sem inclinação) — leitura clara das vias e menos sensação de «girar». */
const NAVIGATION_MAP_PITCH = 0;

/** Velocidade mínima (m/s) para confiar no rumo de curso do GPS. */
const MIN_SPEED_USE_COURSE_MPS = 1.15;
/** Abaixo disto consideramos «parado / muito lento» (bússola / congelar rumo). */
const STATIONARY_SPEED_MPS = 0.85;
/** Deslocamento mínimo entre amostras para usar bearing GPS (evita ruído de metros). */
const MIN_GPS_DELTA_M_FOR_BEARING = 12;
/** Se o GPS está a menos desta distância da polilinha, alinhar o rumo ao segmento (via / patrulha). */
const ROUTE_SNAP_MAX_DIST_M = 48;
/** Só usar rumo directo ao destino quando ainda está longe (m). */
const DEST_MIN_DIST_FOR_BEARING_M = 30;
/** Ignorar micro-rotações quando parado (graus). */
const HEADING_DEAD_ZONE_DEG = 12;

/**
 * Bearing do segmento da polilinha mais próximo de (lat,lng); null se o ponto estiver longe da linha.
 */
function tangentBearingNearPolyline(
  poly: number[][],
  lat: number,
  lng: number,
  maxDistM: number
): number | null {
  if (!poly || poly.length < 2) return null;
  let bestDist = Infinity;
  let bestI = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const [aL, aG] = poly[i];
    const [bL, bG] = poly[i + 1];
    const dx = bG - aG;
    const dy = bL - aL;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((lng - aG) * dx + (lat - aL) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const pL = aL + t * dy;
    const pG = aG + t * dx;
    const d = haversineM(lat, lng, pL, pG);
    if (d < bestDist) {
      bestDist = d;
      bestI = i;
    }
  }
  if (bestDist > maxDistM) return null;
  const [aL, aG] = poly[bestI];
  const [bL, bG] = poly[bestI + 1];
  return bearingDeg(aL, aG, bL, bG);
}

/**
 * Rumo para a câmera «rumo em cima»: curso GPS em movimento, tangente à rota quando colado à linha,
 * delta GPS só com deslocamento real, bússola parado, senão destino ou último rumo.
 */
function computeNavHeading(input: {
  prev: { lat: number; lng: number } | null;
  cur: { lat: number; lng: number };
  dest: { lat: number; lng: number } | null;
  fallback: number;
  speedMps: number | null | undefined;
  courseDeg: number | null | undefined;
  compassDeg: number | null | undefined;
  routePoly: number[][] | null;
}): number {
  const { prev, cur, dest, fallback, speedMps, courseDeg, compassDeg, routePoly } = input;
  const spd = typeof speedMps === 'number' && Number.isFinite(speedMps) ? speedMps : null;

  if (spd != null && spd >= MIN_SPEED_USE_COURSE_MPS && courseDeg != null) {
    return courseDeg;
  }

  if (routePoly && routePoly.length >= 2) {
    const tan = tangentBearingNearPolyline(routePoly, cur.lat, cur.lng, ROUTE_SNAP_MAX_DIST_M);
    if (tan != null) return tan;
  }

  if (prev && haversineM(prev.lat, prev.lng, cur.lat, cur.lng) >= MIN_GPS_DELTA_M_FOR_BEARING) {
    return bearingDeg(prev.lat, prev.lng, cur.lat, cur.lng);
  }

  if ((spd == null || spd < STATIONARY_SPEED_MPS) && compassDeg != null) {
    return compassDeg;
  }

  if (dest && haversineM(cur.lat, cur.lng, dest.lat, dest.lng) >= DEST_MIN_DIST_FOR_BEARING_M) {
    return bearingDeg(cur.lat, cur.lng, dest.lat, dest.lng);
  }

  return fallback;
}

/** Evita oscilar o mapa com ruído GPS quando quase parado. */
function applyDeadZoneStationary(
  current: number,
  proposed: number,
  speedMps: number | null | undefined
): number {
  const d = ((((proposed - current) % 360) + 540) % 360) - 180;
  const ad = Math.abs(d);
  const slow = speedMps == null || speedMps < STATIONARY_SPEED_MPS;
  if (slow && ad < HEADING_DEAD_ZONE_DEG) return current;
  return proposed;
}

/** Interpola rumo no círculo (menor arco) para rotações menos bruscas na câmera. */
function smoothHeadingDeg(current: number, target: number, factor: number): number {
  const d = ((((target - current) % 360) + 540) % 360) - 180;
  const next = current + d * factor;
  return ((next % 360) + 360) % 360;
}

const FOLLOW_CAMERA_MIN_MS = 900;
const FOLLOW_MOVE_THRESHOLD_M = 14;
const HEADING_SMOOTH_FACTOR = 0.22;

/** Zoom em modo navegação (rua a rua). */
const NAV_FOLLOW_ZOOM = 18;
const NAV_MIN_ACCEPTABLE_ZOOM = 14.25;

function formatElapsedSinceTransitPt(isoStart: string): string {
  const t0 = Date.parse(isoStart);
  if (!Number.isFinite(t0)) return '';
  const sec = Math.max(0, Math.floor((Date.now() - t0) / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `Em deslocamento há ${h} h${m > 0 ? ` ${m} min` : ''}`;
  if (m > 0) return `Em deslocamento há ${m} min`;
  return 'Deslocamento acabou de iniciar';
}

// ─── ETA Badge — Premium floating map overlay ─────────────────────────────────────────
function EtaBadge({
  etaMinutes,
  pct,
  hint,
  noDestination,
  transitElapsedLabel,
  isLandscape,
}: {
  etaMinutes: number | null | undefined;
  pct: number;
  hint?: string | null;
  /** Não há ponto de chegada para OSRM — não mostrar "Calculando...". */
  noDestination?: boolean;
  transitElapsedLabel?: string | null;
  isLandscape: boolean;
}) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (noDestination) return;
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.8, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [noDestination]);

  const hasNum = typeof etaMinutes === 'number' && Number.isFinite(etaMinutes);
  const waiting = !hasNum && !hint && !noDestination;
  let timeStr = 'Calculando...';
  if (hasNum) {
    const hours = Math.floor(etaMinutes as number / 60);
    const mins = (etaMinutes as number) % 60;
    timeStr = hours > 0 ? `${hours}h ${mins > 0 ? `${mins}m` : ''}`.trim() : `${etaMinutes} min`;
  } else if (noDestination) {
    timeStr = 'ETA indisponível';
  } else if (hint) {
    timeStr = hint;
  }

  return (
    <View
      style={[
        etaStyles.wrapper,
        noDestination && etaStyles.wrapperWide,
        isLandscape && etaStyles.wrapperLandscape,
      ]}
      pointerEvents="none"
    >
      <LinearGradient
        colors={['#f97316', '#ea580c']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[etaStyles.gradient, noDestination && etaStyles.gradientWide]}
      >
        {/* Top Row: live dot + label */}
        <View style={etaStyles.topRow}>
          <View style={etaStyles.dotWrapper}>
            {!noDestination ? (
              <Animated.View style={[etaStyles.pulseDot, { transform: [{ scale: pulse }] }]} />
            ) : null}
            <View style={etaStyles.dot} />
          </View>
          <Text style={etaStyles.label}>EM ROTA</Text>
          <Ionicons name="navigate" size={9} color="rgba(255,255,255,0.7)" style={{ marginLeft: 2 }} />
        </View>

        {/* Main time display */}
        <Text style={[etaStyles.time, noDestination && etaStyles.timeCompact]}>{timeStr}</Text>

        {hasNum ? <Text style={etaStyles.sub}>tempo estimado de chegada</Text> : null}
        {noDestination ? (
          <>
            <Text style={etaStyles.sub}>Sem local de atendimento definido nesta OS.</Text>
            {transitElapsedLabel ? (
              <Text style={etaStyles.subMuted}>{transitElapsedLabel}</Text>
            ) : null}
          </>
        ) : null}

        {/* Progress bar if we have route data */}
        {pct > 0 && !noDestination && (
          <View style={etaStyles.progressTrack}>
            <View style={[etaStyles.progressFill, { width: `${Math.max(pct, 5)}%` as any }]} />
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const etaStyles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 185,
    left: 16,
    zIndex: 20,
    borderRadius: 14,
    shadowColor: '#f97316',
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  wrapperWide: {
    maxWidth: 300,
    right: 16,
    left: 16,
  },
  /** Em landscape os botões ficam numa faixa baixa — sobe o cartão ETA para não encostar. */
  wrapperLandscape: {
    bottom: 92,
  },
  gradient: {
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 8,
    borderRadius: 14,
    minWidth: 112,
    maxWidth: 220,
  },
  gradientWide: {
    maxWidth: 300,
    alignSelf: 'stretch',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  dotWrapper: {
    width: 10, height: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 5,
  },
  dot: {
    width: 5, height: 5,
    borderRadius: 2.5,
    backgroundColor: '#fff',
    position: 'absolute',
  },
  pulseDot: {
    width: 8, height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    position: 'absolute',
  },
  label: {
    fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 17,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  timeCompact: {
    fontSize: 15,
    lineHeight: 19,
  },
  sub: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
    marginTop: 1,
  },
  subMuted: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    marginTop: 4,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    marginTop: 5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
});
// ─────────────────────────────────────────────────────────────────────────────

const { width, height } = Dimensions.get('window');

export default function LiveRouteMapCard({
  route,
  visible,
  zoneType,
  targetLoc,
  etaMinutes,
  transitStartedAtIso,
  onEndTransit,
  endTransitLoading = false,
  taskId,
  corridorToleranceM,
}: Props) {
  const insets = useSafeAreaInsets();
  const [windowDims, setWindowDims] = useState(() => Dimensions.get('window'));
  const [exoOrientation, setExoOrientation] = useState(ScreenOrientation.Orientation.UNKNOWN);
  const embedNativeMap = useMemo(() => shouldEmbedNativeTransitMap(), []);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowDims(window));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!visible) return;
    setWindowDims(Dimensions.get('window'));
  }, [visible]);

  const { user } = useAuth();
  const avatarUri = useResolvedAvatarUri(user);
  const mapRef = useRef<MapView>(null);
  const [update, setUpdate]           = useState<RouteUpdate | null>(null);
  const [myPos, setMyPos]             = useState<{ lat: number; lng: number } | null>(null);
  const [expanded, setExpanded]       = useState(true);
  const [coveredPath, setCoveredPath] = useState<number[][]>([]);
  const [dynamicRoute, setDynamicRoute] = useState<number[][] | null>(null);
  /** Comprimento (m) ao longo da linha de referência já "pintado" de laranja; só aumenta (pausa mantém o sítio). */
  const [routePaintArcM, setRoutePaintArcM] = useState(0);

  const [isPaused, setIsPaused] = useState(false);
  const [clientEtaMinutes, setClientEtaMinutes] = useState<number | null>(null);
  const [etaHint, setEtaHint] = useState<string | null>(null);
  /** Modo navegação: mapa segue o GPS com rumo em cima (por padrão ao abrir o deslocamento). */
  const [followUser, setFollowUser] = useState(true);
  /** Painel de dicas na primeira vez (mapa nativo). */
  const [showTransitHints, setShowTransitHints] = useState(false);

  const [trackingChatOpen, setTrackingChatOpen] = useState(false);
  const [trackingChatMessages, setTrackingChatMessages] = useState<TrackingChatRow[]>([]);
  const [trackingChatDraft, setTrackingChatDraft] = useState('');
  const [trackingChatSending, setTrackingChatSending] = useState(false);
  const [trackingChatError, setTrackingChatError] = useState<string | null>(null);
  const trackingChatListRef = useRef<FlatList<TrackingChatRow>>(null);

  /** No iOS o `Modal` pode não refletir dimensões a tempo — `expo-screen-orientation` + `Dimensions`. */
  useEffect(() => {
    if (!visible || !expanded) return;
    let subscription: { remove: () => void } | undefined;
    void ScreenOrientation.getOrientationAsync()
      .then((o) => setExoOrientation(o))
      .catch(() => {});
    try {
      subscription = ScreenOrientation.addOrientationChangeListener((e) => {
        setExoOrientation(e.orientationInfo.orientation);
      });
    } catch {
      /* ambiente sem módulo nativo */
    }
    return () => subscription?.remove();
  }, [visible, expanded]);

  /**
   * Android: garantir que a Activity pode rodar com o mapa em ecrã cheio (alguns builds / OEM).
   * O `RCTModalHostView` no RN 0.81 ignora `supportedOrientations` no nativo — o desbloqueio ajuda
   * quando havia política de orientação aplicada antes.
   */
  useEffect(() => {
    if (!visible || !expanded) return;
    if (Platform.OS !== 'android') return;
    void ScreenOrientation.unlockAsync().catch(() => {});
  }, [visible, expanded]);

  /** Refs: o efeito do ETA não pode depender de myPos/update — cada GPS reiniciava o efeito e abortava o fetch OSRM. */
  const myPosRef = useRef(myPos);
  const updateRef = useRef(update);
  myPosRef.current = myPos;
  updateRef.current = update;

  const prevPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastFollowCameraAtRef = useRef(0);
  const lastFollowAnchorRef = useRef<{ lat: number; lng: number } | null>(null);
  const followUserRef = useRef(followUser);
  followUserRef.current = followUser;
  const prevFollowUserRef = useRef(false);

  /** Encaixe automático só quando a polilinha exibida muda (template → OSRM), não a cada GPS. */
  const lastAutoFitSigRef = useRef('');
  /** Último rumo aplicado à câmera (modo navegação); mantém-se ao parar no semáforo. */
  const lastMapHeadingRef = useRef(0);
  /** Bússola do dispositivo (watchHeadingAsync), graus 0–360. */
  const lastCompassHeadingRef = useRef<number | null>(null);

  const dynamicRouteRef = useRef<number[][] | null>(null);
  const routeRef = useRef<number[][]>(route);
  dynamicRouteRef.current = dynamicRoute;
  routeRef.current = route;

  // Subscribe to route tracker updates
  useEffect(() => {
    if (!visible) return;

    const tol =
      zoneType === 'route' && corridorToleranceM != null && Number.isFinite(corridorToleranceM)
        ? Math.max(10, corridorToleranceM)
        : 100;
    if (!routeTracker.isActive() || routeTracker.getRouteLength() !== route.length) {
      routeTracker.start(route, tol, { maxAccuracyM: 55 }).catch(() => {});
    }

    const handler = (u: RouteUpdate) => {
      setUpdate(u);
      const prev = myPosRef.current;
      prevPosRef.current = prev;
      setMyPos({ lat: u.currentLat, lng: u.currentLng });

      const dyn = dynamicRouteRef.current;
      const tpl = routeRef.current;
      const paintLine =
        dyn && dyn.length >= 2
          ? dyn
          : tpl && tpl.length >= 2
            ? tpl
            : null;
      if (paintLine) {
        const { arcM, distM } = closestPointOnPolylineArcM(paintLine, u.currentLat, u.currentLng);
        if (distM < 160) {
          setRoutePaintArcM((m) => Math.max(m, arcM));
        }
      }

      if (!embedNativeMap || !followUserRef.current) return;

      const dest = pickDestinationForOsrm(targetLoc, route);
      const prevPos =
        prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng)
          ? { lat: prev.lat, lng: prev.lng }
          : null;
      const rawHeading = computeNavHeading({
        prev: prevPos,
        cur: { lat: u.currentLat, lng: u.currentLng },
        dest,
        fallback: lastMapHeadingRef.current,
        speedMps: u.speedMps,
        courseDeg: u.courseDeg,
        compassDeg: lastCompassHeadingRef.current,
        routePoly: paintLine,
      });
      const dead = applyDeadZoneStationary(lastMapHeadingRef.current, rawHeading, u.speedMps);
      const heading = smoothHeadingDeg(lastMapHeadingRef.current, dead, HEADING_SMOOTH_FACTOR);
      lastMapHeadingRef.current = heading;

      const now = Date.now();
      const anchor = lastFollowAnchorRef.current;
      const moved =
        anchor == null
          ? Infinity
          : haversineM(anchor.lat, anchor.lng, u.currentLat, u.currentLng);
      const due = now - lastFollowCameraAtRef.current >= FOLLOW_CAMERA_MIN_MS;
      if (!due && moved < FOLLOW_MOVE_THRESHOLD_M) return;

      lastFollowCameraAtRef.current = now;
      lastFollowAnchorRef.current = { lat: u.currentLat, lng: u.currentLng };

      const map = mapRef.current;
      map?.animateCamera(
        {
          center: { latitude: u.currentLat, longitude: u.currentLng },
          zoom: NAV_FOLLOW_ZOOM,
          heading,
          pitch: NAVIGATION_MAP_PITCH,
        },
        { duration: 320 }
      );
    };

    const statusHandler = ({ status }: any) => {
      setIsPaused(status === 'PAUSED');
    };

    const traversedHandler = (coords: number[][]) => {
      setCoveredPath(coords);
    };

    routeTracker.on('update', handler);
    routeTracker.on('status_changed', statusHandler);
    routeTracker.on('traversed_update', traversedHandler);

    setIsPaused(routeTracker.isPaused());
    
    // Initialize coveredPath if resuming
    setCoveredPath(routeTracker.getTraversedPath());

    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      .then(loc => setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude }))
      .catch(() => {});

    return () => {
      routeTracker.off('update', handler);
      routeTracker.off('status_changed', statusHandler);
      routeTracker.off('traversed_update', traversedHandler);
    };
  }, [visible, route, embedNativeMap, targetLoc?.lat, targetLoc?.lng, zoneType, corridorToleranceM]);

  const fetchTrackingChat = useCallback(async () => {
    if (!taskId) return;
    try {
      const r = await apiFetch(`/api/tracking/task/${encodeURIComponent(taskId)}/chat`);
      const j = (await r.json().catch(() => ({}))) as { messages?: unknown; error?: string };
      if (!r.ok) {
        setTrackingChatError(typeof j.error === 'string' ? j.error : 'Não foi possível carregar o chat.');
        return;
      }
      setTrackingChatError(null);
      setTrackingChatMessages(mapServerChatMessages(j.messages));
    } catch {
      setTrackingChatError('Sem ligação. Tente de novo.');
    }
  }, [taskId]);

  useEffect(() => {
    if (!visible) setTrackingChatOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!trackingChatOpen || !taskId || !visible) return;
    void fetchTrackingChat();
    const tid = setInterval(() => void fetchTrackingChat(), 3500);
    return () => clearInterval(tid);
  }, [trackingChatOpen, taskId, visible, fetchTrackingChat]);

  useEffect(() => {
    if (!visible) {
      lastAutoFitSigRef.current = '';
      lastFollowAnchorRef.current = null;
      lastFollowCameraAtRef.current = 0;
      prevPosRef.current = null;
      prevFollowUserRef.current = false;
      lastMapHeadingRef.current = 0;
      lastCompassHeadingRef.current = null;
      setFollowUser(true);
      setShowTransitHints(false);
      setRoutePaintArcM(0);
    }
  }, [visible]);

  /** Bússola em tempo real — melhora o rumo quando o GPS está lento ou parado (só com mapa aberto). */
  useEffect(() => {
    if (!visible || !embedNativeMap || !expanded) return;
    let cancelled = false;
    let sub: { remove: () => void } | null = null;
    void (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const r = await Location.watchHeadingAsync((hd) => {
          const tr = hd.trueHeading;
          const mg = hd.magHeading;
          const v = Number.isFinite(tr) && tr >= 0 ? tr : mg;
          if (Number.isFinite(v) && v >= 0) {
            lastCompassHeadingRef.current = ((v % 360) + 360) % 360;
          }
        });
        if (!cancelled && r && typeof (r as { remove?: () => void }).remove === 'function') {
          sub = r as { remove: () => void };
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [visible, embedNativeMap, expanded]);

  const dynamicRoutePaintSig = useMemo(() => {
    if (!dynamicRoute || dynamicRoute.length < 2) return '';
    const f = dynamicRoute[0];
    const l = dynamicRoute[dynamicRoute.length - 1];
    return `${dynamicRoute.length}|${f[0]},${f[1]}|${l[0]},${l[1]}`;
  }, [dynamicRoute]);

  useEffect(() => {
    if (dynamicRoutePaintSig) setRoutePaintArcM(0);
  }, [dynamicRoutePaintSig]);

  useEffect(() => {
    if (!visible || !expanded || !embedNativeMap) return;
    let cancelled = false;
    void (async () => {
      try {
        const v = await AsyncStorage.getItem(TRANSIT_MAP_HINTS_KEY);
        if (!cancelled && v == null) setShowTransitHints(true);
      } catch {
        if (!cancelled) setShowTransitHints(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, expanded, embedNativeMap]);

  const dismissTransitHints = useCallback(() => {
    setShowTransitHints(false);
    void AsyncStorage.setItem(TRANSIT_MAP_HINTS_KEY, '1');
  }, []);

  // Linha no mapa: polilinha do template (≥2 pontos) OU reta OSRM + upgrade para geometria real.
  // Destino = mesmo critério do ETA (pickDestinationForOsrm), não só targetLoc — senão falha quando o pai manda lat/lng indefinidos mas há pontos na rota.
  const routeDestKey =
    route?.length && route.length > 0
      ? `${route[route.length - 1][0]},${route[route.length - 1][1]}`
      : '';

  useEffect(() => {
    if (!visible) {
      setDynamicRoute(null);
      return;
    }
    // Sempre pedir geometria OSRM (GPS → destino): templates com ≥3 vértices em linha quase reta
    // não traziam pedido nenhum e o mapa ficava só com a polilinha “admin”.
    const dest = pickDestinationForOsrm(targetLoc, route);
    if (!dest) return;

    let cancelled = false;
    let osrmGeometryOk = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const attempt = async () => {
      if (cancelled || osrmGeometryOk) return;
      // Mesma origem que o ETA (routeTracker pode ter GPS antes do setState em myPos).
      let oLat = myPosRef.current?.lat ?? updateRef.current?.currentLat;
      let oLng = myPosRef.current?.lng ?? updateRef.current?.currentLng;
      if (oLat == null || oLng == null) {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') return;
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          oLat = pos.coords.latitude;
          oLng = pos.coords.longitude;
        } catch {
          return;
        }
      }
      if (cancelled) return;
      const dLat = dest.lat;
      const dLng = dest.lng;
      if (!Number.isFinite(dLat) || !Number.isFinite(dLng)) return;

      const straight: number[][] = [
        [oLat, oLng],
        [dLat, dLng],
      ];
      // Com template denso, não mostrar reta de fallback por cima — só polilinha OSRM ou o laranja do template.
      if (!cancelled && (!route || route.length <= 2)) {
        setDynamicRoute(straight);
      }

      const line = await fetchDrivingGeometryLatLng(oLat, oLng, dLat, dLng);
      if (cancelled) return;
      if (line && line.length >= 2) {
        osrmGeometryOk = true;
        setDynamicRoute(line);
        if (intervalId) clearInterval(intervalId);
      } else if (!cancelled && route && route.length > 2) {
        setDynamicRoute(null);
      } else if (!cancelled && (!route || route.length <= 2)) {
        setDynamicRoute(straight);
      }
    };

    void attempt();
    intervalId = setInterval(() => void attempt(), 12000);
    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [visible, route?.length, routeDestKey, targetLoc?.lat, targetLoc?.lng]);

  // Encaixe quando a polilinha principal muda (ex.: chega geometria OSRM), nunca por causa de myPos.
  // Em modo navegação (seguir GPS) não fazer fit da rota inteira — rotas longas (KML) afastavam o zoom
  // para a região metropolitana e o seguimento GPS mantinha esse zoom (cam.zoom).
  useEffect(() => {
    if (!embedNativeMap || !expanded || !visible) return;
    if (followUserRef.current) return;
    const line =
      dynamicRoute && dynamicRoute.length >= 2
        ? dynamicRoute
        : route && route.length >= 2
          ? route
          : null;
    if (!line) return;
    const sig = `${line.length}:${line[0][0]}:${line[0][1]}:${line[line.length - 1][0]}:${line[line.length - 1][1]}`;
    if (sig === lastAutoFitSigRef.current) return;
    lastAutoFitSigRef.current = sig;

    const pts: { latitude: number; longitude: number }[] = [];
    for (const c of line) {
      if (c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        pts.push({ latitude: c[0], longitude: c[1] });
      }
    }
    if (pts.length < 2) return;

    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(pts, {
        edgePadding: { top: 130, right: 52, bottom: 260, left: 52 },
        animated: true,
      });
    }, 480);
    return () => clearTimeout(t);
  }, [embedNativeMap, expanded, visible, dynamicRoute, route]);

  const osrmDest = useMemo(
    () => pickDestinationForOsrm(targetLoc, route),
    [
      targetLoc?.lat,
      targetLoc?.lng,
      route?.length,
      route?.length ? route[route.length - 1]?.[0] : null,
      route?.length ? route[route.length - 1]?.[1] : null,
    ]
  );

  const parentHasFiniteEta = typeof etaMinutes === 'number' && Number.isFinite(etaMinutes);

  useEffect(() => {
    if (!visible) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    if (parentHasFiniteEta) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    if (!osrmDest) {
      setClientEtaMinutes(null);
      setEtaHint(null);
      return;
    }
    const { lat: dLat, lng: dLng } = osrmDest;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        let oLat = myPosRef.current?.lat ?? updateRef.current?.currentLat;
        let oLng = myPosRef.current?.lng ?? updateRef.current?.currentLng;
        if (oLat == null || oLng == null) {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            if (!cancelled) {
              setClientEtaMinutes(null);
              setEtaHint(null);
            }
            return;
          }
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          oLat = pos.coords.latitude;
          oLng = pos.coords.longitude;
        }
        if (cancelled) return;
        const res = await fetchDrivingLegEtaMinutes(oLat, oLng, dLat, dLng);
        if (cancelled) return;
        if (res.ok && res.minutes != null) {
          setClientEtaMinutes(res.minutes);
          setEtaHint(null);
        } else {
          setClientEtaMinutes(null);
          setEtaHint(null);
        }
      } catch {
        if (!cancelled) {
          setClientEtaMinutes(null);
          setEtaHint(null);
        }
      }
    };

    setEtaHint(null);
    tick();
    const iv = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [visible, parentHasFiniteEta, osrmDest?.lat, osrmDest?.lng]);

  /**
   * Esconde a polilinha do template só quando o despacho tem exactamente 2 pontos e há OSRM:
   * aí a geometria rodoviária substitui a reta entre A e B.
   * KML / patrulha (≥3 vértices) mantém-se visível em conjunto com a OSRM (evita perder o anel no mapa).
   */
  const suppressTemplatePolyline =
    !!(route && route.length === 2 && dynamicRoute && dynamicRoute.length >= 2);

  const dynamicRouteSplit = useMemo(() => {
    if (!dynamicRoute || dynamicRoute.length < 2 || routePaintArcM <= 0) return null;
    return splitPolylineByArcM(dynamicRoute, routePaintArcM);
  }, [dynamicRoute, routePaintArcM]);

  const templateRouteSplit = useMemo(() => {
    if (zoneType === 'segment' || zoneType === 'polygon') return null;
    if (dynamicRoute && dynamicRoute.length >= 2) return null;
    if (!route || route.length < 2 || routePaintArcM <= 0) return null;
    if (suppressTemplatePolyline) return null;
    return splitPolylineByArcM(route, routePaintArcM);
  }, [zoneType, dynamicRoute, route, routePaintArcM, suppressTemplatePolyline]);

  const segmentRouteSplit = useMemo(() => {
    if (zoneType !== 'segment') return null;
    if (dynamicRoute && dynamicRoute.length >= 2) return null;
    if (!route || route.length < 2 || routePaintArcM <= 0) return null;
    if (suppressTemplatePolyline) return null;
    return splitPolylineByArcM(route, routePaintArcM);
  }, [zoneType, dynamicRoute, route, routePaintArcM, suppressTemplatePolyline]);

  const focusOnLatLng = useCallback((lat: number, lng: number, zoom = 17) => {
    mapRef.current?.animateCamera(
      { center: { latitude: lat, longitude: lng }, zoom },
      { duration: 450 }
    );
  }, []);

  useEffect(() => {
    const wasFollowing = prevFollowUserRef.current;
    const map = mapRef.current;

    if (followUser && !wasFollowing && myPos && embedNativeMap) {
      lastFollowAnchorRef.current = { lat: myPos.lat, lng: myPos.lng };
      lastFollowCameraAtRef.current = Date.now();
      const dest = pickDestinationForOsrm(targetLoc, route);
      const polyNav =
        dynamicRouteRef.current && dynamicRouteRef.current.length >= 2
          ? dynamicRouteRef.current
          : routeRef.current && routeRef.current.length >= 2
            ? routeRef.current
            : null;
      const raw = computeNavHeading({
        prev: null,
        cur: { lat: myPos.lat, lng: myPos.lng },
        dest,
        fallback: lastMapHeadingRef.current,
        speedMps: null,
        courseDeg: null,
        compassDeg: lastCompassHeadingRef.current,
        routePoly: polyNav,
      });
      const h = smoothHeadingDeg(
        lastMapHeadingRef.current,
        applyDeadZoneStationary(lastMapHeadingRef.current, raw, null),
        HEADING_SMOOTH_FACTOR
      );
      lastMapHeadingRef.current = h;
      map?.animateCamera(
        {
          center: { latitude: myPos.lat, longitude: myPos.lng },
          zoom: NAV_FOLLOW_ZOOM,
          heading: h,
          pitch: NAVIGATION_MAP_PITCH,
        },
        { duration: 500 }
      );
    } else if (!followUser && wasFollowing && embedNativeMap && map?.getCamera) {
      void map.getCamera().then((cam) => {
        map.animateCamera(
          { ...cam, heading: 0, pitch: 0 },
          { duration: 450 }
        );
      });
    }

    prevFollowUserRef.current = followUser;
  }, [followUser, myPos?.lat, myPos?.lng, embedNativeMap, targetLoc?.lat, targetLoc?.lng, routeDestKey]);

  const displayEtaMinutes = parentHasFiniteEta ? etaMinutes : clientEtaMinutes;
  const hasNumericEta =
    typeof displayEtaMinutes === 'number' && Number.isFinite(displayEtaMinutes);
  const noDestinationForEta = !hasNumericEta && osrmDest == null;

  const [elapsedTick, setElapsedTick] = useState(0);
  useEffect(() => {
    if (!visible || !noDestinationForEta || !transitStartedAtIso) return;
    const t0 = Date.parse(transitStartedAtIso);
    if (!Number.isFinite(t0)) return;
    const iv = setInterval(() => setElapsedTick((n) => n + 1), 30000);
    return () => clearInterval(iv);
  }, [visible, noDestinationForEta, transitStartedAtIso]);

  const transitElapsedLabel = useMemo(() => {
    if (!noDestinationForEta || !transitStartedAtIso) return null;
    return formatElapsedSinceTransitPt(transitStartedAtIso);
  }, [noDestinationForEta, transitStartedAtIso, elapsedTick]);

  const isRouteCompleted = update?.event === 'ROUTE_COMPLETED';
  const techHeroPulse = useRef(new Animated.Value(1)).current;
  const [reduceMotionHero, setReduceMotionHero] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const ai = AccessibilityInfo;
    if (!ai?.isReduceMotionEnabled) {
      return () => {
        cancelled = true;
      };
    }
    void ai.isReduceMotionEnabled().then((v) => {
      if (!cancelled) setReduceMotionHero(!!v);
    });
    const sub = ai.addEventListener('reduceMotionChanged', (enabled: boolean) => {
      setReduceMotionHero(enabled);
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (!visible || !expanded || !myPos || isRouteCompleted || reduceMotionHero) {
      techHeroPulse.stopAnimation();
      techHeroPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(techHeroPulse, {
          toValue: 1.14,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(techHeroPulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [visible, expanded, myPos?.lat, myPos?.lng, isRouteCompleted, reduceMotionHero, techHeroPulse]);

  if (!visible) return null;

  const dimLandscape = windowDims.width > windowDims.height;
  const exoLandscape =
    exoOrientation === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
    exoOrientation === ScreenOrientation.Orientation.LANDSCAPE_RIGHT;
  const isLandscape = exoLandscape || dimLandscape;

  /** Android + Google Maps: após rotação o surface do mapa no Dialog costuma ficar errado até remontar. */
  const androidMapRelayoutKey =
    Platform.OS === 'android'
      ? `transit-map-${Math.round(windowDims.width)}x${Math.round(windowDims.height)}`
      : 'transit-map-ios';

  const isDeviation = update?.event === 'ROUTE_DEVIATION';
  const isComplete  = update?.event === 'ROUTE_COMPLETED';
  const pct         = update?.progressPercent ?? 0;

  let statusColor = '#f97316';
  if (isComplete) statusColor = '#16a34a';
  else if (isPaused) statusColor = '#94a3b8';
  else if (isDeviation) statusColor = '#d97706';

  const centerLat = myPos?.lat ?? (route && route.length > 0 ? route[0][0] : -23.5505);
  const centerLng = myPos?.lng ?? (route && route.length > 0 ? route[0][1] : -46.6333);

  const handlePauseResume = async () => {
    if (!taskId) {
      Alert.alert(
        'Rastreamento',
        'Sem identificador da OS no mapa — o link do cliente não poderá ser atualizado quando houver rede.'
      );
      return;
    }
    if (isPaused) {
      routeTracker.resume();
      try {
        const r = await apiFetch(`/api/tracking/resume/${encodeURIComponent(taskId)}`, {
          method: 'POST',
        });
        if (!r.ok) {
          console.warn('[tracking] resume servidor', r.status);
          await enqueueTrackingSync(String(taskId), 'resume');
        }
      } catch (e) {
        console.warn('[tracking] resume offline/falha rede → fila', e);
        await enqueueTrackingSync(String(taskId), 'resume');
      }
      return;
    }
    routeTracker.pause();
    try {
      const r = await apiFetch(`/api/tracking/pause/${encodeURIComponent(taskId)}`, {
        method: 'POST',
      });
      if (!r.ok) {
        console.warn('[tracking] pause servidor', r.status);
        await enqueueTrackingSync(String(taskId), 'pause');
      }
    } catch (e) {
      console.warn('[tracking] pause offline/falha rede → fila', e);
      await enqueueTrackingSync(String(taskId), 'pause');
    }
  };

  const handleRecenter = async () => {
    if (!embedNativeMap) {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      } catch {
        /* ignore */
      }
      return;
    }
    const map = mapRef.current;
    const centerOnce = async (lat: number, lng: number) => {
      const nav = followUserRef.current;
      if (!map) return;
      if (nav) {
        map.animateCamera(
          {
            center: { latitude: lat, longitude: lng },
            zoom: NAV_FOLLOW_ZOOM,
            heading: lastMapHeadingRef.current,
            pitch: NAVIGATION_MAP_PITCH,
          },
          { duration: 400 }
        );
        return;
      }
      if (map.getCamera) {
        try {
          const cam = await map.getCamera();
          map.animateCamera(
            {
              center: { latitude: lat, longitude: lng },
              zoom: cam.zoom ?? 16,
              pitch: cam.pitch,
              heading: cam.heading,
              altitude: cam.altitude,
            },
            { duration: 400 }
          );
        } catch {
          map.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 16 }, { duration: 400 });
        }
      } else {
        map.animateCamera({ center: { latitude: lat, longitude: lng }, zoom: 16 }, { duration: 400 });
      }
    };
    if (myPos) {
      await centerOnce(myPos.lat, myPos.lng);
    } else {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyPos({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        await centerOnce(loc.coords.latitude, loc.coords.longitude);
      } catch {
        /* ignore */
      }
    }
  };

  const openNavOptions = () => {
    if (zoneType === 'segment' && route && route.length >= 2) {
      Alert.alert(
        'Navegar para OS',
        'Para qual extremidade do trecho deseja navegar?',
        [
          { text: 'Ponto A', onPress: () => openDestInMaps(route[0][0], route[0][1]) },
          { text: 'Ponto B', onPress: () => openDestInMaps(route[1][0], route[1][1]) },
          { text: 'Cancelar', style: 'cancel' }
        ]
      );
      return;
    }
    
    // For route, target start of route
    const tLat = (zoneType === 'route' && route && route.length > 0) ? route[0][0] : targetLoc?.lat;
    const tLng = (zoneType === 'route' && route && route.length > 0) ? route[0][1] : targetLoc?.lng;
    
    openDestInMaps(tLat, tLng);
  };
  
  const openDestInMaps = (lat?: number | null, lng?: number | null) => {
    if (!lat || !lng) return;
    const options: any[] = [
      { text: 'Waze', onPress: () => Linking.openURL(`https://waze.com/ul?ll=${lat},${lng}&navigate=yes`) },
      { text: 'Google Maps', onPress: () => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`) }
    ];
    if (Platform.OS === 'ios') {
      options.push({ text: 'Apple Maps', onPress: () => Linking.openURL(`maps://?daddr=${lat},${lng}`) });
      options.push({ text: 'Cancelar', style: 'cancel' });
      Alert.alert('Navegar para OS', 'Escolha seu aplicativo favorito:', options);
    } else {
      Linking.openURL(`geo:0,0?q=${lat},${lng}(Local da OS)`);
    }
  };

  const sendTrackingChat = async (opts?: { moderationOverrideAck?: boolean }) => {
    const t = trackingChatDraft.trim();
    if (!t || !taskId || trackingChatSending) return;
    setTrackingChatSending(true);
    try {
      const r = await apiFetch(`/api/tracking/task/${encodeURIComponent(taskId)}/chat`, {
        method: 'POST',
        body: JSON.stringify(
          opts?.moderationOverrideAck ? { text: t, ackModerationWarning: true } : { text: t }
        ),
      });
      const j = (await r.json().catch(() => ({}))) as {
        messages?: unknown;
        error?: string;
        code?: string;
        userMessage?: string;
        canOverride?: boolean;
      };
      if (r.status === 422 && j.code === 'CHAT_MODERATION') {
        if (Array.isArray(j.messages)) setTrackingChatMessages(mapServerChatMessages(j.messages));
        const um =
          typeof j.userMessage === 'string' && j.userMessage.trim()
            ? j.userMessage.trim()
            : 'A mensagem não foi enviada. Revise o texto.';
        if (j.canOverride) {
          Alert.alert(
            'Moderação do chat',
            `${um}\n\nSe foi um falso alarme leve, pode confirmar o reenvio.`,
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Enviar mesmo',
                onPress: () => void sendTrackingChat({ moderationOverrideAck: true }),
              },
            ]
          );
        } else {
          Alert.alert('Moderação do chat', um);
        }
        return;
      }
      if (!r.ok) {
        Alert.alert('Chat', typeof j.error === 'string' ? j.error : 'Não foi possível enviar.');
        return;
      }
      setTrackingChatDraft('');
      setTrackingChatMessages(mapServerChatMessages(j.messages));
    } catch {
      Alert.alert('Chat', 'Sem ligação. Tente de novo.');
    } finally {
      setTrackingChatSending(false);
    }
  };

  const formatTrackingChatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return '';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const trackingChatModalEl =
    taskId != null && String(taskId).trim() !== '' ? (
      <Modal
        visible={trackingChatOpen && visible}
        animationType="slide"
        onRequestClose={() => setTrackingChatOpen(false)}
        supportedOrientations={TRANSIT_MODAL_SUPPORTED_ORIENTATIONS}
      >
        <View style={{ flex: 1, backgroundColor: '#fff', paddingTop: insets.top + 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: '#e2e8f0',
            }}
          >
            <TouchableOpacity
              onPress={() => setTrackingChatOpen(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel="Fechar chat"
            >
              <Ionicons name="close" size={26} color="#64748b" />
            </TouchableOpacity>
            <Text style={{ flex: 1, marginLeft: 12, fontSize: 17, fontWeight: '800', color: '#0f172a' }}>
              Chat com o cliente
            </Text>
          </View>
          {trackingChatError ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <Text style={{ color: '#b45309', fontSize: 14 }}>{trackingChatError}</Text>
            </View>
          ) : null}
          <FlatList
            ref={trackingChatListRef}
            data={trackingChatMessages}
            keyExtractor={(item) => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12, flexGrow: 1 }}
            onContentSizeChange={() =>
              trackingChatListRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item }) => {
              if (item.role === 'system') {
                const when = formatTrackingChatTime(item.at);
                return (
                  <View
                    style={{
                      alignSelf: 'center',
                      maxWidth: '96%',
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4, textAlign: 'center' }}>
                      Sistema{when ? ` · ${when}` : ''}
                    </Text>
                    <View
                      style={{
                        backgroundColor: '#fef3c7',
                        borderWidth: 1,
                        borderColor: '#fcd34d',
                        paddingHorizontal: 14,
                        paddingVertical: 10,
                        borderRadius: 14,
                      }}
                    >
                      <Text style={{ color: '#78350f', fontSize: 14 }}>{item.text}</Text>
                    </View>
                  </View>
                );
              }
              const mine = item.role === 'tech';
              const who = mine ? item.senderLabel || 'Técnico' : 'Cliente';
              const when = formatTrackingChatTime(item.at);
              return (
                <View
                  style={{
                    alignSelf: mine ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                    {who}
                    {when ? ` · ${when}` : ''}
                  </Text>
                  <View
                    style={{
                      backgroundColor: mine ? '#ea580c' : '#f1f5f9',
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderRadius: 16,
                    }}
                  >
                    <Text style={{ color: mine ? '#fff' : '#0f172a', fontSize: 15 }}>{item.text}</Text>
                  </View>
                </View>
              );
            }}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={insets.bottom + 8}
          >
            <View
              style={{
                flexDirection: 'row',
                paddingHorizontal: 12,
                paddingTop: 10,
                paddingBottom: Math.max(12, insets.bottom + 8),
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: '#e2e8f0',
                gap: 8,
                alignItems: 'flex-end',
              }}
            >
              <TextInput
                value={trackingChatDraft}
                onChangeText={setTrackingChatDraft}
                placeholder="Escreva uma mensagem…"
                placeholderTextColor="#94a3b8"
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: '#e2e8f0',
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  fontSize: 15,
                  color: '#0f172a',
                  maxHeight: 120,
                }}
                multiline
              />
              <TouchableOpacity
                onPress={() => void sendTrackingChat()}
                disabled={trackingChatSending}
                style={{
                  backgroundColor: '#ea580c',
                  borderRadius: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  opacity: trackingChatSending ? 0.65 : 1,
                }}
                accessibilityLabel="Enviar mensagem"
              >
                {trackingChatSending ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Ionicons name="send" size={20} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    ) : null;

  // Minimized view (shows inline in scrollview)
  if (!expanded) {
    return (
      <>
        <TouchableOpacity style={styles.minimizedCard} onPress={() => setExpanded(true)}>
          <Ionicons name="map" size={24} color="#f97316" />
          <View style={{ flex: 1 }}>
            <Text style={styles.minimizedTitle}>Mapa da Rota Oculto</Text>
            <Text style={{ fontSize: 12, color: '#64748b' }}>Toque para voltar à navegação.</Text>
          </View>
          <Ionicons name="expand" size={20} color="#f97316" />
        </TouchableOpacity>
        {trackingChatModalEl}
      </>
    );
  }

  const hasRoute = route && route.length >= 2;

  const transitHeaderLong =
    isComplete
      ? 'Deslocamento Concluído'
      : isPaused
        ? 'Navegação Pausada'
        : !hasRoute
          ? 'Deslocamento em Andamento'
          : isDeviation
            ? `Aviso: ~${update?.distanceFromRoute ?? '—'} m fora do trajeto`
            : `Em Rota · ${pct}%${zoneType === 'route' && update?.patrolCoveragePercent != null ? ` · Patrulha ~${update.patrolCoveragePercent}%` : ''}`;

  const transitStatusShort = isComplete
    ? 'Concluído'
    : isPaused
      ? 'Pausado'
      : !hasRoute
        ? 'Em desloc.'
        : isDeviation
          ? 'Aviso'
          : `${pct}%`;

  const showTransitStatusDetail = () => {
    Alert.alert('Estado do deslocamento', transitHeaderLong);
  };

  // Full Screen Modal View
  return (
    <>
    <Modal
      visible={expanded}
      animationType="slide"
      supportedOrientations={TRANSIT_MODAL_SUPPORTED_ORIENTATIONS}
    >
      <View style={styles.modalContainer}>
        {/* Landscape: sem faixa superior larga — minimizar no canto; estado do deslocamento vai para o chip inferior */}
        {isLandscape ? (
          <TouchableOpacity
            style={[
              styles.landscapeMinimizeFab,
              { top: insets.top + 6, right: Math.max(12, insets.right + 4) },
            ]}
            onPress={() => setExpanded(false)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Minimizar mapa"
          >
            <Ionicons name="chevron-down" size={22} color="#475569" />
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.floatingHeader,
              {
                borderLeftColor: statusColor,
                top: insets.top + 10,
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>{transitHeaderLong}</Text>
              {hasRoute && !isComplete && !isPaused ? (
                <View style={styles.miniBar}>
                  <View style={[styles.miniBarFill, { width: `${pct}%` as any, backgroundColor: statusColor }]} />
                </View>
              ) : null}
            </View>
            <TouchableOpacity style={styles.minimizeBtn} onPress={() => setExpanded(false)}>
              <Ionicons name="chevron-down" size={24} color="#64748b" />
            </TouchableOpacity>
          </View>
        )}

        {showTransitHints && embedNativeMap && (
          <View style={styles.hintPanel} accessibilityViewIsModal>
            <View style={styles.hintHeaderRow}>
              <Ionicons name="information-circle" size={20} color="#2563eb" />
              <Text style={styles.hintTitle}>Dicas do mapa</Text>
              <TouchableOpacity
                onPress={dismissTransitHints}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel="Fechar dicas"
              >
                <Ionicons name="close" size={22} color="#64748b" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.hintScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.hintBody}>
                Por padrão o mapa está em <Text style={styles.hintStrong}>modo navegação</Text> (vista 2D): segue a sua posição
                ao centro com zoom alto, alinha o <Text style={styles.hintStrong}>rumo em cima</Text> com suavização, usando o rumo
                do GPS em movimento, a direção da rota quando está junto da linha e a bússola quando vai mais devagar.
                {'\n\n'}
                Toque no ícone <Text style={styles.hintStrong}>navegação</Text> (círculo com seta) para{' '}
                <Text style={styles.hintStrong}>mapa livre</Text>: norte em cima, pode arrastar e rodar o mapa.
                Toque de novo para voltar a seguir o GPS.
                {'\n\n'}
                Use <Text style={styles.hintStrong}>pinçar</Text> para ajustar o zoom em qualquer modo.
                {'\n\n'}
                Toque no <Text style={styles.hintStrong}>marcador do destino</Text> (ou nos pontos A/B) para aproximar e ver melhor a rua.
                {'\n\n'}
                <Text style={styles.hintStrong}>Rota KML / patrulha:</Text> linha{' '}
                <Text style={styles.hintStrong}>laranja</Text> = trajeto planejado; linha{' '}
                <Text style={styles.hintStrong}>azul</Text> = percurso GPS registrado; na linha de navegação (OSRM),
                o trecho já percorrido fica <Text style={styles.hintStrong}>laranja sólido</Text> e o que falta em
                azul tracejado — útil ao pausar para ver onde parou. A cobertura de patrulha estima quanto do
                trajeto planejado foi percorrido dentro do corredor (tolerância definida no despacho).
                {'\n\n'}
                <Text style={styles.hintStrong}>Waze / outra app:</Text> aceite localização "sempre" ou "em segundo plano"
                quando o sistema pedir, para a trilha GPS continuar. No Android pode aparecer uma notificação
                "Deslocamento em andamento" — é normal enquanto o deslocamento estiver ativo.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.hintBtn} onPress={dismissTransitHints} activeOpacity={0.85}>
              <Text style={styles.hintBtnText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        )}

        <MapView
          key={androidMapRelayoutKey}
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          initialRegion={{
            latitude: centerLat, longitude: centerLng,
            latitudeDelta: 0.01, longitudeDelta: 0.01,
          }}
          mapPadding={
            followUser
              ? isLandscape
                ? { top: 20, right: 56, bottom: 108, left: 56 }
                : { top: 100, right: 52, bottom: 248, left: 52 }
              : { top: 0, right: 0, bottom: 0, left: 0 }
          }
          showsUserLocation={false}
          showsMyLocationButton={false}
          followsUserLocation={false}
          showsCompass={followUser}
          zoomEnabled
          scrollEnabled={!followUser}
          pitchEnabled={!followUser}
          rotateEnabled={!followUser}
        >
          {route &&
            route.length >= 3 &&
            !suppressTemplatePolyline &&
            zoneType === 'polygon' && (
              <Polygon
                coordinates={route.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                fillColor="rgba(59,130,246,0.12)"
                strokeColor="#3b82f6"
                strokeWidth={2}
                zIndex={780}
              />
            )}
          {route &&
            route.length >= 2 &&
            !suppressTemplatePolyline &&
            zoneType !== 'segment' &&
            zoneType !== 'polygon' &&
            (templateRouteSplit ? (
              <>
                {templateRouteSplit.covered.length >= 2 && (
                  <Polyline
                    coordinates={templateRouteSplit.covered.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                    strokeColor="#ea580c"
                    strokeWidth={3}
                    zIndex={810}
                    geodesic
                  />
                )}
                {templateRouteSplit.remaining.length >= 2 && (
                  <Polyline
                    coordinates={templateRouteSplit.remaining.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                    strokeColor="#fdba74"
                    strokeWidth={2}
                    lineDashPattern={Platform.OS === 'android' ? undefined : [12, 8]}
                    zIndex={805}
                    geodesic
                  />
                )}
              </>
            ) : (
              <Polyline
                coordinates={route.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                strokeColor="#ea580c"
                strokeWidth={2}
                lineDashPattern={Platform.OS === 'android' ? undefined : [12, 8]}
                zIndex={800}
                geodesic
              />
            ))}
          {coveredPath && coveredPath.length >= 2 && (
            <Polyline
              coordinates={coveredPath.map((c) => ({ latitude: c[0], longitude: c[1] }))}
              strokeColor="#3b82f6"
              strokeWidth={3}
              zIndex={880}
              geodesic
            />
          )}
          
          {zoneType !== 'segment' &&
            zoneType !== 'polygon' &&
            route &&
            route.length > 0 && (
            <>
              <Marker coordinate={{ latitude: route[0][0], longitude: route[0][1] }} title="Início" pinColor="#16a34a" />
              <Marker
                coordinate={{ latitude: route[route.length - 1][0], longitude: route[route.length - 1][1] }}
                title="Destino"
                description="Toque para aproximar"
                onPress={() =>
                  focusOnLatLng(route[route.length - 1][0], route[route.length - 1][1], 17)
                }
              >
                 <View style={{ width: 28, height: 28, backgroundColor: '#dc2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                   <FontAwesome5 name="flag-checkered" size={12} color="#fff" />
                 </View>
              </Marker>
            </>
          )}

          {zoneType === 'segment' && route && route.length >= 2 && !suppressTemplatePolyline && (
            <>
              {segmentRouteSplit ? (
                <>
                  {segmentRouteSplit.covered.length >= 2 && (
                    <Polyline
                      coordinates={segmentRouteSplit.covered.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                      strokeColor="#6d28d9"
                      strokeWidth={3}
                      zIndex={760}
                      geodesic
                    />
                  )}
                  {segmentRouteSplit.remaining.length >= 2 && (
                    <Polyline
                      coordinates={segmentRouteSplit.remaining.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                      strokeColor="#a855f7"
                      strokeWidth={2}
                      lineDashPattern={Platform.OS === 'android' ? undefined : [10, 6]}
                      zIndex={755}
                      geodesic
                    />
                  )}
                </>
              ) : (
                <Polyline
                  coordinates={[
                    { latitude: route[0][0], longitude: route[0][1] },
                    { latitude: route[1][0], longitude: route[1][1] },
                  ]}
                  strokeColor="#a855f7"
                  strokeWidth={2}
                  lineDashPattern={Platform.OS === 'android' ? undefined : [10, 6]}
                  zIndex={750}
                  geodesic
                />
              )}
              <Marker
                coordinate={{ latitude: route[0][0], longitude: route[0][1] }}
                title="Ponto A"
                onPress={() => focusOnLatLng(route[0][0], route[0][1], 17)}
              />
              <Marker
                coordinate={{ latitude: route[1][0], longitude: route[1][1] }}
                title="Ponto B"
                onPress={() => focusOnLatLng(route[1][0], route[1][1], 17)}
              />
            </>
          )}
          
          {/* Percurso dinâmico (reta imediata + geometria OSRM quando disponível); trecho já percorrido a laranja */}
          {dynamicRoute && dynamicRoute.length >= 2 && (
             <>
               {dynamicRouteSplit ? (
                 <>
                   {dynamicRouteSplit.covered.length >= 2 && (
                     <Polyline
                       coordinates={dynamicRouteSplit.covered.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                       strokeColor="#ea580c"
                       strokeWidth={3}
                       zIndex={1001}
                       geodesic={false}
                     />
                   )}
                   {dynamicRouteSplit.remaining.length >= 2 && (
                     <Polyline
                       coordinates={dynamicRouteSplit.remaining.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                       strokeColor="#2563eb"
                       strokeWidth={2}
                       lineDashPattern={Platform.OS === 'android' ? undefined : [8, 6]}
                       zIndex={1000}
                       geodesic={false}
                     />
                   )}
                 </>
               ) : (
                 <Polyline
                   coordinates={dynamicRoute.map((c) => ({ latitude: c[0], longitude: c[1] }))}
                   strokeColor="#2563eb"
                   strokeWidth={2}
                   lineDashPattern={Platform.OS === 'android' ? undefined : [8, 6]}
                   zIndex={1000}
                   geodesic={false}
                 />
               )}
               <Marker
                 coordinate={{
                   latitude: dynamicRoute[dynamicRoute.length - 1][0],
                   longitude: dynamicRoute[dynamicRoute.length - 1][1],
                 }}
                 title="Destino"
                 description="Toque para aproximar"
                 onPress={() =>
                   focusOnLatLng(
                     dynamicRoute[dynamicRoute.length - 1][0],
                     dynamicRoute[dynamicRoute.length - 1][1],
                     17
                   )
                 }
               >
                 <View style={{ width: 28, height: 28, backgroundColor: '#dc2626', borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                   <FontAwesome5 name="flag-checkered" size={12} color="#fff" />
                 </View>
               </Marker>
             </>
          )}
          
          {myPos && (
            <Marker
              coordinate={{ latitude: myPos.lat, longitude: myPos.lng }}
              title="Sua posição"
              description={
                followUser
                  ? 'Modo navegação: o mapa alinha ao rumo; a foto permanece vertical.'
                  : 'Sua posição no mapa (foto sempre vertical).'
              }
              anchor={{ x: 0.5, y: 0.5 }}
              zIndex={2000}
              rotation={0}
              flat={false}
            >
              <Animated.View
                style={[styles.navTechnicianWrap, { transform: [{ scale: techHeroPulse }] }]}
                pointerEvents="none"
              >
                <View style={styles.navAvatarRing}>
                  {avatarUri ? (
                    <Image source={{ uri: avatarUri }} style={styles.navAvatarImage} />
                  ) : (
                    <View style={styles.navAvatarFallback}>
                      <Ionicons name="person" size={21} color="#64748b" />
                    </View>
                  )}
                </View>
              </Animated.View>
            </Marker>
          )}
        </MapView>

        <View style={[styles.floatingRightGroup, isLandscape && styles.floatingRightGroupLandscape]}>
          {(route?.length > 0 || targetLoc?.lat) && (
            <TouchableOpacity style={styles.navBtn} onPress={openNavOptions}>
               <Ionicons name="navigate" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          {taskId ? (
            <TouchableOpacity
              style={styles.recenterBtn}
              onPress={() => setTrackingChatOpen(true)}
              accessibilityLabel="Abrir chat com o cliente"
            >
              <Ionicons name="chatbubbles-outline" size={22} color="#475569" />
            </TouchableOpacity>
          ) : null}
          {embedNativeMap && (
            <TouchableOpacity
              style={[styles.recenterBtn, followUser && styles.followActiveBtn]}
              onPress={() => setFollowUser((v) => !v)}
              accessibilityLabel={
                followUser ? 'Modo mapa livre (norte em cima, arrastar mapa)' : 'Modo navegação (seguir GPS e rumo)'
              }
            >
              <Ionicons
                name={followUser ? 'navigate-circle' : 'navigate-circle-outline'}
                size={22}
                color={followUser ? '#fff' : '#475569'}
              />
            </TouchableOpacity>
          )}
          {!embedNativeMap && (
            <TouchableOpacity style={styles.recenterBtn} onPress={() => void handleRecenter()} accessibilityLabel="Atualizar posição no mapa">
              <Ionicons name="locate" size={24} color="#475569" />
            </TouchableOpacity>
          )}
        </View>

        {/* Controles inferiores: coluna em pé; em landscape, faixa compacta centrada para não tapar o mapa */}
        <View
          style={[
            styles.bottomControls,
            { bottom: Math.max(16, insets.bottom + (isLandscape ? 8 : 14)) },
            isLandscape && styles.bottomControlsLandscape,
          ]}
        >
          {isLandscape ? (
            <TouchableOpacity
              style={[styles.landscapeStatusChip, { borderLeftColor: statusColor }]}
              onPress={() => setExpanded(false)}
              onLongPress={showTransitStatusDetail}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Minimizar mapa. Toque longo para ver detalhes do deslocamento."
            >
              <Ionicons
                name={isComplete ? 'checkmark-circle' : isPaused ? 'pause-circle' : isDeviation ? 'warning' : 'navigate'}
                size={16}
                color={statusColor}
              />
              <Text style={styles.landscapeStatusChipText} numberOfLines={1}>
                {transitStatusShort}
              </Text>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            style={[
              styles.pauseBtn,
              isLandscape && styles.pauseBtnLandscape,
              isPaused && { backgroundColor: '#10b981', borderColor: '#10b981' },
            ]}
            onPress={handlePauseResume}
          >
            <Ionicons name={isPaused ? 'play' : 'pause'} size={18} color={isPaused ? '#fff' : '#475569'} />
            <Text style={[styles.pauseText, isPaused && { color: '#fff' }]}>
              {isPaused ? 'Retomar Rota' : 'Pausar'}
            </Text>
          </TouchableOpacity>

          {onEndTransit ? (
            <TouchableOpacity
              style={[
                styles.endTransitBtn,
                isLandscape && styles.endTransitBtnLandscape,
                endTransitLoading && { opacity: 0.85 },
              ]}
              disabled={endTransitLoading}
              onPress={() => {
                if (endTransitLoading) return;
                void Promise.resolve(onEndTransit());
              }}
            >
              {endTransitLoading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="stop-circle" size={20} color="#fff" />
              )}
              <Text style={[styles.endTransitText, isLandscape && styles.endTransitTextLandscape]}>
                {endTransitLoading ? 'A obter localização…' : isLandscape ? 'Finalizar' : 'FINALIZAR DESLOCAMENTO'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ──── Premium ETA Badge — always visible during transit ──── */}
        {!isComplete && !isPaused && (
          <EtaBadge
            etaMinutes={displayEtaMinutes ?? null}
            pct={pct}
            hint={etaHint}
            noDestination={noDestinationForEta}
            transitElapsedLabel={transitElapsedLabel}
            isLandscape={isLandscape}
          />
        )}

        {/* Deviation Banner Overlay */}
        {isDeviation && !isPaused && (
          <View style={[styles.deviationBanner, { top: isLandscape ? insets.top + 10 : 120 }]}>
            <Ionicons name="warning" size={18} color="#78350f" style={{ marginRight: 8 }} />
            <Text style={styles.deviationText}>
              Aviso: fora do corredor (~{update?.distanceFromRoute ?? '—'} m). Não bloqueia o deslocamento.
            </Text>
          </View>
        )}
      </View>
    </Modal>
    {trackingChatModalEl}
    </>
  );
}

const styles = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: '#f1f5f9' },
  minimizedCard: { marginHorizontal: 16, marginTop: 10, padding: 16, backgroundColor: '#fff', borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, elevation: 3 },
  minimizedTitle: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  
  floatingHeader: { position: 'absolute', left: 16, right: 16, zIndex: 10, backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5, borderLeftWidth: 4 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 4 },
  minimizeBtn: { padding: 4 },
  landscapeMinimizeFab: {
    position: 'absolute',
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  landscapeStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 10,
    paddingLeft: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    maxWidth: 118,
    flexShrink: 0,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  landscapeStatusChipText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
  },
  miniBar: { height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, overflow: 'hidden', width: '100%', marginTop: 4 },
  miniBarFill: { height: 4, borderRadius: 2 },
  
  floatingRightGroup: { position: 'absolute', right: 16, bottom: 180, zIndex: 10, alignItems: 'center', gap: 12 },
  floatingRightGroupLandscape: { bottom: 76 },
  navBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#3b82f6', alignItems: 'center', justifyContent: 'center', shadowColor: '#3b82f6', shadowOpacity: 0.4, shadowRadius: 6, elevation: 6 },
  recenterBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 5, elevation: 4 },
  
  bottomControls: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 20,
    flexDirection: 'column',
    gap: 12,
  },
  bottomControlsLandscape: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    left: 10,
    right: 10,
    gap: 8,
    flexWrap: 'wrap',
  },
  pauseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  pauseBtnLandscape: {
    minWidth: 118,
    flexShrink: 0,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  pauseText: { fontSize: 15, fontWeight: '700', color: '#475569' },

  endTransitBtn: {
    flexDirection: 'row',
    backgroundColor: '#ea580c',
    paddingVertical: 16,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ea580c',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    gap: 10,
  },
  endTransitBtnLandscape: {
    flexShrink: 1,
    maxWidth: 280,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  endTransitText: { color: '#fff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  endTransitTextLandscape: { fontSize: 14, letterSpacing: 0.3 },

  deviationBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fcd34d',
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  deviationText: { color: '#78350f', fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'center' },

  /** ~30% menor que 64px; centrado no anchor do Marker. */
  navTechnicianWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 48,
  },
  navAvatarRing: {
    width: 45,
    height: 45,
    borderRadius: 23,
    borderWidth: 3,
    borderColor: '#fff',
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 5,
  },
  navAvatarImage: {
    width: 45,
    height: 45,
    borderRadius: 23,
  },
  navAvatarFallback: {
    width: 45,
    height: 45,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f5f9',
  },
  followActiveBtn: { backgroundColor: '#ea580c', borderWidth: 0 },

  hintPanel: {
    position: 'absolute',
    top: 118,
    left: 14,
    right: 14,
    zIndex: 25,
    maxHeight: height * 0.38,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingTop: 12,
    paddingHorizontal: 14,
    paddingBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  hintHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  hintTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  hintScroll: {
    maxHeight: height * 0.26,
  },
  hintBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#475569',
  },
  hintStrong: { fontWeight: '800', color: '#1e293b' },
  hintEm: { fontStyle: 'italic', color: '#64748b' },
  hintBtn: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  hintBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
