// Theme tokens mirror the product's brand.css: neutral ground, green brand,
// Space Grotesk / Space Mono. Light = :root, dark = .dark class (toggled by the
// pre-paint script + theme switcher). Status colours are reserved for state and
// never used as decoration; text wears text tokens, marks wear the status hue.
// renderAdmin shares this sheet for its tokens, .wrap and header rules.
export const STYLES = `
:root {
  --bg: #f5f5f5;
  --text: #181818;
  --card: #ffffff;
  --head: #fafafa;
  --muted: #5f5f5f;
  --soft: #858585;
  --border: #e4e4e4;
  --hair: #ececec;
  --accent: #15803d;
  --accent-fg: #052e16;
  --accent-fill: #22c55e;
  --btn: #181818;
  --btn-fg: #ffffff;
  --up: #22c55e;
  --warn: #f59e0b;
  --down: #dc2626;
  --none: #e6e6e6;
  --spark: #b3b3b3;
  --yes-bg: #ecfdf3; --yes-ink: #166534;
  --no-bg: #fef2f2; --no-ink: #b91c1c;
  --warn-bg: #fffbeb; --warn-ink: #b45309;
  --radius: 0.625rem;
  --font-sans: 'Space Grotesk', 'Space Grotesk Variable', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --font-mono: 'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
.dark {
  --bg: #131313;
  --text: #ededed;
  --card: #1d1d1d;
  --head: #191919;
  --muted: #a8a8a8;
  --soft: #7d7d7d;
  --border: #2a2a2a;
  --hair: #262626;
  --accent: #4ade80;
  --accent-fg: #052e16;
  --accent-fill: #22c55e;
  --btn: #fafafa;
  --btn-fg: #181818;
  --up: #22c55e;
  --warn: #fbbf24;
  --down: #f87171;
  --none: #2c2c2c;
  --spark: #5c5c5c;
  --yes-bg: #14301f; --yes-ink: #86efac;
  --no-bg: #3a1515; --no-ink: #fca5a5;
  --warn-bg: #3a2a0a; --warn-ink: #fcd34d;
}
* { box-sizing: border-box; }
html { color-scheme: light; }
html.dark { color-scheme: dark; }
body { margin: 0; background: var(--bg); color: var(--text);
  font-family: var(--font-sans); line-height: 1.5;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.mono { font-family: var(--font-mono); }
time.ts { font-variant-numeric: tabular-nums; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 28px 24px 72px; display: flex; flex-direction: column; gap: 40px; }
header h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.02em; font-weight: 700; }
header .sub { color: var(--muted); font-size: 13px; }

/* top bar */
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--text); }
.brand:hover { text-decoration: none; }
.brand .mark { width: 28px; height: 28px; border-radius: 8px; background: var(--accent-fill); color: var(--accent-fg);
  display: inline-flex; align-items: center; justify-content: center; }
.brand .name { font-weight: 700; font-size: 17px; letter-spacing: -0.01em; }
.brand .sect { color: var(--soft); font-weight: 500; }
.controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ctl { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 14px; border-radius: 999px;
  border: 1px solid var(--border); background: var(--card); color: var(--muted);
  font: 600 13px var(--font-sans); text-decoration: none; cursor: pointer; line-height: 1; }
.ctl:hover { color: var(--text); border-color: var(--soft); text-decoration: none; }

/* hero */
.hero { display: grid; grid-template-columns: minmax(280px, 1.25fr) minmax(300px, 1fr); gap: 32px; align-items: end; }
.hero .lead { display: flex; flex-direction: column; gap: 14px; }
.hero .line { display: flex; align-items: center; gap: 14px; }
.hero h1 { margin: 0; font-size: 40px; line-height: 1.1; letter-spacing: -0.025em; font-weight: 700; }
.hero p { margin: 0; color: var(--muted); font-size: 16px; max-width: 54ch; line-height: 1.55; }
.hero .stamp { font-size: 12px; color: var(--soft); }
.live { width: 14px; height: 14px; border-radius: 50%; position: relative; flex-shrink: 0; }
.live::after { content: ""; position: absolute; inset: -5px; border-radius: 50%; border: 2px solid currentColor; opacity: .35;
  animation: ping 2.2s ease-out infinite; }
@keyframes ping { 0% { transform: scale(.6); opacity: .5; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .live::after { animation: none; } }
.hero.ok .live { background: var(--up); color: var(--up); }
.hero.degraded .live, .hero.maintenance .live { background: var(--warn); color: var(--warn); }
.hero.partial .live, .hero.major .live { background: var(--down); color: var(--down); }
.tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.tile { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px;
  display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tlabel { font-size: 12px; color: var(--muted); font-weight: 500; }
.tval { font-size: 30px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
.tval.none { font-size: 18px; color: var(--soft); padding: 7px 0 5px; }
.tsub { font-size: 12px; color: var(--soft); }

/* live incident + maintenance */
.live-incident { border: 1px solid color-mix(in oklab, var(--down) 35%, var(--border));
  background: color-mix(in oklab, var(--down) 5%, var(--card)); border-radius: 16px;
  padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
.ahead { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center; }
.atitle { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.atitle .t { font-weight: 700; font-size: 18px; letter-spacing: -0.01em; }
.ameta { font-size: 12px; color: var(--soft); }
.ameta b { color: var(--text); font-weight: 600; }
.abody { margin: 0; font-size: 14px; line-height: 1.5; }
.updates { display: flex; flex-direction: column; gap: 10px; }
.log { display: grid; grid-template-columns: 150px 1fr; gap: 16px; font-size: 13.5px; line-height: 1.5; }
.log .when { color: var(--soft); font-size: 12px; padding-top: 3px; }
.log b { font-weight: 600; }
.anote { font-size: 12.5px; color: var(--muted); }
.maint { display: flex; gap: 14px; align-items: flex-start; border: 1px solid var(--border); background: var(--card);
  border-radius: 14px; padding: 14px 18px; font-size: 13.5px; line-height: 1.5; }
.maint .ico { width: 32px; height: 32px; border-radius: 9px; background: var(--warn-bg); color: var(--warn-ink);
  display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.maint .mt { font-weight: 600; }
.maint .md { color: var(--muted); }

/* range row */
.rangerow { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.tabs { display: inline-flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 999px; background: var(--card); flex-wrap: wrap; }
.tabs button { height: 34px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--muted);
  font: 600 13px var(--font-sans); cursor: pointer; }
.tabs button.active { background: var(--btn); color: var(--btn-fg); }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.sw.up { background: var(--up); } .sw.warn { background: var(--warn); } .sw.down { background: var(--down); } .sw.none { background: var(--none); }

/* groups */
.rangeview { display: none; flex-direction: column; gap: 20px; } .rangeview.active { display: flex; }
.panel { background: var(--card); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; }
.ghead { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 14px 20px; background: var(--head); }
.gname { font-weight: 700; font-size: 15px; }
.gcount { margin-left: 10px; font-size: 12px; color: var(--soft); font-weight: 500; }
.gpct { font-size: 13px; font-weight: 700; }
.gpct span { color: var(--soft); font-weight: 400; margin-left: 6px; }
.row { display: grid; grid-template-columns: minmax(190px, 1.15fr) minmax(220px, 2.2fr) 84px 196px; gap: 24px;
  align-items: center; padding: 16px 20px; border-top: 1px solid var(--hair); }
.c1 { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.nm { display: flex; align-items: center; gap: 9px; font-weight: 600; font-size: 15px; flex-wrap: wrap; }
.state { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-left: 2px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex-shrink: 0; }
.dot.s { width: 7px; height: 7px; }
.dot.up { background: var(--up); } .dot.degraded { background: var(--warn); }
.dot.down { background: var(--down); } .dot.unknown { background: var(--soft); }
.check { font-size: 12.5px; color: var(--muted); line-height: 1.45; }
.pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.chk { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 9px; border-radius: 999px;
  border: 1px solid var(--border); font-size: 11.5px; color: var(--muted); font-family: var(--font-mono); white-space: nowrap; }
.c2 { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.bars { display: flex; gap: 2px; height: 28px; }
.bars .b { flex: 1 1 0; border-radius: 2px; background: var(--none); min-width: 0; }
.bars .b.up { background: var(--up); } .bars .b.warn { background: var(--warn); } .bars .b.down { background: var(--down); }
.bars .b:hover, .bars .b.pinned { outline: 1px solid var(--text); outline-offset: 1px; filter: brightness(1.12); }
.axis { display: flex; justify-content: space-between; font-size: 10.5px; color: var(--soft); }
.c3 { text-align: right; }
.pct { font-size: 15px; font-weight: 700; }
.cap { font-size: 11px; color: var(--soft); margin-top: 2px; }
.c4 { display: flex; align-items: center; gap: 12px; justify-content: flex-end; }
.ms { font-size: 14px; font-weight: 700; white-space: nowrap; }
.spark { overflow: visible; flex-shrink: 0; }
.spark polyline { fill: none; stroke: var(--spark); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.spark circle { stroke: var(--card); stroke-width: 2; fill: var(--soft); }
.spark circle.up { fill: var(--up); } .spark circle.degraded { fill: var(--warn); } .spark circle.down { fill: var(--down); }

/* incident history */
.section { display: flex; flex-direction: column; gap: 22px; }
.shead { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; }
.shead h2 { margin: 0; font-size: 20px; letter-spacing: -0.015em; }
.shead .d { font-size: 13px; color: var(--muted); }
.d { color: var(--muted); font-size: 13px; margin: 0; }
.month { display: flex; flex-direction: column; }
.mname { font-size: 12px; font-weight: 600; color: var(--soft); text-transform: uppercase; letter-spacing: .08em; padding: 0 0 10px; }
.inc { display: grid; grid-template-columns: 150px 1fr; gap: 20px; padding: 14px 0; border-top: 1px solid var(--border); }
.idate { font-size: 12.5px; color: var(--muted); padding-top: 2px; }
.ititle { font-weight: 600; font-size: 15px; }
.imeta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 6px; font-size: 12.5px; color: var(--muted); }
.ibody { margin: 8px 0 0; font-size: 13px; color: var(--muted); line-height: 1.5; }
.badge { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; }
.badge.yes { background: var(--yes-bg); color: var(--yes-ink); }
.badge.no { background: var(--no-bg); color: var(--no-ink); }
.badge.warn { background: var(--warn-bg); color: var(--warn-ink); }
.aff { display: inline-flex; gap: 6px; flex-wrap: wrap; }
.aff span { border: 1px solid var(--border); border-radius: 6px; padding: 1px 7px; font-size: 11.5px; }


footer { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; align-items: center;
  font-size: 12.5px; color: var(--soft); border-top: 1px solid var(--border); padding-top: 20px; }
.footlinks { display: flex; gap: 18px; flex-wrap: wrap; }

#bar-pop { position: fixed; z-index: 10; background: var(--card); color: var(--text);
  border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px;
  font-size: 12px; font-family: var(--font-mono); white-space: nowrap;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.18); pointer-events: none; }
#bar-pop[hidden] { display: none; }

@media (max-width: 820px) {
  .wrap { gap: 32px; padding: 20px 16px 56px; }
  .hero { grid-template-columns: 1fr; }
  .hero h1 { font-size: 30px; }
  .row { grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; align-items: start; }
  .c1 { grid-column: 1; grid-row: 1; }
  .c3 { grid-column: 2; grid-row: 1; }
  .c2 { grid-column: 1 / -1; grid-row: 2; }
  .c4 { grid-column: 1 / -1; grid-row: 3; justify-content: flex-start; }
  .inc, .log { grid-template-columns: 1fr; gap: 4px; }
}
@media (max-width: 480px) { .tiles { grid-template-columns: 1fr; } }
`;
