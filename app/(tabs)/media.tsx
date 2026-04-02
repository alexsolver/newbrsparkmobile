import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Switch, Alert, Image, ActivityIndicator,
  ScrollView, Dimensions, StatusBar,
  KeyboardAvoidingView, Platform} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAuth } from '../../src/hooks/useAuth';
import { getMediaItems, saveMediaItem, deleteMediaItem, MediaItem } from '../../src/database';
import { pickMedia, pickFromGallery, getGeoStamp, GeoStamp } from '../../src/services/mediaService';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';

const VideoPlayer = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.play();
  });
  return <VideoView style={style} player={player} contentFit="contain" allowsFullscreen allowsPictureInPicture />;
};

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;

// ── Tag config ────────────────────────────────────────────────────────────────

const TAG_KEYS = ['BEFORE', 'DURING', 'AFTER', 'DAMAGE', 'WARRANTY', 'OTHER'] as const;
const TAG_COLORS: Record<string, string> = {
  BEFORE: '#3B82F6',
  DURING: '#F59E0B',
  AFTER: '#10B981',
  DAMAGE: '#EF4444',
  WARRANTY: '#8B5CF6',
  OTHER: '#6B7280',
};

// ── Media Card ────────────────────────────────────────────────────────────────

const MediaCard = React.memo(({ item, t, colors, onDelete, onPress }: {
  item: MediaItem;
  t: any;
  colors: any;
  onDelete: (id: string) => void;
  onPress: (item: MediaItem) => void;
}) => {
  const tagColor = TAG_COLORS[item.tag || ''] ?? TAG_COLORS.OTHER;
  const tagLabel = item.tag ? t(`media.tags.${item.tag}`) : '';
  const stampLines: string[] = [];
  if (item.stampedDatetime) stampLines.push(new Date(item.createdAt).toLocaleString('pt-BR'));
  if (item.stampedGeo && item.address) stampLines.push(`\ud83d\udccd ${item.address}`);
  if (item.stampedGeo && item.latitude) stampLines.push(`${item.latitude.toFixed(4)}, ${item.longitude?.toFixed(4)}`);

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={() => onPress(item)}
    >
      <View style={[styles.card, { backgroundColor: colors.cardWhite, shadowColor: colors.slate }]}>
        {/* Thumbnail */}
        <View style={styles.thumbContainer}>
          {item.type === 'photo' ? (
            <Image source={{ uri: item.uri }} style={styles.thumb} resizeMode="cover" />
          ) : (
            <View style={[styles.thumb, styles.videoThumb, { backgroundColor: colors.surfaceLow }]}>
              <Ionicons name="videocam" size={32} color={colors.textSecondary} />
              <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>{t('media.videoThumb')}</Text>
            </View>
          )}

          {/* Stamp overlay */}
          {stampLines.length > 0 && item.type === 'photo' && (
            <View style={styles.stampOverlay} pointerEvents="none">
              {stampLines.map((line, i) => (
                <Text key={i} style={styles.stampText} numberOfLines={1}>{line}</Text>
              ))}
            </View>
          )}

          {/* Video play icon */}
          {item.type === 'video' && (
            <View style={styles.playIconOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={36} color="rgba(255,255,255,0.9)" />
            </View>
          )}

          {/* Tag badge */}
          {!!item.tag && (
            <View style={[styles.tagBadge, { backgroundColor: tagColor }]}>
              <Text style={styles.tagBadgeText}>{tagLabel}</Text>
            </View>
          )}

          {/* Delete btn */}
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={(e) => { e.stopPropagation?.(); onDelete(item.id); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close-circle" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Meta */}
        <View style={styles.cardMeta}>
          {!!item.description && (
            <Text style={[styles.cardDesc, { color: colors.slate }]} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View style={styles.cardFooter}>
            {item.stampedGeo && (
              <View style={styles.metaChip}>
                <Ionicons name="location" size={10} color={colors.textSecondary} />
                <Text style={[styles.metaChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {item.address || `${item.latitude?.toFixed(3)}, ${item.longitude?.toFixed(3)}`}
                </Text>
              </View>
            )}
            {item.stampedDatetime && (
              <View style={styles.metaChip}>
                <Ionicons name="time" size={10} color={colors.textSecondary} />
                <Text style={[styles.metaChipText, { color: colors.textSecondary }]}>
                  {new Date(item.createdAt).toLocaleDateString('pt-BR')}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Toggle Row ────────────────────────────────────────────────────────────────

function ToggleRow({ label, sub, value, onChange, accent }: {
  label: string; sub: string; value: boolean;
  onChange: (v: boolean) => void; accent: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        thumbColor={value ? accent : '#ccc'}
        trackColor={{ false: '#e5e7eb', true: accent + '66' }}
      />
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function MediaScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<MediaItem[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [viewItem, setViewItem] = useState<MediaItem | null>(null);

  // Form state
  const [description, setDescription] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [stampGeo, setStampGeo] = useState(false);
  const [stampDatetime, setStampDatetime] = useState(false);
  const [geoData, setGeoData] = useState<GeoStamp | null>(null);
  const [detectingGeo, setDetectingGeo] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<{ uri: string; type: 'photo' | 'video' } | null>(null);
  const [saving, setSaving] = useState(false);

  // Load items
  const loadItems = useCallback(() => {
    setItems(getMediaItems(user?.email));
  }, [user?.email]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Geo toggle ──────────────────────────────────────────────────────────────
  const handleGeoToggle = useCallback(async (val: boolean) => {
    setStampGeo(val);
    if (val && !geoData) {
      setDetectingGeo(true);
      const geo = await getGeoStamp();
      setDetectingGeo(false);
      if (!geo) {
        Alert.alert(t('common.attention'), t('media.geoFailed'));
        setStampGeo(false);
      } else {
        setGeoData(geo);
      }
    }
  }, [geoData, t]);

  // ── Pick media ──────────────────────────────────────────────────────────────
  const handlePickMedia = useCallback(async (type: 'photo' | 'video', source: 'camera' | 'gallery') => {
    const result = await pickMedia(type, source);
    if (result) {
      setPendingMedia(result);
    }
  }, []);

  const handleGallery = useCallback(async () => {
    const result = await pickFromGallery();
    if (result) setPendingMedia(result);
  }, []);

  // ── Reset form ──────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setPendingMedia(null);
    setDescription('');
    setSelectedTag('');
    setStampGeo(false);
    setStampDatetime(false);
    setGeoData(null);
  }, []);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    resetForm();
  }, [resetForm]);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!pendingMedia) return;
    setSaving(true);
    const item: MediaItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uri: pendingMedia.uri,
      type: pendingMedia.type,
      description: description.trim(),
      tag: selectedTag || undefined,
      latitude: stampGeo && geoData ? geoData.latitude : undefined,
      longitude: stampGeo && geoData ? geoData.longitude : undefined,
      address: stampGeo && geoData ? geoData.address : undefined,
      stampedGeo: stampGeo && !!geoData,
      stampedDatetime: stampDatetime,
      createdAt: new Date().toISOString(),
      ownerEmail: user?.email,
    };
    saveMediaItem(item);
    loadItems();
    setSaving(false);
    handleCloseModal();
  }, [pendingMedia, description, selectedTag, stampGeo, geoData, stampDatetime, user?.email, loadItems, handleCloseModal]);

  // ── Viewer ──────────────────────────────────────────────────────────────────
  const handleOpenViewer = useCallback((item: MediaItem) => {
    setViewItem(item);
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewItem(null);
  }, []);

  const handleShare = useCallback(async (item: MediaItem) => {
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(t('common.attention'), 'Compartilhamento não disponível neste dispositivo.');
        return;
      }
      await Sharing.shareAsync(item.uri, {
        mimeType: item.type === 'video' ? 'video/*' : 'image/*',
        dialogTitle: item.description || t('media.title'),
        UTI: item.type === 'video' ? 'public.movie' : 'public.image',
      });
    } catch {
      Alert.alert(t('common.error'), 'Não foi possível compartilhar este arquivo.');
    }
  }, [t]);

  const handleDeleteFromViewer = useCallback((id: string) => {
    Alert.alert(t('common.attention'), t('media.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => {
          deleteMediaItem(id, user?.email || '');
          loadItems();
          handleCloseViewer();
        },
      },
    ]);
  }, [t, loadItems, handleCloseViewer]);

  // ── Delete ──────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('common.attention'), t('media.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: () => { deleteMediaItem(id, user?.email || ''); loadItems(); },
      },
    ]);
  }, [t, loadItems]);

  // ── Render card ─────────────────────────────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: MediaItem }) => (
    <MediaCard item={item} t={t} colors={colors} onDelete={handleDelete} onPress={handleOpenViewer} />
  ), [t, colors, handleDelete, handleOpenViewer]);

  const keyExtractor = useCallback((item: MediaItem) => item.id, []);

  // ── Empty state ─────────────────────────────────────────────────────────────
  const ListEmpty = (
    <View style={styles.emptyState}>
      <Ionicons name="camera-outline" size={64} color={colors.border} />
      <Text style={[styles.emptyTitle, { color: colors.slate }]}>{t('media.emptyTitle')}</Text>
      <Text style={[styles.emptySub, { color: colors.textSecondary }]}>{t('media.emptySubtitle')}</Text>
    </View>
  );

  const accent = colors.accent;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={22} color={colors.slate} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.slate }]}>{t('media.title')}</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: accent }]}
          onPress={() => setShowModal(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color="#fff" />
          <Text style={styles.addButtonText}>{t('media.addBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={2}
        contentContainerStyle={[
          styles.grid,
          { paddingBottom: insets.bottom + 100 },
          items.length === 0 && styles.gridEmpty,
        ]}
        columnWrapperStyle={styles.row}
        ListEmptyComponent={ListEmpty}
        showsVerticalScrollIndicator={false}
      />

      {/* ── Fullscreen Viewer Modal ────────────────────────────────────── */}
      <Modal
        visible={!!viewItem}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={handleCloseViewer}
        statusBarTranslucent
      >
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={styles.viewer}>
          {/* Close + Share + Delete */}
          <View style={[styles.viewerTopBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={handleCloseViewer} style={styles.viewerIconBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {viewItem && (
              <TouchableOpacity onPress={() => handleShare(viewItem)} style={styles.viewerIconBtn} activeOpacity={0.7}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
            {viewItem && (
              <TouchableOpacity onPress={() => handleDeleteFromViewer(viewItem.id)} style={styles.viewerIconBtn} activeOpacity={0.7}>
                <Ionicons name="trash-outline" size={22} color="#ff6b6b" />
              </TouchableOpacity>
            )}
          </View>

          {/* Media */}
          {viewItem?.type === 'photo' ? (
            <View style={styles.viewerContent}>
              <Image
                source={{ uri: viewItem.uri }}
                style={styles.viewerImage}
                resizeMode="contain"
              />
              {/* Full stamp overlay */}
              {(viewItem.stampedGeo || viewItem.stampedDatetime) && (
                <View style={styles.viewerStamp} pointerEvents="none">
                  {viewItem.stampedDatetime && (
                    <Text style={styles.viewerStampText}>
                      🕐 {new Date(viewItem.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  )}
                  {viewItem.stampedGeo && viewItem.address && (
                    <Text style={styles.viewerStampText}>📍 {viewItem.address}</Text>
                  )}
                  {viewItem.stampedGeo && viewItem.latitude && (
                    <Text style={[styles.viewerStampText, { opacity: 0.8 }]}>
                      {viewItem.latitude.toFixed(6)}, {viewItem.longitude?.toFixed(6)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          ) : viewItem?.type === 'video' ? (
            <View style={styles.viewerContent}>
              <VideoPlayer uri={viewItem.uri} style={styles.viewerImage} />
              {(viewItem.stampedGeo || viewItem.stampedDatetime) && (
                <View style={styles.viewerStamp} pointerEvents="none">
                  {viewItem.stampedDatetime && (
                    <Text style={styles.viewerStampText}>
                      {'\u{1F550}'} {new Date(viewItem.createdAt).toLocaleString('pt-BR')}
                    </Text>
                  )}
                  {viewItem.stampedGeo && viewItem.address && (
                    <Text style={styles.viewerStampText}>{'\u{1F4CD}'} {viewItem.address}</Text>
                  )}
                  {viewItem.stampedGeo && viewItem.latitude && (
                    <Text style={[styles.viewerStampText, { opacity: 0.8 }]}>
                      {viewItem.latitude.toFixed(6)}, {viewItem.longitude?.toFixed(6)}
                    </Text>
                  )}
                </View>
              )}
            </View>
          ) : null}

          {/* Info bar */}
          {viewItem && (
            <View style={[styles.viewerInfoBar, { paddingBottom: insets.bottom + 12 }]}>
              {viewItem.tag && (
                <View style={[styles.viewerTagBadge, { backgroundColor: TAG_COLORS[viewItem.tag] ?? TAG_COLORS.OTHER }]}>
                  <Text style={styles.viewerTagText}>{t(`media.tags.${viewItem.tag}`)}</Text>
                </View>
              )}
              {!!viewItem.description && (
                <Text style={styles.viewerDesc} numberOfLines={3}>{viewItem.description}</Text>
              )}
            </View>
          )}
        </View>
      </Modal>

      {/* ── Add Modal ─────────────────────────────────────────────────────── */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={[styles.modalContainer, { backgroundColor: colors.background }]}>
          {/* Modal Header */}
          <View style={[styles.modalHeader, { borderBottomColor: colors.divider }]}>
            <TouchableOpacity onPress={handleCloseModal} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={colors.slate} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: colors.slate }]}>{t('media.addMedia')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Source picker */}
            {!pendingMedia ? (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('media.chooseSource')}</Text>
                <View style={styles.sourceGrid}>
                  <TouchableOpacity
                    style={[styles.sourceBtn, { backgroundColor: colors.cardWhite, borderColor: colors.border }]}
                    onPress={() => handlePickMedia('photo', 'camera')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="camera" size={24} color={colors.accent} />
                    <Text style={[styles.sourceBtnText, { color: colors.slate }]}>{t('media.cameraPhoto')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sourceBtn, { backgroundColor: colors.cardWhite, borderColor: colors.border }]}
                    onPress={() => handlePickMedia('video', 'camera')}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="videocam" size={24} color={colors.accent} />
                    <Text style={[styles.sourceBtnText, { color: colors.slate }]}>{t('media.cameraVideo')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.sourceBtn, { backgroundColor: colors.cardWhite, borderColor: colors.border }]}
                    onPress={handleGallery}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="images" size={24} color={colors.accent} />
                    <Text style={[styles.sourceBtnText, { color: colors.slate }]}>{t('media.gallery')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Preview */}
                <View style={styles.previewContainer}>
                  {pendingMedia.type === 'photo' ? (
                    <View style={styles.previewWrapper}>
                      <Image source={{ uri: pendingMedia.uri }} style={styles.preview} resizeMode="cover" />
                      {/* Preview stamp overlay */}
                      {(stampGeo && geoData || stampDatetime) && (
                        <View style={styles.previewStampOverlay} pointerEvents="none">
                          {stampDatetime && (
                            <Text style={styles.previewStampText}>
                              {new Date().toLocaleString('pt-BR')}
                            </Text>
                          )}
                          {stampGeo && geoData && (
                            <Text style={styles.previewStampText} numberOfLines={1}>
                              \ud83d\udccd {geoData.address}
                            </Text>
                          )}
                          {stampGeo && geoData && (
                            <Text style={[styles.previewStampText, { opacity: 0.85 }]}>
                              {geoData.latitude.toFixed(5)}, {geoData.longitude.toFixed(5)}
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={[styles.preview, styles.videoThumb, { backgroundColor: colors.surfaceLow }]}>
                      <Ionicons name="videocam" size={48} color={colors.textSecondary} />
                      <Text style={[styles.videoLabel, { color: colors.textSecondary }]}>{t('media.videoThumb')}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={styles.changeMedia}
                    onPress={resetForm}
                  >
                    <Ionicons name="refresh" size={14} color={accent} />
                    <Text style={[styles.changeMediaText, { color: accent }]}>Trocar</Text>
                  </TouchableOpacity>
                </View>

                {/* Description */}
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('media.description').toUpperCase()}</Text>
                <TextInput
                  style={[styles.descInput, { backgroundColor: colors.cardWhite, borderColor: colors.border, color: colors.slate }]}
                  placeholder={t('media.descriptionPlaceholder')}
                  placeholderTextColor={colors.textLight}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                 returnKeyType="done"/>

                {/* Toggles */}
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>OPÇÕES DE STAMP</Text>
                <View style={[styles.toggleCard, { backgroundColor: colors.cardWhite, borderColor: colors.border }]}>
                  <ToggleRow
                    label={t('media.geoStamp')}
                    sub={detectingGeo ? t('media.detectingGeo') : t('media.geoStampSub')}
                    value={stampGeo}
                    onChange={handleGeoToggle}
                    accent={accent}
                  />
                  {stampGeo && geoData && (
                    <View style={[styles.geoPreview, { borderTopColor: colors.divider }]}>
                      <Ionicons name="location" size={12} color={accent} />
                      <Text style={[styles.geoText, { color: colors.textSecondary }]}>
                        {geoData.address} · {geoData.latitude.toFixed(5)}, {geoData.longitude.toFixed(5)}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.toggleDivider, { backgroundColor: colors.divider }]} />
                  <ToggleRow
                    label={t('media.datetimeStamp')}
                    sub={t('media.datetimeStampSub')}
                    value={stampDatetime}
                    onChange={setStampDatetime}
                    accent={accent}
                  />
                </View>

                {/* Tags */}
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t('media.tag').toUpperCase()}</Text>
                <View style={styles.tagRow}>
                  {TAG_KEYS.map((k) => {
                    const selected = selectedTag === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[
                          styles.tagChip,
                          { borderColor: TAG_COLORS[k] },
                          selected && { backgroundColor: TAG_COLORS[k] },
                        ]}
                        onPress={() => setSelectedTag(selected ? '' : k)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.tagChipText, { color: selected ? '#fff' : TAG_COLORS[k] }]}>
                          {t(`media.tags.${k}`)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Save */}
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: accent }, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.saveBtnText}>{t('media.save')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  addButton: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 24,
  },
  addButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Grid
  grid: { padding: 16 },
  gridEmpty: { flex: 1 },
  row: { gap: 16, marginBottom: 16 },

  // Card
  card: {
    width: CARD_SIZE, borderRadius: 16,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  thumbContainer: { position: 'relative' },
  thumb: { width: '100%', height: CARD_SIZE * 0.8 },
  videoThumb: { justifyContent: 'center', alignItems: 'center', gap: 6 },
  videoLabel: { fontSize: 11, fontWeight: '600' },
  stampOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6, paddingVertical: 5, gap: 2,
  },
  stampText: {
    color: '#fff', fontSize: 8, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.2,
  },
  tagBadge: {
    position: 'absolute', top: 8, left: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 10,
  },
  tagBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  deleteBtn: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12,
  },
  cardMeta: { padding: 10, gap: 4 },
  cardDesc: { fontSize: 12, fontWeight: '500', lineHeight: 16 },
  cardFooter: { gap: 3 },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaChipText: { fontSize: 10, flex: 1 },

  // Empty
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 20, opacity: 0.7 },

  // Modal
  modalContainer: { flex: 1 },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 17, fontWeight: '800' },

  // Source grid
  sectionLabel: {
    fontSize: 11, fontWeight: '800', letterSpacing: 0.8,
    marginBottom: 10, marginTop: 8,
  },
  sourceGrid: { gap: 10 },
  sourceBtn: {
    padding: 18, borderRadius: 14, borderWidth: 1,
    alignItems: 'center',
  },
  sourceBtnText: { fontSize: 15, fontWeight: '700' },

  // Preview
  previewContainer: { marginBottom: 20, gap: 8 },
  previewWrapper: { width: '100%', height: 200, borderRadius: 14, overflow: 'hidden', position: 'relative' },
  preview: { width: '100%', height: 200, borderRadius: 14, overflow: 'hidden' },
  previewStampOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10, paddingVertical: 8, gap: 3,
  },
  previewStampText: {
    color: '#fff', fontSize: 11, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  changeMedia: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end' },
  changeMediaText: { fontSize: 13, fontWeight: '600' },

  // Description
  descInput: {
    borderWidth: 1, borderRadius: 12,
    padding: 14, fontSize: 14, minHeight: 80,
    marginBottom: 20,
  },

  // Toggles
  toggleCard: { borderWidth: 1, borderRadius: 14, overflow: 'hidden', marginBottom: 20 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#1a1a1a' },
  toggleSub: { fontSize: 12, color: '#8B9193', marginTop: 2 },
  toggleDivider: { height: 1 },
  geoPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingBottom: 12, borderTopWidth: 1,
  },
  geoText: { fontSize: 11, flex: 1 },

  // Tags
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  tagChip: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1.5,
  },
  tagChipText: { fontSize: 13, fontWeight: '700' },

  // Save
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: 16,
    marginBottom: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  // Play icon overlay (video cards)
  playIconOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },

  // Fullscreen viewer
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerTopBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  viewerIconBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  viewerContent: { flex: 1, justifyContent: 'center' },
  viewerImage: { width: '100%', flex: 1 },
  viewerStamp: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 16, paddingVertical: 12, gap: 4,
  },
  viewerStampText: {
    color: '#fff', fontSize: 13, fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 0.3,
  },
  viewerInfoBar: {
    paddingHorizontal: 20, paddingTop: 14, gap: 8,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  viewerTagBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12,
  },
  viewerTagText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  viewerDesc: { color: '#E5E7EB', fontSize: 14, lineHeight: 20 },
});

