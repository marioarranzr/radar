# 04 · Design Brief

> Visual direction so the AI doesn't improvise. Components are hand-written with Tailwind
> (no component library, see TRD §9). If a case isn't covered, use the most restrained style with these tokens.

---

## 1. Overall feel

**Keywords:** restrained, editorial, trustworthy, fast.
Tone reference: a cross between an analyst's brief and Linear/Notion.
Lots of white space, little color; color is reserved for status and action.
**No:** gradients, 3D illustrations, emojis in the UI, heavy shadows, glassmorphism.

## 2. Palette (CSS tokens in `globals.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF9` | `#0C0C0D` | Page background |
| `--surface` | `#FFFFFF` | `#161618` | Cards, brief |
| `--border` | `#E7E5E4` | `#2A2A2E` | 1 px borders |
| `--text` | `#1C1917` | `#EDEDED` | Primary text |
| `--text-muted` | `#78716C` | `#9A9AA0` | Secondary, dates |
| `--accent` | `#2F5BEA` | `#6E8BFF` | Primary button, links, focus |
| `--accent-fg` | `#FFFFFF` | `#0C0C0D` | Text on accent |
| `--success` | `#166534` | `#4ADE80` | "Ready" chip |
| `--warning` | `#92400E` | `#FBBF24` | "Unconfirmed", "Queued" |
| `--danger` | `#B91C1C` | `#F87171` | Error, delete |

Dark mode follows `prefers-color-scheme`. Minimum AA contrast (4.5:1 for text).

## 3. Typography

| Use | Font | Size / weight |
|---|---|---|
| UI and body | **Inter** (via `next/font`) | 15 px / 400, line-height 1.6 |
| Headings | **Inter** | H1 28/600 · H2 20/600 · H3 16/600 |
| Brief (section body) | **Source Serif 4** | 16 px / 400 — gives an "editorial" feel |
| Data, times, URLs | **JetBrains Mono** | 13 px / 400 |

## 4. Spacing, shape and motion

- 4 px spacing scale (Tailwind default). Page gutter 16 px on narrow screens / 32 px on desktop.
- Max content width: **720 px** (comfortable reading of the brief).
- Radius: 8 px on cards and inputs, 999 px on chips.
- Shadow: only `0 1px 2px rgb(0 0 0 / .05)` on cards.
- Motion: 150-200 ms `ease-out`. Progress steps enter with a fade + 4 px offset.
  Respect `prefers-reduced-motion`.

## 5. Components (custom, Tailwind)

| Component | Variants / notes |
|---|---|
| `Button` | `primary` (accent), `secondary` (bordered), `ghost`, `destructive` (text in `--accent-fg` for dark-mode contrast). 40 px tall. Loading state with a spinner on the left and the text "Researching…" |
| `Input` / `Textarea` | Label above, counter on the right below the field, error in `--danger`. Border in `--text-muted` (≥ 3:1, WCAG 1.4.11) |
| `Badge` (status chip) | Color background at 12 % opacity + colored text |
| `Card` | `--surface` background, `--border` border, 24 px padding |
| `ConfirmDialog` | For deleting; native `<dialog>` element |
| `Toast` | Custom and minimal; bottom right (bottom center on narrow screens), disappears after 3 s |
| `StepList` | Vertical list with a connecting line on the left; ✓ icon in `--success` for completed steps, spinner for the current one |

Icons: inline SVG (only a few: trash, check, alert, copy), 16-18 px, 1.75 stroke. No icon library.

## 6. What each screen looks like

### `/` Home
Single 720 px column.
1. Thin header (56 px) with the "Radar" logotype (text, Inter 600, with a small `--accent` dot in front) on the left.
2. H1 "Which company should we research?".
3. Card with a large input (48 px tall, 17 px font), the context textarea collapsed
   behind a "+ Add context" link, and a bottom row: "7 of 10 left today" (muted) ← → Research button.
4. H2 "History" and a list of rows (no individual cards, separated by borders): name (600),
   relative date in muted mono, status chip on the right, trash icon visible on hover / always on narrow screens.

### `/research/[id]` — Progress
H1 "Researching Factorial HR", timer in mono on the right.
`StepList` below. Muted text at the end: "You can close this page; it will be waiting in your history."

### `/research/[id]` — Brief
A single document-style card. Header: name (H1), website as a mono link, date.
"Copy Markdown" (secondary) and "New research" (primary) buttons at the top right
(below the title on narrow screens). Sections with H2 and body in Source Serif.
"Key facts" as a 2-column definition list (1 on narrow screens). "Unconfirmed" as a
warning Badge. Numbered sources in mono. Muted footer with metrics.

### `/research/[id]` — Error
Alert icon in `--danger`, title "We couldn't complete the research",
message, Retry (primary) and Back (ghost) buttons.

## 7. Microcopy

- Friendly second person, short sentences, no technical jargon ("agent", "tokens" never appear in the UI).
- Errors: what happened + what you can do. E.g.: "The search took too long. Try again in a moment."
