// Theme tokens mirror apps/web's default theme (src/index.css): OKLCH palette,
// green primary, Space Grotesk / Space Mono. Light = :root, dark = .dark class
// (toggled by the pre-paint script + theme switcher), matching the web app.
export const STYLES = `
:root {
  --bg: oklch(0.9813 0.0100 238.5069);
  --text: oklch(0.1807 0.0207 239.8394);
  --card: oklch(1.0000 0 0);
  --muted: oklch(0.4501 0.0191 239.4931);
  --border: oklch(0.8999 0.0196 240.7516);
  --accent: oklch(0.6236 0.1833 147.4139);
  --accent-fg: oklch(0.9813 0.0100 238.5069);
  --up: oklch(0.6236 0.1833 147.4139);
  --warn: oklch(0.7200 0.1500 75.0000);
  --down: oklch(0.6207 0.2306 24.9164);
  --none: oklch(0.9396 0.0204 243.4220);
  --radius: 0.75rem;
  --font-sans: 'Space Grotesk', 'Space Grotesk Variable', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dark {
  --bg: oklch(0.1289 0.0199 238.9108);
  --text: oklch(0.9513 0.0101 238.5127);
  --card: oklch(0.1807 0.0207 239.8394);
  --muted: oklch(0.6499 0.0194 240.1577);
  --border: oklch(0.2791 0.0203 242.6079);
  --accent: oklch(0.7007 0.1804 148.9872);
  --accent-fg: oklch(0.1004 0.0209 233.5083);
  --up: oklch(0.7007 0.1804 148.9872);
  --warn: oklch(0.8000 0.1500 78.0000);
  --down: oklch(0.6207 0.2306 24.9164);
  --none: oklch(0.2414 0.0196 239.1401);
  --radius: 0.625rem;
}
* { box-sizing: border-box; }
html { color-scheme: light; }
html.dark { color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: var(--font-sans); line-height: 1.5;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
.topbar { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
header h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; font-weight: 700; }
header .sub { color: var(--muted); font-size: 13px; }
.controls { display: flex; gap: 6px; flex-shrink: 0; }
.ctl { border: 1px solid var(--border); background: var(--card); color: var(--muted);
  border-radius: 999px; padding: 5px 12px; font-size: 12px; font-weight: 600; cursor: pointer;
  font-family: var(--font-sans); line-height: 1.4; }
.ctl:hover { color: var(--text); }
.banner { margin: 24px 0; padding: 16px 20px; border-radius: var(--radius); font-weight: 600;
  border: 1px solid var(--border); display: flex; align-items: center; gap: 10px; }
.banner::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: currentColor; opacity: .9; }
.banner.ok { background: color-mix(in oklab, var(--up) 12%, var(--card)); color: var(--up); }
.banner.degraded, .banner.maintenance { background: color-mix(in oklab, var(--warn) 15%, var(--card)); color: color-mix(in oklab, var(--warn) 65%, var(--text)); }
.banner.partial, .banner.major { background: color-mix(in oklab, var(--down) 14%, var(--card)); color: var(--down); }
.tabs { display: inline-flex; gap: 4px; background: var(--card); border: 1px solid var(--border); border-radius: 999px; padding: 4px; margin: 8px 0 20px; flex-wrap: wrap; }
.tabs button { border: 0; background: transparent; color: var(--muted); padding: 6px 14px; border-radius: 999px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: var(--font-sans); }
.tabs button.active { background: var(--accent); color: var(--accent-fg); }
.comp { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 12px; }
.comp .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.comp .name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot.up { background: var(--up); } .dot.degraded { background: var(--warn); }
.dot.down { background: var(--down); } .dot.unknown { background: var(--muted); }
.meta { color: var(--muted); font-size: 12px; text-align: right; font-family: var(--font-mono); }
.meta .pct { color: var(--text); font-weight: 700; font-size: 15px; }
.bars { display: flex; gap: 2px; margin-top: 12px; }
.bars .b { flex: 1 1 0; height: 30px; border-radius: 2px; background: var(--none); }
.bars .b.up { background: var(--up); } .bars .b.warn { background: var(--warn); } .bars .b.down { background: var(--down); }
.range-note { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 6px; font-family: var(--font-mono); }
.rangeview { display: none; } .rangeview.active { display: block; }
.incidents { margin-top: 36px; }
.incidents h2 { font-size: 15px; margin-bottom: 12px; font-weight: 700; }
.inc { border-left: 3px solid var(--border); padding: 4px 0 4px 14px; margin-bottom: 14px; }
.inc.ongoing { border-color: var(--down); } .inc.resolved { border-color: var(--up); }
.inc .t { font-weight: 600; font-size: 14px; } .inc .d { color: var(--muted); font-size: 12px; }
footer { margin-top: 48px; color: var(--muted); font-size: 12px; text-align: center; line-height: 1.9; }
.footlinks { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; margin-bottom: 6px; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
time.ts { font-variant-numeric: tabular-nums; }
`;
