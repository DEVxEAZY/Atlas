import { homedir } from "node:os";
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Choice } from "../App";
import type { Session } from "../history";
import type { NativeSession } from "../native/index";
import { TRANSCRIPT_PEEK, peekTranscript, type PeekLine } from "../native/peek";
import {
  convoMigration,
  migrationInFlight,
  runMigration,
  sessionMigration,
  type MigrateResult,
  type Migration,
} from "../migrate";
import { pidsForKey, pidsForResume, procStartedAt, terminatePids } from "../process";
import { convoDisplay, sessionDisplay } from "../rows";
import { RUNTIME_COLOR, RUNTIME_ICON, TMUX_MARK, theme } from "../theme";
import { capturePane, hasSession, killSession, tmuxUsable } from "../tmux";
import { ago, shorten } from "../util";
import { Dim, HintBar, MIN_LIST_ROWS, StatusLine, Title, voyageRowsFor } from "../components/chrome";
import { useLive } from "../components/useLiveIndex";
import { useTermSize } from "../components/useTermSize";
import Voyage from "../components/Voyage";
import { G } from "../glyphs";

export type RunningTarget =
  | { kind: "session"; session: Session; tmux?: string }
  | { kind: "convo"; convo: NativeSession; tmux?: string };

interface Props {
  target: RunningTarget;
  onBack: () => void;
  onQuit: () => void;
  onLaunch: (c: Choice) => void;
  onAttach: (c: Choice) => void;
  /** Background migrate into tmux (never attaches); App pops to Hub on ok. */
  onMigrate: (c: Choice) => MigrateResult;
}

interface ProcInfo {
  pid: number;
  age: string | null;
}

function resolveProcs(t: RunningTarget): ProcInfo[] {
  const pids =
    t.kind === "session"
      ? pidsForKey(t.session.dir, t.session.runtime)
      : pidsForResume(t.convo.id);
  return pids.map((pid) => {
    const started = procStartedAt(pid);
    return { pid, age: started === null ? null : ago(new Date(started).toISOString()) };
  });
}

/** Rows the management view draws around its list, per variant (keep in
 *  sync with the JSX below): an Ink frame taller than the terminal is fully
 *  cleared and redrawn on every render — each boat tick included. */
export interface RunningVariant {
  convo: boolean;
  ended: boolean;
  tmux: boolean;
  procs: number;
}

function runningBase(v: RunningVariant): number {
  const title = 2; // Title + margin
  const info = 2; // runtime · dir + margin
  const resume = v.convo ? 2 : 0; // resume: <id> + margin
  const warning = v.ended ? 2 : v.tmux ? 3 + (v.procs > 0 ? 1 : 0) : 4; // block + margin
  const listHeader = !v.ended && (v.tmux || v.convo) ? 2 : 0; // "— log · …" / placeholder + margin
  const footer = 1 + 2; // StatusLine + HintBar (margin + 1)
  return title + info + resume + warning + listHeader + footer;
}

/** Whether this variant draws the boat: only when its row still fits
 *  over the minimum list at this height. */
export function runningBoat(v: RunningVariant, rows: number, env: NodeJS.ProcessEnv = process.env): boolean {
  return runningVoyageRows(v, rows, env) > 0;
}

/** Footer painting rows this variant draws (see chrome.voyageRowsFor). */
export function runningVoyageRows(v: RunningVariant, rows: number, env: NodeJS.ProcessEnv = process.env): number {
  return voyageRowsFor(rows, runningBase(v) + MIN_LIST_ROWS, env);
}

export function runningChromeRows(v: RunningVariant, rows: number, env: NodeJS.ProcessEnv = process.env): number {
  return runningBase(v) + runningVoyageRows(v, rows, env);
}

export default function Running({ target, onBack, onQuit, onLaunch, onAttach, onMigrate }: Props) {
  const tmux = target.tmux ?? null;
  const [procs] = useState<ProcInfo[]>(() => resolveProcs(target));
  const [tmuxAlive, setTmuxAlive] = useState(() => (tmux ? hasSession(tmux) : true));
  const [peekSupported] = useState(
    () => target.kind === "convo" && TRANSCRIPT_PEEK[target.convo.harness],
  );
  const [peekLines] = useState<PeekLine[]>(() =>
    target.kind === "convo" && TRANSCRIPT_PEEK[target.convo.harness]
      ? peekTranscript(target.convo.harness, target.convo.file)
      : [],
  );
  const [tmuxLines, setTmuxLines] = useState<string[]>(() =>
    tmux ? capturePane(tmux) : [],
  );
  const [hiddenTail, setHiddenTail] = useState(0); // transcript lines hidden below the fold
  // read in handlers through refs: coalesced keys see every update at once
  const [, armedRef, setArmed] = useLive(false);
  const [, armedMigrateRef, setArmedMigrate] = useLive(false);
  const [, killingRef, setKilling] = useLive(false);
  const [msg, setMsg] = useState("");
  const { rows } = useTermSize();
  const [tmuxOk] = useState(() => tmuxUsable());
  // late results (a kill or migration finishing after esc) must never pop
  // a screen the user opened since
  const left = useRef(false);
  useEffect(
    () => () => {
      left.current = true;
    },
    [],
  );
  const back = () => {
    if (!left.current) onBack();
  };

  const ended = tmux ? !tmuxAlive : procs.length === 0;
  const runtime = target.kind === "session" ? target.session.runtime : target.convo.harness;
  const dir = target.kind === "session" ? target.session.dir : target.convo.dir;
  const name =
    target.kind === "session" ? sessionDisplay(target.session) : convoDisplay(target.convo);
  const icon = RUNTIME_ICON[runtime] ?? G.bullet;
  const iconColor = RUNTIME_COLOR[runtime] ?? theme.text;

  const variant: RunningVariant = {
    convo: target.kind === "convo",
    ended,
    tmux: tmux !== null,
    procs: procs.length,
  };
  const voyage = runningVoyageRows(variant, rows);
  const listHeight = Math.max(MIN_LIST_ROWS, rows - runningChromeRows(variant, rows));
  const totalLines = tmux ? tmuxLines.length : peekLines.length;
  const maxHidden = Math.max(0, totalLines - listHeight);
  const hidden = Math.min(hiddenTail, maxHidden);
  const start = Math.max(0, totalLines - listHeight - hidden);
  const visible = peekLines.slice(start, start + listHeight);
  const visibleTmux = tmuxLines.slice(start, start + listHeight);
  const scrollable = totalLines > listHeight;

  const kill = async () => {
    if (killingRef.current) return;
    setKilling(true);
    if (tmux) {
      setMsg("encerrando sessão tmux…");
      if (!hasSession(tmux)) {
        back(); // died on its own while viewing
        return;
      }
      if (killSession(tmux) && !hasSession(tmux)) {
        back();
        return;
      }
      setKilling(false);
      setArmed(false);
      setMsg(`não consegui encerrar a sessão tmux '${tmux}'.`);
      return;
    }
    setMsg("encerrando…");
    const fresh = resolveProcs(target).map((p) => p.pid);
    if (fresh.length === 0) {
      back(); // died on its own while viewing
      return;
    }
    const result = await terminatePids(fresh);
    if (result.alive.length === 0) {
      back();
      return;
    }
    setKilling(false);
    setArmed(false);
    setMsg(`não consegui encerrar o PID ${result.alive.join(", ")} — sem permissão?`);
  };

  /** Move an external session under tmux, staying in Atlas (see migrate.ts). */
  const migrationFor = (): Migration =>
    target.kind === "convo"
      ? convoMigration(target.convo)
      : sessionMigration(target.session, "o processo já encerrou — esc volta ao Hub.");

  const migrate = async () => {
    if (killingRef.current) return;
    const m = migrationFor();
    if ("refuse" in m) {
      setMsg(m.refuse);
      return;
    }
    setKilling(true);
    try {
      const r = await runMigration(m, onMigrate, setMsg);
      // back to Hub on success: fresh lists show the 𖥠 immediately
      if (r.ok) back();
      else setMsg(r.error!);
    } finally {
      setKilling(false);
    }
  };

  const refreshTmux = () => {
    if (!tmux) return;
    const alive = hasSession(tmux);
    setTmuxAlive(alive);
    setTmuxLines(alive ? capturePane(tmux) : []);
    setHiddenTail(0);
    setArmed(false);
    if (!alive) setMsg("a sessão tmux encerrou — Enter abre de novo, esc volta.");
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit(); // App waits for an in-flight migration before exiting
      return;
    }
    // between SIGTERM and relaunch nothing else may act — not even esc: a
    // Hub opened now could quit and strand the agent stopped
    if (killingRef.current || migrationInFlight()) return;
    if (key.escape) {
      onBack(); // leaving never touches the original process
      return;
    }
    if (key.upArrow) setHiddenTail((h) => h + 1);
    else if (key.downArrow) setHiddenTail((h) => Math.max(0, h - 1));
    else if (key.pageUp) setHiddenTail((h) => h + listHeight);
    else if (key.pageDown) setHiddenTail((h) => Math.max(0, h - listHeight));
    else if (key.return && tmux && !ended) {
      onAttach(
        target.kind === "session"
          ? { dir: target.session.dir, runtime: target.session.runtime, attachTmux: tmux }
          : {
              dir: target.convo.dir ?? homedir(),
              runtime: target.convo.harness,
              resume: target.convo.id,
              attachTmux: tmux,
            },
      );
    } else if (key.return && ended) {
      onLaunch(
        target.kind === "session"
          ? { dir: target.session.dir, runtime: target.session.runtime }
          : {
              dir: target.convo.dir ?? homedir(),
              runtime: target.convo.harness,
              resume: target.convo.id,
            },
      );
    } else if (input === "r" && tmux && !ended && !key.ctrl && !key.meta) {
      refreshTmux();
    } else if (input === "X" && !key.ctrl && !key.meta && !ended) {
      setArmedMigrate(false);
      if (!armedRef.current) {
        setArmed(true);
        setMsg(
          tmux
            ? `X de novo para encerrar a sessão tmux '${tmux}'.`
            : procs.length === 1
              ? "X de novo para encerrar o processo de verdade."
              : `X de novo para encerrar os ${procs.length} processos de verdade.`,
        );
      } else {
        void kill();
      }
    } else if (input === "T" && !key.ctrl && !key.meta && !ended && !tmux) {
      setArmed(false);
      if (!armedMigrateRef.current) {
        // resolve now (tmux, dir, runtime, resume ids): refuse instead of
        // arming a dead end
        const m = migrationFor();
        if ("refuse" in m) {
          setMsg(m.refuse);
          return;
        }
        setArmedMigrate(true);
        setMsg("T de novo para migrar para o tmux (encerra aqui, continua lá em 2º plano).");
      } else {
        setArmedMigrate(false);
        void migrate();
      }
    }
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      <Title>
        {tmux ? <Text color={theme.peach}>{`${TMUX_MARK} `}</Text> : null}
        {ended
          ? "Sessão encerrada"
          : tmux
            ? `Sessão em execução · ${tmux}`
            : "Sessão em execução · somente leitura"}
      </Title>
      <Box marginBottom={1}>
        <Text wrap="truncate">
          <Text color={iconColor}>{`${icon} `}</Text>
          <Text color={theme.text}>{`${runtime} ${name}`}</Text>
          <Text dimColor>{`  ·  ${dir ? shorten(dir) : "—"}`}</Text>
        </Text>
      </Box>
      {target.kind === "convo" && (
        <Box marginBottom={1}>
          <Dim>resume: {target.convo.id}</Dim>
        </Box>
      )}
      {ended ? (
        <Box marginBottom={1}>
          <Text color={theme.amber} wrap="truncate">
            {G.warn} a sessão encerrou sozinha antes de abrir — Enter abre agora, esc volta.
          </Text>
        </Box>
      ) : tmux ? (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.amber} wrap="truncate">
            {G.warn} gerenciada pelo atlas no tmux — entrar e ler nunca interrompem o agente.
          </Text>
          {procs.length > 0 && (
            <Text wrap="truncate">
              {procs.map((p) => `PID ${p.pid}${p.age ? ` · ${p.age}` : ""}`).join("   ")}
            </Text>
          )}
          <Dim>para iniciar outra instância, use Nova sessão (n) no Hub.</Dim>
        </Box>
      ) : (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={theme.amber} wrap="truncate">
            {G.warn} já está rodando em outro lugar — abrir de novo corromperia a sessão.
          </Text>
          <Text wrap="truncate">
            {procs.map((p) => `PID ${p.pid}${p.age ? ` · ${p.age}` : ""}`).join("   ")}
          </Text>
          <Dim>para iniciar outra instância, use Nova sessão (n) no Hub.</Dim>
        </Box>
      )}
      {tmux && !ended && tmuxLines.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Dim>{`— tmux · linhas ${start + 1}–${start + visibleTmux.length} de ${tmuxLines.length} —`}</Dim>
          {visibleTmux.map((l, i) => (
            <Text key={start + i} wrap="truncate">
              {l === "" ? " " : l}
            </Text>
          ))}
        </Box>
      )}
      {tmux && !ended && tmuxLines.length === 0 && (
        <Box marginBottom={1}>
          <Dim>painel tmux vazio ainda — r atualiza a leitura.</Dim>
        </Box>
      )}
      {!tmux && target.kind === "convo" && !ended && peekSupported && peekLines.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Dim>{`— log · linhas ${start + 1}–${start + visible.length} de ${peekLines.length} —`}</Dim>
          {visible.map((l, i) => (
            <Text key={start + i} wrap="truncate">
              <Text dimColor>{l.role === "você" ? `você ${G.said} ` : `agente ${G.said} `}</Text>
              {l.text}
            </Text>
          ))}
        </Box>
      )}
      {!tmux && target.kind === "convo" && !ended && !peekSupported && (
        <Box marginBottom={1}>
          <Dim>transcrição ao vivo indisponível para Muse — o processo acima segue intacto.</Dim>
        </Box>
      )}
      {!tmux && target.kind === "convo" && !ended && peekSupported && peekLines.length === 0 && (
        <Box marginBottom={1}>
          <Dim>sem mensagens legíveis no log ainda.</Dim>
        </Box>
      )}
      <StatusLine msg={msg} />
      <HintBar
        hints={
          ended
            ? [
                ["Enter", "abrir agora"],
                ["esc", "voltar"],
              ]
            : tmux
              ? [
                  ["Enter", "entrar"],
                  ["r", "atualizar"],
                  ["esc", "voltar"],
                  ["X", "encerrar"],
                  ...(scrollable ? [["↑↓", "rolar"] as [string, string]] : []),
                ]
              : [
                  ["esc", "voltar sem matar"],
                  ["X", "encerrar sessão"],
                  ...(tmuxOk ? [["T", "migrar p/ tmux"] as [string, string]] : []),
                  ...(scrollable ? [["↑↓", "rolar"] as [string, string]] : []),
                ]
        }
      />
      <Voyage rows={voyage} />
    </Box>
  );
}
