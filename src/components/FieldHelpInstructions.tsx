import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  StyleSheet,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_BASE } from '../services/auth';

export type FieldHelpInstructionsProps = {
  plainDescription?: string;
  helpHtml?: string;
  /** Quando preenchida, substitui as imagens de referência do modelo no modal por esta captura. */
  capturedPreviewUri?: string | null;
};

function decodeAttrEntities(s: string): string {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * O painel grava frequentemente src relativas (`/uploads/checklist-help/...`) ou
 * `http://localhost:3001/...` — no celular isso não resolve; usa a mesma base que a API.
 */
export function resolveHelpMediaUri(raw: string): string {
  let s = decodeAttrEntities((raw || '').trim());
  if (!s) return s;
  if (s.startsWith('data:') || s.startsWith('file:')) return s;

  const baseNorm = API_BASE.replace(/\/$/, '');

  if (/^https?:\/\//i.test(s)) {
    if (!__DEV__) return s;
    try {
      const u = new URL(s);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        const origin = new URL(`${baseNorm}/`).origin;
        return `${origin}${u.pathname}${u.search}`;
      }
    } catch {
      /* ignore */
    }
    return s;
  }

  if (s.startsWith('//')) {
    const proto = baseNorm.startsWith('https') ? 'https:' : 'http:';
    return `${proto}${s}`;
  }

  const path = s.startsWith('/') ? s : `/${s}`;
  return `${baseNorm}${path}`;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractImgUrls(html: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  const push = (raw: string) => {
    const t = decodeAttrEntities(raw).trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      urls.push(t);
    }
  };

  let m: RegExpExecArray | null;
  let re = /<img\b[^>]*\bsrc\s*=\s*"([^"]*)"/gi;
  while ((m = re.exec(html)) !== null) push(m[1]);

  re = /<img\b[^>]*\bsrc\s*=\s*'([^']*)'/gi;
  while ((m = re.exec(html)) !== null) push(m[1]);

  re = /<img\b[^>]*\bsrc\s*=\s*(?![\"'])([^\s>]+)/gi;
  while ((m = re.exec(html)) !== null) push(m[1]);

  return urls;
}

/** Há texto ou imagem útil (ignora HTML vazio do Quill). */
export function hasRealInstructionContent(field: { description?: string; helpHtml?: string }): boolean {
  const desc = String(field.description || '').trim();
  if (desc.length > 0) return true;
  const html = String(field.helpHtml || '').trim();
  if (!html) return false;
  if (extractImgUrls(html).length > 0) return true;
  return stripHtmlToText(html).length > 0;
}

/**
 * Mostrar bloco de instruções no app: respeita showFieldInstructions do builder.
 * Templates sem a chave: só mostra se houver conteúdo real (retrocompatível).
 */
export function isFieldInstructionsVisible(field: {
  showFieldInstructions?: boolean;
  description?: string;
  helpHtml?: string;
}): boolean {
  if (!field || field.showFieldInstructions === false) return false;
  if (field.showFieldInstructions === true) return hasRealInstructionContent(field);
  return hasRealInstructionContent(field);
}

const SHEET_HEADER_PX = 56;

export function FieldHelpInstructions({
  plainDescription,
  helpHtml,
  capturedPreviewUri,
}: FieldHelpInstructionsProps) {
  const desc = (plainDescription || '').trim();
  const html = (helpHtml || '').trim();
  if (!desc && !html) return null;

  const [open, setOpen] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /** Altura máxima da planilha e do ScrollView — sem isto o RN muitas vezes não faz scroll dentro do modal. */
  const sheetMaxHeight = Math.round(windowHeight * 0.9);
  const scrollMaxHeight = Math.max(200, sheetMaxHeight - SHEET_HEADER_PX - Math.round(insets.bottom));

  const { textFromHtml, images } = useMemo(() => {
    if (!html) return { textFromHtml: '', images: [] as string[] };
    return {
      textFromHtml: stripHtmlToText(html),
      images: extractImgUrls(html),
    };
  }, [html]);

  const hasRichHelp = Boolean(html);
  /** Só mostrar descrição no cartão quando não há HTML rico: com helpHtml tudo vai para o modal (evita parecer “título”/corpo duplicado). */
  const showPlainOnCard = Boolean(desc) && !hasRichHelp;

  return (
    <View style={styles.wrap}>
      {showPlainOnCard ? <Text style={styles.plain}>{desc}</Text> : null}
      {hasRichHelp ? (
        <>
          <TouchableOpacity
            onPress={() => setOpen(true)}
            style={styles.btn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Abrir instruções detalhadas"
          >
            <Ionicons name="information-circle-outline" size={18} color="#0369a1" />
            <Text style={styles.btnLabel}>Instruções</Text>
            <Ionicons name="chevron-forward" size={16} color="#0369a1" style={{ marginLeft: 2 }} />
          </TouchableOpacity>

          <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
            <View style={styles.backdrop} pointerEvents="box-none">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Fechar instruções" />
              <View style={[styles.sheet, { maxHeight: sheetMaxHeight }]} pointerEvents="box-none">
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>Instruções</Text>
                  <TouchableOpacity onPress={() => setOpen(false)} hitSlop={12} accessibilityLabel="Fechar">
                    <Ionicons name="close" size={26} color="#0f172a" />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={[styles.sheetScroll, { maxHeight: scrollMaxHeight }]}
                  contentContainerStyle={[
                    styles.sheetBodyContent,
                    { paddingBottom: 40 + insets.bottom },
                  ]}
                  showsVerticalScrollIndicator
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  bounces
                >
                  {desc ? <Text style={styles.modalPlain}>{desc}</Text> : null}
                  {textFromHtml ? (
                    <Text style={styles.modalText} selectable>
                      {textFromHtml}
                    </Text>
                  ) : null}
                  {capturedPreviewUri && String(capturedPreviewUri).trim() ? (
                    <View style={styles.captureBlock}>
                      <Text style={styles.captureLabel}>A sua fotografia</Text>
                      <Text style={styles.captureHint}>
                        Substitui a imagem de referência do modelo neste painel.
                      </Text>
                      <Image
                        source={{ uri: String(capturedPreviewUri).trim() }}
                        style={styles.helpImage}
                        resizeMode="contain"
                        accessibilityLabel="Fotografia capturada para este campo"
                      />
                    </View>
                  ) : (
                    images.map((uri, i) => {
                      const resolved = resolveHelpMediaUri(uri);
                      return (
                        <Image
                          key={`${i}-${resolved.slice(0, 80)}`}
                          source={{ uri: resolved }}
                          style={styles.helpImage}
                          resizeMode="contain"
                          accessibilityLabel={`Imagem ${i + 1} das instruções`}
                        />
                      );
                    })
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  plain: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f0f9ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 6,
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0369a1',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0f172a',
  },
  sheetScroll: {
    width: '100%',
  },
  sheetBodyContent: {
    padding: 18,
    flexGrow: 1,
    gap: 14,
  },
  modalPlain: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 21,
  },
  modalText: {
    fontSize: 15,
    color: '#0f172a',
    lineHeight: 22,
  },
  helpImage: {
    width: '100%',
    minHeight: 160,
    maxHeight: 720,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  captureBlock: {
    gap: 8,
  },
  captureLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0f172a',
  },
  captureHint: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 17,
    marginBottom: 4,
  },
});
