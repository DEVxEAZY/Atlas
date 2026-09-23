import { describe, expect, test } from "bun:test";
import { hubKpis, packKpis, type Kpi } from "../src/components/Kpis";

const text = (kpis: Kpi[]) => kpis.map((k) => k.map((p) => p.text).join("")).join("  ·  ");
const base = { live: {}, tmux: 0, cron: { active: 0, pending: 0, next: null }, sessions: 13 };

describe("hub KPIs", () => {
  test("live first, then tmux, scheduled tasks and totals", () => {
    const k = hubKpis({
      live: { claude: 2, codex: 1 },
      tmux: 2,
      cron: { active: 2, pending: 1, next: "hoje 09:00" },
      sessions: 13,
    });
    expect(text(k)).toBe(
      "◉ 3 agora  ·  ✳\uFE0E 2  ⬢ 1  ·  𖥠 2 tmux  ·  ◷ 1 aguardando  ·  ◷ 2 agendadas · próx. hoje 09:00  ·  13 sessões",
    );
  });

  test("quiet machine: no zero counters, no conversation total", () => {
    expect(text(hubKpis({ ...base, sessions: 1 }))).toBe("○ nada rodando  ·  1 sessão");
  });

  test("narrow widths drop KPIs from the right, never cut one in half", () => {
    const k = hubKpis({ ...base, live: { claude: 1 }, tmux: 1 });
    for (let w = 0; w < 80; w++) {
      const shown = packKpis(k, w);
      expect([...text(shown)].length).toBeLessThanOrEqual(w);
      expect(shown).toEqual(k.slice(0, shown.length)); // a prefix, in order
    }
    expect(packKpis(k, 200)).toEqual(k);
  });
});
