const axios = require('axios');
const OpenAI = require('openai');
const zlib = require('zlib');

/**
 * Helper to obtain an OpenAI / OpenRouter client instance
 */
function getAIClient() {
  const apiKey = (process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY || '').trim();
  if (!apiKey) return null;
  const isCustomBase = Boolean(process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY);
  const baseURL = isCustomBase ? 'https://openrouter.ai/api/v1' : undefined;
  return new OpenAI({ apiKey, baseURL });
}

/**
 * Transcribes an incoming WhatsApp audio message / voice note into text.
 * Uses Deepgram Nova-2 REST API with multilingual / auto language detection.
 * Falls back to OpenAI Whisper if Deepgram is unavailable.
 *
 * @param {object} params
 * @param {object} params.provider - WhatsApp provider (CloudApiProvider)
 * @param {object} params.media - message.media { providerMediaId, mime }
 * @param {object} [params.log] - WhatsAppAutomationLogService logger
 * @returns {Promise<{ success: boolean, transcript: string, duration?: number }>}
 */
async function transcribeAudioMedia({ provider, media, log }) {
  if (!media || !media.providerMediaId) {
    return { success: false, transcript: '[Voice note: missing media reference]' };
  }

  let buffer;
  let mime = media.mime || 'audio/ogg';

  try {
    const downloaded = await provider.downloadMedia(media);
    buffer = downloaded.buffer;
    if (downloaded.mime) mime = downloaded.mime;
  } catch (err) {
    if (log) await log.warn?.('media', 'download_failed', `Failed to download audio: ${err.message}`, { error: err.message });
    return { success: false, transcript: '[Voice note: audio download failed]' };
  }

  // 1. Try Deepgram Nova-2 (primary STT)
  const deepgramKey = (process.env.DEEPGRAM_API_KEY || '').trim();
  if (deepgramKey) {
    try {
      // Nova-2 with smart_format and detect_language for Indian & global English/Hindi/regional languages
      const url = 'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&detect_language=true';
      const cleanMime = mime.split(';')[0].trim() || 'audio/ogg';
      const res = await axios.post(url, buffer, {
        headers: {
          Authorization: `Token ${deepgramKey}`,
          'Content-Type': cleanMime,
        },
        timeout: 45000,
      });

      const alt = res.data?.results?.channels?.[0]?.alternatives?.[0];
      const transcript = alt?.transcript?.trim();
      const duration = res.data?.metadata?.duration;

      if (transcript) {
        return { success: true, transcript, duration, provider: 'deepgram' };
      }
      return { success: true, transcript: '[Voice note with no audible speech]', duration, provider: 'deepgram' };
    } catch (dgErr) {
      console.warn('[mediaProcessor] Deepgram transcription failed, checking fallbacks:', dgErr.response?.data || dgErr.message);
    }
  }

  // 2. Fallback: OpenAI Whisper if OPENAI_API_KEY is available
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey });
      const { toFile } = require('openai');
      const file = await toFile(buffer, 'audio.ogg', { type: mime });
      const transcription = await client.audio.transcriptions.create({
        file,
        model: 'whisper-1',
      });
      const transcript = transcription.text?.trim();
      if (transcript) {
        return { success: true, transcript, provider: 'whisper' };
      }
    } catch (whErr) {
      console.warn('[mediaProcessor] Whisper fallback failed:', whErr.message);
    }
  }

  return { success: false, transcript: '[Voice note received, could not transcribe audio]' };
}

/**
 * Analyzes an incoming WhatsApp image (e.g. electricity bill, rooftop photo, solar equipment, meter).
 * Uses OpenAI / OpenRouter vision models (e.g. gpt-4o-mini).
 *
 * @param {object} params
 * @param {object} params.provider - WhatsApp provider
 * @param {object} params.media - message.media { providerMediaId, mime }
 * @param {string} [params.caption] - Customer caption sent with image
 * @param {object} [params.automation] - Automation metadata
 * @param {object} [params.log] - WhatsAppAutomationLogService logger
 * @returns {Promise<{ success: boolean, summary: string, promptForLLM: string, logText: string }>}
 */
async function analyzeImageMedia({ provider, media, caption = '', automation = null, log = null }) {
  if (!media || !media.providerMediaId) {
    return {
      success: false,
      summary: 'Image missing media reference',
      promptForLLM: caption ? `[Customer sent an image with caption: "${caption}"]` : '[Customer sent an image]',
      logText: caption ? `📷 [Image]: Caption: "${caption}"` : '📷 [Image received]',
    };
  }

  let buffer;
  let mime = media.mime || 'image/jpeg';

  try {
    const downloaded = await provider.downloadMedia(media);
    buffer = downloaded.buffer;
    if (downloaded.mime) mime = downloaded.mime;
  } catch (err) {
    if (log) await log.warn?.('media', 'download_failed', `Failed to download image: ${err.message}`, { error: err.message });
    return {
      success: false,
      summary: 'Failed to download image',
      promptForLLM: caption ? `[Customer sent an image with caption: "${caption}" (failed to download)]` : '[Customer sent an image (failed to download)]',
      logText: '📷 [Image]: Download failed',
    };
  }

  const client = getAIClient();
  if (!client) {
    const fallbackText = caption ? `[Customer sent an image with caption: "${caption}"]` : '[Customer sent an image]';
    return {
      success: false,
      summary: 'AI vision client not configured',
      promptForLLM: fallbackText,
      logText: caption ? `📷 [Image]: Caption: "${caption}"` : '📷 [Image received]',
    };
  }

  try {
    const model = process.env.WA_VISION_MODEL || 'openai/gpt-4o-mini';
    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;

    const systemPrompt = `You are an expert visual document and photo analyzer for a WhatsApp business assistant.
Business Context: ${automation?.name || 'Customer Service'} (${automation?.industry || 'Solar & Electrical Services'}).
Your job is to thoroughly inspect images sent by customers (such as electricity bills, rooftops, solar panels, inverters, meters, error codes, quotation documents, or inquiries).

Provide a structured, accurate analysis in 2-4 sentences:
1. Category: Identify what the image is (e.g. Electricity Bill, Rooftop/Site, Inverter/Meter Reading, Equipment Defect, Quotation, or Other).
2. Key Extracted Data:
   - If Electricity Bill: Consumer/CA number, consumer name, units consumed (kWh), total amount due (₹), sanctioned load, billing date/provider (e.g. MSEDCL, Tata Power).
   - If Rooftop/Site: Roof type (RCC concrete, tin shed, tiles), usable shadow-free area, solar panel suitability.
   - If Inverter/Meter/Equipment: Model/brand, current reading, error codes or LED status.
   - If Other: Main visible text and subject.
3. Summary & Recommended Action: Concise synthesis that the conversational assistant can use to answer the customer and execute relevant tools (e.g. book survey, calculate solar savings).`;

    const userPrompt = caption
      ? `The customer sent this image with the caption: "${caption}". Please analyze the image, extract all key details and numbers, and explain what the customer is asking.`
      : `The customer sent this image. Please analyze what is shown, extract any text, numbers, or details (like electricity bill metrics, roof structure, or equipment readings), and summarize it clearly.`;

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 450,
      temperature: 0.2,
    });

    const analysis = response.choices?.[0]?.message?.content?.trim() || 'Visual content detected.';

    const promptForLLM = caption
      ? `[Customer sent an image. Visual Analysis: ${analysis}]\nCustomer caption: "${caption}"`
      : `[Customer sent an image. Visual Analysis: ${analysis}]`;

    const logText = `📷 [Image Analyzed]: ${analysis}${caption ? ` (Caption: "${caption}")` : ''}`;

    return {
      success: true,
      summary: analysis,
      promptForLLM,
      logText,
    };
  } catch (err) {
    console.error('[mediaProcessor] Vision analysis error:', err.message);
    const fallback = caption ? `[Customer sent an image with caption: "${caption}"]` : '[Customer sent an image]';
    return {
      success: false,
      summary: `Vision error: ${err.message}`,
      promptForLLM: fallback,
      logText: caption ? `📷 [Image]: Caption: "${caption}"` : '📷 [Image received]',
    };
  }
}

/**
 * Pure Node.js uncompressed / FlateDecode stream text extractor for PDF documents.
 * Extracts text from standard PDF streams without external native binaries.
 *
 * @param {Buffer} buffer - Raw PDF binary buffer
 * @returns {string} Extracted text
 */
function extractTextFromPdf(buffer) {
  try {
    const content = buffer.toString('binary');
    const textPieces = [];

    // Match all streams in the PDF: stream ... endstream
    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let match;

    while ((match = streamRegex.exec(content)) !== null) {
      let streamData = Buffer.from(match[1], 'binary');

      // Attempt to inflate FlateDecode stream
      try {
        streamData = zlib.inflateSync(streamData);
      } catch (_) {
        try {
          streamData = zlib.inflateRawSync(streamData);
        } catch (_) {
          // Keep raw if uncompressed
        }
      }

      const streamText = streamData.toString('latin1');

      // Extract text within BT (Begin Text) ... ET (End Text) blocks
      const btRegex = /BT([\s\S]*?)ET/g;
      let btMatch;
      while ((btMatch = btRegex.exec(streamText)) !== null) {
        const block = btMatch[1];

        // 1. (text) Tj
        const tjRegex = /\(([^)]*)\)\s*Tj/g;
        let tjMatch;
        while ((tjMatch = tjRegex.exec(block)) !== null) {
          if (tjMatch[1]) textPieces.push(cleanPdfString(tjMatch[1]));
        }

        // 2. [(text) 10 (more)] TJ
        const tjArrRegex = /\[([^\]]*)\]\s*TJ/g;
        let arrMatch;
        while ((arrMatch = tjArrRegex.exec(block)) !== null) {
          const inner = arrMatch[1];
          const innerTj = /\(([^)]*)\)/g;
          let part;
          const lineParts = [];
          while ((part = innerTj.exec(inner)) !== null) {
            lineParts.push(cleanPdfString(part[1]));
          }
          if (lineParts.length) textPieces.push(lineParts.join(''));
        }

        // 3. ' and " operators
        const quoteRegex = /\(([^)]*)\)\s*['"]/g;
        let qMatch;
        while ((qMatch = quoteRegex.exec(block)) !== null) {
          if (qMatch[1]) textPieces.push(cleanPdfString(qMatch[1]));
        }
      }
    }

    const combined = textPieces.join(' ').replace(/\s+/g, ' ').trim();
    return combined;
  } catch (err) {
    console.error('[mediaProcessor] PDF text extraction error:', err.message);
    return '';
  }
}

function cleanPdfString(str) {
  return str
    .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\(.)/g, '$1');
}

/**
 * Analyzes an incoming document (PDF, electricity bill document, quotation).
 *
 * @param {object} params
 * @param {object} params.provider
 * @param {object} params.media
 * @param {string} [params.filename]
 * @param {string} [params.caption]
 * @param {object} [params.automation]
 * @param {object} [params.log]
 * @returns {Promise<{ success: boolean, extractedText: string, promptForLLM: string, logText: string }>}
 */
async function analyzeDocumentMedia({ provider, media, filename = '', caption = '', automation = null, log = null }) {
  const docName = filename || media?.filename || 'document.pdf';

  if (!media || !media.providerMediaId) {
    return {
      success: false,
      extractedText: '',
      promptForLLM: caption ? `[Customer sent a document "${docName}" with caption: "${caption}"]` : `[Customer sent a document "${docName}"]`,
      logText: `📄 [Document: ${docName}]${caption ? ` (Caption: "${caption}")` : ''}`,
    };
  }

  let buffer;
  let mime = media.mime || 'application/pdf';

  try {
    const downloaded = await provider.downloadMedia(media);
    buffer = downloaded.buffer;
    if (downloaded.mime) mime = downloaded.mime;
  } catch (err) {
    if (log) await log.warn?.('media', 'download_failed', `Failed to download document: ${err.message}`, { error: err.message });
    return {
      success: false,
      extractedText: '',
      promptForLLM: caption ? `[Customer sent a document "${docName}" with caption: "${caption}" (download failed)]` : `[Customer sent a document "${docName}" (download failed)]`,
      logText: `📄 [Document: ${docName}] Download failed`,
    };
  }

  let extracted = '';
  if (mime === 'application/pdf' || docName.toLowerCase().endsWith('.pdf')) {
    extracted = extractTextFromPdf(buffer);
  } else if (mime.startsWith('text/')) {
    extracted = buffer.toString('utf8').trim();
  }

  if (extracted && extracted.length > 20) {
    // Truncate cleanly if document is huge
    const snippet = extracted.length > 3500 ? `${extracted.slice(0, 3500)}... [truncated]` : extracted;
    const promptForLLM = `[Customer shared a document: "${docName}"]. Extracted Document Text:\n"""\n${snippet}\n"""\n${caption ? `Customer message: "${caption}"` : 'Please analyze the document and respond helpfully to the customer.'}`;
    const logText = `📄 [Document Analyzed: "${docName}"]: Extracted ${extracted.length} characters of text.`;

    return {
      success: true,
      extractedText: extracted,
      promptForLLM,
      logText,
    };
  }

  // Scanned or non-extractable document
  const promptForLLM = `[Customer shared a document: "${docName}". Note: The document contains scanned pages/images with no plain extractable text. Please acknowledge receipt and ask the customer what details are on the document or if they can share a photo.]\n${caption ? `Customer message: "${caption}"` : ''}`;
  const logText = `📄 [Document: "${docName}"]: Attachment received (scanned/raster file).`;

  return {
    success: true,
    extractedText: '',
    promptForLLM,
    logText,
  };
}

/**
 * Top-level inbound media handler.
 * Dispatches audio, image, and document messages to their respective processors.
 *
 * @param {object} params
 * @param {object} params.provider - WhatsApp provider (CloudApiProvider)
 * @param {object} params.message - Inbound message object
 * @param {object} params.automation - Automation configuration
 * @param {object} [params.log] - Logger instance
 * @returns {Promise<{ userUtterance: string, logText: string, metadata?: object }>}
 */
async function processInboundMedia({ provider, message, automation, log }) {
  const type = message.type;
  const caption = message.media?.caption || message.caption || '';
  const filename = message.media?.filename || '';

  if (type === 'audio') {
    const result = await transcribeAudioMedia({ provider, media: message.media, log });
    const userUtterance = result.transcript;
    const logText = result.success
      ? `🎙️ [Voice Note Transcribed]: "${result.transcript}"`
      : `🎙️ [Voice Note]: ${result.transcript}`;
    return {
      userUtterance,
      logText,
      metadata: { duration: result.duration, provider: result.provider, success: result.success },
    };
  }

  if (type === 'image') {
    const result = await analyzeImageMedia({ provider, media: message.media, caption, automation, log });
    return {
      userUtterance: result.promptForLLM,
      logText: result.logText,
      metadata: { summary: result.summary, success: result.success },
    };
  }

  if (type === 'document') {
    const result = await analyzeDocumentMedia({ provider, media: message.media, filename, caption, automation, log });
    return {
      userUtterance: result.promptForLLM,
      logText: result.logText,
      metadata: { extractedLength: result.extractedText?.length || 0, success: result.success },
    };
  }

  if (type === 'video') {
    const userUtterance = caption
      ? `[Customer sent a video with caption: "${caption}"]`
      : '[Customer sent a video]';
    return {
      userUtterance,
      logText: caption ? `🎥 [Video]: Caption: "${caption}"` : '🎥 [Video received]',
      metadata: { success: true },
    };
  }

  return null;
}

module.exports = {
  getAIClient,
  transcribeAudioMedia,
  analyzeImageMedia,
  extractTextFromPdf,
  analyzeDocumentMedia,
  processInboundMedia,
};
