import ChatPanel from "@/components/RAG/ChatPanel";
import DocumentPanel from "@/components/RAG/DocumentPanel";
import StatusBar from "@/components/RAG/StatusBar";
import { useRAG } from "@/context/RAGContext";

export default function Home() {
  const { documentsReady } = useRAG();

  return (
    <div className="flex h-screen flex-col gap-3 p-3 sm:gap-4 sm:p-5">
      <StatusBar />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white/10 lg:h-full lg:w-[300px] lg:shrink-0">
          <DocumentPanel />
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          <div className="mx-auto h-full w-full max-w-5xl overflow-hidden rounded-[22px] bg-white/10">
            <ChatPanel hasDocuments={documentsReady} />
          </div>
        </div>
      </div>
    </div>
  );
}
