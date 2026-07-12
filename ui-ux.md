# UI / UX Guide — Liquidation & Budget Manager Bot

A design reference for the dashboard. The goal is a **calm, minimal, black-and-white
interface** that a first-time volunteer can understand without a manual. Color is
used sparingly and only to mean something.

---

## 1. Design principles

1. **Minimal, monochrome-first.** The interface is black, white, and gray. Color
   appears only for genuine status (a flag, an over-budget chapter, a success). If
   everything is colorful, nothing stands out — so most of the screen is quiet.
2. **Plain language over jargon.** Tabs and buttons say what they *do*
   ("Scan a Receipt", "Email Submissions"), not what they *are*
   ("Receipt Image Extractor"). Every section has a one-line explanation.
3. **Progressive disclosure.** Advanced or one-time setup (Google connection,
   Vercel env vars) is hidden inside collapsible `details` cards so the daily view
   isn't overwhelming. New users open the "Getting Started" card; everyone else
   ignores it.
4. **Show, then let them confirm.** The AI extracts fields; the person reviews and
   commits. Fields the AI wasn't sure about are highlighted for review.
5. **Never surprise the user with an action.** Nothing leaves the browser except
   calls to the AI service and — only if explicitly turned on — the user's own
   Telegram group. This is stated in the UI.

---

## 2. Color palette

Minimal black. One near-black accent, a neutral gray ramp, white surfaces, and a
tightly limited set of status colors. Implemented by remapping Tailwind's `indigo`
(accent) and `slate` (neutral) scales in the `tailwind.config` block at the top of
`index.html`, so the whole app inherits the palette with no per-element overrides.

### Core — Ink (accent) & Neutral (grays)

| Role | Token (Tailwind class) | Hex | Used for |
|------|------------------------|-----|----------|
| Ink / primary | `indigo-600` | `#171717` | Primary buttons, active tab, links, checkboxes |
| Ink hover | `indigo-500` | `#404040` | Button hover (lightens on press) |
| Ink pure | `indigo-900` | `#000000` | Active tab background, step badges |
| Ink on dark | `indigo-400` | `#a3a3a3` | Small icons on the dark header/sidebar |
| Surface | white | `#ffffff` | Cards, inputs, tables |
| Canvas | `slate-100` | `#f5f5f5` | Page background, subtle fills |
| Canvas raised | `slate-50` | `#fafafa` | Inset panels, badges |
| Border | `slate-200` | `#e5e5e5` | Card and input borders, dividers |
| Border strong | `slate-300` | `#d4d4d4` | Button outlines |
| Text muted | `slate-400` | `#a3a3a3` | Hints, timestamps, placeholders |
| Text secondary | `slate-500` | `#737373` | Labels, descriptions |
| Text body | `slate-800` | `#262626` | Default body text |
| Header / sidebar | `slate-900` | `#171717` | Top bar and left nav (near-black, no blue tint) |

### Status — used sparingly, only where it carries meaning

| Meaning | Color | Class family | Where |
|---------|-------|--------------|-------|
| Success / money liquidated | Emerald | `emerald-600` `#059669` | "Success" badge, liquidated totals |
| Needs attention / flag | Amber | `amber-500` `#f59e0b` | Audit flags, "due soon", fields to review |
| Error / over budget / overdue | Red | `red-600` `#dc2626` | Over-budget, overdue, destructive actions |
| Cash advance (category, not alert) | Sky | `sky-600` `#0284c7` | "Cash Advanced" figure only |

**Rule of thumb:** if a color isn't communicating success, a warning, or an error,
it should be gray. Status colors are always paired with a text label or icon, never
color alone (accessibility).

### Quick reference (copy-paste)

```
Ink        #171717   (accent / primary)     Ink hover  #404040
Ink pure   #000000   Ink on-dark #a3a3a3
White      #ffffff   Canvas     #f5f5f5      Raised     #fafafa
Border     #e5e5e5   Border+    #d4d4d4
Text: muted #a3a3a3 · secondary #737373 · body #262626 · header #171717
Status: success #059669 · warn #f59e0b · error #dc2626 · advance #0284c7
```

---

## 3. Typography

- **Font:** system UI stack (Tailwind default) — fast, native, no web-font load.
- **Scale:** page title `text-2xl font-bold`; section title `font-semibold`;
  body `text-sm`; hints/metadata `text-xs` / `text-[11px]`.
- **Numbers** (money) use `font-bold` in the metric they belong to so figures are
  scannable. Currency is always formatted `PHP 12,345.00`.
- Uppercase micro-labels (`text-xs uppercase tracking-wide`) mark sub-sections
  inside a card without adding another heading weight.

---

## 4. Components & patterns

- **Cards:** `bg-white rounded-xl shadow p-5`. One idea per card. Cards stack with
  `mt-6` gaps on the Dashboard.
- **Collapsible card (`details.card`):** used for Getting Started and all one-time
  setup. A chevron (`chevron-right`) rotates 90° when open. Keeps the default view
  short.
- **Buttons:**
  - Primary → `bg-indigo-600 hover:bg-indigo-500 text-white` (near-black).
  - Secondary → `border border-slate-300` (outline, ghost).
  - Destructive → red text or `bg-red-600`, always behind a confirm dialog.
- **Badges / pills:** `text-[11px] px-2 py-0.5 rounded-full`; gray by default,
  status-colored only when they report status.
- **Inputs:** `border border-slate-300 rounded-lg`, focus ring in ink
  (`focus:ring-2 focus:ring-indigo-500`).
- **Tabs (left nav):** active tab = black fill + a white left indicator bar
  (`inset 3px 0 0 #fff`) so the current page is obvious on the dark sidebar.
- **Toasts:** bottom-right, auto-dismiss; success = emerald, warn = amber,
  error = red, info = ink.
- **Field review highlight:** pale amber (`.field-review`) marks any field the AI
  left blank or wasn't confident about, prompting a human check.

---

## 5. Layout

- Fixed **top bar** (brand + API key) and **left sidebar** (navigation); the main
  panel scrolls. This keeps the key and navigation always reachable.
- Dashboard reads top-to-bottom in priority order: **metrics → activity → report →
  weekly/Telegram**. Setup lives at the bottom, collapsed.
- Responsive: metric cards `grid-cols-2` on mobile → `lg:grid-cols-5`; two-column
  content collapses to one column below `lg`.

---

## 6. Accessibility & tone

- Status is never conveyed by color alone — always a label or icon too.
- Ink `#171717` on white ≈ 16:1 contrast; body/secondary grays clear AA.
- Copy is warm and reassuring, especially around money and privacy ("stays in this
  browser only", "nothing is changed or sent from your inbox").
- Every non-obvious control has a `title` tooltip with a short plain-English note.

---

## 7. What changed in the friendliness pass

- Renamed tabs to task language; added a one-line subtitle to every screen.
- Added a collapsible **Getting Started** 3-step guide on the Dashboard.
- Moved the Telegram env-var list and the Google connection steps into collapsible
  cards so the default view is short.
- Recolored the whole app to the minimal black palette above.
- Made unreadable linked Google Sheets visible: if a form's linked sheet can't be
  opened (a sharing issue), the entry is **flagged** instead of silently logging an
  amount taken only from the email text.
