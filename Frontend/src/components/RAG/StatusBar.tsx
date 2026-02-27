import { useEffect, useState } from "react";
import { Activity, Database, FileCog, ArrowRightLeft, Circle, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useRAG } from "@/context/RAGContext";

interface Props {
  onOpenSettings?: () => void;
}

export default function StatusBar({
  onOpenSettings,
}: Props) {
  const API_BASE_URL =
    (import.meta as any).env?.VITE_BACKEND_URL || "http://localhost:8000";
  const HEALTH_POLL_INTERVAL_MS = 15000;

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

    let inFlight = false;
    const checkHealth = async () => {
      if (inFlight) return;
      inFlight = true;
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
      } finally {
        inFlight = false;
      }
    };

    checkHealth();
    const intervalId = setInterval(checkHealth, HEALTH_POLL_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(intervalId);
    };
  }, [API_BASE_URL, HEALTH_POLL_INTERVAL_MS]);

  // Derived state
  const documentCount = documentsReady ? 1 : 0;
  const visibleChunkCount = documentsReady ? Math.max(chunkCount, history.length) : 0;
  const isOnline = backendOnline && modelBackendOnline;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[22px] border border-slate-100/25 bg-slate-100/15 px-4 py-3 sm:px-5"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <FileCog className="h-5 w-5 text-white" />
            <ArrowRightLeft className="absolute bottom-1 right-1 h-3 w-3 text-white/95" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-base font-semibold tracking-tight text-slate-100 sm:text-lg">
              DocSage
            </p>
            <p className="truncate text-xs text-black/80">
              Context-aware file understanding platform
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-full bg-slate-100/20 px-3 py-1.5 md:flex">
            <Database className="h-4 w-4 text-black" />
            <span className="text-xs text-black">
              <span className="font-semibold text-slate-100">
                {documentCount}
              </span>{" "}
              docs
            </span>
            <span className="text-black/60">|</span>
            <span className="text-xs text-black">
              <span className="font-semibold text-slate-100">
                {visibleChunkCount}
              </span>{" "}
              chunks
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-slate-100/20 px-3 py-1.5">
            <Circle
              className={`h-2.5 w-2.5 ${
                ingesting
                  ? "fill-amber-500 text-amber-500"
                  : isOnline
                  ? "fill-emerald-500 text-emerald-500"
                  : "fill-red-500 text-red-500"
              }`}
            />
            <span className="text-xs font-medium text-black">
              {ingesting
                ? "Ingesting"
                : isOnline
                ? "Model Online"
              : "Model Offline"}
            </span>
          </div>

          <div className="hidden items-center gap-1 rounded-full bg-slate-100/20 px-2.5 py-1.5 lg:flex">
            <Activity className="h-3.5 w-3.5 text-black" />
            <span className="max-w-[120px] truncate text-xs text-black">
              {modelName}
            </span>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onOpenSettings}
            className="h-8 w-8 p-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
