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
import { evaluateDeviceTimeGate, type DeviceTimeBlockReason } from '../services/deviceAutomaticTime';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

export function AutomaticTimeGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createAutomaticTimeGateStyles(C), [C]);
  const [phase, setPhase] = useState<'checking' | 'ok' | 'blocked'>('checking');
  const [reason, setReason] = useState<DeviceTimeBlockReason | null>(null);

  /** silent: não desmontar a árvore ao reverificar (preserva rota atual no Expo Router). */
  const runCheck = useCallback(async (silent = false) => {
    if (!silent) setPhase('checking');
    const r = await evaluateDeviceTimeGate();
    if (r.ok) {
      setPhase('ok');
      setReason(null);
    } else {
      setPhase('blocked');
      setReason(r.reason);
    }
  }, []);

  useEffect(() => {
    void runCheck(false).catch(() => {});
  }, [runCheck]);

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === 'active') void runCheck(true).catch(() => {});
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [runCheck]);

  if (phase === 'checking') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={C.accent} />
        <Text style={styles.checkingLabel}>{t('deviceTime.checking')}</Text>
      </View>
    );
  }

  if (phase === 'blocked' && reason) {
    const bodyKey =
      reason === 'android_manual' ? 'deviceTime.blockBodyAndroid' : 'deviceTime.blockBodyIos';
    return (
      <View style={[styles.blockRoot, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.iconWrap}>
          <Ionicons name="time-outline" size={48} color="#CA8A04" />
        </View>
        <Text style={styles.title}>{t('deviceTime.blockTitle')}</Text>
        <Text style={styles.body}>{t(bodyKey)}</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => Linking.openSettings()} activeOpacity={0.85}>
          <Ionicons name="settings-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryBtnText}>{t('deviceTime.openSettings')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void runCheck().catch(() => {})} activeOpacity={0.85}>
          <Text style={styles.secondaryBtnText}>{t('deviceTime.verifyAgain')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

function createAutomaticTimeGateStyles(C: ColorPalette) {
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
    backgroundColor: '#FEF9C3',
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
