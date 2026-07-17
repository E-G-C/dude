---
description: "Look up a Hugo template function or object method, explain the correct call, and show a minimal example grounded in the bundled references."
name: "Look Up Hugo Function Or Method"
argument-hint: "Function namespace, method name, or 'how do I ...' template task"
agent: "Hugo Docs Researcher"
---
Resolve this Hugo function/method request:

`$ARGUMENTS`

Use the `dude-pack-hugo-functions-and-methods` skill references. Then:

1. Decide whether the user needs a namespaced **function** (e.g. `strings.Title`, `collections.Where`, `resources.Get`) or an object **method** (e.g. `.Title`, `.Pages.ByDate`, `.Resources.Get`).
2. Give the smallest correct call, including the receiver/context (`.` vs `$`).
3. Show a minimal, Hugo-native example.
4. Note argument order (the piped value is the final argument), aliases, and any Extended-edition, security (`safe.*`), or version caveats.
5. Name the verification command or inline `{{ debug.Dump $value }}` check when helpful.
