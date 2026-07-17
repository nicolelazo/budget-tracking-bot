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
  // A liquidation-type submission (a scanned receipt or an emailed liquidation),
  // as opposed to a Cash Advance request.
  const isLiqType = h => h && h.type !== 'CA Request';
  // Scanning/emailing alone does NOT liquidate anything. An entry only counts as
  // liquidated once a human confirms it (h.liquidated === true). Legacy entries
  // saved before this flag existed have no `liquidated` key → grandfathered as
  // liquidated (mirrors the `included !== false` convention). New entries are
  // saved with liquidated:false, so they start "awaiting liquidation".
  const isLiquidated = h => isLiqType(h) && h.liquidated !== false;
  const isAwaiting   = h => isLiqType(h) && h.liquidated === false;
  const labelOf = h => (h.data && h.data.event_program_name) || (h.data && h.data.establishment_name) ||
    h.name || (h.data && h.data.purpose) || h.invoice || '(unlabeled)';

  function buildWeeklyReport(state, now) {
    now = now || 0;
    const hist = (state && state.hist) || [];
    const budgets = (state && state.budgets) || [];
    const included = hist.filter(inReport);
    const liquidatedEntries = included.filter(isLiquidated);
    const awaitingEntries = included.filter(isAwaiting);

    const liquidated = liquidatedEntries.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const awaitingAmount = awaitingEntries.reduce((s, h) => s + (Number(h.amount) || 0), 0);

    // Everything scanned/emailed but not yet confirmed as liquidated. The user
    // confirms these manually in their own liquidation sheet, then marks them
    // liquidated in the dashboard — so this is the "still your work to do" list.
    const pending = awaitingEntries
      .map(h => ({
        chapter: h.chapter || '(no chapter)',
        label: labelOf(h),
        amount: Number(h.amount) || 0,
        summary: (h.summary || '').trim(),
        ts: h.ts || '',
      }))
      .sort((a, b) => b.amount - a.amount);

    // Last-7-days activity for the Monday summary. Cash Advance requests are
    // handled entirely over email, so the weekly itemization covers liquidation
    // submissions only.
    const since = now - 7 * DAY;
    const recent = included.filter(h => isLiqType(h) && parseDate(h.ts) != null && parseDate(h.ts) >= since);
    const recentItems = recent
      .map(h => ({
        chapter: h.chapter || '(no chapter)',
        label: labelOf(h),
        amount: Number(h.amount) || 0,
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
      openFlags: hist.filter(h => h.status === 'Flagged' && !h.resolved).length,
      items: recentItems,
    };

    // Over-budget chapters — only confirmed liquidations count toward spend.
    const spentByChapter = {};
    liquidatedEntries.forEach(l => { const c = norm(l.chapter); spentByChapter[c] = (spentByChapter[c] || 0) + (Number(l.amount) || 0); });
    const overBudget = budgets
      .map(b => ({ chapter: b.chapter, category: b.category, allocated: Number(b.allocated) || 0, spent: spentByChapter[norm(b.chapter)] || 0 }))
      .filter(b => b.spent > b.allocated)
      .map(b => ({ ...b, over: Math.round((b.spent - b.allocated) * 100) / 100 }));

    return {
      generatedAt: now,
      totals: {
        liquidated, liqCount: liquidatedEntries.length,
        awaitingAmount, awaitingCount: awaitingEntries.length,
      },
      pending, weekly, overBudget,
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

  function formatTelegram(r) {
    const L = [];

    // ---- Short bot introduction ----
    L.push('🤖 <b>DEVCON Finance Bot</b>');
    L.push(`Good day. Please find below the automated finance summary for the week ending <b>${fmtDate(r.generatedAt)}</b>. Kindly review the figures and confirm any items still awaiting liquidation at your earliest convenience.`);
    L.push('———————————————');
    L.push('');

    L.push(`📊 <b>WEEKLY FINANCE REPORT</b> — ${fmtDate(r.generatedAt)}`);
    L.push('');
    // ---- I. This week's activity ----
    L.push('<b>📅 I. Activity This Week (last 7 days)</b>');
    const items = (r.weekly.items || []);
    if (!items.length) {
      L.push('No new submissions were received this week.');
    } else {
      L.push(`A total of <b>${r.weekly.newSubmissions}</b> submission${r.weekly.newSubmissions === 1 ? ' was' : 's were'} received, itemized below:`);
      items.slice(0, MAX_ITEMS).forEach(it => {
        // A scanned/emailed submission is only "liquidated" once a human has
        // confirmed it — otherwise it is still awaiting liquidation.
        const tag = it.liquidated ? '✅ <i>(Liquidated)</i>' : '🕓 <i>(Awaiting liquidation)</i>';
        L.push(`• <b>${tesc(it.chapter)}</b> — ${tesc(php(it.amount))} ${tag}`);
        const detail = it.summary ? clip(it.summary, 140) : clip(it.label, 90);
        if (detail) L.push(`   ↳ ${tesc(detail)}`);
      });
      if (items.length > MAX_ITEMS) L.push(`…and ${items.length - MAX_ITEMS} more submission(s).`);
    }
    L.push('');
    L.push('<b>Summary of the week:</b>');
    L.push(`• Confirmed Liquidations (7d): ${tesc(php(r.weekly.newLiquidated))}`);
    L.push(`• Awaiting Liquidation (7d): ${tesc(php(r.weekly.newAwaiting))}`);
    L.push(`• Open Audit Flags: ${r.weekly.openFlags}`);

    // ---- II. Everything still awaiting liquidation ----
    L.push('');
    L.push('<b>🕓 II. Awaiting Liquidation</b>');
    L.push('<i>Scanned or emailed submissions not yet marked as liquidated. These are confirmed manually in your own liquidation sheet.</i>');
    const pend = (r.pending || []);
    if (!pend.length) {
      L.push('✅ Nothing awaiting liquidation — every submission has been confirmed.');
    } else {
      L.push(`<b>${pend.length}</b> item${pend.length === 1 ? '' : 's'} totaling <b>${tesc(php(r.totals.awaitingAmount))}</b>:`);
      pend.slice(0, MAX_ITEMS).forEach(p => {
        L.push(`• <b>${tesc(p.chapter)}</b> — ${tesc(php(p.amount))}${p.label ? ' — ' + tesc(clip(p.label, 60)) : ''}`);
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
