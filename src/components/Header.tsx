import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export function Header() {
  const router = useRouter();

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.profileButton} onPress={() => router.push('/profile')}>
          <View style={styles.profileAvatar}>
            <Ionicons name="person-outline" size={20} color={colors.textSecondary} style={{textAlign: 'center', marginTop: 5}}/>
          </View>
        </TouchableOpacity>
        
        {/* Logo Image Placeholder */}
        <Image 
          source={require('../../assets/logo.png')} 
          style={styles.logo} 
          resizeMode="contain" 
        />
        
        <TouchableOpacity style={styles.searchButton} onPress={() => router.push('/assets')}>
          <Ionicons name="search" size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.cardWhite,
  },
  container: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  profileButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EAECF0',
  },
  profileAvatar: {
    flex: 1,
  },
  logo: {
    width: 180,
    height: 48,
  },
  searchButton: {
    padding: 4,
  },
});
