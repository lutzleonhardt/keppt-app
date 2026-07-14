import type { DailyNoteRef } from "../vault/vault.types";
import { MOCK_TODAY } from "./mock-app-context";

// Mock vault content in the real storage format (packages/core system prompt):
// R9 checkbox tasks (`- [ ]` open, `- [x]` done) with the reference mock's row
// metas as trailing text, R7 `##` category headings in next-actions, R10
// Plan/Log/Notizen daily sections. Like all mock data this is German by design —
// it simulates user/backend content, not UI chrome (no translation keys).

const inbox = `- [ ] Anna wegen Angebot schreiben (erfasst · gerade eben)
- [ ] Steuerunterlagen sortieren (erfasst · gerade eben)
- [ ] YouTube-Idee — „AI Apps“ (erfasst · gerade eben)
- [ ] Geschenk für Mama recherchieren (gestern · 21:14)
`;

const focus = `- [ ] Anna wegen Angebot schreiben (Wichtig & zeitnah)
- [ ] AI-Apps-Video gliedern (Content-Ziel · diese Woche)
- [ ] Auftrag VW abschließen (Letzter Liefertermin Freitag)
`;

const nextActions = `## Arbeit

- [ ] Anna wegen Angebot schreiben (~30 min)
- [ ] AI-Apps-Video gliedern (~90 min · ruhige Phase)
- [ ] Slides für Workshop drucken (15 min · vor Donnerstag)

## Haus & Garten

- [ ] Wassertank Heizung prüfen (an einem Wochenende)
- [ ] Hecke schneiden (wenn trocken)

## Persönlich

- [ ] Geschenk für Mama recherchieren (Geburtstag in 2 Wochen)
- [ ] Steuerunterlagen vorsortieren (20 min reichen vorerst)
`;

const waiting = `- [ ] Feedback von Max zur Rechnung (seit 3 Tagen · sanft nachfragen?)
- [ ] Antwort von DB zum Followup-Call (seit 8 Tagen · überfällig)
`;

const somedayMaybe = `- [ ] Sabbatical-Konzept skizzieren (irgendwann · ohne Druck)
- [ ] Buchidee: GTD ohne Aufwand (beobachten, ob es bleibt)
- [ ] Rust durchspielen (wenn Zeit ist)
- [ ] Garten-Wasserspiel (Frühling 2027)
`;

// Past-day plan items the log confirms as closed are `- [x]` (R10: plan
// checkbox state mirrors how the day ended); today's plan is still open.

const daily0506 = `## Plan

- [ ] Anna wegen Angebot schreiben (Fokus · ~30 min)
- [ ] AI-Apps-Video gliedern (Content · ~90 min)
- [ ] Steuerunterlagen 20 min vorsortieren (Schnell)

## Log

- 09:12 — „Milch kaufen“ → in die Inbox aufgenommen.
- 09:15 — Tagesplan erstellt: 3 Tasks geplant.
- 14:30 — Steuerunterlagen → von Inbox in Nächste Schritte verschoben.

## Notizen

Sanfter Tag. Anna hat noch nicht geantwortet — morgen erneut prüfen.
`;

const daily0505 = `## Plan

- [x] LinkedIn-Post veröffentlichen (Content)
- [x] Workshop-Slides Review (~60 min)
- [ ] Steuerunterlagen sichten (optional)

## Log

- 10:04 — „LinkedIn-Post“ → erledigt (war in Nächste Schritte).
- 11:22 — Workshop-Slides Review fertig.
- 21:05 — Plan für morgen erstellt: 3 Tasks aus Nächste Schritte.
`;

const daily0504 = `## Plan

- [x] Weekly Review durchgehen (~30 min)
- [x] Inbox aufräumen (~15 min)

## Log

- 09:00 — Weekly Review gestartet.
- 09:34 — 5 alte „Vielleicht irgendwann“-Items bereinigt.
- 09:48 — Fokus für KW 19 gesetzt: Anna · AI-Apps-Video · VW.
`;

const daily0503 = `## Plan

## Log

- 17:48 — „Buchidee: GTD ohne Aufwand“ → Vielleicht irgendwann.
- 20:02 — „Garten-Wasserspiel“ → Vielleicht irgendwann.

## Notizen

Bewusst ohne Plan. Hat gut getan.
`;

export const mockVaultFiles: Readonly<Record<string, string>> = {
  "tasks/inbox.md": inbox,
  "tasks/focus.md": focus,
  "tasks/next-actions.md": nextActions,
  "tasks/waiting.md": waiting,
  "tasks/someday-maybe.md": somedayMaybe,
  "daily/2026-05-06.md": daily0506,
  "daily/2026-05-05.md": daily0505,
  "daily/2026-05-04.md": daily0504,
  "daily/2026-05-03.md": daily0503,
};

export const mockDailyIndex: readonly DailyNoteRef[] = [
  {
    date: MOCK_TODAY,
    isToday: true,
  },
  {
    date: "2026-05-05",
    isToday: false,
  },
  {
    date: "2026-05-04",
    isToday: false,
  },
  {
    date: "2026-05-03",
    isToday: false,
  },
];
