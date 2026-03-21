import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';
import { Ionicons } from '@expo/vector-icons';

export default function DocumentsScreen() {
  const [docs, setDocs] = useState<{id: string, name: string, date: string}[]>([]);

  const pickDocument = async () => {
    // Mock document import simulating React Native Expo Document picker (offline)
    try {
      const newDoc = {
        id: Math.random().toString(),
        name: `comprovante_${Math.floor(Math.random() * 1000)}.pdf`,
        date: new Date().toLocaleDateString('pt-BR')
      };
      setDocs(prev => [newDoc, ...prev]);
      Alert.alert('Sucesso', 'Documento importado e salvo offline pronto para sincronização!');
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>Documentos</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickDocument}>
            <Ionicons name="cloud-upload" size={20} color="#fff" />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={docs}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={styles.docCard}>
              <Ionicons name="document-text" size={32} color={colors.primary} style={{marginRight: 16}} />
              <View style={{flex: 1}}>
                <Text style={styles.docName}>{item.name}</Text>
                <Text style={styles.docDate}>Salvo em: {item.date}</Text>
              </View>
              <TouchableOpacity>
                <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={60} color={colors.border} />
              <Text style={styles.emptyText}>Nenhum documento anexado ainda.</Text>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  pageTitle: { fontSize: 24, fontWeight: '700', color: colors.primary },
  uploadBtn: { backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  uploadBtnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardWhite, padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  docName: { fontSize: 16, fontWeight: '600', color: colors.primary },
  docDate: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
  emptyText: { color: colors.textSecondary, marginTop: 12 }
});
