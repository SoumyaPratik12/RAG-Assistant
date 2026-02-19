import Home from "@/views/Home";
import { RAGProvider } from "@/context/RAGContext";

export default function App() {
  return (
    <RAGProvider>
      <div className="h-screen overflow-hidden bg-transparent text-slate-100">
        <Home />
      </div>
    </RAGProvider>
  );
}
