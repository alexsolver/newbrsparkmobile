import React, { useState, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Modal, ScrollView,
  TextInput, StyleSheet, Dimensions, FlatList,
  KeyboardAvoidingView, Platform} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SubLocation } from '../types/asset';
import { type ColorPalette } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';

const { height: H, width: W } = Dimensions.get('window');

// ── Floors ─────────────────────────────────────────────────────────────────
const FLOORS = ['Subsolo', 'Térreo', '1º Andar', '2º Andar', '3º Andar', 'Cobertura', 'Externo', 'Outro...'];

// ── Icon Library ────────────────────────────────────────────────────────────
type IconEntry = { name: string; label: string };
type IconCategory = { cat: string; icons: IconEntry[] };

const ICON_LIBRARY: IconCategory[] = [
  { cat: '🏠 Cômodos', icons: [
    { name: 'restaurant-outline',   label: 'Cozinha' },
    { name: 'tv-outline',           label: 'Sala' },
    { name: 'bed-outline',          label: 'Quarto' },
    { name: 'water-outline',        label: 'Banheiro' },
    { name: 'archive-outline',      label: 'Despensa' },
    { name: 'shirt-outline',        label: 'Lavanderia' },
    { name: 'library-outline',      label: 'Biblioteca' },
    { name: 'business-outline',     label: 'Escritório' },
    { name: 'easel-outline',        label: 'Ateliê' },
    { name: 'game-controller-outline', label: 'Sala Jogos' },
    { name: 'musical-notes-outline',label: 'Estúdio' },
    { name: 'film-outline',         label: 'Home Theater' },
    { name: 'fitness-outline',      label: 'Academia' },
    { name: 'wine-outline',         label: 'Adega' },
    { name: 'cafe-outline',         label: 'Copa' },
    { name: 'home-outline',         label: 'Hall' },
    { name: 'walk-outline',         label: 'Corredor' },
    { name: 'layers-outline',       label: 'Mezanino' },
  ]},
  { cat: '🔧 Técnico', icons: [
    { name: 'car-outline',          label: 'Garagem' },
    { name: 'build-outline',        label: 'Área Técnica' },
    { name: 'flash-outline',        label: 'Elétrica' },
    { name: 'water',                label: 'Hidráulica' },
    { name: 'thermometer-outline',  label: 'Casa de Máquinas' },
    { name: 'settings-outline',     label: 'Manutenção' },
    { name: 'construct-outline',    label: 'Depósito' },
    { name: 'key-outline',          label: 'Portaria' },
    { name: 'server-outline',       label: 'Data Center' },
    { name: 'shield-outline',       label: 'Segurança' },
    { name: 'camera-outline',       label: 'Monitoramento' },
    { name: 'radio-outline',        label: 'TI / Redes' },
    { name: 'bonfire-outline',      label: 'Caldeira' },
    { name: 'trash-outline',        label: 'Lixeira' },
    { name: 'cube-outline',         label: 'Almoxarifado' },
    { name: 'git-merge-outline',    label: 'Distribuição' },
  ]},
  { cat: '🌿 Área Externa', icons: [
    { name: 'leaf-outline',         label: 'Jardim' },
    { name: 'sunny-outline',        label: 'Terraço' },
    { name: 'umbrella-outline',     label: 'Área Coberta' },
    { name: 'boat-outline',         label: 'Deck' },
    { name: 'bonfire-outline',      label: 'Churrasqueira' },
    { name: 'bicycle-outline',      label: 'Bicicletário' },
    { name: 'footsteps-outline',    label: 'Varanda' },
    { name: 'partly-sunny-outline', label: 'Solário' },
    { name: 'basketball-outline',   label: 'Quadra' },
    { name: 'golf-outline',         label: 'Campo' },
    { name: 'accessibility-outline',label: 'Piscina' },
    { name: 'compass-outline',      label: 'Área Verde' },
    { name: 'flower-outline',       label: 'Estufa' },
    { name: 'snow-outline',         label: 'Frigorífico' },
  ]},
  { cat: '🏢 Corporativo', icons: [
    { name: 'people-outline',       label: 'Reunião' },
    { name: 'briefcase-outline',    label: 'Diretoria' },
    { name: 'megaphone-outline',    label: 'Comunicação' },
    { name: 'stats-chart-outline',  label: 'Financeiro' },
    { name: 'receipt-outline',      label: 'Contabilidade' },
    { name: 'person-outline',       label: 'RH' },
    { name: 'storefront-outline',   label: 'Comercial' },
    { name: 'bag-outline',          label: 'Estoque' },
    { name: 'mail-outline',         label: 'Correspondência' },
    { name: 'print-outline',        label: 'Impressão' },
    { name: 'laptop-outline',       label: 'Coworking' },
    { name: 'mic-outline',          label: 'Auditório' },
    { name: 'podium-outline',       label: 'Apresentação' },
    { name: 'school-outline',       label: 'Treinamento' },
    { name: 'medical-outline',      label: 'Enfermaria' },
    { name: 'restaurant',           label: 'Refeitório' },
  ]},
  { cat: '🚗 Veículo / Embarcação', icons: [
    { name: 'car-sport-outline',    label: 'Cabine' },
    { name: 'arrow-up-outline',     label: 'Proa' },
    { name: 'arrow-down-outline',   label: 'Popa' },
    { name: 'arrow-back-outline',   label: 'Porta-Malas' },
    { name: 'tablet-portrait-outline', label: 'Painel' },
    { name: 'battery-charging-outline', label: 'Compartimento' },
    { name: 'pin-outline',          label: 'Fixado' },
    { name: 'eye-outline',          label: 'Visível' },
  ]},
  { cat: '📦 Genérico', icons: [
    { name: 'cube-outline',         label: 'Caixa' },
    { name: 'ellipse-outline',      label: 'Área' },
    { name: 'square-outline',       label: 'Setor' },
    { name: 'triangle-outline',     label: 'Zona' },
    { name: 'location-outline',     label: 'Local' },
    { name: 'map-outline',          label: 'Mapa' },
    { name: 'flag-outline',         label: 'Ponto' },
    { name: 'bookmark-outline',     label: 'Marcado' },
    { name: 'star-outline',         label: 'Especial' },
    { name: 'heart-outline',        label: 'Favorito' },
    { name: 'pin-outline',          label: 'Fixado' },
    { name: 'alert-circle-outline', label: 'Atenção' },
    { name: 'lock-closed-outline',  label: 'Restrito' },
    { name: 'add-circle-outline',   label: 'Novo' },
    { name: 'infinite-outline',     label: 'Geral' },
    { name: 'apps-outline',         label: 'Módulo' },
  ]},
];

// Flat list for search
const ALL_ICONS: IconEntry[] = ICON_LIBRARY.flatMap(c => c.icons);

// ── Preset Rooms ─────────────────────────────────────────────────────────────
type RoomPreset = { icon: string; label: string; isCustom?: boolean };

const ROOMS_BY_TYPE: Record<string, RoomPreset[]> = {
  REAL_ESTATE: [
    { icon: 'restaurant-outline',  label: 'Cozinha' },
    { icon: 'tv-outline',          label: 'Sala de Estar' },
    { icon: 'bed-outline',         label: 'Suíte Master' },
    { icon: 'bed-outline',         label: 'Quarto 2' },
    { icon: 'bed-outline',         label: 'Quarto 3' },
    { icon: 'water-outline',       label: 'Banheiro' },
    { icon: 'car-outline',         label: 'Garagem' },
    { icon: 'archive-outline',     label: 'Despensa' },
    { icon: 'leaf-outline',        label: 'Área Externa' },
    { icon: 'business-outline',    label: 'Escritório' },
    { icon: 'shirt-outline',       label: 'Lavanderia' },
    { icon: 'build-outline',       label: 'Área Técnica' },
    { icon: 'pencil-outline',      label: 'Outro...', isCustom: true },
  ],
  AQUATIC: [
    { icon: 'arrow-up-outline',    label: 'Proa' },
    { icon: 'arrow-down-outline',  label: 'Popa' },
    { icon: 'home-outline',        label: 'Cabine' },
    { icon: 'sunny-outline',       label: 'Deck' },
    { icon: 'layers-outline',      label: 'Porão' },
    { icon: 'restaurant-outline',  label: 'Cozinha de Bordo' },
    { icon: 'water-outline',       label: 'Casa de Banho' },
    { icon: 'pencil-outline',      label: 'Outro...', isCustom: true },
  ],
  TERRESTRIAL: [
    { icon: 'car-sport-outline',          label: 'Porta-Malas' },
    { icon: 'tablet-portrait-outline',    label: 'Painel' },
    { icon: 'cube-outline',               label: 'Interior' },
    { icon: 'flash-outline',              label: 'Motor' },
    { icon: 'pencil-outline',             label: 'Outro...', isCustom: true },
  ],
  SPECIAL: [
    { icon: 'cube-outline',   label: 'Compartimento A' },
    { icon: 'cube-outline',   label: 'Compartimento B' },
    { icon: 'pencil-outline', label: 'Outro...', isCustom: true },
  ],
  OTHER: [
    { icon: 'cube-outline',   label: 'Área Principal' },
    { icon: 'pencil-outline', label: 'Outro...', isCustom: true },
  ],
};

// ── Props ───────────────────────────────────────────────────────────────────
interface SubLocationPickerProps {
  visible: boolean;
  parentType: string;
  childTitle?: string;
  initialValue?: SubLocation | null;
  maxStep?: 2 | 3; // default 3; set to 2 to skip the notes step
  confirmLabel?: string; // custom label for confirm button
  onConfirm: (loc: SubLocation) => void;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────
export function SubLocationPicker({
  visible, parentType, childTitle, initialValue, maxStep = 3, confirmLabel, onConfirm, onClose,
}: SubLocationPickerProps) {
  const { colors: C } = useTheme();
  const S = useMemo(() => createSubLocationStyles(C), [C]);
  const presets = ROOMS_BY_TYPE[parentType] || ROOMS_BY_TYPE.OTHER;

  const [step,         setStep]         = useState<1 | 2 | 3>(1);
  const [floor,        setFloor]        = useState(initialValue?.floor || '');
  const [customFloor,  setCustomFloor]  = useState('');
  const [room,         setRoom]         = useState(initialValue?.room || '');
  const [customRoom,   setCustomRoom]   = useState('');
  const [customIcon,   setCustomIcon]   = useState<string>(initialValue?.icon || 'cube-outline');
  const [notes,        setNotes]        = useState(initialValue?.notes || '');
  const [iconSearch,   setIconSearch]   = useState('');
  const [activeCat,    setActiveCat]    = useState(ICON_LIBRARY[0].cat);

  const isCustomFloor = floor === 'Outro...';
  const isCustomRoom  = room  === 'Outro...';
  const finalFloor    = isCustomFloor ? customFloor.trim() : floor;
  const finalRoom     = isCustomRoom  ? customRoom.trim()  : room;
  const finalIcon     = isCustomRoom  ? customIcon         : (presets.find(p => p.label === room)?.icon || 'cube-outline');

  const filteredIcons = useMemo(() => {
    if (!iconSearch.trim()) return null; // null = show by category
    const q = iconSearch.toLowerCase();
    return ALL_ICONS.filter(i => i.label.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  }, [iconSearch]);

  const reset = () => {
    setStep(1); setFloor(''); setCustomFloor('');
    setRoom(''); setCustomRoom(''); setCustomIcon('cube-outline');
    setNotes(''); setIconSearch('');
  };

  const handleClose   = () => { reset(); onClose(); };
  const handleConfirm = () => {
    onConfirm({ floor: finalFloor, room: finalRoom, icon: finalIcon, notes: notes.trim() || undefined });
    reset(); onClose();
  };

  const step1OK    = floor && (!isCustomFloor || customFloor.trim());
  const step2OK    = room  && (!isCustomRoom  || customRoom.trim());
  const canConfirm = !!(step1OK && step2OK);

  const renderIconItem = (item: IconEntry) => (
    <TouchableOpacity
      key={item.name + item.label}
      style={[S.iconCell, customIcon === item.name && S.iconCellActive]}
      onPress={() => setCustomIcon(item.name)}
    >
      <Ionicons name={item.name as any} size={22} color={customIcon === item.name ? '#fff' : C.slate} />
      <Text style={[S.iconCellLabel, customIcon === item.name && { color: '#fff' }]} numberOfLines={1}>{item.label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={S.overlay}>
        <View style={S.sheet}>

          {/* Handle */}
          <View style={S.handle} />

          {/* Header */}
          <View style={S.header}>
            <View style={{ flex: 1 }}>
              <Text style={S.headerTitle}>📍 Onde está este bem?</Text>
              {childTitle ? <Text style={S.headerSub} numberOfLines={1}>{childTitle}</Text> : null}
            </View>
            <TouchableOpacity onPress={handleClose} style={S.closeBtn}>
              <Ionicons name="close" size={20} color="#70797C" />
            </TouchableOpacity>
          </View>

          {/* Step Pills */}
          <View style={S.stepRow}>
            {(['Andar', 'Espaço', 'Detalhe'] as const).map((label, i) => (
              <View key={label} style={S.stepWrap}>
                <View style={[S.stepDot, (i + 1) <= step && S.stepDotActive]}>
                  <Text style={[S.stepNum, (i + 1) <= step && S.stepNumActive]}>{i + 1}</Text>
                </View>
                <Text style={[S.stepLabel, (i + 1) === step && S.stepLabelActive]}>{label}</Text>
                {i < 2 && <View style={[S.stepLine, (i + 1) < step && S.stepLineActive]} />}
              </View>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} keyboardShouldPersistTaps="handled">

            {/* ── STEP 1: FLOOR ── */}
            {step === 1 && (
              <View style={S.section}>
                <Text style={S.sectionTitle}>Selecione o andar</Text>
                <View style={S.pillGrid}>
                  {FLOORS.map(f => (
                    <TouchableOpacity
                      key={f}
                      style={[S.pill, floor === f && (f === 'Outro...' ? S.pillCustom : S.pillActive)]}
                      onPress={() => { setFloor(f); if (f !== 'Outro...') setCustomFloor(''); }}
                    >
                      {f === 'Outro...' && (
                        <Ionicons name="pencil-outline" size={13} color={floor === 'Outro...' ? C.primary : '#A8B5BB'} style={{ marginRight: 4 }} />
                      )}
                      <Text style={[S.pillT, floor === f && (f === 'Outro...' ? S.pillTCustom : S.pillTActive)]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {isCustomFloor && (
                  <TextInput
                    style={S.input}
                    placeholder="Ex: Mezanino, 4º Andar, Ala Norte..."
                    placeholderTextColor="#A8B5BB"
                    value={customFloor}
                    onChangeText={setCustomFloor}
                    autoFocus
                  returnKeyType="done"
                      />
                )}
              </View>
            )}

            {/* ── STEP 2: ROOM ── */}
            {step === 2 && (
              <View style={S.section}>
                <Text style={S.sectionTitle}>Selecione o espaço</Text>

                {/* Preset grid */}
                <View style={S.roomGrid}>
                  {presets.map(r => (
                    <TouchableOpacity
                      key={r.label}
                      style={[S.roomCard, room === r.label && (r.isCustom ? S.roomCardCustom : S.roomCardActive), r.isCustom && S.roomCardDashed]}
                      onPress={() => { setRoom(r.label); if (!r.isCustom) setCustomRoom(''); }}
                    >
                      <Ionicons name={r.icon as any} size={24}
                        color={room === r.label ? (r.isCustom ? C.primary : '#fff') : (r.isCustom ? '#A8B5BB' : C.slate)} />
                      <Text style={[S.roomLabel, room === r.label && (r.isCustom ? S.roomLabelCustom : S.roomLabelActive), r.isCustom && { color: '#A8B5BB' }]} numberOfLines={2}>
                        {r.isCustom ? 'Nome livre' : r.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Custom room: name + icon library */}
                {isCustomRoom && (
                  <View style={{ marginTop: 16 }}>
                    <TextInput
                      style={S.input}
                      placeholder="Nome do espaço (ex: Garagem, Ateliê, Sala de Jogos...)"
                      placeholderTextColor="#A8B5BB"
                      value={customRoom}
                      onChangeText={setCustomRoom}
                    returnKeyType="done"
                      />

                    {/* Icon picker header */}
                    <View style={S.iconLibHeader}>
                      <Ionicons name={customIcon as any} size={20} color={C.primary} />
                      <Text style={S.iconLibTitle}>Escolha um ícone</Text>
                    </View>

                    {/* Search */}
                    <View style={S.iconSearchWrap}>
                      <Ionicons name="search-outline" size={15} color="#A8B5BB" />
                      <TextInput
                        style={S.iconSearchInput}
                        placeholder="Buscar ícone..."
                        placeholderTextColor="#A8B5BB"
                        value={iconSearch}
                        onChangeText={setIconSearch}
                      returnKeyType="done"
                      />
                      {iconSearch ? (
                        <TouchableOpacity onPress={() => setIconSearch('')}>
                          <Ionicons name="close-circle" size={16} color="#A8B5BB" />
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    {/* Category tabs (hidden during search) */}
                    {!iconSearch.trim() && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} keyboardShouldPersistTaps="handled">
                        {ICON_LIBRARY.map(cat => (
                          <TouchableOpacity
                            key={cat.cat}
                            style={[S.catTab, activeCat === cat.cat && S.catTabActive]}
                            onPress={() => setActiveCat(cat.cat)}
                          >
                            <Text style={[S.catTabT, activeCat === cat.cat && S.catTabTActive]}>{cat.cat}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}

                    {/* Icon grid */}
                    <View style={S.iconGrid}>
                      {(filteredIcons ?? ICON_LIBRARY.find(c => c.cat === activeCat)?.icons ?? []).map(renderIconItem)}
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* ── STEP 3: NOTES ── */}
            {step === 3 && (
              <View style={S.section}>
                <Text style={S.sectionTitle}>
                  Algum detalhe adicional?{'  '}
                  <Text style={{ fontWeight: '400', color: '#70797C', textTransform: 'none' }}>(opcional)</Text>
                </Text>
                <TextInput
                  style={[S.input, { height: 90, textAlignVertical: 'top', paddingTop: 14 }]}
                  placeholder="ex: ao lado da janela, próximo à escada..."
                  placeholderTextColor="#A8B5BB"
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                 returnKeyType="done"/>
                {/* Summary */}
                <View style={S.summaryCard}>
                  <Ionicons name={finalIcon as any} size={22} color={C.primary} />
                  <View style={{ marginLeft: 10 }}>
                    <Text style={S.summaryFloor}>{finalFloor || '—'}</Text>
                    <Text style={S.summaryRoom}>{finalRoom || '—'}</Text>
                    {notes ? <Text style={S.summaryNotes}>{notes}</Text> : null}
                  </View>
                </View>
              </View>
            )}

          </ScrollView>

          {/* Footer */}
          <View style={S.footer}>
            {step > 1 ? (
              <TouchableOpacity style={S.backBtn} onPress={() => setStep((s) => (s - 1) as 1)}>
                <Ionicons name="arrow-back" size={18} color={C.slate} />
                <Text style={S.backBtnT}>Voltar</Text>
              </TouchableOpacity>
            ) : <View style={{ flex: 1 }} />}

            {step < maxStep ? (
              <TouchableOpacity
                style={[S.nextBtn, !(step === 1 ? step1OK : step2OK) && S.nextBtnDisabled]}
                disabled={!(step === 1 ? step1OK : step2OK)}
                onPress={() => setStep((s) => (s + 1) as 2 | 3)}
              >
                <Text style={S.nextBtnT}>Próximo</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[S.nextBtn, !canConfirm && S.nextBtnDisabled]}
                disabled={!canConfirm}
                onPress={handleConfirm}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={S.nextBtnT}>{confirmLabel || 'Confirmar'}</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const ICON_CELL_SIZE = (W - 40 - 32) / 4;

function createSubLocationStyles(C: ColorPalette) {
  return StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    height: H * 0.9,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
  },
  handle: { width: 40, height: 4, backgroundColor: '#E2E8F0', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 4 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 17, fontWeight: '900', color: '#191C1D' },
  headerSub: { fontSize: 12, color: '#70797C', fontWeight: '600', marginTop: 2 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

  stepRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14 },
  stepWrap: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  stepDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  stepDotActive: { backgroundColor: C.primary, borderColor: C.primary },
  stepNum: { fontSize: 11, fontWeight: '900', color: '#A8B5BB' },
  stepNumActive: { color: '#fff' },
  stepLabel: { fontSize: 10, fontWeight: '700', color: '#A8B5BB', marginLeft: 6, textTransform: 'uppercase' },
  stepLabelActive: { color: C.primary },
  stepLine: { flex: 1, height: 1.5, backgroundColor: '#E2E8F0', marginHorizontal: 6 },
  stepLineActive: { backgroundColor: C.primary },

  section: { paddingHorizontal: 20, paddingVertical: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#191C1D', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.4 },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  pillActive: { backgroundColor: C.primary, borderColor: C.primary },
  pillCustom: { borderStyle: 'dashed', borderColor: C.primary, backgroundColor: '#F0F9FF' },
  pillT: { fontSize: 13, fontWeight: '700', color: '#565E61' },
  pillTActive: { color: '#fff' },
  pillTCustom: { color: C.primary },

  roomGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  roomCard: { width: '30%', paddingVertical: 14, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', gap: 6 },
  roomCardActive: { backgroundColor: C.filledButtonBg, borderColor: C.filledButtonBg },
  roomCardCustom: { backgroundColor: '#F0F9FF', borderColor: C.primary },
  roomCardDashed: { borderStyle: 'dashed' },
  roomLabel: { fontSize: 10, fontWeight: '700', color: '#565E61', textAlign: 'center' },
  roomLabelActive: { color: '#fff' },
  roomLabelCustom: { color: C.primary },

  input: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#191C1D', fontWeight: '600', backgroundColor: '#F8FAFC' },

  // Icon library
  iconLibHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginBottom: 10 },
  iconLibTitle: { fontSize: 12, fontWeight: '800', color: '#191C1D', textTransform: 'uppercase', letterSpacing: 0.4 },
  iconSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  iconSearchInput: { flex: 1, fontSize: 13, color: '#191C1D', fontWeight: '600' },
  catTab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginRight: 8 },
  catTabActive: { backgroundColor: C.primary, borderColor: C.primary },
  catTabT: { fontSize: 11, fontWeight: '700', color: '#70797C' },
  catTabTActive: { color: '#fff' },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  iconCell: { width: ICON_CELL_SIZE, height: ICON_CELL_SIZE, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center', gap: 4 },
  iconCellActive: { backgroundColor: C.filledButtonBg, borderColor: C.filledButtonBg },
  iconCellLabel: { fontSize: 8, fontWeight: '700', color: '#70797C', textAlign: 'center' },

  summaryCard: { marginTop: 20, flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F0FDF4', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BBF7D0' },
  summaryFloor: { fontSize: 11, fontWeight: '800', color: '#15803D', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryRoom: { fontSize: 16, fontWeight: '900', color: '#166534', marginTop: 2 },
  summaryNotes: { fontSize: 11, color: '#4ADE80', fontWeight: '600', marginTop: 4 },

  footer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, gap: 10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  backBtnT: { fontSize: 14, fontWeight: '700', color: C.slate },
  nextBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 14 },
  nextBtnDisabled: { opacity: 0.4 },
  nextBtnT: { fontSize: 14, fontWeight: '900', color: '#fff' },
  });
}
