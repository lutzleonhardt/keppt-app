export function expandQuickReplyLine(
  line: string,
  options: readonly string[] | null,
): string {
  if (!options) return line;
  const trimmed = line.trim();
  if (!/^[0-9]+$/.test(trimmed)) return line;
  const index = Number(trimmed);
  if (!Number.isSafeInteger(index) || index < 1 || index > options.length) {
    return line;
  }
  return options[index - 1]!;
}
