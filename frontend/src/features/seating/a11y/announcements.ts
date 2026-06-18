/**
 * Accessible announcements — message builders for an `aria-live` region.
 *
 * Ownership (plan 02): selection changes and invalid actions must be perceivable
 * without a mouse and without color alone. These pure builders produce the
 * polite/assertive strings the map component pushes into a visually-hidden live
 * region. Keeping them pure makes the wording unit-testable.
 */
import type {
  NormalizedVenue,
  Seat,
  SelectionSummary,
} from "../model/seat-types";
import type { SelectionRejection } from "../state/seating-store";

export interface Announcement {
  message: string;
  politeness: "polite" | "assertive";
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
  }).format(cents / 100);
}

function seatDescription(venue: NormalizedVenue, seat: Seat): string {
  const section = venue.sectionsById.get(seat.sectionId)?.label ?? "";
  const row = venue.rowsById.get(seat.rowId)?.label ?? "";
  return `Section ${section}, row ${row}, seat ${seat.label}`;
}

export function announceFocus(
  venue: NormalizedVenue,
  seat: Seat,
): Announcement {
  const tier = venue.priceTiersById.get(seat.priceTierId);
  const price = tier ? `, ${formatPrice(tier.priceCents, venue.currency)}` : "";
  return {
    politeness: "polite",
    message: `${seatDescription(venue, seat)}${price}. ${seat.status}.`,
  };
}

export function announceSelection(
  venue: NormalizedVenue,
  seat: Seat,
  selected: boolean,
  summary: SelectionSummary,
): Announcement {
  const verb = selected ? "Selected" : "Removed";
  return {
    politeness: "polite",
    message: `${verb} ${seatDescription(venue, seat)}. ${summary.count} selected, subtotal ${formatPrice(summary.subtotalCents, summary.currency)}.`,
  };
}

export function announceRejection(
  rejection: SelectionRejection & { ok: false },
  maxSelection: number,
): Announcement {
  const message =
    rejection.reason === "limit-reached"
      ? `You can select at most ${maxSelection} seats. Remove a seat before adding another.`
      : rejection.reason === "not-selectable"
        ? "That seat is not available to select."
        : "That seat could not be found.";
  return { politeness: "assertive", message };
}
