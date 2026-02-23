export function platformEnvFromTags(
  tags: string[],
): Record<string, string> {
  if (tags.includes("@windows")) {
    return {
      ZEN_BACKUP_TEST_OS: "windows",
      ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_SCHEDULER: "1",
      ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_TOAST: "1",
    };
  }

  if (tags.includes("@linux")) {
    return {
      ZEN_BACKUP_TEST_OS: "linux",
    };
  }

  if (tags.includes("@macos")) {
    return {
      ZEN_BACKUP_TEST_OS: "darwin",
    };
  }

  return {};
}
