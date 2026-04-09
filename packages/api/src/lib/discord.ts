import { logger } from "./logger";

const DISCORD_API = "https://discord.com/api/v10";

async function discordFetch(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers });
  if (res.status === 429) {
    const body = (await res.json()) as { retry_after?: number };
    const waitMs = Math.ceil((body.retry_after || 1) * 1000);
    logger.warn("discord", `Rate limited on ${url}, retrying in ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetch(url, { headers });
  }
  return res;
}

export async function fetchDiscordUser(accessToken: string) {
  const res = await discordFetch(`${DISCORD_API}/users/@me`, {
    Authorization: `Bearer ${accessToken}`,
  });

  if (!res.ok) {
    throw new Error(`Discord user fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    id: string;
    username: string;
    global_name: string | null;
    avatar: string | null;
  };

  return {
    id: data.id,
    username: data.username,
    displayName: data.global_name,
    avatar: data.avatar,
  };
}

export async function fetchGuildRoles(accessToken: string, guildId: string) {
  logger.info("discord", `Fetching guild roles for guild ${guildId}`);
  const res = await discordFetch(`${DISCORD_API}/users/@me/guilds/${guildId}/member`, {
    Authorization: `Bearer ${accessToken}`,
  });

  if (!res.ok) {
    const body = await res.text();
    logger.warn("discord", `Guild member fetch failed: ${res.status} - ${body}`);
    // Missing guilds.members.read scope or user not in guild — return empty roles
    if (res.status === 403 || res.status === 401) {
      return [];
    }
    throw new Error(`Discord guild member fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { roles: string[] };
  logger.info("discord", `User has ${data.roles.length} Discord roles`, data.roles);
  return data.roles;
}

export async function fetchGuildRoleDefinitions(
  botToken: string,
  guildId: string
): Promise<{ id: string; name: string }[]> {
  const res = await discordFetch(`${DISCORD_API}/guilds/${guildId}/roles`, {
    Authorization: `Bot ${botToken}`,
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error("discord", `Guild roles fetch failed: ${res.status} - ${body}`);
    throw new Error(`Discord guild roles fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as { id: string; name: string }[];
  return data.map((r) => ({ id: r.id, name: r.name }));
}

interface GuildMember {
  user?: { id: string; username: string; global_name: string | null; avatar: string | null };
  roles: string[];
}

export async function fetchAllGuildMembers(
  botToken: string,
  guildId: string
): Promise<{ discordId: string; username: string; displayName: string | null; avatar: string | null; roles: string[] }[]> {
  const members: { discordId: string; username: string; displayName: string | null; avatar: string | null; roles: string[] }[] = [];
  let after = "0";

  logger.info("discord", `Fetching all guild members for guild ${guildId} using bot token`);

  // Paginate through all guild members (max 1000 per request)
  while (true) {
    const res = await discordFetch(
      `${DISCORD_API}/guilds/${guildId}/members?limit=1000&after=${after}`,
      { Authorization: `Bot ${botToken}` },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error("discord", `Guild members fetch failed: ${res.status} - ${body}`);
      throw new Error(`Discord guild members fetch failed: ${res.status}`);
    }

    const batch = (await res.json()) as GuildMember[];
    logger.info("discord", `Fetched batch of ${batch.length} guild members`);
    if (batch.length === 0) break;

    for (const m of batch) {
      if (m.user) {
        members.push({
          discordId: m.user.id,
          username: m.user.username,
          displayName: m.user.global_name,
          avatar: m.user.avatar,
          roles: m.roles,
        });
      }
    }

    if (batch.length < 1000) break;
    after = batch[batch.length - 1].user?.id || after;
  }

  logger.info("discord", `Total guild members fetched: ${members.length}`);
  return members;
}
