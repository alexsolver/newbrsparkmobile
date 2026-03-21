import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { AssetDocService, AssetDocument } from '../../src/services/assetDocs';
import { getLocalAssets } from '../../src/database';
import { useFocusEffect } from 'expo-router';

export default function CalendarScreen() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [viewMode, setViewMode] = useState<'DAY' | 'WEEK' | 'MONTH'>('DAY');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DOC' | 'MAINT'>('ALL');
  const [currentPivot, setCurrentPivot] = useState(new Date());
  
  const loadEvents = async () => {
    setLoading(true);
    const docs = await AssetDocService.getAllDocuments();
    const assets = getLocalAssets();
    const assetMap = new Map(assets.map(a => [a.id, a.title]));
    
    let formatted: any[] = docs
      .filter(d => d.expirationDate)
      .map(d => ({
        id: d.id,
        date: d.expirationDate!.split('T')[0],
        title: d.title,
        assetName: assetMap.get(d.assetId) || 'Ativo Desconhecido',
        type: 'DOC',
        color: '#E11D48',
        tag: 'VENCIMENTO DOC'
      }));

    // Mock de manutenções para popular a agenda
    formatted.push({
      id: 'm1', date: new Date().toISOString().split('T')[0], title: 'Troca de Óleo Preventiva',
      assetName: 'Toyota Corolla', type: 'MAINT', color: '#10B981', tag: 'MANUTENÇÃO'
    });
      
    if (activeFilter !== 'ALL') {
      formatted = formatted.filter(e => e.type === activeFilter);
    }

    setEvents(formatted);
    setLoading(false);
  };

  useEffect(() => {
    loadEvents();
  }, [activeFilter]);

  useFocusEffect(useCallback(() => {
    loadEvents();
  }, []));

  const daysInMonth = new Date(currentPivot.getFullYear(), currentPivot.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentPivot.getFullYear(), currentPivot.getMonth(), 1).getDay();
  const monthName = currentPivot.toLocaleString('pt-BR', { month: 'long' });
  const year = currentPivot.getFullYear();

  const selectedDayEvents = events.filter(e => e.date === selectedDate);
  const datesWithEvents = new Set(events.map(e => e.date));

  const changeMonth = (offset: number) => {
    const next = new Date(currentPivot);
    next.setMonth(next.getMonth() + offset);
    setCurrentPivot(next);
  };

  const renderMonthGrid = () => {
    const days = [];
    // Espaços vazios
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<View key={`empty-${i}`} style={S.gridCellEmpty} />);
    }
    // Dias do mês
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(currentPivot.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasEvent = datesWithEvents.has(dStr);
      const isSelected = selectedDate === dStr;
      const isToday = new Date().toISOString().split('T')[0] === dStr;
      
      days.push(
        <TouchableOpacity 
          key={d} 
          style={[
            S.gridCell, 
            isSelected && S.gridCellActive,
            isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1 }
          ]} 
          onPress={() => setSelectedDate(dStr)}
        >
          <Text style={[S.gridCellText, isSelected && { color: '#fff' }, isToday && !isSelected && { color: colors.primary }]}>{d}</Text>
          {hasEvent && <View style={[S.dot, isSelected && { backgroundColor: '#fff' }]} />}
        </TouchableOpacity>
      );
    }
    return days;
  };

  const weekDayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  const getWeekDays = () => {
    const sel = new Date(selectedDate + 'T12:00:00'); // Evita timezone issue
    const day = sel.getDay();
    const start = new Date(sel);
    start.setDate(sel.getDate() - day);
    
    return Array.from({ length: 7 }).map((_, i) => {
       const d = new Date(start);
       d.setDate(start.getDate() + i);
       return d;
    });
  };

  return (
    <SafeAreaView style={S.container}>
      <View style={S.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
           <View>
              <Text style={S.headerTitle}>Agenda Brspark</Text>
              <Text style={S.headerSubtitle}>{monthName} de {year}</Text>
           </View>
           <View style={S.viewToggle}>
              {(['DAY', 'WEEK', 'MONTH'] as const).map(m => (
                <TouchableOpacity key={m} style={[S.toggleBtn, viewMode === m && S.toggleBtnActive]} onPress={() => setViewMode(m)}>
                   <Text style={[S.toggleBtnText, viewMode === m && { color: '#fff' }]}>{m === 'DAY' ? 'Dia' : m === 'WEEK' ? 'Sem' : 'Mês'}</Text>
                </TouchableOpacity>
              ))}
           </View>
        </View>

        <View style={S.filterRow}>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {[
                { id: 'ALL', label: 'Todos', icon: 'apps' },
                { id: 'DOC', label: 'Docs', icon: 'document-text' },
                { id: 'MAINT', label: 'Manutenção', icon: 'build' },
              ].map(f => (
                <TouchableOpacity key={f.id} style={[S.filterChip, activeFilter === f.id && S.filterChipActive]} onPress={() => setActiveFilter(f.id as any)}>
                   <Ionicons name={f.icon as any} size={14} color={activeFilter === f.id ? '#fff' : colors.primary} />
                   <Text style={[S.filterChipText, activeFilter === f.id && { color: '#fff' }]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
           </ScrollView>
        </View>
      </View>

      {viewMode === 'MONTH' ? (
        <View style={S.calendarGridContainer}>
          <View style={S.gridHeader}>
             <TouchableOpacity onPress={() => changeMonth(-1)} style={S.navBtn}><Ionicons name="chevron-back" size={20} color={colors.primary} /></TouchableOpacity>
             <Text style={S.gridHeaderTitle}>{monthName} / {year}</Text>
             <TouchableOpacity onPress={() => changeMonth(1)} style={S.navBtn}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></TouchableOpacity>
          </View>
          <View style={S.weekLabels}>
             {weekDayNames.map((l, i) => <Text key={i} style={S.weekLabelText}>{l[0]}</Text>)}
          </View>
          <View style={S.gridBody}>
             {renderMonthGrid()}
          </View>
        </View>
      ) : (
        <View style={S.calendarStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16 }}>
            {(viewMode === 'WEEK' ? getWeekDays() : Array.from({ length: daysInMonth }).map((_, i) => {
               const d = new Date(currentPivot);
               d.setDate(i + 1);
               return d;
            })).map((d, i) => {
              const dStr = d.toISOString().split('T')[0];
              const active = dStr === selectedDate;
              const hasEvent = datesWithEvents.has(dStr);
              const isToday = new Date().toISOString().split('T')[0] === dStr;
              
              return (
                <TouchableOpacity 
                   key={i} 
                   style={[
                     S.dayChip, 
                     active && S.dayChipActive,
                     isToday && !active && { borderColor: colors.primary, borderWidth: 1.5 }
                   ]} 
                   onPress={() => setSelectedDate(dStr)}
                >
                  <Text style={[S.dayName, active && { color: '#fff' }]}>{weekDayNames[d.getDay()]}</Text>
                  <Text style={[S.dayText, active && S.dayTextActive]}>{d.getDate()}</Text>
                  {hasEvent && <View style={[S.dot, active && { backgroundColor: '#fff' }]} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView style={S.eventList} showsVerticalScrollIndicator={false}>
        <Text style={S.selectionLabel}>Eventos em {new Date(selectedDate).toLocaleDateString('pt-BR')}</Text>
        
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : selectedDayEvents.length === 0 ? (
          <View style={S.empty}>
             <Ionicons name="calendar-outline" size={64} color={colors.border} />
             <Text style={S.emptyText}>Zona de Silêncio Operacional.{'\n'}Nenhum vencimento ou atividade detectada no radar para este dia.</Text>
          </View>
        ) : (
          selectedDayEvents.map(ev => (
            <View key={ev.id} style={S.eventCard}>
              <View style={[S.indicator, { backgroundColor: ev.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={S.eventTitle}>{ev.title}</Text>
                <Text style={S.eventMeta}>Ativo: <Text style={{ color: colors.primary }}>{ev.assetName}</Text></Text>
                <View style={[S.typeBadge, { backgroundColor: ev.color + '15' }]}>
                   <Text style={[S.typeBadgeText, { color: ev.color }]}>{ev.tag}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.border} />
            </View>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 24, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: colors.primary },
  headerSubtitle: { fontSize: 13, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginTop: 4, fontWeight: '700' },
  
  viewToggle: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, gap: 4 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: colors.primary },
  toggleBtnText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  
  filterRow: { marginTop: 20 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.cardWhite, borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  
  calendarStrip: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.cardWhite },
  dayChip: { width: 56, height: 74, justifyContent: 'center', alignItems: 'center', marginRight: 10, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: colors.border },
  dayChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayName: { fontSize: 10, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase', marginBottom: 2 },
  dayText: { fontSize: 18, fontWeight: '800', color: colors.textSecondary },
  dayTextActive: { color: '#fff' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E11D48', marginTop: 4 },

  calendarGridContainer: { backgroundColor: colors.cardWhite, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  gridHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  gridHeaderTitle: { fontSize: 16, fontWeight: '900', color: colors.primary, textTransform: 'capitalize' },
  weekLabels: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8 },
  weekLabelText: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: colors.textLight },
  gridBody: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  gridCell: { width: '14.28%', height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  gridCellEmpty: { width: '14.28%', height: 44 },
  gridCellActive: { backgroundColor: colors.primary },
  gridCellText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  
  eventList: { flex: 1, padding: 24 },
  selectionLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 20 },
  empty: { paddingVertical: 80, alignItems: 'center', gap: 16 },
  emptyText: { color: colors.textLight, textAlign: 'center', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  
  eventCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border, elevation: 1 },
  indicator: { width: 4, height: '80%', borderRadius: 2, marginRight: 16 },
  eventTitle: { fontSize: 16, fontWeight: '900', color: colors.primary },
  eventMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 4, fontWeight: '600' },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginTop: 10 },
  typeBadgeText: { fontSize: 10, fontWeight: '900' }
});
