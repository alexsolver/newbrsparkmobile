import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import {
  loadTechnicianExpenseCategoryCatalog,
  type TechnicianExpenseCategoryRow,
} from '../utils/technicianExpenseCategoryCatalog';

type Props = {
  value: string | null | undefined;
  onChange: (key: string) => void;
  disabled?: boolean;
};

export function TechnicianExpenseCategoryChips({ value, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<TechnicianExpenseCategoryRow[]>(() =>
    loadTechnicianExpenseCategoryCatalog()
  );

  useFocusEffect(
    useCallback(() => {
      setRows(loadTechnicianExpenseCategoryCatalog());
    }, [])
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.lbl}>{t('technicianMobile.financeCategorySection')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {rows.map((c) => {
          const sel = value === c.id;
          const col = c.color || '#64748b';
          return (
            <TouchableOpacity
              key={c.id}
              style={[
                styles.chip,
                sel && { borderColor: col, borderWidth: 2, backgroundColor: '#f8fafc' },
                disabled && { opacity: 0.45 },
              ]}
              onPress={() => !disabled && onChange(c.id)}
              activeOpacity={0.85}
              disabled={disabled}
            >
              {c.icon ? (
                <Ionicons
                  name={c.icon as React.ComponentProps<typeof Ionicons>['name']}
                  size={14}
                  color={sel ? col : '#64748b'}
                  style={{ marginRight: 4 }}
                />
              ) : null}
              <Text style={[styles.chipTxt, sel && { color: col, fontWeight: '800' }]} numberOfLines={2}>
                {t(`technicianMobile.expenseCategories.${c.id}`, { defaultValue: c.label })}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {value === 'outros' ? (
        <Text style={styles.hint}>{t('technicianFinance.otherCategoryHint')}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  lbl: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 8, paddingRight: 8, paddingBottom: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
  },
  chipTxt: { fontSize: 11, fontWeight: '600', color: '#475569', flexShrink: 1 },
  hint: { fontSize: 11, color: '#b45309', fontWeight: '600', marginTop: 6 },
});
