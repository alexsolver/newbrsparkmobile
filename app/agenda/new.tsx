import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, Modal, FlatList, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../src/hooks/useAuth';
import { AgendaService, AGENDA_COLORS } from '../../src/services/agendaService';
import { AgendaEvent, EventCategory } from '../../src/types/agenda';
import { getLocalAssets } from '../../src/database';
import { ColorPalette } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useTranslation } from 'react-i18next';

const CATEGORIES: { label: string; value: EventCategory; color: string; icon: string }[] = [
  { label: 'Reserva / Aluguel', value: 'BOOKING', color: AGENDA_COLORS.BOOKING, icon: 'bed-outline' },
  { label: 'Manutenção', value: 'MAINTENANCE', color: AGENDA_COLORS.MAINTENANCE, icon: 'build-outline' },
  { label: 'Tarefa', value: 'TASK', color: AGENDA_COLORS.TASK, icon: 'list-outline' },
  { label: 'Reunião', value: 'MEETING', color: AGENDA_COLORS.MEETING, icon: 'people-outline' },
];

export default function NewAgendaScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ prefillAssetId?: string }>();
  const { user } = useAuth();
  const assets = getLocalAssets(undefined, { includeMobileWarehouse: false }) || [];
  const { colors: C } = useTheme();
  const styles = useMemo(() => createNewAgendaStyles(C), [C]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('BOOKING');
  const [assetId, setAssetId] = useState<string>('');

  useEffect(() => {
    const raw = params.prefillAssetId;
    const id = Array.isArray(raw) ? raw[0] : raw;
    if (id && String(id).trim()) {
      setAssetId(String(id).trim());
    }
  }, [params.prefillAssetId]);

  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  
  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim())
      return Alert.alert(t('common.error'), t('appAlerts.agendaNew.titleRequired'));
    if (startDate > endDate)
      return Alert.alert(t('common.error'), t('appAlerts.agendaNew.endBeforeStart'));
    if (!user?.email) return Alert.alert(t('common.error'), t('appAlerts.agendaNew.loginRequired'));

    const selectedColor = CATEGORIES.find(c => c.value === category)?.color || AGENDA_COLORS.BOOKING;

    const newEvent: AgendaEvent = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        title: title.trim(),
        description: description.trim(),
        category,
        assetId: assetId || undefined,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        color: selectedColor,
        isAllDay: true,
        source: 'MANUAL',
        ownerEmail: user.email
    };

    setSaving(true);
    try {
      await AgendaService.saveEvent(newEvent, user.email);
      Alert.alert(t('common.success'), t('appAlerts.agendaNew.saveSuccess'));
      router.back();
    } catch (e: any) {
      console.error(e);
      Alert.alert(t('common.error'), t('appAlerts.agendaNew.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const selectedAsset = assets.find(a => a.id === assetId);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header Modal */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => router.back()}>
          <Text style={styles.headerBtnText}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Novo Evento</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={handleSave} disabled={saving}>
          <Text style={[styles.headerBtnText, { color: C.status.info.fg, fontWeight: '800' }]}>{saving ? '...' : 'Salvar'}</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView
          style={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        >
          
          {/* CATEGORY PICKER */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity 
                key={cat.value} 
                style={[styles.categoryPill, category === cat.value && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => setCategory(cat.value)}
              >
                <Ionicons name={cat.icon as any} size={16} color={category === cat.value ? C.cardWhite : C.textSecondary} />
                <Text style={[styles.categoryText, category === cat.value && { color: C.cardWhite }]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ASSET SELECTOR */}
          <Text style={styles.label}>Vincular a um Ativo (Opcional)</Text>
          <TouchableOpacity style={styles.pickerButton} onPress={() => setShowAssetModal(true)}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name={selectedAsset ? "home" : "apps-outline"} size={20} color={selectedAsset ? C.status.info.fg : C.textSecondary} style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 16, color: selectedAsset ? C.slate : C.textLight, fontWeight: selectedAsset ? '700' : '500' }}>
                {selectedAsset ? selectedAsset.title : 'Selecione um ativo...'}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color={C.textLight} />
          </TouchableOpacity>

          {/* BASIC INFO */}
          <Text style={styles.label}>Título do Evento</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: Pintura da Fachada"
            value={title}
            onChangeText={setTitle}
            autoCorrect={false}
          />

          {/* DATETIME */}
          <View style={styles.row}>
            <View style={styles.flexHalf}>
              <Text style={styles.label}>Início</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStartPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={C.textSecondary} />
                <Text style={styles.dateBtnText}>{startDate.toLocaleDateString('pt-BR')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.flexHalf}>
              <Text style={styles.label}>Fim</Text>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEndPicker(true)}>
                <Ionicons name="calendar-outline" size={18} color={C.textSecondary} />
                <Text style={styles.dateBtnText}>{endDate.toLocaleDateString('pt-BR')}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {showStartPicker && (
            <DateTimePicker
              value={startDate}
              mode="date"
              display="default"
              onChange={(evt, date) => {
                setShowStartPicker(Platform.OS === 'ios');
                if (date) {
                    setStartDate(date);
                    if (date > endDate) setEndDate(date); // Auto-adjust end date
                }
              }}
            />
          )}

          {showEndPicker && (
            <DateTimePicker
              value={endDate}
              minimumDate={startDate}
              mode="date"
              display="default"
              onChange={(evt, date) => {
                setShowEndPicker(Platform.OS === 'ios');
                if (date) setEndDate(date);
              }}
            />
          )}

          {/* DESC */}
          <Text style={styles.label}>Descrição (Opcional)</Text>
          <TextInput
            style={[styles.input, { height: 100, paddingTop: 16, textAlignVertical: 'top' }]}
            placeholder="Detalhes adicionais sobre o bloqueio ou serviço..."
            value={description}
            onChangeText={setDescription}
            multiline
          />

        </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* ASSET SELECTION MODAL */}
      <Modal visible={showAssetModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecione o ativo</Text>
              <TouchableOpacity onPress={() => setShowAssetModal(false)}>
                <Ionicons name="close" size={24} color={C.slate} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={[{ id: '', title: 'Nenhum / Geral' }, ...assets]}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={[styles.modalItem, assetId === item.id && { backgroundColor: C.status.info.bg }]}
                  onPress={() => { setAssetId(item.id); setShowAssetModal(false); }}
                >
                  <Text style={[styles.modalItemText, assetId === item.id && { color: C.status.info.fg, fontWeight: '800' }]}>{item.title}</Text>
                  {assetId === item.id && <Ionicons name="checkmark" size={20} color={C.status.info.fg} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

function createNewAgendaStyles(C: ColorPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.divider },
    headerTitle: { fontSize: 16, fontWeight: '900', color: C.slate },
    headerBtn: { padding: 8 },
    headerBtnText: { fontSize: 15, fontWeight: '600', color: C.textSecondary },
    content: { flex: 1, padding: 20 },
    label: { fontSize: 13, fontWeight: '800', color: C.textSecondary, textTransform: 'uppercase', marginBottom: 8, marginTop: 16, letterSpacing: 0.5 },
    input: { backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, fontSize: 16, color: C.slate, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
    pickerButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, elevation: 1 },
    
    categoryScroll: { flexDirection: 'row', marginBottom: 12, paddingVertical: 4 },
    categoryPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, marginRight: 12, gap: 6 },
    categoryText: { fontSize: 13, fontWeight: '800', color: C.textSecondary },

    row: { flexDirection: 'row', gap: 12 },
    flexHalf: { flex: 1 },
    dateBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.cardWhite, borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 16, gap: 8 },
    dateBtnText: { fontSize: 15, fontWeight: '700', color: C.slate },

    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: C.cardWhite, borderTopLeftRadius: 24, borderTopRightRadius: 24, minHeight: 400, maxHeight: '80%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: C.divider },
    modalTitle: { fontSize: 18, fontWeight: '900', color: C.slate },
    modalItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.divider },
    modalItemText: { fontSize: 16, fontWeight: '600', color: C.textSecondary },
  });
}
