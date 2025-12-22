import { createContext, useContext, useState } from "react";

interface RAGState {
  documentsReady: boolean;
  ingesting: boolean;
  history: string[];
  setDocumentsReady: (v: boolean) => void;
  setIngesting: (v: boolean) => void;
  addHistory: (q: string) => void;
}

const RAGContext = createContext<RAGState | null>(null);

export function RAGProvider({ children }: { children: React.ReactNode }) {
  const [documentsReady, setDocumentsReady] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  function addHistory(q: string) {
    setHistory((h) => [...h, q]);
  }

  return (
    <RAGContext.Provider
      value={{
        documentsReady,
        ingesting,
        history,
        setDocumentsReady,
        setIngesting,
        addHistory,
      }}
    >
      {children}
    </RAGContext.Provider>
  );
}

export function useRAG() {
  const ctx = useContext(RAGContext);
  if (!ctx) throw new Error("useRAG must be used inside RAGProvider");
  return ctx;
}
