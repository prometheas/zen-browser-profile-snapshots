#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct TestMode {
    pub os: Option<String>,
    pub now: Option<String>,
    pub version: Option<String>,
}

pub fn from_env() -> TestMode {
    TestMode {
        os: std::env::var("ZEN_BACKUP_TEST_OS").ok(),
        now: std::env::var("ZEN_BACKUP_TEST_NOW").ok(),
        version: std::env::var("ZEN_BACKUP_TEST_VERSION").ok(),
    }
}
