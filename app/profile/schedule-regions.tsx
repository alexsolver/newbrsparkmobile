/**
 * Prestador ACTIVE: edita horário semanal, bases (Location) e cobertura geográfica.
 * Dados: PUT /api/me (AuthService.patchMe) + refreshUser.
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
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';
import { AuthService, isTechnicianProfileActive, type User } from '../../src/services/auth';
import {
  TECH_SCHEDULE_DAY_ORDER,
  type TechScheduleDayKey,
  defaultSchedule,
  parseScheduleFromProfileJson,
  findFirstInvalidEnabledTime,
  isValidHhMm,
} from '../../src/lib/technicianScheduleForm';

type DayKey = TechScheduleDayKey;

type BaseRow = { id: string; name: string; type?: string; address?: string | null };

export default function ScheduleRegionsScreen() {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const hydratedRef = useRef(false);

  const [loading, setLoading] = useState(true);
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
  /** Erros de horário só após blur no campo ou após tentativa de guardar com horário inválido. */
  const [timeTouchByDay, setTimeTouchByDay] = useState<Record<string, { s?: boolean; e?: boolean }>>({});
  const [showAllTimeErrors, setShowAllTimeErrors] = useState(false);

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
      setTimeTouchByDay({});
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
    hydratedRef.current = false;
  }, [user?.id]);

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
      if (!user || !isTechnicianProfileActive(user)) {
        Alert.alert(t('common.error'), t('profile.scheduleRegions.errorNotTech'), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
        return;
      }
      setLoading(true);
      (async () => {
        try {
          if (!hydratedRef.current) {
            hydrateFromUser(user);
            hydratedRef.current = true;
          }
          await loadBases();
        } finally {
          setLoading(false);
        }
      })();
    }, [user, loadBases, hydrateFromUser, t, router])
  );

  const openRegionsMap = async () => {
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

  const onSave = async () => {
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
      Alert.alert(t('common.error'), t('profile.scheduleRegions.invalidTime', { day: dayL, part: partL }));
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
        hydratedRef.current = true;
      }
      await refreshUser();
      setShowAllTimeErrors(false);
      setTimeTouchByDay({});
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

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.secTitle}>{t('profile.scheduleRegions.sectionSchedule')}</Text>
          <Text style={styles.hint}>{t('profile.scheduleRegions.sectionScheduleHint')}</Text>
          {TECH_SCHEDULE_DAY_ORDER.map((key) => {
            const slot = schedule[key]?.[0] || { enabled: false, start: '08:00', end: '18:00' };
            const startTrim = String(slot.start || '').trim();
            const endTrim = String(slot.end || '').trim();
            const touch = timeTouchByDay[key] || {};
            const startErr =
              slot.enabled && !isValidHhMm(startTrim) && (touch.s || showAllTimeErrors);
            const endErr =
              slot.enabled && !isValidHhMm(endTrim) && (touch.e || showAllTimeErrors);
            const timeHint = startErr || endErr ? t('common.timeFormat24Hint') : null;
            return (
              <View key={key} style={styles.dayCard}>
                <View style={styles.dayRow}>
                  <Text style={{ fontWeight: '800', fontSize: 15, color: C.slate }}>{dayLabelFixed(key)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, color: C.textSecondary }}>{t('profile.scheduleRegions.dayAvailable')}</Text>
                    <Switch
                      value={slot.enabled}
                      onValueChange={(v) => {
                        const n = { ...schedule };
                        n[key] = [{ ...slot, enabled: v }];
                        setSchedule(n);
                      }}
                      trackColor={{ false: C.border, true: `${C.accent}88` }}
                      thumbColor={slot.enabled ? C.accent : '#f4f4f5'}
                    />
                  </View>
                </View>
                <View style={[styles.row2, { opacity: slot.enabled ? 1 : 0.45 }]}>
                  <View style={styles.flex1}>
                    <Text style={[styles.label, startErr && { color: '#B91C1C' }]}>{t('profile.scheduleRegions.startLabel')}</Text>
                    <TextInput
                      style={[styles.input, startErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                      value={slot.start}
                      editable={slot.enabled}
                      onChangeText={(txt) => {
                        const n = { ...schedule };
                        n[key] = [{ ...slot, start: txt }];
                        setSchedule(n);
                      }}
                      onBlur={() =>
                        setTimeTouchByDay((p) => ({
                          ...p,
                          [key]: { ...p[key], s: true },
                        }))
                      }
                      placeholder={t('profile.scheduleRegions.timePlaceholder')}
                    />
                  </View>
                  <View style={styles.flex1}>
                    <Text style={[styles.label, endErr && { color: '#B91C1C' }]}>{t('profile.scheduleRegions.endLabel')}</Text>
                    <TextInput
                      style={[styles.input, endErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                      value={slot.end}
                      editable={slot.enabled}
                      onChangeText={(txt) => {
                        const n = { ...schedule };
                        n[key] = [{ ...slot, end: txt }];
                        setSchedule(n);
                      }}
                      onBlur={() =>
                        setTimeTouchByDay((p) => ({
                          ...p,
                          [key]: { ...p[key], e: true },
                        }))
                      }
                      placeholder="18:00"
                    />
                  </View>
                </View>
                {timeHint ? (
                  <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, lineHeight: 16, fontWeight: '600' }}>{timeHint}</Text>
                ) : null}
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
                    style={[
                      styles.baseChip,
                      {
                        borderColor: on ? C.accent : C.border,
                        backgroundColor: on ? `${C.accent}20` : C.cardWhite,
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
          />
          <Text style={{ fontSize: 11, color: C.textLight, marginBottom: 10, lineHeight: 16 }}>{t('profile.scheduleRegions.radiusHint')}</Text>
          <TouchableOpacity
            style={[styles.mapBtn, { opacity: mapOpenLoading ? 0.65 : 1 }]}
            onPress={() => void openRegionsMap()}
            disabled={mapOpenLoading}
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
          />
        </View>
      </ScrollView>

      <TouchableOpacity
        style={[styles.saveBtn, { marginBottom: 16 + insets.bottom }]}
        onPress={() => void onSave()}
        disabled={saving}
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('profile.scheduleRegions.save')}</Text>}
      </TouchableOpacity>

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
              onPress={(e) => {
                setCoverageCenter({
                  latitude: e.nativeEvent.coordinate.latitude,
                  longitude: e.nativeEvent.coordinate.longitude,
                });
              }}
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
    </View>
  );
}
