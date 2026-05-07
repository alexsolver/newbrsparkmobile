import React, { useEffect, useState } from 'react';
import {
  Image,
  View,
  StyleSheet,
  type ImageResizeMode,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
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
/**
 * Só `assets/logo.png` embutido — para login/registo públicos onde URIs do CMS podem
 * responder 200 com imagem vazia/transparente e o `Image` não chama `onError`.
 */
export function BundledAppMark({
  style,
  resizeMode = 'contain',
  accessibilityLabel,
}: Pick<BrandingLogoImageProps, 'style' | 'resizeMode' | 'accessibilityLabel'>) {
  return (
    <Image
      source={FALLBACK_LOGO}
      style={style}
      resizeMode={resizeMode}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

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

  /**
   * `source={{ uri }}` sem caixa explícita pode usar o tamanho intrínseco do PNG (ex.: 1024×1024)
   * e ignorar `aspectRatio` + `width` em %, desfigurando login/onboarding. O `View` define a caixa;
   * o `Image` só encaixa dentro com `resizeMode`.
   */
  return (
    <View style={[style, { overflow: 'hidden' }]}>
      <Image
        style={StyleSheet.absoluteFillObject}
        resizeMode={resizeMode}
        accessibilityLabel={accessibilityLabel}
        source={useUri ? { uri: primaryUri as string } : FALLBACK_LOGO}
        defaultSource={FALLBACK_LOGO}
        onError={() => {
          if (primaryUri) setUriFailed(true);
        }}
      />
    </View>
  );
}