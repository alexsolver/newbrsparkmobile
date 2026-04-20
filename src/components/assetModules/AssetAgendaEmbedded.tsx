import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  Pressable,
  Platform,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Calendar, WeekCalendar, CalendarProvider, LocaleConfig } from 'react-native-calendars';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import { usePersona } from '../../context/PersonaContext';
import { useAppContext } from '../../context/AppContext';
import { AgendaService, type AgendaScope } from '../../services/agendaService';
import { userHasCapability } from '../../services/auth';
import type { AgendaEvent } from '../../types/agenda';
import { LocationZoneTypeBadge } from '../LocationZoneTypeBadge';
import { MEDIA_TAG_COLORS } from '../../theme/colors';
import { useTheme } from '../../theme/ThemeContext';
import type { ColorPalette } from '../../theme/colors';
import { cacheChecklistTemplateIfMissing } from '../../services/routineTaskService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

LocaleConfig.locales['pt-br'] = {
  monthNames: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'],
  monthNamesShort: ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'],
  dayNames: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje',
};
LocaleConfig.defaultLocale = 'pt-br';

const toLocalYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const getTodayString = () => toLocalYmd(new Date());

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
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const start = parse(ev.startDate);
  const end = parse(ev.endDate);
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

function formatEventPeriod(ev: AgendaEvent, locale: string): string | null {
  const tag = locale.startsWith('en') ? 'en-US' : locale.startsWith('es') ? 'es-ES' : 'pt-BR';
  if (ev.agendaStartAt && ev.agendaEndAt) {
    const s = new Date(ev.agendaStartAt);
    const e = new Date(ev.agendaEndAt);
    if (Number.isFinite(s.getTime()) && Number.isFinite(e.getTime())) {
      return `${s.toLocaleString(tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}, ${e.toLocaleString(tag, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    }
  }
  if (ev.startDate && ev.endDate) {
    if (ev.startDate === ev.endDate) return ev.startDate;
    return `${ev.startDate}, ${ev.endDate}`;
  }
  return null;
}

function canOpenChecklistActivity(ev: AgendaEvent): boolean {
  if (ev.source !== 'CHECKLIST') return false;
  const r = ev.refId != null ? String(ev.refId).trim() : '';
  return r.length > 0 && r !== 'null';
}

type Props = { assetId: string };

/**
 * Agenda do ativo embutida no detalhe: vista **simples** para persona cliente e vista **rica** (como a agenda global) para prestador.
 */
export function AssetAgendaEmbedded({ assetId }: Props) {
  const router = useRouter();
  const { user, userRole } = useAuth();
  const { activePersona } = usePersona();
  const { mode } = useAppContext();
  const { t, i18n } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);

  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [isExpanded, setIsExpanded] = useState(false);
  const [activityPreview, setActivityPreview] = useState<AgendaEvent | null>(null);

  const isTechnicianUi =
    activePersona === 'provider' &&
    mode === 'PROVIDER' &&
    userHasCapability(user, 'mobile.mode.provider');

  const fetchAgenda = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const canUseProviderMode = userHasCapability(user, 'mobile.mode.provider');
      const hasProviderProfileFallback =
        String(user?.role || '').toUpperCase() === 'PROVIDER' || String(userRole || '').toUpperCase() === 'TECHNICIAN';
      const scope: AgendaScope =
        mode === 'PROVIDER' && (canUseProviderMode || hasProviderProfileFallback) ? 'PROVIDER' : 'CLIENT';
      const data = await AgendaService.getUnifiedAgenda(user.email, scope);
      const filtered = data.filter((e) => String(e.assetId || '') === String(assetId));
      setEvents(filtered);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [user, userRole, mode, assetId]);

  useFocusEffect(
    useCallback(() => {
      void fetchAgenda();
    }, [fetchAgenda])
  );

  const activityPreviewPeriod = useMemo(() => {
    if (!activityPreview) return null;
    return formatEventPeriod(activityPreview, i18n.language);
  }, [activityPreview, i18n.language]);

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    events.forEach((ev) => {
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
          color: col,
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

  const dayEvents = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    events.forEach((ev) => {
      collectAgendaDayKeys(ev).forEach((d) => {
        if (!map[d]) map[d] = [];
        map[d].push(ev);
      });
    });
    const list = map[selectedDate] || [];
    const seen = new Set<string>();
    return list.filter((ev) => {
      if (seen.has(ev.id)) return false;
      seen.add(ev.id);
      return true;
    });
  }, [events, selectedDate]);

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
    [router]
  );

  const toggleExpandCal = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  const categoryLabel = useCallback(
    (cat: string) => {
      const slug = String(cat || 'default').toLowerCase();
      const k = `assetAgenda.cat.${slug}`;
      const tr = t(k);
      return tr === k ? t('assetAgenda.cat.default') : tr;
    },
    [t]
  );

  const goNewEvent = () => {
    router.push({ pathname: '/agenda/new', params: { prefillAssetId: assetId } } as any);
  };

  return (
    <View style={styles.wrap}>
      <CalendarProvider date={selectedDate} onDateChanged={(d) => setSelectedDate(d)} showTodayButton={false}>
        <View style={styles.calendarBox}>
          {isTechnicianUi && isExpanded ? (
            <Calendar
              current={selectedDate}
              onDayPress={(day: any) => setSelectedDate(day.dateString)}
              markingType="multi-period"
              markedDates={markedDates}
              theme={{
                backgroundColor: C.cardWhite,
                calendarBackground: C.cardWhite,
                textSectionTitleColor: C.textLight,
                selectedDayBackgroundColor: C.accent,
                selectedDayTextColor: '#ffffff',
                todayTextColor: C.accent,
                dayTextColor: C.slate,
                textDisabledColor: C.border,
                arrowColor: C.accent,
                monthTextColor: C.slate,
                textDayFontWeight: '500',
                textMonthFontWeight: '800',
                textDayHeaderFontWeight: '600',
              }}
            />
          ) : (
            <View style={{ paddingTop: 8 }}>
              <WeekCalendar
                firstDay={1}
                markingType="multi-period"
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

          {isTechnicianUi ? (
            <TouchableOpacity style={styles.retouchHandle} onPress={toggleExpandCal} activeOpacity={0.8}>
              <View style={styles.handleBar} />
              <Text style={styles.expandLabel}>
                {isExpanded ? t('assetAgenda.collapseCal') : t('assetAgenda.expandCal')}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={C.textLight} />
            </TouchableOpacity>
          ) : null}
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={C.accent} />
            <Text style={styles.loaderText}>{t('assetAgenda.loading')}</Text>
          </View>
        ) : dayEvents.length === 0 ? (
          <View style={styles.emptyData}>
            <Ionicons name="calendar-clear-outline" size={40} color={C.border} />
            <Text style={styles.emptyTitle}>{t('assetAgenda.emptyTitle')}</Text>
            <Text style={styles.emptyDesc}>{t('assetAgenda.emptyDesc')}</Text>
          </View>
        ) : (
          <ScrollView style={styles.listScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.sectionHeader}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString(i18n.language, { weekday: 'long', day: '2-digit', month: 'short' })}
            </Text>
            {dayEvents.map((ev) => {
              const period = formatEventPeriod(ev, i18n.language);
              if (isTechnicianUi) {
                const cardBorder = ev.agendaOverlap ? '#EF4444' : ev.color || C.border;
                return (
                  <TouchableOpacity
                    key={ev.id}
                    style={[styles.itemCardTech, { borderLeftColor: cardBorder }]}
                    activeOpacity={0.7}
                    onPress={() => setActivityPreview(ev)}
                  >
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemTitle}>{ev.title}</Text>
                      {(ev.source === 'CHECKLIST' || ev.category === 'TASK') && (
                        <LocationZoneTypeBadge zoneType={ev.locationZoneType} style={{ marginRight: 8, flexShrink: 0 }} />
                      )}
                      <View style={[styles.badge, { backgroundColor: (ev.color || C.accent) + '20' }]}>
                        <Text style={[styles.badgeText, { color: ev.color || C.accent }]}>{ev.category}</Text>
                      </View>
                    </View>
                    {ev.description ? <Text style={styles.itemDesc}>{ev.description}</Text> : null}
                    {ev.expectedFormDurationMinutes != null && Number.isFinite(Number(ev.expectedFormDurationMinutes)) ? (
                      <Text style={[styles.itemDesc, { fontWeight: '700', color: C.accent }]}>
                        {t('agenda.expectedFormMinutes', { count: Math.floor(Number(ev.expectedFormDurationMinutes)) })}
                      </Text>
                    ) : null}
                    {ev.agendaOverlap ? (
                      <Text style={[styles.itemDesc, { color: '#DC2626', fontWeight: '700' }]}>{t('agenda.overlapWarning')}</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={ev.id}
                  style={styles.itemCardClient}
                  activeOpacity={0.75}
                  onPress={() => setActivityPreview(ev)}
                >
                  {period ? <Text style={styles.clientPeriod}>{period}</Text> : null}
                  <Text style={styles.clientTitle}>{ev.title}</Text>
                  <View style={styles.clientCatRow}>
                    <View style={[styles.clientCatDot, { backgroundColor: ev.color || C.accent }]} />
                    <Text style={styles.clientCat}>{categoryLabel(ev.category)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={goNewEvent} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={22} color={C.accent} />
          <Text style={styles.addBtnText}>{t('assetAgenda.addForAsset')}</Text>
        </TouchableOpacity>
      </CalendarProvider>

      <Modal visible={!!activityPreview} transparent animationType="fade" onRequestClose={() => setActivityPreview(null)}>
        <View style={styles.activityModalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActivityPreview(null)} />
          {activityPreview ? (
            <View style={[styles.activityModalCard, { backgroundColor: C.cardWhite, borderColor: C.border }]}>
              <Text style={[styles.activityModalTitle, { color: C.slate }]}>{t('agenda.activityPreviewTitle')}</Text>
              {isTechnicianUi && activityPreview.osNumber ? (
                <Text style={[styles.activityModalOs, { color: C.accent }]}>
                  {t('agenda.osNumberLabel')}: {activityPreview.osNumber}
                </Text>
              ) : null}
              <Text style={[styles.activityModalHeading, { color: C.slate }]} numberOfLines={4}>
                {activityPreview.title}
              </Text>
              {activityPreviewPeriod ? (
                <Text style={[styles.activityModalMeta, { color: C.textSecondary }]}>
                  {t('agenda.periodLabel')}: {activityPreviewPeriod}
                </Text>
              ) : null}
              {activityPreview.description ? (
                <Text style={[styles.activityModalDesc, { color: C.textSecondary }]}>{activityPreview.description}</Text>
              ) : null}
              <View style={styles.activityModalActions}>
                {isTechnicianUi && canOpenChecklistActivity(activityPreview) ? (
                  <TouchableOpacity
                    style={[styles.activityModalPrimaryBtn, { backgroundColor: C.accent }]}
                    onPress={() => {
                      const ev = activityPreview;
                      setActivityPreview(null);
                      openChecklistForEvent(ev);
                    }}
                  >
                    <Text style={styles.activityModalPrimaryBtnText}>{t('agenda.openActivity')}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[styles.activityModalSecondaryBtn, { borderColor: C.border, backgroundColor: C.surfaceLow }]}
                  onPress={() => setActivityPreview(null)}
                >
                  <Text style={[styles.activityModalSecondaryBtnText, { color: C.slate }]}>{t('agenda.close')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function createStyles(C: ColorPalette) {
  return StyleSheet.create({
    wrap: { minHeight: 380 },
    calendarBox: {
      backgroundColor: C.cardWhite,
      borderRadius: 12,
      paddingBottom: 8,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    retouchHandle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
    handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border },
    expandLabel: { fontSize: 10, color: C.textLight, fontWeight: '700', marginTop: 4 },
    loaderWrap: { paddingVertical: 24, alignItems: 'center', gap: 8 },
    loaderText: { fontSize: 12, color: C.textLight, fontWeight: '600' },
    sectionHeader: {
      color: C.textLight,
      fontWeight: '800',
      textTransform: 'uppercase',
      fontSize: 11,
      marginBottom: 10,
      paddingHorizontal: 2,
    },
    listScroll: { maxHeight: 320 },
    emptyData: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 12 },
    emptyTitle: { fontSize: 14, fontWeight: '800', color: C.textLight, marginTop: 8 },
    emptyDesc: { fontSize: 12, color: C.textSecondary, marginTop: 4, textAlign: 'center' },
    itemCardTech: {
      backgroundColor: C.cardWhite,
      marginBottom: 10,
      borderRadius: 14,
      padding: 14,
      borderLeftWidth: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 4 },
    itemTitle: { fontSize: 14, fontWeight: '800', color: C.slate, flex: 1, marginRight: 8 },
    badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    badgeText: { fontSize: 9, fontWeight: '900' },
    itemDesc: { fontSize: 12, color: C.textSecondary, lineHeight: 17, marginBottom: 8 },
    itemCardClient: {
      backgroundColor: C.surfaceLow,
      marginBottom: 10,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: C.border,
    },
    clientPeriod: { fontSize: 11, fontWeight: '800', color: C.accent, marginBottom: 6 },
    clientTitle: { fontSize: 15, fontWeight: '800', color: C.slate, marginBottom: 8 },
    clientCatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    clientCatDot: { width: 8, height: 8, borderRadius: 4 },
    clientCat: { fontSize: 11, fontWeight: '700', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 12,
      marginTop: 4,
    },
    addBtnText: { fontSize: 13, fontWeight: '800', color: C.accent },
    activityModalRoot: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    activityModalCard: {
      width: '100%',
      maxWidth: 400,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
    },
    activityModalTitle: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
    activityModalOs: { fontSize: 13, fontWeight: '900', marginBottom: 6 },
    activityModalHeading: { fontSize: 16, fontWeight: '800', marginBottom: 10, lineHeight: 22 },
    activityModalMeta: { fontSize: 13, marginBottom: 8, lineHeight: 18 },
    activityModalDesc: { fontSize: 13, lineHeight: 20, marginBottom: 12 },
    activityModalActions: { gap: 10, marginTop: 4 },
    activityModalPrimaryBtn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    activityModalPrimaryBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    activityModalSecondaryBtn: { paddingVertical: 11, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    activityModalSecondaryBtnText: { fontSize: 14, fontWeight: '700' },
  });
}
