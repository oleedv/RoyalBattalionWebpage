import { notFound } from "next/navigation";
import { DesignGallery } from "./gallery";

// Dev-only design-system gallery. Server Component so notFound() (server-only)
// can gate it out of production builds.
export default function DesignPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignGallery />;
}
