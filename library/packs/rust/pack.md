---
name: rust
description: "Rust specialist for Cargo workspaces, async/concurrency, ownership-heavy code, performance work, and Tauri desktop/mobile backends."
provides:
  agents:
    - dude-pack-rust-specialist
  skills:
    - dude-pack-rust-tauri
requires:
  tools: [cargo]
---

# Rust Pack

A Rust specialist agent for Cargo workspaces and a Tauri-focused skill for
desktop/mobile work where a web frontend and a Rust native layer must
cooperate cleanly.

## Provides

### Agent

- `dude-pack-rust-specialist` — Rust expert for Cargo workspaces, async,
  ownership/borrow-checker work, systems code, and performance tuning. Also
  the entry point for Tauri backend work (auto-loads the Tauri skill).

### Skill

- `dude-pack-rust-tauri` — Tauri development guidance: `src-tauri/`,
  `tauri.conf.json`, `#[tauri::command]`, IPC, plugins, capabilities,
  windows, tray, bundling, updater, frontend-to-Rust integration.

## Requires

- `cargo` (and `rustc`) on PATH. Tauri work additionally requires the Tauri
  CLI (`cargo install tauri-cli`) and the platform's WebView dependencies.

## Install / remove

```bash
@dude add pack rust
@dude remove pack rust
```
