'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRightLeft,
  Settings,
  Upload,
  Play,
  File,
  FileArchive,
  X,
  Trash2,
  Loader2,
  ChevronDown,
  CheckCircle2,
  Circle,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslatorStore, type FileEntry } from '@/lib/translator-store';
import { createSession, uploadFiles } from '@/lib/translator-client';

const LANGUAGES = [
  'Python', 'TypeScript', 'JavaScript', 'Java', 'Go', 'Rust',
  'C#', 'C++', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart',
  'Scala', 'Shell', 'SQL', 'HTML/CSS', 'Electron', 'Other',
];

export function WelcomeScreen() {
  const {
    uploadedFiles,
    setUploadedFiles,
    rawFiles,
    setRawFiles,
    llmConfig,
    sourceLang,
    targetLang,
    setSourceLang,
    setTargetLang,
    setSessionId,
    setPhase,
    addMessage,
    setSourceFile,
  } = useTranslatorStore();

  const [isDragging, setIsDragging] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSourceLangs, setShowSourceLangs] = useState(false);
  const [showTargetLangs, setShowTargetLangs] = useState(false);

  const isConfigured = !!(llmConfig.baseUrl && llmConfig.apiKey && llmConfig.modelName);
  const hasFiles = rawFiles.length > 0;

  // Auto-detect source language from file extensions
  const detectSourceLang = (files: File[]) => {
    const extMap: Record<string, string> = {
      '.py': 'Python',
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.java': 'Java',
      '.go': 'Go',
      '.rs': 'Rust',
      '.rb': 'Ruby',
      '.php': 'PHP',
      '.cs': 'C#',
      '.swift': 'Swift',
      '.kt': 'Kotlin',
      '.cpp': 'C++',
      '.c': 'C++',
      '.dart': 'Dart',
      '.scala': 'Scala',
      '.sh': 'Shell',
      '.sql': 'SQL',
      '.html': 'HTML/CSS',
      '.css': 'HTML/CSS',
    };
    
    for (const file of files) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (extMap[ext]) {
        return extMap[ext];
      }
    }
    return sourceLang; // Keep current if no match
  };

  // Auto-detect when files are uploaded
  useEffect(() => {
    if (rawFiles.length > 0) {
      const detected = detectSourceLang(rawFiles);
      if (detected !== sourceLang) {
        setSourceLang(detected);
      }
    }
  }, [rawFiles]);

  // Step completion tracking
  const step1Done = isConfigured; // LLM configured
  const step2Done = hasFiles; // Files uploaded
  const step3Done = sourceLang !== targetLang; // Languages selected (not same)
  const allReady = step1Done && step2Done;

  // File handling
  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const entries: FileEntry[] = Array.from(fileList).map((file) => {
        const relativePath = file.webkitRelativePath || file.name;
        return {
          name: file.name,
          path: relativePath,
          size: file.size,
          type: 'file' as const,
        };
      });

      setUploadedFiles([...uploadedFiles, ...entries]);
      setRawFiles([...rawFiles, ...Array.from(fileList)]);

      // Also store file contents for source viewing
      Array.from(fileList).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            useTranslatorStore.getState().setSourceFile(file.webkitRelativePath || file.name, content);
          }
        };
        if (!file.name.match(/\.(zip|exe|bin|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|svg)$/i)) {
          reader.readAsText(file);
        }
      });
    },
    [uploadedFiles, setUploadedFiles, setRawFiles, rawFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const removeFile = useCallback(
    (path: string) => {
      // 直接从 store 获取最新状态并过滤
      const currentUploaded = useTranslatorStore.getState().uploadedFiles;
      const currentRaw = useTranslatorStore.getState().rawFiles;
      
      setUploadedFiles(currentUploaded.filter(f => f.path !== path));
      setRawFiles(currentRaw.filter(file => (file.webkitRelativePath || file.name) !== path));
      // 清理 sourceFiles 中对应的内容
      useTranslatorStore.getState().removeSourceFile(path);
    },
    []
  );

  const clearAll = useCallback(() => {
    setUploadedFiles([]);
    setRawFiles([]);
    // 清空所有 sourceFiles
    useTranslatorStore.setState({ sourceFiles: {} });
  }, []);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Start Translation
  const handleStartTranslation = useCallback(async () => {
    if (rawFiles.length === 0) return;
    if (!isConfigured) {
      addMessage({
        id: `msg-${Date.now()}`,
        type: 'error',
        content: 'Please configure LLM settings (Base URL, API Key, Model Name) first!',
        timestamp: Date.now(),
      });
      return;
    }

    setIsCreating(true);
    setErrorMessage(null);
    setPhase('uploading');

    try {
      // 1. Create session
      const sid = await createSession({
        llmConfig,
        sourceLang,
        targetLang,
      });
      setSessionId(sid);

      // 2. Upload files
      await uploadFiles(sid, rawFiles);

      // 3. Signal to parent to auto-start the pipeline
      window.dispatchEvent(new CustomEvent('translator:sessionReady', {
        detail: { sessionId: sid },
      }));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      setPhase('idle');
      setErrorMessage(errMsg);
      addMessage({
        id: `msg-${Date.now()}`,
        type: 'error',
        content: `Upload failed: ${errMsg}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsCreating(false);
    }
  }, [rawFiles, llmConfig, sourceLang, targetLang, isConfigured, setSessionId, setPhase, addMessage]);

  return (
    <div className="flex-1 flex items-center justify-center h-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute inset-0 opacity-30"
          animate={{
            background: [
              'radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)',
              'radial-gradient(ellipse at 80% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)',
              'radial-gradient(ellipse at 50% 20%, rgba(16,185,129,0.15) 0%, transparent 50%)',
              'radial-gradient(ellipse at 20% 50%, rgba(16,185,129,0.15) 0%, transparent 50%)',
            ],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Floating code brackets animation */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {['{', '}', '<', '>', '(', ')', '[', ']'].map((char, i) => (
          <motion.span
            key={i}
            className="absolute text-muted-foreground/30 font-mono text-2xl select-none"
            style={{
              left: `${10 + (i * 12) % 85}%`,
              top: `${5 + (i * 17) % 80}%`,
            }}
            animate={{
              y: [0, -20, 0],
              opacity: [0.3, 0.6, 0.3],
              rotate: [0, i % 2 === 0 ? 10 : -10, 0],
            }}
            transition={{
              duration: 4 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.7,
              ease: 'easeInOut',
            }}
          >
            {char}
          </motion.span>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="relative z-10 flex flex-col items-center max-w-lg w-full px-6"
      >
        {/* Logo & Title */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <ArrowRightLeft className="h-8 w-8 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground leading-tight">
              CodeTranslator Agent
            </h2>
            <p className="text-xs text-muted-foreground">
              AI-Powered Code Translation
            </p>
          </div>
        </motion.div>

        {/* Progress Steps Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="w-full mb-5 flex items-center gap-0"
        >
          {/* Step 1: Configure */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300 shrink-0',
              step1Done ? 'border-emerald-500 bg-emerald-500/20' : 'border-border bg-secondary'
            )}>
              {step1Done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">1</span>
              )}
            </div>
            <span className={cn(
              'text-[11px] font-medium transition-colors duration-300 truncate',
              step1Done ? 'text-emerald-400' : 'text-muted-foreground'
            )}>
              Configure
            </span>
          </div>
          <div className={cn('h-px flex-1 mx-1 transition-colors duration-300', step1Done ? 'bg-emerald-500/40' : 'bg-secondary')} />

          {/* Step 2: Upload */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300 shrink-0',
              step2Done ? 'border-emerald-500 bg-emerald-500/20' : step1Done ? 'border-amber-500 bg-amber-500/10' : 'border-border bg-secondary'
            )}>
              {step2Done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <span className={cn(
                  'text-[10px] font-bold',
                  step1Done ? 'text-amber-500' : 'text-muted-foreground'
                )}>2</span>
              )}
            </div>
            <span className={cn(
              'text-[11px] font-medium transition-colors duration-300 truncate',
              step2Done ? 'text-emerald-400' : step1Done ? 'text-amber-400' : 'text-muted-foreground'
            )}>
              Upload
            </span>
          </div>
          <div className={cn('h-px flex-1 mx-1 transition-colors duration-300', step2Done ? 'bg-emerald-500/40' : 'bg-secondary')} />

          {/* Step 3: Translate */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors duration-300 shrink-0',
              allReady ? 'border-emerald-500 bg-emerald-500/20' : 'border-border bg-secondary'
            )}>
              {allReady ? (
                <Play className="h-3 w-3 text-emerald-400 ml-0.5" />
              ) : (
                <span className="text-[10px] font-bold text-muted-foreground">3</span>
              )}
            </div>
            <span className={cn(
              'text-[11px] font-medium transition-colors duration-300 truncate',
              allReady ? 'text-emerald-400' : 'text-muted-foreground'
            )}>
              Translate
            </span>
          </div>
        </motion.div>

        {/* Step 1: LLM Config Warning */}
        {!isConfigured && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full mb-4"
          >
            <div className="flex items-center gap-2.5 p-3.5 rounded-xl border border-amber-700/40 bg-amber-900/20">
              <div className="p-1.5 rounded-lg bg-amber-500/10 shrink-0">
                <Settings className="h-4 w-4 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-amber-300 mb-0.5">Step 1: Configure LLM</p>
                <p className="text-[11px] text-amber-400/70">
                  Click the <Settings className="h-2.5 w-2.5 inline -mt-0.5" /> settings icon in the top-right to set your API key.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Step 1 Complete Indicator */}
        {isConfigured && !hasFiles && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full mb-4"
          >
            <div className="flex items-center gap-2 p-3 rounded-xl border border-emerald-700/30 bg-emerald-900/10">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <p className="text-xs text-emerald-400">
                LLM configured — now upload your files below
              </p>
            </div>
          </motion.div>
        )}

        {/* Language Selection */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="w-full mb-4"
        >
          <div className="flex items-center gap-3">
            {/* Source Language */}
            <div className="flex-1 relative">
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Source Language</label>
              <button
                onClick={() => { setShowSourceLangs(!showSourceLangs); setShowTargetLangs(false); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-secondary/50 text-sm text-foreground hover:border-border transition-colors"
              >
                <span>{sourceLang}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showSourceLangs && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {showSourceLangs && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-xl shadow-black/20 max-h-48 overflow-y-auto custom-scrollbar"
                  >
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => { setSourceLang(lang); setShowSourceLangs(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors',
                          lang === sourceLang ? 'text-emerald-400 bg-emerald-900/20' : 'text-foreground/80'
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Arrow */}
            <div className="flex items-end pb-2.5">
              <ArrowRightLeft className="h-4 w-4 text-emerald-500" />
            </div>

            {/* Target Language */}
            <div className="flex-1 relative">
              <label className="block text-[10px] text-muted-foreground mb-1 uppercase tracking-wider">Target Language</label>
              <button
                onClick={() => { setShowTargetLangs(!showTargetLangs); setShowSourceLangs(false); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-secondary/50 text-sm text-foreground hover:border-border transition-colors"
              >
                <span>{targetLang}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', showTargetLangs && 'rotate-180')} />
              </button>
              <AnimatePresence>
                {showTargetLangs && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-xl shadow-black/20 max-h-48 overflow-y-auto custom-scrollbar"
                  >
                    {LANGUAGES.map((lang) => (
                      <button
                        key={lang}
                        onClick={() => { setTargetLang(lang); setShowTargetLangs(false); }}
                        className={cn(
                          'w-full text-left px-3 py-2 text-sm hover:bg-accent/50 transition-colors',
                          lang === targetLang ? 'text-emerald-400 bg-emerald-900/20' : 'text-foreground/80'
                        )}
                      >
                        {lang}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>

        {/* Upload Drop Zone */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="w-full mb-4"
        >
          <motion.div
            animate={{
              borderColor: isDragging ? 'rgb(16, 185, 129)' : undefined,
            }}
            className={cn(
              'relative border-2 border-dashed rounded-xl p-6 transition-all duration-200 cursor-pointer',
              isDragging
                ? 'border-emerald-500 bg-emerald-900/20'
                : hasFiles
                  ? 'border-emerald-700/40 bg-emerald-900/5'
                  : 'border-border bg-card/30 hover:border-border hover:bg-card/80'
            )}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileInput}
              accept=".zip,.py,.js,.ts,.tsx,.jsx,.java,.go,.rs,.rb,.php,.cs,.swift,.kt,.cpp,.c,.dart,.scala,.sh,.sql,.html,.css,.json,.yaml,.yml,.toml,.md,.txt"
            />
            <div className="flex flex-col items-center text-center">
              <motion.div
                animate={{
                  scale: isDragging ? 1.1 : 1,
                  y: isDragging ? -4 : 0,
                }}
                transition={{ duration: 0.15, type: 'spring', stiffness: 300 }}
              >
                <Upload
                  className={cn(
                    'h-8 w-8 mb-2 transition-colors duration-200',
                    isDragging ? 'text-emerald-400' : hasFiles ? 'text-emerald-500/70' : 'text-muted-foreground'
                  )}
                />
              </motion.div>
              <p className="text-sm text-foreground/60">
                {isDragging ? (
                  <span className="text-emerald-400 font-medium">Drop files here</span>
                ) : (
                  <>
                    Drag & drop files or{' '}
                    <span className="text-emerald-400 hover:text-emerald-300 transition-colors duration-150 font-medium">
                      browse
                    </span>
                  </>
                )}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Supports zip archives and individual source files
              </p>
            </div>
          </motion.div>
        </motion.div>

        {/* Uploaded Files List */}
        <AnimatePresence>
          {uploadedFiles.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="w-full mb-4 overflow-hidden"
            >
              <div className="flex items-center justify-between px-1 mb-2">
                <span className="text-xs text-muted-foreground">
                  {uploadedFiles.length} file{uploadedFiles.length !== 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAll}
                  className="h-6 text-xs text-muted-foreground hover:text-red-400 transition-colors duration-150"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-1">
                <AnimatePresence>
                  {uploadedFiles.map((file, i) => (
                    <motion.div
                      key={file.path}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15, delay: i * 0.02 }}
                      className="flex items-center gap-2 px-2 py-1.5 rounded bg-secondary/50 border border-border hover:border-border transition-colors duration-150"
                    >
                      {file.name.endsWith('.zip') ? (
                        <FileArchive className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      ) : (
                        <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span className="text-xs text-foreground/80 truncate flex-1">
                        {file.path}
                      </span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatSize(file.size)}
                      </span>
                      <button
                        className="p-0.5 text-muted-foreground hover:text-red-400 shrink-0 transition-colors duration-150"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFile(file.path);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="w-full mb-3"
            >
              <div className="flex items-start gap-2.5 p-3 rounded-xl border border-red-700/40 bg-red-900/20">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-300 mb-0.5">Failed to start translation</p>
                  <p className="text-[11px] text-red-400/70 break-words">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="p-0.5 text-red-400/50 hover:text-red-300 shrink-0 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Start Translation Button - Very prominent */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.6 }}
          className="w-full"
        >
          {allReady ? (
            /* Ready state - Big green start button */
            <Button
              onClick={handleStartTranslation}
              disabled={isCreating}
              className={cn(
                'w-full h-12 text-sm font-semibold transition-all duration-300 group',
                'bg-emerald-600 hover:bg-emerald-500 text-white',
                'hover:shadow-lg hover:shadow-emerald-900/40',
                'active:scale-[0.98]'
              )}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Starting Translation...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 mr-2 group-hover:scale-110 transition-transform" />
                  Start Translation
                </>
              )}
            </Button>
          ) : (
            /* Not ready - show what's needed */
            <div className="space-y-2">
              <Button
                onClick={handleStartTranslation}
                disabled={true}
                className="w-full h-12 text-sm font-semibold bg-secondary/80 text-muted-foreground cursor-not-allowed border border-border/50"
              >
                <Play className="h-5 w-5 mr-2 opacity-50" />
                Start Translation
              </Button>
              <div className="flex items-center justify-center gap-4">
                {!step1Done && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] text-amber-400">LLM not configured</span>
                  </div>
                )}
                {!step2Done && step1Done && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] text-amber-400">No files uploaded</span>
                  </div>
                )}
                {!step2Done && !step1Done && (
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                    <span className="text-[11px] text-amber-400">Configure LLM & upload files to start</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>

        {/* Flow description */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          className="mt-4 text-[11px] text-muted-foreground text-center leading-relaxed"
        >
          After clicking Start, the agent will automatically: <br />
          <span className="text-muted-foreground">
            Analyze → Translate → Verify
          </span>
        </motion.p>
      </motion.div>
    </div>
  );
}
