/**
 * DatePickerButton — Native date picker with quick-select chips.
 * Replaces all YYYY-MM-DD TextInput fields in the app.
 *
 * Props:
 *  - value: string (YYYY-MM-DD)
 *  - onChange: (iso: string) => void
 *  - label?: string
 *  - accentColor?: string
 *  - minDate?: Date
 */
import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Platform, ScrollView, Modal,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  value: string | undefined;  // YYYY-MM-DD
  onChange: (iso: string) => void;
  label?: string;
  accentColor?: string;
  minDate?: Date;
}

const PALETTE = {
  bg: '#F8FAFC',
  border: '#E2E8F0',
  text: '#1E293B',
  sub: '#94A3B8',
  chip: '#F1F5F9',
  chipText: '#475569',
};

/** Parse a YYYY-MM-DD string safely (interprets as local midnight) */
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Format a Date to YYYY-MM-DD */
function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Format a YYYY-MM-DD string for display: "24 de março de 2025" */
function display(iso: string): string {
  if (!iso) return '—';
  try {
    return parseLocal(iso).toLocaleDateString('pt-BR', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch {
    return iso;
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

const CHIPS = [
  { label: 'Hoje',   fn: (t: Date) => t },
  { label: 'Amanhã', fn: (t: Date) => addDays(t, 1) },
  { label: '+7d',    fn: (t: Date) => addDays(t, 7) },
  { label: '+30d',   fn: (t: Date) => addDays(t, 30) },
  { label: '+1 mês', fn: (t: Date) => addMonths(t, 1) },
];

export default function DatePickerButton({
  value,
  onChange,
  label,
  accentColor = '#6366F1',
  minDate,
}: Props) {
  const [showPicker, setShowPicker] = useState(false);

  const currentDate = (value && value.length >= 10) ? parseLocal(value) : new Date();

  const handleChange = (_: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') setShowPicker(false);
    if (selected) onChange(toISO(selected));
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <View style={{ marginBottom: 2 }}>
      {label && (
        <Text style={{ fontSize: 10, fontWeight: '900', color: PALETTE.sub, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
          {label}
        </Text>
      )}

      {/* Quick chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 6 }} keyboardShouldPersistTaps="handled">
        {CHIPS.map(chip => {
          const targetDate = chip.fn(today);
          const targetISO = toISO(targetDate);
          const isActive = value === targetISO;
          return (
            <TouchableOpacity
              key={chip.label}
              onPress={() => onChange(targetISO)}
              style={{
                paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16,
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

      {/* Date trigger button */}
      <TouchableOpacity
        onPress={() => setShowPicker(true)}
        activeOpacity={0.75}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          backgroundColor: PALETTE.bg,
          borderRadius: 12, borderWidth: 1, borderColor: showPicker ? accentColor : PALETTE.border,
          paddingHorizontal: 14, paddingVertical: 11,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={accentColor} />
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: PALETTE.text }}>
          {display(value ?? '')}
        </Text>
        <Ionicons name="chevron-down" size={14} color={PALETTE.sub} />
      </TouchableOpacity>

      {/* Native picker — Android: auto-dialog; iOS: bottom sheet modal */}
      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          mode="date"
          display="default"
          value={currentDate}
          minimumDate={minDate}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          transparent
          visible={showPicker}
          animationType="slide"
          onRequestClose={() => setShowPicker(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
            activeOpacity={1}
            onPress={() => setShowPicker(false)}
          />
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
            {/* Handle + header */}
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }}>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={{ fontSize: 14, color: '#94A3B8', fontWeight: '700' }}>Cancelar</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 14, fontWeight: '900', color: '#1E293B' }}>Selecionar data</Text>
              <TouchableOpacity onPress={() => setShowPicker(false)}>
                <Text style={{ fontSize: 14, color: accentColor, fontWeight: '900' }}>OK</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              mode="date"
              display="spinner"
              value={currentDate}
              minimumDate={minDate}
              onChange={handleChange}
              locale="pt-BR"
              style={{ height: 200 }}
            />
          </View>
        </Modal>
      )}
    </View>
  );
}
