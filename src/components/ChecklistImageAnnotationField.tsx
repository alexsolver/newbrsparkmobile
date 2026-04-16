import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

export type AnnotationStroke = {
  color: string;
  width: number;
  pts: { nx: number; ny: number }[];
};

export type ImageAnnotationValue = {
  v: 1;
  imageUri: string;
  strokes: AnnotationStroke[];
  /** Origem da imagem base — o PDF só mostra carimbo (data/GPS) para `camera`. */
  captureSource?: 'camera' | 'gallery';
  captureLat?: string;
  captureLng?: string;
  captureAddr?: string;
};

async function buildAnnotationCameraQuerySuffix(): Promise<string> {
  let q = '?live=true';
  q += `&capturedAt=${encodeURIComponent(new Date().toISOString())}`;
  try {
    const loc =
      (await Location.getLastKnownPositionAsync({})) ||
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    if (loc?.coords) {
      const { latitude, longitude } = loc.coords;
      q += `&lat=${latitude}&lng=${longitude}`;
    }
  } catch {
    /* sem GPS */
  }
  return q;
}

function parseLatLngFromImageUri(u: string): { lat: number; lng: number } | null {
  const qi = u.indexOf('?');
  if (qi < 0) return null;
  const sp = new URLSearchParams(u.slice(qi));
  const lat = Number(sp.get('lat'));
  const lng = Number(sp.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function parseValue(raw: unknown): ImageAnnotationValue | null {
  if (raw === undefined || raw === null) return null;
  let o: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const rec = o as Record<string, unknown>;
  const uri = String(rec.imageUri || rec.uri || '').trim();
  if (!uri) return null;
  const strokesRaw = rec.strokes;
  const strokes: AnnotationStroke[] = Array.isArray(strokesRaw)
    ? strokesRaw
        .map((s: unknown) => {
          if (!s || typeof s !== 'object') return null;
          const sr = s as Record<string, unknown>;
          const ptsRaw = sr.pts;
          const pts = Array.isArray(ptsRaw)
            ? (ptsRaw
                .map((p: unknown) => {
                  if (!p || typeof p !== 'object') return null;
                  const pr = p as Record<string, unknown>;
                  const nx = Number(pr.nx);
                  const ny = Number(pr.ny);
                  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return null;
                  return { nx, ny };
                })
                .filter(Boolean) as { nx: number; ny: number }[])
            : [];
          if (pts.length < 2) return null;
          return {
            color: String(sr.color || '#dc2626'),
            width: Math.min(24, Math.max(1, Number(sr.width) || 3)),
            pts,
          };
        })
        .filter(Boolean) as AnnotationStroke[]
    : [];
  const capSrcRaw = String(rec.captureSource ?? '').trim().toLowerCase();
  const captureSource =
    capSrcRaw === 'gallery' || capSrcRaw === 'camera' ? (capSrcRaw as 'camera' | 'gallery') : undefined;
  const captureLat = rec.captureLat != null ? String(rec.captureLat).trim() : undefined;
  const captureLng = rec.captureLng != null ? String(rec.captureLng).trim() : undefined;
  const captureAddr =
    typeof rec.captureAddr === 'string' && rec.captureAddr.trim() ? rec.captureAddr.trim() : undefined;
  return {
    v: 1,
    imageUri: uri,
    strokes,
    ...(captureSource ? { captureSource } : {}),
    ...(captureLat ? { captureLat } : {}),
    ...(captureLng ? { captureLng } : {}),
    ...(captureAddr ? { captureAddr } : {}),
  };
}

/** Coordenadas 0–1; SVG com viewBox 0 0 1 1. */
function pathFromNormPts(pts: { nx: number; ny: number }[]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0].nx} ${pts[0].ny}`;
  for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].nx} ${pts[i].ny}`;
  return d;
}

type Props = {
  value: unknown;
  onChange: (next: string) => void;
  readOnly?: boolean;
  penColor?: string;
  strokeWidth?: number;
};

export function ChecklistImageAnnotationField({
  value,
  onChange,
  readOnly,
  penColor = '#dc2626',
  strokeWidth = 4,
}: Props) {
  const parsed = useMemo(() => parseValue(value), [value]);
  const [modalOpen, setModalOpen] = useState(false);
  const [draftUri, setDraftUri] = useState<string | null>(null);
  const [draftStrokes, setDraftStrokes] = useState<AnnotationStroke[]>([]);
  const [livePts, setLivePts] = useState<{ nx: number; ny: number }[] | null>(null);
  const layoutRef = useRef({ w: 300, h: 300 });
  const captureSourceRef = useRef<'camera' | 'gallery'>('camera');

  const onOverlayLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) layoutRef.current = { w: width, h: height };
  }, []);

  const openEditor = useCallback(
    (uri: string, existing?: ImageAnnotationValue | null, source: 'camera' | 'gallery' = 'camera') => {
      captureSourceRef.current = source;
      setDraftUri(uri);
      setDraftStrokes(existing && existing.imageUri === uri ? existing.strokes.map((s) => ({ ...s, pts: s.pts.map((p) => ({ ...p })) })) : []);
      setLivePts(null);
      setModalOpen(true);
    },
    [],
  );

  const pickImage = useCallback(async () => {
    if (readOnly) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', 'Autorize o acesso à galeria ou use a câmera.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    openEditor(res.assets[0].uri, parsed, 'gallery');
  }, [openEditor, parsed, readOnly]);

  const takePhoto = useCallback(async () => {
    if (readOnly) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Câmera', 'Permissão negada.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.85 });
    if (res.canceled || !res.assets?.[0]?.uri) return;
    const base = res.assets[0].uri.split('?')[0];
    const qs = await buildAnnotationCameraQuerySuffix();
    openEditor(base + qs, parsed, 'camera');
  }, [openEditor, parsed, readOnly]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !readOnly && !!draftUri,
        onMoveShouldSetPanResponder: () => !readOnly && !!draftUri,
        onPanResponderGrant: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const { w, h } = layoutRef.current;
          if (w < 1 || h < 1) return;
          setLivePts([
            {
              nx: Math.max(0, Math.min(1, locationX / w)),
              ny: Math.max(0, Math.min(1, locationY / h)),
            },
          ]);
        },
        onPanResponderMove: (evt) => {
          const { locationX, locationY } = evt.nativeEvent;
          const { w, h } = layoutRef.current;
          if (w < 1 || h < 1) return;
          setLivePts((prev) => {
            const p = {
              nx: Math.max(0, Math.min(1, locationX / w)),
              ny: Math.max(0, Math.min(1, locationY / h)),
            };
            if (!prev || prev.length === 0) return [p];
            const last = prev[prev.length - 1];
            const dx = p.nx - last.nx;
            const dy = p.ny - last.ny;
            if (dx * dx + dy * dy < 1e-6) return prev;
            return [...prev, p];
          });
        },
        onPanResponderRelease: () => {
          setLivePts((prev) => {
            if (prev && prev.length >= 2) {
              setDraftStrokes((s) => [...s, { color: penColor, width: strokeWidth, pts: prev }]);
            }
            return null;
          });
        },
      }),
    [draftUri, penColor, readOnly, strokeWidth],
  );

  const saveDraft = useCallback(async () => {
    if (!draftUri) return;
    const src = captureSourceRef.current;
    let captureLat: string | undefined;
    let captureLng: string | undefined;
    let captureAddr: string | undefined;
    if (src === 'camera') {
      const ll = parseLatLngFromImageUri(draftUri);
      if (ll) {
        captureLat = String(ll.lat);
        captureLng = String(ll.lng);
        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: ll.lat,
            longitude: ll.lng,
          });
          if (rev?.length) {
            const r = rev[0];
            captureAddr = `${r.street || r.name}, ${r.streetNumber || 'S/N'} - ${r.subregion || r.city || r.district || r.region}`.trim();
          }
        } catch {
          captureAddr = undefined;
        }
        if (!captureAddr) captureAddr = 'Endereço indisponível (rede ou mapas).';
      }
    }
    const payload: ImageAnnotationValue = {
      v: 1,
      imageUri: draftUri,
      strokes: draftStrokes,
      captureSource: src,
      ...(captureLat && captureLng ? { captureLat, captureLng } : {}),
      ...(captureAddr ? { captureAddr } : {}),
    };
    onChange(JSON.stringify(payload));
    setModalOpen(false);
    setDraftUri(null);
    setLivePts(null);
  }, [draftStrokes, draftUri, onChange]);

  const undoStroke = useCallback(() => {
    setDraftStrokes((s) => s.slice(0, -1));
  }, []);

  const clearAll = useCallback(() => {
    setDraftStrokes([]);
    setLivePts(null);
  }, []);

  return (
    <View style={{ marginTop: 8 }}>
      {parsed?.imageUri ? (
        <View style={{ borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' }}>
          <View style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: '#0f172a' }} onLayout={onOverlayLayout}>
            <Image source={{ uri: parsed.imageUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
              <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                {parsed.strokes.map((s, i) => (
                  <Path
                    key={i}
                    d={pathFromNormPts(s.pts)}
                    stroke={s.color}
                    strokeWidth={Math.max(0.002, s.width * 0.004)}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
              </Svg>
            </View>
          </View>
        </View>
      ) : null}
      {!readOnly ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <TouchableOpacity
            onPress={takePhoto}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#f1f5f9',
              borderWidth: 1,
              borderColor: '#cbd5e1',
            }}
          >
            <Ionicons name="camera-outline" size={22} color="#0f172a" />
            <Text style={{ fontWeight: '700', color: '#0f172a' }}>Câmera</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={pickImage}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: 12,
              borderRadius: 10,
              backgroundColor: '#f1f5f9',
              borderWidth: 1,
              borderColor: '#cbd5e1',
            }}
          >
            <Ionicons name="images-outline" size={22} color="#0f172a" />
            <Text style={{ fontWeight: '700', color: '#0f172a' }}>Galeria</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {!readOnly && parsed?.imageUri ? (
        <TouchableOpacity
          onPress={() =>
            openEditor(
              parsed.imageUri,
              parsed,
              parsed.captureSource === 'gallery' ? 'gallery' : 'camera',
            )
          }
          style={{ marginTop: 10, padding: 10, alignItems: 'center', borderRadius: 8, backgroundColor: '#eff6ff' }}
        >
          <Text style={{ color: '#1d4ed8', fontWeight: '700' }}>Editar anotações</Text>
        </TouchableOpacity>
      ) : null}
      {!readOnly && parsed?.imageUri ? (
        <TouchableOpacity onPress={() => onChange('')} style={{ marginTop: 8, alignItems: 'center' }}>
          <Text style={{ color: '#dc2626', fontWeight: '600' }}>Remover</Text>
        </TouchableOpacity>
      ) : null}

      <Modal visible={modalOpen} animationType="slide" transparent onRequestClose={() => setModalOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.92)', justifyContent: 'center', padding: 16 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 12, maxHeight: '92%' }}>
            <Text style={{ fontWeight: '800', fontSize: 16, marginBottom: 8, color: '#0f172a' }}>
              Desenhar sobre a imagem
            </Text>
            <View
              style={{ width: '100%', height: 320, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0f172a' }}
              onLayout={onOverlayLayout}
              {...panResponder.panHandlers}
            >
              {draftUri ? (
                <Image source={{ uri: draftUri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              ) : null}
              <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} pointerEvents="none">
                <Svg width="100%" height="100%" viewBox="0 0 1 1" preserveAspectRatio="none">
                  {draftStrokes.map((s, i) => (
                    <Path
                      key={`d-${i}`}
                      d={pathFromNormPts(s.pts)}
                      stroke={s.color}
                      strokeWidth={Math.max(0.002, s.width * 0.004)}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {livePts && livePts.length >= 2 ? (
                    <Path
                      d={pathFromNormPts(livePts)}
                      stroke={penColor}
                      strokeWidth={Math.max(0.002, strokeWidth * 0.004)}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <TouchableOpacity onPress={undoStroke} style={{ padding: 10, backgroundColor: '#f1f5f9', borderRadius: 8 }}>
                <Text style={{ fontWeight: '700' }}>Desfazer traço</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearAll} style={{ padding: 10, backgroundColor: '#fef2f2', borderRadius: 8 }}>
                <Text style={{ fontWeight: '700', color: '#b91c1c' }}>Limpar desenhos</Text>
              </TouchableOpacity>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                onPress={() => {
                  setModalOpen(false);
                  setDraftUri(null);
                  setLivePts(null);
                }}
                style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#e2e8f0', alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '800' }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void saveDraft()}
                style={{ flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#2563eb', alignItems: 'center' }}
              >
                <Text style={{ fontWeight: '800', color: '#fff' }}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
