/**
 * Event/arena domain types (plan 10, Phase 4).
 *
 * The operator-editable metadata the user-facing app displays: event name,
 * date, description, arena location, and a list of updates. Only display fields
 * live here — no operational data is exposed through the public `GET /event`.
 */

export interface EventInfo {
  /** Event name (e.g. "Spring Gala"). */
  name: string;
  /** Free-form date/time string as entered by the operator. */
  date: string;
  /** Short event description. */
  description: string;
  /** Arena / venue location text. */
  arenaLocation: string;
  /** Operator updates / announcements, newest-first by convention. */
  updates: string[];
  /** ISO-8601 timestamp of the last edit. */
  updatedAt: string;
}

/** Validated input accepted by `PUT /admin/event` (no `updatedAt`). */
export interface EventInput {
  name: string;
  date: string;
  description: string;
  arenaLocation: string;
  updates: string[];
}
