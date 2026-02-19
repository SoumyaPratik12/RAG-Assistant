import { useState } from "react";
import { ChevronDown, ChevronUp, FileText, Sparkles } from 'lucide-react';
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from 'framer-motion';

const relevanceConfig = {
  high: {
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: '●',
    label: 'High'
  },
  medium: {
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: '◐',
    label: 'Medium'
  },
  low: {
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: '○',
    label: 'Low'
  }
};

type Relevance = "high" | "medium" | "low";

interface Source {
  text?: string;
  content?: string;
  relevance?: Relevance;
}

interface SourceCardProps {
  source: Source;
  index: number;
  defaultExpanded?: boolean;
}

export default function SourceCard({
  source,
  index,
  defaultExpanded = false,
}: SourceCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const relevance = (source.relevance || "medium") as Relevance;
  const config = relevanceConfig[relevance] || relevanceConfig.medium;
  const sourceText = source.text || source.content || "No source text available.";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-all duration-200"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center flex-shrink-0">
          <span className="text-sm font-bold text-slate-500 dark:text-slate-300">{index + 1}</span>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">Source {index + 1}</span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 line-clamp-1">
            {sourceText}
          </p>
        </div>
        
        <Badge variant="outline" className={`${config.color} border text-xs flex-shrink-0`}>
          <Sparkles className="w-3 h-3 mr-1" />
          {config.label}
        </Badge>
        
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 flex-shrink-0" />
        )}
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-100 dark:border-slate-800"
          >
            <div className="p-4 bg-slate-50/50 dark:bg-slate-800/50">
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap">
                {sourceText}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
