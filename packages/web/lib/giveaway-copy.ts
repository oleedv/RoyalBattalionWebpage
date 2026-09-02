export const DISCORD_MESSAGE_LIMIT = 2000;

export interface GiveawayCopyRow {
  userId: string;
  displayName?: string | null;
  tickets: number;
  hours: number;
  seed: number;
  votes: number;
}

export interface GiveawayCopyInput {
  prize: string;
  monthLabel: string;
  drawAt: string;
  entries: number;
  totalTickets: number;
  votesCast: number;
  votesPerVoter: number;
  voteWeight: number;
  winnerUserId?: string | null;
  winnerTickets?: number | null;
  top: GiveawayCopyRow[];
}

function mention(id: string): string {
  return `<@${id}>`;
}

function namedMention(id: string, displayName?: string | null): string {
  const name = displayName?.trim();
  if (!name || name === id) return mention(id);
  return `${name} ${mention(id)}`;
}

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function drawStamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return `<t:${Math.floor(ms / 1000)}:D>`;
}

function leaderLine(row: GiveawayCopyRow, i: number): string {
  return `${i + 1}. ${namedMention(row.userId, row.displayName)} — ${fmtInt(row.tickets)} (${row.hours}h + ${row.seed}h seed + ${row.votes} votes)`;
}

function fit(text: string): string {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return text;
  const marker = "\n…(truncated)";
  return text.slice(0, DISCORD_MESSAGE_LIMIT - marker.length) + marker;
}

function withLeaders(header: string[], top: GiveawayCopyRow[], limit: number): string {
  const lines = [...header];
  const slice = top.slice(0, limit);
  for (let i = 0; i < slice.length; i++) lines.push(leaderLine(slice[i], i));
  if (top.length === 0) lines.push("*(no entries yet)*");
  return fit(lines.join("\n"));
}

export function buildProgressCopy(input: GiveawayCopyInput, limit = 10): string {
  return withLeaders(
    [
      `**${input.monthLabel} Giveaway** — ${input.prize}`,
      `Entries: ${fmtInt(input.entries)} · Total tickets: ${fmtInt(input.totalTickets)} · Draw: ${drawStamp(input.drawAt)}`,
      "",
      "**Top tickets**",
    ],
    input.top,
    limit,
  );
}

export function buildVoteReminderCopy(input: GiveawayCopyInput, limit = 10): string {
  return withLeaders(
    [
      `**Community vote is open** for the ${input.monthLabel} giveaway (${input.prize}).`,
      `Each vote is **+${input.voteWeight}** tickets. You can vote for up to **${input.votesPerVoter}** people.`,
      `Votes cast so far: ${fmtInt(input.votesCast)}`,
      "",
      "**Current leaders**",
    ],
    input.top,
    limit,
  );
}

export function buildWinnerCopy(input: GiveawayCopyInput, limit = 5): string {
  if (!input.winnerUserId) return "";
  const tickets = input.winnerTickets ?? 0;
  const winner = input.top.find((r) => r.userId === input.winnerUserId);
  return withLeaders(
    [
      `**Winner: ${input.monthLabel}** — ${input.prize}`,
      `Winner: ${namedMention(input.winnerUserId, winner?.displayName)} with **${fmtInt(tickets)}** of ${fmtInt(input.totalTickets)} tickets (${fmtInt(input.entries)} entries)`,
      "",
      `**Top ${limit}**`,
    ],
    input.top,
    limit,
  );
}
