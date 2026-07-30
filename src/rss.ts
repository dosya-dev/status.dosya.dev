import type { IncidentRow } from "./aggregate";
import { COMPONENT_LABELS, type ComponentKey } from "./config";

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toUTCString();
}

/** RSS 2.0 feed of incidents (auto + manual), newest first. */
export function buildRss(incidents: IncidentRow[], nowUnix: number, baseUrl: string): string {
  const items = incidents
    .map((i) => {
      const comp =
        i.component === "global"
          ? "All systems"
          : COMPONENT_LABELS[i.component as ComponentKey] ?? i.component;
      const state = i.resolved_at ? "Resolved" : i.status;
      const parts = [`Status: ${state}`, `Started: ${rfc822(i.started_at)}`];
      if (i.resolved_at) parts.push(`Resolved: ${rfc822(i.resolved_at)}`);
      if (i.body) parts.push(i.body);
      return `    <item>
      <title>${escXml(`[${comp}] ${i.title}`)}</title>
      <description>${escXml(parts.join(" - "))}</description>
      <pubDate>${rfc822(i.updated_at || i.started_at)}</pubDate>
      <guid isPermaLink="false">incident-${i.id}</guid>
      <link>${escXml(baseUrl)}/</link>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>dosya.dev status</title>
    <link>${escXml(baseUrl)}/</link>
    <description>Incident history and status updates for dosya.dev services.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(nowUnix)}</lastBuildDate>
${items}
  </channel>
</rss>`;
}
