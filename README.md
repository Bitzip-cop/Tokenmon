# Tokenmon

**Token + Monster** — a tiny desktop pet that feeds on your AI coding usage.

<p align="center">
  <img src="docs/assets/banner.png" width="420" alt="Clawd and Chispa, the default Tokenmon characters" />
</p>

Tokenmon sits on your desktop and turns your local **Claude Code** and **Codex** token usage into a living pixel pet: every token you burn is food. It munches while you code, stays happy while you ship, gets bored when you idle — and sulks if you abandon it for two days.

> 中文说明见 [README.zh.md](README.zh.md)

## Features

- 🍽 **Live feeding** — tails your local session logs; new output tokens trigger the eating animation within seconds.
- 😄 **Moods** — eating → happy (recent output) → bored (idle a while) → sad (no output for 2 days). Thresholds configurable.
- 💰 **Accurate cost** — official per-model pricing (Claude Opus/Sonnet/Haiku tiers; GPT-5.5/5.4 per-version). Each usage record is priced by the model that produced it, so switching models mid-session stays accurate. Cache reads are excluded (free re-reads on subscriptions).
- ⏳ **Real quota** (Codex) — available rate-limit windows read straight from session logs, shown on hover.
- 🎭 **Characters** — Clawd & Chispa bundled; import any [codex-pets](https://www.npmjs.com/package/codex-pets) character via right-click → *Import from Clipboard*; remap animation rows per character via *Action Mapping*.
- 🔒 **Local-first** — your usage data never leaves your machine. No telemetry, no accounts, no server. The only network call is the optional character download you trigger yourself.
- ⚙️ **Zero config** — auto-detects which tools you have (`~/.claude`, `~/.codex`) and shows one pet per tool.

## Install (macOS, Apple Silicon)

1. Download the latest `.dmg` from [Releases](https://github.com/Bitzip-cop/Tokenmon/releases).
2. Drag **Tokenmon** into Applications.
3. First launch: **right-click the app → Open** (the build is ad-hoc signed, not notarized — macOS will warn once).

The pets appear at the bottom-right of your screen. Hover for today's numbers, drag to move, and right-click a pet to change or close it. You can also close a specific Claude or Codex pet from the Tokenmon menu bar icon; **Re-open pets** restores closed pets.

> **Note:** Tokenmon starts counting from first launch — it doesn't retro-bill your history. The cost shown is an API-equivalent estimate; subscription plans aren't actually billed per token.

## Build from source

```bash
pnpm install   # installs deps + rebuilds native modules for Electron
pnpm dev       # run in development
pnpm test      # unit tests
pnpm dist      # package a .dmg (apps/desktop/release/)
```

Requires Node ≥ 20 and pnpm ≥ 9. Stack: Electron + React + TypeScript (electron-vite), better-sqlite3, vitest.

## Configuration

All optional, via environment variables:

| Variable | Meaning | Default |
|---|---|---|
| `CLAUDE_CONFIG_DIR` | Claude Code config root | `~/.claude` |
| `CODEX_HOME` | Codex home | `~/.codex` |
| `TOKENMON_PET_SCALE` | Pet size (0.3–1.2) | `0.55` |
| `TOKENMON_MOOD_HAPPY_MIN` | Minutes since last output to stay happy | `30` |
| `TOKENMON_MOOD_SAD_HOURS` | Hours without output until sad | `48` |

## How cost is computed

Cost = `input × in + output × out + cache_write × cw` per million tokens, summed per record using the price of the model that produced it. Cache *reads* are shown but excluded from the total.

| Model | In $/M | Out $/M |
|---|---|---|
| Claude Opus 4.5+ | 5 | 25 |
| Claude Sonnet | 3 | 15 |
| Claude Haiku | 1 | 5 |
| GPT-5.5 | 5 | 30 |
| GPT-5.4 | 2.50 | 15 |

## Credits

- Pet sprites and character format from the [codex-pets](https://www.npmjs.com/package/codex-pets) project.
- Built with [Claude Code](https://claude.com/claude-code).

## License

[MIT](LICENSE)
