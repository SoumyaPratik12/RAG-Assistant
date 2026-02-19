import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Settings, Sparkles, Target, Layers } from 'lucide-react';

interface RetrievalSettings {
  topK: number;
  threshold: number;
  embeddingModel: string;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: RetrievalSettings;
  onSettingsChange: (settings: RetrievalSettings) => void;
}

export default function SettingsModal({
  open,
  onOpenChange,
  settings,
  onSettingsChange,
}: SettingsModalProps) {
  const handleChange = <K extends keyof RetrievalSettings>(
    key: K,
    value: RetrievalSettings[K]
  ) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] dark:bg-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 dark:text-white">
            <Settings className="w-5 h-5 text-violet-500" />
            Advanced Retrieval Settings
          </DialogTitle>
          <DialogDescription className="dark:text-slate-400">
            Fine-tune how the AI retrieves and processes information from your documents.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Top-K Chunks */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 dark:text-slate-200">
                <Target className="w-4 h-4 text-violet-500" />
                Top-K Chunks Retrieved
              </Label>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {settings.topK}
              </span>
            </div>
            <Slider
              value={[settings.topK]}
              onValueChange={(value) => handleChange('topK', value[0])}
              min={1}
              max={10}
              step={1}
              className="w-full"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Number of most relevant document chunks to retrieve. Higher values provide more context but may include less relevant information.
            </p>
          </div>

          {/* Similarity Threshold */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2 dark:text-slate-200">
                <Sparkles className="w-4 h-4 text-amber-500" />
                Similarity Threshold
              </Label>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {settings.threshold.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[settings.threshold]}
              onValueChange={(value) => handleChange('threshold', value[0])}
              min={0}
              max={5}
              step={0.5}
              className="w-full"
            />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Minimum relevance score for chunks to be included. Lower values are more inclusive, higher values are more selective.
            </p>
          </div>

          {/* Embedding Model */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2 dark:text-slate-200">
              <Layers className="w-4 h-4 text-indigo-500" />
              Embedding Model
            </Label>
            <Select
              value={settings.embeddingModel}
              onValueChange={(value) => handleChange('embeddingModel', value)}
            >
              <SelectTrigger className="dark:bg-slate-800 dark:text-slate-200">
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent className="dark:bg-slate-800">
                <SelectItem value="text-embedding-ada-002" className="dark:text-slate-200">
                  text-embedding-ada-002 (OpenAI)
                </SelectItem>
                <SelectItem value="text-embedding-3-small" className="dark:text-slate-200">
                  text-embedding-3-small (OpenAI)
                </SelectItem>
                <SelectItem value="text-embedding-3-large" className="dark:text-slate-200">
                  text-embedding-3-large (OpenAI)
                </SelectItem>
                <SelectItem value="all-MiniLM-L6-v2" className="dark:text-slate-200">
                  all-MiniLM-L6-v2 (Local)
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose the embedding model for semantic search. Larger models are more accurate but slower.
            </p>
          </div>

          {/* Reset Button */}
          <Button
            variant="outline"
            onClick={() => onSettingsChange({
              topK: 5,
              threshold: 0.5,
              embeddingModel: 'text-embedding-ada-002'
            })}
            className="w-full dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reset to Defaults
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
