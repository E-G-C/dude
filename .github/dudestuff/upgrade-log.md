# Upgrade Log

Append-only history of `@dude upgrade` events and rollbacks. Maintained by the `dude-bundle-upgrade` skill. Newest entries at the bottom.

## Entry shape

Upgrade entries (written by `upgrade.sh apply`):

```
## <YYYY-MM-DD HH:MM:SS> — upgrade
- from: <sha>
- to:   <sha>
- ref:  <branch|tag|sha>
- replaced: N
- added:    N
- removed:  N
- removals_deferred:   N
- preserved: project files outside the base namespace
- safety tag: dude-pre-upgrade-<ts>
- lint: [OK|FAIL|SKIPPED]
- notes: plan_id=<id>; branch=<upgrade-branch>
```

Rollback entries (written by `upgrade.sh rollback`, appended uncommitted):

```
## <YYYY-MM-DD HH:MM:SS> — rollback
- restored: <sha>
- safety tag: dude-pre-upgrade-<ts>
- branch: <current-branch>
- notes: <free-form>
```

## History

(no upgrades recorded yet)
