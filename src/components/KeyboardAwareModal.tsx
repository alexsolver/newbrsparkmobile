/**
 * KeyboardAwareModal
 *
 * Drop-in wrapper for Modal content that:
 * - Uses KeyboardAvoidingView with the correct platform behavior
 * - Wraps content in a ScrollView so fields scroll above the keyboard
 * - Dismisses keyboard on tap outside fields
 *
 * Usage:
 *   <Modal visible={...} transparent animationType="slide">
 *     <KeyboardAwareModal onClose={...}>
 *       {your modal content}
 *     </KeyboardAwareModal>
 *   </Modal>
 */
import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableWithoutFeedback,
  Keyboard,
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';

interface Props {
  children: React.ReactNode;
  /** Called when user taps the dark overlay */
  onClose?: () => void;
  /** Extra style for the inner white card */
  containerStyle?: ViewStyle;
  /** If true the card takes full height (no overlay dismiss) */
  fullscreen?: boolean;
}

export function KeyboardAwareModal({ children, onClose, containerStyle, fullscreen }: Props) {
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.overlay}>
        {/* Tap outside = close */}
        {!fullscreen && onClose && (
          <TouchableWithoutFeedback onPress={onClose}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <View style={[styles.card, containerStyle]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={{ flexGrow: 1 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  kav: {
    width: '100%',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
});
