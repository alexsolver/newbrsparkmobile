import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../src/theme/colors';
import { Header } from '../../src/components/Header';

export default function DocumentsScreen() {
  return (
    <View style={styles.container}>
      <Header />
      <View style={styles.content}>
        <Text style={styles.title}>Documents Archive</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, color: colors.textLight, fontWeight: '600' },
});
