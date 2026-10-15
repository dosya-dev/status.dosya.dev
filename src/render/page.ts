import type { StatusView } from "../snapshot";
import type { RangeSnapshot, BannerLevel, DayBar, IncidentUpdateRow } from "../aggregate";
import { BANNER_TEXT, barSegments } from "../aggregate";
import { STYLES } from "./styles";
import type { RangeKey } from "../time";
import {
  buildGroups,
  clusterIncidents,
  splitIncidents,
  groupEntriesByMonth,
  formatDuration,
  countEntriesSince,
  type GroupView,
  type ProductView,
  type IncidentEntry,
  type State,
} from "../view";

const RANGES: RangeKey[] = ["60m", "24h", "7d", "30d", "90d"];
const RANGE_LABEL: Record<RangeKey, string> = {
  "60m": "60 min",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};
// The 90 day view is the one a prospect is sent to look at.
const DEFAULT_RANGE: RangeKey = "90d";
const TILE_RANGES: Array<{ range: RangeKey; label: string; seconds: number }> = [
  { range: "24h", label: "Uptime, 24 hours", seconds: 86400 },
  { range: "30d", label: "Uptime, 30 days", seconds: 30 * 86400 },
  { range: "90d", label: "Uptime, 90 days", seconds: 90 * 86400 },
];

const PRODUCT_URL = "https://dosya.dev";
const SUPPORT_URL = "https://dosya.dev/help";
const SECURITY_URL = "https://dosya.dev/.well-known/security.txt";
const STATUS_URL = "https://status.dosya.dev/";
const SOCIAL_IMAGE_URL = "https://status.dosya.dev/social-preview.png";
const SOCIAL_IMAGE_ALT = "dosya.dev live service status: uptime, incidents and updates";
const DESCRIPTION =
  "Live status and 90 day uptime of dosya.dev: web app, document editor, API, WebDAV, S3 and SFTP, checked once a minute.";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtPct(pct: number | null): string {
  return pct === null ? "-" : `${pct.toFixed(2)}%`;
}

function fmtMs(ms: number | null): string {
  if (ms === null) return "-";
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 'YYYY-MM-DD' bucket keys read as 'Jul 25'; interval labels ('14:00') pass through. */
function dayLabel(key: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return key;
  return `${MONTH_SHORT[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}`;
}

/** UTC 'YYYY-MM-DD HH:MM UTC' - the no-JS default; the client rewrites to local on toggle. */
function utcText(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** A timestamp the client can re-render in local time (carries the unix seconds). */
function tsHtml(unix: number): string {
  return `<time class="ts" data-ts="${unix}">${utcText(unix)}</time>`;
}

/** Round to 2 decimals for compact inline-style percentages. */
function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const STATE_TEXT: Record<State, string> = {
  up: "Operational",
  degraded: "Degraded",
  down: "Down",
  unknown: "No data",
};

function statusWord(status: string): string {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function badgeClass(entry: IncidentEntry): string {
  if (!entry.ongoing) return "yes";
  return entry.kind === "maintenance" ? "warn" : "no";
}

function badgeHtml(entry: IncidentEntry): string {
  const text = entry.ongoing ? statusWord(entry.status) : entry.kind === "maintenance" ? "Completed" : "Resolved";
  return `<span class="badge ${badgeClass(entry)}">${esc(text)}</span>`;
}

function barCountsText(b: DayBar): string {
  const parts = [`${b.up}/${b.total} up`];
  if (b.degraded > 0) parts.push(`${b.degraded} degraded`);
  if (b.down > 0) parts.push(`${b.down} down`);
  return parts.join(", ");
}

/**
 * One bar: solid class-based background when the bucket is a single state
 * (the common case - zero extra bytes), a hard-stop gradient stacked
 * bottom-to-top up/degraded/down when states are mixed. The title attribute is
 * the no-JS fallback; the client script strips it and serves the same text via
 * the popover.
 */
function barHtml(b: DayBar): string {
  if (b.total === 0) return `<div class="b"></div>`;
  const text = `${b.day} - ${fmtPct(b.uptimePct)} success · ${barCountsText(b)}`;
  const data =
    `data-label="${esc(b.day)}" data-up="${b.up}" data-degraded="${b.degraded}" ` +
    `data-down="${b.down}" data-total="${b.total}" data-pct="${fmtPct(b.uptimePct)}"`;
  const states = (b.up > 0 ? 1 : 0) + (b.degraded > 0 ? 1 : 0) + (b.down > 0 ? 1 : 0);
  if (states <= 1) {
    const cls = b.down > 0 ? "down" : b.degraded > 0 ? "warn" : "up";
    return `<div class="b ${cls}" ${data} title="${esc(text)}"></div>`;
  }
  const s = barSegments(b.up, b.degraded, b.down, b.total);
  const stops: string[] = [];
  let acc = 0;
  if (s.upPct > 0) {
    stops.push(`var(--up) ${r2(acc)}% ${r2(acc + s.upPct)}%`);
    acc += s.upPct;
  }
  if (s.degradedPct > 0) {
    stops.push(`var(--warn) ${r2(acc)}% ${r2(acc + s.degradedPct)}%`);
    acc += s.degradedPct;
  }
  if (s.downPct > 0) {
    stops.push(`var(--down) ${r2(acc)}% 100%`);
  }
  const grad = `background:linear-gradient(to top, ${stops.join(", ")})`;
  return `<div class="b mix" ${data} title="${esc(text)}" style="${grad}"></div>`;
}

/** A 24 point latency trend. Nulls are gaps; the line connects the points that exist. */
function sparkHtml(series: Array<number | null>, state: State): string {
  const pts = series.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (pts.length < 2) return "";
  const w = 120;
  const h = 28;
  const pad = 3;
  const n = Math.max(series.length - 1, 1);
  const vals = pts.map((p) => p[1]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const xy = pts.map(([i, v]) => {
    const x = pad + (i * (w - 2 * pad)) / n;
    const y = max === min ? h / 2 : pad + (h - 2 * pad) * (1 - (v - min) / (max - min));
    return [r2(x), r2(y)] as const;
  });
  const last = xy[xy.length - 1];
  return (
    `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">` +
    `<polyline points="${xy.map((p) => p.join(",")).join(" ")}"></polyline>` +
    `<circle class="${state}" cx="${last[0]}" cy="${last[1]}" r="3.5"></circle></svg>`
  );
}

function pillsHtml(p: ProductView): string {
  if (p.checks.length < 2) return "";
  const pills = p.checks
    .map((c) => {
      const since = c.sinceDay ? ` · since ${esc(dayLabel(c.sinceDay))}` : "";
      return `<span class="chk"><span class="dot s ${c.state}"></span>${esc(c.label)} · ${fmtPct(c.uptimePct)}${since}</span>`;
    })
    .join("");
  return `<div class="pills">${pills}</div>`;
}

function renderProduct(p: ProductView): string {
  const bars = p.bars.map(barHtml).join("");
  const first = p.bars[0]?.day ?? "";
  const last = p.bars[p.bars.length - 1]?.day ?? "";
  const cap = p.latencyCheckLabel && p.checks.length > 1 ? `${esc(p.latencyCheckLabel.toLowerCase())} · now` : "now";
  const ms = p.state === "down" && p.latencyMs === null ? "no response" : fmtMs(p.latencyMs);
  return `
      <div class="row">
        <div class="c1">
          <div class="nm"><span class="dot ${p.state}"></span>${esc(p.label)}<span class="state">${STATE_TEXT[p.state]}</span></div>
          <div class="check">${esc(p.description)}</div>
          ${pillsHtml(p)}
        </div>
        <div class="c2">
          <div class="bars">${bars}</div>
          <div class="axis mono"><span>${esc(dayLabel(first))}</span><span>${esc(dayLabel(last))}</span></div>
        </div>
        <div class="c3"><div class="mono pct">${fmtPct(p.uptimePct)}</div><div class="cap">uptime</div></div>
        <div class="c4">${sparkHtml(p.latencySeries, p.state)}<div><div class="mono ms">${ms}</div><div class="cap">${cap}</div></div></div>
      </div>`;
}

function renderGroup(g: GroupView, range: RangeKey): string {
  return `
    <section class="panel">
      <div class="ghead">
        <div><span class="gname">${esc(g.label)}</span><span class="gcount">${plural(g.products.length, "product")}</span></div>
        <div class="mono gpct">${fmtPct(g.uptimePct)}<span>${RANGE_LABEL[range]}</span></div>
      </div>${g.products.map(renderProduct).join("")}
    </section>`;
}

function renderRange(snap: RangeSnapshot, view: StatusView, active: boolean): string {
  const groups = buildGroups(snap, view.latency);
  return `<div class="rangeview ${active ? "active" : ""}" data-range="${snap.range}">${groups
    .map((g) => renderGroup(g, snap.range))
    .join("")}
  </div>`;
}

function heroSentence(banner: BannerLevel, groups: GroupView[]): string {
  const products = groups.flatMap((g) => g.products);
  const reporting = products.flatMap((p) => p.checks).filter((c) => c.state !== "unknown").length;
  const down = products.filter((p) => p.state === "down").map((p) => p.label);
  const degraded = products.filter((p) => p.state === "degraded").map((p) => p.label);
  if (banner === "ok") {
    if (reporting === 0) return "No checks have reported yet.";
    return `All ${plural(reporting, "check")} across ${plural(products.length, "product")} passed their most recent run.`;
  }
  if (banner === "maintenance") {
    return "Scheduled maintenance is in progress. The affected components may be briefly unavailable; everything else is operating normally.";
  }
  const parts: string[] = [];
  if (down.length > 0) parts.push(`${joinNames(down)} ${down.length === 1 ? "is" : "are"} unreachable.`);
  if (degraded.length > 0) parts.push(`${joinNames(degraded)} ${degraded.length === 1 ? "is" : "are"} responding slowly.`);
  if (banner !== "major") parts.push("Everything else is operating normally.");
  return parts.join(" ");
}

function renderTiles(view: StatusView, entries: IncidentEntry[], active: IncidentEntry[]): string {
  return TILE_RANGES.map(({ range, label, seconds }) => {
    const pct = view.ranges[range].overallUptimePct;
    const value = pct === null ? `<div class="tval none">no data</div>` : `<div class="tval">${fmtPct(pct)}</div>`;
    const n = countEntriesSince(entries, view.nowUnix - seconds);
    const ongoing = active.filter((e) => e.startedAt >= view.nowUnix - seconds).length;
    const sub = n === 0 ? "no incidents" : ongoing > 0 ? `${plural(n, "incident")}, ${ongoing} ongoing` : plural(n, "incident");
    return `<div class="tile"><div class="tlabel">${label}</div>${value}<div class="tsub">${sub}</div></div>`;
  }).join("");
}

function affectedHtml(entry: IncidentEntry): string {
  return `<span class="aff">${entry.affected.map((a) => `<span>${esc(a)}</span>`).join("")}</span>`;
}

function renderActive(entries: IncidentEntry[], updates: IncidentUpdateRow[], nowUnix: number): string {
  return entries
    .map((e) => {
      const ids = new Set(e.ids);
      const log = updates
        .filter((u) => ids.has(u.incident_id))
        .sort((a, b) => b.created_at - a.created_at)
        .map(
          (u) =>
            `<div class="log"><div class="when mono">${tsHtml(u.created_at)}</div><div><b>${esc(statusWord(u.status))}.</b> ${esc(u.body)}</div></div>`,
        )
        .join("");
      const body = e.body ? `<p class="abody">${esc(e.body)}</p>` : "";
      return `
  <section class="live-incident" aria-label="Active incident">
    <div class="ahead">
      <div class="atitle">${badgeHtml(e)}<span class="t">${esc(e.title)}</span></div>
      <div class="ameta mono">Started ${tsHtml(e.startedAt)} · ${formatDuration(nowUnix - e.startedAt)} ago · affects <b>${esc(e.affected.join(", "))}</b></div>
    </div>
    ${body}
    ${log ? `<div class="updates">${log}</div>` : ""}
    <div class="anote">Updates are posted here and on the <a href="/rss.xml">RSS feed</a> as the incident progresses.</div>
  </section>`;
    })
    .join("");
}

function renderMaintenance(entries: IncidentEntry[]): string {
  return entries
    .map((e) => {
      const head = e.status === "in_progress" ? "Maintenance in progress" : "Scheduled maintenance";
      const body = e.body ? ` ${esc(e.body)}` : "";
      return `
  <section class="maint" aria-label="${head}">
    <span class="ico"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M3 10h18M8 3v4M16 3v4"></path></svg></span>
    <div><div class="mt">${head} · ${tsHtml(e.startedAt)}</div><div class="md">${esc(e.title)} · ${esc(e.affected.join(", "))}.${body}</div></div>
  </section>`;
    })
    .join("");
}

function renderHistory(history: IncidentEntry[], nowUnix: number): string {
  const head = `<div class="shead"><h2>Incident history</h2><span class="d">Last 90 days · <a href="/rss.xml">Subscribe to updates</a></span></div>`;
  if (history.length === 0) {
    return `<section class="section">${head}<p class="d">No incidents in the last 90 days.</p></section>`;
  }
  const months = groupEntriesByMonth(history)
    .map((m) => {
      const items = m.entries
        .map((e) => {
          const dur = e.durationSeconds === null ? `${formatDuration(nowUnix - e.startedAt)} and counting` : formatDuration(e.durationSeconds);
          const body = e.body ? `<p class="ibody">${esc(e.body)}</p>` : "";
          return `
      <div class="inc">
        <div class="idate mono">${tsHtml(e.startedAt)}</div>
        <div>
          <div class="ititle">${esc(e.title)}</div>
          <div class="imeta">${badgeHtml(e)}<span class="mono">${dur}</span>${affectedHtml(e)}</div>${body}
        </div>
      </div>`;
        })
        .join("");
      return `<div class="month"><div class="mname">${esc(m.label)}</div>${items}</div>`;
    })
    .join("");
  return `<section class="section">${head}${months}</section>`;
}

const CLIENT_SCRIPT = `
<script>
(function () {
  var THEME_KEY = 'status-theme', TZ_KEY = 'status-tz';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function applyTheme(mode) {
    var dark = mode === 'dark' || (mode === 'system' && mq.matches);
    document.documentElement.classList.toggle('dark', dark);
    var b = document.getElementById('theme-toggle');
    if (b) b.textContent = mode === 'system' ? 'Auto' : (mode === 'dark' ? 'Dark' : 'Light');
  }
  function cycleTheme() {
    var order = ['system', 'light', 'dark'];
    var next = order[(order.indexOf(get(THEME_KEY, 'system')) + 1) % 3];
    set(THEME_KEY, next); applyTheme(next);
  }

  function fmt(ts, tz) {
    var d = new Date(ts * 1000);
    if (tz === 'local') {
      return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
    function p(n) { return String(n).padStart(2, '0'); }
    return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ' UTC';
  }
  function applyTz(tz) {
    document.querySelectorAll('time.ts').forEach(function (el) {
      var ts = parseInt(el.getAttribute('data-ts'), 10);
      if (!isNaN(ts)) el.textContent = fmt(ts, tz);
    });
    var b = document.getElementById('tz-toggle');
    if (b) b.textContent = tz === 'local' ? 'Local' : 'UTC';
  }
  function toggleTz() { var t = get(TZ_KEY, 'utc') === 'local' ? 'utc' : 'local'; set(TZ_KEY, t); applyTz(t); }

  applyTheme(get(THEME_KEY, 'system'));
  applyTz(get(TZ_KEY, 'utc'));
  try { mq.addEventListener('change', function () { if (get(THEME_KEY, 'system') === 'system') applyTheme('system'); }); } catch (e) {}

  // Bar detail popover: hover shows it transiently, click pins it (the only
  // path on touch devices). The server-rendered title attrs are the no-JS
  // fallback; strip them here so JS users don't get a double tooltip.
  var pop = document.getElementById('bar-pop');
  var pinned = null;
  function popText(b) {
    var parts = [b.getAttribute('data-up') + '/' + b.getAttribute('data-total') + ' up'];
    if (b.getAttribute('data-degraded') !== '0') parts.push(b.getAttribute('data-degraded') + ' degraded');
    if (b.getAttribute('data-down') !== '0') parts.push(b.getAttribute('data-down') + ' down');
    return b.getAttribute('data-label') + ' - ' + b.getAttribute('data-pct') + ' success · ' + parts.join(', ');
  }
  function showPop(bar) {
    pop.textContent = popText(bar);
    pop.hidden = false;
    var r = bar.getBoundingClientRect();
    var pr = pop.getBoundingClientRect();
    var top = r.top - pr.height - 6;
    if (top < 4) top = r.bottom + 6;
    var left = Math.min(Math.max(4, r.left + r.width / 2 - pr.width / 2), window.innerWidth - pr.width - 4);
    pop.style.top = top + 'px';
    pop.style.left = left + 'px';
  }
  function unpin() {
    if (pinned) { pinned.classList.remove('pinned'); pinned = null; }
    pop.hidden = true;
  }
  document.querySelectorAll('.bars .b[data-total]').forEach(function (b) { b.removeAttribute('title'); });
  document.addEventListener('mouseover', function (e) {
    if (pinned) return;
    var bar = e.target.closest && e.target.closest('.bars .b[data-total]');
    if (bar) showPop(bar);
  });
  document.addEventListener('mouseout', function (e) {
    if (pinned) return;
    if (e.target.closest && e.target.closest('.bars .b[data-total]')) pop.hidden = true;
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') unpin(); });
  window.addEventListener('scroll', function () { if (pinned) unpin(); else pop.hidden = true; }, true);

  document.addEventListener('click', function (e) {
    var bar = e.target.closest('.bars .b[data-total]');
    if (bar) {
      if (pinned === bar) { unpin(); return; }
      unpin();
      pinned = bar;
      bar.classList.add('pinned');
      showPop(bar);
      return;
    }
    unpin();
    if (e.target.closest('#theme-toggle')) { cycleTheme(); return; }
    if (e.target.closest('#tz-toggle')) { toggleTz(); return; }
    var btn = e.target.closest('.tabs button');
    if (!btn) return;
    var r = btn.getAttribute('data-r');
    document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('active', b === btn); });
    document.querySelectorAll('.rangeview').forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-range') === r); });
  });
})();
</script>`;

// Applied before first paint to avoid a light/dark flash on load.
const PREPAINT_SCRIPT = `
<script>
(function () {
  try {
    var m = localStorage.getItem('status-theme') || 'system';
    var dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
</script>`;

const BRAND_MARK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>`;
const RSS_MARK = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 11a9 9 0 0 1 9 9"></path><path d="M4 4a16 16 0 0 1 16 16"></path><circle cx="5" cy="19" r="1.5" fill="currentColor" stroke="none"></circle></svg>`;

export function renderPage(view: StatusView): string {
  const banner: BannerLevel = view.banner;
  const currentGroups = buildGroups(view.ranges["90d"], view.latency);
  const entries = clusterIncidents(view.incidents);
  const parts = splitIncidents(entries, view.nowUnix);
  const tabs = RANGES.map(
    (r) => `<button data-r="${r}" class="${r === DEFAULT_RANGE ? "active" : ""}">${RANGE_LABEL[r]}</button>`,
  ).join("");
  const rangeViews = RANGES.map((r) => renderRange(view.ranges[r], view, r === DEFAULT_RANGE)).join("");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/favicon.svg" />
<link rel="alternate" type="application/rss+xml" title="dosya.dev status" href="/rss.xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
<meta name="description" content="${DESCRIPTION}" />
<link rel="canonical" href="${STATUS_URL}" />
<meta property="og:site_name" content="dosya.dev" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${STATUS_URL}" />
<meta property="og:title" content="dosya.dev status" />
<meta property="og:description" content="${DESCRIPTION}" />
<meta property="og:image" content="${SOCIAL_IMAGE_URL}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${SOCIAL_IMAGE_ALT}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="dosya.dev status" />
<meta name="twitter:description" content="${DESCRIPTION}" />
<meta name="twitter:image" content="${SOCIAL_IMAGE_URL}" />
<meta name="twitter:image:alt" content="${SOCIAL_IMAGE_ALT}" />
<title>dosya.dev status</title>
${PREPAINT_SCRIPT}
<style>${STYLES}</style>
</head><body>
<div class="wrap">
  <div class="topbar">
    <a class="brand" href="${PRODUCT_URL}"><span class="mark">${BRAND_MARK}</span><span class="name">dosya.dev</span><span class="sect">/ status</span></a>
    <nav class="controls" aria-label="Status page tools">
      <a class="ctl" href="/rss.xml">${RSS_MARK}Subscribe</a>
      <a class="ctl" href="/api/status">JSON API</a>
      <button class="ctl" id="tz-toggle" title="Toggle time zone (UTC / Local)">UTC</button>
      <button class="ctl" id="theme-toggle" title="Toggle theme (Auto / Light / Dark)">Auto</button>
    </nav>
  </div>

  <section class="hero ${banner}">
    <div class="lead">
      <div class="line"><span class="live"></span><h1>${BANNER_TEXT[banner]}</h1></div>
      <p>${heroSentence(banner, currentGroups)}</p>
      <div class="stamp mono">Updated ${tsHtml(view.nowUnix)} · every component is checked once a minute</div>
    </div>
    <div class="tiles">${renderTiles(view, entries, parts.active)}</div>
  </section>
  ${renderActive(parts.active, view.updates, view.nowUnix)}
  ${renderMaintenance(parts.maintenance)}

  <div class="rangerow">
    <div class="tabs" role="group" aria-label="Time range">${tabs}</div>
    <div class="legend" aria-label="Legend">
      <span><i class="sw up"></i>Operational</span>
      <span><i class="sw warn"></i>Degraded</span>
      <span><i class="sw down"></i>Down</span>
      <span><i class="sw none"></i>No data</span>
    </div>
  </div>
  ${rangeViews}
  ${renderHistory(parts.history, view.nowUnix)}
  <footer>
    <div class="footlinks">
      <a href="${PRODUCT_URL}">dosya.dev</a>
      <a href="${SUPPORT_URL}">Support</a>
      <a href="/rss.xml">RSS</a>
      <a href="/api/status">JSON API</a>
      <a href="${SECURITY_URL}">Security</a>
    </div>
    <div class="mono">Updated ${tsHtml(view.nowUnix)}</div>
  </footer>
</div>
<div id="bar-pop" hidden></div>
${CLIENT_SCRIPT}
</body></html>`;
}
