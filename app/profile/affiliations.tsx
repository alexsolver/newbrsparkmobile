import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { ProviderAffiliationsApi, ProviderAffiliation } from '../../src/services/providerAffiliations';

function fmtStatusPt(a: ProviderAffiliation) {
  const s = String(a.status || '').toUpperCase();
  if (s === 'INVITED') return 'Convite recebido';
  if (s === 'REQUESTED') return 'Aguardando confirmação da empresa';
  if (s === 'ACTIVE') return 'Ativo';
  if (s === 'INACTIVE') return 'Inativo';
  if (s === 'SUSPENDED') return 'Suspenso';
  if (s === 'REJECTED') return 'Recusado';
  return s || '—';
}

function isDedicated(a: ProviderAffiliation) {
  return String(a.relationshipType || '').toUpperCase() === 'DEDICATED';
}

function cardAccent(a: ProviderAffiliation) {
  if (isDedicated(a)) return { bg: '#FFF7ED', border: '#FDBA74', title: '#9A3412', chipBg: '#FB923C' };
  return { bg: '#F8FAFC', border: '#E2E8F0', title: '#0F172A', chipBg: '#64748B' };
}

export default function ProviderAffiliationsScreen() {
  const { colors: C } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rows, setRows] = useState<ProviderAffiliation[]>([]);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  /** Só o primeiro foco usa ecrã de loading completo; voltas ao separador actualizam em silêncio (convites novos). */
  const firstFocusRef = useRef(true);

  const load = useCallback(async () => {
    const j = await ProviderAffiliationsApi.getMeStatus();
    setRows(j.affiliations || []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const isFirst = firstFocusRef.current;
      if (isFirst) setLoading(true);
      firstFocusRef.current = false;
      load()
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled && isFirst) setLoading(false);
        });
      return () => {
        cancelled = true;
        if (isFirst) setLoading(false);
      };
    }, [load])
  );

  const { dedicated, partners } = useMemo(() => {
    const ded = rows
      .filter((r) => isDedicated(r))
      .sort((a, b) => String(b.activatedAt || b.invitedAt || '').localeCompare(String(a.activatedAt || a.invitedAt || '')));
    const par = rows
      .filter((r) => !isDedicated(r))
      .sort((a, b) => String(b.activatedAt || b.invitedAt || '').localeCompare(String(a.activatedAt || a.invitedAt || '')));
    return { dedicated: ded, partners: par };
  }, [rows]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const handleAcceptInvite = useCallback(
    async (affiliationId: string) => {
      setAcceptingId(affiliationId);
      try {
        await ProviderAffiliationsApi.acceptByAffiliationId(affiliationId);
        await load();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        Alert.alert(t('profile.affiliationsAcceptErrorTitle'), msg || t('profile.affiliationsAcceptErrorBody'));
      } finally {
        setAcceptingId(null);
      }
    },
    [load, t]
  );

  const Section = ({
    title,
    hint,
    items,
  }: {
    title: string;
    hint: string;
    items: ProviderAffiliation[];
  }) => {
    return (
      <View style={{ marginBottom: 18 }}>
        <Text style={{ fontSize: 12, fontWeight: '900', color: '#64748B', letterSpacing: 0.6 }}>
          {title.toUpperCase()}
        </Text>
        <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6, lineHeight: 17 }}>{hint}</Text>

        <View style={{ marginTop: 12, gap: 10 }}>
          {items.length === 0 ? (
            <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
              <Text style={{ color: '#64748B', fontWeight: '700' }}>Nenhum item por aqui.</Text>
            </View>
          ) : (
            items.map((a) => {
              const col = cardAccent(a);
              const invited = String(a.status).toUpperCase() === 'INVITED';
              const busy = acceptingId === a.id;
              const acceptLocked = acceptingId !== null;
              const cardStyle = {
                backgroundColor: col.bg,
                borderRadius: 16,
                padding: 14,
                borderWidth: 1,
                borderColor: col.border,
              };
              const body = (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ fontSize: 15, fontWeight: '900', color: col.title }} numberOfLines={1}>
                        {a.tenant?.name || 'Empresa'}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{fmtStatusPt(a)}</Text>
                    </View>
                    <View style={{ backgroundColor: col.chipBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}>
                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 10 }}>
                        {isDedicated(a) ? 'DEDICADO' : 'PARCERIA'}
                      </Text>
                    </View>
                  </View>

                  {a.note ? (
                    <Text style={{ fontSize: 12, color: '#334155', marginTop: 10, lineHeight: 18 }}>{a.note}</Text>
                  ) : null}

                  {String(a.status).toUpperCase() === 'REQUESTED' ? (
                    <View
                      style={{
                        marginTop: 10,
                        backgroundColor: '#EFF6FF',
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: '#BFDBFE',
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#1D4ED8', fontWeight: '900' }}>Próximo passo</Text>
                      <Text style={{ fontSize: 12, color: '#1E3A8A', marginTop: 4, lineHeight: 18 }}>
                        A empresa ainda precisa confirmar a ativação no painel.
                      </Text>
                    </View>
                  ) : null}

                  {invited ? (
                    <View
                      style={{
                        marginTop: 10,
                        backgroundColor: '#FEFCE8',
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: '#FDE68A',
                      }}
                    >
                      <Text style={{ fontSize: 12, color: '#92400E', fontWeight: '900' }}>
                        {t('profile.affiliationsInvitePendingTitle')}
                      </Text>
                      <Text style={{ fontSize: 12, color: '#78350F', marginTop: 4, lineHeight: 18 }}>
                        {t('profile.affiliationsInviteTapHint')}
                      </Text>
                      {busy ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 8 }}>
                          <ActivityIndicator size="small" color="#92400E" />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </>
              );

              if (invited) {
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={cardStyle}
                    onPress={() => void handleAcceptInvite(a.id)}
                    disabled={acceptLocked}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={t('profile.affiliationsInvitePendingTitle')}
                  >
                    {body}
                  </TouchableOpacity>
                );
              }

              return (
                <View key={a.id} style={cardStyle}>
                  {body}
                </View>
              );
            })
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.cardWhite }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '900', color: C.primary }}>Organizações e parcerias</Text>
        <Text style={{ fontSize: 12, color: '#64748B', marginTop: 6, lineHeight: 18 }}>
          Aqui você vê seus vínculos com empresas, incluindo dedicação (full time) e parcerias.
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={C.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 18, paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} />}
        >
          <Section
            title="Vínculo dedicado"
            hint="Vínculo full time. Ao ativar, outras parcerias ativas podem ser desativadas automaticamente."
            items={dedicated}
          />
          <Section
            title="Parcerias"
            hint="Parcerias permitem trabalhar com mais de uma empresa, conforme ativação e permissões."
            items={partners}
          />

          <TouchableOpacity
            onPress={() => router.back()}
            style={{ alignItems: 'center', paddingVertical: 10 }}
          >
            <Text style={{ color: '#64748B', fontWeight: '800' }}>Voltar</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

