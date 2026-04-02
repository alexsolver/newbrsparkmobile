import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import { AgendaEvent } from '../../src/types/agenda';
import { getLocalAssets } from '../../src/database/index';

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

export default function AgendaScreen() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [events, setEvents] = useState<AgendaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [assets, setAssets] = useState<any[]>([]);
  const scrollViewRef = useRef<ScrollView>(null);

  useEffect(() => {
    setAssets(getLocalAssets() || []);
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
      const start = new Date(ev.startDate);
      const end = new Date(ev.endDate);
      const col = ev.color || '#3b82f6';
      
      const days = [];
      let current = new Date(start);
      while (current <= end) {
        days.push(toDateString(current));
        current.setDate(current.getDate() + 1);
      }

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
    marks[selectedDate] = { ...marks[selectedDate], selected: true, selectedColor: '#e2e8f0', selectedTextColor: '#0f172a' };

    return marks;
  }, [events, selectedDate]);

  const listData = useMemo(() => {
    const map: Record<string, AgendaEvent[]> = {};
    events.forEach(ev => {
      const start = new Date(ev.startDate);
      const end = new Date(ev.endDate);
      let current = new Date(start);
      while (current <= end) {
        const dStr = toDateString(current);
        if (!map[dStr]) map[dStr] = [];
        // Prevent duplicate refs if same event has multiple categories? No, just push.
        map[dStr].push(ev);
        current.setDate(current.getDate() + 1);
      }
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
    
    return (
      <TouchableOpacity 
        style={[styles.itemCard, { borderLeftColor: ev.color || '#ccc' }]}
        activeOpacity={0.7}
        onPress={() => {
           // Se a fonte for CHECKLIST, abre o motor dinâmico
           if (ev.source === 'CHECKLIST' && ev.refId) {
              router.push(`/checklist/${ev.refId}` as any);
           } else {
              Alert.alert(ev.title, `${ev.description || ''}\nAtivo: ${asset?.title || 'Geral'}`);
           }
        }}
      >
        <View style={styles.itemHeader}>
          <Text style={styles.itemTitle}>{ev.title}</Text>
          <View style={[styles.badge, { backgroundColor: ev.color + '20' }]}>
             <Text style={[styles.badgeText, { color: ev.color }]}>{ev.category}</Text>
          </View>
        </View>
        {ev.description && <Text style={styles.itemDesc}>{ev.description}</Text>}
        {asset && (
          <View style={styles.itemMeta}>
            <Ionicons name="home-outline" size={12} color="#64748b" />
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
    const TODAY = new Date();
    TODAY.setHours(0,0,0,0);
    
    // O zoom altera APENAS a largura visual. Manteve-se o "infinito" com 365 dias para navegação
    const DAYS_TO_SHOW = 365;
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

    const daysArray = Array.from({length: DAYS_TO_SHOW}).map((_, i) => {
      const d = new Date(TODAY);
      d.setDate(d.getDate() + i);
      return d;
    });

    const rows = assets.map(a => ({ id: a.id, title: a.title, events: [] as AgendaEvent[] }));
    const othersRow = { id: 'other', title: 'Geral', events: [] as AgendaEvent[] };

    events.forEach(ev => {
      const eEnd = new Date(ev.endDate);
      eEnd.setHours(23,59,59,999);
      if (eEnd.getTime() < TODAY.getTime()) return; 
      
      const r = rows.find(x => x.id === ev.assetId);
      if (r) r.events.push(ev);
      else othersRow.events.push(ev);
    });

    const activeRows = rows; // Mostra todos os bens para ver os buracos de ociosidade
    if (othersRow.events.length > 0) activeRows.push(othersRow);

    return (
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        {/* Barra de Controles do Gantt */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f1f5f9', backgroundColor: '#fff' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity onPress={() => scrollViewRef.current?.scrollTo({ x: 0, animated: true })} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: '#e2e8f0' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: '#0f172a' }}>HOJE</Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 8, padding: 4 }}>
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

        <ScrollView bounces={false} style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ paddingBottom: 100 }}>
        <View style={{ flexDirection: 'row' }}>
          
          {/* Eixo Y Fixo (Esquerda) */}
          <View style={{ width: LEFT_COL_WIDTH, backgroundColor: '#fff', borderRightWidth: 1, borderColor: '#f1f5f9', shadowColor: '#000', shadowOffset: {width: 2, height: 0}, shadowOpacity: 0.05, shadowRadius: 4, zIndex: 10 }}>
            <View style={{ height: 46, borderBottomWidth: 1, borderColor: '#e2e8f0', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
              <Text style={{ fontSize: 9, color: '#94a3b8', fontWeight: '900', letterSpacing: 0.5 }}>BEM/VEÍCULO</Text>
            </View>

            {activeRows.map(r => (
              <View key={r.id} style={{ height: ROW_HEIGHT, justifyContent: 'center', paddingHorizontal: 8, borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
                 {r.id !== 'other' ? (
                   <Text style={{ fontSize: 11, fontWeight: '800', color: '#0f172a' }} numberOfLines={2}>{r.title}</Text>
                 ) : (
                   <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b' }}>Geral</Text>
                 )}
              </View>
            ))}
          </View>

          {/* Eixo X e Grid Horizontal */}
          <ScrollView ref={scrollViewRef} horizontal bounces={false} showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ flexDirection: 'column' }}>
              
              <View style={{ flexDirection: 'row', height: 46, borderBottomWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' }}>
                {daysArray.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isFirstOfMonth = d.getDate() === 1;
                  return (
                    <View key={i} style={{ width: COL_WIDTH, alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderColor: '#e2e8f0', backgroundColor: isWeekend ? '#f1f5f9' : 'transparent', overflow: 'visible', zIndex: isFirstOfMonth ? 20 : 1 }}>
                      {(zoomLevel === 1 || zoomLevel === 2) && (
                        <>
                          <Text style={{ fontSize: zoomLevel === 1 ? 10 : 9, fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>{d.toLocaleDateString('pt-BR', { weekday: 'short' }).substring(0,3)}</Text>
                          <Text style={{ fontSize: zoomLevel === 1 ? 15 : 13, fontWeight: '900', color: i === 0 ? '#3b82f6' : '#0f172a' }}>{d.getDate()}</Text>
                        </>
                      )}
                      {zoomLevel === 3 && (
                        <Text style={{ fontSize: 10, fontWeight: '900', color: i === 0 || isFirstOfMonth ? '#3b82f6' : '#64748b' }}>{d.getDate()}</Text>
                      )}
                      {zoomLevel === 4 && isFirstOfMonth && (
                        <Text style={{ position: 'absolute', left: 4, fontSize: 9, fontWeight: '900', color: '#0f172a', zIndex: 100, width: 40, textTransform: 'uppercase' }}>
                          {d.toLocaleDateString('pt-BR', { month: 'short' })}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>

              {activeRows.map(r => (
                <View key={r.id} style={{ height: ROW_HEIGHT, flexDirection: 'row', borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
                  {daysArray.map((d, i) => (
                    <View key={i} style={{ width: COL_WIDTH, height: ROW_HEIGHT, borderRightWidth: 1, borderColor: '#f1f5f9', backgroundColor: d.getDay() === 0 || d.getDay() === 6 ? '#f8fafc' : '#fff' }} />
                  ))}

                  {r.events.map((ev, evIndex) => {
                    const sDate = new Date(ev.startDate); sDate.setHours(0,0,0,0);
                    const eDate = new Date(ev.endDate); eDate.setHours(0,0,0,0);
                    
                    const leftDays = Math.round((sDate.getTime() - TODAY.getTime()) / (1000*60*60*24));
                    const durationDays = Math.round((eDate.getTime() - sDate.getTime()) / (1000*60*60*24)) + 1;

                    const leftPx = Math.max(0, leftDays * COL_WIDTH);
                    const cutoff = leftDays < 0 ? Math.abs(leftDays) : 0;
                    const finalWidthPx = (durationDays - cutoff) * COL_WIDTH;

                    if (finalWidthPx <= 0 || leftPx > DAYS_TO_SHOW * COL_WIDTH) return null;
                    const w = Math.min(finalWidthPx, (DAYS_TO_SHOW * COL_WIDTH) - leftPx);
                    
                    // Alterna altura para eventos que sobrepõem no mesmo dia (ex: início um, fim outro)
                    const topPos = 6 + (Math.floor(evIndex/2) % 2) * 26 + (evIndex % 2) * 6; // Simple staggering

                    return (
                      <TouchableOpacity
                        key={ev.id || Math.random().toString()}
                        activeOpacity={0.8}
                        onPress={() => {
                           if (ev.source === 'CHECKLIST' && ev.refId) {
                              router.push(`/checklist/${ev.refId}` as any);
                           } else {
                              Alert.alert(ev.title, `${ev.description || ''}\nAtivo: ${r.title}`);
                           }
                        }}
                        style={{
                          position: 'absolute', left: leftPx + 4, top: topPos, width: Math.max(10, w - 8), height: 22,
                          backgroundColor: ev.color || '#3b82f6', borderRadius: 6,
                          justifyContent: 'center', paddingHorizontal: 6,
                          shadowColor: ev.color || '#3b82f6', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.2, shadowRadius: 3
                        }}
                      >
                         <Text style={{ fontSize: 9, fontWeight: '900', color: '#fff', letterSpacing: 0.2 }} numberOfLines={1}>{ev.title}</Text>
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
            <Ionicons name="arrow-back" size={22} color="#0f172a" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Agenda</Text>
        </View>
        <View style={{flexDirection: 'row', gap: 12}}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => setIsGantt(!isGantt)}>
            <Ionicons name={isGantt ? 'calendar' : 'bar-chart'} size={24} color={isGantt ? "#3b82f6" : "#0f172a"} />
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
                  backgroundColor: '#ffffff', calendarBackground: '#ffffff',
                  textSectionTitleColor: '#64748b', selectedDayBackgroundColor: '#3b82f6',
                  selectedDayTextColor: '#ffffff', todayTextColor: '#3b82f6',
                  dayTextColor: '#0f172a', textDisabledColor: '#cbd5e1',
                  arrowColor: '#3b82f6', monthTextColor: '#0f172a',
                  textDayFontWeight: '500', textMonthFontWeight: '800', textDayHeaderFontWeight: '600'
                }}
              />
            ) : (
              <View style={{ paddingTop: 8 }}>
                <WeekCalendar
                  firstDay={1}
                  markingType={'multi-period'}
                  markedDates={markedDates}
                  theme={{
                    selectedDayBackgroundColor: '#3b82f6',
                    selectedDayTextColor: '#ffffff',
                    todayTextColor: '#3b82f6',
                    dayTextColor: '#0f172a',
                    textDisabledColor: '#cbd5e1',
                    arrowColor: '#3b82f6',
                  }}
                />
              </View>
            )}

            <TouchableOpacity style={styles.retouchHandle} onPress={toggleExpand} activeOpacity={0.8}>
              <View style={styles.handleBar} />
              <Text style={{ fontSize: 10, color: '#94a3b8', fontWeight: '700', marginTop: 4 }}>
                {isExpanded ? 'Recolher para Semana' : 'Expandir Calendário'}
              </Text>
              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator size="large" color="#3b82f6" />
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
                  <Ionicons name="calendar-clear-outline" size={48} color="#cbd5e1" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    zIndex: 10
  },
  headerTitle: { fontSize: 26, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
  fab: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#3b82f6',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f8fafc', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0' },
  zoomBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6 },
  zoomBtnActive: { backgroundColor: '#3b82f6', shadowColor: '#3b82f6', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.2, shadowRadius: 3, elevation: 2 },
  zoomText: { fontSize: 10, fontWeight: '800', color: '#64748b' },
  zoomTextActive: { color: '#fff' },
  calendarBox: { backgroundColor: '#fff', paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  retouchHandle: { alignItems: 'center', paddingTop: 8, paddingBottom: 4 },
  handleBar: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#e2e8f0' },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 20, padding: 3 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18 },
  toggleActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  toggleText: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  toggleTextActive: { color: '#0f172a' },
  loaderWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  
  sectionHeader: { backgroundColor: '#f8fafc', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  sectionHeaderText: { color: '#64748b', fontWeight: '800', textTransform: 'uppercase', fontSize: 11 },
  itemCard: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  itemTitle: { fontSize: 15, fontWeight: '800', color: '#1e293b', flex: 1, marginRight: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '900' },
  itemDesc: { fontSize: 13, color: '#475569', lineHeight: 18, marginBottom: 12 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f1f5f9', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  itemMetaText: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  
  emptyData: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyDataTitle: { fontSize: 16, fontWeight: '800', color: '#64748b', marginTop: 12 },
  emptyDataDesc: { fontSize: 13, color: '#94a3b8', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 }
});
