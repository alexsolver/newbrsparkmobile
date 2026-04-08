import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Linking,
  StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { evaluateGpsIntegrityGate, type GpsIntegrityFailReason } from '../services/deviceGpsIntegrity';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export function GpsIntegrityGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createGpsIntegrityGateStyles(C), [C]);
  const [phase, setPhase] = useState<'checking' | 'ok' | 'blocked'>('checking');
  const [reason, setReason] = useState<GpsIntegrityFailReason | null>(null);

  /**
   * silent: não mostrar ecrã de «a verificar» nem desmontar o router.
   * Usado ao regressar da background — caso contrário o Stack perde a rota (ex.: OS aberta).
   */
  const runCheck = useCallback(async (silent = false) => {
    if (!silent) setPhase('checking');
    const r = await evaluateGpsIntegrityGate();
    if (r.ok) {
      setPhase('ok');
      setReason(null);
    } else {
      setPhase('blocked');
      setReason(r.reason);
    }
  }, []);

  useEffect(() => {
    void runCheck(false);
  }, [runCheck]);

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') void runCheck(true);
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [runCheck]);

  if (phase === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.checkingLabel}>{t('gpsIntegrity.checking')}</Text>
      </View>
    );
  }

  if (phase === 'blocked' && reason) {
    const bodyKey =
      reason === 'android_mock_settings'
        ? 'gpsIntegrity.blockBodyAndroidSettings'
        : reason === 'android_position_mocked'
          ? 'gpsIntegrity.blockBodyAndroidPosition'
          : 'gpsIntegrity.blockBodyIos';
    return (
      <View style={[styles.blockRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="navigate-outline" size={48} color="#B91C1C" />
        </View>
        <Text style={styles.title}>{t('gpsIntegrity.blockTitle')}</Text>
        <Text style={styles.body}>{t(bodyKey)}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
          <Ionicons name="settings-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>{t('gpsIntegrity.openSettings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void runCheck()} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>{t('gpsIntegrity.verifyAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

function createGpsIntegrityGateStyles(C: ColorPalette) {
  return StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  checkingLabel: {
    marginTop: 16,
    fontSize: 14,
    color: '#64748B',
    fontWeight: '600',
  },
  blockRoot: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.accent,
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    marginBottom: 12,
    minWidth: 260,
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  secondaryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryBtnText: {
    color: C.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  });
}
