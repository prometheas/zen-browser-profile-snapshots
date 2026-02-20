# Zen Profile Backup — Vision

## Problem

Zen browser updates can corrupt profiles without warning, destroying months of accumulated history, bookmarks, workspaces, extension configurations, tabs, pins, and essentials. There is no built-in mechanism to snapshot and restore a complete profile.

## Solution

Automated daily and weekly compressed snapshots of the Zen browser profile, stored locally and optionally synced to cloud storage. Available as a single self-contained binary for macOS, Windows, and Linux.

## Goals

- **Cross-platform:** Single binary for macOS (ARM/x86), Windows (x86), Linux (ARM/x86)
- **Zero-maintenance:** Backups run on schedule via native OS scheduler (launchd, systemd, Task Scheduler)
- **Configurable scheduling:** Defaults to daily 12:30 and weekly Sunday 02:00 (local time)
- **Complete coverage:** History, bookmarks, extensions + configs, workspaces, session state, themes, shortcuts, permissions, form history, preferences (cookies excluded for security)
- **Safe SQLite handling:** Database backup via SQLite API (never raw file copy)
- **Cloud sync:** Optional sync to Google Drive, OneDrive, or custom path
- **Configurable retention:** Defaults 30 days daily, 12 weeks weekly
- **Notification control:** Notifications can be disabled via configuration
- **Simple restore:** One command to roll back to any snapshot

## Non-Goals

- Real-time or continuous sync
- Cross-machine profile sharing
- Incremental or deduplicated backups
- Backup of site-specific caches (localStorage, IndexedDB for websites)
