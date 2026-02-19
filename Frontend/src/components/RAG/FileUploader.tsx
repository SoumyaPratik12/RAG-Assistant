import React, { useState, useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  FileText,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  File
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FileItemProps {
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress?: number;
  onRemove: (file: File) => void;
}

interface FileWithStatus {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  progress: number;
}

interface FileUploaderProps {
  onFilesProcessed?: (files: File[]) => Promise<void>;
  isProcessing: boolean;
}

const FileItem: React.FC<FileItemProps> = ({ file, status, progress, onRemove }) => {
  const getIcon = () => {
    if (status === 'uploading' || status === 'processing') return Loader2;
    if (status === 'complete') return CheckCircle2;
    if (status === 'error') return AlertCircle;
    return File;
  };

  const getStatusColor = () => {
    if (status === 'uploading' || status === 'processing') return 'text-blue-500';
    if (status === 'complete') return 'text-green-500';
    if (status === 'error') return 'text-red-500';
    return 'text-slate-400';
  };

  const getStatusText = () => {
    if (status === 'uploading') return 'Uploading...';
    if (status === 'processing') return 'Extracting text...';
    if (status === 'complete') return 'Ready';
    if (status === 'error') return 'Failed';
    return 'Pending';
  };

  const Icon = getIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50"
    >
      <div className={`${getStatusColor()} ${status === 'uploading' || status === 'processing' ? 'animate-spin' : ''}`}>
        <Icon className="w-5 h-5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
          {file.name}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {(file.size / 1024).toFixed(1)} KB
          </p>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <Badge 
            variant="secondary" 
            className={`text-xs ${
              status === 'complete' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
              status === 'error' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
              'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
            }`}
          >
            {getStatusText()}
          </Badge>
        </div>
        
        {(status === 'uploading' || status === 'processing') && progress !== undefined && (
          <Progress value={progress} className="h-1 mt-2" />
        )}
      </div>
      
      {status !== 'uploading' && status !== 'processing' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onRemove(file)}
          className="h-8 w-8 text-slate-400 hover:text-red-500 dark:text-slate-500 dark:hover:text-red-400"
        >
          <X className="w-4 h-4" />
        </Button>
      )}
    </motion.div>
  );
};

export default function FileUploader({ onFilesProcessed, isProcessing }: FileUploaderProps) {
  const [files, setFiles] = useState<FileWithStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedTypes = {
    'application/pdf': ['.pdf'],
    'application/msword': ['.doc'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'text/plain': ['.txt']
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    handleFiles(selectedFiles);
    e.target.value = ''; // Reset input
  };

  const handleFiles = (newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      const isValidType = Object.keys(acceptedTypes).includes(file.type) ||
                          file.name.match(/\.(pdf|doc|docx|txt)$/i);
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB max
      return isValidType && isValidSize;
    });

    const filesWithStatus: FileWithStatus[] = validFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      status: 'pending' as const,
      progress: 0
    }));

    setFiles(prev => [...prev, ...filesWithStatus]);
    processFiles(filesWithStatus);
  };

  const processFiles = async (filesToProcess: FileWithStatus[]) => {
    if (!onFilesProcessed) return;

    try {
      // Update all files to uploading status
      filesToProcess.forEach(fileItem => {
        updateFileStatus(fileItem.id, 'uploading', 50);
      });

      // Process all files at once
      await onFilesProcessed(filesToProcess.map(f => f.file));

      // Mark all as complete
      filesToProcess.forEach(fileItem => {
        updateFileStatus(fileItem.id, 'complete', 100);
      });
    } catch (error) {
      console.error('File processing error:', error);
      // Mark all as error
      filesToProcess.forEach(fileItem => {
        updateFileStatus(fileItem.id, 'error', 0);
      });
    }
  };

  const updateFileStatus = (id: string, status: FileWithStatus['status'], progress: number) => {
    setFiles(prev => prev.map(f =>
      f.id === id ? { ...f, status, progress } : f
    ));
  };

  const removeFile = (fileToRemove: File) => {
    setFiles(prev => prev.filter(f => f.file !== fileToRemove));
  };

  const clearCompleted = () => {
    setFiles(prev => prev.filter(f => f.status !== 'complete' && f.status !== 'error'));
  };

  return (
    <Card className="border-slate-200/60 dark:border-slate-700 shadow-sm dark:bg-slate-800">
      <CardContent className="p-4 space-y-4">
        {/* Drop Zone */}
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
            isDragging
              ? 'border-violet-400 bg-violet-50 dark:bg-violet-950/30'
              : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <div className="flex flex-col items-center text-center">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950 dark:to-indigo-950 flex items-center justify-center mb-4">
              <Upload className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
            
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              {isDragging ? 'Drop files here' : 'Upload documents'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              PDF, DOC, DOCX, or TXT • Max 10MB each
            </p>
            
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessing}
              className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 dark:from-violet-700 dark:to-indigo-700 dark:hover:from-violet-800 dark:hover:to-indigo-800"
            >
              <FileText className="w-4 h-4 mr-2" />
              Choose Files
            </Button>
          </div>
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                Uploaded Files ({files.length})
              </p>
              {files.some(f => f.status === 'complete' || f.status === 'error') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCompleted}
                  className="text-xs text-slate-500 dark:text-slate-400"
                >
                  Clear completed
                </Button>
              )}
            </div>
            
            <div className="space-y-2 max-h-64 overflow-y-auto">
              <AnimatePresence>
                {files.map((fileItem) => (
                  <FileItem
                    key={fileItem.id}
                    file={fileItem.file}
                    status={fileItem.status}
                    progress={fileItem.progress}
                    onRemove={removeFile}
                  />
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
