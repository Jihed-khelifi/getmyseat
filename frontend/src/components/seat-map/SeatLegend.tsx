import type { SeatStatus } from "@/features/seating/model/seat-types";
import { seatStatusLabel } from "@/features/seating/render/draw-seats";
import { cn } from "@/lib/utils";

const LEGEND_ITEMS: Array<{
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

/**
 * Semantic legend mapping seat colors to meanings. Colors come from the same CSS
 * variables the canvas renderer reads, so legend and map never drift.
 */
export function SeatLegend({ className }: { className?: string }) {
  return (
    <ul
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", className)}
      aria-label="Seat status legend"
    >
      {LEGEND_ITEMS.map((item) => (
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
