interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search...",
  className,
}: SearchInputProps) {
  return (
    <div className={`relative ${className || ""}`}>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-sm border border-border bg-bg-tertiary px-4 py-2 pr-8 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none`}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-primary"
          aria-label="Clear search"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4l8 8M12 4L4 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
