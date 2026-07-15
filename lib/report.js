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

  function buildWeeklyReport(state, now) {
    now = now || 0;
    const hist = (state && state.hist) || [];
    const budgets = (state && state.budgets) || [];
    const included = hist.filter(inReport);
    const cas = included.filter(h => h.type === 'CA Request');
    const liqs = included.filter(h => h.type !== 'CA Request');

    const cashAdvanced = cas.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const liquidated = liqs.reduce((s, h) => s + (Number(h.amount) || 0), 0);

    // How much of a cash advance has already been liquidated. Heuristic match:
    // same chapter, and if the CA names an event/program, the same event too.
    function liquidatedFor(ca) {
      const chap = norm(ca.chapter);
      const ev = norm(ca.data && ca.data.event_program_name);
      return liqs
        .filter(l => norm(l.chapter) === chap && (ev ? norm(l.data && l.data.event_program_name) === ev : true))
        .reduce((s, l) => s + (Number(l.amount) || 0), 0);
    }

    // Pending CA liquidations + when each is due.
    const pending = [];
    for (const ca of cas) {
      const requested = Number(ca.amount) || 0;
      const done = liquidatedFor(ca);
      const outstanding = Math.round((requested - done) * 100) / 100;
      if (outstanding <= 1) continue; // effectively liquidated
      const dueMs = parseDate(ca.data && ca.data.liquidation_due_date);
      const daysUntil = dueMs != null ? Math.floor((dueMs - now) / DAY) : null;
      let status = 'no-date';
      if (daysUntil != null) status = daysUntil < 0 ? 'overdue' : daysUntil <= 7 ? 'due-soon' : 'upcoming';
      pending.push({
        chapter: ca.chapter || '(no chapter)',
        label: (ca.data && ca.data.event_program_name) || ca.name || (ca.data && ca.data.purpose) || '(unnamed request)',
        requestor: ca.name || (ca.data && ca.data.requestor_name) || '',
        requested, liquidated: done, outstanding,
        dueDate: (ca.data && ca.data.liquidation_due_date) || '',
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

    // Last-7-days activity for the Monday summary.
    const since = now - 7 * DAY;
    const recent = included.filter(h => parseDate(h.ts) != null && parseDate(h.ts) >= since);
    // Itemized breakdown of each submission received this week — this is the
    // "where did the amount come from" context shown in the Telegram message.
    const recentItems = recent
      .map(h => ({
        chapter: h.chapter || '(no chapter)',
        label: (h.data && h.data.event_program_name) || (h.data && h.data.establishment_name) ||
               h.name || (h.data && h.data.purpose) || h.invoice || '(unlabeled)',
        amount: Number(h.amount) || 0,
        type: h.type === 'CA Request' ? 'CA Request' : 'Liquidation',
        summary: (h.summary || '').trim(),
        ts: h.ts || '',
      }))
      .sort((a, b) => b.amount - a.amount);
    const weekly = {
      sinceMs: since,
      newSubmissions: recent.length,
      newLiquidated: recent.filter(h => h.type !== 'CA Request').reduce((s, h) => s + (Number(h.amount) || 0), 0),
      newCA: recent.filter(h => h.type === 'CA Request').reduce((s, h) => s + (Number(h.amount) || 0), 0),
      openFlags: hist.filter(h => h.status === 'Flagged' && !h.resolved).length,
      items: recentItems,
    };

    // Over-budget chapters (liquidations only count toward spend).
    const spentByChapter = {};
    liqs.forEach(l => { const c = norm(l.chapter); spentByChapter[c] = (spentByChapter[c] || 0) + (Number(l.amount) || 0); });
    const overBudget = budgets
      .map(b => ({ chapter: b.chapter, category: b.category, allocated: Number(b.allocated) || 0, spent: spentByChapter[norm(b.chapter)] || 0 }))
      .filter(b => b.spent > b.allocated)
      .map(b => ({ ...b, over: Math.round((b.spent - b.allocated) * 100) / 100 }));

    return {
      generatedAt: now,
      totals: {
        cashAdvanced, liquidated,
        outstanding: Math.round((cashAdvanced - liquidated) * 100) / 100,
        caCount: cas.length, liqCount: liqs.length,
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
  function dueLine(p) {
    const when = p.dueDate
      ? (p.daysUntil < 0 ? `due ${-p.daysUntil}d ago` : p.daysUntil === 0 ? 'due today' : `due in ${p.daysUntil}d`)
      : 'no due date';
    return `• <b>${tesc(p.chapter)}</b> — ${tesc(p.label)}: ${tesc(php(p.outstanding))} outstanding (${tesc(when)}${p.dueDate ? ', ' + tesc(p.dueDate) : ''})`;
  }
  // Trim an AI summary to a single tidy clause for the itemized breakdown.
  function clip(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }
  const MAX_ITEMS = 12; // keep the message well under Telegram's 4096-char limit

  function formatTelegram(r) {
    const L = [];

    // ---- Short bot introduction ----
    L.push('🤖 <b>DEVCON Finance Bot</b>');
    L.push(`Good day. Please find below the automated finance summary for the week ending <b>${fmtDate(r.generatedAt)}</b>. Kindly review the figures and settle any pending liquidations at your earliest convenience.`);
    L.push('———————————————');
    L.push('');

    L.push(`📊 <b>WEEKLY FINANCE REPORT</b> — ${fmtDate(r.generatedAt)}`);
    L.push('');
    L.push('<b>💰 I. Cash Advanced vs. Liquidated</b>');
    L.push(`• Total Advanced: ${tesc(php(r.totals.cashAdvanced))} (${r.totals.caCount} request${r.totals.caCount === 1 ? '' : 's'})`);
    L.push(`• Total Liquidated: ${tesc(php(r.totals.liquidated))} (${r.totals.liqCount} submission${r.totals.liqCount === 1 ? '' : 's'})`);
    L.push(`• Outstanding Balance: <b>${tesc(php(r.totals.outstanding))}</b>`);
    L.push('');

    L.push('<b>🧾 II. Pending CA Liquidations</b>');
    if (!r.pending.length) L.push('None. All cash advances have been fully liquidated. ✅');
    else {
      if (r.due.overdue.length) { L.push(`⚠️ <b>Overdue (${r.due.overdue.length})</b>`); r.due.overdue.forEach(p => L.push(dueLine(p))); }
      if (r.due.dueSoon.length) { L.push(`🔔 <b>Due this week (${r.due.dueSoon.length})</b>`); r.due.dueSoon.forEach(p => L.push(dueLine(p))); }
      if (r.due.upcoming.length) { L.push(`🗓️ <b>Upcoming (${r.due.upcoming.length})</b>`); r.due.upcoming.forEach(p => L.push(dueLine(p))); }
      if (r.due.noDate.length) { L.push(`❓ <b>No due date set (${r.due.noDate.length})</b>`); r.due.noDate.forEach(p => L.push(dueLine(p))); }
    }
    L.push('');

    // ---- This week's activity, with the source of each amount ----
    L.push('<b>📅 III. Activity This Week (last 7 days)</b>');
    const items = (r.weekly.items || []);
    if (!items.length) {
      L.push('No new submissions were received this week.');
    } else {
      L.push(`A total of <b>${r.weekly.newSubmissions}</b> submission${r.weekly.newSubmissions === 1 ? ' was' : 's were'} received, itemized below:`);
      items.slice(0, MAX_ITEMS).forEach(it => {
        L.push(`• <b>${tesc(it.chapter)}</b> — ${tesc(php(it.amount))} <i>(${tesc(it.type)})</i>`);
        const detail = it.summary ? clip(it.summary, 140) : clip(it.label, 90);
        if (detail) L.push(`   ↳ ${tesc(detail)}`);
      });
      if (items.length > MAX_ITEMS) L.push(`…and ${items.length - MAX_ITEMS} more submission(s).`);
    }
    L.push('');
    L.push('<b>Summary of the week:</b>');
    L.push(`• New Liquidations: ${tesc(php(r.weekly.newLiquidated))}`);
    L.push(`• New Cash Advances: ${tesc(php(r.weekly.newCA))}`);
    L.push(`• Open Audit Flags: ${r.weekly.openFlags}`);

    if (r.overBudget.length) {
      L.push('');
      L.push('<b>🚨 IV. Chapters Over Budget</b>');
      r.overBudget.forEach(b => L.push(`• <b>${tesc(b.chapter)}</b>: ${tesc(php(b.spent))} of ${tesc(php(b.allocated))} (over by ${tesc(php(b.over))})`));
    }

    L.push('');
    L.push('<i>This is an automated message from the DEVCON Finance Bot. For questions, please contact the National Finance Office.</i>');
    return L.join('\n');
  }

  return { buildWeeklyReport, formatTelegram, php, _internal: { numOf, norm, parseDate } };
});
