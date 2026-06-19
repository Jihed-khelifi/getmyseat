import type { SeatStatus } from "@/features/seating/model/seat-types";
import { seatStatusLabel } from "@/features/seating/render/draw-seats";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import { formatPrice } from "@/features/seating/a11y/announcements";
import { cn } from "@/lib/utils";

const STATUS_ITEMS: Array<{
  status: SeatStatus | "selected";
  varName: string;
  label: string;
}> = [
  {
    status: "available",
    varName: "--seat-available",
    label: seatStatusLabel("available"),
  },
  { status: "selected", varName: "--seat-selected", label: "Selected" },
  {
    status: "reserved",
    varName: "--seat-reserved",
    label: seatStatusLabel("reserved"),
  },
  { status: "held", varName: "--seat-held", label: seatStatusLabel("held") },
  { status: "sold", varName: "--seat-sold", label: seatStatusLabel("sold") },
];

/** Same deterministic fallback palette used by the heat-map renderer. */
const HEATMAP_FALLBACK = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
];

/**
 * Semantic legend. In status mode the swatch colors come from the same CSS
 * variables the canvas reads, so legend and map never drift; in heat-map mode
 * (plan 09, Phase 3) it switches to a price-tier legend that mirrors the
 * heat-map colors.
 */
export function SeatLegend({ className }: { className?: string }) {
  const heatmap = useSeatingStore((s) => s.heatmap);
  const venue = useSeatingStore((s) => s.venue);

  if (heatmap && venue) {
    const tiers = [...venue.priceTiersById.values()];
    return (
      <ul
        className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
        aria-label="Price tier legend"
      >
        {tiers.map((tier, i) => (
          <li key={tier.id} className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block size-3 rounded-full"
              style={{
                backgroundColor:
                  tier.color ?? HEATMAP_FALLBACK[i % HEATMAP_FALLBACK.length],
              }}
            />
            <span>
              {tier.label} · {formatPrice(tier.priceCents, venue.currency)}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
      aria-label="Seat status legend"
    >
      {STATUS_ITEMS.map((item) => (
        <li key={item.status} className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block size-3 rounded-full"
            style={{ backgroundColor: `var(${item.varName})` }}
          />
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}
