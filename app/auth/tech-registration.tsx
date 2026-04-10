/**
 * Cadastro de prestador (token) — convite enviado por uma empresa (painel) ou inscrição pelo app (perfil).
 * Rota: /auth/tech-registration?token=...
 *
 * Passo 1: foto de perfil (IA). Passo 2: ≥4 fotos biométricas validadas no CompreFace (Verification) contra a foto de perfil.
 * Ordem de validação IA: `/api/me/validate-technician-profile-photo` → `/api/technician-registration/public/:token/validate-profile-photo` → `/api/ai-technician-profile-photo/validate` (404 em cada passo tenta o próximo).
 * Isto é independente do CompreFace / verify-face dos checklists.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { API_BASE, getToken, apiFetch } from '../../src/services/auth';
import { useAuth } from '../../src/hooks/useAuth';

/** Mínimo de fotos para enrolamento no motor biométrico do tenant (ex. CompreFace) — secção à parte do passo 1 (IA). */
const MIN_FACE_ENROLLMENT_PHOTOS = 4;

function isAiProfileGateEngine(e: string | undefined): boolean {
  return e === 'ai_llm_vision' || e === 'openai_vision';
}

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Segunda' },
  { key: 'tue', label: 'Terça' },
  { key: 'wed', label: 'Quarta' },
  { key: 'thu', label: 'Quinta' },
  { key: 'fri', label: 'Sexta' },
  { key: 'sat', label: 'Sábado' },
  { key: 'sun', label: 'Domingo' },
];

function rid() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

type DocRow = {
  id: string;
  docType: string;
  identifier: string;
  validFrom: string;
  validTo: string;
  issuingBody: string;
  notes: string;
  locationIds: string[];
  attachmentUrl?: string | null;
  attachmentMimeType?: string | null;
};

type Loc = { id: string; name: string; type: string };

/** Metadados da foto inicial (câmera + IA); ou rascunho antigo com ≥4 fotos (legacy). */
type PrimaryProfileCapture = {
  validatedAt: string;
  /** Gate do passo 1: só IA (OpenAI hoje). `openai_vision` = legado gravado antes da renomeação. */
  validationEngine: 'ai_llm_vision' | 'openai_vision' | 'legacy_enrollment_photos';
  userMessagePtBr?: string;
  photoId?: string;
} | null;

function defaultSchedule() {
  const o: Record<string, { id: string; enabled: boolean; start: string; end: string; locationIds: string[] }[]> = {};
  for (const { key } of DAYS) {
    o[key] = [{ id: rid(), enabled: false, start: '08:00', end: '18:00', locationIds: [] }];
  }
  return o;
}

function parseDocs(raw: unknown): DocRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((d: any) => ({
    id: d.id || rid(),
    docType: d.docType || 'Outro',
    identifier: d.identifier || '',
    validFrom: (d.validFrom || '').slice(0, 10),
    validTo: (d.validTo || '').slice(0, 10),
    issuingBody: d.issuingBody || '',
    notes: d.notes || '',
    locationIds: Array.isArray(d.locationIds) ? d.locationIds : [],
    attachmentUrl: d.attachmentUrl ? String(d.attachmentUrl) : '',
    attachmentMimeType: d.attachmentMimeType ? String(d.attachmentMimeType) : '',
  }));
}

function publicUrl(path: string) {
  const p = String(path || '');
  if (/^https?:\/\//i.test(p)) return p;
  return `${API_BASE}${p.startsWith('/') ? '' : '/'}${p}`;
}

export default function TechRegistrationScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token : '';

  const [loading, setLoading] = useState(true);
  const [authRequired, setAuthRequired] = useState(false);
  const [sessionOk, setSessionOk] = useState(false);
  const [invitedEmailHint, setInvitedEmailHint] = useState('');
  const [saving, setSaving] = useState(false);
  const [closed, setClosed] = useState<{ status: string; tenantName?: string } | null>(null);
  const [status, setStatus] = useState('');
  const [revisionNote, setRevisionNote] = useState<string | null>(null);
  const [locations, setLocations] = useState<Loc[]>([]);
  const [tenantName, setTenantName] = useState('');
  /** `panel_invite` = gestor convidou; `self_service` = «Quero ser prestador» no perfil (sem convite por e-mail). */
  const [registrationSource, setRegistrationSource] = useState<'panel_invite' | 'self_service'>('panel_invite');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [stateUf, setStateUf] = useState('');
  const [postal, setPostal] = useState('');
  const [country, setCountry] = useState('BR');
  const [cft, setCft] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [score, setScore] = useState('5');
  const [skillsText, setSkillsText] = useState('');
  const [personalDocs, setPersonalDocs] = useState<DocRow[]>([]);
  const [proDocs, setProDocs] = useState<DocRow[]>([]);
  const [schedule, setSchedule] = useState(defaultSchedule);
  const [serviceLocIds, setServiceLocIds] = useState<string[]>([]);
  const [facePhotos, setFacePhotos] = useState<{ id: string; url: string }[]>([]);
  const [primaryProfileCapture, setPrimaryProfileCapture] = useState<PrimaryProfileCapture>(null);
  const [primaryValidating, setPrimaryValidating] = useState(false);
  const [primaryValidationError, setPrimaryValidationError] = useState<string | null>(null);
  /** Passo 2 (só fluxo IA): utilizador confirmou seguir para o formulário após ≥4 fotos CompreFace. */
  const [biometricStepConfirmed, setBiometricStepConfirmed] = useState(false);

  const [password, setPassword] = useState('');

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const basePath = useMemo(
    () => `${API_BASE}/api/technician-registration/public/${encodeURIComponent(token)}`,
    [token]
  );

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const jwt = await getToken();
      const headers: Record<string, string> = {};
      if (jwt) headers.Authorization = `Bearer ${jwt}`;
      const res = await fetch(basePath, { headers });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Erro', data.error || 'Convite inválido.');
        setSessionOk(false);
        setAuthRequired(false);
        setLoading(false);
        return;
      }
      if (data.closed) {
        setClosed({ status: data.status, tenantName: data.tenantName });
        setSessionOk(false);
        setAuthRequired(false);
        setLoading(false);
        return;
      }
      if (data.requiresAuth) {
        setAuthRequired(true);
        setSessionOk(false);
        setInvitedEmailHint(String(data.invitedEmail || ''));
        setTenantName(data.tenantName || '');
        setRegistrationSource(
          data.registrationSource === 'self_service' ? 'self_service' : 'panel_invite'
        );
        setStatus(data.status || '');
        setLoading(false);
        return;
      }
      setAuthRequired(false);
      setSessionOk(true);
      setClosed(null);
      setInvitedEmailHint(String(data.invitedEmail || ''));
      setRegistrationSource(
        data.registrationSource === 'self_service' ? 'self_service' : 'panel_invite'
      );
      setStatus(data.status || '');
      setRevisionNote(data.revisionNote || null);
      setTenantName(data.tenantName || '');
      setLocations(Array.isArray(data.locations) ? data.locations : []);
      const r = data.responsesJson && typeof data.responsesJson === 'object' ? data.responsesJson : {};
      setName(String(r.name || ''));
      setEmail(String(r.email || data.invitedEmail || ''));
      setPhone(String(r.phone || ''));
      setAvatarUrl(String(r.avatarUrl || ''));
      const addr = r.addressJson && typeof r.addressJson === 'object' ? r.addressJson : {};
      setLine1(String(addr.line1 || ''));
      setLine2(String(addr.line2 || ''));
      setDistrict(String(addr.district || ''));
      setCity(String(addr.city || ''));
      setStateUf(String(addr.state || ''));
      setPostal(String(addr.postalCode || ''));
      setCountry(String(addr.countryCode || 'BR'));
      const tech = r.technician && typeof r.technician === 'object' ? r.technician : {};
      setCft(String(tech.cft || ''));
      setSpecialty(String(tech.specialty || ''));
      setScore(String(tech.score ?? 5));
      const sk = tech.skillsJson;
      if (Array.isArray(sk)) setSkillsText(sk.join(', '));
      else setSkillsText('');
      setPersonalDocs(parseDocs(r.personalDocuments));
      setProDocs(parseDocs(tech.professionalDocuments));
      if (tech.workScheduleJson && typeof tech.workScheduleJson === 'object') {
        const merged = defaultSchedule();
        for (const k of Object.keys(merged)) {
          const day = (tech.workScheduleJson as any)[k];
          if (Array.isArray(day) && day.length) {
            merged[k] = day.map((slot: any) => ({
              id: slot.id || rid(),
              enabled: !!slot.enabled,
              start: slot.start || '08:00',
              end: slot.end || '18:00',
              locationIds: Array.isArray(slot.locationIds) ? slot.locationIds : [],
            }));
          }
        }
        setSchedule(merged);
      } else setSchedule(defaultSchedule());
      setServiceLocIds(Array.isArray(tech.serviceLocationIds) ? [...tech.serviceLocationIds] : []);
      const capRaw = (r as any).techRegPrimaryProfileCapture;
      const profilePidForFilter =
        capRaw &&
        typeof capRaw === 'object' &&
        capRaw.photoId &&
        (String(capRaw.validationEngine) === 'ai_llm_vision' || String(capRaw.validationEngine) === 'openai_vision')
          ? String(capRaw.photoId)
          : '';
      const faces = Array.isArray(r.faceEnrollmentPhotos) ? r.faceEnrollmentPhotos : [];
      let faceRows = faces.filter((x: any) => x?.id && x?.url);
      if (profilePidForFilter) {
        faceRows = faceRows.filter((x: any) => String(x.id) !== profilePidForFilter);
      }
      setFacePhotos(faceRows.map((x: any) => ({ id: x.id, url: x.url })));
      if (capRaw && typeof capRaw === 'object' && capRaw.validatedAt) {
        const ve = String(capRaw.validationEngine || '');
        const validationEngine: NonNullable<PrimaryProfileCapture>['validationEngine'] =
          ve === 'legacy_enrollment_photos'
            ? 'legacy_enrollment_photos'
            : ve === 'ai_llm_vision'
              ? 'ai_llm_vision'
              : 'openai_vision';
        setPrimaryProfileCapture({
          validatedAt: String(capRaw.validatedAt),
          validationEngine,
          userMessagePtBr: capRaw.userMessagePtBr ? String(capRaw.userMessagePtBr) : undefined,
          photoId: capRaw.photoId ? String(capRaw.photoId) : undefined,
        });
        if (
          (validationEngine === 'ai_llm_vision' || validationEngine === 'openai_vision') &&
          faceRows.length >= MIN_FACE_ENROLLMENT_PHOTOS
        ) {
          setBiometricStepConfirmed(true);
        } else if (validationEngine === 'ai_llm_vision' || validationEngine === 'openai_vision') {
          setBiometricStepConfirmed(false);
        }
      } else {
        const allFaceRows = faces.filter((x: any) => x?.id && x?.url);
        if (allFaceRows.length >= MIN_FACE_ENROLLMENT_PHOTOS) {
          const first = allFaceRows[0];
          setPrimaryProfileCapture({
            validatedAt: String(first?.createdAt || new Date().toISOString()),
            validationEngine: 'legacy_enrollment_photos',
            photoId: String(first?.id || ''),
          });
        } else {
          setPrimaryProfileCapture(null);
          setBiometricStepConfirmed(false);
        }
      }
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao carregar.');
      setSessionOk(false);
      setAuthRequired(false);
    } finally {
      setLoading(false);
    }
  }, [basePath, token]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const buildResponsesJson = useCallback(() => {
    const skillsJson = skillsText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      avatarUrl: avatarUrl.trim() || null,
      addressJson: {
        line1: line1.trim() || null,
        line2: line2.trim() || null,
        district: district.trim() || null,
        city: city.trim() || null,
        state: stateUf.trim() || null,
        postalCode: postal.trim() || null,
        countryCode: country.trim() || 'BR',
      },
      personalDocuments: personalDocs.map((d) => ({
        id: d.id,
        docType: d.docType,
        identifier: d.identifier.trim() || null,
        validFrom: d.validFrom || null,
        validTo: d.validTo || null,
        issuingBody: d.issuingBody.trim() || null,
        notes: d.notes.trim() || null,
        locationIds: d.locationIds,
        attachmentUrl: d.attachmentUrl?.trim() || null,
        attachmentMimeType: d.attachmentMimeType?.trim() || null,
      })),
      technician: {
        cft: cft.trim() || null,
        specialty: specialty.trim() || null,
        score: Number(score) || 5,
        skillsJson,
        workScheduleJson: schedule,
        serviceLocationIds: serviceLocIds,
        professionalDocuments: proDocs.map((d) => ({
          id: d.id,
          docType: d.docType,
          identifier: d.identifier.trim() || null,
          validFrom: d.validFrom || null,
          validTo: d.validTo || null,
          issuingBody: d.issuingBody.trim() || null,
          notes: d.notes.trim() || null,
          locationIds: d.locationIds,
          attachmentUrl: d.attachmentUrl?.trim() || null,
          attachmentMimeType: d.attachmentMimeType?.trim() || null,
        })),
      },
      ...(primaryProfileCapture?.validatedAt
        ? {
            techRegPrimaryProfileCapture: {
              validatedAt: primaryProfileCapture.validatedAt,
              validationEngine: primaryProfileCapture.validationEngine,
              ...(primaryProfileCapture.userMessagePtBr
                ? { userMessagePtBr: primaryProfileCapture.userMessagePtBr }
                : {}),
              ...(primaryProfileCapture.photoId ? { photoId: primaryProfileCapture.photoId } : {}),
            },
          }
        : {}),
    };
  }, [
    name,
    email,
    phone,
    avatarUrl,
    primaryProfileCapture,
    line1,
    line2,
    district,
    city,
    stateUf,
    postal,
    country,
    personalDocs,
    proDocs,
    cft,
    specialty,
    score,
    skillsText,
    schedule,
    serviceLocIds,
  ]);

  const applyResponsesDocs = useCallback((responsesJson: Record<string, unknown>) => {
    const r = responsesJson && typeof responsesJson === 'object' ? responsesJson : {};
    setPersonalDocs(parseDocs((r as any).personalDocuments));
    const tech = (r as any).technician && typeof (r as any).technician === 'object' ? (r as any).technician : {};
    setProDocs(parseDocs(tech.professionalDocuments));
  }, []);

  const uploadDocAttachment = async (
    kind: 'personal' | 'professional',
    rowId: string,
    fileBase64: string,
    mimeType: string
  ) => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert('Sessão', 'Inicie sessão para anexar arquivos.');
      return;
    }
    try {
      const res = await fetch(`${basePath}/document-attachment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ kind, rowId, fileBase64, mimeType }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Anexo', data.error || 'Falha no envio.');
        return;
      }
      if (data.responsesJson) applyResponsesDocs(data.responsesJson);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha de rede.');
    }
  };

  const clearDocAttachment = async (kind: 'personal' | 'professional', rowId: string) => {
    const jwt = await getToken();
    if (!jwt) return;
    try {
      const res = await fetch(`${basePath}/document-attachment/${kind}/${encodeURIComponent(rowId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Anexo', data.error || 'Falha ao remover.');
        return;
      }
      if (data.responsesJson) applyResponsesDocs(data.responsesJson);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha de rede.');
    }
  };

  const promptDocSource = (kind: 'personal' | 'professional', rowId: string) => {
    Alert.alert('Anexar', 'Escolha a origem do arquivo.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Câmera',
        onPress: async () => {
          const cam = await ImagePicker.requestCameraPermissionsAsync();
          if (!cam.granted) {
            Alert.alert('Permissão', 'Precisamos da câmera para fotografar o documento.');
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            base64: true,
          });
          if (result.canceled) return;
          const camAsset = result.assets?.[0];
          const b64Cam = camAsset?.base64;
          if (!b64Cam) return;
          await uploadDocAttachment(kind, rowId, b64Cam, camAsset.mimeType || 'image/jpeg');
        },
      },
      {
        text: 'Galeria',
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permissão', 'Precisamos da galeria para escolher a imagem.');
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.85,
            base64: true,
          });
          if (result.canceled) return;
          const galAsset = result.assets?.[0];
          const b64Gal = galAsset?.base64;
          if (!b64Gal) return;
          await uploadDocAttachment(kind, rowId, b64Gal, galAsset.mimeType || 'image/jpeg');
        },
      },
      {
        text: 'PDF',
        onPress: async () => {
          const res = await DocumentPicker.getDocumentAsync({
            type: 'application/pdf',
            copyToCacheDirectory: true,
          });
          if (res.canceled || !res.assets?.[0]) return;
          const asset = res.assets[0];
          try {
            const b64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
            await uploadDocAttachment(kind, rowId, b64, asset.mimeType || 'application/pdf');
          } catch (e: any) {
            Alert.alert('Erro', e?.message || 'Não foi possível ler o PDF.');
          }
        },
      },
    ]);
  };

  const saveDraftSoon = useCallback(() => {
    if (!token || !sessionOk || status === 'SUBMITTED' || closed) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      try {
        const jwt = await getToken();
        if (!jwt) return;
        await fetch(`${basePath}/draft`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ responsesJson: buildResponsesJson() }),
        });
      } catch {
        /* ignore */
      }
    }, 900);
  }, [basePath, token, sessionOk, status, closed, buildResponsesJson]);

  /** Passo 1 — grava só a foto de perfil (não entra em faceEnrollmentPhotos). */
  const postProfilePhoto = async (
    fileBase64: string,
    mimeType: string,
    captureMeta: Omit<NonNullable<PrimaryProfileCapture>, 'photoId'>,
  ): Promise<{ ok: boolean; photoId?: string; url?: string; error?: string }> => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert('Sessão', 'Inicie sessão no app para enviar fotos.');
      return { ok: false, error: 'no_jwt' };
    }
    const res = await fetch(`${basePath}/profile-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({
        fileBase64,
        mimeType,
        techRegPrimaryProfileCapture: {
          validatedAt: captureMeta.validatedAt,
          validationEngine: captureMeta.validationEngine,
          ...(captureMeta.userMessagePtBr ? { userMessagePtBr: captureMeta.userMessagePtBr } : {}),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      Alert.alert('Foto de perfil', data.error || 'Falha ao gravar.');
      return { ok: false, error: data.error || 'upload_failed' };
    }
    const cap = data.techRegPrimaryProfileCapture;
    if (cap && typeof cap === 'object' && cap.photoId) {
      setPrimaryProfileCapture({
        validatedAt: String(cap.validatedAt || captureMeta.validatedAt),
        validationEngine: cap.validationEngine === 'openai_vision' ? 'openai_vision' : 'ai_llm_vision',
        userMessagePtBr: cap.userMessagePtBr ? String(cap.userMessagePtBr) : captureMeta.userMessagePtBr,
        photoId: String(cap.photoId),
      });
    }
    if (data.url) setAvatarUrl(String(data.url));
    setFacePhotos([]);
    setBiometricStepConfirmed(false);
    return { ok: true, photoId: data.techRegPrimaryProfileCapture?.photoId, url: data.url };
  };

  const postFaceB64 = async (
    fileBase64: string,
    mimeType: string
  ): Promise<{ ok: boolean; photo?: { id: string; url: string }; error?: string }> => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert('Sessão', 'Inicie sessão no app para enviar fotos.');
      return { ok: false, error: 'no_jwt' };
    }
    const res = await fetch(`${basePath}/face-enrollment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ fileBase64, mimeType }),
    });
    const data = await res.json();
    if (!res.ok) {
      const title =
        res.status === 503 || data.code === 'NO_VERIFICATION_KEY' || data.code === 'NO_VISION_INTEGRATION'
          ? 'Biometria no servidor'
          : 'Foto biométrica';
      Alert.alert(title, data.error || 'Falha no envio.');
      return { ok: false, error: data.error || 'upload_failed' };
    }
    if (Array.isArray(data.photos)) {
      setFacePhotos(data.photos.map((x: any) => ({ id: x.id, url: x.url })));
    }
    const photo = data.photo && data.photo.id && data.photo.url ? { id: data.photo.id, url: data.photo.url } : undefined;
    return { ok: true, photo };
  };

  const addFacePhotosFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão', 'Precisamos de acesso à galeria para enviar fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    for (const asset of result.assets) {
      if (!asset.base64) continue;
      const out = await postFaceB64(asset.base64, asset.mimeType || 'image/jpeg');
      if (!out.ok) break;
    }
  };

  const addFacePhotosFromCamera = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Permissão', 'Precisamos da câmera para fotografar o rosto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) return;
    await postFaceB64(asset.base64, asset.mimeType || 'image/jpeg');
  };

  /** Validação IA do passo 1: /api/me → mesmo prefixo do convite público → rota dedicada (cada 404 tenta o seguinte). */
  const fetchProfilePhotoAiValidation = useCallback(
    async (imageDataUrl: string) => {
      const body = JSON.stringify({ imageBase64: imageDataUrl });
      let res = await apiFetch('/api/me/validate-technician-profile-photo', { method: 'POST', body });
      if (res.status === 404 && token) {
        res = await apiFetch(
          `/api/technician-registration/public/${encodeURIComponent(token)}/validate-profile-photo`,
          { method: 'POST', body },
        );
      }
      if (res.status === 404) {
        res = await apiFetch('/api/ai-technician-profile-photo/validate', { method: 'POST', body });
      }
      return res;
    },
    [token],
  );

  const capturePrimaryProfileWithCamera = async () => {
    if (readOnly || primaryValidating) return;
    setPrimaryValidationError(null);
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert('Permissão', 'Precisamos da câmera para a foto de perfil do cadastro de prestador.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.88,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('Foto', 'Não foi possível ler a imagem. Tente novamente.');
      return;
    }
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${asset.base64}`;

    setPrimaryValidating(true);
    try {
      const jwt = await getToken();
      if (!jwt) {
        Alert.alert('Sessão', 'Inicie sessão para validar a foto.');
        return;
      }
      const valRes = await fetchProfilePhotoAiValidation(dataUrl);
      const valData = await valRes.json().catch(() => ({}));
      if (valRes.status === 503 && valData.code === 'NO_OPENAI_KEY') {
        setPrimaryValidationError(
          'Validação automática indisponível: o servidor não tem a API OpenAI configurada. Peça ao suporte para configurar a integração OpenAI.'
        );
        return;
      }
      if (!valRes.ok) {
        setPrimaryValidationError(String(valData.error || 'Não foi possível analisar a foto. Tente de novo.'));
        return;
      }
      if (!valData.approved) {
        const reasons = Array.isArray(valData.rejectReasonsPtBr)
          ? valData.rejectReasonsPtBr.filter(Boolean).join('\n• ')
          : '';
        const line = reasons ? `• ${reasons}` : String(valData.userMessagePtBr || 'Ajuste a foto e tente outra vez.');
        setPrimaryValidationError(line);
        return;
      }

      const validatedAt = new Date().toISOString();
      const posted = await postProfilePhoto(asset.base64, mime, {
        validatedAt,
        validationEngine: 'ai_llm_vision',
        userMessagePtBr: String(valData.userMessagePtBr || '').trim() || undefined,
      });
      if (!posted.ok || !posted.url) return;
      /* O servidor já atualizou responsesJson em POST .../profile-photo; não é preciso PATCH aqui. */
    } catch (e: any) {
      setPrimaryValidationError(e?.message || 'Erro ao processar a foto.');
    } finally {
      setPrimaryValidating(false);
    }
  };

  const pickFace = () => {
    Alert.alert('Adicionar fotos', 'Escolha a origem. Pode repetir para enviar várias fotos.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Câmera', onPress: () => void addFacePhotosFromCamera() },
      { text: 'Galeria', onPress: () => void addFacePhotosFromGallery() },
    ]);
  };

  const removeFace = async (photoId: string) => {
    const jwt = await getToken();
    if (!jwt) return;
    const wasPrimaryAi =
      isAiProfileGateEngine(primaryProfileCapture?.validationEngine) &&
      primaryProfileCapture?.photoId === photoId;
    const res = await fetch(`${basePath}/face-enrollment/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json();
    if (Array.isArray(data.photos)) {
      setFacePhotos(data.photos.map((x: any) => ({ id: x.id, url: x.url })));
    }
    if (wasPrimaryAi) {
      setPrimaryProfileCapture(null);
      setAvatarUrl('');
      try {
        const responsesJson = {
          ...buildResponsesJson(),
          techRegPrimaryProfileCapture: null,
          avatarUrl: null,
        };
        await fetch(`${basePath}/draft`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({ responsesJson }),
        });
      } catch {
        /* ignore */
      }
    }
  };

  const toggleServiceLoc = (id: string) => {
    setServiceLocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    saveDraftSoon();
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: C.cardWhite },
        head: { padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 40, borderBottomWidth: 1, borderBottomColor: C.border },
        title: { fontSize: 22, fontWeight: '800', color: C.slate },
        sub: { fontSize: 13, color: C.textSecondary, marginTop: 6 },
        warn: { marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: '#fffbeb', borderWidth: 1, borderColor: '#fcd34d' },
        warnText: { fontSize: 13, color: '#92400e' },
        section: { marginHorizontal: 16, marginTop: 20, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.border, backgroundColor: C.surfaceLow },
        secTitle: { fontSize: 15, fontWeight: '800', color: C.slate, marginBottom: 12 },
        label: { fontSize: 12, color: C.textSecondary, marginBottom: 4 },
        fieldHint: {
          fontSize: 11,
          color: C.textLight,
          marginTop: -4,
          marginBottom: 10,
          lineHeight: 16,
          fontWeight: '500',
        },
        input: {
          borderWidth: 1,
          borderColor: C.border,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 15,
          color: C.slate,
          marginBottom: 10,
          backgroundColor: C.cardWhite,
        },
        row2: { flexDirection: 'row', gap: 10 },
        flex1: { flex: 1 },
        chip: {
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 20,
          borderWidth: 1,
          margin: 4,
        },
        faceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
        faceImg: { width: 88, height: 110, borderRadius: 10 },
        btn: {
          backgroundColor: C.accent,
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: 'center',
          marginHorizontal: 16,
          marginTop: 24,
          marginBottom: 40,
        },
        btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
        dayRow: { marginBottom: 10 },
        primaryIntro: { fontSize: 13, color: C.textSecondary, lineHeight: 21, marginBottom: 14 },
        primaryError: {
          marginTop: 12,
          padding: 12,
          borderRadius: 10,
          backgroundColor: '#fef2f2',
          borderWidth: 1,
          borderColor: '#fecaca',
        },
        primaryErrorText: { fontSize: 13, color: '#b91c1c', lineHeight: 20 },
        infoCallout: {
          marginTop: 8,
          padding: 12,
          borderRadius: 10,
          backgroundColor: C.surfaceLow,
          borderWidth: 1,
          borderColor: C.border,
        },
        infoCalloutText: { fontSize: 12, color: C.textSecondary, lineHeight: 18 },
      }),
    [C]
  );

  const submit = async () => {
    if (password.length < 6) {
      Alert.alert('Senha', 'Informe a senha da sua conta BrSpark (mínimo 6 caracteres) para confirmar o envio.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Validação', 'Informe o nome.');
      return;
    }
    if (facePhotos.length < MIN_FACE_ENROLLMENT_PHOTOS) {
      Alert.alert(
        'Fotos biométricas',
        `Envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS} fotos nítidas do rosto para o enrolamento do tenant (ex. CompreFace). Atualmente: ${facePhotos.length}.`
      );
      return;
    }
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert('Sessão', 'Inicie sessão no app para submeter a candidatura.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${basePath}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          password,
          responsesJson: buildResponsesJson(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert('Envio', data.error || 'Falha.');
        return;
      }
      Alert.alert('Enviado', 'Sua candidatura foi enviada. Aguarde a análise da equipe.', [
        {
          text: 'OK',
          onPress: () =>
            user
              ? router.replace('/profile' as any)
              : router.replace('/auth/login' as any),
        },
      ]);
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha de rede.');
    } finally {
      setSaving(false);
    }
  };

  /** Só bloqueia edição enquanto aguarda análise; em NEEDS_REVISION volta a editar. */
  const readOnly = status === 'SUBMITTED';
  const isCompanyInvite = registrationSource === 'panel_invite';

  if (!token) {
    return (
      <View style={[styles.root, { justifyContent: 'center', padding: 24 }]}>
        <Text style={{ color: C.slate, fontSize: 17, fontWeight: '800', textAlign: 'center' }}>
          Link incompleto
        </Text>
        <Text style={{ color: C.textSecondary, textAlign: 'center', marginTop: 12, lineHeight: 22 }}>
          Falta o identificador do formulário na URL.{'\n\n'}
          • Se você pediu cadastro no app: abra o perfil, toque em «Quero ser um Prestador» ou «Continuar cadastro de prestador».{'\n\n'}
          • Se uma empresa lhe enviou convite: abra o link do e-mail ou mensagem (ou peça o link ao gestor).
        </Text>
        <TouchableOpacity style={[styles.btn, { marginTop: 20 }]} onPress={() => router.back()}>
          <Text style={styles.btnText}>Voltar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.root, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={C.accent} />
      </View>
    );
  }

  if (authRequired) {
    const inv = invitedEmailHint.trim().toLowerCase();
    const sessionEmail = (user?.email || '').trim().toLowerCase();
    const wrongSession = !!user && !!inv && sessionEmail !== inv;
    return (
      <View style={[styles.root, { paddingBottom: 32 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>{isCompanyInvite ? 'Convite de prestador' : 'Cadastro de prestador'}</Text>
          <Text style={styles.sub}>
            {isCompanyInvite
              ? tenantName
                ? `Empresa convidante: ${tenantName}`
                : 'Inicie sessão no app com o e-mail do convite.'
              : tenantName
                ? `Organização da sua conta: ${tenantName}`
                : 'Inicie sessão com a mesma conta BrSpark em que pediu ser prestador.'}
          </Text>
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              {isCompanyInvite ? (
                <>
                  O convite foi enviado para{' '}
                  <Text style={{ fontWeight: '800' }}>{invitedEmailHint || 'o e-mail indicado pelo gestor'}</Text>.
                  {'\n\n'}
                  A conta BrSpark com esse e-mail deve existir antes de aceitar o convite (use «Criar conta» no login,
                  se ainda não tiver).
                </>
              ) : (
                <>
                  Este formulário está associado ao e-mail{' '}
                  <Text style={{ fontWeight: '800' }}>{invitedEmailHint || 'da sua conta'}</Text>.
                  {'\n\n'}
                  Você iniciou o cadastro pelo perfil (sem convite de empresa). Entre com essa conta para continuar a
                  preencher e enviar.
                </>
              )}
            </Text>
          </View>
        </View>
        {wrongSession ? (
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ fontSize: 14, color: C.textSecondary, lineHeight: 22, marginBottom: 16 }}>
              Está ligado como <Text style={{ fontWeight: '800' }}>{user?.email}</Text>, mas este cadastro é para outro
              e-mail.
            </Text>
            <TouchableOpacity
              style={styles.btn}
              onPress={async () => {
                await logout();
                router.push({ pathname: '/auth/login', params: { techRegToken: token } } as any);
              }}
            >
              <Text style={styles.btnText}>
                Sair e entrar com o e-mail {isCompanyInvite ? 'do convite' : 'correto'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 24 }}>
            <TouchableOpacity
              style={styles.btn}
              onPress={() => router.push({ pathname: '/auth/login', params: { techRegToken: token } } as any)}
            >
              <Text style={styles.btnText}>Entrar no BrSpark</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  if (closed) {
    return (
      <View style={[styles.root, { padding: 24, justifyContent: 'center' }]}>
        <Text style={[styles.title, { textAlign: 'center' }]}>Candidatura {closed.status === 'APPROVED' ? 'aprovada' : 'encerrada'}</Text>
        <Text style={[styles.sub, { textAlign: 'center', marginTop: 12 }]}>
          {closed.tenantName ? `Conta: ${closed.tenantName}` : ''}
        </Text>
        <TouchableOpacity style={styles.btn} onPress={() => router.replace('/auth/login' as any)}>
          <Text style={styles.btnText}>Ir para o login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const primaryStepDone = readOnly || !!primaryProfileCapture?.validatedAt;
  const useSplitBiometricStep =
    !readOnly && isAiProfileGateEngine(primaryProfileCapture?.validationEngine);

  if (!primaryStepDone) {
    return (
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="chevron-back" size={22} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '700' }}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Passo 1 — Foto de perfil</Text>
          <Text style={styles.sub}>Etapa obrigatória antes da biometria CompreFace e do formulário.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.secTitle}>Finalidade e conferência</Text>
          <Text style={styles.primaryIntro}>
            A imagem integra o seu perfil de técnico; o solicitante poderá reconhecê-lo no local. A conferência aqui é
            feita por análise automática (IA — OpenAI no servidor; não usa o motor CompreFace das ordens de serviço).
            Exige-se um rosto humano claramente identificável, sem conteúdo impróprio. Não é necessária iluminação de
            estúdio: ambiente comum com rosto visível costuma bastar.
          </Text>
          <View style={[styles.warn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Text style={[styles.warnText, { color: '#1e40af' }]}>
              Utilize somente a câmera (a galeria não é aceita nesta etapa). Prefira enquadramento frontal e luz
              suficiente para ver o rosto. Óculos de grau são permitidos; evite óculos de sol escuros, máscara em
              boca/nariz ou acessórios que cubram testa e olhos.
            </Text>
          </View>
          {primaryValidating ? (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ marginTop: 12, color: C.textSecondary, fontSize: 13 }}>Validando a imagem…</Text>
            </View>
          ) : (
            <TouchableOpacity style={[styles.btn, { marginHorizontal: 0, marginTop: 16 }]} onPress={capturePrimaryProfileWithCamera}>
              <Text style={styles.btnText}>Tirar foto</Text>
            </TouchableOpacity>
          )}
          {primaryValidationError ? (
            <View style={styles.primaryError}>
              <Text style={styles.primaryErrorText}>{primaryValidationError}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  if (primaryStepDone && useSplitBiometricStep && !biometricStepConfirmed) {
    return (
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="chevron-back" size={22} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '700' }}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Passo 2 — Biometria do tenant</Text>
          <Text style={styles.sub}>
            Envie pelo menos {MIN_FACE_ENROLLMENT_PHOTOS} fotos do mesmo rosto da foto de perfil (passo 1). Cada imagem é
            validada no CompreFace (serviço Verification) contra a foto de perfil antes de ser guardada.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.secTitle}>Fotos para o reconhecimento facial</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18, marginBottom: 10 }}>
            Use ângulos ligeiramente diferentes (câmera ou galeria). O servidor precisa da API Key do serviço{' '}
            <Text style={{ fontWeight: '700' }}>Verification</Text> do CompreFace configurada em Integrações. Máximo de{' '}
            {12} imagens, 5 MB cada.
          </Text>
          <TouchableOpacity style={[styles.btn, { marginHorizontal: 0, marginTop: 4 }]} onPress={pickFace}>
            <Text style={styles.btnText}>Adicionar fotos</Text>
          </TouchableOpacity>
          <View style={styles.faceRow}>
            {facePhotos.map((p) => (
              <View key={p.id}>
                <Image source={{ uri: publicUrl(p.url) }} style={styles.faceImg} />
                <TouchableOpacity onPress={() => removeFace(p.id)} style={{ marginTop: 4 }}>
                  <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>Remover</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {facePhotos.length >= MIN_FACE_ENROLLMENT_PHOTOS ? (
            <TouchableOpacity
              style={[styles.btn, { marginHorizontal: 0, marginTop: 20 }]}
              onPress={() => setBiometricStepConfirmed(true)}
            >
              <Text style={styles.btnText}>Continuar para o formulário</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.fieldHint, { marginTop: 16 }]}>
              Faltam {Math.max(0, MIN_FACE_ENROLLMENT_PHOTOS - facePhotos.length)} foto(s) para continuar.
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} keyboardShouldPersistTaps="handled">
      <View style={styles.head}>
        <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Ionicons name="chevron-back" size={22} color={C.accent} />
          <Text style={{ color: C.accent, fontWeight: '700' }}>Voltar</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Cadastro de prestador</Text>
        {isCompanyInvite ? (
          <>
            <Text style={styles.sub}>
              {tenantName ? `Convidado pela organização: ${tenantName}` : 'Cadastro ligado a uma organização na BrSpark'}
            </Text>
            <View style={styles.infoCallout}>
              <Text style={styles.infoCalloutText}>
                <Text style={{ fontWeight: '800', color: C.slate }}>Com convite: </Text>
                O nome acima é a <Text style={{ fontWeight: '700' }}>empresa ou conta organizadora</Text> que criou o
                convite no painel. O e-mail fixo abaixo é o que o gestor associou ao convite — tem de ser o mesmo da
                sua conta BrSpark.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.sub}>
              {tenantName ? `Sua organização na plataforma: ${tenantName}` : 'Cadastro iniciado por você no app'}
            </Text>
            <View style={styles.infoCallout}>
              <Text style={styles.infoCalloutText}>
                <Text style={{ fontWeight: '800', color: C.slate }}>Sem convite por e-mail: </Text>
                Você pediu para ser prestador no perfil. Não há gestor de outra empresa a convidá-lo: o e-mail fixo é só
                o da <Text style={{ fontWeight: '700' }}>sua sessão</Text>, para bater com a candidatura.
              </Text>
            </View>
          </>
        )}
        {revisionNote ? (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              <Text style={{ fontWeight: '800' }}>Pedido de ajustes: </Text>
              {revisionNote}
            </Text>
          </View>
        ) : null}
        {readOnly ? (
          <View style={[styles.warn, { backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }]}>
            <Text style={[styles.warnText, { color: '#1e40af' }]}>Enviado — aguarde a análise. Não é possível editar agora.</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Dados pessoais</Text>
        <Text style={styles.label}>Nome completo *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={(t) => {
            setName(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          placeholder="Nome"
        />
        <Text style={styles.label}>{isCompanyInvite ? 'E-mail do convite' : 'E-mail da conta'}</Text>
        <TextInput style={[styles.input, { opacity: 0.85 }]} value={email} editable={false} />
        <Text style={styles.fieldHint}>
          {isCompanyInvite
            ? 'Fixo: deve coincidir com o e-mail indicado pela empresa e com o login BrSpark.'
            : 'Fixo: é o e-mail com que você entrou no app; usamos para validar a candidatura.'}
        </Text>
        <Text style={styles.label}>Telefone ou WhatsApp</Text>
        <TextInput
          style={styles.input}
          value={phone}
          onChangeText={(t) => {
            setPhone(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          placeholder="Ex.: +55 11 99999-0000"
          keyboardType="phone-pad"
        />
        <Text style={styles.fieldHint}>Opcional neste passo — ajuda a equipe ou clientes a contatá-lo.</Text>
        {isAiProfileGateEngine(primaryProfileCapture?.validationEngine) ? (
          <Text style={styles.fieldHint}>
            Foto de perfil: passo 1 (IA). Fotos CompreFace validadas contra essa foto: passo 2 — já concluídos se você
            chegou a este formulário.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Foto de perfil por link (opcional)</Text>
            <TextInput
              style={styles.input}
              value={avatarUrl}
              onChangeText={(t) => {
                setAvatarUrl(t);
                saveDraftSoon();
              }}
              editable={!readOnly}
              placeholder="https://…"
              autoCapitalize="none"
            />
            <Text style={styles.fieldHint}>
              Só use se tiver URL pública. Quem entrou pelo passo 1 com câmera não precisa disto.
            </Text>
          </>
        )}
      </View>

      {!useSplitBiometricStep || readOnly ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>Fotos para biometria do tenant</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
            {isAiProfileGateEngine(primaryProfileCapture?.validationEngine)
              ? `Fluxo antigo ou revisão: inclua pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS} fotos nítidas do rosto (câmera ou galeria). Máx. 12 imagens, 5 MB cada.`
              : `Para o motor de reconhecimento facial das ordens de serviço (ex. CompreFace), envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS} fotos nítidas do rosto (JPEG/PNG/WebP). Até 12 imagens, máx. 5 MB cada. Use a câmera ou a galeria.`}
          </Text>
          {!readOnly ? (
            <TouchableOpacity style={[styles.btn, { marginHorizontal: 0, marginTop: 12 }]} onPress={pickFace}>
              <Text style={styles.btnText}>Adicionar fotos</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.faceRow}>
            {facePhotos.map((p) => (
              <View key={p.id}>
                <Image source={{ uri: publicUrl(p.url) }} style={styles.faceImg} />
                {!readOnly ? (
                  <TouchableOpacity onPress={() => removeFace(p.id)} style={{ marginTop: 4 }}>
                    <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>Remover</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.secTitle}>Endereço</Text>
        {(
          [
            ['Linha 1 (rua, nº)', line1, setLine1],
            ['Complemento', line2, setLine2],
            ['Bairro', district, setDistrict],
            ['Cidade', city, setCity],
            ['UF', stateUf, setStateUf],
            ['CEP', postal, setPostal],
          ] as [string, string, (v: string) => void][]
        ).map(([lab, val, setVal]) => (
          <View key={lab}>
            <Text style={styles.label}>{lab}</Text>
            <TextInput
              style={styles.input}
              value={val}
              onChangeText={(t) => {
                setVal(t);
                saveDraftSoon();
              }}
              editable={!readOnly}
            />
          </View>
        ))}
        <Text style={styles.label}>País (ISO)</Text>
        <TextInput
          style={styles.input}
          value={country}
          onChangeText={(t) => {
            setCountry(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          maxLength={2}
          autoCapitalize="characters"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Tipo de acesso</Text>
        <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20 }}>
          {isCompanyInvite ? (
            <>
              Após aprovação do gestor da empresa, a sua conta passa a atuar como{' '}
              <Text style={{ fontWeight: '800' }}>Prestador</Text> nessa organização, com sessão no app BrSpark.
            </>
          ) : (
            <>
              Após a análise e aprovação da equipe BrSpark, o modo{' '}
              <Text style={{ fontWeight: '800' }}>Prestador</Text> será habilitado na organização da sua conta, para
              receber ordens de serviço conforme as regras da plataforma.
            </>
          )}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Prestador</Text>
        <Text style={styles.label}>CFT / registro profissional</Text>
        <TextInput
          style={styles.input}
          value={cft}
          onChangeText={(t) => {
            setCft(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
        />
        <Text style={styles.label}>Especialidade principal</Text>
        <TextInput
          style={styles.input}
          value={specialty}
          onChangeText={(t) => {
            setSpecialty(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
        />
        <Text style={styles.label}>Score interno (0–10)</Text>
        <TextInput
          style={styles.input}
          value={score}
          onChangeText={(t) => {
            setScore(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          keyboardType="decimal-pad"
        />
        <Text style={styles.label}>Habilidades (separadas por vírgula)</Text>
        <TextInput
          style={styles.input}
          value={skillsText}
          onChangeText={(t) => {
            setSkillsText(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          placeholder="Ar condicionado, Elétrica…"
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Docs. pessoais</Text>
        {!readOnly ? (
          <TouchableOpacity
            onPress={() =>
              setPersonalDocs((d) => [...d, { id: rid(), docType: 'CPF', identifier: '', validFrom: '', validTo: '', issuingBody: '', notes: '', locationIds: [] }])
            }
          >
            <Text style={{ color: C.accent, fontWeight: '700' }}>+ Adicionar linha</Text>
          </TouchableOpacity>
        ) : null}
        {personalDocs.map((d, idx) => (
          <View key={d.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>Documento {idx + 1}</Text>
            <Text style={styles.label}>Tipo</Text>
            <TextInput style={styles.input} value={d.docType} editable={!readOnly} onChangeText={(t) => {
              const n = [...personalDocs];
              n[idx] = { ...d, docType: t };
              setPersonalDocs(n);
              saveDraftSoon();
            }} />
            <Text style={styles.label}>Número / identificador</Text>
            <TextInput style={styles.input} value={d.identifier} editable={!readOnly} onChangeText={(t) => {
              const n = [...personalDocs];
              n[idx] = { ...d, identifier: t };
              setPersonalDocs(n);
              saveDraftSoon();
            }} />
            <Text style={styles.label}>Órgão emissor</Text>
            <TextInput style={styles.input} value={d.issuingBody} editable={!readOnly} onChangeText={(t) => {
              const n = [...personalDocs];
              n[idx] = { ...d, issuingBody: t };
              setPersonalDocs(n);
              saveDraftSoon();
            }} />
            {d.attachmentUrl ? (
              <View style={{ marginTop: 10 }}>
                {String(d.attachmentMimeType || '').toLowerCase().includes('pdf') ||
                String(d.attachmentUrl).toLowerCase().endsWith('.pdf') ? (
                  <Text style={{ fontSize: 13, color: C.slate, fontWeight: '600' }}>PDF anexado</Text>
                ) : (
                  <Image
                    source={{ uri: publicUrl(d.attachmentUrl) }}
                    style={{ width: '100%', height: 160, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                )}
              </View>
            ) : null}
            {!readOnly ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                <TouchableOpacity onPress={() => promptDocSource('personal', d.id)}>
                  <Text style={{ color: C.accent, fontWeight: '700' }}>
                    {d.attachmentUrl ? 'Trocar anexo' : 'Anexar (câmera, galeria ou PDF)'}
                  </Text>
                </TouchableOpacity>
                {d.attachmentUrl ? (
                  <TouchableOpacity onPress={() => void clearDocAttachment('personal', d.id)}>
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>Remover anexo</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {!readOnly ? (
              <TouchableOpacity
                onPress={async () => {
                  const row = personalDocs[idx];
                  if (row.attachmentUrl) await clearDocAttachment('personal', row.id);
                  setPersonalDocs((x) => x.filter((r) => r.id !== row.id));
                  saveDraftSoon();
                }}
              >
                <Text style={{ color: '#dc2626', marginTop: 6 }}>Remover linha</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Docs. profissionais</Text>
        {!readOnly ? (
          <TouchableOpacity
            onPress={() =>
              setProDocs((d) => [...d, { id: rid(), docType: 'Outro', identifier: '', validFrom: '', validTo: '', issuingBody: '', notes: '', locationIds: [] }])
            }
          >
            <Text style={{ color: C.accent, fontWeight: '700' }}>+ Adicionar linha</Text>
          </TouchableOpacity>
        ) : null}
        {proDocs.map((d, idx) => (
          <View key={d.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>Documento {idx + 1}</Text>
            <Text style={styles.label}>Tipo</Text>
            <TextInput style={styles.input} value={d.docType} editable={!readOnly} onChangeText={(t) => {
              const n = [...proDocs];
              n[idx] = { ...d, docType: t };
              setProDocs(n);
              saveDraftSoon();
            }} />
            <Text style={styles.label}>Número / identificador</Text>
            <TextInput style={styles.input} value={d.identifier} editable={!readOnly} onChangeText={(t) => {
              const n = [...proDocs];
              n[idx] = { ...d, identifier: t };
              setProDocs(n);
              saveDraftSoon();
            }} />
            {d.attachmentUrl ? (
              <View style={{ marginTop: 10 }}>
                {String(d.attachmentMimeType || '').toLowerCase().includes('pdf') ||
                String(d.attachmentUrl).toLowerCase().endsWith('.pdf') ? (
                  <Text style={{ fontSize: 13, color: C.slate, fontWeight: '600' }}>PDF anexado</Text>
                ) : (
                  <Image
                    source={{ uri: publicUrl(d.attachmentUrl) }}
                    style={{ width: '100%', height: 160, borderRadius: 8 }}
                    resizeMode="cover"
                  />
                )}
              </View>
            ) : null}
            {!readOnly ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
                <TouchableOpacity onPress={() => promptDocSource('professional', d.id)}>
                  <Text style={{ color: C.accent, fontWeight: '700' }}>
                    {d.attachmentUrl ? 'Trocar anexo' : 'Anexar (câmera, galeria ou PDF)'}
                  </Text>
                </TouchableOpacity>
                {d.attachmentUrl ? (
                  <TouchableOpacity onPress={() => void clearDocAttachment('professional', d.id)}>
                    <Text style={{ color: '#dc2626', fontWeight: '700' }}>Remover anexo</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {!readOnly ? (
              <TouchableOpacity
                onPress={async () => {
                  const row = proDocs[idx];
                  if (row.attachmentUrl) await clearDocAttachment('professional', row.id);
                  setProDocs((x) => x.filter((r) => r.id !== row.id));
                  saveDraftSoon();
                }}
              >
                <Text style={{ color: '#dc2626', marginTop: 6 }}>Remover linha</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Horários</Text>
        {DAYS.map(({ key, label }) => {
          const slot = schedule[key]?.[0] || { enabled: false, start: '08:00', end: '18:00' };
          return (
            <View key={key} style={styles.dayRow}>
              <Text style={{ fontWeight: '700', color: C.slate, marginBottom: 6 }}>{label}</Text>
              <TouchableOpacity
                disabled={readOnly}
                onPress={() => {
                  const n = { ...schedule };
                  n[key] = [{ ...slot, enabled: !slot.enabled }];
                  setSchedule(n);
                  saveDraftSoon();
                }}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
              >
                <Ionicons name={slot.enabled ? 'checkbox' : 'square-outline'} size={22} color={C.accent} />
                <Text style={{ marginLeft: 8, color: C.textSecondary }}>Ativo neste dia</Text>
              </TouchableOpacity>
              <View style={styles.row2}>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Início</Text>
                  <TextInput
                    style={styles.input}
                    value={slot.start}
                    editable={!readOnly}
                    onChangeText={(t) => {
                      const n = { ...schedule };
                      n[key] = [{ ...slot, start: t }];
                      setSchedule(n);
                      saveDraftSoon();
                    }}
                    placeholder="08:00"
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.label}>Fim</Text>
                  <TextInput
                    style={styles.input}
                    value={slot.end}
                    editable={!readOnly}
                    onChangeText={(t) => {
                      const n = { ...schedule };
                      n[key] = [{ ...slot, end: t }];
                      setSchedule(n);
                      saveDraftSoon();
                    }}
                    placeholder="18:00"
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Regiões atendidas</Text>
        <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8 }}>Toque para selecionar as bases onde pode atuar.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {locations.map((loc) => {
            const on = serviceLocIds.includes(loc.id);
            return (
              <TouchableOpacity
                key={loc.id}
                disabled={readOnly}
                onPress={() => toggleServiceLoc(loc.id)}
                style={[
                  styles.chip,
                  { borderColor: on ? C.accent : C.border, backgroundColor: on ? `${C.accent}18` : C.cardWhite },
                ]}
              >
                <Text style={{ fontSize: 12, fontWeight: '700', color: C.slate }}>{loc.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!readOnly ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>Confirmação de segurança</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 10, lineHeight: 18 }}>
            Para submeter, confirme a senha da sua conta BrSpark (a mesma que usa no login).
          </Text>
          <Text style={styles.label}>Senha da conta *</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Mínimo 6 caracteres"
            autoCapitalize="none"
          />
        </View>
      ) : null}

      {!readOnly ? (
        <TouchableOpacity style={styles.btn} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submeter candidatura</Text>}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}
