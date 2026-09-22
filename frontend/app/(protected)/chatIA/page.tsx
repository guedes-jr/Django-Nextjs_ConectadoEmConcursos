"use client";

import { ChatShell } from "@/components/chatIA/ChatShell";

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ChatShell />
      </div>
    </div>
  );
}
