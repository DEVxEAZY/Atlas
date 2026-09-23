/** The Hub's title row as a KPI strip: what is alive right now first, then
 *  the long-running totals. It never takes a row of its own, and KPIs that
 *  do not fit the width drop from the right, least important first. */
import React from "react";
import { Box, Text } from "ink";
import { theme, RUNTIME_COLOR, RUNTIME_ICON, TMUX_MARK } from "../theme";
import { G } from "../glyphs";

export interface KpiPart {
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

/** One KPI: a few styled parts rendered side by side. */
export type Kpi = KpiPart[];

export interface KpiInput {
  /** Live agents by runtime (sessions and conversations running now). */
  live: Record<string, number>;
  /** Atlas-managed tmux sessions alive in any terminal. */
  tmux: number;
  cron: { active: number; pending: number; next: string | null };
  sessions: number;
}

const RUNTIMES = ["claude", "codex", "muse", "shell"];

/** KPIs in priority order: each one is dropped before those before it. */
export function hubKpis(k: KpiInput): Kpi[] {
  const out: Kpi[] = [];
  const now = Object.values(k.live).reduce((a, b) => a + b, 0);
  out.push(
    now > 0
      ? [{ text: `${G.live} `, color: theme.live }, { text: String(now), color: theme.live, bold: true }, { text: " agora", dim: true }]
      : [{ text: `${G.idle} nada rodando`, dim: true }],
  );
  const byRuntime = RUNTIMES.filter((r) => (k.live[r] ?? 0) > 0);
  if (byRuntime.length > 0) {
    const kpi: Kpi = [];
    byRuntime.forEach((r, i) => {
      if (i > 0) kpi.push({ text: " " });
      kpi.push({ text: RUNTIME_ICON[r] ?? G.bullet, color: RUNTIME_COLOR[r] }, { text: String(k.live[r]), bold: true });
    });
    out.push(kpi);
  }
  if (k.tmux > 0)
    out.push([{ text: `${TMUX_MARK} `, color: theme.peach }, { text: String(k.tmux), bold: true }, { text: " tmux", dim: true }]);
  if (k.cron.pending > 0)
    out.push([{ text: `${G.clock} `, color: theme.amber }, { text: String(k.cron.pending), color: theme.amber, bold: true }, { text: " aguardando", color: theme.amber }]);
  if (k.cron.active > 0) {
    const kpi: Kpi = [
      { text: `${G.clock} `, color: theme.seaCrest },
      { text: String(k.cron.active), bold: true },
      { text: k.cron.active === 1 ? " agendada" : " agendadas", dim: true },
    ];
    if (k.cron.next) kpi.push({ text: ` · próx. ${k.cron.next}`, dim: true });
    out.push(kpi);
  }
  out.push([{ text: String(k.sessions), bold: true }, { text: k.sessions === 1 ? " sessão" : " sessões", dim: true }]);
  return out;
}

const SEP = " · ";
const width = (kpi: Kpi) => kpi.reduce((n, p) => n + [...p.text].length, 0);

/** The leading KPIs that fit `max` columns, joined by SEP. */
export function packKpis(kpis: Kpi[], max: number): Kpi[] {
  const out: Kpi[] = [];
  let used = 0;
  for (const kpi of kpis) {
    const w = width(kpi) + (out.length > 0 ? SEP.length : 0);
    if (used + w > max) break;
    out.push(kpi);
    used += w;
  }
  return out;
}

const PREFIX = "Atlas — ";

export default function KpiTitle({ kpis, columns }: { kpis: Kpi[]; columns: number }) {
  // root padding takes 4 columns
  const shown = packKpis(kpis, Math.max(0, columns - 4 - PREFIX.length));
  return (
    <Box marginBottom={1}>
      <Text wrap="truncate">
        <Text color={theme.secondary} bold>
          Atlas
        </Text>
        <Text dimColor> — </Text>
        {shown.map((kpi, i) => (
          <Text key={i}>
            {i > 0 && <Text dimColor>{SEP}</Text>}
            {kpi.map((p, j) => (
              <Text key={j} color={p.color ?? theme.text} bold={p.bold} dimColor={p.dim}>
                {p.text}
              </Text>
            ))}
          </Text>
        ))}
      </Text>
    </Box>
  );
}
