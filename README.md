# U-Well: AI-Powered Mental Wellness Companion
U-Well is a gamified urban wellness ecosystem designed to promote mental and physical well-being through AI-driven features. It includes a bilingual chatbot for empathetic conversations, posture analysis using computer vision, guided exercises, sentiment tracking, and crisis detection with helpline referrals. The app supports English and Hindi, making it accessible for users in India and beyond.

This prototype focuses on core functionalities like real-time posture detection, AI chat for wellness advice, and basic UI interactions. It's built with a hybrid backend (Python for CV tasks, Node.js for chat) and frontend in HTML/JS.

## Key Features

- **AI Chatbot**: Empathetic, counselor-like conversations using LLMs (Gemini or OpenAI). Supports natural dialogue, crisis detection, and suggestions for relaxing techniques or psychological tests.
- **Posture Analysis**: Uses MediaPipe for real-time pose detection from webcam or uploaded images. Provides feedback on slouch, forward head, and neck tension with personalized recommendations.
- **Guided Exercises**: Breathing and posture correction exercises, integrated with posture analysis for adaptive guidance.
- **Psychological Tests**: Demo for job satisfaction or aptitude assessments based on user chats.
- **Voice Input & TTS**: Speech-to-text for input and text-to-speech for responses.
- **Crisis Support**: Detects distress keywords and displays helplines (e.g., AASRA, NIMHANS).
- **Bilingual Support**: English and Hindi for chats, UI, and recommendations.
- **Frontend UI**: Simple web interface with chat, camera modal, and options for photo upload/voice.
- **Backend Services**: FastAPI (Python) for posture analysis; Express (Node.js) for chat and API proxy.

## Tech Stack

- **Frontend**: HTML5, CSS (Tailwind-inspired), JavaScript (Vanilla JS with modules).
- **Backend**:
  - Python: FastAPI, MediaPipe, OpenCV, NumPy for posture analysis.
  - Node.js: Express for chat API, proxy to Python server, and static serving.
- **AI/ML**:
  - MediaPipe for pose estimation.
  - Google Gemini or OpenAI for chatbot (configurable via env vars).
- **Other Libraries**: Multer (file uploads), Form-Data (proxy), SpeechSynthesis/WebSpeech API (TTS/STT).
- **Deployment**: Local development; suitable for GitHub Pages (frontend) or cloud (full stack).

## Prerequisites

- Python 3.12+ with pip.
- Node.js 18+ with npm.
- Webcam access for posture features (browser permissions).
- API Keys (optional for full AI):
  - Google API Key for Gemini (env: `GOOGLE_API_KEY`).
  - OpenAI API Key (env: `OPENAI_API_KEY`).
- Install dependencies:
  - Python: MediaPipe, OpenCV, NumPy, FastAPI, Uvicorn.
  - Node: Express, Cors, Dotenv, @google/generative-ai, OpenAI, Node-Fetch, Multer, Form-Data.

## Installation & Setup

1. **Clone the Repository**:
   git clone https://github.com/Ishuxify/U-Well.git
   cd "U-Well"

   
2. **Python Backend (Posture Analysis)**:
- Install dependencies:
  pip install fastapi uvicorn mediapipe opencv-python numpy pillow

- Run the server:
  uvicorn server:app --host 0.0.0.0 --port 8000 --reload

- Test: Visit `http://localhost:8000/` or `/health`.

3. **Node.js Backend (Chat & Proxy)**:
- Install dependencies:
  npm install express cors dotenv @google/generative-ai openai node-fetch multer form-data

- Create `.env` file:
GOOGLE_API_KEY=your-google-key
LLM_PROVIDER=google 
GOOGLE_MODEL=gemini-1.5-flash
PYTHON_SERVER_URL=http://localhost:8000
PORT=8787

- Run the server:
  node server.js

  - Test: Visit `http://localhost:8787/` (serves index.html).

4. **Frontend**:
- Served via Node.js (static files like index.html, chat.js, etc.).
- Open `http://localhost:8787/` in a browser.

## Usage

- **Chat Interface**: Open `/` or `/feature-chatbot.html`. Type or speak messages; AI responds with advice or requests photo for analysis.
- **Posture Analysis**:
- Use webcam: Click "Capture" in camera modal.
- Upload photo: Select file via options.
- Analysis results: Summary, score (0-100), recommendations in chat.
- **Voice Commands**: Click mic for speech input (WebSpeech API).
- **Exercises/Tests**: Triggered via chat (e.g., "relaxing technique" prompts photo; "job satisfaction" starts quiz).
- **Crisis Mode**: Keywords like "suicide" show helplines.

## Project Structure
u-well/
├── server.py          # FastAPI server for posture analysis
├── utils.py           # MediaPipe posture logic
├── server.js          # Express server for chat & proxy
├── chat.js            # Chat frontend logic (messages, voice, exercises)
├── posture.js         # Webcam pose detection (MediaPipe client-side)
├── index.html         # Main landing page
├── feature-chatbot.html # Chat UI modal/demo
├── README.md          # This file
├── .env.example       # Env template
└── package.json       # Node dependencies


## Development Notes

- **Debugging**: Check console for logs. Python prints import status; Node logs raw API responses.
- **Limitations in Prototype**:
  - Posture: Static image analysis; no real-time video yet.
  - AI: Fallback to demo responses if no API keys.
  - Tests/Exercises: Stubbed with simple steps; expand with real questions.
  - Security: Add auth for production; current is dev-only.
- **Extensions**:
  -Gemini Live Enhancements: Add multimodal inputs (voice + visuals) for more natural, expressive interactions; e.g., analyze live video for real-time posture         feedback during exercises.
  -Advanced Gamification: Introduce daily quests, virtual rewards, and community features like shared challenges to increase engagement.
  -Expanded Learning Hub: Integrate curated modules with progress tracking, certifications, and adaptive learning based on user data.
  -Psychologist Integration: Add API hooks for telehealth platforms; AI-assisted session prep and follow-ups.
  -Integrate full Gemini Vision for image analysis.
  -Add user auth/sessions for history.
  -Mobile optimization (PWA).
  -Offline capabilities for basic exercises.
  -Analytics dashboard for user progress.
  -Partnerships with schools/NGOs for community deployment.
  
## Acknowledgments

- Built with MediaPipe, FastAPI, Express, and Google/OpenAI APIs.
- Inspired by urban wellness needs for youth in India.

For questions: Email: ishu9560439430@gmail.com
              Contact: 8826755705

---
Last Updated: September 21, 2025
