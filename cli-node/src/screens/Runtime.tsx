import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { lastRuntimeFor } from "../history";
import { getRuntime, isAvailable, type Runtime } from "../runtimes";
import { firstItemIndex, moveIndex } from "../rows";
import { fit, shorten } from "../util";
import { theme } from "../theme";
import { Dim, HeaderRow, HintBar, ItemRow, StatusLine, Title, voyageRowsFor } from "../components/chrome";
import { useTermSize } from "../components/useTermSize";
import Voyage from "../components/Voyage";
import { useLiveIndex } from "../components/useLiveIndex";
import { G } from "../glyphs";

type Row = { t: "header"; label: string } | { t: "item"; runtime: Runtime };

const AGENTS = ["codex", "claude", "muse"];

function buildRows(): Row[] {
  return [
    { t: "header", label: "Agentes" },
    ...AGENTS.map((name): Row => ({ t: "item", runtime: getRuntime(name) })),
    { t: "header", label: "Terminal" },
    { t: "item", runtime: getRuntime("shell") },
  ];
}

function initialIndex(rows: Row[], dir: string): number | null {
  const preferred = lastRuntimeFor(dir);
  if (preferred) {
    const at = rows.findIndex(
      (r) => r.t === "item" && r.runtime.name === preferred && isAvailable(r.runtime),
    );
    if (at !== -1) return at;
  }
  const first = rows.findIndex((r) => r.t === "item" && isAvailable(r.runtime));
  return first === -1 ? firstItemIndex(rows) : first;
}

interface Props {
  dir: string;
  onPick: (runtime: string) => void;
  onBack: () => void;
  onQuit: () => void;
}

export default function Runtime({ dir, onPick, onBack, onQuit }: Props) {
  const [rows] = useState<Row[]>(buildRows);
  const [index, indexRef, setIndex] = useLiveIndex(initialIndex(buildRows(), dir));
  const [msg, setMsg] = useState("");
  const { columns, rows: termRows } = useTermSize();
  const inner = Math.max(10, columns - 8);
  // title 2 + spacer 1 + 6 rows + status 1 + hints 2: a fixed 12-row screen
  const voyage = voyageRowsFor(termRows, 12);

  const detail = (r: Runtime): string => {
    if (r.name === "shell") return process.env.SHELL ?? "/bin/sh";
    return r.argv[0];
  };

  const choose = (at: number | null) => {
    if (at === null) return;
    const row = rows[at];
    if (!row || row.t !== "item") return;
    if (!isAvailable(row.runtime)) {
      setMsg(`${row.runtime.label} não está instalado.`);
      return;
    }
    onPick(row.runtime.name);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    if (key.upArrow) setIndex((prev) => moveIndex(rows, prev ?? 0, -1));
    else if (key.downArrow) setIndex((prev) => moveIndex(rows, prev ?? 0, 1));
    else if (key.return) choose(indexRef.current);
    else if (key.escape) onBack();
  });

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      <Title>{`runtime · ${fit(shorten(dir), inner - 10)}`}</Title>
      <Box marginBottom={1} />
      {rows.map((row, at) => {
        const hot = at === index;
        if (row.t === "header")
          return (
            <HeaderRow key={at}>
              <Dim>{row.label}</Dim>
            </HeaderRow>
          );
        const ok = isAvailable(row.runtime);
        return (
          <ItemRow key={at} hot={hot}>
            <Text wrap="truncate">
              <Text color={hot ? theme.highlightFg : ok ? theme.peach : theme.dim}>
                {`  ${ok ? G.ok : G.bad} ${row.runtime.label.padEnd(8)} `}
              </Text>
              {hot ? (
                <Text color="#3A2A1A">{fit(`(${detail(row.runtime)})`, inner - 14)}</Text>
              ) : (
                <Text dimColor>{fit(`(${detail(row.runtime)})`, inner - 14)}</Text>
              )}
            </Text>
          </ItemRow>
        );
      })}
      <StatusLine msg={msg} />
      <HintBar
        hints={[
          ["↑↓", "navegar"],
          ["Enter", "escolher"],
          ["esc", "voltar"],
        ]}
      />
      <Voyage rows={voyage} />
    </Box>
  );
}
