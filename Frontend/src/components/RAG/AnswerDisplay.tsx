import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Copy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Loader2,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import SourceCard from "./SourceCard";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Source {
  id: string;
  content: string;
  metadata: Record<string, any>;
}

interface AnswerDisplayProps {
  answer: string;
  sources?: Source[];
  status: "searching" | "generating" | "complete" | "error";
  question: string;
}

export default function AnswerDisplay({
  answer,
  sources = [],
  status,
  question,
}: AnswerDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [displayedText, setDisplayedText] = useState("");
  const sourceRefs = useRef<Record<number, HTMLElement | null>>({});

  /* ============================================================
     STREAMING-SAFE DISPLAY LOGIC
     ============================================================ */
  useEffect(() => {
    if (status === "generating" || status === "complete") {
      setDisplayedText(answer);
    }
  }, [answer, status]);

  const handleCopy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    toast.success("Answer copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!question && status !== "searching" && status !== "generating") {
    return null;
  }

  const showLoader =
    (status === "searching" || status === "generating") &&
    !displayedText;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* ================= LOADING ================= */}
      <AnimatePresence>
        {showLoader && (
          <Card className="border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-950/30 dark:to-indigo-950/30">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
                {status === "searching" ? (
                  <Search className="w-6 h-6 text-white" />
                ) : (
                  <Wand2 className="w-6 h-6 text-white" />
                )}
              </div>

              <div className="flex-1">
                <p className="font-medium">
                  {status === "searching"
                    ? "Searching documents..."
                    : "Generating answer..."}
                </p>
                <p className="text-sm text-slate-500">
                  Please wait a moment
                </p>
              </div>

              <Loader2 className="animate-spin text-violet-500" />
            </CardContent>
          </Card>
        )}
      </AnimatePresence>

      {/* ================= ERROR ================= */}
      <AnimatePresence>
        {status === "error" && (
          <Card className="border-red-300 bg-red-50 dark:bg-red-950/30">
            <CardContent className="p-6 flex gap-4">
              <X className="text-red-500" />
              <p className="text-sm text-red-700 dark:text-red-300">
                {answer || "Something went wrong."}
              </p>
            </CardContent>
          </Card>
        )}
      </AnimatePresence>

      {/* ================= ANSWER ================= */}
      <AnimatePresence>
        {(status === "generating" || status === "complete") &&
          displayedText && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="overflow-hidden dark:bg-slate-800">
                <div className="bg-gradient-to-r from-violet-600 to-indigo-600 px-6 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-2 text-white">
                    <Sparkles className="w-4 h-4" />
                    <span className="text-sm font-medium">
                      {status === "generating"
                        ? "AI Response (Streaming)"
                        : "AI Response"}
                    </span>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="text-white/80 hover:text-white"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                <CardContent className="p-6">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    className="prose prose-slate dark:prose-invert max-w-none"
                  >
                    {displayedText}
                  </ReactMarkdown>

                  {status === "generating" && (
                    <motion.span
                      className="inline-block w-0.5 h-5 bg-violet-500 ml-1 align-middle"
                      animate={{ opacity: [1, 0, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    />
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
      </AnimatePresence>

      {/* ================= SOURCES ================= */}
      <AnimatePresence>
        {status === "complete" && sources.length > 0 && (
          <Card>
            <button
              onClick={() => setShowSources(!showSources)}
              className="w-full px-6 py-4 flex justify-between items-center"
            >
              <div className="flex items-center gap-3">
                <BookOpen />
                <div>
                  <p className="font-medium">Sources Used</p>
                  <p className="text-xs text-slate-500">
                    {sources.length} sources
                  </p>
                </div>
              </div>
              {showSources ? <ChevronUp /> : <ChevronDown />}
            </button>

            <AnimatePresence>
              {showSources && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="p-4 space-y-3">
                    {sources.map((source, i) => (
                      <div
                        key={i}
                        ref={(el) => (sourceRefs.current[i] = el)}
                      >
                        <SourceCard
                          source={source}
                          index={i}
                          defaultExpanded={i === 0}
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
