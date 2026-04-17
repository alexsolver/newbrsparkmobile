import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Network from 'expo-network';
import { apiFetch, handleUnauthorizedMaybeSessionInvalidated } from '../services/auth';

export type MatrixColumn = { id: string; label: string; cellType: 'text' | 'number' | 'yes_no' };

type LookupSelectProps = {
  field: {
    lookupSource?: string;
    lookupPreset?: string;
    lookupInlineJson?: string;
    lookupApiPath?: string;
  };
  value: unknown;
  onChange: (next: string) => void;
  readOnly?: boolean;
  /** Quando verdadeiro e origem = preset, bloqueia o carregamento sem rede. */
  strictOnline?: boolean;
};

function normalizeLookupSource(raw: unknown): 'preset' | 'inline_json' | 'api' {
  const s = String(raw || '').trim();
  if (s === 'inline_json') return 'inline_json';
  if (s === 'api') return 'api';
  return 'preset';
}

function normalizeLookupApiPath(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (s.startsWith('/')) return s;
  return `/${s}`;
}

function parseLookupResponseOptions(payload: unknown): { value: string; label: string }[] {
  const list = Array.isArray((payload as { options?: unknown } | null)?.options)
    ? ((payload as { options: unknown[] }).options)
    : Array.isArray(payload)
      ? payload
      : [];
  return list
    .map((row: unknown) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      const v = String(r.value ?? r.id ?? '').trim();
      const lab = String(r.label ?? r.text ?? r.name ?? r.value ?? r.id ?? '').trim();
      return v ? { value: v, label: lab || v } : null;
    })
    .filter(Boolean) as { value: string; label: string }[];
}

function parseLookupInlineOptions(raw: string): { value: string; label: string }[] {
  const s = String(raw || '').trim();
  if (!s) return [];
  try {
    const j = JSON.parse(s);
    const arr = Array.isArray(j) ? j : Array.isArray((j as { options?: unknown }).options) ? (j as { options: unknown[] }).options : [];
    const out: { value: string; label: string }[] = [];
    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const value = String(r.value ?? r.id ?? '').trim();
      const label = String(r.label ?? r.text ?? r.name ?? value).trim();
      if (value) out.push({ value, label: label || value });
    }
    return out;
  } catch {
    return [];
  }
}

/** Lista dinâmica: preset via API ou opções em JSON no modelo. */
export function ChecklistLookupSelectField({ field, value, onChange, readOnly, strictOnline }: LookupSelectProps) {
  const source = normalizeLookupSource(field?.lookupSource);
  const preset = String(field?.lookupPreset || 'equipamentos_demo').trim() || 'equipamentos_demo';
  const inlineRaw = String(field?.lookupInlineJson || '');
  const apiPath = normalizeLookupApiPath(field?.lookupApiPath);

  const inlineOpts = useMemo(() => parseLookupInlineOptions(inlineRaw), [inlineRaw]);

  const [remote, setRemote] = useState<{ value: string; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (source === 'inline_json') {
      setRemote([]);
      setErr(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        if (strictOnline && (source === 'preset' || source === 'api')) {
          const st = await Network.getNetworkStateAsync();
          if (!st.isConnected) {
            setRemote([]);
            setErr('Este campo exige internet para carregar as opções.');
            return;
          }
        }
        const endpoint =
          source === 'api'
            ? apiPath
            : `/api/checklists/lookup-options/${encodeURIComponent(preset)}`;
        if (!endpoint) {
          setRemote([]);
          setErr('Defina «lookupApiPath» no modelo para carregar a lista via API.');
          return;
        }
        const res = await apiFetch(endpoint);
        await handleUnauthorizedMaybeSessionInvalidated(res);
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg =
            typeof (payload as { error?: unknown })?.error === 'string'
              ? String((payload as { error?: unknown }).error)
              : `Erro HTTP ${res.status}`;
          if (!cancelled) setErr(msg);
          if (!cancelled) setRemote([]);
          return;
        }
        const opts = parseLookupResponseOptions(payload);
        if (!cancelled) setRemote(opts);
      } catch (e: unknown) {
        if (!cancelled) {
          setRemote([]);
          setErr(e instanceof Error ? e.message : 'Falha ao carregar opções');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, preset, strictOnline, apiPath]);

  const options = source === 'inline_json' ? inlineOpts : remote;
  const current = String(value ?? '').trim();

  const pick = useCallback(
    (v: string) => {
      if (readOnly) return;
      onChange(v);
    },
    [onChange, readOnly],
  );

  return (
    <View style={{ marginTop: 8 }}>
      {err ? (
        <Text style={{ color: '#b91c1c', fontSize: 13, marginBottom: 8, lineHeight: 18 }}>{err}</Text>
      ) : null}
      {loading && source !== 'inline_json' ? (
        <View style={{ paddingVertical: 12, alignItems: 'center' }}>
          <ActivityIndicator color="#2563eb" />
          <Text style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>Carregando opções…</Text>
        </View>
      ) : null}
      {!loading || source === 'inline_json' ? (
        <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
          {options.length === 0 ? (
            <Text style={{ color: '#94a3b8', fontSize: 14 }}>
              {source === 'inline_json'
                ? 'Defina um array JSON em «lookupInlineJson» no painel (ex.: [{"value":"a","label":"Opção A"}]).'
                : source === 'api'
                  ? 'Nenhuma opção devolvida pelo endpoint configurado.'
                  : 'Nenhuma opção devolvida pelo servidor.'}
            </Text>
          ) : (
            options.map((o) => {
              const sel = current === o.value;
              return (
                <TouchableOpacity
                  key={o.value}
                  onPress={() => pick(o.value)}
                  disabled={readOnly}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: sel ? '#2563eb' : '#e2e8f0',
                    backgroundColor: sel ? '#eff6ff' : '#f8fafc',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Ionicons name={sel ? 'radio-button-on' : 'radio-button-off'} size={22} color={sel ? '#2563eb' : '#94a3b8'} />
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: sel ? '800' : '600', color: '#0f172a' }}>{o.label}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      ) : null}
    </View>
  );
}

type RepeatableMatrixProps = {
  field: {
    matrixColumns?: MatrixColumn[];
    matrixMinRows?: string | number;
    matrixMaxRows?: string | number;
  };
  value: unknown;
  onChange: (json: string) => void;
  readOnly?: boolean;
};

function parseMatrixRows(raw: unknown): Record<string, string | boolean>[] {
  if (raw === undefined || raw === null) return [];
  let v: unknown = raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      v = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === 'object' && !Array.isArray(x)) as Record<string, string | boolean>[];
}

/** Matriz com linhas adicionáveis. */
export function ChecklistRepeatableMatrixField({ field, value, onChange, readOnly }: RepeatableMatrixProps) {
  const cols = useMemo(() => {
    const mc = field?.matrixColumns;
    if (!Array.isArray(mc) || !mc.length) {
      return [
        { id: 'c1', label: 'Item', cellType: 'text' as const },
        { id: 'c2', label: 'Valor', cellType: 'number' as const },
      ];
    }
    return mc
      .map((c, i) => {
        const id = String(c?.id || `c${i + 1}`).trim() || `c${i + 1}`;
        const label = String(c?.label || id).trim() || id;
        const ct = String(c?.cellType || 'text').toLowerCase();
        const cellType = ct === 'number' || ct === 'yes_no' ? (ct as 'number' | 'yes_no') : 'text';
        return { id, label, cellType };
      })
      .slice(0, 8);
  }, [field?.matrixColumns]);

  const minR = useMemo(() => {
    const n = parseInt(String(field?.matrixMinRows ?? '0'), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  }, [field?.matrixMinRows]);
  const maxR = useMemo(() => {
    const raw = field?.matrixMaxRows;
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [field?.matrixMaxRows]);

  const rows = useMemo(() => parseMatrixRows(value), [value]);

  const commit = useCallback(
    (next: Record<string, string | boolean>[]) => {
      onChange(JSON.stringify(next));
    },
    [onChange],
  );

  const setCell = useCallback(
    (rowIndex: number, colId: string, cellVal: string | boolean) => {
      const copy = rows.map((r) => ({ ...r }));
      while (copy.length <= rowIndex) copy.push({});
      copy[rowIndex] = { ...copy[rowIndex], [colId]: cellVal };
      commit(copy);
    },
    [rows, commit],
  );

  const addRow = useCallback(() => {
    if (readOnly) return;
    if (maxR != null && rows.length >= maxR) return;
    commit([...rows, {}]);
  }, [rows, commit, maxR, readOnly]);

  const removeRow = useCallback(
    (ix: number) => {
      if (readOnly) return;
      if (rows.length <= minR) return;
      const copy = rows.filter((_, i) => i !== ix);
      commit(copy);
    },
    [rows, commit, minR, readOnly],
  );

  useEffect(() => {
    if (readOnly || rows.length > 0) return;
    if (minR <= 0) return;
    const seed: Record<string, string | boolean>[] = [];
    for (let i = 0; i < minR; i++) seed.push({});
    commit(seed);
  }, [minR, readOnly, rows.length, commit]);

  return (
    <View style={{ marginTop: 8 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
        <View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e2e8f0' }}>
            {cols.map((c) => (
              <View key={c.id} style={{ width: 120, padding: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b' }} numberOfLines={2}>
                  {c.label}
                </Text>
              </View>
            ))}
            {!readOnly ? <View style={{ width: 44 }} /> : null}
          </View>
          {rows.map((row, ri) => (
            <View key={`r_${ri}`} style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: '#f1f5f9' }}>
              {cols.map((c) => {
                const rawCell = row[c.id];
                if (c.cellType === 'yes_no') {
                  const on = rawCell === true || String(rawCell).toLowerCase() === 'sim' || String(rawCell).toLowerCase() === 'true';
                  return (
                    <View key={c.id} style={{ width: 120, padding: 6, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                      <TouchableOpacity
                        disabled={readOnly}
                        onPress={() => setCell(ri, c.id, !on)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          backgroundColor: on ? '#dcfce7' : '#f1f5f9',
                          borderWidth: 1,
                          borderColor: on ? '#22c55e' : '#e2e8f0',
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '800', color: on ? '#166534' : '#64748b' }}>{on ? 'Sim' : 'Não'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                }
                if (c.cellType === 'number') {
                  return (
                    <View key={c.id} style={{ width: 120, padding: 6 }}>
                      <TextInput
                        editable={!readOnly}
                        keyboardType="decimal-pad"
                        value={rawCell != null ? String(rawCell) : ''}
                        onChangeText={(t) => setCell(ri, c.id, t)}
                        placeholder="0"
                        style={{
                          borderWidth: 1,
                          borderColor: '#e2e8f0',
                          borderRadius: 8,
                          padding: 8,
                          fontSize: 14,
                          backgroundColor: readOnly ? '#f8fafc' : '#fff',
                        }}
                      />
                    </View>
                  );
                }
                return (
                  <View key={c.id} style={{ width: 120, padding: 6 }}>
                    <TextInput
                      editable={!readOnly}
                      value={rawCell != null ? String(rawCell) : ''}
                      onChangeText={(t) => setCell(ri, c.id, t)}
                      placeholder="…"
                      style={{
                        borderWidth: 1,
                        borderColor: '#e2e8f0',
                        borderRadius: 8,
                        padding: 8,
                        fontSize: 14,
                        backgroundColor: readOnly ? '#f8fafc' : '#fff',
                      }}
                    />
                  </View>
                );
              })}
              {!readOnly ? (
                <TouchableOpacity onPress={() => removeRow(ri)} style={{ width: 44, alignItems: 'center', paddingVertical: 8 }}>
                  <Ionicons name="trash-outline" size={20} color={rows.length <= minR ? '#cbd5e1' : '#b91c1c'} />
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      </ScrollView>
      {!readOnly ? (
        <TouchableOpacity
          onPress={addRow}
          disabled={maxR != null && rows.length >= maxR}
          style={{
            marginTop: 10,
            padding: 12,
            borderRadius: 10,
            backgroundColor: maxR != null && rows.length >= maxR ? '#f1f5f9' : '#eff6ff',
            alignItems: 'center',
            borderWidth: 1,
            borderColor: '#bfdbfe',
          }}
        >
          <Text style={{ fontWeight: '800', color: maxR != null && rows.length >= maxR ? '#94a3b8' : '#1d4ed8' }}>+ Adicionar linha</Text>
        </TouchableOpacity>
      ) : null}
      {minR > 0 ? (
        <Text style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
          Mínimo de {minR} linha(s)
          {maxR != null ? ` · máximo ${maxR}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

type OpinionScaleProps = {
  field: { opinionScaleMode?: string; likertLabels?: string };
  value: unknown;
  onChange: (next: string) => void;
  readOnly?: boolean;
};

/** NPS 0–10 ou Likert (5 níveis). */
export function ChecklistOpinionScaleField({ field, value, onChange, readOnly }: OpinionScaleProps) {
  const mode = String(field?.opinionScaleMode || 'nps').toLowerCase() === 'likert' ? 'likert' : 'nps';
  const likertLines = useMemo(() => {
    const raw = String(field?.likertLabels || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    while (raw.length < 5) {
      const d = ['Discordo totalmente', 'Discordo', 'Neutro', 'Concordo', 'Concordo totalmente'];
      raw.push(d[raw.length] || `Nível ${raw.length + 1}`);
    }
    return raw.slice(0, 5);
  }, [field?.likertLabels]);

  const current = String(value ?? '').trim();

  if (mode === 'nps') {
    const curNum = current === '' ? null : parseInt(current, 10);
    return (
      <View style={{ marginTop: 10 }}>
        <Text style={{ fontSize: 12, color: '#64748b', marginBottom: 8, fontWeight: '600' }}>De 0 (improvável) a 10 (muito provável)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: 11 }, (_, i) => {
            const sel = curNum === i;
            return (
              <TouchableOpacity
                key={i}
                disabled={readOnly}
                onPress={() => onChange(String(i))}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: sel ? '#2563eb' : '#f1f5f9',
                  borderWidth: 1,
                  borderColor: sel ? '#1d4ed8' : '#e2e8f0',
                }}
              >
                <Text style={{ fontWeight: '800', color: sel ? '#fff' : '#0f172a' }}>{i}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 10, gap: 8 }}>
      {likertLines.map((lab, idx) => {
        const v = String(idx + 1);
        const sel = current === v;
        return (
          <TouchableOpacity
            key={idx}
            disabled={readOnly}
            onPress={() => onChange(v)}
            style={{
              padding: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: sel ? '#7c3aed' : '#e2e8f0',
              backgroundColor: sel ? '#f5f3ff' : '#f8fafc',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: sel ? '800' : '600', color: '#0f172a' }}>
              {idx + 1}. {lab}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
