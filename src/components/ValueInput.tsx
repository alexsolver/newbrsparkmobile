import React, { useState, useEffect } from 'react';
import {
  TextInput,
  TextStyle,
  StyleSheet,
  View,
  Keyboard,
} from 'react-native';
import { getNumberFormat } from '../i18n/formatters';

interface ValueInputProps {
  value: string;
  onChangeText: (canonical: string) => void;
  style?: TextStyle | TextStyle[];
  placeholder?: string;
  currency?: boolean;
  currencySymbol?: string;
  editable?: boolean;
  /** Keystrokes while focused (para ler valor ao guardar antes do blur). */
  onDraftChange?: (raw: string) => void;
  onEditingStateChange?: (editing: boolean) => void;
}

/**
 * Parses any human-typed number string → JS float.
 * Rule: the LAST separator (dot or comma) is the decimal separator.
 *
 *  "1234"       → 1234
 *  "1234.56"    → 1234.56
 *  "1234,56"    → 1234.56
 *  "1.234,56"   → 1234.56  (dot = thousand, comma = decimal)
 *  "1,234.56"   → 1234.56  (comma = thousand, dot = decimal)
 */
export function parseLocaleAmountString(raw: string): number {
  const cleaned = raw.replace(/[^\d,.-]/g, '').trim();
  if (!cleaned) return 0;

  const hasDot   = cleaned.includes('.');
  const hasComma = cleaned.includes(',');

  let normalized: string;

  if (hasDot && hasComma) {
    // Both: last one is decimal
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.'); // "1.234,56"
    } else {
      normalized = cleaned.replace(/,/g, '');                    // "1,234.56"
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');  // "1234,56"
  } else {
    normalized = cleaned;                    // "1234.56" or "1234"
  }

  return parseFloat(normalized) || 0;
}


/** Format a number for display using the user's persisted number format prefs. */
function formatDisplay(raw: string): string {
  if (!raw) return '';
  const num = parseLocaleAmountString(raw);
  if (isNaN(num)) return raw;

  const fmt = getNumberFormat();
  const { decimals, style: sepStyle } = fmt;

  if (sepStyle === 'locale') {
    return num.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const thousandSep = sepStyle === 'dot-comma' ? '.' : ',';
  const decimalSep  = sepStyle === 'dot-comma' ? ',' : '.';
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandSep);
  return decPart !== undefined
    ? `${withThousands}${decimalSep}${decPart}`
    : withThousands;
}

/**
 * A numeric input with correct decimal/cent handling.
 *
 * KEY DESIGN:
 *  - Maintains internal `rawValue` while focused — does NOT propagate keystrokes
 *    to parent (avoids parseFloat cutting off cents on every character).
 *  - On blur: parses rawValue → sends canonical "1234.56" string to onChangeText.
 *  - While blurred: formats the parent `value` prop for display.
 */
export function ValueInput({
  value,
  onChangeText,
  style,
  placeholder = '0,00',
  currency: _currency = false,
  currencySymbol: _currencySymbol,
  editable = true,
  onDraftChange,
  onEditingStateChange,
}: ValueInputProps) {
  const [focused, setFocused] = useState(false);
  const [rawValue, setRawValue] = useState(value ?? '');

  // Sync internal raw when parent value changes externally (form reset, etc.)
  useEffect(() => {
    if (!focused) {
      setRawValue(value ?? '');
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // What to show in the TextInput
  const displayValue = focused
    ? rawValue
    : value ? formatDisplay(value) : '';

  const handleFocus = () => {
    onEditingStateChange?.(true);
    // When focusing, show the last raw value the user typed (or the external value if first focus)
    setRawValue(value ?? '');
    setFocused(true);
  };

  const handleBlur = () => {
    onDraftChange?.('');
    onEditingStateChange?.(false);
    setFocused(false);
    if (!rawValue) return;
    // Parse raw → canonical JS number string → send to parent ONCE on blur
    const num = parseLocaleAmountString(rawValue);
    const canonical = num !== 0 ? String(num) : rawValue;
    onChangeText(canonical);
  };

  const flat = StyleSheet.flatten(style) || {};
  const {
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
    alignSelf,
    minWidth,
    minHeight,
    maxWidth,
    maxHeight,
    ...inputStyle
  } = flat as TextStyle & Record<string, unknown>;

  const wrapperStyle = {
    alignSelf: (alignSelf as TextStyle['alignSelf']) ?? ('stretch' as const),
    minHeight: Math.max(typeof minHeight === 'number' ? minHeight : 0, 48),
    minWidth,
    maxWidth,
    maxHeight,
    flex,
    flexGrow,
    flexShrink,
    flexBasis,
  };

  // Não usar InputAccessoryView no iOS aqui: o nativo usa position:absolute + largura
  // da janela e pode cobrir o cartão do checklist e bloquear toques no TextInput.
  // Teclado decimal: fechar tocando fora (ScrollView) ou mudando de campo.
  return (
    <View style={wrapperStyle} pointerEvents={editable ? 'auto' : 'none'}>
      <TextInput
        value={displayValue}
        onChangeText={(t) => {
          setRawValue(t);
          onDraftChange?.(t);
        }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={() => Keyboard.dismiss()}
        returnKeyType="done"
        keyboardType="decimal-pad"
        style={[inputStyle, { minHeight: 44, alignSelf: 'stretch', color: '#0f172a' }]}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        editable={editable}
        focusable={editable}
        showSoftInputOnFocus={editable}
        selectTextOnFocus
      />
    </View>
  );
}
