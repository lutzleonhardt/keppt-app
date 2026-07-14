---
title: ngx-markdown: Standalone Angular Integration, Rendering & Security
author: lutzleonhardt
share_url: https://lutzleo.sourcegraph.app/deepsearch/c00c310f-c4d8-43a3-8b47-2e653e160330
created: 2026-05-22T20:22:05Z
updated: 2026-05-22T20:23:24Z
---

# github.com/jfcere/ngx-markdown

 1. Standalone Angular setup: Was ist die aktuelle empfohlene Integration für standalone Angular Apps mit ApplicationConfig? Konkret: provideMarkdown() vs.
     MarkdownModule.forRoot() und welche Imports im Component nötig sind.
  2. Plain string rendering: Was ist der empfohlene Weg für einen Markdown-String aus einer Signal/Input-Property? Konkret: <markdown [data]="..."> oder
     eine andere API.
  3. Dependencies: Braucht ngx-markdown aktuell zusätzliche Peer/Runtime Dependencies wie marked, prismjs, mermaid, dompurify oder HttpClient, wenn wir nur
     lokale Markdown-Strings rendern?
  4. Styling generated DOM: Gibt es in den Docs Hinweise zu View Encapsulation oder Styling von erzeugten Markdown-Elementen? Ich will vermeiden, dass
     Component-SCSS nicht auf die generierten p, ul, code etc. greift.
  5. Security/sanitization defaults: Wie sanitizt ngx-markdown Markdown/HTML aktuell standardmäßig, und müssen wir etwas konfigurieren, wenn Mock-Strings
     lokal sind, später aber Backend-Content kommen kann?



Jetzt habe ich alle nötigen Informationen. Hier sind die Antworten auf alle fünf Fragen, direkt aus dem Quellcode und der README belegt:

---

## 1. Standalone Angular Setup: `provideMarkdown()` vs. `MarkdownModule.forRoot()`

Fur standalone Apps mit `ApplicationConfig` ist **`provideMarkdown()`** der empfohlene Weg ([`provide-markdown.ts`](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/provide-markdown.ts)):

```typescript
// app.config.ts
import { provideMarkdown } from 'ngx-markdown';

export const appConfig: ApplicationConfig = {
  providers: [
    provideMarkdown(),
  ],
};
```

`MarkdownModule.forRoot()` ist fur NgModule-basierte Apps gedacht — intern ruft es aber ohnehin auch `provideMarkdown()` auf ([`markdown.module.ts` L55-61](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.module.ts?L55-L61)).

**Imports im Component:** `MarkdownComponent` und `MarkdownPipe` sind selbst standalone-deklariert (sie stehen in `sharedDeclarations` des `@NgModule` unter `imports:`). Du importierst sie direkt im Component:

```typescript
import { MarkdownComponent } from 'ngx-markdown';

@Component({
  standalone: true,
  imports: [MarkdownComponent],
  ...
})
```

`provideMarkdown()` registriert nur den `MarkdownService` und optionale Tokens — der Component-Import ist davon unabhangig.

---

## 2. Plain String Rendering aus Signal/Input-Property

Der empfohlene Weg ist `<markdown [data]="...">`. Das ist die offizielle Variable-Binding-API ([`markdown.component.ts` L28](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.component.ts?L28), [README L888](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/README.md?L888)):

```html
<!-- Standard variable binding -->
<markdown [data]="markdownString()" />

<!-- Inline-Modus: kein umschließendes <p>-Tag -->
<markdown [data]="markdownString()" [inline]="true" />
```

`[data]` ist ein `@Input() data: string | null | undefined` — ein Signal-Wert (z.B. `mySignal()`) funktioniert direkt in der Template-Expression. Bei `ngOnChanges()` wird automatisch neu gerendert wenn sich `data` andert ([`markdown.component.ts` L109-L116](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.component.ts?L109-L116)).

Alternativ gibt es die **Pipe**:
```html
<div [innerHTML]="markdownString() | markdown | async"></div>
```

---

## 3. Dependencies fur lokale Strings

**Pflicht:**
- `marked@^18.0.0` — wird immer benotigt, ist die Kern-Parsing-Engine ([README L57](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/README.md?L57))

**Nicht benotigt fur lokale Strings:**
- **`HttpClient`** — nur erforderlich wenn `[src]="url"` (remote files) genutzt wird. Ohne es wird ein Fehler geworfen ([`markdown.service.ts` L51, L222-L228](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.service.ts?L51-L228))
- **`prismjs`** — optional, nur fur Syntax-Highlighting
- **`mermaid`** — optional, nur wenn `mermaid`-Attribut genutzt wird
- **`dompurify`** — optional, kann als Custom-Sanitizer eingebunden werden, ist aber kein Default
- **`emoji-toolkit`, `katex`, `clipboard`** — alle optional

Fur reine lokale Markdown-Strings genugt also:
```bash
npm install ngx-markdown marked@^18.0.0
```

---

## 4. Styling des generierten DOM / View Encapsulation

Die Bibliothek gibt **keine eigenen Styles** aus und macht **keine Aussagen zu View Encapsulation** in der README oder im Quellcode. Was wichtig ist:

`MarkdownComponent` setzt das HTML direkt via [`this.element.nativeElement.innerHTML = parsed`](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.component.ts?L159) — die generierten `<p>`, `<ul>`, `<code>` etc. sind **natives DOM innerhalb der Host-Component**, nicht in einem Shadow DOM.

Das bedeutet: Angulars Standard-View-Encapsulation (`Emulated`) schreibt Attribute-Selektoren nur auf Template-Elemente, **nicht auf per `innerHTML` injiziertes DOM**. SCSS-Regeln wie `p { ... }` aus dem Host-Component greifen daher nicht.

**Losung:** Styles fur das Markdown-Output mussen entweder:
1. **Global** definiert werden (`styles.scss`), oder
2. Mit `:host ::ng-deep` aus dem Component heraus (deprecated, aber noch gebrauchlich):
   ```scss
   :host ::ng-deep markdown {
     p { ... }
     ul { ... }
     code { ... }
   }
   ```
3. Im `markdown`-Host-Element selbst per `encapsulation: ViewEncapsulation.None` auf der *eigenen* Wrapper-Component.

---

## 5. Security / Sanitization Defaults

**Standard-Verhalten:** Sanitization ist **defaultmäßig aktiv** und verwendet Angulars `DomSanitizer` mit `SecurityContext.HTML` ([`markdown.service.ts` L130](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.service.ts?L130), [`sanitizeHtml()` L462-470](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.service.ts?L462-L470)):

```typescript
private readonly DEFAULT_SECURITY_CONTEXT = SecurityContext.HTML;

private async sanitizeHtml(html: string | Promise<string>): Promise<string> {
  if (isSanitizeFunction(this.sanitize)) {
    return this.sanitize(await html); // custom function takes priority
  }
  if (this.sanitize !== SecurityContext.NONE) {
    return this.sanitizer.sanitize(this.sanitize ?? this.DEFAULT_SECURITY_CONTEXT, html) ?? '';
  }
  return html; // only if explicitly set to NONE
}
```

Die Reihenfolge:
1. Wenn `SANITIZE`-Token eine **Funktion** ist → diese wird aufgerufen
2. Wenn `SANITIZE`-Token ein `SecurityContext` ist (und nicht `NONE`) → `DomSanitizer.sanitize()`
3. Wenn `SecurityContext.NONE` → kein Sanitizing

**Empfehlung fur euren Use Case:**

- Fur lokale Mock-Strings reicht der Default (`SecurityContext.HTML`) — sicher.
- Sobald Backend-Content kommt, bleibt der Default ebenfalls korrekt. Angulars `DomSanitizer.sanitize(SecurityContext.HTML, ...)` entfernt gefährliche Tags/Attribute.
- Fur strengeres Sanitizing (z.B. DOMPurify), das auch spezifische Markdown-Artefakte bereinigt, kann direkt via `provideMarkdown`:

```typescript
import DOMPurify from 'dompurify';

provideMarkdown({
  sanitize: {
    provide: SANITIZE,
    useValue: (html: string) => DOMPurify.sanitize(html),
  },
})
```

`disableSanitizer` am einzelnen `<markdown>`-Element ([L32-33](https://lutzleo.sourcegraph.app/r/github.com/jfcere/ngx-markdown/-/blob/lib/src/markdown.component.ts?L32-L33)) sollte nur fur vollständig vertrauenswurdige Inhalte verwendet werden.

## Sources

- [github.com/jfcere/ngx-markdown](/github.com/jfcere/ngx-markdown)
- [repo:^github.com/jfcere/ngx-markdown$ provideMarkdown ApplicationConfig standalone](/search?q=patterntype:keyword%20repo:%5Egithub.com%2Fjfcere%2Fngx-markdown$%20provideMarkdown%20ApplicationConfig%20standalone)
- [github.com/jfcere/ngx-markdown/README.md@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/README.md)
- [github.com/jfcere/ngx-markdown](/github.com/jfcere/ngx-markdown)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.component.ts@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.component.ts)
- [github.com/jfcere/ngx-markdown/lib/src/provide-markdown.ts@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/provide-markdown.ts)
- [github.com/jfcere/ngx-markdown/lib/src/sanitize-options.ts@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/sanitize-options.ts)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.module.ts@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.module.ts)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.service.ts@194de40?L1-100](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.service.ts?L1-100)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.service.ts@194de40?L100-200](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.service.ts?L100-200)
- [github.com/jfcere/ngx-markdown/lib/src/index.ts@194de40](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/index.ts)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.service.ts@194de40?L200-300](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.service.ts?L200-300)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.service.ts@194de40?L300-370](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.service.ts?L300-370)
- [repo:^github.com/jfcere/ngx-markdown$ sanitizeHtml SecurityContext](/search?q=patterntype:keyword%20repo:%5Egithub.com%2Fjfcere%2Fngx-markdown$%20sanitizeHtml%20SecurityContext)
- [repo:^github.com/jfcere/ngx-markdown$ private sanitizeHtml](/search?q=patterntype:keyword%20repo:%5Egithub.com%2Fjfcere%2Fngx-markdown$%20private%20sanitizeHtml)
- [repo:^github.com/jfcere/ngx-markdown$ sanitizeHtml isSanitizeFunction file:markdown.service.ts](/search?q=patterntype:keyword%20repo:%5Egithub.com%2Fjfcere%2Fngx-markdown$%20sanitizeHtml%20isSanitizeFunction%20file:markdown.service.ts)
- [github.com/jfcere/ngx-markdown/lib/src/markdown.service.ts@194de40?L460-490](/github.com/jfcere/ngx-markdown@194de400f958e88de6f2bfe74263480ea6bd1bbd/-/blob/lib/src/markdown.service.ts?L460-490)

