import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ProviderAffiliationsApi, ProviderAffiliation } from '../../src/services/providerAffiliations';
import { useAuth } from '../../src/hooks/useAuth';

function relationshipTitle(type: string, t: (k: string) => string) {
  const u = String(type || '').toUpperCase();
  if (u === 'OWNER') return t('profile.affiliationsAcceptOwnerTitle');
  return t('profile.affiliationsAcceptDedicatedTitle');
}

function consequenceBullets(type: string, t: (k: string) => string) {
  const u = String(type || '').toUpperCase();
  if (u === 'OWNER') {
    return [t('profile.affiliationsAcceptOwnerBullet')];
  }
  return [
    t('profile.affiliationsAcceptDedicatedB1'),
    t('profile.affiliationsAcceptDedicatedB2'),
    t('profile.affiliationsAcceptDedicatedB3'),
  ];
}

export default function ProviderAffiliationAcceptScreen() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const router = useRouter();
  const { colors: C } = useTheme();
  const params = useGlobalSearchParams<{ token?: string }>();

  const token = useMemo(() => String(params?.token || '').trim(), [params]);

  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState<ProviderAffiliation | null>(null);
  const [inviteLoading, setInviteLoading] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      Alert.alert('Entre na sua conta', 'Faça login para aceitar o convite.');
      router.replace('/auth/login' as any);
      return;
    }
    if (!token) {
      setInviteLoading(false);
      Alert.alert('Convite inválido', 'Faltou o token do convite.');
      return;
    }
    setInviteLoading(true);
    ProviderAffiliationsApi.previewInvite(token)
      .then((a) => setInvite(a))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert('Convite inválido', msg);
      })
      .finally(() => setInviteLoading(false));
  }, [token, user, loading, router]);

  const doAccept = async () => {
    if (!token) return;
    try {
      setBusy(true);
      const accepted = await ProviderAffiliationsApi.acceptInvite(token);
      setInvite((prev) => ({ ...(prev || ({} as ProviderAffiliation)), ...accepted }));
      Alert.alert(t('profile.affiliationsAcceptDoneTitle'), t('profile.affiliationsAcceptDoneBody'));
      router.replace('/profile/affiliations' as any);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert(t('profile.affiliationsAcceptErrorTitle'), msg);
    } finally {
      setBusy(false);
    }
  };

  const handlePressAccept = () => {
    if (!token || !invite) return;
    Alert.alert(t('profile.affiliationsConsentTitle'), t('profile.affiliationsConsentBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('profile.affiliationsConsentConfirm'), onPress: () => void doAccept() },
    ]);
  };

  const title = invite ? relationshipTitle(invite.relationshipType, t) : t('profile.affiliationsAcceptScreenFallbackTitle');
  const companyName = invite?.tenant?.name || 'Empresa';

  return (
    <View style={{ flex: 1, backgroundColor: C.cardWhite, padding: 20, justifyContent: 'center' }}>
      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0' }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.primary, marginBottom: 6 }}>
          {title}
        </Text>
        <Text style={{ fontSize: 13, color: '#475569', lineHeight: 19, marginBottom: 12 }}>
          {inviteLoading ? 'Carregando detalhes do convite…' : `Empresa: ${companyName}`}
        </Text>

        {inviteLoading ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={C.accent} />
          </View>
        ) : invite ? (
          <View style={{ gap: 8, marginBottom: 12 }}>
            {consequenceBullets(invite.relationshipType, t).map((b, idx) => (
              <Text key={idx} style={{ fontSize: 12, color: '#334155', lineHeight: 18 }}>
                {'• '}{b}
              </Text>
            ))}
            {invite?.note ? (
              <View style={{ marginTop: 6, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1D4ED8', marginBottom: 4 }}>Mensagem</Text>
                <Text style={{ fontSize: 12, color: '#1E3A8A', lineHeight: 18 }}>{invite.note}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Não foi possível carregar o convite.</Text>
        )}

        <TouchableOpacity
          onPress={handlePressAccept}
          disabled={busy || inviteLoading || !invite}
          style={{
            backgroundColor: '#16A34A',
            paddingVertical: 14,
            borderRadius: 14,
            alignItems: 'center',
            opacity: busy || inviteLoading || !invite ? 0.6 : 1,
          }}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>Aceitar</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.back()}
          disabled={busy}
          style={{ alignItems: 'center', paddingTop: 12 }}
        >
          <Text style={{ color: '#64748B', fontWeight: '800' }}>Agora não</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

