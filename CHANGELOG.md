# Tokenmon 迭代记录

> 本文件记录项目的迭代脉络(git 历史开始前的工作浓缩为下方 0.x 条目;之后每次提交续写一条)。

## [unreleased]

### 0.77 — 动作多样性:重排 clawd 默认映射 + 自发闲置动画 + happy 窗口缩短(2026-06-05)
- 用户反馈"只会玩滑板、耳机动作没见过"。逐帧核对 clawd 行语义:**滑板有三行(1/2/7)**,旧映射把 talking(1)/working(2)/happy(7) 全配进滑板系;耳机(0)配给 mood=idle 但 happy 窗口 30 分钟 → 工作日几乎永远轮不到。机制本身(watcher/优先级/渲染)验证无 bug。
- **重排默认映射**:working→3(安全帽扳手)、waiting→8(侦探放大镜);talking=1、happy=7(滑板保留一份)。
- **自发闲置动画**:`FlourishScheduler`(纯逻辑+单测)——闲着(idle 态 + happy/闲心情)每 20~50s 随机播一轮 flourish 行(1/2/3/6/7/8,不含吃/难过),播两轮回常态;忙起来立即取消。
- **happy 窗口 30→10 分钟**:耳机 idle 行更容易出现。
- 数据侧排查记录:i-rocky 等生成形象行间差异天然小(9 行近乎同款),帧数表与 codex-pets 标准网格一致、无错位;Codex 宠暂无活动态来源(会话解析只做了 Claude),只有心情维度。
- 验证:typecheck + 59 单测(新增 3)+ build 全绿。

### 0.76 — v0.1.2:Template 托盘图标、hover 面板修复、名牌带当前模型、review 修复(2026-06-05)
- **菜单栏图标换 Codex 设计的小怪兽头**(assets/tray.svg):Template 规范(纯黑+alpha,深浅色自适应),墨水高规格化 16pt 与系统图标对齐;`?asset` 双分辨率(hash 文件名破坏 @2x 邻居约定 → `addRepresentation` 手挂 1x/2x)+ `setTemplateImage`。
- **hover 面板截断修复**(验收发现):英文化后 Cache/Quota 行(≈17 字符值)超宽 —— 窗口最小宽 176→212、面板 max-width 190→200、面板区高 132→140。
- **名牌带当前模型**:`Claude · Opus 4.8` / `Codex · GPT-5.5` —— 账本新增 lastModel(按 ts 取最近一笔用量的模型,scanTail 基线/迁移补齐),`modelLabel()` 美化展示名;切模型名牌跟着变。
- **Codex review 修复**:① Re-open pets/activate 改幂等(按 petWindows 逐源补缺,不再看全局窗口数 —— 之前单只宠被关或开着设置窗时 no-op);② `LSUIElement: true` 写明菜单栏 utility 定位(消除启动时 Dock 闪现);③ PetOverlay 的 modelLabel 提前求值去重。
- 版本 0.1.1 → 0.1.2。验证:typecheck + 56 单测 + build/dist 全绿,LSUIElement 入 plist;Codex 侧独立验证 codesign/hdiutil/asar unpack 通过。

### 0.75 — v0.1.1:菜单栏托盘图标 + 右键 Quit(修"无法退出")(2026-06-05)
- 验收发现:桌宠为了浮在全屏 app 之上(`visibleOnFullScreen`),Electron 会隐藏 Dock 图标 → 没有 Dock、没有应用菜单,右键菜单又没有退出项,**用户只能去活动监视器杀进程**。
- 修复:① **菜单栏托盘图标**(clawd 像素小图标,`?asset` 经 electron-vite 打进 out):Re-open pets + Quit Tokenmon;② 桌宠**右键菜单底部加 Quit Tokenmon**。
- 版本 0.1.0 → 0.1.1;打 tag 走 release workflow 出新 dmg。
- 验证:typecheck + 55 单测 + build 全绿;0.1.1 打包版实测托盘/右键退出正常(用户验收)。

### 0.74 — 修 CI:pnpm allowBuilds 占位符导致 install 退出 1(2026-06-05)
- `pnpm add electron-builder` 时 pnpm v11 在 pnpm-workspace.yaml 自动插了占位行 `electron-winstaller: set this to true or false`(无效值=未决策),CI 干净安装报 `ERR_PNPM_IGNORED_BUILDS` 退出 1(本地因管道吞了退出码没暴露)。改为显式 `false`(只打 mac dmg 用不到 Windows 安装器);干净 clone 复现 exit=0。

### 0.73 — README(EN/ZH) + LICENSE(MIT) + CI(开源前置)(2026-06-05)
- **README 重写**:英文为主(README.md)+ 中文版(README.zh.md)——零配置自动检测、本地优先隐私声明、dmg 安装(右键打开绕 Gatekeeper)、源码构建、env 配置表、按模型计价说明、codex-pets 素材致谢;banner 用 clawd+chispa 精灵拼图(docs/assets/banner.png)。旧 README 的「饱腹度/画布」过时内容移除。
- **LICENSE**:MIT(Copyright 2026 Bitzip-cop)。
- **CI**:GitHub Actions —— ci.yml(push/PR:typecheck+test+build,macos runner);release.yml(打 v* tag 自动 pnpm dist 出 dmg 挂 Release)。
- **仓库清理**:删 legacy 文档(talky-prd/requirements/skeleton/legacy-canvas-ui,本地历史与 bundle 仍可查)、语音残留 scripts/setup-whisper.sh、空占位包 packages/{config,protocol}、workspaces/;CHANGELOG 个人路径脱敏(~/. 代替绝对路径)。
- 验证:typecheck + 55 单测 + build 全绿。

### 0.72 — electron-builder 打包 .dmg + 依赖瘦身 + npx PATH 修复(开源前置)(2026-06-05)
- **可分发安装包**:electron-builder 配置(appId com.bitzip.tokenmon,productName Tokenmon),`pnpm dist` 出 `Tokenmon-0.1.0-arm64.dmg`(~102MB)。无开发者证书 → **ad-hoc 深签**(Apple Silicon 必需,`identity:null` 会连 ad-hoc 都跳过导致起不来);已实测打包版可启动。图标:取 clawd 第一帧生成 1024px 像素图标。
- **依赖瘦身**:删画布/语音残留 deps(claude-agent-sdk、@xyflow/react、chokidar、diff、zustand);react/react-dom 挪 devDeps(vite 已打进 bundle,不需进 app node_modules)→ 运行时依赖只剩 better-sqlite3。删死代码 PET_CHARACTERS。
- **makima 移出内置**(第三方 IP 不随仓库/安装包分发,可经「导入形象」获取);内置只剩 clawd + chispa(codex-pets 项目素材)。
- **npx PATH 修复**:打包 .app 不继承终端 PATH → 「导入形象」改经登录 shell(`$SHELL -lc`)跑 npx(id 已白名单校验,无注入面)。
- **数据迁移修正**:旧 dev userData 实为字面 `@talky/desktop` 目录(非 talky-desktop);迁移加 `isPackaged` 守卫,防打包版把 dev 数据搬走。
- .gitignore:忽略 release/、放行 build/icon.png。
- 验证:typecheck + 55 单测全绿;dmg 构建 + codesign --verify --deep 通过 + 打包版实际启动/退出正常。

### 0.71 — UI 全面英文化(开源前置)(2026-06-05)
- 面向国际用户:hover 面板(Today/Output/Input/Cache/Cost/Quota)、右键菜单(Change Character / Import from Clipboard… / Action Mapping…)、导入对话框、动作设置窗(Actions · <id>,Row N,Save/Reset)、额度重置 tooltip、开发预览页 PetPreview 全部英文。代码注释保持中文(团队工作语言)。
- 验证:typecheck + 55 单测 + build 全绿。需重启 app 生效。

### 0.70 — 数据源自动检测 + 路径可配(开源前置)(2026-06-05)
- **零配置自动发现**:启动时检测本机装了哪些工具(`~/.claude` / `~/.codex` 配置根存在与否),**只为存在的源开桌宠** —— 只装 Claude Code 的用户不会看到一只永远发呆的 Codex 空宠;一个都没有 → 英文提示框说明 + 仍开 Claude 宠占位。
- **路径可配**:尊重两家官方环境变量 `CLAUDE_CONFIG_DIR`(Claude Code)/ `CODEX_HOME`(Codex),改过配置目录的用户也能用;codex-pets 形象目录(`<CODEX_HOME>/pets`)同步跟随。
- 验证:typecheck + 55 单测(新增 2)+ build 全绿。

### 0.69 — 内部标识符改名 talky → tokenmon(开源前置)(2026-06-05)
- 包名:根 `talky`→`tokenmon`、`@talky/{desktop,config,protocol}`→`@tokenmon/*`(scripts --filter 同步,lockfile 刷新)。
- 环境变量:`TALKY_*`→`TOKENMON_*`(PET_SCALE / USE_MOCK / DATA_DIR / LOGS_DIR / WORKSPACE / LOG_LEVEL / MOOD_*)。
- preload API:`window.talky`→`window.tokenmon`(`TalkyApi`→`TokenmonApi`)。
- 库文件:打包版 `talky.sqlite`→`tokenmon.sqlite`;**数据迁移** `migrateLegacyData()`:启动时把旧 userData(`talky-desktop/data`)整体搬到新位置 + 库文件改名,本机账本(起始日/历史/形象/映射)无损;dev 库 `dev.sqlite` 名字不变。
- 验证:typecheck + 53 单测 + build 全绿。

### 0.68 — 按模型逐条计价(切模型也准)+ 修正 Opus 单价(2026-06-05)
- **价格规则捋清并写死进代码**:Claude 按系列分档(同系列换版本号价不变)——Opus 4.5+ 现价 **$5/$25**、Opus 4.1/4.0 老档 $15/$75、Sonnet $3/$15、Haiku $1/$5;OpenAI 按版本独立定价——GPT-5.5 $5/$30、GPT-5.4 $2.5/$15(正好减半)、5.4-mini $0.75/$4.5;`codex-auto-review`/未知模型按该源主力档兜底。
- **修正重大计价错误**:原代码 Claude 一律按 $15/$75(Opus 4.1 老价)算 → 金额高估 3 倍。现 Opus 4.7/4.8 按现价 $5/$25,显示成本会明显下降(这是修正,不是少算)。
- **按模型逐条计价**:成本不再「总量 × 源固定单价」,改为摄取时每笔按当时模型选档(`pricingForModel`)、累计进账本(`allTimeCostUSD`/`byDayCost`)。中途 Opus↔Sonnet/Haiku、GPT-5.5↔5.4 切换均精准。
  - Claude:每行 `message.model` 自带;Codex:`turn_context` 行声明模型、之后的 `token_count` 按它计价(**文件级持久** `fileModels`,跨 tick/重启不丢)。
  - 解析层重构:`parseUsage`/`parseCodexUsage` 返回 `ParsedLine`(usage 行带 model;turn_context → 模型声明行)。
  - 旧账本迁移:历史聚合无模型维度 → 首次载入按源默认单价折算一次作基线,之后增量按真实模型算。
- 验证:typecheck + **50 单测**(新增 9:分档/双源切模型/迁移/turn_context 持久)+ build 全绿。需重启 app 生效。


### 0.67 — 右键「动作设置」:按角色配「行→状态/心情」映射(2026-06-05)
- 右键桌宠 → **「动作设置…」** → 开一个设置窗口:列出该角色精灵表各行(带行号)+ 给 4 个活动状态(空闲/工作/说话/等待)+ 4 个心情(吃/开心/闲/难过)各选一行 → 保存。**按角色 id 持久化**(app_state `pet-mapping-<id>`),保存后该角色的桌宠立即生效(广播 `pet:mapping-changed`);可「恢复默认」。
- 用途:不同下载的形象行布局可能不同(以前只能靠 pet-lab 网页试),现在内嵌右键菜单、且真正改到桌宠。
- 实现:`makeConfig(name, sprite, mapping?)` 支持映射覆盖;导出 `GRID`/`DEFAULT_MAPPING`/`STATE_SLOTS`/`MOOD_SLOTS`;新增 IPC `pet:open-tune`/`pet:get-mapping`/`pet:save-mapping` + 事件 `pet:tune-request`/`pet:mapping-changed`;`createTuneWindow`(普通小窗,`#pet-tune`)+ `PetTune` 组件;`PetOverlay` 取并应用映射、监听变更实时重载。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.66 — 右键「导入形象」(从 codex-pets 下载本地没有的形象)(2026-06-05)
- 右键 → 更换形象 → **「导入形象(从剪贴板)…」**:先在 codex-pets 网站复制下载指令(`npx codex-pets add <名字>`),回来点它 → 读剪贴板 + 原生确认 → 跑 `npx codex-pets add` 下载到 `~/.codex/pets` → **自动把这只桌宠换成新形象**。
- 形象系统改**动态**:「更换形象」子菜单列出 内置 + `~/.codex/pets` 下所有形象(`listCharacters`);非内置形象的精灵表由主进程读成 data URL(`pet:character-sprite` / `readCharacterSprite`)给渲染层显示;内置三个仍用打包资源(离线兜底)。
- `pets.ts` 重构:`GRID` + `makeConfig(name, sprite)` + `BUNDLED_SPRITES`;`PetOverlay` 动态解析精灵(内置 URL 或 data URL)+ `useMemo` 稳定 config。安全:形象 id 正则校验(防目录穿越/注入)、`execFile` 非 shell。
- (本提交一并含心情图标改造:系统 emoji → `MoodIcon` 像素徽章。)
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.65 — 右键「更换形象」(2026-06-05)
- 桌宠**右键** → 原生菜单(不被透明小窗裁切)→ **「更换形象」子菜单**,列出可选形象:Clawd / Chispa / Makima。选中即切换该只桌宠的精灵,并**持久化**(app_state `pet-character-<source>`),重启保留;形象下方的 agent 名(Claude/Codex)不随形象变。
- 实现:`PET_CHARACTERS`(shared id+名)+ 渲染层 `CHARACTERS` 注册表(id→精灵,新增 Makima)+ `petConfigById`;新增 IPC `pet:save-character`/`pet:get-character`(读写 app_state)+ 事件 `pet:set-character`(菜单→渲染层);`window.ts` 右键 `Menu.popup`;`PetOverlay` 载入/监听/持久化。
- 打包 makima 精灵(同 codex-pets 网格,复用配置)。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.64 — Codex 用 GPT-5.5 官方单价(in $5 / out $30)(2026-06-04)
- 查实 GPT-5.5 API 单价(联网核对两源):**input $5 / output $30 每 1M**、缓存输入 9 折 ≈ $0.5。把 Codex 估算档(原 GPT-5 $1.25/$10)换成准确的 `DEFAULT_PRICING.gpt55`(in5 / out30 / cacheWrite5 / cacheRead0.5)。
- Codex「今日成本 🍽$」现按真实 GPT-5.5 价算(合计仍 = in+out+cacheWrite、去 cacheRead)。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.63 — Codex 那只外面改显示消耗金额,额度% 移到 hover(2026-06-04)
- 按要求:Codex 桌宠**外面(HUD)主显消耗金额 🍽$**(和 Claude 一致),**真实额度% 移进 hover 面板**。
- 给 Codex 接上 GPT-5 档**估算**单价(`DEFAULT_PRICING.gpt5`:input $1.25 / output $10 / cacheRead $0.125 每 Mtok);`PetSource.codex.pricing` 不再为 null → `showCost`=true → HUD 显 🍽$、面板有成本行。
- HUD 去掉 ⏳额度;额度只留 hover 面板「⏳ 额度 5h N% · 周 M%」一行(蓝色高亮,tooltip 含重置)。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.62 — 修缓存被截 + 窗口防 GC + Codex 不按 Opus 价(Codex review)(2026-06-04)
- **缓存数据被截**:悬浮窗太窄(134px)装不下 hover 面板的缓存/额度行 → 加宽窗口(`OVERLAY_W` 下限 124→176)+ 缓存文案紧凑("写X 读Y")+ 面板 `max-width` 168→190 + `OVERLAY_EXPAND` 120→132。
- **P1 窗口防 GC**:两只悬浮窗 `createPetOverlay` 后丢了引用,可能被 GC 致窗口消失。`app.ts` 改用模块级 `petWindows` 持有引用、`closed` 时清。
- **P1 Codex 成本口径错**:此前 Claude/Codex 都用 `pricingFor(null)`=Opus 价 → Codex「今日成本」按 Opus 算明显不对。`pricing` 移入 `PetSource`(Claude=opus、Codex=null);**Codex 不显示美元成本,改显示 token + 真实额度%**(snapshot 加 `showCost`)。
- **P0**(Codex 报的 typecheck 失败:load 调旧 `findLastOutputTs`、snapshot 缺 quota)其实**在 0.61 已修**(load 用 scanTail、snapshot/tick 带 quota);本次核实 `typecheck:node` 通过、无残留 —— Codex review 的是 0.61 之前的 commit。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.61 — Codex 那只显示真实额度%(rate_limits)(2026-06-04)
- Codex 的 `token_count` 带 `rate_limits.primary.used_percent`(5h 真实额度%)+ secondary(周)+ `resets_at` + `plan_type` —— Claude 本地拿不到的那个。
- `parseCodexUsage` 解析出 `PetQuota`;账本按 ts 追踪最新一条(`lastQuota`,基线/重启从会话尾部 seed 并持久化);snapshot / `pet:usage` 透出 `quota`(Claude 恒 null)。
- Codex 桌宠展示:HUD 加 `⏳N%`(5h 已用,tooltip 含"X 后重置");hover 面板加「⏳ 额度 5h N% · 周 M%」一行。Claude 那只无额度 → 不显示。
- 窗口 `OVERLAY_EXPAND` 96→120 容下额度行。+2 单测(quota 解析)。
- 验证:typecheck + 41 单测 + build 全绿。需重启 app 生效。


### 0.60 — 修桌宠不好抓:去掉点击穿透(窗口恒可交互)(2026-06-04)
- 现象:点击/长按拖动不好点到热区——刚开始要拖到某个点才触发,之后又都能拖。
- 根因:0.56 的点击穿透机制——窗口默认 `setIgnoreMouseEvents(true, {forward})`,靠转发 move + **异步 IPC** 才临时关穿透才可拖;**首次按下时常还在穿透态 → 抓不住**;一旦拖起来窗口跟随鼠标 → 状态保持可交互 → "后面又都能拖"。
- 修:**整套点击穿透删除**(`pet:overlay-interactive` 频道/处理器/渲染层 useEffect/window 默认穿透)。窗口恒可交互 → **随手即抓、零延迟**;下方透明区现为可拖手柄。
- 取舍:宠物下方透明区不再把点击透传桌面(此前你反馈"没发现这个小代价")。
- 验证:typecheck + 39 单测 + build 全绿。需重启 app 生效。


### 0.59 — 桌宠 agent 名移到消耗数据上方(单独一行)(2026-06-04)
- 0.58 把名字 + 成本并到一行后太长;改回**名字单独一行在上**(形象下方),消耗数据(心情 🍽 今日成本)单独一条在下,hover「今日用量」面板照常。
- 验证:typecheck + 39 单测 + build 全绿。需重启 app 生效。


### 0.58 — 修 agent 名遮住消耗数据(并进同一条 HUD)(2026-06-04)
- 现象:0.57 加的 agent 名标签是独立一行,把原来那条消耗数据(心情 + 今日成本)挤掉/盖住,只看到名字。
- 修:把 agent 名**并进同一条 HUD**——`名字 ｜ 心情 🍽 今日成本`,名字常驻、心情/成本随 usage 出现,同处一行、互不遮挡。**两者都保留**。
- 验证:typecheck + 39 单测 + build 全绿。需重启 app 生效。


### 0.57 — 第二只桌宠:Codex(chispa)+ 形象下方标 agent 名(2026-06-04)
- Codex 本地也有用量:`~/.codex/sessions/**/*.jsonl` 的 `event_msg/token_count`(`last_token_usage` 每回合增量 + `rate_limits.used_percent` 真实额度%)。验证增量累加 == 会话累计 ✓。
- 用量管线改**按来源(claude/codex)参数化**:新增 `pet/sources.ts`(各源根目录/行解析/文件遍历/账本键);`parseCodexUsage`(token_count→TokenTotals:input=非缓存、cacheRead=缓存、output 含 reasoning);`UsageLedger`/`PetUsageService` 接受 `PetSource`;`pet:usage`/`pet:state` 带 `source`,渲染层按源过滤(两源各一本账)。
- **两只桌宠并排**:Claude(clawd,右)+ Codex(**chispa**,左,`npx codex-pets add chispa` 装的锈橙机器人)。同款 codex-pets 网格直接复用 CLAWD 配置、只换图。各喂各自用量、各自心情。
- **形象下方标 agent 名**(Claude / Codex,`.petoverlay__name`)。`createPetOverlay(source, index)` 从右下往左排两只。
- 验证:typecheck + 39 单测(+2 Codex 解析)+ build 全绿。需重启 app 生效。
- 备注:Codex 的活动态(working/talking)v1 未接(只用量→心情驱动);真实额度%(`rate_limits.used_percent`,Claude 拿不到的那个)已可取、暂未展示,后续可做。


### 0.56 — Codex review 修复:usage 去重 / 悬浮窗点击穿透 / watcher 引用计数(2026-06-04)
- **P1 usage 去重**:Claude Code 会把同一 assistant message 写成多行、且多行可能带同一份 usage → 今日/历史成本与喂养被重复放大。`parseUsage` 现返回去重键 id(`message.id` 优先、回退 `requestId`);账本 `countedIds`(限长 3000)按 id 去重,同一 message 多行只计一次。+2 单测。
- **P1 悬浮窗点击穿透**:固定高度窗口下方透明空白区原会拦截桌面/其他 App 的点击。改:窗口默认 `setIgnoreMouseEvents(true, {forward})` 穿透;渲染层按鼠标是否在宠物/HUD/面板上(`elementFromPoint`)经新 IPC `pet:overlay-interactive` 实时切换 —— 在内容上才拦截(可拖/可点),空白处穿透到桌面。
- **P2 watcher 引用计数**:`pet:watch`/`pet:unwatch` 改为按 `webContents.id` 计订阅,最后一个离开才 stop;窗口直接关闭(`destroyed`)也清订阅。避免 #pet 预览 / 未来设置面板等任一窗口 unmount 停掉全局 watcher/usage。
- 验证:typecheck + 37 单测 + build 全绿。需重启 app 生效。


### 0.55 — 画布/工作台代码从 main 删除,仓库回归纯 Pet(方案①:保留历史)(2026-06-04)
- 把整套「语音 + 多 Agent 协作 + 空间画布」代码从 `main` 代码树**删除**:渲染层(App / AgentCanvas / TaskBoard / Conversation / KnowledgePanel / VoiceDock / PermissionDialog / PlanDialog / 全部 store/hook/utils/screens)+ 主进程(`agent/` / `cli/` / `voice/` / `files/` / `sessions/` / `knowledge` + cli/file/knowledge/task/workspace repo)+ 相关测试 + 孤立的 `app-config.ts`。
- 重写 6 个 survivor 为 Pet-only:`app.ts`(最小装配 DB+IPC+悬浮窗)、`window.ts`(去 createMainWindow)、`ipc/handlers.ts`、`shared/ipc-contract.ts`、`shared/events.ts`(均只剩 pet:watch/unwatch + pet:state/usage)、`main.tsx`(去 App,默认 PetPreview)。
- **代码未消失**:本地 bundle `~/Tokenmon-canvas-archive/*.bundle` + 本地 tag `canvas-ui-v1`(60157eb)+ GitHub 历史(方案① 保留历史)。取回方式见 `docs/legacy-canvas-ui.md`。
- 效果:测试 130→**35**(只剩 5 个 Pet 测试)、产物 JS **661K→226K** / CSS 47K→6K。`package.json` 旧依赖待单独清。
- 验证:typecheck + 35 单测 + build 全绿。


### 0.54 — 聚焦桌宠:默认只开 Pet,画布/主界面移出默认(代码保留)(2026-06-04)
- 产品聚焦 Pet:启动**默认只开 Pet 悬浮窗**,不再打开画布/主界面大窗。
- **代码一行未删**:旧的「语音 + 多 Agent 协作 + 空间画布」主界面完整保留在仓库 —— `TALKY_OPEN_MAIN=1` 可调出;打 tag **`canvas-ui-v1`**(commit `60157eb`)作备份点;`docs/legacy-canvas-ui.md` 记录代码位置与捡回方式。
- `app.ts`:`createMainWindow` 改为**仅在 `TALKY_OPEN_MAIN=1` 时创建**(whenReady + activate 同改)。其余 service 照常装配(Pet 模式下编排/执行器休眠、无 UI 触发);Pet 只读 `~/.claude` 用量,不依赖这些。
- 验证:typecheck + 130 单测 + build 全绿。需重启 app 生效。


### 0.53 — 定稿桌宠开心/难过动作(难过叠灰度+半速)(2026-06-04)
- **开心 = 行7**(滑板花式,活跃有劲);**难过 = 行5**(闭眼)+ **灰度 + 半速动画** → 蔫蔫没精神,和"满足/打盹"区分开。
- `fpsForMood`(纯函数:难过半速、下限 1 fps)+ 单测;`PetSprite` 用它驱动帧率,并给难过加 `filter: grayscale(.85) brightness(.92)`(0.5s 过渡)。`moodRef` 让心情变化不重建动画循环。
- 验证:typecheck + 130 单测 + build 全绿。需重启 app 生效。


### 0.52 — 修桌宠小窗与面板金额口径不一致(2026-06-04)
- 现象:小窗 `🍽 $114` 与展开面板「成本」`$148` 对不上。
- 实为**两种口径**(数字都对):小窗给的是"仅产出(output)"成本,面板「成本」给的是"合计"(输入+产出+缓存写,不含缓存读)。放一起易误解为矛盾。
- 修:小窗也改用合计 `todayCostUSD`,与面板「成本」一致;`title` 注明口径。去掉 `PetOverlay` 里不再用到的 `costBreakdown`/`pricingFor` import。
- 验证:typecheck + 129 单测 + build 全绿。需重启 app 生效。


### 0.51 — 改固定高度悬浮窗根治白底(不再 resize 透明窗)(2026-06-04)
- 0.50 的 `setBackgroundColor` workaround 在本机 Electron 无效,白底仍在(圆角白窗底 = transparent 窗口 resize 丢透明的典型表现)。
- 改 **Plan B:悬浮窗固定为「含面板」高度、从不 resize**;「今日用量」面板改用纯 CSS `:hover` 显隐。窗口不 resize → 透明不丢 → 无白底。
- **pet 位置不变**(0.49 已把窗口上移、给下方留了空间;现在那段从"空桌面"变成"窗口内透明区")。删掉 IPC `pet:overlay-expand` + `setOverlayExpanded` + 渲染层 hover 态(全交给 CSS)。
- 已知小代价:折叠时 pet 正下方约一指宽透明区会挡到桌面点击(后续可做点击穿透)。
- 验证:typecheck + 129 单测 + build 全绿。需重启 app 生效。


### 0.50 — 修桌宠未 hover 时露白底(macOS 透明窗 resize 丢透明)(2026-06-04)
- 现象:0.49 加 hover resize 后,**鼠标不在桌宠上时露出白色窗底**。
- 根因:macOS 上 `transparent: true` 的窗口在 `setBounds`(收起那次 resize)后会丢失透明、露出窗口白色背板(Electron 已知坑)。
- 修:`setOverlayExpanded` 每次 `setBounds` 之后调 `win.setBackgroundColor('#00000000')` 把背景重设回全透明。
- 验证:typecheck + 129 单测 + build 全绿。需重启 app 生效。


### 0.49 — 桌宠 hover 展开「今日用量」信息面板(2026-06-04)
- 鼠标移到悬浮桌宠上 → 下方**展开一张面板**:除原有(心情 + 🍽 今日产出成本)外,加 **今日 token 用量** —— ↓产出 / ↑输入 / ⟳缓存(写·读) / ≈成本。离开收起。
- 实现:hover 经新 IPC `pet:overlay-expand` 通知主进程把悬浮窗加高(`setOverlayExpanded`,`BrowserWindow.fromWebContents(event.sender)` 拿到发消息的悬浮窗),否则展开内容会被窗口边界裁掉。
- pet 改**顶部锚定** + 默认位置预留下方空间 → **展开时 pet 不跳动**(信息往下长);贴屏底放不下时才整窗上移、收起还原(不累积上移)。拖拽 clamp 改用当前尺寸,兼容展开态。
- 验证:typecheck + 129 单测 + build 全绿。需重启 app 生效。


### 0.48 — 桌宠尺寸缩小(可调)(2026-06-04)
- 悬浮桌宠从 scale 0.9 → **0.55**(约旧版 60% 大小,窗口 240×260 → 134×156)。
- 尺寸改由**单一 scale 统一驱动**:主进程算窗口尺寸 + 经 hash(`?scale=…`)把同一值传给渲染层,精灵随窗口一起缩(不再窗口/精灵两处各调、对不上)。`TALKY_PET_SCALE`(0.3~1.2)可微调,默认 0.55。
- 路由 `#pet-overlay` 改为前缀匹配以带参;`PetOverlay` 接收 `scale` prop(默认 0.55)。
- 验证:typecheck + 129 单测 + build 全绿。需重启 app 生效。


### 0.47 — 修桌宠待机变空帧 + 渲染加固(绝不画空帧)(2026-06-04)
- **现象**:0.46 后非"吃"状态(待机/开心/难过)显示**完全空帧**,只有有 output(吃)时才出现。
- **根因**:渲染层加载了**旧 bundle**——0.46 主进程改发 `happy/idle/sad`,但渲染窗口还跑旧 `moodRows`(只有 eating/full/hungry/sleepy)→ 旧表查不到新 mood → `resolveRow` 返回 `undefined` → canvas 用 `undefined*frameH` 画出空帧;`eating` 新旧都有(=4)所以一吃就出现。提交的 0.46 代码本身自洽(干净重启即正常),但暴露了脆弱点。
- **修(加固,绝不画空帧)**:`resolveRow` 任何查不到的 mood/state 一律回退 idle 行、**绝不返回 undefined**;`framesForRow` 处理用 `Math.max(1, …)` 防 `%0`。+1 单测。
- 验证:typecheck + 129 单测 + build 全绿。**请彻底退出 app 再重开**(主进程改动不热更,HMR 可能让渲染层残留旧 bundle)。


### 0.46 — 心情改由「最近有没有 output」驱动(弃用饱腹值/额度)(2026-06-04)
- **思路转变**:不再做"饱腹值 = 今日成本 / 每日额度"——额度分母本地拿不到(plan% 无干净来源),且"用满即饱"会卡住 token 计算。改成**心情只看距上次产出多久**:正在吃(几秒内有 output)> 开心(默认 ≤30min)> 闲(30min ~ 2 天)> 难过(≥2 天没 output)。彻底绕开额度问题。
- **数据**:账本新增 `lastOutputTs`(最近一次 output 的时间戳);基线 / 旧账本迁移时读最近会话尾部回填(只取时间、不计 token)。`moodFromActivity(lastOutputMs, now, eating, 阈值)` 纯函数。阈值可经 `TALKY_MOOD_HAPPY_MIN`(分钟)/ `TALKY_MOOD_SAD_HOURS`(小时)调。
- **弃用**:`satietyFor` / `PLAN_DAILY_BUDGET_USD` / `PetPlan` / `parsePetPlan` / `petMood` / `TALKY_PLAN` 全删;`PetUsageSnapshot` 去掉 satiety/plan/dailyBudgetUSD,加 mood/lastOutputTs。**饱腹度额度校准 A/B 悬案随之作废**(不再需要分母)。
- **心情 → 精灵行**:`PetMood` = eating/happy/idle/sad;moodRows = 吃 4 / 开心 7 / 闲 0 / 难过 5(Clawd 无明显喜怒脸,先用最贴的动作,可在 pet-lab 调)。HUD 改显示「心情 + 距上次产出多久」,不再有饱食条。
- 验证:typecheck + 128 单测(喂养测试换成 moodFromActivity + lastOutputTs)+ build 全绿。需重启 app 生效。


### 0.45 — 修桌宠周期性闪烁(空帧根因)(2026-06-04)
- **根因**:spritesheet 很多行**尾部是空帧**,但动画写死 `framesPerRow: 8` 逐行循环 → 播到空帧就闪。逐像素分析(PIL)得各行真实帧数:**idle(行0)=6、waiting/hungry(行3)=4、eating(行4)=5**,talking/working/sleepy=8。idle 是平时最常显示的,fps6 下约每 1.3s 闪 ~0.33s,正是"过一会闪一下"。(注:与 0.41 修的"循环重建闪"是两回事,这次是空帧。)
- **修**:`PetConfig` 加 `framesByRow`(每行真实帧数 `[6,8,8,4,5,8,6,6,6]`);动画按**当前行真实帧数**取模循环,不再播到空帧。纯逻辑 `resolveRow`/`framesForRow` 抽到 `Pet/sprite-logic.ts`(不引图片资源)并加单测(+3,记录真实帧数防回归)。
- 验证:typecheck + 128 单测 + build 全绿。**需重启 app 生效**。


### 0.44 — 产品更名 Tokenmon + 方向收敛到桌宠(语音暂缓)(2026-06-04)
- **更名**:Talky → **Tokenmon**(Token + Monster)。定位 = 消耗 token 喂养 Monster 的本地桌宠。
- **方向收敛**:优先做 **Pet(桌宠 + Claude Code 用量 / 消耗可视化)**;**语音输入暂缓**。此前已建的多 Agent 协作(A/B/D)、语音(ASR/TTS)、画布等功能保留在代码库、仍可用,但非当前重点。
- 本次只换**用户可见品牌字串**:README、窗口 `<title>` 与 `BrowserWindow.title`、PlanDialog 文案、两处 `package.json` 描述、启动日志("Tokenmon brain");并把更名 + 方向记进项目状态(本 CHANGELOG + memory)。
- **内部标识符暂不改**(避免破坏运行契约,留作单独一步):`@talky/*` 包名与根 `name:"talky"`、`TALKY_*` 环境变量、`~/.talky`(本机 whisper 装于此)、`talky.sqlite`(改名会孤立现有数据)、`talky/<task>-integration` 分支前缀、git 远程 `Bitzip-cop/Talky`、工作目录 `~/Talky`、`docs/talky-*.md`。
- 验证:纯文案 / 文档改动,跑 typecheck + test + build 确认未破坏。


### 0.43 — 成本合计去 cache_read + 饱腹度=今日额度消耗比(按 Plan)(2026-06-04)
- **成本合计去掉 cache_read**:`costUSD` 与 `costBreakdown.total` 现在只算 in+out+cacheWrite(对订阅用户 cache_read 是免费重读)。cache_read 仍在明细单列、标"不计"。
- **饱腹度重新定义 = 今日消耗 / 该 Plan 每日额度**(`satietyFor`):用得越多越饱,用满当天额度=饱了不再吃(对上"吃饱不吃饭"),次日 today 归零→又饿。**便宜 Plan 额度小→饱得快**。这把"消耗"做成了用户要的相对陈述性数据。
- 去掉旧的"累积+衰减"喂养模型(`PetFeedingTracker`),换成纯函数 `satietyFor` + `petMood`(吃>饱>饿>睡)+ `EatingTracker`("吃"瞬时动作)。Plan 经 `TALKY_PLAN`(pro/max5/max20,默认 max20)配置;每日额度 `PLAN_DAILY_BUDGET_USD`(pro $4 / max5 $20 / max20 $80,**估算可调**)。
- snapshot 增 `plan` + `dailyBudgetUSD`;HUD:饱食条显示今日额度% + Plan,明细标 cache_read 不计;小窗仍显示产出成本。
- 验证:typecheck + 125 单测(喂养测试改为 satietyFor/petMood/EatingTracker/parsePetPlan)+ build 全绿。需重启 app 生效。
- 待办:每日额度数字是估算(Anthropic 真实限额未公开),需按用户实际 Plan 校准;Plan 后续做成 UI 设置。


### 0.42 — 成本展示诚实化(区分产出/缓存)+ 饱腹度涨太快(2026-06-04)
- 核实成本算法:从真实账本读数 —— 今日 output 19w(≈$14)、**cache_read 2900w(≈$43.6,占 72%)**、合计 ≈$60。**算法没错**(按 opus API 定价含全部四类 token,非重复计数),$58 主要是 cache_read(Opus 每回合重读缓存上下文)撑的;问题在我把"含缓存总成本"摆在"output"旁边 → 误导。
- 修展示:新增 `costBreakdown`(按类型拆 $)。**悬浮小窗只显示产出(output)成本 🍽≈$14**(贴"喂养=吃 output"的直觉);**主界面 HUD 拆开显示 产出 / 缓存 / 合计**,并注明大头是 cache_read、订阅不实扣。
- 修饱腹度涨太快:`PetFeedingTracker` 默认 `perFull` 2万→**15万** output token(单 task 约 3万~8万 → 只喂 20%~50%,不再一把喂饱;多个 task 才喂满)。
- 验证:typecheck + 123 单测(+costBreakdown,用真实量级)+ build 全绿。需重启 app 生效。


### 0.41 — 修桌宠拖拽抽搐 + 时不时闪烁(2026-06-04)
- **拖到右边"从右向左被切"**:0.40 的 `moved` 夹回在 macOS 拖动中会反复触发,与原生拖拽来回打架 → 抽搐。改成 **debounce**:停止移动 220ms 后才夹一次回屏内,拖动过程不再被拽。
- **时不时闪一下**:PetSprite 的动画循环原来随 `state/mood` 每变就 useEffect 重建(pet:usage 每 2s 推、mood 一变就重启)→ 复位闪。改成**常驻循环 + rowRef**(state/mood 只更新 ref、不重建循环),且**仅在帧/行变化时重绘**(不再 60fps 空刷,透明窗更稳)。
- 验证:typecheck + build 全绿(122 单测不受影响)。需重启 app 生效。


### 0.40 — 修桌宠拖到边缘消失(夹回屏内 + 锁尺寸)(2026-06-04)
- 现象:把悬浮宠物拖到屏幕右边就消失。根因:窗口没做边界约束 → 被拖出屏幕外;macOS 新版拖到边缘还会触发"贴边平铺",对透明无边框小窗更乱。
- 修:`createPetOverlay` 监听 `moved`,每次移动后把窗口**夹回当前显示器可视区**(`getDisplayMatching` 支持多屏)、并**锁回固定尺寸**(抵消平铺缩放)。拖到边缘会回弹到屏内,不再消失。
- 验证:typecheck + build 全绿(纯主进程窗口逻辑,无新单测)。需重启 app 生效。


### 0.39 — 桌面悬浮宠物:浮在所有窗口之上(2026-06-04)
- 需求:角色要能直接悬浮在整个桌面上(桌宠)。新增独立 overlay 窗口 `createPetOverlay()`:**透明 / 无边框 / 置顶(screen-saver 级,压全屏)/ 跨所有 Space / 不进 Dock / 不可缩放**,默认贴右下角;整窗 `-webkit-app-region: drag` 可拖动。
- 关键修:`EventSender` 从"只发主窗口"改为**广播所有窗口**——否则悬浮窗收不到 `pet:state`/`pet:usage`(各窗口只订阅自己关心的频道)。
- 渲染层:新增紧凑 `PetOverlay`(透明背景、PetSprite + 极简 HUD:饱食条 + 今日成本),路由 `#pet-overlay`;`main.tsx` 对该路由强制透明背景(覆盖 global.css)。app 启动即开(activate 也重开)。
- 复用 step 2 数据通路:overlay 挂载即 `pet:watch`、卸载 `pet:unwatch`,跟随真实 Claude Code 活动 + 喂养心情。
- 验证:typecheck + 122 单测 + build 全绿。**需重启 app 生效**(主进程新窗口)。
- 待办:透明区域点击穿透(setIgnoreMouseEvents + 鼠标转发,目前窗口小、只挡右下角一小块);托盘开关/记忆位置。


### 0.38 — 心情接到 sprite:消耗喂养驱动角色动作(2026-06-04)
- 按用户在 pet-lab 看完整动画后定的映射:**吃=row4、饱=row0、饿=row3、睡=row5**(PetMood 收敛为 eating/full/hungry/sleepy,去掉 content)。
- "吃"是瞬时动作:`PetFeedingTracker` 有 output 流入(tokens>0)即进入 eating 窗口(默认 3s,可注入),停了过窗口再按饱食度落到 饱/饿/睡;喂 0 只衰减不刷新"吃"。
- PetSprite 接 `mood` prop,行优先级 **吃 > 活动(忙)> 心情(闲)**:working/talking/waiting 播活动行,idle 时按饱食心情播。
- PetPreview 把 `usage.mood` 传给 sprite;表情 emoji 更新(😋吃/😊饱/😣饿/😴睡)。
- eat 窗口改为构造参数便于确定性单测;feeding 测试重写(饱食阈值 + 吃窗口进出 + 空喂只衰减)。
- 验证:typecheck + 122 单测 + build 全绿。


### 0.37 — 角色玩法 + token/消耗呈现:消耗 token = 喂养 pet(2026-06-04)
- 砍掉 PTY 语音输入(Typeless 类工具已覆盖、非壁垒)。差异化聚焦"角色 + 数据玩法"。
- **喂养机制(实时心情层)**:`PetFeedingTracker`(纯逻辑)—— output token = 食物,喂养↑、静默衰减↓,satiety→mood(full/content/hungry/sleepy)。修了 `now===0` 哨兵冲突 bug(测试逮到)。
- **消耗账本(累积层)**:统计两条——**今日** + **历史(自 pet 首次使用起算)**。`shared/pet-usage.ts`(纯:`parseUsage` 读 message.usage 四类 token、`costUSD`+`pricingFor` notional 估算[opus 档,可配]、`applyUsage` 分桶);`main/pet/usage-ledger.ts` 的 `UsageLedger` 增量摄取(扫所有会话、cursor **按字节**推进、**半行不丢**、截断/轮换处理、首次**打基线不回算历史**、持久化到 app_state)+ `PetUsageService`(定时 ingest+feed+emit)。
- IPC:事件 `pet:usage`(今日/历史 token + 成本 + satiety + mood);handlers 在 pet:watch 起、pet:unwatch 停。
- PetPreview 加消耗 HUD:今日/历史 output token + ≈成本估算 + 饱食 bar + 心情 emoji;并标注"≈API 等价(订阅不实扣)"。
- 测试:`pet-usage`(纯逻辑 7 例)+ `pet-usage-ledger`(fs:基线不回算/增量/半行/轮换/持久化,用内存假 KVStore + 临时 root,绕开 better-sqlite3 ABI)。验证 typecheck + 120 单测 + build 全绿。
- 待办:把 mood 接到 sprite 动作(吃/饱/饿/睡,需先在 pet-lab 认 clawd 的 4–8 行);成本可按记录 model 细分(当前默认 opus 档)。

### 0.36 — 修 Codex review 找出的 watcher 隐患(半行/编码/崩溃/泄漏)(2026-06-04)
- **P1 半行 tail**:`readRange` 读到增量后立刻 `offset=size` 再逐行 parse,撞上 Claude 没写完的半行会永久丢。加 `pending` 缓冲:抽出纯函数 `feedChunk(pending, chunk)`,只解析 `\n` 结尾的完整行、半行留到下次补齐。
- **P1 slug 编码**:`replace(/[^a-zA-Z0-9]+/g)` 折叠了连续分隔符,与真实目录的 `--` 双横线不符(如 `Application-Support--talky`)→ 改 `/[^a-zA-Z0-9]/g`(每个非字母数字各一个 `-`)。且 **cwd 定位失败不再静默退全局**(`findNewestSession(cwd)` 找不到返回 null,免得宠物跟错项目);全局只在 cwd 为 null 时走。
- **P2 fs 崩溃**:`openSync`/`statSync` 移进安全包裹(`safeSize`/`safeStatMs`/readRange 全 try),逐文件失败跳过不中断整轮;`poll()` 外包 `tick()` try/catch,坏的一轮绝不崩 Electron main。
- **P2 没 unwatch**:加 `pet:unwatch` IPC + handler(stop + 清引用);PetPreview 卸载时 `pet:unwatch`,不再常驻轮询。
- 补测(覆盖 Codex 点名的高风险路径):`slug` 双横线、`lineToKind`、`feedChunk` 半行拆块、`findNewestSession`(命中/缺失返回 null 不退全局/全局)、`PetSessionWatcher` 集成(附末尾不回放 + 半行不丢 + 静默衰减 + 文件轮换)——可注入 `root`/`now` 做确定性测试。
- 验证:typecheck + 107 单测(+8)+ build 全绿。

### 0.35 — 角色 step 2:会话活动驱动角色(JSONL watcher → PetState)(2026-06-04)
- 角色玩法接通:Claude Code 在干嘛 → 角色就跟着动。数据源走 **tail 会话 JSONL**(不刮 iTerm2)。
- `shared/types/pet.ts`(PetState 共享)+ `shared/pet-activity.ts`(`PetActivityTracker` 纯逻辑:tool/prompt/result→working、text→talking、静默 4s→idle,now 注入可单测)。
- `main/pet/session-watch.ts`(`PetSessionWatcher`):按 cwd 的 slug 目录(非字母数字→`-`,已核实)定位最新会话 jsonl、轮询 700ms 读增量、解析 user/assistant 记录的 content 块映射成活动、喂 tracker、状态变化才 emit;切到新会话时附在末尾(不回放历史)。
- IPC:`pet:watch{cwd?}`(cwd 省略=全局最新会话)+ 事件 `pet:state{state}`;handlers 加 `sender` 依赖(app.ts 接线)。
- `PetPreview` 默认接真实数据:挂载即 `pet:watch`、订阅 `pet:state` 驱动 PetSprite;手动按钮保留作临时覆盖;状态栏显示"🟢 跟随真实会话活动"。
- 验证:typecheck + 99 单测(新增 tracker 4 例)+ build 全绿。
- 注:`waiting` 态暂不从 JSONL 判定(等权限是实时 TUI 态,JSONL 难直接看出)→ 先留手动;后续要么从 permission-mode 元数据/静默启发,要么等 PTY 阶段补。

### 0.34 — 角色 step 1 完成:PetSprite 组件(吃 codex-pets 格式)(2026-06-04)
- 在 pet-lab 里对齐 clawd 网格:**8 列 × 9 行、帧 192×208**(正好填满 1536×1872 整表,即 codex-pets 标准规格);状态行 idle=0 / talking=1 / working=2 / waiting=3、每行 8 帧、6fps。
- 固化成正式组件(独立件、无 Talky 依赖,只看 `state` prop):`components/Pet/` —— `pets.ts`(PetConfig + CLAWD 配置)、`PetSprite.tsx`(canvas 精灵动画,内部分辨率=单帧、CSS 放大像素保真、按 state 播对应行、rAF 控帧)、`PetPreview.tsx` + `Pet.css`(切态预览)。
- 素材进 renderer:`assets/pets/clawd/spritesheet.webp`(vite import,构建产物已含)。`main.tsx` 加 `#pet` 开发预览(URL 带 #pet 只渲染角色组件、不启动整 app)。
- 验证:typecheck + 95 单测 + build 全绿;webp 正确打进产物。
- 下一步 step 2:JSON L watcher(tail `~/.claude/projects/<cwd>/*.jsonl`)→ 把 agent 活动(tool_use/assistant/result)映射成 PetState 驱动角色 = "角色玩法"。

### 0.33 — 角色 step 1:pet-lab + clawd 占位 + codex-pets 格式调参(2026-06-04)
- 产品重排优先级(对话决策):① 先把"角色/形象"拆出来单独做 → ② 抓 Claude Code 数据喂角色 → ③ 角色玩法 → ④ PTY 语音放最后。MVP 核心收敛到**只有"语音输入 + agent 形象"**;权限/选择/计划都由用户在真 CLI 里照常处理(Talky 不碰=信任风险归零)。
- 数据来源验证:角色喂数据走 **tail Claude Code 会话 JSONL**(`~/.claude/projects/<cwd>/*.jsonl`,实时写、结构化、终端无关、已有解析器),优于刮 iTerm2 屏幕。
- 角色格式:用 **codex-pets**(`npx codex-pets add clawd` → `~/.codex/pets/clawd`,**MIT** 开源)。一只 pet = `pet.json` + `spritesheet.webp`(clawd 表 1536×1872,推测 8 列×8 行、帧 192×234,行=动画状态)。
- 新增 `apps/desktop/pet-lab/`:自包含 HTML 调参工具(整表+网格叠加 / 当前状态动画 / 状态→行号映射),把 clawd 占位表 load 进来可视化对齐网格与状态行(用户在浏览器里调,定稿 config 再固化成组件)。含 `ATTRIBUTION.md`(MIT 出处 + 上线前逐只核实社区素材的提醒)。
- 注:这是新方向独立件,未接入 app;旧编排仍在、不挡路。

### 0.32 — 新方向 Phase 0:Claude Agent SDK 打通(订阅鉴权 + canUseTool fail-closed)(2026-06-03)
- 产品转向:砍掉中间人(协调大脑/多 Agent 编排/任务进展/知识),Talky 收敛为**直接对 Claude Code 说话的语音前端**;差异化走**跨 Agent、有性格的语音驾驶舱**(角色化:声音/形象/语气,只改"怎么说"不碰"做什么"和安全闸门)。详见对话决策。
- 选型核实:用 **Claude Agent SDK**(`@anthropic-ai/claude-agent-sdk`),不用 headless `claude -p`(后者接不住"选择"、会 fail-open——正是之前那个"没选项却自走"的根因)。SDK 是同一个 Claude Code 引擎(打包原生二进制),`canUseTool` 回调**阻塞且 fail-closed**,统一接 权限 / AskUserQuestion(选择)/ ExitPlanMode(计划)。
- Phase 0 spike(`scripts/sdk-spike.mjs`)真机验证三项全过:① 订阅鉴权(`apiKeySource=none`,走登录不走 API key);② `canUseTool` 拦在工具执行前(tool_use 与回调各 1 次,未被规则绕过);③ fail-closed(返回 deny → 工具不跑、不泄漏真 UUID,模型如实反馈并反问授权)。
- 设计要点:② 成立的前提是 `settingSources: []`(不加载 allow 规则);Talky 必须**让语音闸门权威**,谨慎控制加载哪些 settings(Phase 2 处理)。
- 计费提醒:6/15 起 SDK/`claude -p` 走独立"Agent SDK 月度额度",非交互大额度;先按**个人工具/MVP**(自己机器、自带登录)推进,不做托管/绕计费(ToS 灰区)。
- 下一步 Phase 1:语音回路直连(ASR→SDK→TTS,单角色,resume 会话)。

### 0.31 — 画布持久化挪到主进程 DB(不再因端口/水合丢画布)(2026-06-03)
- 现象:画布"全空了"。排查到底:数据**没丢**——`localStorage`(`localhost:5173`,key `talky-canvas-v1`)里完整存着 8 个节点(Claude/Codex + 6 个项目文件夹);端口对、`fitView` 也在,但刷新仍空 → 说明渲染层 **zustand persist 的回灌运行时偶发失效**(看不见的内部态),且 localStorage 还**按 host:端口隔离**(dev 端口一变就读到空存储)。两个脆弱点叠加。
- 根治:画布布局改存**主进程 DB**(新增 `app_state` 键值表,schema v4)。App 启动经 `canvas:load` **主动把布局灌进 store**(`setLayout`,绕开 persist 那条不可靠路径),变更经 `canvas:save` **防抖 400ms 写回**;`hydrated` 闸门确保加载完成前不会用空态覆盖已存布局。**端口/origin/水合时机都不再影响**。
- 平滑迁移:DB 为空时一次性从旧 `localStorage` 读出布局(直接 `getItem`,不走出问题的 persist)→ 灌入 + 存进 DB。用户那 8 个节点会自动迁移过来,一个不少。
- 改动:`shared/constants` SCHEMA_VERSION 3→4;`db/schema` 加 `app_state` 表;新增 `AppStateRepository`;IPC `canvas:load`/`canvas:save`(contract+events+handlers+app 接线);`canvas-store` 去掉 persist 中间件、加 `setLayout`/`markHydrated`/`hydrated`;App.tsx 启动加载+迁移+防抖存回。
- 数据已离线备份到 `~/talky-canvas-backups/`(canvas-current/richest.json)。验证:typecheck + 95 单测 + build 全绿。**需退掉所有 Talky 实例、只起一个(绑 5173)** 让迁移读到那份 localStorage。

### 0.30 — 修复严重回归:普通任务一完成就崩主进程(updateTask 漏列映射)(2026-06-03)
- 现象:任务跑完弹「A JavaScript error occurred in the main process」+ `SqliteError: no such column: undefined`(`Orchestrator.onRunnerEvent → TaskRepository.updateTask`),主进程崩 → **结论口播也不再发生**。
- 根因:**0.24** 加的"普通任务完成回填 `external_ref`"在 `onRunnerEvent` 里调 `updateTask({ externalRef })`,但 `updateTask` 的列映射 **漏登记 `externalRef`** → 拼出 `SET undefined = @externalRef`。`TaskPatch` 类型也没声明 `externalRef`(orchestrator 用内联类型,结构化可赋值绕过了 TS 检查),orchestrator 测试又用假 repo → **typecheck/单测全没接住,静默坑了从 0.24 到 0.29 的每个普通 Claude 单任务**(完成必回填 externalRef 必触发)。
- 修:① `TaskPatch` 补 `externalRef`;② 把 SET 拼装抽成纯函数 `buildTaskUpdate`(列映射集中、**未知字段一律跳过**——绝不再拼出 undefined 列崩库),`updateTask` 改调它;③ 新增 `task-repository.test.ts`(纯函数,绕开 better-sqlite3 的 Electron/Node ABI 冲突)锁定回归 + "所有 TaskPatch 字段都已登记"防再漏。
- 验证:typecheck + 95 单测(新增 5 例)+ build 全绿。**需重启 app 加载主进程修复。** 旧库里 `38c37e3a` 卡在 running(正是当年完成时被这 bug 崩掉、没标 done),待用户授权后可重置为终态。

### 0.29 — 过程式对话:她边做边汇报进度(里程碑旁白)(2026-06-03)
- 需求:把对话范式从「沉默干活 → 末尾报一次结论」反转成**语音输入 prompt 后,她就边做边像伙伴一样实时汇报进度**。定调(经确认):**本地规则旁白(即时,不调模型)+ 里程碑粒度(每类阶段只朗读一次)**。
- 新增 `shared/narrator.ts`:`projectNarration(events)` 把结构化 CliEvent **投影**成过程式旁白行(开场 / 看代码 / 改文件 / 跑测试·构建·检查 / 出错 / 待授权)。纯函数 → 实时累加与重启回放**重建一致**,无需单独持久化;每类阶段首次进入才 `speak=true`(里程碑),后续同类动作只在对话区滚动文字,避免话痨。
- TTS 由「打断式」改为**顺序播报队列**(`tts.ts`):多句进度逐句播完再播下一句,听感像她一句句说;`epoch` 打断机制(stopSpeak 后在飞的播放失败不再误兜底念出来),队列上限防积压滞后;三个引擎(edge/cloud/say)改为 resolve 于播放真正结束。
- 接线:App.tsx 对实时事件投影旁白、朗读新里程碑(回放/静音不重念、不补念积压);Conversation 把旁白渲染成对话流(里程碑高亮、细节弱化),结论仍由高亮块单独呈现不重复。
- 同批:补强**工具输入流式增量**(`content_block_start`/`input_json_delta`)——写大文件时无 `text_delta`,改抓 `partial_json` → 显示"🔧 正在构造调用",补上这段空窗的可见性。
- 验证:typecheck + 90 单测(新增 narrator 6 例 + 解析器工具输入用例)+ build 全绿。

### 0.28 — 长回合"思考阶段"也可见(不只正文增量)(2026-06-03)
- 复查"重启后还是卡住":claude 进程**活着、etime 5.5min 但 CPU 仅 4s** → 仍非死锁,是**纯粹的超长模型回合**(上一个同样的"继续搞这个项目"其实 `closed code=0` 跑完了,花了 ~12.6 分钟)。git 干净、无权限等待。0.27 的心跳能证明它活着,但**长回合前半段全在「扩展思考」**——增量是 `thinking_delta`(文本在 `delta.thinking`),0.27 只抓了 `text_delta`,于是心跳在跳却一个字没有,看着仍像卡。
- 修:StreamJsonParser 增解析 `content_block_delta/thinking_delta` → 单独缓冲累积成 `partial{thinking:true}`(与正文 `text_delta` 分流,`message_stop`/assistant 到达双清空);`PartialTextEvent` 加 `thinking?` 标记;cli-store `partialByTask` 改存 `{text,thinking}`;Conversation 在思考阶段显示**「正在思考 · 已 Xs…」+ 🤔 思考预览(尾部滚动,斜体淡化,不刷屏)**,正文阶段照旧显示流式正文。
- 真机核对:`claude --include-partial-messages` 确实产出 `thinking_delta`(+`signature_delta`),文本在 `delta.thinking`。
- 验证:typecheck + 82 单测(新增 thinking_delta 解析用例)+ build 全绿。

### 0.27 — 长回合不再"看着卡住":流式增量 + 心跳(2026-06-03)
- 排查"新任务卡住":claude 进程**活着、CPU 极低** → 不是死锁/不是等权限,是**长模型回合期间零增量**(没开 `--include-partial-messages`)→ UI 看着冻住,实则在思考/读项目。
- 修:Claude runner 加 `--include-partial-messages`;StreamJsonParser 解析 `stream_event` 的 `content_block_delta/text_delta` → 累积成**瞬时 `partial` 事件**(不入库、不产生步骤,完整 assistant 消息到达即清空);taskRunner 对 partial 只透传不持久化;cli-store 存 `partialByTask`;Conversation 显示**流式"正在输入"预览** + **「已运行 Xs」心跳**(每秒跳动)。
- 验证:typecheck + 81 单测(新增 partial 解析用例)+ build 全绿;真机核对 claude stream-json 实际就是 `stream_event→content_block_delta→text_delta`(8 段增量),格式与解析一致。

### 0.26 — 对话历史回放(数据本就持久化,补上"读回来")(2026-06-03)
- 排查"聊天记录没了":**数据没丢**——DB 里有 852 条 `cli_events`、18 个 `cli_sessions`,事件一直在持久化。真正缺的是**渲染层从不从 DB 回放**(对话视图只显示当前启动后内存里的实时事件)→ 重启/重选任务后对话看起来空了。
- 补上回放:`CliRepository.listEventsByTask` + IPC `cli:events`;cli-store 加 `setEvents`;**选中任务 / 启动时**从 DB 把该任务全部事件读回来填进对话视图。现在任何历史任务(含重启后)都能看到完整 turn-by-turn 对话。
- 导入任务无 cli_events(对话在 result_summary),回放为空时 Conversation 仍用 resultSummary 兜底(详情即完整转录)。
- 验证:typecheck + 80 单测 + build 全绿;真实 DB 核对:`d78221a5` 的 70 条事件(8 assistant_text + result + 30 tool 对)均为完整 CliEvent JSON,可回放渲染。

### 0.25 — 「继续」默认先只读回顾,你说"去做"才动手(2026-06-03)
- 把 0.24 的"必须先输入指令"升级为更贴预期的行为:**续接休眠/已完成/导入的任务时,第一次默认【只读回顾】**——Agent 只用一两句话说"上次到哪了 + 建议下一步",`readOnly` 强制不改文件;**你再点一次「继续」/说"去做"才真正读写动手**。解决"点继续却被 agent 自顾自开干、不知道写了啥"。
- orchestrator `resumeTask`:休眠任务首次续接注入 `RECAP_PROMPT` + `readOnly`;`continued` 集合记录已回顾过的任务,之后续接转读写。暂停中的活动任务仍直接续(它本在干活)。
- VoiceDock「继续」放开(裸点也安全=只读回顾);tooltip 说明两段式。
- 验证:typecheck + 80 单测 + build 全绿;live 真跑:续接导入会话→`mode: recap(read-only)`→只读回顾返回(10s)。

### 0.24 — 续接补全到所有任务 + TTS 去 markdown + 「继续」防误触(2026-06-03)
- **续接补全到所有任务**(不只导入的):runner 接口加 `resumableRef(sessionId)`(Claude=session-id、Codex=thread-id、Mock=sessionId 都实现);orchestrator 在普通任务完成时把可续接的原生 id 存进 `external_ref` → 任何已完成任务(含重启后)都能选中+输入+「继续」接着干。(这套改动是上一轮"续接"被本人在 Talky 里续接本开发会话时顺手写出来的,已逐条 review + 验证。)
- **修复 TTS 念 markdown**:`shared/conclusion.ts` 加 `stripMarkdown`,口播层去掉 `**`/`##`/`` ` ``/列表等(否则 TTS 念出"星号星号""井号井号");`clampSpeech` 也去 markdown 兜底。详情层保留 markdown 供屏幕渲染。
- **「继续」防误触**:已完成/导入的任务,必须先在输入框说明"接着做什么"才能点「继续」(避免裸「继续」让 agent 自顾自开干);tooltip 讲清「继续=让该任务的 Agent 接着跑、可能读写文件、危险操作仍弹权限」。暂停中的任务仍可直接续。
- 验证:typecheck + 80 单测(新增口播去 markdown 用例 + 完成任务带 externalRef 断言)+ build 全绿。

### 0.23 — Talky 大脑换 DeepSeek V4 Pro(推理模型)(2026-06-03)
- 协调者大脑默认模型 `deepseek-chat` → **`deepseek-v4-pro`**(更强,推理模型)。
- v4-pro 是推理模型(`reasoning_content` 先吃 token),默认 `max_tokens` 调到 **8000**(`TALKY_BRAIN_MAX_TOKENS` 可覆盖)、请求超时放宽到 150s,避免推理没结束就被截断、content 为空。
- 验证:typecheck + 79 单测 + build 全绿;**live A 真跑**:v4-pro 综合出完整、中立、带署名的口播结论(594 字符 content,34s)。

### 0.22 — 续接历史会话:接着上次的完整上下文继续干(2026-06-03)
- 导入的历史会话现在能**续接**:选中它、在底部输入一句、点「继续」→ Talky 用存好的 `external_ref` 起 `claude --resume <id>` / `codex exec resume <thread>`,**接着该会话磁盘上的完整上下文**往下做(agent 自己记得整段对话)。
- runner 加 `resumeRef`:Claude 用 `--resume`(session id 即原生 id)、Codex 用 `exec resume`(thread id);orchestrator `resumeTask` 对无活动会话但有 `external_ref` 的任务用它续接。状态机允许 `done → running`(重开已完成/导入会话继续)。
- VoiceDock「继续」带上输入框文字(对当前选中任务再说一句即可续)。
- 验证:typecheck + 79 单测(状态机 done→running 用例更新)+ build 全绿;**live 真跑通过**:导入 `~/Talky` 的历史会话 → 续接 → Claude 接上下文用一句话回忆了上次内容(3.6s)。
- 注:续接遇高风险操作仍走权限弹窗(测试里无 UI 故自动拒绝)。普通已完成任务重启后续接(非导入)待 thread-id 持久化后补。

### 0.21 — 迁移历史会话:拖项目进来即带入过去的 Claude/Codex 对话(2026-06-03)
- **拖项目文件夹进画布(打开工作区)时,自动把该项目下 Talky 之前的历史会话迁进来**——你在终端直接跑的 `claude` / `codex` 对话不丢、能接着用。
- 新增 `sessions/importer.ts`:扫描 `~/.claude/projects/*/*.jsonl`(session-id 即可 `--resume`)与 `~/.codex/sessions/**/*.jsonl`(thread-id),按 cwd 匹配该项目 → 去重(external_ref)→ 导入成任务(标题=首条 prompt、完整对话转录走「口播+详情」双层渲染、归到该工作区、保留原始时间)。
- **过滤**:跳过 Talky 自己内部跑的会话(tmp/worktree cwd + 总结/分解/提议/综合/顾问等 prompt 特征),只迁你真正的工作。
- DB schema v3:tasks 加 `external_ref`(原生会话 id,供后续续接);`createTask` 支持 `createdAt` 覆盖(保留历史时间排序)。任务列表加「📥 导入」徽标;Conversation 用 `task.resultSummary` 兜底(导入会话无实时事件)。
- 触发点:`workspace:open` / `workspace:pick`(同步导入,随后的 task:list 即可见)。
- 验证:typecheck + 78 单测 + build 全绿;**真机验证**:从 `~/Talky` 导入 4 个真实历史会话(过滤掉 3 个 Talky 内部的),去重生效;schema v2→v3 迁移在真实 dev 库通过,import-on-open 端到端跑通。
- **下一步(已留好钩子)**:续接历史会话——用存好的 `external_ref` 走 `claude --resume` / `codex exec resume` 接着上次完整上下文继续干。

### 0.20 — Talky 协调者大脑 + 失真防护(2026-06-03)
- **Talky 有了自己的大脑**:新增 `agent/coordinator.ts`(独立 LLM,与执行器解耦,代理感知;默认 DeepSeek,可配 `TALKY_BRAIN_*`)。综合、分解等"编排级动脑"归 Talky,执行器(Claude/Codex)只当选手。
- **综合改由中立大脑做**(A):提议全部完成 → Talky 大脑直接综合(不再让某个执行器当裁判),**带署名归纳**(标注每个观点出自谁,不抹平来源);没配大脑则回退执行器综合。
- **防护①(原话直传)**:单 Agent 任务的 prompt 仍是用户原话(planner 不改写),不经大脑转述。
- **防护②(综合可溯源)**:综合带署名 + 各 Agent 原始提议卡片常驻 + 结论可展开详情。
- **防护③(执行前确认)**:D 分解后**先把分工方案抛给用户确认**(新 `task:plan-proposed` / `task:plan-decide` + PlanDialog),确认才起 worktree 执行;ASR 听写结果**只填输入框给用户过目**,不再自动发送。
- 分解优先用大脑(DeepSeek),回退 claude headless / mock。
- 验证:typecheck + 78 单测(D 单测加确认步骤)+ build 全绿;**live 真跑通过**:A 由 DeepSeek 综合出中立带署名口播结论;D 由 DeepSeek 分解 → 方案确认 → Claude+Codex 并行 → 合并整合分支(12s);GUI 启动 `coordinator available:true`。

### 0.19 — 画布布局持久化 + 恢复后可用(2026-06-03)
- 画布节点/边/位置(Agent 节点、拖入的文件夹节点)用 zustand `persist` 存 localStorage(`talky-canvas-v1`),重启恢复;选中/拖拽等瞬时态不持久化;`merge` 兜底确保至少有 Claude 节点。
- 恢复出来的文件夹节点可用:`FolderNode` 激活改用 `workspace:open`(取规范 workspace +(重)启文件监听);点已激活文件夹仍是无操作(不清进行中视图)。
- 启动时为**上次使用的工作区**起监听(`setupServices` 只监听默认工作区;App 启动补 `workspace:open(current)`),并在 localStorage 被清时为非默认当前工作区兜底补一个文件夹节点。
- 协作**结果**本就持久化(DB:tasks 的 kind/parent/role/result_summary),重启后 task:list 拉回、CollaborationView 渲染历史协作。
- 验证:typecheck + 78 单测 + build 全绿;真机启动日志干净(asr/tts 均探测可用,无报错)。

### 0.18 — edge-tts 默认引擎:自然中文语音,零账号零 key(2026-06-03)
- 背景:硅基流动网站被本机代理挡、火山语音需企业认证、本地开源好模型(CosyVoice/Fish/Melo)依赖 torch 而本机 py3.14 装不了。折中:**edge-tts**(开源 MIT 客户端 + 微软 Edge 免费神经语音),**无需 key/账号/企业认证**,中文自然(小晓/云希等),直连可用(实测 0.2s)。
- TTS 引擎新增 `edge` 并设为**默认**(优先级:显式 > cloud(配了 key)> edge(已装)> say 本地兜底):`python3 -m edge_tts` 合成 mp3 → afplay;自动探测带 `edge_tts` 的 python(含框架绝对路径,保证 GUI 下可用);失败回退 say。`TALKY_EDGE_VOICE` 换音色(默认 zh-CN-XiaoxiaoNeural)。
- 安装:`python3 -m pip install --user edge-tts`(纯 python,py3.14 可装;本机已装并真机验证播放)。
- 取舍:edge 走微软云(非本地优先),但免费/零门槛/自然;`say` 仍是离线兜底。真正本地开源中文 TTS 待有合适 py 环境(torch)再接。
- 验证:typecheck + 78 单测 + build 全绿;框架 python + edge_tts 端到端合成播放通过。

### 0.17 — TTS 可插拔:支持云端表达力语音(更像人/有感情)(2026-06-03)
- `say` 是拼接式合成、音色生硬,给不了豆包/ChatGPT 那种有感情的对话音。TTS 改为**可插拔**:
  - `say`(默认、离线):零依赖兜底。
  - `cloud`(更像人):OpenAI 兼容 `/v1/audio/speech`,覆盖 **OpenAI tts / 硅基流动 CosyVoice2 / fish-audio** 等表达力强的中文模型 → 取音频 → `afplay` 播放;**代理感知**(openai 走代理,国内端点直连);云端失败自动回退 `say`。
  - 配置:`TALKY_TTS_ENGINE`、`TALKY_TTS_BASE_URL/KEY/MODEL/VOICE/FORMAT`(给了 key+base 默认走 cloud)。
- 排查发现本机 `ARK_API_KEY`(火山方舟)只含豆包 LLM、无 `/audio/speech`(404);豆包 TTS 是另一套语音凭证。故云端表达力 TTS 需用户提供 TTS 凭证(硅基流动/OpenAI/火山语音)。
- 验证:typecheck + 78 单测 + build 全绿(云端路径待用户配 key 后真听)。

### 0.16 — 本地 whisper:完全离线语音闭环(2026-06-03)
- **接入本地 whisper.cpp,ASR 完全离线**,不再依赖云端/真实 OpenAI key。语音闭环(说话→转写→下任务→听结论)全部本地(Agent 本身的工作除外)。
- **无 ffmpeg 的格式转换**:录音在渲染层用 Web Audio(`decodeAudioData` + `OfflineAudioContext`)解码 → 重采样 16kHz 单声道 → 自编码 WAV;whisper.cpp 直接吃。
- `asr.ts` 加 `local` 引擎(优先级 local > openai > off):自动发现 `~/.talky/whisper/` 下的 `whisper-cli` 与 `ggml-*.bin`(选体积最大=最准的),`-nt -np --prompt` nudge 简体;`TALKY_WHISPER_BIN/MODEL/DIR/PROMPT` 可覆盖。
- 一键安装脚本 `scripts/setup-whisper.sh [model]`:pip 装 cmake(无需 brew)→ 编译 whisper-cli → 下模型 → 装到 `~/.talky/whisper`。本机已装 base 模型并验证。
- 验证:本机真跑通 —— `say` 合成中文 → 渲染层同款 16k WAV → 本地 whisper 离线转写出简体中文(base 模型,1.3s;小错难免,换 small/medium 更准)。typecheck + 78 单测 + build 全绿;`asr.live` 经 local 引擎通过。
- 说明:base 模型中文一般,建议 `bash scripts/setup-whisper.sh small`(丢进去自动升级)。

### 0.15 — M3 语音:听结论(TTS)打通 + 说话下任务(PTT/ASR)plumbing(2026-06-03)
- **听结论(TTS)= 已打通、全本地**:`main/voice/tts.ts` 用 macOS `say`(离线、有中文声音)。顶层任务完成 → App 自动朗读「口播结论」层(`splitConclusion().spoken`);子任务/中间产物不念;VoiceDock「🔊 念结论 / 🔇 静音」开关;`clampSpeech` 按 TTS_MAX_CHARS 截断(单测)。
- **说话下任务(PTT 录音)= 已打通**:VoiceDock 🎙️ 按住录音(`use-audio-recorder`:getUserMedia + MediaRecorder),松开 → `voice:transcribe` → 转写文本自动按当前选中 Agent/模式下任务;主进程授予麦克风权限(`setPermissionRequestHandler`)。
- **ASR(转写)= 代码就绪,但本机无可用引擎(诚实标注)**:`main/voice/asr.ts` 可插拔、**走本地代理**(GFW 后:Node fetch 不认 HTTP_PROXY → 自写 HTTP CONNECT 隧道 + https.request + 手搓 multipart,零依赖)。但本机 `OPENAI_API_KEY` 实为 DeepSeek(`OPENAI_BASE_URL=api.deepseek.com`),DeepSeek **无音频转写** → 自动判定 ASR 不可用,PTT 置灰并给可操作提示。启用方式:`TALKY_ASR_BASE_URL=<whisper端点> + TALKY_ASR_KEY=<真实key>`,或装本地 whisper。
- 新增 IPC:`voice:transcribe` / `voice:speak` / `voice:stop-speak` / `voice:capabilities`。
- 验证:typecheck + 78 单测(新增 `tts.test.ts`)+ build 全绿;TTS 真机播报通过;ASR 代理隧道连通(到 OpenAI 拿到响应),但 DeepSeek key 无音频权限(401,符合预期)→ 默认 off。
- **闭环状态**:听结论 ✅ 打通;说话下任务 ⏳ 录音+下任务链路就绪,**只差一个能转写音频的引擎**(配真实 whisper key 或本地 whisper 即通)。

### 0.14 — 双层结论推全局(所有用户可见结论)(2026-06-03)
- 把「口播 + 详情」双层从 A 综合扩展到**所有用户可见的终态结论**:单 Agent 任务、B 主驾驶、D 整合概要。
- 实现:`shared/conclusion.ts` 加 `CONCLUSION_FORMAT_PROMPT` 常量;`AgentTaskInput.conclusionFormat`;Claude runner 把它并入系统提示、Codex runner 追加到 prompt;orchestrator 在单任务路径与 B driver 置 `conclusionFormat:true`;D `integrate()` 自带口播层。**只对终态结论生效**(A 提议者、D worker 等中间产物不加,不干扰卡片)。
- 验证:typecheck + 75 单测 + build 全绿;live B 重跑通过,真实单驾驶任务的终态结论也带可朗读口播层。

### 0.13 — 双层结论(语音友好):口播层 + 折叠详情(2026-06-03)
- 问题:综合结论太长、难读,且语音产品无法朗读一屏 markdown。
- 设计:结论分两层 —— **口播层**(1-2 句、可直接朗读、纯文本,= 将来 TTS 要念的)+ **详情层**(完整展开,默认折叠)。口播层不靠事后截断,而是让 Agent **产出时就分层**。
- 综合阶段(A)prompt 改为按 `【口播结论】`/`【详情】` 两段输出(口播约 60-100 字、禁列表/表格/markdown)。
- 新增 `shared/conclusion.ts`(`splitConclusion`,渲染层与将来主进程 TTS 共用);CollaborationView 与 Conversation 结论改为「口播大字 + 展开详情」;mock 综合脚本同步双层格式。
- 验证:typecheck + 75 单测(新增 `conclusion.test.ts`)+ build 全绿;live A 重跑通过,真实综合输出口播层为单段可朗读文本(~130 字)、详情完整。

### 0.12 — 修复:有结果却显示失败 / Codex 节点显示未接入(2026-06-03)
- **有内容却"失败"(根因)**:read-only 提议者触发被拒 → `autoSkipDenial` 续跑;旧进程的 `exit` 在续跑把 `sawResult` 置回 false **之后**才触发,误发"异常退出"把任务打成 failed(终态,后到的成功结果无法挽回)。改用 `close`(stdout flush 完)替代 `exit`,并加 **active-child 守卫**(`state.child !== child` 则忽略旧进程收尾);Claude 与 Codex runner 同修。顺带修掉 result 最后一行还在缓冲就误判退出的 flush race。
- **画布 Codex 显示"未接入"**:`AgentNode` 把可用性写死成 `isClaude`,非 Claude 一律"未接入(预留)"。改为按 `meta.available`:已接入(Codex)显示「已接入」🤖,仅未接入(Hermes 预留)提示。
- 验证:typecheck + 71 单测 + build 全绿;A/B/D 三个 live 测试重跑全过(含会触发 autoSkip 的只读提议路径)。

### 0.11 — 体验修复(输入法 / 对话降噪 / 权限归属 / 协作进度)(2026-06-03)
- **输入法回车**:组字过程中按回车 = 候选字上屏,不再误发 prompt(`isComposing` / keyCode 229 守卫)。
- **对话降噪(核心)**:中间 assistant_text 折叠进「工作过程」(默认收起),运行中只给一个活体状态「● 正在工作…+最新一句」;**结论只在任务真正终止时高亮一次**,且与过程末句去重(不再重复)。
- **被拒 ≠ 结束**:带 `permission_denials` 的 result 不再当结论;待授权时对话显示「⏸ 需要你授权才能继续 — 见弹窗」,用户不会误以为已结束。
- **权限归属**:授权弹窗显示「🤖 哪个 Agent 在执行「哪个任务」时请求」(多 Agent / D 的 worker 下尤其关键)。
- **协作进度**:CollaborationView 的各 Agent 卡片显示**实时活动**(最新一句)与「⏸ 待授权」,看得到谁在说话、进度到哪。
- **画布 bug**:点击已激活的文件夹节点不再清空进行中任务的视图(完整画布持久化后续做)。

### 0.10 — 多 Agent 协作 D:分工 + worktree 隔离 + 整合分支(2026-06-03)
- spike `git worktree`(2.50.1)add/remove 通过;整合模型采用**整合分支 + 待审查**(不碰用户工作树)。
- D 流程:① 分解器(Claude headless 出 JSON,mock 走确定性)把需求拆成互不重叠子任务;② 每个子任务在**独立 git worktree**(基于 HEAD 的新分支)由指定 Agent 并行实现;③ 各自提交 → 合并到整合分支 `talky/<task>-integration`(冲突则中止该分支并标注),产出总 diff 概要;④ 清理 worktree(分支保留供审查)。
- 新增 `files/git.ts`(worktree/commit/merge/diffstat 封装);orchestrator `mode:'decompose'` → `createDecomposeTask`/`onWorkerResult`/`integrate`;非 git 仓库**优雅退化**为单 Agent。CollabRole 加 `worker`。
- UI:VoiceDock 第三个模式「🧩 分工并行」;CollaborationView 复用渲染 D(各 worker 卡 + 整合结果);取消父任务会清理 worktree。
- 验证:typecheck + 71 单测(新增 D 结构测试:真实 git 仓库 + worktree/分支生命周期)+ build 全绿;**live 真跑通过**(真实 Claude+Codex 在各自 worktree 并行各建一个文件 → 干净合并到整合分支,工作树未动,29s)。
- **协作 A/B/D 全部落地并 live 验证。** 后续:协作/画布布局持久化;合并冲突的可视化与 agent 辅助解决;M3 语音。

### 0.9 — 多 Agent 协作 B:主驾驶 + 顾问(2026-06-03)
- spike `codex mcp-server`(stdio MCP),tools/list 确认暴露 `codex` / `codex-reply`;Claude 支持 `--mcp-config` 注入 + `--strict-mcp-config` + `--allowedTools` 放行 MCP 工具。
- B 模型:**单驾驶任务**(复用普通单任务路径,无父子结构),Talky 给主驾驶 Claude 注入 Codex 顾问 MCP server(`codex mcp-server -c sandbox_mode="read-only"`,只读顾问),Claude 在难点处调用 `mcp__consult__codex` 征询第二意见再自行决定。
- `ClaudeCodeRunner` 加 `consult` 注入:写临时 MCP 配置 → `--mcp-config` + 放行顾问工具 + 系统提示引导(主驾驶身份 + 何时咨询);跨 resume 复用配置、取消时清理。
- orchestrator `mode:'consult'` → `createConsultTask`(主驾驶优先 Claude,顾问=另一被选 Agent);task-runner 把 `mcp__consult__*` 工具调用渲染成「🧠 向 Codex 咨询」步骤。
- UI:VoiceDock「🤝 主驾驶+顾问」按钮接真功能(Claude ▸ Codex);mock 加 B 脚本(咨询→落地)。
- 验证:typecheck + 70 单测(新增 B 流程测试)+ build 全绿;**live 真跑通过**(真实 Claude 注入 Codex MCP,调用 `mcp__consult__codex` 拿到 Codex 回答并转述,19.6s)。
- **仍待**:D(分工+worktree 隔离);协作布局/选择持久化。

### 0.8 — 多 Agent 协作 A:并行提议 → 综合(2026-06-03)
- 协作模型:1 个**协作父任务**(`kind:'collab'`)+ N 个 `proposer` 子任务**并行只读提议** + 1 个 `synthesizer` 子任务**综合结论**;父任务聚合结论。最大化复用现有 runner→taskRunner→事件链路。
- **只读执行**:`AgentTaskInput.readOnly` → Claude 加 `--disallowedTools Write Edit MultiEdit NotebookEdit`、Codex 用 `-s read-only`,提议/综合阶段**真不改文件**(诚实)。
- orchestrator 新增协作状态机:`createCollabTask` → 各参与者只读提议 → 全部完成后起综合 → 结论回填父任务 + 知识沉淀;子任务遇被拒操作**自动跳过**(不打断多 Agent 流程)。
- IPC `task:create.collab`(`{ mode:'propose', agents, synthesizer? }`);DB schema v2(tasks 增 `kind/parent_task_id/collab_role/result_summary` + 幂等迁移)。
- UI:VoiceDock 选 ≥2 个可用 Agent 时出现「💬 讨论给结论 / 🤝 协调执行」开关;新增 **CollaborationView**(各方提议卡 + 高亮综合结论);任务列表父任务标「👥 协作」,子任务归在父下不单列。
- 验证:typecheck + 69 单测(新增协作流程测试)+ build 全绿;**live 真跑通过**(真实 Claude+Codex 并行只读提议 → Claude 综合,工作区零写入,40s)。
- **修复**:schema v2 迁移顺序——`idx_tasks_parent` 引用新列,老库升级时建索引早于补列 → 启动崩溃(UnhandledRejection);改为 建表→补列→建索引,并加 `migrations.test.ts`;真实 v1 dev 库迁移已验证。
- **仍待**:B(主驾驶+顾问,走 Codex MCP consult)、D(分工+worktree 隔离);协作布局/选择持久化。

### 0.7 — Codex runner(多 Agent 真接入第一步)(2026-06-03)
- spike Codex CLI(0.134.0):`codex exec --json` 输出 JSONL(`thread.started` / `item.completed{agent_message|command_execution}` / `turn.*`);Codex 无 final result 事件 → 退出时合成 result。
- 新增 `CodexEventParser`(归一化成同一套 CliEvent)+ 真实 `CodexRunner`(child_process;`-C`/`--add-dir`/`-s workspace-write`/`--skip-git-repo-check`;resume 走 `exec resume <thread_id>`)。
- orchestrator 改 **多 runner 注册表**,按 `task:create.agent` 路由(claude-code / codex),任务持久化执行 Agent。
- 画布 Codex 节点置为**可用**;框选含 Codex 即可由 Codex 执行;任务列表显示执行 Agent 徽标。
- live 验证:真实 Codex 跑通(session_start(codex) + result success);新增 `codex-event-parser` 单测。
- **仍待**:Claude+Codex **真协作**(多 runner 同任务 + 综合结论)—— 目前多选由第一个可用 Agent 作协调者代跑。

### 0.6 — Agent 画布 + 框选交互(2026-06-02)
- 中央改为 **Agent 画布**(React Flow):Agent / 文件夹皆为节点;从 Finder **拖文件夹进画布即成工作区**(preload `getPathForFile`)。
- **左键拖拽 = 框选**(右键平移),框中卡片高亮;底部坞反映选中的 Agent/文件夹并判定**单 / 多 Agent 任务**。
- 多文件夹任务经 `--add-dir` 给 Claude 额外上下文;多 Agent 任务加协调者框架(executor 仍仅 Claude,Codex/Hermes 为未接入预留)。
- 任务列表显示执行 Agent 徽标。

### 0.5 — UI 转向对话优先(2026-06-02,后被 0.6 的画布取代为中央区)
- 中间从"大头像 + 啰嗦 CLI"改为 **Agent 对话视图**(assistant_text + 结论高亮)。
- 任务卡改 **TODO 勾选清单**(优先 Claude TodoWrite,无则步骤回退);CLI 降级为「详情」tab。

### 0.4 — M5 知识沉淀(2026-06-02)
- 任务结束自动生成 `task_summary`(真实模式 `claude -p --output-format json`,确定性回退)+ 每文件 **upsert file_card**;`KnowledgePanel` 展示局部上下文。

### 0.3 — M4 权限闸门(2026-06-02)
- **default-deny**:危险命令被 Claude 拒绝 → `permission_denials` → `waiting_for_approval` → PermissionDialog(人话风险)→ 批准用命令级 `--allowedTools` 重试。

### 0.2 — M2 文件追踪 + Diff(2026-06-02)
- chokidar 监听 + 双通道归属(agent/user)+ unified diff;FileTimeline / DiffViewer。修复 macOS symlink 归属、HOME EMFILE、跨工作区串扰。

### 0.1 — M0 脚手架 + M1 CLI Runner(2026-06-02)
- Electron + React + TS(electron-vite)、typed IPC、SQLite(PRD §7 schema)。
- **M1 spike(Claude Code v2.1.160)**:真实 `ClaudeCodeRunner`(child_process + stream-json + `--session-id`/`--resume`),mock runner 跑通数据流。
- 文档:`docs/talky-prd.md`(MVP 冻结)、`docs/talky-project-skeleton-and-file-rules.md`、需求 brief。

### 工程注意
- 原生模块(better-sqlite3 / fsevents)须按 Electron ABI 编译:`pnpm rebuild`(`electron-rebuild -f`)。
- 真实 Claude Code:`pnpm dev:real`(= `TALKY_USE_MOCK=0`)。
