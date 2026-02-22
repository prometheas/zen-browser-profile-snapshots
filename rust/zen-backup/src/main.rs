fn main() {
    let _test_mode = zen_backup::test_mode::from_env();
    let mut args = std::env::args();
    let _ = args.next();
    match args.next().as_deref() {
        Some("--version") | Some("-v") | Some("version") => {
            println!("{}", zen_backup::version_text());
        }
        _ => {
            println!("zen-backup (rust scaffold)");
        }
    }
}
