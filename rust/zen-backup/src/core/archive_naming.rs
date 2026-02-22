pub fn build_archive_name(kind: &str, date_part: &str) -> String {
    format!("zen-backup-{kind}-{date_part}.tar.gz")
}
