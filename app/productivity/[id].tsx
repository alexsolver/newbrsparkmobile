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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../src/theme/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiFetch } from '../../src/services/auth';

export default function ProductivityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
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
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={C.accent} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: C.background }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={{ color: C.textSecondary }}>{t('productivity.notFound')}</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: C.accent, fontWeight: '800' }}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { instance, context, score, needsAck, internalNotes, actionPlans, disputes } = data;
  const cats = score?.scoreByCategory && typeof score.scoreByCategory === 'object' ? score.scoreByCategory : {};

  return (
    <View style={[styles.root, { backgroundColor: C.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { borderBottomColor: C.divider, paddingTop: 8 + insets.top }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={C.accent} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: C.slate }]} numberOfLines={1}>
          {instance.template?.name || t('productivity.title')}
        </Text>
        <View style={{ width: 40 }} />
      </View>

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
          {context.osNumber ? (
            <Text style={{ color: C.slate }}>OS: {context.osNumber}</Text>
          ) : null}
          {context.serviceTitle ? (
            <Text style={{ color: C.textSecondary, marginTop: 4 }}>{context.serviceTitle}</Text>
          ) : null}
          {context.durationMinutes != null ? (
            <Text style={{ color: C.textLight, marginTop: 4 }}>
              {t('productivity.duration', { min: context.durationMinutes })}
            </Text>
          ) : null}
          <Text style={{ color: C.textLight, marginTop: 4, fontSize: 12 }}>
            {t('productivity.status')}: {instance.status}
          </Text>
        </View>

        {score ? (
          <>
            <Text style={[styles.label, { color: C.textSecondary }]}>{t('productivity.scores')}</Text>
            <View style={[styles.card, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
              <Text style={{ color: C.accent, fontWeight: '900', fontSize: 28 }}>
                {Math.round(score.totalScore)}
              </Text>
              <Text style={{ color: C.textLight }}>{score.classification}</Text>
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

        <Text style={[styles.label, { color: C.textSecondary, marginTop: 16 }]}>{t('productivity.dispute')}</Text>
        <TextInput
          value={dispute}
          onChangeText={setDispute}
          placeholder={t('productivity.disputePh')}
          placeholderTextColor={C.textLight}
          multiline
          style={[styles.input, { color: C.slate, borderColor: C.divider, backgroundColor: C.cardWhite }]}
        />
        <TouchableOpacity
          onPress={postDispute}
          disabled={busy}
          style={[styles.secondaryBtn, { borderColor: C.accent }]}
        >
          <Text style={{ color: C.accent, fontWeight: '800' }}>{t('productivity.openDispute')}</Text>
        </TouchableOpacity>

        {disputes?.length ? (
          <View style={{ marginTop: 8 }}>
            {disputes.map((d: any) => (
              <Text key={d.id} style={{ color: C.textLight, fontSize: 12 }}>
                {d.status}: {d.justification?.slice(0, 80)}…
              </Text>
            ))}
          </View>
        ) : null}

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
            <Text style={{ color: C.slate }}>{p.description}</Text>
            <Text style={{ color: C.textLight, marginTop: 4, fontSize: 12 }}>{p.status}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              {['OPEN', 'IN_PROGRESS', 'DONE'].map((st) => (
                <TouchableOpacity
                  key={st}
                  onPress={() => patchPlan(p.id, st)}
                  disabled={busy}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: p.status === st ? `${C.accent}22` : C.background,
                    borderWidth: 1,
                    borderColor: C.divider,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '700', color: C.textSecondary }}>{st}</Text>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 16, fontWeight: '900', textAlign: 'center' },
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
});
