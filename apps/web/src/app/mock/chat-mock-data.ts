import type {
  AssistantBlock,
  AssistantContentMessage,
  AssistantToolMessage,
  InlineText,
  QuickReply,
  RichListItem,
} from "../chat/chat.types";

export interface MockToolRow {
  readonly text: string;
  readonly files?: readonly string[];
}

export interface MockAssistantResponse {
  readonly tool: MockToolRow;
  readonly blocks: readonly AssistantBlock[];
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

const paragraph = (id: string, ...text: InlineText[]): AssistantBlock => ({
  id,
  type: "paragraph",
  text,
});

const heading = (id: string, text: string): AssistantBlock => ({
  id,
  type: "heading",
  text,
});

const inline = (
  text: string,
  mark?: "strong" | "emphasis" | "muted" | "code",
): InlineText => (mark ? { text, mark } : { text });

const ordered = (id: string, items: RichListItem[]): AssistantBlock => ({
  id,
  type: "ordered-list",
  items,
});

const unordered = (id: string, items: RichListItem[]): AssistantBlock => ({
  id,
  type: "unordered-list",
  items,
});

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
    blocks: [
      paragraph("greeting-date", inline("Guten Morgen, Lutz. Heute ist "), inline("Mittwoch, 6. Mai", "strong"), inline(".")),
      paragraph(
        "greeting-waiting",
        inline("Eine offene Rückmeldung wartet seit 8 Tagen — "),
        inline("DB Follow-up-Call", "strong"),
        inline(". Willst du kurz reinschauen, bevor wir den Tag planen?"),
      ),
    ],
    quickReplies: ["Tag planen", "Warten auf zeigen", "Erstmal nur erfassen"],
  },
  captureConfirm: {
    tool: toolRows.captureConfirm,
    blocks: [
      paragraph("capture-confirm-intro", inline("Keppt. Ich habe drei Dinge mitgenommen:")),
      ordered("capture-confirm-items", [
        {
          title: [inline("Anna wegen Angebot schreiben", "strong")],
          body: [
            inline("habe ich für morgen vorgeschlagen, Anna ist Cash-relevant und wartet auf Rückmeldung."),
          ],
        },
        {
          title: [inline("Steuerunterlagen sortieren", "strong")],
          body: [inline("Zeitpunkt unklar; liegt erstmal in der Inbox, wir entscheiden später.")],
        },
        {
          title: [inline("YouTube-Idee „AI Apps“", "strong")],
          body: [inline("als Idee in "), inline("Vielleicht irgendwann", "emphasis"), inline(" abgelegt, ohne Druck.")],
        },
      ]),
      paragraph("capture-confirm-question", inline("Soll "), inline("Anna", "emphasis"), inline(" morgen Priorität bekommen?")),
    ],
    quickReplies: ["Ja, Anna zuerst", "Plan morgen — 4 h", "Später entscheiden"],
  },
  planning: {
    tool: toolRows.planning,
    blocks: [
      heading("planning-heading", "Morgen — Plan für 4 Stunden"),
      ordered("planning-items", [
        {
          title: [inline("Anna wegen Angebot schreiben.", "strong")],
          body: [],
          meta: "Wichtig & zeitkritisch · 90 Min",
        },
        {
          title: [inline("AI-Apps-Video gliedern.", "strong")],
          body: [],
          meta: "Höchster Hebel für Content · 60 Min",
        },
        {
          title: [inline("Steuerunterlagen vorsortieren.", "strong")],
          body: [],
          meta: "Nur erster Schritt · 20 Min",
        },
      ]),
      heading("planning-not-tomorrow-heading", "Nicht morgen:"),
      unordered("planning-not-tomorrow-items", [
        { body: [inline("Hecke schneiden")] },
        { body: [inline("Steuer komplett")] },
        { body: [inline("VW-Rechnung, solange Max nicht geantwortet hat")] },
      ]),
      paragraph("planning-question", inline("Plan übernehmen?")),
    ],
    quickReplies: ["Ja, eintragen", "Anpassen"],
  },
  today: {
    tool: toolRows.today,
    blocks: [
      heading("today-heading", "Heute"),
      ordered("today-items", [
        {
          title: [inline("Anna wegen Angebot schreiben.", "strong")],
          body: [],
          meta: "Wichtig & zeitnah · 30 Min",
        },
        {
          title: [inline("AI-Apps-Video gliedern.", "strong")],
          body: [],
          meta: "Ruhige Phase · 90 Min",
        },
        {
          title: [inline("Steuerunterlagen vorsortieren.", "strong")],
          body: [],
          meta: "Erster Schritt · 20 Min",
        },
      ]),
      paragraph(
        "today-waiting-question",
        inline("Zwei Rückmeldungen warten — bei "),
        inline("Max", "strong"),
        inline(" seit 3 Tagen, bei "),
        inline("DB", "strong"),
        inline(" seit 8 Tagen. Willst du heute pingen?"),
      ),
    ],
    quickReplies: ["An Max pingen", "Tagesplan starten", "Plan für morgen"],
  },
  waiting: {
    tool: toolRows.waiting,
    blocks: [
      paragraph("waiting-intro", inline("Zwei offene Rückmeldungen liegen bei dir:")),
      ordered("waiting-items", [
        {
          title: [inline("Max — Feedback zur Rechnung.", "strong")],
          body: [],
          meta: "Seit 3 Tagen · noch im Rahmen.",
        },
        {
          title: [inline("DB — Follow-up-Call.", "strong")],
          body: [],
          meta: "Seit 8 Tagen · überfällig.",
        },
      ]),
      paragraph("waiting-question", inline("Soll ich an einen von beiden erinnern?")),
    ],
    quickReplies: ["An Max pingen", "DB jetzt nachhaken", "Nichts tun"],
  },
  inbox: {
    tool: toolRows.inbox,
    blocks: [
      paragraph("inbox-intro", inline("Klar. In deiner Inbox liegen aktuell "), inline("4 Einträge", "strong"), inline(". Mein Vorschlag:")),
      ordered("inbox-items", [
        {
          title: [inline("Anna wegen Angebot schreiben", "strong")],
          body: [inline("→ "), inline("Nächste Schritte / Arbeit", "emphasis"), inline(", geplant für morgen.")],
        },
        {
          title: [inline("Steuerunterlagen sortieren", "strong")],
          body: [inline("→ "), inline("Nächste Schritte / Persönlich", "emphasis"), inline(", ohne festen Termin.")],
        },
        {
          title: [inline("YouTube-Idee „AI Apps“", "strong")],
          body: [inline("→ "), inline("Vielleicht irgendwann", "emphasis"), inline(", beobachten.")],
        },
        {
          title: [inline("Geschenk für Mama recherchieren", "strong")],
          body: [inline("→ "), inline("Nächste Schritte / Persönlich", "emphasis"), inline(", Geburtstag in 2 Wochen.")],
        },
      ]),
      paragraph("inbox-question", inline("Soll ich das so übernehmen, oder willst du was anpassen?")),
    ],
    quickReplies: ["So übernehmen", "Anders verteilen", "Später"],
  },
  acknowledge: {
    tool: toolRows.acknowledge,
    blocks: [],
    quickReplies: ["Räum die Inbox auf", "Was steht heute an?"],
  },
  planEntered: {
    tool: toolRows.planEntered,
    blocks: [
      paragraph(
        "plan-entered-confirmation",
        inline("Erledigt. Ich habe den Plan in "),
        inline("2026-05-07.md", "code"),
        inline(" eingetragen — drei Slots, zwei Hinweise als Notiz."),
      ),
      paragraph(
        "plan-entered-next-actions",
        inline("In "),
        inline("Nächste Schritte", "emphasis"),
        inline(" bleibt alles wie es war; morgen früh frage ich dich, ob wir loslegen."),
      ),
    ],
    quickReplies: ["Was sonst noch?", "Nichts mehr"],
  },
  annaPriority: {
    tool: toolRows.annaPriority,
    blocks: [
      paragraph("anna-priority-confirmation", inline("Gemerkt. "), inline("Anna", "strong"), inline(" ist morgen oben.")),
      paragraph(
        "anna-priority-planning-hint",
        inline("Wenn du willst, plane ich den Rest des Tages drumherum — sag einfach "),
        inline("„Plan morgen“", "emphasis"),
        inline(" oder gib mir, wie viel Zeit du hast."),
      ),
    ],
    quickReplies: ["Plan morgen — 4 h", "Erstmal nur erfassen"],
  },
  captureOnly: {
    tool: toolRows.captureOnly,
    blocks: [
      paragraph("capture-only-body", inline("Klar. Drück den Mic-Button oder schreib einfach — ich höre zu, ohne zu sortieren.")),
    ],
  },
  later: {
    tool: toolRows.later,
    blocks: [paragraph("later-body", inline("Alles gut. Ich frage später nochmal nach."))],
  },
} satisfies Record<MockFlow, MockAssistantResponse>;

export function getMockResponse(flow: MockFlow, capturedText?: string): MockAssistantResponse {
  if (flow !== "acknowledge") {
    return responses[flow];
  }

  return {
    ...responses.acknowledge,
    blocks: [
      paragraph(
        "acknowledge-captured",
        inline("Notiert — "),
        inline(`„${capturedText ?? "Das"}“`, "emphasis"),
        inline(" liegt jetzt in deiner Inbox."),
      ),
      paragraph(
        "acknowledge-next-step",
        inline("Wenn du willst, sag "),
        inline("„Räum die Inbox auf“", "emphasis"),
        inline(" und wir sortieren zusammen — oder ich mache nichts und du fragst später danach."),
      ),
    ],
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
    blocks: [...response.blocks],
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
