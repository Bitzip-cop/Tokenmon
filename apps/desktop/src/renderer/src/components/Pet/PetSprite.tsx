// 精灵动画组件:忙看活动态、闲下来看喂养心情。canvas 渲染、像素不糊。独立件。
import { useEffect, useRef } from 'react';
import type { PetConfig, PetState } from './pets';
import type { PetMood } from '@shared/pet-usage';
import { resolveRow, framesForRow, fpsForMood } from './sprite-logic';

// 图片按 URL 缓存,避免每次挂载/换态重新加载。
const cache: Record<string, HTMLImageElement> = {};
function getImage(src: string): HTMLImageElement {
  let img = cache[src];
  if (!img) {
    img = new Image();
    img.src = src;
    cache[src] = img;
  }
  return img;
}

export function PetSprite({
  config,
  state,
  mood,
  scale = 1
}: {
  config: PetConfig;
  state: PetState;
  mood?: PetMood;
  scale?: number;
}): JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null);
  // 当前行放 ref:state/mood 变化只更新它,不重建动画循环(避免复位闪烁)。
  const rowRef = useRef(resolveRow(config, state, mood));
  rowRef.current = resolveRow(config, state, mood);
  // 心情放 ref:用于难过减速;变化只更新 ref、不重建动画循环。
  const moodRef = useRef(mood);
  moodRef.current = mood;

  // 动画循环只随 config 建一次(state/mood 通过 rowRef 实时读)。
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = getImage(config.spritesheet);
    const { frameW, frameH } = config;
    canvas.width = frameW; // 内部分辨率 = 单帧;显示尺寸由 CSS 放大(像素风保真)
    canvas.height = frameH;
    let frame = 0;
    let last = 0;
    let lastRow = -1;
    let raf = 0;
    const draw = (t: number): void => {
      raf = requestAnimationFrame(draw);
      if (!img.complete || img.naturalWidth === 0) return; // 等图加载
      const row = rowRef.current; // resolveRow 保证是合法整数行(绝不 undefined)
      const frames = Math.max(1, framesForRow(config, row)); // 该行真实帧数(≥1,防 %0),杜绝循环到尾部空帧
      let dirty = false;
      if (row !== lastRow) {
        frame = 0; // 换动作从头播
        lastRow = row;
        dirty = true;
      }
      const fps = fpsForMood(config.fps, moodRef.current); // 难过=半速
      if (t - last >= 1000 / fps) {
        frame = (frame + 1) % frames;
        last = t;
        dirty = true;
      }
      if (!dirty) return; // 没变化不重绘(省得在透明窗上闪)
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, frameW, frameH);
      ctx.drawImage(img, frame * frameW, row * frameH, frameW, frameH, 0, 0, frameW, frameH);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [config]);

  return (
    <canvas
      ref={ref}
      style={{
        width: config.frameW * scale,
        height: config.frameH * scale,
        imageRendering: 'pixelated',
        // 难过:灰度 + 略暗 = 蔫蔫没精神(配合半速动画),和"满足/打盹"区分开。
        filter: mood === 'sad' ? 'grayscale(0.85) brightness(0.92)' : undefined,
        transition: 'filter 0.5s ease'
      }}
    />
  );
}
