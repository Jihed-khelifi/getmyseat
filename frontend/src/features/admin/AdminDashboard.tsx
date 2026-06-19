import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getAdminLogs,
  getAdminMetrics,
  getAdminOverview,
  type AdminLogs,
  type AdminMetrics,
  type AdminOverview,
} from "@/lib/api";
import { EventEditor } from "./EventEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Format a 0–1 rate as a percentage with one decimal. */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function ms(value: number): string {
  return `${value.toFixed(1)} ms`;
}

/**
 * Admin dashboard (plan 10, Phase 5). Shows operational overview, the
 * time-bucketed metrics series, recent logs/errors, and the event editor. Data
 * is polled on a light interval so live metrics stay current without a refresh.
 * Any 401 bubbles up to the parent so the operator is returned to login.
 */
export function AdminDashboard({
  token,
  onSignOut,
  onUnauthorized,
}: {
  token: string;
  onSignOut: () => void;
  onUnauthorized: () => void;
}) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [logs, setLogs] = useState<AdminLogs | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [o, m, l] = await Promise.all([
        getAdminOverview(token),
        getAdminMetrics(token),
        getAdminLogs(token),
      ]);
      setOverview(o);
      setMetrics(m);
      setLogs(l);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized();
        return;
      }
      setError("Could not load admin data.");
    }
  }, [token, onUnauthorized]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Admin dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Operational metrics, logs, and event management.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onSignOut}>
          Sign out
        </Button>
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {overview && (
        <section
          aria-label="Overview"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <Stat
            label="Visitors with selections"
            value={overview.selections.visitors}
          />
          <Stat label="Seats selected" value={overview.selections.totalSeats} />
          <Stat label="Requests" value={overview.traffic.requests} />
          <Stat label="Error rate" value={pct(overview.traffic.errorRate)} />
          <Stat
            label="Avg response"
            value={ms(overview.traffic.averageResponseTimeMs)}
          />
          <Stat label="Cache hit rate" value={pct(overview.cache.hitRate)} />
          <Stat label="Cache size" value={overview.cache.size} />
          <Stat label="Live clients" value={overview.realtimeClients} />
        </section>
      )}

      {overview && (
        <Card aria-label="Seat status">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Seats by status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Object.entries(overview.seats).map(([status, count]) => (
                <Stat key={status} label={status} value={count} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {metrics && (
        <Card aria-label="Performance metrics">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Performance over time (per bucket)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Reqs</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Avg ms</TableHead>
                  <TableHead>Max ms</TableHead>
                  <TableHead>Cache hit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.bucketSeries
                  .slice(-12)
                  .reverse()
                  .map((b) => (
                    <TableRow key={b.at}>
                      <TableCell className="font-mono text-xs">
                        {new Date(b.at).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>{b.requests}</TableCell>
                      <TableCell>{b.errors}</TableCell>
                      <TableCell>
                        {b.averageResponseTimeMs.toFixed(1)}
                      </TableCell>
                      <TableCell>{b.maxResponseTimeMs.toFixed(1)}</TableCell>
                      <TableCell>{pct(b.cacheHitRate)}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {logs && (
        <Card aria-label="Recent logs">
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">
              Recent requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="max-h-60 space-y-1 overflow-y-auto font-mono text-xs">
              {logs.requests.map((r, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">
                    {new Date(r.at).toLocaleTimeString()}
                  </span>{" "}
                  {r.method} {r.path} → {r.statusCode} (
                  {r.durationMs.toFixed(0)}ms)
                  {r.cacheOutcome ? ` [${r.cacheOutcome}]` : ""}
                </li>
              ))}
            </ul>
            {logs.errors.length > 0 && (
              <>
                <h3 className="mt-3 text-sm font-semibold text-destructive">
                  Recent errors
                </h3>
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
                  {logs.errors.map((e, i) => (
                    <li key={i}>
                      {new Date(e.at).toLocaleTimeString()} {e.method} {e.path}:{" "}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <EventEditor token={token} onUnauthorized={onUnauthorized} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-3 shadow-none">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </Card>
  );
}
