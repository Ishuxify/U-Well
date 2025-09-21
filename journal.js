// journal.js - Full fixed: Saving, rendering, trends canvas, AI insights (client + server stub)
const STORAGE_KEY = 'uwell_journal_entries_v1';

// Helpers
function fmt(date) {
  const d = new Date(date);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function truncate(s, len) {
  return s.length > len ? s.slice(0, len) + '...' : s;
}

function moodEmoji(mood) {
  const map = { happy: '😊', neutral: '🙂', meh: '😐', sad: '😞', angry: '😡', tired: '😴' };
  return map[mood] || '😐';
}

function showToast(msg, ms = 2200) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  t.classList.remove('hidden');
  setTimeout(() => {
    t.classList.remove('show');
    t.classList.add('hidden');
  }, ms);
}

// Storage
function loadEntries() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch (e) {
    console.error('Parse error', e);
    return [];
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Render recent
function renderRecent() {
  const list = document.getElementById('recent-entries');
  list.innerHTML = '';
  const entries = loadEntries().slice().reverse();
  if (entries.length === 0) {
    list.innerHTML = `<div class="text-sm text-gray-500">No entries yet — start by writing how you feel today.</div>`;
    return;
  }
  entries.slice(0, 12).forEach((e, idx) => {
    const li = document.createElement('li');
    li.className = 'entry-item flex gap-3 p-3 bg-gray-50 rounded-lg';
    li.innerHTML = `
      <div class="text-3xl flex-shrink-0">${moodEmoji(e.mood)}</div>
      <div class="flex-1">
        <div class="text-sm text-gray-500">${fmt(e.at)}</div>
        <div class="mt-1 text-gray-800">${escapeHtml(truncate(e.text || '', 220))}</div>
      </div>
    `;
    list.appendChild(li);
  });
}

// Mood trends canvas
function renderTrends() {
  const canvas = document.getElementById('mood-chart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const entries = loadEntries().slice(-7); // Last 7 days
  if (entries.length === 0) return;

  const moods = entries.map(e => {
    const score = { happy: 5, neutral: 3, meh: 2, sad: 1, angry: 1, tired: 2 }[e.mood] || 3;
    return { date: new Date(e.at).toLocaleDateString(), score };
  });

  const maxHeight = 150;
  const barWidth = canvas.width / moods.length - 10;
  moods.forEach((m, i) => {
    const barHeight = (m.score / 5) * maxHeight;
    ctx.fillStyle = m.score > 3 ? '#10b981' : m.score > 2 ? '#f59e0b' : '#ef4444';
    ctx.fillRect(i * (barWidth + 10) + 5, canvas.height - barHeight - 20, barWidth, barHeight);
    ctx.fillStyle = '#6b7280';
    ctx.fillText(m.date, i * (barWidth + 10) + 5, canvas.height - 5);
  });
}

// Save entry
document.getElementById('save-entry').addEventListener('click', () => {
  const text = document.getElementById('entry-text').value.trim();
  const selectedMood = document.querySelector('.emoji-option[aria-checked="true"]')?.dataset.mood;
  if (!text || !selectedMood) {
    showToast('Add mood & text first!', 1500);
    return;
  }
  const entries = loadEntries();
  entries.push({ mood: selectedMood, text, at: new Date().toISOString() });
  saveEntries(entries);
  document.getElementById('entry-text').value = '';
  selectMoodButton(null);
  renderRecent();
  renderTrends();
  showToast('Entry saved!');
});

// Mood select
function selectMoodButton(mood) {
  document.querySelectorAll('.emoji-option').forEach(btn => {
    btn.setAttribute('aria-checked', btn.dataset.mood === mood ? 'true' : 'false');
  });
}
document.querySelectorAll('.emoji-option').forEach(btn => {
  btn.addEventListener('click', () => selectMoodButton(btn.dataset.mood));
});

// Clear entries
document.getElementById('clear-entries').addEventListener('click', () => {
  if (confirm('Clear all?')) {
    localStorage.removeItem(STORAGE_KEY);
    renderRecent();
    renderTrends();
    showToast('Cleared!');
  }
});

// Download (JSON)
document.getElementById('download-btn').addEventListener('click', () => {
  const entries = loadEntries();
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `uwell-journal-${new Date().toISOString().split('T')[0]}.json`;
  a.click(); URL.revokeObjectURL(url);
});

// AI Insights (client demo + server stub)
document.getElementById('insights-btn').addEventListener('click', async () => {
  const entries = loadEntries().slice(-5); // Last 5
  if (entries.length === 0) {
    showToast('No entries for insights!', 1500);
    return;
  }

  // Client demo
  const moods = entries.map(e => e.mood);
  const insightTexts = {
    en: [
      'You seem mostly positive this week—keep it up!',
      'Noticing more "tired" days; try a short walk?',
      'Balanced moods: Great self-awareness!'
    ],
    hi: [
      'इस सप्ताह आप ज्यादातर सकारात्मक लग रहे हैं—जारी रखें!',
      'अधिक "थके हुए" दिन नजर आ रहे हैं; छोटी सैर आजमाएं?',
      'संतुलित मूड: शानदार आत्म-जागरूकता!'
    ]
  };
  const lang = navigator.language.startsWith('hi') ? 'hi' : 'en';
  const randomInsight = insightTexts[lang][Math.floor(Math.random() * insightTexts[lang].length)];

  // Server stub (optional call)
  try {
    const res = await fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: moods.join(', ') })
    });
    const data = await res.json();
    document.getElementById('insights-list').innerHTML = `<li>${data.insight || randomInsight}</li>`;
  } catch (err) {
    document.getElementById('insights-list').innerHTML = `<li>${randomInsight}</li>`;
  }

  const insightsModal = document.getElementById('insights-modal');
  insightsModal.classList.remove('hidden');
  insightsModal.classList.add('flex');
});

document.getElementById('close-insights').addEventListener('click', () => {
  document.getElementById('insights-modal').classList.add('hidden');
  document.getElementById('insights-modal').classList.remove('flex');
});
document.getElementById('insights-close-bottom').addEventListener('click', () => {
  document.getElementById('insights-modal').classList.add('hidden');
  document.getElementById('insights-modal').classList.remove('flex');
});

// Init
function init() {
  document.getElementById('today-readout').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  renderRecent();
  renderTrends();

  // Ctrl+Enter save
  document.getElementById('entry-text').addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') document.getElementById('save-entry').click();
  });

  selectMoodButton(null);

  // Esc close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('insights-modal');
      if (!modal.classList.contains('hidden')) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }
  });

  // Click outside close
  document.getElementById('insights-modal').addEventListener('click', (ev) => {
    if (ev.target.id === 'insights-modal') {
      ev.target.classList.add('hidden');
      ev.target.classList.remove('flex');
    }
  });
}

init();