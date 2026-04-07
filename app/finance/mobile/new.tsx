import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/theme/ThemeContext';
import { Header } from '../../../src/components/Header';
import { TechnicianFinanceService } from '../../../src/services/technicianFinanceService';
import { useAuth } from '../../../src/hooks/useAuth';
import type { TechnicianFinanceKind } from '../../../src/types/technicianFinance';

export default function NewTechnicianFinanceScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const { user } = useAuth();
  const [kind, setKind] = useState<TechnicianFinanceKind>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = async () => {
    const amount = Math.max(0, Number(String(amountStr).replace(',', '.')) || 0);
    if (amount <= 0) {
      Alert.alert('Atenção', 'Indique um valor maior que zero.');
      return;
    }
    const email = user?.email || undefined;
    await TechnicianFinanceService.createManual({ kind, amount, description: description.trim() || undefined }, email);
    Alert.alert('Guardado', 'Lançamento adicionado ao seu financeiro técnico.', [
      { text: 'OK', onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: C.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Header title="Novo lançamento" leftIcon="arrow-back" onLeftPress={() => router.back()} />

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>
          Este registo não está ligado a um bem nem ao módulo de custos do portfólio.
        </Text>

        <Text style={styles.lbl}>Tipo</Text>
        <View style={styles.kindRow}>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'expense' && styles.kindBtnExp]}
            onPress={() => setKind('expense')}
          >
            <Text style={[styles.kindBtnTxt, kind === 'expense' && styles.kindBtnTxtOn]}>Despesa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.kindBtn, kind === 'revenue' && styles.kindBtnRev]}
            onPress={() => setKind('revenue')}
          >
            <Text style={[styles.kindBtnTxt, kind === 'revenue' && styles.kindBtnTxtOn]}>Receita</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.lbl}>Valor (R$)</Text>
        <TextInput
          style={styles.input}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor="#94a3b8"
          value={amountStr}
          onChangeText={setAmountStr}
        />

        <Text style={styles.lbl}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, styles.inputMulti]}
          placeholder="Nota ou referência…"
          placeholderTextColor="#94a3b8"
          value={description}
          onChangeText={setDescription}
          multiline
          maxLength={500}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.9}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.saveBtnTxt}>Guardar</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  hint: { fontSize: 13, color: '#64748b', lineHeight: 19, marginBottom: 20 },
  lbl: { fontSize: 12, fontWeight: '800', color: '#475569', marginBottom: 8 },
  kindRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  kindBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
  },
  kindBtnExp: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
  kindBtnRev: { backgroundColor: '#d1fae5', borderColor: '#a7f3d0' },
  kindBtnTxt: { fontSize: 15, fontWeight: '800', color: '#64748b' },
  kindBtnTxtOn: { color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 17,
    color: '#0f172a',
    marginBottom: 18,
  },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#0f766e',
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnTxt: { color: '#fff', fontSize: 17, fontWeight: '900' },
});
