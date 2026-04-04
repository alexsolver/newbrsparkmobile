import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, ActivityIndicator, Alert, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { getRootAssets, saveMediaItem } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';

export default function NewMediaScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  
  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assets = user?.email ? getRootAssets(user.email) : [];

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Atenção', 'Precisamos da premissão da câmera para tirar fotos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setMediaUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    if (!mediaUri) return;
    setLoading(true);
    
    try {
      // Cria a media
      const mediaItem = {
        id: `local_media_${Date.now()}`,
        url: mediaUri, // Em prod, isso deveria ir para S3 e retornar a URL. Aqui guardamos o URI local.
        uri: mediaUri,
        type: 'image' as const,
        createdAt: new Date().toISOString(),
        stampedGeo: false,
        stampedDatetime: false
      };
      saveMediaItem(mediaItem);

      // (Opção offline) Poderíamos enviar ao servidor: 
      // const fileData = new FormData(); ...
      // enqueueMutation('media', 'UPLOAD', formData)
      
      Alert.alert('Salvo', 'Mídia armazenada com sucesso.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar a mídia.');
    } finally {
      setLoading(false);
    }
  };

  if (!mediaUri) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title="Adicionar Mídia" leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.centerBox}>
          <TouchableOpacity style={styles.actionBtn} onPress={takePhoto}>
            <Ionicons name="camera" size={48} color="#fff" />
            <Text style={styles.actionT}>Tirar Foto</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#64748B' }]} onPress={pickImage}>
            <Ionicons name="images" size={48} color="#fff" />
            <Text style={styles.actionT}>Escolher da Galeria</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Vincular Mídia" leftIcon="arrow-back" onLeftPress={() => setMediaUri(null)} />
      
      {assets.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
          <Ionicons name="cube-outline" size={64} color="#CBD5E1" />
          <Text style={{ fontSize: 18, fontWeight: '900', color: '#1E293B', marginTop: 24, textAlign: 'center' }}>
            Nenhum Bem cadastrado
          </Text>
          <Text style={{ fontSize: 14, color: '#64748B', textAlign: 'center', marginTop: 12, lineHeight: 22, fontWeight: '500' }}>
            Para organizar suas mídias e fotos, você precisa ter pelo menos um Ativo (Patrimônio) cadastrado no sistema.
          </Text>
          <TouchableOpacity 
            style={{ backgroundColor: '#1E293B', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, marginTop: 32 }}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image source={{ uri: mediaUri }} style={styles.preview} />

        <View style={styles.formGroup}>
          <Text style={styles.label}>Vincular a um Patrimônio (Opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <TouchableOpacity 
              style={[styles.assetChip, selectedAsset === null && styles.assetChipActive]}
              onPress={() => setSelectedAsset(null)}
            >
              <Text style={[styles.assetChipT, selectedAsset === null && { color: '#fff' }]}>Geral</Text>
            </TouchableOpacity>

            {assets.map(a => (
              <TouchableOpacity 
                key={a.id}
                style={[styles.assetChip, selectedAsset === a.id && styles.assetChipActive]}
                onPress={() => setSelectedAsset(a.id)}
              >
                <Ionicons name="cube" size={12} color={selectedAsset === a.id ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                <Text style={[styles.assetChipT, selectedAsset === a.id && { color: '#fff' }]}>{a.title}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="cloud-upload" size={24} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.saveBtnT}>Salvar Mídia</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerBox: { flex: 1, padding: 24, justifyContent: 'center', gap: 24 },
  actionBtn: {
    backgroundColor: '#8B5CF6',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    borderRadius: 24,
    shadowColor: '#8B5CF6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8
  },
  actionT: { color: '#fff', fontSize: 20, fontWeight: '800', marginLeft: 16 },

  scroll: { padding: 20 },
  preview: { width: '100%', height: 300, borderRadius: 20, marginBottom: 24 },
  
  formGroup: { marginBottom: 24 },
  label: { fontSize: 13, fontWeight: '800', color: colors.slate, marginBottom: 8, textTransform: 'uppercase' },
  
  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assetChipActive: { backgroundColor: '#8B5CF6', borderColor: '#8B5CF6' },
  assetChipT: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  saveBtn: {
    backgroundColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 14,
    marginTop: 10,
  },
  saveBtnT: { color: '#fff', fontSize: 16, fontWeight: '900', textTransform: 'uppercase' }
});
