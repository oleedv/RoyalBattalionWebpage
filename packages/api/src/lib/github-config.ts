import type { SquadJSPlugin } from "shared";

const REPO = "oleedv/Royal-Battalion-SquadJS";
const BRANCH = "main";

const CONFIG_FILES: Record<string, string> = {
  staging: "config.squadjs-staging.json",
  production: "config.squadjs-production.json",
};

export type Environment = "staging" | "production";

function getToken(): string | null {
  return process.env.GITHUB_CONFIG_TOKEN || null;
}

function headers(): HeadersInit {
  const token = getToken();
  if (!token) throw new Error("GITHUB_CONFIG_TOKEN not configured");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github.v3+json",
    "Content-Type": "application/json",
  };
}

export async function readSquadJSConfig(
  env: Environment
): Promise<{
  raw: Record<string, unknown>;
  plugins: SquadJSPlugin[];
  sha: string;
} | null> {
  const token = getToken();
  if (!token) return null;

  const filePath = CONFIG_FILES[env];
  if (!filePath) return null;

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}?ref=${BRANCH}`,
    { headers: headers() }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { content: string; sha: string };
  const content = Buffer.from(data.content, "base64").toString("utf-8");
  const raw = JSON.parse(content) as Record<string, unknown>;
  const plugins = (raw.plugins ?? []) as SquadJSPlugin[];

  return { raw, plugins, sha: data.sha };
}

function buildChangeSummary(
  oldPlugins: SquadJSPlugin[],
  newPlugins: SquadJSPlugin[]
): string[] {
  const lines: string[] = [];
  const oldMap = new Map(oldPlugins.map((p) => [p.plugin, p]));

  for (const np of newPlugins) {
    const op = oldMap.get(np.plugin);
    if (!op) continue;

    const changes: string[] = [];

    // Check enabled toggle
    if (op.enabled !== np.enabled) {
      changes.push(np.enabled ? "enabled" : "disabled");
    }

    // Check each field
    for (const key of Object.keys(np)) {
      if (key === "plugin" || key === "enabled") continue;
      if (JSON.stringify(op[key]) !== JSON.stringify(np[key])) {
        changes.push(key);
      }
    }

    if (changes.length > 0) {
      lines.push(`  ${np.plugin}: ${changes.join(", ")}`);
    }
  }

  return lines;
}

export async function writeSquadJSConfig(
  env: Environment,
  raw: Record<string, unknown>,
  plugins: SquadJSPlugin[],
  authorName?: string
): Promise<void> {
  const filePath = CONFIG_FILES[env];
  if (!filePath) throw new Error(`Unknown environment: ${env}`);

  // Get current SHA (required for updates)
  const current = await readSquadJSConfig(env);
  if (!current) throw new Error("Could not read current config");

  // Build detailed commit message
  const changeLines = buildChangeSummary(current.plugins, plugins);
  const title = `chore(${env}): update ${changeLines.length} plugin${changeLines.length !== 1 ? "s" : ""}`;
  const message = [title, "", ...changeLines].join("\n");

  const updated = { ...raw, plugins };
  const content = Buffer.from(
    JSON.stringify(updated, null, 2) + "\n",
    "utf-8"
  ).toString("base64");

  const body: Record<string, unknown> = {
    message,
    content,
    sha: current.sha,
    branch: BRANCH,
  };

  // Set commit author to the Discord user who made the change
  if (authorName) {
    body.author = {
      name: authorName,
      email: `${authorName.toLowerCase().replace(/[^a-z0-9]/g, "")}@royalbattalion.com`,
    };
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const respBody = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${respBody}`);
  }
}

export function getAvailableEnvironments(): Environment[] {
  return Object.keys(CONFIG_FILES) as Environment[];
}

export function isConfigured(): boolean {
  return !!getToken();
}

// --- Plugin descriptions from source ---

const PLUGINS_DIR = "squad-server/plugins";
const SKIP_FILES = new Set(["base-plugin.js", "discord-base-plugin.js", "discord-base-message-updater.js", "index.js", "readme.md"]);

let descriptionCache: Record<string, string> | null = null;
let descriptionCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function fetchPluginDescriptions(): Promise<Record<string, string>> {
  if (descriptionCache && Date.now() - descriptionCacheTime < CACHE_TTL) {
    return descriptionCache;
  }

  const token = getToken();
  if (!token) return {};

  // List all files in the plugins directory
  const listRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PLUGINS_DIR}?ref=${BRANCH}`,
    { headers: headers() }
  );

  if (!listRes.ok) return {};

  const files = (await listRes.json()) as { name: string; download_url: string }[];
  const pluginFiles = files.filter(
    (f) => f.name.endsWith(".js") && !SKIP_FILES.has(f.name)
  );

  const descriptions: Record<string, string> = {};

  // Fetch files in parallel (batched to avoid rate limits)
  const batchSize = 10;
  for (let i = 0; i < pluginFiles.length; i += batchSize) {
    const batch = pluginFiles.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (file) => {
        try {
          const res = await fetch(file.download_url);
          if (!res.ok) return null;
          const content = await res.text();
          return { name: file.name, content };
        } catch {
          return null;
        }
      })
    );

    for (const result of results) {
      if (!result) continue;

      // Extract class name from "class XYZ extends"
      const classMatch = result.content.match(/class\s+(\w+)\s+extends/);

      // Extract description from static getter
      const descMatch = result.content.match(
        /static\s+get\s+description\s*\(\s*\)\s*\{[\s\S]*?return\s+['"`]([\s\S]*?)['"`]\s*;?\s*\}/
      );

      if (classMatch && descMatch) {
        // Strip HTML tags for clean display
        const desc = descMatch[1].replace(/<[^>]+>/g, "").trim();
        descriptions[classMatch[1]] = desc;
      }
    }
  }

  descriptionCache = descriptions;
  descriptionCacheTime = Date.now();
  return descriptions;
}
