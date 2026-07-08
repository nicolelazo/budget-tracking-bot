# Smart Liquidation & Budget Manager Bot — Build Prompt (v2)

> Scope: R&D prototype for a bot that receives, tracks, and encodes chapter **liquidation** and **CA (Cash Advance) request** submissions into standard finance format, with budget tracking per chapter.

```
claude "Build a comprehensive, single-page client-side Dashboard App for a team-facing Finance Liquidation & Budget Manager Bot.

The application must be a single self-contained HTML file (inline JS/CSS allowed) styled beautifully using Tailwind CSS via CDN and Lucide Icons, with the following architecture and views:

1. **Dashboard Interface (Layout):**
   - A modern sidebar navigation with tabs for: 'Dashboard Overview', 'Receipt Image Extractor', 'Email Extractor (Liquidation & CA)', 'Budget Tracker', and 'Extraction Logs/History'.
   - A secure, persistent top bar containing a masked password-type field for the Anthropic API Key (saved in localStorage under 'anthropic_api_key') so the team doesn't have to keep re-entering it. Show a small warning tooltip: 'Key is stored only in this browser'.
   - A global toast/notification system for success, error, and audit-flag events.

2. **Claude API Integration (Critical Technical Requirements):**
   - All calls go to POST https://api.anthropic.com/v1/messages with headers: 'x-api-key', 'anthropic-version: 2023-06-01', 'content-type: application/json', AND 'anthropic-dangerous-direct-browser-access: true' (required — without this header, browser fetch calls are blocked by CORS).
   - Use model 'claude-opus-4-8' with max_tokens 4096.
   - Send images as content blocks: {type: 'image', source: {type: 'base64', media_type: <detected mime>, data: <base64 without data-URI prefix>}}. Send PDFs as {type: 'document', source: {type: 'base64', media_type: 'application/pdf', data: ...}} — PDFs must NOT be sent as image blocks.
   - Use Structured Outputs to guarantee valid JSON: pass output_config: {format: {type: 'json_schema', schema: <schema matching the 17 columns below, all fields type string, required, additionalProperties: false>}}. Parse the response's first text block with JSON.parse — never regex-scrape the reply.
   - Handle API errors gracefully: 401 → 'Check your API key', 429 → 'Rate limited, retry shortly', 529 → 'API overloaded, retry', network failure → offline message. Show a loading spinner state on every extraction button while a request is in flight.

3. **Tab 1: Dashboard Overview (Analytics Hub):**
   - Key metric cards computed live from the local history log: 'Total Submissions Processed', 'Total Amount Liquidated (PHP)', 'Total CA Requested (PHP)', 'Pending Audit Flags', and 'Success Rate (%)'.
   - A recent activity feed widget showing the last 5 items processed (type icon, establishment/requestor, amount, timestamp, status badge).
   - A small bar summary of top 5 chapters by total liquidated amount.

4. **Tab 2: Receipt Image Extractor (Visual OCR Engine):**
   - A clean drag-and-drop uploader zone that accepts images (PNG/JPG/WEBP) and PDFs, handles base64 encoding, and supports a BATCH QUEUE: multiple files can be dropped at once and are processed sequentially with per-file status (queued / processing / done / failed).
   - A side-by-side split view: left side shows a zoomable thumbnail preview of the current file; right side renders the 17 editable input fields mapped to our master spreadsheet layout. When the Claude API responds, auto-populate the 17 fields.
   - Fields whose extracted value came back as an empty string get a yellow 'needs review' highlight so encoders can fill them manually.

5. **Tab 3: Email Extractor (Structured Parser — Liquidation & CA Requests):**
   - A document-type toggle: 'Liquidation Email' or 'CA Request Email'.
   - A large styled textarea where the user pastes the raw text/notification body of the system-generated email, and a 'Process Email' button.
   - Liquidation mode maps into the same 17 editable fields as Tab 2.
   - CA Request mode maps into a separate 8-field CA form: Request Date, Chapter, Requestor Name, Event/Program Name, Purpose, Amount Requested, Date Needed, Liquidation Due Date. Missing values return as empty strings. CA entries get their own 'Copy CA Row' button (tab-delimited, in that column order) and are logged in history with type 'CA Request'.

6. **Tab 4: Budget Tracker (Budget Manager):**
   - A chapter budget table stored in localStorage under 'chapter_budgets': columns Chapter, HQ Budget Allocation category, Allocated Amount (PHP), Spent (computed automatically by summing liquidation history entries for that chapter), Remaining, and a colored progress bar (green <70%, yellow 70–95%, red >95% utilized).
   - Add/edit/delete allocation rows via a modal form. Warn with a red toast whenever a newly committed liquidation pushes a chapter over its allocation.

7. **Tab 5: Extraction Logs & History (Local Ledger):**
   - A searchable, filterable data table (filter by type: Image/Email/CA, by status: Success/Flagged) reading from a localStorage array named 'liquidation_history'.
   - Every time a user successfully processes and copies a row, append: timestamp, chapter, establishment/requestor name, invoice #, total amount, extraction type (Image/Email/CA Request), and status (Success/Flagged).
   - Row actions: view details (re-open the full 17/8 fields read-only), delete entry (with confirm).
   - An 'Export CSV' button that downloads the full history, and a 'Clear All' button with double confirmation.

8. **Spreadsheet Architecture & Rules (Prompt Constraints):**
   - Instruct the underlying Claude system prompts for BOTH extraction functions to strictly extract and map JSON keys to our exact 17 columns, in this order:
     Item Count, Invoice Date, Chapter, HQ Budget Allocation category, Event/Program Name, Chapter or Program Representative, Establishment Name, Establishment TIN, Establishment Address, Invoice #, Particulars, If Others please specify (tokens, merch, etc), Amount, VAT Excl., VAT, VAT Incl., Gdrive Link of the Invoice.
   - If a piece of data (like a TIN or Invoice #) cannot be found with 100% certainty, Claude MUST return it as an empty string ('') — never guess, never hallucinate a placeholder.
   - Normalize Invoice Date to YYYY-MM-DD and TIN to digits-with-dashes format (e.g. 123-456-789-000) when confidently readable.
   - VAT math is computed DETERMINISTICALLY IN JAVASCRIPT, not by the model: whenever Amount is present or edited, recalculate VAT Incl = Amount; VAT Excl = round(Amount / 1.12, 2); VAT = round(VAT Incl − VAT Excl, 2). The app overwrites whatever the model returned for the three VAT fields, and recalculates live when the user edits Amount.

9. **Audit Flag Engine (client-side validation before commit):**
   Mark an entry status 'Flagged' (instead of 'Success') and list the reasons when any of these fire:
   - Duplicate detection: same Invoice # + same Establishment TIN already exists in history.
   - Amount missing, zero, negative, or non-numeric.
   - VAT fields inconsistent with the deterministic formula (tolerance ±0.02).
   - Required fields empty: Chapter, Invoice Date, Establishment Name, or Amount.
   - Invoice Date in the future.
   Flagged entries still commit (finance can fix later) but appear in the 'Pending Audit Flags' dashboard count until a user marks them resolved from the History tab.

10. **The 'Copy & Commit' Mechanism:**
   - Under each extraction form, place a prominent 'Copy Row for Spreadsheet' button.
   - Clicking it reads all live inputs in exact column order, joins them with tab characters ('\t') for native Excel/Google Sheets pasting, copies to clipboard via navigator.clipboard.writeText, runs the Audit Flag Engine, saves the entry into history, updates the Budget Tracker spent totals, and shows a confirmation toast ('Row copied — paste into the master sheet').
   - Also provide a 'Copy Header Row' link once per session for setting up new sheets."
```

---

## v2.1 addition — Gmail Auto-Ingestion tab

Liquidation and CA submissions arrive as **Google Forms notification emails**; encoders should not have to paste bodies manually. New 'Gmail Inbox' tab:
- Connects to the user's Gmail via Google Identity Services OAuth (scope `gmail.readonly` — read-only, token never leaves the browser).
- Fetches messages matching an editable Gmail search query (default `from:forms-receipts-noreply@google.com newer_than:30d`).
- Each email is run through a single Claude classify-and-extract call (`doc_type`: liquidation / ca_request / other) using a combined structured-output schema; liquidations and CA requests are committed straight into history (VAT recomputed in JS, audit flags applied); 'other' emails are skipped.
- 'Auto-process new emails' toggle polls every 2 minutes and encodes new matches hands-free. Processed/skipped message IDs are remembered in localStorage so nothing is double-encoded (on top of the invoice#+TIN duplicate audit flag).
- Manual controls per email: Process, Skip, View raw body, Send to Email Tab (for manual handling).
- Because Google OAuth forbids `file://` origins, the app ships with a dependency-free `server.js` + `start-dashboard.bat` that serve it at `http://localhost:8917`.
- One-time user setup: Google Cloud project → enable Gmail API → OAuth consent screen (add own email as test user) → Web OAuth Client ID with JS origin `http://localhost:8917`.

## v2.2 additions

1. **Google Drive link receipt ingestion** — encoders paste a Drive share link instead of uploading files. Rationale: iPhone photos are HEIC, which the Claude API doesn't accept; users upload to Drive and paste the link. The app resolves the file via the Drive API (using the same Google connection as Gmail, scope `drive.readonly`); for HEIC/unsupported formats it fetches Drive's own JPEG render (thumbnailLink at =s2048), and for public "anyone with link" files it falls back to the Drive image CDN with no sign-in needed. The pasted link auto-fills the "Gdrive Link of the Invoice" column.
2. **Selectable CSV export in exact master format** — history rows now have checkboxes (+ select-all on filtered view). Export CSV outputs only ticked entries (or the filtered view when nothing is ticked): liquidations as exactly the 17 master-sheet columns in order, CA requests as a separate 8-column file.
3. **Particulars dropdown** — Particulars is now a `<select>` in both extraction forms, mirroring the data-validation dropdown in the master sheet. Options are user-editable in-app ("edit options" link, stored in localStorage) and are enforced on Claude's side via a JSON-schema enum, so extraction can only ever return an allowed option (or empty). "Others" pairs with the "If Others please specify" column.

## v2.3 additions

1. **Historical DEVCON Form backfill** — submissions arrive as emails titled `[DEVCON Form] - <name> | 2026 Request for Chapter Event Support or Programs Event Seed Fund from HQ National Office` (fund/CA requests) or the same with *Liquidation* (liquidations). The Gmail tab's default query is now `subject:"[DEVCON Form]"` (all time, both types), with one-click preset chips: All DEVCON forms / Fund requests only / Liquidations only / Last 30 days. The inbox now paginates ("Load older submissions…" button, 25 per page) so ALL past submissions can be pulled and processed, not just the newest 25 of the last 30 days. The classifier system prompt names these two subjects explicitly (request form → `ca_request`, liquidation form → `liquidation`).
2. **Per-entry "In report" toggle** — every history entry has an `included` flag (default true; pre-existing entries count as included). A pill in the History table toggles Included/Excluded; excluded rows are dimmed and drop out of the dashboard money metrics (Total Liquidated, Total CA Requested, Top Chapters) and Budget Tracker spent totals, but stay in history and remain exportable. The Total Submissions card shows an "(n excluded)" note.

## Planned — Telegram companion bot (not yet built)

A server-side Node bot (extends `server.js` or runs as its own worker) that: polls Gmail for new `[DEVCON Form]` emails on an interval, pushes a Telegram message with a Claude-generated summary (chapter, requestor, amount, type), and answers commands like `/pending` (unprocessed submissions), `/budget <chapter>` (allocation vs spent), `/recent`, `/flags`. Needs: a BotFather bot token, a Google OAuth refresh token for server-side Gmail read, and shared state with the dashboard (which currently lives in browser localStorage → requires moving history/budgets to a shared store, e.g. Supabase, per the Phase 2 note below).

## Changelog vs v1 (why each revision)

| Change | Reason |
|---|---|
| Model `claude-3-5-sonnet` → `claude-opus-4-8` | 3.5 Sonnet is outdated; Opus 4.8 is the current recommended model for vision + extraction accuracy |
| Added `anthropic-dangerous-direct-browser-access: true` header | Mandatory for browser-side fetch to the Anthropic API — v1 would fail on CORS for every request |
| Added Structured Outputs (`output_config.format` JSON schema) | Guarantees valid, schema-exact JSON; removes fragile response parsing |
| PDFs sent as `document` blocks, not `image` blocks | v1 said "images/PDFs" through one path; the API rejects PDFs sent as images |
| Added **CA Request email mode** (8-field form) | Original R&D scope covers "chapter liquidation **and CA request** emails" — v1 dropped CA entirely |
| Added **Budget Tracker tab** | The project is a "Budget Manager Bot" — v1 had no budget feature; now tracks allocation vs actual per chapter with overspend warnings |
| Added **Audit Flag Engine** with concrete rules | v1 showed a "Pending Audit Flags" metric with no logic behind it; now flags duplicates, bad VAT math, missing fields, future dates |
| VAT math moved fully to JavaScript (model output overwritten) | Deterministic finance math should never depend on model arithmetic; also recalculates live on manual edits |
| Batch upload queue for receipts | Real liquidation batches arrive as many receipts at once |
| CSV export, search/filter, delete, needs-review highlights, error handling, date/TIN normalization | Practical encoder-workflow quality-of-life; empty-string fields are visually surfaced instead of silently blank |

## Known limitations (fine for R&D prototype, note for build plan)
- **localStorage API key**: acceptable for an internal prototype, but for production the key should live behind a small server proxy (e.g. a Supabase Edge Function) so it's never exposed in the browser.
- **localStorage ledger**: single-browser only; no team sync. Phase 2: move history + budgets to a shared database (Supabase) and add Gmail ingestion so the bot reads liquidation/CA emails automatically instead of paste-in.
- **No auth**: anyone with the page can use the stored key.
