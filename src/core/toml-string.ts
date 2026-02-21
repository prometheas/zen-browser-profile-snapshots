export function toTomlStringLiteral(value: string): string {
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"');
  return `"${escaped}"`;
}
