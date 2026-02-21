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

export async function writeSquadJSConfig(
  env: Environment,
  raw: Record<string, unknown>,
  plugins: SquadJSPlugin[]
): Promise<void> {
  const filePath = CONFIG_FILES[env];
  if (!filePath) throw new Error(`Unknown environment: ${env}`);

  // Get current SHA (required for updates)
  const current = await readSquadJSConfig(env);
  if (!current) throw new Error("Could not read current config");

  const updated = { ...raw, plugins };
  const content = Buffer.from(
    JSON.stringify(updated, null, 2) + "\n",
    "utf-8"
  ).toString("base64");

  const res = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        message: `chore(config): update ${env} plugins via dashboard`,
        content,
        sha: current.sha,
        branch: BRANCH,
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API error (${res.status}): ${body}`);
  }
}

export function getAvailableEnvironments(): Environment[] {
  return Object.keys(CONFIG_FILES) as Environment[];
}

export function isConfigured(): boolean {
  return !!getToken();
}
