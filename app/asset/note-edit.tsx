import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert, InputAccessoryView, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';
import { getAssetNotes, saveAssetNote } from '../../src/database';
import { AssetNote } from '../../src/types/note';

const NOTE_ACCENT = MEDIA_TAG_COLORS.WARRANTY;

export default function AssetNoteEditScreen() {
  const { assetId, noteId } = useLocalSearchParams<{ assetId: string; noteId?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createNoteEditStyles(C), [C]);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const inputRef = useRef<TextInput>(null);

  // Keyboard Accessory ID
  const inputAccessoryViewID = Platform.OS === 'ios' ? 'noteAccessory' : undefined;

  useEffect(() => {
    if (noteId && assetId) {
      const dbNotes = getAssetNotes(assetId, user?.email || '');
      const note = dbNotes.find(n => n.id === noteId);
      if (note) {
        setTitle(note.title);
        setContent(note.content);
      }
    }
  }, [noteId, assetId, user]);

  const handleSave = () => {
    if (!title.trim() && !content.trim()) {
      router.back();
      return;
    }
    
    setIsSaving(true);
    const id = noteId || Math.random().toString(36).substring(2, 12);
    const now = Date.now();
    
    const note: AssetNote = {
      id,
      assetId: assetId!,
      title: title.trim() || 'Sem Título',
      content,
      createdBy: user?.email || 'local',
      createdAt: noteId ? (getAssetNotes(assetId!, user?.email || '').find(n => n.id === id)?.createdAt || now) : now,
      updatedAt: now,
      synced: 0
    };

    saveAssetNote(note, user?.email || '');
    router.back();
  };

  const insertChecklist = () => {
    // Inserts a checklist item at the end of the text if it's empty, or adds a new line
    const textToAdd = content.length > 0 && !content.endsWith('\n') ? '\n- [ ] ' : '- [ ] ';
    setContent(prev => prev + textToAdd);
    inputRef.current?.focus();
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: C.cardWhite }}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="close" size={28} color={C.slate} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{noteId ? 'Editar Anotação' : 'Nova Anotação'}</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn} disabled={isSaving}>
          <Text style={styles.saveBtnText}>Salvar</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          
          <TextInput
            style={styles.titleInput}
            placeholder="Título da anotação"
            placeholderTextColor={C.textLight}
            value={title}
            onChangeText={setTitle}
            maxLength={100}
            autoFocus={!noteId}
          />
          
          <TextInput
            ref={inputRef}
            style={styles.contentInput}
            placeholder="Comece a digitar sua anotação aqui..."
            placeholderTextColor={C.border}
            value={content}
            onChangeText={setContent}
            multiline
            textAlignVertical="top"
            inputAccessoryViewID={inputAccessoryViewID}
          />

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Toolbar above keyboard */}
      {Platform.OS === 'ios' && inputAccessoryViewID && (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={insertChecklist} style={styles.toolbarBtn}>
              <Ionicons name="checkbox-outline" size={20} color={NOTE_ACCENT} />
              <Text style={styles.toolbarBtnText}>Adicionar Checklist</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={() => Keyboard.dismiss()} style={styles.doneBtn}>
              <Text style={styles.doneBtnText}>Ok</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {/* Android toolbar fallback */}
      {Platform.OS === 'android' && (
        <View style={styles.toolbar}>
          <TouchableOpacity onPress={insertChecklist} style={styles.toolbarBtn}>
            <Ionicons name="checkbox-outline" size={20} color={NOTE_ACCENT} />
            <Text style={styles.toolbarBtnText}>Adicionar Checklist</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

function createNoteEditStyles(C: ColorPalette) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: C.divider,
    },
    headerTitle: {
      fontSize: 16,
      fontWeight: '900',
      color: C.slate,
    },
    saveBtn: {
      backgroundColor: NOTE_ACCENT + '15',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    saveBtnText: {
      color: NOTE_ACCENT,
      fontWeight: '800',
      fontSize: 14,
    },
    titleInput: {
      fontSize: 24,
      fontWeight: '900',
      color: C.slate,
      marginBottom: 16,
      paddingVertical: 8,
    },
    contentInput: {
      flex: 1,
      fontSize: 16,
      color: C.textSecondary,
      lineHeight: 24,
      minHeight: 300,
    },
    toolbar: {
      backgroundColor: C.background,
      borderTopWidth: 1,
      borderTopColor: C.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    toolbarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: NOTE_ACCENT + '15',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 8,
      gap: 6,
    },
    toolbarBtnText: {
      color: NOTE_ACCENT,
      fontWeight: '800',
      fontSize: 13,
    },
    doneBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    doneBtnText: {
      fontWeight: '800',
      color: C.slate,
      fontSize: 15,
    }
  });
}
