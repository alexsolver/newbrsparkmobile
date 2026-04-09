import React, { useCallback, useMemo, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { TechnicianFinanceKind } from '../types/technicianFinance';
import {
  loadTechnicianExpenseCategoryCatalog,
  labelForTechnicianExpenseCategory,
  type TechnicianExpenseCategoryRow,
} from '../utils/technicianExpenseCategoryCatalog';

type DraftLine = {
  entryId?: string;
  kind: TechnicianFinanceKind;
  amountStr: string;
  description: string;
  categoryKey?: string;
};

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  readOnly: boolean;
};

function readMeta(prevRaw: string | undefined): { rev: number | null } {
  try {
    const j = typeof prevRaw === 'string' ? JSON.parse(prevRaw || '{}') : prevRaw;
    if (!j || typeof j !== 'object') return { rev: null };
    const revRaw = (j as any).financeAppliedRev;
    const rev =
      revRaw !== undefined && revRaw !== null && Number.isFinite(Number(revRaw)) ? Number(revRaw) : null;
    return { rev };
  } catch {
    return { rev: null };
  }
}

function parseDraftLines(prevRaw: string | undefined): DraftLine[] {
  try {
    const j = typeof prevRaw === 'string' ? JSON.parse(prevRaw || '{}') : prevRaw;
    const linesRaw = j && typeof j === 'object' && Array.isArray((j as any).lines) ? (j as any).lines : [];
    if (linesRaw.length === 0) return [];
    return linesRaw.map((x: any) => ({
      entryId: x?.entryId != null ? String(x.entryId).trim() : undefined,
      kind: x?.kind === 'revenue' ? 'revenue' : 'expense',
      amountStr:
        x?.amount !== undefined && x?.amount !== null && String(x.amount).trim() !== ''
          ? String(x.amount).replace('.', ',')
          : '',
      description: x?.description != null ? String(x.description) : '',
      categoryKey:
        x?.categoryKey != null && String(x.categoryKey).trim() !== ''
          ? String(x.categoryKey).trim()
          : undefined,
    }));
  } catch {
    return [];
  }
}

function serialize(lines: DraftLine[], prevRaw: string | undefined): string {
  const { rev } = readMeta(prevRaw);
  const outLines = lines.map((l) => {
    const amount = Math.max(0, Number(String(l.amountStr).replace(',', '.')) || 0);
    const o: Record<string, unknown> = {
      kind: l.kind,
      amount,
      description: l.description.trim() || undefined,
    };
    if (l.entryId) o.entryId = l.entryId;
    if (l.kind === 'expense' && l.categoryKey != null && String(l.categoryKey).trim() !== '') {
      o.categoryKey = String(l.categoryKey).trim();
    }
    return o;
  });
  const base: Record<string, unknown> = { v: 1, lines: outLines };
  if (rev != null) base.financeAppliedRev = rev;
  return JSON.stringify(base);
}

export function ChecklistTechnicianFinanceField({ value, onChange, readOnly }: Props) {
  const [expenseCatalog, setExpenseCatalog] = useState<TechnicianExpenseCategoryRow[]>(() =>
    loadTechnicianExpenseCategoryCatalog()
  );

  useFocusEffect(
    useCallback(() => {
      setExpenseCatalog(loadTechnicianExpenseCategoryCatalog());
    }, [])
  );

  const lines = useMemo(() => {
    const d = parseDraftLines(value);
    return d.length > 0
      ? d
      : readOnly
        ? []
        : [{ kind: 'expense' as const, amountStr: '', description: '', categoryKey: undefined }];
  }, [value, readOnly]);

  const push = useCallback(
    (next: DraftLine[]) => {
      onChange(serialize(next, value));
    },
    [onChange, value]
  );

  const setLines = useCallback(
    (updater: (prev: DraftLine[]) => DraftLine[]) => {
      const prev = parseDraftLines(value);
      const base =
        prev.length > 0
          ? prev
          : [{ kind: 'expense' as const, amountStr: '', description: '', categoryKey: undefined }];
      push(updater(base));
    },
    [push, value]
  );

  const addLine = () => {
    setLines((prev) => [...prev, { kind: 'expense', amountStr: '', description: '', categoryKey: undefined }]);
  };

  const removeLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const fmtBrl = (n: number) =>
    n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  if (readOnly) {
    const display = parseDraftLines(value).filter((l) => Number(String(l.amountStr).replace(',', '.')) > 0);
    if (display.length === 0) {
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="wallet-outline" size={32} color="#94a3b8" />
          <Text style={styles.emptyText}>Nenhum custo ou receita registrado</Text>
        </View>
      );
    }
    return (
      <View style={{ gap: 10 }}>
        {display.map((l, i) => {
          const amt = Number(String(l.amountStr).replace(',', '.')) || 0;
          const catLbl =
            l.kind === 'expense'
              ? labelForTechnicianExpenseCategory(expenseCatalog, l.categoryKey)
              : null;
          return (
            <View key={i} style={styles.lineCard}>
              <View
                style={[
                  styles.kindPill,
                  l.kind === 'revenue' ? styles.kindRev : styles.kindExp,
                ]}
              >
                <Text style={styles.kindPillText}>{l.kind === 'revenue' ? 'Receita' : 'Despesa'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.amtText}>{fmtBrl(amt)}</Text>
                {catLbl ? (
                  <Text style={styles.catText} numberOfLines={2}>
                    {catLbl}
                  </Text>
                ) : null}
                {l.description.trim() ? (
                  <Text style={styles.descText} numberOfLines={3}>
                    {l.description}
                  </Text>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.hint}>
        Registre valores associados a este atendimento. Eles ficam no seu financeiro técnico (separado dos bens).
      </Text>
      <View style={{ gap: 12 }}>
        {lines.map((l, idx) => (
          <View key={idx} style={styles.editCard}>
            <View style={styles.kindRow}>
              <TouchableOpacity
                style={[styles.kindBtn, l.kind === 'expense' && styles.kindBtnOnExp]}
                onPress={() => updateLine(idx, { kind: 'expense' })}
              >
                <Text style={[styles.kindBtnTxt, l.kind === 'expense' && styles.kindBtnTxtOn]}>Despesa</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.kindBtn, l.kind === 'revenue' && styles.kindBtnOnRev]}
                onPress={() => updateLine(idx, { kind: 'revenue' })}
              >
                <Text style={[styles.kindBtnTxt, l.kind === 'revenue' && styles.kindBtnTxtOn]}>Receita</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              {lines.length > 1 ? (
                <TouchableOpacity onPress={() => removeLine(idx)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={22} color="#dc2626" />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.lbl}>Valor (R$)</Text>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#94a3b8"
              value={l.amountStr}
              onChangeText={(t) => updateLine(idx, { amountStr: t })}
            />
            {l.kind === 'expense' ? (
              <>
                <Text style={styles.lbl}>Categoria da despesa</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.catChipRow}
                >
                  {expenseCatalog.map((c) => {
                    const on = l.categoryKey === c.id;
                    const col = c.color || '#64748b';
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[
                          styles.catChip,
                          on && { borderColor: col, backgroundColor: `${col}18` },
                        ]}
                        onPress={() => updateLine(idx, { categoryKey: c.id })}
                        activeOpacity={0.85}
                      >
                        {c.icon ? (
                          <Ionicons
                            name={c.icon as ComponentProps<typeof Ionicons>['name']}
                            size={14}
                            color={on ? col : '#64748b'}
                            style={{ marginRight: 4 }}
                          />
                        ) : null}
                        <Text
                          style={[styles.catChipTxt, on && { color: col, fontWeight: '800' }]}
                          numberOfLines={2}
                        >
                          {c.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {l.categoryKey === 'outros' && !l.description.trim() ? (
                  <Text style={styles.warnTxt}>Em "Outros", preencha a descrição.</Text>
                ) : null}
              </>
            ) : null}
            <Text style={styles.lbl}>Descrição (opcional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Ex.: pedágio, estacionamento, adiantamento…"
              placeholderTextColor="#94a3b8"
              value={l.description}
              onChangeText={(t) => updateLine(idx, { description: t })}
              multiline
              maxLength={500}
            />
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={addLine} activeOpacity={0.85}>
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
        <Text style={styles.addBtnText}>Adicionar linha</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 12,
  },
  emptyBox: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#cbd5e1',
  },
  emptyText: { marginTop: 8, fontSize: 14, color: '#64748b', fontWeight: '600' },
  lineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  kindPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  kindExp: { backgroundColor: '#fee2e2' },
  kindRev: { backgroundColor: '#d1fae5' },
  kindPillText: { fontSize: 11, fontWeight: '800', color: '#0f172a' },
  amtText: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  catText: { fontSize: 12, fontWeight: '700', color: '#475569', marginTop: 4 },
  descText: { fontSize: 13, color: '#64748b', marginTop: 4 },
  catChipRow: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, marginBottom: 10, paddingRight: 8 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  catChipTxt: { fontSize: 11, fontWeight: '600', color: '#475569', flexShrink: 1 },
  warnTxt: { fontSize: 11, color: '#b45309', fontWeight: '700', marginBottom: 8 },
  editCard: {
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  kindBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  kindBtnOnExp: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  kindBtnOnRev: { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
  kindBtnTxt: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  kindBtnTxtOn: { color: '#0f172a' },
  lbl: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#0f172a',
    marginBottom: 10,
  },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  addBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0f766e',
    paddingVertical: 12,
    borderRadius: 10,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
