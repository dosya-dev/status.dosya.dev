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
const DEFAULT_RANGE: RangeKey = "60m";

const PRODUCT_URL = "https://dosya.dev";
const SUPPORT_URL = "https://dosya.dev/help";

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

/** UTC 'YYYY-MM-DD HH:MM UTC' — the no-JS default; the client rewrites to local on toggle. */
function utcText(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/** A timestamp the client can re-render in local time (carries the unix seconds). */
function tsHtml(unix: number): string {
  return `<time class="ts" data-ts="${unix}">${utcText(unix)}</time>`;
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
      const body = i.body ? `<div class="d">${esc(i.body)}</div>` : "";
      return `<div class="inc ${cls}"><div class="t">${esc(i.title)}</div><div class="d">${esc(i.status)} · ${tsHtml(i.started_at)}</div>${body}</div>`;
    })
    .join("");
  return `<div class="incidents"><h2>Incident history</h2>${items}</div>`;
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

  document.addEventListener('click', function (e) {
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

export function renderPage(view: StatusView): string {
  const banner: BannerLevel = view.banner;
  const tabs = RANGES.map(
    (r) => `<button data-r="${r}" class="${r === DEFAULT_RANGE ? "active" : ""}">${RANGE_LABEL[r]}</button>`,
  ).join("");
  const rangeViews = RANGES.map((r) => renderRange(view.ranges[r], r === DEFAULT_RANGE)).join("");
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
<title>dosya.dev status</title>
${PREPAINT_SCRIPT}
<style>${STYLES}</style>
</head><body>
<div class="wrap">
  <div class="topbar">
    <header><h1>dosya.dev status</h1><div class="sub">Live monitoring of the Web App, API, REST API, WebDAV, S3 &amp; SFTP</div></header>
    <div class="controls">
      <button class="ctl" id="theme-toggle" title="Toggle theme (Auto / Light / Dark)">Auto</button>
      <button class="ctl" id="tz-toggle" title="Toggle time zone (UTC / Local)">UTC</button>
    </div>
  </div>
  <div class="banner ${banner}">${BANNER_TEXT[banner]}</div>
  <div class="tabs">${tabs}</div>
  ${rangeViews}
  ${renderIncidents(view.incidents)}
  <footer>
    <div class="footlinks">
      <a href="${PRODUCT_URL}">dosya.dev</a>
      <a href="${SUPPORT_URL}">Support</a>
      <a href="/rss.xml">RSS</a>
      <a href="/api/status">JSON API</a>
    </div>
    <div>Updated ${tsHtml(view.nowUnix)} · checks run every minute</div>
  </footer>
</div>
${CLIENT_SCRIPT}
</body></html>`;
}
