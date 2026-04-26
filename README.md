<div align="center">

# <img src="public/codetranslator.png" alt="Logo" width="60" height="60" style="vertical-align: middle;"> Code Translator

**AI-Powered Code Translation Platform**

[English](./README.md) · [中文](./README_ch.md)

---

</div>

## 📖 Overview

Code Translator is an intelligent code translation tool that converts entire programming projects from one language to another. Powered by LLM (Large Language Model), it goes beyond simple syntax conversion — it **understands** your code, **searches** for knowledge when uncertain, **asks** you about ambiguous requirements, and **verifies** the translated output.

### ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🧠 **Smart Analysis** | Deeply analyzes project structure, dependencies, and logic before translation |
| 🔍 **Auto-detect Source Language** | Automatically detects the source programming language based on file extension upon file upload |
| 🔎 **Web Search** | Automatically searches the web for language-specific knowledge when uncertain |
| ❓ **Interactive Q\&A** | Asks you questions when requirements are ambiguous, ensuring accurate translation |
| ✅ **Post-Translation Verification** | Reviews translated code for syntax errors, missing imports, logic issues, and more |
| 🔄 **Auto Pipeline** | Three-step pipeline runs automatically: **Analyze → Translate → Verify** |
| 📂 **History Management** | Saves and loads translation history with SQLite persistence |
| 💾 **Download as ZIP** | Export all translated files as a single ZIP archive |
| 🌐 **Real-time Progress** | WebSocket-based live progress updates and agent chat |

### 🏗️ Architecture

```
┌──────────────┐       ┌──────────────┐       ┌───────────────────┐
│   Browser    │─────▶│  Next.js     │──────▶│  SQLite (Prisma)  │
│              │       │  Frontend    │       │ TranslationHistory│
└──────────────┘       └──────┬───────┘       └───────────────────┘
                              │ WebSocket / REST (proxy to :3003)
                              ▼
                       ┌──────────────────┐
                       │  FastAPI         │
                       │  Agent Service   │
                       └──────┬───────────┘
                              │ OpenAI-compatible API
                              ▼
                       ┌──────────────────┐
                       │  LLM Provider    │
                       │  (Configurable)  │
                       └──────────────────┘
```

**Tech Stack:**

- **Frontend:** Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Zustand · Framer Motion
- **Backend:** Python · FastAPI · WebSocket · Pydantic
- **Database:** SQLite via Prisma ORM
- **AI:** Any OpenAI-compatible LLM API

---

## 🚀 Installation

### Prerequisites

| Dependency | Version | Purpose |
|-----------|---------|---------|
| **Node.js** | ≥ 18 | Frontend runtime (includes **npm**) |
| **Python** | ≥ 3.10 | Backend runtime |
| **pip** | latest | Python package manager |
| **LLM API** | — | OpenAI-compatible endpoint (OpenAI, Azure, local LLM, etc.) |

---

### 🍎 macOS Installation

#### Step 1: Install Node.js (includes npm)

```bash
# Install Node.js via Homebrew (recommended)
brew install node

# Or install via nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.zshrc
nvm install 18
nvm use 18

# Verify Node.js and npm
node --version
npm --version
```

#### Step 2: Install Python

```bash
# Install Python via Homebrew
brew install python@3.12

# Verify
python3 --version
pip3 --version
```

#### Step 3: Clone & Install Frontend

```bash
cd /path/to/project

# Install Node.js dependencies
npm install

# Initialize the SQLite database
npm run db:push
```

#### Step 4: Install Python Backend Dependencies

```bash
cd mini-services/code-translator

# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install fastapi uvicorn pydantic openai websockets python-multipart
```

---

### 🪟 Windows Installation

#### Step 1: Install Node.js (includes npm)

```powershell
# Install Node.js via official installer
# Download from https://nodejs.org/ (LTS version recommended)
# Or use winget:
winget install OpenJS.NodeJS.LTS

# Verify Node.js and npm
node --version
npm --version
```

#### Step 2: Install Python

```powershell
# Install Python via official installer
# Download from https://www.python.org/downloads/
# ⚠️ IMPORTANT: Check "Add Python to PATH" during installation

# Or use winget:
winget install Python.Python.3.12

# Verify
python --version
pip --version
```

#### Step 3: Clone & Install Frontend

```powershell
cd C:\path\to\project

# Install Node.js dependencies
npm install

# Initialize the SQLite database
npm run db:push
```

#### Step 4: Install Python Backend Dependencies

```powershell
cd mini-services\code-translator

# Create a virtual environment (recommended)
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn pydantic openai websockets python-multipart
```

---

## 🏃 Running

### 🍎 Start on macOS

Open two terminal windows/tabs:

**Terminal 1 — Backend (FastAPI on port 3003):**

```bash
cd /path/to/project/mini-services/code-translator

# If using virtual environment:
source venv/bin/activate

# Start the server
npm run dev
```

**Terminal 2 — Frontend (Next.js on port 3000):**

```bash
cd /path/to/project
npm run dev
```

### 🪟 Start on Windows

Open two terminal windows:

**Terminal 1 — Backend (FastAPI on port 3003):**

```powershell
cd C:\path\to\project\mini-services\code-translator

# If using virtual environment:
venv\Scripts\activate

# Start the server
npm run dev
```

**Terminal 2 — Frontend (Next.js on port 3000):**

```powershell
cd C:\path\to\project
npm run dev
```

### Access the Application

Open your browser and navigate to:

- **Local:** `http://localhost:3000`
- **Preview Panel:** Use the Preview Panel on the right side of the interface. Click **"Open in New Tab"** for a full-screen experience.

---

## 📋 Usage

1. **Configure LLM** — Click the ⚙️ Settings icon in the header, enter your LLM API Base URL, API Key, and Model Name
2. **Select Languages** — On the welcome screen, choose source and target programming languages
3. **Upload Files** — Drag & drop or browse to upload your source code project
4. **Start Translation** — Click the green ▶ **Start Translation** button
5. **Interact with Agent** — The agent may ask questions; answer them to guide the translation
6. **View Results** — Browse translated files in the file tree, view code with syntax highlighting
7. **Download** — Click the Download button to export all translated files as a ZIP

---

## 📁 Project Structure

```
├── prisma/
│   └── schema.prisma           # Database schema (TranslationHistory)
├── src/
│   ├── app/
│   │   ├── page.tsx            # Main page (orchestrator)
│   │   └── api/history/        # History REST API routes
│   ├── components/
│   │   ├── code-translator/
│   │   │   ├── WelcomeScreen.tsx
│   │   │   ├── ProgressHeader.tsx
│   │   │   ├── AgentChat.tsx
│   │   │   ├── QuestionCard.tsx
│   │   │   ├── FileTree.tsx
│   │   │   ├── CodeViewer.tsx
│   │   │   ├── HistoryPanel.tsx
│   │   │   ├── SettingsPanel.tsx
│   │   │   └── ...
│   │   └── ui/                 # shadcn/ui components
│   └── lib/
│       ├── translator-store.ts  # Zustand state management
│       ├── translator-client.ts # WebSocket + REST client
│       └── db.ts               # Prisma client
├── mini-services/
│   └── code-translator/        # Python FastAPI backend
│       └── app/
│           ├── main.py         # FastAPI entry point
│           ├── models.py       # Pydantic models
│           ├── routes/
│           │   ├── session_routes.py
│           │   └── ws_routes.py
│           └── services/
│               ├── llm_service.py
│               ├── analysis_service.py
│               ├── translation_service.py
│               ├── verification_service.py
│               └── search_service.py
└── db/
    └── custom.db               # SQLite database
```

---

## ❓ FAQ

<details>
<summary><strong>What LLM providers are supported?</strong></summary>

Any OpenAI-compatible API endpoint works, including:
- **OpenAI** — `https://api.openai.com/v1`
- **Azure OpenAI** — Your Azure endpoint
- **Local LLMs** — Ollama, LM Studio, vLLM, etc.
- **Other providers** — DeepSeek, Moonshot, Zhipu, etc.

You configure the Base URL, API Key, and Model Name in the Settings panel.
</details>

<details>
<summary><strong>Does it work on Windows?</strong></summary>

Yes! Follow the 🪟 Windows Installation section above. Make sure to:
1. Check "Add Python to PATH" during Python installation
2. Use forward slashes in `.env` paths
3. Use `python` instead of `python3` on Windows
</details>

<details>
<summary><strong>How are translated files saved?</strong></summary>

Translations are saved to:
- **Browser state:** Immediately available in the file tree and code viewer
- **SQLite database:** Persisted as translation history entries
- **ZIP download:** Export all translated files at once via the Download button
</details>

<details>
<summary><strong>Can I re-run a specific step?</strong></summary>

Yes! After a session is active, you'll see three action buttons: **Re-Analyze**, **Re-Translate**, and **Re-Verify**. Click any of them to re-run that specific step.
</details>
</div>
