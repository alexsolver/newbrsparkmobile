/**
 * TechnicianOnboarding — BrSpark Field Service
 *
 * Fluxo de consentimento granular para técnicos no primeiro login.
 * 5 telas: Boas-vindas → Localização → Dispositivo → Retenção → Confirmação
 *
 * Baseado na CollectionPolicy do tenant.
 * Cada toggle gera um ConsentRecord individual no backend.
 * Técnico pode entrar sem aceitar (nunca bloqueia).
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Dimensions, Animated, Switch, ActivityIndicator, Platform,
} from 'react-native';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../../src/services/auth';
import { dataCollectionService } from '../../src/services/dataCollectionService';

const { width } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConsentState {
  LOCATION_BACKGROUND: boolean;
  LOCATION_FOREGROUND: boolean;
  DEVICE_TELEMETRY: boolean;
  DATA_RETENTION: boolean;
}

// ─── Slide data ──────────────────────────────────────────────────────────────

const SLIDES = ['WELCOME', 'LOCATION', 'DEVICE', 'RETENTION', 'CONFIRM'] as const;
type Slide = typeof SLIDES[number];

// ─── Main Component ──────────────────────────────────────────────────────────

export default function TechnicianOnboarding() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [consents, setConsents] = useState<ConsentState>({
    LOCATION_BACKGROUND: false,
    LOCATION_FOREGROUND: true,   // default on — less invasive
    DEVICE_TELEMETRY: false,
    DATA_RETENTION: false,
  });
  const [policy, setPolicy] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(1));

  // Load policy on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('@brspark_collection_policy');
        if (raw) setPolicy(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const currentSlide: Slide = SLIDES[slideIndex];

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSlideIndex(i => Math.min(i + 1, SLIDES.length - 1));
  }, [fadeAnim]);

  const goBack = useCallback(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
    setSlideIndex(i => Math.max(i - 1, 0));
  }, [fadeAnim]);

  // ── Confirm & save consents ─────────────────────────────────────────────────

  const confirm = useCallback(async () => {
    setLoading(true);
    try {
      const ownerEmail = await AsyncStorage.getItem('@brspark_email') || '';
      const policyId   = policy?.id || null;
      const tenantId   = policy?.tenantId || null;
      const appVersion = '1.0'; // ideally from expo-constants

      const types = Object.entries(consents) as [keyof ConsentState, boolean][];
      await Promise.allSettled(types.map(([consentType, accepted]) =>
        apiFetch('/api/compliance/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ownerEmail, tenantId, policyId,
            consentType, accepted, appVersion,
          }),
        })
      ));

      // Start session in data collection service
      await dataCollectionService.onSessionOpen(ownerEmail, tenantId || undefined);

      // Mark onboarding as done
      await AsyncStorage.setItem('@brspark_onboarding_done', '1');

    } catch (e) {
      console.warn('[Onboarding] Erro ao salvar consentimentos:', e);
      // Never block — proceed anyway
    } finally {
      setLoading(false);
      router.replace('/(tabs)'); // go to main app
    }
  }, [consents, policy]);

  const skipAll = useCallback(async () => {
    await AsyncStorage.setItem('@brspark_onboarding_done', '1');
    router.replace('/(tabs)');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────────

  const legalBasis = policy?.legalBasis || 'LGPD';

  const ToggleRow = ({
    consentKey, title, description, icon,
  }: {
    consentKey: keyof ConsentState;
    title: string;
    description: string;
    icon: string;
  }) => (
    <View style={s.toggleRow}>
      <View style={s.toggleIcon}>
        <Ionicons name={icon as any} size={22} color="#EA580C" />
      </View>
      <View style={s.toggleContent}>
        <Text style={s.toggleTitle}>{title}</Text>
        <Text style={s.toggleDesc}>{description}</Text>
      </View>
      <Switch
        value={consents[consentKey]}
        onValueChange={val => setConsents(c => ({ ...c, [consentKey]: val }))}
        trackColor={{ false: '#e2e8f0', true: '#fdba74' }}
        thumbColor={consents[consentKey] ? '#EA580C' : '#94a3b8'}
        ios_backgroundColor="#e2e8f0"
      />
    </View>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // Slide content
  // ─────────────────────────────────────────────────────────────────────────────

  const renderSlide = () => {
    switch (currentSlide) {

      // ── Slide 0: Boas-vindas ───────────────────────────────────────────────
      case 'WELCOME':
        return (
          <View style={s.slideContent}>
            <View style={s.heroIcon}>
              <Ionicons name="shield-checkmark" size={56} color="#EA580C" />
            </View>
            <Text style={s.heroTitle}>Bem-vindo ao BrSpark</Text>
            <Text style={s.heroSubtitle}>
              Para garantir a qualidade dos seus atendimentos e sua segurança, precisamos de algumas permissões no seu dispositivo.
            </Text>
            <View style={s.infoCard}>
              <Ionicons name="information-circle-outline" size={18} color="#3b82f6" />
              <Text style={s.infoText}>
                Você pode usar o app <Text style={{ fontWeight: '800' }}>sem aceitar</Text> qualquer permissão. Mas algumas funções poderão estar limitadas.
              </Text>
            </View>
            <View style={s.collectGrid}>
              {[
                ['location-outline',        'Localização GPS',       'Para confirmar chegada e rota'],
                ['phone-portrait-outline',  'Status do dispositivo', 'Bateria e conexão'],
                ['shield-outline',          'Verificação antifraude','Protege você de uso indevido'],
                ['time-outline',            'Histórico de OS',       'Até ' + (policy?.retentionEventsYears || 5) + ' anos, conforme ' + legalBasis],
              ].map(([icon, t, d]) => (
                <View style={s.collectItem} key={t}>
                  <Ionicons name={icon as any} size={20} color="#EA580C" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.collectTitle}>{t}</Text>
                    <Text style={s.collectDesc}>{d}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        );

      // ── Slide 1: Localização ──────────────────────────────────────────────
      case 'LOCATION':
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="location" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>Localização</Text>
              <Text style={s.slideDesc}>Precisamos do seu GPS para confirmar check-in, calcular rotas e registrar sua presença no local de atendimento.</Text>
            </View>
            <ToggleRow
              consentKey="LOCATION_BACKGROUND"
              icon="navigate-outline"
              title="Localização em segundo plano"
              description={`GPS ativo durante atendimentos, mesmo com o app minimizado. Coletado a cada ~${policy?.locationDistanceFilterMeters || 200}m de deslocamento.`}
            />
            <ToggleRow
              consentKey="LOCATION_FOREGROUND"
              icon="locate-outline"
              title="Localização apenas com app aberto"
              description="GPS ativo somente enquanto você usa o app. Funcionalidade mínima de rastreamento de rota."
            />
            <View style={s.warnBox}>
              <Ionicons name="warning-outline" size={16} color="#d97706" />
              <Text style={s.warnText}>
                Sem localização, você pode trabalhar normalmente. Check-in automático e acompanhamento de rota serão desativados.
              </Text>
            </View>
          </View>
        );

      // ── Slide 2: Dispositivo ──────────────────────────────────────────────
      case 'DEVICE':
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="phone-portrait" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>Dispositivo & Segurança</Text>
              <Text style={s.slideDesc}>Coletamos informações do aparelho para garantir a confiabilidade dos dados e detectar fraudes.</Text>
            </View>
            <ToggleRow
              consentKey="DEVICE_TELEMETRY"
              icon="hardware-chip-outline"
              title="Status do dispositivo"
              description="Nível de bateria, tipo de conexão (Wi-Fi/4G) e modelo do aparelho. Ajuda a entender falhas de sincronização."
            />
            <View style={s.infoCard}>
              <Ionicons name="shield-half-outline" size={18} color="#10b981" />
              <Text style={s.infoText}>
                Também verificamos sinais de GPS falso e relógio do dispositivo adulterado, para proteger você e a empresa de fraudes.
                <Text style={{ fontWeight: '700' }}> Isso ocorre automaticamente</Text> e não requer permissão adicional.
              </Text>
            </View>
          </View>
        );

      // ── Slide 3: Retenção ─────────────────────────────────────────────────
      case 'RETENTION':
        return (
          <View style={s.slideContent}>
            <View style={s.slideHeader}>
              <Ionicons name="time" size={36} color="#EA580C" />
              <Text style={s.slideTitle}>Por quanto tempo guardamos</Text>
              <Text style={s.slideDesc}>Usamos retenção diferenciada por tipo de dado, conforme a {legalBasis}.</Text>
            </View>
            {[
              ['GPS em tempo real', `${policy?.retentionGpsRawDays || 15} dias`, 'Trilha bruta de deslocamento', '#f59e0b'],
              ['Registros operacionais', `${policy?.retentionAuditDays || 180} dias`, 'Logs de sessão e conectividade', '#3b82f6'],
              ['Check-in/out e formulários', `${policy?.retentionEventsYears || 5} anos`, 'Provas de execução do serviço', '#10b981'],
              ['Métricas e scores', 'Anonimizados', 'KPIs sem identificação pessoal', '#8b5cf6'],
            ].map(([label, period, desc, color]) => (
              <View style={s.retentionRow} key={label}>
                <View style={[s.retentionDot, { backgroundColor: color + '20' }]}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.retentionLabel}>{label}</Text>
                  <Text style={s.retentionDesc}>{desc}</Text>
                </View>
                <Text style={[s.retentionPeriod, { color }]}>{period}</Text>
              </View>
            ))}
            <ToggleRow
              consentKey="DATA_RETENTION"
              icon="checkmark-circle-outline"
              title={`Li e entendi a política de retenção (${legalBasis})`}
              description="Declaro ter lido as informações sobre retenção de dados acima."
            />
          </View>
        );

      // ── Slide 4: Confirmação ──────────────────────────────────────────────
      case 'CONFIRM':
        return (
          <View style={s.slideContent}>
            <View style={s.heroIcon}>
              <Ionicons name="checkmark-circle" size={56} color="#10b981" />
            </View>
            <Text style={s.heroTitle}>Quase lá!</Text>
            <Text style={s.heroSubtitle}>Resumo das suas escolhas:</Text>

            {([
              ['LOCATION_BACKGROUND', 'GPS em segundo plano', 'navigate-outline'],
              ['LOCATION_FOREGROUND', 'GPS com app aberto', 'locate-outline'],
              ['DEVICE_TELEMETRY', 'Status do dispositivo', 'hardware-chip-outline'],
              ['DATA_RETENTION', 'Política de retenção lida', 'time-outline'],
            ] as [keyof ConsentState, string, string][]).map(([key, label, icon]) => (
              <View style={s.summaryRow} key={key}>
                <Ionicons name={icon as any} size={18} color={consents[key] ? '#10b981' : '#94a3b8'} />
                <Text style={[s.summaryLabel, { color: consents[key] ? '#1e293b' : '#94a3b8' }]}>{label}</Text>
                <Ionicons
                  name={consents[key] ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={consents[key] ? '#10b981' : '#cbd5e1'}
                />
              </View>
            ))}

            <View style={s.infoCard}>
              <Ionicons name="settings-outline" size={18} color="#64748b" />
              <Text style={s.infoText}>
                Você pode alterar estas permissões a qualquer momento em <Text style={{ fontWeight: '800' }}>Perfil → Minha Privacidade</Text>.
              </Text>
            </View>
          </View>
        );
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const isLastSlide = slideIndex === SLIDES.length - 1;

  return (
    <View style={s.container}>
      {/* Progress dots */}
      <View style={s.progressBar}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === slideIndex && s.dotActive]} />
        ))}
      </View>

      {/* Skip button */}
      <TouchableOpacity style={s.skipBtn} onPress={skipAll}>
        <Text style={s.skipText}>Pular</Text>
      </TouchableOpacity>

      {/* Slide */}
      <Animated.View style={[s.slide, { opacity: fadeAnim }]}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
          {renderSlide()}
        </ScrollView>
      </Animated.View>

      {/* Navigation */}
      <View style={s.navRow}>
        {slideIndex > 0 ? (
          <TouchableOpacity style={s.btnBack} onPress={goBack}>
            <Ionicons name="arrow-back" size={18} color="#64748b" />
            <Text style={s.btnBackText}>Voltar</Text>
          </TouchableOpacity>
        ) : <View style={{ flex: 1 }} />}

        <TouchableOpacity
          style={[s.btnNext, isLastSlide && s.btnConfirm]}
          onPress={isLastSlide ? confirm : goNext}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={s.btnNextText}>
                {isLastSlide ? 'Confirmar e entrar' : 'Continuar'}
              </Text>
              {!isLastSlide && <Ionicons name="arrow-forward" size={18} color="#fff" />}
              {isLastSlide && <Ionicons name="checkmark" size={18} color="#fff" />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  progressBar: { flexDirection: 'row', gap: 6, justifyContent: 'center', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#e2e8f0' },
  dotActive: { width: 20, backgroundColor: '#EA580C' },
  skipBtn: { position: 'absolute', top: Platform.OS === 'ios' ? 56 : 36, right: 20, zIndex: 10, padding: 8 },
  skipText: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  slide: { flex: 1 },
  slideContent: { padding: 24 },
  slideHeader: { alignItems: 'center', marginBottom: 28, gap: 10 },
  slideTitle: { fontSize: 22, fontWeight: '900', color: '#1e293b', textAlign: 'center' },
  slideDesc: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22 },

  heroIcon: { width: 96, height: 96, borderRadius: 28, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 20, marginTop: 16, shadowColor: '#EA580C', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#1e293b', textAlign: 'center', marginBottom: 10 },
  heroSubtitle: { fontSize: 14, color: '#64748b', textAlign: 'center', lineHeight: 22, marginBottom: 20 },

  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: '#eff6ff', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#bfdbfe' },
  infoText: { flex: 1, fontSize: 12, color: '#1d4ed8', lineHeight: 18 },

  warnBox: { flexDirection: 'row', gap: 10, backgroundColor: '#fffbeb', borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: '#fde68a' },
  warnText: { flex: 1, fontSize: 12, color: '#92400e', lineHeight: 18 },

  collectGrid: { gap: 10, marginTop: 8 },
  collectItem: { flexDirection: 'row', gap: 12, backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#f1f5f9', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  collectTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  collectDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },

  toggleRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, gap: 12, borderWidth: 1, borderColor: '#f1f5f9', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  toggleIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#fff7ed', alignItems: 'center', justifyContent: 'center' },
  toggleContent: { flex: 1 },
  toggleTitle: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 3 },
  toggleDesc: { fontSize: 11, color: '#64748b', lineHeight: 16 },

  retentionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  retentionDot: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  retentionLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
  retentionDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
  retentionPeriod: { fontSize: 12, fontWeight: '900' },

  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  summaryLabel: { flex: 1, fontSize: 14, fontWeight: '600' },

  navRow: { flexDirection: 'row', gap: 10, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  btnBack: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#f1f5f9', borderRadius: 14, paddingVertical: 14 },
  btnBackText: { fontSize: 14, fontWeight: '700', color: '#64748b' },
  btnNext: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EA580C', borderRadius: 14, paddingVertical: 14 },
  btnConfirm: { backgroundColor: '#10b981' },
  btnNextText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
