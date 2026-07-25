export const STYLES = `
:root {
  --bg: #0b0d10; --card: #14171c; --border: #232830; --text: #e8eaed; --muted: #9aa4b2;
  --up: #2ecc71; --warn: #f1c40f; --down: #e74c3c; --none: #2a2f37; --accent: #5b9dff;
}
@media (prefers-color-scheme: light) {
  :root { --bg: #f6f8fa; --card: #ffffff; --border: #e2e6ea; --text: #1a1d21; --muted: #5b6570; --none: #d5dae0; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.5; }
.wrap { max-width: 900px; margin: 0 auto; padding: 32px 20px 64px; }
header h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
header .sub { color: var(--muted); font-size: 13px; }
.banner { margin: 24px 0; padding: 16px 20px; border-radius: 12px; font-weight: 600; border: 1px solid var(--border); }
.banner.ok { background: color-mix(in srgb, var(--up) 14%, transparent); }
.banner.degraded, .banner.maintenance { background: color-mix(in srgb, var(--warn) 16%, transparent); }
.banner.partial, .banner.major { background: color-mix(in srgb, var(--down) 16%, transparent); }
.tabs { display: inline-flex; gap: 4px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 4px; margin: 8px 0 20px; }
.tabs button { border: 0; background: transparent; color: var(--muted); padding: 6px 14px; border-radius: 7px; cursor: pointer; font-size: 13px; font-weight: 600; }
.tabs button.active { background: var(--accent); color: #fff; }
.comp { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 16px 18px; margin-bottom: 12px; }
.comp .row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.comp .name { font-weight: 600; display: flex; align-items: center; gap: 8px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot.up { background: var(--up); } .dot.degraded { background: var(--warn); }
.dot.down { background: var(--down); } .dot.unknown { background: var(--muted); }
.meta { color: var(--muted); font-size: 12px; text-align: right; }
.meta .pct { color: var(--text); font-weight: 700; font-size: 15px; }
.bars { display: flex; gap: 2px; margin-top: 12px; }
.bars .b { flex: 1 1 0; height: 30px; border-radius: 2px; background: var(--none); }
.bars .b.up { background: var(--up); } .bars .b.warn { background: var(--warn); } .bars .b.down { background: var(--down); }
.range-note { display: flex; justify-content: space-between; color: var(--muted); font-size: 11px; margin-top: 6px; }
.rangeview { display: none; } .rangeview.active { display: block; }
.incidents { margin-top: 36px; }
.incidents h2 { font-size: 15px; margin-bottom: 12px; }
.inc { border-left: 3px solid var(--border); padding: 4px 0 4px 14px; margin-bottom: 14px; }
.inc.ongoing { border-color: var(--down); } .inc.resolved { border-color: var(--up); }
.inc .t { font-weight: 600; font-size: 14px; } .inc .d { color: var(--muted); font-size: 12px; }
footer { margin-top: 48px; color: var(--muted); font-size: 12px; text-align: center; }
a { color: var(--accent); }
`;
