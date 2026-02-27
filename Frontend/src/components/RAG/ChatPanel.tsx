import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ArrowUp,
  Trash2,
  Lightbulb,
  Paperclip,
} from "lucide-react";
import { motion } from "framer-motion";
import AnswerDisplay from "./AnswerDisplay";
import ConversationHistory from "./ConversationHistory";
import { clearKnowledgeBase, streamQuery, uploadFiles } from "@/lib/api";
import { useRAG } from "@/context/RAGContext";
import { toast } from "sonner";

interface Conversation {
  id: number;
  question: string;
  answer: string;
  status: "searching" | "generating" | "complete" | "error";
}

const exampleQuestions = [
  "What are the main topics covered in my documents?",
  "Can you summarize the key points?",
  "What specific details are mentioned about...",
];

interface RetrievalSettings {
  topK: number;
  threshold: number;
  embeddingModel: string;
}

export default function ChatPanel({
  hasDocuments = false,
  settings,
}: {
  hasDocuments?: boolean;
  settings?: RetrievalSettings;
}) {
  /* ---------------- STATE ---------------- */
  const { setIngesting, setDocumentsReady } = useRAG();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [currentConversationId, setCurrentConversationId] =
    useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accumulatorRef = useRef("");
  const rafRef = useRef<number | null>(null);
  const pendingFlushTimeoutRef = useRef<number | null>(null);
  const lastFlushAtRef = useRef(0);
  const flushIntervalMs = 90;

  const clearPendingFlush = () => {
    if (pendingFlushTimeoutRef.current !== null) {
      window.clearTimeout(pendingFlushTimeoutRef.current);
      pendingFlushTimeoutRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const flushAnswer = () => {
    setCurrentConversation((prevConv) =>
      prevConv
        ? {
            ...prevConv,
            answer: accumulatorRef.current,
            status: "generating",
          }
        : prevConv
    );
    rafRef.current = null;
    lastFlushAtRef.current = performance.now();
  };

  const scheduleFlush = () => {
    const enqueueFlush = () => {
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(flushAnswer);
    };

    const now = performance.now();
    const elapsed = now - lastFlushAtRef.current;
    if (elapsed >= flushIntervalMs) {
      enqueueFlush();
      return;
    }

    if (pendingFlushTimeoutRef.current !== null) return;
    pendingFlushTimeoutRef.current = window.setTimeout(() => {
      pendingFlushTimeoutRef.current = null;
      enqueueFlush();
    }, flushIntervalMs - elapsed);
  };

  /* ---------------- ASK HANDLER ---------------- */

  const handleAsk = async (q: string) => {
    if (!q.trim() || isLoading) return;

    setIsLoading(true);
    accumulatorRef.current = "";

    const pending: Conversation = {
      id: Date.now(),
      question: q,
      answer: "",
      status: "searching",
    };

    setCurrentConversation(pending);
    setCurrentConversationId(pending.id);

    try {
      await streamQuery(
        {
          query: q,
          ...(settings?.topK !== undefined ? { topK: settings.topK } : {}),
          ...(settings?.threshold !== undefined ? { threshold: settings.threshold } : {}),
        },

        /* -------- ON CHUNK -------- */
        (chunk) => {
          accumulatorRef.current += chunk;
          scheduleFlush();
        },

        /* -------- ON DONE -------- */
        () => {
          const finalAnswer =
            accumulatorRef.current || "No response generated.";

          setConversations((prev) => [
            ...prev,
            {
              ...pending,
              answer: finalAnswer,
              status: "complete",
            },
          ]);

          setCurrentConversation(null);
          setIsLoading(false);
          accumulatorRef.current = "";
          clearPendingFlush();
        },

        /* -------- ON ERROR -------- */
        (error) => {
          console.error("Stream error:", error);

          setCurrentConversation({
            ...pending,
            answer:
              error.message ||
              "Something went wrong. Please check your backend.",
            status: "error",
          });

          setIsLoading(false);
          accumulatorRef.current = "";
          clearPendingFlush();
        }
      );
    } catch (err) {
      console.error("Unexpected error:", err);

      setCurrentConversation({
        ...pending,
        answer: "Unexpected error occurred. Please try again.",
        status: "error",
      });

      setIsLoading(false);
      accumulatorRef.current = "";
      clearPendingFlush();
    }
  };

  /* ---------------- CLEAR CURRENT ---------------- */

  const onClear = () => {
    if (!currentConversationId) return;

    setConversations((prev) =>
      prev.filter((c) => c.id !== currentConversationId)
    );

    setCurrentConversation(null);
    setCurrentConversationId(null);
  };

  /* ---------------- HISTORY ---------------- */

  const onSelectConversation = (conv: Conversation) => {
    setCurrentConversation(null);
    setCurrentConversationId(conv.id);
  };

  const onDeleteConversation = (id: number) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (currentConversationId === id) {
      setCurrentConversationId(null);
    }
  };

  /* ---------------- SUBMIT ---------------- */

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    handleAsk(question);
    setQuestion("");
  };

  const handleQuestionKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (e.key !== "Enter" || e.shiftKey) return;
    if ((e.nativeEvent as any)?.isComposing) return;

    e.preventDefault();
    if (!question.trim() || isLoading || !hasDocuments || isUploadingFiles) return;
    handleAsk(question);
    setQuestion("");
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    if (files.length > 2) {
      toast.error("You can upload up to 2 files at a time.");
      return;
    }

    setIsUploadingFiles(true);
    setIngesting(true);
    try {
      const result: any = await uploadFiles(files);
      const ingestedNames =
        Array.isArray(result?.files_ingested) && result.files_ingested.length > 0
          ? result.files_ingested
          : files.map((f) => f.name);

      setUploadedFiles(ingestedNames.slice(0, 2));

      setDocumentsReady(true);
      toast.success(`${files.length} file(s) uploaded successfully`);
    } catch (err: any) {
      console.error("File upload failed:", err);
      setDocumentsReady(false);
      toast.error(err.message || "File upload failed");
    } finally {
      setIngesting(false);
      setIsUploadingFiles(false);
    }
  };

  const isEmptyState = conversations.length === 0 && !currentConversation;

  const renderInputForm = (wrapperClassName = "max-w-5xl mx-auto") => (
    <form onSubmit={handleSubmit} className={wrapperClassName}>
      {uploadedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploadedFiles.map((name) => (
            <span
              key={name}
              className="max-w-[220px] truncate rounded-lg border border-slate-100/30 bg-slate-100/20 px-2.5 py-1 text-xs text-black"
              title={name}
            >
              {name}
            </span>
          ))}
        </div>
      )}

      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt,.md"
          className="hidden"
          onChange={handleFilesSelected}
        />

        <textarea
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleQuestionKeyDown}
          disabled={!hasDocuments || isLoading || isUploadingFiles}
          placeholder=""
          className="flex !h-[90px] min-h-[90px] w-full resize-none rounded-xl border border-slate-100/30 bg-slate-100/20 pb-9 pl-14 pr-14 pt-3 text-sm leading-relaxed text-black placeholder:text-black/60 shadow-inner shadow-slate-900/10 focus:outline-none focus:ring-2 focus:ring-cyan-500/70 disabled:cursor-not-allowed disabled:opacity-50"
        />

        <Button
          type="button"
          variant="outline"
          onClick={handleAttachClick}
          disabled={isUploadingFiles || isLoading}
          aria-label={isUploadingFiles ? "Uploading files" : "Add or upload files"}
          className="absolute bottom-1.5 left-2 h-8 w-8 bg-slate-100/20 p-0 hover:bg-slate-100/35"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <Button
          type="submit"
          disabled={!question.trim() || isLoading || !hasDocuments || isUploadingFiles}
          aria-label="Ask"
          className="absolute bottom-1.5 right-2 h-8 w-8 bg-slate-100/20 p-0 hover:bg-slate-100/35"
        >
          <ArrowUp className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );

  /* ---------------- AUTO SCROLL ---------------- */

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations, currentConversation]);

  useEffect(() => {
    const handleNewChat = () => {
      if (isLoading || isUploadingFiles) return;
      setConversations([]);
      setCurrentConversation(null);
      setCurrentConversationId(null);
      setQuestion("");
      setUploadedFiles([]);
      setDocumentsReady(false);
      inputRef.current?.focus();

      void (async () => {
        try {
          await clearKnowledgeBase();
        } catch (err) {
          console.error("Failed to clear knowledge base:", err);
          toast.error("Could not clear previous attached files");
        }
      })();
    };

    window.addEventListener("rag:new-chat", handleNewChat);
    return () => {
      window.removeEventListener("rag:new-chat", handleNewChat);
    };
  }, [isLoading, isUploadingFiles, setDocumentsReady]);

  useEffect(() => {
    return () => {
      clearPendingFlush();
    };
  }, []);

  /* ---------------- RENDER ---------------- */

  return (
    <div className="flex h-full flex-col">
      <div className="bg-slate-100/10 p-4 sm:p-5">
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            <ConversationHistory
              conversations={conversations}
              onSelectConversation={onSelectConversation}
              onDeleteConversation={onDeleteConversation}
              currentConversationId={currentConversationId}
            />

            {(conversations.length > 0 || currentConversation) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                className="text-black hover:text-red-500"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Current
              </Button>
            )}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {isEmptyState && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="min-h-[68vh] flex flex-col items-center justify-center py-10 text-center"
            >
              <p className="text-3xl font-semibold tracking-tight text-black/75 [text-shadow:0_1px_1px_rgba(255,255,255,0.35),0_8px_24px_rgba(15,23,42,0.18)]">
                Welcome!
              </p>

              {hasDocuments && (
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {exampleQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="rounded-full bg-slate-100/20 px-4 py-2 text-sm text-black transition hover:bg-slate-200/25"
                    >
                      <Lightbulb className="inline w-3 h-3 mr-2" />
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-8 w-full max-w-5xl">
                {renderInputForm("max-w-5xl mx-auto")}
              </div>
            </motion.div>
          )}

          {conversations.map((conv) => (
            <div key={conv.id} className="space-y-4">
              <div className="flex justify-end">
                <Card className="max-w-xl px-4 py-2 bg-slate-100/20 text-slate-100">
                  {conv.question}
                </Card>
              </div>
              <AnswerDisplay {...conv} />
            </div>
          ))}

          {currentConversation && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Card className="max-w-xl px-4 py-2 bg-slate-100/20 text-slate-100">
                  {currentConversation.question}
                </Card>
              </div>
              <AnswerDisplay {...currentConversation} />
            </div>
          )}
        </div>
      </div>

      {!isEmptyState && (
        <div className="bg-slate-100/10 p-4 sm:p-5">
          {renderInputForm()}
        </div>
      )}
    </div>
  );
}
