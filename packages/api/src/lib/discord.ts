const DISCORD_API = "https://discord.com/api/v10";

export async function fetchDiscordUser(accessToken: string) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    id: string;
    username: string;
    avatar: string | null;
  };

  return {
    id: data.id,
    username: data.username,
    avatar: data.avatar,
  };
}

export async function fetchGuildRoles(accessToken: string, guildId: string) {
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Discord guild member fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { roles: string[] };
  return data.roles;
}
