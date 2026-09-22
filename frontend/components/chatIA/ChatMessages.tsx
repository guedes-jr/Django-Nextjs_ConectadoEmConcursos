type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export function ChatMessages({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="px-5 py-4 space-y-4 h-[520px] overflow-y-auto">
      {messages.map((m) => {
        const isUser = m.role === "user";
        return (
          <div key={m.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
            <div
              className={[
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap",
                isUser
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100",
              ].join(" ")}
            >
              {m.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
