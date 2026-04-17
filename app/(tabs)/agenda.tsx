import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SectionList, LayoutAnimation, UIManager, Platform, ScrollView, useWindowDimensions, Modal, Pressable } from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, WeekCalendar, CalendarProvider, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { useAppContext } from '../../src/context/AppContext';
import { AgendaService, type AgendaScope } from '../../src/services/agendaService';
import { userHasCapability } from '../../src/services/auth';
import type { AgendaEvent } from '../../src/types/agenda';
import { getLocalAssets } from '../../src/database/index';
import { LocationZoneTypeBadge } from '../../src/components/LocationZoneTypeBadge';
import { ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { cacheChecklistTemplateIfMissing } from '../../src/services/routineTaskService';
import {
  AGENDA_DAY_SLOT_MINUTES,
  type AgendaEventInterval,
  assignNonOverlappingLanes,
  buildAgendaEventIntervals,
  clipAgendaEventToLocalCalendarWindow,
  computeTimedAgendaSegments,
  endOfAgendaYmdLocal,
  parseAgendaYmdLocal,
} from '../../src/utils/agendaSlotLayout';

/** Largura em px de cada coluna de 5 min na vista «HOJE» (referência visual). */
const DAY_TIMELINE_SLOT_W = 6;

/** Número de dias na linha de tempo da vista «HOJE» (scroll horizontal). */
const HOJE_VIEW_DAY_COUNT = 7;

const MINUTES_PER_DAY = 24 * 60;
/** Posicionamento temporal: sempre proporcional aos minutos (base 5 min = `DAY_TIMELINE_SLOT_W`). */
const HOJE_PX_PER_MINUTE = DAY_TIMELINE_SLOT_W / AGENDA_DAY_SLOT_MINUTES;

// Configura idioma do calendário para Português
LocaleConfig.locales['pt-br'] = {
  monthNames: ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
  monthNamesShort: ['Jan.','Fev.','Mar.','Abr.','Mai.','Jun.','Jul.','Ago.','Set.','Out.','Nov.','Dez.'],
  dayNames: ['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'],
  dayNamesShort: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'pt-br';

const toDateString = (d: Date) => d.toISOString().split('T')[0];
const toLocalYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getTodayString = () => toLocalYmd(new Date());

/** Dias de calendário cobertos pelo evento (bloco horário ou legado por data). */
function collectAgendaDayKeys(ev: AgendaEvent): string[] {
  if (ev.agendaStartAt && ev.agendaEndAt) {
    const s = new Date(ev.agendaStartAt);
    const e = new Date(ev.agendaEndAt);
    if (!Number.isFinite(s.getTime()) || !Number.isFinite(e.getTime())) return [];
    const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const endD = new Date(e.getFullYear(), e.getMonth(), e.getDate());
    const days: string[] = [];
    while (cur.getTime() <= endD.getTime()) {
      days.push(toLocalYmd(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days.length ? days : [toLocalYmd(s)];
  }
  const start = parseAgendaYmdLocal(ev.startDate);
  const end = parseAgendaYmdLocal(ev.endDate);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return [];
  const days: string[] = [];
  let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (current.getTime() <= endDay.getTime()) {
    days.push(toLocalYmd(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function canOpenChecklistActivity(ev: AgendaEvent): boolean {
  if (ev.source !== 'CHECKLIST') return false;
  const r = ev.refId != null ? String(ev.refId).trim() : '';
  return r.length > 0 && r !== 'null';
}

function formatEventPeriod(ev: AgendaEvent, locale: string): string | null {
  const tag = locale.startsWith('en') ? 'en-US' : locale.startsWith('es') ? 'es-ES' : 'pt-BR';
  if (ev.agendaStartAt && ev.agendaEndAt) {
    const s = new Date(ev.agendaStartAt);
    const e = new Date(ev.agendaEndAt);
    if (Number.isFinite(s.getTime()) && Number.isFinite(e.getTime())) {
      return `${s.toLocaleString(tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — ${e.toLocaleString(tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  if (ev.startDate && ev.endDate) {
    if (ev.startDate === ev.endDate) return ev.startDate;
    return `${ev.startDate} — ${ev.endDate}`;
  }
  return null;
}

export default function AgendaScreen() {
  const router = useRouter();
  const { user, userRole } = useAuth();
  const { mode } = useAppContext();
  const { t, i18n } = useTranslation();
  const { width: winW, height: winH } = useWindowDimensions();
  const isLandscape = winW > winH;
  const { colors: C, appDisplayName, appTagline } = useTheme();
  const styles = useMemo(() => createAgendaStyles(C), [C]);
  
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  /** Pré-visualização ao tocar numa atividade (lista ou Gantt) — abrir checklist só pelo botão. */
  const [activityPreview, setActivityPreview] = useState<{ event: AgendaEvent; assetTitle?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [assets, setAssets] = useState<any[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);
  const agendaProfileMountRef = useRef(true);
  /** Evita limpar `todaySlotMode` no mesmo tick em que landscape liga o Gantt (isGantt ainda veio false no render). */
  const prevIsGanttRef = useRef(false);

  useEffect(() => {
      setAssets(getLocalAssets(undefined, { includeMobileWarehouse: false }) || []);
  }, []);

  useEffect(() => {
    const ev = activityPreview?.event;
    if (!ev || !canOpenChecklistActivity(ev)) return;
    void cacheChecklistTemplateIfMissing(String(ev.refId), { timeoutMs: 22_000 });
  }, [activityPreview?.event?.id, activityPreview?.event?.refId]);

  const openChecklistForEvent = useCallback(
    (ev: AgendaEvent) => {
      if (!canOpenChecklistActivity(ev)) return;
      void (async () => {
        await cacheChecklistTemplateIfMissing(String(ev.refId), { timeoutMs: 18_000 });
        router.push({
          pathname: '/checklist/[id]',
          params: { id: String(ev.refId), taskId: String(ev.id) },
        } as any);
      })();
    },
    [router],
  );

  const fetchAgenda = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const canUseProviderMode = userHasCapability(user, 'mobile.mode.provider');
      const hasProviderProfileFallback =
        String(user?.role || '').toUpperCase() === 'PROVIDER' ||
        String(userRole || '').toUpperCase() === 'TECHNICIAN';
      const scope: AgendaScope =
        mode === 'PROVIDER' && (canUseProviderMode || hasProviderProfileFallback) ? 'PROVIDER' : 'CLIENT';
      const data = await AgendaService.getUnifiedAgenda(user.email, scope);
      setEvents(data);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [user, userRole, mode]);

  const activityPreviewPeriod = useMemo(() => {
    if (!activityPreview) return null;
    return formatEventPeriod(activityPreview.event, i18n.language);
  }, [activityPreview, i18n.language]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};

    events.forEach(ev => {
      const col = ev.color || MEDIA_TAG_COLORS.BEFORE;
      const days = collectAgendaDayKeys(ev);

      if (days.length === 1) {
        const d = days[0];
        if (!marks[d]) marks[d] = { periods: [] };
        marks[d].periods.push({ startingDay: true, endingDay: true, color: col });
        return;
      }

      days.forEach((d, idx) => {
        if (!marks[d]) marks[d] = { periods: [] };
        marks[d].periods.push({
          startingDay: idx === 0,
          endingDay: idx === days.length - 1,
          color: col
        });
      });
    });

    if (!marks[selectedDate]) marks[selectedDate] = {};
    marks[selectedDate] = {
      ...marks[selectedDate],
      selected: true,
      selectedColor: C.divider,
      selectedTextColor: C.slate,
    };

    return marks;
  }, [events, selectedDate, C]);

  const listData = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    events.forEach(ev => {
      const dayKeys = collectAgendaDayKeys(ev);
      dayKeys.forEach((dStr) => {
        if (!map[dStr]) map[dStr] = [];
        map[dStr].push(ev);
      });
    });

    const dayEvents = map[selectedDate] || [];

    // Retorna exatamente a seção da data selecionada
    return [{
      title: selectedDate,
      data: dayEvents
    }];
  }, [events, selectedDate]);

  const renderItem = ({ item }: { item: AgendaEvent | any }) => {
    if (!item || Object.keys(item).length === 0) return null;
    const ev = item as AgendaEvent;
    const asset = assets.find(a => a.id === ev.assetId);
    
    const cardBorder = ev.agendaOverlap ? '#EF4444' : ev.color || C.border;

    return (
      <TouchableOpacity 
        style={[styles.itemCard, { borderLeftColor: cardBorder }]}
        activeOpacity={0.7}
        onPress={() => setActivityPreview({ event: ev, assetTitle: asset?.title })}
      >
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{ev.title}</Text>
          {(ev.source === 'CHECKLIST' || ev.category === 'TASK') && (
            <LocationZoneTypeBadge zoneType={ev.locationZoneType} style={{ marginRight: 8, flexShrink: 0 }} />
          )}
          <View style={[styles.badge, { backgroundColor: ev.color + '20' }]}>
             <Text style={[styles.badgeText, { color: ev.color }]}>{ev.category}</Text>
          </View>
        </View>
        {ev.description && <Text style={styles.itemDesc}>{ev.description}</Text>}
        {ev.expectedFormDurationMinutes != null && Number.isFinite(Number(ev.expectedFormDurationMinutes)) ? (
          <Text style={[styles.itemDesc, { fontWeight: '700', color: C.accent }]}>
            {t('agenda.expectedFormMinutes', { count: Math.floor(Number(ev.expectedFormDurationMinutes)) })}
          </Text>
        ) : null}
        {ev.agendaOverlap ? (
          <Text style={[styles.itemDesc, { color: '#DC2626', fontWeight: '700' }]}>{t('agenda.overlapWarning')}</Text>
        ) : null}
        {asset && (
          <View style={styles.itemMeta}>
            <Ionicons name="home-outline" size={12} color={C.textLight} />
            <Text style={styles.itemMetaText}>{asset.title}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSectionHeader = ({ section: { title } }: any) => {
    const dateObj = new Date(title + 'T12:00:00Z');
    const dayName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const dayNum = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{dayName}, {dayNum}</Text>
      </View>
    );
  };

  const [isExpanded, setIsExpanded] = useState(false);
  /** Em portrait a vista padrão é lista + semana (calendário); em landscape, prestador abre em Gantt. */
  const [isGantt, setIsGantt] = useState(
    () =>
      isLandscape &&
      (userHasCapability(user, 'mobile.mode.provider') && mode === 'PROVIDER'),
  );

  useEffect(() => {
    if (!isLandscape) {
      setIsGantt(false);
      return;
    }
    const openGanttInLandscape =
      userHasCapability(user, 'mobile.mode.provider') && mode === 'PROVIDER';
    if (openGanttInLandscape) {
      setIsGantt(true);
      setTodaySlotMode(true);
    }
  }, [isLandscape, mode, user?.role, userRole]);

  const isProvider = userHasCapability(user, 'mobile.mode.provider') && mode === 'PROVIDER';

  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 3 | 4>(2);
  /** Vista do dia corrente: eixo horizontal em slots de 5 min (padrão ao abrir a agenda em modo Gantt). */
  const [todaySlotMode, setTodaySlotMode] = useState(true);
  /** Largura das células da grelha na vista HOJE: 5 min (fina), 30 min ou 1 h. O posicionamento das OS continua em minutos exatos. */
  const [timelineGridStepMin, setTimelineGridStepMin] = useState<5 | 30 | 60>(5);
  /** Atualiza a linha vertical «agora» na timeline HOJE (técnico). */
  const [agendaNowTick, setAgendaNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAgendaNowTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchAgenda();
      if (isGantt) setTodaySlotMode(true);
    }, [fetchAgenda, isGantt]),
  );

  useEffect(() => {
    if (!user?.email) return;
    if (agendaProfileMountRef.current) {
      agendaProfileMountRef.current = false;
      return;
    }
    void fetchAgenda();
  }, [userRole, fetchAgenda, user?.email]);

  useEffect(() => {
    if (prevIsGanttRef.current && !isGantt) {
      setTodaySlotMode(false);
    }
    prevIsGanttRef.current = isGantt;
  }, [isGantt]);

  useLayoutEffect(() => {
    if (!todaySlotMode) return;
    const id = requestAnimationFrame(() => {
      const anchor = new Date();
      anchor.setHours(0, 0, 0, 0);
      const minsFromAnchor = (Date.now() - anchor.getTime()) / 60000;
      const x = Math.max(0, minsFromAnchor * HOJE_PX_PER_MINUTE - 120);
      scrollViewRef.current?.scrollTo({ x, animated: true });
    });
    return () => cancelAnimationFrame(id);
  }, [todaySlotMode]);

  const ganttModel = useMemo(() => {
    const TODAY = new Date();
    TODAY.setHours(0, 0, 0, 0);
    const DAYS_TO_SHOW = 365;
    const daysArr = Array.from({ length: DAYS_TO_SHOW }).map((_, i) => {
      const d = new Date(TODAY);
      d.setDate(d.getDate() + i);
      return d;
    });
    const rws = assets.map((a) => ({ id: a.id, title: a.title, events: [] as AgendaEvent[] }));
    const others = { id: 'other', title: 'Geral', events: [] as AgendaEvent[] };
    events.forEach((ev) => {
      const eEnd = ev.agendaEndAt ? new Date(ev.agendaEndAt) : endOfAgendaYmdLocal(ev.endDate);
      if (eEnd.getTime() < TODAY.getTime()) return;
      const r = rws.find((x) => x.id === ev.assetId);
      if (r) r.events.push(ev);
      else others.events.push(ev);
    });
    const active = [...rws];
    if (others.events.length > 0) active.push(others);
    return { daysArray: daysArr, activeRows: active, TODAY, MathZoomWidth: DAYS_TO_SHOW };
  }, [assets, events]);

  const toggleExpand = () => {
    LayoutAnimation.configureNext({
      duration: 250,
      update: { type: 'spring', springDamping: 0.8 },
      create: { type: 'easeInEaseOut', property: 'opacity' },
      delete: { type: 'easeInEaseOut', property: 'opacity' }
    });
    setIsExpanded(!isExpanded);
  };

  const renderGantt = () => {
    const { daysArray, activeRows, TODAY, MathZoomWidth } = ganttModel;

    const BAR_H = 22;
    const LANE_GAP = 4;
    const TOP_PAD = 6;
    const ROW_MIN_H = 56;

    const dayAnchor = new Date();
    dayAnchor.setHours(0, 0, 0, 0);

    if (todaySlotMode) {
      const dayTimelineW = MINUTES_PER_DAY * HOJE_PX_PER_MINUTE;
      const timelineW = dayTimelineW * HOJE_VIEW_DAY_COUNT;
      const hourColW = 60 * HOJE_PX_PER_MINUTE;
      const cellsPerDay = MINUTES_PER_DAY / timelineGridStepMin;
      const totalCells = HOJE_VIEW_DAY_COUNT * cellsPerDay;
      const cellW = timelineGridStepMin * HOJE_PX_PER_MINUTE;

      const showTechPortraitTimeRail = !isLandscape && isProvider;
      const TIME_RAIL_W = 50;
      const hojeRowBlocks = activeRows.map((r) => {
        const clippedPairs = r.events
          .map((ev) => ({ ev, inv: clipAgendaEventToLocalCalendarWindow(ev, dayAnchor, HOJE_VIEW_DAY_COUNT) }))
          .filter((x): x is { ev: AgendaEvent; inv: AgendaEventInterval } => x.inv != null);
        const { laneByEventId, laneCount } = assignNonOverlappingLanes(clippedPairs.map((x) => x.inv));
        const rowHeight = Math.max(ROW_MIN_H, TOP_PAD + laneCount * BAR_H + (laneCount - 1) * LANE_GAP + 8);
        return { r, clippedPairs, laneByEventId, laneCount, rowHeight };
      });

      const renderHojeTimelineInner = () => {
        const HEADER_H = 30 + 38;
        const rowsH = hojeRowBlocks.reduce((acc, b) => acc + b.rowHeight, 0);
        const totalContentH = HEADER_H + rowsH;
        void agendaNowTick;
        const minsFromAnchor = (Date.now() - dayAnchor.getTime()) / 60000;
        const nowLeftPx = minsFromAnchor * HOJE_PX_PER_MINUTE;
        const showNowLine =
          isProvider &&
          Number.isFinite(minsFromAnchor) &&
          nowLeftPx >= -2 &&
          nowLeftPx <= timelineW + 2;

        return (
          <View style={{ position: 'relative', width: timelineW, minHeight: totalContentH }}>
            <View style={{ flexDirection: 'column', width: timelineW }}>
          <View style={{ flexDirection: 'row', height: 30, width: timelineW, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceLow }}>
            {Array.from({ length: HOJE_VIEW_DAY_COUNT }).map((_, d) => {
              const dDate = new Date(dayAnchor);
              dDate.setDate(dDate.getDate() + d);
              const isFirst = d === 0;
              return (
                <View
                  key={d}
                  style={{
                    width: dayTimelineW,
                    borderRightWidth: d < HOJE_VIEW_DAY_COUNT - 1 ? 2 : 0,
                    borderRightColor: C.border,
                    justifyContent: 'center',
                    paddingLeft: 8,
                    backgroundColor: isFirst ? C.status.info.bg : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '900', color: C.slate }} numberOfLines={1}>
                    {dDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', height: 38, width: timelineW, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceLow }}>
            {Array.from({ length: HOJE_VIEW_DAY_COUNT * 24 }).map((_, idx) => {
              const h = idx % 24;
              return (
                <View
                  key={idx}
                  style={{
                    width: hourColW,
                    borderRightWidth: 1,
                    borderRightColor: C.border,
                    justifyContent: 'center',
                    paddingLeft: 2,
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: '800', color: C.textSecondary }} numberOfLines={1}>
                    {`${String(h).padStart(2, '0')}h`}
                  </Text>
                </View>
              );
            })}
          </View>

          {hojeRowBlocks.map(({ r, clippedPairs, laneByEventId, rowHeight }) => (
            <View key={r.id} style={{ height: rowHeight, flexDirection: 'row', borderBottomWidth: 1, borderColor: C.divider, position: 'relative', width: timelineW }}>
              {Array.from({ length: totalCells }).map((_, si) => {
                const slotInDay = si % cellsPerDay;
                const endOfDay = slotInDay === cellsPerDay - 1;
                const startMinuteOfCell = slotInDay * timelineGridStepMin;
                const hourStripe = Math.floor(startMinuteOfCell / 60) % 2 === 0;
                return (
                  <View
                    key={si}
                    style={{
                      width: cellW,
                      height: rowHeight,
                      borderRightWidth: endOfDay ? 2 : 1,
                      borderRightColor: C.border,
                      backgroundColor: hourStripe ? C.cardWhite : C.surfaceLow,
                    }}
                  />
                );
              })}

              {clippedPairs.map(({ ev, inv }) => {
                const lane = laneByEventId.get(ev.id) ?? 0;
                const topPos = TOP_PAD + lane * (BAR_H + LANE_GAP);
                const startMin = (inv.startMs - dayAnchor.getTime()) / 60000;
                const endMin = (inv.endMs - dayAnchor.getTime()) / 60000;
                const durMin = Math.max(1, endMin - startMin);
                const leftPx = startMin * HOJE_PX_PER_MINUTE;
                const widthPx = Math.max(DAY_TIMELINE_SLOT_W * 0.75, durMin * HOJE_PX_PER_MINUTE);

                const onBarPress = () => setActivityPreview({ event: ev, assetTitle: r.title });

                const barBg = ev.color || MEDIA_TAG_COLORS.BEFORE;

                return (
                  <TouchableOpacity
                    key={ev.id}
                    activeOpacity={0.8}
                    onPress={onBarPress}
                    style={{
                      position: 'absolute',
                      left: leftPx,
                      top: topPos,
                      width: Math.min(widthPx, timelineW - leftPx - 1),
                      height: BAR_H,
                      backgroundColor: barBg,
                      borderRadius: 6,
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                      shadowColor: barBg,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.2,
                      shadowRadius: 3,
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }} numberOfLines={1}>
                      {ev.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
            </View>
            {showNowLine ? (
              <View
                pointerEvents="none"
                accessibilityLabel={t('agenda.nowLineA11y')}
                style={{
                  position: 'absolute',
                  left: Math.max(0, Math.min(timelineW - 2, nowLeftPx - 1)),
                  top: 0,
                  width: 2,
                  height: totalContentH,
                  backgroundColor: C.accent,
                  zIndex: 45,
                  borderRadius: 1,
                  opacity: 0.92,
                }}
              />
            ) : null}
          </View>
        );
      };

      const scrollToNow = () => {
        const anchor = new Date();
        anchor.setHours(0, 0, 0, 0);
        const minsFromAnchor = (Date.now() - anchor.getTime()) / 60000;
        const x = Math.max(0, minsFromAnchor * HOJE_PX_PER_MINUTE - 120);
        scrollViewRef.current?.scrollTo({ x, animated: true });
      };

      const lastDay = new Date(dayAnchor);
      lastDay.setDate(lastDay.getDate() + HOJE_VIEW_DAY_COUNT - 1);

      const gridStepLabel =
        timelineGridStepMin === 60 ? t('agenda.timelineGrid60') : timelineGridStepMin === 30 ? t('agenda.timelineGrid30') : t('agenda.timelineGrid5');

      return (
        <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.divider, backgroundColor: C.cardWhite }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: C.textSecondary }} numberOfLines={2}>
              {dayAnchor.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} —{' '}
              {lastDay.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })} · {HOJE_VIEW_DAY_COUNT} dias · {gridStepLabel}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 8, gap: 6 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.textSecondary }}>{t('agenda.timelineGridLabel')}</Text>
              {([5, 30, 60] as const).map((step) => (
                <TouchableOpacity
                  key={step}
                  onPress={() => setTimelineGridStepMin(step)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: timelineGridStepMin === step ? C.accent : C.surfaceLow,
                    borderWidth: 1,
                    borderColor: timelineGridStepMin === step ? C.accent : C.border,
                  }}
                >
                  <Text style={{ fontSize: 10, fontWeight: '800', color: timelineGridStepMin === step ? '#fff' : C.slate }}>
                    {step === 60 ? t('agenda.timelineGrid60') : step === 30 ? t('agenda.timelineGrid30') : t('agenda.timelineGrid5')}
                  </Text>
                </TouchableOpacity>
              ))}
              <View style={{ flexGrow: 1, minWidth: 4 }} />
              <TouchableOpacity
                onPress={() => {
                  scrollToNow();
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 6,
                  backgroundColor: C.accent,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: '#fff' }}>HOJE</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setTodaySlotMode(false)}
                style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, backgroundColor: C.surfaceLow, borderWidth: 1, borderColor: C.border }}
              >
                <Text style={{ fontSize: 10, fontWeight: '800', color: C.slate }}>Dias</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* View em vez de ScrollView vertical: aninhar vertical+horizontal quebrava a altura do filho em landscape. */}
          <View style={{ flex: 1, minHeight: 0, backgroundColor: C.cardWhite }}>
            {showTechPortraitTimeRail ? (
              <View style={{ flex: 1, minHeight: 0, flexDirection: 'row', alignItems: 'stretch' }}>
                <View
                  style={{
                    width: TIME_RAIL_W,
                    backgroundColor: C.surfaceLow,
                    borderRightWidth: 1,
                    borderRightColor: C.border,
                  }}
                >
                  <View style={{ height: 30, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: C.textSecondary }} numberOfLines={2}>
                      {t('agenda.timeRailDayHint')}
                    </Text>
                  </View>
                  <View style={{ height: 38, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '900', color: C.textSecondary }} numberOfLines={1}>
                      {t('agenda.timeAxisLabel')}
                    </Text>
                  </View>
                  {hojeRowBlocks.map(({ r, rowHeight }) => {
                    const innerH = Math.max(0, rowHeight - TOP_PAD - 8);
                    const hourH = innerH / 24;
                    return (
                      <View
                        key={`rail-${r.id}`}
                        style={{
                          height: rowHeight,
                          borderBottomWidth: 1,
                          borderBottomColor: C.divider,
                          position: 'relative',
                        }}
                      >
                        {Array.from({ length: 24 }).map((_, h) => {
                          const showLabel = h % 2 === 0;
                          return (
                            <View
                              key={h}
                              style={{
                                position: 'absolute',
                                left: 4,
                                right: 4,
                                top: TOP_PAD + h * hourH,
                                height: hourH,
                                borderTopWidth: h > 0 ? StyleSheet.hairlineWidth : 0,
                                borderTopColor: C.border,
                                justifyContent: 'flex-start',
                              }}
                            >
                              {showLabel ? (
                                <Text style={{ fontSize: 8, fontWeight: '800', color: C.textLight }} numberOfLines={1}>
                                  {`${String(h).padStart(2, '0')}h`}
                                </Text>
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                </View>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  bounces={false}
                  showsHorizontalScrollIndicator
                  nestedScrollEnabled
                  style={{ flex: 1, minHeight: 0 }}
                  contentContainerStyle={{ width: timelineW, flexGrow: 1 }}
                >
                  {renderHojeTimelineInner()}
                </ScrollView>
              </View>
            ) : (
              <ScrollView
                ref={scrollViewRef}
                horizontal
                bounces={false}
                showsHorizontalScrollIndicator
                nestedScrollEnabled
                style={{ flex: 1, minHeight: 0 }}
                contentContainerStyle={{ width: timelineW, paddingBottom: 32, flexGrow: 1 }}
              >
                {renderHojeTimelineInner()}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    let COL_WIDTH = 48;
    
    if (zoomLevel === 1) {
      COL_WIDTH = 90;
    } else if (zoomLevel === 2) {
      COL_WIDTH = 48;
    } else if (zoomLevel === 3) {
      COL_WIDTH = 24;
    } else if (zoomLevel === 4) {
      COL_WIDTH = 12;
    }

    const DAYS_TO_SHOW = MathZoomWidth;

    return (
      <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.divider, backgroundColor: C.cardWhite }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={() => setTodaySlotMode(true)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 6,
                backgroundColor: todaySlotMode ? C.accent : C.border,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: todaySlotMode ? '#fff' : C.slate }}>HOJE</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', backgroundColor: C.divider, borderRadius: 8, padding: 4 }}>
              <TouchableOpacity onPress={() => { setZoomLevel(1); setTodaySlotMode(false); }} style={[styles.zoomBtn, !todaySlotMode && zoomLevel === 1 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, !todaySlotMode && zoomLevel === 1 && styles.zoomTextActive]}>1S</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setZoomLevel(2); setTodaySlotMode(false); }} style={[styles.zoomBtn, !todaySlotMode && zoomLevel === 2 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, !todaySlotMode && zoomLevel === 2 && styles.zoomTextActive]}>1M</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setZoomLevel(3); setTodaySlotMode(false); }} style={[styles.zoomBtn, !todaySlotMode && zoomLevel === 3 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, !todaySlotMode && zoomLevel === 3 && styles.zoomTextActive]}>3M</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setZoomLevel(4); setTodaySlotMode(false); }} style={[styles.zoomBtn, !todaySlotMode && zoomLevel === 4 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, !todaySlotMode && zoomLevel === 4 && styles.zoomTextActive]}>6M</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ flex: 1, minHeight: 0, backgroundColor: C.cardWhite }}>
            <ScrollView
              ref={scrollViewRef}
              horizontal
              bounces={false}
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              style={{ flex: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingBottom: 32, flexGrow: 1 }}
            >
            <View style={{ flexDirection: 'column' }}>
              
              <View style={{ flexDirection: 'row', height: 46, borderBottomWidth: 1, borderColor: C.border, backgroundColor: C.surfaceLow }}>
                {daysArray.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isFirstOfMonth = d.getDate() === 1;
                  return (
                    <View key={i} style={{ width: COL_WIDTH, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: C.border, backgroundColor: isWeekend ? C.divider : 'transparent', overflow: 'visible', zIndex: isFirstOfMonth ? 20 : 1 }}>
                      {(zoomLevel === 1 || zoomLevel === 2) && (
                        <>
                          <Text style={{ fontSize: zoomLevel === 1 ? 10 : 9, fontWeight: '700', color: C.textLight, textTransform: 'uppercase' }}>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,3)}</Text>
                          <Text style={{ fontSize: zoomLevel === 1 ? 15 : 13, fontWeight: '900', color: i === 0 ? C.accent : C.slate }}>{d.getDate()}</Text>
                        </>
                      )}
                      {zoomLevel === 3 && (
                        <Text style={{ fontSize: 10, fontWeight: '900', color: i === 0 || isFirstOfMonth ? C.accent : C.textLight }}>{d.getDate()}</Text>
                      )}
                      {zoomLevel === 4 && isFirstOfMonth && (
                        <Text style={{ position: 'absolute', left: 4, fontSize: 9, fontWeight: '900', color: C.slate, zIndex: 100, width: 40, textTransform: 'uppercase' }}>
                          {d.toLocaleDateString('pt-BR', { month: 'short' })}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {activeRows.map((r) => {
                const intervals = buildAgendaEventIntervals(r.events);
                const { laneByEventId, laneCount } = assignNonOverlappingLanes(intervals);
                const rowHeight = Math.max(
                  ROW_MIN_H,
                  TOP_PAD + laneCount * BAR_H + (laneCount - 1) * LANE_GAP + 8,
                );

                return (
                <View key={r.id} style={{ height: rowHeight, flexDirection: 'row', borderBottomWidth: 1, borderColor: C.divider }}>
                  {daysArray.map((d, i) => (
                    <View key={i} style={{ width: COL_WIDTH, height: rowHeight, borderRightWidth: 1, borderColor: C.divider, backgroundColor: d.getDay() === 0 || d.getDay() === 6 ? C.surfaceLow : C.cardWhite }} />
                  ))}

                  {r.events.map((ev, evIndex) => {
                    const lane = laneByEventId.get(ev.id) ?? 0;
                    const topPos = TOP_PAD + lane * (BAR_H + LANE_GAP);

                    const onBarPress = () => setActivityPreview({ event: ev, assetTitle: r.title });

                    const barBg = ev.color || MEDIA_TAG_COLORS.BEFORE;

                    if (ev.agendaStartAt && ev.agendaEndAt) {
                      const segs = computeTimedAgendaSegments(
                        ev.agendaStartAt,
                        ev.agendaEndAt,
                        TODAY,
                        DAYS_TO_SHOW
                      );
                      if (!segs.length) return null;
                      return (
                        <Fragment key={ev.id}>
                          {segs.map((seg, si) => {
                            const leftPx = Math.max(0, seg.dayIndex * COL_WIDTH + seg.leftFrac * COL_WIDTH + 2);
                            const wPx = Math.max(8, seg.widthFrac * COL_WIDTH - 4);
                            if (leftPx > DAYS_TO_SHOW * COL_WIDTH) return null;
                            return (
                              <TouchableOpacity
                                key={`${ev.id}_s${si}`}
                                activeOpacity={0.8}
                                onPress={onBarPress}
                                style={{
                                  position: 'absolute',
                                  left: leftPx,
                                  top: topPos,
                                  width: Math.min(wPx, DAYS_TO_SHOW * COL_WIDTH - leftPx),
                                  height: BAR_H,
                                  backgroundColor: barBg,
                                  borderRadius: 6,
                                  justifyContent: 'center',
                                  paddingHorizontal: 4,
                                  shadowColor: barBg,
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.2,
                                  shadowRadius: 3,
                                }}
                              >
                                <Text
                                  style={{ fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}
                                  numberOfLines={1}
                                >
                                  {ev.title}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </Fragment>
                      );
                    }

                    const sDate = parseAgendaYmdLocal(ev.startDate);
                    const eDate = parseAgendaYmdLocal(ev.endDate);

                    const leftDays = Math.round((sDate.getTime() - TODAY.getTime()) / (1000 * 60 * 60 * 24));
                    const durationDays = Math.round((eDate.getTime() - sDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

                    const leftPx = Math.max(0, leftDays * COL_WIDTH);
                    const cutoff = leftDays < 0 ? Math.abs(leftDays) : 0;
                    const finalWidthPx = (durationDays - cutoff) * COL_WIDTH;

                    if (finalWidthPx <= 0 || leftPx > DAYS_TO_SHOW * COL_WIDTH) return null;
                    const w = Math.min(finalWidthPx, DAYS_TO_SHOW * COL_WIDTH - leftPx);

                    return (
                      <TouchableOpacity
                        key={ev.id || String(evIndex)}
                        activeOpacity={0.8}
                        onPress={onBarPress}
                        style={{
                          position: 'absolute',
                          left: leftPx + 4,
                          top: topPos,
                          width: Math.max(10, w - 8),
                          height: BAR_H,
                          backgroundColor: barBg,
                          borderRadius: 6,
                          justifyContent: 'center',
                          paddingHorizontal: 6,
                          shadowColor: barBg,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.2,
                          shadowRadius: 3,
                        }}
                      >
                        <Text
                          style={{ fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }}
                          numberOfLines={1}
                        >
                          {ev.title}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                );
              })}
            </View>
          </ScrollView>
      </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      {!isLandscape && (
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.push('/(tabs)'))} style={{ marginRight: 12, padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={C.slate} />
            </TouchableOpacity>
            <View>
              <Text style={styles.headerBrand}>{appDisplayName}</Text>
              <Text style={styles.headerTitle}>Agenda</Text>
              <Text style={styles.headerSub}>{appTagline}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => setIsGantt(!isGantt)}>
              <Ionicons name={isGantt ? 'calendar' : 'bar-chart'} size={24} color={isGantt ? C.accent : C.slate} />
            </TouchableOpacity>
            {!isProvider && (
              <TouchableOpacity style={styles.fab} onPress={() => router.push('/agenda/new')}>
                <Ionicons name="add" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {isGantt ? (
        renderGantt()
      ) : (
        <View style={{ flex: 1, minHeight: 1 }}>
        <CalendarProvider
          date={selectedDate}
          onDateChanged={(d) => setSelectedDate(d)}
          showTodayButton={false}
          style={{ flex: 1 }}
        >
          <View style={styles.calendarBox}>
            {isExpanded ? (
              <Calendar
                current={selectedDate}
                onDayPress={(day: any) => setSelectedDate(day.dateString)}
                markingType={'multi-period'}
                markedDates={markedDates}
                theme={{
                  backgroundColor: C.cardWhite, calendarBackground: C.cardWhite,
                  textSectionTitleColor: C.textLight, selectedDayBackgroundColor: C.accent,
                  selectedDayTextColor: '#ffffff', todayTextColor: C.accent,
                  dayTextColor: C.slate, textDisabledColor: C.border,
                  arrowColor: C.accent, monthTextColor: C.slate,
                  textDayFontWeight: '500', textMonthFontWeight: '800', textDayHeaderFontWeight: '600',
                }}
              />
            ) : (
              <View style={{ paddingTop: 8 }}>
                <WeekCalendar
                  firstDay={1}
                  markingType={'multi-period'}
                  markedDates={markedDates}
                  theme={{
                    selectedDayBackgroundColor: C.accent,
                    selectedDayTextColor: '#ffffff',
                    todayTextColor: C.accent,
                    dayTextColor: C.slate,
                    textDisabledColor: C.border,
                    arrowColor: C.accent,
                  }}
                />
              </View>
            )}

            <TouchableOpacity style={styles.retouchHandle} onPress={toggleExpand} activeOpacity={0.8}>
              <View style={styles.handleBar} />
              <Text style={{ fontSize: 10, color: C.textLight, fontWeight: '700', marginTop: 4 }}>
                {isExpanded ? 'Recolher para Semana' : 'Expandir Calendário'}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.textLight} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : (
            <SectionList
              style={{ flex: 1 }}
              sections={listData}
              keyExtractor={(item, index) => (item?.id ? `${item.id}-${index}` : `empty-${index}`)}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              contentContainerStyle={{ paddingBottom: 100, paddingTop: 10 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyData}>
                  <Ionicons name="calendar-clear-outline" size={48} color={C.border} />
                  <Text style={styles.emptyDataTitle}>Agenda Livre</Text>
                  <Text style={styles.emptyDataDesc}>Você não possui compromissos futuros no momento.</Text>
                </View>
              }
            />
          )}
        </CalendarProvider>
        </View>
      )}

      <Modal
        visible={!!activityPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityPreview(null)}
        {...(Platform.OS === 'ios'
          ? {
              supportedOrientations: [
                'portrait',
                'portrait-upside-down',
                'landscape',
                'landscape-left',
                'landscape-right',
              ] as const,
            }
          : {})}
      >
        <View style={styles.activityModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActivityPreview(null)} accessibilityRole="button" accessibilityLabel={t('agenda.close')} />
          {activityPreview ? (
            <View
              style={[
                styles.activityModalCard,
                {
                  backgroundColor: C.cardWhite,
                  borderColor: C.border,
                  maxWidth: isLandscape ? Math.min(winW - 40, 920) : 400,
                  width: isLandscape ? Math.min(winW - 40, 920) : '100%',
                },
              ]}
            >
              <ScrollView
                style={{ maxHeight: Math.min(winH * 0.72, 560) }}
                contentContainerStyle={{ paddingBottom: 4 }}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                bounces={false}
              >
                <Text style={[styles.activityModalTitle, { color: C.slate }]}>{t('agenda.activityPreviewTitle')}</Text>
                {activityPreview.event.osNumber ? (
                  <Text style={[styles.activityModalOs, { color: C.accent }]}>
                    {t('agenda.osNumberLabel')}: {activityPreview.event.osNumber}
                  </Text>
                ) : null}
                <Text style={[styles.activityModalHeading, { color: C.slate }]} numberOfLines={isLandscape ? 5 : 3}>
                  {activityPreview.event.title}
                </Text>
                <View style={[styles.activityModalBadge, { backgroundColor: (activityPreview.event.color || C.accent) + '22' }]}>
                  <Text style={[styles.activityModalBadgeText, { color: activityPreview.event.color || C.accent }]}>{activityPreview.event.category}</Text>
                </View>
                {activityPreviewPeriod ? (
                  <Text style={[styles.activityModalMeta, { color: C.textSecondary }]}>
                    {t('agenda.periodLabel')}: {activityPreviewPeriod}
                  </Text>
                ) : null}
                {activityPreview.event.expectedFormDurationMinutes != null &&
                Number.isFinite(Number(activityPreview.event.expectedFormDurationMinutes)) ? (
                  <Text style={[styles.activityModalMeta, { color: C.accent, fontWeight: '700' }]}>
                    {t('agenda.expectedFormMinutes', { count: Math.floor(Number(activityPreview.event.expectedFormDurationMinutes)) })}
                  </Text>
                ) : null}
                {activityPreview.assetTitle ? (
                  <Text style={[styles.activityModalMeta, { color: C.textSecondary }]}>
                    {t('agenda.assetLabel')}: {activityPreview.assetTitle}
                  </Text>
                ) : null}
                {activityPreview.event.description ? (
                  <Text style={[styles.activityModalDesc, { color: C.textSecondary }]}>
                    {activityPreview.event.description}
                  </Text>
                ) : null}
                {activityPreview.event.agendaOverlap ? (
                  <Text style={[styles.activityModalMeta, { color: '#DC2626', fontWeight: '700' }]}>{t('agenda.overlapWarning')}</Text>
                ) : null}
                {!canOpenChecklistActivity(activityPreview.event) ? (
                  <Text style={[styles.activityModalHint, { color: C.textLight }]}>{t('agenda.noChecklistHint')}</Text>
                ) : null}
              </ScrollView>
              <View style={styles.activityModalActions}>
                {canOpenChecklistActivity(activityPreview.event) ? (
                  <TouchableOpacity
                    style={[styles.activityModalPrimaryBtn, { backgroundColor: C.accent }]}
                    onPress={() => {
                      const ev = activityPreview.event;
                      setActivityPreview(null);
                      openChecklistForEvent(ev);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.activityModalPrimaryBtnText}>{t('agenda.openActivity')}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.activityModalSecondaryBtn, { borderColor: C.border, backgroundColor: C.surfaceLow }]}
                  onPress={() => setActivityPreview(null)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.activityModalSecondaryBtnText, { color: C.slate }]}>{t('agenda.close')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function createAgendaStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      backgroundColor: C.cardWhite,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
      zIndex: 10,
    },
    headerBrand: { fontSize: 10, fontWeight: '900', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.55, marginBottom: 2 },
    headerTitle: { fontSize: 26, fontWeight: '900', color: C.slate, letterSpacing: -0.5 },
    headerSub: { fontSize: 11, fontWeight: '700', color: C.textLight, marginTop: 2 },
    fab: {
      width: 36, height: 36, borderRadius: 18, backgroundColor: C.accent,
      justifyContent: 'center', alignItems: 'center',
      shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
    },
    iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
    zoomBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
    zoomBtnActive: { backgroundColor: C.accent, shadowColor: C.accent, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
    zoomText: { fontSize: 10, fontWeight: '800', color: C.textLight },
    zoomTextActive: { color: '#fff' },
    calendarBox: { flexGrow: 0, backgroundColor: C.cardWhite, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
    retouchHandle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
    handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
    toggleContainer: { flexDirection: 'row', backgroundColor: C.divider, borderRadius: 20, padding: 3 },
    toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18 },
    toggleActive: { backgroundColor: C.cardWhite, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    toggleText: { fontSize: 13, fontWeight: '700', color: C.textLight },
    toggleTextActive: { color: C.slate },
    loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    sectionHeader: { backgroundColor: C.surfaceLow, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    sectionHeaderText: { color: C.textLight, fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
    itemCard: {
      backgroundColor: C.cardWhite,
      marginHorizontal: 20,
      marginBottom: 12,
      borderRadius: 16,
      padding: 16,
      borderLeftWidth: 6,
      shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 4 },
    itemTitle: { fontSize: 15, fontWeight: '800', color: C.slate, flex: 1, marginRight: 10 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 9, fontWeight: '900' },
    itemDesc: { fontSize: 13, color: C.textSecondary, lineHeight: 18, marginBottom: 12 },
    itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.divider, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    itemMetaText: { fontSize: 11, fontWeight: '700', color: C.textLight },

    emptyData: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
    emptyDataTitle: { fontSize: 16, fontWeight: '800', color: C.textLight, marginTop: 12 },
    emptyDataDesc: { fontSize: 13, color: C.textLight, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },

    activityModalRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    activityModalCard: {
      width: '100%',
      maxWidth: 400,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      elevation: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
    },
    activityModalTitle: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
    activityModalOs: { fontSize: 14, fontWeight: '900', marginBottom: 8 },
    activityModalHeading: { fontSize: 17, fontWeight: '800', marginBottom: 10, lineHeight: 22 },
    activityModalBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginBottom: 10 },
    activityModalBadgeText: { fontSize: 10, fontWeight: '900' },
    activityModalMeta: { fontSize: 13, marginBottom: 6, lineHeight: 18 },
    activityModalDesc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
    activityModalHint: { fontSize: 12, lineHeight: 17, marginBottom: 14, fontStyle: 'italic' },
    activityModalActions: { gap: 10, marginTop: 4 },
    activityModalPrimaryBtn: {
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
    },
    activityModalPrimaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
    activityModalSecondaryBtn: {
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
    },
    activityModalSecondaryBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
