import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { Ionicons } from '@expo/vector-icons';
import { getSyncQueue, getLocalAssets } from '../../src/database';
import { useFocusEffect } from 'expo-router';

export default function CalendarScreen() {
  const [appointments, setAppointments] = useState<any[]>([]);

  useFocusEffect(
    useCallback(() => {
      const queue = getSyncQueue();
      const assets = getLocalAssets();
      
      const maintenanceActions = queue.filter((item: any) => item.action === 'SCHEDULE_MAINTENANCE');
      const mapped = maintenanceActions.map((item: any) => {
        const payload = JSON.parse(item.payload);
        const asset = assets.find(a => a.id === payload.assetId);
        return {
          id: item.id,
          date: new Date(payload.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
          assetName: asset?.title || 'Ativo Desconhecido',
          assetId: payload.assetId,
        };
      });
      setAppointments(mapped);
    }, [])
  );

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.content}>
        <Text style={styles.pageTitle}>Calendário de Manutenções</Text>
        
        <FlatList 
          data={appointments}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.dateBox}>
                <Ionicons name="calendar" size={24} color={colors.primary} />
                <Text style={styles.dateText}>{item.date}</Text>
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.assetName}>{item.assetName}</Text>
                <Text style={styles.assetId}>ID: {item.assetId}</Text>
                <View style={styles.statusTag}>
                  <Text style={styles.statusText}>Agendado</Text>
                </View>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={60} color={colors.success.text} />
              <Text style={styles.emptyText}>Nenhuma manutenção agendada.</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, flex: 1 },
  pageTitle: { fontSize: 24, fontWeight: '700', color: colors.primary, marginBottom: 16 },
  card: { flexDirection: 'row', backgroundColor: colors.cardWhite, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  dateBox: { alignItems: 'center', justifyContent: 'center', paddingRight: 16, borderRightWidth: 1, borderRightColor: colors.divider, width: 80 },
  dateText: { fontSize: 12, fontWeight: '700', color: colors.primary, marginTop: 4, textAlign: 'center' },
  infoBox: { paddingLeft: 16, flex: 1, justifyContent: 'center' },
  assetName: { fontSize: 16, fontWeight: '700', color: colors.primary, marginBottom: 4 },
  assetId: { fontSize: 12, color: colors.textSecondary, marginBottom: 8 },
  statusTag: { alignSelf: 'flex-start', backgroundColor: '#FFF4ED', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: '#B93815', fontSize: 10, fontWeight: '700' },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: colors.textSecondary, marginTop: 12 }
});
