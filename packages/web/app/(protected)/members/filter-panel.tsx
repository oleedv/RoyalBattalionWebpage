"use client";

import type { DiscordRole } from "shared";
import { COUNTRIES } from "shared";
import type { MemberFilters } from "./lib";

function RangeFilter({
  label,
  min,
  max,
  onMinChange,
  onMaxChange,
  unit,
}: {
  label: string;
  min: string;
  max: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  unit?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={min}
          onChange={(e) => onMinChange(e.target.value)}
          placeholder="Min"
          className="w-20 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        <span className="text-text-muted text-xs">-</span>
        <input
          type="number"
          value={max}
          onChange={(e) => onMaxChange(e.target.value)}
          placeholder="Max"
          className="w-20 rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
        />
        {unit && <span className="text-[10px] text-text-muted">{unit}</span>}
      </div>
    </div>
  );
}

interface MembersFilterPanelProps {
  filters: MemberFilters;
  setFilters: (patch: Partial<MemberFilters>) => void;
  allRoles: DiscordRole[];
  onClearAll: () => void;
}

export function MembersFilterPanel({
  filters,
  setFilters,
  allRoles,
  onClearAll,
}: MembersFilterPanelProps) {
  function toggleRole(roleId: string) {
    const current = filters.roleIds;
    if (current.includes(roleId)) {
      setFilters({ roleIds: current.filter((id) => id !== roleId) });
    } else {
      setFilters({ roleIds: [...current, roleId] });
    }
  }

  return (
    <div className="facet-border mb-4 rounded-sm bg-bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-text-muted">Advanced Filters</span>
        <button
          onClick={onClearAll}
          className="text-xs text-text-muted transition-colors hover:text-text-primary"
        >
          Clear All
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {/* Logged-in status */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Logged In</div>
          <select
            aria-label="Logged In"
            value={filters.loggedIn}
            onChange={(e) => setFilters({ loggedIn: e.target.value as "all" | "yes" | "no" })}
            className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="all">All</option>
            <option value="yes">Logged In</option>
            <option value="no">Discord Only</option>
          </select>
        </div>

        {/* Country */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Country</div>
          <input
            type="text"
            list="filter-country-list"
            value={filters.country}
            onChange={(e) => setFilters({ country: e.target.value })}
            placeholder="Country..."
            className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
          <datalist id="filter-country-list">
            {COUNTRIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        {/* Roles */}
        <div className="col-span-2">
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Roles</div>
          <div className="flex flex-wrap gap-1.5">
            {allRoles.map((role) => (
              <button
                key={role.id}
                onClick={() => toggleRole(role.id)}
                className={`rounded-sm border px-2 py-0.5 text-xs transition-colors ${
                  filters.roleIds.includes(role.id)
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border text-text-muted hover:border-accent/20 hover:text-text-secondary"
                }`}
              >
                {role.name}
              </button>
            ))}
          </div>
        </div>

        {/* Activity (hours played) ranges */}
        <RangeFilter
          label="Activity 30d"
          min={filters.playtime30[0]}
          max={filters.playtime30[1]}
          onMinChange={(v) => setFilters({ playtime30: [v, filters.playtime30[1]] })}
          onMaxChange={(v) => setFilters({ playtime30: [filters.playtime30[0], v] })}
          unit="hrs"
        />
        <RangeFilter
          label="Activity 90d"
          min={filters.playtime90[0]}
          max={filters.playtime90[1]}
          onMinChange={(v) => setFilters({ playtime90: [v, filters.playtime90[1]] })}
          onMaxChange={(v) => setFilters({ playtime90: [filters.playtime90[0], v] })}
          unit="hrs"
        />
        <RangeFilter
          label="Seed Time 30d"
          min={filters.seed30[0]}
          max={filters.seed30[1]}
          onMinChange={(v) => setFilters({ seed30: [v, filters.seed30[1]] })}
          onMaxChange={(v) => setFilters({ seed30: [filters.seed30[0], v] })}
          unit="hrs"
        />
        <RangeFilter
          label="Seed Time 90d"
          min={filters.seed90[0]}
          max={filters.seed90[1]}
          onMinChange={(v) => setFilters({ seed90: [v, filters.seed90[1]] })}
          onMaxChange={(v) => setFilters({ seed90: [filters.seed90[0], v] })}
          unit="hrs"
        />

        {/* Date ranges */}
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Joined (from - to)</div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={filters.joinFrom}
              onChange={(e) => setFilters({ joinFrom: e.target.value })}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
            <input
              type="date"
              value={filters.joinTo}
              onChange={(e) => setFilters({ joinTo: e.target.value })}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-text-muted">Membership (from - to)</div>
          <div className="flex items-center gap-1">
            <input
              type="date"
              value={filters.memberFrom}
              onChange={(e) => setFilters({ memberFrom: e.target.value })}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
            <input
              type="date"
              value={filters.memberTo}
              onChange={(e) => setFilters({ memberTo: e.target.value })}
              className="w-full rounded-sm border border-border bg-bg-tertiary px-2 py-1 text-xs text-text-primary focus:border-accent focus:outline-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
