"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/skeleton";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SidebarProvider } from "@/components/ui/sidebar";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { FilterBar } from "@/components/filter-bar";
import { DataTable } from "@/components/data-table";
import { PageHeader } from "@/components/page-header";
import { StatCard, StatGroup } from "@/components/stat-card";
import { Sparkline, MultiSparkline, AreaSparkline } from "@/components/sparkline";
import { ConnectionStatus, ServerScope } from "@/components/connection-status";
import { TerminalPane, type TerminalLine } from "@/components/terminal-pane";
import { AccessDeniedCard } from "@/components/access-denied-card";
import { DownloadButton } from "@/components/download-button";
import { SQUAD_COMMANDS, isDestructiveCommand } from "shared";
import { ConfigCard } from "@/components/config-card";
import { CapacityBar } from "@/components/capacity-bar";
import { TimezoneCombobox } from "@/components/timezone-combobox";
import { InfoTip } from "@/components/info-tip";
import { FieldTip } from "@/components/field-tip";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/shell/app-sidebar";

type DemoRow = {
  id: string;
  name: string;
  steamId: string;
  clan: string;
  expires: string;
};

const demoColumns: ColumnDef<DemoRow, unknown>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "steamId", header: "Steam ID", meta: { mono: true } },
  { accessorKey: "clan", header: "Clan" },
  { accessorKey: "expires", header: "Expires", meta: { mono: true } },
];

const demoData: DemoRow[] = Array.from({ length: 25 }, (_, i) => ({
  id: String(i),
  name: `Player_${i}`,
  steamId: `7656119801234${String(i).padStart(2, "0")}`,
  clan: i % 3 === 0 ? "RB" : "",
  expires: "2026-08-01",
}));

export function DesignGallery() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 p-8">
      <PageHeader
        breadcrumb={["Design System"]}
        title="GILDED REGIMENT"
        description="Phase 0 component gallery. Toggle the theme to verify parchment."
        actions={<ThemeToggle />}
      />

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Buttons</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="gold">Gold</Button>
          <Button variant="outlineGold">Outline Gold</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="destructive">Destructive</Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Badges &amp; status</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Badge</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <StatusBadge tone="success" pulse>
            Online
          </StatusBadge>
          <StatusBadge tone="danger">Offline</StatusBadge>
          <StatusBadge tone="warning">Pending</StatusBadge>
          <StatusBadge tone="accent">Whitelist</StatusBadge>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Stats</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Players Online" value="87/100" hint="Narva AAS v2">
            <Sparkline values={[40, 55, 60, 72, 80, 87]} />
          </StatCard>
          <StatCard label="Queue" value="4">
            <Sparkline values={[0, 2, 6, 3, 4, 4]} className="text-warning" />
          </StatCard>
          <StatCard label="Admins on Duty" value="3" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">
          Search, filters &amp; table
        </h2>
        <div className="flex gap-2">
          <SearchInput
            onSearch={() => {}}
            placeholder="Search steam ID, name, clan..."
            className="flex-1"
          />
          <Button variant="outlineGold">Filters</Button>
          <Button variant="gold">Add Entry</Button>
        </div>
        <FilterBar
          activeFilters={[{ key: "clan", label: "Clan: RB" }]}
          onClear={() => {}}
          onClearAll={() => {}}
        />
        <DataTable
          columns={demoColumns}
          data={demoData}
          getRowId={(r) => r.id}
          enableSelection
          pageSize={8}
          bulkActions={(rows, clear) => (
            <>
              <span className="text-sm text-text-secondary">
                {rows.length} selected
              </span>
              <Button variant="outlineGold" size="sm" onClick={clear}>
                Clear
              </Button>
            </>
          )}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Overlays &amp; inputs</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger
              render={<Button variant="outlineGold">Open Dialog</Button>}
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Confirm Action</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-text-secondary">
                Dialog body on the popover surface.
              </p>
            </DialogContent>
          </Dialog>
          <Tabs defaultValue="a" className="w-64">
            <TabsList>
              <TabsTrigger value="a">Entries</TabsTrigger>
              <TabsTrigger value="b">Requests</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="text-sm text-text-secondary">
              Tab A content
            </TabsContent>
            <TabsContent value="b" className="text-sm text-text-secondary">
              Tab B content
            </TabsContent>
          </Tabs>
          <Input placeholder="Plain input" className="w-48" />
          <Skeleton className="h-8 w-32" />
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <Switch defaultChecked aria-label="Demo switch" /> Enabled
          </label>
          <ToggleGroup defaultValue={["30d"]} aria-label="Range">
            <ToggleGroupItem value="7d">7D</ToggleGroupItem>
            <ToggleGroupItem value="30d">30D</ToggleGroupItem>
            <ToggleGroupItem value="90d">90D</ToggleGroupItem>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Card className="p-0">
          <EmptyState
            message="No whitelist entries match your filters."
            action={
              <Button variant="outlineGold" size="sm">
                Clear filters
              </Button>
            }
          />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Dashboard composites</h2>
        <GalleryDashboardComposites />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">
          Admin sidebar (embedded preview)
        </h2>
        <div className="h-[420px] overflow-hidden rounded-sm border border-border">
          <SidebarProvider>
            <AppSidebar permissions={["developer"]} userName="Preview User" />
            <main className="flex-1 p-6">
              <PageHeader breadcrumb={["Operations", "Whitelist"]} title="WHITELIST" />
              <p className="text-sm text-text-secondary">
                Collapse with the rail handle, the <kbd>[</kbd> key, or Ctrl/Cmd+B.
              </p>
            </main>
          </SidebarProvider>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold tracking-wide text-text-primary">
          Live Server composites
        </h2>
        <div className="flex flex-wrap items-center gap-6">
          <ConnectionStatus tone="success" label="Connected" />
          <ConnectionStatus tone="warning" label="SquadJS disconnected" active />
          <ConnectionStatus tone="danger" label="Disconnected" />
          <ServerScope servers={["main", "battle"]} active="main" onSwitch={() => {}} variant="select" />
        </div>
        <ServerScope servers={["main", "battle"]} active="main" onSwitch={() => {}} variant="tabs" />
        <div className="relative h-10 w-40 overflow-hidden rounded-sm border border-border">
          <AreaSparkline values={[3, 8, 5, 12, 9, 16, 22]} className="text-accent" fixedMax={30} />
        </div>
        <TerminalPane
          className="h-64"
          commands={SQUAD_COMMANDS}
          isDestructive={isDestructiveCommand}
          onSubmit={() => {}}
          onClear={() => {}}
          placeholder="AdminBroadcast Hello"
          emptyHint="Type an RCON command and press Enter."
          lines={
            [
              { id: 1, command: "ListPlayers", output: "2 players online", success: true },
              { id: 2, command: "AdminKick 77 afk", output: "", success: false, error: "player not found" },
            ] as TerminalLine[]
          }
          status={<ConnectionStatus tone="success" label="Connected · main" />}
        />
        <AccessDeniedCard
          message="You do not have access to the RCON console."
          cta={{ href: "/live-server", label: "Open Live Server Monitor" }}
        />
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Tickets composites</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="ticket-open" />
          <StatusBadge variant="ticket-closing" />
          <StatusBadge variant="ticket-closed" />
          <StatusBadge variant="ticket-accepted" />
          <StatusBadge variant="ticket-denied" />
          <StatusBadge variant="ticket-legacy" />
          <DownloadButton text="Ticket #1 [open]" filename="ticket-1.txt" label="Export .txt" />
        </div>
      </section>
    </div>
  );
}

function GalleryDashboardComposites() {
  const [tz, setTz] = useState("Europe/Oslo");
  return (
    <div className="space-y-4">
      <ConfigCard
        title="Birthday announcements"
        description="ConfigCard: permission-gated feature config on a content page."
        headerAction={
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <Switch defaultChecked aria-label="Enabled" /> Enabled
          </label>
        }
        footer={
          <Button variant="gold" size="sm">
            Save
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Timezone
            </span>
            <TimezoneCombobox value={tz} onChange={setTz} />
          </div>
          <div>
            <span className="mb-1 block text-[10px] font-medium tracking-wider text-text-muted uppercase">
              Capacity
            </span>
            <CapacityBar value={87} max={100} className="mt-3" />
          </div>
        </div>
      </ConfigCard>

      <StatGroup label="Stat tiles">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="KDR" value="1.42" accent tip="Kills divided by deaths." />
          <StatCard label="Playtime" value="42h" hint="last 30 days" />
          <StatCard label="Open Tickets" value={3} href="#" />
          <StatCard label="Trend" value="87">
            <MultiSparkline
              series={[
                { values: [40, 60, 87], label: "Players", className: "text-accent" },
                { values: [0, 2, 4], label: "Queue", className: "text-warning" },
              ]}
              fixedMax={100}
              className="w-28"
            />
          </StatCard>
        </div>
      </StatGroup>

      <p className="text-xs text-text-secondary">
        Read-only field:{" "}
        <FieldTip>
          <code className="font-mono text-accent">76561198012345678</code>
        </FieldTip>{" "}
        · Explainer: <InfoTip label="Seed time" text="Time on the server while seeding." />
      </p>
    </div>
  );
}
