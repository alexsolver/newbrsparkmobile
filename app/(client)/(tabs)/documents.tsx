import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert } from 'react-native';
import { ColorPalette } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../../src/i18n/formatters';

export default function DocumentsScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createDocumentsStyles(C), [C]);
  const [docs, setDocs] = useState<{ id: string; name: string; date: string }[]>([]);

  const pickDocument = async () => {
    try {
      const newDoc = {
        id: Math.random().toString(),
        name: `comprovante_${Math.floor(Math.random() * 1000)}.pdf`,
        date: formatDate(new Date()),
      };
      setDocs((prev) => [newDoc, ...prev]);
      Alert.alert(t('common.success'), t('documents.importSuccess'));
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>{t('documents.pageTitle')}</Text>
          <TouchableOpacity style={styles.uploadBtn} onPress={pickDocument}>
            <Ionicons name="cloud-upload" size={20} color={C.cardWhite} />
            <Text style={styles.uploadBtnText}>{t('documents.uploadBtn')}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={docs}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.docCard}>
              <Ionicons name="document-text" size={32} color={C.primary} style={{ marginRight: 16 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.docName}>{item.name}</Text>
                <Text style={styles.docDate}>
                  {t('documents.savedAt')}: {item.date}
                </Text>
              </View>
              <TouchableOpacity>
                <Ionicons name="ellipsis-vertical" size={20} color={C.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="folder-open-outline" size={60} color={C.border} />
              <Text style={styles.emptyText}>Nenhum documento anexado ainda.</Text>
            </View>
          }
        />
      </View>
    </View>
  );
}

function createDocumentsStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    content: { padding: 16, flex: 1 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
    pageTitle: { fontSize: 20, fontWeight: '900', color: C.primary, letterSpacing: -0.4 },
    uploadBtn: {
      backgroundColor: C.accent,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
    },
    uploadBtnText: {
      color: C.cardWhite,
      fontWeight: '900',
      marginLeft: 8,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    docCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardWhite,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
    },
    docName: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
    docDate: { fontSize: 10, color: C.textSecondary, marginTop: 4, fontWeight: '700', textTransform: 'uppercase' },
    emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 100 },
    emptyText: { color: C.textSecondary, marginTop: 12, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  });
}
