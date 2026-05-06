/**
 * Prestador ACTIVE: edita horário semanal, bases (Location) e cobertura geográfica.
 * Dados: PUT /api/me (AuthService.patchMe) + refreshUser.
 * Ao focar o ecrã: refreshUser + getUser para alinhar com alterações feitas no painel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  Keyboard,
  Dimensions,
  InteractionManager,
} from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';
import { AuthService, isTechnicianProfileActive, type User } from '../../src/services/auth';
import { ProviderAffiliationsApi } from '../../src/services/providerAffiliations';
import {
  TECH_SCHEDULE_DAY_ORDER,
  type TechScheduleDayKey,
  type TechScheduleSlot,
  type TechServiceAreaCircle,
  defaultSchedule,
  parseScheduleFromProfileJson,
  findFirstInvalidEnabledTime,
  isValidHhMm,
  rid,
} from '../../src/lib/technicianScheduleForm';

const MAX_SLOT_SERVICE_CIRCLES = 20;

/** Entrada no campo de raio (vírgula ou ponto) — no máx. um separador decimal. */
function sanitizeRadiusKmInput(raw: string): string {
  let out = '';
  let sep = false;
  for (const ch of String(raw).replace(/[^0-9.,]/g, '')) {
    if (ch === '.' || ch === ',') {
      if (sep) continue;
      sep = true;
      out += ',';
    } else {
      out += ch;
    }
  }
  return out;
}

function formatRadiusKmForField(km: number): string {
  const n = Math.round(Number(km) * 100_000) / 100_000;
  if (!Number.isFinite(n)) return '10';
  return String(n).replace('.', ',');
}

/** Devolve km válido ou null se ainda incompleto / inválido (não forçar clamp aqui). */
function parseRadiusKmDisplay(s: string): number | null {
  const t = String(s).trim().replace(',', '.');
  if (t === '' || t === '.') return null;
  const v = Number(t);
  if (!Number.isFinite(v)) return null;
  return v;
}

function clampSlotCircle(c: TechServiceAreaCircle): TechServiceAreaCircle {
  const r = Number(c.radiusKm);
  return {
    id: c.id,
    latitude: c.latitude,
    longitude: c.longitude,
    radiusKm: Math.min(500, Math.max(0.5, Number.isFinite(r) ? r : 10)),
  };
}

/** Raio no mapa enquanto edita o texto (estados parciais como "15," não quebram o círculo). */
function previewRadiusKmForCircle(c: TechServiceAreaCircle, textById: Record<string, string>): number {
  const raw = textById[c.id];
  if (raw === undefined) return clampSlotCircle(c).radiusKm;
  const v = parseRadiusKmDisplay(raw);
  if (v == null) return clampSlotCircle(c).radiusKm;
  return Math.min(500, Math.max(0.5, v));
}

type DayKey = TechScheduleDayKey;

type BaseRow = {
  id: string;
  name: string;
  type?: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export default function ScheduleRegionsScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  /** Vínculo DEDICATED+ACTIVE: agenda e regiões vêm da empresa — só leitura na app. */
  const [readOnlyDedicated, setReadOnlyDedicated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schedule, setSchedule] = useState(() => defaultSchedule());
  const [serviceLocIds, setServiceLocIds] = useState<string[]>([]);
  const [serviceCoverageRadiusKm, setServiceCoverageRadiusKm] = useState('50');
  const [serviceCoverageNotes, setServiceCoverageNotes] = useState('');
  const [coverageCenter, setCoverageCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [bases, setBases] = useState<BaseRow[]>([]);
  const [regionMapVisible, setRegionMapVisible] = useState(false);
  const [mapOpenLoading, setMapOpenLoading] = useState(false);
  const [mapInitialRegion, setMapInitialRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);
  /** Erros de horário só após blur no campo ou após tentativa de guardar com horário inválido. Chave `dia-índice`. */
  const [timeTouchSlots, setTimeTouchSlots] = useState<Record<string, { s?: boolean; e?: boolean }>>({});
  const [showAllTimeErrors, setShowAllTimeErrors] = useState(false);
  const [slotLocsModal, setSlotLocsModal] = useState<{ day: DayKey; slotIndex: number } | null>(null);
  const [slotLocsDraft, setSlotLocsDraft] = useState<string[]>([]);
  const [slotLocsCity, setSlotLocsCity] = useState('');
  const [slotLocsFilter, setSlotLocsFilter] = useState('');
  const [slotMapRegion, setSlotMapRegion] = useState<Region | null>(null);
  /** Alfinete de referência (GPS ou cidade); arrastar só move o alfinete. */
  const [slotRefPin, setSlotRefPin] = useState<{ latitude: number; longitude: number } | null>(null);
  /** Rascunho de áreas por raio (km) no modal do turno — alinhado a `serviceAreaCircles` no servidor */
  const [slotCirclesDraft, setSlotCirclesDraft] = useState<TechServiceAreaCircle[]>([]);
  /** Texto do campo de raio por id (vírgula no teclado PT) — evita input controlado só por número. */
  const [slotCircleRadiusTextById, setSlotCircleRadiusTextById] = useState<Record<string, string>>({});
  const slotMapRef = useRef<MapView | null>(null);
  const slotModalScrollRef = useRef<ScrollView | null>(null);
  const slotModalScrollYRef = useRef(0);
  const keyboardHeightRef = useRef(0);
  /** iOS: altura do teclado para reduzir o mapa e aplicar padding sem KeyboardAvoidingView (que conflita com Modal e cria “buracos”). */
  const [slotModalKeyboardInset, setSlotModalKeyboardInset] = useState(0);
  const circleRadiusRowRefs = useRef<Record<string, View | null>>({});
  const focusedSlotCircleIdRef = useRef<string | null>(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const subShow = Keyboard.addListener(showEvt, (e) => {
      const h = e.endCoordinates?.height ?? 0;
      keyboardHeightRef.current = h;
      setSlotModalKeyboardInset(h);
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      keyboardHeightRef.current = 0;
      setSlotModalKeyboardInset(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const scrollSlotRadiusRowIntoView = useCallback(
    (circleId: string) => {
      const row = circleRadiusRowRefs.current[circleId];
      if (!row || !slotModalScrollRef.current) return;
      const winH = Dimensions.get('window').height;
      const kb =
        keyboardHeightRef.current || slotModalKeyboardInset || (Platform.OS === 'ios' ? 300 : 280);
      const margin = 20;
      const footerReserve = 72;
      const visibleBottom = winH - kb - margin - insets.bottom - footerReserve;
      const run = () => {
        row.measureInWindow((_ix, iy, _iw, ih) => {
          const bottom = iy + ih;
          if (bottom > visibleBottom) {
            const delta = bottom - visibleBottom + margin;
            slotModalScrollRef.current?.scrollTo({
              y: Math.max(0, slotModalScrollYRef.current + delta),
              animated: true,
            });
          }
        });
      };
      requestAnimationFrame(run);
      InteractionManager.runAfterInteractions(() => {
        setTimeout(run, 50);
        setTimeout(run, 200);
        setTimeout(run, 450);
      });
    },
    [insets.bottom, slotModalKeyboardInset]
  );

  useEffect(() => {
    if (!slotLocsModal || slotModalKeyboardInset <= 0) return;
    const id = focusedSlotCircleIdRef.current;
    if (!id) return;
    scrollSlotRadiusRowIntoView(id);
  }, [slotLocsModal, slotModalKeyboardInset, scrollSlotRadiusRowIntoView]);

  /** Altura do mapa só com teclado fechado; com teclado aberto o mapa é omitido (melhor uso do espaço). */
  const slotModalMapHeight = useMemo(() => {
    const winH = Dimensions.get('window').height;
    return Math.min(380, Math.max(220, Math.round(winH * 0.34)));
  }, []);

  const dayLabelFixed = (k: DayKey) => {
    const key = `day${k[0].toUpperCase()}${k.slice(1)}` as
      | 'dayMon'
      | 'dayTue'
      | 'dayWed'
      | 'dayThu'
      | 'dayFri'
      | 'daySat'
      | 'daySun';
    return t(`profile.scheduleRegions.${key}`);
  };

  const hydrateFromUser = useCallback(
    (u: User) => {
      const tech = u.technicianProfile;
      if (!tech) return;
      setSchedule(parseScheduleFromProfileJson(tech.workScheduleJson));
      setServiceLocIds(
        Array.isArray(tech.serviceLocationIds) ? tech.serviceLocationIds.map(String) : []
      );
      const gc = tech.serviceCoverageGeoJson;
      const hb = gc && typeof gc === 'object' ? (gc as { homeBase?: { latitude?: number; longitude?: number } }).homeBase : null;
      if (
        hb &&
        Number.isFinite(Number(hb.latitude)) &&
        Number.isFinite(Number(hb.longitude))
      ) {
        setCoverageCenter({ latitude: Number(hb.latitude), longitude: Number(hb.longitude) });
      } else {
        setCoverageCenter(null);
      }
      const r = gc && typeof gc === 'object' ? (gc as { radiusKm?: number | null; notes?: string | null }).radiusKm : null;
      setServiceCoverageRadiusKm(
        r != null && Number.isFinite(Number(r)) && Number(r) > 0 ? String(r) : '50'
      );
      const n = gc && typeof gc === 'object' ? (gc as { notes?: string | null }).notes : null;
      setServiceCoverageNotes(n ? String(n) : '');
      setTimeTouchSlots({});
      setShowAllTimeErrors(false);
    },
    []
  );

  const coverageRadiusMeters = useMemo(() => {
    const km = Number(serviceCoverageRadiusKm);
    if (!Number.isFinite(km) || km <= 0) return 0;
    return km * 1000;
  }, [serviceCoverageRadiusKm]);

  const buildCoverage = useCallback(() => {
    if (!user) return null;
    const addr = user.addressJson;
    if (!coverageCenter || coverageRadiusMeters <= 0) return null;
    return {
      homeBase: {
        latitude: coverageCenter.latitude,
        longitude: coverageCenter.longitude,
        address: (addr?.line1 || '').trim() || null,
        city: (addr?.city || '').trim() || null,
        state: (addr?.state || '').trim() || null,
        postalCode: (addr?.postalCode || '').trim() || null,
        countryCode: (addr?.countryCode || 'BR').trim() || 'BR',
      },
      radiusKm: Number(serviceCoverageRadiusKm) || 0,
      notes: serviceCoverageNotes.trim() || null,
    };
  }, [user, coverageCenter, coverageRadiusMeters, serviceCoverageRadiusKm, serviceCoverageNotes]);

  useEffect(() => {
    if (showAllTimeErrors && !findFirstInvalidEnabledTime(schedule)) {
      setShowAllTimeErrors(false);
    }
  }, [schedule, showAllTimeErrors]);

  const loadBases = useCallback(async () => {
    const rows = await AuthService.getTechnicianServiceBases();
    setBases(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      (async () => {
        try {
          await refreshUser();
          const fresh = await AuthService.getUser();
          if (!fresh || !isTechnicianProfileActive(fresh)) {
            Alert.alert(t('common.error'), t('profile.scheduleRegions.errorNotTech'), [
              { text: t('common.ok'), onPress: () => router.back() },
            ]);
            return;
          }
          try {
            const aff = await ProviderAffiliationsApi.getMeStatus();
            setReadOnlyDedicated(!!aff.skipSelfServiceOnboarding);
          } catch {
            setReadOnlyDedicated(false);
          }
          hydrateFromUser(fresh);
          await loadBases();
        } finally {
          setLoading(false);
        }
      })();
    }, [loadBases, hydrateFromUser, refreshUser, t, router])
  );

  const canEdit = !readOnlyDedicated;

  const openRegionsMap = async () => {
    if (!canEdit) return;
    const addr = user?.addressJson;
    const line1 = String(addr?.line1 || '').trim();
    const district = String(addr?.district || '').trim();
    const city = String(addr?.city || '').trim();
    const stateUf = String(addr?.state || '').trim();
    const postal = String(addr?.postalCode || '')
      .replace(/\D/g, '')
      .trim();
    const country = String(addr?.countryCode || 'BR').trim() || 'BR';
    setMapOpenLoading(true);
    try {
      const countryLabel = country === 'BR' || !country ? 'Brasil' : country;
      const parts = [line1, district, city, stateUf, postal].map((s) => String(s || '').trim()).filter(Boolean);
      let lat = -14.235;
      let lng = -51.9253;
      let centered = false;
      if (parts.length >= 2) {
        try {
          const geo = await Location.geocodeAsync(`${parts.join(', ')}, ${countryLabel}`);
          if (
            geo?.[0]?.latitude != null &&
            geo?.[0]?.longitude != null &&
            Number.isFinite(geo[0].latitude) &&
            Number.isFinite(geo[0].longitude)
          ) {
            lat = geo[0].latitude;
            lng = geo[0].longitude;
            centered = true;
          }
        } catch {
          /* */
        }
      }
      if (!centered && coverageCenter) {
        lat = coverageCenter.latitude;
        lng = coverageCenter.longitude;
      }
      const delta = 0.42;
      setMapInitialRegion({ latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta });
      if (!coverageCenter) {
        setCoverageCenter({ latitude: lat, longitude: lng });
      }
      setRegionMapVisible(true);
    } finally {
      setMapOpenLoading(false);
    }
  };

  const slotTouchKey = useCallback((day: DayKey, slot: TechScheduleSlot) => `${day}:${slot.id}`, []);

  const centerSlotMapCamera = useCallback((lat: number, lng: number, delta = 0.22) => {
    const r: Region = { latitude: lat, longitude: lng, latitudeDelta: delta, longitudeDelta: delta };
    setSlotMapRegion(r);
    setTimeout(() => slotMapRef.current?.animateToRegion(r, 380), 80);
  }, []);

  const addSlotForDay = useCallback((day: DayKey) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: [
        ...(prev[day] || []),
        { id: rid(), enabled: true, start: '08:00', end: '18:00', locationIds: [], serviceAreaCircles: [] },
      ],
    }));
  }, []);

  const removeSlotForDay = useCallback((day: DayKey, slotIndex: number, slotId: string) => {
    setSchedule((prev) => {
      const slots = [...(prev[day] || [])];
      if (slots.length <= 1) return prev;
      slots.splice(slotIndex, 1);
      return { ...prev, [day]: slots };
    });
    setTimeTouchSlots((p) => {
      const n = { ...p };
      delete n[`${day}:${slotId}`];
      return n;
    });
  }, []);

  const openSlotLocsModal = useCallback(
    (day: DayKey, slotIndex: number) => {
      if (readOnlyDedicated) return;
      const slot = schedule[day]?.[slotIndex];
      if (!slot) return;
      setSlotLocsDraft([...(slot.locationIds || [])]);
      const circles = (slot.serviceAreaCircles || []).map((c) => clampSlotCircle(c));
      setSlotCirclesDraft(circles);
      const texts: Record<string, string> = {};
      for (const c of circles) texts[c.id] = formatRadiusKmForField(c.radiusKm);
      setSlotCircleRadiusTextById(texts);
      setSlotLocsCity('');
      setSlotLocsFilter('');
      setSlotRefPin(null);
      setSlotMapRegion(null);
      setSlotLocsModal({ day, slotIndex });
      void (async () => {
        const ids = slot.locationIds || [];
        const locs = bases.filter(
          (b) =>
            ids.includes(b.id) &&
            b.latitude != null &&
            b.longitude != null &&
            Number.isFinite(Number(b.latitude)) &&
            Number.isFinite(Number(b.longitude))
        );
        if (locs.length) {
          const lat = locs.reduce((s, b) => s + Number(b.latitude), 0) / locs.length;
          const lng = locs.reduce((s, b) => s + Number(b.longitude), 0) / locs.length;
          setSlotMapRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.35, longitudeDelta: 0.35 });
          setSlotRefPin({ latitude: lat, longitude: lng });
          return;
        }
        try {
          const perm = await Location.requestForegroundPermissionsAsync();
          if (perm.status === 'granted') {
            const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            setSlotMapRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.25, longitudeDelta: 0.25 });
            setSlotRefPin({ latitude: lat, longitude: lng });
            return;
          }
        } catch {
          /* */
        }
        setSlotMapRegion({ latitude: -14.235, longitude: -51.9253, latitudeDelta: 8, longitudeDelta: 8 });
      })();
    },
    [schedule, bases, readOnlyDedicated]
  );

  const closeSlotLocsModal = useCallback(() => {
    Keyboard.dismiss();
    focusedSlotCircleIdRef.current = null;
    setSlotLocsModal(null);
    setSlotLocsDraft([]);
    setSlotCirclesDraft([]);
    setSlotCircleRadiusTextById({});
    setSlotMapRegion(null);
    setSlotRefPin(null);
    setSlotLocsCity('');
    setSlotLocsFilter('');
    setSlotModalKeyboardInset(0);
  }, []);

  const applySlotLocsModal = useCallback(() => {
    if (!slotLocsModal) return;
    const { day, slotIndex } = slotLocsModal;
    const normalizedCircles = slotCirclesDraft
      .map((c) => {
        const raw = slotCircleRadiusTextById[c.id];
        const parsed = raw !== undefined ? parseRadiusKmDisplay(raw) : null;
        const nextR = parsed != null ? parsed : c.radiusKm;
        return clampSlotCircle({ ...c, radiusKm: nextR });
      })
      .slice(0, MAX_SLOT_SERVICE_CIRCLES);
    setSchedule((prev) => {
      const n = { ...prev };
      const slots = [...(n[day] || [])];
      const cur = slots[slotIndex];
      if (!cur) return prev;
      slots[slotIndex] = { ...cur, locationIds: [...slotLocsDraft], serviceAreaCircles: normalizedCircles };
      n[day] = slots;
      return n;
    });
    closeSlotLocsModal();
  }, [slotLocsModal, slotLocsDraft, slotCirclesDraft, slotCircleRadiusTextById, closeSlotLocsModal]);

  const addSlotCircleAtRef = useCallback(() => {
    if (slotCirclesDraft.length >= MAX_SLOT_SERVICE_CIRCLES) {
      Alert.alert(t('common.error'), t('profile.scheduleRegions.slotCirclesMax'));
      return;
    }
    const p =
      slotRefPin ||
      (slotMapRegion
        ? { latitude: slotMapRegion.latitude, longitude: slotMapRegion.longitude }
        : null);
    if (!p) return;
    const nid = rid();
    setSlotCirclesDraft((prev) => [...prev, { id: nid, latitude: p.latitude, longitude: p.longitude, radiusKm: 10 }]);
    setSlotCircleRadiusTextById((prev) => ({ ...prev, [nid]: '10' }));
  }, [slotCirclesDraft.length, slotRefPin, slotMapRegion, t]);

  const removeSlotCircle = useCallback((id: string) => {
    setSlotCirclesDraft((prev) => prev.filter((c) => c.id !== id));
    setSlotCircleRadiusTextById((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    delete circleRadiusRowRefs.current[id];
  }, []);

  const updateSlotCircleCenter = useCallback((id: string, latitude: number, longitude: number) => {
    setSlotCirclesDraft((prev) => prev.map((c) => (c.id === id ? { ...c, latitude, longitude } : c)));
  }, []);

  const onSlotCircleRadiusTextChange = useCallback((id: string, text: string) => {
    const next = sanitizeRadiusKmInput(text);
    setSlotCircleRadiusTextById((prev) => ({ ...prev, [id]: next }));
    const parsed = parseRadiusKmDisplay(next);
    if (parsed == null) return;
    setSlotCirclesDraft((prev) =>
      prev.map((c) => (c.id === id ? clampSlotCircle({ ...c, radiusKm: parsed }) : c))
    );
  }, []);

  const goSlotCityGeocode = useCallback(async () => {
    const q = slotLocsCity.trim();
    if (!q) {
      Alert.alert(t('common.error'), t('profile.scheduleRegions.slotLocsCityEmpty'));
      return;
    }
    try {
      const geo = await Location.geocodeAsync(`${q}, Brasil`);
      const hit = geo?.[0];
      if (
        !hit ||
        hit.latitude == null ||
        hit.longitude == null ||
        !Number.isFinite(hit.latitude) ||
        !Number.isFinite(hit.longitude)
      ) {
        Alert.alert(t('common.error'), t('profile.scheduleRegions.slotLocsGeocodeError'));
        return;
      }
      setSlotRefPin({ latitude: hit.latitude, longitude: hit.longitude });
      centerSlotMapCamera(hit.latitude, hit.longitude, 0.18);
    } catch {
      Alert.alert(t('common.error'), t('profile.scheduleRegions.slotLocsGeocodeError'));
    }
  }, [slotLocsCity, centerSlotMapCamera, t]);

  const goSlotGps = useCallback(async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert(t('common.error'), t('profile.scheduleRegions.slotLocsGpsDenied'));
        return;
      }
      const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lat = p.coords.latitude;
      const lng = p.coords.longitude;
      setSlotRefPin({ latitude: lat, longitude: lng });
      centerSlotMapCamera(lat, lng, 0.14);
    } catch {
      Alert.alert(t('common.error'), t('profile.scheduleRegions.slotLocsGpsError'));
    }
  }, [centerSlotMapCamera, t]);

  const toggleSlotDraftLoc = useCallback((id: string) => {
    setSlotLocsDraft((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const basesForSlotModal = useMemo(() => {
    const f = slotLocsFilter.trim().toLowerCase();
    if (!f) return bases;
    return bases.filter(
      (b) =>
        b.name.toLowerCase().includes(f) ||
        String(b.address || '')
          .toLowerCase()
          .includes(f)
    );
  }, [bases, slotLocsFilter]);

  const onSave = async () => {
    if (!canEdit) return;
    if (!user || !isTechnicianProfileActive(user)) return;
    const inv = findFirstInvalidEnabledTime(schedule);
    if (inv) {
      setShowAllTimeErrors(true);
      const k = `day${inv.day[0].toUpperCase() + inv.day.slice(1)}` as
        | 'dayMon'
        | 'dayTue'
        | 'dayWed'
        | 'dayThu'
        | 'dayFri'
        | 'daySat'
        | 'daySun';
      const dayL = t(`profile.scheduleRegions.${k}`);
      const partL = inv.part === 'start' ? t('profile.scheduleRegions.startLabel') : t('profile.scheduleRegions.endLabel');
      Alert.alert(
        t('common.error'),
        t('profile.scheduleRegions.invalidTime', { day: dayL, part: partL, shift: inv.slotIndex + 1 })
      );
      return;
    }
    setSaving(true);
    try {
      const merged = await AuthService.patchMe({
        technicianWorkScheduleJson: schedule as unknown as Record<string, unknown>,
        technicianServiceLocationIds: serviceLocIds,
        technicianCoverageGeoJson: buildCoverage() ?? null,
      });
      if (merged) {
        hydrateFromUser(merged);
      }
      await refreshUser();
      setShowAllTimeErrors(false);
      setTimeTouchSlots({});
      Alert.alert(t('common.success'), t('profile.scheduleRegions.saveSuccess'));
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('profile.scheduleRegions.errorSave'));
    } finally {
      setSaving(false);
    }
  };

  const toggleBase = (id: string) => {
    setServiceLocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite },
        backRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 4 },
        backText: { color: C.accent, fontWeight: '800', fontSize: 16 },
        headTitle: { fontSize: 20, fontWeight: '900', color: C.slate, paddingHorizontal: 18, marginTop: 4 },
        headSub: { fontSize: 12, color: C.textSecondary, paddingHorizontal: 18, marginTop: 6, lineHeight: 18 },
        section: {
          marginHorizontal: 16,
          marginTop: 16,
          padding: 16,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.surfaceLow,
        },
        secTitle: { fontSize: 15, fontWeight: '800', color: C.slate, marginBottom: 8 },
        hint: { fontSize: 12, color: C.textSecondary, marginBottom: 12, lineHeight: 18 },
        label: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
        input: {
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: C.slate,
          marginBottom: 10,
          backgroundColor: C.cardWhite,
        },
        dayCard: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border },
        dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        row2: { flexDirection: 'row', gap: 12, marginTop: 10 },
        flex1: { flex: 1 },
        mapBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.accent,
          backgroundColor: C.cardWhite,
        },
        saveBtn: {
          marginHorizontal: 16,
          marginTop: 20,
          paddingVertical: 14,
          borderRadius: 14,
          backgroundColor: C.accent,
          alignItems: 'center',
        },
        saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
        baseChip: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          borderWidth: 1,
          marginRight: 8,
          marginBottom: 8,
        },
        mapModalRoot: { flex: 1, backgroundColor: C.cardWhite },
        mapModalHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingBottom: 8,
        },
        dayHeaderRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        },
        dayName: { fontWeight: '800', fontSize: 15, color: C.slate },
        addSlotBtn: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 10,
          backgroundColor: C.accent,
        },
        addSlotBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
        slotCard: {
          marginTop: 10,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: C.border,
        },
        slotTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        removeSlotBtn: {
          width: 36,
          height: 36,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: C.cardWhite,
        },
        slotLocsRow: { marginTop: 10, gap: 8 },
        locChipsScroll: { flexGrow: 0 },
        locChip: {
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 999,
          borderWidth: 1,
          marginRight: 8,
          maxWidth: 200,
        },
        locChipText: { fontSize: 12, fontWeight: '700', color: C.slate },
        slotMapOpenBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.accent,
          backgroundColor: C.cardWhite,
        },
        slotModalRoot: { flex: 1, backgroundColor: C.cardWhite },
        slotModalActions: {
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 8,
          borderTopWidth: 1,
          borderTopColor: C.border,
        },
        slotModalBtnSecondary: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.border,
          alignItems: 'center',
          backgroundColor: C.surfaceLow,
        },
        slotModalBtnPrimary: {
          flex: 1,
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: 'center',
          backgroundColor: C.accent,
        },
        slotModalBtnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
        slotModalBtnSecondaryText: { color: C.slate, fontWeight: '800', fontSize: 15 },
        slotCityRow: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
        slotCityInput: {
          flex: 1,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: C.slate,
          backgroundColor: C.cardWhite,
        },
        slotMiniBtn: {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: C.accent,
        },
        slotMiniBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
        slotGpsBtn: {
          paddingVertical: 10,
          paddingHorizontal: 12,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.surfaceLow,
        },
        slotCirclesToolbar: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          marginBottom: 8,
          gap: 10,
        },
        slotCirclesList: { paddingHorizontal: 16, marginBottom: 8 },
        slotCircleRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 8,
          paddingHorizontal: 10,
          marginBottom: 6,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.cardWhite,
        },
        slotCircleRadiusInput: {
          width: 96,
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 8,
          paddingHorizontal: 8,
          paddingVertical: 6,
          fontSize: 14,
          color: C.slate,
          backgroundColor: C.surfaceLow,
        },
        slotCircleRm: { paddingVertical: 6, paddingHorizontal: 8 },
      }),
    [C]
  );

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={C.accent} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={{ height: insets.top }} />
      <View style={styles.backRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 6 }}
        >
          <Ionicons name="chevron-back" size={22} color={C.accent} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headTitle}>{t('profile.scheduleRegions.title')}</Text>
      <Text style={styles.headSub}>{t('profile.scheduleRegions.subtitle')}</Text>
      {readOnlyDedicated ? (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 10,
            padding: 12,
            borderRadius: 12,
            backgroundColor: `${C.accent}14`,
            borderWidth: 1,
            borderColor: `${C.accent}55`,
          }}
        >
          <Text style={{ fontSize: 13, color: C.slate, lineHeight: 20, fontWeight: '600' }}>
            {t('profile.scheduleRegions.readOnlyDedicatedBanner')}
          </Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.secTitle}>{t('profile.scheduleRegions.sectionSchedule')}</Text>
          <Text style={styles.hint}>{t('profile.scheduleRegions.sectionScheduleHint')}</Text>
          {TECH_SCHEDULE_DAY_ORDER.map((key) => {
            const slots = schedule[key] || [];
            return (
              <View key={key} style={styles.dayCard}>
                <View style={styles.dayHeaderRow}>
                  <Text style={styles.dayName}>{dayLabelFixed(key)}</Text>
                  {canEdit ? (
                    <TouchableOpacity style={styles.addSlotBtn} onPress={() => addSlotForDay(key)} activeOpacity={0.85}>
                      <Text style={styles.addSlotBtnText}>{t('profile.scheduleRegions.addShiftOnDay')}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={{ minWidth: 8 }} />
                  )}
                </View>
                {slots.map((slot, idx) => {
                  const startTrim = String(slot.start || '').trim();
                  const endTrim = String(slot.end || '').trim();
                  const tk = slotTouchKey(key, slot);
                  const touch = timeTouchSlots[tk] || {};
                  const startErr =
                    slot.enabled && !isValidHhMm(startTrim) && (touch.s || showAllTimeErrors);
                  const endErr = slot.enabled && !isValidHhMm(endTrim) && (touch.e || showAllTimeErrors);
                  const timeHint = startErr || endErr ? t('common.timeFormat24Hint') : null;
                  return (
                    <View key={slot.id} style={idx === 0 ? { marginTop: 0 } : styles.slotCard}>
                      <View style={styles.slotTopRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 13, color: C.textSecondary }}>{t('profile.scheduleRegions.activeLabel')}</Text>
                          <Switch
                            value={slot.enabled}
                            disabled={!canEdit}
                            onValueChange={(v) => {
                              setSchedule((prev) => {
                                const n = { ...prev };
                                const list = [...(n[key] || [])];
                                list[idx] = { ...slot, enabled: v };
                                n[key] = list;
                                return n;
                              });
                            }}
                            trackColor={{ false: C.border, true: `${C.accent}88` }}
                            thumbColor={slot.enabled ? C.accent : '#f4f4f5'}
                          />
                        </View>
                        {canEdit && slots.length > 1 ? (
                          <TouchableOpacity
                            style={styles.removeSlotBtn}
                            onPress={() => removeSlotForDay(key, idx, slot.id)}
                            accessibilityLabel={t('profile.scheduleRegions.removeShift')}
                          >
                            <Ionicons name="close" size={20} color={C.slate} />
                          </TouchableOpacity>
                        ) : (
                          <View style={{ width: 36 }} />
                        )}
                      </View>
                      <View style={[styles.row2, { opacity: slot.enabled ? 1 : 0.45 }]}>
                        <View style={styles.flex1}>
                          <Text style={[styles.label, startErr && { color: '#B91C1C' }]}>
                            {t('profile.scheduleRegions.startLabel')}
                          </Text>
                          <TextInput
                            style={[styles.input, startErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                            value={slot.start}
                            editable={canEdit && slot.enabled}
                            onChangeText={(txt) => {
                              setSchedule((prev) => {
                                const n = { ...prev };
                                const list = [...(n[key] || [])];
                                list[idx] = { ...slot, start: txt };
                                n[key] = list;
                                return n;
                              });
                            }}
                            onBlur={() =>
                              setTimeTouchSlots((p) => ({
                                ...p,
                                [tk]: { ...p[tk], s: true },
                              }))
                            }
                            placeholder={t('profile.scheduleRegions.timePlaceholder')}
                          />
                        </View>
                        <View style={styles.flex1}>
                          <Text style={[styles.label, endErr && { color: '#B91C1C' }]}>
                            {t('profile.scheduleRegions.endLabel')}
                          </Text>
                          <TextInput
                            style={[styles.input, endErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                            value={slot.end}
                            editable={canEdit && slot.enabled}
                            onChangeText={(txt) => {
                              setSchedule((prev) => {
                                const n = { ...prev };
                                const list = [...(n[key] || [])];
                                list[idx] = { ...slot, end: txt };
                                n[key] = list;
                                return n;
                              });
                            }}
                            onBlur={() =>
                              setTimeTouchSlots((p) => ({
                                ...p,
                                [tk]: { ...p[tk], e: true },
                              }))
                            }
                            placeholder="18:00"
                          />
                        </View>
                      </View>
                      {timeHint ? (
                        <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, lineHeight: 16, fontWeight: '600' }}>
                          {timeHint}
                        </Text>
                      ) : null}
                      <Text style={[styles.label, { marginTop: 10 }]}>{t('profile.scheduleRegions.slotBasesLabel')}</Text>
                      <Text style={{ fontSize: 11, color: C.textSecondary, marginBottom: 6, lineHeight: 16 }}>
                        {t('profile.scheduleRegions.slotBasesHint')}
                      </Text>
                      <View style={styles.slotLocsRow}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.locChipsScroll}>
                          {(slot.locationIds || []).length === 0 ? (
                            <Text style={{ fontSize: 12, color: C.textLight, alignSelf: 'center', paddingVertical: 6 }}>
                              {t('profile.scheduleRegions.slotBasesEmpty')}
                            </Text>
                          ) : (
                            (slot.locationIds || []).map((locId) => {
                              const b = bases.find((x) => x.id === locId);
                              const chipInner = (
                                <Text style={styles.locChipText} numberOfLines={1}>
                                  {(b?.name || locId) + (canEdit ? ' ×' : '')}
                                </Text>
                              );
                              return canEdit ? (
                                <TouchableOpacity
                                  key={locId}
                                  onPress={() => {
                                    setSchedule((prev) => {
                                      const n = { ...prev };
                                      const list = [...(n[key] || [])];
                                      const cur = list[idx];
                                      if (!cur) return prev;
                                      list[idx] = {
                                        ...cur,
                                        locationIds: (cur.locationIds || []).filter((x) => x !== locId),
                                      };
                                      n[key] = list;
                                      return n;
                                    });
                                  }}
                                  style={[styles.locChip, { borderColor: C.accent, backgroundColor: `${C.accent}18` }]}
                                  activeOpacity={0.75}
                                >
                                  {chipInner}
                                </TouchableOpacity>
                              ) : (
                                <View
                                  key={locId}
                                  style={[styles.locChip, { borderColor: C.accent, backgroundColor: `${C.accent}18` }]}
                                >
                                  {chipInner}
                                </View>
                              );
                            })
                          )}
                        </ScrollView>
                        <TouchableOpacity
                          style={styles.slotMapOpenBtn}
                          onPress={() => openSlotLocsModal(key, idx)}
                          activeOpacity={0.85}
                          disabled={!canEdit}
                        >
                          <Ionicons name="map-outline" size={18} color={C.accent} />
                          <Text style={{ color: C.accent, fontWeight: '800', fontSize: 13 }}>
                            {t('profile.scheduleRegions.slotLocsMapButton')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {(slot.serviceAreaCircles?.length ?? 0) > 0 ? (
                        <Text style={{ fontSize: 11, color: C.textSecondary, marginTop: 4 }}>
                          {t('profile.scheduleRegions.slotCirclesSummary', {
                            n: String(slot.serviceAreaCircles?.length ?? 0),
                          })}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.secTitle}>{t('profile.scheduleRegions.sectionBases')}</Text>
          <Text style={styles.hint}>{t('profile.scheduleRegions.sectionBasesHint')}</Text>
          {bases.length === 0 ? (
            <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>{t('profile.scheduleRegions.emptyBases')}</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {bases.map((b) => {
                const on = serviceLocIds.includes(b.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => toggleBase(b.id)}
                    disabled={!canEdit}
                    style={[
                      styles.baseChip,
                      {
                        borderColor: on ? C.accent : C.border,
                        backgroundColor: on ? `${C.accent}20` : C.cardWhite,
                        opacity: canEdit ? 1 : 0.85,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.slate }} numberOfLines={2}>
                      {b.name}
                    </Text>
                    {b.address ? (
                      <Text style={{ fontSize: 10, color: C.textLight, marginTop: 2 }} numberOfLines={1}>
                        {b.address}
                      </Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.secTitle}>{t('profile.scheduleRegions.sectionCoverage')}</Text>
          <Text style={styles.hint}>{t('profile.scheduleRegions.sectionCoverageHint')}</Text>
          <Text style={styles.label}>{t('profile.scheduleRegions.radiusLabel')}</Text>
          <TextInput
            style={styles.input}
            value={serviceCoverageRadiusKm}
            onChangeText={(v) => setServiceCoverageRadiusKm(v.replace(/[^0-9.,]/g, '').replace(',', '.'))}
            placeholder="50"
            keyboardType="decimal-pad"
            editable={canEdit}
          />
          <Text style={{ fontSize: 11, color: C.textLight, marginBottom: 10, lineHeight: 16 }}>{t('profile.scheduleRegions.radiusHint')}</Text>
          <TouchableOpacity
            style={[styles.mapBtn, { opacity: mapOpenLoading || !canEdit ? 0.65 : 1 }]}
            onPress={() => void openRegionsMap()}
            disabled={mapOpenLoading || !canEdit}
          >
            {mapOpenLoading ? <ActivityIndicator color={C.accent} size="small" /> : <Ionicons name="map-outline" size={22} color={C.accent} />}
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 15 }}>{t('profile.scheduleRegions.openMap')}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: C.slate, fontWeight: '700', marginTop: 8 }}>
            {coverageCenter
              ? t('profile.scheduleRegions.currentCenter', {
                  lat: coverageCenter.latitude.toFixed(5),
                  lng: coverageCenter.longitude.toFixed(5),
                })
              : t('profile.scheduleRegions.noCenter')}
          </Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 4 }}>
            {coverageRadiusMeters > 0
              ? t('profile.scheduleRegions.currentRadius', { km: String(Number(serviceCoverageRadiusKm || 0)) })
              : t('profile.scheduleRegions.radiusZero')}
          </Text>
          <Text style={[styles.label, { marginTop: 12 }]}>{t('profile.scheduleRegions.notesLabel')}</Text>
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
            value={serviceCoverageNotes}
            onChangeText={setServiceCoverageNotes}
            placeholder={t('profile.scheduleRegions.notesPlaceholder')}
            multiline
            editable={canEdit}
          />
        </View>
      </ScrollView>

      {canEdit ? (
        <TouchableOpacity
          style={[styles.saveBtn, { marginBottom: 16 + insets.bottom }]}
          onPress={() => void onSave()}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('profile.scheduleRegions.save')}</Text>}
        </TouchableOpacity>
      ) : (
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 12,
            marginBottom: 16 + insets.bottom,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 12,
            backgroundColor: C.surfaceLow,
            borderWidth: 1,
            borderColor: C.border,
          }}
        >
          <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20, textAlign: 'center', fontWeight: '600' }}>
            {t('profile.scheduleRegions.readOnlyFooter')}
          </Text>
        </View>
      )}

      <Modal visible={regionMapVisible} animationType="slide" onRequestClose={() => setRegionMapVisible(false)}>
        <View style={[styles.mapModalRoot, { paddingTop: Platform.OS === 'ios' ? 52 : 36 }]}>
          <View style={styles.mapModalHeader}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.slate, flex: 1 }}>{t('profile.scheduleRegions.mapTitle')}</Text>
            <TouchableOpacity
              onPress={() => setRegionMapVisible(false)}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>{t('profile.scheduleRegions.mapClose')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 12, color: C.textSecondary, paddingHorizontal: 16, marginBottom: 8, lineHeight: 18 }}>
            {t('profile.scheduleRegions.mapHelp')}
          </Text>
          {mapInitialRegion ? (
            <MapView
              style={{ flex: 1 }}
              initialRegion={mapInitialRegion}
              showsUserLocation={false}
              onPress={
                canEdit
                  ? (e) => {
                      setCoverageCenter({
                        latitude: e.nativeEvent.coordinate.latitude,
                        longitude: e.nativeEvent.coordinate.longitude,
                      });
                    }
                  : undefined
              }
            >
              {coverageCenter ? (
                <>
                  <Circle
                    center={coverageCenter}
                    radius={coverageRadiusMeters || 1}
                    strokeColor={C.accent}
                    fillColor={`${C.accent}28`}
                    strokeWidth={2}
                  />
                  <Marker
                    coordinate={coverageCenter}
                    title={t('profile.scheduleRegions.mapTitle')}
                    description={t('profile.scheduleRegions.mapHelp')}
                    tracksViewChanges={false}
                  />
                </>
              ) : null}
            </MapView>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: C.textSecondary }}>{t('common.loading')}</Text>
            </View>
          )}
        </View>
      </Modal>

      <Modal visible={!!slotLocsModal} animationType="slide" onRequestClose={closeSlotLocsModal}>
        <View
          style={[
            styles.slotModalRoot,
            {
              paddingTop: insets.top + 8,
              paddingBottom: Platform.OS === 'ios' ? slotModalKeyboardInset : 0,
            },
          ]}
        >
          <View style={styles.mapModalHeader}>
            <Text style={{ fontSize: 17, fontWeight: '800', color: C.slate, flex: 1 }}>
              {t('profile.scheduleRegions.slotLocsModalTitle')}
            </Text>
            <TouchableOpacity onPress={closeSlotLocsModal} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={26} color={C.slate} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={slotModalScrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 20 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            showsVerticalScrollIndicator
            onScroll={(e) => {
              slotModalScrollYRef.current = e.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
          >
          <Text style={{ fontSize: 12, color: C.textSecondary, paddingHorizontal: 16, marginBottom: 8, lineHeight: 18 }}>
            {t('profile.scheduleRegions.slotLocsMapHelp')}
          </Text>
          {slotModalKeyboardInset > 0 ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                Keyboard.dismiss();
              }}
              style={{
                marginHorizontal: 16,
                marginBottom: 10,
                paddingVertical: 14,
                paddingHorizontal: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.surfaceLow,
              }}
            >
              <Text style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', lineHeight: 20 }}>
                {t('profile.scheduleRegions.slotLocsMapTypingBanner')}
              </Text>
            </TouchableOpacity>
          ) : (
            <View
              style={{
                height: slotModalMapHeight,
                marginHorizontal: 16,
                marginBottom: 10,
                borderRadius: 12,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              {slotMapRegion ? (
                <MapView
                  ref={(r) => {
                    slotMapRef.current = r;
                  }}
                  style={{ flex: 1 }}
                  initialRegion={slotMapRegion}
                  showsUserLocation
                >
                  {bases.map((b) => {
                    if (
                      b.latitude == null ||
                      b.longitude == null ||
                      !Number.isFinite(Number(b.latitude)) ||
                      !Number.isFinite(Number(b.longitude))
                    ) {
                      return null;
                    }
                    const sel = slotLocsDraft.includes(b.id);
                    return (
                      <Marker
                        key={b.id}
                        coordinate={{ latitude: Number(b.latitude), longitude: Number(b.longitude) }}
                        title={b.name}
                        pinColor={sel ? '#0d9488' : '#9CA3AF'}
                        onPress={() => toggleSlotDraftLoc(b.id)}
                      />
                    );
                  })}
                  {slotCirclesDraft.map((c) => (
                    <Circle
                      key={`slot-circ-${c.id}`}
                      center={{ latitude: c.latitude, longitude: c.longitude }}
                      radius={previewRadiusKmForCircle(c, slotCircleRadiusTextById) * 1000}
                      strokeColor={C.accent}
                      fillColor={`${C.accent}26`}
                      strokeWidth={2}
                    />
                  ))}
                  {slotCirclesDraft.map((c) => (
                    <Marker
                      key={`slot-cm-${c.id}`}
                      coordinate={{ latitude: c.latitude, longitude: c.longitude }}
                      draggable
                      pinColor="#0d9488"
                      onDragEnd={(e) =>
                        updateSlotCircleCenter(c.id, e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude)
                      }
                    />
                  ))}
                  {slotRefPin ? (
                    <Marker
                      coordinate={slotRefPin}
                      draggable
                      pinColor="red"
                      onDragEnd={(e) => setSlotRefPin(e.nativeEvent.coordinate)}
                    />
                  ) : null}
                </MapView>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
                  <ActivityIndicator color={C.accent} size="large" />
                </View>
              )}
            </View>
          )}
          <TextInput
            style={[styles.input, { marginHorizontal: 16, marginBottom: 8 }]}
            value={slotLocsFilter}
            onChangeText={setSlotLocsFilter}
            placeholder={t('profile.scheduleRegions.slotLocsFilterPlaceholder')}
          />
          <ScrollView
            style={{ maxHeight: 96, paddingHorizontal: 16 }}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {basesForSlotModal.map((b) => {
                const on = slotLocsDraft.includes(b.id);
                return (
                  <TouchableOpacity
                    key={b.id}
                    onPress={() => toggleSlotDraftLoc(b.id)}
                    style={[
                      styles.baseChip,
                      {
                        borderColor: on ? C.accent : C.border,
                        backgroundColor: on ? `${C.accent}20` : C.cardWhite,
                        marginBottom: 8,
                      },
                    ]}
                    activeOpacity={0.75}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '700', color: C.slate }} numberOfLines={2}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
          <View style={styles.slotCityRow}>
            <TextInput
              style={styles.slotCityInput}
              value={slotLocsCity}
              onChangeText={setSlotLocsCity}
              placeholder={t('profile.scheduleRegions.slotLocsCityPlaceholder')}
              onSubmitEditing={() => void goSlotCityGeocode()}
              returnKeyType="search"
            />
            <TouchableOpacity style={styles.slotMiniBtn} onPress={() => void goSlotCityGeocode()}>
              <Text style={styles.slotMiniBtnText}>{t('profile.scheduleRegions.slotLocsGoCity')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.slotGpsBtn}
              onPress={() => void goSlotGps()}
              accessibilityLabel={t('profile.scheduleRegions.slotLocsGps')}
            >
              <Ionicons name="navigate" size={20} color={C.accent} />
            </TouchableOpacity>
          </View>
          <View style={styles.slotCirclesToolbar}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: C.slate, flex: 1 }}>
              {t('profile.scheduleRegions.slotCirclesTitle')}
            </Text>
            <TouchableOpacity style={styles.addSlotBtn} onPress={addSlotCircleAtRef} activeOpacity={0.85}>
              <Text style={styles.addSlotBtnText}>{t('profile.scheduleRegions.slotCirclesAdd')}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.slotCirclesList}>
            {slotCirclesDraft.length === 0 ? (
              <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
                {t('profile.scheduleRegions.slotCirclesEmpty')}
              </Text>
            ) : (
              slotCirclesDraft.map((c, i) => (
                <View
                  key={c.id}
                  ref={(el) => {
                    circleRadiusRowRefs.current[c.id] = el;
                  }}
                  collapsable={false}
                  style={styles.slotCircleRow}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>#{i + 1}</Text>
                  <Text style={{ fontSize: 11, color: C.textSecondary }}>{t('profile.scheduleRegions.slotCircleRadiusKm')}</Text>
                  <TextInput
                    style={styles.slotCircleRadiusInput}
                    value={slotCircleRadiusTextById[c.id] ?? formatRadiusKmForField(c.radiusKm)}
                    onChangeText={(txt) => onSlotCircleRadiusTextChange(c.id, txt)}
                    onFocus={() => {
                      focusedSlotCircleIdRef.current = c.id;
                      scrollSlotRadiusRowIntoView(c.id);
                    }}
                    onBlur={() => {
                      if (focusedSlotCircleIdRef.current === c.id) focusedSlotCircleIdRef.current = null;
                    }}
                    onEndEditing={(e) => {
                      const raw = sanitizeRadiusKmInput(e.nativeEvent.text);
                      const parsed = parseRadiusKmDisplay(raw);
                      setSlotCirclesDraft((prev) =>
                        prev.map((x) => {
                          if (x.id !== c.id) return x;
                          const nextR = parsed != null ? parsed : x.radiusKm;
                          return clampSlotCircle({ ...x, radiusKm: nextR });
                        })
                      );
                      const km =
                        parsed != null ? clampSlotCircle({ ...c, radiusKm: parsed }).radiusKm : clampSlotCircle(c).radiusKm;
                      setSlotCircleRadiusTextById((prev) => ({ ...prev, [c.id]: formatRadiusKmForField(km) }));
                    }}
                    keyboardType="decimal-pad"
                    returnKeyType="done"
                    blurOnSubmit
                    editable
                  />
                  <Text style={{ fontSize: 11, color: C.textSecondary }}>km</Text>
                  <TouchableOpacity style={styles.slotCircleRm} onPress={() => removeSlotCircle(c.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={20} color="#B91C1C" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
          </ScrollView>
          <View style={[styles.slotModalActions, { paddingBottom: 12 + insets.bottom }]}>
            <TouchableOpacity style={styles.slotModalBtnSecondary} onPress={closeSlotLocsModal}>
              <Text style={styles.slotModalBtnSecondaryText}>{t('profile.scheduleRegions.slotLocsCancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.slotModalBtnPrimary}
              onPress={() => {
                Keyboard.dismiss();
                applySlotLocsModal();
              }}
            >
              <Text style={styles.slotModalBtnPrimaryText}>{t('profile.scheduleRegions.slotLocsApply')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
