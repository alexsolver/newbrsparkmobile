import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { ApiService } from '../../src/services/api';
import { Ionicons } from '@expo/vector-icons';
import { getSyncQueue } from '../../src/database';
import { useFocusEffect } from 'expo-router';

export default function ProfileScreen() {
  const [queueCount, setQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      setQueueCount(getSyncQueue().length);
    }, [])
  );

  const handleSync = async () => {
    setSyncing(true);
    const success = await ApiService.sync();
    setQueueCount(getSyncQueue().length);
    setSyncing(false);
    if (success) {
      Alert.alert('Sucesso', 'Sincronização concluída com o servidor SaaS!');
    } else {
      Alert.alert('Aviso', 'A sincronização falhou. Você ainda pode usar o app offline na fila.');
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.content}>
        <View style={styles.avatarContainer}>
          <Ionicons name="person-circle" size={100} color={colors.textLight} />
          <Text style={styles.name}>João Silva</Text>
          <Text style={styles.role}>Cliente VIP</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sincronização e Sistema</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Ações Pendentes (Offline)</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{queueCount}</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={[styles.button, syncing && styles.buttonDisabled]} 
              onPress={handleSync}
              disabled={syncing}
            >
              <Ionicons name="sync" size={20} color="#fff" style={{marginRight: 8}} />
              <Text style={styles.buttonText}>{syncing ? 'Sincronizando...' : 'Forçar Sincronização'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opções</Text>
          <TouchableOpacity style={styles.optionRow}>
            <Ionicons name="moon-outline" size={24} color={colors.primary} />
            <Text style={styles.optionText}>Modo Escuro (Em breve)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.optionRow}>
            <Ionicons name="log-out-outline" size={24} color={colors.warning.text} />
            <Text style={[styles.optionText, { color: colors.warning.text }]}>Sair / Deslogar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  avatarContainer: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  name: { fontSize: 24, fontWeight: '700', color: colors.primary, marginTop: 8 },
  role: { fontSize: 16, color: colors.textSecondary, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginLeft: 4 },
  card: { backgroundColor: colors.cardWhite, borderRadius: 12, padding: 16, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  rowLabel: { fontSize: 16, color: colors.primary, fontWeight: '500' },
  badge: { backgroundColor: colors.warning.background, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16 },
  badgeText: { color: colors.warning.text, fontWeight: '700' },
  button: { backgroundColor: colors.primary, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  optionRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  optionText: { fontSize: 16, fontWeight: '500', color: colors.primary, marginLeft: 12 },
});
