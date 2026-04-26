'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Send, CornerDownLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslatorStore } from '@/lib/translator-store';

export function QuestionCard() {
  const { currentQuestion, setCurrentQuestion, addMessage, sessionId } =
    useTranslatorStore();
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset answer when question changes
  useEffect(() => {
    if (currentQuestion) {
      setAnswer('');
      // Focus the input when question appears
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [currentQuestion]);

  // Keyboard shortcut: Ctrl+Enter to submit
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && currentQuestion && answer.trim()) {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!currentQuestion) return null;

  const handleSubmit = async () => {
    if (!answer.trim() || !currentQuestion) return;

    setIsSubmitting(true);
    try {
      // Send answer via WebSocket through custom event
      window.dispatchEvent(
        new CustomEvent('translator:answer', {
          detail: {
            questionId: currentQuestion.id,
            answer: answer.trim(),
          },
        })
      );

      addMessage({
        id: `answer-${Date.now()}`,
        type: 'info',
        content: `Answer submitted: "${answer.trim()}"`,
        timestamp: Date.now(),
      });
      setCurrentQuestion(null);
      setAnswer('');
    } catch (error) {
      addMessage({
        id: `error-${Date.now()}`,
        type: 'error',
        content: `Failed to submit answer: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: Date.now(),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="mx-3 mb-3"
      >
        <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <HelpCircle className="h-5 w-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-amber-300 mb-1">
                Agent Question
              </h4>
              <p className="text-sm text-amber-200/80 leading-relaxed">
                {currentQuestion.question}
              </p>
            </div>
          </div>

          {currentQuestion.options && currentQuestion.options.length > 0 && (
            <div className="grid grid-cols-1 gap-2 mb-3">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-lg text-xs border transition-all duration-150',
                    'min-h-[36px] leading-relaxed',
                    answer === option
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm shadow-amber-900/20'
                      : 'border-border bg-secondary/50 text-foreground/60 hover:border-amber-700/50 hover:text-amber-300 hover:bg-secondary/80'
                  )}
                  onClick={() => setAnswer(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your answer..."
              className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-amber-500/30"
              disabled={isSubmitting}
            />
            <Button
              onClick={handleSubmit}
              disabled={!answer.trim() || isSubmitting}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 transition-colors duration-150"
            >
              <Send className="h-4 w-4 mr-1" />
              <CornerDownLeft className="h-3 w-3 opacity-50" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Press <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px] border border-border">Enter</kbd> or <kbd className="px-1 py-0.5 bg-secondary rounded text-[9px] border border-border">Ctrl+Enter</kbd> to submit
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
