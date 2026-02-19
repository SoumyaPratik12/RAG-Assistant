import { useContext } from "react";
import ChatPanel from "@/components/RAG/ChatPanel";
import DocumentPanel from "@/components/RAG/DocumentPanel";
import StatusBar from "@/components/RAG/StatusBar";
import { useRAG } from "@/context/RAGContext";
import { ThemeContext } from "@/context/ThemeContext";

export default function Home() {
  const { dark, setDark } = useContext(ThemeContext);
  const { documentsReady } = useRAG();

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
          <ChatPanel hasDocuments={documentsReady} />
        </div>
      </div>
    </div>
  );
}
