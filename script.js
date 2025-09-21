/* script.js - Fixed: API integration, captureAndAnalyze */
const navToggle = document.getElementById('nav-toggle');
const mobileMenu = document.getElementById('mobile-menu');
const navOpenIcon = document.getElementById('nav-open-icon');
const navCloseIcon = document.getElementById('nav-close-icon');

navToggle?.addEventListener('click', () => {
  mobileMenu.classList.toggle('hidden');
  navOpenIcon.classList.toggle('hidden');
  navCloseIcon.classList.toggle('hidden');
});

const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const sentimentResult = document.getElementById('sentiment-result');
const adviceBtn = document.getElementById('advice-btn');

function appendUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'user-message p-3 text-right';
  div.innerText = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendBotMessage(text) {
  const div = document.createElement('div');
  div.className = 'bot-message bg-gray-100 p-3 rounded-xl shadow-sm max-w-[85%]';
  div.innerText = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChatMessage(text) {
  appendUserMessage(text);
  chatInput.value = '';
  const typing = document.createElement('div');
  typing.className = 'bot-message ... p-3';
  typing.innerText = 'Thinking...';
  chatMessages.appendChild(typing);

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, lang: 'en' })
    });
    typing.remove();
    const data = await resp.json();
    appendBotMessage(data.text || 'Response received.');
    sentimentResult.innerText = 'Sentiment: Analyzed.';
  } catch (err) {
    typing.remove();
    appendBotMessage('Try again.');
    console.error(err);
  }
}

sendBtn?.addEventListener('click', () => {
  const txt = chatInput.value.trim();
  if (!txt) return;
  sendChatMessage(txt);
});
chatInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendBtn.click(); });

adviceBtn?.addEventListener('click', () => appendBotMessage('4-7-8 breathing: In 4s, hold 7s, out 8s.'));

// Mood (unchanged stub)
const moodsKey = 'uwell_moods';
function saveMood(mood) {
  const logs = JSON.parse(localStorage.getItem(moodsKey) || '[]');
  logs.push({ mood, at: new Date().toISOString() });
  localStorage.setItem(moodsKey, JSON.stringify(logs));
  appendBotMessage(`Mood: ${mood}`);
}
window.logMood = saveMood;

// Webcam (fixed: capture to /api/analyze)
let webcamStream = null;
const video = document.getElementById('webcam');
const startBtnWeb = document.getElementById('start-webcam');
const stopBtnWeb = document.getElementById('stop-webcam');
const postureFeedback = document.getElementById('posture-feedback');

async function startWebcam() {
  try {
    webcamStream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = webcamStream;
    postureFeedback.innerText = 'Enabled. Analyzing...';
    setInterval(captureAndAnalyze, 5000); // Every 5s
  } catch (err) {
    postureFeedback.innerText = 'Access denied.';
    console.error(err);
  }
}

async function captureAndAnalyze() {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(async (blob) => {
    const formData = new FormData();
    formData.append('image', blob, 'posture.jpg');
    try {
      const resp = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await resp.json();
      postureFeedback.innerText = data.summary;
    } catch (err) {
      console.error(err);
    }
  }, 'image/jpeg');
}

function stopWebcam() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    webcamStream = null;
    postureFeedback.innerText = 'Stopped.';
  }
}

startBtnWeb?.addEventListener('click', startWebcam);
stopBtnWeb?.addEventListener('click', stopWebcam);

// Crisis (unchanged)
const crisisModal = document.getElementById('crisis-modal');
const openCrisis = document.getElementById('open-crisis-modal');
const closeCrisis = document.getElementById('close-crisis-modal');

openCrisis?.addEventListener('click', () => {
  crisisModal.classList.remove('hidden');
  crisisModal.classList.add('flex');
});
closeCrisis?.addEventListener('click', () => {
  crisisModal.classList.add('hidden');
  crisisModal.classList.remove('flex');
});

console.log('U-Well script loaded.');