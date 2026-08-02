import { useMemo } from 'react';
import type { ChapterImage } from '../../services/api';
import { resolveAssetUrl } from '../../services/asset-resolver';
import { chapterImageRect } from './decoration-picker';
import { AnimatedSprite } from './AnimatedSprite';

interface ChapterImagesLayerProps {
  images: ChapterImage[];
  textureIndex?: Record<string, string>;
  gridScale: number;
  bodyScale: number;
}

function parseHexColor(color: number): string {
  if (color === 0) return 'transparent';
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgb(${r},${g},${b})`;
}

export function ChapterImagesLayer({ images, textureIndex, gridScale, bodyScale }: ChapterImagesLayerProps) {
  const sorted = useMemo(() => {
    return [...images].sort((a, b) => a.order - b.order);
  }, [images]);

  if (!images || images.length === 0) return null;

  return (
    <div className="chapter-images-layer" style={{ pointerEvents: 'none', position: 'absolute', inset: 0, zIndex: -1 }}>
      {sorted.map((img, i) => {
        const imgUrl = resolveAssetUrl(img.image, textureIndex);
        if (!imgUrl) return null;

        const alpha = img.alpha ?? 255;
        const bgColor = img.color && img.color !== 0 ? parseHexColor(img.color) : undefined;
        const rect = chapterImageRect(img, { positionScale: gridScale, bodyScale });

        return (
          <AnimatedSprite
            key={`${img.image}-${i}`}
            url={imgUrl}
            textureKey={img.image}
            width={rect.width}
            height={rect.height}
            asBackground
            className="chapter-image"
            title={img.hover?.join('\n') || ''}
            style={{
              position: 'absolute',
              left: rect.left,
              top: rect.top,
              transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
              opacity: alpha / 255,
              backgroundColor: bgColor,
              backgroundBlendMode: bgColor ? 'multiply' : 'normal',
              pointerEvents: img.click ? 'auto' : 'none',
              cursor: img.click ? 'pointer' : undefined,
            }}
            onClick={img.click ? () => window.open(img.click, '_blank') : undefined}
          />
        );
      })}
    </div>
  );
}
