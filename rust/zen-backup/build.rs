fn main() {
    if let Ok(version) = std::env::var("RELEASE_VERSION") {
        if !version.trim().is_empty() {
            println!("cargo:rustc-env=ZEN_BACKUP_EMBEDDED_VERSION={version}");
        }
    }
}
