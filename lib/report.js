/* ============================================================================
   Shared finance-report logic — used by BOTH the browser dashboard (index.html)
   and the Vercel serverless cron (api/weekly-report.js).

   UMD wrapper so the same file works as a <script> in the browser
   (window.BudgetReport) and as a CommonJS module in Node (module.exports).

   The single input is a "state" snapshot: { hist: [...], budgets: [...] }
   — exactly what the dashboard keeps in localStorage. `now` is passed in (ms)
   so the output is deterministic and testable.
   ========================================================================== */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.BudgetReport = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const DAY = 86400000;
  const norm = s => String(s == null ? '' : s).trim().toLowerCase();
  const numOf = v => {
    const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  function php(n) {
    n = Number(n) || 0;
    const neg = n < 0;
    const [i, d] = Math.abs(n).toFixed(2).split('.');
    return (neg ? '-' : '') + 'PHP ' + i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + d;
  }
  // Parse a YYYY-MM-DD (or any Date-parseable) string to ms, or null.
  function parseDate(s) {
    if (!s) return null;
    const t = Date.parse(s);
    return isNaN(t) ? null : t;
  }
  const inReport = h => h && h.included !== false;
  // "Seed Fund" = a member's request for funds from the org (the money that must
  // later be liquidated). NOT a Cash Advance. Older snapshots stored these under
  // the legacy type 'CA Request', so accept both.
  const isSeedFund = h => h && (h.type === 'Seed Fund' || h.type === 'CA Request');
  // A liquidation-type submission (a scanned receipt or an emailed liquidation).
  const isLiqType = h => h && !isSeedFund(h);
  // Scanning/emailing alone does NOT liquidate anything. A liquidation only counts
  // once a human explicitly confirms it (h.liquidated === true); everything else
  // (new entries, and older entries with no flag) is still awaiting liquidation.
  const isLiquidated = h => isLiqType(h) && h.liquidated === true;
  const isAwaiting   = h => isLiqType(h) && h.liquidated !== true;
  const labelOf = h => (h.data && h.data.event_program_name) || (h.data && h.data.establishment_name) ||
    h.name || (h.data && h.data.purpose) || h.invoice || '(unlabeled)';

  function buildWeeklyReport(state, now) {
    now = now || 0;
    const hist = (state && state.hist) || [];
    const budgets = (state && state.budgets) || [];
    const included = hist.filter(inReport);
    const seeds = included.filter(isSeedFund);
    const confirmedLiqs = included.filter(isLiquidated);
    const awaitingEntries = included.filter(isAwaiting);

    const seedAdvanced = seeds.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const liquidated = confirmedLiqs.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const awaitingAmount = awaitingEntries.reduce((s, h) => s + (Number(h.amount) || 0), 0);

    // How much of a seed fund has already been liquidated (confirmed only).
    // Heuristic match: same chapter, and if the seed fund names an event, the
    // same event too.
    function liquidatedFor(seed) {
      const chap = norm(seed.chapter);
      const ev = norm(seed.data && seed.data.event_program_name);
      return confirmedLiqs
        .filter(l => norm(l.chapter) === chap && (ev ? norm(l.data && l.data.event_program_name) === ev : true))
        .reduce((s, l) => s + (Number(l.amount) || 0), 0);
    }

    // Seed funds still pending liquidation + when each is due.
    const pending = [];
    for (const seed of seeds) {
      const requested = Number(seed.amount) || 0;
      const done = liquidatedFor(seed);
      const outstanding = Math.round((requested - done) * 100) / 100;
      if (outstanding <= 1) continue; // effectively liquidated
      const dueMs = parseDate(seed.data && seed.data.liquidation_due_date);
      const daysUntil = dueMs != null ? Math.floor((dueMs - now) / DAY) : null;
      let status = 'no-date';
      if (daysUntil != null) status = daysUntil < 0 ? 'overdue' : daysUntil <= 7 ? 'due-soon' : 'upcoming';
      pending.push({
        chapter: seed.chapter || '(no chapter)',
        label: (seed.data && seed.data.event_program_name) || seed.name || (seed.data && seed.data.purpose) || '(unnamed request)',
        requestor: seed.name || (seed.data && seed.data.requestor_name) || '',
        requested, liquidated: done, outstanding,
        dueDate: (seed.data && seed.data.liquidation_due_date) || '',
        daysUntil, status,
      });
    }
    // Sort: overdue first, then soonest due, then no-date last.
    const rank = { overdue: 0, 'due-soon': 1, upcoming: 2, 'no-date': 3 };
    pending.sort((a, b) => (rank[a.status] - rank[b.status]) ||
      ((a.daysUntil == null ? 1e9 : a.daysUntil) - (b.daysUntil == null ? 1e9 : b.daysUntil)));

    const due = {
      overdue: pending.filter(p => p.status === 'overdue'),
      dueSoon: pending.filter(p => p.status === 'due-soon'),
      upcoming: pending.filter(p => p.status === 'upcoming'),
      noDate: pending.filter(p => p.status === 'no-date'),
    };

    // Last-7-days activity for the Monday summary. Each item is tagged as either
    // a Seed Fund request or a Liquidation, and liquidations additionally carry
    // their confirmed/awaiting status.
    const since = now - 7 * DAY;
    const recent = included.filter(h => parseDate(h.ts) != null && parseDate(h.ts) >= since);
    const recentItems = recent
      .map(h => ({
        chapter: h.chapter || '(no chapter)',
        label: labelOf(h),
        amount: Number(h.amount) || 0,
        kind: isSeedFund(h) ? 'seed' : 'liquidation',
        liquidated: isLiquidated(h),
        summary: (h.summary || '').trim(),
        ts: h.ts || '',
      }))
      .sort((a, b) => b.amount - a.amount);
    const weekly = {
      sinceMs: since,
      newSubmissions: recent.length,
      newLiquidated: recent.filter(isLiquidated).reduce((s, h) => s + (Number(h.amount) || 0), 0),
      newAwaiting: recent.filter(isAwaiting).reduce((s, h) => s + (Number(h.amount) || 0), 0),
      newSeed: recent.filter(isSeedFund).reduce((s, h) => s + (Number(h.amount) || 0), 0),
      seedCount: recent.filter(isSeedFund).length,
      openFlags: hist.filter(h => h.status === 'Flagged' && !h.resolved).length,
      items: recentItems,
    };

    // Over-budget chapters — only confirmed liquidations count toward spend.
    const spentByChapter = {};
    confirmedLiqs.forEach(l => { const c = norm(l.chapter); spentByChapter[c] = (spentByChapter[c] || 0) + (Number(l.amount) || 0); });
    const overBudget = budgets
      .map(b => ({ chapter: b.chapter, category: b.category, allocated: Number(b.allocated) || 0, spent: spentByChapter[norm(b.chapter)] || 0 }))
      .filter(b => b.spent > b.allocated)
      .map(b => ({ ...b, over: Math.round((b.spent - b.allocated) * 100) / 100 }));

    return {
      generatedAt: now,
      totals: {
        seedAdvanced, liquidated,
        outstanding: Math.round((seedAdvanced - liquidated) * 100) / 100,
        seedCount: seeds.length, liqCount: confirmedLiqs.length,
        awaitingAmount, awaitingCount: awaitingEntries.length,
      },
      pending, due, weekly, overBudget,
    };
  }

  // ---- Telegram message (HTML parse_mode: <b>, \n; escape & < >) ----
  const tesc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function fmtDate(ms) {
    if (!ms) return '';
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  // Trim an AI summary to a single tidy clause for the itemized breakdown.
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }
  const MAX_ITEMS = 12; // keep the message well under Telegram's 4096-char limit
  // "due in 3d" / "due today" / "5d overdue" / "no due date"
  function dueWhen(p) {
    if (!p.dueDate) return 'no due date';
    if (p.daysUntil < 0) return `${-p.daysUntil}d overdue`;
    if (p.daysUntil === 0) return 'due today';
    return `due in ${p.daysUntil}d`;
  }

  function formatTelegram(r) {
    const L = [];
    const t = r.totals;

    // ---- Short bot introduction ----
    L.push('🤖 <b>DEVCON Finance Bot</b>');
    L.push(`Good day. Please find below the automated finance summary for the week ending <b>${fmtDate(r.generatedAt)}</b>. Kindly review the figures and settle any pending seed fund liquidations by their due dates.`);
    L.push('———————————————');
    L.push('');

    L.push(`📊 <b>WEEKLY FINANCE REPORT</b> — ${fmtDate(r.generatedAt)}`);
    L.push('');

    // ---- Summary of the week (up top) ----
    L.push('<b>🧾 Summary of the Week</b>');
    L.push(`• Liquidations — Confirmed: ${tesc(php(r.weekly.newLiquidated))} · Awaiting: ${tesc(php(r.weekly.newAwaiting))}`);
    L.push(`• New Seed Fund Requests: ${tesc(php(r.weekly.newSeed))} (${r.weekly.seedCount})`);
    L.push(`• Open Audit Flags: ${r.weekly.openFlags}`);
    L.push('');

    // ---- I. This week's activity ----
    L.push('<b>📅 I. Activity This Week (last 7 days)</b>');
    const items = (r.weekly.items || []);
    if (!items.length) {
      L.push('No new submissions were received this week.');
    } else {
      L.push(`A total of <b>${r.weekly.newSubmissions}</b> submission${r.weekly.newSubmissions === 1 ? ' was' : 's were'} received, itemized below:`);
      items.slice(0, MAX_ITEMS).forEach(it => {
        // Each item is either a Seed Fund request or a Liquidation; a liquidation
        // is only "Liquidated" once a human has confirmed it.
        const tag = it.kind === 'seed'
          ? '🌱 <i>(Seed Fund request)</i>'
          : (it.liquidated ? '🧾 <i>(Liquidation · ✅ Liquidated)</i>' : '🧾 <i>(Liquidation · 🕓 Awaiting)</i>');
        // Seed fund requests usually carry no amount at submission — omit it rather than showing 0.00.
        const amt = it.kind === 'seed' ? '' : `— ${tesc(php(it.amount))} `;
        L.push(`• <b>${tesc(it.chapter)}</b> ${amt}${tag}`);
        const detail = it.summary ? clip(it.summary, 140) : clip(it.label, 90);
        if (detail) L.push(`   ↳ ${tesc(detail)}`);
      });
      if (items.length > MAX_ITEMS) L.push(`…and ${items.length - MAX_ITEMS} more submission(s).`);
    }
    // ---- II. Seed funds pending liquidation + due dates ----
    L.push('');
    L.push('<b>🕓 II. Seed Funds Pending Liquidation &amp; Due Dates</b>');
    const pend = (r.pending || []);
    if (pend.length) {
      pend.slice(0, MAX_ITEMS).forEach(p => {
        L.push(`• <b>${tesc(p.chapter)}</b> — ${tesc(p.label)}: ${tesc(php(p.outstanding))} outstanding of ${tesc(php(p.requested))} (${tesc(dueWhen(p))}${p.dueDate ? ', ' + tesc(p.dueDate) : ''})`);
      });
      if (pend.length > MAX_ITEMS) L.push(`…and ${pend.length - MAX_ITEMS} more.`);
    }

    if (r.overBudget.length) {
      L.push('');
      L.push('<b>🚨 III. Chapters Over Budget</b>');
      r.overBudget.forEach(b => L.push(`• <b>${tesc(b.chapter)}</b>: ${tesc(php(b.spent))} of ${tesc(php(b.allocated))} (over by ${tesc(php(b.over))})`));
    }

    L.push('');
    L.push('<i>This is an automated message from the DEVCON Finance Bot.</i>');
    return L.join('\n');
  }

  return { buildWeeklyReport, formatTelegram, php, _internal: { numOf, norm, parseDate } };
});
