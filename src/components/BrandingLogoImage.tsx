import React, { useEffect, useState } from 'react';
import { Image, type ImageResizeMode, type ImageStyle, type StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const FALLBACK_LOGO = require('../../assets/logo.png');

export type BrandingLogoImageProps = {
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
};

/**
 * Logótipo de branding (URI local em cache) com fallback automático para o PNG embutido
 * se o ficheiro em disco falhar, estiver corrompido ou o URI for inválido.
 */
export function BrandingLogoImage({
  style,
  resizeMode = 'contain',
  accessibilityLabel,
}: BrandingLogoImageProps) {
  const { resolvedLogoUrl } = useTheme();
  const [uriFailed, setUriFailed] = useState(false);

  useEffect(() => {
    setUriFailed(false);
  }, [resolvedLogoUrl]);

  const useUri = Boolean(resolvedLogoUrl) && !uriFailed;

  return (
    <Image
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
      source={useUri ? { uri: resolvedLogoUrl as string } : FALLBACK_LOGO}
      defaultSource={FALLBACK_LOGO}
      onError={() => {
        if (resolvedLogoUrl) setUriFailed(true);
      }}
    />
  );
}
