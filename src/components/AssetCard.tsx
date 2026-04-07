import React, { useState } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Dimensions, LayoutAnimation, UIManager, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from '../types/asset';
import { colors } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useTranslation } from 'react-i18next';
import { getChildAssets } from '../database';
import { useRouter } from 'expo-router';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface AssetCardProps {
  asset: Asset;
  onPress?: () => void;
  onLongPress?: () => void;
  hasStock?: boolean;
  hasLowStock?: boolean;
  forceExpand?: boolean;
  isReordering?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}

const { width } = Dimensions.get('window');
export function AssetCard({ asset, onPress, onLongPress, hasStock, hasLowStock, forceExpand, isReordering, onMoveUp, onMoveDown }: AssetCardProps) {
  const { t } = useTranslation();
  const { colors: C } = useTheme();
  const router = useRouter();
  const [childrenExpanded, setChildrenExpanded] = useState(false);
  const [children, setChildren] = useState<Asset[]>([]);

  const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string; bg: string }> = {
    TERRESTRIAL: { icon: 'car-outline',       label: t('asset.type.TERRESTRIAL'), color: '#904D00', bg: '#FFF7ED' },
    REAL_ESTATE: { icon: 'business-outline',  label: t('asset.type.REAL_ESTATE'), color: '#FF8C00', bg: '#FFF8F1' },
    AQUATIC:     { icon: 'boat-outline',      label: t('asset.type.AQUATIC'),     color: '#006B5C', bg: '#E0F2F1' },
    SPECIAL:     { icon: 'star-outline',      label: t('asset.type.SPECIAL'),     color: '#70797C', bg: '#F3F4F5' },
    OTHER:       { icon: 'cube-outline',      label: t('asset.type.OTHER'),       color: '#565E61', bg: '#F3F4F5' },
  };

  const cfg = TYPE_CONFIG[asset.type] || TYPE_CONFIG.OTHER;

  // Photos can be strings (new.tsx) or {uri, description} objects (edit in [id].tsx)
  const rawPhotos: any[] = asset.details?.photos && asset.details.photos.length > 0
    ? asset.details.photos
    : (asset.imageUrl ? [asset.imageUrl] : []);
  const photos: string[] = rawPhotos
    .map(p => (typeof p === 'string' ? p : p?.uri || null))
    .filter(Boolean) as string[];
  const hasPhoto = photos.length > 0;
  const statusOk = asset.statusType === 'success';
  const hasChildren = (asset.childrenCount ?? 0) > 0;

  const toggleChildren = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (!childrenExpanded) {
      // Load children on first expand
      setChildren(getChildAssets(asset.id, undefined, { includeMobileWarehouse: false }));
    }
    setChildrenExpanded(prev => !prev);
  };

  React.useEffect(() => {
    if (forceExpand === true && !childrenExpanded && hasChildren) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setChildren(getChildAssets(asset.id, undefined, { includeMobileWarehouse: false }));
      setChildrenExpanded(true);
    } else if (forceExpand === false && childrenExpanded) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setChildrenExpanded(false);
    }
  }, [forceExpand]);

  return (
    <View>
      <TouchableOpacity
        style={[S.card, { backgroundColor: C.cardWhite, borderColor: isReordering ? '#F59E0B' : C.border }, childrenExpanded && S.cardExpanded, isReordering && { borderWidth: 1.5, borderStyle: 'dashed' }]}
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={400}
        activeOpacity={0.75}
      >

        {/* Left: Icon (squircle — library icon or type default) */}
        <View style={S.leftCol}>
          <View style={[S.iconSquircle, { backgroundColor: (asset.details?.customColor || cfg.color) + '18' }]}>
            <Ionicons
              name={(asset.details?.customIcon || cfg.icon) as any}
              size={26}
              color={asset.details?.customColor || cfg.color}
            />
          </View>
        </View>

        {/* Center: Info */}
        <View style={S.center}>
          <View style={S.nameRow}>
            <Text style={[S.name, { color: C.primary }]} numberOfLines={1}>{asset.title}</Text>
          </View>

          <View style={S.metaRow}>
            <View style={[S.typePill, { backgroundColor: cfg.bg }]}>
              <Ionicons name={cfg.icon} size={10} color={cfg.color} />
              <Text style={[S.typePillT, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
            {asset.details?.inventoryId && (
              <Text style={S.invId} numberOfLines={1}>#{asset.details.inventoryId}</Text>
            )}
          </View>

          {/* Status + stock indicators */}
          <View style={S.bottomRow}>
            <View style={[S.statusPill, { backgroundColor: statusOk ? '#ECFDF5' : '#FFFBEB' }]}>
              <View style={[S.statusDot, { backgroundColor: statusOk ? '#10B981' : '#F59E0B' }]} />
              <Text style={[S.statusT, { color: statusOk ? '#059669' : '#D97706' }]} numberOfLines={1}>
                {t(`asset.status.${asset.status}`, { defaultValue: asset.status })}
              </Text>
            </View>

            {hasStock && (
              <View style={[S.stockPill, hasLowStock && S.stockPillAlert]}>
                <Ionicons name="cube" size={11} color={hasLowStock ? '#EF4444' : colors.accent} />
                <Text style={[S.stockPillT, hasLowStock && { color: '#EF4444' }]}>
                  {hasLowStock ? t('asset.stockLow') : t('asset.stockOk')}
                </Text>
              </View>
            )}

            {/* Badge hierárquico adaptativo */}
            {!isReordering && ((asset.childrenCount ?? 0) > 0 || asset.parentId) && (() => {
              const hasParent = !!asset.parentId;
              const hasKids   = (asset.childrenCount ?? 0) > 0;
              // intermediário: tem pai E filhos → laranja
              // raiz com filhos: não tem pai → verde
              // folha: tem pai, sem filhos → amarelo
              const pill = hasParent && hasKids
                ? S.linkPillOrange
                : !hasParent && hasKids
                  ? S.linkPillParent
                  : S.linkPillChild;
              const pillActive = hasParent && hasKids
                ? S.linkPillOrangeActive
                : S.linkPillParentActive;
              const iconColor = childrenExpanded
                ? '#fff'
                : hasParent && hasKids ? '#7C2D12'
                : !hasParent && hasKids ? '#065F46'
                : '#92400E';
              const textStyle = hasParent && hasKids
                ? S.linkPillOrangeT
                : !hasParent && hasKids
                  ? S.linkPillParentT
                  : S.linkPillChildT;
              const count = hasKids ? asset.childrenCount : 1;

              if (hasKids) {
                return (
                  <TouchableOpacity
                    style={[pill, childrenExpanded && pillActive]}
                    onPress={e => { e.stopPropagation?.(); toggleChildren(); }}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="link" size={11} color={childrenExpanded ? '#fff' : iconColor} />
                    <Text style={[textStyle, childrenExpanded && { color: '#fff' }]}>{count}</Text>
                    <Ionicons name={childrenExpanded ? 'chevron-up' : 'chevron-down'} size={9} color={childrenExpanded ? '#fff' : iconColor} />
                  </TouchableOpacity>
                );
              }
              // folha — só mostra badge estático amarelo
              return (
                <View style={pill}>
                  <Ionicons name="link" size={11} color={iconColor} />
                  <Text style={textStyle}>{count}</Text>
                </View>
              );
            })()}
          </View>
        </View>

        {/* Right: Chevron or Reorder Controls */}
        <View style={S.rightCol}>
          {isReordering ? (
            <View style={{flexDirection: 'row', gap: 6}}>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onMoveUp?.(); }} style={{padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0'}}>
                <Ionicons name="arrow-up" size={16} color={C.primary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={(e) => { e.stopPropagation(); onMoveDown?.(); }} style={{padding: 8, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0'}}>
                <Ionicons name="arrow-down" size={16} color={C.primary} />
              </TouchableOpacity>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color={colors.textLight} />
          )}
        </View>
      </TouchableOpacity>

      {/* Expanded children list */}
      {childrenExpanded && children.length > 0 && (
        <View style={S.childrenContainer}>
          {children.map((child, idx) => {
            const childCfg = TYPE_CONFIG[child.type] || TYPE_CONFIG.OTHER;
            return (
              <TouchableOpacity
                key={child.id}
                style={[S.childRow, idx === children.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/asset/${child.id}` as any)}
                activeOpacity={0.75}
              >
                <View style={[S.childIcon, { backgroundColor: childCfg.bg }]}>
                  <Ionicons name={childCfg.icon} size={14} color={childCfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={S.childName} numberOfLines={1}>{child.title}</Text>
                  <Text style={S.childType}>{childCfg.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color="#CBD5E1" />
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const S = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardWhite,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    marginBottom: 0,
  },

  // Left column
  leftCol: { position: 'relative', marginRight: 16 },
  photo: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9' },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#F1F5F9'
  },
  iconSquircle: {
    width: 56, height: 56, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  photoBadge: {
    position: 'absolute', bottom: -2, right: -2,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 8,
    paddingHorizontal: 5, paddingVertical: 2,
  },
  photoBadgeT: { fontSize: 8, fontWeight: '800', color: '#fff' },

  // Center column
  center: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 12, fontWeight: '700', color: '#191C1D', flex: 1, letterSpacing: -0.2 },

  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 0 },
  typePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    borderWidth: 0.5, borderColor: '#cad3d8'
  },
  typePillT: { fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase' },
  invId: { fontSize: 8.5, color: colors.textSecondary, fontWeight: '800', textTransform: 'uppercase' },

  bottomRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusT: { fontSize: 8.5, fontWeight: '800', textTransform: 'uppercase' },

  stockPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    borderWidth: 0.5, borderColor: colors.accent + '30'
  },
  stockPillAlert: { backgroundColor: '#FEF2F2', borderColor: '#EF4444' },
  stockPillT: { fontSize: 8.5, fontWeight: '800', color: colors.accent, textTransform: 'uppercase' },

  // Badge PAI — verde
  linkPillParent: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#ECFDF5', borderWidth: 0.5, borderColor: '#6EE7B7',
  },
  linkPillParentActive: {
    backgroundColor: '#10B981', borderColor: '#10B981',
  },
  linkPillParentT: { fontSize: 8.5, fontWeight: '800', color: '#065F46' },

  // Badge FILHO — amarelo/âmbar
  linkPillChild: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#FFFBEB', borderWidth: 0.5, borderColor: '#FCD34D',
  },
  linkPillChildT: { fontSize: 8.5, fontWeight: '800', color: '#92400E' },

  // Badge INTERMEDIÁRIO — laranja (tem pai e filhos)
  linkPillOrange: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#FFF7ED', borderWidth: 0.5, borderColor: '#FDBA74',
  },
  linkPillOrangeActive: { backgroundColor: '#F97316', borderColor: '#F97316' },
  linkPillOrangeT: { fontSize: 8.5, fontWeight: '800', color: '#7C2D12' },

  // Keep old linkPill/linkPillActive/linkPillT for any other uses
  linkPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#F1F5F9', borderWidth: 0.5, borderColor: '#cad3d8'
  },
  linkPillActive: {
    backgroundColor: colors.slate,
    borderColor: colors.slate,
  },
  linkPillT: { fontSize: 8.5, fontWeight: '800', color: colors.slate },

  // Child "Vinculado" badge
  childBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6,
    backgroundColor: '#EEF2FF', borderWidth: 0.5, borderColor: '#A5B4FC',
  },
  childBadgeT: { fontSize: 8.5, fontWeight: '800', color: '#6366F1', textTransform: 'uppercase' },

  // Right column
  rightCol: { marginLeft: 8 },

  // Children
  childrenContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: '#E2E8F0',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  childIcon: {
    width: 32, height: 32, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center',
  },
  childName: { fontSize: 12, fontWeight: '800', color: '#191C1D' },
  childType: { fontSize: 10, color: '#70797C', fontWeight: '600', marginTop: 1 },
});
