import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  Send,
  Sparkles,
  MessageCircle,
  Trash2,
  Lightbulb,
} from "lucide-react";
import { motion } from "framer-motion";
import AnswerDisplay from "./AnswerDisplay";
import ConversationHistory from "./ConversationHistory";
import { streamQuery } from "@/lib/api";

interface Conversation {
  id: number;
  question: string;
  answer: string;
  status: "searching" | "generating" | "complete" | "error";
  sources?: any[];
}

const exampleQuestions = [
  "What are the main topics covered in my documents?",
  "Can you summarize the key points?",
  "What specific details are mentioned about...",
];

export default function ChatPanel({ hasDocuments = false }) {
  /* ---------------- STATE ---------------- */

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] =
    useState<Conversation | null>(null);
  const [currentConversationId, setCurrentConversationId] =
    useState<number | null>(null);
  const [question, setQuestion] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const accumulatorRef = useRef("");

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
          const prev = accumulatorRef.current;

          const needsSpace =
            prev.length > 0 &&
            !prev.endsWith(" ") &&
            !chunk.startsWith(" ") &&
            ![".", ",", "!", "?", ":", ";"].includes(chunk);

          accumulatorRef.current = needsSpace
            ? prev + " " + chunk
            : prev + chunk;

          setCurrentConversation((prevConv) =>
            prevConv
              ? {
                  ...prevConv,
                  answer: accumulatorRef.current,
                  status: "generating",
                }
              : prevConv
            );
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
            sources: [],
          });

          setIsLoading(false);
          accumulatorRef.current = "";
        }
      );
    } catch (err) {
      console.error("Unexpected error:", err);

      setCurrentConversation({
        ...pending,
        answer: "Unexpected error occurred. Please try again.",
        status: "error",
        sources: [],
      });

      setIsLoading(false);
      accumulatorRef.current = "";
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

  /* ---------------- AUTO SCROLL ---------------- */

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversations, currentConversation]);

  /* ---------------- RENDER ---------------- */

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 via-white to-violet-50/30 dark:from-slate-900 dark:via-slate-900 dark:to-violet-950/30">
      {/* Header */}
      <div className="p-6 border-b bg-white/80 dark:bg-slate-900/80 backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Ask Questions</h2>
              <p className="text-sm text-slate-500">
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
                className="text-slate-500 hover:text-red-600"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear Current
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Chat */}
      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-3xl mx-auto space-y-6">
          {conversations.length === 0 && !currentConversation && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <Sparkles className="mx-auto mb-4 text-violet-500" size={48} />
              <p className="text-slate-500">
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
                      className="px-4 py-2 text-sm rounded-full border hover:bg-violet-50 transition"
                    >
                      <Lightbulb className="inline w-3 h-3 mr-2" />
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {conversations.map((conv) => (
            <div key={conv.id} className="space-y-4">
              <div className="flex justify-end">
                <Card className="px-4 py-2 bg-violet-600 text-white max-w-xl">
                  {conv.question}
                </Card>
              </div>
              <AnswerDisplay {...conv} />
            </div>
          ))}

          {currentConversation && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Card className="px-4 py-2 bg-violet-600 text-white max-w-xl">
                  {currentConversation.question}
                </Card>
              </div>
              <AnswerDisplay {...currentConversation} />
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="p-6 border-t bg-white/80 dark:bg-slate-900/80">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <Input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              disabled={!hasDocuments || isLoading}
              placeholder={
                hasDocuments
                  ? "Ask a question..."
                  : "Upload documents first..."
              }
              className="pr-28 h-14"
            />
            <Button
              type="submit"
              disabled={!question.trim() || isLoading || !hasDocuments}
              className="absolute right-2 top-2"
            >
              <Send className="w-4 h-4 mr-2" />
              Ask
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
