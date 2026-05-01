import React, { type ComponentProps } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import type { TFunction } from 'i18next';
import { Ionicons } from '@expo/vector-icons';
import { type ColorPalette } from '../theme/colors';
import { taskOsLabel } from '../utils/taskOsLabel';
import { TaskMetadataGlyph } from './TaskMetadataGlyph';
import { getLocationZoneTypeVisual, type LocationZoneChrome } from '../utils/locationZoneTypeDisplay';

const metricValueBase = {
  fontSize: 16,
  fontWeight: '900' as const,
  marginTop: 6,
  letterSpacing: -0.25,
};

type IonicName = ComponentProps<typeof Ionicons>['name'];

type MetricBoxProps = {
  C: ColorPalette;
  iconName: IonicName;
  label: string;
  value: string;
  valueColor: string;
  loading?: boolean;
};

function StudioMetricBox({ C, iconName, label, value, valueColor, loading }: MetricBoxProps) {
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 16,
        backgroundColor: C.cardWhite,
        paddingHorizontal: 10,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name={iconName} size={22} color={C.textLight} />
      <Text
        style={{
          marginTop: 8,
          fontSize: 10,
          fontWeight: '600',
          color: C.textLight,
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      {loading ? (
        <View style={{ marginTop: 8, height: 20, justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={C.textSecondary} />
        </View>
      ) : (
        <Text numberOfLines={1} style={[metricValueBase, { color: valueColor }]}>
          {value}
        </Text>
      )}
    </View>
  );
}

export type ProviderOsListCardStudioProps = {
  C: ColorPalette;
  order: any;
  t: TFunction;
  i18n: { language?: string };
  /** Borda exterior do card — alinhada ao estado (ex.: `cardTone.cardBorder` na lista prestador). */
  frameBorderColor: string;
  /** Fundo do cartão (ex.: verde claro para OS concluída — `cardTone.cardBg` no ecrã prestador). */
  cardBackgroundColor?: string;
  topBarColor: string;
  isPremium: boolean;
  onPress: () => void;
  onMapPress: () => void;
  onRevisionPress: () => void;
  cardStatusChipText: string;
  statusChip: {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    textStyle?: { textShadowColor: string; textShadowOffset: { width: number; height: number }; textShadowRadius: number };
  };
  formBadgeText: string | null;
  hasPendingVoiceNote: boolean;
  hasRevision: boolean;
  /** Duração / distância / ETA visíveis (pêndentes, em andamento, pausa — regra alinhada ao `providerCardShowsFieldMetrics` do ecrã). */
  showMetricsStrip: boolean;
  hasDur: boolean;
  durText: string;
  showDist: boolean;
  distLoading: boolean;
  distValueText: string;
  showEta: boolean;
  etaText: string;
  studioReceiptValue: string;
  studioDueValue: string;
  cardVencOverdue: boolean;
  cardVencIso: string | null;
  mapAccessibilityLabel: string;
  /** Cromática do botão de mapa (igual `resolveLocationZoneChrome` no card clássico). */
  mapZoneChrome: LocationZoneChrome;
  /** Conteúdo após o chip de estado: pausa, aguard. aceite, etc. */
  chipsRow: React.ReactNode;
  /** Oferta broadcast (primeiro a aceitar): pastilha junto ao rótulo da OS. */
  isBroadcastOffer?: boolean;
};

/**
 * Card de OS (prestador) — branco, barra superior, chip em contorno, modelo em pastilha laranja, título, bloco receb./venc., 3 caixas de métrica.
 */
const FORM_BUILDER_DEFAULT_ICON = '#64748B';

export function ProviderOsListCardStudio(p: ProviderOsListCardStudioProps) {
  const { C, order } = p;
  const surfaceBg = p.cardBackgroundColor ?? C.cardWhite;
  const osMapZoneVisual = getLocationZoneTypeVisual(order?.locationZoneType);
  /**
   * Fundo do quadrado do ícone: alinhar à fina barra e ao chip (topBar = estado) — NÃO a `listAccent`, que
   * pode ser categoria/revisão (ex. Tecnologia) e fica desalinhada de «Em andamento».
   */
  const statusStripColor = p.topBarColor;
  const iconFromBuilder = String(
    (order as any)?.metadata?.iconColor ?? (order as any)?.iconColor ?? '',
  )
    .trim();
  const taskGlyphColor = iconFromBuilder || FORM_BUILDER_DEFAULT_ICON;
  const mapAction = (
    <Pressable
      onPress={p.onMapPress}
      accessibilityRole="button"
      accessibilityLabel={p.mapAccessibilityLabel}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={({ pressed }) => ({
        width: p.isPremium ? 46 : 44,
        height: p.isPremium ? 46 : 44,
        borderRadius: p.isPremium ? 23 : 22,
        backgroundColor: p.mapZoneChrome.backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: p.mapZoneChrome.borderColor,
        opacity: pressed ? 0.88 : 1,
        flexShrink: 0,
        alignSelf: 'center',
      })}
    >
      <Ionicons
        name={osMapZoneVisual.icon as any}
        size={p.isPremium ? 21 : 20}
        color={p.mapZoneChrome.iconColor}
      />
    </Pressable>
  );
  return (
    <View
      style={{
        borderRadius: 20,
        borderWidth: 1,
        borderColor: p.frameBorderColor,
        backgroundColor: surfaceBg,
        overflow: 'hidden',
      }}
    >
      <View style={{ height: 3, width: '100%', backgroundColor: p.topBarColor }} />
      <Pressable
        android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
        onPress={p.onPress}
        style={({ pressed }) => ({
          opacity: pressed ? 0.98 : 1,
          transform: [{ scale: pressed ? 0.99 : 1 }],
        })}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 2 }}>
          {/* Alinhado ao card clássico: 3 ações em fila + mapa abaixo, coluna à direita. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <Text
                  style={{
                    fontSize: 12,
                    color: C.slate,
                    fontWeight: '800',
                  }}
                  numberOfLines={1}
                >
                  {taskOsLabel(order)}
                </Text>
                {p.isBroadcastOffer ? (
                  <View
                    style={{
                      alignSelf: 'flex-start',
                      backgroundColor: C.status.warning.bg,
                      paddingHorizontal: 8,
                      paddingVertical: 3,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: C.status.warning.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '900',
                        color: C.status.warning.fg,
                        letterSpacing: 0.2,
                      }}
                    >
                      {p.t('home.broadcastOfferChip')}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 11,
                    backgroundColor: `${statusStripColor}1F`,
                    borderWidth: 1,
                    borderColor: `${statusStripColor}3D`,
                    justifyContent: 'center',
                    alignItems: 'center',
                  }}
                >
                  <TaskMetadataGlyph
                    icon={(order?.icon as any) || 'construct-outline'}
                    iconLibrary={order?.iconLibrary}
                    size={22}
                    color={taskGlyphColor}
                  />
                </View>
                <Text
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 18,
                    lineHeight: 24,
                    fontWeight: '800',
                    color: C.slate,
                    letterSpacing: -0.25,
                  }}
                >
                  {String(order?.service || '')}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 9, paddingTop: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {p.hasRevision ? (
                  <Pressable
                    onPress={p.onRevisionPress}
                    accessibilityRole="button"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={({ pressed: pr }) => ({
                      width: 30,
                      height: 30,
                      borderRadius: 11,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: C.status.info.bg,
                      borderWidth: 1,
                      borderColor: C.status.info.border,
                      opacity: pr ? 0.82 : 1,
                    })}
                  >
                    <Ionicons name="layers-outline" size={16} color={C.status.info.fg} />
                  </Pressable>
                ) : null}
                <View
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 11,
                    justifyContent: 'center',
                    alignItems: 'center',
                    backgroundColor: order.isPendingSync ? C.status.warning.bg : C.status.success.bg,
                    borderWidth: 1,
                    borderColor: order.isPendingSync ? C.status.warning.border : C.status.success.border,
                  }}
                >
                  <Ionicons
                    name={order.isPendingSync ? 'cloud-offline' : 'cloud-done'}
                    size={16}
                    color={order.isPendingSync ? C.status.warning.fg : C.status.success.fg}
                  />
                </View>
                {p.hasPendingVoiceNote ? (
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 11,
                      justifyContent: 'center',
                      alignItems: 'center',
                      backgroundColor: C.status.warning.bg,
                      borderWidth: 1,
                      borderColor: C.status.warning.border,
                    }}
                  >
                    <Ionicons name="mic-outline" size={16} color={C.status.warning.fg} />
                  </View>
                ) : null}
              </View>
              {p.formBadgeText ? null : mapAction}
            </View>
          </View>
          {p.formBadgeText ? (
            <View
              style={{
                marginTop: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <View
                style={{
                  flex: 1,
                  minWidth: 0,
                  maxWidth: '100%',
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: C.primary,
                }}
              >
                <Text
                  numberOfLines={2}
                  style={{ fontSize: 11, fontWeight: '800', color: C.cardWhite, letterSpacing: -0.08, lineHeight: 15 }}
                >
                  {p.formBadgeText}
                </Text>
              </View>
              {mapAction}
            </View>
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              gap: 8,
              marginTop: p.formBadgeText ? 8 : 10,
            }}
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: p.statusChip.borderColor,
                borderRadius: 999,
                paddingHorizontal: 12,
                paddingVertical: 5,
                backgroundColor: p.statusChip.backgroundColor,
                ...Platform.select({
                  ios: {
                    shadowColor: p.statusChip.backgroundColor,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.42,
                    shadowRadius: 5,
                  },
                  android: { elevation: 3 },
                  default: {},
                }),
              }}
            >
              <Text
                style={[
                  { fontSize: 10, fontWeight: '900', color: p.statusChip.textColor, letterSpacing: 0.25 },
                  p.statusChip.textStyle,
                ]}
                numberOfLines={1}
              >
                {p.cardStatusChipText}
              </Text>
            </View>
            {p.chipsRow}
          </View>
        </View>
        <View
          style={{
            marginHorizontal: 16,
            marginTop: 2,
            marginBottom: 2,
            backgroundColor: C.surfaceLow,
            borderRadius: 12,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: C.border,
            padding: 12,
            flexDirection: 'row',
          }}
        >
          <View
            style={{
              flex: 1,
              paddingRight: 10,
              borderRightWidth: StyleSheet.hairlineWidth,
              borderRightColor: C.border,
            }}
          >
            <Ionicons name="document-text-outline" size={16} color={C.textSecondary} />
            <Text
              style={{
                marginTop: 4,
                fontSize: 9,
                fontWeight: '800',
                color: C.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.45,
              }}
            >
              {p.t('home.osStudioReceiptCaps')}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 13, fontWeight: '800', color: C.slate, letterSpacing: -0.12 }}>
              {p.studioReceiptValue || '—'}
            </Text>
          </View>
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color={p.cardVencIso ? (p.cardVencOverdue ? C.destructive : C.textSecondary) : C.textSecondary}
            />
            <Text
              style={{
                marginTop: 4,
                fontSize: 9,
                fontWeight: '800',
                color: p.cardVencOverdue ? C.destructive : C.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 0.45,
              }}
            >
              {p.t('home.osStudioDueCaps')}
            </Text>
            <Text
              style={{
                marginTop: 4,
                fontSize: 13,
                fontWeight: '800',
                color: p.cardVencIso
                  ? p.cardVencOverdue
                    ? C.destructive
                    : C.slate
                  : C.textLight,
                letterSpacing: -0.12,
              }}
              numberOfLines={2}
            >
              {p.studioDueValue}
            </Text>
          </View>
        </View>
        {p.showMetricsStrip ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              gap: 10,
              paddingHorizontal: 16,
              marginTop: 8,
              marginBottom: 16,
            }}
          >
            <StudioMetricBox
              C={C}
              iconName="time-outline"
              label={p.t('home.osMetaDuration')}
              value={p.durText}
              valueColor={C.primary}
            />
            <StudioMetricBox
              C={C}
              iconName="location-outline"
              label={p.t('home.osMetaDistance')}
              value={p.showDist && !p.distLoading && p.distValueText ? p.distValueText : '—'}
              valueColor={C.slate}
              loading={p.showDist && p.distLoading}
            />
            <StudioMetricBox
              C={C}
              iconName="navigate-outline"
              label={p.t('home.osMetaEta')}
              value={p.etaText}
              valueColor={C.status.success.fg}
            />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
