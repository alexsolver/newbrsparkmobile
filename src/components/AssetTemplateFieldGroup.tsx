import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, TextStyle, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import { ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import type { AssetKindDef } from '../assetKind/types';

type Values = Record<string, string | number | boolean>;

type Props = {
  kind: AssetKindDef | null;
  values: Values;
  onChange: (next: Values) => void;
  readOnly?: boolean;
  sectionTitleKey?: string;
};

export function AssetTemplateFieldGroup({
  kind,
  values,
  onChange,
  readOnly,
  sectionTitleKey = 'assetJourney.templateSection',
}: Props) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createStyles(C), [C]);

  if (!kind || !kind.fieldSchema.length) return null;

  const setField = (id: string, v: string | number | boolean) => {
    onChange({ ...values, [id]: v });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>{t(sectionTitleKey)}</Text>
        <Text style={styles.badge}>{t(kind.labelKey)}</Text>
      </View>
      {kind.fieldSchema.map((f) => (
        <View key={f.id} style={styles.fieldBlock}>
          <Text style={styles.label}>
            {t(f.labelKey)} {f.required ? '*' : ''}
          </Text>
          {f.type === 'boolean' ? (
            <View style={styles.rowSwitch}>
              <Switch
                value={values[f.id] === true || values[f.id] === '1' || values[f.id] === 1}
                onValueChange={(b) => setField(f.id, b)}
                disabled={readOnly}
                trackColor={{ false: C.border, true: C.primary }}
              />
              <Text style={styles.hint}>
                {values[f.id] ? t('newAsset.boolTrue') : t('newAsset.boolFalse')}
              </Text>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              value={values[f.id] != null ? String(values[f.id]) : ''}
              onChangeText={(txt) => {
                if (f.type === 'number') {
                  setField(f.id, txt);
                } else {
                  setField(f.id, txt);
                }
              }}
              placeholder={f.placeholderKey ? t(f.placeholderKey) : f.type === 'date' ? 'DD/MM/AAAA' : undefined}
              keyboardType={f.type === 'number' ? 'numeric' : 'default'}
              editable={!readOnly}
              returnKeyType="done"
            />
          )}
        </View>
      ))}
    </View>
  );
}

function createStyles(C: ColorPalette) {
  return StyleSheet.create({
    wrap: { marginBottom: 8 },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      flexWrap: 'wrap',
      gap: 8,
    },
    sectionTitle: {
      fontSize: 11,
      fontWeight: '900',
      color: C.primary,
      letterSpacing: 0.5,
      textTransform: 'uppercase' as const,
    },
    badge: {
      fontSize: 9,
      fontWeight: '800',
      color: C.textSecondary,
      textTransform: 'uppercase' as const,
    },
    fieldBlock: { marginBottom: 14 },
    label: {
      fontSize: 7,
      fontWeight: '900',
      color: C.textLight,
      marginBottom: 6,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
    },
    input: {
      borderRadius: 8,
      padding: 12,
      fontSize: 11,
      backgroundColor: C.surfaceLow,
      color: C.primary,
      fontWeight: '800',
    },
    rowSwitch: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    hint: { fontWeight: '700', color: C.textSecondary, fontSize: 12 },
  } as { wrap: ViewStyle; headerRow: ViewStyle; sectionTitle: TextStyle; badge: TextStyle; fieldBlock: ViewStyle; label: TextStyle; input: TextStyle; rowSwitch: ViewStyle; hint: TextStyle });
}
