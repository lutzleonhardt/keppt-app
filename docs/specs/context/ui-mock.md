Schön, dass du wieder da bist. Lass mich kurz das, was wir vor einer Woche entschieden hatten, rekapitulieren und dann konkret für deine Mock-first-Phase einen Stack vorschlagen.

## Wo wir gelandet sind (Path A)

Unsere Entscheidung war: **kein Hashbrown, kein AG-UI, kein A2UI im Default-Modus**. Stattdessen Vercel-native mit `@ai-sdk/angular`, custom Angular-Komponenten, ngx-markdown für Rendering, typisierte Tools für bekannte UI-Patterns. A2UI optional erst in Phase 2 für den Adjust-Modus. Single-Platform Web first, Capacitor als reine Shell darüber.

## Aktualisierung 2026-05-22

Für die Angular-Planung ziehen wir `ngx-markdown` jetzt vor, bevor die Chat-Oberfläche weiter ausgebaut wird. Assistant-Prosa soll als Markdown-String durchgereicht und gerendert werden. Der Client baut keinen eigenen Markdown- oder Prosa-AST.

Typisierte Daten bleiben dort sinnvoll, wo es echte Produkt-UI ist: Tool-/Status-Zeilen, Quick Replies und später bewusst eingeführte Widgets wie Confirmation oder Plan-Listen. Diese Patterns sind keine Markdown-Hacks, sondern Teil des UI-Vertrags.

Für deine **Mock-first-Phase** ist das super günstig: du kannst sogar zunächst **komplett ohne `@ai-sdk/angular`** anfangen und es später nachrüsten. Die Idee ist, dass deine UI hinter einer Service-Abstraktion lebt, sodass Mock und echte Implementierung später austauschbar sind.

## Konkrete Tech-Empfehlung

**Framework-Basis:**
- **Angular 20+** mit standalone components + Signals als Default
- **Tailwind CSS** für Styling — passt zu deinem cleanen, off-white Mockup-Stil und gibt dir maximale Kontrolle ohne UI-Kit-Korsett
- **lucide-angular** für Icons (clean, modern, passt visuell zu Keppt)
- **ngx-markdown** für Markdown-Rendering im Chat
- **Capacitor** als spätere Shell — kein UI-Impact, du brauchst zu Beginn nichts dafür einrichten

**Bewusst NICHT empfohlen:**
- Angular Material — zu "Google Material", passt nicht zu Keppts Ästhetik
- PrimeNG — schwer, optisch dated
- Spartan UI / DaisyUI / shadcn-Ports — verlockend, aber für 6-8 eigene Komponenten ist es Overkill, eine UI-Library zu lernen

**Für die Mock-Phase weiterhin nicht nötig:**
- `@ai-sdk/angular` — wird später eingezogen
- Capacitor Plugins (Speech, Push, etc.) — erst wenn echtes Gerät dran ist

**Für den aktuellen Angular-Plan vorziehen:**
- `ngx-markdown` — wird vor Task 3 eingeführt, damit Assistant-Prosa nicht als eigener AST modelliert wird.

## Die Service-Abstraktion (kritisch für sauberen Swap)

Damit das Mock später schmerzfrei gegen die echte Implementierung austauschbar ist, definierst du eine Schnittstelle und programmierst die Komponenten ausschließlich gegen sie:

```ts
// chat.service.ts (Interface)
export interface ChatService {
  messages: Signal<ChatMessage[]>;
  status: Signal<'idle' | 'streaming' | 'error'>;
  sendMessage(content: string): Promise<void>;
  switchSession(sessionId: string): Promise<void>;
}

// chat.service.mock.ts
@Injectable()
export class MockChatService implements ChatService {
  readonly messages = signal<ChatMessage[]>(MOCK_DATA);
  readonly status = signal('idle' as const);

  async sendMessage(content: string) {
    // einfache Keyword-Mappings: "morgen" → Plan-Antwort, etc.
    // optional mit setTimeout simulieren, um Streaming-Feel zu testen
  }
}

// später: chat.service.vercel.ts
@Injectable()
export class VercelChatService implements ChatService {
  // nutzt @ai-sdk/angular's injectChat() unter der Haube
}
```

In `app.config.ts` provideierst du jetzt `MockChatService`, später swappst du auf `VercelChatService` — eine Zeile Änderung, der gesamte UI-Code bleibt gleich.

## UI-Komponenten, die du brauchst

Basierend auf deinen Mockups würde ich folgende eigene Komponenten anlegen — alle klein, alle OnPush oder Signal-basiert:

| Komponente | Aufgabe |
|---|---|
| `<chat-bubble>` | User- und Assistant-Messages mit Markdown |
| `<status-badge>` | "Keppt checked your open items >" Hinweise |
| `<quick-replies>` | Chip-Row für Folgevorschläge |
| `<confirmation-card>` | "Should Anna be the priority?" mit Buttons |
| `<plan-list>` | Numbered Plan mit Title/Subtitle/Duration |
| `<chat-input>` | Textfeld + Voice-Button |
| `<session-header>` | Top-Bar mit Datum + Menü |
| `<archive-list>` | Sidebar/Drawer mit alten Sessions (später) |

Das sind 6-8 Komponenten. In zwei bis drei Tagen entspannt fertig.

## Projekt-Setup

Wenn du noch nicht im Monorepo bist, ist jetzt der richtige Moment. Empfehlung passt zu deinem Architektur-Doc:

```
keppt/
├── packages/
│   ├── core/                    ← schon da
│   └── shared-types/            ← optional: gemeinsame Message-Types
├── apps/
│   ├── cli/                     ← schon da
│   └── web/                     ← NEU
│       ├── src/
│       │   ├── app/
│       │   │   ├── chat/
│       │   │   │   ├── chat.component.ts
│       │   │   │   ├── chat-bubble.component.ts
│       │   │   │   ├── chat-input.component.ts
│       │   │   │   └── quick-replies.component.ts
│       │   │   ├── services/
│       │   │   │   ├── chat.service.ts (interface)
│       │   │   │   └── chat.service.mock.ts
│       │   │   ├── mocks/
│       │   │   │   └── conversations.ts (Mock-Daten)
│       │   │   └── app.config.ts
│       │   └── styles.css (Tailwind)
│       ├── angular.json
│       └── package.json
```

Für das Monorepo selbst: **Nx** oder **pnpm workspaces** sind beide gut. Nx ist mächtiger (Caching, Generators, Dependency-Graph), pnpm minimaler. Für deine Größe würde ich **pnpm workspaces** nehmen — weniger Boilerplate, du hast die Kontrolle.

## Setup-Schritte konkret

```bash
# Im Monorepo-Root
pnpm create vite@latest apps/web -- --template angular
# Oder klassisch: ng new web --directory=apps/web --routing --style=css

# Tailwind dazu
cd apps/web
pnpm add -D tailwindcss postcss autoprefixer
npx tailwindcss init -p

# Icons + Markdown
pnpm add lucide-angular
pnpm add ngx-markdown
```

In `app.config.ts`:
```ts
export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    { provide: ChatService, useClass: MockChatService },
    // später: { provide: ChatService, useClass: VercelChatService }
  ],
};
```

## Was du jetzt konkret zuerst bauen würdest

1. **Layout-Grundgerüst** — Header, Chat-Bereich, Input-Bar (alles statisch, kein Verhalten)
2. **`chat-bubble` + `chat-input`** — funktionierender minimaler Chat, hartcodierte Messages
3. **`MockChatService`** — sendMessage simuliert eine Antwort nach 500ms, Signals updaten, UI rendert
4. **Quick-Reply-Chips** — wenn der "Assistant" sie liefert, klickbar, neue Message wird gesendet
5. **Status-Badges + Plan-List + Confirmation-Card** — die anderen drei Patterns aus deinen Mockups
6. **Session-Header + Tagesnavigation** — auch erstmal mit hartcodierten "gestern"/"heute"-Mocks
7. **Tailwind-Theme tunen** — die warm-off-white-Farbe von Keppt treffen, Schriftart entscheiden

Mit dem Setup hast du in einer Woche die komplette UI-Hülle stehen und kannst beliebig viele Mock-Konversationen testen, Animationen feinschleifen, Voice-Knopf in Pose bringen — alles ohne dass eine echte LLM-Anbindung dranhängt. Die spätere Verkabelung ist dann nur noch ein `useClass`-Tausch.

## Eine Sache, die du jetzt schon vorbereiten kannst

Definier dir bereits jetzt das **Message-Format**, das du später vom echten Backend erwartest — am besten in `packages/shared-types` oder direkt in `packages/core`. So matchen Mock und Real später garantiert. Ungefähr:

```ts
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;          // Markdown
  widgets?: Widget[];       // QuickReplies, Confirmation, PlanList, etc.
  createdAt: string;
};

type Widget =
  | { type: 'quick-replies'; options: QuickReply[] }
  | { type: 'confirmation'; question: string; primary: string; secondary: string }
  | { type: 'plan-list'; title: string; items: PlanItem[]; notTomorrow?: string[] }
  | { type: 'status-badge'; text: string; expandable: boolean };
```

Das ist gleichzeitig der Vertrag, den dein Server später erfüllen muss — und in der Mock-Phase definierst du ihn entspannt durch echte Use-Cases statt rückwärts aus Backend-Implementierungs-Constraints.

Wenn du willst, kann ich dir die initialen Files (Mock-Service, Chat-Bubble-Komponente, Tailwind-Config mit Keppt-Theme) gleich generieren — sag einfach Bescheid.
