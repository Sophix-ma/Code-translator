'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Search,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Loader2,
  FileCode,
  Sparkles,
  Copy,
  Check,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslatorStore, type AgentMessage } from '@/lib/translator-store';

const messageIcons: Record<AgentMessage['type'], React.ReactNode> = {
  status: <Bot className="h-4 w-4 text-foreground/60" />,
  search: <Search className="h-4 w-4 text-sky-400" />,
  question: <Info className="h-4 w-4 text-amber-400" />,
  error: <AlertCircle className="h-4 w-4 text-red-400" />,
  file_translated: <FileCode className="h-4 w-4 text-emerald-400" />,
  info: <Info className="h-4 w-4 text-foreground/60" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-400" />,
  success: <CheckCircle className="h-4 w-4 text-emerald-400" />,
  progress: <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />,
};

const messageColors: Record<AgentMessage['type'], string> = {
  status: 'border-border bg-secondary/50',
  search: 'border-sky-700/50 bg-sky-900/20',
  question: 'border-amber-700/50 bg-amber-900/20',
  error: 'border-red-700/50 bg-red-900/20',
  file_translated: 'border-emerald-700/50 bg-emerald-900/20',
  info: 'border-border bg-secondary/50',
  warning: 'border-amber-700/50 bg-amber-900/20',
  success: 'border-emerald-700/50 bg-emerald-900/20',
  progress: 'border-emerald-700/50 bg-emerald-900/20',
};

const messageTextColors: Record<AgentMessage['type'], string> = {
  status: 'text-foreground/80',
  search: 'text-sky-300',
  question: 'text-amber-300',
  error: 'text-red-300',
  file_translated: 'text-emerald-300',
  info: 'text-foreground/80',
  warning: 'text-amber-300',
  success: 'text-emerald-300',
  progress: 'text-emerald-300',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-1 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground/60 transition-all duration-150"
      title="Copy message"
    >
      {copied ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
  );
}

function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-2.5 p-3 rounded-lg border border-emerald-700/30 bg-emerald-900/10"
    >
      <div className="flex items-center gap-1">
        <Bot className="h-4 w-4 text-emerald-400" />
      </div>
      <div className="flex items-center gap-1">
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
        />
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
        />
        <motion.div
          className="h-1.5 w-1.5 rounded-full bg-emerald-400"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
        />
      </div>
      <span className="text-xs text-emerald-400/60">Agent is thinking...</span>
    </motion.div>
  );
}

function SearchResultDisplay({ data }: { data: Record<string, unknown> }) {
  const results = (data.results as Array<Record<string, string>>) || [];
  const query = (data.query as string) || '';

  if (results.length === 0) return null;

  return (
    <div className="mt-2 space-y-1.5">
      {results.slice(0, 3).map((result, i) => (
        <div
          key={i}
          className="flex items-start gap-2 p-2 rounded bg-secondary/60 border border-border/50"
        >
          <Search className="h-3 w-3 text-sky-400 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            {result.title && (
              <p className="text-xs font-medium text-sky-300 truncate">{result.title}</p>
            )}
            {result.snippet && (
              <p className="text-[11px] text-foreground/60 line-clamp-2 mt-0.5">{result.snippet}</p>
            )}
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-sky-500 hover:text-sky-400 mt-1 transition-colors"
              >
                <ExternalLink className="h-2.5 w-2.5" />
                {new URL(result.url).hostname}
              </a>
            )}
          </div>
        </div>
      ))}
      {results.length > 3 && (
        <p className="text-[10px] text-muted-foreground pl-5">
          +{results.length - 3} more results for &quot;{query}&quot;
        </p>
      )}
    </div>
  );
}

function MessageItem({ message }: { message: AgentMessage }) {
  const isCodeRelated = message.type === 'file_translated' ||
    (message.content.includes('```') || message.content.includes('function') || message.content.includes('class '));
  const isSearchResult = message.type === 'search' && message.data;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'group relative flex items-start gap-2.5 p-3 rounded-lg border transition-all duration-150',
        messageColors[message.type]
      )}
    >
      <div className="shrink-0 mt-0.5">{messageIcons[message.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-xs font-medium', messageTextColors[message.type])}>
            {message.type === 'file_translated' && 'File Translated'}
            {message.type === 'status' && 'Status'}
            {message.type === 'search' && 'Search'}
            {message.type === 'question' && 'Question'}
            {message.type === 'error' && 'Error'}
            {message.type === 'info' && 'Info'}
            {message.type === 'warning' && 'Warning'}
            {message.type === 'success' && 'Success'}
            {message.type === 'progress' && 'Progress'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.timestamp)}
          </span>
        </div>
        <p className={cn('text-sm leading-relaxed', messageTextColors[message.type])}>
          {message.content}
        </p>
        {isSearchResult && message.data && (
          <SearchResultDisplay data={message.data} />
        )}
      </div>
      {/* Copy button for code-related messages */}
      {isCodeRelated && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 shrink-0">
          <CopyButton text={message.content} />
        </div>
      )}
    </motion.div>
  );
}

export function AgentChat() {
  const { messages, phase, clearMessages } = useTranslatorStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  const isActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error';
  const isThinking = phase === 'analyzing' || phase === 'translating' || phase === 'verifying';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-card/80">
        <Sparkles className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-foreground">Agent Output</span>
        {messages.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {messages.length} messages
          </span>
        )}
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearMessages}
            className="ml-auto h-6 text-xs text-muted-foreground hover:text-red-400 transition-colors duration-150"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {messages.length === 0 && !isThinking ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bot className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Agent is idle</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Upload files and start an action to see output
              </p>
            </div>
          ) : (
            messages.map((msg) => <MessageItem key={msg.id} message={msg} />)
          )}
        </AnimatePresence>
        {/* Typing indicator */}
        <AnimatePresence>
          {isThinking && <TypingIndicator />}
        </AnimatePresence>
      </div>
    </div>
  );
}
