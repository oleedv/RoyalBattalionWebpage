"use client";

import { useState } from "react";
import { usePermissions } from "@/lib/permission-context";
import { Skeleton, SkeletonCard, SkeletonStatGrid } from "@/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { AccessDeniedCard } from "@/components/access-denied-card";
import OverviewTab from "./components/OverviewTab";
import TicketsTab from "./components/TicketsTab";
import ProspectsTab from "./components/ProspectsTab";
import MessagesTab from "./components/MessagesTab";
import LogsTab from "./components/LogsTab";
import TimeoutsTab from "./components/TimeoutsTab";

type Tab = "overview" | "tickets" | "prospects" | "messages" | "logs" | "timeouts";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "tickets", label: "Tickets" },
  { key: "prospects", label: "Prospects" },
  { key: "messages", label: "Messages" },
  { key: "logs", label: "Logs" },
  { key: "timeouts", label: "Timeouts" },
];

export default function DiscordBotPage() {
  const { apiToken, hasPermission } = usePermissions();
  const [tab, setTab] = useState<Tab>("overview");

  if (!apiToken) {
    return (
      <div>
        <div className="mb-8">
          <Skeleton className="h-9 w-48" />
        </div>
        <div className="mb-6 flex flex-wrap gap-1 rounded-sm border border-border bg-bg-tertiary/50 p-1">
          {TABS.map((t) => (
            <Skeleton key={t.key} className="h-9 flex-1" />
          ))}
        </div>
        <div className="space-y-8">
          <SkeletonCard pad="p-4">
            <Skeleton className="h-6 w-full" />
          </SkeletonCard>
          <SkeletonStatGrid count={3} className="grid gap-3 sm:grid-cols-3" />
        </div>
      </div>
    );
  }

  const canView = hasPermission("view:discord-bot") || hasPermission("manage:discord-bot");
  if (!canView) {
    return (
      <div className="flex justify-center py-12">
        <AccessDeniedCard message="You need Discord Bot access to view this page." />
      </div>
    );
  }

  const canManage = hasPermission("manage:discord-bot");

  return (
    <div>
      <PageHeader title="Discord Bot" />

      <Tabs value={tab} className="mb-6">
        <TabsList variant="line">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "overview" && <OverviewTab apiToken={apiToken} />}
      {tab === "tickets" && <TicketsTab apiToken={apiToken} />}
      {tab === "prospects" && <ProspectsTab apiToken={apiToken} canManage={canManage} />}
      {tab === "messages" && <MessagesTab apiToken={apiToken} />}
      {tab === "logs" && <LogsTab apiToken={apiToken} />}
      {tab === "timeouts" && <TimeoutsTab apiToken={apiToken} canManage={canManage} />}
    </div>
  );
}
