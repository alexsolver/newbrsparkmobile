import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Image, Text, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useSegments, useLocalSearchParams, Href } from 'expo-router';
import { useAppContext, checkGuardBeforeBack } from '../context/AppContext';
import { getLocalAssets } from '../database';
import { Asset } from '../types/asset';
import { useAuth } from '../hooks/useAuth';
import { useConnectivity } from '../hooks/useConnectivity';

interface HeaderProps {
  showAssetTools?: boolean;
  title?: string;
  leftIcon?: string;
  onLeftPress?: () => void;
}

export function Header({ showAssetTools = false, title, leftIcon, onLeftPress }: HeaderProps) {
  const router = useRouter();
  const segments = useSegments() as string[];
  const params = useLocalSearchParams();
  const { colors: C } = useTheme();
  const { mode, setMode, guardRef } = useAppContext();
  const { user, userRole } = useAuth();
  const { isOnline } = useConnectivity();

  // Pulse animation for the online dot
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isOnline) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.6, duration: 900, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [isOnline]);

  // Dot color: grey while first check, green online, red offline
  const dotColor = isOnline === null ? '#94A3B8' : isOnline ? '#22C55E' : '#EF4444';
  const dotLabel = isOnline === null ? 'Verificando...' : isOnline ? 'Online' : 'Offline';

  const isAssetDetail = segments[0] === 'asset' && segments.length > 1 && segments[1] !== 'new';
  const isProfile = segments[0] === 'profile';
  const isTabs = segments[0] === '(tabs)';

  // O Header global (injetado no _layout.tsx) não recebe `title`.
  // Devemos escondê-lo completamente se não estivermos nas abas principais, no perfil ou no detalhe do ativo.
  if (!title && !isTabs && !isProfile && !isAssetDetail) {
    return null;
  }

  const asset = isAssetDetail && params.id ? getLocalAssets().find(a => a.id === params.id) : null;

  const toggleMode = () => {
    const newMode = mode === 'SERVICES' ? 'ASSETS' : 'SERVICES';
    setMode(newMode);
    // If not in main screen, redirect to it to show the correct content
    if (segments[0] !== '(tabs)') {
      router.push('/(tabs)');
    }
  };

  const renderBadge = (isLarge = false) => (
    <View style={{
      flexDirection: 'row',
      backgroundColor: '#F1F5F9',
      borderRadius: 18,
      padding: 3,
      width: 140, // Back to 2 options width
    }}>
      {userRole === 'CLIENT' && (
        <TouchableOpacity 
          onPress={() => {
            setMode('SERVICES');
            if (segments[0] !== '(tabs)') router.push('/(tabs)');
          }}
          activeOpacity={0.8}
          style={{
            flex: 1,
            paddingVertical: 4,
            borderRadius: 16,
            alignItems: 'center',
            backgroundColor: mode === 'SERVICES' ? '#fff' : 'transparent',
            shadowColor: mode === 'SERVICES' ? '#000' : 'transparent',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: mode === 'SERVICES' ? 0.05 : 0,
            shadowRadius: 2,
            elevation: mode === 'SERVICES' ? 1 : 0,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: mode === 'SERVICES' ? '900' : '700', color: mode === 'SERVICES' ? '#10B981' : '#94A3B8', letterSpacing: 0.2 }}>SERVIÇOS</Text>
        </TouchableOpacity>
      )}
      
      {/* Bens is always visible */}
      <TouchableOpacity 
        onPress={() => {
          setMode('ASSETS');
          if (segments[0] !== '(tabs)') router.push('/(tabs)');
        }}
        activeOpacity={0.8}
        style={{
          flex: 1,
          paddingVertical: 4,
          borderRadius: 16,
          alignItems: 'center',
          backgroundColor: mode === 'ASSETS' ? '#fff' : 'transparent',
          shadowColor: mode === 'ASSETS' ? '#000' : 'transparent',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: mode === 'ASSETS' ? 0.05 : 0,
          shadowRadius: 2,
          elevation: mode === 'ASSETS' ? 1 : 0,
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: mode === 'ASSETS' ? '900' : '700', color: mode === 'ASSETS' ? '#3B82F6' : '#94A3B8', letterSpacing: 0.2 }}>BENS</Text>
      </TouchableOpacity>

      {userRole === 'TECHNICIAN' && (
        <TouchableOpacity 
          onPress={() => {
            setMode('PROVIDER');
            if (segments[0] !== '(tabs)') router.push('/(tabs)');
          }}
          activeOpacity={0.8}
          style={{
            flex: 1,
            paddingVertical: 4,
            borderRadius: 16,
            alignItems: 'center',
            backgroundColor: mode === 'PROVIDER' ? '#fff' : 'transparent',
            shadowColor: mode === 'PROVIDER' ? '#000' : 'transparent',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: mode === 'PROVIDER' ? 0.05 : 0,
            shadowRadius: 2,
            elevation: mode === 'PROVIDER' ? 1 : 0,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: mode === 'PROVIDER' ? '900' : '700', color: mode === 'PROVIDER' ? '#D97706' : '#94A3B8', letterSpacing: 0.2 }}>PRESTADOR</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (title || isAssetDetail || isProfile) {
    return (
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
        <View style={{ height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          {/* Left: Back + Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity onPress={onLeftPress || (() => checkGuardBeforeBack(guardRef, () => router.back()))} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' }}>
              <Ionicons name={(leftIcon as any) || "arrow-back"} size={20} color="#191C1D" />
            </TouchableOpacity>

            <Image 
              source={require('../../assets/logo.png')} 
              style={{ width: 70, height: 22, marginLeft: 2, marginRight: 4 }} 
              resizeMode="contain" 
            />

            {title ? (
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>
                {title}
              </Text>
            ) : isAssetDetail && asset ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Image
                  source={{ uri: asset.imageUrl || 'https://via.placeholder.com/150' }}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0' }}
                />
                <Text style={{ fontSize: 13, fontWeight: '900', color: '#191C1D', maxWidth: 160 }} numberOfLines={1}>
                  {asset.title}
                </Text>
              </View>
            ) : isProfile ? (
              <Text style={{ fontSize: 18, fontWeight: '900', color: '#191C1D', letterSpacing: -0.5 }}>
                Configurações
              </Text>
            ) : null}
          </View>

          {/* Right: QR + connectivity dot + Profile */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {!isProfile ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {/* Connectivity dot */}
                <View style={{ alignItems: 'center', justifyContent: 'center', width: 20 }}>
                  <Animated.View style={[
                    styles.dotRing,
                    { borderColor: dotColor, transform: [{ scale: pulse }] }
                  ]} />
                  <View style={[styles.dot, { backgroundColor: dotColor }]} />
                </View>
                <TouchableOpacity
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderColor: '#F1F5F9', borderWidth: 1, justifyContent: 'center', alignItems: 'center' }}
                  onPress={() => router.push('/scanner')}
                >
                  <Ionicons name="qr-code-outline" size={20} color={C.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', borderColor: '#F1F5F9', borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}
                  onPress={() => router.push('/profile')}
                >
                  {user?.avatarUrl ? (
                    <Image source={{ uri: user.avatarUrl }} style={{ width: 40, height: 40 }} />
                  ) : (
                    <Ionicons name="person-outline" size={20} color={C.textSecondary} />
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ width: 40 }} />
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.safeArea, { backgroundColor: C.cardWhite }]}>
      <View style={[styles.container, { borderBottomColor: C.border, height: 64 }]}>
        {/* Left: Logo */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image 
            source={require('../../assets/logo.png')} 
            style={{ width: 100, height: 32 }} 
            resizeMode="contain" 
          />
        </View>
        
        {/* Middle: Centered Badge */}
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'box-none' }}>
          {(segments.length <= 1 || segments[1] === 'index') && renderBadge()}
        </View>
        
        {/* Right: connectivity dot + QR + Profile */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {/* Connectivity dot */}
          <View style={{ alignItems: 'center', justifyContent: 'center', width: 20 }}>
            <Animated.View style={[
              styles.dotRing,
              { borderColor: dotColor, transform: [{ scale: pulse }] }
            ]} />
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
          </View>
          <TouchableOpacity 
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderColor: '#F1F5F9', borderWidth: 1, justifyContent: 'center', alignItems: 'center' }} 
            onPress={() => router.push('/scanner')}
            activeOpacity={0.7}
          >
            <Ionicons name="qr-code-outline" size={22} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderColor: '#F1F5F9', borderWidth: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }} 
            onPress={() => router.push('/profile')}
            activeOpacity={0.7}
          >
            {user?.avatarUrl ? (
              <Image source={{ uri: user.avatarUrl }} style={{ width: 44, height: 44 }} />
            ) : (
               <Ionicons name="person-outline" size={22} color={C.textSecondary} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {},
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
  },
  profileAvatar: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 140,
    height: 40,
  },
  searchButton: {
    padding: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'absolute',
  },
  dotRing: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    opacity: 0.4,
    position: 'absolute',
  },
});
