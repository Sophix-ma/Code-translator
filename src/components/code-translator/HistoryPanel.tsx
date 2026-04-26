'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Trash2, Download, FileCode, Clock, ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslatorStore, type HistoryEntry } from '@/lib/translator-store';

interface HistoryPanelProps {
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // Less than 1 minute
  if (diff < 60000) return 'Just now';
  // Less than 1 hour
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  // Less than 24 hours
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  // Less than 7 days
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  // Otherwise
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    complete: 'bg-emerald-900/30 text-emerald-400 border-emerald-800/40',
    error: 'bg-red-900/30 text-red-400 border-red-800/40',
    analyzing: 'bg-amber-900/30 text-amber-400 border-amber-800/40',
    translating: 'bg-emerald-900/30 text-emerald-400 border-emerald-800/40',
    verifying: 'bg-purple-900/30 text-purple-400 border-purple-800/40',
  };
  return (
    <span className={cn(
      'text-[10px] px-1.5 py-0.5 rounded border capitalize',
      styles[status] || 'bg-secondary text-muted-foreground border-border'
    )}>
      {status}
    </span>
  );
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const { history, setHistory } = useTranslatorStore();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const handleDelete = useCallback(async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setHistory(history.filter((h) => h.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete history entry:', error);
    } finally {
      setDeleting(null);
    }
  }, [history, setHistory]);

  const handleLoadHistory = useCallback(async (entry: HistoryEntry) => {
    setLoading(entry.id);
    try {
      const res = await fetch(`/api/history/${entry.id}`);
      if (res.ok) {
        const data = await res.json();
        // Parse translated files from history — JSON string from DB
        let translated: Record<string, string> = {};
        try {
          translated = JSON.parse(data.translatedFiles || '{}');
        } catch {
          console.warn('Failed to parse translatedFiles from history');
        }
        const store = useTranslatorStore.getState();
        store.loadFromHistory({
          sessionId: data.sessionId,
          sourceLang: data.sourceLang,
          targetLang: data.targetLang,
          translatedFiles: translated,
        });
        onClose(); // Close history panel after loading
      }
    } catch (error) {
      console.error('Failed to load history entry:', error);
    } finally {
      setLoading(null);
    }
  }, [onClose]);

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-foreground">Translation History</h3>
          <span className="text-[10px] text-muted-foreground">({history.length})</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Clock className="h-8 w-8 mb-3 opacity-40" />
            <p className="text-sm">No translation history yet</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Completed translations will appear here</p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 rounded-lg border border-border bg-secondary/30 hover:border-border transition-colors group"
              >
                {/* Top row: languages + status */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-foreground/80 font-medium">{entry.sourceLang}</span>
                    <ArrowRightLeft className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-400 font-medium">{entry.targetLang}</span>
                  </div>
                  <StatusBadge status={entry.status} />
                </div>

                {/* File counts */}
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <FileCode className="h-3 w-3" />
                    <span>{entry.fileCount} source</span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-emerald-500">
                    <FileCode className="h-3 w-3" />
                    <span>{entry.translatedCount} translated</span>
                  </div>
                  {entry.llmModel && (
                    <span className="text-[10px] text-muted-foreground ml-auto">{entry.llmModel}</span>
                  )}
                </div>

                {/* Bottom row: time + actions */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    {formatDate(entry.createdAt)}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {entry.status === 'complete' && entry.translatedCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleLoadHistory(entry)}
                        disabled={loading === entry.id}
                        className="h-6 text-[10px] text-emerald-400 hover:text-emerald-300 px-1.5"
                      >
                        {loading === entry.id ? (
                          <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3 mr-0.5" />
                        )}
                        Load
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      disabled={deleting === entry.id}
                      className="h-6 text-[10px] text-muted-foreground hover:text-red-400 px-1.5"
                    >
                      {deleting === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
