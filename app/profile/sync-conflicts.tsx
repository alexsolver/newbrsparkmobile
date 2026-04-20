import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  ChecklistOutboxConflict,
  clearChecklistOutboxConflicts,
  getChecklistOutboxConflicts,
  requeueChecklistOutboxConflicts,
  removeChecklistOutboxConflictsByIds,
  resolveChecklistConflictRowTaskId,
} from '../../src/services/syncService';
import { ApiService } from '../../src/services/api';

function reasonLabel(reason: string): string {
  const r = String(reason || '').toLowerCase();
  if (r.includes('preflight_revision_mismatch')) return 'Revisão local diferente da revisão esperada no servidor';
  if (r.includes('server_revision_mismatch')) return 'Servidor recusou envio por conflito de revisão';
  if (r.includes('media_upload_stuck')) return 'Mídia local não enviada após múltiplas tentativas de sincronização';
  return reason || 'Conflito de sincronização';
}

function isRevisionConflictReason(reason: string): boolean {
  const r = String(reason || '').toLowerCase();
  return r.includes('preflight_revision_mismatch') || r.includes('server_revision_mismatch');
}

function fmtWhen(ts: number): string {
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return String(ts);
  }
}

export default function SyncConflictsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [rows, setRows] = useState<ChecklistOutboxConflict[]>([]);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    else setLoading(true);
    try {
      const list = await getChecklistOutboxConflicts();
      setRows(list);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const total = rows.length;
  const groupedByTask = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const key = r.taskId || 'sem-os';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map.size;
  }, [rows]);

  const requeueOne = useCallback(
    async (row: ChecklistOutboxConflict) => {
      setBusyId(row.id);
      try {
        const res = await requeueChecklistOutboxConflicts([row.id]);
        await ApiService.sync();
        await load(true);
        Alert.alert('Item reenfileirado', `1 item reenfileirado. Conflitos restantes: ${res.remaining}.`);
      } catch (e: any) {
        Alert.alert('Erro', e?.message || 'Não foi possível reenfileirar este item.');
      } finally {
        setBusyId(null);
      }
    },
    [load],
  );

  const dropOne = useCallback(
    async (row: ChecklistOutboxConflict) => {
      Alert.alert('Descartar conflito', 'Este item será removido da quarentena de conflitos.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Descartar',
          style: 'destructive',
          onPress: async () => {
            setBusyId(row.id);
            try {
              await removeChecklistOutboxConflictsByIds([row.id]);
              await load(true);
            } finally {
              setBusyId(null);
            }
          },
        },
      ]);
    },
    [load],
  );

  const requeueAll = useCallback(async () => {
    if (bulkBusy || rows.length === 0) return;
    setBulkBusy(true);
    try {
      const res = await requeueChecklistOutboxConflicts();
      await ApiService.sync();
      await load(true);
      Alert.alert('Conflitos reenfileirados', `${res.requeued} reenfileirado(s). Restantes: ${res.remaining}.`);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao reenfileirar conflitos.');
    } finally {
      setBulkBusy(false);
    }
  }, [bulkBusy, rows.length, load]);

  const clearAll = useCallback(async () => {
    if (bulkBusy || rows.length === 0) return;
    Alert.alert('Limpar todos os conflitos', 'Isso remove todos os itens da quarentena de conflitos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Limpar tudo',
        style: 'destructive',
        onPress: async () => {
          setBulkBusy(true);
          try {
            await clearChecklistOutboxConflicts();
            await load(true);
          } finally {
            setBulkBusy(false);
          }
        },
      },
    ]);
  }, [bulkBusy, rows.length, load]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color="#1e293b" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Conflitos de Sync</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#EA580C" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 28 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
        >
          <View style={s.summaryCard}>
            <Text style={s.summaryTitle}>Itens em conflito</Text>
            <Text style={s.summaryLine}>{total} conflito(s) em {groupedByTask} OS(s).</Text>
            <View style={s.summaryActions}>
              <TouchableOpacity
                style={[s.btnPrimary, bulkBusy || total === 0 ? s.btnDisabled : null]}
                disabled={bulkBusy || total === 0}
                onPress={() => void requeueAll()}
              >
                <Text style={s.btnPrimaryText}>{bulkBusy ? 'Processando...' : 'Reenfileirar todos'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.btnGhost, bulkBusy || total === 0 ? s.btnDisabled : null]}
                disabled={bulkBusy || total === 0}
                onPress={() => void clearAll()}
              >
                <Text style={s.btnGhostText}>Limpar tudo</Text>
              </TouchableOpacity>
            </View>
          </View>

          {rows.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="checkmark-done-circle-outline" size={24} color="#16A34A" />
              <Text style={s.emptyTitle}>Nenhum conflito pendente</Text>
              <Text style={s.emptyBody}>
                Conflitos de revisão e envios bloqueados por mídia local (após várias tentativas) aparecem aqui. Use
                «Reenfileirar» com rede estável ou após corrigir o arquivo.
              </Text>
            </View>
          ) : (
            rows.map((row) => {
              const disabled = bulkBusy || busyId === row.id;
              const displayTaskId = resolveChecklistConflictRowTaskId(row) || row.taskId || '';
              return (
                <View key={row.id} style={s.itemCard}>
                  <View style={s.itemTop}>
                    <Text style={s.itemTask}>OS: {displayTaskId || 'sem taskId'}</Text>
                    <Text style={s.itemWhen}>{fmtWhen(row.at)}</Text>
                  </View>
                  <Text style={s.itemReason}>{reasonLabel(row.reason)}</Text>
                  {isRevisionConflictReason(row.reason) ? (
                    <Text style={s.itemMeta}>
                      Revisão local: {row.submissionRevision ?? '-'} · servidor: {row.serverLastSubmittedRevision ?? '-'} · próximo esperado:{' '}
                      {row.serverExpectedNext ?? '-'}
                    </Text>
                  ) : null}
                  {(() => {
                    const md = row.payload?.metadata && typeof row.payload.metadata === 'object' ? row.payload.metadata : null;
                    const attempts = Number(md?.__mediaUploadAttempts);
                    const pending = Number(md?.__pendingLocalMediaCount);
                    const hint = typeof md?.__lastMediaUploadHint === 'string' ? md.__lastMediaUploadHint.trim() : '';
                    if (!Number.isFinite(attempts) && !Number.isFinite(pending)) return null;
                    return (
                      <View style={{ marginTop: 2 }}>
                        <Text style={s.itemMeta}>
                          Tentativas de upload: {Number.isFinite(attempts) ? Math.floor(attempts) : '-'} · arquivos locais pendentes:{' '}
                          {Number.isFinite(pending) ? Math.floor(pending) : '-'}
                        </Text>
                        {hint ? <Text style={s.itemMeta}>{hint}</Text> : null}
                      </View>
                    );
                  })()}
                  <View style={s.itemActions}>
                    <TouchableOpacity
                      style={[s.btnMiniPrimary, disabled ? s.btnDisabled : null]}
                      disabled={disabled}
                      onPress={() => void requeueOne(row)}
                    >
                      <Text style={s.btnMiniPrimaryText}>{busyId === row.id ? 'Processando...' : 'Reenfileirar'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.btnMiniDanger, disabled ? s.btnDisabled : null]}
                      disabled={disabled}
                      onPress={() => void dropOne(row)}
                    >
                      <Text style={s.btnMiniDangerText}>Descartar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    paddingTop: 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  headerTitle: { fontSize: 16, fontWeight: '900', color: '#0F172A' },
  summaryCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  summaryTitle: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  summaryLine: { marginTop: 6, fontSize: 12, color: '#64748B' },
  summaryActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  btnPrimary: {
    flex: 1,
    backgroundColor: '#B45309',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  btnGhost: {
    flex: 1,
    backgroundColor: '#FEF2F2',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnGhostText: { color: '#B91C1C', fontWeight: '800', fontSize: 12 },
  btnDisabled: { opacity: 0.6 },
  empty: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#0F172A' },
  emptyBody: { fontSize: 12, color: '#64748B', textAlign: 'center' },
  itemCard: {
    marginHorizontal: 16,
    marginTop: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  itemTask: { fontSize: 13, fontWeight: '800', color: '#0F172A', flex: 1 },
  itemWhen: { fontSize: 11, color: '#94A3B8' },
  itemReason: { marginTop: 8, fontSize: 12, color: '#334155', fontWeight: '600' },
  itemMeta: { marginTop: 6, fontSize: 11, color: '#64748B' },
  itemActions: { marginTop: 12, flexDirection: 'row', gap: 8 },
  btnMiniPrimary: {
    backgroundColor: '#D97706',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnMiniPrimaryText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  btnMiniDanger: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  btnMiniDangerText: { color: '#B91C1C', fontSize: 12, fontWeight: '800' },
});
