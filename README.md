# Trackr — Job Application Tracker

Full-stack job tracker with Gmail OAuth2 integration.

## Project Structure

```
trackr/
├── backend/
│   ├── main.py           # FastAPI app + all routes
│   ├── gmail_service.py  # Gmail OAuth2 + email parsing
│   ├── ai_service.py     # Claude AI email extraction
│   ├── storage.py        # JSON file-based storage
│   ├── models.py         # Pydantic data models
│   └── requirements.txt
├── frontend/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js        # Main app logic + state
│       ├── board.js      # Kanban board rendering
│       ├── modals.js     # All modal dialogs
│       └── api.js        # Backend API calls
└── .env.example
```

## Setup

### 1. Google OAuth2 Credentials
1. Go to https://console.cloud.google.com
2. Create a new project → Enable Gmail API
3. OAuth consent screen → External → Add scopes: `gmail.readonly`
4. Credentials → Create OAuth 2.0 Client ID → Web application
5. Add redirect URI: `http://localhost:8000/auth/callback`
6. Download JSON → copy `client_id` and `client_secret` to `.env`

### 2. Anthropic API Key
Get your key from https://console.anthropic.com

### 3. Environment Setup
```bash
cp .env.example .env
# Fill in your keys in .env
```

### 4. Install & Run Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 5. Open Frontend
Open `frontend/index.html` in your browser, or serve with:
```bash
cd frontend
python -m http.server 3000
```
Then visit http://localhost:3000

## How Gmail Sync Works
1. Click "Sync Gmail" → redirected to Google login
2. Authorize Trackr to read your Gmail (read-only)
3. Backend scans for job-related emails using Gmail API
4. Claude AI extracts company, role, stage from each email
5. New applications appear on your board automatically
