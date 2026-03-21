import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { StockService } from '../services/stockService';
import { StockItem, StockMovement } from '../types/stock';

export function StockModule({ assetId }: { assetId?: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'IN' | 'OUT'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => { loadData(); }, [assetId]);

  const loadData = async () => {
    const data = await StockService.getItems();
    if (assetId) {
      setItems(data.filter(i => i.locationId === assetId));
    } else {
      setItems(data);
    }
  };

  const handleMovement = async () => {
    if (!selectedItem || !quantity) return;
    try {
      await StockService.recordMovement({
        itemId: selectedItem.id,
        type: moveType,
        quantity: parseFloat(quantity),
        responsibleId: 'user_admin',
        reason: reason || (moveType === 'IN' ? 'Entrada via Ativo' : 'Consumo Local')
      });
      setModalVisible(false);
      setQuantity(''); setReason('');
      loadData();
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const renderItem = ({ item }: { item: StockItem }) => {
    const percent = Math.min((item.currentStock / item.targetStock) * 100, 100);
    const isCritical = item.currentStock <= item.minStock;

    return (
      <View style={S.itemCard}>
        <View style={S.itemInfo}>
          <Text style={S.itemName}>{item.name}</Text>
          <Text style={S.itemSku}>SKU: {item.sku} • {item.category}</Text>
          <View style={S.progressC}>
             <View style={[S.progressB, { width: `${percent}%`, backgroundColor: isCritical ? '#EF4444' : '#10B981' } as any]} />
          </View>
        </View>
        <View style={S.stockB}>
          <Text style={[S.stockV, isCritical && { color: '#EF4444' }]}>{item.currentStock}</Text>
          <Text style={S.stockU}>{item.unit}</Text>
        </View>
        <TouchableOpacity style={S.moveBtn} onPress={() => { setSelectedItem(item); setModalVisible(true); }}>
          <Ionicons name="swap-vertical" size={18} color={colors.primary} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={S.container}>
      <View style={S.header}>
         <Ionicons name="archive" size={18} color={colors.primary} />
         <Text style={S.title}>ESTOQUE LOCAL</Text>
      </View>

      {items.length === 0 ? (
        <Text style={S.empty}>Nenhum insumo vinculado a este ativo.</Text>
      ) : (
        <FlatList 
          data={items}
          renderItem={renderItem}
          keyExtractor={i => i.id}
          scrollEnabled={false} // Para rodar dentro de outro ScrollView
        />
      )}

      {/* Modal Movimentação */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={S.modalO}><View style={S.modalC}>
          <View style={S.modalH}><Text style={S.modalT}>MOVIMENTAR</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
          <View style={S.modalB}>
            <Text style={S.itemL}>{selectedItem?.name}</Text>
            <View style={S.typeR}>
              <TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBActive]} onPress={() => setMoveType('IN')}><Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]}>ENTRADA</Text></TouchableOpacity>
              <TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBActiveO]} onPress={() => setMoveType('OUT')}><Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]}>SAÍDA</Text></TouchableOpacity>
            </View>
            <TextInput style={S.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder="Qtd" />
            <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder="Motivo" />
            <TouchableOpacity style={S.confirmBtn} onPress={handleMovement}><Text style={S.confirmText}>CONFIRMAR</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { marginTop: 20, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 15 },
  title: { fontSize: 13, fontWeight: '900', color: colors.primary, letterSpacing: 0.5 },
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 14, borderRadius: 12, marginBottom: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '700', color: colors.primary },
  itemSku: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  progressC: { height: 3, backgroundColor: '#F2F4F7', borderRadius: 2, marginTop: 8, width: '70%' },
  progressB: { height: '100%', borderRadius: 2 },
  stockB: { alignItems: 'center', justifyContent: 'center', minWidth: 40, marginRight: 10 },
  stockV: { fontSize: 16, fontWeight: '800', color: colors.primary },
  stockU: { fontSize: 8, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  moveBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F2F4F7', justifyContent: 'center', alignItems: 'center' },
  empty: { fontSize: 12, color: colors.textSecondary, fontStyle: 'italic', textAlign: 'center', padding: 20 },

  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  modalT: { fontSize: 12, fontWeight: '900', color: colors.primary },
  modalB: { },
  itemL: { fontSize: 16, fontWeight: '800', color: colors.primary, marginBottom: 15 },
  typeR: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBActiveO: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  typeT: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  input: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 8, fontSize: 14, fontWeight: '700', marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  confirmBtn: { backgroundColor: colors.primary, padding: 15, borderRadius: 10, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 12 }
});
