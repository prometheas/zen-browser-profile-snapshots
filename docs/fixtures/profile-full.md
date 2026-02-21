# Fixture: Full Profile

Represents a complete Zen browser profile with all supported data types for comprehensive testing.

## Files

### SQLite Databases

| Path | Description | Content |
|------|-------------|---------|
| `places.sqlite` | History and bookmarks | 10 bookmarks, 50 history entries |
| `formhistory.sqlite` | Form autofill data | 5 form entries |
| `permissions.sqlite` | Site permissions | 3 permission grants |
| `content-prefs.sqlite` | Per-site preferences | 2 site preferences |
| `favicons.sqlite` | Favicon cache | 5 favicons |

### Configuration Files

| Path | Description | Content |
|------|-------------|---------|
| `prefs.js` | User preferences | 20 custom preferences |
| `user.js` | User overrides | 5 override preferences |
| `handlers.json` | Protocol handlers | Default handlers |
| `search.json.mozlz4` | Search engines | Default + 1 custom engine |
| `extensions.json` | Extension registry | 3 extensions registered |
| `containers.json` | Container tabs | 2 custom containers |

### Extension Data

| Path | Description | Content |
|------|-------------|---------|
| `extensions/test@ext.xpi` | Installed extension | Mock extension package |
| `browser-extension-data/test@ext/` | Extension storage | `{"setting": "value"}` |
| `storage/default/moz-extension+++uuid/idb/` | Extension IndexedDB | 1 test database |

### Session State

| Path | Description | Content |
|------|-------------|---------|
| `sessionstore.jsonlz4` | Session state | 2 windows, 5 tabs each |
| `sessionstore-backups/recovery.jsonlz4` | Recovery backup | Previous session |

### Zen-Specific

| Path | Description | Content |
|------|-------------|---------|
| `zen-workspaces.json` | Workspace definitions | 3 workspaces |
| `zen-keyboard-shortcuts.json` | Custom shortcuts | 5 shortcuts |

## Explicitly Excluded

These files are NOT included (security/privacy):

- `cookies.sqlite` — Session tokens, authentication data
- `key4.db` — Encryption keys
- `logins.json` — Saved passwords
- `cert9.db` — Certificate database

These files are NOT included (rebuildable):

- `cache2/` — Browser cache
- `storage/temporary/` — Temporary storage
- `crashes/`, `minidumps/` — Crash reports
- `datareporting/`, `saved-telemetry-pings/` — Telemetry

## SQLite Schema Requirements

### places.sqlite

- `moz_places` — URL storage
- `moz_bookmarks` — Bookmark tree with parent relationships
- `moz_historyvisits` — Visit timestamps with frecency data
- `moz_origins` — Origin aggregation

### formhistory.sqlite

- `moz_formhistory` — Field name/value pairs with use count

### permissions.sqlite

- `moz_perms` — Permission grants (origin, type, permission)

## Validation

After restore, verify:

1. All `.sqlite` files pass `PRAGMA integrity_check`
2. All `.sqlite` files contain expected tables
3. All `.json` files are valid JSON
4. All `.js` files are valid JavaScript syntax
5. Extension directories maintain structure

## Notes

- Suitable for: comprehensive backup coverage, retention testing, restore validation
- Size: ~5-10 MB uncompressed, ~1-2 MB compressed
- Platform-agnostic paths (no OS-specific separators in fixture)
