# Fixture: Minimal Profile

Represents the smallest valid Zen browser profile for testing basic backup/restore operations.

## Files

| Path              | Description                    | Content                                                |
| ----------------- | ------------------------------ | ------------------------------------------------------ |
| `places.sqlite`   | Browsing history and bookmarks | 1 bookmark (<https://example.com>), 1 history entry    |
| `prefs.js`        | User preferences               | `user_pref("browser.startup.homepage", "about:home");` |
| `extensions.json` | Extension registry             | Empty extensions array `{"addons":[]}`                 |

## SQLite Schema (places.sqlite)

Tables required:

- `moz_places` — URL storage (1 row)
- `moz_bookmarks` — Bookmark tree (1 row)
- `moz_historyvisits` — Visit timestamps (1 row)

## Validation

After restore, verify:

1. `places.sqlite` passes `PRAGMA integrity_check`
2. `prefs.js` is valid JavaScript
3. `extensions.json` is valid JSON

## Notes

- No cookies (excluded for security)
- No extension data directories
- No session state
- Suitable for: basic backup/restore, SQLite handling, archive integrity
