import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme/colors';
import { useAuth } from '../../src/hooks/useAuth';
import { getAssetNotes, deleteAssetNoteLocal, getLocalAssets } from '../../src/database';
import { AssetNote } from '../../src/types/note';
import { Asset } from '../../src/types/asset';

const TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  REAL_ESTATE: { icon: 'home-outline', color: '#F97316' },
  VEHICLE: { icon: 'car-outline', color: '#10B981' },
  VALUABLE: { icon: 'diamond-outline', color: '#D946EF' },
  JEWELRY: { icon: 'rose-outline', color: '#F43F5E' },
  ARTWORK: { icon: 'color-palette-outline', color: '#EC4899' },
  FINANCIAL: { icon: 'cash-outline', color: '#059669' },
  BUSINESS: { icon: 'business-outline', color: '#3B82F6' },
  DIGITAL: { icon: 'globe-outline', color: '#6366F1' },
  INSURANCE: { icon: 'shield-checkmark-outline', color: '#8B5CF6' },
  OTHER: { icon: 'cube-outline', color: '#64748B' },
};

export default function AssetNotesListScreen() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  const router = useRouter();
  const { user } = useAuth();
  
  const [notes, setNotes] = useState<AssetNote[]>([]);
  const [asset, setAsset] = useState<Asset | null>(null);

  const loadData = useCallback(() => {
    if (!assetId) return;
    const allAsets = getLocalAssets(user?.email || '', { includeMobileWarehouse: false });
    const currentAsset = allAsets.find(a => a.id === assetId);
    if (currentAsset) {
      setAsset(currentAsset);
    }
    
    const dbNotes = getAssetNotes(assetId, user?.email || '');
    setNotes(dbNotes);
  }, [assetId, user]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const handleDelete = (noteId: string) => {
    Alert.alert('Excluir', 'Tem certeza que deseja apagar essa anotação?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Apagar', style: 'destructive', onPress: () => {
        deleteAssetNoteLocal(noteId, user?.email || '');
        loadData();
      }}
    ]);
  };

  const renderItem = ({ item }: { item: AssetNote }) => {
    const isChecklist = item.content.includes('- [ ]') || item.content.includes('- [x]');
    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push(`/asset/note-edit?assetId=${assetId}&noteId=${item.id}` as any)}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={16} color="#EF4444" />
          </TouchableOpacity>
        </View>
        
        <Text style={styles.preview} numberOfLines={3}>
          {item.content.replace(/- \[[x ]\]/g, '•')}
        </Text>
        
        <View style={styles.cardFooter}>
          <View style={styles.badge}>
            <Ionicons name={isChecklist ? "list" : "document-text"} size={10} color={colors.primary} />
            <Text style={styles.badgeText}>{isChecklist ? 'Checklist' : 'Nota'}</Text>
          </View>
          <Text style={styles.date}>
            {new Date(item.updatedAt).toLocaleDateString()} {new Date(item.updatedAt).getHours().toString().padStart(2, '0')}:{new Date(item.updatedAt).getMinutes().toString().padStart(2, '0')}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
        {asset ? (() => {
          const typeIcon = TYPE_ICONS[asset.type] || TYPE_ICONS.OTHER;
          const iconName = asset.details?.customIcon || typeIcon.icon;
          const iconColor = asset.details?.customColor || typeIcon.color;
          return (
           <>
            <View style={{ position: 'relative' }}>
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: iconColor + '18', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {asset.imageUrl
                  ? <Image source={{ uri: asset.imageUrl }} style={{ width: 72, height: 72 }} />
                  : <Ionicons name={iconName} size={34} color={iconColor} />}
              </View>
              <View style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' }}>
                <Ionicons name="pencil" size={11} color="#fff" />
              </View>
            </View>
            <View style={{ marginLeft: 16, flex: 1 }}>
              <Text style={{ fontSize: 20, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>{asset.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                <Ionicons name="document-text-outline" size={11} color="#8B5CF6" style={{ marginRight: 4 }} />
                <Text style={{ fontSize: 11, fontWeight: '900', color: '#8B5CF6', textTransform: 'uppercase', letterSpacing: 0.5 }}>Anotações</Text>
              </View>
            </View>
          </>
          );
        })() : (
          <View style={{ flex: 1 }}>
             <Text style={{ fontSize: 20, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>Anotações</Text>
             <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Carregando...</Text>
          </View>
        )}
      </View>

      {notes.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#8B5CF620', justifyContent: 'center', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="document-text-outline" size={40} color="#8B5CF6" />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '900', color: colors.slate, marginBottom: 8 }}>Nenhuma anotação</Text>
          <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            Use este espaço para registrar recados, códigos de cadeados ou montar listas de verificações rápidas.
          </Text>
        </View>
      ) : (
        <FlatList
          data={notes}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 100 }}
        />
      )}

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => router.push(`/asset/note-edit?assetId=${assetId}` as any)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    flex: 1,
    marginRight: 10,
  },
  preview: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: colors.primary,
    textTransform: 'uppercase',
  },
  date: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#8B5CF6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#8B5CF6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  }
});
