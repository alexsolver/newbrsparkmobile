import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { AssetDocService } from '../../src/services/assetDocs';
import { getLocalAssets } from '../../src/database';
import { useFocusEffect } from 'expo-router';
import { StockService } from '../../src/services/stockService';
import { CostService } from '../../src/services/costService';


export default function CalendarScreen() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DOC' | 'MAINT' | 'STOCK'>('ALL');
  const [currentPivot, setCurrentPivot] = useState(new Date());
  
  const loadEvents = async () => {
    setLoading(true);
    try {
      const docs = await AssetDocService.getAllDocuments();
      const stock = await StockService.getItems();
      const movements = await StockService.getMovements();
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
          color: '#3B82F6', 
          tag: 'VENCIMENTO',
          icon: 'document-text'
        }));

      // Manutenção Mock (Em breve real)
      formatted.push({
        id: 'm1', date: new Date().toISOString().split('T')[0], title: 'Revisão Motor de Popa',
        assetName: 'Lancha Brspark', type: 'MAINT', color: '#10B981', tag: 'MANUTENÇÃO', icon: 'build'
      });
      
      // Eventos Dinâmicos de Estoque (Items Críticos)
      const criticalItems = stock.filter(i => i.currentStock <= i.minStock);
      criticalItems.forEach(i => {
        const assetName = assetMap.get(i.locationId) || 'Geral';
        formatted.push({
          id: `stock-${i.id}`,
          date: new Date().toISOString().split('T')[0], 
          title: `Reposição: ${i.name} (Saldo: ${i.currentStock} ${i.unit})`,
          assetName: assetName,
          type: 'STOCK',
          color: '#F59E0B',
          tag: 'CRÍTICO',
          icon: 'warning'
        });
      });

      // Movimentações de Estoque (Histórico Logístico)
      movements.forEach(m => {
        const it = stock.find(i => i.id === m.itemId);
        const assetName = assetMap.get(it?.locationId || '1') || 'Geral';
        formatted.push({
          id: `mov-${m.id}`,
          date: m.timestamp.split('T')[0],
          title: `${m.type === 'TRANSFER' ? 'Transferência' : m.type === 'IN' ? 'Entrada' : 'Saída'}: ${it?.name || 'Item'} (${m.quantity})`,
          assetName: assetName,
          type: 'STOCK',
          color: m.type === 'TRANSFER' ? '#6366F1' : m.type === 'IN' ? '#10B981' : '#EF4444',
          tag: 'LOGÍSTICA',
          icon: m.type === 'TRANSFER' ? 'swap-horizontal' : m.type === 'IN' ? 'chevron-down' : 'chevron-up'
        });
      });

      // Contas Recorrentes (Financeiro)
      const recurring = await CostService.getRecurringCosts();
      recurring.forEach(r => {
        if (r.status === 'ACTIVE' && r.nextDueDate) {
          formatted.push({
            id: `rec-${r.id}`,
            date: r.nextDueDate,
            title: `${r.type === 'REVENUE' ? 'Receber' : 'Pagar'}: ${r.description}`,
            assetName: assetMap.get(r.assetId) || 'Geral',
            type: 'DOC', 
            color: r.type === 'REVENUE' ? '#10B981' : '#F59E0B',
            tag: r.type === 'REVENUE' ? 'RECEITA' : 'CONTA',
            icon: r.type === 'REVENUE' ? 'trending-up' : 'calendar-number'
          });
        }
      });

      if (activeFilter !== 'ALL') {
        formatted = formatted.filter(e => e.type === activeFilter);
      }


      setEvents(formatted);
    } catch (e) {
      console.log('Error loading events:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadEvents(); }, [activeFilter]);
  useFocusEffect(useCallback(() => { loadEvents(); }, []));

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
    for (let i = 0; i < firstDayOfMonth; i++) { days.push(<View key={`empty-${i}`} style={S.gridCellEmpty} />); }
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(currentPivot.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasEvent = datesWithEvents.has(dStr);
      const isSelected = selectedDate === dStr;
      const isToday = new Date().toISOString().split('T')[0] === dStr;
      
      days.push(
        <TouchableOpacity 
          key={d} 
          style={[S.gridCell, isSelected && S.gridCellActive]} 
          onPress={() => setSelectedDate(dStr)}
        >
          <Text style={[S.gridCellText, isSelected && { color: '#fff' }, isToday && !isSelected && { color: colors.primary, fontWeight: '900' }]}>{d}</Text>
          {hasEvent && <View style={[S.dot, isSelected && { backgroundColor: '#fff' }]} />}
          {isToday && !isSelected && <View style={S.todayIndicator} />}
        </TouchableOpacity>
      );
    }
    return days;
  };

  const weekDayNames = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

  return (
    <SafeAreaView style={S.container}>
      <View style={S.pHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
           <View><Text style={S.pTitle}>Agenda</Text></View>
           <TouchableOpacity style={S.addBtn}><Ionicons name="calendar-outline" size={24} color="#fff" /></TouchableOpacity>
        </View>

        <View style={S.filterRow}>
           <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
              {[
                { id: 'ALL', label: 'TUDO', icon: 'apps' },
                { id: 'MAINT', label: 'OPERACIONAL', icon: 'construct' },
                { id: 'DOC', label: 'VENCIMENTOS', icon: 'shield-checkmark' },
                { id: 'STOCK', label: 'SUPRIMENTOS', icon: 'cart' },
              ].map(f => (
                <TouchableOpacity key={f.id} style={[S.filterChip, activeFilter === f.id && S.filterChipActive]} onPress={() => setActiveFilter(f.id as any)}>
                   <Text style={[S.filterChipText, activeFilter === f.id && S.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
           </ScrollView>
        </View>
      </View>

      <View style={S.calendarCard}>
        <View style={S.monthNav}>
           <TouchableOpacity onPress={() => changeMonth(-1)} style={S.navIcon}><Ionicons name="chevron-back" size={20} color={colors.primary} /></TouchableOpacity>
           <Text style={S.monthTitle}>{monthName.toUpperCase()} {year}</Text>
           <TouchableOpacity onPress={() => changeMonth(1)} style={S.navIcon}><Ionicons name="chevron-forward" size={20} color={colors.primary} /></TouchableOpacity>
        </View>
        <View style={S.weekLabels}>
           {weekDayNames.map((l, i) => <Text key={i} style={S.weekLabelText}>{l}</Text>)}
        </View>
        <View style={S.gridBody}>
           {renderMonthGrid()}
        </View>
      </View>

      <View style={S.listContainer}>
        <Text style={S.sectionLabel}>AGENDA PARA {new Date(selectedDate).toLocaleDateString('pt-BR', { day:'2-digit', month: 'long' })}</Text>
        
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : selectedDayEvents.length === 0 ? (
          <View style={S.emptyState}>
             <Ionicons name="sparkles-outline" size={48} color={colors.border} />
             <Text style={S.emptyText}>Zona de Silêncio Operacional.{'\n'}Nada agendado para este radar hoje.</Text>
          </View>
        ) : (
          <FlatList 
            data={selectedDayEvents}
            keyExtractor={ev => ev.id}
            renderItem={({item: ev}) => (
              <TouchableOpacity style={S.eventCard}>
                <View style={[S.eventIcon, { backgroundColor: ev.color + '10' }]}>
                   <Ionicons name={ev.icon} size={20} color={ev.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.eventTitle}>{ev.title}</Text>
                  <View style={S.metaRow}>
                    <Text style={S.metaText}>{ev.assetName}</Text>
                    <View style={S.tagPH}><Text style={[S.tagT, { color: ev.color }]}>{ev.tag}</Text></View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.border} />
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  pHeader: { padding: 16, paddingTop: 60, backgroundColor: '#fff' },
  pTitle: { color: colors.primary, fontSize: 28, fontWeight: '900' },
  addBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  filterRow: { marginTop: 15 },
  filterScroll: { gap: 10, paddingBottom: 5 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, letterSpacing: 0.5 },
  filterChipTextActive: { color: '#fff' },
  calendarCard: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 15 },
  monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  monthTitle: { fontSize: 15, fontWeight: '900', color: colors.primary, letterSpacing: 1 },
  navIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  weekLabels: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
  weekLabelText: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '900', color: '#94A3B8' },
  gridBody: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
  gridCell: { width: '14.28%', height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
  gridCellEmpty: { width: '14.28%', height: 48 },
  gridCellActive: { backgroundColor: colors.primary },
  gridCellText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  dot: { position:'absolute', bottom: 8, width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF4444' },
  todayIndicator: { position:'absolute', bottom: 4, width: 12, height: 2, borderRadius: 1, backgroundColor: colors.primary },
  listContainer: { flex: 1, paddingHorizontal: 16, backgroundColor: '#FBFBFE', borderTopLeftRadius: 30, borderTopRightRadius: 30, marginTop: 10, paddingTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '900', color: colors.textLight, letterSpacing: 1, marginBottom: 20 },
  eventCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  eventIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  eventTitle: { fontSize: 15, fontWeight: '800', color: colors.primary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  metaText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  tagPH: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#F8FAFC' },
  tagT: { fontSize: 9, fontWeight: '900' },
  emptyState: { alignItems: 'center', marginTop: 60, gap: 15 },
  emptyText: { textAlign: 'center', color: colors.textLight, fontSize: 13, lineHeight: 20, fontWeight: '600' }
});
