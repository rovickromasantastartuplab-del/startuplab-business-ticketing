import express from 'express';
import { runReservationCleanup } from '../utils/reservationCleanup.js';

const router = express.Router();

// GET /api/cron/cleanup
// Called by Vercel Cron (vercel.json) or an external pinger (e.g. cron-job.org
// on plans without minute-level cron). Guarded by CRON_SECRET so it can't be
// triggered by anyone who finds the URL.
router.get('/cleanup', async (req, res) => {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${expected}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const result = await runReservationCleanup();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Cleanup failed' });
  }
});

export default router;
