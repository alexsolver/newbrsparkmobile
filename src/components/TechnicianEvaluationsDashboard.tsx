import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import type { ColorPalette } from '../theme/colors';
import { space, radius, fontSize } from '../theme/layout';

type Summary = {
  averageTotal: number | null;
  trend: 'up' | 'down' | 'flat';
  categoryAverages: Record<string, number | null>;
  criticalCount: number;
  criticalPendingAckCount: number;
  respondedCount: number;
};

type InstanceRow = {
  id: string;
  status: string;
  score: { totalScore: number; classification: string } | null;
};

const CHART_H = 112;
const BAR_MAX = 10;

type Props = {
  colors: ColorPalette;
  summary: Summary | null;
  items: InstanceRow[];
};

function StatCard({
  label,
  value,
  icon,
  colors,
  accent,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  colors: ColorPalette;
  accent?: string;
}) {
  const ac = accent ?? colors.accent;
  return (
    <View style={[statStyles.wrap, { backgroundColor: colors.cardWhite, borderColor: colors.divider }]}>
      <View style={[statStyles.iconCircle, { backgroundColor: `${ac}18` }]}>
        <Ionicons name={icon} size={20} color={ac} />
      </View>
      <Text style={[statStyles.val, { color: colors.slate }]}>{value}</Text>
      <Text style={[statStyles.lab, { color: colors.textLight }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  wrap: {
    width: '48%',
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.sm,
    marginBottom: space.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  val: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  lab: { fontSize: fontSize.xs, fontWeight: '700', marginTop: 4, lineHeight: 16 },
});

export function TechnicianEvaluationsDashboard({ colors: C, summary, items }: Props) {
  const { t } = useTranslation();
  const { width: winW } = useWindowDimensions();
  /** Largura útil ≈ ecrã menos padding horizontal do ScrollView (16+16). */
  const chartInnerW = Math.max(260, Math.min(winW - 32, 420));

  const trendIcon =
    summary?.trend === 'up' ? 'trending-up' : summary?.trend === 'down' ? 'trending-down' : 'remove';

  const catKeys = ['qualidade', 'prazo', 'atendimento'] as const;
  const catValues = catKeys.map((k) => {
    const v = summary?.categoryAverages?.[k];
    return typeof v === 'number' && !Number.isNaN(v) ? Math.min(Math.max(v, 0), BAR_MAX) : null;
  });

  const distribution = useMemo(() => {
    let ex = 0,
      gd = 0,
      cr = 0,
      none = 0;
    for (const it of items) {
      const c = String(it.score?.classification || '').toUpperCase();
      if (!it.score) {
        none += 1;
        continue;
      }
      if (c === 'EXCELLENT') ex += 1;
      else if (c === 'GOOD') gd += 1;
      else if (c === 'CRITICAL') cr += 1;
      else none += 1;
    }
    const total = items.length || 1;
    return {
      excellent: ex,
      good: gd,
      critical: cr,
      none,
      pct: {
        excellent: (ex / total) * 100,
        good: (gd / total) * 100,
        critical: (cr / total) * 100,
        none: (none / total) * 100,
      },
    };
  }, [items]);

  const awaitingClient = useMemo(
    () => items.filter((i) => String(i.status).toUpperCase() === 'PENDING').length,
    [items],
  );

  const gradientColors = [C.branding, C.accent] as [string, string];

  return (
    <View style={styles.block}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Text style={[styles.heroEyebrow, { color: 'rgba(255,255,255,0.88)' }]}>
          {t('productivity.dashboard.overview')}
        </Text>
        <View style={styles.heroRow}>
          <Text style={styles.heroScore}>
            {summary?.averageTotal != null ? summary.averageTotal.toFixed(1) : '—'}
          </Text>
        </View>
        <Text style={[styles.heroSub, { color: 'rgba(255,255,255,0.9)' }]}>
          {t('productivity.respondedCount', { count: summary?.respondedCount ?? 0 })}
        </Text>
        {summary?.averageTotal != null ? (
          <View style={[styles.trendPill, { backgroundColor: 'rgba(0,0,0,0.12)' }]}>
            <Ionicons name={trendIcon as any} size={14} color="#FFFFFF" />
            <Text style={styles.trendPillText}>
              {summary.trend === 'up'
                ? t('productivity.dashboard.trendUp')
                : summary.trend === 'down'
                  ? t('productivity.dashboard.trendDown')
                  : t('productivity.dashboard.trendFlat')}
            </Text>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.statGrid}>
        <StatCard
          label={t('productivity.dashboard.statResponded')}
          value={summary?.respondedCount ?? 0}
          icon="chatbubbles-outline"
          colors={C}
          accent={C.status.info.fg}
        />
        <StatCard
          label={t('productivity.dashboard.statCritical')}
          value={summary?.criticalCount ?? 0}
          icon="alert-circle-outline"
          colors={C}
          accent={C.status.danger.fg}
        />
        <StatCard
          label={t('productivity.dashboard.statAckPending')}
          value={summary?.criticalPendingAckCount ?? 0}
          icon="hand-left-outline"
          colors={C}
          accent={C.status.warning.fg}
        />
        <StatCard
          label={t('productivity.dashboard.statAwaitingClient')}
          value={awaitingClient}
          icon="hourglass-outline"
          colors={C}
          accent={C.accent}
        />
      </View>

      <View style={[styles.panel, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
        <Text style={[styles.panelTitle, { color: C.textSecondary }]}>{t('productivity.categories')}</Text>
        <Text style={[styles.panelHint, { color: C.textLight }]}>{t('productivity.dashboard.scaleHint')}</Text>
        <View style={{ alignItems: 'center', marginTop: space.sm }}>
          <Svg width={chartInnerW} height={CHART_H}>
            {catKeys.map((k, i) => {
              const v = catValues[i];
              const side = 12;
              const gap = 10;
              const barW = (chartInnerW - 2 * side - 2 * gap) / 3;
              const x = side + i * (barW + gap);
              const h = v == null ? 4 : (v / BAR_MAX) * (CHART_H - 8);
              const y = CHART_H - h;
              const fill =
                v == null ? C.divider : i === 0 ? C.status.success.fg : i === 1 ? C.status.info.fg : C.accent;
              return <Rect key={k} x={x} y={y} width={barW} height={h} rx={6} fill={fill} />;
            })}
          </Svg>
          <View style={[styles.catLabels, { width: chartInnerW }]}>
            {catKeys.map((k) => (
              <Text key={k} style={[styles.catLab, { color: C.textSecondary }]}>
                {t(`productivity.cat.${k}`)}
              </Text>
            ))}
          </View>
          <View style={[styles.catLabels, { width: chartInnerW, marginTop: 4 }]}>
            {catValues.map((v, i) => (
              <Text key={i} style={[styles.catVal, { color: C.slate }]}>
                {v != null ? v.toFixed(1) : '—'}
              </Text>
            ))}
          </View>
        </View>
      </View>

      <View style={[styles.panel, { backgroundColor: C.cardWhite, borderColor: C.divider }]}>
        <Text style={[styles.panelTitle, { color: C.textSecondary }]}>
          {t('productivity.dashboard.chartDistribution')}
        </Text>
        {items.length === 0 ? (
          <Text style={{ color: C.textLight, fontSize: fontSize.sm }}>{t('productivity.emptyList')}</Text>
        ) : (
          <>
            <View
              style={[
                styles.distBar,
                {
                  backgroundColor: C.surfaceLow,
                  borderColor: C.divider,
                },
              ]}
            >
              {distribution.pct.excellent > 0 ? (
                <View
                  style={[
                    styles.distSeg,
                    {
                      flex: distribution.excellent || 0.001,
                      backgroundColor: C.status.success.fg,
                    },
                  ]}
                />
              ) : null}
              {distribution.pct.good > 0 ? (
                <View
                  style={[
                    styles.distSeg,
                    { flex: distribution.good || 0.001, backgroundColor: C.status.info.fg },
                  ]}
                />
              ) : null}
              {distribution.pct.critical > 0 ? (
                <View
                  style={[
                    styles.distSeg,
                    {
                      flex: distribution.critical || 0.001,
                      backgroundColor: C.status.danger.fg,
                    },
                  ]}
                />
              ) : null}
              {distribution.pct.none > 0 ? (
                <View
                  style={[
                    styles.distSeg,
                    { flex: distribution.none || 0.001, backgroundColor: C.textLight },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.legend}>
              <LegendDot
                color={C.status.success.fg}
                label={t('productivity.scoreBand.EXCELLENT')}
                value={distribution.excellent}
                labelColor={C.textSecondary}
                valueColor={C.slate}
              />
              <LegendDot
                color={C.status.info.fg}
                label={t('productivity.scoreBand.GOOD')}
                value={distribution.good}
                labelColor={C.textSecondary}
                valueColor={C.slate}
              />
              <LegendDot
                color={C.status.danger.fg}
                label={t('productivity.scoreBand.CRITICAL')}
                value={distribution.critical}
                labelColor={C.textSecondary}
                valueColor={C.slate}
              />
              <LegendDot
                color={C.textLight}
                label={t('productivity.dashboard.noScoreYet')}
                value={distribution.none}
                labelColor={C.textSecondary}
                valueColor={C.slate}
              />
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function LegendDot({
  color,
  label,
  value,
  labelColor,
  valueColor,
}: {
  color: string;
  label: string;
  value: number;
  labelColor: string;
  valueColor: string;
}) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.legendLab, { color: labelColor }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.legendVal, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginBottom: space.sm },
  hero: {
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.md,
    overflow: 'hidden',
  },
  heroEyebrow: { fontSize: fontSize.xs, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: space.xs },
  heroScore: { fontSize: 44, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
  heroSub: { fontSize: fontSize.sm, fontWeight: '600', marginTop: space.xs },
  trendPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: space.sm,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  trendPillText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: space.sm,
  },
  panel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.md,
    marginBottom: space.md,
  },
  panelTitle: {
    fontSize: fontSize.xs,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  panelHint: { fontSize: 11, marginTop: 4, fontWeight: '600' },
  catLabels: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 4 },
  catLab: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  catVal: { flex: 1, textAlign: 'center', fontSize: 13, fontWeight: '900' },
  distBar: {
    height: 14,
    borderRadius: 7,
    flexDirection: 'row',
    overflow: 'hidden',
    marginTop: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  distSeg: { minWidth: 2 },
  legend: { marginTop: space.md, gap: space.xs },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  legendLab: { flex: 1, fontSize: 12, fontWeight: '600' },
  legendVal: { fontSize: 12, fontWeight: '900' },
});
