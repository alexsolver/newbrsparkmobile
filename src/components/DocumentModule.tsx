import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, Modal, Alert, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AssetDocument, AssetDocService } from '../services/assetDocs';

const colors = {
  primary: '#0F172A',
  accent: '#3B82F6',
  background: '#F8FAFC',
  card: '#FFFFFF',
  text: '#1E293B',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  success: { bg: '#F0FDF4', text: '#166534', border: '#DCFCE7' },
  danger: { bg: '#FEF2F2', text: '#991B1B', border: '#FEE2E2' }
};

export function DocumentModule({ assetId }: { assetId: string }) {
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [expireDate, setExpireDate] = useState('');
  const [alertDays, setAlertDays] = useState(0);
  const [customAlert, setCustomAlert] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [uri, setUri] = useState('');
  const [category, setCategory] = useState('Geral');
  const [docType, setDocType] = useState<'pdf' | 'image' | 'file'>('file');
  const [editingDoc, setEditingDoc] = useState<AssetDocument | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const [pdfPreviewUri, setPdfPreviewUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => { loadDocs(); }, [assetId]);

  const loadDocs = async () => {
    const docs = await AssetDocService.getDocuments(assetId);
    setDocuments(docs);
  };

  const pickDocument = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (!res.canceled) {
      const asset = res.assets[0];
      setUri(asset.uri);
      setTitle(asset.name);
      setDocType(asset.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'file');
    }
  };

  const pickImage = async (useCamera = false) => {
    const permission = useCamera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const res = useCamera 
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 }) 
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });

    if (!res.canceled) {
      setUri(res.assets[0].uri);
      setTitle(`Foto_${new Date().getTime()}`);
      setDocType('image');
    }
  };

  const shiftDate = (months: number, years: number) => {
    const d = new Date(expireDate || new Date());
    if (months) d.setMonth(d.getMonth() + months);
    if (years) d.setFullYear(d.getFullYear() + years);
    setExpireDate(d.toISOString().split('T')[0]);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) {
      setExpireDate(selectedDate.toISOString().split('T')[0]);
    }
  };

  const openDocument = async (doc: AssetDocument) => {
    const isImage = doc.type === 'image' || ['png','jpg','jpeg','gif'].some(x => doc.uri.toLowerCase().endsWith(x));
    
    if (isImage) {
      setPreviewUri(doc.uri);
    } else {
      try {
        await Sharing.shareAsync(doc.uri, { UTI: 'public.item', mimeType: 'application/octet-stream' });
      } catch (err) {
        Alert.alert('Erro', 'Não foi possível encontrar um aplicativo para abrir este arquivo.');
      }
    }
  };

  const saveDoc = async () => {
    if (!title || !uri) return Alert.alert('Erro', 'Preencha título e anexe o arquivo.');
    setLoading(true);

    const finalAlert = showCustom ? (parseInt(customAlert) || 0) : alertDays;

    if (editingDoc) {
      const updated = {
        ...editingDoc,
        title, category, description: desc,
        expirationDate: expireDate || undefined,
        alertDaysBefore: expireDate ? finalAlert : undefined,
        version: editingDoc.version + 1,
        history: [...(editingDoc.history || []), { ...editingDoc }]
      };
      await AssetDocService.saveDocument(updated);
    } else {
      await AssetDocService.saveDocument({
        id: Math.random().toString(36).substring(7),
        assetId, title, category, version: 1, 
        description: desc, expirationDate: expireDate || undefined,
        alertDaysBefore: expireDate ? finalAlert : undefined,
        uri, type: docType, createdAt: new Date().toISOString()
      });
    }

    setModalVisible(false);
    resetForm();
    loadDocs();
  };

  const resetForm = () => {
    setEditingDoc(null); setTitle(''); setDesc(''); setExpireDate(''); setAlertDays(0); setCustomAlert(''); setShowCustom(false); setUri(''); setCategory('Geral'); setLoading(false);
  };

  const deleteDoc = (id: string) => {
    Alert.alert('Remover', 'Deseja excluir permanentemente?', [
      { text: 'Não' },
      { text: 'Sim', style: 'destructive', onPress: async () => { await AssetDocService.deleteDocument(id); loadDocs(); } }
    ]);
  };

  const filteredDocs = documents.filter(d => {
    const match = d.title.toLowerCase().includes(searchText.toLowerCase()) || d.description?.toLowerCase().includes(searchText.toLowerCase());
    if (filterType === 'PDF') return match && d.uri.toLowerCase().endsWith('.pdf');
    if (filterType === 'IMAGE') return match && (d.type === 'image' || ['png','jpg','jpeg'].some(x => d.uri.toLowerCase().endsWith(x)));
    return match;
  });

  return (
    <View style={S.container}>
      {/* Busca e Ação Sutil */}
      <View style={S.searchArea}>
         <View style={S.searchHeaderRow}>
            <View style={S.searchBox}>
              <Ionicons name="search" size={18} color={colors.textSecondary} />
              <TextInput placeholder="Pesquisar no acervo..." style={S.searchInput} value={searchText} onChangeText={setSearchText} />
            </View>
            <TouchableOpacity style={S.addBtnCircle} onPress={() => setModalVisible(true)}>
               <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
         </View>
         
         <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
            {['ALL','PDF','IMAGE'].map(t => (
              <TouchableOpacity key={t} style={[S.filterChip, filterType === t && S.filterChipActive]} onPress={() => setFilterType(t)}>
                <Text style={[S.filterChipText, filterType === t && S.filterChipActiveText]}>{t === 'ALL' ? 'Tudo' : t === 'PDF' ? 'PDFS' : 'Fotos'}</Text>
              </TouchableOpacity>
            ))}
         </ScrollView>
      </View>

      {/* Lista por Categorias */}
      {Array.from(new Set(filteredDocs.map(d => d.category || 'Geral'))).map(cat => (
        <View key={cat} style={S.categorySection}>
          <Text style={S.categoryTitle}>{cat.toUpperCase()}</Text>
          {filteredDocs.filter(d => (d.category || 'Geral') === cat).map(doc => (
            <TouchableOpacity key={doc.id} style={S.docCard} onPress={() => openDocument(doc)}>
              <View style={S.docIconBox}>
                <Ionicons name={doc.uri.toLowerCase().endsWith('.pdf') ? "document-text" : doc.type === 'image' ? "image" : "document"} size={22} color={colors.accent} />
                <View style={S.versionBadge}><Text style={S.vText}>v{doc.version}</Text></View>
              </View>
              <View style={{flex: 1}}>
                <Text style={S.docTitle}>{doc.title}</Text>
                <Text style={S.docDate}>{new Date(doc.createdAt).toLocaleDateString('pt-BR')}</Text>
              </View>
              <View style={{flexDirection: 'row'}}>
                <TouchableOpacity onPress={() => Sharing.shareAsync(doc.uri)} style={S.editBtn}>
                  <Ionicons name="share-outline" size={18} color={colors.accent} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setEditingDoc(doc); setTitle(doc.title); setDesc(doc.description || ''); setCategory(doc.category || 'Geral'); setUri(doc.uri); setExpireDate(doc.expirationDate || ''); setAlertDays(doc.alertDaysBefore || 0); setModalVisible(true); }} style={S.editBtn}>
                  <Ionicons name="pencil" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => deleteDoc(doc.id)} style={S.editBtn}>
                  <Ionicons name="trash" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ))}

      {/* MODAL PRINCIPAL - REDESENHO COMPLETO */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <TouchableOpacity onPress={() => { resetForm(); setModalVisible(false); }}><Text style={S.cancelText}>Cancelar</Text></TouchableOpacity>
              <Text style={S.headerTitle}>{editingDoc ? 'Editar Arquivo' : 'Novo Arquivo'}</Text>
              <TouchableOpacity onPress={saveDoc} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color={colors.accent} /> : <Text style={S.saveText}>{editingDoc ? 'Atualizar' : 'Salvar'}</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={S.formScroll}>
              
              {/* Seção de Arquivo */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>FONTE DO DOCUMENTO</Text>
                <View style={S.sourceGrid}>
                  <TouchableOpacity style={[S.sourceBtn, docType === 'file' && S.sourceBtnActive]} onPress={pickDocument}>
                    <Ionicons name="document-attach" size={24} color={docType === 'file' ? '#fff' : colors.accent} />
                    <Text style={[S.sourceText, docType === 'file' && S.sourceTextActive]}>Arquivo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.sourceBtn, docType === 'image' && S.sourceBtnActive]} onPress={() => pickImage(false)}>
                    <Ionicons name="images" size={24} color={docType === 'image' ? '#fff' : colors.accent} />
                    <Text style={[S.sourceText, docType === 'image' && S.sourceTextActive]}>Galeria</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.sourceBtn} onPress={() => pickImage(true)}>
                    <Ionicons name="camera" size={24} color={colors.accent} />
                    <Text style={S.sourceText}>Câmera</Text>
                  </TouchableOpacity>
                </View>
                {uri ? (
                  <View style={S.fileFeedback}>
                    <Ionicons name="checkmark-circle" size={16} color={colors.success.text} />
                    <Text style={S.fileFeedbackText} numberOfLines={1}>{uri.split('/').pop()}</Text>
                  </View>
                ) : null}
              </View>

              {/* Seção de Informações */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>IDENTIFICAÇÃO</Text>
                <TextInput style={S.input} placeholder="Título do arquivo" value={title} onChangeText={setTitle} />
                <TextInput style={[S.input, {height: 80, textAlignVertical: 'top'}]} placeholder="Prontuário / Notas (opcional)" multiline value={desc} onChangeText={setDesc} />
                <TextInput style={S.input} placeholder="Categoria (ex: Vistoria, Seguro...)" value={category} onChangeText={setCategory} />
              </View>

              {/* Seção Agenda - OUTLOOK STYLE COMPACTO */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>VENCIMENTO</Text>
                <TouchableOpacity style={S.dateRow} onPress={() => setShowPicker(true)}>
                  <Ionicons name="calendar" size={20} color={colors.accent} />
                  <Text style={S.dateInput}>{expireDate || 'Selecionar Data'}</Text>
                  <View style={S.shiftGrid}>
                    <TouchableOpacity onPress={() => shiftDate(6,0)} style={S.shiftBtn}><Text style={S.shiftText}>+6M</Text></TouchableOpacity>
                    <TouchableOpacity onPress={() => shiftDate(0,1)} style={S.shiftBtn}><Text style={S.shiftText}>+1A</Text></TouchableOpacity>
                  </View>
                </TouchableOpacity>

                {showPicker && (
                  <DateTimePicker
                    value={expireDate ? new Date(expireDate) : new Date()}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                  />
                )}

                <Text style={S.subLabel}>ALERTA DE SEGURANÇA</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 8}}>
                  {[1, 5, 15, 30].map(d => (
                    <TouchableOpacity key={d} style={[S.alertChip, !showCustom && alertDays === d && S.alertChipActive]} onPress={() => { setAlertDays(d); setShowCustom(false); }}>
                      <Text style={[S.alertChipText, !showCustom && alertDays === d && S.alertChipActiveText]}>{d}d antes</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[S.alertChip, showCustom && S.alertChipActive]} onPress={() => setShowCustom(true)}>
                    <Text style={[S.alertChipText, showCustom && S.alertChipActiveText]}>Custom...</Text>
                  </TouchableOpacity>
                </ScrollView>
                
                {showCustom && (
                   <View style={S.customBox}>
                     <Text style={S.customLabel}>DIAS ANTES:</Text>
                     <TextInput style={S.customInput} keyboardType="numeric" value={customAlert} onChangeText={setCustomAlert} placeholder="Ex: 45" />
                   </View>
                )}
              </View>

              <View style={{height: 100}} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Previews Automáticos */}
      <Modal visible={!!previewUri} transparent>
         <View style={S.pOverlay}>
            <TouchableOpacity style={S.pClose} onPress={() => setPreviewUri(null)}><Ionicons name="close" size={32} color="#fff" /></TouchableOpacity>
            <Image source={{uri: previewUri || ''}} style={S.pImg} resizeMode="contain" />
         </View>
      </Modal>

    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 12 },
  searchArea: { paddingHorizontal: 16, marginBottom: 15 },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  addBtnCircle: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 2 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 14, fontWeight: '600' },
  filterScroll: { paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  filterChipActiveText: { color: '#fff' },

  categorySection: { paddingHorizontal: 16, marginBottom: 20 },
  categoryTitle: { fontSize: 10, fontWeight: '900', color: colors.textSecondary, marginBottom: 10, letterSpacing: 1.5 },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  docIconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  versionBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: colors.accent, paddingHorizontal: 4, borderRadius: 5 },
  vText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  docTitle: { fontSize: 14, fontWeight: '700', color: colors.primary },
  docDate: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  editBtn: { padding: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: colors.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.primary },
  cancelText: { color: colors.textSecondary, fontWeight: '600' },
  saveText: { color: colors.accent, fontWeight: '800', fontSize: 16 },

  formScroll: { padding: 16 },
  formGroup: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: colors.border },
  groupLabel: { fontSize: 10, fontWeight: '900', color: colors.textSecondary, marginBottom: 12, letterSpacing: 1 },
  sourceGrid: { flexDirection: 'row', gap: 10 },
  sourceBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, backgroundColor: colors.background, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border },
  sourceBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sourceText: { fontSize: 10, fontWeight: '800', color: colors.textSecondary },
  sourceTextActive: { color: '#fff' },
  fileFeedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: colors.success.bg, padding: 8, borderRadius: 8 },
  fileFeedbackText: { fontSize: 11, color: colors.success.text, fontWeight: '700' },

  input: { backgroundColor: colors.background, borderRadius: 12, padding: 14, fontSize: 14, fontWeight: '600', color: colors.primary, marginBottom: 10 },
  
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: 12, padding: 10, gap: 10 },
  dateInput: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.accent },
  shiftGrid: { flexDirection: 'row', gap: 5 },
  shiftBtn: { backgroundColor: colors.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  shiftText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  subLabel: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, marginTop: 15, textTransform: 'uppercase' },

  alertChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: colors.background, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  alertChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  alertChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  alertChipActiveText: { color: '#fff' },
  customBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, padding: 10, backgroundColor: colors.background, borderRadius: 12 },
  customLabel: { fontSize: 10, fontWeight: '900', color: colors.textSecondary },
  customInput: { borderBottomWidth: 2, borderBottomColor: colors.accent, width: 50, textAlign: 'center', fontSize: 15, fontWeight: '800', color: colors.accent },

  pOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  pClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  pImg: { width: '100%', height: '80%' },
  
  pdfOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  pdfContent: { backgroundColor: '#fff', borderRadius: 24, padding: 30, alignItems: 'center' },
  pdfM: { fontSize: 10, fontWeight: '800', color: colors.textSecondary, letterSpacing: 1 },
  pdfH: { fontSize: 20, fontWeight: '900', color: colors.primary, marginVertical: 10 },
  pdfB: { backgroundColor: colors.primary, paddingHorizontal: 30, paddingVertical: 15, borderRadius: 15, marginVertical: 15 },
  pdfBT: { color: '#fff', fontWeight: '800' },
  pdfC: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 }
});
