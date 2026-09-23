/** The smart note under the Hub: a one-line status of what is going on,
 *  refreshed now and then, and the answer to a question (`?`). */
import React, { useEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import { AiError, aiEnabled, askMessages, chat, noteMessages, oneLine, wrap, type AiSession, type AiSnapshot } from "../ai";
import { theme } from "../theme";
import { fit } from "../util";

/** Most answer lines shown at once. */
export const ANSWER_MAX_LINES = 8;
/** Wait after the Hub opens before the first note, so the first frame is free. */
const FIRST_NOTE_MS = 1500;
/** A changed set of live sessions refreshes the note, at most this often. */
const MIN_REFRESH_MS = 60_000;
/** And it refreshes on its own this often anyway. */
const PERIOD_MS = 5 * 60_000;

export interface Answer {
  question: string;
  lines: string[] | null; // null while waiting
  error?: string;
}

/** Note state, refreshed from `snapshot` when `liveKey` changes (rarely). */
export function useAiNote(snapshot: () => Promise<AiSnapshot>, liveKey: string) {
  const enabled = aiEnabled();
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const last = useRef(0);
  const busy = useRef(false);
  const snap = useRef(snapshot);
  snap.current = snapshot;

  const refresh = async () => {
    if (!enabled || busy.current) return;
    busy.current = true;
    last.current = Date.now();
    try {
      const text = await chat(noteMessages(await snap.current()), { maxTokens: 120, reasoning: "off" });
      setNote({ text: oneLine(text) });
    } catch (err) {
      setNote({ text: err instanceof AiError ? err.message : "a nota falhou.", error: true });
    } finally {
      busy.current = false;
    }
  };

  useEffect(() => {
    if (!enabled) return;
    const first = setTimeout(refresh, FIRST_NOTE_MS);
    const every = setInterval(refresh, PERIOD_MS);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);

  // live sessions came or went: refresh, but never more than once a minute
  useEffect(() => {
    if (!enabled || last.current === 0) return;
    const wait = Math.max(3000, MIN_REFRESH_MS - (Date.now() - last.current));
    const t = setTimeout(refresh, wait);
    return () => clearTimeout(t);
  }, [liveKey]);

  const ask = async (question: string, focus: AiSession | null, set: (a: Answer) => void) => {
    set({ question, lines: null });
    try {
      const text = await chat(askMessages(await snap.current(), question, focus), { maxTokens: 1600, reasoning: "low" });
      set({ question, lines: text.split("\n") });
    } catch (err) {
      set({ question, lines: [], error: err instanceof AiError ? err.message : "a pergunta falhou." });
    }
  };

  return { enabled, note, ask };
}

/** Rows the note area takes: the note (or the question input) plus an
 *  open answer. */
export function aiRows(enabled: boolean, answer: Answer | null, width: number): number {
  if (!enabled) return 0;
  if (!answer) return 1;
  const lines = answer.lines === null ? 1 : answerLines(answer, width).length;
  return 1 + lines;
}

function answerLines(a: Answer, width: number): string[] {
  if (a.error) return [a.error];
  if (a.lines === null) return ["pensando…"];
  return wrap(a.lines.join("\n"), Math.max(20, width - 2), ANSWER_MAX_LINES);
}

interface Props {
  width: number;
  note: { text: string; error?: boolean } | null;
  asking: { about: string } | null;
  answer: Answer | null;
  onSubmit: (question: string) => void;
  onCancel: () => void;
}

export function AiNoteView({ width, note, asking, answer, onSubmit, onCancel }: Props) {
  const [q, setQ] = useState("");
  useInput(
    (_input, key) => {
      if (key.escape) {
        setQ("");
        onCancel();
      }
    },
    { isActive: asking !== null },
  );
  if (asking) {
    return (
      <Box>
        <Text color={theme.seaCrest}>{"✦ "}</Text>
        <TextInput
          value={q}
          onChange={setQ}
          onSubmit={(v) => {
            setQ("");
            if (v.trim()) onSubmit(v.trim());
            else onCancel();
          }}
          placeholder={fit(`pergunte sobre ${asking.about}…  (Enter envia · esc cancela)`, width - 2)}
        />
      </Box>
    );
  }
  if (answer) {
    const lines = answerLines(answer, width);
    return (
      <Box flexDirection="column">
        <Text wrap="truncate">
          <Text color={theme.seaCrest}>{"✦ "}</Text>
          <Text color={theme.dim}>{fit(`${answer.question}  · esc fecha`, width - 2)}</Text>
        </Text>
        {lines.map((l, i) => (
          <Text key={i} wrap="truncate" color={answer.error ? theme.amber : answer.lines === null ? theme.dim : theme.text}>
            {`  ${l}`}
          </Text>
        ))}
      </Box>
    );
  }
  return (
    <Text wrap="truncate">
      <Text color={theme.seaCrest}>{"✦ "}</Text>
      <Text color={note?.error ? theme.amber : theme.dim}>
        {fit(note ? note.text : "lendo as sessões…", width - 2)}
      </Text>
    </Text>
  );
}
