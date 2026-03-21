import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Alert, ScrollView, Image, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { StockService } from '../../src/services/stockService';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { StockItem, StockMovement } from '../../src/types/stock';
import { getRootAssets } from '../../src/database';
import { useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const CATEGORIES = ['Geral', 'Manutenção', 'Limpeza', 'Alimentos', 'Bebidas', 'Suprimentos'];
const UNITS = ['un', 'lt', 'kg', 'mt', 'pct'];

export default function StockScreen() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState<'ITEMS' | 'REPORTS'>('ITEMS');
  const [selectedLoc, setSelectedLoc] = useState('ALL');
  const [showNeedsOnly, setShowNeedsOnly] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [venues, setVenues] = useState<any[]>([]);

  // Modais Visíveis
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [scanModalVisible, setScanModalVisible] = useState(false);
  const [scanMode, setScanMode] = useState<'SEARCH' | 'CREATE'>('SEARCH');
  const [fetchingProduct, setFetchingProduct] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [inventoryModalVisible, setInventoryModalVisible] = useState(false);
  
  // Estados de Movimentação
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [moveType, setMoveType] = useState<'IN' | 'OUT' | 'ADJUST' | 'TRANSFER'>('OUT');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [subLocation, setSubLocation] = useState('');
  const [destAssetId, setDestAssetId] = useState('');

  // Novo Item
  const [newItem, setNewItem] = useState<Partial<StockItem>>({
    unit: 'un', category: 'Geral', currentStock: 0, minStock: 2, targetStock: 5, locationId: '1'
  });

  const loadData = async () => {
    setLoading(true);
    const data = await StockService.getItems();
    const moves = await StockService.getMovements();
    const roots = getRootAssets();
    setVenues(roots);
    setItems(data);
    setMovements(moves.reverse());
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);
  useFocusEffect(useCallback(() => { loadData(); }, []));

  const pickImage = async (isNew: boolean) => {
    let res = await ImagePicker.launchCameraAsync({ quality: 0.5 });
    if (!res.canceled) {
      if (isNew) setNewItem({ ...newItem, photoUri: res.assets[0].uri });
    }
  };

  const generateSKU = () => `BS-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  const handleCreateItem = async () => {
    if (!newItem.name || !newItem.sku) return Alert.alert('Atenção', 'Nome e SKU são obrigatórios.');
    const all = await StockService.getItems();
    if (all.some(i => i.sku.toUpperCase() === newItem.sku?.toUpperCase())) {
      return Alert.alert('Erro', `SKU ${newItem.sku} já existe.`);
    }

    const it: StockItem = {
      ...newItem as StockItem,
      id: Math.random().toString(36).substring(7),
      currentStock: Number(newItem.currentStock) || 0,
      minStock: Number(newItem.minStock) || 0,
      targetStock: Number(newItem.targetStock) || 0,
      sku: newItem.sku.toUpperCase()
    };
    await StockService.saveItem(it);
    setCreateModalVisible(false);
    loadData();
    Alert.alert('Sucesso', 'Material cadastrado com sucesso! ✅');
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
      setMoveModalVisible(false); setQuantity(''); setReason(''); setSubLocation(''); setDestAssetId(''); setUnitPrice('');
      loadData();
      Keyboard.dismiss();
    } catch (err: any) { Alert.alert('Erro', err.message); }
  };

  const openMoveModal = (item: StockItem) => {
    setSelectedItem(item);
    setQuantity(''); setReason(''); setSubLocation(item.subLocation || '');
    setMoveType('OUT'); setDestAssetId(''); setMoveModalVisible(true);
  };

  const handleExportReport = async () => {
    let csv = 'Nome,SKU,Categoria,Saldo,Unidade,Local,Sub-local\n';
    items.forEach(i => {
      const asset = venues.find(v => v.id === i.locationId);
      csv += `"${i.name}","${i.sku}","${i.category}",${i.currentStock},"${i.unit}","${asset?.title || 'Geral'}","${i.subLocation || ''}"\n`;
    });
    
    const fileUri = (FileSystem as any).cacheDirectory + 'inventario_brspark.csv';
    await FileSystem.writeAsStringAsync(fileUri, csv);
    await Sharing.shareAsync(fileUri);
  };

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isScanning) return;
    setIsScanning(true);
    setScanModalVisible(false);
    
    if (scanMode === 'CREATE') {
      setNewItem({ ...newItem, sku: data.toUpperCase() });
      setFetchingProduct(true);
      setCreateModalVisible(true);
      
      try {
        const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${data}.json`);
        const json = await res.json();
        if (json.status === 1 && json.product) {
          setNewItem(prev => ({
            ...prev,
            sku: data.toUpperCase(),
            name: json.product.product_name || prev.name,
            photoUri: json.product.image_front_url || json.product.image_url || prev.photoUri,
            category: 'Suprimentos' // DEFAULT para itens encontrados no OFF
          }));
          showToast(`Produto Identificado: ${json.product.product_name || data}`, 'success');
        } else {
          showToast(`SKU ${data} pronto para cadastro.`, 'success');
        }
      } catch (e) { 
        console.log('OFF API Error', e); 
        showToast('Erro ao buscar dados do produto.', 'error');
      }
      setFetchingProduct(false);
      setIsScanning(false);
      return;
    }

    const found = items.find(i => i.sku.toUpperCase() === data.toUpperCase());
    if (found) {
      setSelectedItem(found);
      setMoveType('OUT');
      setQuantity('');
      setReason('Lido via Barcode');
      setMoveModalVisible(true);
    } else {
      showToast(`SKU ${data} não encontrado no estoque.`, 'error');
    }
    setIsScanning(false);
  };

  const startScanner = async (mode: 'SEARCH' | 'CREATE' = 'SEARCH') => {
    setScanMode(mode);
    if (mode === 'CREATE') setCreateModalVisible(false);
    if (mode === 'SEARCH' && moveModalVisible) setMoveModalVisible(false);
    
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        if (mode === 'CREATE') setCreateModalVisible(true);
        return Alert.alert('Acesso Negado', 'Permita o acesso à câmera.');
      }
    }
    setIsScanning(false);
    setScanModalVisible(true);
  };

  const filteredItems = items.filter(i => {
    const matchLoc = selectedLoc === 'ALL' || i.locationId === selectedLoc;
    const matchNeed = showNeedsOnly ? (i.currentStock <= i.minStock) : true;
    const matchSearch = i.name.toLowerCase().includes(searchText.toLowerCase()) || i.sku.toLowerCase().includes(searchText.toLowerCase());
    return matchLoc && matchNeed && matchSearch;
  });

  const renderStockItem = ({ item }: { item: StockItem }) => {
    const p = Math.min((item.currentStock / item.targetStock) * 100, 100);
    const isC = item.currentStock <= item.minStock;
    const asset = venues.find(v => v.id === item.locationId);
    
    // Distribuição do SKU em outros locais
    const distribution = items.filter(i => i.sku === item.sku && i.id !== item.id && i.currentStock > 0);

    return (
      <View style={S.itemCard}>
        {item.photoUri ? <Image source={{uri: item.photoUri}} style={S.itemImg} /> : <View style={S.itemImgPH}><Ionicons name="camera-outline" size={16} color={colors.textLight} /></View>}
        <View style={S.itemInfo}>
          <Text style={S.itemName}>{item.name}</Text>
          <Text style={S.itemSku}>{item.sku} • {item.category}</Text>
          <View style={S.hBadgeRow}>
            <View style={S.minLocBadge}><Text style={S.minLocT}>{asset?.title.toUpperCase() || 'GERAL'}</Text></View>
            {item.subLocation && <Text style={S.subT}> › {item.subLocation}</Text>}
          </View>
          
          {distribution.length > 0 && (
            <View style={S.distRow}>
              <Text style={S.distL}>TAMBÉM EM: </Text>
              {distribution.map(d => (
                <View key={d.id} style={S.distBadge}>
                  <Text style={S.distT}>{venues.find(v => v.id === d.locationId)?.title.toUpperCase() || 'S'}: {d.currentStock}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={S.progressC}><View style={[S.progressB, { width: `${p}%`, backgroundColor: isC ? '#EF4444' : '#10B981' } as any]} /></View>
        </View>
        <View style={S.stockBadge}><Text style={[S.stockV, isC && { color: '#EF4444' }]}>{item.currentStock}</Text><Text style={S.stockU}>{item.unit}</Text></View>
        <TouchableOpacity style={S.moveBtn} onPress={() => openMoveModal(item)}><Ionicons name="swap-vertical" size={20} color={colors.primary} /></TouchableOpacity>
      </View>
    );
  };

  const renderHistoryItem = ({ item: m }: { item: StockMovement }) => {
    const it = items.find(i => i.id === m.itemId);
    const asset = venues.find(v => v.id === it?.locationId);
    const dest = venues.find(v => v.id === m.destinationAssetId);
    return (
      <View style={S.hCard}>
        <View style={[S.hIndicator, { backgroundColor: m.type === 'IN' ? '#10B981' : m.type === 'TRANSFER' ? '#6366F1' : '#EF4444' }]} />
        <View style={{flex:1}}>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}>
             <Text style={S.hItemName}>{it?.name || 'Item Removido'}</Text>
             <Text style={[S.hQty, { color: m.type === 'OUT' ? '#EF4444' : m.type === 'TRANSFER' ? '#6366F1' : '#10B981' }]}>{(m.type === 'OUT' ? '-' : m.type === 'TRANSFER' ? '⇄' : '+')+m.quantity}</Text>
          </View>
          <View style={S.hSubRow}><Text style={S.hAsset}>{asset?.title || 'Geral'}</Text>{dest && <Text style={S.hSubLoc}> ⇢ {dest.title}</Text>}</View>
          <Text style={S.hMeta}>{new Date(m.timestamp).toLocaleString('pt-BR')} • {m.reason}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={S.container}>
      {toast && (
        <TouchableOpacity style={[S.toast, toast.type === 'error' ? S.toastE : S.toastS]} onPress={() => setToast(null)}>
          <Ionicons name={toast.type === 'error' ? 'alert-circle' : 'checkmark-circle'} size={18} color="#fff" />
          <Text style={S.toastT}>{toast.msg}</Text>
        </TouchableOpacity>
      )}
      <View style={S.pHeader}>
        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
           <View><Text style={S.pTitle}>Estoque</Text></View>
           <View style={{flexDirection: 'row', gap: 10}}>
              <TouchableOpacity style={[S.needsBtn, {backgroundColor: colors.primary, borderColor: colors.primary}]} onPress={handleExportReport}><Ionicons name="share-outline" size={20} color="#fff" /></TouchableOpacity>
              <TouchableOpacity style={S.addBtn} onPress={() => { setSelectedLoc('ALL'); setNewItem({ name: '', sku: generateSKU(), unit: 'un', category: 'Geral', currentStock: 0, minStock: 2, targetStock: 5, locationId: venues[0]?.id || '1' }); setCreateModalVisible(true); }}><Ionicons name="add" size={24} color="#fff" /></TouchableOpacity>
              <TouchableOpacity style={[S.needsBtn, showNeedsOnly && S.needsBtnActive]} onPress={() => setShowNeedsOnly(!showNeedsOnly)}><Ionicons name="cart" size={20} color={showNeedsOnly ? '#fff' : colors.primary} /></TouchableOpacity>
           </View>
        </View>
        <View style={S.tabBar}>
           <TouchableOpacity style={[S.tabBtn, activeSubTab === 'ITEMS' && S.tabBtnActive]} onPress={() => setActiveSubTab('ITEMS')}><Text style={[S.tabBtnText, activeSubTab === 'ITEMS' && S.tabBtnTextActive]}>ALMOXARIFADO</Text></TouchableOpacity>
           <TouchableOpacity style={[S.tabBtn, activeSubTab === 'REPORTS' && S.tabBtnActive]} onPress={() => setActiveSubTab('REPORTS')}><Text style={[S.tabBtnText, activeSubTab === 'REPORTS' && S.tabBtnTextActive]}>HISTÓRICO GLOBAL</Text></TouchableOpacity>
        </View>
      </View>

      {activeSubTab === 'ITEMS' ? (
        <>
          <View style={S.locBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
                <TouchableOpacity style={[S.filterChip, selectedLoc === 'ALL' && S.filterChipActive]} onPress={() => setSelectedLoc('ALL')}><Text style={[S.filterChipText, selectedLoc === 'ALL' && S.filterChipTextActive]}>PORTFÓLIO</Text></TouchableOpacity>
                {venues.map(v => (<TouchableOpacity key={v.id} style={[S.filterChip, selectedLoc === v.id && S.filterChipActive]} onPress={() => setSelectedLoc(v.id)}><Text style={[S.filterChipText, selectedLoc === v.id && S.filterChipTextActive]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
            </ScrollView>
          </View>
          <View style={S.searchArea}>
            <View style={S.searchRow}>
              <View style={S.searchBox}>
                <Ionicons name="search" size={18} color={colors.textLight} />
                <TextInput 
                  placeholder="Buscar por nome ou SKU..." 
                  style={S.searchInput}
                  value={searchText}
                  onChangeText={setSearchText}
                />
              </View>
              <TouchableOpacity style={S.barcodeBtn} onPress={() => startScanner('SEARCH')}>
                <Ionicons name="barcode-outline" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
          <FlatList data={filteredItems} renderItem={renderStockItem} keyExtractor={i => i.id} contentContainerStyle={{ padding: 16 }} />
        </>
      ) : <FlatList data={movements} renderItem={renderHistoryItem} keyExtractor={m => m.id} contentContainerStyle={{ padding: 20 }} />}

      {/* MODAL MOVIMENTAÇÃO */}
      <Modal visible={moveModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={S.modalH}><Text style={S.modalTitleHeader}>MOVIMENTAÇÃO LOGÍSTICA</Text><TouchableOpacity onPress={() => setMoveModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
            <Text style={S.itemLText}>{selectedItem?.name}</Text>
            <View style={S.hierRow}><View style={S.mBadge}><Ionicons name="business" size={12} color="#fff" /><Text style={S.mBadgeT}>{venues.find(v => v.id === selectedItem?.locationId)?.title || 'GERAL'}</Text></View><Ionicons name="chevron-forward" size={14} color={colors.border} /><View style={S.sBadge}><Ionicons name="location" size={12} color={colors.primary} /><Text style={S.sBadgeT}>{subLocation || 'S/ Local'}</Text></View></View>
            
            <View style={S.typeRow}>
               <TouchableOpacity style={[S.typeB, moveType === 'IN' && S.typeBA]} onPress={() => setMoveType('IN')}><Text style={[S.typeT, moveType === 'IN' && {color:'#fff'}]}>ENTRADA</Text></TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'OUT' && S.typeBAO]} onPress={() => setMoveType('OUT')}><Text style={[S.typeT, moveType === 'OUT' && {color:'#fff'}]}>SAÍDA</Text></TouchableOpacity>
               <TouchableOpacity style={[S.typeB, moveType === 'TRANSFER' && S.typeBAT]} onPress={() => setMoveType('TRANSFER')}><Text style={[S.typeT, moveType === 'TRANSFER' && {color:'#fff'}]}>TRANSFERIR</Text></TouchableOpacity>
            </View>

            {moveType === 'TRANSFER' && (
              <View style={S.inputG}><Text style={S.inputL}>DESTINO DA CARGA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:8, marginBottom:15}}>
                  {venues.filter(v => v.id !== selectedItem?.locationId).map(v => (<TouchableOpacity key={v.id} style={[S.pChip, destAssetId === v.id && S.pChipA]} onPress={()=>setDestAssetId(v.id)}><Text style={[S.pChipT, destAssetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
                </ScrollView>
              </View>
            )}
            
            <View style={{flexDirection: 'row', gap: 10, marginBottom: 10}}><TextInput style={[S.input, {flex: 2}]} keyboardType="numeric" value={quantity} onChangeText={setQuantity} placeholder="Qtde" returnKeyType="done" /><TextInput style={[S.input, {flex: 3}]} value={subLocation} onChangeText={setSubLocation} placeholder="Posição" returnKeyType="done" /></View>
            {moveType === 'IN' && (
              <View style={S.inputG}><Text style={S.inputL}>VALOR UNITÁRIO (PAGO)</Text><TextInput style={S.input} keyboardType="numeric" value={unitPrice} onChangeText={setUnitPrice} placeholder="R$ 0,00" returnKeyType="done" /></View>
            )}
            <TextInput style={[S.input, {height:60}]} multiline value={reason} onChangeText={setReason} placeholder="Motivo / OBS" returnKeyType="done" blurOnSubmit /><TouchableOpacity style={S.confirmBtn} onPress={handleMovement}><Text style={S.confirmText}>EFETIVAR MOVIMENTAÇÃO</Text></TouchableOpacity>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* MODAL MASTER DE CADASTRO COM FOTO */}
      <Modal visible={createModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={S.modalH}><Text style={S.modalTitleHeader}>NOVO MATERIAL</Text><TouchableOpacity onPress={() => setCreateModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{flexDirection:'row', gap:15, marginBottom:20}}>
                 <TouchableOpacity style={S.imgPick} onPress={()=>pickImage(true)}>
                    {newItem.photoUri ? <Image source={{uri: newItem.photoUri}} style={S.imgFull} /> : <View style={{alignItems:'center'}}><Ionicons name="camera" size={30} color={colors.textLight} /><Text style={S.imgL}>FOTO</Text></View>}
                    {fetchingProduct && <View style={[StyleSheet.absoluteFill, {backgroundColor:'rgba(255,255,255,0.7)', justifyContent:'center', alignItems:'center'}]}><ActivityIndicator color={colors.primary} /></View>}
                 </TouchableOpacity>
                 <View style={{flex:1}}>
                    <View style={S.inputG}><Text style={S.inputL}>NOME {fetchingProduct && <Text style={{color:colors.primary}}> (BUSCANDO...)</Text>}</Text><TextInput style={S.input} value={newItem.name} onChangeText={t=>setNewItem({...newItem, name:t})} placeholder="Ex: Óleo de Motor" /></View>
                    <View style={S.inputG}><Text style={S.inputL}>SKU</Text>
                      <View style={{flexDirection:'row', gap:10}}>
                        <TextInput style={[S.input, {flex:1}]} value={newItem.sku} onChangeText={t=>setNewItem({...newItem, sku:t})} placeholder="Cód." />
                        <TouchableOpacity style={S.skuScanBtn} onPress={() => startScanner('CREATE')}><Ionicons name="barcode-outline" size={20} color="#fff" /></TouchableOpacity>
                      </View>
                    </View>
                 </View>
              </View>
              
              <View style={S.inputG}><Text style={S.inputL}>VÍNCULO COM ATIVO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop:5}}>{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newItem.locationId === v.id && S.pChipA]} onPress={()=>setNewItem({...newItem, locationId:v.id})}><Text style={[S.pChipT, newItem.locationId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
              <View style={{flexDirection:'row', gap:10}}>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>ATUAL (CALCULADO)</Text><TextInput style={[S.input, {backgroundColor: '#F1F5F9', color: colors.textSecondary}]} value={String(newItem.currentStock)} editable={false} /></View>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>AVISO</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.minStock)} onChangeText={t=>setNewItem({...newItem, minStock:Number(t)})} /></View>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>META</Text><TextInput style={S.input} keyboardType="numeric" value={String(newItem.targetStock)} onChangeText={t=>setNewItem({...newItem, targetStock:Number(t)})} /></View>
              </View>
              <View style={S.inputG}><Text style={S.inputL}>POSIÇÃO (GAVETA/BOX)</Text><TextInput style={S.input} value={newItem.subLocation} onChangeText={t=>setNewItem({...newItem, subLocation:t})} placeholder="Ex: A-01" /></View>
              <View style={S.inputG}><Text style={S.inputL}>CATEGORIA & UNIDADE</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom:10}}>{CATEGORIES.map(c => (<TouchableOpacity key={c} style={[S.pChip, newItem.category === c && S.pChipA]} onPress={()=>setNewItem({...newItem, category:c})}><Text style={[S.pChipT, newItem.category === c && S.pChipTA]}>{c.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView><ScrollView horizontal showsHorizontalScrollIndicator={false}>{UNITS.map(u => (<TouchableOpacity key={u} style={[S.pChip, newItem.unit === u && S.pChipA]} onPress={()=>setNewItem({...newItem, unit:u as any})}><Text style={[S.pChipT, newItem.unit === u && S.pChipTA]}>{u.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
              <TouchableOpacity style={S.confirmBtn} onPress={handleCreateItem}><Text style={S.confirmText}>SALVAR NO ESTOQUE</Text></TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      <Modal visible={inventoryModalVisible} transparent animationType="fade"><View style={S.modalO}><View style={S.modalC}><Text style={S.modalTitleHeader}>INVENTÁRIO GLOBAL</Text><TouchableOpacity onPress={()=>setInventoryModalVisible(false)} style={[S.confirmBtn, {marginTop:20}]}><Text style={S.confirmText}>FECHAR</Text></TouchableOpacity></View></View></Modal>

      {/* Modal Scanner de Código de Barras */}
      <Modal visible={scanModalVisible} animationType="slide" transparent>
        <View style={S.scanOverlay}>
          <View style={S.scanContainer}>
             <View style={S.modalH}><Text style={S.modalT}>ESCANEAMENTO DE SKU</Text><TouchableOpacity onPress={() => setScanModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
             <Text style={S.scanSub}>Posicione o código de barras ou QR Code no centro da moldura.</Text>
             <View style={S.cameraWrapper}>
                <CameraView
                  style={StyleSheet.absoluteFill}
                  onBarcodeScanned={handleBarcodeScanned}
                  barcodeScannerSettings={{ barcodeTypes: ["qr", "ean13", "code128"] }}
                />
                <View style={S.cameraOverlay}>
                  <View style={S.scannerFrame} />
                </View>
             </View>
             <TouchableOpacity style={[S.confirmBtn, {marginTop: 20, backgroundColor: '#F1F5F9'}]} onPress={() => { setScanModalVisible(false); if (scanMode === 'CREATE') setCreateModalVisible(true); }}><Text style={[S.confirmText, {color: colors.primary}]}>CANCELAR</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  pHeader: { padding: 16, paddingTop: 60, backgroundColor: '#fff' },
  pTitle: { color: colors.primary, fontSize: 32, fontWeight: '900' },
  addBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  needsBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  needsBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabBar: { flexDirection: 'row', gap: 15, marginTop: 25 },
  tabBtn: { paddingVertical: 8 },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: colors.primary },
  tabBtnText: { fontSize: 11, fontWeight: '800', color: colors.textLight },
  tabBtnTextActive: { color: colors.primary },
  locBar: { backgroundColor: '#fff', paddingBottom: 12 },
  filterScroll: { paddingHorizontal: 16, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8 },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  filterChipTextActive: { color: '#fff', fontWeight: '800' },
  searchArea: { paddingHorizontal: 16, marginBottom: 10 },
  searchRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 15, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '700' },
  barcodeBtn: { backgroundColor: colors.primary, width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  skuScanBtn: { backgroundColor: colors.primary, width: 44, height: 50, borderRadius: 12, justifyContent:'center', alignItems:'center' },
  invBtn: { backgroundColor: colors.primary, width: 45, height: 45, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  itemCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 18, borderRadius: 24, marginBottom: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
  itemImg: { width: 60, height: 60, borderRadius: 14, marginRight: 15 },
  itemImgPH: { width: 60, height: 60, borderRadius: 14, backgroundColor: '#F1F5F9', justifyContent:'center', alignItems:'center', marginRight: 15 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 16, fontWeight: '900', color: colors.primary },
  itemSku: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '700' },
  hBadgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  minLocBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  minLocT: { fontSize: 10, fontWeight: '900', color: colors.primary },
  subT: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  progressC: { height: 4, backgroundColor: '#F2F4F7', borderRadius: 2, marginTop: 10, width: '100%', overflow: 'hidden' },
  progressB: { height: '100%', borderRadius: 2 },
  distRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8, alignItems: 'center' },
  distL: { fontSize: 8, fontWeight: '900', color: colors.textLight },
  distBadge: { backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  distT: { fontSize: 8, fontWeight: '800', color: colors.primary },
  stockBadge: { alignItems: 'center', justifyContent: 'center', minWidth: 50, marginRight: 15 },
  stockV: { fontSize: 24, fontWeight: '900', color: colors.primary },
  stockU: { fontSize: 10, fontWeight: '800', color: colors.textLight, textTransform: 'uppercase' },
  moveBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  hCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  hIndicator: { width: 4, height: '70%', borderRadius: 2, marginRight: 12 },
  hItemName: { fontSize: 15, fontWeight: '800', color: colors.primary },
  hQty: { fontSize: 18, fontWeight: '900' },
  hSubRow: { flexDirection: 'row', gap: 4, marginTop: 4, alignItems:'center' },
  hAsset: { fontSize: 11, fontWeight: '900', color: colors.primary, textTransform:'uppercase' },
  hSubLoc: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  hMeta: { fontSize: 10, color: colors.textLight, marginTop: 6, fontWeight: '700' },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalTitleHeader: { fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 1 },
  modalT: { fontSize: 11, fontWeight: '900', color: colors.textLight, textTransform: 'uppercase', letterSpacing: 1 },
  itemLText: { fontSize: 24, fontWeight: '900', color: colors.primary, marginBottom: 12 },
  hierRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 25 },
  mBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  mBadgeT: { fontSize: 11, fontWeight: '900', color: '#fff' },
  sBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  sBadgeT: { fontSize: 11, fontWeight: '700', color: colors.primary },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeB: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBA: { backgroundColor: '#10B981', borderColor: '#10B981' },
  typeBAO: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  typeBAT: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  typeT: { fontSize: 11, fontWeight: '900', color: colors.textSecondary },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: '700', marginBottom: 15, borderWidth: 1, borderColor: colors.border },
  inputG: { marginBottom: 15 },
  inputL: { fontSize: 10, fontWeight: '900', color: colors.textLight, marginBottom: 6, letterSpacing: 0.5 },
  pChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pChipA: { backgroundColor: colors.primary, borderColor: colors.primary },
  pChipT: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  pChipTA: { color: '#fff' },
  confirmBtn: { backgroundColor: colors.primary, padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1.5 },
  imgPick: { width: 100, height: 100, borderRadius: 20, backgroundColor: '#F1F5F9', borderStyle: 'dashed', borderWidth: 2, borderColor: colors.border, justifyContent:'center', alignItems:'center', overflow:'hidden' },
  imgFull: { width: '100%', height: '100%' },
  imgL: { fontSize: 9, fontWeight: '900', color: colors.textLight, marginTop: 5 },
  scanOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  scanContainer: { backgroundColor: '#fff', borderRadius: 32, padding: 24, alignItems: 'center' },
  scanSub: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 20, fontWeight: '600' },
  cameraWrapper: { width: '100%', height: 300, borderRadius: 20, overflow: 'hidden', backgroundColor: '#000' },
  cameraOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'transparent' },
  scannerFrame: { width: 220, height: 220, borderWidth: 2, borderColor: colors.primary, borderRadius: 20, borderStyle: 'dashed' },
  toast: { position: 'absolute', top: 50, left: 20, right: 20, backgroundColor: colors.primary, padding: 16, borderRadius: 15, flexDirection: 'row', alignItems: 'center', gap: 10, zIndex: 9999, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 10 },
  toastS: { backgroundColor: '#10B981' },
  toastE: { backgroundColor: '#EF4444' },
  toastT: { color: '#fff', fontSize: 13, fontWeight: '800', flex: 1 },
});
