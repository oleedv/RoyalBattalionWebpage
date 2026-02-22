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
  console.log(`[discord] Fetching guild roles for guild ${guildId}`);
  const res = await fetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`[discord] Guild member fetch failed: ${res.status} - ${body}`);
    throw new Error(`Discord guild member fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { roles: string[] };
  console.log(`[discord] User has ${data.roles.length} Discord roles:`, data.roles);
  return data.roles;
}

interface GuildMember {
  user?: { id: string; username: string };
  roles: string[];
}

export async function fetchAllGuildMembers(
  botToken: string,
  guildId: string
): Promise<{ discordId: string; roles: string[] }[]> {
  const members: { discordId: string; roles: string[] }[] = [];
  let after = "0";

  console.log(`[discord] Fetching all guild members for guild ${guildId} using bot token`);

  // Paginate through all guild members (max 1000 per request)
  while (true) {
    const res = await fetch(
      `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`[discord] Guild members fetch failed: ${res.status} - ${body}`);
      throw new Error(`Discord guild members fetch failed: ${res.status}`);
    }

    const batch = (await res.json()) as GuildMember[];
    console.log(`[discord] Fetched batch of ${batch.length} guild members`);
    if (batch.length === 0) break;

    for (const m of batch) {
      if (m.user) {
        members.push({ discordId: m.user.id, roles: m.roles });
      }
    }

    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user?.id || after;
  }

  console.log(`[discord] Total guild members fetched: ${members.length}`);
  return members;
}
