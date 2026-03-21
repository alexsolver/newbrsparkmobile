import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { StockService } from '../services/stockService';
import { StockItem, StockMovement } from '../types/stock';
import { CostSummary } from '../types/costs';
import { getLocalAssets } from '../database';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';

export function StockModule({ assetId }: { assetId?: string }) {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'HISTORY'>('ITEMS');
  const [searchText, setSearchText] = useState('');
  
  // Modais
  const [modalVisible, setModalVisible] = useState(false);
  const [invModalVisible, setInvModalVisible] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [replenishModalVisible, setReplenishModalVisible] = useState(false);
  const [catalog, setCatalog] = useState<StockItem[]>([]);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  
  // Movimentação
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [destAssetId, setDestAssetId] = useState('');

  // Gasto Direto Local
  const [expModalVisible, setExpModalVisible] = useState(false);
  const [newExp, setNewExp] = useState({ description: '', amount: '', category: 'MANUTENÇÃO' });

  const venues = getLocalAssets();
  const currentAsset = venues.find(a => a.id === assetId);

  useEffect(() => { loadData(); }, [assetId]);

  const loadData = async () => {
    setLoading(true);
    const allI = await StockService.getItems();
    const allM = await StockService.getMovements();
    const month = new Date().toISOString().substring(0, 7);
    
    if (assetId) {
      setItems(allI.filter(i => i.locationId === assetId));
      setMovements(allM.filter(m => allI.find(it => it.id === m.itemId)?.locationId === assetId).reverse());
      
      const { CostService } = require('../services/costService');
      const summ = await CostService.getAssetCostSummary(assetId, month);
      setSummary(summ);
      
      // Carregar catálogo para reabastecimento
      setCatalog(allI.filter(i => i.locationId === '1' || !i.locationId));
    }
    setLoading(false);
  };

  const handleReplenish = async (sourceItem: StockItem, qty: string) => {
    const q = parseFloat(qty.replace(',','.'));
    if (!q || isNaN(q)) return Alert.alert('Atenção', 'Informe a quantidade.');
    
    try {
      await StockService.recordMovement({
        itemId: sourceItem.id,
        type: 'TRANSFER',
        quantity: q,
        responsibleId: 'user_admin',
        reason: 'Reabastecimento Local',
        destinationAssetId: assetId,
        assetId: '1' // Origem Sede
      });
      setReplenishModalVisible(false);
      loadData();
      showToast(`${sourceItem.name} puxado com sucesso!`, 'success');
    } catch (e: any) { Alert.alert('Erro', e.message); }
  };

  const handleSaveExp = async () => {
    if (!newExp.description || !newExp.amount) return Alert.alert('Atenção', 'Preencha os campos.');
    const { CostService } = require('../services/costService');
    await CostService.saveExpense({
      id: Math.random().toString(36).substring(7),
      assetId: assetId!,
      category: newExp.category,
      amount: parseFloat(newExp.amount.replace(',','.')) || 0,
      date: new Date().toISOString().split('T')[0],
      description: newExp.description,
      status: 'PAID'
    });
    setExpModalVisible(false);
    loadData();
    showToast('Despesa registrada!', 'success');
  };

  const handleMovement = async () => {
    if (!selectedItem) return;
    const qVal = parseFloat(quantity.replace(',', '.'));
    if (!quantity || isNaN(qVal)) return Alert.alert('Atenção', 'Informe a quantidade.');
    if (moveType === 'TRANSFER' && !destAssetId) return Alert.alert('Atenção', 'Informe o destino.');

    try {
      await StockService.recordMovement({
        itemId: selectedItem.id,
        type: moveType,
        quantity: qVal,
        responsibleId: 'user_admin',
        reason: reason || (moveType === 'IN' ? 'Entrada' : moveType === 'TRANSFER' ? 'Transferência' : 'Saída'),
        subLocation: subLocation,
        destinationAssetId: destAssetId,
        unitPrice: parseFloat(unitPrice.replace(',', '.')) || 0
      });
      setModalVisible(false); setQuantity(''); setReason(''); setSubLocation(''); setDestAssetId(''); setUnitPrice('');
      loadData();
      Keyboard.dismiss();
    } catch (err: any) { Alert.alert('Erro', err.message); }
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanModalVisible(false);

    const found = items.find(i => i.sku.toUpperCase() === data.toUpperCase());
    if (found) {
      setSelectedItem(found);
      setMoveType('OUT');
      setQuantity('');
      setReason('Lido via Barcode (Local)');
      setModalVisible(true);
    } else {
      showToast(`SKU ${data} não encontrado neste ativo.`, 'error');
    }
    setIsScanning(false);
  };

  const startScanner = async () => {
    if (modalVisible) setModalVisible(false);

    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        return Alert.alert('Acesso Negado', 'Permita o acesso à câmera.');
      }
    }
    setIsScanning(false);
    setScanModalVisible(true);
  };

  const filteredItems = items.filter(i => 
    i.name.toLowerCase().includes(searchText.toLowerCase()) || 
    i.sku.toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <View style={S.container}>
      {toast && (
        <TouchableOpacity style={[S.toast, toast.type === 'error' ? S.toastE : S.toastS]} onPress={() => setToast(null)}>
          <Ionicons name={toast.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color="#fff" />
          <Text style={S.toastT}>{toast.msg}</Text>
        </TouchableOpacity>
      )}
      <View style={S.modHeader}>
         <View><Text style={S.modTitle}>GESTÃO OPERACIONAL</Text><Text style={S.modSub}>{currentAsset?.title || 'Estoque Local'}</Text></View>
         <View style={{flexDirection:'row', gap:10}}>
            <TouchableOpacity style={[S.modAddBtn, {backgroundColor:'#10B981'}]} onPress={() => setExpModalVisible(true)}><Ionicons name="card" size={20} color="#fff" /></TouchableOpacity>
            <TouchableOpacity style={S.modAddBtn} onPress={() => setReplenishModalVisible(true)}><Ionicons name="download" size={20} color="#fff" /></TouchableOpacity>
         </View>
      </View>

      {summary && (
        <View style={S.finSummary}>
          <View style={S.finItem}><Text style={S.finL}>GASTO MENSAL</Text><Text style={S.finV}>R$ {(summary.totalConsumptionValue + summary.totalDirectExpenses).toFixed(0)}</Text></View>
          <View style={S.finItem}><Text style={S.finL}>VALOR EM ESTOQUE</Text><Text style={S.finV}>R$ {summary.totalStockValue.toFixed(0)}</Text></View>
        </View>
      )}

      <View style={S.modTabBar}>
         <TouchableOpacity style={[S.modTab, activeTab === 'ITEMS' && S.modTabActive]} onPress={() => setActiveTab('ITEMS')}><Text style={[S.modTabText, activeTab === 'ITEMS' && S.modTabTextActive]}>ALMOXARIFADO</Text></TouchableOpacity>
         <TouchableOpacity style={[S.modTab, activeTab === 'HISTORY' && S.modTabActive]} onPress={() => setActiveTab('HISTORY')}><Text style={[S.modTabText, activeTab === 'HISTORY' && S.modTabTextActive]}>HISTÓRICO</Text></TouchableOpacity>
      </View>

      {activeTab === 'ITEMS' ? (
        <>
          <View style={S.searchRow}><View style={S.searchBox}><Ionicons name="search" size={16} color={colors.textLight} /><TextInput placeholder="Buscar..." style={S.searchInput} value={searchText} onChangeText={setSearchText} /></View><TouchableOpacity style={S.barcodeBtn} onPress={() => startScanner()}><Ionicons name="barcode" size={20} color="#fff" /></TouchableOpacity></View>
          <FlatList 
            data={filteredItems} 
            renderItem={({ item }) => (
              <View style={S.itemCard}>
                {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemThumb} /> : <View style={S.itemThumbPH}><Ionicons name="cube-outline" size={16} color={colors.textLight} /></View>}
                <View style={S.itemInfo}>
                  <Text style={S.itemName}>{item.name}</Text>
                  <Text style={S.itemSku}>{item.sku} • {item.category}</Text>
                  <View style={S.locBadgeInline}><Ionicons name="location-outline" size={10} color={colors.primary} /><Text style={S.subLocText}>{item.subLocation || 'S/ Posição'}</Text></View>
                </View>
                <View style={S.stockB}><Text style={[S.stockV, item.currentStock <= item.minStock && { color: '#EF4444' }]}>{item.currentStock}</Text><Text style={S.stockU}>{item.unit}</Text></View>
                <TouchableOpacity style={S.moveBtn} onPress={() => { setSelectedItem(item); setSubLocation(item.subLocation || ''); setQuantity(''); setReason(''); setModalVisible(true); }}><Ionicons name="swap-vertical" size={18} color={colors.primary} /></TouchableOpacity>
              </View>
            )} 
            keyExtractor={i => i.id} scrollEnabled={false} 
          />
        </>
      ) : (
        <View style={S.historyList}>
           {movements.map(m => (
              <View key={m.id} style={S.moveRow}>
                <View style={[S.moveDot, {backgroundColor: m.type === 'IN' ? '#10B981' : m.type === 'TRANSFER' ? '#6366F1' : '#EF4444'}]} />
                <View style={{flex:1}}><Text style={S.moveTitle}>{items.find(i=>i.id===m.itemId)?.name || 'Removido'}</Text><Text style={S.moveSub}>{new Date(m.timestamp).toLocaleDateString()} • {m.reason}</Text></View>
                <Text style={S.moveQty}>{(m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+') + m.quantity}</Text>
              </View>
           ))}
        </View>
      )}

      {/* Modal Movimentação com Transferência */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
             <View style={S.modalH}><Text style={S.modalT}>ATIVIDADE LOGÍSTICA</Text><TouchableOpacity onPress={() => setModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
             <Text style={S.itemL}>{selectedItem?.name}</Text>
             <View style={S.hierRow}><View style={S.pBadge}><Ionicons name="business" size={12} color="#fff" /><Text style={S.pBadgeT}>{currentAsset?.title.toUpperCase()}</Text></View><Ionicons name="chevron-forward" size={14} color={colors.border} /><View style={S.sBadge}><Ionicons name="location" size={12} color={colors.primary} /><Text style={S.sBadgeT}>{subLocation || 'Sem Local'}</Text></View></View>
             <View style={S.typeR}><TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBA]} onPress={() => setMoveType('IN')}><Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]}>ENTRADA</Text></TouchableOpacity><TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBAO]} onPress={() => setMoveType('OUT')}><Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]}>SAÍDA</Text></TouchableOpacity><TouchableOpacity style={[S.typeB, moveType === 'TRANSFER' && S.typeBAT]} onPress={() => setMoveType('TRANSFER')}><Text style={[S.typeT, moveType === 'TRANSFER' && {color:'#fff'}]}>TRANSF.</Text></TouchableOpacity></View>
             {moveType === 'TRANSFER' && (
                <View style={S.inputG2}><Text style={S.inputL2}>DESTINO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:8}}>{venues.filter(v => v.id !== assetId).map(v => (<TouchableOpacity key={v.id} style={[S.pChip, destAssetId === v.id && S.pChipA]} onPress={()=>setDestAssetId(v.id)}><Text style={[S.pChipT, destAssetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
             )}
             <View style={{flexDirection:'row', gap:10, marginBottom:10}}><TextInput style={[S.input, {flex:1}]} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder="Qtde" returnKeyType="done" /><TextInput style={[S.input, {flex:2}]} value={subLocation} onChangeText={setSubLocation} placeholder="Posição" returnKeyType="done" /></View>
             {moveType === 'IN' && (
               <View style={S.inputG2}><Text style={S.inputL2}>VALOR UNITÁRIO (PAGO)</Text><TextInput style={S.input} keyboardType="numeric" value={unitPrice} onChangeText={setUnitPrice} placeholder="R$ 0,00" returnKeyType="done" /></View>
             )}
             <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder="Observações" returnKeyType="done" blurOnSubmit /><TouchableOpacity style={S.confirmBtn} onPress={handleMovement}><Text style={S.confirmText}>CONFIRMAR</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* Modal Cadastro Removido em prol do Reabastecimento */}

      {/* MODAL REABASTECER (PUXAR DA SEDE) */}
      <Modal visible={replenishModalVisible} transparent animationType="slide">
        <View style={S.modalO}><View style={S.modalC}>
           <View style={S.modalH}><Text style={S.modalT}>REABASTECER DO ALMOXARIFADO</Text><TouchableOpacity onPress={() => setReplenishModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
           <Text style={S.scanSub}>Selecione itens do estoque central para transferir para este ativo.</Text>
           <FlatList
             data={catalog.filter(i => !items.find(local => local.sku === i.sku))}
             keyExtractor={i => i.id}
             style={{maxHeight: 400}}
             renderItem={({ item }) => (
               <TouchableOpacity style={S.catalogItem} onPress={() => {
                 Alert.prompt('Quantidade', `Quantos(as) ${item.unit} de ${item.name} deseja puxar?`, [
                   { text: 'Cancelar' },
                   { text: 'Transferir', onPress: (val?: string) => handleReplenish(item, val || '0') }
                 ], 'plain-text', '1');
               }}>
                 <Ionicons name="cube-outline" size={20} color={colors.primary} />
                 <Text style={S.catalogT}>{item.name} ({item.currentStock} dispon.)</Text>
                 <Ionicons name="add-circle" size={20} color={colors.primary} />
               </TouchableOpacity>
             )}
           />
           <TouchableOpacity style={[S.confirmBtn, {marginTop:20, backgroundColor:'#F1F5F9'}]} onPress={() => setReplenishModalVisible(false)}><Text style={[S.confirmText, {color:colors.primary}]}>CANCELAR</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* MODAL DESPESA DIRETA LOCAL */}
      <Modal visible={expModalVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={[S.modalC, {marginBottom:'40%'}]}>
           <View style={S.modalH}><Text style={S.modalT}>REGISTRAR GASTO NO ATIVO</Text><TouchableOpacity onPress={() => setExpModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
           <View style={S.inputG2}><Text style={S.inputL2}>O QUE FOI PAGO?</Text><TextInput style={S.input} value={newExp.description} onChangeText={t=>setNewExp({...newExp, description:t})} placeholder="Ex: Reparo de Torneira" /></View>
           <View style={{flexDirection:'row', gap:10}}>
             <View style={[S.inputG2, {flex:1}]}><Text style={S.inputL2}>VALOR (R$)</Text><TextInput style={S.input} keyboardType="numeric" value={newExp.amount} onChangeText={t=>setNewExp({...newExp, amount:t})} placeholder="0,00" /></View>
             <View style={[S.inputG2, {flex:1}]}><Text style={S.inputL2}>CATEGORIA</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{['MANUTENÇÃO', 'OUTROS', 'LIMPEZA'].map(c=>(<TouchableOpacity key={c} style={[S.pChip, newExp.category === c && S.pChipA]} onPress={()=>setNewExp({...newExp, category:c})}><Text style={[S.pChipT, newExp.category === c && S.pChipTA]}>{c}</Text></TouchableOpacity>))}</ScrollView></View>
           </View>
           <TouchableOpacity style={S.confirmBtn} onPress={handleSaveExp}><Text style={S.confirmText}>SALVAR CUSTO</Text></TouchableOpacity>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* Inventário Standby */}
      <Modal visible={invModalVisible} transparent animationType="fade"><View style={S.modalO}><View style={S.modalC}><Text style={S.modalT}>INVENTÁRIO LOCAL</Text><TouchableOpacity onPress={()=>setInvModalVisible(false)} style={[S.confirmBtn, {marginTop:20}]}><Text style={S.confirmText}>FECHAR</Text></TouchableOpacity></View></View></Modal>

      {/* Modal Scanner Local */}
      <Modal visible={scanModalVisible} animationType="slide" transparent>
        <View style={S.scanOverlay}>
          <View style={S.scanContainer}>
             <View style={S.modalH}><Text style={S.modalT}>SCANNER LOCAL BRSPARK</Text><TouchableOpacity onPress={() => setScanModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
             <Text style={S.scanSub}>Escaneie qualquer material vinculado a este ativo.</Text>
             <View style={S.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
                />
                <View style={S.cameraOverlay}><View style={S.scannerFrame} /></View>
             </View>
             <TouchableOpacity style={[S.confirmBtn, {marginTop: 20, backgroundColor: '#F1F5F9'}]} onPress={() => setScanModalVisible(false)}><Text style={[S.confirmText, {color: colors.primary}]}>CANCELAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { marginTop: 24, paddingHorizontal: 16, backgroundColor: '#FBFBFE', borderRadius: 24, paddingVertical: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  modHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modTitle: { fontSize: 10, fontWeight: '900', color: colors.textLight, letterSpacing: 1 },
  modSub: { fontSize: 18, fontWeight: '900', color: colors.primary, marginTop: 4 },
  modAddBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  modTabBar: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  modTab: { paddingBottom: 8 },
  modTabActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  modTabText: { fontSize: 11, fontWeight: '800', color: colors.textLight },
  modTabTextActive: { color: colors.primary },
  searchRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 15, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  searchInput: { paddingVertical: 12, flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700' },
  barcodeBtn: { width: 48, height: 48, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 20, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  itemThumb: { width: 50, height: 50, borderRadius: 12, marginRight: 15 },
  itemThumbPH: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent:'center', alignItems:'center', marginRight: 15 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: '800', color: colors.primary },
  itemSku: { fontSize: 10, color: colors.textSecondary, marginTop: 2, fontWeight: '700' },
  locBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  subLocText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  stockB: { alignItems: 'center', justifyContent: 'center', minWidth: 45, marginRight: 15 },
  stockV: { fontSize: 18, fontWeight: '900', color: colors.primary },
  stockU: { fontSize: 9, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  moveBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  historyList: { marginTop: 10 },
  moveRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  moveDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  moveTitle: { fontSize: 14, fontWeight: '800', color: colors.primary },
  moveSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  moveQty: { fontSize: 15, fontWeight: '900', color: colors.primary },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalT: { fontSize: 10, fontWeight: '900', color: colors.textLight, letterSpacing: 1 },
  itemL: { fontSize: 22, fontWeight: '900', color: colors.primary, marginBottom: 12 },
  hierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 25 },
  pBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  pBadgeT: { fontSize: 11, fontWeight: '900', color: '#fff' },
  sBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  sBadgeT: { fontSize: 11, fontWeight: '700', color: colors.primary },
  typeR: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBA: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBAO: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  typeBAT: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  typeT: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: '700', marginBottom: 15, borderWidth: 1, borderColor: colors.border },
  inputG2: { marginBottom: 15 },
  inputL2: { fontSize: 10, fontWeight: '900', color: colors.textLight, marginBottom: 6 },
  pChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pChipA: { backgroundColor: colors.primary, borderColor: colors.primary },
  pChipT: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  pChipTA: { color: '#fff' },
  confirmBtn: { backgroundColor: colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1.5 },
  skuScanBtn: { backgroundColor: colors.primary, width: 44, height: 44, borderRadius: 12, justifyContent:'center', alignItems:'center' },
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  scanContainer: { backgroundColor: '#fff', borderRadius: 32, padding: 24, alignItems: 'center' },
  scanSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontWeight: '600' },
  cameraWrapper: { width: '100%', height: 260, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  scannerFrame: { width: 180, height: 180, borderWidth: 2, borderColor: colors.primary, borderRadius: 20, borderStyle: 'dashed' },
  toast: { position: 'absolute', top: 20, left: 10, right: 10, backgroundColor: colors.primary, padding: 16, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10 },
  toastS: { backgroundColor: '#10B981' },
  toastE: { backgroundColor: '#EF4444' },
  toastT: { color: '#fff', fontSize: 13, fontWeight: '800', flex: 1 },
  finSummary: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  finItem: { flex: 1, backgroundColor: '#fff', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  finL: { fontSize: 8, fontWeight: '900', color: colors.textLight, letterSpacing: 0.5 },
  finV: { fontSize: 16, fontWeight: '900', color: colors.primary, marginTop: 4 },
  catalogItem: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 8, gap: 12 },
  catalogT: { fontSize: 14, fontWeight: '700', color: colors.primary, flex: 1 },
});
