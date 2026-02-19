import { Button } from "@/components/ui/button";
import { PlusSquare } from "lucide-react";

export default function DocumentPanel() {
  const handleNewChat = () => {
    window.dispatchEvent(new Event("rag:new-chat"));
  };

  return (
    <div className="flex h-full flex-col p-4 sm:p-5">
      <Button
        onClick={handleNewChat}
        variant="outline"
        className="mb-4 h-11 w-full justify-start rounded-xl bg-white/10 font-semibold text-slate-100 transition-all hover:bg-cyan-500 hover:text-slate-950 hover:shadow-lg hover:shadow-cyan-500/25"
      >
        <PlusSquare className="mr-2 h-4 w-4" />
        New Chat
      </Button>
    </div>
  );
}
