/**
 * Cadastro de prestador (token) — convite enviado por uma empresa (painel) ou inscrição pelo app (perfil).
 * Rota: /auth/tech-registration?token=...
 *
 * Passo 1: foto de perfil (IA). Passo 2: ≥2 fotos biométricas validadas no servidor contra a foto de perfil.
 * Ordem de validação IA: `/api/me/validate-technician-profile-photo` → `/api/technician-registration/public/:token/validate-profile-photo` → `/api/ai-technician-profile-photo/validate` (404 em cada passo tenta o próximo).
 * Isto é independente da biometria operacional dos checklists.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Modal,
  Switch,
  KeyboardAvoidingView,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/theme/ThemeContext';
import { API_BASE, getToken, apiFetch, isTechnicianProfileActive } from '../../src/services/auth';
import {
  rid,
  defaultSchedule,
  parseScheduleFromProfileJson,
  findFirstInvalidEnabledTime,
  isValidHhMm,
} from '../../src/lib/technicianScheduleForm';
import { useAuth } from '../../src/hooks/useAuth';
import i18n from '../../src/i18n';
import DatePickerButton from '../../src/components/DatePickerButton';

/** Mínimo de fotos para o reconhecimento facial do tenant — secção à parte do passo 1 (IA). */
const MIN_FACE_ENROLLMENT_PHOTOS = 2;

function sanitizeBiometryUserText(text: string): string {
  return String(text || '')
    .replace(/\bcompreface\b/gi, 'serviço de biometria')
    .replace(/\bexadel\b/gi, '')
    .replace(/\*{1,2}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Evita mostrar JSON, códigos HTTP ou respostas brutas da API ao utilizador. */
function looksLikeTechnicalBiometryMessage(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (!t) return false;
  return (
    /\bhttp\s*\d{3}\b/.test(t) ||
    t.includes('{"message"') ||
    t.includes('"code"') ||
    t.includes('"message"') ||
    t.includes('verification http') ||
    t.includes('api/v1/') ||
    t.includes('serviço de biometria verification') ||
    /\bcode\s*[:=]\s*\d+/.test(t)
  );
}

/** Títulos e textos ao utilizador sem citar fornecedores de biometria. */
function userFacingFaceEnrollmentError(
  httpStatus: number,
  code: string | undefined,
  rawMessage: string | undefined
): { title: string; message: string } {
  const F = (k: string) => ({
    title: i18n.t(`appAlerts.techBio.face.${k}.title`),
    message: i18n.t(`appAlerts.techBio.face.${k}.message`),
  });
  const c = String(code || '');
  if (c === 'NO_VISION_INTEGRATION') return F('NO_VISION_INTEGRATION');
  if (c === 'NO_VERIFICATION_KEY') return F('NO_VERIFICATION_KEY');
  if (c === 'UNSUPPORTED_ENGINE') return F('UNSUPPORTED_ENGINE');
  if (c === 'FACE_MISMATCH') return F('FACE_MISMATCH');
  if (c === 'VERIFY_NO_SCORE' || c === 'INVALID_IMAGE') return F('VERIFY_OR_INVALID_IMAGE');
  if (c === 'NO_FACE_DETECTED') return F('NO_FACE_DETECTED');
  if (c === 'MULTIPLE_FACES') return F('MULTIPLE_FACES');
  if (c === 'FACE_TOO_SMALL') return F('FACE_TOO_SMALL');
  if (c === 'LOW_QUALITY_FACE') return F('LOW_QUALITY_FACE');
  if (c === 'BIOMETRY_TIMEOUT') return F('BIOMETRY_TIMEOUT');
  if (c === 'TECH_IDENTITY_LOCKED') return F('TECH_IDENTITY_LOCKED');
  if (
    c === 'SERVER_ERROR' ||
    c === 'BIOMETRY_SERVICE_ERROR' ||
    c === 'COMPREFACE_ERROR' ||
    httpStatus >= 500
  ) {
    return F('SERVICE_BUSY');
  }
  if (c === 'PROFILE_REQUIRED') {
    const fb = F('PROFILE_REQUIRED');
    return {
      title: fb.title,
      message: sanitizeBiometryUserText(String(rawMessage || '')) || fb.message,
    };
  }
  const sanitized = sanitizeBiometryUserText(String(rawMessage || ''));
  if (sanitized) {
    if (looksLikeTechnicalBiometryMessage(sanitized)) {
      return F('PHOTO_REJECTED_GENERIC');
    }
    return {
      title: i18n.t('appAlerts.techBio.face.UPLOAD_FAILED_TITLE.title'),
      message: sanitized,
    };
  }
  return F('UPLOAD_NETWORK');
}

function userFacingIdDocumentError(
  httpStatus: number,
  code: string | undefined,
  rawMessage: string | undefined
): { title: string; message: string } {
  const D = (k: string) => ({
    title: i18n.t(`appAlerts.techBio.idDoc.${k}.title`),
    message: i18n.t(`appAlerts.techBio.idDoc.${k}.message`),
  });
  const c = String(code || '');
  if (c === 'TECH_IDENTITY_LOCKED') return D('TECH_IDENTITY_LOCKED');
  if (c === 'ID_DOC_IMAGE_REQUIRED') return D('ID_DOC_IMAGE_REQUIRED');
  if (c === 'FACE_STEP_REQUIRED') return D('FACE_STEP_REQUIRED');
  if (c === 'ID_DOC_FLOW_MISMATCH') return D('ID_DOC_FLOW_MISMATCH');
  if (c === 'NO_OPENAI_KEY') {
    const sanitized = sanitizeBiometryUserText(String(rawMessage || ''));
    const fb = D('NO_OPENAI_DEFAULT');
    if (sanitized) return { title: fb.title, message: sanitized };
    return fb;
  }
  if (c === 'FACE_VERIFY_FAILED') {
    const fb = D('FACE_VERIFY_FAILED');
    return {
      title: fb.title,
      message: sanitizeBiometryUserText(String(rawMessage || '')) || fb.message,
    };
  }
  if (c === 'OCR_FAILED' || c === 'SERVER_ERROR') {
    const fb = D('OCR_OR_SERVER');
    return {
      title: fb.title,
      message: sanitizeBiometryUserText(String(rawMessage || '')) || fb.message,
    };
  }

  const idDocVerifyCodes = new Set([
    'FACE_MISMATCH',
    'VERIFY_NO_SCORE',
    'NO_FACE_DETECTED',
    'MULTIPLE_FACES',
    'FACE_TOO_SMALL',
    'LOW_QUALITY_FACE',
    'INVALID_IMAGE',
  ]);
  if (idDocVerifyCodes.has(c)) {
    const fb = D(c);
    const sanitized = sanitizeBiometryUserText(String(rawMessage || ''));
    if (sanitized && !looksLikeTechnicalBiometryMessage(sanitized)) {
      return { title: fb.title, message: sanitized };
    }
    return fb;
  }

  if (httpStatus >= 500) {
    const fb = D('DOC_COMPARE_5XX');
    const sanitized = sanitizeBiometryUserText(String(rawMessage || ''));
    return {
      title: fb.title,
      message:
        sanitized && !looksLikeTechnicalBiometryMessage(sanitized) ? sanitized : fb.message,
    };
  }

  return userFacingFaceEnrollmentError(httpStatus, code, rawMessage);
}

function isAiProfileGateEngine(e: string | undefined): boolean {
  return e === 'ai_llm_vision' || e === 'openai_vision';
}

/** No fluxo IA, a foto de perfil (passo 1) nunca deve aparecer na lista do passo 2. */
function enrollmentPhotosWithoutProfile(
  rows: { id: string; url: string }[],
  profilePhotoId: string | undefined,
  profileAvatarUrl: string,
  isAiFlow: boolean,
): { id: string; url: string }[] {
  if (!isAiFlow) return rows;
  const pid = String(profilePhotoId || '').trim();
  const av = String(profileAvatarUrl || '').trim();
  return rows.filter((p) => {
    const id = String(p.id || '');
    const url = String(p.url || '').trim();
    if (id.startsWith('tp_')) return false;
    if (pid && id === pid) return false;
    if (av && url === av) return false;
    return true;
  });
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

type Loc = {
  id: string;
  name: string;
  type: string;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
};

type ServiceCoverageGeo = {
  homeBase: {
    latitude: number;
    longitude: number;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
  } | null;
  radiusKm: number | null;
  notes?: string | null;
} | null;

function formatBrCepInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

type TechRegIdDocumentPayload = {
  attachmentUrl?: string;
  mimeType?: string;
  faceVerifiedAt?: string;
  ocrAt?: string;
  ocrProvider?: string;
  extracted?: {
    docType?: string;
    documentNumber?: string;
    issueDate?: string | null;
    expiryDate?: string | null;
    issuingBody?: string;
    fullName?: string;
    birthDate?: string | null;
  };
};

/** Metadados da foto inicial (câmera + IA); ou rascunho antigo com ≥2 fotos (legacy). */
type PrimaryProfileCapture = {
  validatedAt: string;
  /** Gate do passo 1: só IA (OpenAI hoje). `openai_vision` = legado gravado antes da renomeação. */
  validationEngine: 'ai_llm_vision' | 'openai_vision' | 'legacy_enrollment_photos';
  userMessagePtBr?: string;
  photoId?: string;
} | null;

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
  const { user, logout, patchUser } = useAuth();
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
  const [timeTouchByDay, setTimeTouchByDay] = useState<Record<string, { s?: boolean; e?: boolean }>>({});
  const [showAllTimeErrors, setShowAllTimeErrors] = useState(false);
  const [serviceLocIds, setServiceLocIds] = useState<string[]>([]);
  const [serviceCoverageRadiusKm, setServiceCoverageRadiusKm] = useState('50');
  const [serviceCoverageNotes, setServiceCoverageNotes] = useState('');
  const [coverageCenter, setCoverageCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  const [facePhotos, setFacePhotos] = useState<{ id: string; url: string }[]>([]);
  const [primaryProfileCapture, setPrimaryProfileCapture] = useState<PrimaryProfileCapture>(null);
  const [primaryValidating, setPrimaryValidating] = useState(false);
  const [primaryValidationError, setPrimaryValidationError] = useState<string | null>(null);
  /** Passo 2 (só fluxo IA): utilizador confirmou seguir para o formulário após ≥2 fotos biométricas. */
  const [biometricStepConfirmed, setBiometricStepConfirmed] = useState(false);
  const [faceEnrollmentSubmitting, setFaceEnrollmentSubmitting] = useState(false);
  const [idDocumentSubmitting, setIdDocumentSubmitting] = useState(false);
  /** Passo 3: documento com foto validado + OCR (só fluxo IA). */
  const [techRegIdDocument, setTechRegIdDocument] = useState<TechRegIdDocumentPayload | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [fetchingCep, setFetchingCep] = useState(false);
  const [regionMapVisible, setRegionMapVisible] = useState(false);
  const [mapOpenLoading, setMapOpenLoading] = useState(false);
  const [mapInitialRegion, setMapInitialRegion] = useState<{
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  } | null>(null);

  const [securityModalVisible, setSecurityModalVisible] = useState(false);
  const [submitOtpCode, setSubmitOtpCode] = useState('');
  const [submitOtpChallengeToken, setSubmitOtpChallengeToken] = useState<string | null>(null);

  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const identityLockNavRef = useRef(false);

  /** Prestador já ACTIVE não deve usar o fluxo de candidatura para mudar foto ou biometria. */
  useEffect(() => {
    if (!token || !user || !isTechnicianProfileActive(user)) return;
    if (identityLockNavRef.current) return;
    identityLockNavRef.current = true;
    Alert.alert(
      i18n.t('appAlerts.techReg.identityLockedNavTitle'),
      i18n.t('appAlerts.techReg.identityLockedNavBody'),
      [{ text: i18n.t('common.ok'), onPress: () => router.back() }]
    );
  }, [token, user, router]);

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
        Alert.alert(
          i18n.t('common.error'),
          data.error || i18n.t('appAlerts.techReg.invalidInvite')
        );
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
      setBirthDate(String((r as { birthDate?: string }).birthDate || '').slice(0, 10));
      const idc = (r as { techRegIdDocument?: TechRegIdDocumentPayload }).techRegIdDocument;
      setTechRegIdDocument(idc && typeof idc === 'object' ? idc : null);
      setSchedule(parseScheduleFromProfileJson(tech.workScheduleJson));
      setTimeTouchByDay({});
      setShowAllTimeErrors(false);
      setServiceLocIds(Array.isArray(tech.serviceLocationIds) ? [...tech.serviceLocationIds] : []);
      const serviceCoverage = tech.serviceCoverageGeoJson && typeof tech.serviceCoverageGeoJson === 'object'
        ? (tech.serviceCoverageGeoJson as ServiceCoverageGeo)
        : null;
      setCoverageCenter(
        serviceCoverage?.homeBase &&
          Number.isFinite(serviceCoverage.homeBase.latitude) &&
          Number.isFinite(serviceCoverage.homeBase.longitude)
          ? {
              latitude: Number(serviceCoverage.homeBase.latitude),
              longitude: Number(serviceCoverage.homeBase.longitude),
            }
          : null
      );
      setServiceCoverageRadiusKm(
        serviceCoverage?.radiusKm != null && Number.isFinite(Number(serviceCoverage.radiusKm))
          ? String(serviceCoverage.radiusKm)
          : '50'
      );
      setServiceCoverageNotes(serviceCoverage?.notes ? String(serviceCoverage.notes) : '');
      const capRaw = (r as any).techRegPrimaryProfileCapture;
      const faces = Array.isArray(r.faceEnrollmentPhotos) ? r.faceEnrollmentPhotos : [];
      const faceRowsRaw = faces
        .filter((x: any) => x?.id && x?.url)
        .map((x: any) => ({ id: String(x.id), url: String(x.url) }));
      const aiFlow =
        capRaw &&
        typeof capRaw === 'object' &&
        capRaw.validatedAt &&
        isAiProfileGateEngine(String(capRaw.validationEngine || ''));
      const enrollmentOnlyRows = enrollmentPhotosWithoutProfile(
        faceRowsRaw,
        capRaw && typeof capRaw === 'object' && capRaw.photoId ? String(capRaw.photoId) : undefined,
        String(r.avatarUrl || ''),
        !!aiFlow,
      );
      setFacePhotos(enrollmentOnlyRows);
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
          enrollmentOnlyRows.length >= MIN_FACE_ENROLLMENT_PHOTOS
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
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.loadError'));
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

  useEffect(() => {
    if (showAllTimeErrors && !findFirstInvalidEnabledTime(schedule)) {
      setShowAllTimeErrors(false);
    }
  }, [schedule, showAllTimeErrors]);

  const coverageRadiusMeters = useMemo(() => {
    const km = Number(serviceCoverageRadiusKm);
    if (!Number.isFinite(km) || km <= 0) return 0;
    return km * 1000;
  }, [serviceCoverageRadiusKm]);

  const buildResponsesJson = useCallback(() => {
    const skillsJson = skillsText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const coverageGeoJson =
      coverageCenter && coverageRadiusMeters > 0
        ? {
            homeBase: {
              latitude: coverageCenter.latitude,
              longitude: coverageCenter.longitude,
              address: line1.trim() || null,
              city: city.trim() || null,
              state: stateUf.trim() || null,
              postalCode: postal.trim() || null,
              countryCode: country.trim() || 'BR',
            },
            radiusKm: Number(serviceCoverageRadiusKm) || 0,
            notes: serviceCoverageNotes.trim() || null,
          }
        : null;
    return {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || null,
      birthDate: birthDate.trim() ? birthDate.trim().slice(0, 10) : null,
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
        serviceCoverageGeoJson: coverageGeoJson,
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
      ...(techRegIdDocument && techRegIdDocument.faceVerifiedAt ? { techRegIdDocument } : {}),
    };
  }, [
    name,
    email,
    phone,
    birthDate,
    avatarUrl,
    primaryProfileCapture,
    techRegIdDocument,
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
    coverageCenter,
    coverageRadiusMeters,
    serviceCoverageNotes,
    serviceCoverageRadiusKm,
    serviceLocIds,
  ]);

  const enrollmentPhotosForUi = useMemo(
    () =>
      enrollmentPhotosWithoutProfile(
        facePhotos,
        primaryProfileCapture?.photoId,
        avatarUrl,
        isAiProfileGateEngine(primaryProfileCapture?.validationEngine),
      ),
    [
      facePhotos,
      primaryProfileCapture?.photoId,
      primaryProfileCapture?.validationEngine,
      avatarUrl,
    ],
  );

  /** Documento principal do passo 3 — espelha `personalDocuments[0]` sem duplicar em «Docs. pessoais». */
  const showPrimaryDocumentSection = useMemo(
    () =>
      isAiProfileGateEngine(primaryProfileCapture?.validationEngine) &&
      Boolean(techRegIdDocument?.faceVerifiedAt) &&
      personalDocs.length > 0,
    [primaryProfileCapture?.validationEngine, techRegIdDocument?.faceVerifiedAt, personalDocs.length],
  );

  const primaryDocRow =
    showPrimaryDocumentSection && personalDocs.length > 0 ? personalDocs[0] : null;

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
      Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionAttach'));
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
        Alert.alert(
          i18n.t('appAlerts.techReg.attachmentTitle'),
          data.error || i18n.t('appAlerts.techReg.uploadFail')
        );
        return;
      }
      if (data.responsesJson) applyResponsesDocs(data.responsesJson);
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.networkError'));
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
        Alert.alert(
          i18n.t('appAlerts.techReg.attachmentTitle'),
          data.error || i18n.t('appAlerts.techReg.removeFail')
        );
        return;
      }
      if (data.responsesJson) applyResponsesDocs(data.responsesJson);
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.networkError'));
    }
  };

  const promptDocSource = (kind: 'personal' | 'professional', rowId: string) => {
    Alert.alert(i18n.t('appAlerts.techReg.attachSourceTitle'), i18n.t('appAlerts.techReg.attachSourceBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      {
        text: i18n.t('appAlerts.techReg.pickFaceCamera'),
        onPress: async () => {
          const cam = await ImagePicker.requestCameraPermissionsAsync();
          if (!cam.granted) {
            Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.cameraDoc'));
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
        text: i18n.t('appAlerts.techReg.pickFaceGallery'),
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.galleryPick'));
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
        text: i18n.t('appAlerts.techReg.pdf'),
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
            Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.pdfReadError'));
          }
        },
      },
    ]);
  };

  const saveDraftSoon = useCallback(() => {
    if (!token || !sessionOk || status === 'SUBMITTED' || closed) return;
    if (user && isTechnicianProfileActive(user)) return;
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
  }, [basePath, token, sessionOk, status, closed, buildResponsesJson, user]);

  /** Passo 1 — grava só a foto de perfil (não entra em faceEnrollmentPhotos). */
  const postProfilePhoto = async (
    fileBase64: string,
    mimeType: string,
    captureMeta: Omit<NonNullable<PrimaryProfileCapture>, 'photoId'>,
  ): Promise<{ ok: boolean; photoId?: string; url?: string; error?: string }> => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionPhotos'));
      return { ok: false, error: 'no_jwt' };
    }
    if (user && isTechnicianProfileActive(user)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.profilePhotoLockedTitle'),
        i18n.t('appAlerts.techReg.profilePhotoLockedBody')
      );
      return { ok: false, error: 'identity_locked' };
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
      if (data.code === 'TECH_IDENTITY_LOCKED') {
        const { title, message } = userFacingFaceEnrollmentError(res.status, data.code, data.error);
        Alert.alert(title, message);
      } else {
        Alert.alert(
          i18n.t('appAlerts.techReg.removeFaceProfileTitle'),
          data.error || i18n.t('appAlerts.techReg.profilePhotoFail')
        );
      }
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
    const urlStr = data.url ? String(data.url) : '';
    if (urlStr) {
      setAvatarUrl(urlStr);
      try {
        await patchUser({ avatarUrl: urlStr });
      } catch {
        /* sessão local continua; /me refletirá no próximo arranque */
      }
    }
    setFacePhotos([]);
    setBiometricStepConfirmed(false);
    setTechRegIdDocument(null);
    setBirthDate('');
    return { ok: true, photoId: data.techRegPrimaryProfileCapture?.photoId, url: data.url };
  };

  const postFaceB64 = async (
    fileBase64: string,
    mimeType: string,
    opts?: { skipLoading?: boolean }
  ): Promise<{ ok: boolean; photo?: { id: string; url: string }; error?: string }> => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionPhotos'));
      return { ok: false, error: 'no_jwt' };
    }
    if (user && isTechnicianProfileActive(user)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.faceEnrollmentLockedTitle'),
        i18n.t('appAlerts.techReg.faceEnrollmentLockedBody')
      );
      return { ok: false, error: 'identity_locked' };
    }
    if (!opts?.skipLoading) setFaceEnrollmentSubmitting(true);
    try {
      const res = await fetch(`${basePath}/face-enrollment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ fileBase64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { title, message } = userFacingFaceEnrollmentError(res.status, data.code, data.error);
        Alert.alert(title, message);
        return { ok: false, error: data.error || 'upload_failed' };
      }
      if (Array.isArray(data.photos)) {
        setFacePhotos(
          enrollmentPhotosWithoutProfile(
            data.photos.map((x: any) => ({ id: String(x.id), url: String(x.url) })),
            primaryProfileCapture?.photoId,
            avatarUrl,
            isAiProfileGateEngine(primaryProfileCapture?.validationEngine),
          ),
        );
      }
      const photo =
        data.photo && data.photo.id && data.photo.url ? { id: data.photo.id, url: data.photo.url } : undefined;
      return { ok: true, photo };
    } finally {
      if (!opts?.skipLoading) setFaceEnrollmentSubmitting(false);
    }
  };

  const addFacePhotosFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.galleryPhotos'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    setFaceEnrollmentSubmitting(true);
    try {
      for (const asset of result.assets) {
        if (!asset.base64) continue;
        const out = await postFaceB64(asset.base64, asset.mimeType || 'image/jpeg', { skipLoading: true });
        if (!out.ok) break;
      }
    } finally {
      setFaceEnrollmentSubmitting(false);
    }
  };

  const addFacePhotosFromCamera = async () => {
    const cam = await ImagePicker.requestCameraPermissionsAsync();
    if (!cam.granted) {
      Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.cameraFace'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) return;
    await postFaceB64(asset.base64, asset.mimeType || 'image/jpeg');
  };

  const applyIdDocumentServerPayload = useCallback((responsesJson: Record<string, unknown>) => {
    const idc = responsesJson.techRegIdDocument;
    setTechRegIdDocument(idc && typeof idc === 'object' ? (idc as TechRegIdDocumentPayload) : null);
    setName(String(responsesJson.name || ''));
    setBirthDate(String((responsesJson as { birthDate?: string }).birthDate || '').slice(0, 10));
    setPersonalDocs(parseDocs((responsesJson as { personalDocuments?: unknown }).personalDocuments));
  }, []);

  const postIdDocumentB64 = async (fileBase64: string, mimeType: string) => {
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionDoc'));
      return false;
    }
    if (user && isTechnicianProfileActive(user)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.idDocLockedTitle'),
        i18n.t('appAlerts.techReg.idDocLockedBody')
      );
      return false;
    }
    setIdDocumentSubmitting(true);
    try {
      const res = await fetch(`${basePath}/id-document`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ fileBase64, mimeType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { title, message } = userFacingIdDocumentError(res.status, data.code, data.error);
        Alert.alert(title, message);
        return false;
      }
      if (data.responsesJson && typeof data.responsesJson === 'object') {
        applyIdDocumentServerPayload(data.responsesJson as Record<string, unknown>);
      }
      Alert.alert(
        i18n.t('appAlerts.techReg.idDocAcceptedTitle'),
        i18n.t('appAlerts.techReg.idDocAcceptedBody')
      );
      return true;
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.networkError'));
      return false;
    } finally {
      setIdDocumentSubmitting(false);
    }
  };

  const pickIdDocumentSource = () => {
    Alert.alert(
      i18n.t('appAlerts.techReg.idDocPickerTitle'),
      i18n.t('appAlerts.techReg.idDocPickerBody'),
      [
        { text: i18n.t('common.cancel'), style: 'cancel' },
        {
          text: i18n.t('appAlerts.techReg.pickFaceCamera'),
          onPress: async () => {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (!cam.granted) {
              Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.cameraDoc'));
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.88,
              base64: true,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            if (!asset?.base64) return;
            await postIdDocumentB64(asset.base64, asset.mimeType || 'image/jpeg');
          },
        },
        {
          text: i18n.t('appAlerts.techReg.pickFaceGallery'),
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.galleryPick'));
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.88,
              base64: true,
            });
            if (result.canceled) return;
            const asset = result.assets[0];
            if (!asset?.base64) return;
            await postIdDocumentB64(asset.base64, asset.mimeType || 'image/jpeg');
          },
        },
      ]
    );
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
      Alert.alert(i18n.t('appAlerts.techReg.permTitle'), i18n.t('appAlerts.techReg.cameraProviderProfile'));
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.88,
      base64: true,
      cameraType: ImagePicker.CameraType.front,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert(i18n.t('appAlerts.techReg.photoTitle'), i18n.t('appAlerts.techReg.photoReadError'));
      return;
    }
    const mime = asset.mimeType || 'image/jpeg';
    const dataUrl = `data:${mime};base64,${asset.base64}`;

    setPrimaryValidating(true);
    try {
      const jwt = await getToken();
      if (!jwt) {
        Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionValidatePhoto'));
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

  /** Fluxo legacy / secção do formulário: câmera ou galeria. */
  const pickFace = () => {
    Alert.alert(i18n.t('appAlerts.techReg.addPhotosTitle'), i18n.t('appAlerts.techReg.addPhotosBody'), [
      { text: i18n.t('common.cancel'), style: 'cancel' },
      { text: i18n.t('appAlerts.techReg.pickFaceCamera'), onPress: () => void addFacePhotosFromCamera() },
      { text: i18n.t('appAlerts.techReg.pickFaceGallery'), onPress: () => void addFacePhotosFromGallery() },
    ]);
  };

  const removeFace = async (photoId: string) => {
    if (user && isTechnicianProfileActive(user)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.faceEnrollmentLockedTitle'),
        i18n.t('appAlerts.techReg.faceEnrollmentLockedBody')
      );
      return;
    }
    if (primaryProfileCapture?.photoId && String(photoId) === String(primaryProfileCapture.photoId)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.removeFaceProfileTitle'),
        i18n.t('appAlerts.techReg.removeFaceProfileBody'),
      );
      return;
    }
    const jwt = await getToken();
    if (!jwt) return;
    const res = await fetch(`${basePath}/face-enrollment/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.code === 'TECH_IDENTITY_LOCKED') {
        const { title, message } = userFacingFaceEnrollmentError(res.status, data.code, data.error);
        Alert.alert(title, message);
      } else {
        const rm =
          sanitizeBiometryUserText(String(data.error || '')) ||
          i18n.t('appAlerts.techReg.removePhotoFailFallback');
        Alert.alert(i18n.t('appAlerts.techReg.removePhotoTitle'), rm);
      }
      return;
    }
    if (Array.isArray(data.photos)) {
      setFacePhotos(
        enrollmentPhotosWithoutProfile(
          data.photos.map((x: any) => ({ id: String(x.id), url: String(x.url) })),
          primaryProfileCapture?.photoId,
          avatarUrl,
          isAiProfileGateEngine(primaryProfileCapture?.validationEngine),
        ),
      );
    }
  };

  const setCoverageCenterFromCoords = (latitude: number, longitude: number) => {
    setCoverageCenter({ latitude, longitude });
    saveDraftSoon();
  };

  const fetchCepAndFillAddress = async () => {
    const cc = String(country || 'BR').trim().toUpperCase();
    if (cc !== 'BR') {
      Alert.alert(
        i18n.t('appAlerts.techReg.postalNonBrTitle'),
        i18n.t('appAlerts.techReg.postalNonBrBody'),
      );
      return;
    }
    const clean = postal.replace(/\D/g, '');
    if (clean.length !== 8) {
      Alert.alert(i18n.t('appAlerts.techReg.cepTitle'), i18n.t('appAlerts.techReg.cepDigits'));
      return;
    }
    setFetchingCep(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) {
        Alert.alert(i18n.t('appAlerts.techReg.cepTitle'), i18n.t('appAlerts.techReg.cepNotFound'));
        return;
      }
      const log = String(data.logradouro || '').trim();
      const bairro = String(data.bairro || '').trim();
      const loc = String(data.localidade || '').trim();
      const uf = String(data.uf || '').trim().slice(0, 2);
      if (log) setLine1(log);
      if (bairro) setDistrict(bairro);
      if (loc) setCity(loc);
      if (uf) setStateUf(uf);
      saveDraftSoon();
    } catch {
      Alert.alert(i18n.t('common.error'), i18n.t('appAlerts.techReg.cepLookupError'));
    } finally {
      setFetchingCep(false);
    }
  };

  const openRegionsMap = async () => {
    setMapOpenLoading(true);
    try {
      const countryLabel =
        String(country || 'BR').trim().toUpperCase() === 'BR' || !String(country || '').trim()
          ? 'Brasil'
          : String(country).trim();
      const parts = [line1, district, city, stateUf, postal.replace(/\D/g, '')].map((s) => String(s || '').trim()).filter(Boolean);
      let lat = -14.235;
      let lng = -51.9253;
      let centeredOnAddress = false;
      if (parts.length >= 2) {
        try {
          const geo = await Location.geocodeAsync(`${parts.join(', ')}, ${countryLabel}`);
          if (
            geo?.[0]?.latitude != null &&
            geo?.[0]?.longitude != null &&
            Number.isFinite(geo[0].latitude) &&
            Number.isFinite(geo[0].longitude)
          ) {
            lat = geo[0].latitude;
            lng = geo[0].longitude;
            centeredOnAddress = true;
          }
        } catch {
          /* continuar */
        }
      }
      if (!centeredOnAddress && coverageCenter) {
        lat = coverageCenter.latitude;
        lng = coverageCenter.longitude;
      }
      const delta = 0.42;
      setMapInitialRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      if (!coverageCenter) {
        setCoverageCenter({ latitude: lat, longitude: lng });
      }
      setRegionMapVisible(true);
    } finally {
      setMapOpenLoading(false);
    }
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
        dayCard: {
          marginBottom: 12,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.cardWhite,
        },
        dayRowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
        cepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
        cepInputWrap: { flex: 1 },
        cepSearchBtn: {
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: C.accent,
          justifyContent: 'center',
          minHeight: 44,
        },
        cepSearchBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
        mapOpenBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          marginTop: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.accent,
          backgroundColor: `${C.accent}12`,
          alignSelf: 'flex-start',
        },
        mapModalRoot: { flex: 1, backgroundColor: C.cardWhite },
        mapModalHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
        },
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
        progressCard: {
          marginTop: 12,
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: C.border,
          backgroundColor: C.cardWhite,
        },
        progressBarTrack: {
          height: 8,
          borderRadius: 999,
          backgroundColor: C.surfaceLow,
          overflow: 'hidden',
          marginTop: 8,
        },
        progressBarFill: {
          height: 8,
          borderRadius: 999,
          backgroundColor: C.accent,
        },
        progressLine: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 8,
        },
        progressList: { marginTop: 8, gap: 6 },
        progressItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
      }),
    [C]
  );

  const submit = async (opts?: { otpCodeOverride?: string; otpChallengeTokenOverride?: string }) => {
    const otpCode = String(opts?.otpCodeOverride || '').trim();
    const otpChallengeToken = String(opts?.otpChallengeTokenOverride || '').trim();
    if (!name.trim()) {
      Alert.alert(i18n.t('appAlerts.techReg.validationTitle'), i18n.t('appAlerts.techReg.validationName'));
      return;
    }
    if (findFirstInvalidEnabledTime(schedule)) {
      setShowAllTimeErrors(true);
      Alert.alert(
        i18n.t('appAlerts.techReg.validationTitle'),
        i18n.t('appAlerts.techReg.validationScheduleTime')
      );
      return;
    }
    if (enrollmentPhotosForUi.length < MIN_FACE_ENROLLMENT_PHOTOS) {
      Alert.alert(
        i18n.t('appAlerts.techReg.biometricPhotosTitle'),
        i18n.t('appAlerts.techReg.biometricPhotosBody', {
          min: MIN_FACE_ENROLLMENT_PHOTOS,
          current: enrollmentPhotosForUi.length,
        })
      );
      return;
    }
    const jwt = await getToken();
    if (!jwt) {
      Alert.alert(i18n.t('appAlerts.techReg.sessionTitle'), i18n.t('appAlerts.techReg.sessionSubmit'));
      return;
    }
    if (user && isTechnicianProfileActive(user)) {
      Alert.alert(
        i18n.t('appAlerts.techReg.providerActiveTitle'),
        i18n.t('appAlerts.techReg.providerActiveBody')
      );
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
        body: JSON.stringify(
          otpCode && otpChallengeToken
            ? { otpCode, otpChallengeToken, responsesJson: buildResponsesJson() }
            : { responsesJson: buildResponsesJson() }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'RECENT_LOGIN_OTP_REQUIRED') {
          if (data.challengeToken) setSubmitOtpChallengeToken(String(data.challengeToken));
          setSubmitOtpCode('');
          setSecurityModalVisible(true);
          return;
        }
        if (data.code === 'OTP_INVALID') {
          Alert.alert(
            i18n.t('appAlerts.techReg.codeMismatchTitle'),
            i18n.t('appAlerts.techReg.codeMismatchBody')
          );
          return;
        }
        if (data.code === 'OTP_EXPIRED') {
          setSubmitOtpCode('');
          setSubmitOtpChallengeToken(null);
          Alert.alert(
            i18n.t('appAlerts.techReg.codeExpiredTitle'),
            i18n.t('appAlerts.techReg.codeExpiredBody')
          );
          return;
        }
        if (data.code === 'TECH_IDENTITY_LOCKED') {
          const { title, message } = userFacingFaceEnrollmentError(res.status, data.code, data.error);
          Alert.alert(title, message);
        } else {
          const errMsg =
            sanitizeBiometryUserText(String(data.error || '')) ||
            i18n.t('appAlerts.techReg.submitFallbackBody');
          Alert.alert(i18n.t('appAlerts.techReg.submitTitle'), errMsg);
        }
        return;
      }
      setShowAllTimeErrors(false);
      setTimeTouchByDay({});
      Alert.alert(i18n.t('appAlerts.techReg.sentTitle'), i18n.t('appAlerts.techReg.sentBody'), [
        {
          text: i18n.t('common.ok'),
          onPress: () =>
            user
              ? router.replace('/profile' as any)
              : router.replace('/auth/login' as any),
        },
      ]);
      setSecurityModalVisible(false);
      setSubmitOtpCode('');
      setSubmitOtpChallengeToken(null);
    } catch (e: any) {
      Alert.alert(i18n.t('common.error'), e?.message || i18n.t('appAlerts.techReg.networkError'));
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
              onPress={async () => {
                // Sempre limpar sessão local antes do login: se o contexto ainda tinha `user` mas o
                // GET público devolveu requiresAuth (JWT expirado / sessionId desalinhado), o login
                // redireciona logo para tech-registration (useEffect) e entramos em ciclo infinito.
                await logout();
                router.push({ pathname: '/auth/login', params: { techRegToken: token } } as any);
              }}
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
  const needsIdDocumentStep = isAiProfileGateEngine(primaryProfileCapture?.validationEngine);
  const hasIdDocumentDone = !needsIdDocumentStep || !!techRegIdDocument?.faceVerifiedAt;
  const hasPersonalDataDone = !!name.trim() && !!phone.trim();
  const hasAddressDone = !!line1.trim() && !!city.trim() && !!stateUf.trim();
  const hasScheduleDone = Object.values(schedule).some(
    (day) => Array.isArray(day) && day.some((slot) => !!slot?.enabled && !!slot?.start && !!slot?.end),
  );
  const hasRegionsDone = !!coverageCenter && coverageRadiusMeters > 0;
  const hasOpsDone = hasScheduleDone && hasRegionsDone;
  const hasSecurityDone = true;
  const progressItems = [
    { label: 'Foto de perfil', done: primaryStepDone },
    { label: 'Biometria facial', done: enrollmentPhotosForUi.length >= MIN_FACE_ENROLLMENT_PHOTOS },
    { label: 'Documento com foto', done: hasIdDocumentDone },
    { label: 'Dados pessoais', done: hasPersonalDataDone },
    { label: 'Endereço base', done: hasAddressDone },
    { label: 'Disponibilidade e regiões', done: hasOpsDone },
    { label: 'Confirmação de segurança', done: hasSecurityDone },
  ];
  const progressDoneCount = progressItems.filter((it) => it.done).length;
  const progressPercent = Math.round((progressDoneCount / progressItems.length) * 100);
  const pendingProgressItems = progressItems.filter((it) => !it.done);

  if (!primaryStepDone) {
    return (
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="chevron-back" size={22} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '700' }}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Passo 1, Foto de perfil</Text>
          <Text style={styles.sub}>Etapa obrigatória antes da biometria adicional e do formulário.</Text>
          <View style={styles.progressCard}>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>
              Progresso geral: {progressDoneCount}/{progressItems.length} etapas
            </Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.progressLine}>
              <Text style={{ fontSize: 12, color: C.textSecondary }}>Cadastro em andamento</Text>
              <Text style={{ fontSize: 12, color: C.slate, fontWeight: '800' }}>{progressPercent}%</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.secTitle}>Finalidade e conferência</Text>
          <Text style={styles.primaryIntro}>
            A imagem integra o seu perfil de técnico; o solicitante poderá reconhecê-lo no local. A conferência aqui é
            feita por análise automática (IA no servidor), separada da biometria usada nas ordens de serviço.
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
          <Text style={styles.title}>Passo 2, Biometria do tenant</Text>
          <Text style={styles.sub}>
            Envie pelo menos {MIN_FACE_ENROLLMENT_PHOTOS} fotos do mesmo rosto da foto de perfil (passo 1). Cada imagem é
            validada no servidor em relação à foto de perfil antes de ser guardada.
          </Text>
          <View style={styles.progressCard}>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>
              Progresso geral: {progressDoneCount}/{progressItems.length} etapas
            </Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.progressLine}>
              <Text style={{ fontSize: 12, color: C.textSecondary }}>Cadastro em andamento</Text>
              <Text style={{ fontSize: 12, color: C.slate, fontWeight: '800' }}>{progressPercent}%</Text>
            </View>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.secTitle}>Fotos para o reconhecimento facial</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18, marginBottom: 10 }}>
            Use somente a <Text style={{ fontWeight: '700' }}>câmera</Text> (a galeria não é permitida nesta etapa).
            Cada foto é comparada automaticamente com a imagem do passo 1; rostos diferentes são rejeitados. Máximo de 12
            imagens, 5 MB cada.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { marginHorizontal: 0, marginTop: 4, opacity: faceEnrollmentSubmitting ? 0.55 : 1 }]}
            onPress={() => void addFacePhotosFromCamera()}
            disabled={faceEnrollmentSubmitting}
          >
            <Text style={styles.btnText}>Tirar foto</Text>
          </TouchableOpacity>
          {faceEnrollmentSubmitting ? (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ marginTop: 12, color: C.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                Validando e enviando a foto…{'\n'}Pode levar alguns segundos.
              </Text>
            </View>
          ) : null}
          <View style={styles.faceRow}>
            {enrollmentPhotosForUi.map((p) => (
              <View key={p.id}>
                <Image source={{ uri: publicUrl(p.url) }} style={styles.faceImg} />
                <TouchableOpacity onPress={() => removeFace(p.id)} style={{ marginTop: 4 }}>
                  <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700' }}>Remover</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
          {enrollmentPhotosForUi.length >= MIN_FACE_ENROLLMENT_PHOTOS ? (
            <TouchableOpacity
              style={[styles.btn, { marginHorizontal: 0, marginTop: 20 }]}
              onPress={() => setBiometricStepConfirmed(true)}
            >
              <Text style={styles.btnText}>Continuar para o formulário</Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.fieldHint, { marginTop: 16 }]}>
              Faltam {Math.max(0, MIN_FACE_ENROLLMENT_PHOTOS - enrollmentPhotosForUi.length)} foto(s) para continuar.
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }

  const idDocumentStepPending =
    primaryStepDone &&
    useSplitBiometricStep &&
    biometricStepConfirmed &&
    !readOnly &&
    !techRegIdDocument?.faceVerifiedAt;

  if (idDocumentStepPending) {
    return (
      <ScrollView style={styles.root} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.head}>
          <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Ionicons name="chevron-back" size={22} color={C.accent} />
            <Text style={{ color: C.accent, fontWeight: '700' }}>Voltar</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Passo 3, Documento com foto</Text>
          <Text style={styles.sub}>
            Envie uma imagem de um documento oficial com a sua fotografia. O sistema compara o rosto no documento com a
            foto de perfil do passo 1 e, em seguida, lê os dados para preencher o formulário (OpenAI no servidor).
          </Text>
          <View style={styles.progressCard}>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>
              Progresso geral: {progressDoneCount}/{progressItems.length} etapas
            </Text>
            <View style={styles.progressBarTrack}>
              <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
            </View>
            <View style={styles.progressLine}>
              <Text style={{ fontSize: 12, color: C.textSecondary }}>Cadastro em andamento</Text>
              <Text style={{ fontSize: 12, color: C.slate, fontWeight: '800' }}>{progressPercent}%</Text>
            </View>
          </View>
        </View>
        <View style={styles.section}>
          <Text style={styles.secTitle}>Foto ou imagem do documento</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18, marginBottom: 12 }}>
            Use JPEG ou PNG. Evite reflexos e cortes. Tipos comuns no Brasil: RG, CNH, CPF (com foto), passaporte, RNE.
            PDF não é aceito neste passo.
          </Text>
          <TouchableOpacity
            style={[styles.btn, { marginHorizontal: 0, marginTop: 4, opacity: idDocumentSubmitting ? 0.55 : 1 }]}
            onPress={() => pickIdDocumentSource()}
            disabled={idDocumentSubmitting}
          >
            <Text style={styles.btnText}>Enviar documento</Text>
          </TouchableOpacity>
          {idDocumentSubmitting ? (
            <View style={{ alignItems: 'center', marginTop: 20 }}>
              <ActivityIndicator size="large" color={C.accent} />
              <Text style={{ marginTop: 12, color: C.textSecondary, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
                Conferindo o rosto e lendo o documento…{'\n'}Pode levar até um minuto.
              </Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    );
  }

  return (
    <>
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
                convite no painel. O e-mail fixo abaixo é o que o gestor associou ao convite, tem de ser o mesmo da
                sua conta BrSpark.
              </Text>
            </View>
          </>
        ) : (
          <Text style={styles.sub}>
            {tenantName ? `Sua organização na plataforma: ${tenantName}` : 'Cadastro iniciado por você no app'}
          </Text>
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
            <Text style={[styles.warnText, { color: '#1e40af' }]}>Enviado, aguarde a análise. Não é possível editar agora.</Text>
          </View>
        ) : null}
        <View style={styles.progressCard}>
          <Text style={{ fontSize: 12, color: C.textSecondary }}>
            Progresso geral: {progressDoneCount}/{progressItems.length} etapas concluídas
          </Text>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>
          <View style={styles.progressLine}>
            <Text style={{ fontSize: 12, color: C.textSecondary }}>
              {pendingProgressItems.length === 0 ? 'Pronto para envio' : `${pendingProgressItems.length} pendência(s) antes do envio`}
            </Text>
            <Text style={{ fontSize: 12, color: C.slate, fontWeight: '800' }}>{progressPercent}%</Text>
          </View>
          {!readOnly && pendingProgressItems.length > 0 ? (
            <View style={styles.progressList}>
              {pendingProgressItems.map((it) => (
                <View key={it.label} style={styles.progressItem}>
                  <Ionicons name="ellipse-outline" size={14} color={C.textSecondary} />
                  <Text style={{ fontSize: 12, color: C.textSecondary }}>{it.label}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
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
        <Text style={styles.label}>Data de nascimento</Text>
        <View style={{ marginBottom: 10 }}>
          <DatePickerButton
            value={birthDate || undefined}
            onChange={(iso) => {
              setBirthDate(iso);
              saveDraftSoon();
            }}
            hideQuickChips
            accentColor={C.accent}
            minDate={new Date(1900, 0, 1)}
            maxDate={new Date()}
            disabled={readOnly}
          />
        </View>
        <Text style={styles.fieldHint}>Preenchida automaticamente a partir do documento quando possível; você pode corrigir.</Text>
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
        <Text style={styles.fieldHint}>Opcional neste passo, ajuda a equipe ou clientes a contatá-lo.</Text>
        {isAiProfileGateEngine(primaryProfileCapture?.validationEngine) ? (
          <Text style={styles.fieldHint}>
            Passo 1: foto de perfil (IA). Passo 2: biometria. Passo 3: documento com foto (validação do rosto + leitura
            dos dados). Confira nome, data de nascimento e a secção «Dados do documento» abaixo.
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

      {primaryDocRow ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>Dados do documento (passo 3)</Text>
          <Text style={styles.fieldHint}>
            Ligado ao documento enviado no passo 3: os campos abaixo são os mesmos da primeira linha de documentos
            pessoais (leitura automática). Ajuste se algo estiver incorreto.
          </Text>
          <Text style={styles.label}>Tipo de documento</Text>
          <TextInput
            style={styles.input}
            value={primaryDocRow.docType}
            editable={!readOnly}
            onChangeText={(t) => {
              setPersonalDocs((prev) => {
                const p0 = prev[0];
                if (!p0) return prev;
                const next = [...prev];
                next[0] = { ...p0, docType: t };
                return next;
              });
              saveDraftSoon();
            }}
            placeholder="RG, CNH, CPF, PASSAPORTE…"
          />
          <Text style={styles.label}>Número</Text>
          <TextInput
            style={styles.input}
            value={primaryDocRow.identifier}
            editable={!readOnly}
            onChangeText={(t) => {
              setPersonalDocs((prev) => {
                const p0 = prev[0];
                if (!p0) return prev;
                const next = [...prev];
                next[0] = { ...p0, identifier: t };
                return next;
              });
              saveDraftSoon();
            }}
          />
          <Text style={styles.label}>Data de emissão</Text>
          <View style={{ marginBottom: 10 }}>
            <DatePickerButton
              value={primaryDocRow.validFrom || undefined}
              onChange={(iso) => {
                setPersonalDocs((prev) => {
                  const p0 = prev[0];
                  if (!p0) return prev;
                  const next = [...prev];
                  next[0] = { ...p0, validFrom: iso.slice(0, 10) };
                  return next;
                });
                saveDraftSoon();
              }}
              hideQuickChips
              accentColor={C.accent}
              maxDate={new Date()}
              disabled={readOnly}
            />
          </View>
          <Text style={styles.label}>Data de validade</Text>
          <View style={{ marginBottom: 10 }}>
            <DatePickerButton
              value={primaryDocRow.validTo || undefined}
              onChange={(iso) => {
                setPersonalDocs((prev) => {
                  const p0 = prev[0];
                  if (!p0) return prev;
                  const next = [...prev];
                  next[0] = { ...p0, validTo: iso.slice(0, 10) };
                  return next;
                });
                saveDraftSoon();
              }}
              hideQuickChips
              accentColor={C.accent}
              disabled={readOnly}
            />
          </View>
          <Text style={styles.label}>Órgão emissor</Text>
          <TextInput
            style={styles.input}
            value={primaryDocRow.issuingBody}
            editable={!readOnly}
            onChangeText={(t) => {
              setPersonalDocs((prev) => {
                const p0 = prev[0];
                if (!p0) return prev;
                const next = [...prev];
                next[0] = { ...p0, issuingBody: t };
                return next;
              });
              saveDraftSoon();
            }}
          />
          {primaryDocRow.attachmentUrl ? (
            <View style={{ marginTop: 10 }}>
              {String(primaryDocRow.attachmentMimeType || '').toLowerCase().includes('pdf') ||
              String(primaryDocRow.attachmentUrl).toLowerCase().endsWith('.pdf') ? (
                <Text style={{ fontSize: 13, color: C.slate, fontWeight: '600' }}>PDF anexado</Text>
              ) : (
                <Image
                  source={{ uri: publicUrl(primaryDocRow.attachmentUrl) }}
                  style={{ width: '100%', maxHeight: 220, minHeight: 140, borderRadius: 8 }}
                  resizeMode="contain"
                />
              )}
            </View>
          ) : null}
          {!readOnly ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 10 }}>
              <TouchableOpacity onPress={() => promptDocSource('personal', primaryDocRow.id)}>
                <Text style={{ color: C.accent, fontWeight: '700' }}>
                  {primaryDocRow.attachmentUrl ? 'Trocar foto do documento' : 'Anexar foto (câmera, galeria ou PDF)'}
                </Text>
              </TouchableOpacity>
              {primaryDocRow.attachmentUrl ? (
                <TouchableOpacity onPress={() => void clearDocAttachment('personal', primaryDocRow.id)}>
                  <Text style={{ color: '#dc2626', fontWeight: '700' }}>Remover anexo</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {!useSplitBiometricStep || readOnly ? (
        <View style={styles.section}>
          <Text style={styles.secTitle}>Fotos para biometria do tenant</Text>
          <Text style={{ fontSize: 12, color: C.textSecondary, lineHeight: 18 }}>
            {isAiProfileGateEngine(primaryProfileCapture?.validationEngine)
              ? `Fluxo antigo ou revisão: inclua pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS} fotos nítidas do rosto (câmera ou galeria). Máx. 12 imagens, 5 MB cada.`
              : `Para o reconhecimento facial nas ordens de serviço, envie pelo menos ${MIN_FACE_ENROLLMENT_PHOTOS} fotos nítidas do rosto (JPEG/PNG/WebP). Até 12 imagens, máx. 5 MB cada. Use a câmera ou a galeria.`}
          </Text>
          {!readOnly ? (
            <TouchableOpacity
              style={[styles.btn, { marginHorizontal: 0, marginTop: 12, opacity: faceEnrollmentSubmitting ? 0.55 : 1 }]}
              onPress={pickFace}
              disabled={faceEnrollmentSubmitting}
            >
              <Text style={styles.btnText}>Adicionar fotos</Text>
            </TouchableOpacity>
          ) : null}
          {!readOnly && faceEnrollmentSubmitting ? (
            <View style={{ alignItems: 'center', marginTop: 16 }}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={{ marginTop: 8, color: C.textSecondary, fontSize: 12, textAlign: 'center' }}>
                Enviando e validando… pode levar alguns segundos.
              </Text>
            </View>
          ) : null}
          <View style={styles.faceRow}>
            {enrollmentPhotosForUi.map((p) => (
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
        <Text style={styles.fieldHint}>
          País define se o CEP pode ser preenchido automaticamente (Brasil = ViaCEP). Organizações com várias bases usam o
          mesmo formulário; as regiões em que você atua escolhe-se na secção «Regiões atendidas».
        </Text>
        <Text style={styles.label}>País (código ISO, ex.: BR)</Text>
        <TextInput
          style={styles.input}
          value={country}
          onChangeText={(t) => {
            setCountry(t.slice(0, 2).toUpperCase());
            saveDraftSoon();
          }}
          editable={!readOnly}
          maxLength={2}
          autoCapitalize="characters"
          placeholder="BR"
        />
        <Text style={styles.label}>{String(country || 'BR').toUpperCase() === 'BR' ? 'CEP' : 'Código postal'}</Text>
        <View style={styles.cepRow}>
          <View style={styles.cepInputWrap}>
            <TextInput
              style={[styles.input, { marginBottom: 0 }]}
              value={postal}
              onChangeText={(t) => {
                const next =
                  String(country || 'BR').toUpperCase() === 'BR' ? formatBrCepInput(t) : t;
                setPostal(next);
                saveDraftSoon();
              }}
              editable={!readOnly}
              placeholder={String(country || 'BR').toUpperCase() === 'BR' ? '00000-000' : ''}
              keyboardType="number-pad"
              maxLength={String(country || 'BR').toUpperCase() === 'BR' ? 9 : 24}
            />
          </View>
          {!readOnly && String(country || 'BR').toUpperCase() === 'BR' ? (
            <TouchableOpacity
              style={[styles.cepSearchBtn, { opacity: fetchingCep ? 0.65 : 1 }]}
              onPress={() => void fetchCepAndFillAddress()}
              disabled={fetchingCep}
            >
              {fetchingCep ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.cepSearchBtnText}>Buscar</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </View>
        {String(country || 'BR').toUpperCase() === 'BR' ? (
          <Text style={styles.fieldHint}>Busca ViaCEP: preenche rua, bairro, cidade e UF. Depois complemente o número.</Text>
        ) : (
          <Text style={styles.fieldHint}>Fora do Brasil, preencha os campos abaixo manualmente.</Text>
        )}
        <Text style={styles.label}>Linha 1 (rua e número)</Text>
        <TextInput
          style={styles.input}
          value={line1}
          onChangeText={(t) => {
            setLine1(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
          placeholder="Rua e número"
        />
        <Text style={styles.label}>Complemento</Text>
        <TextInput
          style={styles.input}
          value={line2}
          onChangeText={(t) => {
            setLine2(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
        />
        <Text style={styles.label}>Bairro</Text>
        <TextInput
          style={styles.input}
          value={district}
          onChangeText={(t) => {
            setDistrict(t);
            saveDraftSoon();
          }}
          editable={!readOnly}
        />
        <View style={styles.row2}>
          <View style={styles.flex1}>
            <Text style={styles.label}>Cidade</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={(t) => {
                setCity(t);
                saveDraftSoon();
              }}
              editable={!readOnly}
            />
          </View>
          <View style={{ width: 72 }}>
            <Text style={styles.label}>UF</Text>
            <TextInput
              style={styles.input}
              value={stateUf}
              onChangeText={(t) => {
                setStateUf(t.slice(0, 2).toUpperCase());
                saveDraftSoon();
              }}
              editable={!readOnly}
              maxLength={2}
              autoCapitalize="characters"
            />
          </View>
        </View>
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
        {showPrimaryDocumentSection ? (
          <Text style={[styles.fieldHint, { marginBottom: 8 }]}>
            O documento principal do passo 3 está na secção «Dados do documento» acima. Use «Adicionar linha» só para
            outros documentos (comprovantes, etc.).
          </Text>
        ) : null}
        {!readOnly ? (
          <TouchableOpacity
            onPress={() =>
              setPersonalDocs((d) => [...d, { id: rid(), docType: 'CPF', identifier: '', validFrom: '', validTo: '', issuingBody: '', notes: '', locationIds: [] }])
            }
          >
            <Text style={{ color: C.accent, fontWeight: '700' }}>+ Adicionar linha</Text>
          </TouchableOpacity>
        ) : null}
        {(showPrimaryDocumentSection ? personalDocs.slice(1) : personalDocs).map((d, sliceIdx) => {
          const idx = showPrimaryDocumentSection ? sliceIdx + 1 : sliceIdx;
          const displayNum = idx + 1;
          return (
          <View key={d.id} style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>Documento {displayNum}</Text>
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
        );
        })}
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
        <Text style={styles.secTitle}>Horários da semana</Text>
        <Text style={[styles.fieldHint, { marginBottom: 12 }]}>
          Ative os dias em que você pode receber serviços e ajuste o intervalo (formato 24 h, ex.: 08:00 e 18:00).
        </Text>
        {DAYS.map(({ key, label }) => {
          const slot = schedule[key]?.[0] || { enabled: false, start: '08:00', end: '18:00' };
          const startTrim = String(slot.start || '').trim();
          const endTrim = String(slot.end || '').trim();
          const touch = timeTouchByDay[key] || {};
          const startErr =
            slot.enabled && !isValidHhMm(startTrim) && (touch.s || showAllTimeErrors);
          const endErr =
            slot.enabled && !isValidHhMm(endTrim) && (touch.e || showAllTimeErrors);
          const timeHint = startErr || endErr ? i18n.t('common.timeFormat24Hint') : null;
          return (
            <View key={key} style={styles.dayCard}>
              <View style={styles.dayRowTop}>
                <Text style={{ fontWeight: '800', fontSize: 15, color: C.slate }}>{label}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, color: C.textSecondary }}>Disponível</Text>
                  <Switch
                    value={slot.enabled}
                    onValueChange={(v) => {
                      if (readOnly) return;
                      const n = { ...schedule };
                      n[key] = [{ ...slot, enabled: v }];
                      setSchedule(n);
                      saveDraftSoon();
                    }}
                    disabled={readOnly}
                    trackColor={{ false: C.border, true: `${C.accent}88` }}
                    thumbColor={slot.enabled ? C.accent : '#f4f4f5'}
                  />
                </View>
              </View>
              <View style={[styles.row2, { opacity: slot.enabled ? 1 : 0.45 }]}>
                <View style={styles.flex1}>
                  <Text style={[styles.label, startErr && { color: '#B91C1C' }]}>Início</Text>
                  <TextInput
                    style={[styles.input, startErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                    value={slot.start}
                    editable={!readOnly && slot.enabled}
                    onChangeText={(t) => {
                      const n = { ...schedule };
                      n[key] = [{ ...slot, start: t }];
                      setSchedule(n);
                      saveDraftSoon();
                    }}
                    onBlur={() =>
                      setTimeTouchByDay((p) => ({
                        ...p,
                        [key]: { ...p[key], s: true },
                      }))
                    }
                    placeholder="08:00"
                  />
                </View>
                <View style={styles.flex1}>
                  <Text style={[styles.label, endErr && { color: '#B91C1C' }]}>Fim</Text>
                  <TextInput
                    style={[styles.input, endErr && { borderColor: '#DC2626', borderWidth: 2 }]}
                    value={slot.end}
                    editable={!readOnly && slot.enabled}
                    onChangeText={(t) => {
                      const n = { ...schedule };
                      n[key] = [{ ...slot, end: t }];
                      setSchedule(n);
                      saveDraftSoon();
                    }}
                    onBlur={() =>
                      setTimeTouchByDay((p) => ({
                        ...p,
                        [key]: { ...p[key], e: true },
                      }))
                    }
                    placeholder="18:00"
                  />
                </View>
              </View>
              {timeHint ? (
                <Text style={{ fontSize: 11, color: '#B91C1C', marginTop: 6, lineHeight: 16, fontWeight: '600' }}>{timeHint}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.section}>
        <Text style={styles.secTitle}>Área de atendimento</Text>
        <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 8, lineHeight: 18 }}>
          Defina o ponto central da sua operação e o raio máximo em quilômetros para receber ordens de serviço.
        </Text>
        <Text style={styles.label}>Raio de atendimento (km)</Text>
        <TextInput
          style={styles.input}
          value={serviceCoverageRadiusKm}
          editable={!readOnly}
          onChangeText={(v) => {
            setServiceCoverageRadiusKm(v.replace(/[^0-9.,]/g, '').replace(',', '.'));
            saveDraftSoon();
          }}
          placeholder="50"
          keyboardType="decimal-pad"
        />
        <Text style={styles.fieldHint}>
          Exemplo: se você mora em Campinas e atende até 50 km, informe `50` e marque sua base no mapa.
        </Text>
        {!readOnly ? (
          <TouchableOpacity
            style={[styles.mapOpenBtn, { opacity: mapOpenLoading ? 0.65 : 1 }]}
            onPress={() => void openRegionsMap()}
            disabled={mapOpenLoading}
          >
            {mapOpenLoading ? (
              <ActivityIndicator color={C.accent} size="small" />
            ) : (
              <Ionicons name="map-outline" size={22} color={C.accent} />
            )}
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 15 }}>Definir no mapa</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[styles.fieldHint, { marginTop: 10 }]}>
          Toque no mapa para ajustar o centro da sua área. O endereço acima é usado como referência inicial.
        </Text>
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 12, color: C.slate, fontWeight: '700' }}>
            Centro atual:{' '}
            {coverageCenter
              ? `${coverageCenter.latitude.toFixed(5)}, ${coverageCenter.longitude.toFixed(5)}`
              : 'não definido'}
          </Text>
          <Text style={{ fontSize: 12, color: C.textSecondary }}>
            {coverageRadiusMeters > 0
              ? `Raio atual: ${Number(serviceCoverageRadiusKm || 0)} km`
              : 'Informe um raio acima de zero para concluir esta etapa.'}
          </Text>
        </View>
        <Text style={[styles.label, { marginTop: 12 }]}>Observações internas da cobertura</Text>
        <TextInput
          style={[styles.input, { minHeight: 74, textAlignVertical: 'top' }]}
          value={serviceCoverageNotes}
          editable={!readOnly}
          onChangeText={(v) => {
            setServiceCoverageNotes(v);
            saveDraftSoon();
          }}
          placeholder="Ex.: atende Campinas, Valinhos, Vinhedo e Paulínia."
          multiline
        />
      </View>

      {!readOnly ? (
        <TouchableOpacity style={styles.btn} onPress={() => void submit()} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Submeter candidatura</Text>}
        </TouchableOpacity>
      ) : null}
    </ScrollView>

    <Modal visible={regionMapVisible} animationType="slide" onRequestClose={() => setRegionMapVisible(false)}>
      <View style={[styles.mapModalRoot, { paddingTop: Platform.OS === 'ios' ? 52 : 36 }]}>
        <View style={styles.mapModalHeader}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.slate, flex: 1 }}>Mapa, área de atendimento</Text>
          <TouchableOpacity onPress={() => setRegionMapVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={{ color: C.accent, fontWeight: '800', fontSize: 16 }}>Fechar</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: C.textSecondary, paddingHorizontal: 16, marginBottom: 8, lineHeight: 18 }}>
          O mapa centra no endereço informado acima. Toque no ponto desejado para marcar sua base operacional e visualizar o raio de atendimento.
        </Text>
        {mapInitialRegion ? (
          <MapView
            style={{ flex: 1 }}
            initialRegion={mapInitialRegion}
            showsUserLocation={false}
            onPress={(e) => {
              if (readOnly) return;
              setCoverageCenterFromCoords(e.nativeEvent.coordinate.latitude, e.nativeEvent.coordinate.longitude);
            }}
          >
            {coverageCenter ? (
              <>
                <Circle
                  center={coverageCenter}
                  radius={coverageRadiusMeters || 1}
                  strokeColor={C.accent}
                  fillColor={`${C.accent}28`}
                  strokeWidth={2}
                />
                <Marker
                  coordinate={coverageCenter}
                  title="Base operacional"
                  description="Toque noutro ponto do mapa para reposicionar."
                  tracksViewChanges={false}
                />
              </>
            ) : null}
          </MapView>
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text style={{ color: C.textSecondary }}>Carregando mapa…</Text>
          </View>
        )}
      </View>
    </Modal>

    <Modal
      visible={securityModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (saving) return;
        setSecurityModalVisible(false);
      }}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(2,6,23,0.45)',
            padding: 24,
            justifyContent: 'center',
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
            <View
              style={{
                borderRadius: 14,
                borderWidth: 1,
                borderColor: C.border,
                backgroundColor: C.cardWhite,
                padding: 16,
              }}
            >
              <Text style={{ fontSize: 17, fontWeight: '800', color: C.slate }}>Confirmação de segurança</Text>
              <Text style={{ fontSize: 13, color: C.textSecondary, lineHeight: 20, marginTop: 8 }}>
                Para concluir o envio, informe o código de 6 dígitos enviado ao seu e-mail de cadastro.
              </Text>
              <TextInput
                style={[styles.input, { marginTop: 12, marginBottom: 0 }]}
                value={submitOtpCode}
                onChangeText={(v) => setSubmitOtpCode(v.replace(/[^0-9]/g, '').slice(0, 6))}
                placeholder="000000"
                keyboardType="number-pad"
                autoCapitalize="none"
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={Keyboard.dismiss}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
            <TouchableOpacity
              onPress={() => {
                if (saving) return;
                setSecurityModalVisible(false);
                setSubmitOtpCode('');
                setSubmitOtpChallengeToken(null);
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.border,
              }}
            >
              <Text style={{ color: C.slate, fontWeight: '700' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (saving) return;
                setSubmitOtpCode('');
                setSubmitOtpChallengeToken(null);
                void submit();
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: C.accent,
              }}
            >
              <Text style={{ color: C.accent, fontWeight: '700' }}>Reenviar código</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (saving || !submitOtpCode.trim() || !submitOtpChallengeToken) return;
                void submit({
                  otpCodeOverride: submitOtpCode,
                  otpChallengeTokenOverride: submitOtpChallengeToken,
                });
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: C.accent,
                opacity: submitOtpCode.trim().length === 6 && submitOtpChallengeToken ? 1 : 0.6,
              }}
              disabled={!submitOtpChallengeToken || submitOtpCode.trim().length < 6 || saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={{ color: '#fff', fontWeight: '800' }}>Confirmar e enviar</Text>
              )}
            </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
    </>
  );
}
