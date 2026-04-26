'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useTranslatorStore, type FileEntry } from '@/lib/translator-store';

interface FileTreeNodeProps {
  entry: FileEntry;
  depth: number;
  isSource: boolean;
  fileSize?: number;
}

const fileIconMap: Record<string, string> = {
  '.py': 'python',
  '.js': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.jsx': 'javascript',
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

function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  return lastDot >= 0 ? filename.substring(lastDot) : '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTreeNode({ entry, depth, isSource, fileSize }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const { openFile, translatedFiles, sourceFiles } = useTranslatorStore();

  const isDir = entry.type === 'directory';
  const ext = getFileExtension(entry.name);
  const isActive = isSource
    ? entry.path in sourceFiles
    : entry.path in translatedFiles;

  const handleClick = useCallback(() => {
    if (isDir) {
      setExpanded((prev) => !prev);
    } else {
      openFile(entry.path, isSource ? 'source' : 'translated');
    }
  }, [isDir, entry.path, openFile, isSource]);

  const getFileIcon = () => {
    if (isDir) {
      return expanded ? (
        <FolderOpen className="h-4 w-4 text-emerald-400" />
      ) : (
        <Folder className="h-4 w-4 text-emerald-400" />
      );
    }
    if (ext in fileIconMap) {
      return (
        <FileCode
          className={cn(
            'h-4 w-4',
            isSource ? 'text-foreground/60' : 'text-emerald-400'
          )}
        />
      );
    }
    if (['.md', '.txt', '.rst'].includes(ext)) {
      return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
    return <File className="h-4 w-4 text-muted-foreground" />;
  };

  // Count files in directory recursively
  const countFiles = (e: FileEntry): number => {
    if (e.type === 'file') return 1;
    return (e.children || []).reduce((sum, child) => sum + countFiles(child), 0);
  };

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-accent/50 transition-all duration-150 group',
          isActive && 'bg-accent/30'
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={handleClick}
      >
        {isDir ? (
          expanded ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0 transition-transform duration-150" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {getFileIcon()}
        <span
          className={cn(
            'text-sm truncate flex-1',
            isSource ? 'text-foreground/80' : 'text-emerald-300'
          )}
        >
          {entry.name}
        </span>
        {/* File size for files */}
        {!isDir && fileSize !== undefined && fileSize > 0 && (
          <span className="text-[10px] text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            {formatFileSize(fileSize)}
          </span>
        )}
        {/* File count badge for directories */}
        {isDir && entry.children && entry.children.length > 0 && (
          <Badge
            variant="secondary"
            className="h-4 px-1 text-[9px] bg-secondary text-muted-foreground border-border shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          >
            {countFiles(entry)}
          </Badge>
        )}
        {!isSource && !isDir && (
          <span className="ml-auto text-[10px] text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            translated
          </span>
        )}
      </div>
      {isDir && expanded && entry.children && (
        <AnimatePresence initial={false}>
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {entry.children.map((child) => (
              <FileTreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                isSource={isSource}
                fileSize={child.size}
              />
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

interface FileTreeProps {
  className?: string;
}

export function FileTree({ className }: FileTreeProps) {
  const { sourceFiles, translatedFiles, phase } = useTranslatorStore();

  const sourceEntries = buildFileTree(Object.keys(sourceFiles));
  const translatedEntries = buildFileTree(Object.keys(translatedFiles));

  const hasSource = sourceEntries.length > 0;
  const hasTranslated = translatedEntries.length > 0;
  const isLoading = phase === 'uploading' || phase === 'analyzing';

  const sourceFileCount = Object.keys(sourceFiles).length;
  const translatedFileCount = Object.keys(translatedFiles).length;

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-card/80">
        <FileCode className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-medium text-foreground">Files</span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
        {isLoading && !hasSource && !hasTranslated && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 mb-2 animate-spin text-emerald-400" />
            <p className="text-sm">Scanning files...</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Please wait</p>
          </div>
        )}
        {hasSource && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50">
              <div className="h-2 w-2 rounded-full bg-muted-foreground" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Source
              </span>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[9px] bg-secondary text-muted-foreground border-border"
              >
                {sourceFileCount}
              </Badge>
            </div>
            {sourceEntries.map((entry) => (
              <FileTreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                isSource={true}
                fileSize={entry.size}
              />
            ))}
          </div>
        )}
        {hasTranslated && (
          <div className="mb-2">
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50 border-t border-t-emerald-800/30">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">
                Translated
              </span>
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[9px] bg-emerald-900/30 text-emerald-400 border-emerald-800/40"
              >
                {translatedFileCount}
              </Badge>
            </div>
            {translatedEntries.map((entry) => (
              <FileTreeNode
                key={entry.path}
                entry={entry}
                depth={0}
                isSource={false}
                fileSize={entry.size}
              />
            ))}
          </div>
        )}
        {!hasSource && !hasTranslated && !isLoading && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Folder className="h-8 w-8 mb-2 opacity-50" />
            </motion.div>
            <p className="text-sm">No files loaded</p>
            <p className="text-xs text-muted-foreground/60">
              Upload a project to get started
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function buildFileTree(paths: string[]): FileEntry[] {
  const root: FileEntry[] = [];
  const map = new Map<string, FileEntry>();

  for (const path of paths.sort()) {
    const parts = path.split('/');
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const parentPath = currentPath;
      currentPath = currentPath ? `${currentPath}/${name}` : name;

      if (!map.has(currentPath)) {
        const isFile = i === parts.length - 1;
        const entry: FileEntry = {
          name,
          path: currentPath,
          type: isFile ? 'file' : 'directory',
          size: 0,
          children: isFile ? undefined : [],
        };
        map.set(currentPath, entry);

        if (parentPath) {
          const parent = map.get(parentPath);
          if (parent && parent.children) {
            parent.children.push(entry);
          }
        } else {
          root.push(entry);
        }
      }
    }
  }

  return root;
}
