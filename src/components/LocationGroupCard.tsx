import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { AssetLocation } from '../types/asset';
import { getAssetRootVisual } from '../assetKind';

type GroupItem = {
  id: string;
  title: string;
  type: string;
  imageUrl?: string;
  details?: { photos?: string[] };
};

type LocationGroup = {
  location: AssetLocation | null; // null = "no location" group
  items: GroupItem[];
};

interface Props {
  group: LocationGroup;
  onItemPress: (item: GroupItem) => void;
  onAddChild: () => void;
  onDeleteLocation?: () => void;
  onUnlinkItem?: (item: GroupItem) => void; // optional: show unlink button per item
}

export function LocationGroupCard({ group, onItemPress, onAddChild, onDeleteLocation, onUnlinkItem }: Props) {
  const { colors: C } = useTheme();
  const [expanded, setExpanded] = useState(true);
  const noLoc = group.location === null;
  const icon  = group.location?.icon  || 'help-circle-outline';
  const room  = group.location?.room  || 'Sem localização';
  const floor = group.location?.floor || '';

  return (
    <View style={{ borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff' }}>
      {/* Header — 2-row layout so name always has full width */}
      <View style={{ backgroundColor: noLoc ? '#F8FAFC' : '#F0F9FF', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 }}>

        {/* Row 1: icon + name */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: noLoc ? '#E2E8F0' : (C.primary + '18'), justifyContent: 'center', alignItems: 'center', marginRight: 10 }}>
            <Ionicons name={icon as any} size={18} color={noLoc ? '#A8B5BB' : C.primary} />
          </View>
          <TouchableOpacity style={{ flex: 1 }} onPress={() => setExpanded(e => !e)} activeOpacity={0.75}>
            <Text style={{ fontSize: 14, fontWeight: '900', color: noLoc ? '#A8B5BB' : '#191C1D', lineHeight: 18 }}>{room}</Text>
            {floor ? <Text style={{ fontSize: 10, color: C.primary, fontWeight: '700', marginTop: 1 }}>{floor}</Text> : null}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setExpanded(e => !e)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color="#A8B5BB" />
          </TouchableOpacity>
        </View>

        {/* Row 2: badges + actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Count */}
          <View style={{ backgroundColor: noLoc ? '#E2E8F0' : (C.primary + '18'), borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: '900', color: noLoc ? '#A8B5BB' : C.primary }}>{group.items.length} {group.items.length === 1 ? 'item' : 'itens'}</Text>
          </View>
          {/* Stock badge */}
          {group.location?.isStock && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, marginRight: 6 }}>
              <Ionicons name="cube-outline" size={10} color="#15803D" />
              <Text style={{ fontSize: 9, fontWeight: '900', color: '#15803D', marginLeft: 2 }}>Estoque</Text>
            </View>
          )}
          {/* Spacer */}
          <View style={{ flex: 1 }} />
          {/* Delete */}
          {!noLoc && onDeleteLocation && (
            <TouchableOpacity style={{ width: 28, height: 28, borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginRight: 6 }} onPress={onDeleteLocation} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={15} color="#CBD5E1" />
            </TouchableOpacity>
          )}
          {/* Add child */}
          {!noLoc && (
            <TouchableOpacity style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center' }} onPress={onAddChild} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="add" size={17} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Items grid */}
      {expanded && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', padding: 10, gap: 8, backgroundColor: '#FAFCFF', minHeight: group.items.length === 0 ? 60 : undefined }}>
          {group.items.length === 0 ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 10, color: '#CBD5E1', fontWeight: '700' }}>Nenhum item neste local</Text>
            </View>
          ) : (
            group.items.map(item => {
              const cfg = getAssetRootVisual(item.type);
              const photos = item.details?.photos?.length ? item.details.photos : (item.imageUrl ? [item.imageUrl] : []);
              return (
                <View key={item.id} style={{ width: 84, alignItems: 'center', gap: 6, position: 'relative' }}>
                  <TouchableOpacity
                    style={{ width: 84, alignItems: 'center', gap: 6 }}
                    onPress={() => onItemPress(item)}
                    activeOpacity={0.8}
                  >
                    <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: cfg.bg, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }}>
                      {photos.length > 0
                        ? <Image source={{ uri: photos[0] }} style={{ width: 64, height: 64 }} />
                        : <Ionicons name={cfg.icon as any} size={28} color={cfg.color} />
                      }
                    </View>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: '#191C1D', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.2 }} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                  {/* Unlink badge */}
                  {onUnlinkItem && (
                    <TouchableOpacity
                      style={{ position: 'absolute', top: 0, right: 10, width: 18, height: 18, borderRadius: 9, backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FECACA', justifyContent: 'center', alignItems: 'center' }}
                      onPress={() => onUnlinkItem(item)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="close" size={10} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </View>
      )}
    </View>
  );
}
