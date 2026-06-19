/**
 * Event service (plan 10, Phase 4).
 *
 * Coordinates reads/writes of the event metadata and notifies subscribers when
 * it changes, so the realtime broadcaster can stream an `event-updated` signal
 * to user-facing clients (the visible payoff of an admin edit) without the
 * service knowing about WebSockets — exactly like the seat-status store's
 * `onChange`.
 */
import type { EventRepository } from "../repositories/event.repository.js";
import type { EventInfo, EventInput } from "../types/event.js";

export type EventListener = (event: EventInfo) => void;

export class EventService {
  private readonly listeners = new Set<EventListener>();

  constructor(private readonly repo: EventRepository) {}

  /** Subscribe to event changes; returns an unsubscribe function. */
  onChange(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Current event metadata (public `GET /event` + admin reads). */
  getEvent(): EventInfo {
    return this.repo.get();
  }

  /** Replace the event metadata, persist it, and notify subscribers. */
  updateEvent(input: EventInput): EventInfo {
    const event = this.repo.save({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    for (const listener of this.listeners) listener(event);
    return event;
  }
}
