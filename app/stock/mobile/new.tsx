import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ColorPalette, MEDIA_TAG_COLORS } from '../../../src/theme/colors';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../src/theme/ThemeContext';
import { ScreenSubheader } from '../../../src/components/ScreenSubheader';
import { TechnicianStockService } from '../../../src/services/technicianStockService';
import { BarcodeService } from '../../../src/services/barcodeService';
import { useAuth } from '../../../src/hooks/useAuth';
import { StockItem } from '../../../src/types/stock';

/**
 * Cadastro apenas no estoque do técnico (sem bem / local de ativo).
 */
export default function NewTechnicianStockScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createTechnicianStockNewStyles(C), [C]);
  const { user } = useAuth();

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isScanning, setIsScanning] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const handleStartScan = async () => {
    if (!permission?.granted) {
      const p = await requestPermission();
      if (!p.granted) {
        Alert.alert(t('common.attention'), t('appAlerts.stockTech.cameraForScan'));
        return;
      }
    }
    setIsScanning(true);
  };

  const onBarcodeScanned = async ({ data }: { data: string; type: string }) => {
    setIsScanning(false);
    setSku(data);
    setIsFetching(true);
    try {
      const product = await BarcodeService.getProductByBarcode(data);
      if (product?.description) setName(product.description);
    } catch {
      /* ignore */
    } finally {
      setIsFetching(false);
    }
  };

  const alterQty = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleSave = async () => {
    if (!name || !sku) {
      Alert.alert(t('common.attention'), t('appAlerts.stockTech.nameSku'));
      return;
    }
    const email = user?.email || undefined;
    const all = await TechnicianStockService.getItems(email);
    if (all.some((i) => i.sku.toUpperCase() === sku.toUpperCase())) {
      return Alert.alert(t('common.error'), t('appAlerts.stockTech.skuExists', { sku }));
    }

    const it: StockItem = {
      id: `tech_stock_${Date.now()}`,
      name,
      sku: sku.toUpperCase(),
      category: 'tecnico',
      currentStock: quantity,
      minStock: 2,
      targetStock: 5,
      unit: 'un',
      costPrice: 0,
      locationId: '',
    };
    await TechnicianStockService.saveItem(it, email);
    Alert.alert(t('appAlerts.stockTech.savedTitle'), t('appAlerts.stockTech.savedBody'), [
      { text: t('common.ok'), onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenSubheader
        title="Novo material (técnico)"
        subtitle={t('technicianMobile.stockNewScreenSubtitle')}
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        {isScanning ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={onBarcodeScanned}
            />
            <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setIsScanning(false)}>
              <Text style={styles.closeCameraText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.barcodeArea}>
            <TouchableOpacity style={styles.scanBtn} onPress={handleStartScan} activeOpacity={0.8}>
              <Ionicons name="barcode-outline" size={48} color="#fff" />
              <Text style={styles.scanText}>Escanear código</Text>
              {isFetching ? <Text style={{ color: '#fff', marginTop: 4 }}>A procurar no catálogo…</Text> : null}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Produto / insumo</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.surfaceLow, color: C.slate }]}
            placeholder="Nome"
            placeholderTextColor={C.textLight}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>SKU / código</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.surfaceLow, color: C.slate }]}
            placeholder="Ex.: 78912345"
            placeholderTextColor={C.textLight}
            value={sku}
            onChangeText={setSku}
          />
        </View>

        <View style={styles.qtySection}>
          <Text style={styles.label}>Quantidade inicial</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => alterQty(-1)}>
              <Ionicons name="remove" size={32} color={C.textSecondary} />
            </TouchableOpacity>
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyVal}>{quantity}</Text>
              <Text style={styles.qtyUnit}>UN</Text>
            </View>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => alterQty(1)}>
              <Ionicons name="add" size={32} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnT}>Salvar no estoque técnico</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createTechnicianStockNewStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    scroll: { padding: 20 },
    cameraContainer: {
      width: '100%',
      height: 300,
      borderRadius: 24,
      overflow: 'hidden',
      marginBottom: 30,
      position: 'relative',
    },
    camera: { flex: 1 },
    closeCameraBtn: {
      position: 'absolute',
      bottom: 20,
      alignSelf: 'center',
      backgroundColor: C.destructive,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 20,
    },
    closeCameraText: { color: '#fff', fontWeight: '800' },
    barcodeArea: { alignItems: 'center', marginBottom: 30 },
    scanBtn: {
      backgroundColor: MEDIA_TAG_COLORS.BEFORE,
      width: '100%',
      padding: 24,
      borderRadius: 24,
      alignItems: 'center',
      shadowColor: MEDIA_TAG_COLORS.BEFORE,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 12,
      elevation: 8,
    },
    scanText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 8, letterSpacing: 0.5 },
    formGroup: { marginBottom: 20 },
    label: {
      fontSize: 13,
      fontWeight: '800',
      color: C.slate,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    input: {
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      fontSize: 16,
      fontWeight: '700',
    },
    qtySection: { alignItems: 'center', marginVertical: 20 },
    qtyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      marginTop: 10,
    },
    qtyBtn: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: C.cardWhite,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    qtyDisplay: { alignItems: 'center', minWidth: 80 },
    qtyVal: { fontSize: 48, fontWeight: '900', color: C.slate, lineHeight: 56 },
    qtyUnit: { fontSize: 14, fontWeight: '700', color: C.textLight },
    saveBtn: {
      backgroundColor: C.filledButtonBg,
      padding: 16,
      borderRadius: 14,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
      marginTop: 20,
    },
    saveBtnT: { color: '#fff', fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },
  });
}
