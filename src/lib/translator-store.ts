import { create } from 'zustand';

export interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

export interface FileEntry {
  name: string;
  path: string;
  size: number;
  type: 'file' | 'directory';
  children?: FileEntry[];
}

export interface AgentMessage {
  id: string;
  type: 'status' | 'search' | 'question' | 'error' | 'file_translated' | 'info' | 'warning' | 'success' | 'progress';
  content: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

export interface Question {
  id: string;
  question: string;
  options?: string[];
}

export type Phase = 'idle' | 'uploading' | 'analyzing' | 'translating' | 'verifying' | 'complete' | 'error';

export interface HistoryEntry {
  id: string;
  sessionId: string;
  sourceLang: string;
  targetLang: string;
  sourceFiles: string;       // JSON string from API
  translatedFiles: string;   // JSON string from API
  status: string;
  fileCount: number;
  translatedCount: number;
  llmModel: string;
  createdAt: string;
  updatedAt: string;
}

// localStorage keys
const STORAGE_KEYS = {
  llmConfig: 'codetranslator-llm-config',
  sourceLang: 'codetranslator-source-lang',
  targetLang: 'codetranslator-target-lang',
};

// Static defaults — used on both server and client to avoid hydration mismatch
const DEFAULT_LLM_CONFIG: LLMConfig = { baseUrl: '', apiKey: '', modelName: '' };
const DEFAULT_SOURCE_LANG = 'Python';
const DEFAULT_TARGET_LANG = 'TypeScript';

interface TranslatorState {
  // Session
  sessionId: string | null;

  // Config
  llmConfig: LLMConfig;
  sourceLang: string;
  targetLang: string;

  // Files
  uploadedFiles: FileEntry[];
  rawFiles: File[]; // Actual File objects for upload
  sourceFiles: Record<string, string>;
  translatedFiles: Record<string, string>;

  // Chat
  messages: AgentMessage[];

  // Questions
  currentQuestion: Question | null;

  // Status
  phase: Phase;
  progress: number;
  currentFile: string | null;

  // Analysis
  analysis: Record<string, unknown> | null;

  // Open files in viewer
  openFiles: string[];
  activeFile: string | null;
  fileViewMode: 'source' | 'translated';

  // WS connection status
  wsConnected: boolean;

  // History
  history: HistoryEntry[];
  historyLoaded: boolean;
  isHistoryView: boolean;

  // Hydration flag
  hydrated: boolean;

  // Actions
  setSessionId: (id: string | null) => void;
  setLLMConfig: (config: LLMConfig) => void;
  setSourceLang: (lang: string) => void;
  setTargetLang: (lang: string) => void;
  addMessage: (msg: AgentMessage) => void;
  setCurrentQuestion: (q: Question | null) => void;
  setPhase: (phase: Phase) => void;
  setProgress: (p: number) => void;
  setCurrentFile: (f: string | null) => void;
  setUploadedFiles: (files: FileEntry[]) => void;
  setRawFiles: (files: File[]) => void;
  setSourceFile: (path: string, content: string) => void;
  setTranslatedFile: (path: string, content: string) => void;
  setAnalysis: (analysis: Record<string, unknown> | null) => void;
  setWsConnected: (connected: boolean) => void;
  clearMessages: () => void;
  openFile: (path: string, viewMode?: 'source' | 'translated') => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string | null) => void;
  setFileViewMode: (mode: 'source' | 'translated') => void;
  setHistory: (history: HistoryEntry[]) => void;
  addHistoryEntry: (entry: HistoryEntry) => void;
  loadHistory: (force?: boolean) => Promise<void>;
  loadFromHistory: (data: { sessionId: string; sourceLang: string; targetLang: string; translatedFiles: Record<string, string> }) => void;
  hydrate: () => void;
  reset: () => void;
}

export const useTranslatorStore = create<TranslatorState>((set, get) => ({
  // Always start with static defaults (SSR-safe)
  sessionId: null,
  llmConfig: DEFAULT_LLM_CONFIG,
  sourceLang: DEFAULT_SOURCE_LANG,
  targetLang: DEFAULT_TARGET_LANG,
  uploadedFiles: [],
  rawFiles: [],
  sourceFiles: {},
  translatedFiles: {},
  messages: [],
  currentQuestion: null,
  phase: 'idle' as Phase,
  progress: 0,
  currentFile: null,
  analysis: null,
  openFiles: [],
  activeFile: null,
  fileViewMode: 'source' as 'source' | 'translated',
  wsConnected: false,
  history: [],
  historyLoaded: false,
  isHistoryView: false,
  hydrated: false,

  setSessionId: (id) => set({ sessionId: id }),
  setLLMConfig: (config) => {
    // Persist to localStorage
    try {
      localStorage.setItem(STORAGE_KEYS.llmConfig, JSON.stringify(config));
    } catch { /* ignore */ }
    set({ llmConfig: config });
  },
  setSourceLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEYS.sourceLang, lang);
    } catch { /* ignore */ }
    set({ sourceLang: lang });
  },
  setTargetLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEYS.targetLang, lang);
    } catch { /* ignore */ }
    set({ targetLang: lang });
  },
  addMessage: (msg) =>
    set((state) => ({ messages: [...state.messages, msg] })),
  setCurrentQuestion: (q) => set({ currentQuestion: q }),
  setPhase: (phase) => set({ phase }),
  setProgress: (p) => set({ progress: p }),
  setCurrentFile: (f) => set({ currentFile: f }),
  setUploadedFiles: (files) => set({ uploadedFiles: files }),
  setRawFiles: (files) => set({ rawFiles: files }),
  setSourceFile: (path, content) =>
    set((state) => ({
      sourceFiles: { ...state.sourceFiles, [path]: content },
    })),
  setTranslatedFile: (path, content) =>
    set((state) => ({
      translatedFiles: { ...state.translatedFiles, [path]: content },
    })),
  setAnalysis: (analysis) => set({ analysis }),
  setWsConnected: (connected) => set({ wsConnected: connected }),
  clearMessages: () => set({ messages: [] }),
  openFile: (path, viewMode) =>
    set((state) => {
      const newOpenFiles = state.openFiles.includes(path)
        ? state.openFiles
        : [...state.openFiles, path];
      return { openFiles: newOpenFiles, activeFile: path, fileViewMode: viewMode || state.fileViewMode };
    }),
  closeFile: (path) =>
    set((state) => {
      const newOpenFiles = state.openFiles.filter((f) => f !== path);
      const newActiveFile =
        state.activeFile === path
          ? newOpenFiles.length > 0
            ? newOpenFiles[newOpenFiles.length - 1]
            : null
          : state.activeFile;
      return { openFiles: newOpenFiles, activeFile: newActiveFile };
    }),
  setActiveFile: (path) => set({ activeFile: path }),
  setFileViewMode: (mode) => set({ fileViewMode: mode }),
  setHistory: (history) => set({ history, historyLoaded: true }),
  addHistoryEntry: (entry) =>
    set((state) => ({ history: [entry, ...state.history] })),
  loadHistory: async (force?: boolean) => {
    if (!force && get().historyLoaded) return;
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        set({ history: data, historyLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  },
  loadFromHistory: (data) => {
    set({
      sessionId: data.sessionId,
      sourceLang: data.sourceLang,
      targetLang: data.targetLang,
      translatedFiles: data.translatedFiles,
      sourceFiles: {},
      uploadedFiles: [],
      rawFiles: [],
      messages: [{
        id: `msg-history-${Date.now()}`,
        type: 'info' as const,
        content: `📂 Loaded from history: ${data.sourceLang} → ${data.targetLang} (${Object.keys(data.translatedFiles).length} files)`,
        timestamp: Date.now(),
      }],
      currentQuestion: null,
      phase: 'complete' as Phase,
      progress: 100,
      currentFile: null,
      analysis: null,
      openFiles: [],
      activeFile: null,
      fileViewMode: 'translated' as 'source' | 'translated',
      wsConnected: false,
      isHistoryView: true,
    });
  },
  // Hydrate from localStorage — call this once in useEffect after mount
  hydrate: () => {
    if (get().hydrated) return; // Only hydrate once
    try {
      const savedConfig = localStorage.getItem(STORAGE_KEYS.llmConfig);
      const savedSourceLang = localStorage.getItem(STORAGE_KEYS.sourceLang);
      const savedTargetLang = localStorage.getItem(STORAGE_KEYS.targetLang);
      set({
        llmConfig: savedConfig ? JSON.parse(savedConfig) : DEFAULT_LLM_CONFIG,
        sourceLang: savedSourceLang || DEFAULT_SOURCE_LANG,
        targetLang: savedTargetLang || DEFAULT_TARGET_LANG,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },
  reset: () => set({
    sessionId: null,
    uploadedFiles: [],
    rawFiles: [],
    sourceFiles: {},
    translatedFiles: {},
    messages: [],
    currentQuestion: null,
    phase: 'idle' as Phase,
    progress: 0,
    currentFile: null,
    analysis: null,
    openFiles: [],
      activeFile: null,
    fileViewMode: 'source' as 'source' | 'translated',
    wsConnected: false,
    isHistoryView: false,
    // Don't reset history or historyLoaded — history persists across sessions
    // Don't reset hydrated — config stays hydrated
  }),
}));
