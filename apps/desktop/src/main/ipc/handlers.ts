// IPC 业务处理器(Pet 版):桌宠相关通道。支持多来源(claude / codex),每源独立服务 + 引用计数。
import { handle } from './channels';
import type { EventSender } from './channels';
import { PetSessionWatcher } from '../pet/session-watch';
import { PetUsageService } from '../pet/usage-ledger';
import { PET_SOURCES } from '../pet/sources';
import { readCharacterSprite } from '../pet/characters';
import { createTuneWindow } from '../window';
import type { AppStateRepository } from '../db/repositories/app-state-repository';
import type { PetSourceId, CharacterMapping } from '@shared/pet-usage';

export interface IpcHandlerDeps {
  appStateRepo: AppStateRepository;
  sender: EventSender;
}

interface SourceSvc {
  watcher: PetSessionWatcher | null;
  usage: PetUsageService | null;
  subs: Set<number>; // 订阅该源的 webContents.id
}

export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  // 每个来源一套服务,但按订阅方(webContents.id)计数:最后一个订阅者离开才 stop(P2)。
  const services = new Map<PetSourceId, SourceSvc>();
  const svcOf = (id: PetSourceId): SourceSvc => {
    let s = services.get(id);
    if (!s) {
      s = { watcher: null, usage: null, subs: new Set() };
      services.set(id, s);
    }
    return s;
  };

  const startIfNeeded = (id: PetSourceId, cwd: string | null): void => {
    const svc = svcOf(id);
    if (svc.usage) return; // 已在跑 → 新订阅者复用
    // 活动态(working/talking)目前只有 Claude 源有会话解析;Codex 源 v1 只跑用量(心情/喂养驱动)。
    if (id === 'claude') {
      svc.watcher = new PetSessionWatcher(cwd, (state) => deps.sender.emit('pet:state', { source: id, state }));
      svc.watcher.start();
    }
    svc.usage = new PetUsageService(deps.appStateRepo, (u) => deps.sender.emit('pet:usage', u), Date.now, PET_SOURCES[id]);
    svc.usage.start();
  };
  const stopIfIdle = (id: PetSourceId): void => {
    const svc = services.get(id);
    if (!svc || svc.subs.size > 0) return;
    svc.watcher?.stop();
    svc.watcher = null;
    svc.usage?.stop();
    svc.usage = null;
  };

  handle('pet:watch', (payload, event) => {
    const id: PetSourceId = payload.source === 'codex' ? 'codex' : 'claude';
    const svc = svcOf(id);
    svc.subs.add(event.sender.id);
    event.sender.once('destroyed', () => {
      svc.subs.delete(event.sender.id); // 窗口直接关掉(没 unwatch)也清订阅
      stopIfIdle(id);
    });
    startIfNeeded(id, payload.cwd ?? null);
    return { ok: true as const };
  });
  handle('pet:unwatch', (_payload, event) => {
    for (const [id, svc] of services) {
      svc.subs.delete(event.sender.id); // 该窗口只订了某一源;从各源移除是幂等的
      stopIfIdle(id);
    }
    return { ok: true as const };
  });

  // 更换形象:每来源选中的形象 id 持久化在 app_state(key: pet-character-<source>)。
  handle('pet:save-character', (payload) => {
    deps.appStateRepo.set(`pet-character-${payload.source}`, payload.characterId);
    return { ok: true as const };
  });
  handle('pet:get-character', (payload) => ({
    characterId: deps.appStateRepo.get(`pet-character-${payload.source}`)
  }));
  // 取磁盘上(含导入的)形象精灵表的 data URL;内置形象渲染层用打包资源、不走这。
  handle('pet:character-sprite', (payload) => ({ dataUrl: readCharacterSprite(payload.id) }));

  // 动作设置:行映射按角色 id 持久化在 app_state(pet-mapping-<id>);存后广播让对应桌宠重载。
  handle('pet:get-mapping', (payload) => {
    const raw = deps.appStateRepo.get(`pet-mapping-${payload.id}`);
    let mapping: CharacterMapping | null = null;
    if (raw) {
      try {
        mapping = JSON.parse(raw) as CharacterMapping;
      } catch {
        /* 损坏 → null,用默认 */
      }
    }
    return { mapping };
  });
  handle('pet:save-mapping', (payload) => {
    deps.appStateRepo.set(`pet-mapping-${payload.id}`, JSON.stringify(payload.mapping));
    deps.sender.emit('pet:mapping-changed', { id: payload.id });
    return { ok: true as const };
  });
  handle('pet:open-tune', (payload) => {
    createTuneWindow(payload.source, payload.id);
    return { ok: true as const };
  });
}
