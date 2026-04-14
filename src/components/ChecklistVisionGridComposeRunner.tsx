import React, { useCallback, useEffect, useRef } from 'react';
import { PixelRatio, View } from 'react-native';
import Svg, { Image as SvgImage, Rect } from 'react-native-svg';

const CELL = 420;
/** Lado máximo em *pixels* da imagem exportada (retina × grelha gerava >18 MB de PNG). */
const MAX_EXPORT_PIXEL_SIDE = 1600;

type Props = {
  uris: string[];
  cols: number;
  rows: number;
  onDone: (pngBase64: string) => void;
  onError: (e: Error) => void;
};

/**
 * Renderiza uma grelha off-screen e exporta PNG (base64 cru) via `Svg.toDataURL`.
 * Usado para juntar N fotos antes do envio à API de visão IA.
 */
export function ChecklistVisionGridComposeRunner({ uris, cols, rows, onDone, onError }: Props) {
  const svgRef = useRef<any>(null);
  const loaded = useRef(new Set<number>());
  const finishedRef = useRef(false);
  const W = cols * CELL;
  const H = rows * CELL;

  useEffect(() => {
    loaded.current = new Set();
    finishedRef.current = false;
    const t = setTimeout(() => {
      if (!finishedRef.current) {
        finishedRef.current = true;
        onError(new Error('Tempo esgotado ao carregar imagens para a grelha.'));
      }
    }, 45000);
    return () => clearTimeout(t);
    // `onError` vem do pai; não repetir o efeito a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uris.join('|'), cols, rows]);

  const tryFinish = useCallback(() => {
    if (loaded.current.size < uris.length) return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          const node = svgRef.current;
          if (!node?.toDataURL) {
            onError(new Error('Composição da grelha indisponível neste dispositivo.'));
            return;
          }
          const pr = Math.max(1, PixelRatio.get() || 1);
          const maxPt = Math.floor(MAX_EXPORT_PIXEL_SIDE / pr);
          const s = Math.min(maxPt / W, maxPt / H, 1);
          const wOut = Math.max(1, Math.round(W * s));
          const hOut = Math.max(1, Math.round(H * s));
          node.toDataURL(
            (b64: string) => {
              if (b64 && typeof b64 === 'string') {
                finishedRef.current = true;
                onDone(b64);
              } else {
                finishedRef.current = true;
                onError(new Error('A composição da grelha devolveu dados vazios.'));
              }
            },
            { width: wOut, height: hOut },
          );
        } catch (e: unknown) {
          onError(e instanceof Error ? e : new Error(String(e)));
        }
      }, 120);
    });
  }, [uris.length, W, H, onDone, onError]);

  const onSlotLoad = useCallback(
    (idx: number) => {
      if (loaded.current.has(idx)) return;
      loaded.current.add(idx);
      tryFinish();
    },
    [tryFinish],
  );

  if (!uris.length || cols < 1 || rows < 1) {
    return null;
  }

  return (
    <View
      style={{
        position: 'absolute',
        left: -12000,
        top: 0,
        width: W,
        height: H,
        opacity: 0.02,
      }}
      pointerEvents="none"
      collapsable={false}
    >
      <Svg ref={svgRef} width={W} height={H}>
        <Rect x={0} y={0} width={W} height={H} fill="#ffffff" />
        {uris.map((href, i) => {
          const c = i % cols;
          const r = Math.floor(i / cols);
          return (
            <SvgImage
              key={`${i}-${href}`}
              href={href}
              x={c * CELL}
              y={r * CELL}
              width={CELL}
              height={CELL}
              preserveAspectRatio="xMidYMid slice"
              onLoad={() => onSlotLoad(i)}
            />
          );
        })}
      </Svg>
    </View>
  );
}
