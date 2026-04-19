import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { getRootAssets, saveMediaItem } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';

export default function NewDocumentScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createDocumentNewStyles(C), [C]);
  const { user } = useAuth();

  const [docUri, setDocUri] = useState<string | null>(null);
  const [docName, setDocName] = useState<string>('');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assets = user?.email ? getRootAssets(user.email, { includeMobileWarehouse: false }) : [];

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      setDocUri(result.assets[0].uri);
      setDocName(result.assets[0].name || 'Documento Selecionado');
    }
  };

  const handleSave = async () => {
    if (!docUri) return;
    setLoading(true);

    try {
      const mediaItem = {
        id: `local_doc_${Date.now()}`,
        url: docUri,
        uri: docUri,
        type: 'file' as const,
        createdAt: new Date().toISOString(),
        title: docName,
        stampedGeo: false,
        stampedDatetime: false,
      };

      saveMediaItem(mediaItem);

      Alert.alert('Salvo', 'Documento armazenado com sucesso.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar o documento.');
    } finally {
      setLoading(false);
    }
  };

  if (!docUri) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title="Adicionar Arquivo" leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.centerBox}>
          <TouchableOpacity style={styles.actionBtn} onPress={pickDocument}>
            <Ionicons name="document-text" size={48} color="#fff" />
            <Text style={styles.actionT}>Procurar no Celular</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Vincular Arquivo" leftIcon="arrow-back" onLeftPress={() => setDocUri(null)} />

      {assets.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
          <Ionicons name="cube-outline" size={64} color={C.border} />
          <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate, marginTop: 24, textAlign: 'center' }}>
            Nenhum ativo cadastrado
          </Text>
          <Text style={{ fontSize: 14, color: C.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 22, fontWeight: '500' }}>
            Para organizar seus arquivos e PDFs, você precisa ter pelo menos um Ativo (Patrimônio) cadastrado no sistema.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: C.filledButtonBg, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, marginTop: 32 }}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.preview}>
            <Ionicons name="document" size={64} color={C.textLight} />
            <Text style={[styles.docName, { color: C.slate }]} numberOfLines={2}>
              {docName}
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Vincular a um Patrimônio (Opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity
                style={[styles.assetChip, selectedAsset === null && styles.assetChipActive]}
                onPress={() => setSelectedAsset(null)}
              >
                <Text style={[styles.assetChipT, selectedAsset === null && { color: '#fff' }]}>Geral</Text>
              </TouchableOpacity>

              {assets.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[styles.assetChip, selectedAsset === a.id && styles.assetChipActive]}
                  onPress={() => setSelectedAsset(a.id)}
                >
                  <Ionicons name="cube" size={12} color={selectedAsset === a.id ? '#fff' : C.textSecondary} style={{ marginRight: 4 }} />
                  <Text style={[styles.assetChipT, selectedAsset === a.id && { color: '#fff' }]}>{a.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="cloud-upload" size={24} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnT}>Salvar Arquivo</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function createDocumentNewStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    centerBox: { flex: 1, padding: 24, justifyContent: 'center' },
    actionBtn: {
      backgroundColor: MEDIA_TAG_COLORS.BEFORE,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      borderRadius: 24,
      shadowColor: MEDIA_TAG_COLORS.BEFORE,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    actionT: { color: '#fff', fontSize: 20, fontWeight: '800', marginLeft: 16 },

    scroll: { padding: 20 },
    preview: {
      width: '100%',
      height: 200,
      borderRadius: 20,
      marginBottom: 24,
      backgroundColor: C.surfaceLow,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    docName: { marginTop: 16, fontSize: 16, fontWeight: '700', textAlign: 'center' },

    formGroup: { marginBottom: 24 },
    label: { fontSize: 13, fontWeight: '800', color: C.slate, marginBottom: 8, textTransform: 'uppercase' },

    assetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      backgroundColor: C.cardWhite,
      borderWidth: 1,
      borderColor: C.border,
    },
    assetChipActive: { backgroundColor: MEDIA_TAG_COLORS.BEFORE, borderColor: MEDIA_TAG_COLORS.BEFORE },
    assetChipT: { fontSize: 13, fontWeight: '700', color: C.textSecondary },

    saveBtn: {
      backgroundColor: C.filledButtonBg,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      borderRadius: 14,
      marginTop: 10,
    },
    saveBtnT: { color: '#fff', fontSize: 16, fontWeight: '900', textTransform: 'uppercase' },
  });
}
