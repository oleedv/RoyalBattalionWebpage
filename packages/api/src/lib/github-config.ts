import type { SquadJSPlugin } from "shared";
import { env } from "./env";
import { logger } from "./logger";

const REPO = "oleedv/Royal-Battalion-SquadJS";
const BRANCH = "main";

const CONFIG_FILES: Record<string, string> = {
  staging: "config.squadjs-staging.json",
  production: "config.squadjs-production.json",
};

export type Environment = "staging" | "production";

function getToken(): string | null {
  return env.GITHUB_CONFIG_TOKEN || null;
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

interface PluginMeta {
  description: string;
  fieldDescriptions: Record<string, string>;
}

let metaCache: Record<string, PluginMeta> | null = null;
let metaCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function fetchPluginSources(): Promise<{ name: string; content: string }[]> {
  const token = getToken();
  if (!token) return [];

  const listRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PLUGINS_DIR}?ref=${BRANCH}`,
    { headers: headers() }
  );

  if (!listRes.ok) return [];

  const files = (await listRes.json()) as { name: string; download_url: string }[];
  const pluginFiles = files.filter(
    (f) => f.name.endsWith(".js") && !SKIP_FILES.has(f.name)
  );

  const results: { name: string; content: string }[] = [];
  const batchSize = 10;

  for (let i = 0; i < pluginFiles.length; i += batchSize) {
    const batch = pluginFiles.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (file) => {
        try {
          const res = await fetch(file.download_url);
          if (!res.ok) {
            logger.warn("github-config", "Plugin file fetch non-2xx", { name: file.name, status: res.status });
            return null;
          }
          const content = await res.text();
          return { name: file.name, content };
        } catch (err) {
          logger.warn("github-config", "Plugin file fetch failed", { name: file.name, err });
          return null;
        }
      })
    );

    for (const r of batchResults) {
      if (r) results.push(r);
    }
  }

  return results;
}

function extractFieldDescriptions(content: string): Record<string, string> {
  const fieldDescs: Record<string, string> = {};

  // Extract the optionsSpecification getter body
  const optionsMatch = content.match(
    /static\s+get\s+optionsSpecification\s*\(\s*\)\s*\{([\s\S]*?)\n\s*\}/
  );
  if (!optionsMatch) return fieldDescs;

  const body = optionsMatch[1];

  // Match each field with its description property
  const fieldRegex = /(\w+)\s*:\s*\{[^}]*?description\s*:\s*['"`]([\s\S]*?)['"`]/g;
  let match;
  while ((match = fieldRegex.exec(body)) !== null) {
    fieldDescs[match[1]] = match[2].replace(/<[^>]+>/g, "").trim();
  }

  return fieldDescs;
}

async function fetchPluginMeta(): Promise<Record<string, PluginMeta>> {
  if (metaCache && Date.now() - metaCacheTime < CACHE_TTL) {
    return metaCache;
  }

  const sources = await fetchPluginSources();
  const meta: Record<string, PluginMeta> = {};

  for (const source of sources) {
    const classMatch = source.content.match(/class\s+(\w+)\s+extends/);
    if (!classMatch) continue;

    const className = classMatch[1];

    // Extract plugin description
    const descMatch = source.content.match(
      /static\s+get\s+description\s*\(\s*\)\s*\{[\s\S]*?return\s+['"`]([\s\S]*?)['"`]\s*;?\s*\}/
    );
    const description = descMatch
      ? descMatch[1].replace(/<[^>]+>/g, "").trim()
      : "";

    // Extract field descriptions from optionsSpecification
    const fieldDescriptions = extractFieldDescriptions(source.content);

    if (description || Object.keys(fieldDescriptions).length > 0) {
      meta[className] = { description, fieldDescriptions };
    }
  }

  metaCache = meta;
  metaCacheTime = Date.now();
  return meta;
}

export async function fetchPluginDescriptions(): Promise<Record<string, string>> {
  const meta = await fetchPluginMeta();
  const descriptions: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value.description) descriptions[key] = value.description;
  }
  return descriptions;
}

export async function fetchPluginFieldDescriptions(): Promise<Record<string, Record<string, string>>> {
  const meta = await fetchPluginMeta();
  const fieldDescs: Record<string, Record<string, string>> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (Object.keys(value.fieldDescriptions).length > 0) {
      fieldDescs[key] = value.fieldDescriptions;
    }
  }
  return fieldDescs;
}
