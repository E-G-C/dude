---
name: "tauri-development"
description: "Use when building, debugging, or designing a Tauri desktop or mobile app: src-tauri, tauri.conf.json, #[tauri::command], invoke IPC, plugins, capabilities, permissions, windows, tray, bundling, updater, or frontend-to-Rust integration."
---

# Tauri Development

## Purpose

Provide practical guidance for work on Tauri applications, especially where a web frontend and a Rust native layer must cooperate cleanly and securely.

## Core Model

- Tauri applications combine a web frontend with a Rust native layer.
- Treat the frontend-to-Rust boundary as an explicit contract, not an implementation shortcut.
- Keep native code under `src-tauri/` cohesive and separate from frontend UI concerns.
- Prefer cross-platform behavior first; isolate OS-specific branches with explicit `cfg` gates.

## Routing Guidance

- Route Rust-native work to the Rust specialist: commands, plugins, native integrations, Cargo, `src-tauri`, performance, concurrency, and platform bindings.
- Route web UI and presentation work to the Frontend specialist.
- If the task changes both the invoke contract and the UI that calls it, split ownership between Rust and Frontend.
- Route structural Tauri decisions such as plugin strategy, app shape, or packaging tradeoffs to Lead.

## Implementation Rules

- Prefer `#[tauri::command]` for intentional frontend-to-Rust operations instead of ad hoc side channels.
- Keep command inputs and outputs explicit and serializable; favor typed payloads with clear error shapes.
- Validate and constrain filesystem, shell, network, and process access at the boundary.
- Treat capabilities and permissions as part of the feature design, not post-hoc cleanup.
- Reuse maintained Tauri plugins when they fit; write custom native code only when the plugin path is insufficient.
- Avoid blocking the main thread; use async or offload heavy work deliberately.
- Use shared state carefully; document synchronization choices when using `State`, mutexes, channels, or background tasks.
- Keep `tauri.conf.json` and related capability or permission config aligned with the implemented native behavior.
- Prefer narrow window, tray, and menu changes over broad global state coupling.

## Validation Checklist

- Verify the Rust side compiles cleanly with Cargo.
- Verify the frontend invoke contract still matches command names and payload shapes.
- Check that permissions and capabilities only grant what the feature needs.
- Check platform-specific code paths for unsupported targets.
- Confirm packaging or bundling settings if the change affects app identity, assets, or distribution behavior.

## When To Re-check Official Docs

- When working on version-sensitive Tauri APIs or configuration details, consult the official docs at `https://tauri.app/develop/`.
- Re-check docs before introducing plugins, changing permission or capability configuration, or relying on mobile-specific behavior.