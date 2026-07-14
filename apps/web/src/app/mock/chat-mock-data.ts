import type {
  AssistantContentMessage,
  AssistantToolMessage,
  QuickReply,
  ToolName,
  ToolState,
} from "../chat/chat.types";

/**
 * A mock turn is an ordered block list in generation order — the same shape the
 * real ChatService adapter will produce from the backend tool-call stream. A
 * `tool` block is one structured tool call; `prose` is assistant text; `chips`
 * stands in for `suggest_quick_replies` (always last, at most once). The mock
 * never represents `suggest_quick_replies` as a tool block, so it can never leak
 * into a tool row — exactly the adapter contract for the real service.
 */
export interface MockToolBlock {
  readonly kind: "tool";
  readonly tool: ToolName;
  readonly target: string;
  readonly summary?: string;
  readonly durationMs?: number;
}

export interface MockProseBlock {
  readonly kind: "prose";
  readonly markdown: string;
}

export interface MockChipsBlock {
  readonly kind: "chips";
  readonly labels: readonly string[];
}

export type MockBlock = MockToolBlock | MockProseBlock | MockChipsBlock;
export type MockTurn = readonly MockBlock[];

export type MockFlow =
  | "greeting"
  | "captureConfirm"
  | "planning"
  | "today"
  | "waiting"
  | "inbox"
  | "nextContext"
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
  // Content-specific to the demo dictation: all three captured items must
  // co-occur (any order), because the captureConfirm turn enumerates exactly
  // these three. Generic inbox phrasing ("sortiere meine Inbox", "Inbox
  // aufräumen") can never match this, so it cannot shadow the inbox route.
  captureConfirm:
    /(?=[\s\S]*anna wegen angebot)(?=[\s\S]*steuerunterlagen)(?=[\s\S]*(?:youtube|ai apps))/i,
  planning: /4 stunden|plan morgen|plan für morgen|realistisch/i,
  // Before `today`: phrasings like "Was passt heute zu mir?" carry the more
  // specific what-fits-me intent even though they contain "heute".
  nextContext:
    /was passt|passt jetzt|passt gerade|what fits|fits me right now/i,
  today: /heute|today|wichtig|fokus/i,
  waiting: /\bwarte(?:n)?\b|waiting|max|db/i,
  inbox: /inbox|aufräumen|sortier/i,
} as const;

// Block authoring helpers — keep the turn scripts readable.
function read(target: string): MockToolBlock {
  return { kind: "tool", tool: "read_file", target };
}

function edit(target: string, summary: string): MockToolBlock {
  return { kind: "tool", tool: "edit_file", target, summary };
}

function writeFile(target: string, summary: string): MockToolBlock {
  return { kind: "tool", tool: "write_file", target, summary };
}

function find(target: string): MockToolBlock {
  return { kind: "tool", tool: "find_task_occurrences", target };
}

function prose(markdown: string): MockProseBlock {
  return { kind: "prose", markdown };
}

function chips(...labels: string[]): MockChipsBlock {
  return { kind: "chips", labels };
}

function acknowledgeTurn(capturedText?: string): MockTurn {
  return [
    edit("tasks/inbox.md", "In Inbox abgelegt"),
    prose(
      [
        `Notiert — *„${capturedText ?? "Das"}“* liegt jetzt in deiner Inbox.`,
        "Wenn du willst, sag *„Räum die Inbox auf“* und wir sortieren zusammen — oder ich mache nichts und du fragst später danach.",
      ].join("\n\n"),
    ),
    chips("Räum die Inbox auf", "Was steht heute an?"),
  ];
}

const responses = {
  greeting: [
    read("tasks/inbox.md"),
    read("tasks/focus.md"),
    read("tasks/waiting.md"),
    read("daily/2026-05-06.md"),
    prose(
      [
        "Guten Morgen, Lutz. Heute ist **Mittwoch, 6. Mai**.",
        "Eine offene Rückmeldung wartet seit 8 Tagen — **DB Follow-up-Call**. Willst du kurz reinschauen, bevor wir den Tag planen?",
      ].join("\n\n"),
    ),
    chips("Tag planen", "Warten auf zeigen", "Erstmal nur erfassen"),
  ],
  captureConfirm: [
    edit("tasks/inbox.md", "Anna & Steuerunterlagen in Inbox abgelegt"),
    edit(
      "tasks/someday-maybe.md",
      "YouTube-Idee in Vielleicht/irgendwann abgelegt",
    ),
    prose(
      [
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
    ),
    chips("Ja, Anna zuerst", "Plan morgen — 4 h", "Später entscheiden"),
  ],
  planning: [
    read("tasks/focus.md"),
    read("tasks/next-actions.md"),
    read("tasks/waiting.md"),
    read("daily/2026-05-06.md"),
    prose(
      [
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
    ),
    chips("Ja, eintragen", "Anpassen"),
  ],
  today: [
    read("tasks/focus.md"),
    read("tasks/next-actions.md"),
    read("tasks/waiting.md"),
    read("daily/2026-05-06.md"),
    prose(
      [
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
    ),
    chips("An Max pingen", "Tagesplan starten", "Plan für morgen"),
  ],
  waiting: [
    read("tasks/waiting.md"),
    prose(
      [
        "Zwei offene Rückmeldungen liegen bei dir:",
        "",
        "1. **Max — Feedback zur Rechnung.**  ",
        "   Seit 3 Tagen · noch im Rahmen.",
        "2. **DB — Follow-up-Call.**  ",
        "   Seit 8 Tagen · überfällig.",
        "",
        "Soll ich an einen von beiden erinnern?",
      ].join("\n"),
    ),
    chips("An Max pingen", "DB jetzt nachhaken", "Nichts tun"),
  ],
  inbox: [
    read("tasks/inbox.md"),
    read("tasks/next-actions.md"),
    read("tasks/someday-maybe.md"),
    prose(
      [
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
    ),
    chips("So übernehmen", "Anders verteilen", "Später"),
  ],
  // The "im Chat fragen" hook of the Next-Actions screen ("Was passt jetzt zu
  // mir?"): suggest by energy/time fit from the real next-actions rows. The
  // React reference mock had only the generic acknowledge fallback here.
  nextContext: [
    read("tasks/next-actions.md"),
    read("daily/2026-05-06.md"),
    prose(
      [
        "Kommt drauf an, wie viel Raum du gerade hast:",
        "",
        "1. **Slides für Workshop drucken.**  ",
        "   15 Min · schnell erledigt, muss vor Donnerstag.",
        "2. **Anna wegen Angebot schreiben.**  ",
        "   ~30 Min · steht heute ohnehin im Fokus.",
        "3. **AI-Apps-Video gliedern.**  ",
        "   ~90 Min · nur, wenn du eine ruhige Phase hast.",
        "",
        "Soll **Anna** den Anfang machen?",
      ].join("\n"),
    ),
    chips("Ja, Anna zuerst", "Tag planen", "Später"),
  ],
  acknowledge: acknowledgeTurn(),
  // A genuinely mixed run: gather evidence (read + find), then mutate (write +
  // edit), all consecutive → one group whose header falls back to "N Schritte".
  planEntered: [
    read("tasks/focus.md"),
    read("tasks/next-actions.md"),
    find("Anna Angebot"),
    writeFile("daily/2026-05-07.md", "Plan für morgen eingetragen"),
    edit("tasks/next-actions.md", "Nächste Schritte ergänzt"),
    prose(
      [
        "Erledigt. Ich habe den Plan in `2026-05-07.md` eingetragen — drei Slots, zwei Hinweise als Notiz.",
        "In *Nächste Schritte* habe ich die Slots ergänzt; morgen früh frage ich dich, ob wir loslegen.",
      ].join("\n\n"),
    ),
    chips("Was sonst noch?", "Nichts mehr"),
  ],
  annaPriority: [
    edit("tasks/focus.md", "Anna für morgen vorgemerkt"),
    prose(
      [
        "Gemerkt. **Anna** ist morgen oben.",
        "Wenn du willst, plane ich den Rest des Tages drumherum — sag einfach *„Plan morgen“* oder gib mir, wie viel Zeit du hast.",
      ].join("\n\n"),
    ),
    chips("Plan morgen — 4 h", "Erstmal nur erfassen"),
  ],
  // A pure acknowledgement: nothing is read or written, so the turn is prose
  // only — the realistic "no tool needed" path.
  captureOnly: [
    prose(
      "Klar. Tipp auf das Mikrofon oder schreib einfach — ich höre zu, ohne zu sortieren.",
    ),
  ],
  later: [prose("Alles gut. Ich frage später nochmal nach.")],
} satisfies Record<MockFlow, MockTurn>;

export function getMockResponse(
  flow: MockFlow,
  capturedText?: string,
): MockTurn {
  if (flow === "acknowledge") {
    return acknowledgeTurn(capturedText);
  }

  return responses[flow];
}

export function createToolMessage(
  id: string,
  createdAt: string,
  block: MockToolBlock,
  state: ToolState,
): AssistantToolMessage {
  return {
    id,
    role: "assistant",
    kind: "tool",
    tool: block.tool,
    target: block.target,
    summary: block.summary,
    state,
    createdAt,
  };
}

export function createContentMessage(
  id: string,
  createdAt: string,
  markdown: string,
): AssistantContentMessage {
  return {
    id,
    role: "assistant",
    kind: "content",
    markdown,
    createdAt,
  };
}

export function toQuickReplies(labels: readonly string[]): QuickReply[] {
  return labels.map(createQuickReply);
}

function createQuickReply(label: string): QuickReply {
  return {
    id: label
      .toLowerCase()
      .replace(/[^a-z0-9äöüß]+/gi, "-")
      .replace(/^-|-$/g, ""),
    label,
  };
}
