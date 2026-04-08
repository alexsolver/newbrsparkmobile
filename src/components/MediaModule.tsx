import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Modal, TextInput, Alert, Image, ActivityIndicator,
  ScrollView, Dimensions, StatusBar,
  KeyboardAvoidingView, Platform} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { getMediaItems, saveMediaItem, deleteMediaItem, updateMediaItem, updateMediaRemoteUrl, MediaItem } from '../database';
import { pickMedia, pickFromGallery, getGeoStamp, GeoStamp } from '../services/mediaService';
import { uploadFile, mediaRemotePath } from '../services/storageService';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { type ColorPalette, MEDIA_TAG_COLORS } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { ThemedSwitch } from './ThemedSwitch';

const VideoPlayer = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer(uri, p => {
    p.loop = false;
    p.play();
  });
  return <VideoView style={style} player={player} contentFit="contain" allowsFullscreen allowsPictureInPicture />;
};

const { width: SW } = Dimensions.get('window');
const CARD = (SW - 48) / 2;

const TAG_KEYS = ['BEFORE', 'DURING', 'AFTER', 'DAMAGE', 'WARRANTY', 'OTHER'] as const;

function createMediaModuleStyles(C: ColorPalette) {
  return StyleSheet.create({
  root: { flex: 1 },

  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  count: { fontSize: 12, fontWeight: '700', color: C.textSecondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20 },
  addBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },

  grid: { gap: 0 },
  row: { gap: 14, marginBottom: 14 },

  card: { width: CARD, borderRadius: 14, overflow: 'hidden', backgroundColor: C.cardWhite, shadowColor: C.slate, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3 },
  thumbWrap: { position: 'relative' },
  thumb: { width: '100%', height: CARD * 0.78 },
  videoBox: { justifyContent: 'center', alignItems: 'center', backgroundColor: C.surfaceLow },
  stampOverlay: { position: 'absolute', bottom: 0, left: 0, backgroundColor: 'rgba(255,165,0,0.6)', paddingHorizontal: 5, paddingVertical: 4, gap: 1, alignItems: 'flex-start' },
  stampTxt: { color: '#fff', fontSize: 7.5, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'left' },
  playOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center' },
  tagBadge: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  tagBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '800' },
  deleteBtn: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 10 },
  cardMeta: { padding: 8, gap: 3 },
  cardDesc: { fontSize: 11, fontWeight: '500', color: C.slate, lineHeight: 15 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTxt: { fontSize: 9, color: C.textSecondary, flex: 1 },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyT: { fontSize: 15, fontWeight: '700', color: C.slate },
  emptyS: { fontSize: 12, color: C.textSecondary, textAlign: 'center', lineHeight: 18 },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 10, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  vBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  viewerContent: { flex: 1, justifyContent: 'center' },
  viewerImg: { width: '100%', flex: 1 },
  viewerStamp: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,165,0,0.65)', paddingHorizontal: 14, paddingVertical: 10, gap: 4, alignItems: 'flex-start' },
  viewerStampTxt: { color: '#fff', fontSize: 12, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'left' },
  viewerInfo: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: 'rgba(0,0,0,0.85)', paddingBottom: 16 },
  viewerDesc: { color: '#E5E7EB', fontSize: 14, lineHeight: 20 },
  viewerTagBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  viewerTagTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // Add Modal
  modalWrap: { flex: 1 },
  modalHdr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  secLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8, color: C.textSecondary, marginBottom: 10, marginTop: 8 },
  srcGrid: { gap: 10 },
  srcBtn: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardWhite, alignItems: 'center' },
  srcBtnTxt: { fontSize: 14, fontWeight: '700', color: C.slate },
  previewWrap: { width: '100%', height: 180, borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
  preview: { width: '100%', height: 180 },
  swap: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-end', marginBottom: 16 },
  swapTxt: { fontSize: 13, fontWeight: '600' },
  descInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 13, minHeight: 70, marginBottom: 18, backgroundColor: C.cardWhite, color: C.slate },
  toggleCard: { borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden', marginBottom: 18, backgroundColor: C.cardWhite },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14 },
  toggleLbl: { fontSize: 13, fontWeight: '700', color: C.slate },
  toggleSub: { fontSize: 11, color: C.textSecondary, marginTop: 1 },
  divider: { height: 1, backgroundColor: C.border },
  geoHint: { fontSize: 10, color: C.textSecondary, paddingHorizontal: 14, paddingBottom: 10 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 18, borderWidth: 1.5 },
  tagChipTxt: { fontSize: 12, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.accent, paddingVertical: 14, borderRadius: 14, marginBottom: 20 },
  saveBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '800' },
  });
}

// ── Mini card ─────────────────────────────────────────────────────────────────
const MediaCard = React.memo(function MediaCardInner({ item, t, onDelete, onPress, operatorName, styles: MS }: {
  item: MediaItem; t: any;
  onDelete: (id: string) => void;
  onPress: (item: MediaItem) => void;
  operatorName?: string;
  styles: ReturnType<typeof createMediaModuleStyles>;
}) {
  const { colors: palette } = useTheme();
  const stampLines: string[] = [];
  if (item.stampedDatetime) stampLines.push(new Date(item.createdAt).toLocaleString('pt-BR'));
  if (operatorName) stampLines.push(operatorName);
  if (item.stampedGeo && item.address) stampLines.push(`\u{1F4CD} ${item.address}`);
  if (item.stampedGeo && item.latitude) stampLines.push(`${item.latitude.toFixed(4)}, ${item.longitude?.toFixed(4)}`);

  return (
    <TouchableOpacity activeOpacity={0.88} onPress={() => onPress(item)}>
      <View style={MS.card}>
        <View style={MS.thumbWrap}>
          {item.type === 'photo'
            ? <Image source={{ uri: item.uri }} style={MS.thumb} resizeMode="cover" />
            : (
              <View style={[MS.thumb, MS.videoBox]}>
                <Ionicons name="videocam" size={28} color={palette.textSecondary} />
              </View>
            )
          }
          {stampLines.length > 0 && item.type === 'photo' && (
            <View style={MS.stampOverlay} pointerEvents="none">
              {stampLines.map((l, i) => <Text key={i} style={MS.stampTxt} numberOfLines={1}>{l}</Text>)}
            </View>
          )}
          {item.type === 'video' && (
            <View style={MS.playOverlay} pointerEvents="none">
              <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.9)" />
            </View>
          )}
          {!!item.tag && (() => {
            const clean = item.tag.replace(/^asset:[^:]+:?/, '');
            const color = MEDIA_TAG_COLORS[clean] ?? MEDIA_TAG_COLORS.OTHER;
            return clean ? (
              <View style={[MS.tagBadge, { backgroundColor: color }]}>
                <Text style={MS.tagBadgeTxt}>{t(`media.tags.${clean}`)}</Text>
              </View>
            ) : null;
          })()}
          <TouchableOpacity
            style={MS.deleteBtn}
            onPress={(e) => { e.stopPropagation?.(); onDelete(item.id); }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash" size={15} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={MS.cardMeta}>
          {!!item.description && (
            <Text style={MS.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
          {item.stampedGeo && (
            <View style={MS.metaRow}>
              <Ionicons name="location" size={9} color={palette.textSecondary} />
              <Text style={MS.metaTxt} numberOfLines={1}>
                {item.address || `${item.latitude?.toFixed(3)}, ${item.longitude?.toFixed(3)}`}
              </Text>
            </View>
          )}
          {item.stampedDatetime && (
            <View style={MS.metaRow}>
              <Ionicons name="time" size={9} color={palette.textSecondary} />
              <Text style={MS.metaTxt}>{new Date(item.createdAt).toLocaleDateString('pt-BR')}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
});

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({ label, sub, value, onChange, styles: TS }: {
  label: string; sub: string; value: boolean; onChange: (v: boolean) => void;
  styles: ReturnType<typeof createMediaModuleStyles>;
}) {
  return (
    <View style={TS.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={TS.toggleLbl}>{label}</Text>
        <Text style={TS.toggleSub}>{sub}</Text>
      </View>
      <ThemedSwitch value={value} onValueChange={onChange} />
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MediaModule({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const S = useMemo(() => createMediaModuleStyles(C), [C]);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [viewItem, setViewItem] = useState<MediaItem | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [editTag, setEditTag] = useState('');

  // Form
  const [desc, setDesc] = useState('');
  const [tag, setTag] = useState('');
  const [stampGeo, setStampGeo] = useState(false);
  const [stampDt, setStampDt] = useState(false);
  const [geoData, setGeoData] = useState<GeoStamp | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [pending, setPending] = useState<{ uri: string; type: 'photo' | 'video' } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    // Filter by assetId stored as tag prefix OR ownerEmail — use ownerEmail + assetId combo
    const all = getMediaItems(user?.email);
    setItems(all.filter(m => m.tag?.startsWith(`asset:${assetId}`) || (m as any).assetId === assetId));
  }, [assetId, user?.email]);

  useEffect(() => { load(); }, [load]);

  const reset = useCallback(() => {
    setPending(null); setDesc(''); setTag(''); setStampGeo(false); setStampDt(false); setGeoData(null);
  }, []);

  const handleGeoToggle = useCallback(async (val: boolean) => {
    setStampGeo(val);
    if (val && !geoData) {
      setDetecting(true);
      const geo = await getGeoStamp();
      setDetecting(false);
      if (!geo) { Alert.alert(t('common.attention'), t('media.geoFailed')); setStampGeo(false); }
      else setGeoData(geo);
    }
  }, [geoData, t]);

  const handlePick = useCallback(async (type: 'photo' | 'video', source: 'camera' | 'gallery') => {
    const r = await pickMedia(type, source);
    if (r) setPending(r);
  }, []);

  const handleGallery = useCallback(async () => {
    const r = await pickFromGallery();
    if (r) setPending(r);
  }, []);

  const handleSave = useCallback(async () => {
    if (!pending) return;
    setSaving(true);
    const item: MediaItem = {
      id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uri: pending.uri,
      type: pending.type,
      description: desc.trim(),
      tag: tag ? `asset:${assetId}:${tag}` : `asset:${assetId}`,
      latitude: stampGeo && geoData ? geoData.latitude : undefined,
      longitude: stampGeo && geoData ? geoData.longitude : undefined,
      address: stampGeo && geoData ? geoData.address : undefined,
      stampedGeo: stampGeo && !!geoData,
      stampedDatetime: stampDt,
      createdAt: new Date().toISOString(),
      ownerEmail: user?.email,
    };

    // 1. Save locally first (offline-first)
    saveMediaItem(item);
    load();
    setSaving(false);
    setShowAdd(false);
    reset();

    // 2. Upload file in background (non-blocking)
    if (user?.email) {
      const ext = pending.uri.split('.').pop() || (pending.type === 'video' ? 'mp4' : 'jpg');
      const remotePath = mediaRemotePath(user.email, item.id, ext);
      uploadFile(pending.uri, remotePath).then(result => {
        if (result?.url || result?.provider === 'dropbox') {
           const cloudUri = result?.url || result?.path || pending.uri;
           updateMediaRemoteUrl(item.id, cloudUri);
        }
      }).catch(() => { /* silently ignore upload errors */ });
    }
  }, [pending, desc, tag, assetId, stampGeo, geoData, stampDt, user?.email, load, reset]);

  const handleDelete = useCallback((id: string) => {
    Alert.alert(t('common.attention'), t('media.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => { deleteMediaItem(id); load(); } },
    ]);
  }, [t, load]);

  const handleShare = useCallback(async (item: MediaItem) => {
    const ok = await Sharing.isAvailableAsync();
    if (!ok) return;
    await Sharing.shareAsync(item.uri, {
      mimeType: item.type === 'video' ? 'video/*' : 'image/*',
      UTI: item.type === 'video' ? 'public.movie' : 'public.image',
    });
  }, []);

  const handleCloseViewer = useCallback(() => {
    setViewItem(null);
    setShowEdit(false);
  }, []);

  const handleOpenEdit = useCallback((item: MediaItem) => {
    // Extract the user-facing tag (strip the asset: prefix)
    const rawTag = item.tag?.replace(/^asset:[^:]+:?/, '') ?? '';
    setEditDesc(item.description ?? '');
    setEditTag(rawTag);
    setShowEdit(true);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!viewItem) return;
    const newTag = editTag ? `asset:${assetId}:${editTag}` : `asset:${assetId}`;
    updateMediaItem(viewItem.id, { description: editDesc.trim(), tag: newTag });
    // Update viewItem in state so UI reflects change immediately
    setViewItem(prev => prev ? { ...prev, description: editDesc.trim(), tag: newTag } : prev);
    load();
    setShowEdit(false);
  }, [viewItem, editDesc, editTag, assetId, load]);

  const renderItem = useCallback(({ item }: { item: MediaItem }) => (
    <MediaCard item={item} t={t} onDelete={handleDelete} onPress={setViewItem} operatorName={user?.name} styles={S} />
  ), [t, handleDelete, user?.name, S]);

  const keyExtractor = useCallback((m: MediaItem) => m.id, []);

  // Stamp overlay helper
  const StampOverlay = ({ item }: { item: MediaItem }) => {
    if (!item.stampedGeo && !item.stampedDatetime) return null;
    return (
      <View style={S.viewerStamp} pointerEvents="none">
        {item.stampedDatetime && <Text style={S.viewerStampTxt}>🕐 {new Date(item.createdAt).toLocaleString('pt-BR')}</Text>}
        {user?.name && <Text style={S.viewerStampTxt}>{user.name}</Text>}
        {item.stampedGeo && item.address && <Text style={S.viewerStampTxt}>📍 {item.address}</Text>}
        {item.stampedGeo && item.latitude && <Text style={[S.viewerStampTxt, { opacity: 0.8 }]}>{item.latitude.toFixed(6)}, {item.longitude?.toFixed(6)}</Text>}
      </View>
    );
  };

  return (
    <View style={S.root}>
      {/* Toolbar */}
      <View style={S.toolbar}>
        <Text style={S.count}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Text>
      </View>

      {/* Grid */}
      {items.length === 0 ? (
        <View style={S.empty}>
          <Ionicons name="camera-outline" size={48} color={C.border} />
          <Text style={S.emptyT}>{t('media.emptyTitle')}</Text>
          <Text style={S.emptyS}>{t('media.emptySubtitle')}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          scrollEnabled={false}
          contentContainerStyle={S.grid}
          columnWrapperStyle={S.row}
        />
      )}

      {/* ── Viewer fullscreen ──────────────────────────────────────────────── */}
      <Modal visible={!!viewItem} animationType="fade" presentationStyle="fullScreen" onRequestClose={handleCloseViewer} statusBarTranslucent>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <View style={S.viewer}>


          {viewItem?.type === 'photo' ? (
            <View style={S.viewerContent}>
              <Image source={{ uri: viewItem.uri }} style={S.viewerImg} resizeMode="contain" />
              {viewItem && <StampOverlay item={viewItem} />}
            </View>
          ) : viewItem?.type === 'video' ? (
            <View style={S.viewerContent}>
              <VideoPlayer uri={viewItem.uri} style={S.viewerImg} />
              {viewItem && <StampOverlay item={viewItem} />}
            </View>
          ) : null}

          {viewItem && (
            <View style={[S.viewerInfo, { paddingBottom: insets.bottom + 12 }]}>
              {!!viewItem.description && <Text style={S.viewerDesc}>{viewItem.description}</Text>}
              {/* Show tag if present (strip asset prefix) */}
              {!!viewItem.tag && (() => {
                const clean = viewItem.tag.replace(/^asset:[^:]+:?/, '');
                const color = MEDIA_TAG_COLORS[clean] ?? MEDIA_TAG_COLORS.OTHER;
                return clean ? (
                  <View style={[S.viewerTagBadge, { backgroundColor: color, alignSelf: 'flex-start', marginTop: 6 }]}>
                    <Text style={S.viewerTagTxt}>{t(`media.tags.${clean}`)}</Text>
                  </View>
                ) : null;
              })()}
            </View>
          )}

          {/* ── Viewer Toolbar (Moved to last to ensure it's on top of content) ── */}
          <View style={[S.viewerBar, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity onPress={handleCloseViewer} style={S.vBtn}>
              <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {viewItem && (
              <TouchableOpacity onPress={() => handleOpenEdit(viewItem)} style={S.vBtn}>
                <Ionicons name="pencil" size={20} color="#fff" />
              </TouchableOpacity>
            )}
            {viewItem && (
              <TouchableOpacity onPress={() => handleShare(viewItem)} style={S.vBtn}>
                <Ionicons name="share-outline" size={22} color="#fff" />
              </TouchableOpacity>
            )}
            {viewItem && (
              <TouchableOpacity onPress={() => { handleDelete(viewItem.id); handleCloseViewer(); }} style={S.vBtn}>
                <Ionicons name="trash-outline" size={22} color={C.destructive} />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Edit View (Replacing Modal to avoid iOS stacking issues) ─────── */}
          {showEdit && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.background, zIndex: 100 }]}>
              <View style={[S.modalHdr, { borderBottomColor: C.border, paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={() => setShowEdit(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={C.slate} />
                </TouchableOpacity>
                <Text style={[S.modalTitle, { color: C.slate }]}>Editar Mídia</Text>
                <TouchableOpacity onPress={handleSaveEdit}>
                  <Text style={{ color: C.accent, fontWeight: '800', fontSize: 15 }}>{t('common.save')}</Text>
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
                <Text style={S.secLabel}>{t('media.description').toUpperCase()}</Text>
                <TextInput
                  style={S.descInput}
                  placeholder={t('media.descriptionPlaceholder')}
                  placeholderTextColor={C.textLight}
                  value={editDesc} onChangeText={setEditDesc}
                  multiline numberOfLines={3} textAlignVertical="top"
                  autoFocus
                 returnKeyType="done"/>

                <Text style={S.secLabel}>{t('media.tag').toUpperCase()}</Text>
                <View style={S.tagRow}>
                  {TAG_KEYS.map(k => {
                    const sel = editTag === k;
                    return (
                      <TouchableOpacity key={k} style={[S.tagChip, { borderColor: MEDIA_TAG_COLORS[k] }, sel && { backgroundColor: MEDIA_TAG_COLORS[k] }]} onPress={() => setEditTag(sel ? '' : k)} activeOpacity={0.7}>
                        <Text style={[S.tagChipTxt, { color: sel ? C.cardWhite : MEDIA_TAG_COLORS[k] }]}>{t(`media.tags.${k}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity style={S.saveBtn} onPress={handleSaveEdit} activeOpacity={0.8}>
                  <Ionicons name="checkmark-circle" size={18} color="#fff" />
                  <Text style={S.saveBtnTxt}>{t('common.save')}</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Add Modal ──────────────────────────────────────────────────────── */}
      <Modal visible={showAdd} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowAdd(false); reset(); }}>
        <View style={[S.modalWrap, { backgroundColor: C.background }]}>
          <View style={[S.modalHdr, { borderBottomColor: C.border }]}>
            <TouchableOpacity onPress={() => { setShowAdd(false); reset(); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={24} color={C.slate} />
            </TouchableOpacity>
            <Text style={[S.modalTitle, { color: C.slate }]}>{t('media.addMedia')}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {!pending ? (
              <>
                <Text style={S.secLabel}>{t('media.chooseSource')}</Text>
                <View style={S.srcGrid}>
                  <TouchableOpacity style={S.srcBtn} onPress={() => handlePick('photo', 'camera')} activeOpacity={0.7}>
                    <Ionicons name="camera" size={22} color={C.accent} />
                    <Text style={S.srcBtnTxt}>{t('media.cameraPhoto')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.srcBtn} onPress={() => handlePick('video', 'camera')} activeOpacity={0.7}>
                    <Ionicons name="videocam" size={22} color={C.accent} />
                    <Text style={S.srcBtnTxt}>{t('media.cameraVideo')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.srcBtn} onPress={handleGallery} activeOpacity={0.7}>
                    <Ionicons name="images" size={22} color={C.accent} />
                    <Text style={S.srcBtnTxt}>{t('media.gallery')}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                {/* Preview */}
                <View style={S.previewWrap}>
                  {pending.type === 'photo'
                    ? <Image source={{ uri: pending.uri }} style={S.preview} resizeMode="cover" />
                    : (
                      <View style={[S.preview, S.videoBox]}>
                        <Ionicons name="videocam" size={48} color={C.textSecondary} />
                      </View>
                    )
                  }
                </View>
                <TouchableOpacity onPress={reset} style={S.swap}>
                  <Ionicons name="refresh" size={14} color={C.accent} />
                  <Text style={[S.swapTxt, { color: C.accent }]}>Trocar</Text>
                </TouchableOpacity>

                {/* Descrição */}
                <Text style={S.secLabel}>{t('media.description').toUpperCase()}</Text>
                <TextInput
                  style={S.descInput}
                  placeholder={t('media.descriptionPlaceholder')}
                  placeholderTextColor={C.textLight}
                  value={desc} onChangeText={setDesc}
                  multiline numberOfLines={3} textAlignVertical="top"
                 returnKeyType="done"/>

                {/* Toggles */}
                <Text style={S.secLabel}>OPÇÕES DE STAMP</Text>
                <View style={S.toggleCard}>
                  <ToggleRow label={t('media.geoStamp')} sub={detecting ? t('media.detectingGeo') : t('media.geoStampSub')} value={stampGeo} onChange={handleGeoToggle} styles={S} />
                  {stampGeo && geoData && (
                    <Text style={S.geoHint}>📍 {geoData.address} · {geoData.latitude.toFixed(4)}, {geoData.longitude.toFixed(4)}</Text>
                  )}
                  <View style={S.divider} />
                  <ToggleRow label={t('media.datetimeStamp')} sub={t('media.datetimeStampSub')} value={stampDt} onChange={setStampDt} styles={S} />
                </View>

                {/* Tags */}
                <Text style={S.secLabel}>{t('media.tag').toUpperCase()}</Text>
                <View style={S.tagRow}>
                  {TAG_KEYS.map(k => {
                    const sel = tag === k;
                    return (
                      <TouchableOpacity key={k} style={[S.tagChip, { borderColor: MEDIA_TAG_COLORS[k] }, sel && { backgroundColor: MEDIA_TAG_COLORS[k] }]} onPress={() => setTag(sel ? '' : k)} activeOpacity={0.7}>
                        <Text style={[S.tagChipTxt, { color: sel ? C.cardWhite : MEDIA_TAG_COLORS[k] }]}>{t(`media.tags.${k}`)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Save */}
                <TouchableOpacity style={[S.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving} activeOpacity={0.8}>
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={S.saveBtnTxt}>{t('media.save')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Standard FAB */}
      <TouchableOpacity 
        style={{
          position: 'absolute',
          bottom: 30, right: 20, zIndex: 10,
          width: 60, height: 60, borderRadius: 30,
          backgroundColor: C.accent,
          justifyContent: 'center', alignItems: 'center',
          shadowColor: C.accent, shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
        }}
        activeOpacity={0.8}
        onPress={() => setShowAdd(true)}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
