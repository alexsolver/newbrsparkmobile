import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert, SafeAreaView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { Button } from '../../src/components/Button';
import { getRootAssets, saveMediaItem } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';
import { SERVICE_CATEGORY_COLORS } from '../../src/theme/colors';
import { radius, space, fontSize, fontWeight } from '../../src/theme/layout';
import { useTranslation } from 'react-i18next';

const PURPLE = SERVICE_CATEGORY_COLORS['Reformas'];

export default function NewMediaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();

  const [mediaUri, setMediaUri] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assets = user?.email ? getRootAssets(user.email, { includeMobileWarehouse: false }) : [];

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
      Alert.alert(t('common.attention'), t('appAlerts.media.cameraPermission'));
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
      const mediaItem = {
        id: `local_media_${Date.now()}`,
        url: mediaUri,
        uri: mediaUri,
        type: 'image' as const,
        createdAt: new Date().toISOString(),
        stampedGeo: false,
        stampedDatetime: false,
      };
      saveMediaItem(mediaItem);

      Alert.alert(t('appAlerts.media.savedTitle'), t('appAlerts.media.savedBody'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      Alert.alert(t('common.error'), t('appAlerts.media.saveError'));
    } finally {
      setLoading(false);
    }
  };

  if (!mediaUri) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Header title={t('media.addMedia')} leftIcon="close" onLeftPress={() => router.back()} />
        <View style={styles.centerBox}>
          <Button title={t('media.takePhoto')} onPress={takePhoto} />
          <Button title={t('media.chooseFromGallery')} onPress={pickImage} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={t('media.linkMedia')} leftIcon="arrow-back" onLeftPress={() => setMediaUri(null)} />

      {assets.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg }}>
          <Ionicons name="cube-outline" size={64} color={C.border} />
          <Text style={{ fontSize: fontSize.lg, fontWeight: fontWeight.black, color: C.slate, marginTop: space.lg, textAlign: 'center' }}>
            {t('appAlerts.assetGate.noAssetTitle')}
          </Text>
          <Text style={{ fontSize: fontSize.sm, color: C.textSecondary, textAlign: 'center', marginTop: space.sm, lineHeight: 22, fontWeight: fontWeight.medium }}>
            {t('appAlerts.assetGate.hintMedia')}
          </Text>
          <View style={{ marginTop: space.lg, alignSelf: 'stretch' }}>
            <Button title={t('common.back')} onPress={() => router.back()} variant="secondary" />
          </View>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <Image source={{ uri: mediaUri }} style={[styles.preview, { borderRadius: radius.lg }]} />

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: C.slate }]}>{t('appAlerts.assetGate.linkAssetOptional')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              <TouchableOpacity
                style={[
                  styles.assetChip,
                  { backgroundColor: C.cardWhite, borderColor: C.border },
                  selectedAsset === null && { backgroundColor: PURPLE, borderColor: PURPLE },
                ]}
                onPress={() => setSelectedAsset(null)}
              >
                <Text style={[styles.assetChipT, { color: C.textSecondary }, selectedAsset === null && { color: C.cardWhite }]}>
                  {t('common.general')}
                </Text>
              </TouchableOpacity>

              {assets.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[
                    styles.assetChip,
                    { backgroundColor: C.cardWhite, borderColor: C.border },
                    selectedAsset === a.id && { backgroundColor: PURPLE, borderColor: PURPLE },
                  ]}
                  onPress={() => setSelectedAsset(a.id)}
                >
                  <Ionicons
                    name="cube"
                    size={14}
                    color={selectedAsset === a.id ? C.cardWhite : C.textSecondary}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.assetChipT, { color: C.textSecondary }, selectedAsset === a.id && { color: C.cardWhite }]}>{a.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Button title={t('appAlerts.media.saveMediaButton')} onPress={handleSave} loading={loading} disabled={loading} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerBox: { flex: 1, padding: space.lg, justifyContent: 'center', gap: space.md },
  scroll: { padding: space.md },
  preview: { width: '100%', height: 300, marginBottom: space.lg },

  formGroup: { marginBottom: space.lg },
  label: { fontSize: 13, fontWeight: fontWeight.black, marginBottom: space.sm, textTransform: 'uppercase' },

  assetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  assetChipT: { fontSize: 13, fontWeight: fontWeight.bold },
});
