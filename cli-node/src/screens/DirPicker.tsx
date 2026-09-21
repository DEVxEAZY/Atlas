import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import type { Candidate } from "../repos";
import {
  candidateDisplay,
  firstItemIndex,
  moveIndex,
  pickRows,
  windowSlice,
  type PickRow,
} from "../rows";
import { fit, shorten } from "../util";
import { theme } from "../theme";
import { Dim, HeaderRow, HintBar, ItemRow, Title } from "../components/chrome";
import { useLiveIndex } from "../components/useLiveIndex";

interface Props {
  title: string;
  candidates: Candidate[];
  onPick: (dir: string) => void;
  onBack: () => void;
  onQuit: () => void;
}

const MARKER: Record<string, string> = { domain: "◆", repo: "●", dir: "○" };

export default function DirPicker({ title, candidates, onPick, onBack, onQuit }: Props) {
  const [query, setQuery] = useState("");
  const [index, indexRef, setIndex] = useLiveIndex(null);
  const { stdout } = useStdout();

  const rows: PickRow[] = useMemo(() => pickRows(candidates, query), [candidates, query]);

  useEffect(() => {
    setIndex(firstItemIndex(rows));
  }, [rows]);

  const choose = (at: number | null) => {
    if (at === null) return;
    const row = rows[at];
    if (!row || row.t === "header") return;
    onPick(row.t === "free" ? row.path : row.candidate.path);
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      onQuit();
      return;
    }
    if (key.upArrow) setIndex((prev) => moveIndex(rows, prev ?? 0, -1));
    else if (key.downArrow) setIndex((prev) => moveIndex(rows, prev ?? 0, 1));
    else if (key.escape) onBack();
  });

  const total = rows.filter((r) => r.t !== "header").length;
  const listHeight = Math.max(5, (stdout?.rows || 24) - 9);
  const [start, end] = windowSlice(rows.length, index, listHeight);
  const inner = Math.max(10, (stdout?.columns || 100) - 8);

  return (
    <Box flexDirection="column" paddingLeft={2} paddingRight={2}>
      <Title>{`${title} · ${total} ${total === 1 ? "local" : "locais"}`}</Title>
      <Box marginBottom={1}>
        <TextInput
          value={query}
          onChange={setQuery}
          onSubmit={() => choose(indexRef.current)}
          placeholder="filtrar ou colar um caminho…"
        />
      </Box>
      {rows.slice(start, end).map((row, i) => {
        const at = start + i;
        const hot = at === index;
        if (row.t === "header")
          return (
            <HeaderRow key={at}>
              <Dim>{row.label}</Dim>
            </HeaderRow>
          );
        if (row.t === "free") {
          return (
            <ItemRow key={at} hot={hot}>
              <Text color={hot ? theme.highlightFg : theme.peach} wrap="truncate">
                {fit(`⤷ usar ${shorten(row.path)}`, inner)}
              </Text>
            </ItemRow>
          );
        }
        return (
          <ItemRow key={at} hot={hot}>
            <Text wrap="truncate">
              <Text color={hot ? theme.highlightFg : theme.peach}>
                {`  ${MARKER[row.candidate.kind] ?? "○"} `}
              </Text>
              <Text color={hot ? theme.highlightFg : theme.text}>
                {fit(candidateDisplay(row.candidate), inner - 4)}
              </Text>
            </Text>
          </ItemRow>
        );
      })}
      <HintBar
        hints={[
          ["↑↓", "navegar"],
          ["Enter", "confirmar"],
          ["esc", "voltar"],
        ]}
      />
    </Box>
  );
}
