"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

/** Minimal fallback for runtimes without Intl.supportedValuesOf. */
const FALLBACK_TIMEZONES = [
  "UTC",
  "Europe/Oslo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Stockholm",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Asia/Bangkok",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function getTimezones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      const zones = Intl.supportedValuesOf("timeZone");
      return zones.includes("UTC") ? zones : ["UTC", ...zones];
    }
  } catch {
    // fall through to the static list
  }
  return FALLBACK_TIMEZONES;
}

export function TimezoneCombobox({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;
  onChange: (tz: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const timezones = useMemo(getTimezones, []);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={value || "Select timezone"}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-mono text-xs normal-case tracking-normal",
              className,
            )}
          >
            {value || "Select timezone"}
            <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-72 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search timezone..." />
          <CommandList>
            <CommandEmpty>No timezone found.</CommandEmpty>
            <CommandGroup>
              {timezones.map((tz) => (
                <CommandItem
                  key={tz}
                  value={tz}
                  onSelect={(selected) => {
                    onChange(selected);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "size-3.5",
                      tz === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="font-mono text-xs">{tz}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
