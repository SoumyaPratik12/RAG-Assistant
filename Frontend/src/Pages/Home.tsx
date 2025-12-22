import React, { useState, useContext } from "react";
import ChatPanel from "@/components/RAG/ChatPanel";
import DocumentPanel from "@/components/RAG/DocumentPanel";
import StatusBar from "@/components/RAG/StatusBar";
import SettingsModal from "@/components/RAG/SettingsModal";
import { streamQuery } from "@/lib/api";
import { useRAG } from "@/context/RAGContext";
import { ThemeContext } from "@/context/ThemeContext";

export default function Home() {
  const { dark, setDark } = useContext(ThemeContext);
  const { documentsReady, addHistory } = useRAG();

  const [conversations, setConversations] = useState<any[]>([]);
  const [currentConversation, setCurrentConversation] = useState<any | null>(
    null
  );

  /* -------- ASK / STREAM QUERY -------- */

  const askQuestion = async (question: string) => {
    if (!documentsReady) return;

    const conv = {
      id: Date.now(),
      question,
      answer: "",
      sources: [],
      status: "searching",
    };

    setCurrentConversation(conv);

    try {
      await streamQuery(
        { query: question },
        (chunk) => {
          setCurrentConversation((prev) =>
            prev ? { ...prev, answer: prev.answer + chunk } : prev
          );
        },
        () => {
          setCurrentConversation((prev) => {
            if (!prev) return prev;

            const completed = { ...prev, status: "complete" };
            setConversations((c) => [...c, completed]);
            addHistory(question);
            return completed;
          });
        }
      );
    } catch (err) {
      setCurrentConversation((prev) =>
        prev
          ? {
              ...prev,
              answer: "Something went wrong. Please try again.",
              status: "error",
            }
          : prev
      );
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Top Status Bar */}
      <StatusBar
        isDarkMode={dark}
        onToggleDarkMode={() => setDark(!dark)}
      />

      {/* Main Layout (matches simple example intent) */}
      <div className="flex flex-1 overflow-hidden">
        {/* Document Panel */}
        <div className="w-1/4 min-w-[320px] max-w-[380px]">
          <DocumentPanel />
        </div>

        {/* Chat Panel */}
        <div className="flex-1">
          <ChatPanel
            conversations={conversations}
            currentConversation={currentConversation}
            onAsk={askQuestion}
            hasDocuments={documentsReady}
          />
        </div>
      </div>
    </div>
  );
}
