import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';

export type AssetExtensionFormSheetProps = {
  visible: boolean;
  onClose: () => void;
  /** Título do formulário (ex.: «Nova apólice») */
  title: string;
  /** Campos do formulário */
  children: React.ReactNode;
  /** Ações fixas no rodapé (ex.: botão Guardar) — ficam fora do scroll */
  footer?: React.ReactNode;
  /** Envolver o conteúdo em ScrollView (predefinição: sim) */
  scroll?: boolean;
};

/**
 * Folha inferior padrão para módulos de extensão de ativo (Conformidade, Garantias, etc.):
 * máscara escura, painel com cantos superiores arredondados, barra de arrasto, título + fechar, corpo com scroll, rodapé opcional.
 */
export function AssetExtensionFormSheet({
  visible,
  onClose,
  title,
  children,
  footer,
  scroll = true,
}: AssetExtensionFormSheetProps) {
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 16);

  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      bounces={false}
      contentContainerStyle={styles.scrollContent}
    >
      {children}
    </ScrollView>
  ) : (
    children
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: C.cardWhite, paddingBottom: footer ? 12 : bottomPad, marginTop: 'auto' },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: C.border }]} />
          <View style={styles.headerRow}>
            <Text style={[styles.title, { color: C.slate }]} numberOfLines={2}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Ionicons name="close" size={26} color={C.textSecondary} />
            </TouchableOpacity>
          </View>
          {body}
          {footer ? (
            <View style={[styles.footerWrap, { borderTopColor: C.border, paddingBottom: bottomPad }]}>
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 8,
    maxHeight: '92%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  footerWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    marginTop: 4,
  },
});
