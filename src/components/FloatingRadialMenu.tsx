import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useRouter } from 'expo-router';
import { useAppContext } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

const ADMIN_MENU_ITEMS = [
  { id: 'qr', label: 'Ler QR', icon: 'qr-code-outline', color: '#14B8A6', route: '/scanner' },
  { id: 'asset', label: 'Bem', icon: 'business-outline', color: '#006B5C', route: '/asset/new' },
  { id: 'expense', label: 'Financeiro', icon: 'wallet-outline', color: '#EF4444', route: '/costs/new' },
  { id: 'stock', label: 'Estoque', icon: 'cube-outline', color: '#F59E0B', route: '/stock/new' },
  { id: 'media', label: 'Mídia', icon: 'camera-outline', color: '#8B5CF6', route: '/media/new' },
  { id: 'docs', label: 'Arquivos', icon: 'folder-open-outline', color: '#3B82F6', route: '/documents/new' },
];

const PROVIDER_MENU_ITEMS = [
  { id: 'mobile_stock', label: 'Estoque técnico', icon: 'cube-outline', color: '#0369a1', route: '/stock/mobile' },
  {
    id: 'tech_finance',
    label: 'Financeiro',
    icon: 'cash-outline',
    color: '#0f766e',
    route: '/finance/mobile',
  },
  {
    id: 'productivity',
    labelKey: 'radialMenu.productivity',
    labelDefault: 'Desempenho',
    icon: 'trending-up-outline',
    color: '#7c3aed',
    route: '/productivity',
  },
];

type ProviderMenuItem =
  | { id: string; label: string; icon: string; color: string; route: string }
  | {
      id: string;
      labelKey: string;
      labelDefault: string;
      icon: string;
      color: string;
      route: string;
    };

function providerItemLabel(item: ProviderMenuItem, t: (k: string, o?: { defaultValue?: string }) => string) {
  return 'labelKey' in item ? t(item.labelKey, { defaultValue: item.labelDefault }) : item.label;
}

/** Arco do leque (radial) — itens distribuídos acima do botão + */
const RADIUS = 112;
const START_ANGLE = Math.PI * 1.1;
const END_ANGLE = Math.PI * -0.1;

function AdminRadialFan({
  isOpen,
  closeMenu,
  onToggle,
  insetsBottom,
  textSecondary,
  onItemPress,
}: {
  isOpen: boolean;
  closeMenu: () => void;
  onToggle: () => void;
  insetsBottom: number;
  textSecondary: string;
  onItemPress: (item: (typeof ADMIN_MENU_ITEMS)[number]) => void;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isOpen ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [isOpen, anim]);

  const spin = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.72],
  });

  const n = ADMIN_MENU_ITEMS.length;
  const denom = Math.max(1, n - 1);

  return (
    <>
      <TouchableOpacity style={radialStyles.addBtn} activeOpacity={0.8} onPress={onToggle}>
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Ionicons name="add" size={32} color={textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      <Modal visible={isOpen} transparent animationType="none" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={radialStyles.overlay}>
            <Animated.View style={[radialStyles.backdrop, { opacity: backdropOpacity }]} />

            <View style={[radialStyles.menuAnchor, { bottom: insetsBottom + 16 }]}>
              <Animated.View style={StyleSheet.absoluteFillObject}>
                {ADMIN_MENU_ITEMS.map((item, index) => {
                  const progress = n === 1 ? 0.5 : index / denom;
                  const angle = START_ANGLE + progress * (END_ANGLE - START_ANGLE);

                  const translateX = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, RADIUS * Math.cos(angle)],
                  });

                  const translateY = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -RADIUS * Math.sin(angle)],
                  });

                  const scale = anim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.1, 0.55, 1],
                  });

                  const opacity = anim.interpolate({
                    inputRange: [0, 0.65, 1],
                    outputRange: [0, 1, 1],
                  });

                  return (
                    <Animated.View
                      key={item.id}
                      style={[
                        radialStyles.menuItemWrap,
                        {
                          opacity,
                          transform: [{ translateX }, { translateY }, { scale }],
                        },
                      ]}
                    >
                      <TouchableOpacity
                        style={[radialStyles.menuItemBtn, { backgroundColor: item.color }]}
                        activeOpacity={0.85}
                        onPress={() => onItemPress(item)}
                      >
                        <Ionicons name={item.icon as any} size={22} color="#fff" />
                      </TouchableOpacity>
                      <Text style={radialStyles.menuItemLabel}>{item.label}</Text>
                    </Animated.View>
                  );
                })}
              </Animated.View>

              <TouchableOpacity style={[radialStyles.addBtn, radialStyles.addBtnActive]} activeOpacity={0.85} onPress={closeMenu}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Ionicons name="add" size={32} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </>
  );
}

export function FloatingRadialMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors: C } = useTheme();
  const { mode } = useAppContext();
  const { t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);

  const closeMenu = () => setIsOpen(false);

  const handlePress = (item: (typeof ADMIN_MENU_ITEMS)[number] | ProviderMenuItem) => {
    closeMenu();
    setTimeout(() => {
      router.push(item.route as any);
    }, 150);
  };

  if (mode === 'PROVIDER') {
    return (
      <View style={listStyles.container}>
        <TouchableOpacity style={listStyles.addBtn} activeOpacity={0.8} onPress={() => setIsOpen(true)}>
          <Ionicons name="add" size={32} color={C.textSecondary} />
        </TouchableOpacity>

        <Modal visible={isOpen} animationType="slide" onRequestClose={closeMenu}>
          <View style={listStyles.modalRoot}>
            <LinearGradient
              colors={['#EA580C', '#F97316']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[listStyles.headerGradient, { paddingTop: insets.top + 10, paddingBottom: 18 }]}
            >
              <View style={listStyles.headerRow}>
                <View style={listStyles.headerIconCircle}>
                  <Ionicons name="flash-outline" size={22} color="#fff" />
                </View>
                <View style={listStyles.headerTextCol}>
                  <Text style={listStyles.headerTitle}>Ações rápidas</Text>
                  <Text style={listStyles.headerLead}>Toque em uma opção para abrir a respectiva área do aplicativo.</Text>
                </View>
                <TouchableOpacity onPress={closeMenu} style={listStyles.headerClose}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            <ScrollView
              style={listStyles.scroll}
              contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
              showsVerticalScrollIndicator={false}
            >
              {PROVIDER_MENU_ITEMS.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.88}
                  onPress={() => handlePress(item)}
                  style={listStyles.rowCard}
                >
                  <View
                    style={[
                      listStyles.rowIconWrap,
                      {
                        backgroundColor: `${item.color}18`,
                        borderColor: `${item.color}35`,
                      },
                    ]}
                  >
                    <Ionicons name={item.icon as any} size={26} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={listStyles.rowTitle}>{providerItemLabel(item, t)}</Text>
                  </View>
                  <View style={listStyles.rowChevronWrap}>
                    <Ionicons name="chevron-forward" size={20} color="#CBD5E1" />
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={radialStyles.container}>
      <AdminRadialFan
        isOpen={isOpen}
        closeMenu={closeMenu}
        onToggle={() => setIsOpen((o) => !o)}
        insetsBottom={insets.bottom}
        textSecondary={C.textSecondary}
        onItemPress={handlePress}
      />
    </View>
  );
}

const radialStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  addBtnActive: {
    backgroundColor: '#1E293B',
    borderColor: '#0F172A',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0f172a',
  },
  menuAnchor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    height: 64,
  },
  menuItemWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    width: 72,
  },
  menuItemBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  menuItemLabel: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

const listStyles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#EEF2F6',
  },
  headerGradient: {
    paddingHorizontal: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTextCol: {
    flex: 1,
    paddingRight: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  headerLead: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 18,
    marginTop: 8,
  },
  headerClose: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    flex: 1,
  },
  rowCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 4,
  },
  rowIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0f172a',
    lineHeight: 22,
  },
  rowChevronWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
