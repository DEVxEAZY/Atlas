/** Scheduled tasks ("Agendadas"): where a pending proposal becomes a
 *  crontab entry — the only place one does. */
import React, { useEffect, useState } from "react";
import { Box, Text, useInput } from "ink";
import {
  activate,
  humanize,
  lastRun,
  loadJobs,
  nextRun,
  pause,
  removeJob,
  runDetached,
  whenLabel,
  type CronJob,
} from "../cron";
import { STATUS_LABEL, installSkill } from "../cronCli";
import { firstItemIndex, moveIndex, windowSlice } from "../rows";
import { ago, fit, shorten } from "../util";
import { theme, RUNTIME_COLOR, RUNTIME_ICON } from "../theme";
import { Dim, HeaderRow, HintBar, ItemRow, StatusLine, Title, voyageRowsFor } from "../components/chrome";
import { useTermSize } from "../components/useTermSize";
import Voyage from "../components/Voyage";
import { useLive, useLiveIndex } from "../components/useLiveIndex";
import { G } from "../glyphs";

export type CronRow = { t: "header"; label: string } | { t: "job"; job: CronJob };

const SECTIONS: Array<[CronJob["status"], string]> = [
  ["pending", "Aguardando confirmação"],
  ["active", "Ativas"],
  ["paused", "Pausadas"],
];

export function cronRows(jobs: CronJob[]): CronRow[] {
  const rows: CronRow[] = [];
  for (const [status, label] of SECTIONS) {
    const group = jobs.filter((j) => j.status === status);
    if (group.length === 0) continue;
    rows.push({ t: "header", label: `${label} · ${group.length}` });
    for (const job of group) rows.push({ t: "job", job });
  }
  return rows;
}

/** Pending proposals waiting for a keypress (the Hub announces them). */
export function pendingCount(): number {
  return loadJobs().filter((j) => j.status === "pending").length;
}

const RELOAD_MS = 2000;

interface Props {
  onBack: () => void;
  onQuit: () => void;
}

export default function Crons({ onBack, onQuit }: Props) {
  const [jobs, setJobs] = useState<CronJob[]>(loadJobs);
  const rows = cronRows(jobs);
  const [index, indexRef, setIndex] = useLiveIndex(firstItemIndex(rows));
  const [armed, armedRef, setArmed] = useLive<string | null>(null);
  const [msg, setMsg] = useState("");
  const { columns, rows: termRows } = useTermSize();
  const inner = Math.max(10, columns - 8);

  // an agent may file a proposal while this screen is open
  useEffect(() => {
    // same tasks, same state: keep the old array so nothing re-renders
    const t = setInterval(() => {
      const next = loadJobs();
      setJobs((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    }, RELOAD_MS);
    return () => clearInterval(t);
  }, []);

  // keep the highlight on the same task across reloads and moves
  const rowsRef = React.useRef(rows);
  useEffect(() => {
    const prev = rowsRef.current[indexRef.current ?? -1];
    rowsRef.current = rows;
    const id = prev?.t === "job" ? prev.job.id : null;
    const at = id ? rows.findIndex((r) => r.t === "job" && r.job.id === id) : -1;
    setIndex(at !== -1 ? at : moveIndex(rows, Math.min(indexRef.current ?? 0, rows.length - 1), 0));
  }, [jobs]);

  const reload = () => setJobs(loadJobs());
  const act = (fn: () => string) => {
    try {
      setMsg(fn());
    } catch (err) {
      setMsg(`falhou: ${err instanceof Error ? err.message : err}`);
    }
    reload();
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    if (input !== "x") setArmed(null);
    const at = indexRef.current !== null ? rowsRef.current[indexRef.current] : undefined;
    const job = at?.t === "job" ? at.job : null;
    if (key.upArrow || key.downArrow) {
      setMsg("");
      setIndex((prev) => moveIndex(rowsRef.current, prev ?? 0, key.upArrow ? -1 : 1));
    } else if (key.escape || input === "q") onBack();
    else if (input === "S") {
      act(() => `Skill atlas-cron instalada: ${installSkill().map(shorten).join(", ")}`);
    } else if (!job) return;
    else if (key.return) {
      if (job.status === "active") {
        setMsg("Já está ativa — p pausa, R roda agora.");
        return;
      }
      act(() => {
        const j = activate(job.id);
        const next = nextRun(j.when);
        return `Instalada no crontab: ${humanize(j.when)}${next ? ` · próxima ${whenLabel(next)}` : ""}.`;
      });
    } else if (input === "p") {
      if (job.status !== "active") {
        setMsg("Só uma tarefa ativa pausa — Enter instala ou retoma.");
        return;
      }
      act(() => (pause(job.id), "Pausada: saiu do crontab, Enter retoma."));
    } else if (input === "R") {
      if (job.status !== "active") {
        setMsg("Instale a tarefa (Enter) antes de rodá-la.");
        return;
      }
      act(() => (runDetached(job), `Rodando em 2º plano · atlas cron log ${job.id}`));
    } else if (input === "x") {
      if (armedRef.current !== job.id) {
        setArmed(job.id);
        setMsg(`x de novo para apagar '${job.name}'${job.status === "active" ? " e tirá-la do crontab" : ""}.`);
        return;
      }
      setArmed(null);
      act(() => (removeJob(job.id), `Apagada: ${job.id}.`));
    }
  });

  // title 2 + detail 3 + status 1 + hints 2, plus 1 spare
  const CHROME = 9;
  const voyage = voyageRowsFor(termRows, CHROME + 3);
  const listHeight = Math.max(3, termRows - CHROME - voyage);
  const [start, end] = windowSlice(rows.length, index, listHeight);
  const hot = index !== null ? rows[index] : undefined;
  const sel = hot?.t === "job" ? hot.job : null;
  const pending = jobs.filter((j) => j.status === "pending").length;

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      <Title>{`agendadas · ${jobs.length}${pending ? ` · ${pending} aguardando` : ""}`}</Title>
      {rows.length === 0 && (
        <Box flexDirection="column">
          <Text wrap="truncate">Nenhuma tarefa agendada.</Text>
          <Dim>{fit('Peça ao agente: "todo dia às 9h, revise os PRs abertos" (skill atlas-cron, S instala),', inner)}</Dim>
          <Dim>{fit('ou: atlas cron add --when "todo dia 09:00" "…"', inner)}</Dim>
        </Box>
      )}
      {rows.slice(start, end).map((row, i) => {
        const at = start + i;
        const on = at === index;
        if (row.t === "header")
          return (
            <HeaderRow key={at}>
              <Dim>{row.label}</Dim>
            </HeaderRow>
          );
        const j = row.job;
        const next = j.status === "active" ? nextRun(j.when) : null;
        const when = `${humanize(j.when)}${next ? ` · ${whenLabel(next)}` : ""}`;
        const color = RUNTIME_COLOR[j.runtime] ?? theme.dim;
        return (
          <ItemRow key={j.id} hot={on}>
            <Text color={on ? theme.highlightFg : color}>{`  ${RUNTIME_ICON[j.runtime] ?? G.bullet} `}</Text>
            <Text color={on ? theme.highlightFg : theme.text}>{fit(j.name, 24).padEnd(25)}</Text>
            <Text color={on ? theme.highlightFg : j.status === "pending" ? theme.amber : theme.dim}>
              {fit(when, Math.max(8, inner - 30))}
            </Text>
          </ItemRow>
        );
      })}
      <Box flexDirection="column" marginTop={1} height={2}>
        {sel && <Detail job={sel} width={inner} />}
      </Box>
      <StatusLine msg={msg} />
      <HintBar
        hints={
          sel?.status === "pending"
            ? [["Enter", "instalar"], ["x", "apagar"], ["esc", "voltar"]]
            : sel?.status === "paused"
              ? [["Enter", "retomar"], ["x", "apagar"], ["esc", "voltar"]]
              : sel
                ? [["p", "pausar"], ["R", "rodar agora"], ["x", "apagar"], ["esc", "voltar"]]
                : [["S", "instalar skill"], ["esc", "voltar"]]
        }
      />
      <Voyage rows={voyage} />
    </Box>
  );
}

function Detail({ job, width }: { job: CronJob; width: number }) {
  const last = lastRun(job.id);
  const lastText = last
    ? ` · última ${ago(last.at)} ${last.exit === 0 ? "ok" : `falhou (exit ${last.exit})`}`
    : "";
  return (
    <>
      <Text color={theme.secondary} wrap="truncate">
        {fit(`“${job.prompt.replace(/\s+/g, " ")}”`, width)}
      </Text>
      <Dim>
        {fit(
          `${STATUS_LABEL[job.status]} · ${job.runtime} · ${shorten(job.dir)} · ${job.when}${lastText}`,
          width,
        )}
      </Dim>
    </>
  );
}
