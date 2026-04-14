import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import RenderHtml, { type MixedStyleRecord } from 'react-native-render-html';
import { API_BASE } from '../services/auth';

const MAX_HTML_CHARS = 400_000;

/**
 * Remove scripts, iframes, hiperligações e handlers inseguros do HTML da Leitura.
 * `<a>` vira `<span>` (sem navegação). Sem DOMParser — compatível com React Native.
 */
export function sanitizeLeituraHtml(html: string): string {
  let s = String(html || '').slice(0, MAX_HTML_CHARS);
  if (!s.trim()) return '';
  s = s.replace(/<script\b[\s\S]*?<\/script>/gi, '');
  s = s.replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '');
  s = s.replace(/<object\b[\s\S]*?<\/object>/gi, '');
  s = s.replace(/<embed\b[^>]*\/?>/gi, '');
  s = s.replace(/<\/?(?:form|button|input|select|textarea)\b[^>]*>/gi, '');
  s = s.replace(/\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  s = s.replace(/\s+href\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, '');
  s = s.replace(/\s+src\s*=\s*["']?\s*javascript:[^"'>\s]*/gi, '');
  s = s.replace(/<a\b[^>]*>/gi, '<span>');
  s = s.replace(/<\/a>/gi, '</span>');
  return s;
}

const tagsStyles: MixedStyleRecord = {
  body: { margin: 0, paddingTop: 0, paddingHorizontal: 2, paddingBottom: 8 },
  p: { marginTop: 0, marginBottom: 10 },
  h1: { fontSize: 22, fontWeight: '800', marginBottom: 8, color: '#0f172a' },
  h2: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: '#0f172a' },
  h3: { fontSize: 16, fontWeight: '700', marginBottom: 6, color: '#0f172a' },
  ul: { marginBottom: 10, paddingLeft: 4 },
  ol: { marginBottom: 10, paddingLeft: 4 },
  li: { marginBottom: 4 },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#e2e8f0',
    paddingLeft: 10,
    marginBottom: 10,
    fontStyle: 'italic',
    color: '#475569',
  },
  img: { borderRadius: 8 },
  div: {},
  span: {},
};

type LeituraBlockProps = {
  contentHtml?: string;
};

/** Renderização nativa (sem WebView) — evita RNCWebViewModule ausente em alguns builds. */
export function LeituraBlock({ contentHtml }: LeituraBlockProps) {
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(200, width - 48);
  const safe = useMemo(() => sanitizeLeituraHtml(String(contentHtml || '')), [contentHtml]);
  const baseUrl = useMemo(() => {
    const b = String(API_BASE || '').replace(/\/$/, '');
    return b ? `${b}/` : undefined;
  }, []);

  if (!safe.trim()) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sem texto de leitura configurado.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <RenderHtml
        contentWidth={contentWidth}
        source={baseUrl ? { html: safe, baseUrl } : { html: safe }}
        tagsStyles={tagsStyles}
        baseStyle={styles.htmlBase}
        ignoredDomTags={['script', 'iframe', 'object', 'embed', 'form', 'input', 'select', 'textarea', 'button']}
        enableExperimentalMarginCollapsing
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginTop: 4,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  htmlBase: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0f172a',
  },
  empty: {
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  emptyText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
});
