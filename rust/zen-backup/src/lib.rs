pub mod cli;
pub mod commands;
pub mod config;
pub mod core;
pub mod debug;
pub mod platform;
#[path = "test-mode.rs"]
pub mod test_mode;

pub fn version_text() -> &'static str {
    option_env!("ZEN_BACKUP_EMBEDDED_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}
