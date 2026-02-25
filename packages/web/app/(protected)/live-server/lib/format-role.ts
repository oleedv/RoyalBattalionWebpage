export function formatRole(role: string): string {
  if (!role || typeof role !== "string") return role ? String(role) : "Unknown";
  // SquadJS roles: "USA_Rifleman_01", "RUS_Medic_02", "CAF_SL_01", etc.
  const parts = role.split("_");
  if (parts.length < 2) return role;
  // Remove faction prefix and trailing number
  const filtered = parts.slice(1).filter((p) => !/^\d+$/.test(p));
  return filtered.join(" ") || role;
}
