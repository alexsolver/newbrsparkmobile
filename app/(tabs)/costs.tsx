import React, { useState, useCallback } from 'react';
import { 
  View, Text, StyleSheet, TouchableOpacity, ScrollView, 
  Modal, TextInput, Alert, ActivityIndicator, FlatList,
  KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard 
} from 'react-native';
import { DirectExpense, AssetBudget, CostSummary, RecurringCost } from '../../src/types/costs';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CostService } from '../../src/services/costService';
import { getRootAssets } from '../../src/database';
import { colors } from '../../src/theme/colors';
import { Asset } from '../../src/types/asset';


const EXPENSE_CATEGORIES = ['MANUTENÇÃO', 'CONTAS', 'TAXAS', 'LIMPEZA', 'LOGÍSTICA', 'OUTROS'];
const REVENUE_CATEGORIES = ['VENDA', 'SERVIÇO', 'LOCAÇÃO', 'OUTROS'];

export default function CostsScreen() {
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
    category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PAID', type: 'EXPENSE'
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


  const venues = getRootAssets();

  const loadData = async () => {
    setLoading(true);
    const [allExp, allRec, allAssets] = await Promise.all([
      CostService.getExpenses(),
      CostService.getRecurringCosts(),
      getRootAssets()
    ]);
    
    const summs = await Promise.all(allAssets.map(a => 
      CostService.getAssetCostSummary(a.id, currentMonth)
    ));

    setExpenses(allExp.sort((a,b) => b.date.localeCompare(a.date)));
    setRecurring(allRec);
    setSummaries(summs);
    setLoading(false);
  };

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const handleSaveRecord = async () => {
    if (!newRecord.amount || !newRecord.assetId || !newRecord.description) {
      return Alert.alert('Atenção', 'Preencha os campos obrigatórios.');
    }
    await CostService.saveExpense({
      ...newRecord as DirectExpense,
      id: Math.random().toString(36).substring(7),
    });
    setRecordModalVisible(false);
    loadData();
    Alert.alert('Sucesso', 'Registro financeiro salvo!');
  };

  const handleSaveRecurring = async () => {
    if (!newRec.amount || !newRec.assetId || !newRec.description || !newRec.nextDueDate) {
      return Alert.alert('Atenção', 'Preencha os campos obrigatórios.');
    }
    await CostService.saveRecurringCost({
      ...newRec as RecurringCost,
      id: Math.random().toString(36).substring(7),
    });
    setRecurringModalVisible(false);
    loadData();
    Alert.alert('Sucesso', 'Conta recorrente agendada!');
  };

  const handleSaveBudget = async () => {
    if (!selectedBudgetAsset || !budgetLimit) return;
    await CostService.saveBudget({
      id: Math.random().toString(36).substring(7),
      assetId: selectedBudgetAsset,
      monthlyLimit: parseFloat(budgetLimit) || 0,
      category: 'GERAL'
    });
    setBudgetModalVisible(false);
    loadData();
  };

  const handleMarkPaid = async (id: string) => {
    Alert.alert(
      'Confirmar Pagamento',
      'Deseja registrar o pagamento desta conta agora?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { 
          text: 'Confirmar', 
          onPress: async () => {
            await CostService.markRecurringAsPaid(id);
            loadData();
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
          <View><Text style={S.pTitle}>Finanças</Text><Text style={S.pSub}>{new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</Text></View>
          <TouchableOpacity style={S.addBtn} onPress={() => setAddMenuVisible(true)}>
             <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>


        <View style={S.cardMain}>
          <View style={S.cardRow}>
             <View><Text style={S.cardL}>Saldo do Mês</Text><Text style={[S.cardV, balance < 0 && {color: colors.warning.text}]}>R$ {balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text></View>
             <View style={{alignItems:'flex-end'}}><Text style={S.cardL}>Receita Total</Text><Text style={S.cardBudget}>R$ {totalRev.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text></View>
          </View>
          <View style={S.progressC}><View style={[S.progressB, { width: `${Math.min(budgetProgress, 100)}%`, backgroundColor: budgetProgress > 90 ? colors.warning.text : colors.accent } as any]} /></View>
          <View style={{flexDirection:'row', justifyContent:'space-between'}}><Text style={S.progressT}>Despesas: R$ {totalExp.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text><Text style={S.progressT}>Budget: {budgetProgress.toFixed(0)}%</Text></View>
        </View>

      </View>

      <View style={S.tabBar}>
         <TouchableOpacity style={[S.tab, activeTab === 'DASHBOARD' && S.tabA]} onPress={() => setActiveTab('DASHBOARD')}><Text style={[S.tabT, activeTab === 'DASHBOARD' && S.tabTA]}>DASHBOARD</Text></TouchableOpacity>
         <TouchableOpacity style={[S.tab, activeTab === 'EXPENSES' && S.tabA]} onPress={() => setActiveTab('EXPENSES')}><Text style={[S.tabT, activeTab === 'EXPENSES' && S.tabTA]}>EXTRATO</Text></TouchableOpacity>
         <TouchableOpacity style={[S.tab, activeTab === 'RECURRING' && S.tabA]} onPress={() => setActiveTab('RECURRING')}><Text style={[S.tabT, activeTab === 'RECURRING' && S.tabTA]}>FIXOS</Text></TouchableOpacity>
      </View>

      <View style={S.locBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.filterScroll}>
            <TouchableOpacity style={[S.filterChip, selectedAsset === 'ALL' && S.filterChipA]} onPress={() => setSelectedAsset('ALL')}><Text style={[S.filterChipT, selectedAsset === 'ALL' && S.filterChipTA]}>TODOS</Text></TouchableOpacity>
            {venues.map(v => (<TouchableOpacity key={v.id} style={[S.filterChip, selectedAsset === v.id && S.filterChipA]} onPress={() => setSelectedAsset(v.id)}><Text style={[S.filterChipT, selectedAsset === v.id && S.filterChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}
        </ScrollView>
      </View>

      {activeTab === 'DASHBOARD' ? (
        <ScrollView style={S.content} showsVerticalScrollIndicator={false}>
          {upcomingBills.length > 0 && (
            <View style={S.alertBox}>
              <View style={S.alertH}><Ionicons name="notifications" size={16} color="#B45309" /><Text style={S.alertHT}>PRÓXIMOS VENCIMENTOS</Text></View>
              {upcomingBills.slice(0,3).map(b => (
                <TouchableOpacity key={b.id} style={S.alertItem} onPress={() => handleMarkPaid(b.id)}>
                   <Text style={S.alertDesc}>{b.description}</Text>
                   <View style={{alignItems:'flex-end'}}>
                      <Text style={S.alertVal}>R$ {b.amount.toFixed(2)}</Text>
                      <Text style={S.alertDate}>Vence {new Date(b.nextDueDate).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}</Text>
                   </View>
                   <Ionicons name="checkmark-circle-outline" size={20} color="#B45309" style={{marginLeft: 10}} />
                </TouchableOpacity>
              ))}

            </View>
          )}

          <Text style={S.secTitle}>DESEMPENHO POR ATIVO</Text>
          {summaries.filter(s => selectedAsset === 'ALL' || s.assetId === selectedAsset).map(s => {
            const venue = venues.find(v => v.id === s.assetId);
            const net = s.totalRevenues - s.totalExpenses;
            const p = s.totalBudget > 0 ? (s.totalExpenses / s.totalBudget) * 100 : 0;
            return (
              <TouchableOpacity key={s.assetId} style={S.assetCard} onPress={() => { setSelectedBudgetAsset(s.assetId); setBudgetLimit(String(s.totalBudget)); setBudgetModalVisible(true); }}>
                <View style={S.assetInfo}>
                  <Text style={S.assetName}>{venue?.title}</Text>
                  <View style={S.costRow}><Text style={[S.costItem, {color: '#10B981'}]}>Rec: R$ {s.totalRevenues.toFixed(0)}</Text><Text style={S.costDivider}>•</Text><Text style={[S.costItem, {color: '#EF4444'}]}>Desp: R$ {s.totalExpenses.toFixed(0)}</Text></View>
                  <View style={S.minProgress}><View style={[S.minBar, { width: `${Math.min(p, 100)}%`, backgroundColor: p > 100 ? colors.warning.text : colors.accent } as any]} /></View>
                </View>
                <View style={S.assetVal}><Text style={[S.assetTotal, net < 0 && {color: colors.warning.text}]}>R$ {net.toFixed(0)}</Text><Text style={S.assetPerc}>{p.toFixed(0)}% budget</Text></View>
              </TouchableOpacity>

            )
          })}
        </ScrollView>
      ) : activeTab === 'EXPENSES' ? (
        <FlatList
          data={filteredExpenses}
          keyExtractor={e => e.id}
          contentContainerStyle={S.content}
          renderItem={({ item }) => (
            <View style={S.expenseItem}>
              <View style={[S.expIcon, { backgroundColor: item.type === 'REVENUE' ? '#ECFDF5' : item.category === 'MANUTENÇÃO' ? '#FEF2F2' : '#F8FAFC' }]}><Ionicons name={item.type === 'REVENUE' ? 'trending-up' : item.category === 'MANUTENÇÃO' ? 'build' : 'receipt'} size={20} color={item.type === 'REVENUE' ? '#10B981' : item.category === 'MANUTENÇÃO' ? '#EF4444' : colors.primary} /></View>
              <View style={{flex:1}}>
                <Text style={S.expTitle}>{item.description}</Text>
                <Text style={S.expMeta}>{venues.find(v=>v.id===item.assetId)?.title} • {item.category}</Text>
              </View>
              <Text style={[S.expAmount, { color: item.type === 'REVENUE' ? '#10B981' : colors.primary }]}>{(item.type === 'REVENUE' ? '+ ' : '- ')}R$ {item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Text>
            </View>
          )}
        />
      ) : (
        <FlatList
          data={recurring.filter(r => selectedAsset === 'ALL' || r.assetId === selectedAsset)}
          keyExtractor={r => r.id}
          contentContainerStyle={S.content}
          renderItem={({ item: r }) => (
            <View style={S.expenseItem}>
               <View style={[S.expIcon, { backgroundColor: '#F5F3FF' }]}><Ionicons name="refresh" size={20} color="#6366F1" /></View>
               <View style={{flex:1}}>
                  <Text style={S.expTitle}>{r.description}</Text>
                  <Text style={S.expMeta}>{venues.find(v=>v.id===r.assetId)?.title} • {r.frequency}</Text>
               </View>
               <View style={{flexDirection:'row', alignItems:'center', gap: 12}}>
                  <View style={{alignItems:'flex-end'}}>
                     <Text style={S.expAmount}>R$ {r.amount.toFixed(2)}</Text>
                     <Text style={S.alertDate}>Vence: {new Date(r.nextDueDate).toLocaleDateString('pt-BR')}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleMarkPaid(r.id)} style={{backgroundColor: '#10B981', padding: 8, borderRadius: 8}}>
                     <Ionicons name="card-outline" size={20} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert('Excluir?', 'Remover esta conta recorrente?', [
                      { text: 'Cancelar', style: 'cancel' },
                      { text: 'Excluir', style: 'destructive', onPress: async () => { await CostService.deleteRecurringCost(r.id); loadData(); }}
                    ]);
                  }} style={{backgroundColor: '#FEE2E2', padding: 8, borderRadius: 8}}>
                     <Ionicons name="trash-outline" size={20} color="#EF4444" />
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
                  
                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setNewRecord({ category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PAID', description: '', type: 'EXPENSE' }); setRecordModalVisible(true); }}>
                     <View style={[S.menuIcon, {backgroundColor: '#ECFDF5'}]}><Ionicons name="receipt-outline" size={24} color="#10B981"/></View>
                     <View><Text style={S.menuItemT}>Registro Único</Text><Text style={S.menuItemS}>Despesa ou Receita pontual</Text></View>
                  </TouchableOpacity>

                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setNewRec({ frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0, description: '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1 }); setRecurringModalVisible(true); }}>
                     <View style={[S.menuIcon, {backgroundColor: '#EEF2FF'}]}><Ionicons name="calendar-outline" size={24} color="#6366F1"/></View>
                     <View><Text style={S.menuItemT}>Conta Recorrente</Text><Text style={S.menuItemS}>Fixos, Aluguéis, Assinaturas</Text></View>
                  </TouchableOpacity>

                  <TouchableOpacity style={S.menuItem} onPress={() => { setAddMenuVisible(false); setBudgetModalVisible(true); }}>
                     <View style={[S.menuIcon, {backgroundColor: '#FFF7ED'}]}><Ionicons name="pie-chart-outline" size={24} color="#F59E0B"/></View>
                     <View><Text style={S.menuItemT}>Definir Budget</Text><Text style={S.menuItemS}>Teto mensal por ativo</Text></View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={S.menuClose} onPress={() => setAddMenuVisible(false)}>
                     <Text style={S.menuCloseT}>CANCELAR</Text>
                  </TouchableOpacity>
               </View>
            </View>
         </TouchableWithoutFeedback>
      </Modal>


      {/* MODAL ADICIONAR REGISTRO (RECEITA/DESPESA) */}
      <Modal visible={recordModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
              <View style={S.modalH}><Text style={S.modalT}>NOVO REGISTRO FINANCEIRO</Text><TouchableOpacity onPress={() => setRecordModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={S.typeToggle}>
                   <TouchableOpacity style={[S.typeBtn, newRecord.type === 'EXPENSE' && {backgroundColor: '#EF4444'}]} onPress={()=>setNewRecord({...newRecord, type:'EXPENSE'})}><Text style={[S.typeBtnT, newRecord.type === 'EXPENSE' && {color:'#fff'}]}>DESPESA</Text></TouchableOpacity>
                   <TouchableOpacity style={[S.typeBtn, newRecord.type === 'REVENUE' && {backgroundColor: '#10B981'}]} onPress={()=>setNewRecord({...newRecord, type:'REVENUE'})}><Text style={[S.typeBtnT, newRecord.type === 'REVENUE' && {color:'#fff'}]}>RECEITA</Text></TouchableOpacity>
                </View>

                <View style={S.inputG}><Text style={S.inputL}>DESCRIÇÃO</Text><TextInput style={S.input} value={newRecord.description} onChangeText={t=>setNewRecord({...newRecord, description:t})} placeholder="Ex: Venda de Passeio" /></View>
                <View style={S.inputG}><Text style={S.inputL}>ATIVO VINCULADO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newRecord.assetId === v.id && S.pChipA]} onPress={()=>setNewRecord({...newRecord, assetId:v.id})}><Text style={[S.pChipT, newRecord.assetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
                <View style={S.inputG}><Text style={S.inputL}>CATEGORIA</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{(newRecord.type === 'EXPENSE' ? EXPENSE_CATEGORIES : REVENUE_CATEGORIES).map(c => (<TouchableOpacity key={c} style={[S.pChip, newRecord.category === c && S.pChipA]} onPress={()=>setNewRecord({...newRecord, category:c})}><Text style={[S.pChipT, newRecord.category === c && S.pChipTA]}>{c}</Text></TouchableOpacity>))}</ScrollView></View>
                <View style={{flexDirection:'row', gap:10}}><View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>VALOR (R$)</Text><TextInput style={S.input} keyboardType="numeric" value={String(newRecord.amount)} onChangeText={t=>setNewRecord({...newRecord, amount:parseFloat(t)||0})} placeholder="0.00" /></View><View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>DATA</Text><TextInput style={S.input} value={newRecord.date} onChangeText={t=>setNewRecord({...newRecord, date:t})} placeholder="AAAA-MM-DD" /></View></View>
                <TouchableOpacity style={[S.confirmBtn, {backgroundColor: newRecord.type === 'REVENUE' ? '#10B981' : colors.primary}]} onPress={handleSaveRecord}><Text style={S.confirmText}>SALVAR REGISTRO</Text></TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* MODAL CONTA RECORRENTE */}
      <Modal visible={recurringModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={S.modalO}><View style={S.modalC}>
            <View style={S.modalH}><Text style={S.modalT}>AGENDAR CONTA RECORRENTE</Text><TouchableOpacity onPress={() => setRecurringModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false}>
               <View style={S.typeToggle}>
                  <TouchableOpacity style={[S.typeBtn, newRec.type === 'EXPENSE' && {backgroundColor: '#EF4444'}]} onPress={()=>setNewRec({...newRec, type:'EXPENSE'})}><Text style={[S.typeBtnT, newRec.type === 'EXPENSE' && {color:'#fff'}]}>DESPESA</Text></TouchableOpacity>
                  <TouchableOpacity style={[S.typeBtn, newRec.type === 'REVENUE' && {backgroundColor: '#10B981'}]} onPress={()=>setNewRec({...newRec, type:'REVENUE'})}><Text style={[S.typeBtnT, newRec.type === 'REVENUE' && {color:'#fff'}]}>RECEITA</Text></TouchableOpacity>
               </View>

               <View style={S.inputG}><Text style={S.inputL}>CONTA / DESCRIÇÃO</Text><TextInput style={S.input} value={newRec.description} onChangeText={t=>setNewRec({...newRec, description:t})} placeholder="Ex: Aluguel da Vaga" /></View>

               <View style={S.inputG}><Text style={S.inputL}>ATIVO VINCULADO</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>{venues.map(v => (<TouchableOpacity key={v.id} style={[S.pChip, newRec.assetId === v.id && S.pChipA]} onPress={()=>setNewRec({...newRec, assetId:v.id})}><Text style={[S.pChipT, newRec.assetId === v.id && S.pChipTA]}>{v.title.toUpperCase()}</Text></TouchableOpacity>))}</ScrollView></View>
               <View style={{flexDirection:'row', gap:10}}>
                  <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>VALOR (R$)</Text><TextInput style={S.input} keyboardType="numeric" value={String(newRec.amount)} onChangeText={t=>setNewRec({...newRec, amount:parseFloat(t)||0})} /></View>
                  <View style={[S.inputG, {flex:1}]}><Text style={S.inputL}>DIA VENCIMENTO</Text><TextInput style={S.input} value={newRec.nextDueDate} onChangeText={t=>setNewRec({...newRec, nextDueDate:t})} placeholder="AAAA-MM-DD" /></View>
               </View>
               <View style={S.inputG}><Text style={S.inputL}>FREQUÊNCIA</Text><View style={{flexDirection:'row', gap:10}}>{['WEEKLY','MONTHLY','YEARLY'].map(f => (<TouchableOpacity key={f} style={[S.pChip, newRec.frequency === f && S.pChipA]} onPress={()=>setNewRec({...newRec, frequency:f as any})}><Text style={[S.pChipT, newRec.frequency === f && S.pChipTA]}>{f}</Text></TouchableOpacity>))}</View></View>
               
               <View style={S.inputG}>
                  <Text style={S.inputL}>ALERTAR VENCIMENTO</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {[
                      { l: 'Não alertar', v: undefined },
                      { l: 'No dia', v: 0 },
                      { l: '1 dia antes', v: 1 },
                      { l: '3 dias antes', v: 3 },
                      { l: '5 dias antes', v: 5 },
                      { l: '10 dias antes', v: 10 }
                    ].map(opt => (
                      <TouchableOpacity key={String(opt.v)} style={[S.pChip, newRec.alertDaysBefore === opt.v && S.pChipA]} onPress={()=>setNewRec({...newRec, alertDaysBefore: opt.v})}>
                        <Text style={[S.pChipT, newRec.alertDaysBefore === opt.v && S.pChipTA]}>{opt.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
               </View>

               <TouchableOpacity style={[S.confirmBtn, {backgroundColor: newRec.type === 'REVENUE' ? '#10B981' : colors.primary}]} onPress={handleSaveRecurring}><Text style={S.confirmText}>AGENDAR {newRec.type === 'REVENUE' ? 'RECEITA' : 'PAGAMENTO'}</Text></TouchableOpacity>

            </ScrollView>
        </View></View></TouchableWithoutFeedback>
      </Modal>

      {/* MODAL DEFINIR BUDGET */}
      <Modal visible={budgetModalVisible} transparent animationType="fade">
        <View style={S.modalO}><View style={[S.modalC, { marginBottom: '50%' }]}>
           <View style={S.modalH}><Text style={S.modalT}>ORÇAMENTO MENSAL</Text><TouchableOpacity onPress={() => setBudgetModalVisible(false)}><Ionicons name="close" size={24} color={colors.primary} /></TouchableOpacity></View>
           <Text style={S.assetName}>{venues.find(v=>v.id===selectedBudgetAsset)?.title}</Text>
           <View style={[S.inputG, {marginTop:15}]}><Text style={S.inputL}>LIMITE DE GASTOS (R$)</Text><TextInput style={S.input} keyboardType="numeric" value={budgetLimit} onChangeText={setBudgetLimit} placeholder="Ex: 5000" autoFocus /></View>
           <TouchableOpacity style={S.confirmBtn} onPress={handleSaveBudget}><Text style={S.confirmText}>DEFINIR BUDGET</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pHeader: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 25, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
  pTitle: { color: colors.primary, fontSize: 32, fontWeight: '900', letterSpacing: -1 },
  pSub: { fontSize: 11, fontWeight: '900', color: colors.textLight, letterSpacing: 1, textTransform: 'uppercase' },
  addBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  cardMain: { backgroundColor: '#fff', padding: 20, borderRadius: 24, borderWidth: 1, borderColor: colors.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
  cardL: { fontSize: 10, fontWeight: '900', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  cardV: { fontSize: 28, fontWeight: '900', color: colors.primary, marginTop: 4 },
  cardBudget: { fontSize: 18, fontWeight: '800', color: colors.accent, marginTop: 4 },
  progressC: { height: 10, backgroundColor: colors.divider, borderRadius: 5, marginVertical: 12, overflow:'hidden' },
  progressB: { height: '100%', borderRadius: 5 },
  progressT: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },

  tabBar: { flexDirection: 'row', gap: 20, paddingHorizontal: 25, marginTop: 25 },
  tab: { paddingBottom: 8 },
  tabA: { borderBottomWidth: 3, borderBottomColor: colors.accent },
  tabT: { fontSize: 12, fontWeight: '800', color: colors.textLight },
  tabTA: { color: colors.accent },

  locBar: { marginTop: 15 },
  filterScroll: { paddingHorizontal: 20, paddingBottom: 15 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, marginRight: 8 },
  filterChipA: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipT: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  filterChipTA: { color: '#fff' },

  content: { padding: 20 },
  secTitle: { fontSize: 10, fontWeight: '900', color: colors.textLight, letterSpacing: 1, marginBottom: 15 },
  assetCard: { flexDirection: 'row', backgroundColor: '#fff', padding: 18, borderRadius: 20, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  assetInfo: { flex: 1 },
  assetName: { fontSize: 16, fontWeight: '900', color: colors.primary },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  costItem: { fontSize: 11, fontWeight: '700' },
  costDivider: { color: colors.border },
  minProgress: { height: 3, backgroundColor: '#F1F5F9', borderRadius: 2, marginTop: 10, width: '80%' },
  minBar: { height: '100%', borderRadius: 2 },
  assetVal: { alignItems: 'flex-end', marginRight: 15 },
  assetTotal: { fontSize: 16, fontWeight: '900', color: colors.primary },
  assetPerc: { fontSize: 9, fontWeight: '800', color: colors.textLight, marginTop: 2 },
  expenseItem: { flexDirection: 'row', backgroundColor: '#fff', padding: 16, borderRadius: 16, marginBottom: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  expIcon: { width: 44, height: 44, borderRadius: 12, justifyContent:'center', alignItems:'center', marginRight: 15 },
  expTitle: { fontSize: 14, fontWeight: '800', color: colors.primary },
  expMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  expAmount: { fontSize: 16, fontWeight: '900', color: colors.primary },
  modalO: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalT: { fontSize: 10, fontWeight: '900', color: colors.textLight, letterSpacing: 1 },
  inputG: { marginBottom: 20 },
  inputL: { fontSize: 10, fontWeight: '900', color: colors.textLight, marginBottom: 8 },
  input: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: colors.border },
  pChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pChipA: { backgroundColor: colors.accent, borderColor: colors.accent },
  pChipT: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  pChipTA: { color: '#fff' },
  confirmBtn: { backgroundColor: colors.accent, padding: 18, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1 },

  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  typeBtnT: { fontSize: 11, fontWeight: '900', color: colors.textLight },
  alertBox: { backgroundColor: '#FFF7ED', padding: 16, borderRadius: 20, marginBottom: 25, borderWidth: 1, borderColor: '#FED7AA' },
  alertH: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  alertHT: { fontSize: 10, fontWeight: '900', color: '#B45309', letterSpacing: 1 },
  alertItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  alertDesc: { fontSize: 12, fontWeight: '700', color: colors.primary, flex: 1 },
  alertDate: { fontSize: 11, fontWeight: '800', color: '#B45309', marginRight: 15 },
  alertVal: { fontSize: 12, fontWeight: '900', color: colors.primary },
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContent: { backgroundColor: '#fff', borderRadius: 32, padding: 24, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  menuTitle: { fontSize: 10, fontWeight: '900', color: colors.textLight, letterSpacing: 1.5, textAlign: 'center', marginBottom: 25 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 16 },
  menuIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  menuItemT: { fontSize: 16, fontWeight: '800', color: colors.primary },
  menuItemS: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  menuClose: { marginTop: 20, alignItems: 'center', padding: 10 },
  menuCloseT: { fontSize: 12, fontWeight: '900', color: '#EF4444', letterSpacing: 1 },
});

