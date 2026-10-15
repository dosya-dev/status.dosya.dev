// Pure derivations the public page is built from: probes folded into the
// products customers recognise, products rolled up into surfaces, raw checks
// turned into a latency trend, and incident rows turned into a readable
// timeline. Nothing here touches D1 or the DOM, so all of it is unit-tested
// against real snapshots in view.unit.test.ts.
import {
  PRODUCT_GROUPS,
  productLabelFor,
  type ComponentKey,
  type GroupKey,
  type ProductKey,
  type ProbeState,
} from "./config";
import {
  barColor,
  bucketColor,
  type RangeSnapshot,
  type ComponentSnapshot,
  type DayBar,
  type IncidentRow,
  type CheckRow,
} from "./aggregate";
import { lastNBuckets } from "./time";

export type LatencySeries = Record<string, Array<number | null>>;
export type State = ProbeState | "unknown";

export interface CheckView {
  key: ComponentKey;
  label: string;
  state: State;
  uptimePct: number | null;
  latencyMs: number | null;
  /** First bucket label with data when the check is younger than the window, else null. */
  sinceDay: string | null;
}

export interface ProductView {
  key: ProductKey;
  label: string;
  description: string;
  state: State;
  uptimePct: number | null;
  latencyMs: number | null;
  latencyCheckLabel: string | null;
  latencySeries: Array<number | null>;
  bars: DayBar[];
  checks: CheckView[];
}

export interface GroupView {
  key: GroupKey;
  label: string;
  uptimePct: number | null;
  products: ProductView[];
}

const STATE_RANK: Record<State, number> = { down: 3, degraded: 2, up: 1, unknown: 0 };

function worstState(states: State[]): State {
  let worst: State = "unknown";
  for (const s of states) if (STATE_RANK[s] > STATE_RANK[worst]) worst = s;
  return worst;
}

function pct(up: number, total: number): number | null {
  return total === 0 ? null : (up / total) * 100;
}

function firstDataIndex(bars: DayBar[]): number {
  return bars.findIndex((b) => b.total > 0);
}

function mergeBars(snaps: ComponentSnapshot[], interval: boolean): DayBar[] {
  const length = snaps[0]?.bars.length ?? 0;
  const out: DayBar[] = [];
  for (let i = 0; i < length; i++) {
    let up = 0;
    let degraded = 0;
    let down = 0;
    let total = 0;
    for (const s of snaps) {
      const b = s.bars[i];
      if (!b) continue;
      up += b.up;
      degraded += b.degraded;
      down += b.down;
      total += b.total;
    }
    const p = pct(up, total);
    out.push({
      day: snaps[0].bars[i].day,
      uptimePct: p,
      color: interval ? bucketColor(up, degraded, down, total) : barColor(p),
      up,
      degraded,
      down,
      total,
    });
  }
  return out;
}

function sumBars(bars: DayBar[]): { up: number; total: number } {
  let up = 0;
  let total = 0;
  for (const b of bars) {
    up += b.up;
    total += b.total;
  }
  return { up, total };
}

export function buildGroups(snap: RangeSnapshot, latency: LatencySeries): GroupView[] {
  const interval = snap.range === "60m" || snap.range === "24h";
  const byKey = new Map<string, ComponentSnapshot>();
  for (const c of snap.components) byKey.set(c.key, c);

  return PRODUCT_GROUPS.map<GroupView>((g) => {
    let gUp = 0;
    let gTotal = 0;
    const products = g.products.map<ProductView>((p) => {
      const snaps = p.checks.map((c) => byKey.get(c.key)).filter((s): s is ComponentSnapshot => !!s);
      // A check younger than its siblings gets a "since <day>" note, so a
      // listing probe added last week is not read as a week of silence. The
      // oldest check in the product sets the baseline; it never gets the note.
      const firstIdx = snaps.map((s) => firstDataIndex(s.bars)).filter((i) => i >= 0);
      const baseline = firstIdx.length === 0 ? -1 : Math.min(...firstIdx);
      const checks: CheckView[] = p.checks.flatMap((c) => {
        const s = byKey.get(c.key);
        if (!s) return [];
        const idx = firstDataIndex(s.bars);
        return [{
          key: c.key,
          label: c.label,
          state: s.currentState,
          uptimePct: s.uptimePct,
          latencyMs: s.latencyMs,
          sinceDay: idx > baseline ? s.bars[idx].day : null,
        }];
      });
      const bars = mergeBars(snaps, interval);
      const { up, total } = sumBars(bars);
      gUp += up;
      gTotal += total;
      // The felt check: the last one that is actually reporting.
      const felt = [...checks].reverse().find((c) => c.state !== "unknown") ?? null;
      return {
        key: p.key,
        label: p.label,
        description: p.description,
        state: worstState(checks.map((c) => c.state)),
        uptimePct: pct(up, total),
        latencyMs: felt?.latencyMs ?? null,
        latencyCheckLabel: felt?.label ?? null,
        latencySeries: felt ? (latency[felt.key] ?? []) : [],
        bars,
        checks,
      };
    });
    return { key: g.key, label: g.label, uptimePct: pct(gUp, gTotal), products };
  });
}

/**
 * Mean latency of the checks that answered (anything but `down`) per hour over
 * the last 24 hours, oldest first. A timed-out check carries the timeout as
 * its latency and would otherwise turn a 5 minute blip into a cliff.
 */
export function buildLatencySeries(nowUnix: number, checks: CheckRow[]): LatencySeries {
  const starts = lastNBuckets(nowUnix, 24, 3600);
  const first = starts[0];
  const sums = new Map<string, { sum: number[]; n: number[] }>();
  for (const c of checks) {
    if (c.state === "down" || c.latency_ms === null) continue;
    const idx = Math.floor((c.ts - first) / 3600);
    if (idx < 0 || idx >= 24) continue;
    let acc = sums.get(c.component);
    if (!acc) {
      acc = { sum: new Array<number>(24).fill(0), n: new Array<number>(24).fill(0) };
      sums.set(c.component, acc);
    }
    acc.sum[idx] += c.latency_ms;
    acc.n[idx] += 1;
  }
  const out: LatencySeries = {};
  for (const [component, acc] of sums) {
    out[component] = acc.sum.map((s, i) => (acc.n[i] === 0 ? null : Math.round(s / acc.n[i])));
  }
  return out;
}

export interface IncidentEntry {
  ids: number[];
  kind: string;
  status: string;
  title: string;
  body: string | null;
  startedAt: number;
  resolvedAt: number | null;
  durationSeconds: number | null;
  ongoing: boolean;
  /** Product labels, in page order, deduplicated. */
  affected: string[];
}

const CLUSTER_WINDOW_SECONDS = 120;

function isOngoing(row: IncidentRow): boolean {
  return row.status !== "resolved" && row.status !== "completed";
}

function near(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= CLUSTER_WINDOW_SECONDS;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function productOrder(): string[] {
  return PRODUCT_GROUPS.flatMap((g) => g.products.map((p) => p.label));
}

function orderedLabels(components: string[]): string[] {
  const labels = new Set(components.map(productLabelFor));
  const order = productOrder();
  const known = order.filter((l) => labels.has(l));
  const unknown = [...labels].filter((l) => !order.includes(l));
  return [...known, ...unknown];
}

/**
 * One timeline entry per thing that happened. Automatic incidents that opened
 * and closed within two minutes of each other were one event seen by several
 * probes (an API outage takes the web app, the editor and WebDAV with it), so
 * they fold into a single entry. Manual and maintenance rows are kept verbatim.
 */
export function clusterIncidents(incidents: IncidentRow[]): IncidentEntry[] {
  const rows = [...incidents].sort((a, b) => b.started_at - a.started_at || b.id - a.id);
  const entries: IncidentEntry[] = [];
  const consumed = new Set<number>();
  for (const row of rows) {
    if (consumed.has(row.id)) continue;
    consumed.add(row.id);
    const members = [row];
    if (row.kind === "auto") {
      for (const other of rows) {
        if (consumed.has(other.id) || other.kind !== "auto") continue;
        if (near(other.started_at, row.started_at) && near(other.resolved_at, row.resolved_at)) {
          consumed.add(other.id);
          members.push(other);
        }
      }
    }
    const startedAt = Math.min(...members.map((m) => m.started_at));
    const ongoing = members.some(isOngoing);
    // An incident closed through POST /admin/incidents/:id/updates carries its
    // close time in updated_at only (addIncidentUpdate never sets resolved_at).
    const resolvedAt = ongoing ? null : Math.max(...members.map((m) => m.resolved_at ?? m.updated_at));
    const affected = orderedLabels(members.map((m) => m.component));
    entries.push({
      ids: members.map((m) => m.id),
      kind: row.kind,
      status: row.status,
      title: row.kind === "auto" ? `${joinNames(affected)} unreachable` : row.title,
      body: row.body,
      startedAt,
      resolvedAt,
      durationSeconds: resolvedAt === null ? null : resolvedAt - startedAt,
      ongoing,
      affected,
    });
  }
  return entries;
}

export interface IncidentParts {
  /** Live incidents (not maintenance) for the hero card. */
  active: IncidentEntry[];
  /** Upcoming or in-progress maintenance for the notice. */
  maintenance: IncidentEntry[];
  /** Everything, for the timeline. */
  history: IncidentEntry[];
}

export function splitIncidents(entries: IncidentEntry[], nowUnix: number): IncidentParts {
  return {
    active: entries.filter((e) => e.ongoing && e.kind !== "maintenance"),
    maintenance: entries.filter((e) => e.kind === "maintenance" && e.ongoing),
    // A maintenance window scheduled for next week has not happened yet.
    history: entries.filter((e) => e.startedAt <= nowUnix),
  };
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function groupEntriesByMonth(entries: IncidentEntry[]): Array<{ label: string; entries: IncidentEntry[] }> {
  const out: Array<{ label: string; entries: IncidentEntry[] }> = [];
  for (const e of entries) {
    const d = new Date(e.startedAt * 1000);
    const label = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    const last = out[out.length - 1];
    if (last && last.label === label) last.entries.push(e);
    else out.push({ label, entries: [e] });
  }
  return out;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return "under a minute";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const restMin = minutes % 60;
  if (hours < 24) return restMin === 0 ? `${hours} h` : `${hours} h ${restMin} min`;
  const days = Math.floor(hours / 24);
  const restH = hours % 24;
  return restH === 0 ? `${days} d` : `${days} d ${restH} h`;
}

/** Incidents (never maintenance windows) that started inside the window. */
export function countEntriesSince(entries: IncidentEntry[], sinceUnix: number): number {
  return entries.filter((e) => e.kind !== "maintenance" && e.startedAt >= sinceUnix).length;
}
