"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function RegisterRoleForm({
  onRegister,
  adding,
  error,
}: {
  onRegister: (discordRoleId: string, name: string) => Promise<boolean>;
  adding: boolean;
  error: string | null;
}) {
  const [roleId, setRoleId] = useState("");
  const [name, setName] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = roleId.trim();
    const nm = name.trim();
    if (!id || !nm) return;
    const ok = await onRegister(id, nm);
    if (ok) {
      setRoleId("");
      setName("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="facet-border mb-8 flex flex-wrap gap-3 rounded-sm bg-bg-card p-4">
      <Input
        value={roleId}
        onChange={(e) => setRoleId(e.target.value)}
        placeholder="Discord Role ID"
        className="h-auto flex-1 rounded-sm border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted"
        required
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Display Name"
        className="h-auto w-48 rounded-sm border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted"
        required
      />
      <Button type="submit" disabled={adding} variant="gold" size="lg" className="tracking-wide">
        {adding ? "Registering..." : "Register Role"}
      </Button>
      {error && <div className="w-full text-sm text-danger">{error}</div>}
    </form>
  );
}
