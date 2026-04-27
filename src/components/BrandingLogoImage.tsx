import React, { useEffect, useState } from 'react';
import { Image, type ImageResizeMode, type ImageStyle, type StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const FALLBACK_LOGO = require('../../assets/logo.png');

export type BrandingLogoImageProps = {
  style: StyleProp<ImageStyle>;
  resizeMode?: ImageResizeMode;
  accessibilityLabel?: string;
  /** `login` = asset opcional só no login; senão o logo geral da marca. */
  variant?: 'default' | 'login';
};

/**
 * Logótipo de branding (URI local em cache) com fallback automático para o PNG embutido
 * se o ficheiro em disco falhar, estiver corrompido ou o URI for inválido.
 */
export function BrandingLogoImage({
  style,
  resizeMode = 'contain',
  accessibilityLabel,
  variant = 'default',
}: BrandingLogoImageProps) {
  const { resolvedLogoUrl, resolvedLoginPageLogoUrl } = useTheme();
  const primaryUri =
    variant === 'login' ? resolvedLoginPageLogoUrl || resolvedLogoUrl : resolvedLogoUrl;
  const [uriFailed, setUriFailed] = useState(false);

  useEffect(() => {
    setUriFailed(false);
  }, [primaryUri, variant]);

  const useUri = Boolean(primaryUri) && !uriFailed;

  return (
    <Image
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
      source={useUri ? { uri: primaryUri as string } : FALLBACK_LOGO}
      defaultSource={FALLBACK_LOGO}
      onError={() => {
        if (primaryUri) setUriFailed(true);
      }}
    />
  );
}