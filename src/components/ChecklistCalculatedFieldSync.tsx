import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { View, Text, type StyleProp, type ViewStyle } from 'react-native';
import { computeChecklistCalculatedValue } from '../utils/checklistCalcFormula';
import {
  formatCalculatedResultDisplay,
  resolveCalcDisplayMode,
} from '../checklist/calculatedFieldFormat';

type Props = {
  field: { id: string; calcFormula?: string; calcDisplayFormat?: string };
  schema: unknown[] | undefined;
  responses: Record<string, unknown>;
  storedValue: unknown;
  onSyncValue: (fieldId: string, value: number) => void;
  containerStyle: StyleProp<ViewStyle>;
};

/**
 * Sincroniza o valor calculado fora do corpo do render (useLayoutEffect) e mostra o texto formatado.
 */
export function ChecklistCalculatedFieldSync({
  field,
  schema,
  responses,
  storedValue,
  onSyncValue,
  containerStyle,
}: Props) {
  const formula = String(field.calcFormula || '');
  const computed = useMemo(
    () => computeChecklistCalculatedValue(formula, responses),
    [formula, responses],
  );
  const dispMode = useMemo(
    () => resolveCalcDisplayMode(field, formula, schema as any[] | undefined),
    [field, formula, schema],
  );
  const displayText = useMemo(
    () => formatCalculatedResultDisplay(computed, dispMode),
    [computed, dispMode],
  );

  const onSyncRef = useRef(onSyncValue);
  onSyncRef.current = onSyncValue;

  useLayoutEffect(() => {
    const cur = storedValue == null ? NaN : Number(storedValue);
    const drift = Number.isFinite(cur) ? Math.abs(cur - computed) : Infinity;
    if (drift > 1e-9) {
      onSyncRef.current(field.id, computed);
    }
  }, [field.id, computed, storedValue]);

  return (
    <View style={containerStyle}>
      <Text style={{ color: '#7c3aed', fontFamily: 'monospace', fontWeight: 'bold' }}>
        Resultado: {displayText}
      </Text>
    </View>
  );
}
