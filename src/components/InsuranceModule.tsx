import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView,
  Alert, Image, KeyboardAvoidingView, Platform, Keyboard, TouchableWithoutFeedback, DeviceEventEmitter
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ValueInput, parseLocaleAmountString } from './ValueInput';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { InsuranceService } from '../services/insuranceService';
import { CostService } from '../services/costService';
import { RecurringCost } from '../types/costs';
import {
  InsurancePolicy, InsurancePolicyType,
  POLICY_TYPE_LABELS, POLICY_TYPES_BY_ASSET, POLICY_STATUS_CONFIG,
} from '../types/insurance';
import * as ImagePicker from 'expo-image-picker';
import { processReceiptImage } from '../services/ocrService';
import { useAuth } from '../hooks/useAuth';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect } from 'expo-router';
import { formatDate } from '../i18n/formatters';
import { useTranslation } from 'react-i18next';
import { uploadFile, docRemotePath } from '../services/storageService';


import DatePickerButton from './DatePickerButton';
interface Props {
  assetId: string;
  assetType: string;
}

export function InsuranceModule({ assetId, assetType }: Props) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const S = useMemo(() => createInsuranceModuleStyles(C), [C]);
  const { user } = useAuth();
  const [policies, setPolicies] = useState<InsurancePolicy[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);
  const [detailPolicy, setDetailPolicy] = useState<InsurancePolicy | null>(null);

  // Form state
  const [form, setForm] = useState<Partial<InsurancePolicy>>({});

  const availableTypes = POLICY_TYPES_BY_ASSET[assetType] || POLICY_TYPES_BY_ASSET.OTHER;

  const loadPolicies = async () => {
    const data = await InsuranceService.getPolicies(assetId, user?.email);
    setPolicies(data);
  };

  useEffect(() => { loadPolicies(); }, [assetId]);
  useFocusEffect(useCallback(() => { loadPolicies(); }, [assetId]));

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('FAB_ADD_PRESSED', openCreateModal);
    return () => sub.remove();
  }, [availableTypes, assetId]);

  const openCreateModal = () => {
    setEditingPolicy(null);
    setForm({
      assetId,
      type: availableTypes[0],
      insurer: '',
      policyNumber: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '',
      premiumValue: 0,
      deductible: 0,
      coverageAmount: 0,
      coverageDetails: '',
      brokerName: '',
      brokerPhone: '',
      documentUri: '',
      alertDaysBefore: 10,
    });
    setModalVisible(true);
  };

  const openEditModal = (policy: InsurancePolicy) => {
    setEditingPolicy(policy);
    setForm({ ...policy });
    setModalVisible(true);
    setDetailPolicy(null);
  };

  const handleSave = async () => {
    if (!form.insurer || !form.policyNumber || !form.endDate) {
      return Alert.alert(t('common.attention'), t('insurance.fillRequired'));
    }

    const policy: InsurancePolicy = {
      id: editingPolicy?.id || `ins_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      assetId,
      type: (form.type || availableTypes[0]) as InsurancePolicyType,
      insurer: form.insurer || '',
      policyNumber: form.policyNumber || '',
      startDate: form.startDate || new Date().toISOString().split('T')[0],
      endDate: form.endDate || '',
      premiumValue: Number(form.premiumValue) || 0,
      deductible: Number(form.deductible) || 0,
      coverageAmount: Number(form.coverageAmount) || 0,
      coverageDetails: form.coverageDetails || '',
      brokerName: form.brokerName,
      brokerPhone: form.brokerPhone,
      documentUri: form.documentUri,
      alertDaysBefore: form.alertDaysBefore ?? 10,
      status: 'ACTIVE',
      createdAt: editingPolicy?.createdAt || new Date().toISOString(),
    };

    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));

    await InsuranceService.savePolicy(policy, user.email);

    // Upload do documento da apólice para R2 em background
    if (policy.documentUri && !editingPolicy) {
      const remotePath = docRemotePath(user.email, policy.id, `insurance_${policy.policyNumber}`);
      uploadFile(policy.documentUri, remotePath).then(async (res) => {
        if ((res?.url || res?.provider === 'dropbox') && user?.email) {
          const cloudUri = res?.url || res?.path || policy.documentUri;
          await InsuranceService.savePolicy({ ...policy, documentUri: cloudUri }, user.email);
        }
      }).catch(() => {});
    }

    // Auto-create recurring cost in Custos module
    const recurringCost: RecurringCost = {
      id: `ins_cost_${policy.id}`,
      assetId: policy.assetId,
      description: `Seguro ${POLICY_TYPE_LABELS[policy.type]} — ${policy.insurer}`,
      amount: policy.premiumValue,
      category: 'SEGURO',
      type: 'EXPENSE',
      frequency: 'YEARLY',
      nextDueDate: policy.endDate,
      status: 'ACTIVE',
      alertDaysBefore: policy.alertDaysBefore ?? 10,
    };
    await CostService.saveRecurringCost(recurringCost, user.email);

    setModalVisible(false);
    loadPolicies();
    Alert.alert(t('insurance.policySaved'), t('insurance.policySavedMsg', { type: POLICY_TYPE_LABELS[policy.type], insurer: policy.insurer }));
  };


  const handleDelete = (policy: InsurancePolicy) => {
    Alert.alert(t('insurance.deletePolicy'), t('insurance.deletePolicyConfirm', { number: policy.policyNumber }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: async () => {
        if (user?.email) {
          await InsuranceService.deletePolicy(policy.id, user.email);
          setDetailPolicy(null);
          loadPolicies();
        }
      }}
    ]);
  };

  const pickDocument = () => {
    Alert.alert(t('insurance.attachDocument'), t('insurance.attachSource'), [
      {
        text: t('insurance.cameraSource'),
        onPress: async () => {
          const res = await ImagePicker.launchCameraAsync({ quality: 0.6 });
          if (!res.canceled) setForm(f => ({ ...f, documentUri: res.assets[0].uri, documentName: undefined }));
        },
      },
      {
        text: t('insurance.gallerySource'),
        onPress: async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
          if (!res.canceled) setForm(f => ({ ...f, documentUri: res.assets[0].uri, documentName: undefined }));
        },
      },
      {
        text: t('insurance.fileSource'),
        onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*', '*/*'] });
          if (!res.canceled && res.assets && res.assets.length > 0) {
            setForm(f => ({ ...f, documentUri: res.assets[0].uri, documentName: res.assets[0].name }));
          }
        },
      },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const daysRemaining = (endDate: string) => InsuranceService.daysRemaining(endDate);
  const fmt = (v: number) => InsuranceService.formatCurrency(v);

  // Summary stats
  const activeCount = policies.filter(p => p.status === 'ACTIVE').length;
  const expiringCount = policies.filter(p => p.status === 'EXPIRING_SOON').length;
  const expiredCount = policies.filter(p => p.status === 'EXPIRED').length;
  const totalPremium = policies.reduce((sum, p) => sum + (p.premiumValue || 0), 0);

  const renderPolicyCard = (policy: InsurancePolicy) => {
    const cfg = POLICY_STATUS_CONFIG[policy.status];
    const days = daysRemaining(policy.endDate);

    return (
      <TouchableOpacity
        key={policy.id}
        style={S.policyCard}
        activeOpacity={0.7}
        onPress={() => setDetailPolicy(policy)}
      >
        <View style={[S.statusBar, { backgroundColor: cfg.color }]} />
        <View style={S.cardBody}>
          <View style={S.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={S.cardInsurer}>{policy.insurer}</Text>
              <Text style={S.cardType}>{POLICY_TYPE_LABELS[policy.type]}</Text>
            </View>
            <View style={[S.statusBadge, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
              <Text style={[S.statusBadgeT, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          <View style={S.cardMeta}>
            <View style={S.metaItem}>
              <Text style={S.metaLabel}>{t('insurance.policyLabel')}</Text>
              <Text style={S.metaValue}>{policy.policyNumber}</Text>
            </View>
            <View style={S.metaItem}>
              <Text style={S.metaLabel}>{t('insurance.expiryLabel')}</Text>
              <Text style={[S.metaValue, days <= (policy.alertDaysBefore ?? 30) && days >= 0 && { color: '#D97706' }, days < 0 && { color: '#DC2626' }]}>
                {formatDate(policy.endDate)}
              </Text>
            </View>
            <View style={S.metaItem}>
              <Text style={S.metaLabel}>{t('insurance.premiumShort')}</Text>
              <Text style={S.metaValue}>{fmt(policy.premiumValue)}</Text>
            </View>
          </View>

          {/* Days indicator */}
          <View style={S.daysRow}>
            <Ionicons
              name={days < 0 ? 'alert-circle' : days <= (policy.alertDaysBefore ?? 30) ? 'time' : 'shield-checkmark'}
              size={14}
              color={days < 0 ? '#DC2626' : days <= (policy.alertDaysBefore ?? 30) ? '#D97706' : '#059669'}
            />
            <Text style={[S.daysText, { color: days < 0 ? '#DC2626' : days <= (policy.alertDaysBefore ?? 30) ? '#D97706' : '#059669' }]}>
              {days < 0 ? t('insurance.expiredAgo', { days: Math.abs(days) }) : days === 0 ? t('insurance.expiresToday') : t('insurance.daysRemaining', { days })}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={S.container}>
      {/* Summary strip */}
      {policies.length > 0 && (
        <View style={S.summaryRow}>
          <View style={[S.summaryItem, { backgroundColor: '#ECFDF5' }]}>
            <Text style={[S.summaryVal, { color: '#059669' }]}>{activeCount}</Text>
            <Text style={[S.summaryLbl, { color: '#059669' }]}>{t('insurance.summaryActive')}</Text>
          </View>
          <View style={[S.summaryItem, { backgroundColor: '#FFFBEB' }]}>
            <Text style={[S.summaryVal, { color: '#D97706' }]}>{expiringCount}</Text>
            <Text style={[S.summaryLbl, { color: '#D97706' }]}>{t('insurance.summaryExpiring')}</Text>
          </View>
          <View style={[S.summaryItem, { backgroundColor: '#FEF2F2' }]}>
            <Text style={[S.summaryVal, { color: '#DC2626' }]}>{expiredCount}</Text>
            <Text style={[S.summaryLbl, { color: '#DC2626' }]}>{t('insurance.summaryExpired')}</Text>
          </View>
          <View style={[S.summaryItem, { backgroundColor: '#EFF6FF' }]}>
            <Text style={[S.summaryVal, { color: C.accent }]}>{fmt(totalPremium)}</Text>
            <Text style={[S.summaryLbl, { color: C.accent }]}>{t('insurance.summaryTotal')}</Text>
          </View>
        </View>
      )}

      {/* Policies list */}
      {policies.length === 0 ? (
        <View style={S.empty}>
          <Ionicons name="umbrella-outline" size={48} color={C.textLight} />
          <Text style={S.emptyTitle}>{t('insurance.noPolicy')}</Text>
          <Text style={S.emptySub}>{t('insurance.noPolicySub')}</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          {policies.map(renderPolicyCard)}
        </ScrollView>
      )}

      {/* DETAIL MODAL */}
      <Modal visible={!!detailPolicy} transparent animationType="slide">
        <View style={S.modalOverlay}>
          <View style={S.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={S.modalHeader}>
                <Text style={S.modalHeaderT}>{t('insurance.policyDetails')}</Text>
                <TouchableOpacity onPress={() => setDetailPolicy(null)}>
                  <Ionicons name="close" size={24} color={C.primary} />
                </TouchableOpacity>
              </View>

              {detailPolicy && (() => {
                const cfg = POLICY_STATUS_CONFIG[detailPolicy.status];
                const days = daysRemaining(detailPolicy.endDate);
                return (
                  <>
                    {/* Header */}
                    <View style={{ flexDirection: 'row', gap: 14, marginBottom: 20 }}>
                      <View style={[S.detailIcon, { backgroundColor: cfg.bg }]}>
                        <Ionicons name={cfg.icon as any} size={32} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 20, fontWeight: '900', color: C.primary }}>{detailPolicy.insurer}</Text>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: C.textSecondary, marginTop: 2 }}>{POLICY_TYPE_LABELS[detailPolicy.type]}</Text>
                        <View style={[S.statusBadge, { backgroundColor: cfg.bg, marginTop: 6 }]}>
                          <Ionicons name={cfg.icon as any} size={12} color={cfg.color} />
                          <Text style={[S.statusBadgeT, { color: cfg.color }]}>{cfg.label} — {days < 0 ? `vencida há ${Math.abs(days)}d` : `${days}d restantes`}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Grid de dados */}
                    <View style={S.detailGrid}>
                      {[
                        { label: t('insurance.policyLabel'), value: detailPolicy.policyNumber },
                        { label: t('insurance.validityLabel'), value: `${formatDate(detailPolicy.startDate)} → ${formatDate(detailPolicy.endDate)}` },
                        { label: t('insurance.annualPremium'), value: fmt(detailPolicy.premiumValue) },
                        { label: t('insurance.deductibleShort'), value: fmt(detailPolicy.deductible) },
                        { label: t('insurance.coverageShort'), value: fmt(detailPolicy.coverageAmount) },
                        { label: t('insurance.alertShort'), value: detailPolicy.alertDaysBefore != null ? t('insurance.daysBeforeAlert', { days: detailPolicy.alertDaysBefore }) : t('insurance.daysBeforeAlert', { days: 30 }) },
                      ].map((row, i) => (
                        <View key={i} style={S.detailRow}>
                          <Text style={S.detailLabel}>{row.label}</Text>
                          <Text style={S.detailValue}>{row.value}</Text>
                        </View>
                      ))}
                    </View>

                    {detailPolicy.coverageDetails ? (
                      <View style={{ marginBottom: 16 }}>
                        <Text style={S.detailLabel}>{t('insurance.coverageDetailsTitle')}</Text>
                        <Text style={{ fontSize: 13, color: C.primary, marginTop: 4, lineHeight: 20 }}>{detailPolicy.coverageDetails}</Text>
                      </View>
                    ) : null}

                    {(detailPolicy.brokerName || detailPolicy.brokerPhone) && (
                      <View style={S.brokerCard}>
                        <Ionicons name="person-circle-outline" size={24} color={C.accent} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: C.primary }}>{detailPolicy.brokerName || '—'}</Text>
                          <Text style={{ fontSize: 12, color: C.textSecondary }}>{detailPolicy.brokerPhone || t('insurance.noPhone')}</Text>
                        </View>
                      </View>
                    )}

                    {detailPolicy.documentUri && (
                      <View style={{ marginBottom: 20 }}>
                        <Text style={S.detailLabel}>{t('insurance.attachedDocument')}</Text>
                        <Image source={{ uri: detailPolicy.documentUri }} style={S.docPreview} />
                      </View>
                    )}

                    {/* Action buttons */}
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TouchableOpacity style={[S.actionBtn, { flex: 1, backgroundColor: C.accent }]} onPress={() => openEditModal(detailPolicy)}>
                        <Ionicons name="create-outline" size={18} color="#fff" />
                        <Text style={S.actionBtnT}>{t('common.edit')}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[S.actionBtn, { backgroundColor: '#FEF2F2' }]} onPress={() => handleDelete(detailPolicy)}>
                        <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* CREATE/EDIT MODAL */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={S.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
              <View style={[S.modalContent, { maxHeight: '92%' }]}>
                <View style={S.modalHeader}>
                  <Text style={S.modalHeaderT}>{editingPolicy ? t('insurance.editPolicy') : t('insurance.newPolicy')}</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Ionicons name="close" size={24} color={C.primary} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  {/* Policy Type Chips */}
                  <Text style={S.fieldLabel}>{t('insurance.typeLabel')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} keyboardShouldPersistTaps="handled">
                    {availableTypes.map(t => (
                      <TouchableOpacity
                        key={t}
                        style={[S.chip, form.type === t && S.chipActive]}
                        onPress={() => setForm(f => ({ ...f, type: t }))}
                      >
                        <Text style={[S.chipT, form.type === t && S.chipTA]}>{POLICY_TYPE_LABELS[t]}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  <Text style={S.fieldLabel}>{t('insurance.insurerLabel')}</Text>
                  <TextInput
                    style={S.input}
                    placeholder={t('insurance.insurerPlaceholder')}
                    value={form.insurer}
                    onChangeText={t => setForm(f => ({ ...f, insurer: t }))}
                  returnKeyType="done"
                      />

                  <Text style={S.fieldLabel}>{t('insurance.policyNumberLabel')}</Text>
                  <TextInput
                    style={S.input}
                    placeholder={t('insurance.policyPlaceholder')}
                    value={form.policyNumber}
                    onChangeText={t => setForm(f => ({ ...f, policyNumber: t }))}
                  returnKeyType="done"
                      />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ gap: 12 }}>
                    <DatePickerButton
                      label={t('insurance.startDateLabel')}
                      value={form.startDate}
                      onChange={v => setForm(f => ({ ...f, startDate: v }))}
                      accentColor="#6366F1"
                    />
                    <DatePickerButton
                      label={t('insurance.endDateLabel')}
                      value={form.endDate}
                      onChange={v => setForm(f => ({ ...f, endDate: v }))}
                      accentColor="#6366F1"
                    />
                  </View>
                  </View>

                  {/* Alert Days Before — mesma UX do módulo de Custos */}
                  <Text style={S.fieldLabel}>{t('insurance.alertLabel')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} keyboardShouldPersistTaps="handled">
                    {[
                      { l: t('insurance.alertOptions.none'), v: undefined },
                      { l: t('insurance.alertOptions.sameDay'), v: 0 },
                      { l: t('insurance.alertOptions.1day'), v: 1 },
                      { l: t('insurance.alertOptions.3days'), v: 3 },
                      { l: t('insurance.alertOptions.5days'), v: 5 },
                      { l: t('insurance.alertOptions.10days'), v: 10 },
                      { l: t('insurance.alertOptions.30days'), v: 30 },
                      { l: t('insurance.alertOptions.60days'), v: 60 },
                    ].map(opt => (
                      <TouchableOpacity
                        key={String(opt.v)}
                        style={[S.chip, form.alertDaysBefore === opt.v && S.chipActive]}
                        onPress={() => setForm(f => ({ ...f, alertDaysBefore: opt.v }))}
                      >
                        <Text style={[S.chipT, form.alertDaysBefore === opt.v && S.chipTA]}>{opt.l}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>


                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.fieldLabel}>{t('insurance.premiumLabel')}</Text>
                      <ValueInput
                        style={S.input}
                        placeholder="0,00"
                        value={form.premiumValue ? String(form.premiumValue) : ''}
                        onChangeText={v => setForm((f) => ({ ...f, premiumValue: parseLocaleAmountString(v) }))}
                        currency
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.fieldLabel}>{t('insurance.deductibleLabel')}</Text>
                      <ValueInput
                        style={S.input}
                        placeholder="0,00"
                        value={form.deductible ? String(form.deductible) : ''}
                        onChangeText={v => setForm((f) => ({ ...f, deductible: parseLocaleAmountString(v) }))}
                        currency
                      />
                    </View>
                  </View>

                  <Text style={S.fieldLabel}>{t('insurance.coverageAmountLabel')}</Text>
                  <ValueInput
                    style={S.input}
                    placeholder="0,00"
                    value={form.coverageAmount ? String(form.coverageAmount) : ''}
                    onChangeText={v => setForm((f) => ({ ...f, coverageAmount: parseLocaleAmountString(v) }))}
                    currency
                  />

                  <Text style={S.fieldLabel}>{t('insurance.coverageDetailsLabel')}</Text>
                  <TextInput
                    style={[S.input, { height: 70 }]}
                    multiline
                    placeholder="Descreva o que está coberto..."
                    value={form.coverageDetails}
                    onChangeText={t => setForm(f => ({ ...f, coverageDetails: t }))}
                  />

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={S.fieldLabel}>{t('insurance.brokerNameLabel')}</Text>
                      <TextInput
                        style={S.input}
                        placeholder="Nome do corretor"
                        value={form.brokerName}
                        onChangeText={t => setForm(f => ({ ...f, brokerName: t }))}
                      returnKeyType="done"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={S.fieldLabel}>{t('insurance.brokerPhoneLabel')}</Text>
                      <TextInput
                        style={S.input}
                        keyboardType="phone-pad"
                        placeholder="(11) 99999-0000"
                        value={form.brokerPhone}
                        onChangeText={t => setForm(f => ({ ...f, brokerPhone: t }))}
                      returnKeyType="done"
                      />
                    </View>
                  </View>

                  {/* Document upload */}
                  <Text style={S.fieldLabel}>{t('insurance.documentLabel')}</Text>
                  <TouchableOpacity style={S.docUpload} onPress={pickDocument}>
                    {form.documentUri ? (
                      (form as any).documentName && !(form.documentUri || '').match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                        <View style={[S.docPlaceholder, { borderStyle: 'solid', borderColor: '#059669', backgroundColor: '#ECFDF5' }]}>
                          <Ionicons name="document-attach" size={28} color="#059669" />
                          <Text style={[S.docPlaceholderT, { color: '#059669' }]} numberOfLines={1}>{(form as any).documentName}</Text>
                        </View>
                      ) : (
                        <Image source={{ uri: form.documentUri }} style={S.docThumb} />
                      )
                    ) : (
                      <View style={S.docPlaceholder}>
                        <Ionicons name="cloud-upload" size={28} color={C.textLight} />
                        <Text style={S.docPlaceholderT}>{t('insurance.documentHint')}</Text>
                      </View>
                    )}
                  </TouchableOpacity>


                  <TouchableOpacity style={S.saveBtn} onPress={handleSave}>
                    <Text style={S.saveBtnT}>{t('insurance.savePolicy')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

function createInsuranceModuleStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, padding: 16 },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  summaryItem: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  summaryVal: { fontSize: 14, fontWeight: '900', letterSpacing: -0.3 },
  summaryLbl: { fontSize: 7, fontWeight: '900', marginTop: 2, letterSpacing: 0.6, textTransform: 'uppercase' },

  // Empty
  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: C.primary, marginTop: 16, letterSpacing: -0.4 },
  emptySub: { fontSize: 11, color: C.textSecondary, marginTop: 8, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20, fontWeight: '500' },

  // Policy Card
  policyCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 18, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  statusBar: { width: 5 },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  cardInsurer: { fontSize: 14, fontWeight: '900', color: C.primary, letterSpacing: -0.2 },
  cardType: { fontSize: 10, fontWeight: '800', color: C.textSecondary, marginTop: 2, textTransform: 'uppercase' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  statusBadgeT: { fontSize: 9, fontWeight: '900' },
  cardMeta: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 7, fontWeight: '900', color: C.textLight, letterSpacing: 0.6, textTransform: 'uppercase' },
  metaValue: { fontSize: 11, fontWeight: '800', color: C.primary, marginTop: 2 },
  daysRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.border },
  daysText: { fontSize: 10, fontWeight: '900' },

  // FAB
  stdAddBtn: { position: 'absolute', bottom: 30, right: 20, zIndex: 10, width: 60, height: 60, borderRadius: 30, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 40, width: '100%', maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalHeaderT: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase', letterSpacing: 1.2 },

  // Detail
  detailIcon: { width: 64, height: 64, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  detailGrid: { marginBottom: 16 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  detailLabel: { fontSize: 8, fontWeight: '900', color: C.textLight, letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { fontSize: 11, fontWeight: '800', color: C.primary },
  brokerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 14, borderRadius: 14, marginBottom: 20 },
  docPreview: { width: '100%', height: 180, borderRadius: 14, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 14, borderRadius: 14, justifyContent: 'center' },
  actionBtnT: { color: '#fff', fontWeight: '900', fontSize: 14 },

  // Form
  fieldLabel: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 6, letterSpacing: 0.6, textTransform: 'uppercase' },
  input: { backgroundColor: C.background, padding: 14, borderRadius: 12, fontSize: 13, fontWeight: '700', marginBottom: 14, borderWidth: 1, borderColor: C.border },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  chipTA: { color: '#fff' },
  docUpload: { marginBottom: 20 },
  docThumb: { width: '100%', height: 140, borderRadius: 14 },
  docPlaceholder: { width: '100%', height: 100, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 2, borderColor: C.border, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  docPlaceholderT: { fontSize: 11, fontWeight: '800', color: C.textLight, marginTop: 6 },
  saveBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 8, marginBottom: 20 },
  saveBtnT: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1 },
  });
}
