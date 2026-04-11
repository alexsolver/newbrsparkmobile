import React, { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, SectionList, LayoutAnimation, UIManager, Platform, ScrollView } from 'react-native';

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
import { AgendaService } from '../../src/services/agendaService';
import type { AgendaEvent } from '../../src/types/agenda';
import { getLocalAssets } from '../../src/database/index';
import { LocationZoneTypeBadge } from '../../src/components/LocationZoneTypeBadge';
import { ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { computeTimedAgendaSegments } from '../../src/utils/agendaSlotLayout';

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
const getTodayString = () => toDateString(new Date());

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
      days.push(toDateString(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return days.length ? days : [toDateString(s)];
  }
  const start = new Date(ev.startDate);
  const end = new Date(ev.endDate);
  const days: string[] = [];
  let current = new Date(start);
  while (current <= end) {
    days.push(toDateString(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

export default function AgendaScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createAgendaStyles(C), [C]);
  
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [assets, setAssets] = useState<any[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
      setAssets(getLocalAssets(undefined, { includeMobileWarehouse: false }) || []);
  }, []);

  const fetchAgenda = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    try {
      const data = await AgendaService.getUnifiedAgenda(user.email);
      setEvents(data);
    } catch (e: any) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchAgenda();
    }, [fetchAgenda])
  );

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
        onPress={() => {
           // Se a fonte for CHECKLIST, abre o motor dinâmico
           if (ev.source === 'CHECKLIST' && ev.refId) {
              router.push({
                pathname: '/checklist/[id]',
                params: { id: String(ev.refId), taskId: String(ev.id) },
              } as any);
           } else {
              Alert.alert(ev.title, `${ev.description || ''}\nAtivo: ${asset?.title || 'Geral'}`);
           }
        }}
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

  const { mode } = useAppContext();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGantt, setIsGantt] = useState(mode === 'PROVIDER' || user?.role === 'PROVIDER');

  useEffect(() => {
    if (mode === 'PROVIDER') {
      setIsGantt(true);
    }
  }, [mode]);

  const [zoomLevel, setZoomLevel] = useState<1 | 2 | 3 | 4>(2);

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
      const eEnd = ev.agendaEndAt ? new Date(ev.agendaEndAt) : new Date(ev.endDate);
      if (!ev.agendaEndAt) eEnd.setHours(23, 59, 59, 999);
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

    const ROW_HEIGHT = 65;
    const LEFT_COL_WIDTH = 90;
    const DAYS_TO_SHOW = MathZoomWidth;

    return (
      <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: C.divider, backgroundColor: C.cardWhite }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity onPress={() => scrollViewRef.current?.scrollTo({ x: 0, animated: true })} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: C.border }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: C.slate }}>HOJE</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', backgroundColor: C.divider, borderRadius: 8, padding: 4 }}>
              <TouchableOpacity onPress={() => setZoomLevel(1)} style={[styles.zoomBtn, zoomLevel === 1 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, zoomLevel === 1 && styles.zoomTextActive]}>1S</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setZoomLevel(2)} style={[styles.zoomBtn, zoomLevel === 2 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, zoomLevel === 2 && styles.zoomTextActive]}>1M</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setZoomLevel(3)} style={[styles.zoomBtn, zoomLevel === 3 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, zoomLevel === 3 && styles.zoomTextActive]}>3M</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setZoomLevel(4)} style={[styles.zoomBtn, zoomLevel === 4 && styles.zoomBtnActive]}>
                <Text style={[styles.zoomText, zoomLevel === 4 && styles.zoomTextActive]}>6M</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <ScrollView bounces={false} style={{ flex: 1, backgroundColor: C.cardWhite }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row' }}>
          
          <View style={{ width: LEFT_COL_WIDTH, backgroundColor: C.cardWhite, borderRightWidth: 1, borderColor: C.divider, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.05, shadowRadius: 4, zIndex: 10 }}>
            <View style={{ height: 46, borderBottomWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceLow }}>
              <Text style={{ fontSize: 9, color: C.textLight, fontWeight: '900', letterSpacing: 0.5 }}>BEM/VEÍCULO</Text>
            </View>

            {activeRows.map(r => (
              <View key={r.id} style={{ height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: C.divider }}>
                 {r.id !== 'other' ? (
                   <Text style={{ fontSize: 11, fontWeight: '800', color: C.slate }} numberOfLines={2}>{r.title}</Text>
                 ) : (
                   <Text style={{ fontSize: 11, fontWeight: '800', color: C.textLight }}>Geral</Text>
                 )}
              </View>
            ))}
          </View>

          {/* Eixo X e Grid Horizontal */}
          <ScrollView ref={scrollViewRef} horizontal bounces={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
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

              {activeRows.map(r => (
                <View key={r.id} style={{ height: ROW_HEIGHT, flexDirection: 'row', borderBottomWidth: 1, borderColor: C.divider }}>
                  {daysArray.map((d, i) => (
                    <View key={i} style={{ width: COL_WIDTH, height: ROW_HEIGHT, borderRightWidth: 1, borderColor: C.divider, backgroundColor: d.getDay() === 0 || d.getDay() === 6 ? C.surfaceLow : C.cardWhite }} />
                  ))}

                  {r.events.map((ev, evIndex) => {
                    const topPos = 6 + (Math.floor(evIndex / 2) % 2) * 26 + (evIndex % 2) * 6;

                    const onBarPress = () => {
                      if (ev.source === 'CHECKLIST' && ev.refId) {
                        router.push({
                          pathname: '/checklist/[id]',
                          params: { id: String(ev.refId), taskId: String(ev.id) },
                        } as any);
                      } else {
                        Alert.alert(ev.title, `${ev.description || ''}\nAtivo: ${r.title}`);
                      }
                    };

                    const barBg = ev.color || MEDIA_TAG_COLORS.BEFORE;
                    const overlapOutline = ev.agendaOverlap
                      ? { borderWidth: 2, borderColor: '#FECACA' as const }
                      : {};

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
                                  height: 22,
                                  backgroundColor: barBg,
                                  borderRadius: 6,
                                  justifyContent: 'center',
                                  paddingHorizontal: 4,
                                  shadowColor: barBg,
                                  shadowOffset: { width: 0, height: 2 },
                                  shadowOpacity: 0.2,
                                  shadowRadius: 3,
                                  ...overlapOutline,
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

                    const sDate = new Date(ev.startDate);
                    sDate.setHours(0, 0, 0, 0);
                    const eDate = new Date(ev.endDate);
                    eDate.setHours(0, 0, 0, 0);

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
                          height: 22,
                          backgroundColor: barBg,
                          borderRadius: 6,
                          justifyContent: 'center',
                          paddingHorizontal: 6,
                          shadowColor: barBg,
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.2,
                          shadowRadius: 3,
                          ...overlapOutline,
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
              ))}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={styles.header}>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.push('/(tabs)')} style={{ marginRight: 12, padding: 4 }}>
            <Ionicons name="arrow-back" size={22} color={C.slate} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agenda</Text>
        </View>
        <View style={{flexDirection: 'row', gap: 12}}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setIsGantt(!isGantt)}>
            <Ionicons name={isGantt ? 'calendar' : 'bar-chart'} size={24} color={isGantt ? C.accent : C.slate} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => router.push('/agenda/new')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {isGantt ? renderGantt() : (
        <CalendarProvider
          date={selectedDate}
          onDateChanged={(d) => setSelectedDate(d)}
          showTodayButton={false}
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
              sections={listData}
              keyExtractor={(item, index) => item.id ? `${item.id}-${index}` : `empty-${index}`}
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
      )}
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
    headerTitle: { fontSize: 26, fontWeight: '900', color: C.slate, letterSpacing: -0.5 },
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
    calendarBox: { backgroundColor: C.cardWhite, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: C.divider },
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
  });
}
