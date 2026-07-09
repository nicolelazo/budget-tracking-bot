/* POST /api/save-state
   The browser dashboard pushes its localStorage snapshot here on every change.
   Stored in Supabase using the service_role key (server-only) so the weekly cron
   can read it without a browser open. The browser never holds a Supabase key.

   Required env vars (set in Vercel → Project → Settings → Environment Variables):
     SUPABASE_URL          e.g. https://xlprsjxcxcrdxqbthtpk.supabase.co
     SUPABASE_SERVICE_KEY  the service_role key (Supabase → Settings → API)
   Optional:
     APP_SYNC_SECRET       if set, the client must send the same value as x-sync-key
*/
module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).json({ error: 'Supabase env not configured' }); return; }

  const guard = process.env.APP_SYNC_SECRET;
  if (guard && req.headers['x-sync-key'] !== guard) { res.status(401).json({ error: 'bad sync key' }); return; }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const snapshot = {
      hist: Array.isArray(body.hist) ? body.hist : [],
      budgets: Array.isArray(body.budgets) ? body.budgets : [],
      telegram: body.telegram || {},
    };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/budget_dashboard_state`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify([{ id: 'default', data: snapshot, updated_at: new Date().toISOString() }]),
    });
    if (!r.ok) {
      const t = await r.text();
      res.status(502).json({ error: 'supabase-' + r.status, detail: t.slice(0, 300) });
      return;
    }
    res.status(200).json({ ok: true, entries: snapshot.hist.length });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
