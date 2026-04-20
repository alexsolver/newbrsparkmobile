import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  parseMaterialsReceiptValue,
  serializeMaterialsReceiptV2,
  type MaterialsReceiptLineV2,
  type ReceiptDecision,
} from '../checklist/materialsReceiptValue';
import {
  fetchMaterialsReceiptInputs,
  type MaterialsReceiptInputDto,
} from '../services/materialsReceiptInputsApi';
import { resolveReceiptLineToStockItemId } from '../checklist/applyMaterialsReceiptOnSubmit';
import { TechnicianStockService } from '../services/technicianStockService';

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  readOnly: boolean;
  userEmail?: string;
};

function mergeApiWithSaved(
  api: MaterialsReceiptInputDto[],
  saved: ReturnType<typeof parseMaterialsReceiptValue>
): MaterialsReceiptLineV2[] {
  const map =
    saved.version === 2
      ? new Map(saved.lines.map((l) => [l.inputId, l]))
      : new Map<string, MaterialsReceiptLineV2>();
  return api.map((row) => {
    const prev = map.get(row.id);
    return {
      inputId: row.id,
      name: String(row.nome || '').trim() || '—',
      sku: String(row.sku || '').trim(),
      codigoInterno: String(row.codigo_interno || '').trim() || undefined,
      qty: Math.max(0, Math.floor(Number(row.qtd) || 0)),
      meta: row.meta as MaterialsReceiptLineV2['meta'],
      decision: prev?.decision ?? 'pending',
      rejectReason: prev?.rejectReason,
    };
  });
}

export function ChecklistMaterialsReceiptField({ value, onChange, readOnly, userEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<MaterialsReceiptInputDto[]>([]);
  const [stockItems, setStockItems] = useState<Awaited<ReturnType<typeof TechnicianStockService.getItems>>>([]);
  const lastApiFingerprint = useRef<string>('');

  const saved = useMemo(() => parseMaterialsReceiptValue(value), [value]);
  const legacyV1 = saved.version === 1 ? saved : null;

  const load = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    try {
      const [list, stock] = await Promise.all([
        fetchMaterialsReceiptInputs(),
        TechnicianStockService.getItems(userEmail),
      ]);
      setInputs(list);
      setStockItems(stock);
    } catch (e: any) {
      setApiError(e?.message || 'Não foi possível carregar os materiais da integração.');
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  /** Quando a lista vinda da API mudar, fundir com respostas já guardadas (preserva decisões). */
  useEffect(() => {
    if (readOnly) return;
    if (!inputs.length) {
      lastApiFingerprint.current = '';
      return;
    }
    const fp = inputs.map((i) => i.id).join('|');
    if (fp === lastApiFingerprint.current) return;
    lastApiFingerprint.current = fp;
    const merged = mergeApiWithSaved(inputs, parseMaterialsReceiptValue(value));
    onChange(serializeMaterialsReceiptV2({ lines: merged, prevRaw: value }));
  }, [inputs, readOnly, onChange, value]);

  const linesV2 = useMemo(() => {
    if (inputs.length === 0) return saved.version === 2 ? saved.lines : [];
    return mergeApiWithSaved(inputs, saved);
  }, [inputs, saved]);

  const setLines = useCallback(
    (next: MaterialsReceiptLineV2[]) => {
      onChange(serializeMaterialsReceiptV2({ lines: next, prevRaw: value }));
    },
    [onChange, value]
  );

  const setDecision = (inputId: string, decision: ReceiptDecision) => {
    const next = linesV2.map((l) =>
      l.inputId === inputId
        ? {
            ...l,
            decision,
            rejectReason: decision === 'rejected' ? l.rejectReason : undefined,
          }
        : l
    );
    setLines(next);
  };

  const setRejectReason = (inputId: string, text: string) => {
    const next = linesV2.map((l) => (l.inputId === inputId ? { ...l, rejectReason: text } : l));
    setLines(next);
  };

  const stockMatchHint = (l: MaterialsReceiptLineV2): string | null => {
    const id = resolveReceiptLineToStockItemId(l, stockItems);
    return id ? null : 'Sem correspondência no seu estoque pelo SKU, cadastre em Meu estoque ou ajuste a integração.';
  };

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#15803d" />
        <Text style={styles.loadingText}>Carregando materiais (integração)…</Text>
      </View>
    );
  }

  if (legacyV1 && legacyV1.lines.length > 0 && inputs.length === 0) {
    return (
      <View style={styles.legacyWrap}>
        <Text style={styles.legacyTitle}>Registro anterior (formato legado)</Text>
        <Text style={styles.legacyHint}>
          Este campo passou a ser alimentado só pela integração. As quantidades abaixo foram salvas antes desta
          alteração.
        </Text>
        {legacyV1.lines.map((l) => (
          <View key={l.itemId} style={styles.lineCard}>
            <Text style={styles.lineName} numberOfLines={2}>
              {l.name || 'Item'}
            </Text>
            <Text style={styles.lineSku}>
              SKU {l.sku || '—'} × {l.qty} {l.unit || ''}
            </Text>
          </View>
        ))}
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
        <Ionicons name="cube-outline" size={32} color="#94a3b8" />
        <Text style={styles.emptyText}>Nenhum material para recebimento</Text>
        <Text style={styles.emptySub}>
          A lista é enviada pela central (ERP/CRM). Quando houver linhas, poderá aceitar ou recusar cada item.
        </Text>
        <TouchableOpacity style={styles.retryLink} onPress={load} hitSlop={12}>
          <Text style={styles.retryLinkText}>Atualizar lista</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.intro}>
        Lista definida pela integração, não é possível alterar quantidades ou incluir itens manualmente. Aceite ou
        recuse cada linha. Em caso de recusa, a justificativa é obrigatória.
      </Text>

      <View style={{ gap: 12 }}>
        {linesV2.map((l) => {
          const warn = l.decision === 'accepted' && l.qty > 0 ? stockMatchHint(l) : null;
          return (
            <View key={l.inputId} style={styles.lineCard}>
              <Text style={styles.lineName} numberOfLines={3}>
                {l.name}
              </Text>
              <Text style={styles.lineSku}>
                SKU: {l.sku || '—'}
                {l.codigoInterno ? ` · Cód.: ${l.codigoInterno}` : ''}
              </Text>
              <Text style={styles.qtyLabel}>Quantidade: {l.qty}</Text>
              {warn ? <Text style={styles.warnText}>{warn}</Text> : null}

              {readOnly ? (
                <View style={styles.readDecision}>
                  <Text style={styles.readDecisionText}>
                    {l.decision === 'accepted'
                      ? 'Aceito'
                      : l.decision === 'rejected'
                        ? 'Recusado'
                        : 'Pendente'}
                  </Text>
                  {l.decision === 'rejected' && (l.rejectReason || '').trim() ? (
                    <Text style={styles.readJustify}>{String(l.rejectReason).trim()}</Text>
                  ) : null}
                </View>
              ) : (
                <View style={{ width: '100%' }}>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[
                        styles.pill,
                        l.decision === 'accepted' && styles.pillActiveAccept,
                      ]}
                      onPress={() => setDecision(l.inputId, 'accepted')}
                      accessibilityRole="button"
                      accessibilityLabel="Aceitar material"
                    >
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={l.decision === 'accepted' ? '#fff' : '#15803d'}
                      />
                      <Text
                        style={[styles.pillText, l.decision === 'accepted' && styles.pillTextOn]}
                      >
                        Aceitar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.pill,
                        l.decision === 'rejected' && styles.pillActiveReject,
                      ]}
                      onPress={() => setDecision(l.inputId, 'rejected')}
                      accessibilityRole="button"
                      accessibilityLabel="Recusar material"
                    >
                      <Ionicons
                        name="close-circle"
                        size={18}
                        color={l.decision === 'rejected' ? '#fff' : '#dc2626'}
                      />
                      <Text
                        style={[styles.pillText, styles.pillTextReject, l.decision === 'rejected' && styles.pillTextOn]}
                      >
                        Recusar
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {l.decision === 'rejected' ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={styles.justifyLabel}>Justificativa (obrigatória)</Text>
                      <TextInput
                        style={styles.justifyInput}
                        placeholder="Descreva o motivo da recusa…"
                        placeholderTextColor="#94a3b8"
                        multiline
                        maxLength={2000}
                        editable={!readOnly}
                        value={l.rejectReason || ''}
                        onChangeText={(t) => setRejectReason(l.inputId, t)}
                        textAlignVertical="top"
                      />
                    </View>
                  ) : null}
                </View>
              )}
            </View>
          );
        })}
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
    backgroundColor: '#f0fdf4',
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
  retryLink: { marginTop: 12, padding: 8 },
  retryLinkText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  legacyWrap: {
    padding: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  legacyTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  legacyHint: { fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 17 },
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
    gap: 10,
  },
  lineName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  lineSku: { fontSize: 12, color: '#64748b', marginTop: 4 },
  qtyLabel: { fontSize: 14, fontWeight: '600', color: '#15803d', marginTop: 6 },
  warnText: { marginTop: 8, fontSize: 12, color: '#b45309', lineHeight: 16 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  pillActiveAccept: { backgroundColor: '#15803d', borderColor: '#15803d' },
  pillActiveReject: { backgroundColor: '#dc2626', borderColor: '#dc2626' },
  pillText: { fontSize: 14, fontWeight: '700', color: '#15803d' },
  pillTextReject: { color: '#dc2626' },
  pillTextOn: { color: '#fff' },
  justifyLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  justifyInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#fca5a5',
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#fff7f7',
  },
  readDecision: { alignItems: 'flex-end' },
  readDecisionText: { fontSize: 13, fontWeight: '800', color: '#15803d' },
  readJustify: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748b',
    textAlign: 'right',
    maxWidth: 200,
  },
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
