// packages/web/app/(protected)/tickets/page.tsx
"use client";

import { usePermissions } from "@/lib/permission-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TicketsTab from "./tickets-tab";
import ProspectsTab from "./prospects-tab";

export default function TicketsPage() {
  const { apiToken, permissions } = usePermissions();

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-3xl font-bold tracking-wide">Tickets</h1>
      </div>

      <Tabs defaultValue="tickets">
        <TabsList variant="line" className="mb-6 w-full justify-start border-b border-border">
          <TabsTrigger value="tickets">Support Tickets</TabsTrigger>
          <TabsTrigger value="prospects">Prospect Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <TicketsTab token={apiToken} permissions={permissions} />
        </TabsContent>
        <TabsContent value="prospects">
          <ProspectsTab token={apiToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
