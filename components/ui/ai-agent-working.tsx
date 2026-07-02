import React from 'react';

export function AiAgentWorking({
  text = "AI Agent is working…",
}: {
  text?: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-purple-300 justify-center">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-purple-500" />
      </span>
      <span>{text}</span>
      <span className="flex gap-1">
        <span className="h-1 w-1 animate-bounce rounded-full bg-purple-300 [animation-delay:-0.3s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-purple-300 [animation-delay:-0.15s]" />
        <span className="h-1 w-1 animate-bounce rounded-full bg-purple-300" />
      </span>
    </div>
  );
}
