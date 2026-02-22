fn main() {
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
