import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Alert, Dimensions, TextInput, Switch, ActivityIndicator, Modal, Clipboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, Keyboard, FlatList, BackHandler, Animated, Easing, DeviceEventEmitter } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Asset, AssetLocation } from '../../src/types/asset';
import { getLocalAssets, getChildAssets, getAssetAncestors, updateAssetParent, queueOfflineAction, saveAssetsLocal, softDeleteAssetLocal, logAssetHistory, getAssetHistoryLocal, getSystemConfigs, saveSystemConfigs, saveSubLocation, saveAssetLocation, getAssetLocations, deleteAssetLocation } from '../../src/database';
import { DirectExpense, RecurringCost, CostSummary } from '../../src/types/costs';
import { CostService } from '../../src/services/costService';


import { ColorPalette, MEDIA_TAG_COLORS } from '../../src/theme/colors';
import { useTheme } from '../../src/theme/ThemeContext';
import { useAppContext } from '../../src/context/AppContext';

import { Badge } from '../../src/components/Badge';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermissionAfterRationale, ensureLibraryPermissionAfterRationale } from '../../src/lib/jitPermissions';
import * as Location from 'expo-location';
import { ApiService } from '../../src/services/api';
import QRCode from 'react-native-qrcode-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import Constants from 'expo-constants';
import { AssetVaultService, VaultEntry, VaultCategory, VAULT_CATEGORIES } from '../../src/services/assetVault';
import { VaultModule } from '../../src/components/VaultModule';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { AssetDocService, AssetDocument } from '../../src/services/assetDocs';
import { DocumentModule } from '../../src/components/DocumentModule';
import { StockModule } from '../../src/components/StockModule';
import { InsuranceModule } from '../../src/components/InsuranceModule';
import { AIConsultantModule } from '../../src/components/AIConsultantModule';
import { MediaModule } from '../../src/components/MediaModule';
import { SubLocationPicker } from '../../src/components/SubLocationPicker';
import DatePickerButton from '../../src/components/DatePickerButton';

import { LocationGroupCard } from '../../src/components/LocationGroupCard';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../src/hooks/useAuth';
import { usePersona } from '../../src/context/PersonaContext';
import { getPersonaHomeHref } from '../../src/navigation/personaRouting';
import { formatCurrency, formatCurrencyShort, formatDate, formatDateTime, formatDistance, formatNumber } from '../../src/i18n/formatters';
import { ValueInput, parseLocaleAmountString } from '../../src/components/ValueInput';
import {
  isModuleVisible,
  getKindById,
  validateTemplate,
  getAssetFormBlock,
  getAssetRootVisual,
  getAssetRootIconColor,
  ASSET_ROOT_TYPE_IDS_FOR_EDIT,
} from '../../src/assetKind';
import { AssetTemplateFieldGroup } from '../../src/components/AssetTemplateFieldGroup';
import { ASSET_ICON_LIBRARY } from '../../src/asset/assetIconLibrary';
import {
  expandVisibilityForEdit,
  moduleSelectionToWhitelist,
  MODULE_I18N_BY_ID,
  OPTIONAL_ASSET_MODULE_IDS,
} from '../../src/asset/assetModuleRegistry';
import {
  WarrantiesContractsModule,
  ComplianceCertModule,
  ReadingsConsumptionModule,
  ValuationDepreciationModule,
  ServiceUsageHistoryModule,
  AssetAgendaShortcutModule,
} from '../../src/components/assetModules/AssetExtensionModules';




const getModules = (t: any, C: ColorPalette) => [
  { id: 'info',      title: t('modules.info'),           subtitle: t('modules.infoSub'),           icon: 'information-circle-outline' as const,  color: C.primary },
  { id: 'media',     title: t('modules.media'),          subtitle: t('modules.mediaSub'),           icon: 'camera-outline' as const,              color: C.accent },
  { id: 'docs',      title: t('modules.files'),          subtitle: t('modules.filesSub'),           icon: 'folder-open-outline' as const,         color: C.primary },
  { id: 'insurance', title: t('modules.insurance'),      subtitle: t('modules.insuranceSub'),       icon: 'shield-checkmark-outline' as const,    color: C.accent },
  { id: 'maint',     title: t('modules.maintenance'),    subtitle: t('modules.maintenanceSub'),     icon: 'construct-outline' as const,           color: C.primary },
  { id: 'costs',     title: t('modules.costs'),          subtitle: t('modules.costsSub'),           icon: 'wallet-outline' as const,              color: C.accent },
  { id: 'stock',     title: t('modules.stock'),          subtitle: t('modules.stockSub'),           icon: 'cube-outline' as const,                color: C.primary },
  { id: 'hier',      title: t('modules.hierarchy'),      subtitle: t('modules.hierarchySub'),       icon: 'git-network-outline' as const,         color: C.slate },
  { id: 'vault',     title: t('modules.security'),       subtitle: t('modules.securitySub'),        icon: 'lock-closed-outline' as const,         color: C.slate },
  { id: 'reports',   title: t('modules.reports'),        subtitle: t('modules.reportsSub'),         icon: 'document-text-outline' as const,       color: C.slate },

  { id: 'history',   title: t('modules.history'),        subtitle: t('modules.historySub'),         icon: 'time-outline' as const,                color: C.slate },

  { id: 'notes',     title: t('modules.notes'),          subtitle: t('modules.notesSub'),          icon: 'document-text-outline' as const,       color: MEDIA_TAG_COLORS.WARRANTY },

  { id: 'warranties', title: t('modules.warranties'),    subtitle: t('modules.warrantiesSub'),    icon: 'document-attach-outline' as const,     color: C.primary },
  { id: 'compliance', title: t('modules.compliance'),    subtitle: t('modules.complianceSub'),    icon: 'ribbon-outline' as const,                color: C.accent },
  { id: 'readings',   title: t('modules.readings'),      subtitle: t('modules.readingsSub'),      icon: 'pulse-outline' as const,                 color: C.primary },
  { id: 'valuation',  title: t('modules.valuation'),     subtitle: t('modules.valuationSub'),     icon: 'analytics-outline' as const,             color: C.accent },
  { id: 'serviceHistory', title: t('modules.serviceHistory'), subtitle: t('modules.serviceHistorySub'), icon: 'construct-outline' as const,       color: C.primary },
  { id: 'agenda',     title: t('modules.agenda'),        subtitle: t('modules.agendaSub'),        icon: 'calendar-outline' as const,               color: C.slate },
];

const COLOR_PRESETS = ['#FF8C00','#10B981','#3B82F6','#EF4444','#8B5CF6','#F59E0B','#EC4899','#14B8A6','#64748B','#1a1a1a'];

const { width } = Dimensions.get('window');
const ITEM_WIDTH = (width - 32 - 16) / 3;

function createAssetDetailStyles(C: ColorPalette) {
  return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.background },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.cardWhite },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '900', color: C.slate, marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  content: { paddingBottom: 160 },
  
  heroCard: { backgroundColor: C.cardWhite, marginBottom: 24, borderBottomWidth: 1, borderBottomColor: C.border },
  imageContainer: { width: '100%', height: 240, position: 'relative' },
  image: { width: '100%', height: '100%', backgroundColor: C.border },
  imagePlaceholder: { width: '100%', height: '100%', backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center' },
  carouselIndicator: { position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  carouselText: { color: '#fff', fontSize: 9, fontWeight: '900', textTransform: 'uppercase' },
  badgeContainer: { position: 'absolute', bottom: 12, left: 16 },
  heroDetails: { padding: 20 },
  title: { fontSize: 22, fontWeight: '900', color: C.slate, marginBottom: 4, letterSpacing: -0.6 },
  typeTag: { fontSize: 9, color: C.textSecondary, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  
  sectionTitle: { fontSize: 16, fontWeight: '900', color: C.slate, paddingHorizontal: 16, marginBottom: 12, marginTop: 8, letterSpacing: -0.4 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, justifyContent: 'space-between' },
  gridItem: { width: ITEM_WIDTH, backgroundColor: C.cardWhite, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  iconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  modTitle: { fontSize: 8, fontWeight: '900', color: C.slate, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 },
  moduleCarouselScroll: { flexGrow: 0, marginTop: 8, marginBottom: 4 },
  moduleCarouselRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  moduleCarouselBtn: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.cardWhite, minWidth: 72 },
  moduleCarouselIcon: { width: 34, height: 34, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  moduleCarouselTitle: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },

  // Painel Interno
  innerModuleView: { backgroundColor: C.cardWhite, marginHorizontal: 16, borderRadius: 12, padding: 20 },
  modContainer: { width: '100%' },
  
  formSectionHeader: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: C.background, paddingBottom: 8, marginBottom: 16 },
  formSectionTitle: { fontSize: 11, fontWeight: '900', color: C.slate, marginLeft: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  modLabel: { fontSize: 7, fontWeight: '900', color: C.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1.2 },
  modInput: { borderWidth: 0, borderRadius: 8, padding: 12, fontSize: 13, backgroundColor: C.surfaceLow, marginBottom: 20, color: C.slate, fontWeight: '800' },
  actionBtn: { backgroundColor: C.primary, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },

  customFieldPill: { backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: C.border, marginBottom: 16 },
  
  saveBtn: { backgroundColor: C.accent, padding: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24, shadowColor: C.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 3 },
  saveBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  
  dashedBox: { borderWidth: 2, borderColor: C.slate, borderStyle: 'dashed', borderRadius: 12, padding: 24, alignItems: 'center', marginBottom: 24, backgroundColor: C.slate + '0A' },
  docRow: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: C.border, borderRadius: 12, marginBottom: 10, backgroundColor: C.background },
  logRow: { flexDirection: 'row', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, alignItems: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.warning.text },
  logText: { flex: 1, marginLeft: 12, fontWeight: '700', color: C.slate },
  logTime: { fontSize: 9, color: C.textSecondary, fontWeight: '800', textTransform: 'uppercase' },
  
  photoThumb: { width: 110, height: 110, borderRadius: 12, marginRight: 12, backgroundColor: C.border },
  photoAddBtn: { width: 110, height: 110, borderRadius: 12, marginRight: 12, borderWidth: 2, borderColor: C.slate, borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: C.slate + '0A' },
  deletePhotoBadge: { position: 'absolute', top: 4, right: 16, backgroundColor: '#ef4444', width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },

  // Vínculos
  parentBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.slate + '10', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: C.slate + '30' },
  parentBoxText: { flex: 1, fontSize: 11, fontWeight: '900', color: C.slate, textTransform: 'uppercase' },
  parentSelectBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed' },
  childrenSection: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: C.border },
  childRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  childBadge: { backgroundColor: C.slate + '15', color: C.slate, fontSize: 10, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginRight: 6 },
  stdAddBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, justifyContent: 'center', alignItems: 'center', shadowColor: C.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  fab: { position: 'absolute', bottom: 30, right: 20, zIndex: 10, width: 60, height: 60, borderRadius: 30, backgroundColor: C.accent, justifyContent: 'center', alignItems: 'center', shadowColor: C.accent, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 6 },

  assetName: { fontSize: 14, fontWeight: '900', color: C.slate, letterSpacing: -0.2 },

  // Custos
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menuContent: { backgroundColor: '#fff', borderRadius: 32, padding: 24, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  menuTitle: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.5, textAlign: 'center', marginBottom: 25, textTransform: 'uppercase' },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', gap: 16 },
  menuIcon: { width: 44, height: 44, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  menuItemT: { fontSize: 14, fontWeight: '900', color: C.slate, letterSpacing: -0.2 },
  menuItemS: { fontSize: 10, color: C.textSecondary, fontWeight: '600', textTransform: 'uppercase' },
  menuClose: { marginTop: 20, alignItems: 'center', padding: 10 },
  menuCloseT: { fontSize: 11, fontWeight: '900', color: '#EF4444', letterSpacing: 1, textTransform: 'uppercase' },
  modalO2: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalC2: { backgroundColor: '#fff', borderTopLeftRadius: 36, borderTopRightRadius: 36, padding: 25, paddingBottom: 60, maxHeight: '90%' },
  modalH2: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  modalT: { fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, textTransform: 'uppercase' },
  typeToggle: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeBtn: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  typeBtnT: { fontSize: 9, fontWeight: '900', color: C.textLight, textTransform: 'uppercase' },
  inputG: { marginBottom: 20 },
  inputL: { fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, fontSize: 13, fontWeight: '700', borderWidth: 1, borderColor: C.border },
  pChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', marginRight: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  pChipA: { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
  pChipT: { fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase' },
  pChipTA: { color: C.menuChipActiveFg },
  confirmBtn: { backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 },
  confirmText: { color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  });
}

export default function AssetDetailScreen() {
  const { id, module: moduleParam, action, ocrAmount, ocrDesc } = useLocalSearchParams<{ id: string; module?: string; action?: string; ocrAmount?: string; ocrDesc?: string }>();
  const { user } = useAuth();
  const { activePersona } = usePersona();
  const { colors: C } = useTheme();
  const styles = useMemo(() => createAssetDetailStyles(C), [C]);
  const activeModule = moduleParam || null;
  const router = useRouter();
  const { t } = useTranslation();
  const MODULES = useMemo(() => getModules(t, C), [t, C]);
  const [asset, setAsset] = useState<Asset | null>(null);
  const visibleModules = useMemo(
    () =>
      MODULES.filter((m) =>
        isModuleVisible(m.id, asset?.details?.moduleVisibility as any, asset?.details?.moduleVisibilityMode as any)
      ),
    [MODULES, asset?.details?.moduleVisibility, asset?.details?.moduleVisibilityMode]
  );
  const [modulePickerVisible, setModulePickerVisible] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<string[]>([]);
  const [revenueCategories, setRevenueCategories] = useState<string[]>([]);
  const [aiModalVisible, setAiModalVisible] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const fabAnim = useRef(new Animated.Value(0)).current;
  const fabBtnRef = useRef<View>(null);
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    Animated.timing(fabAnim, {
      toValue: fabOpen ? 1 : 0,
      duration: 280,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [fabOpen]);

  const openFab = () => {
    fabBtnRef.current?.measure((_x, _y, w, h, pageX, pageY) => {
      setFabPos({ x: pageX + w / 2, y: pageY + h / 2 });
      setFabOpen(true);
    });
  };
  const [isDirty, setIsDirty] = useState(false);
  const { guardRef } = useAppContext();

  // OCR Pre-fill state
  const [ocrPayload, setOcrPayload] = useState<{amount: number, description: string}|null>(null);

  /** Prompt unsaved-changes dialog; if confirmed call onProceed */
  const showUnsavedAlert = (onProceed: () => void) => {
    Alert.alert(
      t('assetDetail.unsavedTitle'),
      t('assetDetail.unsavedMsg'),
      [
        { text: t('assetDetail.keepEditing'), style: 'cancel' },
        {
          text: t('assetDetail.discardChanges'),
          style: 'destructive',
          onPress: () => { setIsDirty(false); guardRef.current.isDirty = false; onProceed(); },
        },
        {
          text: t('assetDetail.saveAndLeave'),
          onPress: () => handleSaveInfo(),
        },
      ]
    );
  };

  const selectModule = (modId: string) => {
    if (modId === 'qr') { setQrModalVisible(true); return; }
    if (modId === 'ai') { setAiModalVisible(true); return; }
    if (modId === 'shares') { router.push(`/asset/share?id=${id}` as any); return; }
    if (modId === 'notes') { router.push(`/asset/notes?assetId=${id}` as any); return; }
    
    if (activeModule === modId) {
      if (isDirty) { showUnsavedAlert(() => router.back()); return; }
      router.back();
    } else {
      router.push({ pathname: `/asset/${id}`, params: { module: modId } } as any);
    }
  };

  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [children,    setChildren]    = useState<Asset[]>([]);
  const [ancestors,   setAncestors]   = useState<Asset[]>([]);
  const [subExpanded, setSubExpanded] = useState(true);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [assetRecurring, setAssetRecurring] = useState<RecurringCost[]>([]);
  const [allExpenseRecords, setAllExpenseRecords] = useState<DirectExpense[]>([]);
  const [allRevenueRecords, setAllRevenueRecords] = useState<DirectExpense[]>([]);
  const [costPage, setCostPage] = useState(0);
  const [costContainerWidth, setCostContainerWidth] = useState(Dimensions.get('window').width - 40);
  const [costScope, setCostScope] = useState<'own' | 'consolidated'>('own');
  const costScrollRef = useRef<ScrollView>(null);


  const [qrModalVisible, setQrModalVisible] = useState(false);
  const svgRef = useRef<any>(null);

  // ── Vault State ───────────────────────────────────────────────────────────────
  const [vaultUnlocked,  setVaultUnlocked]  = useState(false);
  const [vaultEntries,   setVaultEntries]   = useState<VaultEntry[]>([]);
  const [vaultForm,      setVaultForm]      = useState<Partial<VaultEntry & { showPass: boolean }>>({
    category: 'wifi', label: '', username: '', password: '', note: '',
  });
  const [vaultModal,     setVaultModal]     = useState(false);
  const [editEntry,      setEditEntry]      = useState<VaultEntry | null>(null);
  const [revealedIds,    setRevealedIds]    = useState<Set<string>>(new Set());
  const [vaultPinModal,  setVaultPinModal]  = useState(false);
  const [vaultPin,       setVaultPin]       = useState('');
  const VAULT_PIN = '1234';
  const isExpoGo = Constants.appOwnership === 'expo';
  const [linkModalVisible, setLinkModalVisible] = useState(false);
  const [rootTypePickerVisible, setRootTypePickerVisible] = useState(false);
  const [subLocPickerVisible, setSubLocPickerVisible] = useState(false);
  const [pendingSubLocAssetId, setPendingSubLocAssetId] = useState<string | null>(null);
  const [hierPage, setHierPage] = useState(0);
  const [createLocVisible, setCreateLocVisible] = useState(false);
  const [pendingGroupLocation, setPendingGroupLocation] = useState<{ floor: string; room: string; icon: string } | null>(null);
  const [linkSearch, setLinkSearch] = useState('');
  const [linkMode, setLinkMode] = useState<'child' | 'parent'>('child');
  const [documents, setDocuments] = useState<AssetDocument[]>([]);
  const [expModalVisible, setExpModalVisible] = useState(false);
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [addMenuStep, setAddMenuStep] = useState<'menu' | 'type'>('menu');
  const [pendingFlowType, setPendingFlowType] = useState<'single' | 'recurring'>('single');
  const [recordModalVisible, setRecordModalVisible] = useState(false);
  const [recurringModalVisible, setRecurringModalVisible] = useState(false);
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DirectExpense | null>(null);
  const [editingRec, setEditingRec] = useState<RecurringCost | null>(null);
  const [avatarPickerVisible, setAvatarPickerVisible] = useState(false);
  const [tempIcon, setTempIcon] = useState('');
  const [tempColor, setTempColor] = useState('');
  const [iconPickerFilter, setIconPickerFilter] = useState('');

  const [newRecord, setNewRecord] = useState<Partial<DirectExpense>>({
    category: 'OUTROS', amount: 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', type: 'EXPENSE', assetId: id as string
  });
  const [newRec, setNewRec] = useState<Partial<RecurringCost>>({
    frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: 0, assetId: id as string, nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1
  });

  const [budgetLimit, setBudgetLimit] = useState('');
  const [recurringExpanded, setRecurringExpanded] = useState(false);
  const [allRecurringCosts, setAllRecurringCosts] = useState<RecurringCost[]>([]);

  const [newExp, setNewExp] = useState({ description: '', amount: '', category: 'MANUTENÇÃO' });

  const recordAmountDraftRef = useRef('');
  const recordAmountEditingRef = useRef(false);
  const recAmountDraftRef = useRef('');
  const recAmountEditingRef = useRef(false);
  const expAmountDraftRef = useRef('');
  const expAmountEditingRef = useRef(false);
  const budgetAmountDraftRef = useRef('');
  const budgetAmountEditingRef = useRef(false);

  const handleAddSubAsset = () => {
    if (!asset) return;
    Alert.alert(t('assetDetail.addSubAsset'), t('assetDetail.addSubAssetMsg'), [
      { 
        text: t('assetDetail.registerNew'), 
        onPress: () => router.push(`/asset/new?parentId=${asset.id}&parentTitle=${encodeURIComponent(asset.title)}` as any) 
      },
      { 
        text: t('assetDetail.linkExisting'), 
        onPress: () => {
          setLinkSearch('');
          setLinkMode('child');
          setLinkModalVisible(true);
        }
      },
      { text: t('common.cancel'), style: 'cancel' }
    ]);
  };

  // Ficha Geral Master
  const [editForm, setEditForm] = useState<any>({
     title: '', inventoryId: '', brand: '', model: '', serialNumber: '', costCenter: '', acquisitionValue: '',
     cep: '', street: '', streetNumber: '', complement: '', neighborhood: '', city: '', state: '',
     gpsCoordinates: '', owner: '', department: '', customFields: [], photos: [],
     status: '', statusType: 'success', customStatuses: [] as string[],
     templateValues: {} as Record<string, string | number | boolean>,
     assetKindId: null as string | null,
     industryContextId: null as string | null,
  });

  const handleSaveRecord = async () => {
    const rawAmt =
      recordAmountEditingRef.current && recordAmountDraftRef.current.trim() !== ''
        ? recordAmountDraftRef.current
        : String(newRecord.amount ?? '');
    const amountNum = parseLocaleAmountString(rawAmt);
    if (!amountNum || !newRecord.description) return Alert.alert(t('common.attention'), t('common.fillRequired'));
    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));
    const id = editingRecord?.id ?? `exp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    await CostService.saveExpense({ ...(newRecord as DirectExpense), id, amount: amountNum }, user.email);
    setExpModalVisible(false);
    setRecordModalVisible(false);
    setEditingRecord(null);
    loadAssetData();
    Alert.alert(t('common.success'), t('assetDetail.financialSaved'));
  };

  const handleRecordRowPress = (rec: DirectExpense) => {
    Alert.alert(
      rec.description || rec.category,
      formatCurrency(rec.amount),
      [
        {
          text: 'Editar',
          onPress: () => {
            setEditingRecord(rec);
            setNewRecord({ ...rec });
            setRecordModalVisible(true);
          },
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () =>
            Alert.alert(t('assetDetail.deleteFinancialRecordTitle'), t('assetDetail.deleteFinancialRecordMsg'), [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Excluir',
                style: 'destructive',
                onPress: async () => {
                  if (user?.email) {
                    await CostService.deleteExpense(rec.id, user.email);
                    loadAssetData();
                  }
                },
              },
            ]),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleSaveRecurring = async () => {
    const rawAmt =
      recAmountEditingRef.current && recAmountDraftRef.current.trim() !== ''
        ? recAmountDraftRef.current
        : String(newRec.amount ?? '');
    const amountNum = parseLocaleAmountString(rawAmt);
    if (!amountNum || !newRec.description || !newRec.nextDueDate) return Alert.alert(t('common.attention'), t('common.fillRequired'));
    if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));
    const id = editingRec?.id ?? `rec-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    await CostService.saveRecurringCost({ ...(newRec as RecurringCost), id, amount: amountNum }, user.email);
    setRecurringModalVisible(false);
    setEditingRec(null);
    loadAssetData();
    Alert.alert(t('common.success'), t('assetDetail.recurringScheduled'));
  };

  const handleRecurringPress = (rec: RecurringCost) => {
    Alert.alert(
      rec.description || '',
      `${formatCurrency(rec.amount)} · ${rec.frequency}`,
      [
        {
          text: 'Editar',
          onPress: () => {
            setEditingRec(rec);
            setNewRec({ ...rec });
            setRecurringModalVisible(true);
          },
        },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: () =>
            Alert.alert(t('assetDetail.deleteRecurringRecordTitle'), t('assetDetail.deleteRecurringRecordMsg'), [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Excluir',
                style: 'destructive',
                onPress: async () => {
                  if (user?.email) {
                    await CostService.deleteRecurringCost(rec.id, user.email);
                    loadAssetData();
                  }
                },
              },
            ]),
        },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleAnticipateRec = async (rec: RecurringCost) => {
    if (user?.email) {
      await CostService.anticipateRecurring(rec.id, user.email);
      loadAssetData();
    }
  };

  const handleUpdateAvatar = async (mode: 'icon' | 'camera' | 'gallery' | 'remove') => {
    if (!asset) return;
    if (mode === 'icon') {
      setTempIcon(asset.details?.customIcon || '');
      setTempColor(asset.details?.customColor || '');
      setAvatarPickerVisible(true);
      return;
    }
    if (mode === 'remove') {
      const updated = { ...asset, imageUrl: undefined, details: { ...asset.details, customIcon: undefined, customColor: undefined } };
      const db = getLocalAssets(user?.email || '').map(a => a.id === asset.id ? updated : a);
      saveAssetsLocal(db, user?.email || '');
      setAsset(updated as any);
      return;
    }
    const launcher = mode === 'camera'
      ? async () => {
          const ok = await ensureCameraPermissionAfterRationale(t);
          if (!ok) {
            Alert.alert(t('profile.permDenied'), t('profile.cameraPermDenied'));
            return null;
          }
          return ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.7 });
        }
      : async () => {
          const ok = await ensureLibraryPermissionAfterRationale(t);
          if (!ok) return null;
          return ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1,1], quality: 0.7 });
        };
    const result = await launcher();
    if (!result || result.canceled) return;
    const uri = result.assets[0].uri;
    const updated = { ...asset, imageUrl: uri, details: { ...asset.details, customIcon: undefined, customColor: undefined } };
    const db = getLocalAssets(user?.email || '').map(a => a.id === asset.id ? updated : a);
    saveAssetsLocal(db, user?.email || '');
    setAsset(updated as any);
  };

  const handleConfirmIcon = () => {
    if (!asset || !tempIcon) return;
    const updated = { ...asset, imageUrl: undefined, details: { ...asset.details, customIcon: tempIcon, customColor: tempColor || undefined } };
    const db = getLocalAssets(user?.email || '').map(a => a.id === asset.id ? updated : a);
    saveAssetsLocal(db, user?.email || '');
    setAsset(updated as any);
    setAvatarPickerVisible(false);
  };


  const handleSaveBudget = async () => {
    if (!asset || !user?.email) return;
    const raw =
      budgetAmountEditingRef.current && budgetAmountDraftRef.current.trim() !== ''
        ? budgetAmountDraftRef.current
        : budgetLimit;
    const lim = parseLocaleAmountString(raw);
    if (!lim) return;
    await CostService.saveBudget(
      { id: Math.random().toString(36).substring(7), assetId: asset.id, monthlyLimit: lim, category: 'GERAL' },
      user.email
    );
    setBudgetModalVisible(false);
    loadAssetData();
  };


  const handleSaveExp = async () => {
    const rawAmt =
      expAmountEditingRef.current && expAmountDraftRef.current.trim() !== ''
        ? expAmountDraftRef.current
        : newExp.amount;
    const amountVal = parseLocaleAmountString(rawAmt);
    if (!newExp.description || !amountVal || !asset) return Alert.alert(t('common.attention'), t('common.fillRequired'));
    try {
      if (!user?.email) return Alert.alert(t('common.error'), t('auth.sessionExpired'));
      await CostService.saveExpense({
        id: Math.random().toString(36).substring(7),
        assetId: asset.id,
        category: newExp.category,
        amount: amountVal,
        date: new Date().toISOString().split('T')[0],
        description: newExp.description,
        status: 'PENDING',
        type: 'EXPENSE'
      }, user.email);
      setExpModalVisible(false);
      setNewExp({ description: '', amount: '', category: 'MANUTENÇÃO' });
      
      // Refresh summary
      const month = new Date().toISOString().substring(0, 7);
      const summ = await CostService.getAssetCostSummary(asset.id, month, user.email);
      setCostSummary(summ);
      Alert.alert(t('common.success'), t('assetDetail.expenseSaved'));
    } catch (err) {
      Alert.alert(t('common.error'), t('assetDetail.expenseFailed'));
    }
  };


  const [fetchingCep, setFetchingCep] = useState(false);
  const [fetchingGps, setFetchingGps] = useState(false);

  const filteredAssetIcons = useMemo(() => {
    const q = iconPickerFilter.trim().toLowerCase();
    if (!q) return ASSET_ICON_LIBRARY;
    return ASSET_ICON_LIBRARY.filter(
      (e) => e.label.toLowerCase().includes(q) || e.icon.toLowerCase().includes(q)
    );
  }, [iconPickerFilter]);

  useEffect(() => {
    if (avatarPickerVisible) setIconPickerFilter('');
  }, [avatarPickerVisible]);

  const loadAssetData = useCallback(() => {
    const localDb = getLocalAssets(user?.email || '');
    const found = localDb.find(a => a.id === id);
    if (found) {
      setAsset(found);
      const foundChildren = getChildAssets(found.id);
      setChildren(foundChildren);
      // Auto-default to consolidated when asset has children
      if (foundChildren.length > 0) setCostScope('consolidated');
      setAncestors(getAssetAncestors(found.id, user?.email || ''));
      const rawTv = (found.details?.templateValues || {}) as Record<string, string>;
      const kindId = (found.details?.assetKindId as string) || null;
      const kdef = getKindById(kindId);
      const templateValues: Record<string, string | number | boolean> = {};
      for (const f of kdef?.fieldSchema || []) {
        const v = rawTv[f.id];
        if (f.type === 'boolean') {
          templateValues[f.id] = v === '1' || v === 'true';
        } else {
          templateValues[f.id] = v != null && v !== undefined ? String(v) : '';
        }
      }
      for (const key of Object.keys(rawTv)) {
        if (templateValues[key] === undefined) {
          templateValues[key] = rawTv[key] != null ? String(rawTv[key]) : '';
        }
      }
      setEditForm({
         title: found.title || '',
         inventoryId: found.details?.inventoryId || '',
         brand: found.details?.brand || '',
         model: found.details?.model || '',
         serialNumber: found.details?.serialNumber || '',
         costCenter: found.details?.costCenter || '',
         acquisitionValue: found.details?.acquisitionValue || '',
         cep: found.details?.cep || '',
         street: found.details?.street || '',
         streetNumber: found.details?.streetNumber || '',
         complement: found.details?.complement || '',
         neighborhood: found.details?.neighborhood || '',
         city: found.details?.city || '',
         state: found.details?.state || '',
         gpsCoordinates: found.details?.gpsCoordinates || '',
         owner: found.details?.owner || '',
         department: found.details?.department || '',
         customFields: found.details?.customFields || [],
         photos: (found.details?.photos || []).map((p: any) => typeof p === "string" ? { uri: p, description: "" } : p),
         status: found.status || "",
         statusType: found.statusType || "success",
         type: found.type || 'OTHER',
         customStatuses: (found as any).customStatuses || [],
         templateValues,
         assetKindId: kindId,
         industryContextId: (found.details?.industryContextId as string) || null,
         moduleVisibilityMap: expandVisibilityForEdit(found),
      });
      setIsDirty(false);
      guardRef.current.isDirty = false; // data load — not a user edit

      setHistoryLogs(getAssetHistoryLocal(found.id, user?.email || ''));
      AssetDocService.getDocuments(found.id, user?.email || '').then(setDocuments);
      // Initial cost load (own scope) — scope changes handled by dedicated effect below
      CostService.getRecurringCosts(user?.email).then(rec => {
        setAssetRecurring(rec.filter(r => r.assetId === found.id && r.status === 'ACTIVE'));
      });
    }

    // Configurações de sistema (categorias financeiras)
    let expCats = getSystemConfigs('expense_categories');
    if (expCats.length === 0) {
       const SEED_EXP = ['MANUTENÇÃO', 'CONTAS', 'TAXAS', 'LIMPEZA', 'LOGÍSTICA', 'OUTROS'].map(l => ({ id: Math.random().toString(36).substring(7), label: l }));
       saveSystemConfigs('expense_categories', SEED_EXP);
       expCats = SEED_EXP;
    }
    setExpenseCategories(expCats.map(c => c.label));

    let revCats = getSystemConfigs('revenue_categories');
    if (revCats.length === 0) {
       const SEED_REV = ['VENDA', 'SERVIÇO', 'LOCAÇÃO', 'OUTROS'].map(l => ({ id: Math.random().toString(36).substring(7), label: l }));
       saveSystemConfigs('revenue_categories', SEED_REV);
       revCats = SEED_REV;
    }
    setRevenueCategories(revCats.map(c => c.label));
  }, [id, t]);

  useFocusEffect(useCallback(() => {
    loadAssetData();
  }, [loadAssetData]));

  useEffect(() => {
    loadAssetData();
  }, [loadAssetData]);

  // Deep Link OCR effect
  useEffect(() => {
    if (action === 'ocr_expense') {
      const amt = Number(ocrAmount) || 0;
      const desc = String(ocrDesc || '');
      setOcrPayload({ amount: amt, description: desc });
      // Espera o detalhe do asset carregar antes de abrir o modal
      setTimeout(() => {
         setAddMenuVisible(true);
         setAddMenuStep('menu'); // "Lançamento único vs Recorrente"
      }, 500);
    }
  }, [action, ocrAmount, ocrDesc]);

  // Android hardware back button guard
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isDirty && activeModule === 'info') {
        showUnsavedAlert(() => router.back());
        return true; // prevent default
      }
      return false;
    });
    return () => sub.remove();
  }, [isDirty, activeModule]);

  // ── Scope-aware cost data loader ───────────────────────────────────────────
  useEffect(() => {
    if (!asset) return;
    const month = new Date().toISOString().substring(0, 7);
    const assetIds = costScope === 'consolidated'
      ? [asset.id, ...children.map((c: Asset) => c.id)]
      : [asset.id];

    // Summary
    const email = user?.email;
    if (assetIds.length > 1) {
      CostService.getConsolidatedSummary(assetIds, month, email).then(setCostSummary);
    } else {
      CostService.getAssetCostSummary(asset.id, month, email).then(setCostSummary);
    }

    // Records
    CostService.getExpenses(email).then(all => {
      const mine = all.filter(e => assetIds.includes(e.assetId));
      setAllExpenseRecords(mine.filter(e => e.type === 'EXPENSE').sort((a, b) => b.date.localeCompare(a.date)));
      setAllRevenueRecords(mine.filter(e => e.type === 'REVENUE').sort((a, b) => b.date.localeCompare(a.date)));
    });

    // Recurring
    CostService.getRecurringCosts(email).then(all => {
      setAssetRecurring(all.filter(r => assetIds.includes(r.assetId) && r.status === 'ACTIVE'));
    });
  }, [asset, costScope, children, activeModule, user?.email]);

  const fetchCepData = async () => {
     if (editForm.cep.length < 8) return;
     const cleanCep = editForm.cep.replace(/\D/g, '');
     if (cleanCep.length !== 8) return;
     
     setFetchingCep(true);
     try {
       const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
       const data = await res.json();
       if (!data.erro) {
          setEditForm((f: any) => ({
            ...f,
            street: data.logradouro || f.street,
            neighborhood: data.bairro || f.neighborhood,
            city: data.localidade || f.city,
            state: data.uf || f.state,
          }));
       } else {
          Alert.alert(t('assetDetail.invalidZip'), t('assetDetail.invalidZipMsg'));
       }
     } catch (e) {
       Alert.alert(t('common.attention'), t('assetDetail.zipFailed'));
     }
     setFetchingCep(false);
  };

  const fetchGps = async () => {
    setFetchingGps(true);
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('assetDetail.gpsDenied'), t('assetDetail.gpsDeniedMsg'));
      setFetchingGps(false);
      return;
    }
    try {
       const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
       const { latitude, longitude } = loc.coords;
       const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
       setEditForm((f: any) => ({
         ...f,
         gpsCoordinates: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
         ...(place ? {
           street: place.street || f.street,
           streetNumber: place.streetNumber || f.streetNumber,
           neighborhood: place.subregion || place.district || f.neighborhood,
           city: place.city || f.city,
           state: place.region || f.state,
           cep: place.postalCode ? place.postalCode.replace(/\D/g,'') : f.cep,
           country: place.country || f.country,
           stateCode: place.isoCountryCode || f.stateCode, // Using isoCountryCode as a proxy for stateCode if available
         } : {})
       }));
       if (place) Alert.alert(t('common.success'), t('assetDetail.gpsCaptured'));
     } catch (e) {
        Alert.alert(t('common.error'), t('assetDetail.gpsFailed'));
     }
     setFetchingGps(false);
  };

  const scheduleMaintenance = () => {
    queueOfflineAction('SCHEDULE_MAINTENANCE', { assetId: id, timestamp: Date.now() }, user?.email || '');
    Alert.alert(t('assetDetail.soDelivered'), t('assetDetail.soDeliveredMsg'));
    router.setParams({ module: undefined });
    ApiService.sync(user?.email || '');
  };

  const currentTypeConfig = asset
    ? (() => {
        const v = getAssetRootVisual(asset.type);
        return { icon: v.icon, color: v.color, bg: v.bg };
      })()
    : null;

  const handleSaveInfo = useCallback(() => {
    if (!asset) return;
    const k = getKindById(editForm.assetKindId);
    const vFail = validateTemplate(k, editForm.templateValues || {});
    if (vFail) {
      Alert.alert(t('common.attention'), t('assetJourney.missingField') as any);
      return;
    }
    const templateSerialized: Record<string, string> = {};
    for (const key of Object.keys(editForm.templateValues || {})) {
      const v = editForm.templateValues[key];
      if (v !== undefined && v !== null) {
        templateSerialized[key] = typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
      }
    }
    const updated = {
       ...asset,
       title: editForm.title,
       type: editForm.type || asset.type,
       imageUrl: editForm.photos.length > 0 ? editForm.photos[0].uri : asset.imageUrl,
       details: {
          ...asset.details,
          inventoryId: editForm.inventoryId,
          brand: editForm.brand,
          model: editForm.model,
          serialNumber: editForm.serialNumber,
          costCenter: editForm.costCenter,
          acquisitionValue: editForm.acquisitionValue,
          cep: editForm.cep,
          street: editForm.street,
          streetNumber: editForm.streetNumber,
          complement: editForm.complement,
          neighborhood: editForm.neighborhood,
          city: editForm.city,
          state: editForm.state,
          gpsCoordinates: editForm.gpsCoordinates,
          owner: editForm.owner,
          department: editForm.department,
          customFields: editForm.customFields,
          photos: editForm.photos,
          templateValues: Object.keys(templateSerialized).length ? templateSerialized : undefined,
          assetKindId: editForm.assetKindId || undefined,
          industryContextId: editForm.industryContextId || undefined,
          ...(editForm.moduleVisibilityMap && Object.keys(editForm.moduleVisibilityMap).length > 0
            ? {
                moduleVisibility: moduleSelectionToWhitelist(editForm.moduleVisibilityMap),
                moduleVisibilityMode: 'whitelist' as const,
              }
            : {}),
       },
       status: editForm.status,
       statusType: editForm.statusType
    };
    const localDb = getLocalAssets(user?.email || '');
    const newDb = localDb.map(a => a.id === asset.id ? updated : a);
    saveAssetsLocal(newDb);
    setAsset(updated);
    queueOfflineAction('UPDATE_ASSET', updated, user?.email || '');
    logAssetHistory(asset.id, t('assetDetail.historyUpdate'), t('assetDetail.historyUpdateDetails'), user?.email || '');
    setHistoryLogs(getAssetHistoryLocal(asset.id, user?.email || ''));
    Alert.alert(t('assetDetail.savedOffline'), t('assetDetail.savedOfflineMsg'));
    router.setParams({ module: undefined });
    ApiService.sync(user?.email || '');
    setIsDirty(false);
    guardRef.current.isDirty = false;
  }, [asset, editForm, user, t, router]);

  const changeForm = (updates: any) => {
    setIsDirty(true);
    guardRef.current.isDirty = true; // update ref for Header — no re-render
    setEditForm((prev: any) => ({ ...prev, ...updates }));
  };

  // Keep guardRef in sync (direct mutation — no setState, no re-renders)
  useEffect(() => {
    guardRef.current.isDirty = isDirty && activeModule === 'info';
    guardRef.current.onSave = (isDirty && activeModule === 'info') ? handleSaveInfo : null;
    if (activeModule === 'info') {
      guardRef.current.labels = {
        title: t('assetDetail.unsavedTitle'),
        msg: t('assetDetail.unsavedMsg'),
        keep: t('assetDetail.keepEditing'),
        discard: t('assetDetail.discardChanges'),
        save: t('assetDetail.saveAndLeave'),
      };
    }
  }); // no dep array — runs every render, pure mutation, safe

  // Clear guard on unmount
  useEffect(() => () => { guardRef.current.isDirty = false; guardRef.current.onSave = null; }, []);





  const pickCustomFieldType = () => {
     Alert.alert(t('assetDetail.addParam'), t('assetDetail.addParamMsg'), [
        { text: t('assetDetail.fieldText'), onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: '', type: 'text' }]}) },
        { text: t('assetDetail.fieldNumber'), onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: '', type: 'number' }]}) },
        { text: t('assetDetail.fieldBoolean'), onPress: () => setEditForm({...editForm, customFields: [...editForm.customFields, { label: '', value: false, type: 'boolean' }]}) },
        { text: t('common.cancel'), style: 'cancel' }
     ]);
  };

  const pickImage = () => {
    Alert.alert(
      t('assetDetail.addPhoto'),
      t('assetDetail.addPhotoMsg'),
      [
        {
          text: t('profile.takePhoto'),
          onPress: async () => {
            const ok = await ensureCameraPermissionAfterRationale(t);
            if (!ok) {
              Alert.alert(t('profile.permDenied'), t('profile.cameraPermDenied'));
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false, quality: 0.6,
            });
            if (!result.canceled) {
              setEditForm((prev: any) => ({ ...prev, photos: [...prev.photos, { uri: result.assets[0].uri, description: '' }] }));
            }
          }
        },
        {
          text: t('profile.cameraRoll'),
          onPress: async () => {
            const ok = await ensureLibraryPermissionAfterRationale(t);
            if (!ok) return;
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: false, quality: 0.6,
              allowsMultipleSelection: true,
            });
            if (!result.canceled) {
               const newPhotos = result.assets.map(a => ({ uri: a.uri, description: '' }));
               setEditForm((prev: any) => ({ ...prev, photos: [...prev.photos, ...newPhotos] }));
            }
          }
        },
        { text: t('common.cancel'), style: 'cancel' }
      ]
    );
  };

  const shareQRCode = () => {
    if (svgRef.current) {
       svgRef.current.toDataURL(async (dataURL: string) => {
          try {
             let base64Code = dataURL;
             if (dataURL.includes('base64,')) {
                base64Code = dataURL.split('base64,')[1];
             }
             const filepath = (FileSystem as any).documentDirectory + `brspark_qr_${id}.png`;
             await (FileSystem as any).writeAsStringAsync(filepath, base64Code, { encoding: 'base64' });
             await Sharing.shareAsync(filepath);
          } catch(e) {
             Alert.alert(t('common.error'), t('assetDetail.qrExportFailed'));
          }
       });
    } else {
       Alert.alert(t('common.attention'), t('assetDetail.qrRenderFailed'));
    }
  };

  const handleSoftDelete = () => {
    if (!asset) return;
    Alert.alert(
      t('assetDetail.deleteWarning'),
      t('assetDetail.deleteWarningMsg', { title: asset.title }),
      [
         { text: t('common.cancel'), style: 'cancel' },
         { text: t('assetDetail.deleteConfirm'), style: 'destructive', onPress: () => {
              softDeleteAssetLocal(asset.id, user?.email || '');
              queueOfflineAction('DELETE_ASSET', { id: asset.id }, user?.email || '');
              ApiService.sync(user?.email || '');
              router.push(getPersonaHomeHref(activePersona) as any);
           }
         }
      ]
    );
  };

  if (!asset) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
         <Text>{t('assetDetail.loading')}</Text>
      </View>
    );
  }

  const renderModuleContent = () => {
    switch (activeModule) {
      case 'info':
        return (
          <View style={styles.modContainer}>


            <View style={styles.formSectionHeader}>
               <Ionicons name="cube-outline" size={18} color={C.slate} />
               <Text style={styles.formSectionTitle}>{t('asset.quickInfo')}</Text>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.title')} *</Text>
            <TextInput style={styles.modInput} value={editForm.title} onChangeText={(t)=>changeForm({ title:t})} returnKeyType="done"
                      />
            
            <Text style={styles.modLabel}>{t('newAsset.type')}</Text>
            <TouchableOpacity style={styles.modInput} onPress={() => setRootTypePickerVisible(true)}>
              <Text style={{color: C.slate, fontWeight: '700'}}>{t(`asset.type.${editForm.type}` as any)}</Text>
            </TouchableOpacity>

            <Modal visible={rootTypePickerVisible} transparent animationType="fade" onRequestClose={() => setRootTypePickerVisible(false)}>
              <TouchableWithoutFeedback onPress={() => setRootTypePickerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                  <TouchableWithoutFeedback>
                    <View style={{ backgroundColor: C.cardWhite, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28, maxHeight: '72%' }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: C.slate, padding: 18, paddingBottom: 8 }}>{t('newAsset.selectType')}</Text>
                      <FlatList
                        data={ASSET_ROOT_TYPE_IDS_FOR_EDIT}
                        keyExtractor={(id) => id}
                        renderItem={({ item: id }) => (
                          <TouchableOpacity
                            style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.divider }}
                            onPress={() => {
                              changeForm({ type: id });
                              setRootTypePickerVisible(false);
                            }}
                          >
                            <Text style={{ fontSize: 15, fontWeight: '700', color: C.slate }}>{t(`asset.type.${id}` as any)}</Text>
                          </TouchableOpacity>
                        )}
                      />
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </Modal>

            {getAssetFormBlock(editForm.type) === 'realEstate' ? (
              <></>
            ) : getAssetFormBlock(editForm.type) === 'vehicleLike' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.brand')}</Text>
                      <TextInput style={styles.modInput} value={editForm.brand} onChangeText={(t)=>changeForm({ brand:t})} placeholder={t('newAsset.brandPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.commercialModel')}</Text>
                      <TextInput style={styles.modInput} value={editForm.model} onChangeText={(t)=>changeForm({ model:t})} placeholder={t('newAsset.modelPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.chassisVin')}</Text>
                <TextInput style={styles.modInput} value={editForm.serialNumber} onChangeText={(t)=>changeForm({ serialNumber:t})} placeholder={t('newAsset.chassisPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : getAssetFormBlock(editForm.type) === 'aquatic' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.brand')}</Text>
                      <TextInput style={styles.modInput} value={editForm.brand} onChangeText={(t)=>changeForm({ brand:t})} placeholder={t('newAsset.brandPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.commercialModel')}</Text>
                      <TextInput style={styles.modInput} value={editForm.model} onChangeText={(t)=>changeForm({ model:t})} placeholder={t('newAsset.modelPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.serialNumber')}</Text>
                <TextInput style={styles.modInput} value={editForm.serialNumber} onChangeText={(t)=>changeForm({ serialNumber:t})} placeholder={t('newAsset.serialPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : getAssetFormBlock(editForm.type) === 'collectionLike' ? (
              <>
                <View style={{flexDirection: 'row', gap: 12}}>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.author')}</Text>
                      <TextInput style={styles.modInput} value={editForm.brand} onChangeText={(t)=>changeForm({ brand:t})} placeholder={t('newAsset.authorPlaceholder')} returnKeyType="done"
                      />
                   </View>
                   <View style={{flex: 1}}>
                      <Text style={styles.modLabel}>{t('newAsset.material')}</Text>
                      <TextInput style={styles.modInput} value={editForm.model} onChangeText={(t)=>changeForm({ model:t})} placeholder={t('newAsset.materialPlaceholder')} returnKeyType="done"
                      />
                   </View>
                </View>
                <Text style={styles.modLabel}>{t('newAsset.conservation')}</Text>
                <TextInput style={styles.modInput} value={editForm.serialNumber} onChangeText={(t)=>changeForm({ serialNumber:t})} placeholder={t('newAsset.conservationPlaceholder')} returnKeyType="done"
                      />
              </>
            ) : null}

            <AssetTemplateFieldGroup
              kind={getKindById(editForm.assetKindId)}
              values={editForm.templateValues || {}}
              onChange={(next) => changeForm({ templateValues: next })}
            />

            <View style={[styles.formSectionHeader, {marginTop: 16}]}>
               <Ionicons name="cash-outline" size={18} color={C.slate} />
               <Text style={styles.formSectionTitle}>{t('newAsset.valueCost')}</Text>
            </View>

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.costCenter')}</Text>
                  <TextInput style={styles.modInput} value={editForm.costCenter} onChangeText={(t)=>changeForm({ costCenter:t})} placeholder={t('newAsset.costCenterPlaceholder')} returnKeyType="done"
                      />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.acquisitionValue')}</Text>
                  <ValueInput
                    style={styles.modInput}
                    value={editForm.acquisitionValue}
                    onChangeText={(v) => changeForm({ acquisitionValue: v})}
                    placeholder={t('newAsset.valuePlaceholder')}
                    currency
                  />
               </View>
            </View>

             <View style={[styles.formSectionHeader, {marginTop: 16}]}>
                <Ionicons name="flag-outline" size={18} color={C.slate} />
                <Text style={styles.formSectionTitle}>{t('assetDetail.statusInfo')}</Text>
             </View>

             {/* ── Carrossel de status (portal) ── */}
             <ScrollView
               horizontal
               showsHorizontalScrollIndicator={false}
               contentContainerStyle={{ paddingRight: 8, gap: 8, flexDirection: 'row', alignItems: 'center' }}
               style={{ marginBottom: 10 }}
              keyboardShouldPersistTaps="handled">
               {[
                 { label: 'OPERACIONAL',         sType: 'success' },
                 { label: 'DISPONIVEL',          sType: 'success' },
                 { label: 'LOCADO',              sType: 'warning' },
                 { label: 'AGUARDANDO VISTORIA', sType: 'warning' },
                 { label: 'MANUTENCAO',          sType: 'danger'  },
                 { label: 'EM REFORMA',          sType: 'danger'  },
                 { label: 'INDISPONIVEL',        sType: 'danger'  },
                 { label: 'VENDIDO',             sType: 'default' },
                 { label: 'INATIVO',             sType: 'default' },
               ].map(({ label, sType }) => {
                 const isActive = editForm.status === label;
                 const dotColor = sType === 'success' ? '#10B981' : sType === 'warning' ? '#F59E0B' : sType === 'danger' ? '#EF4444' : '#94A3B8';
                 return (
                   <TouchableOpacity
                     key={label}
                     onPress={() => setEditForm({ ...editForm, status: label, statusType: sType })}
                     style={{
                       flexDirection: 'row', alignItems: 'center', gap: 6,
                       paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                       borderWidth: 1.5,
                       borderColor: isActive ? dotColor : C.border,
                       backgroundColor: isActive ? dotColor + '18' : C.background,
                     }}
                   >
                     <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} />
                     <Text style={{ fontSize: 10, fontWeight: '900', color: isActive ? dotColor : C.textSecondary, letterSpacing: 0.3 }}>{label}</Text>
                   </TouchableOpacity>
                 );
               })}
             </ScrollView>

             {/* ── Status customizados (locais, não afetam portal) ── */}
             {(editForm.customStatuses?.length > 0) && (
               <ScrollView
                 horizontal
                 showsHorizontalScrollIndicator={false}
                 contentContainerStyle={{ paddingRight: 8, gap: 8, flexDirection: 'row', alignItems: 'center' }}
                 style={{ marginBottom: 10 }}
                keyboardShouldPersistTaps="handled">
                 {((editForm.customStatuses as string[]) || []).map((label: string) => {
                   const isActive = editForm.status === label;
                   return (
                     <TouchableOpacity
                       key={label}
                       onPress={() => setEditForm({ ...editForm, status: label, statusType: 'custom' })}
                       onLongPress={() => {
                         Alert.alert(
                           label,
                           'Remover este status customizado?',
                           [
                             { text: 'Cancelar', style: 'cancel' },
                             { text: 'Remover', style: 'destructive', onPress: () => {
                               const next = ((editForm.customStatuses as string[]) || []).filter((s: string) => s !== label);
                               setEditForm({ ...editForm, customStatuses: next, status: editForm.status === label ? '' : editForm.status });
                             }}
                           ]
                         );
                       }}
                       style={{
                         flexDirection: 'row', alignItems: 'center', gap: 6,
                         paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                         borderWidth: 1.5, borderStyle: 'dashed',
                         borderColor: isActive ? C.slate : C.border,
                         backgroundColor: isActive ? C.slate + '18' : C.background,
                       }}
                     >
                       <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: isActive ? C.slate : C.border }} />
                       <Text style={{ fontSize: 10, fontWeight: '900', color: isActive ? C.slate : C.textSecondary, letterSpacing: 0.3 }}>{label}</Text>
                     </TouchableOpacity>
                   );
                 })}
               </ScrollView>
             )}

             <TouchableOpacity
               onPress={() => {
                 if (Platform.OS === 'ios') {
                   Alert.prompt(
                     'Status Customizado',
                     'Será salvo localmente e não afetará o portal.',
                     (text: string) => {
                       const label = text?.trim().toUpperCase();
                       if (!label) return;
                       const existing = (editForm.customStatuses as string[]) || [];
                       if (existing.includes(label)) return;
                       setEditForm({ ...editForm, customStatuses: [...existing, label] });
                     },
                     'plain-text'
                   );
                 } else {
                   // Android: use a simple Alert with manual input prompt workaround
                   const tmp = { value: '' };
                   Alert.alert(
                     'Status Customizado',
                     'Digite o nome no campo abaixo e confirme.',
                     [
                       { text: 'Cancelar', style: 'cancel' },
                       { text: 'Adicionar', onPress: () => {
                         const label = tmp.value.trim().toUpperCase();
                         if (!label) return;
                         const existing = (editForm.customStatuses as string[]) || [];
                         if (!existing.includes(label))
                           setEditForm({ ...editForm, customStatuses: [...existing, label] });
                       }},
                     ]
                   );
                 }
               }}
               style={{
                 flexDirection: 'row', alignItems: 'center', gap: 6,
                 alignSelf: 'flex-start',
                 paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                 borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.border,
                 marginBottom: 16,
               }}
             >
               <Ionicons name="add" size={13} color={C.textSecondary} />
               <Text style={{ fontSize: 10, fontWeight: '800', color: C.textSecondary }}>Adicionar status</Text>
             </TouchableOpacity>


             <View style={[styles.formSectionHeader, {marginTop: 16}]}>
                <Ionicons name="map-outline" size={18} color={C.slate} />
                <Text style={styles.formSectionTitle}>{t('newAsset.geolocation')}</Text>
             </View>

            <Text style={styles.modLabel}>{t('newAsset.postalCode')}</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0}]} value={editForm.cep} onChangeText={(t)=>changeForm({ cep:t})} placeholder="00000-000" keyboardType="numeric" maxLength={9} returnKeyType="done"
                      />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: C.accent}]} onPress={fetchCepData} disabled={fetchingCep}>
                  {fetchingCep ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight: '700'}}>{t('common.search')}</Text>}
               </TouchableOpacity>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.street')}</Text>
            <TextInput style={styles.modInput} value={editForm.street} onChangeText={(t)=>changeForm({ street:t})} placeholder={t('newAsset.streetPlaceholder')} returnKeyType="done"
                      />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.number')}</Text>
                  <TextInput style={styles.modInput} value={editForm.streetNumber} onChangeText={(t)=>changeForm({ streetNumber:t})} placeholder={t('newAsset.numberPlaceholder')} keyboardType="numeric" returnKeyType="done"
                      />
               </View>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>{t('newAsset.complement')}</Text>
                  <TextInput style={styles.modInput} value={editForm.complement} onChangeText={(t)=>changeForm({ complement:t})} placeholder={t('newAsset.complementPlaceholder')} returnKeyType="done"
                      />
               </View>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.neighborhood')}</Text>
            <TextInput style={styles.modInput} value={editForm.neighborhood} onChangeText={(t)=>changeForm({ neighborhood:t})} placeholder={t('newAsset.neighborhoodPlaceholder')} returnKeyType="done"
                      />

            <View style={{flexDirection: 'row', gap: 12}}>
               <View style={{flex: 2}}>
                  <Text style={styles.modLabel}>{t('newAsset.city')}</Text>
                  <TextInput style={styles.modInput} value={editForm.city} onChangeText={(t)=>changeForm({ city:t})} placeholder={t('newAsset.cityPlaceholder')} returnKeyType="done"
                      />
               </View>
               <View style={{flex: 1}}>
                  <Text style={styles.modLabel}>{t('newAsset.state')}</Text>
                  <TextInput style={styles.modInput} value={editForm.state} onChangeText={(t)=>changeForm({ state:t})} placeholder={t('newAsset.statePlaceholder')} maxLength={2} autoCapitalize="characters" returnKeyType="done"
                      />
               </View>
            </View>

            <Text style={styles.modLabel}>{t('newAsset.gpsSignature')}</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 20}}>
               <TextInput style={[styles.modInput, {flex: 1, marginBottom: 0, backgroundColor: '#f1f5f9'}]} value={editForm.gpsCoordinates} editable={false} placeholder={t('newAsset.gpsPlaceholder')} returnKeyType="done"
                      />
               <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#14B8A6'}]} onPress={fetchGps} disabled={fetchingGps}>
                  {fetchingGps ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
               </TouchableOpacity>
            </View>

            {/* HEADER Custom Fields */}
            <View style={[styles.formSectionHeader, {marginTop: 16, justifyContent: 'space-between', flexWrap: 'wrap', gap: 12}]}>
               <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
                 <Ionicons name="construct-outline" size={18} color={C.slate} />
                 <Text style={[styles.formSectionTitle, {flexShrink: 1, fontSize: 15}]} numberOfLines={1}>{t('newAsset.extraAttrs')}</Text>
               </View>
               <TouchableOpacity onPress={pickCustomFieldType} style={{backgroundColor: C.slate+'15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12}}>
                 <Text style={{color:C.slate, fontWeight:'800', fontSize: 11}}>+ {t('newAsset.includeAttr')}</Text>
               </TouchableOpacity>
            </View>

            {editForm.customFields.map((field: any, idx: number) => (
             <View key={idx} style={styles.customFieldPill}>
                <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8}}>
                   <Text style={{fontSize: 11, fontWeight: '800', color: C.slate, textTransform: 'uppercase'}}>
                      {t('newAsset.fieldType')}: {field.type === 'text' ? t('newAsset.textType') : field.type === 'number' ? t('newAsset.numericType') : t('newAsset.logicType')}
                   </Text>
                   <TouchableOpacity onPress={() => { const cf = [...editForm.customFields]; cf.splice(idx, 1); changeForm({ customFields: cf}); }}>
                      <Ionicons name="trash" size={16} color="#ef4444" />
                   </TouchableOpacity>
                </View>
                <TextInput 
                   style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 8, fontWeight:'700', backgroundColor: '#fff', borderColor: '#CBD5E1'}]} 
                   value={field.label} 
                   placeholder={t('newAsset.fieldNamePlaceholder')}
                   onChangeText={(t) => {
                      const cf = [...editForm.customFields]; cf[idx].label = t; changeForm({ customFields: cf});
                   }} 
                returnKeyType="done"
                      />
                {field.type === 'boolean' ? (
                   <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                      <Switch 
                         value={field.value} 
                         onValueChange={(v) => {
                            const cf = [...editForm.customFields]; cf[idx].value = v; changeForm({ customFields: cf});
                         }} 
                         trackColor={{ false: "#cbd5e1", true: C.slate }}
                      />
                      <Text style={{fontWeight: '700', color: field.value ? C.slate : C.textSecondary}}>
                         {field.value ? t('newAsset.boolTrue') : t('newAsset.boolFalse')}
                      </Text>
                   </View>
                ) : (
                   <TextInput 
                      style={[styles.modInput, {paddingVertical: 10, fontSize: 14, marginBottom: 0, backgroundColor: '#fff'}]} 
                      value={String(field.value)} 
                      placeholder={field.type === 'number' ? t('assetDetail.numericData') : t('assetDetail.freeTextData')}
                      keyboardType={field.type === 'number' ? 'numeric' : 'default'}
                      onChangeText={(t) => {
                         const cf = [...editForm.customFields]; cf[idx].value = t; changeForm({ customFields: cf});
                      }} 
                   returnKeyType="done"
                      />
                )}
             </View>
            ))}


            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                marginBottom: 16,
                padding: 14,
                backgroundColor: C.surfaceLow,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: C.border,
              }}
              onPress={() => setModulePickerVisible(true)}
            >
              <Ionicons name="layers-outline" size={20} color={C.primary} />
              <Text style={{ fontWeight: '800', color: C.primary, flex: 1, fontSize: 13 }}>{t('assetDetail.manageModules')}</Text>
              <Ionicons name="chevron-forward" size={18} color={C.border} />
            </TouchableOpacity>

            <Modal visible={modulePickerVisible} transparent animationType="slide" onRequestClose={() => setModulePickerVisible(false)}>
              <TouchableWithoutFeedback onPress={() => setModulePickerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
                  <TouchableWithoutFeedback>
                    <View style={{ backgroundColor: C.cardWhite, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, maxHeight: '85%' }}>
                      <Text style={{ fontSize: 16, fontWeight: '900', color: C.slate, marginBottom: 12 }}>{t('assetDetail.manageModules')}</Text>
                      <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                        {OPTIONAL_ASSET_MODULE_IDS.map((mid) => {
                          const lab = MODULE_I18N_BY_ID[mid];
                          return (
                          <View
                            key={mid}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 12,
                              borderBottomWidth: StyleSheet.hairlineWidth,
                              borderBottomColor: C.border,
                            }}
                          >
                            <View style={{ flex: 1, paddingRight: 12 }}>
                              <Text style={{ fontSize: 12, fontWeight: '800', color: C.slate }}>{t(lab.titleKey as any)}</Text>
                              <Text style={{ fontSize: 9, color: C.textSecondary, marginTop: 2 }} numberOfLines={2}>
                                {t(lab.subtitleKey as any)}
                              </Text>
                            </View>
                            <Switch
                              value={editForm.moduleVisibilityMap?.[mid] === true}
                              onValueChange={(v) =>
                                changeForm({
                                  moduleVisibilityMap: { ...(editForm.moduleVisibilityMap || {}), [mid]: v },
                                })
                              }
                              trackColor={{ false: C.border, true: C.primary }}
                            />
                          </View>
                        );
                        })}
                      </ScrollView>
                      <TouchableOpacity
                        style={[styles.saveBtn, { marginTop: 12, marginBottom: 8 }]}
                        onPress={() => setModulePickerVisible(false)}
                      >
                        <Text style={styles.saveBtnText}>{t('common.close')}</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableWithoutFeedback>
                </View>
              </TouchableWithoutFeedback>
            </Modal>

            <TouchableOpacity style={[styles.saveBtn, { marginBottom: 40 }]} onPress={handleSaveInfo}>
               <Ionicons name="checkmark-circle" size={24} color="#fff" style={{marginRight: 8}} />
               <Text style={styles.saveBtnText}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'docs':
        return (
          <DocumentModule assetId={asset.id} />
        );
      case 'media':
        return (
          <MediaModule assetId={asset.id} />
        );
      case 'maint':
        return (
          <View style={styles.modContainer}>
            <View style={styles.logRow}><View style={[styles.dot, {backgroundColor: C.success.text}]} /><Text style={[styles.logText, {fontSize: 11, textTransform: 'uppercase'}]}>{t('assetDetail.mock.oilChange')}</Text><Text style={styles.logTime}>{t('assetDetail.mock.twoDaysAgo')}</Text></View>
            <View style={styles.logRow}><View style={styles.dot} /><Text style={[styles.logText, {fontSize: 11, textTransform: 'uppercase'}]}>{t('assetDetail.mock.engineCalib')}</Text><Text style={styles.logTime}>{t('assetDetail.mock.march2026')}</Text></View>
            <TouchableOpacity style={[styles.saveBtn, {marginTop: 24, backgroundColor: C.accent, paddingVertical: 14}]} onPress={scheduleMaintenance}>
               <Text style={[styles.saveBtnText, {color: '#fff', fontSize: 13, letterSpacing: 0.5}]}>{t('assetDetail.issueWorkOrder')}</Text>
            </TouchableOpacity>
          </View>
        );
      case 'vault':
        return (
          <VaultModule
            assetId={asset.id}
            unlocked={vaultUnlocked}
            entries={vaultEntries}
            revealedIds={revealedIds}
            vaultModal={vaultModal}
            vaultForm={vaultForm}
            editEntry={editEntry}
            vaultPinModal={vaultPinModal}
            vaultPin={vaultPin}
            isExpoGo={isExpoGo}
            VAULT_PIN={VAULT_PIN}
            onLockOpen={async () => {
              const hasHardware = await LocalAuthentication.hasHardwareAsync();
              const isEnrolled = await LocalAuthentication.isEnrolledAsync();
              if (!hasHardware || !isEnrolled || isExpoGo) {
                setVaultPin('');
                setVaultPinModal(true);
                return;
              }
              const { success } = await LocalAuthentication.authenticateAsync({
                promptMessage: t('assetDetail.authVault'),
                cancelLabel: t('common.cancel'),
                fallbackLabel: t('assetDetail.usePin'),
              });
              if (success) {
                const data = await AssetVaultService.getEntries(asset.id, user?.email);
                setVaultEntries(data);
                setVaultUnlocked(true);
              } else {
                setVaultPin('');
                setVaultPinModal(true);
              }
            }}
            onToggleReveal={(id) => setRevealedIds(prev => {
              const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
            })}
            onOpenAdd={() => {
              setEditEntry(null);
              setVaultForm({ category: 'wifi', label: '', username: '', password: '', note: '' });
              setVaultModal(true);
            }}
            onOpenEdit={(e) => {
              setEditEntry(e);
              setVaultForm({ ...e });
              setVaultModal(true);
            }}
            onDelete={async (entryId) => {
              Alert.alert(t('assetDetail.deleteEntry'), t('assetDetail.deleteEntryMsg'), [
                { text: t('common.cancel'), style: 'cancel' },
                { text: t('common.delete'), style: 'destructive', onPress: async () => {
                  if (user?.email) {
                    await AssetVaultService.deleteEntry(asset.id, entryId, user.email);
                    setVaultEntries(await AssetVaultService.getEntries(asset.id, user.email));
                  }
                }},
              ]);
            }}
            onSave={async () => {
              if (!vaultForm.label?.trim() || !vaultForm.password?.trim()) {
                Alert.alert(t('common.attention'), t('assetDetail.fillNameAndPass')); return;
              }
              if (user?.email) {
                if (editEntry) {
                  await AssetVaultService.updateEntry(asset.id, editEntry.id, vaultForm as any, user.email);
                } else {
                  await AssetVaultService.saveEntry(asset.id, vaultForm as any, user.email);
                }
                setVaultEntries(await AssetVaultService.getEntries(asset.id, user.email));
              }
              setVaultModal(false);
            }}
            onPinInput={(k) => {
              const next = vaultPin + k;
              setVaultPin(next);
              if (next.length === 4) {
                if (next === VAULT_PIN) {
                  setVaultPinModal(false);
                  if (user?.email) {
                    AssetVaultService.getEntries(asset.id, user.email).then(data => {
                      setVaultEntries(data); setVaultUnlocked(true);
                    });
                  }
                } else {
                  Alert.alert(t('assetDetail.incorrectPin')); setVaultPin('');
                }
              }
            }}
            onPinDelete={() => setVaultPin(p => p.slice(0, -1))}
            onPinClose={() => setVaultPinModal(false)}
            onFormChange={(patch) => setVaultForm(f => ({ ...f, ...patch }))}
            onVaultModalClose={() => setVaultModal(false)}
          />
        );
      case 'costs': {
        const netValue   = costSummary ? (costSummary.totalRevenues - costSummary.totalExpenses) : 0;
        const totalExp   = costSummary?.totalExpenses ?? 0;
        const totalRev   = costSummary?.totalRevenues ?? 0;
        const totalBudg  = costSummary?.totalBudget   ?? 0;
        const totalStock = costSummary?.totalStockValue ?? 0;
        const budgPct    = Math.min((totalExp / (totalBudg || 1)) * 100, 100);
        const maxBar     = Math.max(totalExp, totalRev, 1);
        // pageW is measured from the ScrollView's actual frame via onLayout
        // This guarantees pagingEnabled snaps exactly to page boundaries
        const pageW = costContainerWidth;

         return (
          <View style={styles.modContainer}>

            {/* ── Scope toggle (only when asset has children) ── */}
            {children.length > 0 && (
              <View style={{ flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 20, padding: 2, marginBottom: 12, alignSelf: 'flex-start' }}>
                {(['consolidated', 'own'] as const).map(scope => {
                  const active = costScope === scope;
                  const label = scope === 'own' ? 'Este ativo' : `Consolidado (${children.length + 1})`;
                  return (
                    <TouchableOpacity
                      key={scope}
                      onPress={() => setCostScope(scope)}
                      style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 18, backgroundColor: active ? C.slate : 'transparent' }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: '900', color: active ? '#fff' : C.textSecondary }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* ── Header: pills + add button ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['Resumo', 'Receitas', 'Despesas'] as const).map((label, i) => (
                  <TouchableOpacity
                    key={i}
                    onPress={() => {
                      setCostPage(i);
                      costScrollRef.current?.scrollTo({ x: pageW * i, animated: true });
                    }}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
                      backgroundColor: costPage === i
                        ? (i === 1 ? '#10B981' : i === 2 ? '#EF4444' : C.slate)
                        : '#F1F5F9',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '900', color: costPage === i ? '#fff' : C.textSecondary, textTransform: 'uppercase' }}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── Menu Expansível de Custos Recorrentes ── */}
            {(() => {
              const filteredRes = assetRecurring.filter(r => {
                if (costPage === 1) return r.type === 'REVENUE';
                if (costPage === 2) return r.type === 'EXPENSE';
                return true;
              });

              if (filteredRes.length === 0) return null;

              const title = costPage === 1 ? 'Próximos Recebimentos' : costPage === 2 ? 'Próximos Vencimentos' : 'Custos Recorrentes';
              const icon = costPage === 1 ? 'trending-up-outline' : costPage === 2 ? 'trending-down-outline' : 'calendar-outline';
              const labelClr = costPage === 1 ? '#10B981' : costPage === 2 ? '#EF4444' : C.slate;

              return (
                <View style={{ marginBottom: 16 }}>
                  <TouchableOpacity 
                    onPress={() => setRecurringExpanded(!recurringExpanded)}
                    activeOpacity={0.7}
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: labelClr + '10', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name={icon as any} size={18} color={labelClr} />
                      </View>
                      <View>
                        <Text style={{ fontSize: 11, fontWeight: '900', color: labelClr, textTransform: 'uppercase' }}>{title}</Text>
                        <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '700' }}>{filteredRes.length} itens programados</Text>
                      </View>
                    </View>
                    <Ionicons name={recurringExpanded ? "chevron-up" : "chevron-down"} size={20} color={C.textSecondary} />
                  </TouchableOpacity>

                  {recurringExpanded && (
                    <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
                      {filteredRes.sort((a,b) => a.nextDueDate.localeCompare(b.nextDueDate)).map(r => {
                        const isRev = r.type === 'REVENUE';
                        const clr = isRev ? '#10B981' : '#EF4444';
                        const bg = isRev ? '#F0FDF4' : '#FFF5F5';
                        
                        const today = new Date(); today.setHours(0,0,0,0);
                        const days = Math.ceil((new Date(r.nextDueDate + 'T00:00:00').getTime() - today.getTime()) / 86400000);
                        const urgClr = days <= 3 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#64748B';

                        return (
                          <View key={r.id} style={{ backgroundColor: '#fff', borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: clr, overflow: 'hidden' }}>
                            <View style={{ padding: 16 }}>

                              {/* 1 — Descrição */}
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: 4 }}>
                                {r.description.toUpperCase()}
                              </Text>

                              {/* 2 — Categoria e Parcela */}
                              <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
                                {r.category} · {r.frequency}
                                {r.totalInstallments
                                  ? ` · ${t('costs.installment')} ${(r.totalInstallments - (r.remainingInstallments || 0)) + 1} de ${r.totalInstallments}`
                                  : ` · ${t('costs.continuousInfinity')}`}
                              </Text>

                              {/* 3 — Data vencimento + urgência */}
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                                <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                                  {formatDate(r.nextDueDate)}
                                </Text>
                                <Text style={{ fontSize: 11, color: urgClr, fontWeight: '800' }}>
                                  · {days === 0 ? 'Hoje' : days < 0 ? `${Math.abs(days)}d atraso` : `em ${days}d`}
                                </Text>
                              </View>

                              {/* 4 — Valor */}
                              <Text style={{ fontSize: 16, fontWeight: '900', color: clr, marginBottom: 12 }}>
                                {isRev ? '+' : '-'}{formatCurrency(r.amount)}
                              </Text>

                              {/* 5 — Botão Antecipar */}
                              <TouchableOpacity
                                onPress={() => handleAnticipateRec(r)}
                                activeOpacity={0.8}
                                style={{ backgroundColor: clr, borderRadius: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                              >
                                <Ionicons name="flash" size={14} color="#fff" />
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>ANTECIPAR</Text>
                              </TouchableOpacity>

                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* ── Paged horizontal scroll ──
                onLayout measures the REAL frame width so pagingEnabled snaps correctly.
                No marginHorizontal tricks needed. */}
            <ScrollView
              ref={costScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onLayout={(e) => setCostContainerWidth(e.nativeEvent.layout.width)}
              onMomentumScrollEnd={e => {
                const page = Math.round(e.nativeEvent.contentOffset.x / pageW);
                setCostPage(page);
              }}
            >
              {/* PAGE 0: RESUMO */}
              <View style={{ width: pageW, padding: 16 }}>
                {/* Saldo líquido */}
                <Text style={{ fontSize: 32, fontWeight: '900', letterSpacing: -1.5, marginBottom: 2, color: netValue >= 0 ? C.slate : '#EF4444' }}>
                  {formatCurrency(netValue)}
                </Text>
                <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16 }}>
                  {t('assetDetail.monthlyBalance')}
                </Text>

                {/* ── Gráfico por Categorias ── */}
                <Text style={{ fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, marginBottom: 10, textTransform: 'uppercase' }}>Por Categorias</Text>
                {(() => {
                  // Group records by category and sum amounts
                  const expCats: Record<string, number> = {};
                  allExpenseRecords.forEach(r => { expCats[r.category] = (expCats[r.category] || 0) + r.amount; });
                  const revCats: Record<string, number> = {};
                  allRevenueRecords.forEach(r => { revCats[r.category] = (revCats[r.category] || 0) + r.amount; });

                  const sortedExp = Object.entries(expCats).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const sortedRev = Object.entries(revCats).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const maxExpCat = Math.max(...sortedExp.map(([, v]) => v), 1);
                  const maxRevCat = Math.max(...sortedRev.map(([, v]) => v), 1);
                  const hasAny = sortedExp.length > 0 || sortedRev.length > 0;

                  const renderGroup = (
                    title: string,
                    items: [string, number][],
                    maxV: number,
                    color: string,
                    iconName: any,
                    totalVal: number,
                  ) => items.length === 0 ? null : (
                    <View style={{ marginBottom: 4 }}>
                      {/* Group header */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color + '20', justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name={iconName} size={12} color={color} />
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '900', color, letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text>
                        </View>
                        <Text style={{ fontSize: 11, fontWeight: '900', color }}>{formatCurrency(totalVal)}</Text>
                      </View>
                      {/* Category bars */}
                      {items.map(([cat, val], idx) => (
                        <View key={cat} style={{ marginBottom: idx < items.length - 1 ? 10 : 0 }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: C.slate, textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>{cat}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '900', color, marginLeft: 8 }}>{formatCurrency(val)}</Text>
                          </View>
                          <View style={{ height: 8, backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${Math.max((val / maxV) * 100, 4)}%`, backgroundColor: color, borderRadius: 4 }} />
                          </View>
                          <Text style={{ fontSize: 8, color: C.textSecondary, fontWeight: '700', textAlign: 'right', marginTop: 2 }}>
                            {((val / maxV) * 100).toFixed(0)}% do maior
                          </Text>
                        </View>
                      ))}
                    </View>
                  );

                  if (!hasAny) {
                    return (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center' }}>
                        <Ionicons name="stats-chart-outline" size={36} color="#CBD5E1" />
                        <Text style={{ fontSize: 12, color: C.textSecondary, marginTop: 10, fontWeight: '600', textAlign: 'center' }}>
                          {'Nenhum lançamento ainda.\nAdicione receitas e despesas para\nver o relatório por categorias.'}
                        </Text>
                      </View>
                    );
                  }

                  return (
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 16, marginBottom: 20 }}>
                      {renderGroup('Despesas', sortedExp, maxExpCat, '#EF4444', 'trending-down-outline' as any, totalExp)}
                      {sortedExp.length > 0 && sortedRev.length > 0 && (
                        <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 14 }} />
                      )}
                      {renderGroup('Receitas', sortedRev, maxRevCat, '#10B981', 'trending-up-outline' as any, totalRev)}
                    </View>
                  );
                })()}

                {/* ── Budget — sempre visível ── */}
                <Text style={{ fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, marginBottom: 10, textTransform: 'uppercase' }}>Budget Mensal</Text>
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 10, fontWeight: '900', color: C.slate, textTransform: 'uppercase' }}>Orçamento</Text>
                    <Text style={{ fontSize: 13, fontWeight: '900', color: totalBudg > 0 ? (budgPct >= 100 ? '#EF4444' : C.slate) : C.textLight }}>
                      {totalBudg > 0 ? formatCurrency(totalBudg) : 'Não definido'}
                    </Text>
                  </View>
                  {totalBudg > 0 ? (
                    <>
                      <View style={{ height: 12, backgroundColor: '#E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.max(budgPct, 2)}%`, backgroundColor: budgPct >= 100 ? '#EF4444' : budgPct >= 80 ? '#F59E0B' : '#10B981', borderRadius: 6 }} />
                      </View>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                        <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '700', textTransform: 'uppercase' }}>Gasto: {formatCurrency(totalExp)}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '900', color: budgPct >= 100 ? '#EF4444' : budgPct >= 80 ? '#F59E0B' : '#10B981', textTransform: 'uppercase' }}>{budgPct.toFixed(1)}% consumido</Text>
                      </View>
                    </>
                  ) : (
                    <TouchableOpacity onPress={() => { setBudgetLimit(''); setBudgetModalVisible(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Ionicons name="add-circle-outline" size={14} color={C.accent} />
                      <Text style={{ fontSize: 11, color: C.accent, fontWeight: '800' }}>Definir orçamento mensal</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── Valor em Estoque ── */}
                {totalStock > 0 && (
                  <View style={[styles.docRow, { marginBottom: 8 }]}>
                    <Ionicons name="cube-outline" size={16} color={C.accent} style={{ marginRight: 10 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '800', fontSize: 11, color: C.slate, textTransform: 'uppercase' }}>Valor em Estoque</Text>
                      <Text style={{ fontSize: 9, color: C.textSecondary, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 }}>Itens no local</Text>
                    </View>
                    <Text style={{ fontWeight: '900', color: C.accent, fontSize: 13 }}>{formatCurrency(totalStock)}</Text>
                  </View>
                )}

                {/* ── Espaço removido (agora no menu superior) ── */}
              </View>

              {/* ════ PAGE 1: RECEITAS ════ */}
              <View style={{ width: pageW, padding: 16 }}>
                {/* Summary header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, backgroundColor: '#ECFDF5', borderRadius: 14, padding: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="trending-up-outline" size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#065F46' }}>Receitas</Text>
                    <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '800' }}>{formatCurrency(totalRev)} · {allRevenueRecords.length} lançamentos</Text>
                  </View>
                </View>

                {/* ── Espaço removido (agora no menu superior) ── */}

                {/* Histórico */}
                {allRevenueRecords.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="cash-outline" size={48} color="#CBD5E1" />
                    <Text style={{ fontSize: 14, color: C.textSecondary, marginTop: 14, fontWeight: '700', textAlign: 'center' }}>
                      {'Nenhuma receita registrada.\nToque em + para adicionar.'}
                    </Text>
                  </View>
                ) : (() => {
                  // Group records by assetId: own asset first, then each child
                  const ownRecords = allRevenueRecords.filter(r => r.assetId === asset!.id);
                  const childGroups = costScope === 'consolidated'
                    ? children.map((c: Asset) => ({
                        child: c,
                        records: allRevenueRecords.filter(r => r.assetId === c.id),
                      })).filter(g => g.records.length > 0)
                    : [];

                  const reloadRevenues = () => {
                    const email = user?.email;
                    const assetIds = costScope === 'consolidated' ? [asset!.id, ...children.map((c: Asset) => c.id)] : [asset!.id];
                    const month = new Date().toISOString().substring(0, 7);
                    CostService.getExpenses(email).then(all => {
                      const mine = all.filter(e => assetIds.includes(e.assetId));
                      setAllRevenueRecords(mine.filter(e => e.type === 'REVENUE').sort((a, b) => b.date.localeCompare(a.date)));
                    });
                    (assetIds.length > 1 ? CostService.getConsolidatedSummary(assetIds, month, email) : CostService.getAssetCostSummary(asset!.id, month, email)).then(setCostSummary);
                  };

                  const renderRow = (rec: any, idx: number, accentColor = '#10B981') => {
                    const isPending = rec.status === 'PENDING';
                    const title = (rec.description && rec.description.trim()) ? rec.description : '';
                    const showCat = title.trim().toUpperCase() !== rec.category?.toUpperCase();
                    const bgColor = isPending ? '#FFFBEF' : '#fff';
                    const borderClr = isPending ? '#F59E0B' : accentColor;

                    return (
                      <View key={rec.id} style={{ backgroundColor: bgColor, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: borderClr, overflow: 'hidden' }}>
                        <TouchableOpacity onLongPress={() => handleRecordRowPress(rec)} delayLongPress={350} activeOpacity={0.75}
                          style={{ padding: 16 }}>

                          {/* 1 — Descrição */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: title ? 4 : 0 }}>
                            {(title || rec.category || 'LANÇAMENTO').toUpperCase()}
                          </Text>

                          {/* 2 — Categoria (só se diferente da descrição) */}
                          {title !== '' && showCat && rec.category ? (
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
                              {rec.category}
                            </Text>
                          ) : <View style={{ marginBottom: 8 }} />}

                          {/* 3 — Datas */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                              {formatDate(rec.date)}
                            </Text>
                            {rec.paidAt && (
                              <>
                                <Text style={{ fontSize: 11, color: '#CBD5E1', fontWeight: '600' }}>/</Text>
                                <Ionicons name="checkmark-circle-outline" size={12} color="#10B981" />
                                <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>{formatDate(rec.paidAt)}</Text>
                              </>
                            )}
                          </View>

                          {/* 4 — Valor */}
                          <Text style={{ fontSize: 16, fontWeight: '900', color: isPending ? '#D97706' : accentColor, marginBottom: 12 }}>
                            +{formatCurrency(rec.amount)}
                          </Text>

                          {/* 5 — Botão de ação */}
                          {isPending ? (
                            <TouchableOpacity
                               onPress={() => {
                                 if (user?.email) {
                                   CostService.markAsRealized(rec.id, user.email).then(reloadRevenues);
                                 }
                               }}
                              activeOpacity={0.8}
                              style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <Ionicons name="checkmark-circle" size={15} color="#fff" />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>PENDENTE</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={{ backgroundColor: '#D1FAE5', borderRadius: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#065F46' }}>REALIZADO</Text>
                            </View>
                          )}

                        </TouchableOpacity>
                      </View>
                    );
                  };

                  return (
                    <View>
                      {/* Own asset records (no header needed) */}
                      {ownRecords.map((rec, idx) => renderRow(rec, idx))}

                      {/* Child asset groups with named headers */}
                      {childGroups.map(({ child, records }) => (
                        <View key={child.id} style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#D1FAE5', overflow: 'hidden' }}>
                          {/* Card header — top of the unified card */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#ECFDF5', paddingHorizontal: 12, paddingVertical: 8 }}>
                            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' }}>
                              <Ionicons name="git-branch-outline" size={13} color="#fff" />
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '900', color: '#065F46', flex: 1 }} numberOfLines={1}>{child.title}</Text>
                            <Text style={{ fontSize: 10, color: '#10B981', fontWeight: '700' }}>{records.length} lançamento{records.length !== 1 ? 's' : ''}</Text>
                          </View>
                          {/* Card body — records without outer borderRadius so they attach to the header */}
                          {records.map((rec, idx) => renderRow(rec, idx))}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>

              {/* ════ PAGE 2: DESPESAS ════ */}
              <View style={{ width: pageW, padding: 16 }}>
                {/* Summary header */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' }}>
                    <Ionicons name="trending-down-outline" size={22} color="#EF4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#7F1D1D' }}>Despesas</Text>
                    <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>{formatCurrency(totalExp)} · {allExpenseRecords.length} lançamentos</Text>
                  </View>
                </View>

                {/* ── Espaço removido (agora no menu superior) ── */}

                {/* Histórico */}
                {allExpenseRecords.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                    <Ionicons name="receipt-outline" size={48} color="#CBD5E1" />
                    <Text style={{ fontSize: 14, color: C.textSecondary, marginTop: 14, fontWeight: '700', textAlign: 'center' }}>
                      {'Nenhuma despesa registrada.\nToque em + para adicionar.'}
                    </Text>
                  </View>
                ) : (() => {
                  const ownRecords = allExpenseRecords.filter(r => r.assetId === asset!.id);
                  const childGroups = costScope === 'consolidated'
                    ? children.map((c: Asset) => ({
                        child: c,
                        records: allExpenseRecords.filter(r => r.assetId === c.id),
                      })).filter(g => g.records.length > 0)
                    : [];

                  const reloadExpenses = () => {
                    const email = user?.email;
                    const assetIds = costScope === 'consolidated' ? [asset!.id, ...children.map((c: Asset) => c.id)] : [asset!.id];
                    const month = new Date().toISOString().substring(0, 7);
                    CostService.getExpenses(email).then(all => {
                      const mine = all.filter(e => assetIds.includes(e.assetId));
                      setAllExpenseRecords(mine.filter(e => e.type === 'EXPENSE').sort((a, b) => b.date.localeCompare(a.date)));
                    });
                    (assetIds.length > 1 ? CostService.getConsolidatedSummary(assetIds, month, email) : CostService.getAssetCostSummary(asset!.id, month, email)).then(setCostSummary);
                  };

                  const renderRow = (rec: any, idx: number) => {
                    const isPending = rec.status === 'PENDING';
                    const title = (rec.description && rec.description.trim()) ? rec.description : '';
                    const showCat = title.trim().toUpperCase() !== rec.category?.toUpperCase();
                    const bgColor = isPending ? '#FFFBEF' : '#fff';

                    return (
                      <View key={rec.id} style={{ backgroundColor: bgColor, borderRadius: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', borderLeftWidth: 4, borderLeftColor: isPending ? '#F59E0B' : '#EF4444', overflow: 'hidden' }}>
                        <TouchableOpacity onLongPress={() => handleRecordRowPress(rec)} delayLongPress={350} activeOpacity={0.75}
                          style={{ padding: 16 }}>

                          {/* 1 — Descrição */}
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0F172A', marginBottom: title ? 4 : 0 }}>
                            {(title || rec.category || 'LANÇAMENTO').toUpperCase()}
                          </Text>

                          {/* 2 — Categoria (só se diferente da descrição) */}
                          {title !== '' && showCat && rec.category ? (
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600', marginBottom: 8, textTransform: 'uppercase' }}>
                              {rec.category}
                            </Text>
                          ) : <View style={{ marginBottom: 8 }} />}

                          {/* 3 — Datas */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <Ionicons name="calendar-outline" size={12} color="#94A3B8" />
                            <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                              {formatDate(rec.date)}
                            </Text>
                            {rec.paidAt && (
                              <>
                                <Text style={{ fontSize: 11, color: '#CBD5E1', fontWeight: '600' }}>/</Text>
                                <Ionicons name="checkmark-circle-outline" size={12} color="#10B981" />
                                <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>{formatDate(rec.paidAt)}</Text>
                              </>
                            )}
                          </View>

                          {/* 4 — Valor */}
                          <Text style={{ fontSize: 16, fontWeight: '900', color: isPending ? '#D97706' : '#EF4444', marginBottom: 12 }}>
                            -{formatCurrency(rec.amount)}
                          </Text>

                          {/* 5 — Botão de ação */}
                          {isPending ? (
                            <TouchableOpacity
                               onPress={() => {
                                 if (user?.email) {
                                   CostService.markAsRealized(rec.id, user.email).then(reloadExpenses);
                                 }
                               }}
                              activeOpacity={0.8}
                              style={{ backgroundColor: '#F59E0B', borderRadius: 10, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                            >
                              <Ionicons name="checkmark-circle" size={15} color="#fff" />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>PENDENTE</Text>
                            </TouchableOpacity>
                          ) : (
                            <View style={{ backgroundColor: '#FEE2E2', borderRadius: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <Ionicons name="checkmark-circle" size={14} color="#EF4444" />
                              <Text style={{ fontSize: 11, fontWeight: '800', color: '#991B1B' }}>REALIZADO</Text>
                            </View>
                          )}

                        </TouchableOpacity>
                      </View>
                    );
                  };

                  return (
                    <View>
                      {ownRecords.map((rec, idx) => renderRow(rec, idx))}
                      {childGroups.map(({ child, records }) => (
                        <View key={child.id} style={{ marginTop: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', paddingHorizontal: 12, paddingVertical: 8 }}>
                            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' }}>
                              <Ionicons name="git-branch-outline" size={13} color="#fff" />
                            </View>
                            <Text style={{ fontSize: 12, fontWeight: '900', color: '#7F1D1D', flex: 1 }} numberOfLines={1}>{child.title}</Text>
                            <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '700' }}>{records.length} lançamento{records.length !== 1 ? 's' : ''}</Text>
                          </View>
                          {records.map((rec, idx) => renderRow(rec, idx))}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </ScrollView>

            {/* ── Dot page indicators ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 16, paddingBottom: 4 }}>
              {[0, 1, 2].map(i => (
                <TouchableOpacity key={i} onPress={() => { setCostPage(i); costScrollRef.current?.scrollTo({ x: pageW * i, animated: true }); }}>
                  <View style={{ width: costPage === i ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: costPage === i ? (i === 1 ? '#10B981' : i === 2 ? '#EF4444' : C.slate) : '#CBD5E1' }} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        );
      }
      case 'hier': {
        // Load persisted locations + build groups
        const persistedLocs = getAssetLocations(asset!.id);

        // Build a map: locationKey -> { location, items }
        type GroupItem = { id: string; title: string; type: string; imageUrl?: string; details?: { photos?: string[] } };
        type LocGroup = { location: AssetLocation | null; items: GroupItem[] };
        const groupMap: Record<string, LocGroup> = {};

        // Pre-populate with all persisted locations (even empty ones)
        persistedLocs.forEach(loc => {
          const key = `${loc.floor}__${loc.room}`;
          if (!groupMap[key]) groupMap[key] = { location: loc, items: [] };
        });

        // Fill items from children subLocation
        children.forEach(c => {
          const groupItem = {
            id: c.id,
            title: c.title,
            type: c.type,
            imageUrl: c.imageUrl,
            details: c.details?.photos ? { photos: c.details.photos } : undefined,
          };
          if (c.subLocation) {
            const key = `${c.subLocation.floor}__${c.subLocation.room}`;
            if (!groupMap[key]) {
              const loc = saveAssetLocation({ id: Math.random().toString(36).substring(2, 10), assetId: asset.id, floor: c.subLocation.floor, room: c.subLocation.room, icon: c.subLocation.icon || 'location-outline' }, user?.email || '');
              groupMap[key] = { location: loc, items: [] };
            }
            groupMap[key].items.push(groupItem);
          } else {
            if (!groupMap['__no_location__']) groupMap['__no_location__'] = { location: null, items: [] };
            groupMap['__no_location__'].items.push(groupItem);
          }
        });

        const groupKeys = Object.keys(groupMap).sort(a => a === '__no_location__' ? 1 : -1);

        return (
          <View style={styles.modContainer}>

            {/* Empty state */}
            {Object.keys(groupMap).length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#F0F9FF', justifyContent: 'center', alignItems: 'center', marginBottom: 14 }}>
                  <Ionicons name="map-outline" size={34} color={C.primary} />
                </View>
                <Text style={{ fontSize: 14, fontWeight: '900', color: '#191C1D', marginBottom: 6 }}>
                  Nenhum local cadastrado
                </Text>
                <Text style={{ fontSize: 12, color: '#70797C', fontWeight: '600', textAlign: 'center', lineHeight: 18 }}>
                  Crie um local e depois vincule{'\n'}os bens que estão nele.
                </Text>
              </View>
            )}

            {/* Location groups */}
            {groupKeys.length > 0 && (
              <View style={{ gap: 12, marginBottom: 16 }}>
                {groupKeys.map(key => {
                  const group = groupMap[key];
                  return (
                    <LocationGroupCard
                      key={key}
                      group={group}
                      onItemPress={c => router.push(`/asset/${c.id}` as any)}
                      onAddChild={() => {
                        setPendingGroupLocation(group.location ? { floor: group.location.floor, room: group.location.room, icon: group.location.icon } : null);
                        setLinkSearch('');
                        setLinkMode('child');
                        setLinkModalVisible(true);
                      }}
                      onUnlinkItem={c => {
                        Alert.alert(t('appAlerts.asset.unlinkTitle'), t('appAlerts.asset.unlinkBody', { title: c.title }), [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('appAlerts.asset.unlinkButton'), style: 'destructive', onPress: () => {
                            if (user?.email) {
                              updateAssetParent(c.id, null, user.email);
                              logAssetHistory(asset.id, 'Desvinculação', `${c.title} foi desvinculado`, user.email);
                              loadAssetData();
                            }
                          }}
                        ]);
                      }}
                      onDeleteLocation={group.location ? () => {
                        const loc = group.location!;
                        if (loc.isStock) {
                          Alert.alert(
                            t('appAlerts.asset.deleteStockRoomTitle'),
                            t('appAlerts.asset.deleteStockRoomBody', { room: loc.room }),
                            [{ text: t('appAlerts.asset.stockLocationOk'), style: 'cancel' }]
                          );
                          return;
                        }
                        Alert.alert(t('appAlerts.asset.deleteRoomTitle'), t('appAlerts.asset.deleteRoomBody', { room: loc.room }), [
                          { text: t('common.cancel'), style: 'cancel' },
                          { text: t('common.delete'), style: 'destructive', onPress: () => { 
                            if (user?.email) {
                              deleteAssetLocation(loc.id, user.email); 
                              loadAssetData(); 
                            }
                          }}
                        ]);
                      } : undefined}
                    />
                  );
                })}
              </View>
            )}

            {/* Add new location button */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, borderRadius: 16, paddingVertical: 16, backgroundColor: '#F0F9FF' }}
              onPress={() => setCreateLocVisible(true)}
            >
              <Ionicons name="add-circle-outline" size={20} color={C.primary} />
              <Text style={{ fontSize: 13, fontWeight: '900', color: C.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Novo Local
              </Text>
            </TouchableOpacity>

            {/* Picker to create a new location (maxStep=2: no notes step) */}
            <SubLocationPicker
              visible={createLocVisible}
              parentType={asset?.type || 'OTHER'}
              maxStep={2}
              confirmLabel="Criar Local →"
              onConfirm={loc => {
                setCreateLocVisible(false);
                if (user?.email) {
                  const saved = saveAssetLocation({ id: Math.random().toString(36).substring(2, 10), assetId: asset.id, floor: loc.floor, room: loc.room, icon: loc.icon || 'location-outline' }, user.email);
                  setPendingGroupLocation({ floor: saved.floor, room: saved.room, icon: saved.icon });
                  setLinkSearch('');
                  setLinkMode('child');
                  setLinkModalVisible(true);
                }
              }}
              onClose={() => setCreateLocVisible(false)}
            />

          </View>
        );
      }
      case 'history':
        return (
          <View style={styles.modContainer}>
             {historyLogs.length === 0 ? (
                <Text style={{color: C.textSecondary, textAlign: 'center', marginTop: 24, fontStyle: 'italic'}}>{t('assetDetail.noHistory')}</Text>
             ) : (
                historyLogs.map((log: any, idx: number) => (
                    <View key={idx} style={styles.logRow}>
                       <View style={[styles.dot, {backgroundColor: C.slate}]} />
                       <View style={{flex: 1, marginLeft: 12}}>
                          <Text style={[styles.logText, {fontSize: 11, textTransform: 'uppercase'}]}>{log.action}</Text>
                          <Text style={{fontSize: 9, color: C.textSecondary, marginTop: 2, lineHeight: 14, fontWeight: '700', textTransform: 'uppercase'}}>{log.details}</Text>
                       </View>
                       <Text style={styles.logTime}>{formatDate(log.created_at)}</Text>
                    </View>
                ))
             )}
          </View>
        );
      case 'ai':
        return (
          <AIConsultantModule assetId={asset.id} assetType={asset.type} />
        );
      case 'insurance':
        return (
          <InsuranceModule assetId={asset.id} assetType={asset.type} />
        );
      case 'warranties':
        return <WarrantiesContractsModule assetId={asset.id} />;
      case 'compliance':
        return <ComplianceCertModule assetId={asset.id} />;
      case 'readings':
        return <ReadingsConsumptionModule assetId={asset.id} />;
      case 'valuation':
        return <ValuationDepreciationModule assetId={asset.id} />;
      case 'serviceHistory':
        return <ServiceUsageHistoryModule assetId={asset.id} />;
      case 'agenda':
        return <AssetAgendaShortcutModule assetId={asset.id} />;
      case 'stock':
        return (
          <StockModule assetId={asset.id} />
        );
      default: 
        return (
          <View style={styles.modContainer}>
            <Text style={{color: C.textSecondary, textAlign: 'center', marginTop: 24, lineHeight: 22, fontStyle: 'italic', fontWeight: '500'}}>{t('assetDetail.restrictedModule')}</Text>
          </View>
        );
    }
  };

  const renderGlobalFab = () => {
    if (!activeModule) return null;
    const allowedModules = ['stock', 'docs', 'insurance', 'vault', 'costs'];
    if (!allowedModules.includes(activeModule)) return null;

    const handlePress = () => {
      if (activeModule === 'costs') {
        setAddMenuVisible(true);
      } else if (activeModule === 'vault') {
        setEditEntry(null);
        setVaultForm({ category: 'wifi', label: '', username: '', password: '', note: '' });
        setVaultModal(true);
      } else {
        DeviceEventEmitter.emit('FAB_ADD_PRESSED');
      }
    };

    return (
      <TouchableOpacity 
        style={styles.fab}
        activeOpacity={0.8}
        onPress={handlePress}
      >
        <Ionicons name="add" size={32} color="#fff" />
      </TouchableOpacity>
    );
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !(isDirty && activeModule === 'info') }} />

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* FIXED ASSET HEADER */}
        {asset && (() => {
          const typeIcon = getAssetRootIconColor(asset.type);
          const iconName = asset.details?.customIcon || typeIcon.icon;
          const iconColor = asset.details?.customColor || typeIcon.color;
          return (
            <View style={{ flexDirection: 'row', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            <TouchableOpacity
              style={{ position: 'relative' }}
              onPress={() => Alert.alert(
                'Alterar visual do ativo',
                'Escolha como personalizar',
                [
                  { text: 'Escolher ícone', onPress: () => handleUpdateAvatar('icon') },
                  { text: 'Câmera', onPress: () => handleUpdateAvatar('camera') },
                  { text: 'Galeria', onPress: () => handleUpdateAvatar('gallery') },
                  ...(asset.details?.customIcon || asset.imageUrl ? [{ text: 'Remover personalização', style: 'destructive' as const, onPress: () => handleUpdateAvatar('remove') }] : []),
                  { text: 'Cancelar', style: 'cancel' },
                ]
              )}
            >
              <View style={{ width: 72, height: 72, borderRadius: 18, backgroundColor: iconColor + '18', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {asset.imageUrl
                  ? <Image source={{ uri: asset.imageUrl }} style={{ width: 72, height: 72 }} />
                  : <Ionicons name={iconName as any} size={34} color={iconColor} />}
              </View>
              <View style={{ position: 'absolute', bottom: -4, right: -4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' }}>
                <Ionicons name="pencil" size={11} color="#fff" />
              </View>
            </TouchableOpacity>
              <View style={{ marginLeft: 16, flex: 1 }}>
                <Text style={{ fontSize: 20, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>{asset.title}</Text>
                {activeModule && (() => {
                  const mod = MODULES.find(m => m.id === activeModule);
                  if (!mod) return <Text style={{ fontSize: 13, color: '#70797C', fontWeight: '500', marginTop: 2 }}>{asset.details?.city || 'Brasil'}, {asset.details?.state || 'BR'}</Text>;
                  return (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                      <Ionicons name={mod.icon as any} size={11} color={mod.color} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontWeight: '900', color: mod.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>{mod.title}</Text>
                    </View>
                  );
                })()}
                {!activeModule && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <View style={{ backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="barcode-outline" size={10} color="#64748B" />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', letterSpacing: 0.5 }}>#{asset.details?.inventoryId || asset.id.slice(-4).toUpperCase()}</Text>
                    </View>
                    <View style={{ backgroundColor: '#F0FFF4', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="git-branch-outline" size={10} color="#15803D" />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#166534', letterSpacing: 0.5 }}>{children.length + (asset.parentId ? 1 : 0)} VÍNCULOS</Text>
                    </View>
                  </View>
                )}
              </View>
            </View>
          );
        })()}
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={true}
       keyboardShouldPersistTaps="handled">





        {activeModule && activeModule !== 'ai' && (
          <View style={styles.innerModuleView}>
             {renderModuleContent()}
          </View>
        )}

        {!activeModule && asset && (() => {
          const typeLabel = t(`asset.type.${asset.type}`);
          const totalExp = costSummary?.totalExpenses ?? 0;
          const totalRev = costSummary?.totalRevenues ?? 0;
          const net = totalRev - totalExp;
          const recentLogs = historyLogs.slice(0, 3);

          return (

            <View style={{ backgroundColor: '#fff', flex: 1 }}>
              {/* Profile Header (Moved to fixed top) */}


              {/* Metric Cards */}
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 }}>
                {(() => {
                  const acqVal = parseFloat(asset.details?.acquisitionValue) || 0;
                  const totalInvested = acqVal + totalExp;
                  const pendingCount = allExpenseRecords.filter(r => r.status === 'PENDING').length;
                  
                  return (
                    <>
                      {/* Total Investido */}
                      <View style={{ flex: 1, height: 100, backgroundColor: '#DCFCE7', borderRadius: 20, padding: 14, justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#166534', lineHeight: 15 }}>Investimento Total</Text>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: '#14532D', letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrencyShort(totalInvested)}</Text>
                      </View>
                      
                      {/* Custos Totais */}
                      <View style={{ flex: 1, height: 100, backgroundColor: '#FEF2F2', borderRadius: 20, padding: 14, justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#991B1B', lineHeight: 15 }}>Saídas Acumuladas</Text>
                        <Text style={{ fontSize: 17, fontWeight: '900', color: '#7F1D1D', letterSpacing: -0.5 }} numberOfLines={1} adjustsFontSizeToFit>{formatCurrencyShort(totalExp)}</Text>
                      </View>
                      
                      {/* Alertas/Pendências */}
                      <View style={{ flex: 1, height: 100, backgroundColor: pendingCount > 0 ? '#FEF3C7' : '#F1F5F9', borderRadius: 20, padding: 14, justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: pendingCount > 0 ? '#B45309' : '#64748B', lineHeight: 15 }}>Pendências</Text>
                        <Text style={{ fontSize: 15, fontWeight: '900', color: pendingCount > 0 ? '#92400E' : '#475569', letterSpacing: -0.5 }} numberOfLines={2} adjustsFontSizeToFit>
                          {pendingCount > 0 ? `${pendingCount} fatura${pendingCount !== 1 ? 's' : ''}` : 'Em dia'}
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </View>

              {/* Fast Actions Menu */}
              <View style={{ flexDirection: 'row', paddingHorizontal: 20, marginBottom: 20, gap: 10 }}>
                {/* Assistente */}
                <TouchableOpacity onPress={() => setAiModalVisible(true)} style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                  <Ionicons name="sparkles" size={15} color="#4F46E5" />
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#334155' }}>ASSISTENTE</Text>
                </TouchableOpacity>

                {/* Selo */}
                <TouchableOpacity onPress={() => setQrModalVisible(true)} style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                  <Ionicons name="barcode-outline" size={15} color="#475569" />
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#334155' }}>SELO QR</Text>
                </TouchableOpacity>

                {/* Compartilhar */}
                <TouchableOpacity onPress={() => router.push(`/asset/share?id=${asset.id}` as any)} style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: '#F1F5F9' }}>
                  <Ionicons name="people-outline" size={15} color="#475569" />
                  <Text style={{ fontSize: 10, fontWeight: '900', color: '#334155' }}>ENVIAR</Text> 
                </TouchableOpacity>
              </View>

              {/* Module List Section (Mapped from official MODULES) */}
              <View style={{ paddingHorizontal: 20, paddingBottom: 100, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
                {visibleModules.map((item, idx) => {
                  let sub = '';
                  if (item.id === 'maint') sub = 'Última há 2 dias';
                  else if (item.id === 'costs') sub = (costSummary?.totalBudget ?? 0) > 0 ? `Consumo: ${((totalExp / costSummary!.totalBudget!) * 100).toFixed(0)}% do budget` : 'Gestão de despesas';
                  else if (item.id === 'docs') {
                     const fileCount = documents.filter(d => d.type !== 'folder').length;
                     sub = fileCount === 1 ? '1 arquivo anexado' : `${fileCount} arquivos anexados`;
                  }
                  else if (item.id === 'info') sub = 'Dados técnicos';
                  else sub = item.subtitle;

                  return (
                    <TouchableOpacity 
                      key={item.id} 
                      style={{ 
                        width: '48%', 
                        flexDirection: 'row', 
                        alignItems: 'center', 
                        backgroundColor: '#fff', 
                        borderRadius: 12, 
                        paddingVertical: 14,
                        paddingHorizontal: 12, 
                        borderWidth: 1, 
                        borderColor: '#E2E8F0',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.03,
                        shadowRadius: 4,
                        elevation: 1
                      }}
                      onPress={() => selectModule(item.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name={item.icon as any} size={22} color={item.color} style={{ marginRight: 10 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', lineHeight: 15 }}>{item.title}</Text>
                        <Text style={{ fontSize: 9, color: '#64748B', fontWeight: '600', marginTop: 2 }} numberOfLines={1}>{sub}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Delete discreto */}
              <TouchableOpacity
                onPress={handleSoftDelete}
                style={{ alignItems: 'center', paddingVertical: 24, marginTop: 8, gap: 6 }}
                activeOpacity={0.6}
              >
                <Ionicons name="trash-outline" size={18} color="#CBD5E1" />
                <Text style={{ fontSize: 11, color: '#CBD5E1', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Excluir ativo
                </Text>
              </TouchableOpacity>

            </View>
          );
        })()}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* Global Module FAB */}
      {renderGlobalFab()}

      {/* AI Chat Modal Flutuante */}
      <Modal visible={aiModalVisible} animationType="slide" presentationStyle="pageSheet">
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.background }}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.cardWhite }}>
                <TouchableOpacity onPress={() => setAiModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="chevron-down" size={26} color={C.slate} />
                </TouchableOpacity>
                <Ionicons name="sparkles" size={20} color="#A855F7" style={{ marginLeft: 12 }} />
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.slate, marginLeft: 8, flex: 1 }}>{t('assetDetail.aiConsultant')}</Text>
                <Text style={{ fontSize: 11, color: C.textSecondary, fontWeight: '700' }}>{asset?.title}</Text>
              </View>
              <AIConsultantModule assetId={asset!.id} assetType={asset!.type} onClose={() => setAiModalVisible(false)} />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </GestureHandlerRootView>
      </Modal>

      <Modal visible={qrModalVisible} transparent animationType="fade">
         <View style={{flex:1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 20}}>
            <View style={{backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center', position: 'relative'}}>
               <TouchableOpacity onPress={()=>setQrModalVisible(false)} style={{position: 'absolute', top: 16, right: 16, zIndex:10}}>
                  <Ionicons name="close" size={28} color={C.textSecondary}/>
               </TouchableOpacity>
               
               <Text style={{fontSize: 16, fontWeight: '900', color: C.slate, marginBottom: 24, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.8}}>{t('assetDetail.qrTitle')}</Text>
               
               <View style={{backgroundColor: '#F8FAFC', padding: 16, borderRadius: 16, borderWidth: 2, borderColor: C.slate, marginBottom: 24}}>
                  <QRCode value={asset.id} size={220} getRef={(c) => { svgRef.current = c; }} color="#000000" backgroundColor="#FFFFFF" />
               </View>

               <Text style={{textAlign: 'center', marginBottom: 24, color: C.textSecondary, fontWeight: '600', fontSize: 13, lineHeight: 18}}>{t('assetDetail.qrMsg')}</Text>
               
               <TouchableOpacity style={[styles.saveBtn, {marginTop: 0, width: '100%', paddingVertical: 14}]} onPress={shareQRCode}>
                  <Ionicons name="share-social" size={20} color="#fff" style={{marginRight: 8}} />
                  <Text style={styles.saveBtnText}>{t('assetDetail.exportHD')}</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

      {/* Modal de Vínculo de Ativo Existente */}
      <Modal visible={linkModalVisible} transparent={true} animationType="slide">
        <View style={{flex:1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end'}}>
           <View style={{backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', padding: 20}}>
              <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                <Text style={{fontSize: 20, fontWeight: '900', color: C.slate}}>{linkMode === 'parent' ? t('assetDetail.linkParentTitle') : t('assetDetail.linkExistingTitle')}</Text>
                <TouchableOpacity onPress={() => setLinkModalVisible(false)}>
                  <Ionicons name="close-circle" size={28} color={C.textLight} />
                </TouchableOpacity>
              </View>

              <View style={{flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, marginBottom: 16}}>
                <Ionicons name="search" size={18} color={C.textLight} style={{marginRight: 8}} />
                <TextInput
                  style={{flex: 1, height: 44, fontSize: 15, color: C.slate, fontWeight: '600'}}
                  placeholder={t('assetDetail.searchToLink')}
                  placeholderTextColor={C.textLight}
                  value={linkSearch}
                  onChangeText={setLinkSearch}
                returnKeyType="done"
                      />
              </View>

              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {(() => {
                  const ancestorIds = new Set(ancestors.map(anc => anc.id));
                  const available = getLocalAssets(user?.email || '', { includeMobileWarehouse: false }).filter((a) => {
                    // Exclui o próprio ativo
                    if (a.id === asset.id) return false;
                    // Exclui quem já é filho direto
                    if (a.parentId === asset.id) return false;
                    // Exclui todos os ancestrais para evitar loop circular
                    if (ancestorIds.has(a.id)) return false;
                    // Filtro de ativos excluídos (Redundância de segurança)
                    if (a.deletedAt) return false;
                    // Filtro de busca
                    if (linkSearch && !a.title.toLowerCase().includes(linkSearch.toLowerCase())) return false;
                    return true;
                  });

                  // Ordenar: Disponíveis primeiro (sem pai)
                  const sorted = [...available].sort((x, y) => {
                    if (!x.parentId && y.parentId) return -1;
                    if (x.parentId && !y.parentId) return 1;
                    return 0;
                  });

                  if (available.length === 0) {
                    return <Text style={{textAlign: 'center', color: C.textSecondary, marginTop: 40, fontStyle: 'italic'}}>{t('assetDetail.noAssetsAvailable')}</Text>;
                  }

                  return sorted.map(a => (
                    <TouchableOpacity
                      key={a.id}
                      style={{
                        flexDirection: 'row', alignItems: 'center', padding: 15,
                        backgroundColor: '#F8FAFC', borderRadius: 12, marginBottom: 10,
                        borderWidth: 1.2, borderColor: C.border,
                        opacity: a.parentId ? 0.6 : 1
                      }}
                      onPress={() => {
                        let confirmTitle = t('assetDetail.confirmLink');
                        let confirmMsg = '';
                        let childId = '';
                        let parentId = '';

                        if (linkMode === 'child') {
                           childId = a.id;
                           parentId = asset.id;
                           confirmMsg = a.parentId 
                              ? t('assetDetail.confirmReLinkMsg', { child: a.title, oldParent: a.parentTitle, newParent: asset.title })
                              : t('assetDetail.confirmLinkMsg', { child: a.title, parent: asset.title });
                         } else {
                           // Linking CURRENT as child of SELECTED
                           childId = asset.id;
                           parentId = a.id;
                           confirmMsg = t('assetDetail.confirmParentLinkMsg', { child: asset.title, parent: a.title });
                         }

                         Alert.alert(confirmTitle, confirmMsg, [
                           { text: t('common.cancel'), style: 'cancel' },
                           { text: t('assetDetail.linkBtn'), onPress: async () => {
                             try {
                               updateAssetParent(childId, parentId, user?.email || '');
                               logAssetHistory(asset.id, t('assetDetail.hierarchyLink'), t('assetDetail.hierarchyLinkDetails', { title: a.title }), user?.email || '');
                               if (linkMode === 'child' && pendingGroupLocation) {
                                 saveSubLocation(childId, pendingGroupLocation);
                                 setPendingGroupLocation(null);
                                 loadAssetData();
                                 setLinkModalVisible(false);
                               } else if (linkMode === 'child') {
                                 loadAssetData();
                                 setLinkModalVisible(false);
                                 setPendingSubLocAssetId(childId);
                                 setSubLocPickerVisible(true);
                               } else {
                                 loadAssetData();
                                 setLinkModalVisible(false);
                               }
                             } catch (err) {
                               Alert.alert(t('common.error'), t('assetDetail.linkError'));
                             }
                           }}
                         ]);
                       }}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.surfaceLow, justifyContent: 'center', alignItems: 'center', marginRight: 15 }}>
                        <Ionicons name={(getAssetRootIconColor(a.type).icon || 'cube') as any} size={24} color={getAssetRootIconColor(a.type).color || C.slate} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '900', color: C.slate, textTransform: 'uppercase' }}>{a.title}</Text>
                        {a.parentId && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <Ionicons name="link" size={10} color={C.textLight} style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 9, fontWeight: '800', color: C.textLight, textTransform: 'uppercase' }}>
                              {t('assetDetail.belongsTo')}: {a.parentTitle}
                            </Text>
                          </View>
                        )}
                        {!a.parentId && (
                          <Text style={{ fontSize: 9, fontWeight: '800', color: C.success.text, textTransform: 'uppercase', marginTop: 2 }}>
                            {t('assetDetail.available')}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="add-circle-outline" size={24} color={a.parentId ? C.textLight : C.accent} />
                    </TouchableOpacity>
                  ));
                })()}
              </ScrollView>
           </View>
        </View>
      </Modal>

      {/* MODAL REGISTRAR GASTO DIRETO NO ATIVO */}
      <Modal visible={expModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20}}>
            <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={{backgroundColor: '#fff', borderRadius: 24, padding: 24}}>
               <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20}}>
                  <Text style={{fontSize: 9, fontWeight: '900', color: C.textLight, letterSpacing: 1.2, textTransform: 'uppercase'}}>{t('assetDetail.registerExpense')}</Text>
                  <TouchableOpacity onPress={() => setExpModalVisible(false)}>
                    <Ionicons name="close" size={24} color={C.slate} />
                  </TouchableOpacity>
               </View>
               
               <View style={{marginBottom: 16}}>
                 <Text style={{fontSize: 9, fontWeight: '900', color: C.textLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6}}>{t('assetDetail.whatWasPaid')}</Text>
                 <TextInput 
                  style={{backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: C.border}} 
                  value={newExp.description} 
                  onChangeText={t=>setNewExp({...newExp, description:t})} 
                  placeholder={t('assetDetail.expPlaceholder')} 
                 returnKeyType="done"
                      />
               </View>

               <View style={{flexDirection:'row', gap:10, marginBottom: 20}}>
                 <View style={{flex:1}}>
                   <Text style={{fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 6}}>{t('assetDetail.valueAmount')}</Text>
                   <ValueInput
                    style={{backgroundColor: '#F8FAFC', padding: 16, borderRadius: 12, fontSize: 14, fontWeight: '700', borderWidth: 1, borderColor: C.border}}
                    value={newExp.amount}
                    onChangeText={v => setNewExp({...newExp, amount: v})}
                    onDraftChange={(t) => {
                      expAmountDraftRef.current = t;
                    }}
                    onEditingStateChange={(editing) => {
                      expAmountEditingRef.current = editing;
                    }}
                    placeholder="0,00"
                    currency
                    currencySymbol="R$"
                   />
                 </View>
                 <View style={{flex:1}}>
                   <Text style={{fontSize: 10, fontWeight: '900', color: C.textLight, marginBottom: 6}}>{t('assetDetail.category')}</Text>
                   <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {['MANUTENÇÃO', 'OUTROS', 'LIMPEZA'].map(c=>(
                      <TouchableOpacity 
                        key={c} 
                        style={[
                          {
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 10,
                            backgroundColor: C.menuChipInactiveBg,
                            marginRight: 8,
                            borderWidth: 1,
                            borderColor: C.menuChipInactiveBorder,
                            justifyContent: 'center',
                          },
                          newExp.category === c && { backgroundColor: C.menuChipActiveBg, borderColor: C.menuChipActiveBg },
                        ]}
                        onPress={()=>setNewExp({...newExp, category:c})}
                      >
                        <Text
                          style={[
                            {
                              fontSize: 9,
                              fontWeight: '900',
                              color: C.menuChipInactiveFg,
                              textTransform: 'uppercase',
                            },
                            newExp.category === c && { color: C.menuChipActiveFg },
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                   </ScrollView>
                 </View>
               </View>

               <TouchableOpacity 
                style={{ backgroundColor: C.accent, padding: 16, borderRadius: 16, alignItems: 'center', marginTop: 10 }}
               onPress={handleSaveExp}
               >
                   <Text style={{color: '#fff', fontWeight: '900', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase'}}>{t('assetDetail.saveCost')}</Text>
               </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* MENU DE AÇÕES (+) — 2 steps */}
      <Modal
        visible={addMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => { setAddMenuStep('menu'); setAddMenuVisible(false); }}
      >
        <TouchableWithoutFeedback onPress={() => { setAddMenuStep('menu'); setAddMenuVisible(false); }}>
          <View style={styles.menuOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.menuContent}>

                {/* ── STEP 1: Tipo de lançamento ── */}
                {addMenuStep === 'menu' && (
                  <>
                    <Text style={styles.menuTitle}>{t('assetDetail.assetEntry')}</Text>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                      setPendingFlowType('single');
                      setAddMenuStep('type');
                    }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#ECFDF5' }]}><Ionicons name="receipt-outline" size={24} color="#10B981" /></View>
                      <View><Text style={styles.menuItemT}>{t('assetDetail.singleRecord')}</Text><Text style={styles.menuItemS}>{t('assetDetail.singleRecordSub')}</Text></View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                      setPendingFlowType('recurring');
                      setAddMenuStep('type');
                    }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#EEF2FF' }]}><Ionicons name="calendar-outline" size={24} color="#6366F1" /></View>
                      <View><Text style={styles.menuItemT}>{t('assetDetail.recurringBill')}</Text><Text style={styles.menuItemS}>{t('assetDetail.recurringBillSub')}</Text></View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuItem} onPress={() => {
                      setAddMenuVisible(false);
                      setAddMenuStep('menu');
                      setBudgetLimit(String(costSummary?.totalBudget || ''));
                      setBudgetModalVisible(true);
                    }}>
                      <View style={[styles.menuIcon, { backgroundColor: '#FFF7ED' }]}><Ionicons name="pie-chart-outline" size={24} color="#F59E0B" /></View>
                      <View><Text style={styles.menuItemT}>{t('assetDetail.setBudget')}</Text><Text style={styles.menuItemS}>{t('assetDetail.setBudgetSub')}</Text></View>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuClose} onPress={() => { setAddMenuStep('menu'); setAddMenuVisible(false); }}>
                      <Text style={styles.menuCloseT}>{t('common.cancel').toUpperCase()}</Text>
                    </TouchableOpacity>
                  </>
                )}

                {/* ── STEP 2: Receita ou Despesa? ── */}
                {addMenuStep === 'type' && (
                  <>
                    {/* Back button */}
                    <TouchableOpacity
                      onPress={() => setAddMenuStep('menu')}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, alignSelf: 'flex-start' }}
                    >
                      <Ionicons name="chevron-back" size={16} color={C.textSecondary} />
                      <Text style={{ fontSize: 12, color: C.textSecondary, fontWeight: '700' }}>Voltar</Text>
                    </TouchableOpacity>

                    <Text style={[styles.menuTitle, { marginBottom: 6 }]}>É uma receita ou despesa?</Text>
                    <Text style={{ fontSize: 12, color: C.textSecondary, marginBottom: 20, textAlign: 'center' }}>
                      {pendingFlowType === 'single' ? 'Lançamento único' : 'Cobrança recorrente'}
                    </Text>

                    {/* Receita card */}
                    <TouchableOpacity
                      onPress={() => {
                        setAddMenuVisible(false);
                        setAddMenuStep('menu');
                        if (pendingFlowType === 'single') {
                          setNewRecord({ category: 'OUTROS', amount: ocrPayload ? ocrPayload.amount : 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', description: ocrPayload ? ocrPayload.description : '', type: 'REVENUE', assetId: asset!.id });
                          setRecordModalVisible(true);
                        } else {
                          setNewRec({ frequency: 'MONTHLY', status: 'ACTIVE', type: 'REVENUE', amount: ocrPayload ? ocrPayload.amount : 0, description: ocrPayload ? ocrPayload.description : '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1, assetId: asset!.id });
                          setRecurringModalVisible(true);
                        }
                      }}
                      style={{
                        backgroundColor: '#ECFDF5', borderRadius: 16, padding: 20,
                        flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12,
                        borderWidth: 2, borderColor: '#10B981',
                      }}
                    >
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#10B981', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trending-up" size={24} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#065F46' }}>Receita</Text>
                        <Text style={{ fontSize: 12, color: '#10B981', fontWeight: '600', marginTop: 2 }}>Entrada de dinheiro</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#10B981" />
                    </TouchableOpacity>

                    {/* Despesa card */}
                    <TouchableOpacity
                      onPress={() => {
                        setAddMenuVisible(false);
                        setAddMenuStep('menu');
                        if (pendingFlowType === 'single') {
                          setNewRecord({ category: 'OUTROS', amount: ocrPayload ? ocrPayload.amount : 0, date: new Date().toISOString().split('T')[0], status: 'PENDING', description: ocrPayload ? ocrPayload.description : '', type: 'EXPENSE', assetId: asset!.id });
                          setRecordModalVisible(true);
                        } else {
                          setNewRec({ frequency: 'MONTHLY', status: 'ACTIVE', type: 'EXPENSE', amount: ocrPayload ? ocrPayload.amount : 0, description: ocrPayload ? ocrPayload.description : '', nextDueDate: new Date().toISOString().split('T')[0], alertDaysBefore: 1, assetId: asset!.id });
                          setRecurringModalVisible(true);
                        }
                      }}
                      style={{
                        backgroundColor: '#FEF2F2', borderRadius: 16, padding: 20,
                        flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 20,
                        borderWidth: 2, borderColor: '#EF4444',
                      }}
                    >
                      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' }}>
                        <Ionicons name="trending-down" size={24} color="#fff" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#7F1D1D' }}>Despesa</Text>
                        <Text style={{ fontSize: 12, color: '#EF4444', fontWeight: '600', marginTop: 2 }}>Saída de dinheiro</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color="#EF4444" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.menuClose} onPress={() => { setAddMenuStep('menu'); setAddMenuVisible(false); }}>
                      <Text style={styles.menuCloseT}>{t('common.cancel').toUpperCase()}</Text>
                    </TouchableOpacity>
                  </>
                )}

              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL ADICIONAR REGISTRO (RECEITA/DESPESA) */}
      <Modal visible={recordModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalO2}>
              <TouchableWithoutFeedback>
                <View style={styles.modalC2}>
                  <View style={styles.modalH2}>
                    <Text style={styles.modalT}>{editingRecord ? 'EDITAR REGISTRO' : t('assetDetail.newFinancialRecord')}</Text>
                    <TouchableOpacity onPress={() => { setRecordModalVisible(false); setEditingRecord(null); }}>
                      <Ionicons name="close" size={24} color={C.slate} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {/* Type badge — read-only, type already selected in previous step */}
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
                      alignSelf: 'flex-start',
                      backgroundColor: newRecord.type === 'REVENUE' ? '#ECFDF5' : '#FEF2F2',
                      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                      borderWidth: 1, borderColor: newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444',
                    }}>
                      <Ionicons
                        name={newRecord.type === 'REVENUE' ? 'trending-up' : 'trending-down'}
                        size={14}
                        color={newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444'}
                      />
                      <Text style={{ fontSize: 11, fontWeight: '900', color: newRecord.type === 'REVENUE' ? '#065F46' : '#7F1D1D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {newRecord.type === 'REVENUE' ? 'Receita' : 'Despesa'}
                      </Text>
                    </View>

                    <View style={styles.inputG}><Text style={styles.inputL}>{t('assetDetail.description')}</Text><TextInput style={styles.input} value={newRecord.description} onChangeText={t=>setNewRecord({...newRecord, description:t})} placeholder={t('assetDetail.descriptionPlaceholder')} returnKeyType="next" /></View>
                    {editingRecord && (
                      <View style={styles.inputG}>
                        <Text style={styles.inputL}>STATUS</Text>
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          {[
                            { label: 'Realizado', value: 'PAID', color: newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444' },
                            { label: 'Pendente', value: 'PENDING', color: '#F59E0B' }
                          ].map(s => (
                            <TouchableOpacity 
                              key={s.value} 
                              style={[
                                styles.pChip, 
                                { flex: 1, minWidth: 120, marginRight: 0 },
                                newRecord.status === s.value && { backgroundColor: s.color, borderColor: s.color }
                              ]} 
                              onPress={() => setNewRecord({ ...newRecord, status: s.value as any })}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: newRecord.status === s.value ? '#fff' : s.color }} />
                                <Text style={[styles.pChipT, { fontSize: 10 }, newRecord.status === s.value && { color: '#fff' }]}>{s.label}</Text>
                              </View>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    )}
                    <View style={styles.inputG}><Text style={styles.inputL}>{t('assetDetail.category')}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">{(newRecord.type === 'EXPENSE' ? expenseCategories : revenueCategories).map(c => (<TouchableOpacity key={c} style={[styles.pChip, newRecord.category === c && styles.pChipA]} onPress={()=>setNewRecord({...newRecord, category:c})}><Text style={[styles.pChipT, newRecord.category === c && styles.pChipTA]}>{c}</Text></TouchableOpacity>))}</ScrollView></View>
                    <View style={styles.inputG}>
                       <DatePickerButton
                         label={t('assetDetail.date')}
                         value={newRecord.date}
                         onChange={(d) => setNewRecord({ ...newRecord, date: d })}
                         accentColor={newRecord.type === 'REVENUE' ? '#10B981' : '#EF4444'}
                       />
                     </View>
                    <View style={styles.inputG}>
                      <Text style={styles.inputL}>{t('assetDetail.valueAmount')}</Text>
                      <ValueInput
                        style={styles.input}
                        value={String(newRecord.amount || '')}
                        onChangeText={v => setNewRecord({ ...newRecord, amount: parseLocaleAmountString(v) })}
                        onDraftChange={(t) => {
                          recordAmountDraftRef.current = t;
                        }}
                        onEditingStateChange={(editing) => {
                          recordAmountEditingRef.current = editing;
                        }}
                        placeholder="0,00"
                        currency
                        currencySymbol="R$"
                      />
                    </View>
                    <TouchableOpacity style={[styles.confirmBtn, {backgroundColor: newRecord.type === 'REVENUE' ? '#10B981' : C.accent, marginBottom: 40}]} onPress={handleSaveRecord}>
                      <Text style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.saveRecord')}</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL CONTA RECORRENTE */}
      <Modal visible={recurringModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}><View style={styles.modalO2}><View style={styles.modalC2}>
            <View style={styles.modalH2}><Text style={styles.modalT}>{editingRec ? 'EDITAR RECORRENTE' : t('assetDetail.scheduleRecurring')}</Text><TouchableOpacity onPress={() => { setRecurringModalVisible(false); setEditingRec(null); }}><Ionicons name="close" size={24} color={C.slate} /></TouchableOpacity></View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
               {/* Type badge — read-only, type already selected in previous step */}
               <View style={{
                 flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16,
                 alignSelf: 'flex-start',
                 backgroundColor: newRec.type === 'REVENUE' ? '#ECFDF5' : '#FEF2F2',
                 borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
                 borderWidth: 1, borderColor: newRec.type === 'REVENUE' ? '#10B981' : '#EF4444',
               }}>
                 <Ionicons
                   name={newRec.type === 'REVENUE' ? 'trending-up' : 'trending-down'}
                   size={14}
                   color={newRec.type === 'REVENUE' ? '#10B981' : '#EF4444'}
                 />
                 <Text style={{ fontSize: 11, fontWeight: '900', color: newRec.type === 'REVENUE' ? '#065F46' : '#7F1D1D', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                   {newRec.type === 'REVENUE' ? 'Receita' : 'Despesa'}
                 </Text>
               </View>

               <View style={styles.inputG}><Text style={styles.inputL}>{t('assetDetail.billDescription')}</Text><TextInput style={styles.input} value={newRec.description} onChangeText={t=>setNewRec({...newRec, description:t})} placeholder={t('assetDetail.billPlaceholder')} returnKeyType="done"
                      /></View>

               <View style={styles.inputG}>
                 <DatePickerButton
                   label={t("assetDetail.dueDay")}
                   value={newRec.nextDueDate}
                   onChange={(d) => setNewRec({ ...newRec, nextDueDate: d })}
                 />
               </View>
               <View style={styles.inputG}>
                 <Text style={styles.inputL}>{t('assetDetail.valueAmount')}</Text>
                 <ValueInput
                   style={styles.input}
                   value={String(newRec.amount || '')}
                   onChangeText={v => setNewRec({ ...newRec, amount: parseLocaleAmountString(v) })}
                   onDraftChange={(t) => {
                     recAmountDraftRef.current = t;
                   }}
                   onEditingStateChange={(editing) => {
                     recAmountEditingRef.current = editing;
                   }}
                   currency
                   currencySymbol="R$"
                 />
               </View>
               <View style={styles.inputG}><Text style={styles.inputL}>{t('assetDetail.frequency')}</Text><View style={{flexDirection:'row', gap:10}}>{['WEEKLY','MONTHLY','YEARLY'].map(f => (<TouchableOpacity key={f} style={[styles.pChip, newRec.frequency === f && styles.pChipA]} onPress={()=>setNewRec({...newRec, frequency:f as any})}><Text style={[styles.pChipT, newRec.frequency === f && styles.pChipTA]}>{f}</Text></TouchableOpacity>))}</View></View>
               
                <View style={styles.inputG}>
                   <Text style={styles.inputL}>{t('assetDetail.alertDue')}</Text>
                   <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                     {[
                       { l: t('assetDetail.noAlert'), v: undefined },
                       { l: t('assetDetail.onDay'), v: 0 },
                       { l: t('assetDetail.daysBefore', { count: 1 }), v: 1 },
                       { l: t('assetDetail.daysBefore', { count: 3 }), v: 3 },
                       { l: t('assetDetail.daysBefore', { count: 5 }), v: 5 },
                       { l: t('assetDetail.daysBefore', { count: 10 }), v: 10 }
                     ].map(opt => (
                       <TouchableOpacity key={String(opt.v)} style={[styles.pChip, newRec.alertDaysBefore === opt.v && styles.pChipA]} onPress={()=>setNewRec({...newRec, alertDaysBefore: opt.v})}>
                         <Text style={[styles.pChipT, newRec.alertDaysBefore === opt.v && styles.pChipTA]}>{opt.l}</Text>
                       </TouchableOpacity>
                     ))}
                   </ScrollView>
                </View>

                <View style={styles.inputG}>
                   <Text style={styles.inputL}>{t('assetDetail.installments')}</Text>
                   <TextInput 
                    style={styles.input} 
                    keyboardType="numeric" 
                    value={newRec.totalInstallments ? String(newRec.totalInstallments) : ''} 
                    onChangeText={t => {
                      const val = parseInt(t) || undefined;
                      setNewRec({...newRec, totalInstallments: val, remainingInstallments: val});
                    }} 
                    placeholder={t('assetDetail.installmentsPlaceholder')} 
                   returnKeyType="done"
                      />
                </View>
               <TouchableOpacity style={[styles.confirmBtn, {backgroundColor: newRec.type === 'REVENUE' ? '#10B981' : C.accent, marginBottom: 40}]} onPress={handleSaveRecurring}><Text style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.schedule')} {newRec.type === 'REVENUE' ? t('assetDetail.revenue') : t('assetDetail.payment')}</Text></TouchableOpacity>


            </ScrollView>
        </View></View></TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* MODAL DEFINIR BUDGET */}
      <Modal visible={budgetModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.modalO2}><View style={[styles.modalC2, { marginBottom: '50%' }]}>
           <View style={styles.modalH2}><Text style={styles.modalT}>{t('assetDetail.monthlyBudget')}</Text><TouchableOpacity onPress={() => setBudgetModalVisible(false)}><Ionicons name="close" size={24} color={C.slate} /></TouchableOpacity></View>
           <Text style={styles.assetName}>{asset.title}</Text>
           <View style={[styles.inputG, {marginTop:15}]}>
             <Text style={styles.inputL}>{t('assetDetail.spendingLimit')}</Text>
             <ValueInput
               style={styles.input}
               value={budgetLimit}
               onChangeText={setBudgetLimit}
               onDraftChange={(t) => {
                 budgetAmountDraftRef.current = t;
               }}
               onEditingStateChange={(editing) => {
                 budgetAmountEditingRef.current = editing;
               }}
               placeholder="5000"
               currency
               currencySymbol="R$"
             />
           </View>
           <TouchableOpacity style={styles.confirmBtn} onPress={handleSaveBudget}><Text style={styles.confirmText} numberOfLines={1} adjustsFontSizeToFit>{t('assetDetail.defineBudget')}</Text></TouchableOpacity>
        </View></View>
        </KeyboardAvoidingView>
      </Modal>


      {/* SubLocation Picker */}
      <SubLocationPicker
        visible={subLocPickerVisible}
        parentType={asset?.type || 'OTHER'}
        childTitle={pendingSubLocAssetId ? getLocalAssets(user?.email || '').find(a => a.id === pendingSubLocAssetId)?.title : undefined}
        initialValue={pendingSubLocAssetId ? getLocalAssets(user?.email || '').find(a => a.id === pendingSubLocAssetId)?.subLocation : null}
        onConfirm={(loc) => {
          if (pendingSubLocAssetId) {
            saveSubLocation(pendingSubLocAssetId, loc);
            loadAssetData();
          }
          setSubLocPickerVisible(false);
          setPendingSubLocAssetId(null);
        }}
        onClose={() => { setSubLocPickerVisible(false); setPendingSubLocAssetId(null); }}
      />

    </View>
      {/* Avatar Icon Picker Modal */}
      <Modal visible={avatarPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={{ flex: 1, backgroundColor: C.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.cardWhite }}>
            <Text style={{ fontSize: 16, fontWeight: '900', color: C.primary }}>ESCOLHER ÍCONE</Text>
            <TouchableOpacity onPress={() => setAvatarPickerVisible(false)}>
              <Ionicons name="close" size={24} color={C.slate} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>COR DO ÍCONE</Text>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
              {COLOR_PRESETS.map(c => (
                <TouchableOpacity key={c} onPress={() => setTempColor(c)}
                  style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: c, justifyContent: 'center', alignItems: 'center', borderWidth: tempColor === c ? 2.5 : 0, borderColor: '#fff', shadowColor: c, shadowOpacity: 0.4, shadowRadius: 4, elevation: 2 }}>
                  {tempColor === c && <Ionicons name="checkmark" size={16} color="#fff" />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, paddingVertical: 12, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.divider }}>
            <Text style={{ fontSize: 9, fontWeight: '900', color: C.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>BUSCAR NA BIBLIOTECA</Text>
            <TextInput
              value={iconPickerFilter}
              onChangeText={setIconPickerFilter}
              placeholder="Nome ou palavra-chave…"
              placeholderTextColor={C.textLight}
              style={{ borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 13, backgroundColor: C.surfaceLow, color: C.primary, fontWeight: '600' }}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          {tempIcon ? (
            <View style={{ alignItems: 'center', paddingVertical: 16, backgroundColor: C.cardWhite, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: (tempColor || C.primary) + '18', justifyContent: 'center', alignItems: 'center' }}>
                <Ionicons name={tempIcon as any} size={32} color={tempColor || C.primary} />
              </View>
              <Text style={{ fontSize: 10, fontWeight: '700', color: C.textSecondary, marginTop: 6 }}>Prévia</Text>
            </View>
          ) : null}
          <FlatList
            data={filteredAssetIcons}
            keyExtractor={item => item.icon}
            numColumns={4}
            contentContainerStyle={{ padding: 14, gap: 10 }}
            columnWrapperStyle={{ gap: 10 }}
            ListEmptyComponent={
              <Text style={{ textAlign: 'center', color: C.textSecondary, paddingVertical: 20, fontWeight: '600', fontSize: 12 }}>
                Nenhum ícone para este termo.
              </Text>
            }
            renderItem={({ item }) => {
              const sel = tempIcon === item.icon;
              return (
                <TouchableOpacity
                  onPress={() => setTempIcon(item.icon)}
                  style={{ flex: 1, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: sel ? (tempColor || C.primary) + '18' : C.cardWhite, borderWidth: sel ? 1.5 : 1, borderColor: sel ? (tempColor || C.primary) : C.border }}
                >
                  <Ionicons name={item.icon as any} size={26} color={sel ? (tempColor || C.primary) : C.slate} />
                  <Text style={{ fontSize: 7, fontWeight: '700', color: sel ? (tempColor || C.primary) : C.textSecondary, marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
          <View style={{ padding: 16, backgroundColor: C.cardWhite, borderTopWidth: 1, borderTopColor: C.border }}>
            <TouchableOpacity
              style={{ backgroundColor: tempIcon ? (tempColor || C.branding) : '#CBD5E1', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              onPress={handleConfirmIcon}
            >
              <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13, textTransform: 'uppercase' }}>
                {tempIcon ? 'Confirmar ícone' : 'Selecione um ícone'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </GestureHandlerRootView>
  );
}



