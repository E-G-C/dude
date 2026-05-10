# Upgrade Log

Append-only history of `@dude upgrade` events, conflict resolutions, and rollbacks. Maintained by the `dude-bundle-upgrade` skill. Newest entries at the bottom.

## Entry shape

```
## <YYYY-MM-DD HH:MM:SS> — <upgrade|rollback>
- from: <sha>
- to:   <sha>
- ref:  <branch|tag|sha>
- replaced: N
- added:    N
- removed:  N
- metadata_refreshed: N
- conflicts: N (resolved: <keep-mine=a, take-new=b, merged=c, deferred=d>)
- preserved: <count> project files
- safety tag: dude-pre-upgrade-<ts>|skipped
- lint: [OK|FAIL]
- notes: <free-form>
```

## History

(no upgrades recorded yet)
