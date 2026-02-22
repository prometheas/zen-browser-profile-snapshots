#[derive(Debug, PartialEq, Eq)]
pub enum VersionKind {
    Production(String),
    Preview {
        semver: String,
        channel: String,
        channel_iteration: String,
        ahead_count: Option<String>,
        hash: Option<String>,
    },
    Raw(String),
}

pub fn format_version(version: &str, color: bool) -> String {
    match parse_version(version) {
        VersionKind::Production(semver) => semver,
        VersionKind::Preview {
            semver,
            channel,
            channel_iteration,
            ahead_count,
            hash,
        } => {
            if !color {
                return version.trim_start_matches('v').to_string();
            }
            let channel_color = if channel == "alpha" { "31" } else { "33" };
            let mut out = format!(
                "{}-\u{1b}[1;{}m{}\u{1b}[0m.{}",
                semver, channel_color, channel, channel_iteration
            );
            if let (Some(ahead_count), Some(hash)) = (ahead_count, hash) {
                out.push_str(&format!("-{}-\u{1b}[90mg{}\u{1b}[0m", ahead_count, hash));
            }
            out
        }
        VersionKind::Raw(raw) => raw,
    }
}

pub fn parse_version(version: &str) -> VersionKind {
    let trimmed = version.trim();
    let value = trimmed.trim_start_matches('v');
    if value.split('.').count() == 3 && value.chars().all(|c| c.is_ascii_digit() || c == '.') {
        return VersionKind::Production(value.to_string());
    }

    let channels = ["alpha", "beta"];
    for channel in channels {
        let marker = format!("-{}.", channel);
        if let Some(idx) = value.find(&marker) {
            let semver = value[..idx].to_string();
            let rest = &value[idx + marker.len()..];
            let mut parts = rest.splitn(3, '-');
            let channel_iteration = parts.next().unwrap_or_default().to_string();
            let ahead_count = parts.next().map(|v| v.to_string());
            let hash = parts
                .next()
                .map(|v| v.strip_prefix('g').unwrap_or(v).to_string());
            return VersionKind::Preview {
                semver,
                channel: channel.to_string(),
                channel_iteration,
                ahead_count,
                hash,
            };
        }
    }

    VersionKind::Raw(value.to_string())
}
