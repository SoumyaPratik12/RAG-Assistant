import React, { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Database, FileText } from "lucide-react";
import { ingestText, uploadFiles } from "@/lib/api";
import { useRAG } from "@/context/RAGContext";
import { toast } from "sonner";

export default function DocumentPanel() {
  const [text, setText] = useState("");
  const [addingText, setAddingText] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setIngesting, setDocumentsReady } = useRAG();

  /* ============================
     TEXT INGEST
     ============================ */
  const handleAddText = async () => {
    if (!text.trim()) {
      toast.error("Please enter some text");
      return;
    }

    setAddingText(true);
    setIngesting(true);

    try {
      await ingestText({ text });
      setText("");
      setDocumentsReady(true);
      toast.success("Text added to knowledge base");
    } catch (err: any) {
      console.error("Text ingestion failed:", err);
      toast.error(err.message || "Text ingestion failed");
    } finally {
      setAddingText(false);
      setIngesting(false);
    }
  };

  /* ============================
     FILE UPLOAD
     ============================ */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setIngesting(true);

    try {
      await uploadFiles(Array.from(files));
      setDocumentsReady(true);
      toast.success(`${files.length} file(s) uploaded successfully`);
    } catch (err: any) {
      console.error("File upload failed:", err);
      toast.error(err.message || "File upload failed");
    } finally {
      e.target.value = ""; // Required to allow re-uploading same files
      setUploading(false);
      setIngesting(false);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
          <Database className="text-white w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Knowledge Base
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Add documents to power your AI
          </p>
        </div>
      </div>

      <Card className="flex-1 p-4 flex flex-col gap-4">
        {/* TEXT INPUT */}
        <textarea
          className="flex-1 w-full rounded-md border border-slate-200
                     dark:border-slate-700 p-3 text-sm resize-none
                     bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          placeholder="Paste your document content here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={addingText || uploading}
        />

        <Button
          onClick={handleAddText}
          disabled={addingText || uploading || !text.trim()}
          className="w-full"
        >
          <FileText className="w-4 h-4 mr-2" />
          {addingText ? "Adding..." : "Add Text Document"}
        </Button>

        {/* FILE INPUT */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.doc,.docx,.md"
          className="hidden"
          onChange={handleFilesSelected}
        />

        <Button
          onClick={handleUploadClick}
          variant="outline"
          disabled={uploading || addingText}
          className="w-full"
        >
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Uploading..." : "Upload Files"}
        </Button>
      </Card>
    </div>
  );
}
