import type { StatusView } from "../snapshot";
import type { RangeSnapshot, ComponentSnapshot, IncidentRow, BannerLevel } from "../aggregate";
import { BANNER_TEXT } from "../aggregate";
import { STYLES } from "./styles";
import type { RangeKey } from "../time";

const RANGES: RangeKey[] = ["60m", "24h", "7d", "30d", "90d"];
const RANGE_LABEL: Record<RangeKey, string> = {
  "60m": "60 min",
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};
const DEFAULT_RANGE: RangeKey = "24h";

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtPct(pct: number | null): string {
  return pct === null ? "—" : `${pct.toFixed(2)}%`;
}

function renderComponent(c: ComponentSnapshot): string {
  const bars = c.bars
    .map((b) => `<div class="b ${b.color === "none" ? "" : b.color}" title="${b.day}: ${fmtPct(b.uptimePct)}"></div>`)
    .join("");
  const latency = c.latencyMs === null ? "" : `${c.latencyMs} ms`;
  const first = c.bars[0]?.day ?? "";
  const last = c.bars[c.bars.length - 1]?.day ?? "";
  return `
  <div class="comp">
    <div class="row">
      <div class="name"><span class="dot ${c.currentState}"></span>${esc(c.label)}</div>
      <div class="meta"><div class="pct">${fmtPct(c.uptimePct)}</div><div>${latency}</div></div>
    </div>
    <div class="bars">${bars}</div>
    <div class="range-note"><span>${first}</span><span>uptime</span><span>${last}</span></div>
  </div>`;
}

function renderRange(snap: RangeSnapshot, active: boolean): string {
  return `<div class="rangeview ${active ? "active" : ""}" data-range="${snap.range}">
    ${snap.components.map(renderComponent).join("")}
  </div>`;
}

function renderIncidents(incidents: IncidentRow[]): string {
  if (incidents.length === 0) {
    return `<div class="incidents"><h2>Incident history</h2><p class="d">No incidents in the last 90 days.</p></div>`;
  }
  const items = incidents
    .map((i) => {
      const cls = i.status === "resolved" || i.status === "completed" ? "resolved" : "ongoing";
      const started = new Date(i.started_at * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
      const body = i.body ? `<div class="d">${esc(i.body)}</div>` : "";
      return `<div class="inc ${cls}"><div class="t">${esc(i.title)}</div><div class="d">${esc(i.status)} · ${started}</div>${body}</div>`;
    })
    .join("");
  return `<div class="incidents"><h2>Incident history</h2>${items}</div>`;
}

const TAB_SCRIPT = `
<script>
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.tabs button');
  if (!btn) return;
  var r = btn.getAttribute('data-r');
  document.querySelectorAll('.tabs button').forEach(function (b) { b.classList.toggle('active', b === btn); });
  document.querySelectorAll('.rangeview').forEach(function (v) { v.classList.toggle('active', v.getAttribute('data-range') === r); });
});
</script>`;

export function renderPage(view: StatusView): string {
  const banner: BannerLevel = view.banner;
  const generated = new Date(view.nowUnix * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const tabs = RANGES.map(
    (r) => `<button data-r="${r}" class="${r === DEFAULT_RANGE ? "active" : ""}">${RANGE_LABEL[r]}</button>`,
  ).join("");
  const rangeViews = RANGES.map((r) => renderRange(view.ranges[r], r === DEFAULT_RANGE)).join("");
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>dosya.dev status</title>
<style>${STYLES}</style>
</head><body>
<div class="wrap">
  <header><h1>dosya.dev status</h1><div class="sub">Live monitoring of API, REST API, WebDAV, S3 &amp; SFTP</div></header>
  <div class="banner ${banner}">${BANNER_TEXT[banner]}</div>
  <div class="tabs">${tabs}</div>
  ${rangeViews}
  ${renderIncidents(view.incidents)}
  <footer>Updated ${generated} · checks run every minute · <a href="/api/status">JSON</a></footer>
</div>
${TAB_SCRIPT}
</body></html>`;
}
