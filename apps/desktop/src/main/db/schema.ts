// 建表 DDL(PRD §7.1)。列名用 snake_case,repository 负责与 camelCase 类型互转。
// 仅放 schema 常量,不放运行时 CRUD(规范 §9.2)。

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    root_path TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL,
    last_opened_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    voice_raw TEXT,
    intent TEXT,
    plan TEXT,
    status TEXT NOT NULL,
    agent TEXT NOT NULL DEFAULT 'claude-code',
    risk_level TEXT,
    blocked_reason TEXT,
    source TEXT NOT NULL DEFAULT 'text',
    kind TEXT NOT NULL DEFAULT 'single',
    parent_task_id TEXT,
    collab_role TEXT,
    result_summary TEXT,
    external_ref TEXT,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    ended_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS task_steps (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    kind TEXT NOT NULL,
    label TEXT NOT NULL,
    detail TEXT,
    status TEXT NOT NULL,
    started_at INTEGER,
    ended_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS cli_sessions (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    agent TEXT NOT NULL,
    pid INTEGER,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER
  )`,

  `CREATE TABLE IF NOT EXISTS cli_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    task_id TEXT,
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    ts INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS file_changes (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    workspace_id TEXT NOT NULL,
    path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    source TEXT NOT NULL,
    diff TEXT,
    truncated INTEGER NOT NULL DEFAULT 0,
    ts INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS permission_requests (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    session_id TEXT,
    action TEXT NOT NULL,
    reason TEXT,
    risk TEXT,
    command TEXT,
    decision TEXT NOT NULL DEFAULT 'pending',
    decided_at INTEGER,
    created_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS voice_transcripts (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    role TEXT NOT NULL,
    text TEXT NOT NULL,
    ts INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS knowledge_nodes (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    source_task_id TEXT,
    target_ref TEXT,
    needs_review INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS knowledge_edges (
    id TEXT PRIMARY KEY,
    from_id TEXT NOT NULL,
    to_id TEXT NOT NULL,
    relation TEXT NOT NULL
  )`,

  // 通用 UI/应用状态键值存储(JSON 值)。画布布局存这里(端口/origin 无关,不再依赖渲染层 localStorage)。
  `CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tasks_external ON tasks(external_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_task_steps_task ON task_steps(task_id, seq)`,
  `CREATE INDEX IF NOT EXISTS idx_cli_events_session ON cli_events(session_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_file_changes_workspace ON file_changes(workspace_id, ts)`,
  `CREATE INDEX IF NOT EXISTS idx_file_changes_task ON file_changes(task_id)`,
  `CREATE INDEX IF NOT EXISTS idx_file_changes_path ON file_changes(workspace_id, path)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_ws ON knowledge_nodes(workspace_id, type)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_nodes_ref ON knowledge_nodes(target_ref)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_edges_from ON knowledge_edges(from_id)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_edges_to ON knowledge_edges(to_id)`
];
