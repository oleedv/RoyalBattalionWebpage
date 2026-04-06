"use client";

import dynamic from "next/dynamic";
import "swagger-ui-react/swagger-ui.css";
import { usePermissions } from "@/lib/permission-context";

const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false });

export default function ApiDocsPage() {
  const { hasPermission } = usePermissions();

  if (!hasPermission("developer")) {
    return <div className="text-danger">Insufficient permissions.</div>;
  }

  return (
    <div className="min-h-screen bg-white">
      <SwaggerUI url="/openapi.yaml" />
    </div>
  );
}
