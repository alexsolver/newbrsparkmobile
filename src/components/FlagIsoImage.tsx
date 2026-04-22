import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

/** Bandeiras vetoriais/raster via CDN (evita emoji que quebra no Android). */
export function flagCdnUri(iso: string, pixelWidth: 40 | 80 = 80): string {
  const code = String(iso || 'xx').toLowerCase();
  return `https://flagcdn.com/w${pixelWidth}/${code}.png`;
}

type Props = {
  iso: string;
  width?: number;
  height?: number;
  borderColor?: string;
};

export function FlagIsoImage({ iso, width = 26, height = 18, borderColor }: Props) {
  const [failed, setFailed] = useState(false);
  const bc = borderColor ?? 'rgba(0,0,0,0.08)';

  if (failed) {
    return (
      <View style={[styles.fallback, { width, height, borderColor: bc }]}>
        <Text style={styles.fallbackText} numberOfLines={1}>
          {String(iso || '').toUpperCase().slice(0, 2)}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.clip, { width, height, borderColor: bc }]}>
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: flagCdnUri(iso, 80) }}
        style={{ width, height }}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
  },
  fallback: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#555',
  },
});
