// posture.js - Fixed: MediaPipe load try-catch, speakText stub, /api/posture call
const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');

const startBtn = document.getElementById('startBtn') || document.getElementById('start-webcam');
const stopBtn = document.getElementById('stopBtn') || document.getElementById('stop-webcam');
const calibrateBtn = document.getElementById('calibrateBtn');
const sendServerBtn = document.getElementById('sendServerBtn');
const startBreath = document.getElementById('startBreath') || document.getElementById('startBreathEx');

const statusText = document.getElementById('statusText') || document.getElementById('posture-feedback');
const scoreBadge = document.getElementById('scoreBadge');
const obsHead = document.getElementById('headTilt');
const obsShoulders = document.getElementById('shoulderSlope');
const obsTorso = document.getElementById('torsoLean');
const advice = document.getElementById('advice');

let stream = null;
let pose = null;
let raf = null;
let calibrated = null;
let latestLandmarks = null;

// Speak stub (TTS)
function speakText(text, lang = 'en-US') {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    window.speechSynthesis.speak(utterance);
  } else {
    console.log('TTS not supported:', text);
  }
}

// Load MediaPipe (fixed: try-catch)
async function loadMediapipe() {
  try {
    const mp = await import('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1625983205/pose.js');
    const drawingUtils = await import('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.5.1625983205/drawing_utils.js');
    return { mp, drawingUtils };
  } catch (err) {
    console.error('MediaPipe load failed:', err);
    statusText.textContent = 'MediaPipe failed to load. Check network.';
    return null;
  }
}

// Angle calc
function angleBetween(A, B, C) {
  const AB = [A.x - B.x, A.y - B.y];
  const CB = [C.x - B.x, C.y - B.y];
  const dot = AB[0]*CB[0] + AB[1]*CB[1];
  const magAB = Math.hypot(AB[0], AB[1]);
  const magCB = Math.hypot(CB[0], CB[1]);
  if (magAB === 0 || magCB === 0) return 0;
  return Math.acos(dot / (magAB * magCB)) * (180 / Math.PI);
}

// Start camera
async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      statusText.textContent = 'Camera ready. Pose detected soon.';
      if (!pose) initPose();
    };
  } catch (err) {
    statusText.textContent = 'Camera access denied.';
    console.error(err);
  }
}

// Init pose
async function initPose() {
  const { mp, drawingUtils } = await loadMediapipe();
  if (!mp) return;
  pose = new mp.Pose({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1625983205/${file}`});
  pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, enableSegmentation: false, smoothSegmentation: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  pose.onResults(onPoseResults);
  startLoop();
}

// Loop
function startLoop() {
  raf = requestAnimationFrame(loop);
}
function loop() {
  if (!pose || !video.srcObject) return;
  pose.send({image: video});
  raf = requestAnimationFrame(loop);
}

// Results
function onPoseResults(results) {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
  if (results.poseLandmarks) {
    latestLandmarks = results.poseLandmarks;
    drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, {color: '#00f', lineWidth: 2});
    drawLandmarks(ctx, results.poseLandmarks, {color: '#f00', radius: 1});
    updateScore();
  }
  ctx.restore();
}

// Score/update (stub for demo)
function updateScore() {
  if (!latestLandmarks) return;
  const nose = latestLandmarks[0];
  const leftEar = latestLandmarks[7];
  const rightEar = latestLandmarks[8];
  const headTilt = Math.abs(angleBetween(leftEar, nose, rightEar));
  statusText.textContent = `Head tilt: ${headTilt.toFixed(1)}°`;
  if (headTilt > 15) advice.textContent = 'Straighten your head.';
}

// Calibrate (fixed)
calibrateBtn?.onclick = () => {
  if (!latestLandmarks) {
    alert('No landmarks yet — start camera and hold still.');
    return;
  }
  calibrated = latestLandmarks.map(l => ({ x: l.x, y: l.y }));
  advice.textContent = 'Calibrated. Comparing to baseline.';
  statusText.textContent = 'Calibrated';
  speakText('Baseline calibrated.');
};

// Server send (fixed)
sendServerBtn?.onclick = async () => {
  if (!latestLandmarks) {
    alert('No pose detected.');
    return;
  }
  const payload = {
    sessionId: localStorage.getItem('uwell_session') || ('sess_' + Date.now()),
    timestamp: new Date().toISOString(),
    landmarks: latestLandmarks
  };
  try {
    const res = await fetch('/api/posture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await res.json();
    alert('Server: ' + (j.message || JSON.stringify(j)));
  } catch (err) {
    console.warn('Server failed', err);
    alert('Server error (check console).');
  }
};

// Breathing (fixed)
startBreath?.onclick = () => {
  speakText('Breathe in for 4, hold 4, out 6. Repeat 3x.', 'en-US');
  let step = 0;
  const seq = ['Breathe in', 'Hold', 'Breathe out'];
  const times = [4000, 4000, 6000];
  function next() {
    if (step >= seq.length * 3) return;
    speakText(seq[step % seq.length]);
    setTimeout(next, times[step % seq.length]);
    step++;
  }
  next();
};

// Events
startBtn?.addEventListener('click', startCamera);
stopBtn?.addEventListener('click', () => {
  if (stream) stream.getTracks().forEach(t => t.stop());
  video.srcObject = null;
  if (raf) cancelAnimationFrame(raf);
  statusText.textContent = 'Stopped.';
});
window.addEventListener('pagehide', () => { if (stream) stream.getTracks().forEach(t => t.stop()); });
window.addEventListener('beforeunload', () => { if (stream) stream.getTracks().forEach(t => t.stop()); });

// POSE_CONNECTIONS (MediaPipe import stub - assume loaded)
const POSE_CONNECTIONS = [
  {start: 11, end: 12}, {start: 11, end: 23}, {start: 12, end: 24}, {start: 23, end: 24},
  // ... full connections from MediaPipe docs (add if needed)
];
function drawConnectors(ctx, landmarks, connections, options) { /* Stub - use drawingUtils.drawConnectors(ctx, landmarks, connections, options); */ }
function drawLandmarks(ctx, landmarks, options) { /* Stub - use drawingUtils.drawLandmarks(ctx, landmarks, options); */ }