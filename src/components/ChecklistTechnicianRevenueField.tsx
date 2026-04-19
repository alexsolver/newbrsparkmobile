import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  parseTechnicianRevenueIntegrationValue,
  serializeTechnicianRevenueIntegration,
  type TechnicianRevenueIntLine,
} from '../checklist/technicianRevenueIntegrationValue';
import {
  fetchTechnicianRevenueInputs,
  type TechnicianRevenueInputDto,
} from '../services/technicianRevenueInputsApi';

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  readOnly: boolean;
};

function normFtsFromDto(raw: TechnicianRevenueInputDto['fts_origem']): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  return [];
}

function mergeApiWithSaved(
  api: TechnicianRevenueInputDto[],
  saved: ReturnType<typeof parseTechnicianRevenueIntegrationValue>
): TechnicianRevenueIntLine[] {
  const map =
    saved.version === 2
      ? new Map(saved.lines.map((l) => [l.inputId, l]))
      : new Map<string, TechnicianRevenueIntLine>();
  return api.map((row) => {
    const prev = map.get(row.id);
    const amount = Math.max(0, Number(row.valor) || 0);
    return {
      inputId: row.id,
      description: String(row.descricao || '').trim() || '—',
      amount,
      originFts: normFtsFromDto(row.fts_origem),
      decision: prev?.decision === 'accepted' ? 'accepted' : 'pending',
      entryId: prev?.entryId,
    };
  });
}

export function ChecklistTechnicianRevenueField({ value, onChange, readOnly }: Props) {
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<TechnicianRevenueInputDto[]>([]);
  const lastApiFingerprint = useRef<string>('');

  const saved = useMemo(() => parseTechnicianRevenueIntegrationValue(value), [value]);

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const list = await fetchTechnicianRevenueInputs();
      setInputs(list);
    } catch (e: any) {
      setApiError(e?.message || 'Não foi possível carregar as receitas da integração.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (readOnly) return;
    if (!inputs.length) {
      lastApiFingerprint.current = '';
      return;
    }
    const fp = inputs.map((i) => i.id).join('|');
    if (fp === lastApiFingerprint.current) return;
    lastApiFingerprint.current = fp;
    const merged = mergeApiWithSaved(inputs, parseTechnicianRevenueIntegrationValue(value));
    const next = serializeTechnicianRevenueIntegration({ lines: merged, prevRaw: value });
    const prev = value == null || String(value).trim() === '' ? '' : String(value);
    if (next === prev) return;
    onChange(next);
  }, [inputs, readOnly, onChange, value]);

  const linesV2 = useMemo(() => {
    if (inputs.length === 0) return saved.version === 2 ? saved.lines : [];
    return mergeApiWithSaved(inputs, saved);
  }, [inputs, saved]);

  const setLines = useCallback(
    (next: TechnicianRevenueIntLine[]) => {
      onChange(serializeTechnicianRevenueIntegration({ lines: next, prevRaw: value }));
    },
    [onChange, value]
  );

  const acceptLine = (inputId: string) => {
    const next = linesV2.map((l) => (l.inputId === inputId ? { ...l, decision: 'accepted' as const } : l));
    setLines(next);
  };

  const fmtBrl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#15803d" />
        <Text style={styles.loadingText}>Carregando receitas (integração)…</Text>
      </View>
    );
  }

  if (apiError && inputs.length === 0) {
    return (
      <View style={styles.errorBox}>
        <Ionicons name="cloud-offline-outline" size={28} color="#b45309" />
        <Text style={styles.errorText}>{apiError}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={load} accessibilityRole="button">
          <Text style={styles.retryBtnText}>Tentar novamente</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (linesV2.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="trending-up-outline" size={32} color="#94a3b8" />
        <Text style={styles.emptyText}>Nenhuma receita pendente</Text>
        <Text style={styles.emptySub}>
          Os valores são enviados pela central (ERP/CRM). Quando houver linhas, poderá aceitá-las para lançar no seu
          financeiro técnico.
        </Text>
        <TouchableOpacity style={styles.refreshLink} onPress={load} hitSlop={12}>
          <Text style={styles.refreshLinkText}>Atualizar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.intro}>
        Receitas definidas pela integração — não é possível editar valores nem descrições. Ao aceitar, cada item é
        registado como receita no módulo financeiro (com os números das FTs de origem na descrição).
      </Text>
      <View style={{ gap: 12 }}>
        {linesV2.map((l) => (
          <View key={l.inputId} style={styles.lineCard}>
            <Text style={styles.lineDesc} numberOfLines={5}>
              {l.description}
            </Text>
            <Text style={styles.amount}>{fmtBrl(l.amount)}</Text>
            {l.originFts.length > 0 ? (
              <Text style={styles.ftLine}>
                <Text style={styles.ftLabel}>FTs de origem: </Text>
                {l.originFts.join(', ')}
              </Text>
            ) : null}
            {readOnly ? (
              <View style={styles.acceptedBadge}>
                <Text style={styles.acceptedText}>
                  {l.decision === 'accepted' ? 'Aceite — será lançado ao concluir' : 'Pendente de aceitação'}
                </Text>
              </View>
            ) : l.decision === 'accepted' ? (
              <View style={styles.acceptedRow}>
                <Ionicons name="checkmark-circle" size={22} color="#15803d" />
                <Text style={styles.acceptedInline}>Receita aceite para lançamento</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => acceptLine(l.inputId)}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Aceitar e adicionar receita"
              >
                <Ionicons name="add-circle-outline" size={22} color="#fff" />
                <Text style={styles.acceptBtnText}>Aceitar e adicionar receita</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
      </View>
      {!readOnly ? (
        <TouchableOpacity style={styles.refreshBtn} onPress={load} accessibilityRole="button">
          <Ionicons name="refresh" size={18} color="#15803d" />
          <Text style={styles.refreshBtnText}>Atualizar lista da integração</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  loadingText: { marginTop: 8, fontSize: 13, color: '#64748b' },
  errorBox: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    gap: 10,
  },
  errorText: { fontSize: 13, color: '#92400e', textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    backgroundColor: '#15803d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#86efac',
  },
  emptyText: { marginTop: 8, fontSize: 15, color: '#64748b', fontWeight: '700', textAlign: 'center' },
  emptySub: {
    marginTop: 8,
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  refreshLink: { marginTop: 12, padding: 8 },
  refreshLinkText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  intro: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 17,
    marginBottom: 12,
  },
  lineCard: {
    padding: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 8,
  },
  lineDesc: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  amount: { fontSize: 20, fontWeight: '800', color: '#15803d' },
  ftLine: { fontSize: 12, color: '#475569', lineHeight: 18 },
  ftLabel: { fontWeight: '700' },
  acceptBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803d',
    paddingVertical: 12,
    borderRadius: 10,
  },
  acceptBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  acceptedInline: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  acceptedBadge: { marginTop: 6 },
  acceptedText: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  refreshBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  refreshBtnText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
});
