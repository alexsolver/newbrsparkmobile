import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { SafeAreaView } from 'react-native-safe-area-context';

export function Header() {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <TouchableOpacity style={styles.profileButton}>
          <View style={styles.profileAvatar} />
        </TouchableOpacity>
        
        <Text style={styles.title}>BrSpark</Text>
        
        <TouchableOpacity style={styles.searchButton}>
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
  },
  profileAvatar: {
    flex: 1,
    backgroundColor: '#FFE4E1', // Peach-ish placeholder
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  searchButton: {
    padding: 4,
  },
});
