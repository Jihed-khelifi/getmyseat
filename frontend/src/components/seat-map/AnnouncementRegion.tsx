import { useEffect } from "react";
import {
  MAX_SELECTION,
  type NormalizedVenue,
} from "@/features/seating/model/seat-types";
import {
  announceFocus,
  announceRejection,
} from "@/features/seating/a11y/announcements";
import { useSeatingStore } from "@/features/seating/state/seating-store";

/**
 * Visually-hidden aria-live region. Subscribes to focus changes (polite) and
 * rejected actions (assertive) and announces them — the perceivable feedback
 * required by plan 02's accessibility constraints. Rejections auto-clear so the
 * same message can be announced again.
 */
export function AnnouncementRegion({ venue }: { venue: NormalizedVenue }) {
  const focusedSeatId = useSeatingStore((s) => s.focusedSeatId);
  const rejection = useSeatingStore((s) => s.lastRejection);
  const acknowledgeRejection = useSeatingStore((s) => s.acknowledgeRejection);

  useEffect(() => {
    if (!rejection) return;
    const timer = window.setTimeout(acknowledgeRejection, 1000);
    return () => window.clearTimeout(timer);
  }, [rejection, acknowledgeRejection]);

  const focused = focusedSeatId
    ? venue.seatsById.get(focusedSeatId)
    : undefined;
  const politeMessage = focused ? announceFocus(venue, focused).message : "";
  const assertiveMessage = rejection
    ? announceRejection(rejection, MAX_SELECTION).message
    : "";

  return (
    <div className="sr-only">
      <p aria-live="polite">{politeMessage}</p>
      <p aria-live="assertive">{assertiveMessage}</p>
    </div>
  );
}
