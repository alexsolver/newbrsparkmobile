import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Rect, G, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import type { TechnicianFinanceEntry } from '../types/technicianFinance';
import type { TechnicianExpenseCategoryRow } from '../utils/technicianExpenseCategoryCatalog';
import { labelForTechnicianExpenseCategory } from '../utils/technicianExpenseCategoryCatalog';

const EXP_COLOR = '#dc2626';
const REV_COLOR = '#059669';
const MUTED = '#94a3b8';
const DAYS = 7;
const MAX_CAT_ROWS = 6;

function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Setor de coroa (ângulos em radianos; 0 = topo, sentido horário). */
function donutSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  a0: number,
  a1: number,
): string {
  const p = (r: number, a: number) => ({
    x: cx + r * Math.sin(a),
    y: cy - r * Math.cos(a),
  });
  const p1 = p(rOuter, a0);
  const p2 = p(rOuter, a1);
  const p3 = p(rInner, a1);
  const p4 = p(rInner, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${p1.x} ${p1.y} A ${rOuter} ${rOuter} 0 ${large} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${rInner} ${rInner} 0 ${large} 0 ${p4.x} ${p4.y} Z`;
}

type Props = {
  items: TechnicianFinanceEntry[];
  expenseCatCatalog: TechnicianExpenseCategoryRow[];
};

/** Padding horizontal aproximado (scroll + painel + card) quando o pai ainda não mediu — evita SVG mais largo que o cartão. */
function barsFallbackWidth(winW: number) {
  return Math.max(120, Math.min(winW - 32 - 28 - 24, 400));
}

export function TechnicianFinanceDashboard({ items, expenseCatCatalog }: Props) {
  const { t, i18n } = useTranslation();
  const localeTag = i18n.language || 'pt-BR';
  const formatBrlCompact = useCallback(
    (n: number) =>
      (Number(n) || 0).toLocaleString(localeTag.replace('_', '-'), {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [localeTag],
  );
  const { colors: C } = useTheme();
  const { width: winW } = useWindowDimensions();
  const [barsTrackW, setBarsTrackW] = useState(0);
  const onBarsLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setBarsTrackW((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
  }, []);
  const chartW = barsTrackW > 0 ? barsTrackW : barsFallbackWidth(winW);

  const donut = useMemo(() => {
    let exp = 0;
    let rev = 0;
    for (const x of items) {
      if (x.kind === 'expense') exp += Number(x.amount) || 0;
      else rev += Number(x.amount) || 0;
    }
    const total = exp + rev;
    return { exp, rev, total };
  }, [items]);

  const last7Days = useMemo(() => {
    const labels: string[] = [];
    const keys: string[] = [];
    const now = new Date();
    for (let i = DAYS - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      keys.push(toLocalYmd(d));
      labels.push(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const expByDay: number[] = keys.map(() => 0);
    const revByDay: number[] = keys.map(() => 0);
    for (const x of items) {
      const raw = x.createdAt;
      const dt = new Date(raw);
      if (Number.isNaN(dt.getTime())) continue;
      dt.setHours(0, 0, 0, 0);
      const k = toLocalYmd(dt);
      const idx = keys.indexOf(k);
      if (idx < 0) continue;
      if (x.kind === 'expense') expByDay[idx] += Number(x.amount) || 0;
      else revByDay[idx] += Number(x.amount) || 0;
    }
    const maxCol = Math.max(1, ...expByDay.map((e, i) => e + revByDay[i]));
    return { labels, expByDay, revByDay, maxCol };
  }, [items]);

  const topCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of items) {
      if (x.kind !== 'expense') continue;
      const k = x.categoryKey != null && String(x.categoryKey).trim() !== '' ? String(x.categoryKey).trim() : '__none__';
      m.set(k, (m.get(k) || 0) + (Number(x.amount) || 0));
    }
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CAT_ROWS);
    const max = Math.max(1, ...arr.map(([, v]) => v));
    return arr.map(([key, amount]) => ({
      key,
      amount,
      label:
        key === '__none__'
          ? t('technicianMobile.financeDashCatNone')
          : labelForTechnicianExpenseCategory(expenseCatCatalog, key) || key,
      pct: amount / max,
    }));
  }, [items, expenseCatCatalog, t]);

  const sourceSplit = useMemo(() => {
    let manual = 0;
    let checklist = 0;
    for (const x of items) {
      const n = Number(x.amount) || 0;
      if (x.source === 'checklist') checklist += n;
      else manual += n;
    }
    const total = manual + checklist;
    return { manual, checklist, total };
  }, [items]);

  /** Receitas: «lançada» (checklist sem confirmação de recebimento) vs «realizada» (resto). */
  const revenueReceiptSplit = useMemo(() => {
    let booked = 0;
    let realized = 0;
    for (const x of items) {
      if (x.kind !== 'revenue') continue;
      const n = Number(x.amount) || 0;
      if (x.source === 'checklist' && !x.receiptRealizedAt) booked += n;
      else realized += n;
    }
    return { booked, realized, total: booked + realized };
  }, [items]);

  const cx = 72;
  const cy = 72;
  const rOuter = 56;
  const rInner = 38;
  const { exp, rev, total } = donut;
  const tau = Math.PI * 2;
  let expPath: string | null = null;
  let revPath: string | null = null;
  if (total > 0) {
    const expSweep = (exp / total) * tau;
    if (exp > 0 && rev <= 0) {
      expPath = donutSectorPath(cx, cy, rInner, rOuter, 0, tau);
    } else if (rev > 0 && exp <= 0) {
      revPath = donutSectorPath(cx, cy, rInner, rOuter, 0, tau);
    } else if (exp > 0 && rev > 0) {
      expPath = donutSectorPath(cx, cy, rInner, rOuter, 0, expSweep);
      revPath = donutSectorPath(cx, cy, rInner, rOuter, expSweep, tau);
    }
  }

  const barAreaH = 112;
  const barPad = 8;
  const barInnerW = chartW - barPad * 2;
  const colGap = 6;
  const colW = (barInnerW - colGap * (DAYS - 1)) / DAYS;
  const barMaxH = 78;

  return (
    <View style={[styles.wrap, { borderColor: C.border, backgroundColor: C.cardWhite }]}>
      <View style={styles.titleRow}>
        <Text style={[styles.sectionTitle, { color: C.slate }]}>{t('technicianMobile.financeDashTitle')}</Text>
      </View>

      {/* Donut despesas vs receitas */}
      <View style={[styles.card, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
        <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('technicianMobile.financeDashDonut')}</Text>
        <View style={styles.donutRow}>
          <Svg width={144} height={144} viewBox="0 0 144 144">
            <Path d={donutSectorPath(cx, cy, rInner, rOuter, 0, tau)} fill={C.border} opacity={total > 0 ? 0.22 : 0.45} />
            {expPath ? <Path d={expPath} fill={EXP_COLOR} /> : null}
            {revPath ? <Path d={revPath} fill={REV_COLOR} /> : null}
          </Svg>
          <View style={styles.donutLegend}>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: EXP_COLOR }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={1}>
                {t('technicianMobile.financeDashExp')} · {formatBrlCompact(exp)}
              </Text>
            </View>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: REV_COLOR }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={1}>
                {t('technicianMobile.financeDashRev')} · {formatBrlCompact(rev)}
              </Text>
            </View>
            {total <= 0 ? (
              <Text style={[styles.emptyHint, { color: C.textLight }]}>{t('technicianMobile.financeDashEmpty')}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* Barras últimos 7 dias */}
      <View style={[styles.card, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
        <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('technicianMobile.financeDashBars')}</Text>
        <View style={styles.barsChartClip} onLayout={onBarsLayout}>
          <Svg width={chartW} height={barAreaH} viewBox={`0 0 ${chartW} ${barAreaH}`}>
          {last7Days.labels.map((lb, i) => {
            const e = last7Days.expByDay[i];
            const r = last7Days.revByDay[i];
            const x = barPad + i * (colW + colGap);
            const stack = e + r;
            const scale = stack <= 0 ? 0 : barMaxH / last7Days.maxCol;
            const hR = r * scale;
            const hE = e * scale;
            const baseY = barAreaH - 24;
            return (
              <G key={lb + i}>
                <SvgText
                  x={x + colW / 2}
                  y={barAreaH - 6}
                  fontSize={9}
                  fill={MUTED}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {lb}
                </SvgText>
                {stack > 0 ? (
                  <>
                    <Rect
                      x={x}
                      y={baseY - hE - hR}
                      width={colW}
                      height={hE}
                      rx={4}
                      fill={EXP_COLOR}
                      opacity={0.92}
                    />
                    <Rect
                      x={x}
                      y={baseY - hR}
                      width={colW}
                      height={hR}
                      rx={4}
                      fill={REV_COLOR}
                      opacity={0.92}
                    />
                  </>
                ) : (
                  <Rect x={x} y={baseY - 3} width={colW} height={3} rx={1.5} fill={C.border} opacity={0.5} />
                )}
              </G>
            );
          })}
          </Svg>
        </View>
        <View style={styles.miniLegend}>
          <View style={[styles.miniLeg, { backgroundColor: `${EXP_COLOR}22` }]}>
            <View style={[styles.legendDot, { backgroundColor: EXP_COLOR }]} />
            <Text style={[styles.miniLegTxt, { color: C.textSecondary }]}>{t('technicianMobile.financeDashExp')}</Text>
          </View>
          <View style={[styles.miniLeg, { backgroundColor: `${REV_COLOR}22` }]}>
            <View style={[styles.legendDot, { backgroundColor: REV_COLOR }]} />
            <Text style={[styles.miniLegTxt, { color: C.textSecondary }]}>{t('technicianMobile.financeDashRev')}</Text>
          </View>
        </View>
      </View>

      {/* Receitas: lançadas (a receber) vs realizadas */}
      <View style={[styles.card, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
        <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('technicianMobile.financeDashReceiptTitle')}</Text>
        {revenueReceiptSplit.total <= 0 ? (
          <Text style={[styles.emptyHint, { color: C.textLight }]}>{t('technicianMobile.financeDashReceiptEmpty')}</Text>
        ) : (
          <>
            <View style={[styles.sourceTrack, { backgroundColor: C.border }]}>
              {revenueReceiptSplit.booked > 0 ? (
                <View
                  style={{
                    width: `${(revenueReceiptSplit.booked / revenueReceiptSplit.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#f59e0b',
                  }}
                />
              ) : null}
              {revenueReceiptSplit.realized > 0 ? (
                <View
                  style={{
                    width: `${(revenueReceiptSplit.realized / revenueReceiptSplit.total) * 100}%`,
                    height: '100%',
                    backgroundColor: REV_COLOR,
                  }}
                />
              ) : null}
            </View>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: '#f59e0b' }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={2}>
                {t('technicianMobile.financeDashReceiptBooked')} · {formatBrlCompact(revenueReceiptSplit.booked)}
              </Text>
            </View>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: REV_COLOR }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={2}>
                {t('technicianMobile.financeDashReceiptRealized')} · {formatBrlCompact(revenueReceiptSplit.realized)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Origem manual vs checklist */}
      <View style={[styles.card, { borderColor: C.border, backgroundColor: C.surfaceLow }]}>
        <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('technicianMobile.financeDashSource')}</Text>
        {sourceSplit.total <= 0 ? (
          <Text style={[styles.emptyHint, { color: C.textLight }]}>{t('technicianMobile.financeDashEmpty')}</Text>
        ) : (
          <>
            <View style={[styles.sourceTrack, { backgroundColor: C.border }]}>
              {sourceSplit.manual > 0 ? (
                <View
                  style={{
                    width: `${(sourceSplit.manual / sourceSplit.total) * 100}%`,
                    height: '100%',
                    backgroundColor: C.accent,
                  }}
                />
              ) : null}
              {sourceSplit.checklist > 0 ? (
                <View
                  style={{
                    width: `${(sourceSplit.checklist / sourceSplit.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#6366f1',
                  }}
                />
              ) : null}
            </View>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: C.accent }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={1}>
                {t('technicianMobile.financeDashManual')} · {formatBrlCompact(sourceSplit.manual)}
              </Text>
            </View>
            <View style={styles.legendLine}>
              <View style={[styles.legendDot, { backgroundColor: '#6366f1' }]} />
              <Text style={[styles.legendTxt, { color: C.slate }]} numberOfLines={1}>
                {t('technicianMobile.financeDashChecklist')} · {formatBrlCompact(sourceSplit.checklist)}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* Top categorias de despesa */}
      <View style={[styles.card, { borderColor: C.border, backgroundColor: C.surfaceLow, marginBottom: 0 }]}>
        <Text style={[styles.cardTitle, { color: C.textSecondary }]}>{t('technicianMobile.financeDashCats')}</Text>
        {topCategories.length === 0 ? (
          <Text style={[styles.emptyHint, { color: C.textLight }]}>{t('technicianMobile.financeDashNoExpenses')}</Text>
        ) : (
          topCategories.map((row) => (
            <View key={row.key} style={styles.catRow}>
              <Text style={[styles.catLabel, { color: C.slate }]} numberOfLines={1}>
                {row.label}
              </Text>
              <View style={[styles.catTrack, { backgroundColor: C.border }]}>
                <View
                  style={[styles.catFill, { width: `${Math.round(row.pct * 100)}%`, backgroundColor: EXP_COLOR }]}
                />
              </View>
              <Text style={[styles.catAmt, { color: C.textSecondary }]}>{formatBrlCompact(row.amount)}</Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  titleRow: { marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '900', letterSpacing: -0.3 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  donutLegend: { flex: 1, minWidth: 0, gap: 8 },
  legendLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendTxt: { flex: 1, fontSize: 13, fontWeight: '700' },
  emptyHint: { fontSize: 12, fontStyle: 'italic', marginTop: 4 },
  barsChartClip: { width: '100%', overflow: 'hidden', alignSelf: 'stretch' },
  miniLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  miniLeg: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  miniLegTxt: { fontSize: 12, fontWeight: '700' },
  sourceTrack: { height: 12, borderRadius: 6, flexDirection: 'row', overflow: 'hidden', marginBottom: 10 },
  catRow: { marginBottom: 10 },
  catLabel: { fontSize: 12, fontWeight: '800', marginBottom: 4 },
  catTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  catFill: { height: '100%', borderRadius: 4 },
  catAmt: { fontSize: 11, fontWeight: '800', alignSelf: 'flex-end' },
});
