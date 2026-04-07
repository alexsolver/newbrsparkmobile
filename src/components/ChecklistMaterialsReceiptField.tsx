import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TechnicianStockService } from '../services/technicianStockService';
import { StockItem } from '../types/stock';
import { parseMaterialsValue, type MaterialsLine } from '../checklist/applyMaterialsStockOnSubmit';

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  readOnly: boolean;
  userEmail?: string;
};

function serialize(lines: MaterialsLine[], prevRaw: string | undefined): string {
  const p = parseMaterialsValue(prevRaw);
  return JSON.stringify({
    v: 1,
    lines,
    stockAppliedRev: p.stockAppliedRev,
    lastApplied: p.lastApplied && Object.keys(p.lastApplied).length ? p.lastApplied : undefined,
  });
}

export function ChecklistMaterialsReceiptField({ value, onChange, readOnly, userEmail }: Props) {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  const lines = useMemo(() => parseMaterialsValue(value).lines, [value]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const list = await TechnicianStockService.getItems(userEmail);
      setItems(list);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const setLines = useCallback(
    (next: MaterialsLine[]) => {
      onChange(serialize(next, value));
    },
    [onChange, value]
  );

  const updateQty = (itemId: string, qtyStr: string) => {
    const q = Math.max(0, Math.floor(Number(qtyStr.replace(',', '.')) || 0));
    const next = lines
      .map((l) => (l.itemId === itemId ? { ...l, qty: q } : l))
      .filter((l) => l.qty > 0);
    setLines(next);
  };

  const bumpQty = (itemId: string, delta: number) => {
    const line = lines.find((l) => l.itemId === itemId);
    if (!line) return;
    const nextVal = Math.max(0, Math.floor(line.qty + delta));
    const next = lines
      .map((l) => (l.itemId === itemId ? { ...l, qty: nextVal } : l))
      .filter((l) => l.qty > 0);
    setLines(next);
  };

  const removeLine = (itemId: string) => {
    setLines(lines.filter((l) => l.itemId !== itemId));
  };

  const addItem = (it: StockItem) => {
    if (lines.some((l) => l.itemId === it.id)) {
      setPickerOpen(false);
      return;
    }
    setLines([
      ...lines,
      {
        itemId: it.id,
        sku: it.sku,
        name: it.name,
        unit: it.unit,
        qty: 1,
      },
    ]);
    setPickerOpen(false);
    setSearch('');
  };

  const filteredPick = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(s) ||
        String(i.sku || '')
          .toLowerCase()
          .includes(s)
    );
  }, [items, search]);

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#15803d" />
        <Text style={styles.loadingText}>A carregar estoque técnico…</Text>
      </View>
    );
  }

  return (
    <View>
      {lines.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="arrow-down-circle-outline" size={32} color="#94a3b8" />
          <Text style={styles.emptyText}>Nenhuma entrada registada</Text>
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {lines.map((l) => {
            const st = items.find((x) => x.id === l.itemId);
            return (
              <View key={l.itemId} style={styles.lineCard}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.lineName} numberOfLines={2}>
                    {l.name || st?.name || 'Item'}
                  </Text>
                  <Text style={styles.lineSku}>
                    SKU {l.sku || st?.sku || '—'}
                    {st != null ? ` · stock atual: ${st.currentStock} ${l.unit || st?.unit || ''}` : ''}
                  </Text>
                </View>
                {!readOnly ? (
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => bumpQty(l.itemId, -1)}
                      accessibilityRole="button"
                      accessibilityLabel="Diminuir quantidade"
                      hitSlop={8}
                    >
                      <Ionicons name="remove" size={22} color="#15803d" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.qtyInput}
                      keyboardType="number-pad"
                      value={String(l.qty)}
                      onChangeText={(t) => updateQty(l.itemId, t)}
                      accessibilityLabel="Quantidade"
                    />
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => bumpQty(l.itemId, 1)}
                      accessibilityRole="button"
                      accessibilityLabel="Aumentar quantidade"
                      hitSlop={8}
                    >
                      <Ionicons name="add" size={22} color="#15803d" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeLine(l.itemId)} hitSlop={12}>
                      <Ionicons name="trash-outline" size={22} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.readQty}>×{l.qty}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}

      {!readOnly ? (
        <TouchableOpacity style={styles.addBtn} onPress={() => setPickerOpen(true)} activeOpacity={0.85}>
          <Ionicons name="add-circle-outline" size={22} color="#fff" />
          <Text style={styles.addBtnText}>Adicionar material</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPickerOpen(false)}>
          <View style={styles.modalCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Entrada no estoque técnico</Text>
            <Text style={styles.modalHint}>
              Regista materiais recebidos; o saldo aumenta ao concluir o checklist. Itens cadastrados em «Meu estoque».
            </Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Pesquisar nome ou SKU…"
              value={search}
              onChangeText={setSearch}
              placeholderTextColor="#94a3b8"
            />
            <FlatList
              data={filteredPick}
              keyExtractor={(it) => it.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={
                <Text style={styles.emptyPick}>
                  Ainda sem produtos no estoque técnico. Use o botão + no menu ou o ecrã de cadastro.
                </Text>
              }
              renderItem={({ item: it }) => (
                <TouchableOpacity style={styles.pickRow} onPress={() => addItem(it)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.pickSku}>
                      {it.sku} · {it.currentStock} {it.unit}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#86efac',
  },
  emptyText: { marginTop: 8, fontSize: 14, color: '#64748b', fontWeight: '600' },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 10,
  },
  lineName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  lineSku: { fontSize: 12, color: '#64748b', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyInput: {
    width: 48,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    color: '#0f172a',
  },
  readQty: { fontSize: 16, fontWeight: '800', color: '#15803d', minWidth: 40, textAlign: 'right' },
  addBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803d',
    paddingVertical: 12,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  modalHint: { fontSize: 12, color: '#64748b', marginBottom: 10, lineHeight: 17 },
  searchInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
    color: '#0f172a',
  },
  emptyPick: { padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  pickName: { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  pickSku: { fontSize: 12, color: '#64748b', marginTop: 2 },
  modalClose: { marginTop: 12, alignItems: 'center', paddingVertical: 10 },
  modalCloseText: { fontSize: 15, fontWeight: '700', color: '#15803d' },
});
