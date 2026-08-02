import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { ChapterDecorationsCanvas } from './ChapterDecorationsCanvas';
import type { ChapterImage } from '../../services/api';

const TEX = { 'atm:questpics/star': 'data:image/png;base64,star' };

const images: ChapterImage[] = [
  {
    x: 4.5, y: -1.5, width: 13, height: 2, rotation: 0,
    image: 'atm:questpics/star', scale: 1, order: 0,
    alpha: 255, color: 0, click: '', hover: [],
  },
  {
    x: -5.5, y: 5.5, width: 10, height: 1.5, rotation: 10,
    image: 'atm:questpics/star', scale: 1, order: 1,
    alpha: 128, color: 0, click: '', hover: [],
  },
];

function setup(partial?: Partial<Parameters<typeof ChapterDecorationsCanvas>[0]>) {
  const onChange = vi.fn();
  const onSelect = vi.fn();
  const view = render(
    <ChapterDecorationsCanvas
      images={images}
      textureIndex={TEX}
      gridScale={48}
      bodyScale={28}
      selectedIndex={null}
      onSelect={onSelect}
      onChange={onChange}
      {...partial}
    />
  );
  return { onChange, onSelect, view };
}

describe('ChapterDecorationsCanvas', () => {
  it('centers each box on its grid position and scales the body like quest nodes', () => {
    setup();
    const decos = document.querySelectorAll('.quest-deco');
    expect(decos.length).toBe(2);
    // img0: x=4.5 y=-1.5 w=13 h=2 → center (216, -72), body 13*28 x 2*28
    expect((decos[0] as HTMLElement).style.left).toBe('34px');
    expect((decos[0] as HTMLElement).style.top).toBe('-100px');
    expect((decos[0] as HTMLElement).style.width).toBe('364px');
    expect((decos[0] as HTMLElement).style.height).toBe('56px');
    // img1: x=-5.5 y=5.5 w=10 h=1.5 → center (-264, 264), body 280 x 42
    expect((decos[1] as HTMLElement).style.left).toBe('-404px');
    expect((decos[1] as HTMLElement).style.top).toBe('243px');
    expect((decos[1] as HTMLElement).style.opacity).toBe('0.5019607843137255');
  });

  it('clicking a box selects it', () => {
    const { onSelect } = setup();
    const decos = document.querySelectorAll('.quest-deco');
    fireEvent.click(decos[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('shows resize/rotate/delete handles only on the selected box', () => {
    setup({ selectedIndex: 0 });
    const handles = document.querySelectorAll('.quest-deco-handle');
    expect(handles.length).toBe(3);
    const selected = document.querySelector('.quest-deco-selected');
    expect(selected).not.toBeNull();
  });

  it('removes a decoration when its delete handle is clicked', () => {
    const { onChange } = setup({ selectedIndex: 0 });
    const del = document.querySelector('.quest-deco-handle-delete') as HTMLElement;
    fireEvent.click(del);
    expect(onChange).toHaveBeenCalledWith([images[1]]);
  });

  it('skips unresolved image paths', () => {
    const unresolved: ChapterImage[] = [{ ...images[0], image: 'missing:path' }];
    render(
      <ChapterDecorationsCanvas
        images={unresolved}
        textureIndex={TEX}
        gridScale={48}
        bodyScale={28}
        selectedIndex={null}
        onSelect={() => {}}
        onChange={() => {}}
      />
    );
    expect(document.querySelectorAll('.quest-deco').length).toBe(0);
  });

  it('moves a box by the drag delta in grid units, accounting for zoom', () => {
    const { onChange } = setup({ selectedIndex: 0, zoom: 2 });
    const deco = document.querySelectorAll('.quest-deco')[0] as HTMLElement;
    fireEvent.pointerDown(deco, { clientX: 100, clientY: 200 });
    fireEvent.pointerMove(window, { clientX: 100 + 96, clientY: 200 - 48 });
    fireEvent.pointerUp(window);
    const next = onChange.mock.calls[0][0] as ChapterImage[];
    // 96px / (48 * 2) = 1.0 grid unit; -48px / 96 = -0.5 grid unit
    expect(next[0].x).toBe(5.5);
    expect(next[0].y).toBe(-2);
  });

  it('resizes a box with the body scale, not the position scale', () => {
    const { onChange } = setup({ selectedIndex: 0 });
    const resize = document.querySelector('.quest-deco-handle-resize') as HTMLElement;
    fireEvent.pointerDown(resize, { clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: 56, clientY: 28 });
    fireEvent.pointerUp(window);
    const next = onChange.mock.calls[0][0] as ChapterImage[];
    // 56px / 28 body scale = 2.0; 28px / 28 = 1.0
    expect(next[0].width).toBe(15);
    expect(next[0].height).toBe(3);
  });

  it('rotates around the box center', () => {
    const { onChange } = setup({ selectedIndex: 0 });
    const rotate = document.querySelector('.quest-deco-handle-rotate') as HTMLElement;
    fireEvent.pointerDown(rotate, { clientX: 216, clientY: -100 });
    fireEvent.pointerMove(window, { clientX: 216 + 28, clientY: -72 });
    fireEvent.pointerUp(window);
    const next = onChange.mock.calls[0][0] as ChapterImage[];
    // handle dragged to the right of the box center → rotation ≈ 90deg
    expect(next[0].rotation).toBeCloseTo(90, 0);
  });
});
