import React, { useState, useRef, useEffect } from 'react';
import {
  TextInput,
  TextStyle,

  InputAccessoryView,
  View,
  Text,
  TouchableOpacity,
  Keyboard,
  KeyboardAvoidingView, Platform} from 'react-native';
import { getNumberFormat } from '../i18n/formatters';

interface ValueInputProps {
  value: string;
  onChangeText: (canonical: string) => void;
  style?: TextStyle | TextStyle[];
  placeholder?: string;
  currency?: boolean;
  currencySymbol?: string;
  editable?: boolean;
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
function parseRaw(raw: string): number {
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
  const num = parseRaw(raw);
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
  currency = false,
  currencySymbol,
  editable = true,
}: ValueInputProps) {
  const [focused, setFocused] = useState(false);
  const [rawValue, setRawValue] = useState(value ?? '');

  // Stable ID for InputAccessoryView
  const nativeIdRef = useRef(`vi-${Math.random().toString(36).slice(2)}`);
  const inputAccessoryViewID = Platform.OS === 'ios' ? nativeIdRef.current : undefined;

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
    // When focusing, show the last raw value the user typed (or the external value if first focus)
    setRawValue(value ?? '');
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    if (!rawValue) return;
    // Parse raw → canonical JS number string → send to parent ONCE on blur
    const num = parseRaw(rawValue);
    const canonical = num !== 0 ? String(num) : rawValue;
    onChangeText(canonical);
  };

  return (
    <>
      <TextInput
        value={displayValue}
        onChangeText={setRawValue}        // ← only updates internal state, NOT parent
        onFocus={handleFocus}
        onBlur={handleBlur}
        onSubmitEditing={() => Keyboard.dismiss()}
        returnKeyType="done"
        keyboardType="decimal-pad"
        inputAccessoryViewID={inputAccessoryViewID}
        style={style}
        placeholder={placeholder}
        editable={editable}
        selectTextOnFocus
      />
      {Platform.OS === 'ios' && inputAccessoryViewID && (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View
            style={{
              backgroundColor: '#F1F5F9',
              borderTopWidth: 1,
              borderTopColor: '#CBD5E1',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            {currencySymbol && (
              <Text style={{ flex: 1, fontSize: 13, color: '#64748B', fontWeight: '700' }}>
                {currencySymbol} {displayValue || '0'}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => Keyboard.dismiss()}
              style={{
                backgroundColor: '#191C1D',
                paddingHorizontal: 20,
                paddingVertical: 8,
                borderRadius: 8,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                Concluído ✓
              </Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </>
  );
}
