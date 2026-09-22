import { useMemo, useState } from "react";
import { discover } from "./repos";
import Hub from "./screens/Hub";
import DirPicker from "./screens/DirPicker";
import Running, { type RunningTarget } from "./screens/Running";
import Runtime from "./screens/Runtime";
import { launchDetached } from "./tmux";

export interface Choice {
  dir: string;
  runtime: string;
  /** Native harness session id to resume (undefined = fresh session). */
  resume?: string;
  /** Force a new tmux session even when the name is taken (`-N` suffix). */
  fresh?: boolean;
  /** Attach to this Atlas tmux session instead of launching (no record). */
  attachTmux?: string;
}

export type Screen =
  | { name: "hub" }
  | { name: "dir"; title: string; domain: string | null }
  | { name: "runtime"; dir: string; fresh: boolean }
  | { name: "running"; target: RunningTarget };

interface Props {
  onDone: (c: Choice | null) => void;
  /** Open straight on this screen (`atlas DIR`); esc falls back to the Hub. */
  start?: Screen;
}

export default function App({ onDone, start }: Props) {
  const [stack, setStack] = useState<Screen[]>(() =>
    start && start.name !== "hub" ? [{ name: "hub" }, start] : [{ name: "hub" }],
  );
  const candidates = useMemo(() => discover(), []);

  const push = (s: Screen) => setStack((st) => [...st, s]);
  const pop = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
  const top = stack[stack.length - 1];

  const domains = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of candidates) {
      if (c.kind !== "repo") continue;
      counts.set(c.domain, (counts.get(c.domain) ?? 0) + 1);
    }
    const names = [...new Set(candidates.map((c) => c.domain))].sort();
    return names.map((domain) => ({ domain, repos: counts.get(domain) ?? 0 }));
  }, [candidates]);

  if (top.name === "runtime") {
    return (
      <Runtime
        dir={top.dir}
        onPick={(runtime) => onDone({ dir: top.dir, runtime, fresh: top.fresh })}
        onBack={pop}
        onQuit={() => onDone(null)}
      />
    );
  }

  if (top.name === "dir") {
    const scoped =
      top.domain === null ? candidates : candidates.filter((c) => c.domain === top.domain);
    return (
      <DirPicker
        title={top.title}
        candidates={scoped}
        onPick={(dir) => push({ name: "runtime", dir, fresh: true })}
        onBack={pop}
        onQuit={() => onDone(null)}
      />
    );
  }

  if (top.name === "running") {
    return (
      <Running
        target={top.target}
        onBack={pop}
        onQuit={() => onDone(null)}
        onLaunch={(c) => onDone(c)}
        onAttach={(c) => onDone(c)}
        onMigrate={(c) => launchDetached(c.dir, c.runtime, c.resume)}
      />
    );
  }

  return (
    <Hub
      domains={domains}
      onOpen={(c) => onDone(c)}
      onViewRunning={(target) => push({ name: "running", target })}
      onNewSession={() => push({ name: "dir", title: "Nova sessão", domain: null })}
      onDrill={(domain) => push({ name: "dir", title: domain, domain })}
      onQuit={() => onDone(null)}
      onMigrate={(c) => launchDetached(c.dir, c.runtime, c.resume)}
    />
  );
}
