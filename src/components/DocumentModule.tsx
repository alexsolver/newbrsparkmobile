import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Image, Modal, Alert, ActivityIndicator , KeyboardAvoidingView, Platform, DeviceEventEmitter} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import DatePickerButton from './DatePickerButton';
import { AssetDocument, AssetDocService } from '../services/assetDocs';
import { formatDate } from '../i18n/formatters';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { uploadFile, docRemotePath } from '../services/storageService';

import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export function DocumentModule({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createDocumentModuleStyles(C), [C]);
  const { user } = useAuth();
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
  const [category, setCategory] = useState('general');
  const [docType, setDocType] = useState<'pdf' | 'image' | 'file'>('file');
  const [editingDoc, setEditingDoc] = useState<AssetDocument | null>(null);
  const [showPicker, setShowPicker] = useState(false); // mantido por compatibilidade


  const [pdfPreviewUri, setPdfPreviewUri] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  // Folder states
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>(undefined);
  const [createFolderModal, setCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => { loadDocs(); }, [assetId]);

  const loadDocs = async () => {
    const docs = await AssetDocService.getDocuments(assetId, user?.email);
    setDocuments(docs);
    // Sincronização retroativa em background
    if (user?.email) syncDocsToCloud(docs, user.email);
  };

  /** Faz upload para R2 de todos os docs locais que ainda não foram enviados. */
  const syncDocsToCloud = async (docs: AssetDocument[], email: string) => {
    for (const doc of docs) {
      // Pula docs que já têm URL de cloud ou sem URI local
      if (!doc.uri || doc.uri.startsWith('http')) continue;
      const remotePath = docRemotePath(email, doc.id, doc.uri.split('/').pop() || 'file.bin');
      uploadFile(doc.uri, remotePath).then(async (res) => {
        if (res?.url || res?.provider === 'dropbox') {
          const cloudUri = res?.url || res?.path || doc.uri;
          await AssetDocService.saveDocument({ ...doc, uri: cloudUri }, email);
        }
      }).catch(() => {});
    }
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

  const onDateChange = (_: any, selectedDate?: Date) => {
    setShowPicker(false);
    if (selectedDate) setExpireDate(selectedDate.toISOString().split('T')[0]);
  };


  const openDocument = async (doc: AssetDocument) => {
    const isImage = doc.type === 'image' || ['png','jpg','jpeg','gif'].some(x => doc.uri.toLowerCase().endsWith(x));
    
    if (isImage) {
      setPreviewUri(doc.uri);
    } else {
      try {
        await Sharing.shareAsync(doc.uri, { UTI: 'public.item', mimeType: 'application/octet-stream' });
      } catch (err) {
        Alert.alert(t('common.error'), t('docs.cannotOpenFile'));
      }
    }
  };

  const saveDoc = async () => {
    if (!title || !uri) return Alert.alert(t('common.error'), t('docs.fillTitleFile'));
    setLoading(true);

    const finalAlert = showCustom ? (parseInt(customAlert) || 0) : alertDays;

    if (!user?.email) return Alert.alert('Erro', 'Usuário não autenticado.');

    if (editingDoc) {
      const updated = {
        ...editingDoc,
        title, category, description: desc,
        expirationDate: expireDate || undefined,
        alertDaysBefore: expireDate ? finalAlert : undefined,
        version: editingDoc.version + 1,
        history: [...(editingDoc.history || []), { ...editingDoc }]
      };
      await AssetDocService.saveDocument(updated, user.email);
    } else {
      const docId = Math.random().toString(36).substring(7);
      const newDoc: AssetDocument = {
        id: docId,
        assetId, title, category, version: 1,
        description: desc, expirationDate: expireDate || undefined,
        alertDaysBefore: expireDate ? finalAlert : undefined,
        uri, type: docType, createdAt: new Date().toISOString(),
        parentId: currentFolderId
      };
      await AssetDocService.saveDocument(newDoc, user.email);

      // Upload em background para o R2 (não bloqueia)
      const ext = uri.split('.').pop() || 'bin';
      const remotePath = docRemotePath(user.email, docId, uri.split('/').pop() || 'file.bin');
      uploadFile(uri, remotePath).then(async (res) => {
        if (res?.url || res?.provider === 'dropbox') {
          const cloudUri = res?.url || res?.path || uri;
          await AssetDocService.saveDocument({ ...newDoc, uri: cloudUri }, user.email);
        } else {
          Alert.alert('Diagnóstico Storage', `RES: ${JSON.stringify(res)}\nSe for nulo, a API recusou o arquivo.`);
        }
      }).catch((e) => {
        Alert.alert('Diagnóstico Storage', `Catch: ${e}`);
      });
    }

    setModalVisible(false);
    resetForm();
    loadDocs();
  };

  const resetForm = () => {
    setEditingDoc(null); setTitle(''); setDesc(''); setExpireDate(''); setAlertDays(0); setCustomAlert(''); setShowCustom(false); setUri(''); setCategory('general'); setLoading(false);
  };

  const deleteDoc = (id: string) => {
    Alert.alert(t('common.remove'), t('docs.deleteConfirm'), [
      { text: t('common.no') },
      { text: t('common.yes'), style: 'destructive', onPress: async () => { await AssetDocService.deleteDocument(id, user?.email || ''); loadDocs(); } }
    ]);
  };

  const filteredDocs = documents.filter(d => {
    const isSearch = searchText.length > 0;
    // Se não for pesquisa global, filtra quem está exatamente nesta pasta
    if (!isSearch && d.parentId !== currentFolderId) return false;

    return d.title.toLowerCase().includes(searchText.toLowerCase()) || (d.description?.toLowerCase().includes(searchText.toLowerCase()) ?? false);
  });

  const folderPath = useMemo(() => {
    if (!currentFolderId) return [];
    const path: AssetDocument[] = [];
    let curr = documents.find(d => d.id === currentFolderId);
    while (curr) {
      path.unshift(curr);
      curr = documents.find(d => d.id === curr!.parentId);
    }
    return path;
  }, [currentFolderId, documents]);

  const saveFolder = async () => {
    if (!newFolderName.trim() || !user?.email) return;
    const docId = Math.random().toString(36).substring(7);
    const newDoc: AssetDocument = {
      id: docId, assetId, title: newFolderName.trim(), category: 'general', version: 1,
      type: 'folder', uri: '', createdAt: new Date().toISOString(),
      parentId: currentFolderId
    };
    await AssetDocService.saveDocument(newDoc, user.email);
    setCreateFolderModal(false);
    setNewFolderName('');
    loadDocs();
  };

  return (
    <View style={S.container}>
      {/* Busca e Ação Sutil */}
      <View style={S.searchArea}>
         <View style={S.searchHeaderRow}>
            <View style={S.searchBox}>
              <Ionicons name="search" size={18} color={C.textSecondary} />
              <TextInput placeholder={t('docs.searchPlaceholder')} style={S.searchInput} value={searchText} onChangeText={setSearchText} returnKeyType="done"
                      />
            </View>
            <TouchableOpacity style={[S.stdAddBtn, {backgroundColor: '#F1F5F9'}]} onPress={() => setCreateFolderModal(true)}>
               <Ionicons name="folder-open" size={20} color={C.slate} />
            </TouchableOpacity>
         </View>
         
         {/* BREADCRUMBS */}
         {folderPath.length > 0 && (
           <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
             <TouchableOpacity onPress={() => setCurrentFolderId(undefined)} style={{ padding: 4 }}>
               <Ionicons name="home" size={16} color={C.textSecondary} />
             </TouchableOpacity>
             <Ionicons name="chevron-forward" size={14} color={C.border} style={{ marginHorizontal: 4 }} />
             {folderPath.map((f, i) => (
               <React.Fragment key={f.id}>
                 <TouchableOpacity onPress={() => setCurrentFolderId(f.id)} style={{ padding: 4 }}>
                   <Text style={{ fontSize: 13, fontWeight: i === folderPath.length - 1 ? '800' : '600', color: i === folderPath.length - 1 ? C.slate : C.textSecondary }}>{f.title}</Text>
                 </TouchableOpacity>
                 {i < folderPath.length - 1 && <Ionicons name="chevron-forward" size={14} color={C.border} style={{ marginHorizontal: 4 }} />}
               </React.Fragment>
             ))}
           </View>
         )}
      </View>

      {/* Lista de Arquivos e Pastas */}
      <View style={S.categorySection}>
        {filteredDocs.length === 0 && (
          <View style={{ alignItems: 'center', padding: 40 }}>
            <Ionicons name="folder-open-outline" size={48} color={C.border} />
            <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '700', color: C.textSecondary }}>Pasta vazia</Text>
          </View>
        )}
        
        {/* Renderiza PASTAS PRIMEIRO */}
        {filteredDocs.filter(d => d.type === 'folder').map(doc => (
          <TouchableOpacity key={doc.id} style={S.docCard} onPress={() => setCurrentFolderId(doc.id)}>
            <View style={S.docIconBox}>
              <Ionicons name="folder" size={22} color={C.primary} />
            </View>
            <View style={{flex: 1}}>
              <Text style={S.docTitle}>{doc.title}</Text>
              <Text style={S.docDate}>{documents.filter(d => d.parentId === doc.id).length} itens</Text>
            </View>
            <TouchableOpacity onPress={() => deleteDoc(doc.id)} style={S.editBtn}>
               <Ionicons name="trash" size={18} color="#EF4444" />
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        {/* Renderiza ARQUIVOS DEPOIS */}
        {filteredDocs.filter(d => d.type !== 'folder').map(doc => (
          <TouchableOpacity key={doc.id} style={S.docCard} onPress={() => openDocument(doc)}>
            <View style={S.docIconBox}>
              <Ionicons name={doc.uri?.toLowerCase().endsWith('.pdf') ? "document-text" : doc.type === 'image' ? "image" : "document"} size={22} color={C.accent} />
              <View style={S.versionBadge}><Text style={S.vText}>v{doc.version}</Text></View>
            </View>
            <View style={{flex: 1}}>
              <Text style={S.docTitle}>{doc.title}</Text>
              <Text style={S.docDate}>{formatDate(doc.createdAt)}</Text>
            </View>
            <View style={{flexDirection: 'row'}}>
              <TouchableOpacity onPress={() => Sharing.shareAsync(doc.uri)} style={S.editBtn}>
                <Ionicons name="share-outline" size={18} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setEditingDoc(doc); setTitle(doc.title); setDesc(doc.description || ''); setCategory(doc.category || 'general'); setUri(doc.uri); setExpireDate(doc.expirationDate || ''); setAlertDays(doc.alertDaysBefore || 0); setModalVisible(true); }} style={S.editBtn}>
                <Ionicons name="pencil" size={18} color={C.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteDoc(doc.id)} style={S.editBtn}>
                <Ionicons name="trash" size={18} color="#EF4444" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* MODAL CRIAR PASTA */}
      <Modal visible={createFolderModal} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 20 }}>
             <Text style={{ fontSize: 18, fontWeight: '800', color: C.slate, marginBottom: 16 }}>Nova Pasta</Text>
             <TextInput 
               style={S.input}
               placeholder="Nome da pasta"
               value={newFolderName}
               onChangeText={setNewFolderName}
               autoFocus
              returnKeyType="done"/>
             <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
               <TouchableOpacity onPress={() => setCreateFolderModal(false)} style={{ padding: 12 }}>
                 <Text style={{ color: C.textSecondary, fontWeight: '700' }}>Cancelar</Text>
               </TouchableOpacity>
               <TouchableOpacity onPress={saveFolder} style={{ backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 }}>
                 <Text style={{ color: '#fff', fontWeight: '800' }}>Criar</Text>
               </TouchableOpacity>
             </View>
          </View>
        </View>
      </Modal>

      {/* MODAL PRINCIPAL - REDESENHO COMPLETO */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <View style={S.modalHeader}>
              <TouchableOpacity onPress={() => { resetForm(); setModalVisible(false); }}><Text style={S.cancelText}>{t('common.cancel')}</Text></TouchableOpacity>
              <Text style={S.headerTitle}>{editingDoc ? t('docs.editFile') : t('docs.newFile')}</Text>
              <TouchableOpacity onPress={saveDoc} disabled={loading}>
                {loading ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={S.saveText}>{editingDoc ? t('docs.update') : t('common.save')}</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={S.formScroll} keyboardShouldPersistTaps="handled">
              
              {/* Seção de Arquivo */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>{t('docs.documentSource')}</Text>
                <View style={S.sourceGrid}>
                  <TouchableOpacity style={[S.sourceBtn, docType === 'file' && S.sourceBtnActive]} onPress={pickDocument}>
                    <Ionicons name="document-attach" size={24} color={docType === 'file' ? '#fff' : C.accent} />
                    <Text style={[S.sourceText, docType === 'file' && S.sourceTextActive]}>{t('costs.file')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[S.sourceBtn, docType === 'image' && S.sourceBtnActive]} onPress={() => pickImage(false)}>
                    <Ionicons name="images" size={24} color={docType === 'image' ? '#fff' : C.accent} />
                    <Text style={[S.sourceText, docType === 'image' && S.sourceTextActive]}>{t('costs.gallery')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.sourceBtn} onPress={() => pickImage(true)}>
                    <Ionicons name="camera" size={24} color={C.accent} />
                    <Text style={S.sourceText}>{t('costs.camera')}</Text>
                  </TouchableOpacity>
                </View>
                {uri ? (
                  <View style={S.fileFeedback}>
                    <Ionicons name="checkmark-circle" size={16} color={C.success.text} />
                    <Text style={S.fileFeedbackText} numberOfLines={1}>{uri.split('/').pop()}</Text>
                  </View>
                ) : null}
              </View>

              {/* Seção de Informações */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>{t('docs.identification')}</Text>
                <TextInput style={S.input} placeholder={t('docs.fileTitle')} value={title} onChangeText={setTitle} returnKeyType="done"
                      />
                <TextInput style={[S.input, {height: 80, textAlignVertical: 'top'}]} placeholder={t('docs.notesOptional')} multiline value={desc} onChangeText={setDesc}  returnKeyType="done"/>
                <TextInput style={S.input} placeholder={t('docs.categoryPlaceholder')} value={category} onChangeText={setCategory} returnKeyType="done"
                      />
              </View>

              {/* Seção Agenda - OUTLOOK STYLE COMPACTO */}
              <View style={S.formGroup}>
                <Text style={S.groupLabel}>{t('docs.expiry')}</Text>
                <DatePickerButton
                  label={t('docs.expiry')}
                  value={expireDate || undefined}
                  onChange={setExpireDate}
                  accentColor={C.accent}
                />

                <Text style={S.subLabel}>{t('docs.securityAlert')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginTop: 8}} keyboardShouldPersistTaps="handled">
                  {[1, 5, 15, 30].map(d => (
                    <TouchableOpacity key={d} style={[S.alertChip, !showCustom && alertDays === d && S.alertChipActive]} onPress={() => { setAlertDays(d); setShowCustom(false); }}>
                      <Text style={[S.alertChipText, !showCustom && alertDays === d && S.alertChipActiveText]}>{d}{t('docs.daysBefore')}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity style={[S.alertChip, showCustom && S.alertChipActive]} onPress={() => setShowCustom(true)}>
                    <Text style={[S.alertChipText, showCustom && S.alertChipActiveText]}>Custom...</Text>
                  </TouchableOpacity>
                </ScrollView>
                
                {showCustom && (
                   <View style={S.customBox}>
                     <Text style={S.customLabel}>{t('docs.daysBefore_label')}</Text>
                     <TextInput style={S.customInput} keyboardType="numeric" value={customAlert} onChangeText={setCustomAlert} placeholder={t('docs.daysExample')} returnKeyType="done"
                      />
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

function createDocumentModuleStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background, paddingTop: 12 },
  searchArea: { paddingHorizontal: 16, marginBottom: 15 },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border },
  stdAddBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  fab: { position: 'absolute', bottom: 30, right: 20, zIndex: 10, width: 60, height: 60, borderRadius: 30, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 11, fontWeight: '700' },
  filterScroll: { paddingVertical: 10, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.border },
  filterChipActive: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  filterChipText: { fontSize: 8, fontWeight: '900', color: C.textSecondary, letterSpacing: 0.8, textTransform: 'uppercase' },
  filterChipActiveText: { color: C.menuChipActiveFg },

  categorySection: { paddingHorizontal: 16, marginBottom: 20 },
  categoryTitle: { fontSize: 7, fontWeight: '900', color: C.textSecondary, marginBottom: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  docCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: C.border },
  docIconBox: { width: 44, height: 44, borderRadius: 10, backgroundColor: C.background, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  versionBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: C.accent, paddingHorizontal: 4, borderRadius: 5 },
  vText: { color: '#fff', fontSize: 8, fontWeight: '900' },
  docTitle: { fontSize: 11, fontWeight: '900', color: C.primary, letterSpacing: -0.2, textTransform: 'uppercase' },
  docDate: { fontSize: 7, color: C.textSecondary, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  editBtn: { padding: 8 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: C.background, borderTopLeftRadius: 30, borderTopRightRadius: 30, height: '92%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { fontSize: 11, fontWeight: '900', color: C.primary, letterSpacing: -0.2, textTransform: 'uppercase' },
  cancelText: { color: C.textSecondary, fontWeight: '700', fontSize: 10, textTransform: 'uppercase' },
  saveText: { color: C.accent, fontWeight: '900', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },

  formScroll: { padding: 16 },
  formGroup: { backgroundColor: '#fff', borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: C.border },
  groupLabel: { fontSize: 7, fontWeight: '900', color: C.textSecondary, marginBottom: 12, letterSpacing: 1.2, textTransform: 'uppercase' },
  sourceGrid: { flexDirection: 'row', gap: 10 },
  sourceBtn: { flex: 1, paddingVertical: 15, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border },
  sourceBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  sourceText: { fontSize: 7, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  sourceTextActive: { color: '#fff' },
  fileFeedback: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: C.success.background, padding: 8, borderRadius: 8 },
  fileFeedbackText: { fontSize: 9, color: C.success.text, fontWeight: '800' },

  input: { backgroundColor: C.background, borderRadius: 12, padding: 14, fontSize: 11, fontWeight: '800', color: C.primary, marginBottom: 10 },
  
  dateRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.background, borderRadius: 12, padding: 10, gap: 10 },
  dateInput: { flex: 1, fontSize: 11, fontWeight: '900', color: C.accent, textTransform: 'uppercase' },
  shiftGrid: { flexDirection: 'row', gap: 5 },
  shiftBtn: { backgroundColor: C.accent, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8 },
  shiftText: { color: '#fff', fontSize: 7, fontWeight: '900' },
  subLabel: { fontSize: 7, fontWeight: '900', color: C.textSecondary, marginTop: 15, textTransform: 'uppercase', letterSpacing: 0.8 },

  alertChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.background, marginRight: 8, borderWidth: 1, borderColor: C.border },
  alertChipActive: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  alertChipText: { fontSize: 7, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  alertChipActiveText: { color: C.menuChipActiveFg },
  customBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 15, padding: 10, backgroundColor: C.background, borderRadius: 12 },
  customLabel: { fontSize: 7, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  customInput: { borderBottomWidth: 2, borderBottomColor: C.accent, width: 40, textAlign: 'center', fontSize: 12, fontWeight: '900', color: C.accent },

  pOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  pClose: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
  pImg: { width: '100%', height: '80%' },
  
  pdfOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 },
  pdfContent: { backgroundColor: '#fff', borderRadius: 24, padding: 30, alignItems: 'center' },
  pdfM: { fontSize: 10, fontWeight: '800', color: C.textSecondary, letterSpacing: 1 },
  pdfH: { fontSize: 20, fontWeight: '900', color: C.primary, marginVertical: 10 },
  pdfB: { backgroundColor: C.primary, paddingHorizontal: 30, paddingVertical: 15, borderRadius: 15, marginVertical: 15 },
  pdfBT: { color: '#fff', fontWeight: '800' },
  pdfC: { color: C.textSecondary, fontWeight: '700', fontSize: 13 }
  });
}
