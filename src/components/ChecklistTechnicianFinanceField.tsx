import React, { useCallback, useMemo, useState, useRef, type ComponentProps } from 'react';
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
import { useTranslation } from 'react-i18next';
import { ValueInput, parseLocaleAmountString } from './ValueInput';

type DraftLine = {
  entryId?: string;
  kind: TechnicianFinanceKind;
  amountStr: string;
  description: string;
  categoryKey?: string;
};

type FinanceFieldMode = 'expense' | 'revenue';

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  readOnly: boolean;
  /** Só despesas ou só receitas, conforme o tipo do campo no modelo. */
  mode?: FinanceFieldMode;
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
          ? String(x.amount)
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

function parseAmountToNumber(amountStr: string): number {
  const n = parseLocaleAmountString(String(amountStr || '').trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function serialize(lines: DraftLine[], prevRaw: string | undefined): string {
  const { rev } = readMeta(prevRaw);
  const outLines = lines.map((l) => {
    const amount = Math.max(0, parseAmountToNumber(l.amountStr));
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

function defaultKindForMode(mode: FinanceFieldMode): TechnicianFinanceKind {
  if (mode === 'revenue') return 'revenue';
  return 'expense';
}

export function ChecklistTechnicianFinanceField({
  value,
  onChange,
  readOnly,
  mode = 'expense',
}: Props) {
  const { t, i18n } = useTranslation();
  const amountDraftByLineRef = useRef<Record<number, string>>({});
  const amountEditingByLineRef = useRef<Record<number, boolean>>({});

  const [expenseCatalog, setExpenseCatalog] = useState<TechnicianExpenseCategoryRow[]>(() =>
    loadTechnicianExpenseCategoryCatalog()
  );

  useFocusEffect(
    useCallback(() => {
      setExpenseCatalog(loadTechnicianExpenseCategoryCatalog());
    }, [])
  );

  const lines = useMemo(() => {
    const d = parseDraftLines(value).map((l) => ({ ...l, kind: defaultKindForMode(mode) }));
    const k0 = defaultKindForMode(mode);
    return d.length > 0
      ? d
      : readOnly
        ? []
        : [{ kind: k0, amountStr: '', description: '', categoryKey: undefined }];
  }, [value, readOnly, mode]);

  const mergeAmountDraftsIntoLines = useCallback((next: DraftLine[]): DraftLine[] => {
    return next.map((l, i) => {
      if (!amountEditingByLineRef.current[i]) return l;
      const draft = amountDraftByLineRef.current[i];
      if (draft === undefined) return l;
      if (draft.trim() === '') return { ...l, amountStr: '' };
      const n = parseLocaleAmountString(draft);
      return { ...l, amountStr: String(n) };
    });
  }, []);

  const push = useCallback(
    (next: DraftLine[]) => {
      const merged = mergeAmountDraftsIntoLines(next);
      const norm = merged.map((l) => ({ ...l, kind: defaultKindForMode(mode) }));
      onChange(serialize(norm, value));
    },
    [onChange, value, mode, mergeAmountDraftsIntoLines]
  );

  const setLines = useCallback(
    (updater: (prev: DraftLine[]) => DraftLine[]) => {
      const prev = parseDraftLines(value);
      const k0 = defaultKindForMode(mode);
      const base =
        prev.length > 0
          ? prev
          : [{ kind: k0, amountStr: '', description: '', categoryKey: undefined }];
      push(updater(base));
    },
    [push, value, mode]
  );

  const addLine = () => {
    const k0 = defaultKindForMode(mode);
    setLines((prev) => [...prev, { kind: k0, amountStr: '', description: '', categoryKey: undefined }]);
  };

  const removeLine = (idx: number) => {
    amountDraftByLineRef.current = {};
    amountEditingByLineRef.current = {};
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const fmtBrl = (n: number) => {
    const loc = String(i18n.language || 'en-US').replace('_', '-');
    return n.toLocaleString(loc, { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
  };

  const hintText =
    mode === 'revenue' ? t('technicianFinance.hintRevenue') : t('technicianFinance.hintExpense');

  if (readOnly) {
    const display = parseDraftLines(value)
      .map((l) => ({ ...l, kind: defaultKindForMode(mode) }))
      .filter((l) => parseAmountToNumber(l.amountStr) > 0);
    if (display.length === 0) {
      const emptyMsg = mode === 'revenue' ? t('technicianFinance.emptyRevenue') : t('technicianFinance.emptyExpense');
      return (
        <View style={styles.emptyBox}>
          <Ionicons name="wallet-outline" size={32} color="#94a3b8" />
          <Text style={styles.emptyText}>{emptyMsg}</Text>
        </View>
      );
    }
    return (
      <View style={{ gap: 10 }}>
        {display.map((l, i) => {
          const amt = parseAmountToNumber(l.amountStr);
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
                <Text style={styles.kindPillText}>
                  {l.kind === 'revenue' ? t('technicianFinance.kindRevenue') : t('technicianFinance.kindExpense')}
                </Text>
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
      <Text style={styles.hint}>{hintText}</Text>
      <View style={{ gap: 12 }}>
        {lines.map((l, idx) => (
          <View key={idx} style={styles.editCard}>
            <View style={styles.singleKindBar}>
              <View
                style={[
                  styles.kindPillStatic,
                  defaultKindForMode(mode) === 'revenue' ? styles.kindRev : styles.kindExp,
                ]}
              >
                <Text style={styles.kindPillText}>
                  {defaultKindForMode(mode) === 'revenue'
                    ? t('technicianFinance.kindRevenue')
                    : t('technicianFinance.kindExpense')}
                </Text>
              </View>
              <View style={{ flex: 1 }} />
              {lines.length > 1 ? (
                <TouchableOpacity onPress={() => removeLine(idx)} hitSlop={10}>
                  <Ionicons name="trash-outline" size={22} color="#dc2626" />
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.lbl}>{t('technicianFinance.amountLabel')}</Text>
            <ValueInput
              style={styles.input}
              placeholder="0,00"
              currency
              currencySymbol="R$"
              value={l.amountStr}
              onChangeText={(canon) => updateLine(idx, { amountStr: canon })}
              onDraftChange={(t) => {
                amountDraftByLineRef.current[idx] = t;
              }}
              onEditingStateChange={(editing) => {
                amountEditingByLineRef.current[idx] = editing;
              }}
            />
            {l.kind === 'expense' ? (
              <>
                <Text style={styles.lbl}>{t('technicianFinance.categoryLabel')}</Text>
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
                  <Text style={styles.warnTxt}>{t('technicianFinance.otherCategoryHint')}</Text>
                ) : null}
              </>
            ) : null}
            <Text style={styles.lbl}>{t('technicianFinance.descriptionOptional')}</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder={t('technicianFinance.descPlaceholder')}
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
        <Text style={styles.addBtnText}>{t('technicianFinance.addLine')}</Text>
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
  singleKindBar: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  kindPillStatic: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
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
