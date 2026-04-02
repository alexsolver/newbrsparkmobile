import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { StockService } from '../../src/services/stockService';
import { BarcodeService } from '../../src/services/barcodeService';
import { useAuth } from '../../src/hooks/useAuth';

export default function NewStockScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
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
        Alert.alert('Atenção', 'É necessário permitir o uso da câmera para escanear o código.');
        return;
      }
    }
    setIsScanning(true);
  };

  const onBarcodeScanned = async ({ data, type }: { data: string; type: string }) => {
    setIsScanning(false); // fecha o scanner
    setSku(data);
    setIsFetching(true);

    try {
      const product = await BarcodeService.getProductByBarcode(data);
      if (product && product.description) {
        setName(product.description);
      }
    } catch (e) {
      console.warn('Erro fetch barcode api', e);
    } finally {
      setIsFetching(false);
    }
  };

  const alterQty = (delta: number) => {
    setQuantity(prev => Math.max(1, prev + delta));
  };

  const handleSave = async () => {
    if (!name || !sku) {
      Alert.alert('Atenção', 'Informe pelo menos um nome e SKU base.');
      return;
    }
    
    try {
      await StockService.saveItem({
        id: `local_stock_${Date.now()}`,
        name,
        sku,
        category: 'Suprimentos',
        currentStock: quantity,
        minStock: 2,
        targetStock: 5,
        unit: 'un',
        costPrice: 0,
        locationId: ''
      }, user?.email);

      Alert.alert('Estoque Adicionado', `${quantity} unidade(s) salvas com sucesso.`, [
         { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      Alert.alert('Erro', 'Houve um problema ao salvar.');
    }
  };

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Adicionar ao Estoque" leftIcon="arrow-back" onLeftPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll}>

        {isScanning ? (
          <View style={styles.cameraContainer}>
            <CameraView 
              style={styles.camera} 
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
              onBarcodeScanned={onBarcodeScanned}
            />
            <TouchableOpacity style={styles.closeCameraBtn} onPress={() => setIsScanning(false)}>
              <Text style={styles.closeCameraText}>Cancelar Edição</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.barcodeArea}>
            <TouchableOpacity style={styles.scanBtn} onPress={handleStartScan} activeOpacity={0.8}>
              <Ionicons name="barcode-outline" size={48} color="#fff" />
              <Text style={styles.scanText}>Escanear Código</Text>
              {isFetching && <Text style={{ color: '#fff', marginTop: 4 }}>Buscando dados no Catálogo...</Text>}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.formGroup}>
          <Text style={styles.label}>Produto / Insumo</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.surfaceLow, color: '#1E293B' }]}
            placeholder="Nome do Item"
            placeholderTextColor={C.textLight}
            value={name}
            onChangeText={setName}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Código (SKU/EAN)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.surfaceLow, color: '#1E293B' }]}
            placeholder="Ex: 78912345"
            placeholderTextColor={C.textLight}
            value={sku}
            onChangeText={setSku}
          />
        </View>

        <View style={styles.qtySection}>
          <Text style={styles.label}>Quantidade Entrante</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => alterQty(-1)}>
              <Ionicons name="remove" size={32} color={colors.textSecondary} />
            </TouchableOpacity>
            
            <View style={styles.qtyDisplay}>
              <Text style={styles.qtyVal}>{quantity}</Text>
              <Text style={styles.qtyUnit}>UN</Text>
            </View>

            <TouchableOpacity style={styles.qtyBtn} onPress={() => alterQty(1)}>
              <Ionicons name="add" size={32} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnT}>Salvar Entrada</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20 },
  cameraContainer: { width: '100%', height: 300, borderRadius: 24, overflow: 'hidden', marginBottom: 30, position: 'relative' },
  camera: { flex: 1 },
  closeCameraBtn: { position: 'absolute', bottom: 20, alignSelf: 'center', backgroundColor: '#EF4444', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20 },
  closeCameraText: { color: '#fff', fontWeight: '800' },
  barcodeArea: { alignItems: 'center', marginBottom: 30 },
  scanBtn: {
    backgroundColor: '#3B82F6',
    width: '100%',
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 8
  },
  scanText: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 8, letterSpacing: 0.5 },

  formGroup: { marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '800', color: colors.slate, marginBottom: 8, textTransform: 'uppercase' },
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
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: '#E2E8F0',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2
  },
  qtyDisplay: { alignItems: 'center', minWidth: 80 },
  qtyVal: { fontSize: 48, fontWeight: '900', color: '#1E293B', lineHeight: 56 },
  qtyUnit: { fontSize: 14, fontWeight: '700', color: '#64748B' },

  saveBtn: {
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4,
    marginTop: 20
  },
  saveBtnT: { color: '#fff', fontSize: 16, fontWeight: '800', textTransform: 'uppercase' }
});
