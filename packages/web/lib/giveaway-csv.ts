export interface LeaderboardCsvRow {
  userId: string;
  steamId: string | null;
  hours: number;
  seed: number;
  votes: number;
  tickets: number;
  manual: boolean;
}

export function buildLeaderboardCsv(rows: LeaderboardCsvRow[]): string {
  const header = "rank,userId,steamId,hours,seed,votes,tickets,manual";
  const lines = rows.map((r, i) =>
    [
      i + 1,
      r.userId,
      r.steamId ?? "",
      r.hours,
      r.seed,
      r.votes,
      r.tickets,
      r.manual,
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
