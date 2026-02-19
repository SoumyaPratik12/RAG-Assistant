import { useState, type MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  History, 
  MessageCircle, 
  Trash2, 
  ChevronRight,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';

interface Conversation {
  id: number;
  question: string;
  answer: string;
  status: "searching" | "generating" | "complete" | "error";
  created_date?: string;
}

export default function ConversationHistory({
  conversations = [],
  onSelectConversation,
  onDeleteConversation,
  currentConversationId
}: {
  conversations: Conversation[];
  onSelectConversation: (conv: Conversation) => void;
  onDeleteConversation: (id: number) => void;
  currentConversationId: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const handleSelect = (conv: Conversation) => {
    onSelectConversation(conv);
    setOpen(false);
  };

  const handleDelete = (convId: number, e: MouseEvent) => {
    e.stopPropagation();
    setDeleteConfirm(convId);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      onDeleteConversation(deleteConfirm);
      setDeleteConfirm(null);
    }
  };

  // Group conversations by date
  const groupedConversations = conversations.reduce((groups: Record<string, Conversation[]>, conv) => {
    const label = (() => {
      const convDate = conv.created_date ? new Date(conv.created_date) : new Date();
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (convDate.toDateString() === today.toDateString()) return 'Today';
      if (convDate.toDateString() === yesterday.toDateString()) return 'Yesterday';
      return format(convDate, 'MMM d, yyyy');
    })();

    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
    return groups;
  }, {} as Record<string, Conversation[]>);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
      >
        <History className="w-4 h-4" />
        History
        {conversations.length > 0 && (
          <Badge 
            variant="secondary" 
            className="ml-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400"
          >
            {conversations.length}
          </Badge>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[600px] dark:bg-slate-900 dark:border-slate-700 max-h-[80vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700">
            <DialogTitle className="flex items-center gap-2 dark:text-white">
              <History className="w-5 h-5 text-violet-500" />
              Conversation History
            </DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              View and resume previous conversations
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            {conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
                  <MessageCircle className="w-8 h-8 text-slate-300 dark:text-slate-600" />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">No conversations yet</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                  Start asking questions to build your history
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedConversations).map(([dateLabel, convs]) => (
                  <div key={dateLabel}>
                    <div className="flex items-center gap-2 mb-3">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {dateLabel}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <AnimatePresence>
                        {convs.map((conv, idx) => (
                          <motion.div
                            key={conv.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <Card 
                              className={`cursor-pointer transition-all hover:shadow-md dark:bg-slate-800 dark:border-slate-700 ${
                                conv.id === currentConversationId 
                                  ? 'ring-2 ring-violet-400 dark:ring-violet-600' 
                                  : ''
                              }`}
                              onClick={() => handleSelect(conv)}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-950 dark:to-indigo-950 flex items-center justify-center flex-shrink-0">
                                    <MessageCircle className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                                  </div>
                                  
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 line-clamp-2 mb-1">
                                      {conv.question}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                                      {conv.answer?.substring(0, 100)}...
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                      <span className="text-xs text-slate-400 dark:text-slate-500">
                                        {conv.created_date ? format(new Date(conv.created_date), 'h:mm a') : format(new Date(), 'h:mm a')}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => handleDelete(conv.id, e)}
                                      className="h-8 w-8 text-slate-400 dark:text-slate-500 hover:text-red-500 dark:hover:text-red-400"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {conversations.length} conversation{conversations.length !== 1 ? 's' : ''} saved
            </p>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-[400px] dark:bg-slate-900 dark:border-slate-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">Delete Conversation?</DialogTitle>
            <DialogDescription className="dark:text-slate-400">
              This action cannot be undone. The conversation will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              className="dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
