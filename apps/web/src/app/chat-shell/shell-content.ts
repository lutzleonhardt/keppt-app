export type ChatSender = "assistant" | "user";

export interface ChatShellMessage {
  readonly id: number;
  readonly sender: ChatSender;
  readonly text: string;
  readonly meta?: string;
}

export const initialMessages: readonly ChatShellMessage[] = [
  {
    id: 1,
    sender: "assistant",
    meta: "Keppt hat deine offenen Punkte geprüft",
    text: "Guten Morgen. Dein DB-Follow-up wartet seit 8 Tagen. Ich kann dir helfen, den heutigen Fokus daraus zu bauen.",
  },
  {
    id: 2,
    sender: "user",
    text: "Ich habe morgen nur 4 Stunden. Was ist realistisch?",
  },
  {
    id: 3,
    sender: "assistant",
    meta: "Geprüft: Wochenfokus, offene Aufgaben und Follow-ups",
    text: "Plane Anna zuerst, halte den DB-Block klein und verschiebe loses Aufräumen auf später. Das passt besser in 4 Stunden.",
  },
];

export const quickActions = [
  "Tag planen",
  "Warten auf zeigen",
  "Erstmal nur erfassen",
] as const;

export function createUserMessage(
  id: number,
  text: string,
): ChatShellMessage {
  return {
    id,
    sender: "user",
    text,
  };
}
