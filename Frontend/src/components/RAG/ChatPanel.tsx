import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  ArrowUp,
  Sparkles,
  MessageCircle,
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

export default function ChatPanel({ hasDocuments = false }) {
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

  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accumulatorRef = useRef("");
  const rafRef = useRef<number | null>(null);

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
        { query: q },

        /* -------- ON CHUNK -------- */
        (chunk) => {
          accumulatorRef.current += chunk;
          if (rafRef.current === null) {
            rafRef.current = window.requestAnimationFrame(flushAnswer);
          }
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
          if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
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
          if (rafRef.current !== null) {
            window.cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
          }
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
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
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
              className="max-w-[220px] truncate rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-100"
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

        <Input
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!hasDocuments || isLoading || isUploadingFiles}
          placeholder={
            hasDocuments
              ? "Ask a question..."
              : "Add/Upload files first..."
          }
          className="h-14 rounded-xl bg-white/10 pl-14 pr-14 text-slate-100 placeholder:text-slate-400"
        />

        <Button
          type="button"
          variant="outline"
          onClick={handleAttachClick}
          disabled={isUploadingFiles || isLoading}
          title={isUploadingFiles ? "Uploading files..." : "Add/Upload files"}
          aria-label={isUploadingFiles ? "Uploading files" : "Add or upload files"}
          className="absolute left-2 top-2.5 h-9 w-9 bg-white/10 p-0 hover:bg-white/20"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <Button
          type="submit"
          disabled={!question.trim() || isLoading || !hasDocuments || isUploadingFiles}
          aria-label="Ask"
          className="absolute right-2 top-2.5 h-9 w-9 bg-white/10 p-0 hover:bg-white/20"
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
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  /* ---------------- RENDER ---------------- */

  return (
    <div className="flex h-full flex-col">
      <div className="bg-white/5 p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <MessageCircle className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-slate-100">
                Ask Questions
              </h2>
              <p className="text-sm text-slate-400">
                Get AI-powered answers from your documents
              </p>
            </div>
          </div>

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
                className="text-slate-400 hover:text-red-400"
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
              <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-500 shadow-lg shadow-cyan-500/20">
                <Sparkles className="text-white" size={28} />
              </div>
              <p className="text-slate-300">
                {hasDocuments
                  ? "Ask anything about your documents"
                  : "Upload documents to begin"}
              </p>

              {hasDocuments && (
                <div className="flex flex-wrap justify-center gap-2 mt-6">
                  {exampleQuestions.map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200 transition hover:bg-cyan-900/50"
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
                <Card className="max-w-xl px-4 py-2 bg-white/15 text-slate-100 dark:bg-cyan-500 dark:text-slate-950">
                  {conv.question}
                </Card>
              </div>
              <AnswerDisplay {...conv} />
            </div>
          ))}

          {currentConversation && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Card className="max-w-xl px-4 py-2 bg-white/15 text-slate-100 dark:bg-cyan-500 dark:text-slate-950">
                  {currentConversation.question}
                </Card>
              </div>
              <AnswerDisplay {...currentConversation} />
            </div>
          )}
        </div>
      </div>

      {!isEmptyState && (
        <div className="bg-white/5 p-4 sm:p-5">
          {renderInputForm()}
        </div>
      )}
    </div>
  );
}
