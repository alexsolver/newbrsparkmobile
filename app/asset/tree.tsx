import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { getLocalAssets } from '../../src/database';
import { Asset } from '../../src/types/asset';
import { colors } from '../../src/theme/colors';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';

const TYPE_ICONS: Record<string, { icon: any; color: string }> = {
  REAL_ESTATE: { icon: 'business-outline',  color: '#FF8C00' },
  TERRESTRIAL: { icon: 'car-outline',       color: '#904D00' },
  AQUATIC:     { icon: 'boat-outline',      color: '#006B5C' },
  SPECIAL:     { icon: 'star-outline',      color: '#70797C' },
  OTHER:       { icon: 'cube-outline',      color: '#565E61' },
};

interface TreeNode extends Asset {
  children: TreeNode[];
  depth: number;
  expanded: boolean;
}

function buildTree(assets: Asset[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  assets.forEach(a => map.set(a.id, { ...a, children: [], depth: 0, expanded: true }));

  const roots: TreeNode[] = [];
  map.forEach(node => {
    const pId = node.parentId && node.parentId.trim() ? node.parentId : null;
    if (pId && map.has(pId)) {
      map.get(pId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  // Assign depth
  function assignDepth(nodes: TreeNode[], depth: number) {
    nodes.forEach(n => { n.depth = depth; assignDepth(n.children, depth + 1); });
  }
  assignDepth(roots, 0);
  return roots;
}

function flattenTree(nodes: TreeNode[], collapsed: Set<string>): TreeNode[] {
  const result: TreeNode[] = [];
  function walk(list: TreeNode[]) {
    list.forEach(node => {
      result.push(node);
      if (!collapsed.has(node.id) && node.children.length > 0) {
        walk(node.children);
      }
    });
  }
  walk(nodes);
  return result;
}

export default function AssetTreeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [tree,      setTree]      = useState<TreeNode[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [flat,      setFlat]      = useState<TreeNode[]>([]);

  useFocusEffect(useCallback(() => {
    const assets = getLocalAssets(user?.email || '', { includeMobileWarehouse: false });
    const built = buildTree(assets);
    setTree(built);
    setFlat(flattenTree(built, collapsed));
  }, [user]));

  const toggle = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      setFlat(flattenTree(tree, next));
      return next;
    });
  };

  const renderNode = ({ item }: { item: TreeNode }) => {
    const cfg = TYPE_ICONS[item.type] || TYPE_ICONS.OTHER;
    const isCollapsed = collapsed.has(item.id);
    const hasChildren = item.children.length > 0;
    const indent = item.depth * 20;

    return (
      <TouchableOpacity
        style={[styles.node, { marginLeft: indent }]}
        activeOpacity={0.75}
        onPress={() => router.push(`/asset/${item.id}` as any)}
        onLongPress={() => hasChildren && toggle(item.id)}
      >
        {/* Linha vertical de vínculos */}
        {item.depth > 0 && (
          <View style={[styles.hierarchyLine, { left: -12 }]} />
        )}

        {/* Toggle expand/collapse */}
        {hasChildren ? (
          <TouchableOpacity onPress={() => toggle(item.id)} style={styles.chevron} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons
              name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
              size={14}
              color={colors.textLight}
            />
          </TouchableOpacity>
        ) : (
          <View style={styles.chevron}>
            <View style={styles.leafDot} />
          </View>
        )}

        {/* Ícone do tipo */}
        <View style={[styles.typeIcon, { backgroundColor: cfg.color + '20' }]}>
          <Ionicons name={cfg.icon} size={16} color={cfg.color} />
        </View>

        {/* Info */}
        <View style={styles.nodeInfo}>
          <Text style={styles.nodeTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.nodeSub}>
            {item.type === 'TERRESTRIAL' ? t('newAsset.terrestrial') :
             item.type === 'REAL_ESTATE' ? t('newAsset.realEstate') :
             item.type === 'AQUATIC' ? t('newAsset.aquatic') :
             item.type === 'SPECIAL' ? t('newAsset.special') : item.type}
            {hasChildren ? ` · ${item.children.length} ${item.children.length > 1 ? t('assetDetail.assetTree.subAssets') : t('assetDetail.assetTree.subAsset')}` : ''}
          </Text>
        </View>

        {/* Badge status */}
        <View style={[styles.statusDot, { backgroundColor: item.statusType === 'success' ? '#10B981' : '#F59E0B' }]} />
      </TouchableOpacity>
    );
  };

  const totalAssets = getLocalAssets(undefined, { includeMobileWarehouse: false }).length;

  return (
    <View style={styles.container}>
      {/* Sub Header (Hierarquia Context) */}
      <View style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' }}>
           <Ionicons name="arrow-back" size={20} color="#191C1D" />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 16 }}>
           <Text style={{ fontSize: 16, fontWeight: '900', color: '#191C1D' }}>{t('assetDetail.assetTree.title')}</Text>
           <Text style={{ fontSize: 11, color: '#70797C', fontWeight: '800', textTransform: 'uppercase' }}>{flat.length} items no portfólio</Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/asset/new' as any)}
        >
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Legenda */}
      <View style={styles.legend}>
        <Text style={styles.legendText}>{t('assetDetail.assetTree.legend')}</Text>
      </View>

      {flat.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="git-branch-outline" size={56} color={colors.border} />
          <Text style={styles.emptyText}>{t('assetDetail.assetTree.empty')}</Text>
        </View>
      ) : (
        <FlatList
          data={flat}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={renderNode}
          ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: colors.cardWhite, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.primary },
  headerSub:   { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  addBtn: {
    backgroundColor: colors.accent, width: 36, height: 36, borderRadius: 18,

    justifyContent: 'center', alignItems: 'center',
  },

  legend: {
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  legendText: { fontSize: 11, color: colors.textLight, fontStyle: 'italic', textAlign: 'center' },

  list: { padding: 16, paddingBottom: 60 },

  node: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.cardWhite, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
    position: 'relative',
  },
  hierarchyLine: {
    position: 'absolute', left: -12, top: '50%',
    width: 12, height: 1, backgroundColor: colors.border,
  },
  chevron: { width: 20, alignItems: 'center', marginRight: 6 },
  leafDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  typeIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  nodeInfo: { flex: 1 },
  nodeTitle: { fontSize: 14, fontWeight: '800', color: colors.primary },
  nodeSub:   { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '600' },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },

  empty: { alignItems: 'center', paddingTop: 100, gap: 14 },
  emptyText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', fontWeight: '600', lineHeight: 22 },
});
