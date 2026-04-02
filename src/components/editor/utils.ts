export function getTextStats(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const totalLines =
    normalized.length === 0 ? 1 : normalized.split("\n").length;
  const totalChars = content.length;
  const totalWords = content.trim().length
    ? (content.trim().match(/\S+/g)?.length ?? 0)
    : 0;

  return {
    lines: totalLines,
    chars: totalChars,
    words: totalWords,
  };
}
