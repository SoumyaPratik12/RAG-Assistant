import { useState } from "react";
import ChatPanel from "@/components/RAG/ChatPanel";
import DocumentPanel from "@/components/RAG/DocumentPanel";
import StatusBar from "@/components/RAG/StatusBar";
import SettingsModal from "@/components/RAG/SettingsModal";
import { useRAG } from "@/context/RAGContext";

interface RetrievalSettings {
  topK: number;
  threshold: number;
  embeddingModel: string;
}

const DEFAULT_SETTINGS: RetrievalSettings = {
  topK: 3,
  threshold: 0.08,
  embeddingModel: "all-MiniLM-L6-v2",
};

export default function Home() {
  const { documentsReady } = useRAG();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<RetrievalSettings>(DEFAULT_SETTINGS);

  return (
    <div className="flex h-screen flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      <StatusBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="overflow-hidden rounded-[22px] border border-slate-100/25 bg-slate-100/15 lg:h-full lg:w-[300px] lg:shrink-0">
          <DocumentPanel />
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          <div className="mx-auto h-full w-full max-w-5xl overflow-hidden rounded-[22px] bg-slate-100/15">
            <ChatPanel hasDocuments={documentsReady} settings={settings} />
          </div>
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSettingsChange={setSettings}
      />
    </div>
  );
}
