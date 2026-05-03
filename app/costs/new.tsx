import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, KeyboardAvoidingView, Alert, TextInput, Dimensions } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ColorPalette,
  MEDIA_TAG_COLORS,
  SERVICE_CATEGORY_COLORS,
} from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { Header } from '../../src/components/Header';
import { useTranslation } from 'react-i18next';
import { CostService } from '../../src/services/costService';
import { getRootAssets, getLocalAssets } from '../../src/database';
import { useAuth } from '../../src/hooks/useAuth';
import { ValueInput, parseLocaleAmountString } from '../../src/components/ValueInput';
import DatePickerButton from '../../src/components/DatePickerButton';

const SCREEN_W = Dimensions.get('window').width;

const expenseCategories = ['MANUTENÇÃO', 'IMPOSTOS', 'SEGURO', 'COMBUSTÍVEL', 'OUTROS'];
const revenueCategories = ['VENDA', 'ALUGUEL', 'SERVIÇO', 'RENDIMENTO', 'OUTROS'];

export default function NewCostScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createNewCostStyles(C), [C]);
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [transactionType, setTransactionType] = useState<null | 'single' | 'recurring' | 'budget'>(null);
  
  // States for Single Record
  const [newRecord, setNewRecord] = useState<{ category: string, amount: number, date: string, status: 'PAID'|'PENDING', description: string, type: 'REVENUE'|'EXPENSE' }>({ category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', description: '', type: 'EXPENSE' });

  // States for Recurring
  const [newRec, setNewRec] = useState<{ category: string, frequency: 'WEEKLY'|'MONTHLY'|'YEARLY', status: 'ACTIVE'|'PAUSED', type: 'REVENUE'|'EXPENSE', amount: number, description: string, nextDueDate: string, alertDaysBefore?: number, totalInstallments?: number, remainingInstallments?: number }>({ category: 'OUTROS', frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0, description: '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1 });

  // States for Budget
  const [budgetLimit, setBudgetLimit] = useState('');

  // Asset Selection
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const assets = React.useMemo(() => {
    return user?.email
      ? getLocalAssets(user.email, { includeMobileWarehouse: false }).filter((a) => !a.deletedAt)
      : [];
  }, [user?.email]);

  const handleFinish = async () => {
    if (!user?.email) return;

    if (!selectedAsset) {
      Alert.alert(t('common.attention'), t('appAlerts.costs.selectAsset'), [{ text: t('common.ok'), onPress: () => {} }]);
      return;
    }

    try {
      if (transactionType === 'single') {
        if (!newRecord.description || newRecord.amount <= 0) {
          Alert.alert(t('common.attention'), t('appAlerts.costs.fillDescValue'));
          return;
        }
        await CostService.saveExpense({
          id: `exp_${Date.now()}`,
          assetId: selectedAsset,
          ...newRecord
        }, user.email);
      } 
      else if (transactionType === 'recurring') {
        if (!newRec.description || newRec.amount <= 0) {
          Alert.alert(t('common.attention'), t('appAlerts.costs.fillDescValue'));
          return;
        }
        await CostService.saveRecurringCost({
          id: `rec_${Date.now()}`,
          assetId: selectedAsset,
          ...newRec
        }, user.email);
      }
      else if (transactionType === 'budget') {
        const val = parseLocaleAmountString(budgetLimit) || 0;
        if (val <= 0) {
           Alert.alert(t('common.attention'), t('appAlerts.costs.validLimit'));
           return;
        }
        await CostService.saveBudget({
          id: `bud_${Date.now()}`,
          assetId: selectedAsset, 
          monthlyLimit: val, 
          category: 'GERAL'
        }, user.email);
      }

      Alert.alert(t('common.success'), t('appAlerts.costs.success'), [
        { text: t('common.ok'), onPress: () => router.back() },
      ]);
    } catch (e) {
      console.error(e);
      Alert.alert(t('common.error'), t('appAlerts.costs.saveError'));
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
    if (step === 4) return 'Vincular ativo';
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

  const currentThemeColor =
    transactionType === 'budget'
      ? MEDIA_TAG_COLORS.DURING
      : step > 2 && newRecord.type === 'REVENUE' && newRec.type === 'REVENUE'
        ? C.success.text
        : step > 2 && newRecord.type === 'EXPENSE' && newRec.type === 'EXPENSE'
          ? C.destructive
          : C.primary;

  return (
    <KeyboardAvoidingView style={[styles.container, { backgroundColor: C.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header title={getHeaderTitle()} leftIcon="arrow-back" onLeftPress={handleBack} />
      
      {/* ProgressBar */}
      <View style={styles.progressRow}>
         {[1, 2, 3, 4].map(s => (
            <View key={s} style={{ flex: 1, height: 4, backgroundColor: step >= s ? currentThemeColor : C.border, marginHorizontal: 2, borderRadius: 2 }} />
         ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        
        {/* ======================= STEP 1: TRANSACTION TYPE ======================= */}
        {step === 1 && (
          <View style={{ paddingTop: 20 }}>
            {assets.length === 0 ? (
               <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                 <Ionicons name="cube-outline" size={64} color={C.border} />
                 <Text style={{ fontSize: 18, fontWeight: '900', color: C.slate, marginTop: 24, textAlign: 'center' }}>
                   {t('appAlerts.assetGate.noAssetTitle')}
                 </Text>
                 <Text style={{ fontSize: 14, color: C.textLight, textAlign: 'center', marginTop: 12, lineHeight: 22, fontWeight: '500' }}>
                   {t('appAlerts.assetGate.hintFinance')}
                 </Text>
                 <TouchableOpacity 
                   style={{ backgroundColor: C.filledButtonBg, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 14, marginTop: 32 }}
                   onPress={() => router.back()}
                   activeOpacity={0.8}
                 >
                   <Text style={{ color: C.cardWhite, fontSize: 15, fontWeight: '800' }}>{t('common.back')}</Text>
                 </TouchableOpacity>
               </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Que tipo de lançamento você deseja criar?</Text>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('single'); setStep(2); }}>
              <View style={[styles.menuIcon, { backgroundColor: C.status.success.bg }]}><Ionicons name="receipt-outline" size={24} color={C.success.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.singleRecord') || 'Registro Único'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.singleRecordSub') || 'Gastos isolados ou entrada de dinheiro'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('recurring'); setStep(2); }}>
              <View style={[styles.menuIcon, { backgroundColor: C.status.info.bg }]}><Ionicons name="calendar-outline" size={24} color={SERVICE_CATEGORY_COLORS.Tecnologia} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.recurringBill') || 'Conta Recorrente'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.recurringBillSub') || 'Fixos, Aluguéis, Assinaturas'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => { setTransactionType('budget'); setStep(3); }}>
              <View style={[styles.menuIcon, { backgroundColor: C.status.warning.bg }]}><Ionicons name="pie-chart-outline" size={24} color={MEDIA_TAG_COLORS.DURING} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuItemT}>{t('assetDetail.setBudget') || 'Definir Budget'}</Text>
                <Text style={styles.menuItemS}>{t('assetDetail.setBudgetSub') || 'Teto mensal por ativo'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* ======================= STEP 2: REVENUE VS EXPENSE ======================= */}
        {step === 2 && (
          <View style={{ paddingTop: 20 }}>
            <Text style={styles.sectionTitle}>É uma receita ou despesa?</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 24, textAlign: 'center' }}>
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
              <View style={[styles.cardIconBox, { backgroundColor: C.success.text }]}>
                <Ionicons name="trending-up" size={24} color={C.cardWhite} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: C.status.success.fg }]}>Receita</Text>
                <Text style={[styles.cardSub, { color: C.success.text }]}>Entrada de dinheiro</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.success.text} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                if (transactionType === 'single') setNewRecord(prev => ({ ...prev, type: 'EXPENSE' }));
                else setNewRec(prev => ({ ...prev, type: 'EXPENSE' }));
                setStep(3);
              }}
              style={styles.cardExp}
            >
              <View style={[styles.cardIconBox, { backgroundColor: C.destructive }]}>
                <Ionicons name="trending-down" size={24} color={C.cardWhite} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: C.status.danger.fg }]}>Despesa</Text>
                <Text style={[styles.cardSub, { color: C.destructive }]}>Saída de dinheiro</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={C.destructive} />
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
                  <View style={[styles.badge, { backgroundColor: newRecord.type === 'REVENUE' ? C.status.success.bg : C.status.danger.bg, borderColor: newRecord.type === 'REVENUE' ? C.status.success.border : C.status.danger.border }]}>
                    <Ionicons name={newRecord.type === 'REVENUE' ? 'trending-up' : 'trending-down'} size={14} color={newRecord.type === 'REVENUE' ? C.success.text : C.destructive} />
                    <Text style={[styles.badgeText, { color: newRecord.type === 'REVENUE' ? C.status.success.fg : C.status.danger.fg }]}>{newRecord.type === 'REVENUE' ? 'Receita' : 'Despesa'}</Text>
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
                  <DatePickerButton label={t('assetDetail.date') || 'DATA'} value={newRecord.date} onChange={(d) => setNewRecord({ ...newRecord, date: d })} accentColor={newRecord.type === 'REVENUE' ? C.success.text : C.destructive} />
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.valueAmount') || 'VALOR'}</Text>
                  <ValueInput style={styles.input} value={String(newRecord.amount || '')} onChangeText={v => setNewRecord({ ...newRecord, amount: parseLocaleAmountString(v) })} placeholder="0,00" currency />
                </View>

                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: newRecord.type === 'REVENUE' ? C.success.text : C.destructive}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.cardWhite} />
                </TouchableOpacity>
              </>
            )}

            {/* --- RECURRING FORM --- */}
            {transactionType === 'recurring' && (
              <>
                <View style={styles.badgeWrap}>
                  <View style={[styles.badge, { backgroundColor: newRec.type === 'REVENUE' ? C.status.success.bg : C.status.danger.bg, borderColor: newRec.type === 'REVENUE' ? C.status.success.border : C.status.danger.border }]}>
                    <Ionicons name={newRec.type === 'REVENUE' ? 'trending-up' : 'trending-down'} size={14} color={newRec.type === 'REVENUE' ? C.success.text : C.destructive} />
                    <Text style={[styles.badgeText, { color: newRec.type === 'REVENUE' ? C.status.success.fg : C.status.danger.fg }]}>{newRec.type === 'REVENUE' ? 'Receita' : 'Despesa'}</Text>
                  </View>
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t('assetDetail.billDescription') || 'DESCRIÇÃO DA CONTA'}</Text>
                  <TextInput style={styles.input} value={newRec.description} onChangeText={t=>setNewRec({...newRec, description:t})} placeholder={t('assetDetail.billPlaceholder') || 'Ex: Aluguel do pátio'} returnKeyType="done" />
                </View>

                <View style={styles.inputG}>
                  <DatePickerButton label={t("assetDetail.dueDay") || 'DIA DO VENCIMENTO'} value={newRec.nextDueDate} onChange={(d) => setNewRec({ ...newRec, nextDueDate: d })} accentColor={newRec.type === 'REVENUE' ? C.success.text : C.destructive} />
                </View>

                <View style={styles.inputG}>
                  <Text style={styles.inputL}>{t("assetDetail.valueAmount") || 'VALOR DA PARCELA'}</Text>
                  <ValueInput style={styles.input} value={String(newRec.amount || '')} onChangeText={v => setNewRec({ ...newRec, amount: parseLocaleAmountString(v) })} currency placeholder="0,00" />
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

                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: newRec.type === 'REVENUE' ? C.success.text : C.destructive}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.cardWhite} />
                </TouchableOpacity>
              </>
            )}

            {/* --- BUDGET FORM --- */}
            {transactionType === 'budget' && (
              <>
                <View style={styles.inputG}>
                   <Text style={[styles.inputL, { color: MEDIA_TAG_COLORS.DURING }]}>{t('assetDetail.spendingLimit') || 'LIMITE MENSAL PERMITIDO'}</Text>
                   <ValueInput style={[styles.input, { borderColor: MEDIA_TAG_COLORS.DURING }]} value={budgetLimit} onChangeText={setBudgetLimit} placeholder="5000" currency />
                </View>
                <TouchableOpacity style={[styles.nextBtn, {backgroundColor: MEDIA_TAG_COLORS.DURING}]} onPress={() => setStep(4)}>
                  <Text style={styles.nextBtnText}>Próximo Passo</Text>
                  <Ionicons name="arrow-forward" size={18} color={C.cardWhite} />
                </TouchableOpacity>
              </>
            )}

          </View>
        )}

        {/* ======================= STEP 4: SELECT ASSET ======================= */}
        {step === 4 && (
          <View style={{ paddingTop: 20 }}>
            <Text style={styles.sectionTitle}>A que ativo pertence este lançamento?</Text>
            <Text style={{ fontSize: 13, color: C.textSecondary, marginBottom: 24 }}>Escolha um ativo para vincular este registro.</Text>

            {assets.map(a => (
              <TouchableOpacity 
                key={a.id}
                style={[styles.assetRow, selectedAsset === a.id && [styles.assetRowActive, { borderColor: currentThemeColor }]]}
                onPress={() => setSelectedAsset(a.id)}
              >
                <View style={[styles.assetIcon, selectedAsset === a.id && { backgroundColor: currentThemeColor }]}>
                  <Ionicons name="business" size={24} color={selectedAsset === a.id ? C.cardWhite : C.slate} />
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
              <Ionicons name="checkmark-done" size={24} color={C.cardWhite} />
              <Text style={styles.nextBtnText}>Finalizar Lançamento</Text>
            </TouchableOpacity>

          </View>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createNewCostStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1 },
    progressRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: C.cardWhite,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },
    scroll: { padding: 20, paddingBottom: 60 },

    sectionTitle: { fontSize: 20, fontWeight: '900', color: C.slate, marginBottom: 8, letterSpacing: -0.5 },

    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardWhite,
      padding: 20,
      borderRadius: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: C.border,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    menuIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
    menuItemT: { fontSize: 16, fontWeight: '900', color: C.slate },
    menuItemS: { fontSize: 12, color: C.textSecondary, marginTop: 2 },

    cardRev: {
      backgroundColor: C.status.success.bg,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: C.status.success.border,
    },
    cardExp: {
      backgroundColor: C.status.danger.bg,
      borderRadius: 16,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
      marginBottom: 20,
      borderWidth: 2,
      borderColor: C.status.danger.border,
    },
    cardIconBox: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
    cardTitle: { fontSize: 16, fontWeight: '900' },
    cardSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

    formContainer: {
      backgroundColor: C.cardWhite,
      borderRadius: 24,
      padding: 24,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 3,
      marginTop: 10,
    },
    badgeWrap: { marginBottom: 24, alignSelf: 'flex-start' },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },

    inputG: { marginBottom: 20 },
    inputL: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, marginBottom: 6, textTransform: 'uppercase' },
    input: {
      backgroundColor: C.surfaceLow,
      padding: 16,
      borderRadius: 12,
      fontSize: 15,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: C.border,
      color: C.slate,
    },

    pChip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: C.divider,
      marginRight: 8,
      borderWidth: 1,
      borderColor: C.border,
      justifyContent: 'center',
      alignItems: 'center',
    },
    pChipA: { backgroundColor: C.filledButtonBg, borderColor: C.filledButtonBg },
    pChipT: { fontSize: 11, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
    pChipTA: { color: C.filledButtonFg },

    nextBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 18,
      borderRadius: 16,
      marginTop: 20,
      shadowColor: C.slate,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 4,
      gap: 10,
    },
    nextBtnText: { color: C.cardWhite, fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },

    assetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.cardWhite,
      padding: 16,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 2,
      borderColor: C.border,
    },
    assetRowActive: { backgroundColor: C.background },
    assetIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: C.divider,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    assetTitle: { fontSize: 15, fontWeight: '900', color: C.slate },
    assetSub: { fontSize: 12, color: C.textSecondary, marginTop: 2 },
  });
}
