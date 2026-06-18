import {
  computeSummary,
  useSeatingStore,
} from "@/features/seating/state/seating-store";
import { formatPrice } from "@/features/seating/a11y/announcements";
import { MAX_SELECTION } from "@/features/seating/model/seat-types";
import { cn } from "@/lib/utils";

/**
 * Seat details + live selection summary.
 *
 * Plan 02: this is a semantic accessibility surface, not just visual chrome —
 * any detail available on hover is also available here on focus/selection. It
 * renders as a side panel on desktop and inside a bottom sheet on small screens
 * (`bare` drops the card chrome so it nests cleanly in the sheet). Selection
 * actions route through the store's single `toggleSeat` path.
 */
export function SeatDetailsSheet({
  className,
  bare = false,
}: {
  className?: string;
  bare?: boolean;
}) {
  const venue = useSeatingStore((s) => s.venue);
  const focusedSeatId = useSeatingStore((s) => s.focusedSeatId);
  const selectedSeatIds = useSeatingStore((s) => s.selectedSeatIds);
  const toggleSeat = useSeatingStore((s) => s.toggleSeat);
  const clearSelection = useSeatingStore((s) => s.clearSelection);

  if (!venue) return null;

  const summary = computeSummary(venue, selectedSeatIds);
  const focused = focusedSeatId
    ? venue.seatsById.get(focusedSeatId)
    : undefined;
  const focusedTier = focused
    ? venue.priceTiersById.get(focused.priceTierId)
    : undefined;
  const isFocusedSelected = focused ? selectedSeatIds.has(focused.id) : false;

  return (
    <aside
      className={cn(
        "flex flex-col gap-4 text-card-foreground",
        !bare && "rounded-lg border bg-card p-4",
        className,
      )}
      aria-label="Seat details and selection summary"
    >
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground">
          Focused seat
        </h2>
        {focused ? (
          <div className="mt-2 space-y-1">
            <p className="font-medium">
              {venue.sectionsById.get(focused.sectionId)?.label} · Row{" "}
              {venue.rowsById.get(focused.rowId)?.label} · Seat {focused.label}
            </p>
            <p className="text-sm text-muted-foreground capitalize">
              {focused.status}
            </p>
            {focusedTier && (
              <p className="text-sm">
                {formatPrice(focusedTier.priceCents, venue.currency)}
              </p>
            )}
            <button
              type="button"
              className="mt-2 inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={focused.status !== "available" && !isFocusedSelected}
              onClick={() => toggleSeat(focused.id)}
            >
              {isFocusedSelected ? "Remove seat" : "Select seat"}
            </button>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Focus or tap a seat to see details.
          </p>
        )}
      </section>

      <section aria-live="polite">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Selection ({summary.count}/{MAX_SELECTION})
        </h2>
        {summary.count === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            No seats selected yet.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            <ul className="space-y-1 text-sm">
              {summary.byTier.map(({ tier, count, subtotalCents }) => (
                <li key={tier.id} className="flex justify-between">
                  <span>
                    {count} × {tier.label}
                  </span>
                  <span>{formatPrice(subtotalCents, venue.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t pt-2 font-semibold">
              <span>Subtotal</span>
              <span>{formatPrice(summary.subtotalCents, venue.currency)}</span>
            </div>
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={clearSelection}
            >
              Clear selection
            </button>
          </div>
        )}
      </section>
    </aside>
  );
}
