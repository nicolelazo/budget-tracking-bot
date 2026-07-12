/* GET /api/load-state
   Returns the saved dashboard snapshot from Supabase so the browser can restore
   everything (history, budgets, chapter setup, Gmail settings) when the app is
   opened on any device — no manual re-entry. Read-only; uses the service_role key
   server-side so the browser never holds a Supabase key.

   Required env vars (same ones the weekly cron already uses):
     SUPABASE_URL          e.g. https://xlprsjxcxcrdxqbthtpk.supabase.co
     SUPABASE_SERVICE_KEY  the service_role key (Supabase → Settings → API)
   Optional:
     APP_SYNC_SECRET       if set, the client must send the same value as x-sync-key
                           (mirrors /api/save-state; leave unset for open browser access)

   Response: { ok:true, data: <snapshot|null>, updated_at: <iso|null> }
   `data` is null when nothing has been saved yet (fresh workspace).
*/
module.exports = async (req, res) => {
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'Supabase env not configured' }); return; }

  const guard = process.env.APP_SYNC_SECRET;
  if (guard && req.headers['x-sync-key'] !== guard) { res.status(401).json({ error: 'bad sync key' }); return; }

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/budget_dashboard_state?id=eq.default&select=data,updated_at`, {
      headers: { apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY },
    });
    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: 'supabase-' + r.status, detail: t.slice(0, 300) });
      return;
    }
    const rows = await r.json();
    const row = rows[0];
    res.status(200).json({
      ok: true,
      data: (row && row.data) || null,
      updated_at: (row && row.updated_at) || null,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
