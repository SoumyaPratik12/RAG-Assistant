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

const ROOT_HEADINGS = new Map<string, string>([
  ["main topics covered", "Main Topics Covered"],
  ["main sections in the file", "Main Sections in the File"],
  ["main sections", "Main Sections in the File"],
  ["in short", "In Short"],
  ["definition", "Definition"],
  ["simple analogy", "Simple Analogy"],
]);

function stripStrong(line: string): string {
  return line.replace(/^\*\*(.+?)\*\*$/g, "$1").trim();
}

function deEmphasizeMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1");
}

function ensureSuffix(line: string, suffix: ":" | ";" | "."): string {
  const cleaned = line.trim();
  if (!cleaned) return "";
  if (/[.:;!?]$/.test(cleaned)) return cleaned;
  return `${cleaned}${suffix}`;
}

function isLikelySectionTitle(line: string): boolean {
  const cleaned = stripStrong(line);
  if (!cleaned) return false;
  if (ROOT_HEADINGS.has(cleaned.toLowerCase())) return false;
  if (/[.;!?]$/.test(cleaned)) return false;
  if (cleaned.split(/\s+/).length > 8) return false;
  if (/^\d+\./.test(cleaned)) return false;
  return /^[A-Z][A-Za-z0-9 ,/&()'-]+$/.test(cleaned);
}

function applyListPunctuation(lines: string[]): string[] {
  const out = [...lines];
  for (let i = 0; i < out.length; i += 1) {
    const line = out[i];
    if (!/^\s*-\s+/.test(line)) continue;
    if (/\*\*.*:\*\*$/.test(line) || /[.:;!?]$/.test(line)) continue;

    let next = "";
    for (let j = i + 1; j < out.length; j += 1) {
      if (out[j].trim()) {
        next = out[j];
        break;
      }
    }
    const shouldUseSemicolon = /^\s*-\s+/.test(next);
    out[i] = ensureSuffix(line, shouldUseSemicolon ? ";" : ".");
  }
  return out;
}

function normalizePointWiseFormatting(text: string): string {
  const seeded = (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\s*•\s*/g, "\n- ")
    .replace(/([.!?])\s*-\s+/g, "$1\n- ")
    .replace(/([^\n])\s(\d+\.\s+\*\*)/g, "$1\n$2")
    .replace(/([^\n])\s(\d+\.\s+[A-Z])/g, "$1\n$2");

  const rawLines = seeded
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (!rawLines.length) return "";

  const hasStructuredMarkdown = rawLines.some(
    (line) => /^(\s*[-*+]\s+|\s*\d+\.\s+|#+\s+)/.test(line)
  );
  if (hasStructuredMarkdown) {
    return deEmphasizeMarkdown(seeded.replace(/\n{3,}/g, "\n\n").trim());
  }

  const lines: string[] = [];
  let inMainSections = false;
  let hasSectionTitle = false;

  for (const line of rawLines) {
    const plain = stripStrong(line);
    const lower = plain.toLowerCase();
    const heading = ROOT_HEADINGS.get(lower);

    if (heading) {
      inMainSections = heading === "Main Sections in the File";
      hasSectionTitle = false;
      if (lines.length && lines[lines.length - 1] !== "") lines.push("");
      lines.push(ensureSuffix(heading, ":"));
      lines.push("");
      continue;
    }

    if (inMainSections && isLikelySectionTitle(line)) {
      lines.push(`- ${ensureSuffix(plain, ":")}`);
      hasSectionTitle = true;
      continue;
    }

    if (inMainSections) {
      const point = ensureSuffix(plain, ";");
      lines.push(hasSectionTitle ? `  - ${point}` : `- ${point}`);
      continue;
    }

    lines.push(ensureSuffix(plain, "."));
    lines.push("");
  }

  const punctuated = applyListPunctuation(lines);
  const normalized = punctuated.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return deEmphasizeMarkdown(normalized);
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
            <Loader2 className="w-4 h-4 animate-spin text-cyan-500" />
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
              className="space-y-3 rounded-2xl border border-white/10 bg-white/10 p-4"
            >
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  {copied ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>

              <div className="prose prose-slate dark:prose-invert max-w-none text-slate-900 dark:text-slate-100 prose-headings:font-normal prose-headings:text-slate-900 dark:prose-headings:text-slate-100 prose-strong:font-normal prose-strong:text-slate-900 dark:prose-strong:text-slate-100 prose-p:text-slate-800 dark:prose-p:text-slate-200 prose-li:text-slate-800 dark:prose-li:text-slate-200 prose-p:leading-8 prose-p:my-5 prose-ul:my-5 prose-ol:my-5 prose-li:my-3 prose-li:leading-8 prose-hr:my-8 [&_ul_ul]:mt-2 [&_ul_ul]:mb-3 [&_ul_ul]:pl-5 [&_ul_ul]:list-disc [&_li>p]:my-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    strong: ({ children }) => <span>{children}</span>,
                  }}
                >
                  {normalizePointWiseFormatting(displayedText)}
                </ReactMarkdown>
              </div>

              {status === "generating" && (
                <motion.span
                  className="ml-1 inline-block h-5 w-0.5 align-middle bg-cyan-500"
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
