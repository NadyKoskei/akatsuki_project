/** Money is stored in minor units (cents) everywhere; formatting is the only place it becomes major. */

export function formatMoney(minorUnits: number, currency = "KES"): string {
  const major = minorUnits / 100;
  return `${currency} ${major.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

/** Compact form for stat tiles and axis ticks: 12.9K, 4.2M. */
export function formatCompact(minorUnits: number, currency?: string): string {
  const major = Math.abs(minorUnits) / 100;
  const sign = minorUnits < 0 ? "-" : "";
  const body =
    major >= 1_000_000
      ? `${(major / 1_000_000).toFixed(major >= 10_000_000 ? 0 : 1)}M`
      : major >= 1_000
        ? `${(major / 1_000).toFixed(major >= 10_000 ? 0 : 1)}K`
        : major.toFixed(0);
  return currency ? `${currency} ${sign}${body}` : `${sign}${body}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
