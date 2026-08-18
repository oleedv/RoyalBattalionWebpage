"use client";

import { useCallback, useRef, useState } from "react";
import { resolveDiscordNames } from "@/lib/api-client";

export const RESOLVE_IDS_CHUNK = 200;

export function useDiscordNameMap(apiToken: string | null | undefined) {
  const [nameMap, setNameMap] = useState<Record<string, string>>({});
  const nameMapRef = useRef(nameMap);
  nameMapRef.current = nameMap;
  const attemptedIdsRef = useRef(new Set<string>());

  const resolveNames = useCallback(async (ids: string[]) => {
    if (!apiToken) return;
    const unique = [...new Set(ids.filter((id) => (
      Boolean(id) && !nameMapRef.current[id] && !attemptedIdsRef.current.has(id)
    )))];
    if (unique.length === 0) return;
    for (const id of unique) attemptedIdsRef.current.add(id);

    const merged: Record<string, string> = {};
    for (let i = 0; i < unique.length; i += RESOLVE_IDS_CHUNK) {
      const res = await resolveDiscordNames(apiToken, unique.slice(i, i + RESOLVE_IDS_CHUNK));
      if (res.success && res.data) Object.assign(merged, res.data);
    }
    if (Object.keys(merged).length > 0) {
      setNameMap((prev) => ({ ...prev, ...merged }));
    }
  }, [apiToken]);

  function displayName(id: string | null): string {
    if (!id) return "--";
    return nameMap[id] || id;
  }

  return { nameMap, resolveNames, displayName };
}
