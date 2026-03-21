import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../src/theme/colors';
import { StockService } from '../../src/services/stockService';
import { StockItem, StockMovement } from '../../src/types/stock';
import { getRootAssets } from '../../src/database';
import { Asset } from '../../src/types/asset';

export default function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [venues, setVenues] = useState<Asset[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [activeSubTab, setActiveSubTab] = useState<'ITEMS' | 'REPORTS'>('ITEMS');
  const [selectedLoc, setSelectedLoc] = useState<string>('ALL');
  const [showNeedsOnly, setShowNeedsOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  
  // Modals
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);

  // Inventário State
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, string>>({});

  // Form states (Movement)
  const [moveType, setMoveType] = useState<'IN' | 'OUT'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');

  // Form states (Create)
  const [newItem, setNewItem] = useState<Partial<StockItem>>({
    unit: 'un', category: 'Geral', currentStock: 0, minStock: 5, targetStock: 10, locationId: '1'
  });

  useEffect(() => { 
    const init = async () => {
      const data = await StockService.getItems();
      const assets = getRootAssets();
      const moves = await StockService.getMovements();
      setVenues(assets || []);
      setMovements(moves || []);
      setItems(data);
    };
    init();
  }, []);

  const loadData = async () => {
    const data = await StockService.getItems();
    const moves = await StockService.getMovements();
    setItems(data);
    setMovements(moves);
  };

  const handleCreateItem = async () => {
    if (!newItem.name || !newItem.sku) return Alert.alert('Erro', 'Nome e SKU são obrigatórios.');
    const it: StockItem = {
      ...newItem as StockItem,
      id: Math.random().toString(36).substring(7),
      currentStock: Number(newItem.currentStock) || 0,
      minStock: Number(newItem.minStock) || 0,
      targetStock: Number(newItem.targetStock) || 0,
    };
    await StockService.saveItem(it);
    setCreateModalVisible(false);
    setNewItem({ unit: 'un', category: 'Geral', currentStock: 0, minStock: 5, targetStock: 10, locationId: '1' });
    loadData();
  };

  const handleMovement = async () => {
    if (!selectedItem || !quantity) return;
    try {
      await StockService.recordMovement({
        itemId: selectedItem.id,
        type: moveType,
        quantity: parseFloat(quantity),
        responsibleId: 'user_admin',
        reason: reason || (moveType === 'IN' ? 'Entrada manual' : 'Saída manual')
      });
      setMoveModalVisible(false);
      setQuantity(''); setReason('');
      loadData();
    } catch (err: any) {
      Alert.alert('Erro', err.message);
    }
  };

  const handleInventoryClosure = async () => {
    try {
      const itemsToUpdate = items.filter(i => inventoryCounts[i.id] !== undefined && inventoryCounts[i.id] !== String(i.currentStock));
      if (itemsToUpdate.length === 0) return setInventoryModalVisible(false);

      for (const item of itemsToUpdate) {
        await StockService.recordMovement({
          itemId: item.id,
          type: 'ADJUST',
          quantity: parseFloat(inventoryCounts[item.id]),
          responsibleId: 'admin',
          reason: 'Conferência Física de Inventário'
        });
      }
      Alert.alert('Sucesso', 'Inventário fechado com ajustes registrados.');
      setInventoryModalVisible(false);
      setInventoryCounts({});
      loadData();
    } catch (err: any) {
      Alert.alert('Erro no Inventário', err.message);
    }
  };

  const filteredItems = items.filter(i => {
    const matchLoc = selectedLoc === 'ALL' || i.locationId === selectedLoc;
    const matchNeed = showNeedsOnly ? (i.currentStock <= i.minStock) : true;
    const matchSearch = i.name.toLowerCase().includes(searchText.toLowerCase()) || i.sku.toLowerCase().includes(searchText.toLowerCase());
    return matchLoc && matchNeed && matchSearch;
  });

  const renderStockItem = ({ item }: { item: StockItem }) => {
    const percent = Math.min((item.currentStock / item.targetStock) * 100, 100);
    const isCritical = item.currentStock <= item.minStock;
    return (
      <View style={S.itemCard}>
        {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemThumb} /> : <View style={S.itemIconPH}><Ionicons name="cube" size={20} color={colors.textLight} /></View>}
        <View style={S.itemInfo}>
          <Text style={S.itemName}>{item.name}</Text>
          <Text style={S.itemSku}>{item.sku} • {item.category}</Text>
          {item.subLocation && <Text style={S.addressT}><Ionicons name="location" size={10} color={colors.primary} /> {item.subLocation}</Text>}
          <View style={S.progressC}><View style={[S.progressB, { width: `${percent}%`, backgroundColor: isCritical ? '#EF4444' : '#10B981' } as any]} /></View>
        </View>
        <View style={S.stockBadge}><Text style={[S.stockV, isCritical && { color: '#EF4444' }]}>{item.currentStock}</Text><Text style={S.stockU}>{item.unit}</Text></View>
        <TouchableOpacity style={S.moveBtn} onPress={() => { setSelectedItem(item); setMoveModalVisible(true); }}><Ionicons name="swap-vertical" size={20} color={colors.primary} /></TouchableOpacity>
      </View>
    );
  };

  const renderReports = () => {
    const totalValue = items.reduce((acc, i) => acc + (i.currentStock * (i.costPrice || 0)), 0);
    return (
      <ScrollView style={{flex: 1}} contentContainerStyle={{padding: 16}}>
        <View style={S.statsGrid}>
          <View style={S.statCard}><Text style={S.statLabel}>INVESTIMENTO EM ESTOQUE</Text><Text style={S.statValue}>R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text></View>
          <View style={[S.statCard, { borderLeftColor: '#F59E0B' }]}><Text style={S.statLabel}>ITENS EM FALTA</Text><Text style={[S.statValue, { color: '#EF4444' }]}>{items.filter(i => i.currentStock <= i.minStock).length} ITENS</Text></View>
        </View>
        <Text style={S.sectionHeader}>HISTÓRICO DE AUDITORIA (LATEST 20)</Text>
        {movements.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20).map(m => {
          const item = items.find(i => i.id === m.itemId);
          return (
            <View key={m.id} style={S.mLogCard}>
               <View style={S.mLogHeader}>
                 <Ionicons name={m.type === 'IN' ? 'arrow-down-circle' : m.type === 'ADJUST' ? 'sync-circle' : 'arrow-up-circle'} size={18} color={m.type === 'ADJUST' ? '#3B82F6' : m.type === 'IN' ? '#10B981' : '#EF4444'} />
                 <Text style={S.mLogTitle}>{item?.name || 'Item Removido'}</Text>
                 <Text style={S.mLogDate}>{new Date(m.timestamp).toLocaleDateString([], {day:'2-digit', month:'2-digit'})}</Text>
               </View>
               <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end'}}>
                  <Text style={S.mLogReason}>{m.reason}</Text>
                  <Text style={[S.mLogQty, {color: m.type === 'ADJUST' ? '#3B82F6' : m.type === 'IN' ? '#10B981' : '#EF4444'}]}>{m.type === 'IN' ? '+' : m.type === 'ADJUST' ? '#' : '-'}{m.quantity} {item?.unit}</Text>
               </View>
            </View>
          );
        })}
        <TouchableOpacity style={S.exportBtn} onPress={() => Sharing.shareAsync('/', { dialogTitle: 'GMS Stock Report' })}><Ionicons name="share-outline" size={20} color="#fff" /><Text style={S.exportText}>EXPORTAR LIVRO RAZÃO (PDF)</Text></TouchableOpacity>
      </ScrollView>
    );
  };

  return (
    <View style={S.container}>
      <View style={S.pHeader}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
           <View><Text style={S.pTitle}>Estoque & Auditoria</Text><Text style={S.pSubtitle}>GMS Brspark Enterprise</Text></View>
           <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={S.addBtn} onPress={() => setCreateModalVisible(true)}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
              <TouchableOpacity style={[S.needsBtn, showNeedsOnly && S.needsBtnActive]} onPress={() => setShowNeedsOnly(!showNeedsOnly)}><Ionicons name="cart" size={20} color={showNeedsOnly ? '#fff' : colors.primary} />{items.filter(i => i.currentStock <= i.minStock).length > 0 && <View style={S.nDot} />}</TouchableOpacity>
           </View>
        </View>
        <View style={S.tabBar}>
          <TouchableOpacity style={[S.tabBtn, activeSubTab === 'ITEMS' && S.tabBtnActive]} onPress={() => setActiveSubTab('ITEMS')}><Text style={[S.tabBtnText, activeSubTab === 'ITEMS' && S.tabBtnTextActive]}>ALMOXARIFADO</Text></TouchableOpacity>
          <TouchableOpacity style={[S.tabBtn, activeSubTab === 'REPORTS' && S.tabBtnActive]} onPress={() => setActiveSubTab('REPORTS')}><Text style={[S.tabBtnText, activeSubTab === 'REPORTS' && S.tabBtnTextActive]}>HISTÓRICO & BI</Text></TouchableOpacity>
        </View>
      </View>

      {activeSubTab === 'ITEMS' ? (
        <>
          <View style={S.locBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
               <TouchableOpacity style={[S.filterChip, selectedLoc === 'ALL' && S.filterChipActive]} onPress={() => setSelectedLoc('ALL')}><Text style={[S.filterChipText, selectedLoc === 'ALL' && S.filterChipTextActive]}>PORTEFÓLIO</Text></TouchableOpacity>
               {venues.map(v => (<TouchableOpacity key={v.id} style={[S.filterChip, selectedLoc === v.id && S.filterChipActive]} onPress={() => setSelectedLoc(v.id)}><Text style={[S.filterChipText, selectedLoc === v.id && S.filterChipTextActive]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
            </ScrollView>
          </View>
          <View style={S.searchArea}>
             <View style={{flexDirection: 'row', gap: 10, alignItems: 'center'}}>
               <View style={S.searchBox}><Ionicons name="search" size={18} color={colors.textLight} /><TextInput placeholder="Código ou Nome..." style={S.searchInput} value={searchText} onChangeText={setSearchText} /></View>
               <TouchableOpacity style={S.invBtn} onPress={() => setInventoryModalVisible(true)}><Ionicons name="barcode" size={20} color="#fff" /><Text style={{color: '#fff', fontSize: 10, fontWeight: '900'}}>INVENTÁRIO</Text></TouchableOpacity>
             </View>
          </View>
          <FlatList data={filteredItems} renderItem={renderStockItem} keyExtractor={i => i.id} contentContainerStyle={{ padding: 16 }} />
        </>
      ) : renderReports()}

      {/* MODAL MOVIMENTAÇÃO */}
      <Modal visible={moveModalVisible} transparent animationType="slide">
        <View style={S.modalO}><View style={S.modalC}>
          <View style={S.modalH}><Text style={S.modalTitleHeader}>MOVIMENTAR ITEM</Text><TouchableOpacity onPress={() => setMoveModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
          <View style={S.modalB}>
            <Text style={S.itemL}>{selectedItem?.name}</Text>
            <View style={S.typeRow}>
              <TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBActive]} onPress={() => setMoveType('IN')}><Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]}>ENTRADA</Text></TouchableOpacity>
              <TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBActiveO]} onPress={() => setMoveType('OUT')}><Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]}>SAÍDA</Text></TouchableOpacity>
            </View>
            <TextInput style={S.input} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder="Qtd" />
            <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder="Motivo" />
            <TouchableOpacity style={S.confirmBtn} onPress={handleMovement}><Text style={S.confirmText}>EFETIVAR MOVIMENTAÇÃO</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* MODAL INVENTÁRIO (CONFERÊNCIA) */}
      <Modal visible={inventoryModalVisible} transparent animationType="fade">
        <View style={S.modalO}><View style={S.modalContentInventory}>
          <View style={S.modalH}><View><Text style={S.modalTitleHeader}>CONFERÊNCIA DE INVENTÁRIO</Text><Text style={{fontSize: 9, fontWeight:'700', color: colors.textSecondary}}>Local: {selectedLoc === 'ALL' ? 'Geral' : venues.find(v=>v.id===selectedLoc)?.title}</Text></View><TouchableOpacity onPress={() => setInventoryModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
          <FlatList 
            data={items.filter(i => selectedLoc === 'ALL' || i.locationId === selectedLoc)}
            keyExtractor={i => i.id}
            renderItem={({item}) => (
              <View style={S.invRow}>
                <View style={{flex:1}}><Text style={S.invName}>{item.name}</Text><Text style={S.invSub}>Sistema: {item.currentStock} {item.unit}</Text></View>
                <TextInput 
                  style={S.invInput} 
                  keyboardType="numeric" 
                  placeholder={String(item.currentStock)} 
                  onChangeText={v => setInventoryCounts(prev => ({...prev, [item.id]: v}))}
                />
              </View>
            )}
            contentContainerStyle={{paddingBottom: 20}}
          />
          <TouchableOpacity style={S.confirmBtn} onPress={handleInventoryClosure}><Text style={S.confirmText}>FECHAR INVENTÁRIO & AJUSTAR</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* MODAL CADASTRO (Novo Item) */}
      <Modal visible={createModalVisible} transparent animationType="fade">
        <View style={S.modalO}><View style={S.modalContentFull}>
          <View style={S.modalH}><Text style={S.modalTitleHeader}>NOVO ITEM NO ALMOXARIFADO</Text><TouchableOpacity onPress={() => setCreateModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
          <ScrollView style={S.modalB} showsVerticalScrollIndicator={false}>
            <TouchableOpacity style={S.pPH} onPress={async () => {
                const res = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.5 });
                if (!res.canceled) setNewItem({...newItem, photoUri: res.assets[0].uri});
            }}>{newItem.photoUri ? <Image source={{uri: newItem.photoUri}} style={{width:'100%',height:'100%'}} /> : <><Ionicons name="camera-outline" size={32} color={colors.textLight} /><Text style={S.pT}>Foto do Insumo</Text></>}</TouchableOpacity>
            <TextInput style={S.input} placeholder="Nome" value={newItem.name} onChangeText={v => setNewItem({...newItem, name:v})} />
            <View style={{flexDirection:'row', gap:10}}><TextInput style={[S.input,{flex:1}]} placeholder="SKU" value={newItem.sku} onChangeText={v => setNewItem({...newItem, sku:v})} /><TextInput style={[S.input,{flex:1}]} placeholder="Categoria" value={newItem.category} onChangeText={v => setNewItem({...newItem, category:v})} /></View>
            <Text style={S.label}>ENDEREÇAMENTO (GAVETA / PRATELEIRA):</Text>
            <TextInput style={S.input} placeholder="Ex: Gaveta 04" value={newItem.subLocation} onChangeText={v => setNewItem({...newItem, subLocation:v})} />
            <View style={{flexDirection:'row', gap:10, marginBottom:15}}>{['un','lt','kg','mt'].map(u => (<TouchableOpacity key={u} style={[S.uBtn, newItem.unit === u && S.uBtnA]} onPress={() => setNewItem({...newItem, unit:u as any})}><Text style={[S.uT, newItem.unit === u && {color:'#fff'}]}>{u.toUpperCase()}</Text></TouchableOpacity>))}</View>
            <Text style={S.label}>VINCULAR AO ATIVO:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:15}}>{venues.map(v => (<TouchableOpacity key={v.id} style={[S.uBtn, newItem.locationId === v.id && S.uBtnA]} onPress={() => setNewItem({...newItem, locationId:v.id})}><Text style={[S.uT, newItem.locationId === v.id && {color:'#fff'}]}>{v.title}</Text></TouchableOpacity>))}</ScrollView>
            <View style={{flexDirection:'row', gap:10}}><View style={{flex:1}}><Text style={S.label}>CUSTO UNIT</Text><TextInput style={S.input} keyboardType="numeric" value={newItem.costPrice ? String(newItem.costPrice) : ''} onChangeText={v => setNewItem({...newItem, costPrice:Number(v)})} /></View><View style={{flex:1}}><Text style={S.label}>LIMITE CRÍTICO</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.minStock)} onChangeText={v => setNewItem({...newItem, minStock:Number(v)})} /></View><View style={{flex:1}}><Text style={S.label}>ESTOQUE ALVO</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.targetStock)} onChangeText={v => setNewItem({...newItem, targetStock:Number(v)})} /></View></View>
            <TouchableOpacity style={S.confirmBtn} onPress={handleCreateItem}><Text style={S.confirmText}>SALVAR NO ACERVO BRSPARK</Text></TouchableOpacity>
            <View style={{height: 40}} />
          </ScrollView>
        </View></View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pHeader: { padding: 16, paddingTop: 60, backgroundColor: '#fff' },
  pTitle: { color: colors.primary, fontSize: 22, fontWeight: '800' },
  pSubtitle: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  addBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  needsBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#F2F4F7', justifyContent: 'center', alignItems: 'center' },
  needsBtnActive: { backgroundColor: '#F59E0B' },
  nDot: { position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#fff' },
  tabBar: { flexDirection: 'row', backgroundColor: '#F2F4F7', borderRadius: 10, padding: 4, marginTop: 15 },
  tabBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#fff', elevation: 2 },
  tabBtnText: { fontSize: 11, fontWeight: '800', color: colors.textLight },
  tabBtnTextActive: { color: colors.primary },
  locBar: { backgroundColor: '#fff', paddingBottom: 12 },
  filterScroll: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  searchArea: { paddingHorizontal: 16 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '600' },
  invBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', gap: 5, flexDirection: 'row' },
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, marginHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '700', color: colors.primary },
  itemSku: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  addressT: { fontSize: 10, fontWeight: '700', color: colors.primary, marginTop: 4 },
  progressC: { height: 4, backgroundColor: '#F2F4F7', borderRadius: 2, marginTop: 10, width: '80%', overflow: 'hidden' },
  progressB: { height: '100%', borderRadius: 2 },
  stockBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 50, marginRight: 15 },
  stockV: { fontSize: 18, fontWeight: '800', color: colors.primary },
  stockU: { fontSize: 9, fontWeight: '800', color: colors.textLight },
  moveBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F2F4F7', justifyContent: 'center', alignItems: 'center' },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 15, borderLeftWidth: 4, borderLeftColor: colors.primary, borderWidth: 1, borderColor: colors.border },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 4 },
  statLabel: { fontSize: 9, fontWeight: '800', color: colors.textLight },
  sectionHeader: { fontSize: 12, fontWeight: '900', color: colors.primary, marginBottom: 15 },
  mLogCard: { backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  mLogHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  mLogTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  mLogDate: { fontSize: 10, color: colors.textLight },
  mLogQty: { fontSize: 14, fontWeight: '900' },
  mLogReason: { fontSize: 11, color: colors.textSecondary, flex: 1, paddingRight: 10 },
  exportBtn: { backgroundColor: colors.primary, flexDirection: 'row', padding: 18, borderRadius: 15, marginTop: 20, justifyContent: 'center', alignItems: 'center', gap: 10 },
  exportText: { color: '#fff', fontWeight: '900', fontSize: 12 },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25 },
  modalContentFull: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, height: '90%' },
  modalContentInventory: { backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, height: '80%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitleHeader: { fontSize: 13, fontWeight: '900', color: colors.primary },
  modalB: { flex: 1 },
  itemL: { fontSize: 18, fontWeight: '900', color: colors.primary, marginBottom: 15 },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBActive: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBActiveO: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  typeT: { fontSize: 12, fontWeight: '900', color: colors.textSecondary },
  input: { backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, fontSize: 14, fontWeight: '700', marginBottom: 12, borderWidth: 1, borderColor: colors.border },
  label: { fontSize: 9, fontWeight: '900', color: colors.primary, marginBottom: 5, marginTop: 5 },
  confirmBtn: { backgroundColor: colors.primary, padding: 18, borderRadius: 12, marginTop: 10, alignItems: 'center' },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13 },
  uBtn: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F2F4F7', marginRight: 5 },
  uBtnA: { backgroundColor: colors.primary },
  uT: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  pPH: { width: '100%', height: 120, backgroundColor: '#F8FAFC', borderRadius: 15, borderStyle: 'dashed', borderWidth: 2, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 20, overflow: 'hidden' },
  pT: { fontSize: 11, fontWeight: '700', color: colors.textLight, marginTop: 10 },
  itemThumb: { width: 50, height: 50, borderRadius: 10, marginRight: 12 },
  itemIconPH: { width: 50, height: 50, borderRadius: 10, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  invRow: { flexDirection:'row', alignItems:'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  invName: { fontSize: 15, fontWeight: '700', color: colors.primary },
  invSub: { fontSize: 11, color: colors.textLight },
  invInput: { width: 80, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 10, textAlign: 'center', fontSize: 16, fontWeight: '800' }
});
