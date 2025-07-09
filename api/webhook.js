// /api/webhook.js – Vercel handler se Supabase uložením a kontrolou podpisu + výpočet délky hovoru

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WEBHOOK_SECRET = process.env.ELEVENLABS_HMAC_SECRET;

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const signature = req.headers['x-elevenlabs-signature'];
    const bodyRaw = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET).update(bodyRaw).digest('hex');

    if (signature !== hmac) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, conversation_id } = req.body;

    if (event === 'conversation_started') {
      const timestamp = new Date().toISOString();

      const { error } = await supabase
        .from('conversation_times')
        .insert([{ conversation_id, start_time: timestamp }]);

      if (error) {
        console.error('❌ Chyba při ukládání do Supabase:', error);
        return res.status(500).json({ error: 'Supabase insert failed' });
      }

      console.log(`✅ Hovor ${conversation_id} začal v ${timestamp}`);
    }

    return res.status(200).json({ status: 'ok' });
  }

  if (req.method === 'GET') {
    const { conversation_id } = req.query;

    if (!conversation_id) {
      return res.status(400).json({ error: 'Missing conversation_id' });
    }

    const { data, error } = await supabase
      .from('conversation_times')
      .select('start_time')
      .eq('conversation_id', conversation_id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Start time not found' });
    }

    const startTime = new Date(data.start_time);
    const now = new Date();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);

    return res.status(200).json({ elapsed: elapsedSeconds });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
