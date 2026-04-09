/**
 * PrivacySettings — BrSpark Field Service
 *
 * Tela "Minha Privacidade" acessível pelo perfil do técnico.
 * Permite visualizar e revogar aceites de consentimento a qualquer momento.
 */
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Switch, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch, isTechnicianProfileActive } from '../../src/services/auth';
import { useAuth } from '../../src/hooks/useAuth';

interface ConsentRecord {
  id: string;
  consentType: string;
  accepted: boolean;
  acceptedAt: string;
  revokedAt: string | null;
}

const CONSENT_LABELS: Record<string, { title: string; desc: string; icon: string }> = {
  LOCATION_BACKGROUND: {
    title: 'Localização em segundo plano',
    desc: 'GPS ativo durante atendimentos, mesmo com o app minimizado.',
    icon: 'navigate-outline',
  },
  LOCATION_FOREGROUND: {
    title: 'Localização com app aberto',
    desc: 'GPS somente enquanto o app está aberto.',
    icon: 'locate-outline',
  },
  DEVICE_TELEMETRY: {
    title: 'Status do dispositivo',
    desc: 'Bateria, conexão (Wi-Fi/4G) e modelo do aparelho.',
    icon: 'hardware-chip-outline',
  },
  DATA_RETENTION: {
    title: 'Política de retenção',
    desc: 'Ciência sobre os prazos de armazenamento dos seus dados.',
    icon: 'time-outline',
  },
};

function consentLabelForRole(
  consentType: string,
  isTechnician: boolean
): { title: string; desc: string; icon: string } {
  const base = CONSENT_LABELS[consentType];
  if (!base) return { title: consentType, desc: '', icon: 'ellipse-outline' };
  if (consentType === 'LOCATION_FOREGROUND' && !isTechnician) {
    return {
      ...base,
      desc: 'Mapa de ativos e GPS ao cadastrar bens — só com o app aberto.',
    };
  }
  return base;
}

export default function PrivacySettings() {
  const { user, userRole } = useAuth();
  const isTechnician = userRole === 'TECHNICIAN' && isTechnicianProfileActive(user);
  const visibleConsentTypes = useMemo(
    () =>
      isTechnician
        ? (Object.keys(CONSENT_LABELS) as string[])
        : (Object.keys(CONSENT_LABELS) as string[]).filter(t => t !== 'LOCATION_BACKGROUND'),
    [isTechnician]
  );

  const [records, setRecords] = useState<ConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [policy, setPolicy] = useState<any>(null);
  const [ownerEmail, setOwnerEmail] = useState('');

  // ── Load consents ──────────────────────────────────────────────────────────

  const loadConsents = useCallback(async () => {
    setLoading(true);
    try {
      const email = await AsyncStorage.getItem('@brspark_email') || '';
      setOwnerEmail(email);

      const raw = await AsyncStorage.getItem('@brspark_collection_policy');
      if (raw) setPolicy(JSON.parse(raw));

      const res = await apiFetch(`/api/compliance/consents?ownerEmail=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();

        // Keep only the latest non-revoked record per consentType
        const latestByType: Record<string, ConsentRecord> = {};
        for (const r of data) {
          const existing = latestByType[r.consentType];
          if (!existing || new Date(r.acceptedAt) > new Date(existing.acceptedAt)) {
            latestByType[r.consentType] = r;
          }
        }
        setRecords(Object.values(latestByType));
      }
    } catch (e) {
      console.warn('[Privacy] Erro ao carregar consentimentos:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConsents(); }, [loadConsents]);

  // ── Toggle consent ─────────────────────────────────────────────────────────

  const toggleConsent = useCallback(async (
    record: ConsentRecord | undefined,
    consentType: string,
    newValue: boolean,
  ) => {
    if (!newValue) {
      Alert.alert(
        'Revogar permissão',
        `Tem certeza que deseja revogar "${consentLabelForRole(consentType, isTechnician).title}"? Isso pode limitar algumas funcionalidades.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Revogar', style: 'destructive', onPress: () => doToggle(consentType, false, record?.id) },
        ]
      );
      return;
    }
    await doToggle(consentType, true, record?.id);
  }, [ownerEmail, policy, isTechnician]);

  const doToggle = async (consentType: string, accepted: boolean, oldId?: string) => {
    setSaving(consentType);
    try {
      // Revoke previous if exists
      if (oldId) {
        await apiFetch(`/api/compliance/accept`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerEmail, consentType, accepted,
            policyId: policy?.id || null,
            tenantId: policy?.tenantId || null,
          }),
        });
      } else {
        await apiFetch('/api/compliance/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerEmail, consentType, accepted,
            policyId: policy?.id || null,
            tenantId: policy?.tenantId || null,
          }),
        });
      }
      await loadConsents();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar sua preferência. Tente novamente.');
    } finally {
      setSaving(null);
    }
  };

  // ── Get current consent value ──────────────────────────────────────────────

  const getConsent = (consentType: string): { record: ConsentRecord | undefined; value: boolean } => {
    const record = records.find(r => r.consentType === consentType && !r.revokedAt);
    return { record, value: record?.accepted || false };
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const legalBasis = policy?.legalBasis || 'LGPD';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Minha Privacidade</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Legal basis badge */}
        <View style={s.legalBadge}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#3b82f6" />
          <Text style={s.legalText}>Seus dados são protegidos pela <Text style={{ fontWeight: '800' }}>{legalBasis}</Text></Text>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color="#EA580C" />
        ) : (
          <>
            {/* Consent toggles */}
            <Text style={s.sectionLabel}>Permissões ativas</Text>
            <View style={s.section}>
              {visibleConsentTypes.map(consentType => {
                const { record, value } = getConsent(consentType);
                const info = consentLabelForRole(consentType, isTechnician);
                const isSaving = saving === consentType;

                return (
                  <View style={s.toggleRow} key={consentType}>
                    <View style={s.toggleIcon}>
                      <Ionicons name={info.icon as any} size={20} color="#EA580C" />
                    </View>
                    <View style={s.toggleContent}>
                      <Text style={s.toggleTitle}>{info.title}</Text>
                      <Text style={s.toggleDesc}>{info.desc}</Text>
                      {record && (
                        <Text style={s.toggleDate}>
                          {value ? '✅ Aceito' : '❌ Revogado'} em {new Date(record.acceptedAt).toLocaleDateString('pt-BR')}
                        </Text>
                      )}
                    </View>
                    {isSaving ? (
                      <ActivityIndicator size="small" color="#EA580C" />
                    ) : (
                      <Switch
                        value={value}
                        onValueChange={val => toggleConsent(record, consentType, val)}
                        trackColor={{ false: '#e2e8f0', true: '#fdba74' }}
                        thumbColor={value ? '#EA580C' : '#94a3b8'}
                        ios_backgroundColor="#e2e8f0"
                      />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Retention info */}
            <Text style={s.sectionLabel}>Retenção de dados</Text>
            <View style={s.section}>
              {(isTechnician
                ? [
                    ['GPS em tempo real', `${policy?.retentionGpsRawDays || 15} dias`, '#f59e0b'],
                    ['Registros operacionais', `${policy?.retentionAuditDays || 180} dias`, '#3b82f6'],
                    ['Check-in/out e formulários', `${policy?.retentionEventsYears || 5} anos`, '#10b981'],
                  ]
                : [
                    ['Dados de uso e suporte', `${policy?.retentionAuditDays || 180} dias`, '#3b82f6'],
                    ['Conteúdo da sua conta', `${policy?.retentionEventsYears || 5} anos`, '#10b981'],
                    ['Localização (se permitida)', `${policy?.retentionGpsRawDays || 15} dias`, '#f59e0b'],
                  ]
              ).map(([label, period, color]) => (
                <View style={s.retRow} key={label}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.retLabel}>{label}</Text>
                  </View>
                  <Text style={[s.retPeriod, { color }]}>{period}</Text>
                </View>
              ))}
            </View>

            {/* Full re-onboarding */}
            <TouchableOpacity style={s.redo} onPress={() => router.push('/auth/onboarding')}>
              <Ionicons name="refresh-outline" size={18} color="#64748b" />
              <Text style={s.redoText}>Rever todas as permissões</Text>
              <Ionicons name="chevron-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '800', color: '#1e293b' },

  legalBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eff6ff', margin: 16, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: '#bfdbfe',
  },
  legalText: { fontSize: 12, color: '#1d4ed8', flex: 1 },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: 20, marginTop: 20, marginBottom: 8,
  },
  section: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden' },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  toggleIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  toggleContent: { flex: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  toggleDesc: { fontSize: 11, color: '#64748b', marginTop: 2, lineHeight: 16 },
  toggleDate: { fontSize: 10, color: '#94a3b8', marginTop: 4 },

  retRow: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  retLabel: { fontSize: 13, fontWeight: '600', color: '#1e293b' },
  retPeriod: { fontSize: 13, fontWeight: '900' },

  redo: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', margin: 16, borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#f1f5f9',
  },
  redoText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#64748b' },
});
