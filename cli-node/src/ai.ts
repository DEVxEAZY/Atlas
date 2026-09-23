/** The Hub's smart note: a one-line status of what is going on, and answers
 *  to questions about it, from a model on OpenRouter.
 *
 *  Nothing leaves the machine without a key: OPENROUTER_API_KEY, else the
 *  file ~/.config/atlas/openrouter.key (mode 600, never in the repo). What is
 *  sent: session paths, runtimes and conversation titles, scheduled task
 *  counts, and the last lines of live tmux sessions (more of the one a
 *  question is about). Secrets are redacted first, and every block is
 *  capped. The model only reads: it never types into a session. */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const AI_MODEL = process.env.ATLAS_AI_MODEL ?? "deepseek/deepseek-v4-flash";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 25_000;

export function aiKeyFile(env: NodeJS.ProcessEnv = process.env): string {
  return env.ATLAS_OPENROUTER_KEY_FILE ?? join(homedir(), ".config", "atlas", "openrouter.key");
}

/** The OpenRouter key: the environment first, then the key file. */
export function aiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const k = env.OPENROUTER_API_KEY?.trim();
  if (k) return k;
  try {
    const f = readFileSync(aiKeyFile(env), "utf-8").trim();
    return f || null;
  } catch {
    return null;
  }
}

export function aiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return aiKey(env) !== null;
}

/** Tokens, keys and passwords out of any text before it is sent. */
export function redact(text: string): string {
  return text
    .replace(/\b(sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "$1-[redigido]")
    .replace(/\b(gh[pousr]_|github_pat_|glpat-|xox[abpr]-)[A-Za-z0-9_-]{10,}/g, "$1[redigido]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[redigido]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, "[jwt redigido]")
    .replace(/(bearer\s+)[A-Za-z0-9._~+/-]{12,}=*/gi, "$1[redigido]")
    .replace(
      /\b((?:api[_-]?key|token|secret|senha|password|passwd|pwd|authorization)\s*[:=]\s*)(["']?)[^\s"']{4,}\2/gi,
      "$1$2[redigido]$2",
    )
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, "[chave privada redigida]");
}

/** The last `max` characters of a text block, on line boundaries. */
function tail(lines: string[], max: number): string {
  const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= max) return text;
  const cut = text.slice(text.length - max);
  return `…${cut.slice(cut.indexOf("\n") + 1)}`;
}

export interface AiSession {
  runtime: string;
  dir: string;
  title?: string | null;
  running: boolean;
  tmux?: string | null;
  /** Last lines of its tmux pane, when it has one. */
  screen?: string[];
}

export interface AiSnapshot {
  now: string;
  sessions: AiSession[];
  cron: { active: number; pending: number; next: string | null };
  totals: { sessions: number };
}

/** The snapshot as plain text for the model, redacted and capped. */
export function describe(s: AiSnapshot, screenChars = 900): string {
  const out: string[] = [`Agora: ${s.now}`];
  const live = s.sessions.filter((x) => x.running);
  out.push(`Sessões rodando: ${live.length} de ${s.totals.sessions} no histórico.`);
  for (const x of s.sessions) {
    out.push(
      `- ${x.running ? "[rodando]" : "[parada]"} ${x.runtime} em ${x.dir}` +
        (x.title ? ` — "${x.title.replace(/\s+/g, " ").slice(0, 120)}"` : "") +
        (x.tmux ? ` (tmux ${x.tmux})` : ""),
    );
    if (x.screen && x.screen.length > 0) out.push(`  Fim da tela:\n${indent(tail(x.screen, screenChars))}`);
  }
  out.push(
    `Tarefas agendadas: ${s.cron.active} ativas, ${s.cron.pending} aguardando confirmação` +
      (s.cron.next ? `, próxima ${s.cron.next}` : "") +
      ".",
  );
  return redact(out.join("\n"));
}

const indent = (t: string) =>
  t
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n");

const SYSTEM =
  "Você é a nota do Atlas, um painel de terminal que acompanha sessões de agentes de código " +
  "(Claude, Codex, Muse) e terminais. Responda em português do Brasil, direto e sem floreios. " +
  "Use só o que está no contexto; se algo não estiver lá, diga que não dá para saber. " +
  "Você só lê as sessões: nunca diga que executou ou digitou algo nelas.";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Messages for the one-line status note. */
export function noteMessages(s: AiSnapshot): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `${describe(s, 500)}\n\n` +
        "Escreva UMA linha (até 110 caracteres, sem aspas, sem markdown) resumindo o que está " +
        "acontecendo agora: o que cada agente rodando parece estar fazendo, se algo espera o " +
        "usuário ou deu erro. Se nada roda, diga isso em poucas palavras.",
    },
  ];
}

/** Messages for a question, focused on one session when there is one. */
export function askMessages(s: AiSnapshot, question: string, focus?: AiSession | null): ChatMessage[] {
  const about = focus
    ? `\n\nA pergunta é sobre esta sessão: ${focus.runtime} em ${focus.dir}` +
      (focus.title ? ` — "${focus.title.slice(0, 160)}"` : "") +
      (focus.screen && focus.screen.length > 0
        ? `\nConteúdo recente dela:\n${indent(redact(tail(focus.screen, 6000)))}`
        : "\n(Sem tela ou transcrição legível para esta sessão.)")
    : "";
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content:
        `${describe(s)}${about}\n\nPergunta: ${redact(question)}\n\n` +
        "Responda em no máximo 8 linhas curtas, texto simples, sem markdown.",
    },
  ];
}

export class AiError extends Error {}

/** One chat completion; throws AiError with a short pt-BR reason. */
export async function chat(
  messages: ChatMessage[],
  opts: {
    maxTokens: number;
    /** DeepSeek V4 Flash reasons before answering; off for the short note,
     *  low for questions. max_tokens covers reasoning and answer together. */
    reasoning?: "off" | "low";
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  } = { maxTokens: 300 },
): Promise<string> {
  const key = aiKey();
  if (!key) throw new AiError("defina OPENROUTER_API_KEY (ou ~/.config/atlas/openrouter.key) para usar a nota inteligente.");
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(ENDPOINT, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/DEVxEAZY/atlas-cli",
        "X-Title": "Atlas",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        max_tokens: opts.maxTokens,
        temperature: 0.3,
        reasoning: opts.reasoning === "low" ? { effort: "low" } : { enabled: false },
      }),
    });
  } catch (err) {
    if (opts.signal?.aborted) throw new AiError("cancelado.");
    throw new AiError(timeout.aborted ? "o modelo demorou demais." : "sem conexão com o OpenRouter.");
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiError("chave do OpenRouter recusada.");
    if (res.status === 402) throw new AiError("sem créditos no OpenRouter.");
    if (res.status === 429) throw new AiError("limite de uso do OpenRouter; tente em instantes.");
    throw new AiError(`OpenRouter respondeu ${res.status}.`);
  }
  const body = (await res.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  } | null;
  const text = body?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new AiError("o modelo não respondeu nada.");
  return text;
}

/** Emoji out: terminals draw them two columns wide over the next letter. */
function noEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, "");
}

/** The note as one clean line. */
export function oneLine(text: string, max = 140): string {
  const t = noEmoji(text).replace(/[*_`#>]/g, "").replace(/\s+/g, " ").trim().replace(/^["“]|["”]$/g, "");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Word-wrap an answer to `width` columns, at most `max` lines. */
export function wrap(text: string, width: number, max: number): string[] {
  const out: string[] = [];
  for (const para of noEmoji(text).replace(/[*_`#]/g, "").split(/\n+/)) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line && [...line].length + 1 + [...word].length > width) {
        out.push(line);
        line = word;
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
  }
  if (out.length > max) return [...out.slice(0, max - 1), `${out[max - 1].slice(0, width - 1)}…`];
  return out;
}
