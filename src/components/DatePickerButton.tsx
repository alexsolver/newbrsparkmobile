/**
 * DatePickerButton — Seletor de data com chips rápidos e calendário nativo.
 * Valor interno: YYYY-MM-DD; exibição conforme localidade da app.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, ScrollView, Modal } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getCurrentLanguage } from '../i18n';

interface Props {
  value: string | undefined;
  onChange: (iso: string) => void;
  label?: string;
  accentColor?: string;
  minDate?: Date;
  maxDate?: Date;
  /** Só leitura: mostra a data formatada sem abrir o calendário */
  disabled?: boolean;
  /** Oculta os chips (Hoje, +7d, …) */
  hideQuickChips?: boolean;
}

const PALETTE = {
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#1E293B',
  sub: '#94A3B8',
  chip: '#F1F5F9',
  chipText: '#475569',
};

function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatForLocale(iso: string, locale: string): string {
  if (!iso || iso.length < 10) return '';
  try {
    const d = parseLocal(iso);
    return d.toLocaleDateString(locale, { dateStyle: 'medium' });
  } catch {
    try {
      return parseLocal(iso).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  }
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function addMonths(base: Date, n: number): Date {
  const d = new Date(base);
  d.setMonth(d.getMonth() + n);
  return d;
}

export default function DatePickerButton({
  value,
  onChange,
  label,
  accentColor = '#6366F1',
  minDate,
  maxDate,
  disabled = false,
  hideQuickChips = false,
}: Props) {
  const { t } = useTranslation();
  const [showPicker, setShowPicker] = useState(false);
  const locale = getCurrentLanguage();

  const chips = useMemo(
    () => [
      { id: 'today', label: t('datePicker.chipToday'), fn: (base: Date) => base },
      { id: 'tomorrow', label: t('datePicker.chipTomorrow'), fn: (base: Date) => addDays(base, 1) },
      { id: 'p7', label: t('datePicker.chipPlus7'), fn: (base: Date) => addDays(base, 7) },
      { id: 'p30', label: t('datePicker.chipPlus30'), fn: (base: Date) => addDays(base, 30) },
      { id: 'p1m', label: t('datePicker.chipPlus1Month'), fn: (base: Date) => addMonths(base, 1) },
    ],
    [t]
  );

  const currentDate = value && value.length >= 10 ? parseLocal(value) : new Date();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      setShowPicker(false);
      if (event.type === 'dismissed') return;
    }
    if (selected) onChange(toISO(selected));
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const displayText =
    value && value.length >= 10 ? formatForLocale(value, locale) : t('datePicker.placeholder');

  const pickerDisplay =
    Platform.OS === 'ios' ? ('inline' as const) : ('calendar' as const);

  return (
    <View style={{ marginBottom: 2 }}>
      {label ? (
        <Text
          style={{
            fontSize: 10,
            fontWeight: '900',
            color: PALETTE.sub,
            textTransform: 'uppercase',
            letterSpacing: 0.6,
            marginBottom: 6,
          }}
        >
          {label}
        </Text>
      ) : null}

      {!hideQuickChips ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 6 }}
          contentContainerStyle={{ gap: 6 }}
          keyboardShouldPersistTaps="handled"
        >
          {chips.map((chip) => {
            const targetDate = chip.fn(today);
            const targetISO = toISO(targetDate);
            const isActive = value === targetISO;
            return (
              <TouchableOpacity
                key={chip.id}
                onPress={() => onChange(targetISO)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 16,
                  backgroundColor: isActive ? accentColor : PALETTE.chip,
                  borderWidth: 1,
                  borderColor: isActive ? accentColor : PALETTE.border,
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '800', color: isActive ? '#fff' : PALETTE.chipText }}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      <TouchableOpacity
        onPress={() => {
          if (!disabled) setShowPicker(true);
        }}
        disabled={disabled}
        activeOpacity={0.75}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: PALETTE.bg,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: showPicker ? accentColor : PALETTE.border,
          paddingHorizontal: 14,
          paddingVertical: 11,
          opacity: disabled ? 0.85 : 1,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={accentColor} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: PALETTE.text }}>{displayText}</Text>
        {!disabled ? <Ionicons name="chevron-down" size={14} color={PALETTE.sub} /> : null}
      </TouchableOpacity>

      {Platform.OS === 'android' && showPicker ? (
        <DateTimePicker
          mode="date"
          display={pickerDisplay}
          value={currentDate}
          minimumDate={minDate}
          maximumDate={maxDate}
          onChange={handleChange}
          locale={locale}
        />
      ) : null}

      {Platform.OS === 'ios' ? (
        <Modal transparent visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
            activeOpacity={1}
            onPress={() => setShowPicker(false)}
          />
          <View
            style={{
              backgroundColor: '#fff',
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingBottom: 28,
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' }} />
            </View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 20,
                paddingVertical: 10,
              }}
            >
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={{ fontSize: 14, color: '#94A3B8', fontWeight: '700' }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E293B' }}>{t('datePicker.selectDate')}</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={{ fontSize: 14, color: accentColor, fontWeight: '900' }}>{t('common.ok')}</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              mode="date"
              display={pickerDisplay}
              value={currentDate}
              minimumDate={minDate}
              maximumDate={maxDate}
              onChange={handleChange}
              locale={locale}
              style={{ height: Platform.OS === 'ios' ? 380 : 200 }}
            />
          </View>
        </Modal>
      ) : null}
    </View>
  );
}
