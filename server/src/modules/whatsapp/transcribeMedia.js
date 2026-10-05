/**
 * transcribeMedia
 *
 * Factory that returns a server-side executor for the transcribe_media tool.
 * Branches on MIME type:
 *   - image/*  -> OpenAI vision (gpt-4o-mini) for captioning
 *   - audio/*  -> Deepgram via STTService (or whisper)
 *   - else     -> returns a stub description
 *
 * Provider/auth is shared with the rest of the system (OPENAI_API_KEY / DEEPGRAM_API_KEY).
 */

const axios = require('axios');
const OpenAI = require('openai');

function _getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const baseURL = process.env.OPENAI_API_KEY ? undefined : 'https://openrouter.ai/api/v1';
  return new OpenAI({ apiKey, baseURL });
}

async function _describeImageWithVision({ buffer, mime, caption, client }) {
  const model = process.env.WA_VISION_MODEL || 'gpt-4o-mini';
  const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: caption
            ? `The user sent this image with the caption: "${caption}". Briefly describe the image and answer any question implied by the caption.`
            : 'Briefly describe what is in this image in 1-2 sentences.' },
        { type: 'image_url', image_url: { url: dataUrl } },
      ],
    },
  ];
  const res = await client.chat.completions.create({ model, messages, max_tokens: 300, temperature: 0.2 });
  return res.choices?.[0]?.message?.content || '[no description]';
}

async function _transcribeAudioWithDeepgram({ buffer, mime }) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY not set; cannot transcribe audio');
  const res = await axios.post(
    'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
    buffer,
    { headers: { Authorization: `Token ${apiKey}`, 'Content-Type': mime || 'audio/ogg' }, timeout: 60000 }
  );
  return res.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '[no transcript]';
}

function transcribeMedia({ provider, adapter, agentId }) {
  return async function transcribeMediaExecutor(args) {
    try {
      const mime = args.mime || 'application/octet-stream';
      const mediaRef = { url: args.mediaUrl, providerMediaId: args.providerMediaId, mime };

      if (!args.mediaUrl && !args.providerMediaId) {
        return { success: false, error: 'No media reference provided' };
      }

      const { buffer, mime: resolvedMime } = await provider.downloadMedia(mediaRef);
      const effectiveMime = resolvedMime || mime;

      if (effectiveMime.startsWith('image/')) {
        const client = _getOpenAI();
        if (!client) return { success: false, error: 'OPENAI_API_KEY not set; cannot describe image' };
        const description = await _describeImageWithVision({ buffer, mime: effectiveMime, caption: args.caption, client });
        return { success: true, kind: 'image', mime: effectiveMime, text: description };
      }

      if (effectiveMime.startsWith('audio/')) {
        const text = await _transcribeAudioWithDeepgram({ buffer, mime: effectiveMime });
        return { success: true, kind: 'audio', mime: effectiveMime, text };
      }

      if (effectiveMime === 'application/pdf' || effectiveMime.startsWith('text/')) {
        // Best-effort: return a note; deeper parsing deferred
        return { success: true, kind: 'document', mime: effectiveMime, text: `[User sent a ${effectiveMime} document${args.caption ? ` with caption: ${args.caption}` : ''}. Treat as a generic attachment.]`, bytes: buffer.length };
      }

      return { success: true, kind: 'other', mime: effectiveMime, text: `[User sent a ${effectiveMime} file. Acknowledge and ask what they want to do with it.]` };
    } catch (err) {
      console.error('[transcribeMedia] error:', err);
      return { success: false, error: err.message };
    }
  };
}

module.exports = { transcribeMedia };
