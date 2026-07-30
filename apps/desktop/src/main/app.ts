// Electron 主进程入口 / 组合根(Pet 版)。最小装配:DB(app_state)+ IPC + 桌宠悬浮窗。
// 旧的画布/语音/多 Agent 工作台已移出(见 docs/legacy-canvas-ui.md);代码在 git 历史 + 本地 bundle。
import { app, BrowserWindow, dialog, session, Tray, Menu, nativeImage } from 'electron';
import { readFileSync } from 'node:fs';
import tray1xPath from './assets/trayTemplate.png?asset';
import tray2xPath from './assets/trayTemplate@2x.png?asset';
import { migrateLegacyData } from './config/paths';
import { detectedSources } from './pet/sources';
import { PricingUpdater } from './pet/pricing-updater';
import { getDb, closeDb } from './db/sqlite';
import { AppStateRepository } from './db/repositories/app-state-repository';
import { EventSender, registerIpcHandlers } from './ipc';
import { createPetOverlay } from './window';
import { createLogger } from './logging/logger';
import type { PetSourceId } from '@shared/pet-usage';

const log = createLogger('main:app');

const PET_SOURCE_LABELS: Record<PetSourceId, string> = { claude: 'Claude', codex: 'Codex' };
const PET_SOURCE_ORDER: PetSourceId[] = ['claude', 'codex'];

// 持有悬浮窗引用:Electron 窗口若没有 JS 引用可能被 GC → 窗口消失。closed 时清掉。
const petWindows: Partial<Record<PetSourceId, BrowserWindow>> = {};
function openPet(source: PetSourceId, index: number): void {
  const win = createPetOverlay(source, index);
  petWindows[source] = win;
  refreshTrayMenu();
  win.on('closed', () => {
    delete petWindows[source];
    refreshTrayMenu();
  });
}

function closePet(source: PetSourceId): void {
  const win = petWindows[source];
  if (win && !win.isDestroyed()) win.close();
}

// 模型价格自更新:持引用防 GC(内部有 setInterval)。
let pricingUpdater: PricingUpdater | null = null;

function setupServices(): void {
  const db = getDb();
  const appStateRepo = new AppStateRepository(db);
  const sender = new EventSender();
  registerIpcHandlers({ appStateRepo, sender });
  pricingUpdater = new PricingUpdater(appStateRepo);
  pricingUpdater.start(); // 先用缓存表,后台按需刷新;摄取计价即刻受益
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

/**
 * 确保检测到的每个源都有活着的桌宠窗(幂等:只补缺,已开的不动)——
 * 单只宠被关/崩、或开着设置小窗时,「Re-open pets」也能恢复缺的那只。
 * 一个源都没有 → 提示 + 开 Claude 宠占位(已有占位则不重复弹)。
 */
function openDetectedPets(): void {
  const missing = (id: PetSourceId): boolean => !petWindows[id] || petWindows[id]!.isDestroyed();
  const sources = detectedSources();
  if (sources.length === 0) {
    if (missing('claude')) {
      void dialog.showMessageBox({
        type: 'info',
        message: 'No coding agent found',
        detail:
          'Tokenmon visualizes local usage from Claude Code (~/.claude) or Codex (~/.codex), but neither was found on this machine. The pet will start eating once you use one of these tools.'
      });
      openPet('claude', 0);
    }
    return;
  }
  const opened = sources.filter((s, i) => missing(s.id) && (openPet(s.id, i), true)).map((s) => s.id);
  if (opened.length > 0) log.info('pets opened', { sources: opened });
}

// 菜单栏(顶部状态栏)常驻图标:桌宠为了浮在全屏 app 之上会隐藏 Dock 图标(visibleOnFullScreen 的副作用),
// 没有这个入口用户就无法退出/找回 app。持引用防 GC。
let tray: Tray | null = null;
function refreshTrayMenu(): void {
  if (!tray) return;
  const openSources = PET_SOURCE_ORDER.filter((source) => {
    const win = petWindows[source];
    return win && !win.isDestroyed();
  });
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Close pet',
        enabled: openSources.length > 0,
        submenu: openSources.map((source) => ({
          label: PET_SOURCE_LABELS[source],
          click: () => closePet(source)
        }))
      },
      { label: 'Re-open pets', click: () => openDetectedPets() }, // 幂等:补缺的那几只
      { type: 'separator' },
      { label: 'Quit Tokenmon', role: 'quit' }
    ])
  );
}

function createTray(): void {
  // Template 图标(纯黑+alpha,系统自动适配深浅色菜单栏)。?asset 产物文件名带 hash,
  // 破坏了 @2x 同名邻居约定 → 手动挂两档分辨率,再标记为模板。源:assets/tray.svg。
  const icon = nativeImage.createEmpty();
  icon.addRepresentation({ scaleFactor: 1, buffer: readFileSync(tray1xPath) });
  icon.addRepresentation({ scaleFactor: 2, buffer: readFileSync(tray2xPath) });
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Tokenmon');
  refreshTrayMenu();
}

void app.whenReady().then(() => {
  migrateLegacyData(); // 0.69 改名迁移:旧 talky-desktop 数据搬过来(在开库前)
  applyProdCsp();
  setupServices();
  createTray();
  openDetectedPets();

  app.on('activate', () => openDetectedPets()); // 幂等
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => closeDb());
