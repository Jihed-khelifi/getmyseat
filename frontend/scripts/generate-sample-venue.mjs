// Generates a representative `public/venue.json` for development and review.
// Plan 03 may replace this with the official dataset; the schema is the contract
// (see ../src/features/seating/model/seat-validation.ts).
//
// Run: node scripts/generate-sample-venue.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "../public/venue.json");

const priceTiers = [
    { id: "tier-floor", label: "Floor", priceCents: 28000, color: "#6366f1" },
    { id: "tier-lower", label: "Lower bowl", priceCents: 18000, color: "#0ea5e9" },
    { id: "tier-upper", label: "Upper bowl", priceCents: 9000, color: "#10b981" },
];

const statuses = ["available", "available", "available", "reserved", "sold", "held"];
let statusCursor = 0;
const nextStatus = () => statuses[statusCursor++ % statuses.length];

const ROW_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const sectionDefs = [
    { id: "sec-a", label: "Section A", tier: "tier-floor", rows: 8, cols: 18, originX: 120, originY: 120 },
    { id: "sec-b", label: "Section B", tier: "tier-lower", rows: 10, cols: 20, originX: 760, originY: 120 },
    { id: "sec-c", label: "Section C", tier: "tier-upper", rows: 12, cols: 24, originX: 120, originY: 620 },
];

const SEAT_GAP = 26;
const ROW_GAP = 30;

const sections = sectionDefs.map((def) => ({
    id: def.id,
    label: def.label,
    rows: Array.from({ length: def.rows }, (_, r) => {
        const rowLabel = ROW_LABELS[r] ?? `R${r + 1}`;
        return {
            id: `${def.id}-row-${r + 1}`,
            label: rowLabel,
            seats: Array.from({ length: def.cols }, (_, c) => ({
                id: `${def.id}-${rowLabel}-${c + 1}`,
                label: String(c + 1),
                x: def.originX + c * SEAT_GAP,
                y: def.originY + r * ROW_GAP,
                status: nextStatus(),
                priceTierId: def.tier,
            })),
        };
    }),
}));

const venue = {
    venueId: "getmyseat-arena",
    name: "GetMySeat Arena (sample)",
    currency: "USD",
    map: { width: 1280, height: 1040 },
    priceTiers,
    sections,
};

const seatCount = sections.reduce(
    (n, s) => n + s.rows.reduce((m, r) => m + r.seats.length, 0),
    0,
);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(venue, null, 2)}\n`);
console.log(`Wrote ${outPath} with ${seatCount} seats.`);
