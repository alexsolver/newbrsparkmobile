import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView, Alert, TextInput, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { useTranslation } from 'react-i18next';
import { enqueueMutation } from '../../src/services/syncService';
import { getRootAssets, getLocalAssets } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';
import { ValueInput } from '../../src/components/ValueInput';
import DatePickerButton from '../../src/components/DatePickerButton';

const SCREEN_W = Dimensions.get('window').width;

const expenseCategories = ['MANUTENÇÃO', 'IMPOSTOS', 'SEGURO', 'COMBUSTÍVEL', 'OUTROS'];
const revenueCategories = ['VENDA', 'ALUGUEL', 'SERVIÇO', 'RENDIMENTO', 'OUTROS'];

export default function NewCostScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [transactionType, setTransactionType] = useState<null | 'single' | 'recurring' | 'budget'>(null);
  
  // States for Single Record
  const [newRecord, setNewRecord] = useState<{ category: string, amount: number, date: string, status: 'PAID'|'PENDING', description: string, type: 'REVENUE'|'EXPENSE' }>({ category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', description: '', type: 'EXPENSE' });

  // States for Recurring
  const [newRec, setNewRec] = useState<{ frequency: 'WEEKLY'|'MONTHLY'|'YEARLY', status: 'ACTIVE'|'PAUSED', type: 'REVENUE'|'EXPENSE', amount: number, description: string, nextDueDate: string, alertDaysBefore?: number, totalInstallments?: number, remainingInstallments?: number }>({ frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0, description: '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1 });

  // States for Budget
  const [budgetLimit, setBudgetLimit] = useState('');

  // Asset Selection
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const assets = React.useMemo(() => {
    return user?.email ? getLocalAssets(user.email).filter(a => !a.deletedAt) : [];
  }, [user?.email]);

  const handleFinish = async () => {
    if (!user?.email) return;

    if (!selectedAsset) {
      Alert.alert('Atenção', 'Você precisa selecionar um Bem para este lançamento.', [{ text: 'OK', onPress: () => {} }]);
      return;
    }

    try {
      if (transactionType === 'single') {
        if (!newRecord.description || newRecord.amount <= 0) {
          Alert.alert('Atenção', 'Preencha a descrição e um valor maior que zero.');
          return;
        }
        await enqueueMutation('financial', 'cost:CREATE', {
          ...newRecord, assetId: selectedAsset
        }, user.email);
      } 
      else if (transactionType === 'recurring') {
        if (!newRec.description || newRec.amount <= 0) {
          Alert.alert('Atenção', 'Preencha a descrição e um valor maior que zero.');
          return;
        }
        await enqueueMutation('financial', 'recurring:CREATE', {
          ...newRec, assetId: selectedAsset
        }, user.email);
      }
      else if (transactionType === 'budget') {
        const val = parseFloat(budgetLimit) || 0;
        if (val <= 0) {
           Alert.alert('Atenção', 'Defina um limite válido maior que zero.');
           return;
        }
        await enqueueMutation('financial', 'budget:SET', {
          assetId: selectedAsset, monthlyLimit: val, category: 'GERAL'
        }, user.email);
      }

      Alert.alert('Sucesso', 'Operação realizada com sucesso!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert('Erro', 'Não foi possível salvar.');
    }
  };

  const getHeaderTitle = () => {
    if (step === 1) return t('assetDetail.assetEntry') || 'Novo Lançamento';
    if (step === 2) return 'Classificação';
    if (step === 3) {
      if (transactionType === 'single') return t('assetDetail.newFinancialRecord') || 'Registro Financeiro';
      if (transactionType === 'recurring') return t('assetDetail.scheduleRecurring') || 'Agendar Recorrência';
      if (transactionType === 'budget') return t('assetDetail.monthlyBudget') || 'Definir Budget';
    }
    if (step === 4) return 'Vincular Bem';
    return '';
  };

  const handleBack = () => {
    if (step === 1) router.back();
    else if (step === 2) setStep(1);
    else if (step === 3) {
      // Budget skipped step 2 directly
      if (transactionType === 'budget') setStep(1);
      else setStep(2);
    }
    else if (step === 4) setStep(3);
  };

  const currentThemeColor = transactionType === 'budget' ? '#F59E0B' : 
    (step > 2 && newRecord.type === 'REVENUE' && transactionType !== 'budget' && newRec.type === 'REVENUE') ? '#10B981' : 
    (step > 2 && newRecord.type === 'EXPENSE' && transactionType !== 'budget' && newRec.type === 'EXPENSE') ? '#EF4444' : C.primary;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={getHeaderTitle()} leftIcon="arrow-back" onLeftPress={handleBack} />
      
      {/* ProgressBar */}
      <View style={styles.progressRow}>
         {[1, 2, 3, 4].map(s => (
            <View key={s} style={{ flex: 1, height: 4, backgroundColor: step >= s ? currentThemeColor : '#E2E8F0', marginHorizontal: 2, borderRadius: 2 }} />
         ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* ======================= STEP 1: TRANSACTION TYPE ======================= */}
        {step === 1 && (
          <View style={{ paddingTop: 20 }}>
            <Text style={styles.sectionTitle}>Que tipo de lançamento você deseja criar?</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('single'); setStep(2); }}>
              <View style={[styles.menuIcon, { backgroundColor: '#ECFDF5' }]}><Ionicons name="receipt-outline" size={24} color="#10B981" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.singleRecord') || 'Registro Único'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.singleRecordSub') || 'Gastos isolados ou entrada de dinheiro'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('recurring'); setStep(2); }}>
              <View style={[styles.menuIcon, { backgroundColor: '#EEF2FF' }]}><Ionicons name="calendar-outline" size={24} color="#6366F1" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.recurringBill') || 'Conta Recorrente'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.recurringBillSub') || 'Fixos, Aluguéis, Assinaturas'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('budget'); setStep(3); }}>
              <View style={[styles.menuIcon, { backgroundColor: '#FFF7ED' }]}><Ionicons name="pie-chart-outline" size={24} color="#F59E0B" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.setBudget') || 'Definir Budget'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.setBudgetSub') || 'Teto mensal por ativo'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CBD5E1" />
            </TouchableOpacity>
          </View>
        )}

        {/* ======================= STEP 2: REVENUE VS EXPENSE ======================= */}
        {step === 2 && (
          <View style={{ paddingTop: 20 }}>
            <Text style={styles.sectionTitle}>É uma receita ou despesa?</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24, textAlign: 'center' }}>
              {transactionType === 'single' ? 'Para um lançamento único' : 'Para uma cobrança recorrente'}
            </Text>

            <TouchableOpacity
              onPress={() => {
                if (transactionType === 'single') setNewRecord(prev => ({ ...prev, type: 'REVENUE' }));
                else setNewRec(prev => ({ ...prev, type: 'REVENUE' }));
                setStep(3);
              }}
              style={styles.cardRev}
            >
              <View style={[styles.cardIconBox, { backgroundColor: '#10B981' }]}>
                <Ionicons name="trending-up" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: '#065F46' }]}>Receita</Text>
                <Text style={[styles.cardSub, { color: '#10B981' }]}>Entrada de dinheiro</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#10B981" />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (transactionType === 'single') setNewRecord(prev => ({ ...prev, type: 'EXPENSE' }));
                else setNewRec(prev => ({ ...prev, type: 'EXPENSE' }));
                setStep(3);
              }}
              style={styles.cardExp}
            >
              <View style={[styles.cardIconBox, { backgroundColor: '#EF4444' }]}>
                <Ionicons name="trending-down" size={24} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: '#7F1D1D' }]}>Despesa</Text>
                <Text style={[styles.cardSub, { color: '#EF4444' }]}>Saída de dinheiro</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        )}

        {/* ======================= STEP 3: FORM MODALS ======================= */}
        {step === 3 && (
          <View style={styles.formContainer}>
            
            {/* --- SINGLE RECORD FORM --- */}
            {transactionType === 'single' && (
              <>
                <View style={styles.badgeWrap}>
                  <View style={[styles.badge, { backgroundColor: newRecord.type === 'REVENUE' ? '#ECFDF5' : '#FEF2F2', borderColor: newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444' }]}>
                    <Ionicons name={newRecord.type === 'REVENUE' ? 'trending-up' : 'trending-down'} size={14} color={newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444'} />
                    <Text style={[styles.badgeText, { color: newRecord.type === 'REVENUE' ? '#065F46' : '#7F1D1D' }]}>{newRecord.type === 'REVENUE' ? 'Receita' : 'Despesa'}</Text>
                  </View>
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.description') || 'DESCRIÇÃO'}</Text>
                  <TextInput style={styles.input} value={newRecord.description} onChangeText={t=>setNewRecord({...newRecord, description:t})} placeholder={t('assetDetail.descriptionPlaceholder') || 'Ex: Abastecimento do caminhão'} returnKeyType="next" />
                </View>
                


                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.category') || 'CATEGORIA'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {(newRecord.type === 'EXPENSE' ? expenseCategories : revenueCategories).map(c => (
                      <TouchableOpacity key={c} style={[styles.pChip, newRecord.category === c && styles.pChipA]} onPress={()=>setNewRecord({...newRecord, category:c})}>
                        <Text style={[styles.pChipT, newRecord.category === c && styles.pChipTA]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.inputG}>
                  <DatePickerButton label={t('assetDetail.date') || 'DATA'} value={newRecord.date} onChange={(d) => setNewRecord({ ...newRecord, date: d })} accentColor={newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444'} />
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.valueAmount') || 'VALOR'}</Text>
                  <ValueInput style={styles.input} value={String(newRecord.amount || '')} onChangeText={v => setNewRecord({...newRecord, amount: parseFloat(v) || 0})} placeholder="0,00" currency />
                </View>

                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444'}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}

            {/* --- RECURRING FORM --- */}
            {transactionType === 'recurring' && (
              <>
                <View style={styles.badgeWrap}>
                  <View style={[styles.badge, { backgroundColor: newRec.type === 'REVENUE' ? '#ECFDF5' : '#FEF2F2', borderColor: newRec.type === 'REVENUE' ? '#10B981' : '#EF4444' }]}>
                    <Ionicons name={newRec.type === 'REVENUE' ? 'trending-up' : 'trending-down'} size={14} color={newRec.type === 'REVENUE' ? '#10B981' : '#EF4444'} />
                    <Text style={[styles.badgeText, { color: newRec.type === 'REVENUE' ? '#065F46' : '#7F1D1D' }]}>{newRec.type === 'REVENUE' ? 'Receita' : 'Despesa'}</Text>
                  </View>
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.billDescription') || 'DESCRIÇÃO DA CONTA'}</Text>
                  <TextInput style={styles.input} value={newRec.description} onChangeText={t=>setNewRec({...newRec, description:t})} placeholder={t('assetDetail.billPlaceholder') || 'Ex: Aluguel do pátio'} returnKeyType="done" />
                </View>

                <View style={styles.inputG}>
                  <DatePickerButton label={t("assetDetail.dueDay") || 'DIA DO VENCIMENTO'} value={newRec.nextDueDate} onChange={(d) => setNewRec({ ...newRec, nextDueDate: d })} accentColor={newRec.type === 'REVENUE' ? '#10B981' : '#EF4444'} />
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t("assetDetail.valueAmount") || 'VALOR DA PARCELA'}</Text>
                  <ValueInput style={styles.input} value={String(newRec.amount || '')} onChangeText={v => setNewRec({...newRec, amount: parseFloat(v) || 0})} currency placeholder="0,00" />
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.frequency') || 'FREQUÊNCIA'}</Text>
                  <View style={{flexDirection:'row', gap:10}}>
                    {['WEEKLY','MONTHLY','YEARLY'].map(f => (
                      <TouchableOpacity key={f} style={[styles.pChip, newRec.frequency === f && styles.pChipA]} onPress={()=>setNewRec({...newRec, frequency:f as any})}>
                        <Text style={[styles.pChipT, newRec.frequency === f && styles.pChipTA]}>{f}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                
                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.alertDue') || 'ALERTA DE VENCIMENTO'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {[
                      { l: t('assetDetail.noAlert') || 'Sem alerta', v: undefined },
                      { l: t('assetDetail.onDay') || 'No dia', v: 0 },
                      { l: '1 dia antes', v: 1 },
                      { l: '3 dias antes', v: 3 },
                      { l: '5 dias antes', v: 5 },
                      { l: '10 dias antes', v: 10 }
                    ].map(opt => (
                      <TouchableOpacity key={String(opt.v)} style={[styles.pChip, newRec.alertDaysBefore === opt.v && styles.pChipA]} onPress={()=>setNewRec({...newRec, alertDaysBefore: opt.v})}>
                        <Text style={[styles.pChipT, newRec.alertDaysBefore === opt.v && styles.pChipTA]}>{opt.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.installments') || 'TOTAL DE PARCELAS (OPCIONAL)'}</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={newRec.totalInstallments ? String(newRec.totalInstallments) : ''} onChangeText={t => { const val = parseInt(t) || undefined; setNewRec({...newRec, totalInstallments: val, remainingInstallments: val}); }} placeholder={t('assetDetail.installmentsPlaceholder') || 'Ex: 12 (deixe vazio para infra)'} returnKeyType="done" />
                </View>

                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: newRec.type === 'REVENUE' ? '#10B981' : '#EF4444'}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}

            {/* --- BUDGET FORM --- */}
            {transactionType === 'budget' && (
              <>
                <View style={styles.inputG}>
                   <Text style={[styles.inputL, { color: '#F59E0B' }]}>{t('assetDetail.spendingLimit') || 'LIMITE MENSAL PERMITIDO'}</Text>
                   <ValueInput style={[styles.input, { borderColor: '#F59E0B' }]} value={budgetLimit} onChangeText={setBudgetLimit} placeholder="5000" currency />
                </View>
                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: '#F59E0B'}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}

          </View>
        )}

        {/* ======================= STEP 4: SELECT ASSET ======================= */}
        {step === 4 && (
          <View style={{ paddingTop: 20 }}>
            <Text style={styles.sectionTitle}>A qual Bem este lançamento pertence?</Text>
            <Text style={{ fontSize: 13, color: colors.textSecondary, marginBottom: 24 }}>Escolha um ativo para vincular este registro.</Text>

            {assets.map(a => (
              <TouchableOpacity 
                key={a.id}
                style={[styles.assetRow, selectedAsset === a.id && [styles.assetRowActive, { borderColor: currentThemeColor }]]}
                onPress={() => setSelectedAsset(a.id)}
              >
                <View style={[styles.assetIcon, selectedAsset === a.id && { backgroundColor: currentThemeColor }]}>
                  <Ionicons name="business" size={24} color={selectedAsset === a.id ? '#fff' : colors.slate} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.assetTitle, selectedAsset === a.id && { color: currentThemeColor }]}>{a.title}</Text>
                  {a.parentId ? (
                    <Text style={styles.assetSub} numberOfLines={1}>Vinculado a: {a.parentTitle}</Text>
                  ) : (
                    <Text style={styles.assetSub} numberOfLines={1}>{a.details?.city || a.details?.location || 'Matriz'}</Text>
                  )}
                </View>
                {selectedAsset === a.id && <Ionicons name="checkmark-circle" size={24} color={currentThemeColor} />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={[styles.nextBtn, {backgroundColor: currentThemeColor, marginTop: 40, marginBottom: 60 }]} onPress={handleFinish}>
              <Ionicons name="checkmark-done" size={24} color="#fff" />
              <Text style={styles.nextBtnText}>Finalizar Lançamento</Text>
            </TouchableOpacity>

          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progressRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  scroll: { padding: 20, paddingBottom: 60 },
  
  sectionTitle: { fontSize: 20, fontWeight: '900', color: colors.slate, marginBottom: 8, letterSpacing: -0.5 },
  
  // Menu Single/Recurring/Budget
  menuItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 20, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  menuIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  menuItemT: { fontSize: 16, fontWeight: '900', color: colors.slate },
  menuItemS: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },

  // Cards Rev/Exp
  cardRev: { backgroundColor: '#ECFDF5', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12, borderWidth: 2, borderColor: '#10B981' },
  cardExp: { backgroundColor: '#FEF2F2', borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20, borderWidth: 2, borderColor: '#EF4444' },
  cardIconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  cardSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

  // Forms
  formContainer: { backgroundColor: '#fff', borderRadius: 24, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 3, marginTop: 10 },
  badgeWrap: { marginBottom: 24, alignSelf: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
  badgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },

  inputG: { marginBottom: 20 },
  inputL: { fontSize: 9, fontWeight: '900', color: colors.textLight, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 15, fontWeight: '700', borderWidth: 1, borderColor: colors.border, color: colors.slate },
  
  pChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  pChipA: { backgroundColor: colors.slate, borderColor: colors.slate },
  pChipT: { fontSize: 11, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase' },
  pChipTA: { color: '#fff' },

  nextBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 18, borderRadius: 16, marginTop: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4, gap: 10 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

  // Assets list
  assetRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, borderWidth: 2, borderColor: '#E2E8F0' },
  assetRowActive: { backgroundColor: '#F8FAFC' },
  assetIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  assetTitle: { fontSize: 15, fontWeight: '900', color: colors.slate },
  assetSub: { fontSize: 12, color: colors.textSecondary, marginTop: 2 }
});
