function userMentionRegex() {
  return /<@!?(\d{5,25})>/g;
}

export function extractUserMentionIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids: string[] = [];
  for (const match of text.matchAll(userMentionRegex())) {
    ids.push(match[1]);
  }
  return ids;
}

/** Prefix each resolved user mention with its display name: `OleEd <@123>`. */
export function formatUserMentions(
  text: string | null | undefined,
  nameMap: Record<string, string>,
): string {
  if (!text) return text || "";
  return text.replace(userMentionRegex(), (full, id: string, offset: number) => {
    const name = nameMap[id]?.trim();
    if (!name) return full;
    const before = text.slice(0, offset);
    if (before.endsWith(`${name} `) || before.endsWith(`@${name} `)) return full;
    return `${name} ${full}`;
  });
}
