"use client";

import { useState } from "react";
import { usePermissions } from "@/lib/permission-context";
import OverviewTab from "./components/OverviewTab";
import TicketsTab from "./components/TicketsTab";
import ProspectsTab from "./components/ProspectsTab";
import SeedingTab from "./components/SeedingTab";
import MessagesTab from "./components/MessagesTab";
import LogsTab from "./components/LogsTab";
import TimeoutsTab from "./components/TimeoutsTab";

type Tab = "overview" | "tickets" | "prospects" | "seeding" | "messages" | "logs" | "timeouts";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "prospects", label: "Prospects" },
  { key: "seeding", label: "Seeding" },
  { key: "messages", label: "Messages" },
  { key: "logs", label: "Logs" },
  { key: "timeouts", label: "Timeouts" },
];

export default function DiscordBotPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [tab, setTab] = useState<Tab>("overview");

  if (!apiToken) return <div className="text-text-secondary">Loading...</div>;

  const canView = hasPermission("view:discord-bot") || hasPermission("manage:discord-bot");
  if (!canView) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  const canManage = hasPermission("manage:discord-bot");

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold tracking-wide">
          Discord Bot
        </h1>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-sm px-3 py-2 text-sm font-medium tracking-wide transition-colors ${
              tab === t.key
                ? "bg-bg-card text-accent"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <OverviewTab apiToken={apiToken} />}
      {tab === "tickets" && <TicketsTab apiToken={apiToken} />}
      {tab === "prospects" && <ProspectsTab apiToken={apiToken} canManage={canManage} />}
      {tab === "seeding" && <SeedingTab apiToken={apiToken} canManage={canManage} />}
      {tab === "messages" && <MessagesTab apiToken={apiToken} />}
      {tab === "logs" && <LogsTab apiToken={apiToken} />}
      {tab === "timeouts" && <TimeoutsTab apiToken={apiToken} canManage={canManage} />}
    </div>
  );
}
