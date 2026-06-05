// Electron 主进程入口 / 组合根(Pet 版)。最小装配:DB(app_state)+ IPC + 桌宠悬浮窗。
// 旧的画布/语音/多 Agent 工作台已移出(见 docs/legacy-canvas-ui.md);代码在 git 历史 + 本地 bundle。
import { app, BrowserWindow, dialog, session, Tray, Menu, nativeImage } from 'electron';
import trayIconPath from './assets/tray.png?asset';
import { migrateLegacyData } from './config/paths';
import { detectedSources } from './pet/sources';
import { getDb, closeDb } from './db/sqlite';
import { AppStateRepository } from './db/repositories/app-state-repository';
import { EventSender, registerIpcHandlers } from './ipc';
import { createPetOverlay } from './window';
import { createLogger } from './logging/logger';
import type { PetSourceId } from '@shared/pet-usage';

const log = createLogger('main:app');

// 持有悬浮窗引用:Electron 窗口若没有 JS 引用可能被 GC → 窗口消失。closed 时清掉。
const petWindows: Partial<Record<PetSourceId, BrowserWindow>> = {};
function openPet(source: PetSourceId, index: number): void {
  const win = createPetOverlay(source, index);
  petWindows[source] = win;
  win.on('closed', () => {
    delete petWindows[source];
  });
}

function setupServices(): void {
  const db = getDb();
  const appStateRepo = new AppStateRepository(db);
  const sender = new EventSender();
  registerIpcHandlers({ appStateRepo, sender });
  log.info('pet services ready');
}

/** 生产环境注入严格 CSP(dev 交给 Vite,避免拦截 HMR/refresh 脚本)。 */
function applyProdCsp(): void {
  if (!app.isPackaged) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:"
        ]
      }
    });
  });
}

/** 只为本机检测到的源开桌宠(没装 Codex 就不出现 Codex 宠);一个都没有 → 提示 + 仍开 Claude 宠占位。 */
function openDetectedPets(): void {
  const sources = detectedSources();
  if (sources.length === 0) {
    void dialog.showMessageBox({
      type: 'info',
      message: 'No coding agent found',
      detail:
        'Tokenmon visualizes local usage from Claude Code (~/.claude) or Codex (~/.codex), but neither was found on this machine. The pet will start eating once you use one of these tools.'
    });
    openPet('claude', 0);
    return;
  }
  sources.forEach((s, i) => openPet(s.id, i));
  log.info('pets opened', { sources: sources.map((s) => s.id) });
}

// 菜单栏(顶部状态栏)常驻图标:桌宠为了浮在全屏 app 之上会隐藏 Dock 图标(visibleOnFullScreen 的副作用),
// 没有这个入口用户就无法退出/找回 app。持引用防 GC。
let tray: Tray | null = null;
function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(trayIconPath));
  tray.setToolTip('Tokenmon');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Re-open pets',
        click: () => {
          if (BrowserWindow.getAllWindows().length === 0) openDetectedPets();
        }
      },
      { type: 'separator' },
      { label: 'Quit Tokenmon', role: 'quit' }
    ])
  );
}

void app.whenReady().then(() => {
  migrateLegacyData(); // 0.69 改名迁移:旧 talky-desktop 数据搬过来(在开库前)
  applyProdCsp();
  setupServices();
  createTray();
  openDetectedPets();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openDetectedPets();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => closeDb());
