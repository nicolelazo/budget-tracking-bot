/* GET /api/weekly-report
   Reads the latest dashboard snapshot from Supabase, builds the weekly finance
   report, and sends it to the Telegram group. Triggered by Vercel Cron every
   Monday (see vercel.json "crons"). Can also be called manually with ?key=<APP_SYNC_SECRET>.

   Required env vars:
     SUPABASE_URL, SUPABASE_SERVICE_KEY   (read the snapshot)
     TELEGRAM_BOT_TOKEN                   (bot from @BotFather)
     TELEGRAM_CHAT_ID                     (target group chat id, usually negative)
   Recommended:
     CRON_SECRET   Vercel sends it as "Authorization: Bearer <CRON_SECRET>" on cron
                   invocations; when set, only cron (or ?key=APP_SYNC_SECRET) may run this.
   Optional:
     APP_SYNC_SECRET   allows manual runs via ?key=... (e.g. the dashboard test button)
*/
const { buildWeeklyReport, formatTelegram } = require('../lib/report.js');

module.exports = async (req, res) => {
  const CRON_SECRET = process.env.CRON_SECRET;
  const APP_SYNC_SECRET = process.env.APP_SYNC_SECRET;
  const auth = req.headers.authorization || '';
  const manualKey = (req.query && req.query.key) || '';
  const isCron = CRON_SECRET && auth === 'Bearer ' + CRON_SECRET;
  const isManual = APP_SYNC_SECRET && manualKey === APP_SYNC_SECRET;
  if (CRON_SECRET && !isCron && !isManual) { res.status(401).json({ error: 'unauthorized' }); return; }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) { res.status(500).json({ error: 'Supabase env not configured' }); return; }
  if (!TELEGRAM_BOT_TOKEN) { res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' }); return; }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/budget_dashboard_state?id=eq.default&select=data`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY },
    });
    if (!r.ok) { res.status(502).json({ error: 'supabase-read-' + r.status }); return; }
    const rows = await r.json();
    const state = (rows[0] && rows[0].data) || { hist: [], budgets: [] };

    const report = buildWeeklyReport(state, Date.now());
    const msg = formatTelegram(report);

    const chatId = TELEGRAM_CHAT_ID || (state.telegram && state.telegram.chatId);
    if (!chatId) { res.status(500).json({ error: 'No TELEGRAM_CHAT_ID (env or synced config)' }); return; }

    const tg = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const tgres = await tg.json();
    if (!tgres.ok) { res.status(502).json({ error: 'telegram', detail: tgres }); return; }

    res.status(200).json({
      sent: true,
      seedAdvanced: report.totals.seedAdvanced,
      liquidated: report.totals.liquidated,
      outstanding: report.totals.outstanding,
      pending: report.pending.length,
      overdue: report.due.overdue.length,
      awaiting: report.totals.awaitingCount,
      overBudget: report.overBudget.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
