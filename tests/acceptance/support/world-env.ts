export function buildScenarioEnv(
  previous: Record<string, string | undefined>,
  home: string,
): Record<string, string | undefined> {
  const zenBackupEntries = Object.entries(previous).filter(([key, value]) =>
    key.startsWith("ZEN_BACKUP_") && value !== undefined
  );

  return {
    HOME: home,
    ...Object.fromEntries(zenBackupEntries),
  };
}
