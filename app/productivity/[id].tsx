import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { apiFetch } from '../../src/services/auth';
import { ScreenSubheader } from '../../src/components/ScreenSubheader';
import { EvaluationBadge } from '../../src/components/EvaluationBadge';
import {
  instanceStatusTone,
  disputeStatusTone,
  scoreBandTone,
  actionPlanStatusTone,
} from '../../src/utils/evaluationDisplay';
import {
  trInstanceStatus,
  trDisputeStatus,
  trScoreBand,
  trActionPlanStatus,
} from '../../src/utils/evaluationLabelsI18n';

export default function ProductivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [dispute, setDispute] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/evaluations/instances/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'err');
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const postAck = async () => {
    if (!id) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/evaluations/instances/${encodeURIComponent(id)}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const postNote = async () => {
    if (!id || !note.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/evaluations/instances/${encodeURIComponent(id)}/internal-notes`, {
        method: 'POST',
        body: JSON.stringify({ body: note.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setNote('');
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const postDispute = async () => {
    if (!id || dispute.trim().length < 10) {
      Alert.alert(t('common.attention'), t('productivity.disputeMin'));
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch(`/api/evaluations/instances/${encodeURIComponent(id)}/disputes`, {
        method: 'POST',
        body: JSON.stringify({ justification: dispute.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setDispute('');
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const postPlan = async () => {
    if (!id || !planDesc.trim()) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/evaluations/instances/${encodeURIComponent(id)}/action-plans`, {
        method: 'POST',
        body: JSON.stringify({ description: planDesc.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      setPlanDesc('');
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  const patchPlan = async (planId: string, status: string) => {
    setBusy(true);
    try {
      const res = await apiFetch(`/api/evaluations/action-plans/${encodeURIComponent(planId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
      await load();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || '');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <View style={[styles.root, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSubheader
          title={t('productivity.title')}
          subtitle={t('productivity.screenSubtitle')}
          onBack={() => router.back()}
          onRightPress={() => void load()}
          rightLoading={loading}
        />
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.root, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSubheader
          title={t('productivity.title')}
          subtitle={t('productivity.screenSubtitle')}
          onBack={() => router.back()}
          onRightPress={() => void load()}
          rightLoading={loading}
        />
        <View style={styles.center}>
          <Text style={{ color: C.textSecondary }}>{t('productivity.notFound')}</Text>
          <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
            <Text style={{ color: C.accent, fontWeight: '800' }}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { instance, context, score, needsAck, internalNotes, actionPlans, disputes } = data;
  const cats = score?.scoreByCategory && typeof score.scoreByCategory === 'object' ? score.scoreByCategory : {};
  const hasPendingReview =
    Array.isArray(disputes) &&
    disputes.some((d: { status?: string }) => String(d?.status || '').toUpperCase() === 'PENDING');

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScreenSubheader
        title={instance.template?.name || t('productivity.title')}
        subtitle={t('productivity.detailScreenSubtitle')}
        onBack={() => router.back()}
        onRightPress={() => void load()}
        rightLoading={loading}
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        {needsAck ? (
          <View style={[styles.banner, { backgroundColor: '#fef2f2', borderColor: '#fecaca' }]}>
            <Text style={{ color: '#991b1b', fontWeight: '800', flex: 1 }}>{t('productivity.needsAck')}</Text>
            <TouchableOpacity
              onPress={postAck}
              disabled={busy}
              style={[styles.primaryBtn, { backgroundColor: C.accent }]}
            >
              <Text style={{ color: '#fff', fontWeight: '800' }}>{t('productivity.ack')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.context')}</Text>
        <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              {context.osNumber ? (
                <Text style={{ color: C.slate, fontWeight: '800', fontSize: 16 }}>OS {context.osNumber}</Text>
              ) : null}
              {context.serviceTitle ? (
                <Text style={{ color: C.textSecondary, marginTop: 6, lineHeight: 20 }}>{context.serviceTitle}</Text>
              ) : null}
              {context.durationMinutes != null ? (
                <Text style={{ color: C.textLight, marginTop: 8, fontSize: 13 }}>
                  {t('productivity.duration', { min: context.durationMinutes })}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: C.textLight, marginBottom: 6 }}>
                {t('productivity.situationTitle')}
              </Text>
              <EvaluationBadge
                label={trInstanceStatus(t, instance.status)}
                tone={instanceStatusTone(instance.status)}
              />
            </View>
          </View>
        </View>

        {score ? (
          <>
            <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.scores')}</Text>
            <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={{ color: C.accent, fontWeight: '900', fontSize: 32 }}>{Math.round(score.totalScore)}</Text>
                <EvaluationBadge
                  label={trScoreBand(t, score.classification)}
                  tone={scoreBandTone(score.classification)}
                />
              </View>
              {Object.keys(cats).map((k) => (
                <View key={k} style={styles.catRow}>
                  <Text style={{ color: C.slate }}>{k}</Text>
                  <Text style={{ fontWeight: '800', color: C.textSecondary }}>{String(cats[k])}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {instance.insights &&
        (instance.insights.tips?.length > 0 || instance.insights.summary) ? (
          <>
            <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.insights')}</Text>
            <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
              {Array.isArray(instance.insights.tips) && instance.insights.tips.length > 0
                ? instance.insights.tips.map((tip: string, idx: number) => (
                    <Text key={idx} style={{ color: C.slate, marginTop: idx ? 6 : 0, lineHeight: 20 }}>
                      • {tip}
                    </Text>
                  ))
                : (
                    <Text style={{ color: C.textSecondary, lineHeight: 20 }}>{instance.insights.summary}</Text>
                  )}
            </View>
          </>
        ) : null}

        {instance.clientSurveyFullUrl || instance.clientSurveyRelativePath ? (
          <>
            <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.clientSurvey')}</Text>
            <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
              {instance.clientSurveyFullUrl ? (
                <>
                  <Text style={{ color: C.textLight, fontSize: 12, marginBottom: 6 }}>
                    {t('productivity.clientSurveyFullLink')}
                  </Text>
                  <Text selectable style={{ color: C.slate, fontSize: 13 }}>
                    {instance.clientSurveyFullUrl}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={{ color: C.textLight, fontSize: 12, marginBottom: 6 }}>
                    {t('productivity.clientSurveyHint')}
                  </Text>
                  <Text selectable style={{ color: C.slate, fontSize: 13 }}>
                    {instance.clientSurveyRelativePath}
                  </Text>
                </>
              )}
            </View>
          </>
        ) : null}

        {instance.displayText ? (
          <>
            <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.comment')}</Text>
            <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
              <Text style={{ color: C.slate, lineHeight: 22 }}>{instance.displayText}</Text>
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.internalNote')}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('productivity.internalNotePh')}
          placeholderTextColor={C.textLight}
          multiline
          style={[styles.input, { color: C.slate, borderColor: C.divider, backgroundColor: C.cardWhite }]}
        />
        <TouchableOpacity
          onPress={postNote}
          disabled={busy || !note.trim()}
          style={[styles.primaryBtn, { backgroundColor: C.accent, opacity: note.trim() ? 1 : 0.5 }]}
        >
          <Text style={{ color: '#fff', fontWeight: '800' }}>{t('productivity.sendNote')}</Text>
        </TouchableOpacity>

        {internalNotes?.length ? (
          <View style={{ marginTop: 12 }}>
            {internalNotes.map((n: any) => (
              <Text key={n.id} style={{ color: C.textSecondary, marginBottom: 8, fontSize: 13 }}>
                {new Date(n.createdAt).toLocaleString()}: {n.body}
              </Text>
            ))}
          </View>
        ) : null}

        <Text style={[styles.label, { color: C.textSecondary, marginTop: 16 }]}>{t('productivity.reviewSectionTitle')}</Text>
        {hasPendingReview ? (
          <View
            style={[
              styles.reviewBanner,
              { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' },
            ]}
          >
            <Text style={{ color: '#1e40af', fontSize: 13, lineHeight: 20, fontWeight: '600' }}>
              {t('productivity.reviewPendingBanner')}
            </Text>
          </View>
        ) : null}

        {disputes?.length ? (
          <View style={{ marginBottom: 8 }}>
            {disputes.map((d: any) => (
              <View
                key={d.id}
                style={[styles.reviewCard, { backgroundColor: C.cardWhite, borderColor: C.divider }]}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <EvaluationBadge
                    label={trDisputeStatus(t, d.status)}
                    tone={disputeStatusTone(d.status)}
                    size="sm"
                  />
                  {d.createdAt ? (
                    <Text style={{ fontSize: 11, color: C.textLight, flex: 1, textAlign: 'right' }}>
                      {t('productivity.reviewWhen', {
                        date: new Date(d.createdAt).toLocaleString(),
                      })}
                    </Text>
                  ) : null}
                </View>
                {d.justification ? (
                  <Text style={{ color: C.slate, marginTop: 10, lineHeight: 20, fontSize: 14 }}>{d.justification}</Text>
                ) : null}
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ color: C.textLight, fontSize: 13, marginBottom: 12 }}>{t('productivity.reviewEmpty')}</Text>
        )}

        <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.dispute')}</Text>
        <TextInput
          value={dispute}
          onChangeText={setDispute}
          placeholder={t('productivity.disputePh')}
          placeholderTextColor={C.textLight}
          multiline
          editable={!hasPendingReview}
          style={[
            styles.input,
            {
              color: C.slate,
              borderColor: C.divider,
              backgroundColor: hasPendingReview ? C.surfaceLow : C.cardWhite,
              opacity: hasPendingReview ? 0.65 : 1,
            },
          ]}
        />
        <TouchableOpacity
          onPress={postDispute}
          disabled={busy || hasPendingReview}
          style={[
            styles.secondaryBtn,
            {
              borderColor: C.accent,
              opacity: hasPendingReview ? 0.5 : 1,
            },
          ]}
        >
          <Text style={{ color: C.accent, fontWeight: '800' }}>{t('productivity.openDispute')}</Text>
        </TouchableOpacity>

        <Text style={[styles.label, { color: C.textSecondary, marginTop: 16 }]}>{t('productivity.actionPlan')}</Text>
        <TextInput
          value={planDesc}
          onChangeText={setPlanDesc}
          placeholder={t('productivity.actionPlanPh')}
          placeholderTextColor={C.textLight}
          style={[styles.input, { color: C.slate, borderColor: C.divider, backgroundColor: C.cardWhite }]}
        />
        <TouchableOpacity
          onPress={postPlan}
          disabled={busy || !planDesc.trim()}
          style={[styles.secondaryBtn, { borderColor: C.accent, opacity: planDesc.trim() ? 1 : 0.5 }]}
        >
          <Text style={{ color: C.accent, fontWeight: '800' }}>{t('productivity.addPlan')}</Text>
        </TouchableOpacity>

        {actionPlans?.map((p: any) => (
          <View
            key={p.id}
            style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider, marginTop: 10 }]}
          >
            <Text style={{ color: C.slate, fontWeight: '700', lineHeight: 22 }}>{p.description}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: C.textLight }}>
                {t('productivity.actionPlanStatusLabel')}:
              </Text>
              <EvaluationBadge
                label={trActionPlanStatus(t, p.status)}
                tone={actionPlanStatusTone(p.status)}
                size="sm"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              {(['OPEN', 'IN_PROGRESS', 'DONE'] as const).map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => patchPlan(p.id, st)}
                  disabled={busy}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: p.status === st ? `${C.accent}22` : C.background,
                    borderWidth: 1,
                    borderColor: p.status === st ? C.accent : C.divider,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: p.status === st ? C.accent : C.textSecondary }}>
                    {trActionPlanStatus(t, st)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  label: { fontWeight: '800', marginBottom: 8, marginTop: 4 },
  card: { borderRadius: 14, padding: 14, borderWidth: 1 },
  catRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  primaryBtn: { padding: 14, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  secondaryBtn: { padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, marginBottom: 12 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  reviewBanner: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
  },
  reviewCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
});
