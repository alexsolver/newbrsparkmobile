import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '../../src/theme/colors';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { saveAssetsLocal, getLocalAssets, queueOfflineAction } from '../../src/database';
import { Asset } from '../../src/types/asset';

export default function NewAssetScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('REAL_ESTATE');

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Atenção', 'Por favor, digite um nome para o ativo.');
      return;
    }
    const newAsset: Asset = {
      id: Math.random().toString().substring(2, 8),
      title,
      type: type as any,
      status: 'NOVO CADASTRO',
      statusType: 'success',
      details: { address: 'Offline — Aguardando Sincronização' }
    };
    
    const existing = getLocalAssets();
    saveAssetsLocal([...existing, newAsset]);
    queueOfflineAction('CREATE_ASSET', newAsset);
    Alert.alert('Sucesso', 'Ativo criado localmente!\nEle já enviou para a Fila de Sync.');
    router.back();
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo Ativo</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.label}>Nome Público (Título)</Text>
        <TextInput 
          style={styles.input} 
          placeholder="Ex: Frota Caminhão BMW" 
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Categoria do Ativo</Text>
        <View style={styles.typeSelector}>
          <TouchableOpacity 
            style={[styles.typeBtn, type === 'REAL_ESTATE' && styles.typeBtnActive]} 
            onPress={() => setType('REAL_ESTATE')}
          >
            <Text style={[styles.typeText, type === 'REAL_ESTATE' && styles.typeTextActive]}>🏡 Imóvel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.typeBtn, type === 'VEHICLE' && styles.typeBtnActive]} 
            onPress={() => setType('VEHICLE')}
          >
            <Text style={[styles.typeText, type === 'VEHICLE' && styles.typeTextActive]}>🚙 Veículo</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.typeSelector, { marginTop: 12 }]}>
          <TouchableOpacity 
            style={[styles.typeBtn, type === 'COLLECTION' && styles.typeBtnActive]} 
            onPress={() => setType('COLLECTION')}
          >
            <Text style={[styles.typeText, type === 'COLLECTION' && styles.typeTextActive]}>💎 Coleção</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.typeBtn, type === 'OTHER' && styles.typeBtnActive]} 
            onPress={() => setType('OTHER')}
          >
            <Text style={[styles.typeText, type === 'OTHER' && styles.typeTextActive]}>📦 Outros</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="save-outline" size={20} color="#fff" style={{marginRight: 8}}/>
          <Text style={styles.saveBtnText}>Salvar Cadastro</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.primary },
  content: { padding: 16 },
  label: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: colors.cardWhite, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 16, fontSize: 16 },
  typeSelector: { flexDirection: 'row', gap: 12 },
  typeBtn: { flex: 1, padding: 16, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.cardWhite },
  typeBtnActive: { borderColor: colors.primary, backgroundColor: '#EAECF0' },
  typeText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  typeTextActive: { color: colors.primary },
  saveBtn: { marginTop: 40, backgroundColor: colors.primary, borderRadius: 8, padding: 16, flexDirection: 'row', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
