# Deterministic launch visuals

These are editable, illustrative SVG reconstructions, not a recording of a
live agent or a claim about a particular agent's output. The fixture uses
three fictional repositories beneath `/home/demo/@development`, three live
Atlas history sessions, no discovered native conversations, and collapsed
Recentes/Conversas sections. Each agent row is managed in tmux.

The Codex pane text is example task output. Atlas screen copy, ordering,
runtime colors/icons, selection, preview, and key bindings follow
`cli-node/src/screens/Hub.tsx`, `screens/Running.tsx`, `theme.ts`, and
`components/chrome.tsx`. The selected Codex tmux session name is computed
using the actual naming rule: `atlas-atlas-cli-codex-d77372`.

The tmux marker is a hand-drawn SVG equivalent of `𖥠` (U+16960), labeled in
each SVG. This keeps the real mark visible without relying on a rare Bamum
Supplement font. All other text remains editable text using DejaVu fonts.
Terminal window bars and scene captions are presentation framing, outside
the application UI. The preview title follows the real tmux branch; the
caption identifies its read-only behavior without inventing a UI label.

## Storyboard

| Source | Seconds | Actual action / behavior |
| --- | ---: | --- |
| `01-running.svg` | 3 | A Codex session launched through Atlas runs in tmux. |
| `02-detach.svg` | 2.5 | `Ctrl-b`, then `d`, detaches with the default tmux prefix. |
| `03-elsewhere.svg` | 2.5 | Run `atlas` in another terminal on the same machine. |
| `04-hub.svg` | 3 | The selected live session appears under `◉ agora`; Enter opens preview. |
| `05-preview.svg` | 4.5 | Read captured tmux output; Enter enters the existing session. |
| `06-reenter.svg` | 3.5 | Return to the same pane, whose agent kept working. |
| `07-repository.svg` | 3 | Hold on the repository URL, then loop. |

The GIF is 1100×700, 22 seconds, 44 frames at 2 fps, with an infinite loop.
Static holds give time to read, keep text crisp, and limit repository size.
The social preview is a solid 1280×640 composition with a scaled view of
the same complete Hub. The full-size Hub is `../atlas-hub.svg` (1000×536).

Since v0.3.0 the static Hub (`../atlas-hub.svg`, `../social-preview.svg`)
shows the current wide hint bar (`T tmux`, no `/ filtrar`) and the footer
boat, a real `voyageFrame(64, 62)` from `cli-node/src/components/Voyage.tsx`.
The GIF scenes still show the v0.1.0 hint bar; regenerate them with the
script below when the storyboard changes. To re-render only the social
preview, call `render()` from `render.py` on `../social-preview.svg`.

## Rebuild locally

Requirements: Python 3, Pillow, Chromium or Chrome headless shell, ffmpeg,
DejaVu Sans, and DejaVu Sans Mono. No network access or agent credentials
are required. Within the repository, the script only replaces the two
generated release binaries. Inspection PNGs go to the optional output path.

```sh
python3 docs/demo/render.py --chrome /path/to/chrome-headless-shell \
  --inspect-dir /tmp/atlas-launch-inspection
```

The renderer parses every SVG, renders SVGs with a fixed viewport and
device scale, strips PNG metadata, and uses a fixed 128-color GIF palette
with no dithering. It validates dimensions, loop, duration, and size limits
and prints SHA-256 hashes. Temporary frames are cleaned automatically.
For byte-identical rebuilding, use the same Chromium, ffmpeg, Pillow, and
font versions; different text renderers can change antialiasing. The initial
render used Chrome headless shell 131.0.6778.85, ffmpeg 6.1.1-3ubuntu5,
Pillow 10.2.0, and the system DejaVu fonts (font revision 2.37).

Edit SVGs with a text or vector editor; keep shared Hub content consistent
in `../atlas-hub.svg`, `../social-preview.svg`, and `04-hub.svg` (the last
one only when the GIF is regenerated). There are no
embedded bitmaps, downloaded assets, or AI-generated images in the sources.
