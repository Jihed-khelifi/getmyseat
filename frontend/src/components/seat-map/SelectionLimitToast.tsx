import { useEffect, useState } from "react";
import { MAX_SELECTION } from "@/features/seating/model/seat-types";
import { announceRejection } from "@/features/seating/a11y/announcements";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import { cn } from "@/lib/utils";

/**
 * Visible counterpart to the screen-reader-only {@link AnnouncementRegion}.
 *
 * When the user tries to select more than `MAX_SELECTION` seats, the store
 * records a `limit-reached` rejection. The aria-live region announces it to
 * assistive tech; this toast surfaces the same message visually. It latches the
 * message into local state with its own dismiss timer so it stays readable even
 * after the store auto-acknowledges the rejection.
 */
const VISIBLE_MS = 3000;

export function SelectionLimitToast() {
  const rejection = useSeatingStore((s) => s.lastRejection);
  const selectedCount = useSeatingStore((s) => s.selectedSeatIds.size);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (rejection?.reason !== "limit-reached") return;
    setMessage(announceRejection(rejection, MAX_SELECTION).message);
    const timer = window.setTimeout(() => setMessage(null), VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [rejection]);

  // Dismiss as soon as the user frees up room (selection back within the cap).
  useEffect(() => {
    if (selectedCount <= MAX_SELECTION - 1) setMessage(null);
  }, [selectedCount]);

  if (!message) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-30 flex justify-center px-4"
      role="status"
    >
      <div
        className={cn(
          "pointer-events-auto rounded-lg border border-destructive/30 bg-card px-4 py-2",
          "text-sm font-medium text-destructive shadow-lg",
        )}
      >
        {message}
      </div>
    </div>
  );
}
