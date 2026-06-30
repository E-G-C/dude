---
description: "Use when editing Hugo project configuration, site structure, build settings, themes, modules, mounts, or deployment options. Covers hugo.toml, config directories, commands, public output, and module precedence."
name: "Hugo Project Configuration"
applyTo:
  - "hugo.toml"
  - "hugo.yaml"
  - "hugo.json"
  - "config/**/*.toml"
  - "config/**/*.yaml"
  - "config/**/*.json"
  - "themes/**/hugo.toml"
  - "themes/**/hugo.yaml"
  - "themes/**/hugo.json"
  - "go.mod"
  - "go.sum"
---
# Hugo Project Configuration

- Keep configuration short and explicit. Prefer Hugo defaults unless the site needs different behavior.
- Root configuration files are `hugo.toml`, `hugo.yaml`, or `hugo.json`, with that precedence. Older `config.*` names still work but are not the recommended convention.
- For larger sites, use `config/_default/` plus environment directories such as `config/production/` and `config/staging/`. Environment-specific files should contain only environment-specific overrides.
- When splitting config by root key, omit the root key inside the component file. For example, `config/_default/params.toml` contains parameter names directly, not a wrapping `[params]` table.
- Define `cascade` tables in a root configuration file, not in a dedicated split file.
- `baseURL` should include the protocol and trailing slash, for example `https://example.org/`.
- Environment variables override file configuration. Standard config variables use `HUGO_`; custom parameters use `HUGO_PARAMS_` or a custom delimiter for snake_case names.
- Hugo can merge map configuration values from themes/modules into the project, but cannot merge slice values. Be careful with `menus`, `outputs`, and other slice-backed settings.
- The generated `public` directory is not cleared before a build. Use a clean deployment directory or clear stale files when draft, future, expired, alias, permalink, or output settings change.
- Use `hugo config` to inspect merged configuration and `hugo config mounts` to inspect the unified file system.
- Custom module mounts replace the default mount for that component. Re-add the default mount explicitly when overlaying another directory.
- Modules require Git and Go. Imports are recursive and top-down; earlier imports win on path collisions. Do not edit `_vendor`; override files in the project using the same relative path.
- If module Node dependencies change, use `hugo mod npm pack` before installing or updating the combined Node dependency set.
