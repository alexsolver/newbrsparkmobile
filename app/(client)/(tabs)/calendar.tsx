import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { AssetDocService } from '../../../src/services/assetDocs';
import { getLocalAssets } from '../../../src/database';
import { useFocusEffect } from 'expo-router';
import { StockService } from '../../../src/services/stockService';
import { CostService } from '../../../src/services/costService';
import { useTranslation } from 'react-i18next';
import { formatMonthYear, formatDate } from '../../../src/i18n/formatters';

export default function CalendarScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createCalendarStyles(C), [C]);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'DOC' | 'MAINT' | 'STOCK'>('ALL');
  const [currentPivot, setCurrentPivot] = useState(new Date());
  const [isCalendarVisible, setIsCalendarVisible] = useState(false);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const docs = await AssetDocService.getAllDocuments();
      const stock = await StockService.getItems();
      const movements = await StockService.getMovements();
      const assets = getLocalAssets(undefined, { includeMobileWarehouse: false });
      const assetMap = new Map(assets.map((a) => [a.id, a.title]));

      let formatted: any[] = docs
        .filter((d) => d.expirationDate)
        .map((d) => ({
          id: d.id,
          date: d.expirationDate!.split('T')[0],
          title: d.title,
          assetName: assetMap.get(d.assetId) || t('calendar.eventTitles.unknownAsset'),
          type: 'DOC',
          color: C.accent,
          tag: 'VENCIMENTO',
          icon: 'document-text',
        }));

      formatted.push({
        id: 'm1',
        date: new Date().toISOString().split('T')[0],
        title: 'Revisão Motor de Popa',
        assetName: 'Lancha Brspark',
        type: 'MAINT',
        color: C.success.text,
        tag: 'MANUTENÇÃO',
        icon: 'build',
      });

      const criticalItems = stock.filter((i) => i.currentStock <= i.minStock);
      criticalItems.forEach((i) => {
        const assetName = assetMap.get(i.locationId) || 'Geral';
        formatted.push({
          id: `stock-${i.id}`,
          date: new Date().toISOString().split('T')[0],
          title: `Reposição: ${i.name} (Saldo: ${i.currentStock} ${i.unit})`,
          assetName,
          type: 'STOCK',
          color: MEDIA_TAG_COLORS.DURING,
          tag: 'CRÍTICO',
          icon: 'warning',
        });
      });

      movements.forEach((m) => {
        const it = stock.find((i) => i.id === m.itemId);
        const assetName = assetMap.get(it?.locationId || '1') || 'Geral';
        formatted.push({
          id: `mov-${m.id}`,
          date: m.timestamp.split('T')[0],
          title: `${m.type === 'TRANSFER' ? 'Transferência' : m.type === 'IN' ? 'Entrada' : 'Saída'}: ${it?.name || 'Item'} (${m.quantity})`,
          assetName,
          type: 'STOCK',
          color:
            m.type === 'TRANSFER'
              ? SERVICE_CATEGORY_COLORS.Tecnologia
              : m.type === 'IN'
                ? C.success.text
                : C.warning.text,
          tag: 'LOGÍSTICA',
          icon: m.type === 'TRANSFER' ? 'swap-horizontal' : m.type === 'IN' ? 'chevron-down' : 'chevron-up',
        });
      });

      const recurring = await CostService.getRecurringCosts();
      recurring.forEach((r) => {
        if (r.status === 'ACTIVE' && r.nextDueDate) {
          formatted.push({
            id: `rec-${r.id}`,
            date: r.nextDueDate,
            title: `${r.type === 'REVENUE' ? 'Receber' : 'Pagar'}: ${r.description}`,
            assetName: assetMap.get(r.assetId) || 'Geral',
            type: 'DOC',
            color: r.type === 'REVENUE' ? C.success.text : MEDIA_TAG_COLORS.DURING,
            tag: r.type === 'REVENUE' ? 'RECEITA' : 'CONTA',
            icon: r.type === 'REVENUE' ? 'trending-up' : 'calendar-number',
          });
        }
      });

      if (activeFilter !== 'ALL') {
        formatted = formatted.filter((e) => e.type === activeFilter);
      }

      setEvents(formatted);
    } catch (e) {
      console.log('Error loading events:', e);
    }
    setLoading(false);
  }, [activeFilter, C, t]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  const firstDayOfMonth = new Date(currentPivot.getFullYear(), currentPivot.getMonth(), 1).getDay();
  const daysInMonth = new Date(currentPivot.getFullYear(), currentPivot.getMonth() + 1, 0).getDate();
  const monthName = formatMonthYear(currentPivot);
  const year = currentPivot.getFullYear();

  const selectedDayEvents = events.filter((e) => e.date === selectedDate);
  const datesWithEvents = new Set(events.map((e) => e.date));

  const changeMonth = (offset: number) => {
    const next = new Date(currentPivot);
    next.setMonth(next.getMonth() + offset);
    setCurrentPivot(next);
  };

  const renderMonthGrid = () => {
    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(<View key={`empty-${i}`} style={S.gridCellEmpty} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = `${year}-${String(currentPivot.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasEvent = datesWithEvents.has(dStr);
      const isSelected = selectedDate === dStr;
      const isToday = new Date().toISOString().split('T')[0] === dStr;

      days.push(
        <TouchableOpacity key={d} style={[S.gridCell, isSelected && S.gridCellActive]} onPress={() => setSelectedDate(dStr)}>
          <Text
            style={[
              S.gridCellText,
              isSelected && { color: C.cardWhite },
              isToday && !isSelected && { color: C.primary, fontWeight: '900' },
            ]}
          >
            {d}
          </Text>
          {hasEvent && <View style={[S.dot, isSelected && { backgroundColor: C.cardWhite }]} />}
          {isToday && !isSelected && <View style={S.todayIndicator} />}
        </TouchableOpacity>
      );
    }
    return days;
  };

  const weekDayNames = t('calendar.weekDays', { returnObjects: true }) as string[];

  return (
    <SafeAreaView style={S.container}>
      <View style={S.pHeader}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={S.pTitle}>{t('calendar.pageTitle')}</Text>
          </View>
          <TouchableOpacity style={S.addBtn} onPress={() => setIsCalendarVisible(!isCalendarVisible)}>
            <Ionicons name={isCalendarVisible ? 'calendar' : 'calendar-outline'} size={22} color={C.cardWhite} />
          </TouchableOpacity>
        </View>

        <View style={S.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll} keyboardShouldPersistTaps="handled">
            {[
              { id: 'ALL', label: t('calendar.filterAll'), icon: 'apps' },
              { id: 'MAINT', label: t('calendar.filterMaint'), icon: 'construct' },
              { id: 'DOC', label: t('calendar.filterDocs'), icon: 'shield-checkmark' },
              { id: 'STOCK', label: t('calendar.filterStock'), icon: 'cart' },
            ].map((f) => (
              <TouchableOpacity key={f.id} style={[S.filterChip, activeFilter === f.id && S.filterChipActive]} onPress={() => setActiveFilter(f.id as any)}>
                <Text style={[S.filterChipText, activeFilter === f.id && S.filterChipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {isCalendarVisible && (
        <View style={S.calendarCard}>
          <View style={S.monthNav}>
            <TouchableOpacity onPress={() => changeMonth(-1)} style={S.navIcon}>
              <Ionicons name="chevron-back" size={20} color={C.primary} />
            </TouchableOpacity>
            <Text style={S.monthTitle}>
              {monthName.toUpperCase()} {year}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)} style={S.navIcon}>
              <Ionicons name="chevron-forward" size={20} color={C.primary} />
            </TouchableOpacity>
          </View>
          <View style={S.weekLabels}>
            {weekDayNames.map((l, i) => (
              <Text key={i} style={S.weekLabelText}>
                {l}
              </Text>
            ))}
          </View>
          <View style={S.gridBody}>{renderMonthGrid()}</View>
        </View>
      )}

      <View style={{ height: 10 }} />

      <View style={S.listContainer}>
        <Text style={S.sectionLabel}>
          {t('calendar.agenda')} {formatDate(selectedDate)}
        </Text>

        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginTop: 40 }} />
        ) : selectedDayEvents.length === 0 ? (
          <View style={S.emptyState}>
            <Ionicons name="sparkles-outline" size={48} color={C.border} />
            <Text style={S.emptyText}>{t('calendar.emptyState')}</Text>
          </View>
        ) : (
          <FlatList
            data={selectedDayEvents}
            keyExtractor={(ev) => ev.id}
            renderItem={({ item: ev }) => (
              <TouchableOpacity style={S.eventCard}>
                <View style={[S.eventIcon, { backgroundColor: ev.color + '10' }]}>
                  <Ionicons name={ev.icon} size={20} color={ev.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.eventTitle}>{ev.title}</Text>
                  <View style={S.metaRow}>
                    <Text style={S.metaText}>{ev.assetName}</Text>
                    <View style={S.tagPH}>
                      <Text style={[S.tagT, { color: ev.color }]}>{ev.tag}</Text>
                    </View>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={C.border} />
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingBottom: 100 }}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function createCalendarStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    pHeader: {
      paddingHorizontal: 20,
      paddingTop: 60,
      paddingBottom: 20,
      backgroundColor: C.cardWhite,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    pTitle: { color: C.primary, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
    addBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },
    filterRow: { marginTop: 20 },
    filterScroll: { gap: 10, paddingBottom: 5 },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    filterChipActive: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
    filterChipText: { fontSize: 11, fontWeight: '900', color: C.textSecondary, letterSpacing: 0.6, textTransform: 'uppercase' },
    filterChipTextActive: { color: C.menuChipActiveFg },
    calendarCard: {
      backgroundColor: C.cardWhite,
      marginHorizontal: 16,
      marginTop: 20,
      borderRadius: 24,
      paddingVertical: 15,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 10,
      elevation: 2,
    },

    monthNav: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
    monthTitle: { fontSize: 13, fontWeight: '900', color: C.primary, letterSpacing: 1.2, textTransform: 'uppercase' },
    navIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center' },
    weekLabels: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10 },
    weekLabelText: { flex: 1, textAlign: 'center', fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase' },
    gridBody: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16 },
    gridCell: { width: '14.28%', height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 12 },
    gridCellEmpty: { width: '14.28%', height: 48 },
    gridCellActive: { backgroundColor: C.accent, borderRadius: 12 },
    gridCellText: { fontSize: 13, fontWeight: '900', color: C.primary },
    dot: { position: 'absolute', bottom: 8, width: 4, height: 4, borderRadius: 2, backgroundColor: C.accent },
    todayIndicator: { position: 'absolute', bottom: 4, width: 12, height: 2, borderRadius: 1, backgroundColor: C.accent },
    retractBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, gap: 8 },
    retractHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: C.border, position: 'absolute', top: 0 },
    retractMonth: { fontSize: 10, fontWeight: '900', color: C.textLight, letterSpacing: 1 },
    listContainer: { flex: 1, paddingHorizontal: 20, marginTop: 10 },

    sectionLabel: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, marginBottom: 20, textTransform: 'uppercase' },
    eventCard: {
      flexDirection: 'row',
      backgroundColor: C.cardWhite,
      padding: 16,
      borderRadius: 20,
      marginBottom: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: C.border,
    },
    eventIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    eventTitle: { fontSize: 13, fontWeight: '900', color: C.primary, letterSpacing: -0.3 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    metaText: { fontSize: 10, color: C.textSecondary, fontWeight: '800', textTransform: 'uppercase' },
    tagPH: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: C.background,
      borderWidth: 1,
      borderColor: C.border,
    },
    tagT: { fontSize: 8, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },

    emptyState: { alignItems: 'center', marginTop: 60, gap: 15 },
    emptyText: { textAlign: 'center', color: C.textLight, fontSize: 11, lineHeight: 18, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  });
}
