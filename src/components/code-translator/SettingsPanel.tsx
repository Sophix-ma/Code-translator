'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslatorStore } from '@/lib/translator-store';

type TestResult = 'idle' | 'testing' | 'success' | 'error';

export function SettingsPanel() {
  const { llmConfig, setLLMConfig } = useTranslatorStore();
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState(llmConfig.baseUrl);
  const [apiKey, setApiKey] = useState(llmConfig.apiKey);
  const [modelName, setModelName] = useState(llmConfig.modelName);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>('idle');
  const [testMessage, setTestMessage] = useState('');

  // Sync state when dialog opens via callback (avoids setState in effect)
  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      const { llmConfig: currentConfig } = useTranslatorStore.getState();
      setBaseUrl(currentConfig.baseUrl);
      setApiKey(currentConfig.apiKey);
      setModelName(currentConfig.modelName);
      setTestResult('idle');
      setTestMessage('');
    }
    setOpen(nextOpen);
  }, []);

  // Keyboard shortcut: Escape to close dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const handleSave = () => {
    setLLMConfig({ baseUrl, apiKey, modelName });
    setOpen(false);
  };

  const handleTestConnection = async () => {
    if (!baseUrl.trim() || !apiKey.trim() || !modelName.trim()) return;

    setTestResult('testing');
    setTestMessage('');

    try {
      // Call the LLM API to test the connection
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
          max_tokens: 5,
          temperature: 0,
        }),
      });

      if (res.ok) {
        setTestResult('success');
        setTestMessage('Connection successful! API key is valid.');
      } else {
        const data = await res.json().catch(() => null);
        const msg = data?.error?.message || res.statusText || 'Unknown error';
        setTestResult('error');
        setTestMessage(`API error: ${msg}`);
      }
    } catch (err) {
      setTestResult('error');
      setTestMessage(err instanceof Error ? err.message : 'Network error — check the Base URL');
    }
  };

  const isValid = baseUrl.trim() && apiKey.trim() && modelName.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Settings className="h-4 w-4 text-emerald-400" />
            LLM Configuration
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* LLM Config */}
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Configure your OpenAI-compatible LLM API. These settings are saved locally in your browser.
            </p>
            <div className="space-y-2">
              <Label htmlFor="baseUrl" className="text-foreground/60 text-xs">
                Base URL
              </Label>
              <Input
                id="baseUrl"
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={(e) => { setBaseUrl(e.target.value); setTestResult('idle'); }}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/30"
              />
              <p className="text-[10px] text-muted-foreground">The base URL of your OpenAI-compatible API endpoint</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-foreground/60 text-xs">
                API Key
              </Label>
              <div className="relative">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestResult('idle'); }}
                  className="bg-secondary border-border text-foreground placeholder:text-muted-foreground pr-10 focus-visible:ring-emerald-500/30"
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground/80 transition-colors duration-150"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Your API key (stored locally in your browser)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="modelName" className="text-foreground/60 text-xs">
                Model Name
              </Label>
              <Input
                id="modelName"
                placeholder="gpt-4"
                value={modelName}
                onChange={(e) => { setModelName(e.target.value); setTestResult('idle'); }}
                className="bg-secondary border-border text-foreground placeholder:text-muted-foreground focus-visible:ring-emerald-500/30"
              />
              <p className="text-[10px] text-muted-foreground">The model to use (e.g., gpt-4, gpt-3.5-turbo, deepseek-chat)</p>
            </div>
          </div>

          {/* Test Connection Result */}
          {testResult !== 'idle' && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'flex items-start gap-2 p-3 rounded-lg border',
                testResult === 'testing' && 'border-sky-700/50 bg-sky-900/20',
                testResult === 'success' && 'border-emerald-700/50 bg-emerald-900/20',
                testResult === 'error' && 'border-red-700/50 bg-red-900/20',
              )}
            >
              {testResult === 'testing' && (
                <Loader2 className="h-4 w-4 text-sky-400 animate-spin shrink-0 mt-0.5" />
              )}
              {testResult === 'success' && (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              )}
              {testResult === 'error' && (
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'text-xs font-medium',
                  testResult === 'testing' && 'text-sky-300',
                  testResult === 'success' && 'text-emerald-300',
                  testResult === 'error' && 'text-red-300',
                )}>
                  {testResult === 'testing' && 'Testing connection...'}
                  {testResult === 'success' && 'Connection Successful'}
                  {testResult === 'error' && 'Connection Failed'}
                </p>
                {testMessage && (
                  <p className={cn(
                    'text-[11px] mt-0.5 break-words',
                    testResult === 'success' && 'text-emerald-400/70',
                    testResult === 'error' && 'text-red-400/70',
                  )}>
                    {testMessage}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            Cancel
            <span className="ml-1.5 text-[10px] text-muted-foreground">Esc</span>
          </Button>
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={!isValid || testResult === 'testing'}
            className={cn(
              'transition-colors duration-150 gap-1.5',
              isValid && 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20 hover:text-emerald-300',
              !isValid && 'text-muted-foreground cursor-not-allowed',
            )}
          >
            {testResult === 'testing' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Zap className="h-3.5 w-3.5" />
            )}
            Test
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid}
            className={cn(
              'transition-colors duration-150',
              isValid
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-secondary text-muted-foreground cursor-not-allowed'
            )}
          >
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
