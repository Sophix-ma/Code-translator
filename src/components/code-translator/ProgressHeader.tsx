'use client';

import { motion } from 'framer-motion';
import {
  Loader2,
  Search,
  ArrowRightLeft,
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Circle,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useTranslatorStore, type Phase } from '@/lib/translator-store';

const phaseConfig: Record<
  Phase,
  { label: string; icon: React.ReactNode; color: string }
> = {
  idle: {
    label: 'Ready',
    icon: <Circle className="h-4 w-4" />,
    color: 'text-muted-foreground',
  },
  uploading: {
    label: 'Uploading Files',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
    color: 'text-sky-500 dark:text-sky-400',
  },
  analyzing: {
    label: 'Analyzing Project',
    icon: <Search className="h-4 w-4" />,
    color: 'text-amber-500 dark:text-amber-400',
  },
  translating: {
    label: 'Translating Code',
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: 'text-emerald-500 dark:text-emerald-400',
  },
  verifying: {
    label: 'Verifying Code',
    icon: <ShieldCheck className="h-4 w-4" />,
    color: 'text-purple-500 dark:text-purple-400',
  },
  complete: {
    label: 'Complete',
    icon: <CheckCircle className="h-4 w-4" />,
    color: 'text-emerald-500 dark:text-emerald-400',
  },
  error: {
    label: 'Error',
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-red-500 dark:text-red-400',
  },
};

export function ProgressHeader() {
  const { phase, progress, currentFile, sourceLang, targetLang } =
    useTranslatorStore();
  const config = phaseConfig[phase];

  const isProgressBarActive = phase !== 'idle' && phase !== 'complete' && phase !== 'error';
  const showCurrentFile = currentFile && phase !== 'complete' && phase !== 'idle' && phase !== 'error';
  const showProgressSection = phase !== 'idle' && phase !== 'complete' && phase !== 'error';

  return (
    <div className="px-4 py-3 border-b border-border bg-card/80">
      {/* Phase indicator */}
      <div className="flex items-center gap-2 mb-2">
        <motion.div
          key={phase}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={cn('flex items-center gap-1.5', config.color)}
        >
          {config.icon}
          <span className="text-sm font-medium">{config.label}</span>
        </motion.div>
        {sourceLang && targetLang && (
          <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{sourceLang}</span>
            <ArrowRightLeft className="h-3 w-3" />
            <span>{targetLang}</span>
          </div>
        )}
      </div>

      {/* Progress bar - only show during active phases, not when complete */}
      {showProgressSection ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative">
            <Progress
              value={progress}
              className={cn(
                'h-1.5 bg-secondary transition-all duration-300',
                isProgressBarActive
                  ? '[&>div]:bg-emerald-500 [&>div]:shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                  : '[&>div]:bg-emerald-500'
              )}
            />
            {/* Glow effect on active progress */}
            {isProgressBarActive && progress > 0 && (
              <motion.div
                className="absolute top-0 left-0 h-1.5 rounded-full bg-emerald-400/30 blur-sm pointer-events-none"
                style={{ width: `${progress}%` }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </div>
          {showCurrentFile && (
            <motion.p
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="text-[11px] text-muted-foreground mt-1.5 truncate"
            >
              Processing: <span className="text-foreground/70">{currentFile}</span>
            </motion.p>
          )}
        </motion.div>
      ) : phase === 'complete' ? (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <div className="h-1.5 flex-1 rounded-full bg-emerald-500/20">
            <div className="h-full rounded-full bg-emerald-500 w-full" />
          </div>
          <span className="text-[11px] text-emerald-400 font-medium shrink-0">100%</span>
        </motion.div>
      ) : phase === 'error' ? (
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2"
        >
          <div className="h-1.5 flex-1 rounded-full bg-red-500/20">
            <div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(progress, 10)}%` }} />
          </div>
          <span className="text-[11px] text-red-400 font-medium shrink-0">Failed</span>
        </motion.div>
      ) : null}
    </div>
  );
}
