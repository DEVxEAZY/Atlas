import { existsSync } from "node:fs";
import { homedir } from "node:os";
import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { load, rekeyRuntime, remove, type Session } from "../history";
import {
  HARNESS_ORDER,
  NATIVE_SHOW_LIMIT,
  loadNativeSessions,
  loadNativeTotals,
  scanHarness,
  type Harness,
  type NativeSession,
} from "../native/index";
import { cycleRuntime } from "../runtimes";
import {
  HARNESS_LABEL,
  convoDisplay,
  convoExpandLabel,
  firstItemIndex,
  isTmpDir,
  matchConvo,
  matchSession,
  moveIndex,
  sessionDisplay,
  sessionRows,
  windowSlice,
} from "../rows";
import { ago, shorten } from "../util";
import { RUNTIME_COLOR, RUNTIME_ICON, TMUX_MARK, theme } from "../theme";
import {
  TMUX_PREFIX,
  buildTmuxFallback,
  hasSession,
  killSession,
  listAtlasSessions,
  listTmuxPanes,
  matchAtlasSession,
  matchAtlasSessionDeep,
  tmuxBaseName,
  tmuxUsable,
  type TmuxFallback,
  type TmuxPane,
  type TmuxSession,
} from "../tmux";
import {
  Dim,
  HeaderRow,
  HintBar,
  ItemRow,
  StatusLine,
  hintsWidth,
  Title,
  hubBoat,
  listHeightFor,
} from "../components/chrome";
import Voyage from "../components/Voyage";
import { pendingCount } from "./Crons";
import { useLive, useLiveIndex } from "../components/useLiveIndex";
import { useTermSize } from "../components/useTermSize";
import { useSpinner } from "../components/useSpinner";
import {
  keysForAgents,
  pidsForKey,
  pidsForResume,
  resumeIdsForAgents,
  runningKeys,
  runningResumeIds,
  runtimeForCommand,
  scanAgents,
  terminatePids,
} from "../process";
import type { Choice } from "../App";
import {
  convoMigration,
  migrationArmKey,
  migrationInFlight,
  runMigration,
  sessionMigration,
  type MigrateResult,
  type Migration,
} from "../migrate";
import type { RunningTarget } from "./Running";

export const RECENT_LIMIT = 10;

/** Left-column width that fits the full filter hint (57 chars + "/ "). */
export const FULL_HINT_MIN_LEFT = 59;

/** Hint sets: the full list-mode set (no `/`: the filter placeholder right
 *  above already says it), its narrow essential subset, and the short
 *  filter-mode set (always fits). HINTS_FULL_MIN_COLS tracks the full
 *  set's rendered width + 4 root padding so the bar never wraps. */
export const HINTS_FULL: Array<[string, string]> = [
  ["Enter", "abrir"],
  ["n", "nova"],
  ["r", "runtime"],
  ["d", "remover"],
  ["X", "matar"],
  ["T", "tmux"],
  ["q", "sair"],
];
/** The full set plus the scheduled tasks key, on screens wide enough. */
export const HINTS_WIDE: Array<[string, string]> = [...HINTS_FULL.slice(0, -1), ["C", "cron"], ["q", "sair"]];
export const HINTS_SHORT: Array<[string, string]> = [
  ["Enter", "abrir"],
  ["n", "nova"],
  ["/", "filtrar"],
  ["q", "sair"],
];
export const HINTS_FILTER: Array<[string, string]> = [
  ["↑↓", "navegar"],
  ["Enter", "abrir"],
  ["esc", "lista"],
];
export const HINTS_FULL_MIN_COLS = hintsWidth(HINTS_FULL) + 4;
export const HINTS_WIDE_MIN_COLS = hintsWidth(HINTS_WIDE) + 4;

type HubRow =
  | { t: "toggleRecents" }
  | { t: "toggleConvos" }
  | { t: "header"; label: string }
  | { t: "session"; session: Session }
  | { t: "convo"; convo: NativeSession }
  | { t: "expandConvo"; harness: Harness; mode: "more" | "less" | "loading"; total: number }
  | { t: "toggleTmp" }
  | { t: "tmux"; name: string; runtime: string; dir: string }
  | { t: "domain"; domain: string; repos: number };

interface Props {
  domains: Array<{ domain: string; repos: number }>;
  onOpen: (c: Choice) => void;
  onViewRunning: (t: RunningTarget) => void;
  onNewSession: () => void;
  /** Scheduled tasks screen (C). */
  onCrons?: () => void;
  onDrill: (domain: string) => void;
  onQuit: () => void;
  /** Background relaunch into tmux (never attaches). */
  onMigrate: (c: Choice) => MigrateResult;
}

function SessionContent({
  s,
  hot,
  running,
  spin,
  tmux,
}: {
  s: Session;
  hot: boolean;
  running: boolean;
  spin: string;
  tmux: boolean;
}) {
  const fg = hot ? theme.highlightFg : theme.text;
  const icon = RUNTIME_ICON[s.runtime] ?? "•";
  const iconColor = hot ? theme.highlightFg : (RUNTIME_COLOR[s.runtime] ?? theme.text);
  const missing = existsSync(s.dir) ? "" : " ⚠";
  return (
    <Text>
      {running ? (
        <Text color={hot ? theme.highlightFg : theme.live}>{`${spin} `}</Text>
      ) : (
        <Text>{`  `}</Text>
      )}
      {tmux && <Text color={hot ? theme.highlightFg : theme.peach}>{`${TMUX_MARK} `}</Text>}
      <Text color={iconColor}>{`${icon} `}</Text>
      <Text color={fg}>{`${s.runtime.padEnd(6)} ${sessionDisplay(s)}  `}</Text>
      {hot ? (
        <Text color="#3A2A1A">{`· ${ago(s.last_used)} · ${s.uses}x${missing}`}</Text>
      ) : (
        <Text dimColor>{`· ${ago(s.last_used)} · ${s.uses}x${missing}`}</Text>
      )}
    </Text>
  );
}

function ConvoContent({
  c,
  hot,
  live,
  spin,
  tmux,
}: {
  c: NativeSession;
  hot: boolean;
  live: boolean;
  spin: string;
  tmux: boolean;
}) {
  const fg = hot ? theme.highlightFg : theme.text;
  const icon = RUNTIME_ICON[c.harness] ?? "•";
  const iconColor = hot ? theme.highlightFg : (RUNTIME_COLOR[c.harness] ?? theme.text);
  const preview = c.preview ? `  “${c.preview.slice(0, 48)}”` : `  · ${c.id.slice(0, 8)}`;
  return (
    <Text>
      {live ? (
        <Text color={hot ? theme.highlightFg : theme.live}>{`${spin} `}</Text>
      ) : (
        <Text>{`  `}</Text>
      )}
      {tmux && <Text color={hot ? theme.highlightFg : theme.peach}>{`${TMUX_MARK} `}</Text>}
      <Text color={iconColor}>{`${icon} `}</Text>
      <Text color={fg}>{convoDisplay(c)}</Text>
      {hot ? (
        <Text color="#3A2A1A">{`${preview}  · ${ago(new Date(c.updatedAt).toISOString())}`}</Text>
      ) : (
        <Text dimColor>{`${preview}  · ${ago(new Date(c.updatedAt).toISOString())}`}</Text>
      )}
    </Text>
  );
}

function TmuxContent({
  name,
  runtime,
  dir,
  hot,
  spin,
}: {
  name: string;
  runtime: string;
  dir: string;
  hot: boolean;
  spin: string;
}) {
  const fg = hot ? theme.highlightFg : theme.text;
  const icon = RUNTIME_ICON[runtime] ?? "•";
  const iconColor = hot ? theme.highlightFg : (RUNTIME_COLOR[runtime] ?? theme.text);
  return (
    <Text>
      <Text color={hot ? theme.highlightFg : theme.live}>{`${spin} `}</Text>
      <Text color={hot ? theme.highlightFg : theme.peach}>{`${TMUX_MARK} `}</Text>
      <Text color={iconColor}>{`${icon} `}</Text>
      <Text color={fg}>{`${runtime.padEnd(6)} ${name}  `}</Text>
      {hot ? (
        <Text color="#3A2A1A">{`· ${shorten(dir)}`}</Text>
      ) : (
        <Text dimColor>{`· ${shorten(dir)}`}</Text>
      )}
    </Text>
  );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  return a.size === b.size && [...a].every((k) => b.has(k));
}

function samePanes(a: TmuxPane[], b: TmuxPane[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        p.session === b[i].session &&
        p.command === b[i].command &&
        p.path === b[i].path &&
        p.tty === b[i].tty,
    )
  );
}

function sameTmux(a: Map<string, TmuxSession>, b: Map<string, TmuxSession>): boolean {
  return (
    a.size === b.size &&
    [...a].every(([k, s]) => b.get(k)?.attached === s.attached)
  );
}

function sameStrMap(a: Map<string, string>, b: Map<string, string>): boolean {
  return a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
}

function sameFallback(a: TmuxFallback, b: TmuxFallback): boolean {
  return sameStrMap(a.byKey, b.byKey) && sameStrMap(a.byResume, b.byResume);
}

export default function Hub({
  domains,
  onOpen,
  onViewRunning,
  onNewSession,
  onCrons,
  onDrill,
  onQuit,
  onMigrate,
}: Props) {
  const [sessions, setSessions] = useState<Session[]>(() => load());
  const [convos] = useState<NativeSession[]>(() => loadNativeSessions());
  const [fullHarness, setFullHarness] = useState<Record<Harness, NativeSession[] | null>>(() => ({
    claude: null,
    codex: null,
    muse: null,
  }));
  const [totals] = useState<Record<Harness, number>>(() => loadNativeTotals());
  const [expandedHarness, setExpandedHarness] = useState<Record<Harness, boolean>>(() => ({
    claude: false,
    codex: false,
    muse: false,
  }));
  const [loadingHarness, setLoadingHarness] = useState<Record<Harness, boolean>>(() => ({
    claude: false,
    codex: false,
    muse: false,
  }));
  // live agents: snapshot at mount, then refresh so sessions started or
  // stopped while browsing pin/unpin without reopening (cheap /proc scan
  // plus one `tmux ls` for Atlas-managed sessions in any terminal)
  const [running, setRunning] = useState(() => runningKeys());
  const [liveResumes, setLiveResumes] = useState(() => runningResumeIds());
  const [tmuxSessions, setTmuxSessions] = useState(() => listAtlasSessions());
  const [tmuxPanes, setTmuxPanes] = useState(() => listTmuxPanes());
  const [fallbackTmux, setFallbackTmux] = useState(() =>
    buildTmuxFallback(scanAgents(), listTmuxPanes()),
  );
  useEffect(() => {
    const t = setInterval(() => {
      // one /proc walk feeds every live index (keys, resumes, tmux links)
      const agents = scanAgents();
      const nextRunning = keysForAgents(agents);
      setRunning((prev) => (sameSet(nextRunning, prev) ? prev : nextRunning));
      const nextResumes = resumeIdsForAgents(agents);
      setLiveResumes((prev) => (sameSet(nextResumes, prev) ? prev : nextResumes));
      const nextTmux = listAtlasSessions();
      setTmuxSessions((prev) => (sameTmux(nextTmux, prev) ? prev : nextTmux));
      const nextPanes = listTmuxPanes();
      setTmuxPanes((prev) => (samePanes(nextPanes, prev) ? prev : nextPanes));
      const nextFallback = buildTmuxFallback(agents, nextPanes);
      setFallbackTmux((prev) => (sameFallback(nextFallback, prev) ? prev : nextFallback));
    }, 2000);
    return () => clearInterval(t);
  }, []);
  const tmuxForSession = (s: Session): string | null =>
    matchAtlasSessionDeep(tmuxSessions, tmuxBaseName(s.dir, s.runtime)) ??
    fallbackTmux.byKey.get(`${s.dir}\0${s.runtime}`) ??
    null;
  const tmuxForConvo = (c: NativeSession): string | null =>
    matchAtlasSession(tmuxSessions, tmuxBaseName(c.dir ?? homedir(), c.harness, c.id)) ??
    fallbackTmux.byResume.get(c.id) ??
    null;
  // recents open on their own when one of them is actually running
  const [expandedRecents, setExpandedRecents] = useState(() =>
    sessions.some(
      (s) => running.has(`${s.dir}\0${s.runtime}`) || tmuxForSession(s) !== null,
    ),
  );
  const [expandedConvos, setExpandedConvos] = useState(() =>
    convos.some((c) => liveResumes.has(c.id) || tmuxForConvo(c) !== null),
  );
  const [query, setQuery] = useState("");
  const [showTmp, setShowTmp] = useState(false);
  const [focus, setFocus] = useState<"list" | "filter">("list");
  const [index, indexRef, setIndex] = useLiveIndex(0);
  // proposals filed by an agent only run once installed here: say so
  const [msg, setMsg] = useState(() => {
    const n = pendingCount();
    return n === 0 ? "" : `${n} ${n === 1 ? "tarefa agendada aguarda" : "tarefas agendadas aguardam"} confirmação — C para revisar.`;
  });
  /** Row key armed by the first X (second X on the same row kills). */
  // armed keys and the busy flag are read through refs: keys coalesced
  // into one stdin read (lagged SSH, a blocking refresh) must see the
  // disarm that the key before them just did
  const [, armedKillRef, setArmedKill] = useLive<string | null>(null);
  /** Row key armed by the first T (second T on the same row migrates). */
  const [, armedMigrateRef, setArmedMigrate] = useLive<string | null>(null);
  const [, killingRef, setKilling] = useLive(false);
  // no tmux, no migration: the T hint only shows where it can work
  const [tmuxOk] = useState(() => tmuxUsable());
  const { columns, rows: termRows } = useTermSize();
  const spin = useSpinner(running.size > 0 || liveResumes.size > 0 || tmuxSessions.size > 0);
  const isRunning = (s: Session): boolean =>
    running.has(`${s.dir}\0${s.runtime}`) || tmuxForSession(s) !== null;
  const isConvoLive = (c: NativeSession): boolean =>
    liveResumes.has(c.id) || tmuxForConvo(c) !== null;

  /** Stable identity for arming X: indexes shift when live rows pin/unpin. */
  const rowKey = (row: HubRow): string | null => {
    if (row.t === "session") return `s:${row.session.dir}\0${row.session.runtime}`;
    if (row.t === "convo") return `c:${row.convo.harness}:${row.convo.id}`;
    if (row.t === "tmux") return `t:${row.name}`;
    return null;
  };

  interface Killable {
    tmux: string | null;
    procs: number[];
    label: string;
  }

  const killableFor = (row: HubRow): Killable | null => {
    if (row.t === "session") {
      const s = row.session;
      return {
        tmux: tmuxForSession(s),
        procs: pidsForKey(s.dir, s.runtime),
        label: `${s.runtime} ${sessionDisplay(s)}`,
      };
    }
    if (row.t === "convo") {
      const c = row.convo;
      return {
        tmux: tmuxForConvo(c),
        procs: pidsForResume(c.id),
        label: `${c.harness} ${convoDisplay(c)}`,
      };
    }
    if (row.t === "tmux") {
      return { tmux: row.name, procs: [], label: row.name };
    }
    return null;
  };

  const refreshLive = (): void => {
    const agents = scanAgents();
    setRunning(keysForAgents(agents));
    setLiveResumes(resumeIdsForAgents(agents));
    setTmuxSessions(listAtlasSessions());
    const panes = listTmuxPanes();
    setTmuxPanes(panes);
    setFallbackTmux(buildTmuxFallback(agents, panes));
  };

  /** Kill what a row points at (tmux session wins over bare processes),
   *  re-resolving everything fresh so a death mid-flight reads as done. */
  const killRow = async (row: HubRow): Promise<void> => {
    const info = killableFor(row);
    if (!info) return;
    if (info.tmux) {
      setMsg("encerrando sessão tmux…");
      if (!hasSession(info.tmux)) {
        refreshLive();
        setMsg("a sessão tmux já tinha encerrado.");
        return;
      }
      if (killSession(info.tmux) && !hasSession(info.tmux)) {
        refreshLive();
        setMsg(`sessão tmux '${info.tmux}' encerrada.`);
      } else {
        refreshLive();
        setMsg(`não consegui encerrar a sessão tmux '${info.tmux}'.`);
      }
      return;
    }
    if (info.procs.length === 0) {
      refreshLive();
      setMsg("o processo já tinha encerrado.");
      return;
    }
    setMsg("encerrando…");
    const result = await terminatePids(info.procs);
    refreshLive();
    if (result.alive.length === 0) setMsg(`encerrado: ${info.label}.`);
    else setMsg(`não consegui encerrar o PID ${result.alive.join(", ")} — sem permissão?`);
  };

  /** What T does on a row: rows already in tmux (or with nothing to move)
   *  refuse with guidance; see migrate.ts for the rest. */
  const migrationFor = (row: HubRow): Migration => {
    if (row.t === "tmux") return { refuse: "já está no tmux — Enter entra." };
    if (row.t === "session") {
      if (tmuxForSession(row.session)) return { refuse: "já está no tmux — Enter entra." };
      return sessionMigration(row.session);
    }
    if (row.t === "convo") {
      if (tmuxForConvo(row.convo)) return { refuse: "já está no tmux — Enter entra." };
      return convoMigration(row.convo);
    }
    return { refuse: "nada para levar ao tmux nessa linha." };
  };

  const migrateRow = async (row: HubRow): Promise<void> => {
    // re-resolve: the process may have died or moved since the first T
    const m = migrationFor(row);
    if ("refuse" in m) {
      setMsg(m.refuse);
      return;
    }
    const r = await runMigration(m, onMigrate, setMsg);
    refreshLive();
    setMsg(r.ok ? `no tmux em 2º plano: ${r.name ?? "sessão criada"} — Enter entra.` : r.error!);
  };

  // /tmp convos stay hidden unless asked for — except live ones, which
  // must stay visible like every other live session
  const convoVisible = (c: NativeSession): boolean =>
    showTmp || !isTmpDir(c.dir) || isConvoLive(c);

  const filtering = query.trim().length > 0;
  const showRecents = expandedRecents || filtering;
  const showConvos = expandedConvos || filtering;

  /** Effective convos: full history once loaded per harness, else the initial parse. */
  const effectiveConvos = useMemo(() => {
    const out: NativeSession[] = [];
    for (const h of ["claude", "codex", "muse"] as const) {
      if (fullHarness[h]) out.push(...fullHarness[h]);
      else out.push(...convos.filter((c) => c.harness === h));
    }
    return out;
  }, [convos, fullHarness]);

  /** tmux sessions already shown through a history/convo row (no duplicates). */
  const representedTmux = useMemo(() => {
    const out = new Set<string>();
    for (const s of sessions) {
      const t = tmuxForSession(s);
      if (t) out.add(t);
    }
    for (const c of effectiveConvos) {
      const t = tmuxForConvo(c);
      if (t) out.add(t);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, effectiveConvos, tmuxSessions]);

  interface StrayTmux {
    name: string;
    runtime: string;
    dir: string;
  }

  /** Live tmux sessions Atlas does not otherwise show: everything in the
   *  Atlas namespace (orphans included) plus foreign sessions with an agent
   *  runtime in a pane. Idle foreign shells stay out of the way. */
  const strays: StrayTmux[] = useMemo(() => {
    const panesBySession = new Map<string, TmuxPane[]>();
    for (const p of tmuxPanes) {
      const list = panesBySession.get(p.session) ?? [];
      list.push(p);
      panesBySession.set(p.session, list);
    }
    const out: StrayTmux[] = [];
    for (const [name, panes] of panesBySession) {
      if (representedTmux.has(name)) continue;
      const owned = name.startsWith(TMUX_PREFIX);
      let runtime = "";
      let dir = panes[0]?.path ?? "";
      for (const p of panes) {
        const r = runtimeForCommand(p.command);
        if (r) {
          runtime = r;
          dir = p.path;
          break;
        }
      }
      if (!owned && !runtime) continue;
      out.push({ name, runtime: runtime || "shell", dir });
    }
    out.sort(
      (a, b) =>
        Number(a.runtime === "shell") - Number(b.runtime === "shell") || (a.name < b.name ? -1 : 1),
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tmuxPanes, tmuxSessions, representedTmux]);

  const rows: HubRow[] = useMemo(() => {
    // quick access to everything alive right now (Recentes/Conversas keep
    // showing them too, pinned to the top of their own sections)
    const out: HubRow[] = [];
    const liveSessions = sessions
      .filter((s) => isRunning(s) && matchSession(s, query))
      .sort((a, b) => (a.last_used < b.last_used ? 1 : -1));
    const liveConvos = effectiveConvos
      .filter((c) => isConvoLive(c) && matchConvo(c, query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const nowCount = liveSessions.length + liveConvos.length;
    if (nowCount > 0) {
      out.push({ t: "header", label: `◉ agora  ·  ${nowCount}` });
      for (const s of liveSessions) out.push({ t: "session", session: s });
      for (const c of liveConvos) out.push({ t: "convo", convo: c });
    }
    out.push({ t: "toggleRecents" });
    if (showRecents) {
      const visible = sessions.filter((s) => matchSession(s, query));
      // live sessions pin to the top (stable: keeps recency order inside groups)
      const pinned = visible
        .map((s, i) => ({ s, i }))
        .sort(
          (a, b) =>
            Number(!isRunning(a.s)) - Number(!isRunning(b.s)) || a.i - b.i,
        )
        .map((x) => x.s);
      const capped = filtering ? pinned : pinned.slice(0, RECENT_LIMIT);
      // pass isRunning: grouping re-sorts, so pinning must apply inside sessionRows too
      const parts = sessionRows(capped, isRunning);
      if (parts.length === 0) {
        out.push({
          t: "header",
          label: filtering ? `— nada combina com “${query.trim()}” —` : "— nenhuma sessão ainda · n cria —",
        });
      }
      for (const p of parts) {
        if (p.t === "header") out.push({ t: "header", label: p.label });
        else out.push({ t: "session", session: p.session });
      }
    }
    out.push({ t: "toggleConvos" });
    if (showConvos) {
      const matching = effectiveConvos.filter(
        (c) => matchConvo(c, query) && convoVisible(c),
      );
      if (matching.length === 0) {
        out.push({
          t: "header",
          label: filtering
            ? `— nada combina com “${query.trim()}” —`
            : "— nenhuma conversa encontrada nos harnesses —",
        });
      }
      for (const h of HARNESS_ORDER) {
        const items = matching
          .filter((c) => c.harness === h)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        if (items.length === 0) continue;
        // totals follow the visible universe: tmp-hidden convos don't count,
        // so "ver todas" terminally becomes "ver menos" once all visible show
        const hidden = showTmp
          ? 0
          : effectiveConvos.filter((c) => c.harness === h && isTmpDir(c.dir) && !isConvoLive(c))
              .length;
        const total = totals[h] - hidden;
        const open = filtering || expandedHarness[h];
        const shown = open ? items : items.slice(0, NATIVE_SHOW_LIMIT);
        const count = total > shown.length ? `${shown.length} de ${total}` : `${total}`;
        out.push({
          t: "header",
          label: `${RUNTIME_ICON[h]} ${HARNESS_LABEL[h]}  ·  ${count}`,
        });
        for (const c of shown) out.push({ t: "convo", convo: c });
        if (!filtering && total > shown.length) {
          out.push({
            t: "expandConvo",
            harness: h,
            mode: loadingHarness[h] ? "loading" : "more",
            total,
          });
        } else if (!filtering && expandedHarness[h] && total > NATIVE_SHOW_LIMIT) {
          out.push({ t: "expandConvo", harness: h, mode: "less", total });
        }
      }
      if (effectiveConvos.some((c) => isTmpDir(c.dir))) out.push({ t: "toggleTmp" });
    }
    const matchingStrays = filtering
      ? strays.filter((s) => {
          const hay = `${s.runtime} ${s.name} ${s.dir}`.toLowerCase();
          return query
            .trim()
            .toLowerCase()
            .split(/\s+/)
            .every((w) => hay.includes(w));
        })
      : strays;
    if (matchingStrays.length > 0) {
      const n = matchingStrays.length;
      out.push({ t: "header", label: `◈ sessões tmux  ·  ${n} ${n === 1 ? "sessão" : "sessões"}` });
      for (const s of matchingStrays) out.push({ t: "tmux", name: s.name, runtime: s.runtime, dir: s.dir });
    }
    for (const d of domains) out.push({ t: "domain", domain: d.domain, repos: d.repos });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, effectiveConvos, totals, expandedHarness, loadingHarness, query, filtering, showRecents, showConvos, domains, running, liveResumes, tmuxSessions, strays, showTmp]);

  useEffect(() => {
    setIndex((prev) => {
      if (prev !== null && rows[prev] && rows[prev].t !== "header") return prev;
      const first = rows.findIndex((r) => r.t !== "header");
      return first === -1 ? null : first;
    });
  }, [rows]);

  const toggleRecentsLabel = (): string => {
    const total = sessions.length;
    if (!showRecents) return total === 0 ? "▸ Recentes · nenhuma" : `▸ Recentes · ${total}`;
    if (filtering) {
      const n = sessions.filter((s) => matchSession(s, query)).length;
      return `▾ Recentes · ${n} ${n === 1 ? "resultado" : "resultados"}`;
    }
    return total <= RECENT_LIMIT ? `▾ Recentes · ${total}` : `▾ Recentes · ${RECENT_LIMIT} de ${total}`;
  };

  const toggleConvosLabel = (): string => {
    const total = totals.claude + totals.codex + totals.muse;
    if (!showConvos) return total === 0 ? "▸ Conversas · nenhuma" : `▸ Conversas · ${total}`;
    if (filtering) {
      // same universe the section lists: loaded history, /tmp visibility
      const n = effectiveConvos.filter((c) => matchConvo(c, query) && convoVisible(c)).length;
      return `▾ Conversas · ${n} ${n === 1 ? "resultado" : "resultados"}`;
    }
    return `▾ Conversas · ${total}`;
  };

  const activate = (at: number | null) => {
    if (at === null) return;
    const row = rows[at];
    if (!row || row.t === "header") return;
    if (row.t === "toggleRecents") {
      setExpandedRecents((e) => !e);
      return;
    }
    if (row.t === "toggleConvos") {
      setExpandedConvos((e) => !e);
      return;
    }
    if (row.t === "expandConvo") {
      const h = row.harness;
      if (row.mode === "loading") return;
      if (expandedHarness[h]) {
        // collapse display only: loaded data stays for the filter
        setExpandedHarness((prev) => ({ ...prev, [h]: false }));
        return;
      }
      setLoadingHarness((prev) => ({ ...prev, [h]: true }));
      // async so the "carregando…" row paints before the (sync) full scan runs
      setTimeout(() => {
        const items = scanHarness(h, Infinity).sort((a, b) => b.updatedAt - a.updatedAt);
        setFullHarness((prev) => ({ ...prev, [h]: items }));
        setExpandedHarness((prev) => ({ ...prev, [h]: true }));
        setLoadingHarness((prev) => ({ ...prev, [h]: false }));
      }, 30);
      return;
    }
    if (row.t === "toggleTmp") {
      setShowTmp((v) => !v);
      return;
    }
    if (row.t === "domain") {
      onDrill(row.domain);
      return;
    }
    if (row.t === "convo") {
      const c = row.convo;
      const t = tmuxForConvo(c);
      if (t) {
        onViewRunning({ kind: "convo", convo: c, tmux: t });
        return;
      }
      if (liveResumes.has(c.id)) {
        onViewRunning({ kind: "convo", convo: c });
        return;
      }
      onOpen({ dir: c.dir ?? homedir(), runtime: c.harness, resume: c.id });
      return;
    }
    if (row.t === "tmux") {
      // unmanaged session: coordinates for viewing/attaching, never recorded
      onViewRunning({
        kind: "session",
        session: { dir: row.dir, runtime: row.runtime, last_used: new Date().toISOString(), uses: 1 },
        tmux: row.name,
      });
      return;
    }
    const s = row.session;
    if (!existsSync(s.dir)) {
      setMsg(`Diretório não existe mais: ${s.dir}`);
      return;
    }
    const t = tmuxForSession(s);
    if (t) {
      onViewRunning({ kind: "session", session: s, tmux: t });
      return;
    }
    if (running.has(`${s.dir}\0${s.runtime}`)) {
      onViewRunning({ kind: "session", session: s });
      return;
    }
    onOpen({ dir: s.dir, runtime: s.runtime });
  };

  /** Which collapsible section contains the highlight (for ←). */
  const sectionOf = (at: number | null): "recents" | "convos" | null => {
    if (at === null) return null;
    for (let i = at; i >= 0; i--) {
      if (rows[i].t === "toggleRecents") return "recents";
      if (rows[i].t === "toggleConvos") return "convos";
    }
    return null;
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    // a kill or migration is between SIGTERM and relaunch: leaving now would
    // strand the agent stopped and never resumed
    if (killingRef.current || migrationInFlight()) return;
    // an armed X/T only survives its own second press: moving, filtering or
    // any other key disarms, so a later lone press never acts unprompted
    if (input !== "T" || key.ctrl || key.meta) setArmedMigrate(null);
    if (input !== "X" || key.ctrl || key.meta) setArmedKill(null);
    if (focus === "filter") {
      if (key.upArrow || key.downArrow) {
        setIndex((prev) => moveIndex(rows, prev ?? 0, key.upArrow ? -1 : 1));
      } else if (key.escape) {
        setQuery("");
        setFocus("list");
      }
      return;
    }
    if (key.upArrow || key.downArrow) {
      setMsg("");
      setIndex((prev) => moveIndex(rows, prev ?? 0, key.upArrow ? -1 : 1));
    }
    else if (key.leftArrow) {
      const section = sectionOf(indexRef.current);
      if (section === "recents") setExpandedRecents(false);
      else if (section === "convos") setExpandedConvos(false);
    } else if (key.rightArrow) {
      const at = indexRef.current !== null ? rows[indexRef.current] : undefined;
      if (at?.t === "toggleRecents") setExpandedRecents(true);
      else if (at?.t === "toggleConvos") setExpandedConvos(true);
    } else if (key.return) activate(indexRef.current);
    else if (key.escape) {
      if (filtering) setQuery("");
      else if (expandedRecents) setExpandedRecents(false);
      else if (expandedConvos) setExpandedConvos(false);
    } else if (input === "n") onNewSession();
    else if (input === "C" && !key.ctrl && !key.meta) onCrons?.();
    else if (input === "q") onQuit();
    else if (input === "/") setFocus("filter");
    else if (input === "r" || input === "d") {
      const at = indexRef.current !== null ? rows[indexRef.current] : undefined;
      if (at?.t !== "session") return;
      if (input === "r") {
        const next = cycleRuntime(at.session.runtime);
        rekeyRuntime(at.session.dir, at.session.runtime, next);
        at.session.runtime = next;
        setSessions([...sessions]);
      } else {
        if (isRunning(at.session)) {
          setMsg("sessão em execução — X encerra antes de remover do histórico.");
          return;
        }
        remove(at.session.dir, at.session.runtime);
        setSessions(sessions.filter((x) => x !== at.session));
        setMsg("Sessão removida do histórico.");
      }
    } else if (input === "T" && !key.ctrl && !key.meta) {
      const at = indexRef.current !== null ? rows[indexRef.current] : undefined;
      const m = at ? migrationFor(at) : null;
      if (!at || !m || "refuse" in m) {
        setArmedMigrate(null);
        setMsg(m && "refuse" in m ? m.refuse : "nada para levar ao tmux nessa linha.");
        return;
      }
      // arm on what the second T will actually do: if the row flips between
      // "open detached" and "stop and move" in between, ask again
      const k = migrationArmKey(rowKey(at)!, m);
      if (armedMigrateRef.current !== k) {
        setArmedMigrate(k);
        setMsg(
          m.pids.length > 0
            ? "T de novo para migrar para o tmux (encerra aqui, continua lá em 2º plano)."
            : "T de novo para abrir no tmux em 2º plano.",
        );
        return;
      }
      setArmedMigrate(null);
      setKilling(true);
      void migrateRow(at).finally(() => setKilling(false));
    } else if (input === "X" && !key.ctrl && !key.meta) {
      const at = indexRef.current !== null ? rows[indexRef.current] : undefined;
      const info = at ? killableFor(at) : null;
      if (!info || (!info.tmux && info.procs.length === 0)) {
        setArmedKill(null);
        setMsg("nada rodando nessa linha para encerrar.");
        return;
      }
      const k = rowKey(at!);
      if (armedKillRef.current !== k) {
        setArmedKill(k);
        setMsg(
          info.tmux
            ? `X de novo para encerrar a sessão tmux '${info.tmux}'.`
            : info.procs.length === 1
              ? `X de novo para encerrar ${info.label} de verdade.`
              : `X de novo para encerrar os ${info.procs.length} processos (${info.label}).`,
        );
        return;
      }
      setArmedKill(null);
      setKilling(true);
      void killRow(at!).finally(() => setKilling(false));
    } else if (input && !key.ctrl && !key.meta && !/[\x00-\x1f\x7f]/.test(input)) {
      // type-to-filter: any other printable text jumps straight into the filter
      setQuery((q) => q + input);
      setFocus("filter");
    }
  });

  const listHeight = listHeightFor(termRows);
  // the agora section may put a header first: land on the first live row
  useEffect(() => {
    setIndex(firstItemIndex(rows));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [start, end] = windowSlice(rows.length, index, listHeight);
  // room for the filter row once root padding takes its share
  const leftWidth = columns - 4;

  const renderHeader = (label: string, at: number) => {
    const icon = label[0];
    const colored = ["⬢", "✳", "◈", "▸", "◉"].includes(icon);
    return (
      <HeaderRow key={at}>
        {colored ? (
          <Text>
            <Text color={theme.peach}>{icon}</Text>
            <Dim>{label.slice(1)}</Dim>
          </Text>
        ) : (
          <Dim>{label}</Dim>
        )}
      </HeaderRow>
    );
  };

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      <Title>
        {sessions.length === 1 ? "1 sessão" : `${sessions.length} sessões`}
        {` · ${totals.claude + totals.codex + totals.muse} conversas`}
      </Title>
      <Box marginBottom={1}>
        <Text dimColor>/ </Text>
        <TextInput
          key={focus} // fresh input per focus: external query sets would desync its cursor
          value={query}
          onChange={setQuery}
          onSubmit={() => activate(indexRef.current)}
          focus={focus === "filter"}
          placeholder={
            leftWidth >= FULL_HINT_MIN_LEFT
              ? "filtrar sessões e conversas…  ( digite ou / · esc volta )"
              : "filtrar…  ( / · esc )"
          }
        />
      </Box>
      {rows.slice(start, end).map((row, i) => {
        const at = start + i;
        const hot = at === index;
        if (row.t === "header") return renderHeader(row.label, at);
        if (row.t === "toggleRecents") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : theme.peach}>{toggleRecentsLabel()}</Text>
            </ItemRow>
          );
        }
        if (row.t === "toggleConvos") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : theme.coral}>{toggleConvosLabel()}</Text>
            </ItemRow>
          );
        }
        if (row.t === "expandConvo") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : undefined} dimColor={!hot}>
                {`  ${convoExpandLabel(row)}`}
              </Text>
            </ItemRow>
          );
        }
        if (row.t === "toggleTmp") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : undefined} dimColor={!hot}>
                {showTmp ? "  … ocultar conversas de /tmp" : "  … mostrar conversas de /tmp"}
              </Text>
            </ItemRow>
          );
        }
        if (row.t === "domain") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : theme.peach}>{"  ◆ "}</Text>
              <Text color={hot ? theme.highlightFg : theme.text}>{row.domain}</Text>
              {hot ? (
                <Text color="#3A2A1A">{`  ·  ${row.repos} ${row.repos === 1 ? "repo" : "repos"}`}</Text>
              ) : (
                <Text dimColor>{`  ·  ${row.repos} ${row.repos === 1 ? "repo" : "repos"}`}</Text>
              )}
            </ItemRow>
          );
        }
        if (row.t === "convo") {
          return (
            <ItemRow key={at} hot={hot}>
              <ConvoContent
                c={row.convo}
                hot={hot}
                live={isConvoLive(row.convo)}
                spin={spin}
                tmux={tmuxForConvo(row.convo) !== null}
              />
            </ItemRow>
          );
        }
        if (row.t === "tmux") {
          return (
            <ItemRow key={at} hot={hot}>
              <TmuxContent name={row.name} runtime={row.runtime} dir={row.dir} hot={hot} spin={spin} />
            </ItemRow>
          );
        }
        return (
          <ItemRow key={at} hot={hot}>
            <SessionContent
              s={row.session}
              hot={hot}
              running={isRunning(row.session)}
              spin={spin}
              tmux={tmuxForSession(row.session) !== null}
            />
          </ItemRow>
        );
      })}
      <StatusLine msg={msg} />
      <HintBar
        hints={
          focus === "filter"
            ? HINTS_FILTER
            : columns >= HINTS_FULL_MIN_COLS
              ? (columns >= HINTS_WIDE_MIN_COLS ? HINTS_WIDE : HINTS_FULL).filter(([k]) => tmuxOk || k !== "T")
              : HINTS_SHORT
        }
      />
      <Voyage show={hubBoat(termRows)} />
    </Box>
  );
}
