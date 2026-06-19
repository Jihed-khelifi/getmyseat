import { useEffect, useState } from "react";
import { ApiError, getEvent, updateEvent, type EventInput } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EMPTY: EventInput = {
  name: "",
  date: "",
  description: "",
  arenaLocation: "",
  updates: [],
};

/**
 * Event editor (plan 10, Phase 5). Loads the current event, lets the operator
 * edit the display fields, and persists via `PUT /admin/event`. The backend
 * broadcasts the change so the user-facing banner updates without a reload.
 * `updates` is edited as one-per-line text for simplicity.
 */
export function EventEditor({
  token,
  onUnauthorized,
}: {
  token: string;
  onUnauthorized: () => void;
}) {
  const [form, setForm] = useState<EventInput>(EMPTY);
  const [updatesText, setUpdatesText] = useState("");
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEvent()
      .then((e) => {
        if (cancelled) return;
        setForm({
          name: e.name,
          date: e.date,
          description: e.description,
          arenaLocation: e.arenaLocation,
          updates: e.updates,
        });
        setUpdatesText(e.updates.join("\n"));
      })
      .catch(() => {
        /* leave the form empty if the event cannot be loaded */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function field<K extends keyof EventInput>(
    key: K,
    value: EventInput[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setPending(true);
    setStatus("");
    const updates = updatesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    try {
      await updateEvent(token, { ...form, updates });
      setStatus("Saved. The public banner now reflects this event.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setStatus("Could not save the event.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card aria-label="Event editor">
      <CardHeader>
        <CardTitle className="text-sm text-muted-foreground">
          Event &amp; arena
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <Field id="event-name" label="Name">
            <Input
              id="event-name"
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
              required
            />
          </Field>
          <Field id="event-date" label="Date">
            <Input
              id="event-date"
              value={form.date}
              onChange={(e) => field("date", e.target.value)}
            />
          </Field>
          <Field id="event-location" label="Arena location">
            <Input
              id="event-location"
              value={form.arenaLocation}
              onChange={(e) => field("arenaLocation", e.target.value)}
            />
          </Field>
          <Field id="event-description" label="Description">
            <Textarea
              id="event-description"
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
              rows={3}
            />
          </Field>
          <Field id="event-updates" label="Updates (one per line)">
            <Textarea
              id="event-updates"
              value={updatesText}
              onChange={(e) => setUpdatesText(e.target.value)}
              rows={3}
            />
          </Field>
          {status && <p className="text-sm text-muted-foreground">{status}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save event"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
