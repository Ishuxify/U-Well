// server.js - Updated to fix null response and crisis trigger
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import fetch from 'node-fetch';
import multer from 'multer';
import FormData from 'form-data';

dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '2mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const fallbackHelplines = {
  en: [{ name: 'AASRA', phone: '+91-9820466726' }, { name: 'NIMHANS', phone: '080-46110007' }],
  hi: [{ name: 'AASRA', phone: '+91-9820466726' }, { name: 'निमहांस', phone: '080-46110007' }]
};

// Helpers (unchanged)
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function safeTrim(s, len = 2000) { return (String(s || '').length > len) ? String(s).slice(0, len) + '…' : s; }
function parseRetryDelaySeconds(providerJsonString) {
  if (!providerJsonString) return null;
  try {
    const j = JSON.parse(providerJsonString);
    const details = j?.error?.details;
    if (Array.isArray(details)) for (const d of details) {
      if (d['@type']?.includes('RetryInfo') && d.retryDelay) {
        const m = String(d.retryDelay).match(/(\d+)(?:\.\d+)?s/);
        if (m) return Math.min(60, parseInt(m[1], 10));
      }
    }
  } catch (e) {}
  const m = String(providerJsonString).match(/"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"/);
  if (m) return Math.min(60, parseInt(m[1], 10));
  const m2 = String(providerJsonString).match(/Retry-After[:=]\s*(\d+)/i);
  if (m2) return Math.min(60, parseInt(m2[1], 10));
  return null;
}
function stripCodeFences(s) {
  if (!s || typeof s !== 'string') return s || '';
  let out = s.trim();
  if (/^```[\s\S]*```$/.test(out)) out = out.replace(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/, '$1');
  out = out.replace(/^`(.*)`$/s, '$1');
  return out.trim();
}
function parseJsonSafe(s) {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch (e) { console.error('JSON parse failed:', e); return null; }
}
function extractReplyFromProviderObj(j) {
  if (!j) return null;
  const safeText = (v) => (typeof v === 'string' ? v : '');
  // Gemini
  if (j?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
    const text = stripCodeFences(j.response.candidates[0].content.parts[0].text);
    const parsed = parseJsonSafe(text);
    if (parsed) return safeText(parsed.text || text);
    return text;
  }
  // OpenAI
  if (Array.isArray(j.choices) && j.choices[0]?.message?.content) {
    return stripCodeFences(j.choices[0].message.content);
  }
  return null;
}

// /api/chat (fixed for null response and crisis trigger)
app.post('/api/chat', async (req, res) => {
  const { message, lang = 'en', history = [], sessionId } = req.body;
  const maxAttempts = 3;
  let lastProviderRaw = '';

  const systemPrompt = `
    You are U-Well, a compassionate and empathetic AI companion for mental wellness in ${lang === 'hi' ? 'Hindi' : 'English'}.
    Key Behaviors:
    - Respond in a humanized, counselor-like tone: warm, empathetic, non-judgmental, and supportive.
    - Engage in normal conversation first: Listen actively to the user's concerns, acknowledge their feelings (e.g., "That sounds tough—tell me more"), and analyze what they're sharing without jumping to suggestions.
    - Cross-question like a psychologist: Once the user has shared, ask thoughtful, open-ended questions to explore their feelings (e.g., "What do you think is contributing to that?").
    - Help overcome problems: Summarize their issues empathetically, then suggest coping strategies or insights based on their input.
    - Suggest relaxing techniques only after conversation flows naturally and with permission: If the user seems ready (e.g., after discussing their problem), ask if they'd like to try a technique (e.g., "Would you like to try a simple breathing exercise to help with that?").
    - If user requests relaxing technique: Respond with {type: 'reply', text: '...', request_photo: true} to request a photo for posture analysis, e.g., "Sure, to make this more personalized, could you share a quick photo of your current posture? It will help me tailor the exercise better."
    - All suggestions on permission: Never push—always ask first (e.g., "Would you be open to a quick mood assessment?").
    - Suggest psychological tests like job satisfaction or aptitude test based on user's chats or problems: After understanding their concerns (e.g., career-related), ask if they'd like to take a simple test (e.g., "Based on what you've shared about work, would you be interested in a quick job satisfaction assessment?").
    - Detect crisis for explicit distress (e.g., "suicide", "hopeless"): Respond with JSON: {type: 'crisis', text: '...', helplines: [...]}.
    - Use chat history for context and continuity.
    - For Hindi, respond naturally in Hindi.
    - Always return JSON: {type: 'reply'|'crisis', text: '...', helplines: [...] if crisis, request_photo: true/false}.
    Examples:
    - Input: "Hi" → {type: 'reply', text: 'Hey there! How's everything going for you today? I'm here to listen.', request_photo: false}
    - Input: "I’m stressed" → {type: 'reply', text: 'I’m really sorry to hear you're feeling stressed. Can you tell me a bit more about what's been going on?', request_photo: false}
    - Input: "Yes, tell me a relaxing technique" → {type: 'reply', text: 'Sure, before we dive into that, would you mind sharing a quick photo of your current posture? It will help me tailor the exercise better.', request_photo: true}
    - Input: "I hate my job" → {type: 'reply', text: 'That sounds frustrating. Tell me more about what's making it tough. Would you like to try a quick job satisfaction test to explore this?', request_photo: false}
    - Input: "I feel hopeless" → {type: 'crisis', text: 'You’re not alone, and I’m here to help. Please reach out to someone who can support you.', helplines: [...]}
  `;

  const provider = process.env.LLM_PROVIDER || 'google';
  let client;
  if (provider === 'google' && process.env.GOOGLE_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    client = genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL || 'gemini-1.5-flash' });
  } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } else {
    return res.status(500).json({ error: 'Missing API credentials for selected provider' });
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let result;
      if (provider === 'google') {
        const fullPrompt = [systemPrompt, ...history.map(h => `${h.role}: ${h.parts?.[0]?.text || h.content}`), `User: ${message}`].join('\n');
        result = await client.generateContent(fullPrompt);
        lastProviderRaw = JSON.stringify(result?.response || {});
        console.log('[Server] Gemini raw response:', lastProviderRaw); // Debug
      } else {
        result = await client.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...history.map(h => ({ role: h.role, content: h.parts?.[0]?.text || h.content })), { role: 'user', content: message }]
        });
        lastProviderRaw = JSON.stringify(result);
      }

      const replyText = extractReplyFromProviderObj(result);
      if (!replyText || replyText.trim() === '') {
        console.error('[Server] Empty or null reply from provider:', lastProviderRaw);
        return res.json({ 
          type: 'reply', 
          text: lang === 'hi' 
            ? 'क्षमा करें, मैं अभी जवाब नहीं दे पाया। आप कैसा महसूस कर रहे हैं?' 
            : 'Sorry, I couldn’t generate a response. How are you feeling?',
          request_photo: false
        });
      }

      const parsed = parseJsonSafe(replyText);
      if (parsed?.type === 'crisis') {
        return res.json({ type: 'crisis', text: parsed.text, helplines: parsed.helplines || fallbackHelplines[lang] });
      }

      // Self-harm check (on user input, not reply)
      const lower = message.toLowerCase();
      const triggers = ['suicide', 'kill myself', 'end my life', 'hopeless', 'want to die'];
      if (triggers.some(t => lower.includes(t))) {
        return res.json({ 
          type: 'crisis', 
          text: lang === 'hi' 
            ? 'आप अकेले नहीं हैं, और मैं आपकी मदद के लिए हूँ। कृपया किसी से संपर्क करें जो आपका समर्थन कर सके।' 
            : 'You’re not alone, and I’m here to help. Please reach out to someone who can support you.', 
          helplines: fallbackHelplines[lang] 
        });
      }

      return res.json({ type: 'reply', text: replyText.trim(), request_photo: parsed?.request_photo || false });

    } catch (err) {
      console.error('[Server] Error:', err.message, 'Raw:', lastProviderRaw);
      if (attempt >= maxAttempts) {
        return res.json({ 
          type: 'reply', 
          text: lang === 'hi' 
            ? 'क्षमा करें, सर्वर में त्रुटि हुई। कृपया फिर से कोशिश करें।' 
            : 'Sorry, a server error occurred. Please try again.',
          request_photo: false
        });
      }
      const backoff = Math.min(1000 * 2 ** (attempt - 1), 60000);
      await sleep(backoff);
    }
  }
  res.status(429).json({ error: 'Quota exceeded' });
});

// /api/analyze (Python proxy for images)
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const { lang = 'en', sessionId } = req.body;
  const pythonUrl = process.env.PYTHON_SERVER_URL || 'http://localhost:8000';
  try {
    const form = new FormData();
    form.append('image', req.file.buffer, { filename: req.file.originalname, contentType: req.file.mimetype });
    form.append('lang', lang);
    form.append('sessionId', sessionId);
    const pyRes = await fetch(`${pythonUrl}/analyze_posture`, { method: 'POST', body: form });
    if (!pyRes.ok) {
      console.error('[Server] Python server error:', pyRes.status, await pyRes.text().catch(() => 'No response body'));
      throw new Error(pyRes.statusText);
    }
    const data = await pyRes.json();
    res.json({ type: 'analysis', ...data });
  } catch (err) {
    console.error('[Server] Python error:', err.message);
    res.json({ 
      type: 'analysis', 
      summary: lang === 'hi' ? 'डेमो: अच्छा पोस्टर।' : 'Demo: Good posture.', 
      recommendations: lang === 'hi' ? ['सीधे रहें!'] : ['Keep going!'], 
      notes: 'Python server offline or unreachable.'
    });
  }
});

// /api/posture (for landmarks JSON)
app.post('/api/posture', (req, res) => {
  const { landmarks } = req.body;
  if (!landmarks) return res.status(400).json({ error: 'No landmarks' });
  const score = Math.random() > 0.5 ? 'Good' : 'Adjust shoulders';
  res.json({ message: `Posture score: ${score}`, recommendations: ['Straighten up'] });
});

// /api/insights (for journal)
app.post('/api/insights', (req, res) => {
  const { entries } = req.body;
  const insights = ['Balanced moods—great!', 'More positives ahead.'];
  res.json({ insight: insights[Math.floor(Math.random() * insights.length)] });
});

// Static serve
app.use(express.static('.'));

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));