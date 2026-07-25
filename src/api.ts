import type { StatusView } from "./snapshot";

export function buildStatusJson(view: StatusView): object {
  return {
    banner: view.banner,
    generatedAt: view.nowUnix,
    ranges: view.ranges,
    incidents: view.incidents.map((i) => ({
      id: i.id,
      component: i.component,
      kind: i.kind,
      status: i.status,
      title: i.title,
      body: i.body,
      startedAt: i.started_at,
      resolvedAt: i.resolved_at,
    })),
  };
}
