// 桌宠悬浮窗创建(Pet 版:旧主窗口 createMainWindow 已随画布/工作台移出,见 docs/legacy-canvas-ui.md)。
import { app, BrowserWindow, screen, Menu, clipboard, dialog } from 'electron';
import { join } from 'node:path';
import type { PetSourceId } from '@shared/pet-usage';
import { listCharacters, parsePetId, importCharacter } from './pet/characters';

/** 从剪贴板读 codex-pets 下载指令 → 确认 → 下载新形象 → 把这只桌宠换成它。 */
async function importFromClipboard(win: BrowserWindow): Promise<void> {
  const text = clipboard.readText().trim();
  const id = parsePetId(text);
  if (!id) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      message: 'No valid codex-pets command in clipboard',
      detail: 'Copy an install command from the codex-pets site first (e.g. "npx codex-pets add <name>"), then click Import again.'
    });
    return;
  }
  const confirm = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Download', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: `Download character "${id}"?`,
    detail: `From clipboard: ${text}`
  });
  if (confirm.response !== 0) return;
  const r = await importCharacter(id);
  if (r.ok) {
    win.webContents.send('pet:set-character', { characterId: r.id }); // 这只桌宠直接换成新形象
    await dialog.showMessageBox(win, {
      type: 'info',
      message: `Imported "${r.name ?? r.id}"`,
      detail: 'This pet now uses the new character. Right-click → Change Character to switch again.'
    });
  } else {
    await dialog.showMessageBox(win, { type: 'error', message: 'Import failed', detail: r.error ?? 'Unknown error' });
  }
}

const PRELOAD = join(__dirname, '../preload/index.js');

/**
 * 桌宠悬浮窗:透明、无边框、置顶、跨 Space/全屏、不进 Dock。
 * 载渲染层的 #pet-overlay 路由。窗口小、贴右下角;拖动靠渲染层的 -webkit-app-region。
 */
// 桌宠尺寸由一个 scale 统一驱动(窗口 + 精灵都用它,免得各调各的对不上)。
// 默认 0.55(比旧版 0.9 小约 40%);`TOKENMON_PET_SCALE` 可调(0.3~1.2)。
const FRAME_W = 192;
const FRAME_H = 208;
const PET_SCALE = Math.min(1.2, Math.max(0.3, Number(process.env.TOKENMON_PET_SCALE) || 0.55));
const OVERLAY_W = Math.max(Math.round(FRAME_W * PET_SCALE) + 28, 176); // 精灵宽 + 边距,且容得下 hover 面板的最宽一行(缓存/额度,免截断)
const OVERLAY_H = Math.round(FRAME_H * PET_SCALE) + 42; // 精灵高 + HUD + 间距(折叠态)
/** 「今日用量」面板所需高度。窗口**固定**为 OVERLAY_H + 此值,面板用 CSS :hover 显隐、**不 resize**
 *  (macOS 上 transparent 窗口 setBounds 后会丢透明、露白底;故宁可固定高度 + 下方留一段透明)。 */
const OVERLAY_EXPAND = 132; // 容下 hover 面板(今日用量 + 成本/额度行)
const OVERLAY_GAP = 12; // 多只宠物并排时的间距

export function createPetOverlay(source: PetSourceId = 'claude', index = 0): BrowserWindow {
  const win = new BrowserWindow({
    width: OVERLAY_W,
    height: OVERLAY_H + OVERLAY_EXPAND, // 固定为「含面板」高度,从不 resize(避免 macOS 透明窗 resize 丢透明)
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 浮在所有窗口(含全屏 app)之上,并跟随所有 Space。
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // 右键 → 原生菜单(不会被透明小窗裁切):「更换形象」子菜单。选中即通知本窗口切换(渲染层再持久化)。
  win.webContents.on('context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Change Character',
        submenu: [
          ...listCharacters().map((c) => ({
            label: c.name,
            click: () => win.webContents.send('pet:set-character', { characterId: c.id })
          })),
          { type: 'separator' as const },
          { label: 'Import from Clipboard…', click: () => void importFromClipboard(win) }
        ]
      },
      // 动作设置:让被右键的桌宠把自己当前角色 id 报上来,再开设置窗口(渲染层知道自己的 source/角色)。
      { label: 'Action Mapping…', click: () => win.webContents.send('pet:tune-request', {}) },
      { type: 'separator' as const },
      // 无 Dock/菜单栏(贴全屏的副作用),右键和托盘是仅有的退出口。
      { label: 'Quit Tokenmon', click: () => app.quit() }
    ]);
    menu.popup({ window: win });
  });

  // 默认贴右下角(主显示器工作区内,留点边距);多只宠物按 index 从右往左排。
  // 窗口含下方 OVERLAY_EXPAND 的面板区:pet 在窗口顶部、面板区在其下(hover 才显),pet 位置不变。
  const { workArea } = screen.getPrimaryDisplay();
  win.setPosition(
    workArea.x + workArea.width - 24 - (index + 1) * OVERLAY_W - index * OVERLAY_GAP,
    workArea.y + workArea.height - OVERLAY_H - OVERLAY_EXPAND - 24
  );

  // 防止拖出屏幕外丢失:**停止移动后**才夹一次回屏内(macOS 拖动中会反复触发 moved,
  // 立刻 setBounds 会和原生拖拽打架 → 来回抽搐;故 debounce,等拖完再夹)。
  let clampTimer: ReturnType<typeof setTimeout> | null = null;
  win.on('moved', () => {
    if (clampTimer) clearTimeout(clampTimer);
    clampTimer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const b = win.getBounds();
      const wa = screen.getDisplayMatching(b).workArea;
      const x = Math.min(Math.max(b.x, wa.x), wa.x + wa.width - b.width);
      const y = Math.min(Math.max(b.y, wa.y), wa.y + wa.height - b.height);
      if (x !== b.x || y !== b.y) win.setBounds({ x, y, width: b.width, height: b.height });
    }, 220);
  });

  win.on('ready-to-show', () => win.show());
  loadRoute(win, `pet-overlay?scale=${PET_SCALE}&source=${source}`); // scale + 来源传给渲染层
  return win;
}

/** 「动作设置」窗口(普通不透明小窗):为某角色配置 行→状态/心情 映射。每角色单实例。 */
const tuneWindows = new Map<string, BrowserWindow>();
export function createTuneWindow(source: PetSourceId, id: string): BrowserWindow {
  const existing = tuneWindows.get(id);
  if (existing && !existing.isDestroyed()) {
    existing.focus();
    return existing;
  }
  const win = new BrowserWindow({
    width: 440,
    height: 540,
    show: false,
    title: `Actions · ${id}`,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#0b0d12',
    webPreferences: { preload: PRELOAD, sandbox: false, contextIsolation: true, nodeIntegration: false }
  });
  tuneWindows.set(id, win);
  win.on('closed', () => tuneWindows.delete(id));
  win.on('ready-to-show', () => win.show());
  loadRoute(win, `pet-tune?source=${source}&id=${encodeURIComponent(id)}`);
  return win;
}

/** 把渲染层载到某个 hash 路由(dev 走 vite URL,prod 走打包 index.html)。 */
function loadRoute(win: BrowserWindow, hash: string): void {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(`${devUrl}#${hash}`);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash });
  }
}
