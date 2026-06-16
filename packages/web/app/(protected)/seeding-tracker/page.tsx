"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SeedingTrackerRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/seeding"); }, [router]);
  return null;
}
