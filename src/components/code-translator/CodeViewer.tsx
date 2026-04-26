'use client';

import { useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { X, FileCode, ArrowLeftRight, Copy, Check, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslatorStore } from '@/lib/translator-store';

const langMap: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.jsx': 'jsx',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.cpp': 'cpp',
  '.c': 'c',
  '.dart': 'dart',
  '.scala': 'scala',
  '.sh': 'bash',
  '.sql': 'sql',
  '.html': 'html',
  '.css': 'css',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
};

function getLanguageFromPath(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const ext = lastDot >= 0 ? path.substring(lastDot) : '';
  return langMap[ext] || 'text';
}

function getFileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

function EmptyCodeState() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-background text-muted-foreground relative overflow-hidden">
      {/* Animated code brackets */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        {['{', '}', '<', '>', '/'].map((char, i) => (
          <motion.span
            key={i}
            className="absolute text-muted-foreground/30 font-mono font-bold select-none"
            style={{
              fontSize: `${60 + i * 20}px`,
              left: `${15 + i * 16}%`,
              top: `${20 + (i % 3) * 20}%`,
            }}
            animate={{
              opacity: [0.15, 0.3, 0.15],
              rotate: [0, i % 2 === 0 ? 5 : -5, 0],
              scale: [1, 1.05, 1],
            }}
            transition={{
              duration: 3 + i * 0.5,
              repeat: Infinity,
              delay: i * 0.6,
              ease: 'easeInOut',
            }}
          >
            {char}
          </motion.span>
        ))}
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div className="p-4 rounded-2xl bg-card/60 border border-border/60 mb-4">
            <FileCode className="h-10 w-10 text-muted-foreground" />
          </div>
        </motion.div>
        <p className="text-sm font-medium text-muted-foreground">No file selected</p>
        <p className="text-xs text-muted-foreground/60 mt-1.5">
          Select a file from the tree to view its code
        </p>
      </div>
    </div>
  );
}

function TabBar() {
  const { openFiles, activeFile, setActiveFile, closeFile, sourceFiles, translatedFiles, fileViewMode } =
    useTranslatorStore();

  if (openFiles.length === 0) return null;

  return (
    <div className="flex items-center border-b border-border bg-card/90 overflow-x-auto custom-scrollbar-x">
      {openFiles.map((filePath) => {
        const isActive = filePath === activeFile;
        const isTranslated = filePath in translatedFiles;
        const isSource = filePath in sourceFiles;
        return (
          <div
            key={filePath}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 border-r border-border cursor-pointer group min-w-fit transition-all duration-150',
              isActive
                ? 'bg-background text-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground/80 hover:bg-card/80'
            )}
            onClick={() => setActiveFile(filePath)}
          >
            <FileCode
              className={cn(
                'h-3.5 w-3.5 shrink-0',
                isActive && fileViewMode === 'translated' && isTranslated
                  ? 'text-emerald-400'
                  : 'text-muted-foreground'
              )}
            />
            <span className="text-xs whitespace-nowrap">
              {getFileName(filePath)}
            </span>
            {isActive && isTranslated && isSource && (
              <span className={cn(
                'text-[9px] px-1 rounded',
                fileViewMode === 'translated' ? 'text-emerald-500 bg-emerald-900/30' : 'text-muted-foreground bg-secondary'
              )}>
                {fileViewMode === 'translated' ? 'T' : 'S'}
              </span>
            )}
            {isActive && isTranslated && !isSource && (
              <span className="text-[9px] text-emerald-500 bg-emerald-900/30 px-1 rounded">T</span>
            )}
            {isActive && !isTranslated && isSource && (
              <span className="text-[9px] text-muted-foreground bg-secondary px-1 rounded">S</span>
            )}
            <button
              className="ml-1 p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-150"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(filePath);
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function CodeViewer() {
  const { activeFile, sourceFiles, translatedFiles, fileViewMode, setFileViewMode } = useTranslatorStore();
  const [copied, setCopied] = useState(false);

  const sourceContent = activeFile ? sourceFiles[activeFile] ?? '' : '';
  const translatedContent = activeFile ? translatedFiles[activeFile] ?? '' : '';

  const language = useMemo(
    () => (activeFile ? getLanguageFromPath(activeFile) : 'text'),
    [activeFile]
  );

  const hasTranslated = activeFile ? activeFile in translatedFiles : false;
  const hasSource = activeFile ? activeFile in sourceFiles : false;

  const displayContent = fileViewMode === 'translated' && hasTranslated
    ? translatedContent
    : sourceContent;
  const displayLabel = fileViewMode === 'translated' && hasTranslated
    ? 'Translated'
    : 'Source';
  const displayColor = fileViewMode === 'translated' && hasTranslated
    ? 'text-emerald-400'
    : 'text-foreground/60';
  const displayDotColor = fileViewMode === 'translated' && hasTranslated
    ? 'bg-emerald-500'
    : 'bg-muted-foreground';

  const canToggle = hasSource && hasTranslated;
  const lineCount = displayContent ? displayContent.split('\n').length : 0;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [displayContent]);

  const handleDownloadFile = useCallback(() => {
    if (!activeFile || !displayContent) return;
    const blob = new Blob([displayContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName(activeFile);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [activeFile, displayContent]);

  if (!activeFile) {
    return <EmptyCodeState />;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <TabBar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* File header with info */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-card/60 border-b border-border shrink-0">
          <div className={cn('h-2 w-2 rounded-full', displayDotColor)} />
          <span className={cn('text-xs font-medium', displayColor)}>
            {displayLabel}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {language}
          </span>
          <span className="text-[10px] text-muted-foreground/60 ml-1 truncate max-w-[200px]">
            {activeFile}
          </span>
          <span className="text-[10px] text-muted-foreground/50">
            {lineCount} lines
          </span>

          {/* Action buttons */}
          <div className="ml-auto flex items-center gap-1">
            {canToggle && (
              <button
                onClick={() => {
                  setFileViewMode(fileViewMode === 'source' ? 'translated' : 'source');
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground/80 hover:bg-secondary transition-colors"
              >
                <ArrowLeftRight className="h-3 w-3" />
                {fileViewMode === 'source' ? 'Translated' : 'Source'}
              </button>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground/80 hover:bg-secondary transition-colors"
              title="Copy code"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={handleDownloadFile}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground/80 hover:bg-secondary transition-colors"
              title="Download file"
            >
              <Download className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Code content */}
        <div className="flex-1 overflow-auto custom-scrollbar">
          <SyntaxHighlighter
            language={language}
            style={oneDark}
            customStyle={{
              margin: 0,
              padding: '16px',
              background: 'transparent',
              fontSize: '13px',
              lineHeight: '1.6',
            }}
            showLineNumbers={true}
            lineNumberStyle={{
              color: '#4a4a4a',
              minWidth: '3em',
              paddingRight: '1em',
            }}
            wrapLines={true}
          >
            {displayContent || '// No content available'}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
}
