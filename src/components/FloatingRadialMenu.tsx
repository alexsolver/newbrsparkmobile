import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Dimensions, Modal, TouchableWithoutFeedback } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { colors } from '../theme/colors';
import { useRouter } from 'expo-router';
import { useAppContext } from '../context/AppContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const ADMIN_MENU_ITEMS = [
  { id: 'qr', label: 'Ler QR', icon: 'qr-code-outline', color: '#14B8A6', route: '/scanner' },
  { id: 'asset', label: 'Bem', icon: 'business-outline', color: '#006B5C', route: '/asset/new' },
  { id: 'expense', label: 'Financeiro', icon: 'wallet-outline', color: '#EF4444', route: '/costs/new' },
  { id: 'stock', label: 'Estoque', icon: 'cube-outline', color: '#F59E0B', route: '/stock/new' },
  { id: 'media', label: 'Mídia', icon: 'camera-outline', color: '#8B5CF6', route: '/media/new' },
  { id: 'docs', label: 'Arquivos', icon: 'folder-open-outline', color: '#3B82F6', route: '/documents/new' },
];

const PROVIDER_MENU_ITEMS = [
  { id: 'qr', label: 'Ler QR', icon: 'qr-code-outline', color: '#14B8A6', route: '/scanner' },
  { id: 'mobile_stock', label: 'Estoque técnico', icon: 'cube-outline', color: '#0369a1', route: '/stock/mobile' },
  {
    id: 'tech_finance',
    label: 'Financeiro técnico',
    icon: 'cash-outline',
    color: '#0f766e',
    route: '/finance/mobile',
  },
  { id: 'contracts', label: 'Contratos', icon: 'document-text', color: '#EF4444', route: '/' },
  { id: 'rules', label: 'Portaria', icon: 'shield-checkmark', color: '#F97316', route: '/' },
];

export function FloatingRadialMenu() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const insets = useSafeAreaInsets();
  const { mode } = useAppContext();
  
  const MENU_ITEMS = mode === 'PROVIDER' ? PROVIDER_MENU_ITEMS : ADMIN_MENU_ITEMS;

  const [isOpen, setIsOpen] = useState(false);
  const [expenseActionModal, setExpenseActionModal] = useState(false);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: isOpen ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.back(1.5)),
      useNativeDriver: true,
    }).start();
  }, [isOpen]);

  const toggleMenu = () => setIsOpen(!isOpen);

  const closeMenu = () => {
    if (isOpen) {
      setIsOpen(false);
    }
  };

  const handlePress = (item: any) => {
    closeMenu();
    setTimeout(() => {
      router.push(item.route as any);
    }, 150);
  };

  // Rotation for the main FAB + button
  const spin = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg']
  });

  const backdropOpacity = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.7]
  });

  // Raio do leque (distância do centro do botão)
  const RADIUS = 110;
  // O leque será distribuído num arco acima do botão. 
  // Ex: 6 itens, distribuídos de 180 graus (esquerda) até 0 graus (direita), ou um cone mais fechado.
  // Vamos usar de 195° até -15° para fazer um arco completo por cima.
  const START_ANGLE = Math.PI * 1.1; // pouco abaixo da horizontal esquerda
  const END_ANGLE = Math.PI * -0.1; // pouco abaixo da horizontal direita

  return (
    <View style={styles.container}>
      {/* O Botão Físico Real na TabBar */}
      <TouchableOpacity 
        style={styles.addBtn} 
        activeOpacity={0.8}
        onPress={toggleMenu}
      >
        <Animated.View style={{ transform: [{ rotate: spin }] }}>
          <Ionicons name="add" size={32} color={colors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      {/* Modal Sobreposto para o Menu Aberto */}
      <Modal visible={isOpen} transparent animationType="none" onRequestClose={closeMenu}>
        <TouchableWithoutFeedback onPress={closeMenu}>
          <View style={styles.overlay}>
            <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
            
            {/* Ponto focal: o mesmo lugar exato do FAB original */}
            <View style={[styles.menuAnchor, { bottom: insets.bottom + 16 }]}>
              
              <Animated.View style={[StyleSheet.absoluteFillObject]}>
                {MENU_ITEMS.map((item, index) => {
                  // Calcular a posição final (X, Y) com trigonometria
                  const progress = index / (MENU_ITEMS.length - 1);
                  const angle = START_ANGLE + progress * (END_ANGLE - START_ANGLE);
                  
                  const translateX = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, RADIUS * Math.cos(angle)]
                  });

                  const translateY = anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -RADIUS * Math.sin(angle)] // Y cresce pra baixo no RN, invertemos com -
                  });

                  const scale = anim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.1, 0.5, 1]
                  });

                  const opacity = anim.interpolate({
                     inputRange: [0, 0.7, 1],
                     outputRange: [0, 1, 1]
                  });

                  return (
                    <Animated.View 
                      key={item.id}
                      style={[
                        styles.menuItemWrap,
                        {
                          opacity,
                          transform: [
                            { translateX },
                            { translateY },
                            { scale }
                          ]
                        }
                      ]}
                    >
                      <TouchableOpacity 
                        style={[styles.menuItemBtn, { backgroundColor: item.color }]}
                        activeOpacity={0.8}
                        onPress={() => handlePress(item)}
                      >
                        <Ionicons name={item.icon as any} size={22} color="#fff" />
                      </TouchableOpacity>
                      <Text style={styles.menuItemLabel}>{item.label}</Text>
                    </Animated.View>
                  );
                })}
              </Animated.View>

              {/* Fake FAB em cima de tudo para poder fechar o menu com a mesma animação */}
              <TouchableOpacity 
                style={[styles.addBtn, styles.addBtnActive]} 
                activeOpacity={0.8}
                onPress={closeMenu}
              >
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <Ionicons name="add" size={32} color="#fff" />
                </Animated.View>
              </TouchableOpacity>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Modal Interativo para Despesa (OCR vs Manual) */}
      <Modal visible={expenseActionModal} transparent animationType="fade" onRequestClose={() => setExpenseActionModal(false)}>
        <TouchableWithoutFeedback onPress={() => setExpenseActionModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <TouchableWithoutFeedback>
              <View style={{ backgroundColor: '#fff', borderRadius: 24, width: '100%', maxWidth: 340, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 15 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FEF2F2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                  <Ionicons name="receipt-outline" size={32} color="#EF4444" />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '900', color: colors.slate, marginBottom: 8, textAlign: 'center' }}>Registrar Despesa</Text>
                <Text style={{ fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 24, lineHeight: 18 }}>
                  Como você prefere adicionar os dados do recibo ou nota fiscal?
                </Text>

                <TouchableOpacity 
                  style={{ width: '100%', backgroundColor: colors.slate, paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12 }}
                  onPress={() => {
                    setExpenseActionModal(false);
                    router.push('/costs/ocr_process');
                  }}
                >
                  <Ionicons name="scan" size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Escanear com IA</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={{ width: '100%', backgroundColor: '#F1F5F9', paddingVertical: 14, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }}
                  onPress={() => {
                    setExpenseActionModal(false);
                    router.push('/costs/new?type=expense');
                  }}
                >
                  <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '800' }}>Entrada Manual</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: '#f1f5f9' 
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
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  }
});
