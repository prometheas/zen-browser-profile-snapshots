#[path = "test-mode.rs"]
pub mod test_mode;

pub fn version_text() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
