import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChapterImage } from '../../services/api';
import { resolveAssetUrl } from '../../services/asset-resolver';
import { chapterImageRect } from './decoration-picker';
import { AnimatedSprite } from './AnimatedSprite'
import { XIcon } from '../ui/icons';

interface ChapterDecorationsCanvasProps {
  images: ChapterImage[];
  textureIndex?: Record<string, string>;
  gridScale: number;
  bodyScale: number;
  zoom?: number;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  onChange: (images: ChapterImage[]) => void;
}

type Interaction =
  | { kind: 'move'; index: number }
  | { kind: 'resize'; index: number }
  | { kind: 'rotate'; index: number };

const MIN_SIZE = 0.25;

function parseHexColor(color: number): string {
  if (color === 0) return 'transparent';
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgb(${r},${g},${b})`;
}

export function ChapterDecorationsCanvas({
  images,
  textureIndex,
  gridScale,
  bodyScale,
  zoom = 1,
  selectedIndex,
  onSelect,
  onChange,
}: ChapterDecorationsCanvasProps) {
  const [draft, setDraft] = useState<ChapterImage[] | null>(null);
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; base: ChapterImage } | null>(null);
  const draftRef = useRef<ChapterImage[] | null>(null);

  const display = draft ?? images;

  useEffect(() => {
    if (!interaction) return;
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const base = drag.base;
      const current = draftRef.current ?? images;
      const next = current.map((img, i) => {
        if (i !== interaction.index) return img;
        if (interaction.kind === 'move') {
          const dx = dxPx / (gridScale * zoom);
          const dy = dyPx / (gridScale * zoom);
          return { ...img, x: round1(base.x + dx), y: round1(base.y + dy) };
        }
        if (interaction.kind === 'resize') {
          const dw = dxPx / (bodyScale * zoom);
          const dh = dyPx / (bodyScale * zoom);
          return {
            ...img,
            width: Math.max(MIN_SIZE, round1(base.width + dw)),
            height: Math.max(MIN_SIZE, round1(base.height + dh)),
          };
        }
        const cx = base.x * gridScale;
        const cy = base.y * gridScale;
        const px = drag.startX + dxPx;
        const py = drag.startY + dyPx;
        const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
        return { ...img, rotation: round1(angle) };
      });
      draftRef.current = next;
      setDraft(next);
    };
    const onUp = () => {
      if (draftRef.current) onChange(draftRef.current);
      draftRef.current = null;
      dragRef.current = null;
      setDraft(null);
      setInteraction(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [interaction, images, gridScale, bodyScale, zoom, onChange]);

  const begin = useCallback(
    (e: React.PointerEvent, index: number, kind: Interaction['kind']) => {
      e.preventDefault();
      e.stopPropagation();
      onSelect(index);
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        base: { ...(images[index] ?? display[index]) },
      };
      setInteraction({ kind, index });
    },
    [onSelect, images, display]
  );

  return (
    <div
      className="chapter-decorations-canvas"
      style={{ position: 'absolute', inset: 0, zIndex: 20, pointerEvents: 'none' }}
    >
      {display.map((img, i) => {
        const imgUrl = resolveAssetUrl(img.image, textureIndex);
        if (!imgUrl) return null;
        const selected = i === selectedIndex;
        const alpha = img.alpha ?? 255;
        const bgColor = img.color && img.color !== 0 ? parseHexColor(img.color) : undefined;
        const rect = chapterImageRect(img, { positionScale: gridScale, bodyScale });

        return (
          <div key={`${img.image}-${i}`} style={{ position: 'absolute', inset: 0 }}>
            <div
              className={`quest-deco${selected ? ' quest-deco-selected' : ''}`}
              onPointerDown={(e) => begin(e, i, 'move')}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(i);
              }}
              style={{
                position: 'absolute',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
                opacity: alpha / 255,
                pointerEvents: 'auto',
                cursor: 'move',
                touchAction: 'none',
              }}
            >
              <AnimatedSprite
                url={imgUrl}
                textureKey={img.image}
                width={rect.width}
                height={rect.height}
                asBackground
                className="quest-deco-bg"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  backgroundColor: bgColor,
                  backgroundBlendMode: bgColor ? 'multiply' : 'normal',
                }}
              />
              {selected && (
                <>
                  <span
                    className="quest-deco-handle quest-deco-handle-rotate"
                    title="Rotate"
                    onPointerDown={(e) => begin(e, i, 'rotate')}
                  />
                  <span
                    className="quest-deco-handle quest-deco-handle-resize"
                    title="Resize"
                    onPointerDown={(e) => begin(e, i, 'resize')}
                  />
                  <span
                    className="quest-deco-handle quest-deco-handle-delete"
                    title="Remove decoration"
                    onClick={(e) => {
                      e.stopPropagation();
                      onChange(images.filter((_, j) => j !== i));
                      onSelect(null);
                    }}
                  >
                    <XIcon size={10} />
                  </span>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
