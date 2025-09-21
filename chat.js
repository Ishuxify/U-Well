// chat.js - Final merged U-Well Frontend (cleaned, merged features)
// Natural conversation, posture analysis, psychological tests, voice commands
// Merged both versions you provided; no functionality changes beyond fixes and safety checks.

// --- API base ---
const apiBase = (location.hostname === 'localhost') ? 'http://localhost:8787' : '';

// --- Session management ---
const sessionKey = 'uwell_chat_session';
let sessionId = localStorage.getItem(sessionKey);
if (!sessionId) {
  sessionId = 'sess_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
  localStorage.setItem(sessionKey, sessionId);
}

// --- State management ---
const chatHistory = [];
let exerciseState = null; // { analysis: {...}, currentStep: 0, totalSteps: N, type?: 'posture'|'psychological' }
let testState = null; // { questions: [...], currentQuestion: 0, responses: [], type?: 'job_satisfaction'|'aptitude' }
let photoRequestActive = false; // Track if AI requested photo
let selectedLang = localStorage.getItem('uwell_lang') || 'en'; // Default language

// runtime globals
let cachedVoices = [];
let autoSpeak = true;
let recognizing = false;
let videoStream = null;

// --- DOM elements ---
const msgContainer = document.getElementById('chat-messages');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const micBtn = document.getElementById('mic-btn');
const ttsToggle = document.getElementById('tts-toggle');
const langSelect = document.getElementById('lang-select');
const crisisBox = document.getElementById('crisis-box');
const crisisNumbers = document.getElementById('crisis-numbers');
const callHelpline = document.getElementById('call-helpline');

// Options modal elements
const optionsBtn = document.getElementById('options-btn');
const optionsModal = document.getElementById('options-modal');
const closeOptionsModal = document.getElementById('close-options-modal');
const cameraBtn = document.getElementById('camera-btn');
const uploadBtn = document.getElementById('upload-btn');
const fileInput = document.getElementById('file-input');

// Camera modal elements
const cameraModal = document.getElementById('camera-modal');
const closeCameraModal = document.getElementById('close-camera-modal');
const webcamEl = document.getElementById('webcam');
const captureBtn = document.getElementById('capture-btn');
const cameraStatus = document.getElementById('camera-status');

// --- Initialize language ---
if (langSelect) {
  langSelect.value = selectedLang;
  langSelect.addEventListener('change', (e) => {
    selectedLang = e.target.value;
    localStorage.setItem('uwell_lang', selectedLang);
    updateUIElements();
  });
}

// --- Utility functions ---
function escapeHtml(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
function markdownToHtml(md) {
  if (typeof md !== 'string') return '';
  let html = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.*?)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>');
  html = html.replace(/\n/g, '<br>');
  return html;
}


function appendUserBubble(text) {
  if (!msgContainer) return;
  const el = document.createElement('div');
  el.className = 'text-right mb-4';
  el.innerHTML = `<div class="inline-block bg-teal-100 text-teal-800 p-4 rounded-2xl max-w-[80%] shadow-sm">${escapeHtml(text)}</div>`;
  msgContainer.appendChild(el);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

function appendBotBubble(text) {
  if (!msgContainer) return;
  console.log('[chat.js] Bot:', (text || '').substring(0, 100) + '...');
  const el = document.createElement('div');
  el.className = 'text-left mb-4';
  el.innerHTML = `<div class="inline-block bg-gray-100 text-gray-800 p-4 rounded-2xl max-w-[80%] shadow-sm">${markdownToHtml(escapeHtml(String(text || '')))}</div>`;
  msgContainer.appendChild(el);
  msgContainer.scrollTop = msgContainer.scrollHeight;
}

// --- Crisis handling ---
function showCrisis(helplines) {
  console.log('[chat.js] Crisis mode - helplines:', helplines);
  if (!crisisNumbers || !crisisBox) return;
  crisisNumbers.innerHTML = (helplines || []).map(h =>
    `<div class="mb-2"><strong>${escapeHtml(h.name)}:</strong> <a href="tel:${escapeHtml(h.phone)}" class="text-blue-600 hover:underline">${escapeHtml(h.phone)}</a></div>`
  ).join('');
  if (helplines && helplines.length > 0 && callHelpline) {
    callHelpline.href = `tel:${helplines[0].phone}`;
    callHelpline.textContent = `📞 Call ${helplines[0].name}`;
  }
  crisisBox.classList.remove('hidden');
  crisisBox.scrollIntoView({ behavior: 'smooth' });
  const langCode = selectedLang === 'hi' ? 'hi-IN' : 'en-US';
  speakText(selectedLang === 'hi' ? 'आप ठीक हैं? मदद के लिए हेल्पलाइन पर कॉल करें।' : 'Are you okay? Please call the helpline for help.', langCode);
}

function hideCrisis() {
  if (!crisisBox) return;
  crisisBox.classList.add('hidden');
}

// --- TTS System ---
function loadVoices() {
  cachedVoices = window.speechSynthesis.getVoices() || [];
  if (!cachedVoices.length) {
    window.speechSynthesis.onvoiceschanged = () => {
      cachedVoices = window.speechSynthesis.getVoices() || [];
      console.log('[chat.js] Voices loaded:', cachedVoices.length);
    };
  }
}
loadVoices();

function speakText(text, lang = 'en-US') {
  if (!('speechSynthesis' in window) || !autoSpeak) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    if (cachedVoices.length > 0) {
      const voice = cachedVoices.find(v => v.lang && v.lang.startsWith(lang.split('-')[0])) || cachedVoices[0];
      if (voice) {
        utterance.voice = voice;
        console.log('[chat.js] Using voice:', voice.name);
      }
    }

    utterance.onend = () => console.log('[chat.js] TTS finished');
    utterance.onerror = (e) => console.warn('[chat.js] TTS error:', e);

    window.speechSynthesis.speak(utterance);
    console.log('[chat.js] Speaking:', (text || '').substring(0, 50) + '...');
  } catch (e) {
    console.error('[chat.js] TTS failed:', e);
  }
}

if (ttsToggle) {
  ttsToggle.addEventListener('click', () => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    autoSpeak = !autoSpeak;
    ttsToggle.textContent = autoSpeak ? '🔊' : '🔇';
    ttsToggle.className = autoSpeak ? 'text-green-500' : 'text-red-500';
  });
}

// --- Voice Recognition ---
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
if (!SpeechRecognitionAPI) {
  if (micBtn) {
    micBtn.textContent = '🎤 Unavailable';
    micBtn.disabled = true;
    micBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }
} else {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = selectedLang === 'hi' ? 'hi-IN' : 'en-US';

  if (langSelect) {
    langSelect.value = selectedLang;
    langSelect.addEventListener('change', (e) => {
      selectedLang = e.target.value;
      localStorage.setItem('uwell_lang', selectedLang);
      recognition.lang = selectedLang === 'hi' ? 'hi-IN' : 'en-US';
      updateUIElements();
    });
  }

  recognition.onstart = () => {
    recognizing = true;
    if (micBtn) {
      micBtn.textContent = '🛑 Stop';
      micBtn.classList.add('bg-red-50');
    }
  };
  recognition.onend = () => {
    recognizing = false;
    if (micBtn) {
      micBtn.textContent = selectedLang === 'hi' ? '🎤 आवाज शुरू' : '🎤 Start voice';
      micBtn.classList.remove('bg-red-50');
    }
  };
  recognition.onerror = (e) => {
    console.error('[chat.js] Speech error:', e);
    recognizing = false;
    if (micBtn) micBtn.textContent = selectedLang === 'hi' ? '🎤 आवाज शुरू' : '🎤 Start voice';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results[i];
      if (r.isFinal) final += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (input) input.value = final || interim;
    if (final) {
      const cmd = final.trim().toLowerCase();
      if (typeof handleVoiceCommand === 'function' && handleVoiceCommand(cmd)) {
        if (input) input.value = '';
        return;
      }
      sendMessage(final);
      if (input) input.value = '';
    }
  };

  if (micBtn) {
    micBtn.addEventListener('click', () => {
      if (recognizing) {
        try { recognition.stop(); } catch (e) { console.warn('[chat.js] recognition stop error', e); }
        recognizing = false;
      } else {
        try { recognition.start(); } catch (e) { console.warn('[chat.js] Speech recognition error:', e); }
      }
    });
  }
}

// --- Update UI elements for language ---
function updateUIElements() {
  if (sendBtn) sendBtn.textContent = selectedLang === 'hi' ? 'भेजें' : 'Send';
  if (micBtn) micBtn.textContent = selectedLang === 'hi' ? '🎤 आवाज शुरू' : '🎤 Start voice';
  if (cameraStatus) cameraStatus.textContent = selectedLang === 'hi' ? 'कैमरा लोड हो रहा है...' : 'Camera is loading...';
}
updateUIElements();

// --- Options modal handling ---
if (optionsBtn) {
  optionsBtn.addEventListener('click', () => { if (optionsModal) optionsModal.classList.remove('hidden'); });
}
if (closeOptionsModal) {
  closeOptionsModal.addEventListener('click', () => { if (optionsModal) optionsModal.classList.add('hidden'); });
}
if (cameraBtn) cameraBtn.addEventListener('click', showCameraModalFromOptions);
if (uploadBtn) uploadBtn.addEventListener('click', () => fileInput && fileInput.click());
if (fileInput) fileInput.addEventListener('change', handleFileSelected);

// --- Camera modal functions ---
function showCameraModalFromOptions() {
  if (optionsModal) optionsModal.classList.add('hidden');
  if (cameraModal) {
    cameraModal.classList.remove('hidden');
    startCamera();
  }
}
if (closeCameraModal) {
  closeCameraModal.addEventListener('click', () => {
    if (cameraModal) cameraModal.classList.add('hidden');
    stopCamera();
  });
}

function startCamera() {
  if (cameraStatus) cameraStatus.textContent = selectedLang === 'hi' ? 'कैमरा लोड हो रहा है...' : 'Camera is loading...';
  const constraints = { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
  navigator.mediaDevices.getUserMedia(constraints)
    .then(stream => {
      videoStream = stream;
      if (webcamEl) webcamEl.srcObject = stream;
      if (cameraStatus) cameraStatus.textContent = selectedLang === 'hi' ? 'कैमरा तैयार है। पोज़िशन लें और Capture दबाएं।' : 'Camera ready. Position yourself and press Capture.';
    })
    .catch(err => {
      console.error('Camera error', err);
      if (cameraStatus) cameraStatus.textContent = selectedLang === 'hi' ? 'कैमरा एक्सेस नहीं हुआ। अपलोड आज़माएं।' : 'Unable to access camera. Try upload instead.';
    });
}

function stopCamera() {
  if (videoStream) {
    videoStream.getTracks().forEach(t => t.stop());
    videoStream = null;
    if (webcamEl) webcamEl.srcObject = null;
  }
}

function captureFrameAsBlob() {
  const video = webcamEl;
  if (!video || !video.videoWidth) return Promise.reject('No video');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

if (captureBtn) {
  captureBtn.addEventListener('click', async () => {
    captureBtn.disabled = true;
    captureBtn.textContent = selectedLang === 'hi' ? 'प्रोसेसिंग...' : 'Processing...';
    try {
      const blob = await captureFrameAsBlob();
      appendUserBubble(selectedLang === 'hi' ? '[फ़ोटो कैप्चर किया]' : '[Photo captured]');
      const result = await uploadImageForAnalysis(blob);
      if (cameraModal) cameraModal.classList.add('hidden');
      stopCamera();
      if (result) handleAnalysisResult(result);
    } catch (e) {
      console.error(e);
      appendBotBubble(selectedLang === 'hi' ? 'फ़ोटो कैप्चर विफल।' : 'Failed to capture photo.');
    } finally {
      captureBtn.disabled = false;
      captureBtn.textContent = selectedLang === 'hi' ? '📸 Capture' : '📸 Capture';
    }
  });
}

// --- File upload handler ---
function handleFileSelected(e) {
  const file = e.target?.files[0] || null;
  if (!file) return;
  appendUserBubble(selectedLang === 'hi' ? '[फ़ोटो अपलोड किया]' : '[Photo uploaded]');
  uploadImageForAnalysis(file).then(result => {
    if (result) handleAnalysisResult(result);
  }).catch(err => {
    console.error(err);
    appendBotBubble(selectedLang === 'hi' ? 'अपलोड विफल।' : 'Upload failed.');
  }).finally(() => { if (fileInput) fileInput.value = ''; });
}

// --- Upload to server for posture analysis ---
async function uploadImageForAnalysis(fileBlob) {
  appendBotBubble(selectedLang === 'hi' ? 'विश्लेषण के लिए फोटो अपलोड कर रहा हूँ...' : 'Uploading image for analysis...');
  const fd = new FormData();
  fd.append('image', fileBlob, 'photo.jpg');
  fd.append('sessionId', sessionId);
  fd.append('lang', selectedLang);
  try {
    const url = `${apiBase}/api/analyze`;
    const res = await fetch(url, { method: 'POST', body: fd });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      appendBotBubble(selectedLang === 'hi' ? `सर्वर त्रुटि: ${res.status}` : `Server error: ${res.status}`);
      return null;
    }
    const json = await res.json();
    console.log('[chat.js] Analysis response:', json);
    return json;
  } catch (err) {
    console.error(err);
    appendBotBubble(selectedLang === 'hi' ? 'नेटवर्क त्रुटि—दुबारा कोशिश करें।' : 'Network error — try again.');
    return null;
  }
}

// --- Handle analysis result (merged) ---
function handleAnalysisResult(result) {
  if (!result) {
    appendBotBubble(selectedLang === 'hi' ? 'विश्लेषण उपलब्ध नहीं है।' : 'Analysis not available.');
    return;
  }

  console.log('[chat.js] handleAnalysisResult:', result);

  // Build summary message
  const summaryText = (selectedLang === 'hi')
    ? `पोस्टर चिन्ह: ${escapeHtml(result.summary || result.posture || 'Unknown')}
स्कोर: ${escapeHtml(String(result.score || 'N/A'))}`
    : `Posture: ${escapeHtml(result.summary || result.posture || 'Unknown')}
Score: ${escapeHtml(String(result.score || 'N/A'))}`;

  appendBotBubble(summaryText);

  // Show notes if available
  if (result.notes) appendBotBubble(result.notes);

  // Handle recommendations array properly
  const recommendations = result.recommendations || [];
  if (Array.isArray(recommendations) && recommendations.length > 0) {
    exerciseState = { analysis: result, currentStep: 0, totalSteps: recommendations.length };
    console.log('[chat.js] Exercise state initialized:', exerciseState);
    renderCurrentExerciseStep();

    // Speak first step
    const firstStepText = formatStepText(recommendations[0], 1, recommendations.length);
    const langCode = selectedLang === 'hi' ? 'hi-IN' : 'en-US';
    const introText = selectedLang === 'hi' ? `मैं आपकी एक्सरसाइज़ शुरू कर रहा हूँ। पहला कदम: ${firstStepText}` : `Starting your exercise. First step: ${firstStepText}`;
    speakText(introText, langCode);
  } else {
    console.warn('[chat.js] No recommendations found in analysis');
    appendBotBubble(selectedLang === 'hi' ? 'विश्लेषण पूरा, लेकिन कोई सुझाव उपलब्ध नहीं।' : 'Analysis complete, but no recommendations available.');
    exerciseState = null;
  }

  // Add to chat history
  const textToStore = result.notes ? `${summaryText}
${result.notes}` : summaryText;
  chatHistory.push({ role: 'model', parts: [{ text: textToStore }] });
}

// Format step text with safe handling
function formatStepText(stepObj, idx, total) {
  if (!stepObj) return '';
  const stepNumber = selectedLang === 'hi' ? `कदम ${idx}/${total}` : `Step ${idx} of ${total}`;
  const stepTitle = (stepObj && typeof stepObj === 'object' && stepObj.title) ? `${escapeHtml(stepObj.title)}: ` : '';
  let stepDetail = '';
  if (stepObj && typeof stepObj === 'object') stepDetail = stepObj.detail || stepObj.text || JSON.stringify(stepObj);
  else stepDetail = String(stepObj);
  return `${stepNumber} - ${stepTitle}${escapeHtml(stepDetail)}`;
}

// Render current exercise step and controls
function renderCurrentExerciseStep() {
  if (!exerciseState || !msgContainer) return;
  const idx = exerciseState.currentStep;
  const total = exerciseState.totalSteps;
  const step = (exerciseState.analysis && exerciseState.analysis.recommendations) ? exerciseState.analysis.recommendations[idx] : null;

  if (!step) {
    console.error('[chat.js] Undefined step:', idx);
    appendBotBubble(selectedLang === 'hi' ? 'कदम उपलब्ध नहीं।' : 'Step not available.');
    return;
  }

  console.log('[chat.js] Rendering step:', idx + 1, step);

  // Step number
  const stepHeader = document.createElement('div');
  stepHeader.className = 'text-left mb-1 text-blue-600 font-medium';
  stepHeader.textContent = formatStepNumber(idx + 1, total);
  msgContainer.appendChild(stepHeader);

  // Step bubble
  const wrapper = document.createElement('div');
  wrapper.className = 'text-left mb-2';
  const title = (step && step.title) ? `<div class="font-semibold mb-1">${escapeHtml(step.title)}</div>` : '';
  const detailContent = (step && step.detail) ? escapeHtml(step.detail) : escapeHtml(typeof step === 'string' ? step : JSON.stringify(step));
  const detail = `<div class="text-sm mb-3">${detailContent}</div>`;
  wrapper.innerHTML = `<div class="inline-block bg-gray-100 text-gray-800 p-3 rounded-2xl max-w-[85%]">${title}${detail}</div>`;
  msgContainer.appendChild(wrapper);

  // Controls (Prev / Next / Complete)
  const ctrlWrap = document.createElement('div');
  ctrlWrap.className = 'text-left mt-2 flex gap-2';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'px-3 py-1 rounded bg-gray-200';
  prevBtn.textContent = selectedLang === 'hi' ? 'पिछला' : 'Prev';
  prevBtn.disabled = idx <= 0;
  prevBtn.addEventListener('click', () => goToStep(idx - 1));

  const nextBtn = document.createElement('button');
  nextBtn.className = 'px-3 py-1 rounded bg-gray-200';
  nextBtn.textContent = selectedLang === 'hi' ? 'अगला' : 'Next';
  nextBtn.disabled = idx >= total - 1;
  nextBtn.addEventListener('click', () => goToStep(idx + 1));

  const completeBtn = document.createElement('button');
  completeBtn.className = 'px-3 py-1 rounded bg-green-100';
  completeBtn.textContent = selectedLang === 'hi' ? 'पूरा' : 'Complete';
  completeBtn.addEventListener('click', () => completeExercise());

  ctrlWrap.appendChild(prevBtn);
  ctrlWrap.appendChild(nextBtn);
  ctrlWrap.appendChild(completeBtn);
  msgContainer.appendChild(ctrlWrap);

  msgContainer.scrollTop = msgContainer.scrollHeight;
}

function formatStepNumber(idx, total) {
  if (!total || total <= 0) return '';
  return selectedLang === 'hi' ? `कदम ${idx}/${total}` : `Step ${idx} of ${total}`;
}

function goToStep(newIndex) {
  if (!exerciseState) return;
  const total = exerciseState.totalSteps;
  newIndex = Math.max(0, Math.min(total - 1, newIndex));
  exerciseState.currentStep = newIndex;
  renderCurrentExerciseStep();
}

function completeExercise() {
  if (!exerciseState) return;
  const totalSteps = exerciseState.totalSteps;
  const finalScore = (exerciseState.analysis && exerciseState.analysis.score) ? exerciseState.analysis.score : 0;
  const completionMsg = selectedLang === 'hi'
    ? `अभ्यास पूरा! ${totalSteps} कदम पूरे। अंतिम स्कोर: ${finalScore}/100। शानदार!`
    : `Exercise complete! ${totalSteps} steps done. Final score: ${finalScore}/100. Great job!`;
  appendBotBubble(completionMsg);
  speakText(completionMsg, selectedLang === 'hi' ? 'hi-IN' : 'en-US');
  exerciseState = null;
}

// --- Send messages ---
function safeTrim(s, n = 2000) {
  if (!s) return s;
  return (s.length > n) ? s.slice(0, n) + '…' : s;
}

async function sendMessage(text) {
  if (!text) return;
  console.log('[chat.js] Sending message:', text);
  hideCrisis();
  appendUserBubble(text);

  chatHistory.push({ role: 'user', parts: [{ text: text }] });

  if (!msgContainer) return;
  const typing = document.createElement('div');
  typing.className = 'text-left';
  typing.innerHTML = `<div class="inline-block bg-gray-50 text-gray-500 p-3 rounded-2xl max-w-[85%]">...</div>`;
  msgContainer.appendChild(typing);
  msgContainer.scrollTop = msgContainer.scrollHeight;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const url = `${apiBase}/api/chat`;
    const reqLang = (langSelect && langSelect.value) ? langSelect.value : selectedLang || 'en';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, lang: reqLang, history: chatHistory }),
      signal: controller.signal
    });

    clearTimeout(timeout);
    typing.remove();

    if (!resp.ok) {
      const raw = await resp.text().catch(() => '');
      console.error('[chat.js] Server error:', resp.status, safeTrim(raw, 2000));
      appendBotBubble(reqLang === 'hi' ? `सर्वर त्रुटि ${resp.status}: ${raw ? safeTrim(raw, 800) : 'कोई जवाब नहीं'}` : `Server error ${resp.status}: ${raw ? safeTrim(raw, 800) : 'No response body'}`);
      chatHistory.pop();
      return;
    }

    const parsedResponse = await resp.json();
    console.log('[chat.js] Server response:', parsedResponse);
    let finalText = null;
    let helplines = null;

    if (parsedResponse && typeof parsedResponse === 'object') {
      if (parsedResponse.type === 'reply' && parsedResponse.text) {
        finalText = String(parsedResponse.text).trim();
      } else if (parsedResponse.type === 'crisis' && parsedResponse.text) {
        finalText = String(parsedResponse.text).trim();
        helplines = Array.isArray(parsedResponse.helplines) ? parsedResponse.helplines : null;
      } else if (parsedResponse.type === 'analysis') {
        handleAnalysisResult(parsedResponse);
        finalText = parsedResponse.summary || parsedResponse.notes || 'Received analysis.';
      } else {
        finalText = reqLang === 'hi' ? 'क्षमा करें, मुझे समझ नहीं आया।' : 'Sorry, I could not understand the response.';
      }
    } else {
      finalText = reqLang === 'hi' ? 'क्षमा करें, जवाब प्राप्त नहीं हुआ।' : 'Sorry, no response received.';
    }

    appendBotBubble(finalText);
    chatHistory.push({ role: 'model', parts: [{ text: finalText }] });

    if (Array.isArray(helplines) && helplines.length) {
      showCrisis(helplines);
    } else {
      hideCrisis();
    }

    console.log('[chat.js] Displaying in UI:', finalText);
    const ttsLang = reqLang === 'hi' ? 'hi-IN' : 'en-US';
    if (autoSpeak) speakText(finalText, ttsLang);

  } catch (err) {
    clearTimeout(timeout);
    typing.remove();
    if (err && err.name === 'AbortError') {
      appendBotBubble(selectedLang === 'hi' ? 'अनुरोध का समय समाप्त—दुबारा कोशिश करें।' : 'Request timed out — try again.');
    } else {
      console.error('[chat.js] Network error:', err);
      appendBotBubble(selectedLang === 'hi' ? 'नेटवर्क या सर्वर त्रुटि—बाद में कोशिश करें।' : 'Network or server error — try again later.');
    }
    chatHistory.pop();
  }
}

// --- Send button & input ---
if (sendBtn) {
  sendBtn.addEventListener('click', () => {
    const txt = input ? input.value.trim() : '';
    if (!txt) return;
    if (input) input.value = '';
    sendMessage(txt);
  });
}

if (input) {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (sendBtn) sendBtn.click();
    }
  });
}

// --- Initial greeting ---
appendBotBubble(selectedLang === 'hi'
  ? 'हाय! मैं यू-वेल हूँ, आपका दोस्ताना AI साथी। टाइप करें या बोलें। अगर आप असुरक्षित महसूस करते हैं, तो बताएं और मैं हेल्पलाइन साझा करूँगा।'
  : "Hi! I'm U-Well — your friendly AI companion. Type or speak to start. If you feel unsafe, say so and I'll share helplines.");
