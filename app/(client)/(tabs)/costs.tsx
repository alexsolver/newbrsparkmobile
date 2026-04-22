import React, { useState, useCallback, useMemo } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Modal, TextInput, Alert, ActivityIndicator, FlatList,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, Image,
  RefreshControl
} from 'react-native';
import { DirectExpense, AssetBudget, CostSummary, RecurringCost } from '../../../src/types/costs';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ValueInput, parseLocaleAmountString } from '../../../src/components/ValueInput';
import { CostService } from '../../../src/services/costService';
import { getRootAssets } from '../../../src/database';
import { useAuth } from '../../../src/hooks/useAuth';
import { ColorPalette, MEDIA_TAG_COLORS, SERVICE_CATEGORY_COLORS } from '../../../src/theme/colors';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Asset } from '../../../src/types/asset';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { processReceiptImage } from '../../../src/services/ocrService';
import { useTranslation } from 'react-i18next';
import { useManualSync } from '../../../src/hooks/useManualSync';
import { formatCurrency, formatCurrencyShort, formatDate, formatDateShort, formatMonthYear } from '../../../src/i18n/formatters';
import DatePickerButton from '../../../src/components/DatePickerButton';


const EXPENSE_CATEGORIES = ['MANUTENÇÃO', 'CONTAS', 'TAXAS', 'LIMPEZA', 'LOGÍSTICA', 'OUTROS'];
const REVENUE_CATEGORIES = ['VENDA', 'SERVIÇO', 'LOCAÇÃO', 'OUTROS'];

export default function CostsScreen() {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createCostsStyles(C), [C]);
  const { user } = useAuth();
  const [summaries, setSummaries] = useState<CostSummary[]>([]);
  const [expenses, setExpenses] = useState<DirectExpense[]>([]);
  const [recurring, setRecurring] = useState<RecurringCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'EXPENSES' | 'RECURRING'>('DASHBOARD');
  const [selectedAsset, setSelectedAsset] = useState('ALL');
  const [currentMonth] = useState(new Date().toISOString().substring(0, 7));

  // Modal Expense/Revenue
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [newRecord, setNewRecord] = useState<Partial<DirectExpense>>({
    category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', type: 'EXPENSE'
  });

  // Modal Recurring
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [newRec, setNewRec] = useState<Partial<RecurringCost>>({
    frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0
  });

  // Modal Budget
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [selectedBudgetAsset, setSelectedBudgetAsset] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('');

  // Menu de Adição
  const [addMenuVisible, setAddMenuVisible] = useState(false);

  // OCR
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);

  const venues = getRootAssets(undefined, { includeMobileWarehouse: false });

  const loadData = async () => {
    setLoading(true);
    const email = user?.email || undefined;
    const [allExp, allRec, allAssets] = await Promise.all([
      CostService.getExpenses(email),
      CostService.getRecurringCosts(email),
      getRootAssets(email, { includeMobileWarehouse: false })
    ]);
    
    const summs = await Promise.all(allAssets.map(a => 
      CostService.getAssetCostSummary(a.id, currentMonth, email)
    ));

    setExpenses(allExp.sort((a,b) => b.date.localeCompare(a.date)));
    setRecurring(allRec);
    setSummaries(summs);
    setLoading(false);
  };

  const { refreshing, onRefresh } = useManualSync(loadData);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleSaveRecord = async () => {
    if (!newRecord.amount || !newRecord.assetId || !newRecord.description) {
      return Alert.alert(t('common.attention'), t('common.fillRequired'));
    }
    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));

    await CostService.saveExpense({
      ...newRecord as DirectExpense,
      id: Math.random().toString(36).substring(7),
    }, user.email);
    setRecordModalVisible(false);
    setReceiptImage(null);
    loadData();
    Alert.alert(t('common.success'), t('assetDetail.financialSaved'));
  };

  const handlePickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('common.error'), t('newAsset.cameraPermError'));
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!result.canceled) processOcr(result.assets[0].uri);
  };

  const handlePickGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!result.canceled) processOcr(result.assets[0].uri);
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'] });
    if (!result.canceled && result.assets?.[0]) processOcr(result.assets[0].uri);
  };

  const processOcr = async (uri: string) => {
    setReceiptImage(uri);
    setOcrProcessing(true);
    try {
      const data = await processReceiptImage(uri);
      setNewRecord(prev => ({
        ...prev,
        description: data.description,
        amount: data.amount,
        date: data.date,
        category: data.category,
      }));
      Alert.alert(
        '✅ ' + t('common.success'),
        `${data.description}\n${formatCurrency(data.amount)}\n${data.category}\n${(data.confidence * 100).toFixed(0)}%`
      );
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || '');
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleSaveRecurring = async () => {
    if (!newRec.amount || !newRec.assetId || !newRec.description || !newRec.nextDueDate) {
      return Alert.alert(t('common.attention'), t('common.fillRequired'));
    }
    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));
    await CostService.saveRecurringCost({
      ...newRec as RecurringCost,
      id: Math.random().toString(36).substring(7),
    }, user.email);
    setRecurringModalVisible(false);
    loadData();
    Alert.alert(t('common.success'), t('assetDetail.recurringScheduled'));
  };

  const handleSaveBudget = async () => {
    if (!selectedBudgetAsset || !budgetLimit) return;
    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));
    await CostService.saveBudget({
      id: Math.random().toString(36).substring(7),
      assetId: selectedBudgetAsset,
      monthlyLimit: parseLocaleAmountString(budgetLimit) || 0,
      category: 'GERAL'
    }, user.email);
    setBudgetModalVisible(false);
    loadData();
  };

  const handleMarkPaid = async (id: string) => {
    Alert.alert(
      t('costs.confirmPayment'),
      t('costs.confirmPaymentMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('common.confirm'), 
          onPress: async () => {
            if (user?.email) {
              await CostService.markRecurringAsPaid(id, user.email);
              loadData();
            }
          }
        }
      ]
    );
  };


  const totalExp = summaries.reduce((acc, s) => acc + s.totalExpenses, 0);
  const totalRev = summaries.reduce((acc, s) => acc + s.totalRevenues, 0);
  const totalBudget = summaries.reduce((acc, s) => acc + s.totalBudget, 0);
  const balance = totalRev - totalExp;
  const budgetProgress = totalBudget > 0 ? (totalExp / totalBudget) * 100 : 0;

  const filteredExpenses = expenses.filter(e => selectedAsset === 'ALL' || e.assetId === selectedAsset);
  
  const upcomingBills = recurring.filter(r => {
    const today = new Date().toISOString().split('T')[0];
    return r.status === 'ACTIVE' && r.nextDueDate >= today;
  }).sort((a,b) => a.nextDueDate.localeCompare(b.nextDueDate));

  return (
    <View style={S.container}>
      <View style={S.pHeader}>
        <View style={S.headerRow}>
          <View><Text style={S.pTitle}>{t('costs.title')}</Text><Text style={S.pSub}>{formatMonthYear(new Date()).toUpperCase()}</Text></View>
          <TouchableOpacity style={S.addBtn} onPress={() => setAddMenuVisible(true)}>
             <Ionicons name="add" size={28} color={C.cardWhite} />
          </TouchableOpacity>
        </View>


        <View style={S.cardMain}>
          <View style={S.cardRow}>
             <View><Text style={S.cardL}>{t('costs.monthlyBalance')}</Text><Text style={[S.cardV, balance < 0 && {color: C.warning.text}]}>{formatCurrency(balance)}</Text></View>
             <View style={{alignItems:'flex-end'}}><Text style={S.cardL}>{t('costs.totalRevenue')}</Text><Text style={S.cardBudget}>{formatCurrency(totalRev)}</Text></View>
          </View>
          <View style={S.progressC}><View style={[S.progressB, { width: `${Math.min(budgetProgress, 100)}%`, backgroundColor: budgetProgress > 90 ? C.warning.text : C.accent } as any]} /></View>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={S.progressT}>{t('asset.expenses')}: {formatCurrency(totalExp)}</Text><Text style={S.progressT}>{t('costs.budget')}: {budgetProgress.toFixed(0)}%</Text></View>
        </View>

      </View>

      <View style={S.tabBar}>
         <TouchableOpacity style={[S.tab, activeTab === 'DASHBOARD' && S.tabA]} onPress={() => setActiveTab('DASHBOARD')}><Text style={[S.tabT, activeTab === 'DASHBOARD' && S.tabTA]}>DASHBOARD</Text></TouchableOpacity>
         <TouchableOpacity style={[S.tab, activeTab === 'EXPENSES' && S.tabA]} onPress={() => setActiveTab('EXPENSES')}><Text style={[S.tabT, activeTab === 'EXPENSES' && S.tabTA]}>{t('costs.statement')}</Text></TouchableOpacity>
         <TouchableOpacity style={[S.tab, activeTab === 'RECURRING' && S.tabA]} onPress={() => setActiveTab('RECURRING')}><Text style={[S.tabT, activeTab === 'RECURRING' && S.tabTA]}>{t('costs.fixedBills')}</Text></TouchableOpacity>
      </View>

      <View style={S.locBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={[S.filterChip, selectedAsset === 'ALL' && S.filterChipA]} onPress={() => setSelectedAsset('ALL')}><Text style={[S.filterChipT, selectedAsset === 'ALL' && S.filterChipTA]}>{t('common.all').toUpperCase()}</Text></TouchableOpacity>
            {venues.map(v => (<TouchableOpacity key={v.id} style={[S.filterChip, selectedAsset === v.id && S.filterChipA]} onPress={() => setSelectedAsset(v.id)}><Text style={[S.filterChipT, selectedAsset === v.id && S.filterChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
        </ScrollView>
      </View>

      {activeTab === 'DASHBOARD' ? (
        <ScrollView 
          style={S.content} 
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {upcomingBills.length > 0 && (
            <View style={S.alertBox}>
              <View style={S.alertH}><Ionicons name="notifications" size={16} color={C.status.warning.fg} /><Text style={S.alertHT}>{t('costs.upcomingBills').toUpperCase()}</Text></View>
              {upcomingBills.slice(0,3).map(b => (
                <TouchableOpacity key={b.id} style={S.alertItem} onPress={() => handleMarkPaid(b.id)}>
                   <Text style={S.alertDesc}>{b.description}</Text>
                   <View style={{alignItems:'flex-end'}}>
                       <Text style={S.alertVal}>{formatCurrency(b.amount)}</Text>
                       <Text style={S.alertDate}>{t('costs.dueDate')} {formatDateShort(b.nextDueDate)}</Text>
                   </View>
                   <Ionicons name="checkmark-circle-outline" size={20} color={C.status.warning.fg} style={{marginLeft: 10}} />
                </TouchableOpacity>
              ))}

            </View>
          )}

          <Text style={S.secTitle}>{t('costs.performanceByAsset').toUpperCase()}</Text>
          {summaries.filter(s => selectedAsset === 'ALL' || s.assetId === selectedAsset).map(s => {
            const venue = venues.find(v => v.id === s.assetId);
            const net = s.totalRevenues - s.totalExpenses;
            const p = s.totalBudget > 0 ? (s.totalExpenses / s.totalBudget) * 100 : 0;
            return (
              <TouchableOpacity key={s.assetId} style={S.assetCard} onPress={() => { setSelectedBudgetAsset(s.assetId); setBudgetLimit(String(s.totalBudget)); setBudgetModalVisible(true); }}>
                <View style={S.assetInfo}>
                  <Text style={S.assetName}>{venue?.title}</Text>
                  <View style={S.costRow}><Text style={[S.costItem, { color: C.success.text }]}>{formatCurrencyShort(s.totalRevenues)}</Text><Text style={S.costDivider}>•</Text><Text style={[S.costItem, { color: C.destructive }]}>{formatCurrencyShort(s.totalExpenses)}</Text></View>
                  <View style={S.minProgress}><View style={[S.minBar, { width: `${Math.min(p, 100)}%`, backgroundColor: p > 100 ? C.warning.text : C.accent } as any]} /></View>
                </View>
                <View style={S.assetVal}><Text style={[S.assetTotal, net < 0 && {color: C.warning.text}]}>{formatCurrencyShort(net)}</Text><Text style={S.assetPerc}>{p.toFixed(0)}% {t('costs.budget').toLowerCase()}</Text></View>
              </TouchableOpacity>

            )
          })}
        </ScrollView>
      ) : activeTab === 'EXPENSES' ? (
        <FlatList
          data={filteredExpenses}
          keyExtractor={e => e.id}
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <View style={S.expenseItem}>
              <View style={[S.expIcon, { backgroundColor: item.type === 'REVENUE' ? C.status.success.bg : item.category === 'MANUTENÇÃO' ? C.status.danger.bg : C.surfaceLow }]}><Ionicons name={item.type === 'REVENUE' ? 'trending-up' : item.category === 'MANUTENÇÃO' ? 'build' : 'receipt'} size={20} color={item.type === 'REVENUE' ? C.success.text : item.category === 'MANUTENÇÃO' ? C.destructive : C.primary} /></View>
              <View style={{flex:1}}>
                <Text style={S.expTitle}>{item.description}</Text>
                <Text style={S.expMeta}>{venues.find(v=>v.id===item.assetId)?.title} • {item.category}</Text>
              </View>
              <Text style={[S.expAmount, { color: item.type === 'REVENUE' ? C.success.text : C.primary }]}>{(item.type === 'REVENUE' ? '+ ' : '- ')}{formatCurrency(item.amount)}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={recurring.filter(r => selectedAsset === 'ALL' || r.assetId === selectedAsset)}
          keyExtractor={r => r.id}
          contentContainerStyle={S.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item: r }) => (
            <View style={S.expenseItem}>
               <View style={[S.expIcon, { backgroundColor: `${SERVICE_CATEGORY_COLORS.Reformas}22` }]}><Ionicons name="refresh" size={20} color={SERVICE_CATEGORY_COLORS.Tecnologia} /></View>
               <View style={{flex:1}}>
                  <Text style={S.expTitle}>{r.description}</Text>
                  <Text style={S.expMeta}>{venues.find(v=>v.id===r.assetId)?.title} • {r.frequency}</Text>
               </View>
               <View style={{flexDirection:'row', alignItems:'center', gap: 12}}>
                  <View style={{alignItems:'flex-end'}}>
                     <Text style={S.expAmount}>{formatCurrency(r.amount)}</Text>
                     <Text style={S.alertDate}>{t('costs.dueDate')}: {formatDate(r.nextDueDate)}</Text>
                     {r.totalInstallments ? (
                       <Text style={[S.alertDate, {color: C.textSecondary}]}>{t('costs.installment') || 'Parcela'}: {(r.totalInstallments - (r.remainingInstallments || 0)) + 1} de {r.totalInstallments}</Text>
                     ) : (
                       <Text style={[S.alertDate, {color: C.textSecondary}]}>{t('costs.installment') || 'Parcela'}: Contínuo (∞)</Text>
                     )}
                  </View>

                  <TouchableOpacity onPress={() => handleMarkPaid(r.id)} style={{ backgroundColor: C.success.text, padding: 8, borderRadius: 8 }}>
                     <Ionicons name="card-outline" size={20} color={C.cardWhite} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert(t('common.delete') + '?', t('costs.removeRecurringBill'), [
                     { text: t('common.cancel'), style: 'cancel' },
                       { text: t('common.delete'), style: 'destructive', onPress: async () => { 
                        if (user?.email) {
                          await CostService.deleteRecurringCost(r.id, user.email); 
                          loadData(); 
                        }
                      }}
                    ]);
                  }} style={{ backgroundColor: C.status.danger.bg, padding: 8, borderRadius: 8 }}>
                     <Ionicons name="trash-outline" size={20} color={C.destructive} />
                  </TouchableOpacity>
               </View>
            </View>
          )}

        />
      )}

      {/* MENU DE AÇÕES (+) */}
      <Modal visible={addMenuVisible} transparent animationType="fade">
         <TouchableWithoutFeedback onPress={() => setAddMenuVisible(false)}>
            <View style={S.menuOverlay}>
               <View style={S.menuContent}>
                  <Text style={S.menuTitle}>O QUE DESEJA LANÇAR?</Text>
                  
                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setReceiptImage(null); setNewRecord({ category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', description: '', type: 'EXPENSE' }); setRecordModalVisible(true); }}>
                     <View style={[S.menuIcon, { backgroundColor: C.status.success.bg }]}><Ionicons name="receipt-outline" size={24} color={C.success.text} /></View>
                     <View><Text style={S.menuItemT}>Registro Único</Text><Text style={S.menuItemS}>Despesa ou Receita pontual</Text></View>
                  </TouchableOpacity>

                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setNewRec({ frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0, description: '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1 }); setRecurringModalVisible(true); }}>
                     <View style={[S.menuIcon, { backgroundColor: C.status.info.bg }]}><Ionicons name="calendar-outline" size={24} color={SERVICE_CATEGORY_COLORS.Tecnologia} /></View>
                     <View><Text style={S.menuItemT}>Conta Recorrente</Text><Text style={S.menuItemS}>Fixos, Aluguéis, Assinaturas</Text></View>
                  </TouchableOpacity>

                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setBudgetModalVisible(true); }}>
                     <View style={[S.menuIcon, { backgroundColor: C.status.warning.bg }]}><Ionicons name="pie-chart-outline" size={24} color={MEDIA_TAG_COLORS.DURING} /></View>
                     <View><Text style={S.menuItemT}>Definir Budget</Text><Text style={S.menuItemS}>Teto mensal por ativo</Text></View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={S.menuClose} onPress={() => setAddMenuVisible(false)}>
                     <Text style={S.menuCloseT}>CANCELAR</Text>
                  </TouchableOpacity>
               </View>
            </View>
         </TouchableWithoutFeedback>
      </Modal>


      <Modal visible={recordModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
              <View style={S.modalH}><Text style={S.modalT}>{t('assetDetail.newFinancialRecord')}</Text><TouchableOpacity onPress={() => setRecordModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
                <View style={S.typeToggle}>
                   <TouchableOpacity style={[S.typeBtn, newRecord.type === 'EXPENSE' && { backgroundColor: C.destructive }]} onPress={()=>setNewRecord({...newRecord, type:'EXPENSE'})}><Text style={[S.typeBtnT, newRecord.type === 'EXPENSE' && { color: C.cardWhite }]}>{t('assetDetail.expense')}</Text></TouchableOpacity>
                   <TouchableOpacity style={[S.typeBtn, newRecord.type === 'REVENUE' && { backgroundColor: C.success.text }]} onPress={()=>setNewRecord({...newRecord, type:'REVENUE'})}><Text style={[S.typeBtnT, newRecord.type === 'REVENUE' && { color: C.cardWhite }]}>{t('assetDetail.revenue')}</Text></TouchableOpacity>
                </View>

                {/* Fonte do Comprovante - Estilo DocumentModule */}
                <View style={{ backgroundColor: C.cardWhite, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: C.border }}>
                  <Text style={{ fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 10, letterSpacing: 1 }}>{t('costs.receiptSource')}</Text>
                  {ocrProcessing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 10 }}>
                      <ActivityIndicator size="small" color={C.accent} />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: C.accent }}>{t('costs.processingOcr')}</Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <TouchableOpacity style={{ flex: 1, paddingVertical: 15, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border }} onPress={handlePickFile}>
                        <Ionicons name="document-attach" size={24} color={C.accent} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: C.textLight }}>{t('costs.file')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, paddingVertical: 15, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border }} onPress={handlePickGallery}>
                        <Ionicons name="images" size={24} color={C.accent} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: C.textLight }}>{t('costs.gallery')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flex: 1, paddingVertical: 15, borderRadius: 12, backgroundColor: C.background, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.border }} onPress={handlePickCamera}>
                        <Ionicons name="camera" size={24} color={C.accent} />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: C.textLight }}>{t('costs.camera')}</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {receiptImage && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: C.status.success.bg, padding: 8, borderRadius: 8 }}>
                      <Ionicons name="checkmark-circle" size={16} color={C.status.success.fg} />
                      <Text style={{ fontSize: 11, color: C.status.success.fg, fontWeight: '700', flex: 1 }} numberOfLines={1}>{t('costs.receiptAttached')}</Text>
                      <Image source={{ uri: receiptImage }} style={{ width: 40, height: 40, borderRadius: 6 }} resizeMode="cover" />
                    </View>
                  )}
                </View>

                <View style={S.inputG}><Text style={S.inputL}>{t('assetDetail.description')}</Text><TextInput style={S.input} value={newRecord.description} onChangeText={t=>setNewRecord({...newRecord, description:t})} placeholder={t('assetDetail.descriptionPlaceholder')} returnKeyType="done"
                      /></View>
                <View style={S.inputG}><Text style={S.inputL}>{t('costs.linkedAsset')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newRecord.assetId === v.id && S.pChipA]} onPress={()=>setNewRecord({...newRecord, assetId:v.id})}><Text style={[S.pChipT, newRecord.assetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
                <View style={S.inputG}><Text style={S.inputL}>{t('assetDetail.category')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{(newRecord.type === 'EXPENSE' ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES).map(c => (<TouchableOpacity key={c} style={[S.pChip, newRecord.category === c && S.pChipA]} onPress={()=>setNewRecord({...newRecord, category:c})}><Text style={[S.pChipT, newRecord.category === c && S.pChipTA]}>{c}</Text></TouchableOpacity>))}</ScrollView></View>
                <View style={S.inputG}>
                  <DatePickerButton
                    label={t('assetDetail.date')}
                    value={newRecord.date}
                    onChange={(d) => setNewRecord({ ...newRecord, date: d })}
                    accentColor={newRecord.type === 'REVENUE' ? C.success.text : C.destructive}
                  />
                </View>
                <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>{t('assetDetail.valueAmount')}</Text><ValueInput style={S.input} value={String(newRecord.amount || "")} onChangeText={v => setNewRecord({...newRecord, amount: parseLocaleAmountString(v)})} placeholder="0,00" currency /></View>
                <TouchableOpacity style={[S.confirmBtn, { backgroundColor: newRecord.type === 'REVENUE' ? C.success.text : C.accent }]} onPress={handleSaveRecord}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.saveRecord')}</Text></TouchableOpacity>

              </ScrollView>
        </View></View></TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={recurringModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
            <View style={S.modalH}><Text style={S.modalT}>{t('assetDetail.scheduleRecurring')}</Text><TouchableOpacity onPress={() => setRecurringModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
               <View style={S.typeToggle}>
                  <TouchableOpacity style={[S.typeBtn, newRec.type === 'EXPENSE' && { backgroundColor: C.destructive }]} onPress={()=>setNewRec({...newRec, type:'EXPENSE'})}><Text style={[S.typeBtnT, newRec.type === 'EXPENSE' && { color: C.cardWhite }]}>{t('assetDetail.expense')}</Text></TouchableOpacity>
                  <TouchableOpacity style={[S.typeBtn, newRec.type === 'REVENUE' && { backgroundColor: C.success.text }]} onPress={()=>setNewRec({...newRec, type:'REVENUE'})}><Text style={[S.typeBtnT, newRec.type === 'REVENUE' && { color: C.cardWhite }]}>{t('assetDetail.revenue')}</Text></TouchableOpacity>
               </View>

               <View style={S.inputG}><Text style={S.inputL}>{t('assetDetail.billDescription')}</Text><TextInput style={S.input} value={newRec.description} onChangeText={t=>setNewRec({...newRec, description:t})} placeholder={t('assetDetail.billPlaceholder')} returnKeyType="done"
                      /></View>

               <View style={S.inputG}><Text style={S.inputL}>{t('costs.linkedAsset')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newRec.assetId === v.id && S.pChipA]} onPress={()=>setNewRec({...newRec, assetId:v.id})}><Text style={[S.pChipT, newRec.assetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
               <View style={S.inputG}>
                  <DatePickerButton
                    label={t('assetDetail.dueDay')}
                    value={newRec.nextDueDate}
                    onChange={(d) => setNewRec({ ...newRec, nextDueDate: d })}
                  />
               </View>
               <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>{t('assetDetail.valueAmount')}</Text><ValueInput style={S.input} value={String(newRec.amount || "")} onChangeText={v => setNewRec({...newRec, amount: parseLocaleAmountString(v)})} currency /></View>
               <View style={S.inputG}><Text style={S.inputL}>{t('assetDetail.frequency')}</Text><View style={{flexDirection:'row', gap:10}}>{['WEEKLY','MONTHLY','YEARLY'].map(f => (<TouchableOpacity key={f} style={[S.pChip, newRec.frequency === f && S.pChipA]} onPress={()=>setNewRec({...newRec, frequency:f as any})}><Text style={[S.pChipT, newRec.frequency === f && S.pChipTA]}>{f}</Text></TouchableOpacity>))}</View></View>
               
                <View style={S.inputG}>
                   <Text style={S.inputL}>{t('assetDetail.alertDue')}</Text>
                   <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                     {[
                       { l: t('assetDetail.noAlert'), v: undefined },
                       { l: t('assetDetail.onDay'), v: 0 },
                       { l: t('assetDetail.daysBefore', { count: 1 }), v: 1 },
                       { l: t('assetDetail.daysBefore', { count: 3 }), v: 3 },
                       { l: t('assetDetail.daysBefore', { count: 5 }), v: 5 },
                       { l: t('assetDetail.daysBefore', { count: 10 }), v: 10 }
                     ].map(opt => (
                       <TouchableOpacity key={String(opt.v)} style={[S.pChip, newRec.alertDaysBefore === opt.v && S.pChipA]} onPress={()=>setNewRec({...newRec, alertDaysBefore: opt.v})}>
                         <Text style={[S.pChipT, newRec.alertDaysBefore === opt.v && S.pChipTA]}>{opt.l}</Text>
                       </TouchableOpacity>
                     ))}
                   </ScrollView>
                </View>

                <View style={S.inputG}>
                   <Text style={S.inputL}>{t('assetDetail.installments')}</Text>
                   <TextInput 
                    style={S.input} 
                    keyboardType="numeric" 
                    value={newRec.totalInstallments ? String(newRec.totalInstallments) : ''} 
                    onChangeText={t => {
                      const val = parseInt(t) || undefined;
                      setNewRec({...newRec, totalInstallments: val, remainingInstallments: val});
                    }} 
                    placeholder={t('assetDetail.installmentsPlaceholder')} 
                   returnKeyType="done"
                      />
                </View>
               <TouchableOpacity style={[S.confirmBtn, { backgroundColor: newRec.type === 'REVENUE' ? C.success.text : C.accent }]} onPress={handleSaveRecurring}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.schedule')} {newRec.type === 'REVENUE' ? t('assetDetail.revenue') : t('assetDetail.payment')}</Text></TouchableOpacity>


            </ScrollView>
        </View></View></TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DEFINIR BUDGET */}
      <Modal visible={budgetModalVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}>
          <View style={{ backgroundColor: C.cardWhite, borderRadius: 24, padding: 24 }}>
            <View style={S.modalH}><Text style={S.modalT}>{t('assetDetail.monthlyBudget')}</Text><TouchableOpacity onPress={() => setBudgetModalVisible(false)}><Ionicons name="close" size={24} color={C.primary} /></TouchableOpacity></View>
            <Text style={S.assetName}>{venues.find(v=>v.id===selectedBudgetAsset)?.title}</Text>
            <View style={[S.inputG, {marginTop:15}]}><Text style={S.inputL}>{t('assetDetail.spendingLimit')}</Text><ValueInput style={S.input} value={budgetLimit} onChangeText={setBudgetLimit} placeholder="5000" currency /></View>
            <TouchableOpacity style={S.confirmBtn} onPress={handleSaveBudget}><Text style={S.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.defineBudget')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function createCostsStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  pHeader: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 25, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  pTitle: { color: C.primary, fontSize: 24, fontWeight: '900', letterSpacing: -0.6 },
  pSub: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, textTransform: 'uppercase' },
  addBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center' },

  cardMain: { backgroundColor: C.cardWhite, padding: 20, borderRadius: 24, borderWidth: 1, borderColor: C.border, shadowColor: C.slate, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  cardL: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 },
  cardV: { fontSize: 24, fontWeight: '900', color: C.primary, marginTop: 4, letterSpacing: -0.4 },
  cardBudget: { fontSize: 16, fontWeight: '900', color: C.accent, marginTop: 4 },
  progressC: { height: 10, backgroundColor: C.divider, borderRadius: 5, marginVertical: 12, overflow:'hidden' },
  progressB: { height: '100%', borderRadius: 5 },
  progressT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },

  tabBar: { flexDirection: 'row', gap: 20, paddingHorizontal: 25, marginTop: 25 },
  tab: { paddingBottom: 8 },
  tabA: { borderBottomWidth: 3, borderBottomColor: C.accent },
  tabT: { fontSize: 11, fontWeight: '900', color: C.textLight, letterSpacing: 0.5 },
  tabTA: { color: C.accent },

  locBar: { marginTop: 15 },
  filterScroll: { paddingHorizontal: 20, paddingBottom: 15 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, marginRight: 8 },
  filterChipA: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  filterChipT: { fontSize: 11, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase' },
  filterChipTA: { color: C.menuChipActiveFg },

  content: { padding: 20 },
  secTitle: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, marginBottom: 15, textTransform: 'uppercase' },
  assetCard: { flexDirection: 'row', backgroundColor: C.cardWhite, padding: 18, borderRadius: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  costItem: { fontSize: 9, fontWeight: '900' },
  costDivider: { color: C.border },
  minProgress: { height: 3, backgroundColor: C.divider, borderRadius: 2, marginTop: 10, width: '80%' },
  minBar: { height: '100%', borderRadius: 2 },
  assetVal: { alignItems: 'flex-end', marginRight: 15 },
  assetTotal: { fontSize: 14, fontWeight: '900', color: C.primary },
  assetPerc: { fontSize: 8, fontWeight: '900', color: C.textLight, marginTop: 2, textTransform: 'uppercase' },
  expenseItem: { flexDirection: 'row', backgroundColor: C.cardWhite, padding: 16, borderRadius: 16, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: C.border },
  expIcon: { width: 44, height: 44, borderRadius: 12, justifyContent:'center', alignItems:'center', marginRight: 15 },
  expTitle: { fontSize: 12, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  expMeta: { fontSize: 9, color: C.textSecondary, marginTop: 2, fontWeight: '700', textTransform: 'uppercase' },
  expAmount: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.3 },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: C.cardWhite, borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalT: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, textTransform: 'uppercase' },
  inputG: { marginBottom: 20 },
  inputL: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 8, textTransform: 'uppercase' },
  input: { backgroundColor: C.surfaceLow, padding: 14, borderRadius: 12, fontSize: 13, fontWeight: '700', borderWidth: 1, borderColor: C.border },
  pChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: C.divider, marginRight: 8, borderWidth: 1, borderColor: C.border },
  pChipA: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  pChipT: { fontSize: 10, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  pChipTA: { color: C.menuChipActiveFg },
  confirmBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmText: { color: C.cardWhite, fontWeight: '900', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },

  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  typeBtnT: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase' },
  alertBox: { backgroundColor: C.status.warning.bg, padding: 16, borderRadius: 20, marginBottom: 25, borderWidth: 1, borderColor: C.status.warning.border },
  alertH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  alertHT: { fontSize: 9, fontWeight: '900', color: C.status.warning.fg, letterSpacing: 1.2, textTransform: 'uppercase' },
  alertItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  alertDesc: { fontSize: 11, fontWeight: '800', color: C.primary, flex: 1 },
  alertDate: { fontSize: 9, fontWeight: '800', color: C.status.warning.fg, marginRight: 15, textTransform: 'uppercase' },
  alertVal: { fontSize: 11, fontWeight: '900', color: C.primary },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContent: { backgroundColor: C.cardWhite, borderRadius: 32, padding: 24, width: '100%', shadowColor: C.slate, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  menuTitle: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.5, textAlign: 'center', marginBottom: 25, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: C.divider, gap: 16 },
  menuIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  menuItemT: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  menuItemS: { fontSize: 10, color: C.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  menuClose: { marginTop: 20, alignItems: 'center', padding: 10 },
  menuCloseT: { fontSize: 11, fontWeight: '900', color: C.destructive, letterSpacing: 1, textTransform: 'uppercase' },
});
}

