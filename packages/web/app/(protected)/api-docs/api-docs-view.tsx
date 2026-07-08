"use client";

import { AccessDeniedCard } from "@/components/access-denied-card";
import { PageHeader } from "@/components/page-header";
import { SwaggerEmbed } from "./swagger-embed";

export function ApiDocsView({ canView }: { canView: boolean }) {
  if (!canView) {
    return (
      <div className="flex justify-center py-12">
        <AccessDeniedCard message="You need developer access to view the API documentation." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        breadcrumb={["Admin", "API Docs"]}
        title="API Documentation"
        description="Interactive reference for all REST endpoints exposed by the Royal Battalion API."
      />
      <div className="rounded-sm bg-bg-secondary p-1">
        <SwaggerEmbed />
      </div>
    </div>
  );
}
