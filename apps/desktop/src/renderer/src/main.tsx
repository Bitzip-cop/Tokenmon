import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { PetPreview } from './components/Pet/PetPreview';
import { PetOverlay } from './components/Pet/PetOverlay';
import { PetTune } from './components/Pet/PetTune';
import './styles/global.css';

const container = document.getElementById('root');
if (!container) throw new Error('root container missing');

// 路由(hash):#pet-overlay = 桌面悬浮宠物(透明窗);#pet-tune = 动作设置窗口;其余 = 角色预览(开发用)。
const hash = window.location.hash;
let view: ReactNode = <PetPreview />;
if (hash.startsWith('#pet-overlay')) {
  // 尺寸 + 来源由主进程经 hash 传(?scale=…&source=…)。
  const m = hash.match(/scale=([\d.]+)/);
  const scale = m && Number(m[1]) > 0 ? Number(m[1]) : undefined;
  const source = hash.includes('source=codex') ? 'codex' : 'claude';
  view = <PetOverlay scale={scale} source={source} />;
  // 悬浮窗要透明:覆盖 global.css 的不透明背景。
  document.documentElement.style.background = 'transparent';
  document.body.style.background = 'transparent';
  container.style.background = 'transparent';
} else if (hash.startsWith('#pet-tune')) {
  const params = new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
  const source = params.get('source') === 'codex' ? 'codex' : 'claude';
  view = <PetTune source={source} id={params.get('id') ?? 'clawd'} />;
}

createRoot(container).render(<StrictMode>{view}</StrictMode>);
