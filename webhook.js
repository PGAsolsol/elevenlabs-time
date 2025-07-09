import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const SHARED_SECRET = process.env.ELEVENLABS_HMAC_SECRET;
  try {
    const rawBody = await buffer(req);

    const signatureHeader = req.headers['elevenlabs-signature'];
    if (!signatureHeader) return res.status(400).send('Missing signature');

    const [tPart, v1Part] = signatureHeader.split(',');
    const timestamp = tPart.split('=')[1];
    const signature = v1Part.split('=')[1];

    const payload = `${timestamp}.${rawBody.toString()}`;
    const expectedSignature = crypto
      .createHmac('sha256', SHARED_SECRET)
      .update(payload)
      .digest('hex');

    const valid = crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'utf8'),
      Buffer.from(signature, 'utf8')
    );

    if (!valid) return res.status(401).send('Invalid signature');

    const data = JSON.parse(rawBody.toString());

    if (data.type === 'post_call_transcription') {
      const transcription = data.data;

      const { error } = await supabase.from('transcriptions').insert({
        conversation_id: transcription.conversation_id,
        agent_id: transcription.agent_id,
        status: transcription.status,
        summary: transcription.analysis.transcript_summary,
        call_duration: transcription.metadata.call_duration_secs,
      });

      if (error) {
        console.error('❌ Supabase insert error:', error);
        return res.status(500).send('Database error');
      }

      console.log('✅ Data saved to Supabase');
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).send('Server error');
  }
}
