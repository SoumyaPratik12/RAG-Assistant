import { useEffect, useState } from "react";
import { Activity, Database, Cpu, Circle, Moon, Sun, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRAG } from "@/context/RAGContext";

interface Props {
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenSettings?: () => void;
}

export default function StatusBar({
  isDarkMode,
  onToggleDarkMode,
  onOpenSettings,
}: Props) {
  const API_BASE_URL =
    (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";

  const {
    documentsReady,
    ingesting,
    history,
  } = useRAG();

  const [backendOnline, setBackendOnline] = useState(false);
  const [modelBackendOnline, setModelBackendOnline] = useState(false);
  const [modelName, setModelName] = useState("Unknown");
  const [chunkCount, setChunkCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const checkHealth = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/health`);
        if (!res.ok) throw new Error("Health check failed");

        const data = await res.json();
        if (!mounted) return;

        setBackendOnline(true);
        setModelBackendOnline(Boolean(data.model_backend_online));
        setModelName(data.model || "Unknown");
        setChunkCount(Number(data.documents || 0));
      } catch {
        if (!mounted) return;
        setBackendOnline(false);
        setModelBackendOnline(false);
      }
    };

    checkHealth();
    const intervalId = setInterval(checkHealth, 5000);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [API_BASE_URL]);

  // Derived state
  const documentCount = documentsReady ? 1 : 0;
  const visibleChunkCount = documentsReady ? Math.max(chunkCount, history.length) : 0;
  const isOnline = backendOnline && modelBackendOnline;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/80 dark:bg-gradient-to-r dark:from-slate-900 dark:to-blue-900/80 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60 px-6 py-3"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-slate-800 dark:text-white text-lg tracking-tight">
              RAG Assistant
            </span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-6">
          {/* Docs / Chunks */}
          <div className="flex items-center gap-2 text-sm">
            <Database className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            <span className="text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {documentCount}
              </span>{" "}
              docs
            </span>
            <span className="text-slate-300 dark:text-slate-600">•</span>
            <span className="text-slate-600 dark:text-slate-400">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {visibleChunkCount}
              </span>{" "}
              chunks
            </span>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <Circle
              className={`w-2 h-2 ${
                ingesting
                  ? "fill-amber-500 text-amber-500"
                  : isOnline
                  ? "fill-emerald-500 text-emerald-500"
                  : "fill-red-500 text-red-500"
              }`}
            />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {ingesting
                ? "Ingesting"
                : isOnline
                ? "Model Online"
                : "Model Offline"}
            </span>
          </div>

          {/* Model */}
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Activity className="w-3.5 h-3.5" />
            <span>{modelName}</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenSettings}
              className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Settings className="w-4 h-4" />
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDarkMode}
              className="h-8 w-8 p-0 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {isDarkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
