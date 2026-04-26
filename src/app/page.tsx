'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft,
  RotateCcw,
  Code2,
  Loader2,
  Settings,
  Download,
  Wifi,
  WifiOff,
  History,
  AlertCircle,
} from 'lucide-react';
import JSZip from 'jszip';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { cn } from '@/lib/utils';
import { useTranslatorStore } from '@/lib/translator-store';
import { TranslatorClient } from '@/lib/translator-client';
import { AgentChat } from '@/components/code-translator/AgentChat';
import { CodeViewer } from '@/components/code-translator/CodeViewer';
import { FileTree } from '@/components/code-translator/FileTree';
import { SettingsPanel } from '@/components/code-translator/SettingsPanel';
import { QuestionCard } from '@/components/code-translator/QuestionCard';
import { ProgressHeader } from '@/components/code-translator/ProgressHeader';
import { WelcomeScreen } from '@/components/code-translator/WelcomeScreen';
import { HistoryPanel } from '@/components/code-translator/HistoryPanel';


export default function Home() {
  const {
    sessionId,
    setSessionId,
    phase,
    setPhase,
    setProgress,
    setCurrentFile,
    addMessage,
    setCurrentQuestion,
    llmConfig,
    reset,
    setAnalysis,
    setTranslatedFile,
    wsConnected,
    setWsConnected,
    translatedFiles,
    loadHistory,
    hydrated,
    hydrate,
    isHistoryView,
  } = useTranslatorStore();

  const wsClient = useRef<TranslatorClient | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // Ref to track auto-execution state without re-renders
  const autoExecuteRef = useRef<'analyze' | 'translate' | 'verify' | null>(null);

  // Determine if we should show the welcome screen
  // Only switch to workspace when a session is actually created
  const hasContent = !!sessionId;

  // Hydrate from localStorage and load history on mount
  useEffect(() => {
    hydrate();
    loadHistory();
  }, [hydrate, loadHistory]);

  // Handle WebSocket messages
  const handleWSMessage = useCallback(
    (msg: Record<string, unknown>) => {
      const msgType = msg.type as string;

      switch (msgType) {
        case 'status':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'status',
            content: (msg.message as string) || '',
            timestamp: Date.now(),
          });
          if (msg.phase === 'analyzing') setPhase('analyzing');
          if (msg.phase === 'translating') setPhase('translating');
          if (msg.phase === 'verifying') setPhase('verifying');
          if (msg.phase === 'translated') {
            setIsActionLoading(null);
            setPhase('idle');
            setProgress(100);
            // Auto-proceed: start verification after translation completes
            if (autoExecuteRef.current === 'translate') {
              autoExecuteRef.current = 'verify';
              setTimeout(() => {
                if (wsClient.current && autoExecuteRef.current === 'verify') {
                  setIsActionLoading('verify');
                  setPhase('verifying');
                  setProgress(0);
                  addMessage({
                    id: `msg-auto-${Date.now()}`,
                    type: 'status',
                    content: 'Step 3/3: Auto-starting code verification...',
                    timestamp: Date.now(),
                  });
                  wsClient.current.startVerification();
                }
              }, 800);
            }
          }
          break;

        case 'analysis_result':
          if (msg.data) {
            setAnalysis(msg.data as Record<string, unknown>);
          }
          setIsActionLoading(null);
          setPhase('idle');
          setProgress(100);
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'success',
            content: '✓ Project analysis completed!',
            timestamp: Date.now(),
            data: msg.data as Record<string, unknown>,
          });
          // Auto-proceed: start translation after analysis completes
          if (autoExecuteRef.current === 'analyze') {
            autoExecuteRef.current = 'translate';
            setTimeout(() => {
              if (wsClient.current && autoExecuteRef.current === 'translate') {
                setIsActionLoading('translate');
                setPhase('translating');
                setProgress(0);
                addMessage({
                  id: `msg-auto-${Date.now()}`,
                  type: 'status',
                  content: 'Step 2/3: Auto-starting code translation...',
                  timestamp: Date.now(),
                });
                wsClient.current.startTranslation();
              }
            }, 800);
          }
          break;

        case 'translation_progress':
          setProgress((msg.progress as number) || 0);
          if (msg.file) setCurrentFile(msg.file as string);
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'progress',
            content: (msg.message as string) || `Translating ${msg.file || ''}...`,
            timestamp: Date.now(),
            data: msg,
          });
          break;

        case 'file_translated': {
          const filePath = (msg.translated_file as string) || (msg.file as string) || '';
          const content = (msg.content as string) || '';
          if (filePath && content) {
            setTranslatedFile(filePath, content);
          }
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'file_translated',
            content: `✓ Translated: ${filePath}`,
            timestamp: Date.now(),
          });
          break;
        }

        case 'question':
          // Pause auto-execution when a question arises
          autoExecuteRef.current = null;
          setCurrentQuestion({
            id: (msg.question_id as string) || `q-${Date.now()}`,
            question: (msg.question as string) || '',
            options: (msg.options as string[]) || undefined,
          });
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'question',
            content: `❓ ${(msg.question as string) || ''}`,
            timestamp: Date.now(),
          });
          break;

        case 'searching':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'search',
            content: `🔍 Searching: ${(msg.query as string) || ''}`,
            timestamp: Date.now(),
          });
          break;

        case 'search_result':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'search',
            content: `Found search results for: ${(msg.query as string) || ''}`,
            timestamp: Date.now(),
            data: msg,
          });
          break;

        case 'error': {
          autoExecuteRef.current = null;
          setPhase('error');
          let errorContent = (msg.message as string) || 'An error occurred';
          // Make API authentication errors more user-friendly
          if (errorContent.includes('401') || errorContent.includes('Authentication') || errorContent.includes('api key') || errorContent.includes('invalid_request_error')) {
            errorContent = `❌ API Authentication Failed — Please check your LLM API key in Settings. ${errorContent}`;
          }
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'error',
            content: errorContent,
            timestamp: Date.now(),
          });
          setIsActionLoading(null);
          break;
        }

        case 'warning':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'warning',
            content: (msg.message as string) || '',
            timestamp: Date.now(),
          });
          break;

        case 'verification_progress':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'progress',
            content: (msg.message as string) || `Verifying ${msg.file || ''}...`,
            timestamp: Date.now(),
            data: msg,
          });
          break;

        case 'verification_issue':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'warning',
            content: `⚠ ${msg.file || ''}: ${(msg.issue as string) || ''}`,
            timestamp: Date.now(),
            data: msg,
          });
          break;

        case 'verification_complete':
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'success',
            content: 'Verification completed!',
            timestamp: Date.now(),
            data: msg.summary as Record<string, unknown>,
          });
          // Always transition to complete when verification finishes
          autoExecuteRef.current = null;
          setPhase('complete');
          setProgress(100);
          setCurrentFile(null);
          setIsActionLoading(null);
          break;

        case 'complete':
          autoExecuteRef.current = null;
          setPhase('complete');
          setProgress(100);
          setCurrentFile(null);
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'success',
            content: (msg.message as string) || 'Operation completed successfully!',
            timestamp: Date.now(),
          });
          setIsActionLoading(null);
          // Save to history when complete
          saveToHistory();
          break;

        default:
          addMessage({
            id: `msg-${Date.now()}-${Math.random()}`,
            type: 'info',
            content: (msg.message as string) || JSON.stringify(msg),
            timestamp: Date.now(),
          });
      }
    },
    [addMessage, setPhase, setProgress, setCurrentFile, setCurrentQuestion, setAnalysis, setTranslatedFile]
  );

  // Save translation to history
  const saveToHistory = useCallback(async () => {
    try {
      const state = useTranslatorStore.getState();
      const sourcePaths = Object.keys(state.sourceFiles);
      const translated = state.translatedFiles;
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: state.sessionId || '',
          sourceLang: state.sourceLang,
          targetLang: state.targetLang,
          sourceFiles: sourcePaths,
          translatedFiles: translated,
          status: 'complete',
          fileCount: sourcePaths.length,
          translatedCount: Object.keys(translated).length,
          llmModel: state.llmConfig.modelName,
        }),
      });

      if (res.ok) {
        // Add the created entry to local state immediately for instant UI update
        const entry = await res.json();
        state.addHistoryEntry(entry);
      }
      // Force reload history from server to ensure consistency
      state.loadHistory(true);
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }, []);

  // Connect WebSocket when session is created (skip for history views)
  useEffect(() => {
    const { isHistoryView } = useTranslatorStore.getState();
    if (sessionId && !isHistoryView) {
      wsClient.current = new TranslatorClient(sessionId, handleWSMessage, (connected) => {
        setWsConnected(connected);
      });
      wsClient.current.connect();

      return () => {
        wsClient.current?.disconnect();
        wsClient.current = null;
        setWsConnected(false);
      };
    }
  }, [sessionId, handleWSMessage, setWsConnected]);

  // Listen for sessionReady event from WelcomeScreen to auto-start pipeline
  useEffect(() => {
    const handleSessionReady = async () => {
      addMessage({
        id: `msg-${Date.now()}`,
        type: 'status',
        content: '🚀 Starting automatic pipeline: Analyze → Translate → Verify...',
        timestamp: Date.now(),
      });

      // Wait for WebSocket to be connected (poll with timeout)
      const maxWait = 10000; // 10 seconds max
      const pollInterval = 300;
      let elapsed = 0;
      while (elapsed < maxWait) {
        if (wsClient.current && useTranslatorStore.getState().wsConnected) break;
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        elapsed += pollInterval;
      }

      if (!wsClient.current || !useTranslatorStore.getState().wsConnected) {
        addMessage({
          id: `msg-${Date.now()}`,
          type: 'error',
          content: '❌ Failed to connect to the translation server. Please try again.',
          timestamp: Date.now(),
        });
        setPhase('error');
        return;
      }

      autoExecuteRef.current = 'analyze';
      setIsActionLoading('analyze');
      setPhase('analyzing');
      setProgress(0);
      addMessage({
        id: `msg-${Date.now()}`,
        type: 'status',
        content: 'Step 1/3: Starting project analysis...',
        timestamp: Date.now(),
      });

      wsClient.current.startAnalysis();
    };

    window.addEventListener('translator:sessionReady', handleSessionReady);
    return () => window.removeEventListener('translator:sessionReady', handleSessionReady);
  }, [addMessage, setPhase, setProgress]);

  // Listen for answer events from QuestionCard
  useEffect(() => {
    const handleAnswer = (e: Event) => {
      const { questionId, answer } = (e as CustomEvent).detail;
      if (wsClient.current) {
        wsClient.current.sendAnswer(questionId, answer);
        // Resume auto-execution after answering a question
        // Check current phase to determine where to resume
        const currentPhase = useTranslatorStore.getState().phase;
        if (currentPhase === 'idle') {
          // Try to resume: if we have analysis but no translations, start translate
          // If we have translations, start verify
          const hasAnalysis = !!useTranslatorStore.getState().analysis;
          const hasTranslations = Object.keys(useTranslatorStore.getState().translatedFiles).length > 0;
          if (hasAnalysis && !hasTranslations) {
            autoExecuteRef.current = 'translate';
            setTimeout(() => {
              if (wsClient.current && autoExecuteRef.current === 'translate') {
                setIsActionLoading('translate');
                setPhase('translating');
                setProgress(0);
                addMessage({
                  id: `msg-auto-${Date.now()}`,
                  type: 'status',
                  content: 'Resuming code translation...',
                  timestamp: Date.now(),
                });
                wsClient.current.startTranslation();
              }
            }, 500);
          }
        }
      }
    };
    window.addEventListener('translator:answer', handleAnswer);
    return () => window.removeEventListener('translator:answer', handleAnswer);
  }, [addMessage, setPhase, setProgress]);

  // Manual Analyze via WebSocket (for re-analysis)
  const handleAnalyze = useCallback(() => {
    if (!sessionId || !wsClient.current) return;
    autoExecuteRef.current = null; // Manual mode
    setIsActionLoading('analyze');
    setPhase('analyzing');
    setProgress(0);
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'status',
      content: 'Starting project analysis...',
      timestamp: Date.now(),
    });
    wsClient.current.startAnalysis();
  }, [sessionId, setPhase, setProgress, addMessage]);

  // Manual Translate via WebSocket
  const handleTranslate = useCallback(() => {
    if (!sessionId || !wsClient.current) return;
    autoExecuteRef.current = null; // Manual mode
    setIsActionLoading('translate');
    setPhase('translating');
    setProgress(0);
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'status',
      content: 'Starting code translation...',
      timestamp: Date.now(),
    });
    wsClient.current.startTranslation();
  }, [sessionId, setPhase, setProgress, addMessage]);

  // Manual Verify via WebSocket
  const handleVerify = useCallback(() => {
    if (!sessionId || !wsClient.current) return;
    autoExecuteRef.current = null; // Manual mode
    setIsActionLoading('verify');
    setPhase('verifying');
    setProgress(0);
    addMessage({
      id: `msg-${Date.now()}`,
      type: 'status',
      content: 'Starting code verification...',
      timestamp: Date.now(),
    });
    wsClient.current.startVerification();
  }, [sessionId, setPhase, setProgress, addMessage]);

  // Reset
  const handleReset = useCallback(() => {
    wsClient.current?.disconnect();
    wsClient.current = null;
    autoExecuteRef.current = null;
    reset();
    setIsActionLoading(null);
    setWsConnected(false);
  }, [reset, setWsConnected]);

  // Download translated files as zip
  const handleDownload = useCallback(async () => {
    const files = useTranslatorStore.getState().translatedFiles;
    const fileCount = Object.keys(files).length;
    if (fileCount === 0) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      for (const [path, content] of Object.entries(files)) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `translated-${sessionId || 'project'}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      addMessage({
        id: `msg-${Date.now()}`,
        type: 'error',
        content: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsDownloading(false);
    }
  }, [sessionId, addMessage]);

  const hasTranslatedFiles = Object.keys(translatedFiles).length > 0;
  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error';
  const isConfigured = llmConfig.baseUrl && llmConfig.apiKey && llmConfig.modelName;

  // Truncate session ID for display
  const displaySessionId = sessionId
    ? sessionId.length > 12
      ? `${sessionId.slice(0, 6)}...${sessionId.slice(-4)}`
      : sessionId
    : null;

  // Wait for hydration to avoid flash of default content
  if (!hydrated) {
    return (
      <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
        <header className="relative flex items-center gap-3 px-4 py-2.5 bg-card shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/10">
              <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-tight">
                CodeTranslator Agent
              </h1>
              <p className="text-[10px] text-muted-foreground">
                AI-Powered Code Translation
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* App Header */}
      <header className="relative flex items-center gap-3 px-4 py-2.5 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-emerald-500/10">
            <ArrowRightLeft className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground leading-tight">
              CodeTranslator Agent
            </h1>
            <p className="text-[10px] text-muted-foreground">
              AI-Powered Code Translation
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1">
          {/* Connection Status - show for active sessions, show history badge for loaded history */}
          {sessionId && isHistoryView && (
            <div className="flex items-center gap-1.5 mr-2">
              <History className="h-3 w-3 text-amber-400" />
              <span className="text-[10px] text-amber-400">History View</span>
            </div>
          )}
          {sessionId && !isHistoryView && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1.5 mr-2 cursor-default">
                  <motion.div
                    animate={{ scale: wsConnected ? [1, 1.2, 1] : 1 }}
                    transition={{ duration: 2, repeat: wsConnected ? Infinity : 0 }}
                  >
                    {wsConnected ? (
                      <Wifi className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <WifiOff className="h-3 w-3 text-red-400" />
                    )}
                  </motion.div>
                  <span className={cn(
                    'text-[10px] font-mono',
                    wsConnected ? 'text-emerald-500' : 'text-red-500'
                  )}>
                    {displaySessionId}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Session: {sessionId}</p>
                <p>Status: {wsConnected ? 'Connected' : 'Disconnected'}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {!isConfigured && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 mr-2"
            >
              <Settings className="h-3 w-3 text-amber-400" />
              <span className="text-xs text-amber-400">Config needed</span>
            </motion.div>
          )}
          <AnimatePresence>
            {isActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 mr-2"
              >
                <Loader2 className="h-3 w-3 text-emerald-400 animate-spin" />
                <span className="text-xs text-emerald-400 capitalize">{phase}...</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* History Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  'h-7 text-xs transition-colors',
                  showHistory ? 'text-emerald-400 bg-emerald-900/20' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <History className="h-3.5 w-3.5 mr-1" />
                History
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              View translation history
            </TooltipContent>
          </Tooltip>

          {/* Download Button */}
          {hasTranslatedFiles && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  className="h-7 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/20"
                >
                  {isDownloading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 mr-1" />
                  )}
                  Download
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                Download translated files as ZIP ({Object.keys(translatedFiles).length} files)
              </TooltipContent>
            </Tooltip>
          )}

          {sessionId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
          <SettingsPanel />
        </div>
        {/* Gradient border at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        <div className="flex h-full">
          {/* Main workspace */}
          <div className="flex-1 overflow-hidden">
            {!hasContent ? (
              <WelcomeScreen />
            ) : (
              <ResizablePanelGroup direction="horizontal" className="h-full">
                {/* Left Panel - Agent Chat & Controls */}
                <ResizablePanel defaultSize={40} minSize={30} maxSize={55}>
                  <div className="flex flex-col h-full bg-card">
                    {/* Progress Header */}
                    <ProgressHeader />

                    {/* Error Recovery Banner */}
                    {phase === 'error' && sessionId && !isHistoryView && (
                      <div className="px-4 py-3 border-b border-red-700/30 bg-red-900/10">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                          <p className="text-xs text-red-300 flex-1">An error occurred during processing. You can retry or start over.</p>
                        </div>
                        <div className="flex gap-2 mt-2">
                          <Button
                            onClick={() => {
                              setPhase('idle');
                              setProgress(0);
                              setCurrentFile(null);
                              setIsActionLoading(null);
                              autoExecuteRef.current = null;
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1 text-[11px] h-7 border-amber-700/50 text-amber-400 hover:bg-amber-900/20"
                          >
                            Retry from here
                          </Button>
                          <Button
                            onClick={handleReset}
                            variant="outline"
                            size="sm"
                            className="flex-1 text-[11px] h-7 border-red-700/50 text-red-400 hover:bg-red-900/20"
                          >
                            Start over
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Manual Action Buttons (hidden in history view) */}
                    {sessionId && !isHistoryView && phase !== 'error' && (
                      <div className="px-4 py-2 border-b border-border">
                        <div className="flex gap-2">
                          <Button
                            onClick={handleAnalyze}
                            disabled={isActionLoading !== null || phase !== 'idle'}
                            variant="outline"
                            size="sm"
                            className={cn(
                              'flex-1 text-[11px] h-8 transition-all duration-200',
                              phase === 'idle' && 'border-amber-700/50 text-amber-400 hover:bg-amber-900/20 hover:text-amber-300',
                              phase !== 'idle' && 'border-border text-muted-foreground'
                            )}
                          >
                            Re-Analyze
                          </Button>
                          <Button
                            onClick={handleTranslate}
                            disabled={isActionLoading !== null || phase !== 'idle'}
                            variant="outline"
                            size="sm"
                            className={cn(
                              'flex-1 text-[11px] h-8 transition-all duration-200',
                              phase === 'idle' && 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300',
                              phase !== 'idle' && 'border-border text-muted-foreground'
                            )}
                          >
                            Re-Translate
                          </Button>
                          <Button
                            onClick={handleVerify}
                            disabled={isActionLoading !== null || (phase !== 'idle' && phase !== 'complete')}
                            variant="outline"
                            size="sm"
                            className={cn(
                              'flex-1 text-[11px] h-8 transition-all duration-200',
                              (phase === 'idle' || phase === 'complete') && 'border-purple-700/50 text-purple-400 hover:bg-purple-900/20 hover:text-purple-300',
                              phase !== 'idle' && phase !== 'complete' && 'border-border text-muted-foreground'
                            )}
                          >
                            Re-Verify
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Agent Chat Messages */}
                    <div className="flex-1 overflow-hidden">
                      <AgentChat />
                    </div>

                    {/* Question Card */}
                    <QuestionCard />
                  </div>
                </ResizablePanel>

                {/* Resize Handle */}
                <ResizableHandle withHandle className="bg-card border-border">
                  <div className="bg-border rounded-sm" />
                </ResizableHandle>

                {/* Right Panel - Code Viewer */}
                <ResizablePanel defaultSize={60} minSize={40}>
                  <div className="flex h-full bg-background">
                    {/* File Tree */}
                    <div className="w-56 shrink-0 border-r border-border overflow-hidden">
                      <FileTree className="h-full" />
                    </div>

                    {/* Code Viewer */}
                    <div className="flex-1 overflow-hidden">
                      <CodeViewer />
                    </div>
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            )}
          </div>

          {/* History Sidebar */}
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-l border-border overflow-hidden shrink-0"
              >
                <HistoryPanel onClose={() => setShowHistory(false)} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
