import type {
  AssistantContentMessage,
  AssistantToolMessage,
  QuickReply,
} from "../chat/chat.types";

export interface MockToolRow {
  readonly text: string;
  readonly files?: readonly string[];
}

export interface MockAssistantResponse {
  readonly tool: MockToolRow;
  readonly markdown: string;
  readonly quickReplies?: readonly string[];
}

export type MockFlow =
  | "greeting"
  | "captureConfirm"
  | "planning"
  | "today"
  | "waiting"
  | "inbox"
  | "acknowledge"
  | "planEntered"
  | "annaPriority"
  | "captureOnly"
  | "later";

export const voiceTranscript =
  "Morgen Anna wegen Angebot schreiben, Steuerunterlagen irgendwann sortieren, und Idee für YouTube-Video über AI Apps festhalten.";

export const planningQuestion =
  "Ich habe morgen nur 4 Stunden. Was ist realistisch?";

export const quickReplyPhrases = {
  planConfirm: "Ja, eintragen",
  annaFirst: "Ja, Anna zuerst",
  captureOnly: "Erstmal nur erfassen",
  laterDecide: "Später entscheiden",
  doNothing: "Nichts tun",
  later: "Später",
  pingMax: "An Max pingen",
  inboxCleanup: "Räum die Inbox auf",
  todayQ: "Was steht heute an?",
  plan4h: "Plan morgen — 4 h",
  waitingQ: "Worauf warte ich?",
  showWaiting: "Warten auf zeigen",
  startToday: "Tagesplan starten",
  planNext: "Plan für morgen",
  planTomorrow: "Tag planen",
} as const;

export const routePatterns = {
  planning: /4 stunden|plan morgen|plan für morgen|realistisch/i,
  today: /heute|wichtig|fokus/i,
  waiting: /warten|waiting|max|db/i,
  inbox: /inbox|aufräumen|sortier/i,
} as const;

const toolRows = {
  greeting: {
    text: "Keppt hat deine offenen Punkte geprüft",
    files: [
      "tasks/inbox.md",
      "tasks/focus.md",
      "tasks/waiting.md",
      "daily/2026-05-06.md",
    ],
  },
  captureConfirm: {
    text: "3 Einträge sicher abgelegt",
    files: ["tasks/inbox.md", "tasks/someday-maybe.md"],
  },
  planning: {
    text: "Geprüft: Wochenfokus, offene Aufgaben und Follow-ups",
    files: [
      "tasks/focus.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "daily/2026-05-06.md",
    ],
  },
  today: {
    text: "Geprüft: Wochenfokus, offene Aufgaben und heutiger Kontext",
    files: [
      "tasks/focus.md",
      "tasks/next-actions.md",
      "tasks/waiting.md",
      "daily/2026-05-06.md",
    ],
  },
  waiting: {
    text: "Geprüft: offene Rückmeldungen",
    files: ["tasks/waiting.md"],
  },
  inbox: {
    text: "Keppt schaut deine Inbox durch",
    files: ["tasks/inbox.md", "tasks/next-actions.md", "tasks/someday-maybe.md"],
  },
  acknowledge: {
    text: "Keppt it!",
    files: ["tasks/inbox.md"],
  },
  planEntered: {
    text: "Plan für morgen festgehalten",
    files: ["daily/2026-05-07.md", "tasks/next-actions.md"],
  },
  annaPriority: {
    text: "Anna für morgen vorgemerkt",
  },
  captureOnly: {
    text: "Erfassung bleibt offen",
  },
  later: {
    text: "Später entscheiden vorgemerkt",
  },
} satisfies Record<MockFlow, MockToolRow>;

const responses = {
  greeting: {
    tool: toolRows.greeting,
    markdown: [
      "Guten Morgen, Lutz. Heute ist **Mittwoch, 6. Mai**.",
      "Eine offene Rückmeldung wartet seit 8 Tagen — **DB Follow-up-Call**. Willst du kurz reinschauen, bevor wir den Tag planen?",
    ].join("\n\n"),
    quickReplies: ["Tag planen", "Warten auf zeigen", "Erstmal nur erfassen"],
  },
  captureConfirm: {
    tool: toolRows.captureConfirm,
    markdown: [
      "Keppt. Ich habe drei Dinge mitgenommen:",
      "",
      "1. **Anna wegen Angebot schreiben**  ",
      "   habe ich für morgen vorgeschlagen, Anna ist Cash-relevant und wartet auf Rückmeldung.",
      "2. **Steuerunterlagen sortieren**  ",
      "   Zeitpunkt unklar; liegt erstmal in der Inbox, wir entscheiden später.",
      "3. **YouTube-Idee „AI Apps“**  ",
      "   als Idee in *Vielleicht irgendwann* abgelegt, ohne Druck.",
      "",
      "Soll *Anna* morgen Priorität bekommen?",
    ].join("\n"),
    quickReplies: ["Ja, Anna zuerst", "Plan morgen — 4 h", "Später entscheiden"],
  },
  planning: {
    tool: toolRows.planning,
    markdown: [
      "## Morgen — Plan für 4 Stunden",
      "",
      "1. **Anna wegen Angebot schreiben.**  ",
      "   Wichtig & zeitkritisch · 90 Min",
      "2. **AI-Apps-Video gliedern.**  ",
      "   Höchster Hebel für Content · 60 Min",
      "3. **Steuerunterlagen vorsortieren.**  ",
      "   Nur erster Schritt · 20 Min",
      "",
      "## Nicht morgen:",
      "",
      "- Hecke schneiden",
      "- Steuer komplett",
      "- VW-Rechnung, solange Max nicht geantwortet hat",
      "",
      "Plan übernehmen?",
    ].join("\n"),
    quickReplies: ["Ja, eintragen", "Anpassen"],
  },
  today: {
    tool: toolRows.today,
    markdown: [
      "## Heute",
      "",
      "1. **Anna wegen Angebot schreiben.**  ",
      "   Wichtig & zeitnah · 30 Min",
      "2. **AI-Apps-Video gliedern.**  ",
      "   Ruhige Phase · 90 Min",
      "3. **Steuerunterlagen vorsortieren.**  ",
      "   Erster Schritt · 20 Min",
      "",
      "Zwei Rückmeldungen warten — bei **Max** seit 3 Tagen, bei **DB** seit 8 Tagen. Willst du heute pingen?",
    ].join("\n"),
    quickReplies: ["An Max pingen", "Tagesplan starten", "Plan für morgen"],
  },
  waiting: {
    tool: toolRows.waiting,
    markdown: [
      "Zwei offene Rückmeldungen liegen bei dir:",
      "",
      "1. **Max — Feedback zur Rechnung.**  ",
      "   Seit 3 Tagen · noch im Rahmen.",
      "2. **DB — Follow-up-Call.**  ",
      "   Seit 8 Tagen · überfällig.",
      "",
      "Soll ich an einen von beiden erinnern?",
    ].join("\n"),
    quickReplies: ["An Max pingen", "DB jetzt nachhaken", "Nichts tun"],
  },
  inbox: {
    tool: toolRows.inbox,
    markdown: [
      "Klar. In deiner Inbox liegen aktuell **4 Einträge**. Mein Vorschlag:",
      "",
      "1. **Anna wegen Angebot schreiben**  ",
      "   → *Nächste Schritte / Arbeit*, geplant für morgen.",
      "2. **Steuerunterlagen sortieren**  ",
      "   → *Nächste Schritte / Persönlich*, ohne festen Termin.",
      "3. **YouTube-Idee „AI Apps“**  ",
      "   → *Vielleicht irgendwann*, beobachten.",
      "4. **Geschenk für Mama recherchieren**  ",
      "   → *Nächste Schritte / Persönlich*, Geburtstag in 2 Wochen.",
      "",
      "Soll ich das so übernehmen, oder willst du was anpassen?",
    ].join("\n"),
    quickReplies: ["So übernehmen", "Anders verteilen", "Später"],
  },
  acknowledge: {
    tool: toolRows.acknowledge,
    markdown: "",
    quickReplies: ["Räum die Inbox auf", "Was steht heute an?"],
  },
  planEntered: {
    tool: toolRows.planEntered,
    markdown: [
      "Erledigt. Ich habe den Plan in `2026-05-07.md` eingetragen — drei Slots, zwei Hinweise als Notiz.",
      "In *Nächste Schritte* bleibt alles wie es war; morgen früh frage ich dich, ob wir loslegen.",
    ].join("\n\n"),
    quickReplies: ["Was sonst noch?", "Nichts mehr"],
  },
  annaPriority: {
    tool: toolRows.annaPriority,
    markdown: [
      "Gemerkt. **Anna** ist morgen oben.",
      "Wenn du willst, plane ich den Rest des Tages drumherum — sag einfach *„Plan morgen“* oder gib mir, wie viel Zeit du hast.",
    ].join("\n\n"),
    quickReplies: ["Plan morgen — 4 h", "Erstmal nur erfassen"],
  },
  captureOnly: {
    tool: toolRows.captureOnly,
    markdown: "Klar. Drück den Mic-Button oder schreib einfach — ich höre zu, ohne zu sortieren.",
  },
  later: {
    tool: toolRows.later,
    markdown: "Alles gut. Ich frage später nochmal nach.",
  },
} satisfies Record<MockFlow, MockAssistantResponse>;

export function getMockResponse(flow: MockFlow, capturedText?: string): MockAssistantResponse {
  if (flow !== "acknowledge") {
    return responses[flow];
  }

  return {
    ...responses.acknowledge,
    markdown: [
      `Notiert — *„${capturedText ?? "Das"}“* liegt jetzt in deiner Inbox.`,
      "Wenn du willst, sag *„Räum die Inbox auf“* und wir sortieren zusammen — oder ich mache nichts und du fragst später danach.",
    ].join("\n\n"),
  };
}

export function createToolMessage(
  id: string,
  createdAt: string,
  tool: MockToolRow,
): AssistantToolMessage {
  return {
    id,
    role: "assistant",
    kind: "tool",
    text: tool.text,
    files: tool.files ? [...tool.files] : undefined,
    createdAt,
  };
}

export function createContentMessage(
  id: string,
  createdAt: string,
  response: MockAssistantResponse,
): AssistantContentMessage {
  return {
    id,
    role: "assistant",
    kind: "content",
    markdown: response.markdown,
    quickReplies: response.quickReplies?.map(createQuickReply),
    createdAt,
  };
}

function createQuickReply(label: string): QuickReply {
  return {
    id: label.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, "-").replace(/^-|-$/g, ""),
    label,
  };
}
