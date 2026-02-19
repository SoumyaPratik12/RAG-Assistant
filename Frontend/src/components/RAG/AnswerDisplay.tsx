import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Copy,
  CheckCircle2,
  Loader2,
  Search,
  Wand2,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AnswerDisplayProps {
  answer: string;
  status: "searching" | "generating" | "complete" | "error";
  question: string;
}

function normalizePointWiseFormatting(text: string): string {
  let out = text || "";

  // Convert inline dot bullets into markdown list items.
  out = out.replace(/\s*•\s*/g, "\n- ");

  // If list items are stuck after sentence punctuation, put them on a new line.
  out = out.replace(/([.!?])\s*-\s+/g, "$1\n- ");

  // Keep numbered headings/points on separate lines when they get merged.
  out = out.replace(/([^\n])\s(\d+\.\s+\*\*)/g, "$1\n$2");
  out = out.replace(/([^\n])\s(\d+\.\s+[A-Z])/g, "$1\n$2");

  // Normalize excessive blank lines.
  out = out.replace(/\n{3,}/g, "\n\n");

  return out.trim();
}

export default function AnswerDisplay({
  answer,
  status,
  question,
}: AnswerDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [displayedText, setDisplayedText] = useState("");

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
      className="space-y-4 px-1"
    >
      {/* ================= LOADING ================= */}
      <AnimatePresence>
        {showLoader && (
          <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 py-2">
            {status === "searching" ? (
              <Search className="w-4 h-4" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            <p className="text-sm">
              {status === "searching" ? "Searching documents..." : "Generating response..."}
            </p>
            <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
          </div>
        )}
      </AnimatePresence>

      {/* ================= ERROR ================= */}
      <AnimatePresence>
        {status === "error" && (
          <div className="flex gap-3 py-2">
            <X className="text-red-500 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {answer || "Something went wrong."}
            </p>
          </div>
        )}
      </AnimatePresence>

      {/* ================= ANSWER ================= */}
      <AnimatePresence>
        {(status === "generating" || status === "complete") &&
          displayedText && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="prose prose-slate dark:prose-invert max-w-none text-slate-900 dark:text-slate-100 prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-strong:text-slate-900 dark:prose-strong:text-slate-100 prose-p:text-slate-800 dark:prose-p:text-slate-200 prose-li:text-slate-800 dark:prose-li:text-slate-200 prose-h2:text-2xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3 prose-h3:text-xl prose-h3:font-semibold prose-p:leading-8 prose-p:my-4 prose-ul:my-4 prose-ol:my-4 prose-li:my-2 prose-li:leading-7 prose-hr:my-8 [&_ul_ul]:mt-1 [&_ul_ul]:mb-2 [&_ul_ul]:pl-5 [&_ul_ul]:list-disc [&_li>p]:my-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {normalizePointWiseFormatting(displayedText)}
                </ReactMarkdown>
              </div>

              {status === "generating" && (
                <motion.span
                  className="inline-block w-0.5 h-5 bg-violet-500 ml-1 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity }}
                />
              )}
            </motion.div>
          )}
      </AnimatePresence>
    </motion.div>
  );
}
