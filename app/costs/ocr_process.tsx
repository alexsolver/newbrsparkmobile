import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Dimensions, FlatList } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../src/theme/colors';
import * as ImagePicker from 'expo-image-picker';
import { getRootAssets } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';

const { width } = Dimensions.get('window');

type Step = 'launching' | 'scanning' | 'ocr_done' | 'pick_asset';

export default function OcrProcessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [step, setStep] = useState<Step>('launching');
  const [imageUri, setImageUri] = useState<string | null>(null);
  
  // OCR Extracted Data
  const [ocrAmount, setOcrAmount] = useState(0);
  const [ocrDesc, setOcrDesc] = useState('');

  const { user } = useAuth();
  const assets = user?.email ? getRootAssets(user.email) : [];

  useEffect(() => {
    // Launch camera automatically when entering
    launchCamera();
  }, []);

  const launchCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      alert('Precisamos de permissão da câmera para escanear a nota.');
      router.back();
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0].uri) {
      setImageUri(result.assets[0].uri);
      setStep('scanning');
      simulateOcr();
    } else {
      router.back();
    }
  };

  const simulateOcr = () => {
    // Simulate OCR delay (AI reading the receipt)
    setTimeout(() => {
      // Mocked realistic values
      const randomValue = (Math.random() * 200 + 50).toFixed(2);
      const mocks = ['COMPRA MERCADO', 'ABACOMP COMB COMBUSTIVEL', 'MANUTENCAO PNEUS', 'LIMPEZA E HIGIENIZACAO'];
      const randomDesc = mocks[Math.floor(Math.random() * mocks.length)];
      
      setOcrAmount(Number(randomValue));
      setOcrDesc(randomDesc);
      
      setStep('ocr_done');
    }, 2500);
  };

  const selectAsset = (assetId: string) => {
    // Navigate with deep link replacing the current screen
    router.replace(`/asset/${assetId}?action=ocr_expense&ocrAmount=${ocrAmount}&ocrDesc=${encodeURIComponent(ocrDesc)}`);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textLight} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Escaneamento de Recibo</Text>
        <View style={{ width: 40 }} />
      </View>

      {step === 'launching' && (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.slate} />
          <Text style={styles.infoText}>Abrindo câmera...</Text>
        </View>
      )}

      {step === 'scanning' && imageUri && (
        <View style={styles.centerBox}>
          <View style={styles.imageScanWrap}>
            <Image source={{ uri: imageUri }} style={styles.scannedImage} blurRadius={3} />
            <View style={styles.scanOverlay}>
              <Ionicons name="scan-outline" size={64} color="#fff" />
              <Text style={styles.scanText}>IA extraindo o recibo...</Text>
              <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
            </View>
          </View>
        </View>
      )}

      {step === 'ocr_done' && (
        <View style={styles.centerBox}>
          <View style={styles.successIconBox}>
            <Ionicons name="checkmark-circle" size={56} color="#10B981" />
          </View>
          <Text style={styles.successTitle}>Leitura Concluída!</Text>
          <View style={styles.ocrCard}>
             <View style={styles.ocrField}>
                <Text style={styles.ocrLabel}>Valor Identificado</Text>
                <Text style={styles.ocrValue}>R$ {ocrAmount.toFixed(2).replace('.', ',')}</Text>
             </View>
             <View style={styles.ocrField}>
                <Text style={styles.ocrLabel}>Descrição Identificada</Text>
                <Text style={styles.ocrValue}>{ocrDesc}</Text>
             </View>
          </View>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setStep('pick_asset')}>
             <Text style={styles.actionBtnText}>Vincular Lançamento</Text>
             <Ionicons name="arrow-forward" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {step === 'pick_asset' && (
        <View style={{ flex: 1, paddingHorizontal: 20 }}>
          <Text style={styles.pickTitle}>A qual patrimônio esta despesa pertence?</Text>
          <Text style={styles.pickSub}>O lançamento será adicionado a este ativo.</Text>
          
          <FlatList
            data={assets}
            keyExtractor={a => a.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.assetCard} onPress={() => selectAsset(item.id)}>
                <View style={styles.assetIcon}>
                  <Ionicons name="cube-outline" size={20} color={colors.slate} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.assetName}>{item.title}</Text>
                  <Text style={styles.assetType}>{item.type}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary }}>Nenhum ativo cadastrado.</Text>
            }
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9'
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-start' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.slate },
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  infoText: { marginTop: 16, fontSize: 14, color: colors.textSecondary, fontWeight: '700' },
  imageScanWrap: { width: width * 0.7, height: width * 1.1, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000', elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width:0, height: 5} },
  scannedImage: { width: '100%', height: '100%', opacity: 0.5 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)' },
  scanText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 16 },
  successIconBox: { marginBottom: 16 },
  successTitle: { fontSize: 24, fontWeight: '900', color: colors.slate, marginBottom: 24 },
  ocrCard: { width: '100%', backgroundColor: '#F8FAFC', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 32 },
  ocrField: { marginBottom: 16 },
  ocrLabel: { fontSize: 11, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', marginBottom: 4 },
  ocrValue: { fontSize: 20, fontWeight: '900', color: colors.slate },
  actionBtn: { width: '100%', backgroundColor: colors.slate, paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  pickTitle: { fontSize: 22, fontWeight: '900', color: colors.slate, marginTop: 24, marginBottom: 6 },
  pickSub: { fontSize: 14, color: colors.textSecondary, marginBottom: 24 },
  assetCard: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  assetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  assetName: { fontSize: 15, fontWeight: '800', color: colors.slate },
  assetType: { fontSize: 12, color: colors.textSecondary, marginTop: 2, fontWeight: '600' }
});
