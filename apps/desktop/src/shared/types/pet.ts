// 角色状态(渲染层 PetSprite + 主进程活动追踪器 + IPC 共用)。
export type PetState = 'idle' | 'working' | 'talking' | 'waiting';
