# keppt-app — Product Spec

> Technical Architecture & Design: [[keppt-app - Architecture]]

## The Problem

Getting Things Done (GTD) is one of the most respected productivity methodologies, but most people who try it fail — not because the method is bad, but because **the maintenance kills them.** Sorting the inbox, assigning to projects, doing the weekly review, planning tomorrow — it's all pure overhead. Existing task apps (Todoist, Things, Everdo, Notion) add even more friction with fields for energy levels, time estimates, contexts, tags, due dates. The system that was supposed to reduce cognitive load becomes another source of it.

## Market Validation (April 2026)

### Market Size

The productivity app market generated $32.5 billion in revenue in 2024. GTD remains an active category in 2026, with major review sites (ToolFinder, AsianEfficiency, ClickUp) publishing updated GTD app comparisons as recently as April 2026. The methodology has a loyal, engaged audience — the r/gtd subreddit, the David Allen Company's community, and productivity YouTube channels all drive ongoing demand.

### The Gap: Nobody Does "GTD Without the Work"

Every existing GTD app falls into the same trap: **they expect the user to understand and manually operate GTD.** The current landscape breaks down like this:

**Traditional GTD apps** (OmniFocus, Things 3, Nirvana, Todoist, TickTick, SingleFocus, Everdo):

- All require manual configuration, sorting, and review
- OmniFocus is so complex that many users get overwhelmed and abandon GTD entirely
- Things 3 is beautiful but Apple-only, no sequential projects, no review mode
- Todoist requires elaborate label/project workarounds to simulate proper GTD
- The biggest trend in 2026: users are simplifying and moving back to simpler tools — a sign of frustration with existing complexity

**AI-adjacent competitors** (Voiset, AI Task Buddy, SayDo AI, Task.it, Motion):

- **Voiset** (~€9.99/mo) is the closest to voice-first task management. But it's become a full team project management platform with dashboards, analytics, workload balancing. Users report a steep learning curve and overwhelming interface — the exact opposite of our approach. No GTD methodology built in.
- **SayDo AI** — explicitly positions as voice-first for tasks and calendar. Closest to our voice-input thesis, but no GTD methodology, no system maintenance, no review automation. A voice capture tool, not a trusted system.
- **AI Task Buddy** positions as voice-first alternative to Todoist. But it's a generic task manager with Kanban, Pomodoro, habit tracker bolted on. No GTD structure. Minimal traction (few reviews/ratings on App Store).
- **Todoist "Ramble"** — Todoist is building voice capture that converts spoken input into structured tasks. This validates the voice-first direction, but Ramble is a capture feature bolted onto an existing UI-heavy app — not a rethinking of the interaction model.
- **Task.it** uses AI to reschedule tasks on your calendar. GTD-adjacent but calendar-centric, not conversation-centric.
- **Motion** auto-schedules tasks and integrates with GTD concepts. But it's a premium ($19/mo), complex scheduling tool — not a simple voice companion.

**The actual white space**: Voice-first task capture is no longer unoccupied — SayDo AI and Todoist Ramble prove the direction has legs. But **no app combines low-friction natural-language interaction + GTD-as-autopilot + automated review/maintenance + open Markdown data + transparent consistency checking in a single product.** The gap is not "voice exists nowhere" but rather "nobody has built the self-maintaining trusted system."

### Pain Validation

The pain of GTD maintenance is well-documented across the ecosystem:

- "Many people jump straight to OmniFocus, get overwhelmed, and abandon GTD entirely" (ToolFinder, April 2026)
- "The best GTD app is the one you will actually use consistently" — repeated across every review site, implying most people fail to stick with their tools
- FacileThings — the most beloved guided GTD app — is still active and announced a new app beta for April 2026. This proves guided GTD has not just nostalgic demand but active, ongoing market interest. However, FacileThings is still a traditional UI-driven app requiring manual operation.
- "GTD success depends more on consistent weekly reviews and trusted capture than on choosing the perfect app" — yet no app automates the reviews
- The r/gtd community consistently discusses the maintenance burden as the #1 reason people fall off

### Comparable Revenue Signals

- OmniFocus: $9.99/month subscription (Apple-only, power users)
- Todoist Premium: $5/month, recently raised to $60/year — 30 million users
- Things 3: ~$80 one-time (Apple-only)
- SingleFocus: new entrant with ML-powered focus suggestions, positioning as modern GTD
- Nirvana: $39/year, pure GTD
- The market supports $5-15/month price points for individual productivity tools

### Validation Verdict

✅ **Pain is real and documented** — GTD maintenance failure is the #1 complaint across forums and review sites ✅ **Market is large** — productivity apps are a $32B+ market, GTD is an active sub-category ✅ **Gap exists** — voice capture exists (SayDo AI, Todoist Ramble), but nobody combines voice + GTD autopilot + open data + consistency engine ✅ **Competitors validate demand** — Voiset, Motion, and others prove people will pay for AI task management ⚠️ **Risk: trust is the killer** — if the system misfiles or loses a task even once, the product is emotionally burned. This is the #1 technical priority. ⚠️ **Risk: crowded adjacent market** — positioning must be razor-sharp to not be perceived as "another task app" ⚠️ **Risk: distribution** — building is easy, getting noticed is hard

## The Core Insight

**The user should never manage tasks. The user should talk, and the system manages.**

No forms. No drag-and-drop. No field selection. You speak or type, and the LLM maintains the entire GTD-like system behind the scenes. The methodology runs in the background — the user just has a conversation.

The real value is not "voice" as such. The real value is **less friction + continuous reality sync + hidden maintenance**. Voice is simply one very effective low-friction input mode, especially on mobile.

## What It Is

A radically simple app with two visible layers and one hidden one:

1. **One chat interface** — the main and simplest way to interact
2. **Talk or type input** — voice when it's easiest, text when that's more convenient
3. **A hidden document-based task engine** — the system maintains the underlying structure for you

That's it. No database-like UI for the user, no complex dashboards, no settings panels with 47 options.

## How It Works

### Daily Usage Examples

- "What's on for today?" → LLM reads daily note + next actions, gives prioritized list with context
- "What do you think is most important for me today?" → LLM cross-references tasks with user goals, prioritizes accordingly
- "What is my current goal?" → LLM reflects current focus back from profile/patterns
- "Which activities am I currently waiting on?" → LLM reads Waiting For list, flags overdue items
- "What do you think I should plan for tomorrow?" → LLM proposes plan, user confirms or adjusts
- "Push the tax return to next week" → LLM moves task, logs the shift in daily note
- "New task: write proposal for VW" → LLM puts it in inbox, or directly into the right project if obvious
- "I'm done with the LinkedIn post" → LLM checks it off, logs completion time in daily note
- "What's in my inbox?" → LLM lists items, suggests categorization
- "Clean up my inbox" → LLM proposes assignments to projects, user confirms with "yes" or "change X"
- Photo of a whiteboard → "Put this in my inbox" → stored as reference
- "Of my tasks, what's most important for the consulting business?" → LLM filters by goal relevance

### What the LLM Does Behind the Scenes

- Maintains GTD folder structure (Inbox, Next Actions, Projects, Waiting For, Someday/Maybe)
- Keeps daily notes in sync with the backend folders
- Logs task movements, completions, deferrals in daily notes
- Detects inconsistencies ("You have 3 tasks that have been in Next Actions for 2 weeks and never touched")
- Suggests evening planning, inbox reviews — proactively, not on rigid schedules
- Estimates effort/priority/context from conversation — no manual fields needed

## User Profile

**Open question: explicit profile vs. emergent understanding?**

Option A: User records a voice memo about their goals, work context, priorities → LLM distills a profile Option B: LLM derives understanding organically from tasks and conversations over time Option C: Both — light initial voice onboarding, then continuous refinement

Leaning toward: **Start with Option B (emergent), offer Option A as optional boost.** Keep onboarding friction at absolute zero.

## What This Is NOT

- Not another task app with lists, boards, and Gantt charts
- Not Todoist/Things/TickTick with AI bolted on
- Not a full Obsidian replacement
- Not an app that requires the user to understand GTD terminology

**It's a companion you talk to, who happens to run GTD for you.**

## Differentiators

|Aspect|Traditional Task Apps|keppt-app|
|---|---|---|
|Input method|Forms, fields, taps|Voice / natural language|
|GTD maintenance|Manual (user sorts, reviews, plans)|Automated (LLM handles it)|
|Complexity|Grows with features|Stays flat — just a chat|
|Learning curve|Learn the app + learn GTD|Just talk|
|Data format|Proprietary database|Plain Markdown files|
|Overhead feeling|"Another system to maintain"|"Someone maintains it for me"|

## Consistency Engine (Cross-Check Protocol)

**This is the most critical technical component of the entire product.** Trust is the #1 risk — if the system misfiles or loses a task even once, the user is gone. The consistency engine is not a nice-to-have; it's the reason this product works or doesn't.

Design principle: **"Conservative bookkeeper, not creative chatbot."** The system should never silently guess. It should show its work, confirm changes, and let the user verify.

### Three Pillars of Trust

**1. Operation Log** — Every action the system takes is logged with timestamp, source, and target. Not just "task moved" but "task X moved from next-actions.md line 12 to daily/2026-04-18.md, removed from next-actions.md, logged as deferred in daily/2026-04-15.md." This log is a plain Markdown file the user can inspect anytime.

**2. Diff Reporting** — After every operation, the system reports back what changed across which files. Not "done, trust me" but "here's what I did":

- ✅ Moved "Write VW proposal" from Next Actions → Friday plan
- ✅ Logged deferral in today's daily note
- ✅ Cross-checked project file "VW" — consistent
- ⚠️ Found: "VW follow-up call" in Waiting For for 8 days — action needed?

**3. Confirmability** — For destructive or ambiguous operations (deleting tasks, merging duplicates, reassigning projects), the system asks before acting. It proposes, the user confirms. The system is proactive but never autonomous on high-stakes changes.

### How a Typical Interaction Works

After the user says "Push the VW call to Friday", the LLM:

1. Moves the task in next-actions.md
2. Updates today's daily note (logged as deferred)
3. Updates Friday's daily note (added to plan)
4. Scans related project file for consistency
5. Writes all changes to the operation log
6. **Reports the diff transparently**: "Done. I moved the task in your Next Actions to Friday, logged it as deferred in today's daily note, and added it to Friday's note. While I was at it, I noticed: you have a second VW task that's been in Waiting For for 8 days — should I follow up on that?"

### Why This Is the Moat

- Traditional task apps silently move items — if something falls through the cracks, you only notice when it's too late
- Voice-first competitors (SayDo AI, Todoist Ramble) do capture, but none offer post-operation verification
- The operation log + diff is the difference between a toy and a trusted system
- Users will tolerate a slower, more verbose system over one that's fast but opaque

### Cost Implication

Cross-checks require reading multiple files per interaction → more tokens → higher cost. This is a deliberate trade-off: **correctness over cheapness.** It's also a natural premium feature differentiator.

**Critical rule: Cross-checks operate only on active files, never on archives.** The consistency engine reads `/tasks/*` and today's daily note — that's it. Archived completed tasks, past daily notes, and past sessions are never loaded during routine operations. This keeps the cross-check token cost constant regardless of how long someone has used the app.

The archive is only accessed on explicit user request: "What did I get done on the VW project last week?" triggers a targeted read from `archive/daily/` — not a routine cross-check scan.

## Monetization

### Unit Economics (Estimated)

- Simple interaction (Haiku, no cross-check): ~$0.001-0.002 → negligible
- Standard interaction (Haiku, with cross-check): ~$0.005-0.01
- Complex interaction (Sonnet, planning + cross-check): ~$0.03-0.05
- Heavy user (50 interactions/day, mixed): ~$5-8/month API cost
- Light user (10 interactions/day, mostly Haiku): ~$1-2/month API cost

### Free Tier: Strategy

**Goal:** User experiences the value before paying — without us losing money on it.

**Option A: Interaction limit (5/day, free forever)**
Pro: Permanent funnel, user can try the app long-term. "5 per day" is easy to understand.
Con: Crippled experience (5 interactions aren't enough for a real GTD day). Free users never properly use the system and therefore convert worse.
Cost: ~$0.005/day × 1,000 free users = ~$150/month. Negligible.

**Option B: Time-based trial (14 days full, then paywall)**
Pro: User experiences the full product including weekly review, daily planning, cross-check. Higher conversion because the user gets to know the real value.
Con: No permanent free funnel. After 14 days the user must pay or loses access.
Cost: 14 days × ~$0.05/day (full usage) = ~$0.70 per trial user. Acceptable.

**Option C: Hybrid (14-day trial + 3/day forever)**
Pro: Best of both worlds — full trial for conversion, then a minimal access tier that keeps the user engaged at no cost to us.
Con: Slightly more complex to communicate.

**Current recommendation: Option B (14-day trial).** Easy to communicate, maximum conversion, minimal cost. No risk of abuse (free users as a Claude proxy) because access ends after 14 days. Can be extended to Option C later.

**Technical:** `profiles.subscription_tier` starts as `'trial'`, `profiles.subscription_valid_until` is set to registration date + 14 days. After expiration → automatically `'free'` (0 or 3 interactions/day). Upgrade → Stripe/RevenueCat webhook sets tier to `'standard'` or `'premium'`.

### Payment Flow

**Registration → Trial → Paywall → Subscription:**

1. User signs up (Supabase Auth: Apple, Google, Email)
2. `profiles` entry is created: `tier = 'trial'`, `valid_until = now + 14 days`
3. User uses the full system for 14 days
4. Day 12: System gently reminds the user that the trial is ending
5. Day 14: Paywall — user taps "Upgrade" → Stripe Checkout (web) or App Store (mobile)
6. Stripe/App Store handles payment
7. Webhook arrives → server sets `tier = 'standard'`, `valid_until = end of period`
8. From here on: monthly renewal handled automatically by Stripe

**Cancellation:** Stripe sets `cancel_at_period_end: true`. The subscription runs until the paid period ends. At the end → webhook `customer.subscription.deleted` → server sets `tier = 'free'`. The user keeps read access to their data but can no longer chat (or only minimally).

**Reactivation:** User subscribes again → new webhook → tier is bumped back up. All data is still there (we don't delete anything on cancellation).

**Upgrade/downgrade mid-month:** Stripe automatically calculates proration (prorated price). Webhook arrives with new tier → server updates. No custom billing logic needed.

**What we do NOT build ourselves:** invoicing, proration, payment reminders, tax calculation, credit card processing. Stripe handles all of that.

### Tier Model

**Trial** (14 days) — Full product

- All features like Premium
- Sonnet for planning/review
- Full cross-check
- Ends automatically after 14 days

**Free** (after trial or without registration) — Minimal

- 0–3 interactions/day (or read-only access)
- No chat, view-only access (to be decided later)
- Data is retained, user can upgrade at any time

**Standard** (~$5-7/month) — Daily driver

- 100 interactions/day
- Haiku for all operations
- Basic cross-check (same-day sync)
- Daily notes + inbox management

**Premium** (~$12-15/month) — Full GTD autopilot

- 300 interactions/day
- Sonnet for planning, review, and prioritization sessions
- Full cross-check protocol with transparent reporting
- Proactive inconsistency detection
- Evening planning suggestions
- Pattern recognition ("You've been pushing this task for 3 weeks — move to Someday/Maybe?")

### Smart Model Routing (Invisible to User)

The app automatically picks the right model per interaction:

- "Check off the LinkedIn post" → Haiku (simple operation)
- "Plan my day tomorrow" → Sonnet (needs reasoning)
- "Clean up my inbox" → Sonnet (needs judgment)
- "New task: buy milk" → Haiku (trivial insert)

The user never chooses a model. It just feels like "sometimes the app thinks deeper."

## Why This Could Work

- **Universal pain**: Millions have tried and failed at GTD. The method isn't the problem — the friction is
- **Positioning is clear**: "Your task system maintains itself" — stronger than "voice-first" which is a feature, not a position
- **Voice is the wedge, not the moat**: Voice-first gets people in the door. The self-maintaining trusted system is why they stay. SayDo AI and Todoist Ramble prove voice capture has demand, but neither offers system maintenance.
- **Plain-text storage = trust and exit**: Users own their data, no lock-in, works with Obsidian. For the MVP target audience (tech-savvy knowledge workers), this is a buying signal. For mainstream later: position as "your data is always yours" — a trust signal, not a hero feature.
- **LLM cost curve**: API costs are dropping fast, making per-interaction pricing viable
- **Zero learning curve**: User opens app, talks, done. No onboarding tutorial, no feature tour. Compare this to opening Notion, Todoist, or Everdo for the first time — walls of UI, buttons, sidebars, settings. Here: an empty chat field.
- **The prompts are the product**: The actual IP is not the app or the infrastructure — it's the carefully crafted system prompts that apply GTD principles invisibly. This is Context Engineering as a product.

## Solution vs. Product

This workflow already works today — with Claude Code/Cowork + Obsidian + Git sync + Wispr Flow. But that setup requires weeks of configuration and deep technical knowledge. The product opportunity is packaging this into "install app, start talking." The gap between the solution and the product is what people pay for.

|Aspect|DIY Solution (today)|Product (the app)|
|---|---|---|
|Setup|Configure Claude Code, Obsidian vault, Git sync, cloud sync, CLAUDE.md prompts|Install app, start talking|
|Technical skill needed|High (CLI, Git, prompt engineering)|None|
|Mobile experience|Clunky (Cowork on mobile is limited)|Native, voice-optimized|
|Target user|Developers, power users|Any knowledge worker|
|Time to first value|Hours to days|Seconds|

## Honest Risks

- **🔴 Trust is the killer risk**: If the system misfiles, loses, or silently "reinterprets" a task even once, the product is emotionally burned. This is not one risk among many — it's THE risk. The entire Consistency Engine exists to mitigate this. The system must behave like a conservative bookkeeper, not a creative chatbot.
- **API costs per user**: Every interaction = API call. Heavy voice users + cross-check + Sonnet for planning = real cost. Pricing tiers must account for this honestly. A generous unlimited plan at $5-7/month is likely unprofitable for heavy users.
- **Voice accuracy**: Misheard task names or project assignments erode trust fast. Confirmation before ambiguous operations is essential.
- **Crowded adjacent market**: Positioning must be razor-sharp. "Another AI task app" is death. "The system that maintains itself" is differentiated.
- **Retention**: Productivity apps have notoriously high churn. The best defense is that the system accumulates value over time — more history, better suggestions, richer daily notes.

## Marketing Angle

**The 10-second demo**: Split screen. Left: Todoist with 15 buttons, sidebar, labels, filter dropdowns. Right: this app — an empty chat field. Someone says "What's on for today?" and gets a prioritized list with context. That's the entire pitch.

**Core positioning**: "Your task system maintains itself." Not "voice-first AI task manager" — that's a feature description. The position is: you get GTD-level organization without maintaining anything.

**Sell the transformation, not the features**: "Never fail at GTD again" is stronger than "AI-powered task management." The story is: you've tried GTD, you loved the idea, you failed at the maintenance. This app does the maintenance for you.

## Strategic Fit: The Consulting Flywheel

This is not just a side project — it's the centerpiece of a content and consulting flywheel.

### The Story Arc for Workshops & Talks

"In the early days we wrapped Angular in Cordova. Then came Ionic. Today it's Capacitor — and with LLM integration we're building products that were unthinkable two years ago."

Every enterprise Angular team at Siemens, VW, DB, and BMW has lived this migration. The app becomes a live case study that maps directly to the workshop narrative: real Angular code, real Capacitor deployment, real LLM integration, real App Store product.

### What the App Proves in a Workshop Context

- **Context Engineering in practice**: The system prompts, the GTD logic, the consistency engine — this is Context Engineering as a shipped product, not a slide deck
- **Angular + AI integration**: How to connect an Angular frontend to LLM APIs with streaming, voice input, and tool-use patterns
- **Capacitor for enterprise**: "You already have Angular teams. You don't need to learn Swift or React Native to ship native apps."
- **Agentic workflow applied**: The app itself is an agent that reads files, makes decisions, writes files, and reports diffs — exactly the pattern enterprise teams need to learn

### YouTube Series (Pilots of AI)

"I'm building an AI app with Angular + Capacitor — from idea to App Store."

- Episode 1: The idea and validation (this document)
- Episode 2: Prompts as product — designing the GTD system prompts
- Episode 3: Angular + Capacitor setup with Claude API streaming
- Episode 4: Generative UI with Hashbrown — rendering Tool Cards in the chat (ties directly to the Manfred Steyer interview)
- Episode 5: Voice input and native APIs via Capacitor
- Episode 6: Supabase backend — auth, file storage, version history
- Episode 7: Paywall, subscriptions, App Store submission
- Episode 8: First users, feedback, iteration

The Manfred Steyer connection runs through multiple episodes: his Native Federation work at Siemens Energy (interview topic), his Hashbrown library (core dependency), and the broader "Angular in the AI era" narrative. One relationship, three content touchpoints.

Each episode is simultaneously: content, consulting demo, and product progress.

### Revenue Streams (All From One Project)

1. **App subscriptions** — direct SaaS revenue
2. **Workshop bookings** — "the guy who built and shipped an AI app with Angular"
3. **YouTube growth** — build-in-public series drives subscribers and consulting leads
4. **LinkedIn content** — each build milestone = 2-3 posts
5. **dev.to blog** — build log with code snippets, architecture decisions, lessons learned
6. **Conference talks** — "From Cordova to Capacitor to AI: Building the Next Generation of Angular Apps"

## Open Source Strategy

### Why Open Source

The moat is not the code — it's "install, talk, done." Even with the full source code, 99% of the target audience won't self-host. They'll pay $10/month so it just works. This is the proven model of Supabase, Cal.com, Plausible Analytics, and GitLab: open source code, paid hosted service.

**What open source gives us:**

- **Community as product team**: Issues tell you exactly what users want. PRs give you free development. Bug reports come with reproduction steps.
- **Consulting gold**: "Here's the repo, look at how I built it" is the strongest possible workshop demo. No NDA, no "I can't show you the code."
- **Trust signal**: Users can verify that the system does what it claims. Especially important for a product where trust is the #1 risk.
- **Content flywheel**: Every commit, every PR, every architecture decision is a potential LinkedIn post, dev.to article, or YouTube episode. Build-in-public works 10x better when people can actually see the code.
- **Recruitment for quality**: Good developers find the repo, use the product, contribute, and become advocates. This is organic distribution that paid marketing can't buy.
- **GitHub stars as visibility**: copilot-proxy got ~130 stars, mcp-aider ~400. A consumer-facing GTD app has a much larger audience — the star potential is significantly higher.

### License: AGPL-3.0

**Why AGPL-3.0** (same as Cal.com, Plausible):

- Anyone can use, modify, and self-host the code
- If someone offers a modified version as a hosted service, they must open-source their modifications
- This prevents: competitor takes your code, adds a prettier UI, sells it as a competing service without contributing back
- Self-hosting for personal use: perfectly fine, encouraged even
- Commercial self-hosting to avoid paying: legally required to publish modifications

**Why not MIT/Apache**: Too permissive. A company could fork the code, close-source it, and compete directly without giving anything back. AGPL prevents this while still being genuinely open source.

### What's Visible, What's Protected

|Component|Visibility|Rationale|
|---|---|---|
|Frontend code (Angular + Capacitor)|Public|UI is not the moat|
|Backend services (Supabase integration)|Public|Standard CRUD, not a secret|
|System prompts (GTD logic)|Public|Prompts are easy to reverse-engineer anyway. The value is in the iteration, not the text.|
|CI/CD, deployment config|Public|Helps self-hosters|
|User data|Private (obviously)|Supabase Row-Level Security|
|API keys, secrets|Private (obviously)|Environment variables, never in repo|

### The Honest Risk

Someone could fork the repo and launch a competing hosted service. In practice, this rarely happens with AGPL projects because:

- Maintaining a production service is work (support, updates, infrastructure, App Store submissions)
- The original creator has brand recognition, community, and momentum
- AGPL requires publishing all modifications — competitors can't differentiate in secret
- If someone does fork and improves it: you can merge their improvements back. You win either way.

### Repository Structure

```
github.com/[username]/[app-name]
├── apps/
│   ├── mobile/          # Angular + Capacitor (iOS/Android/Web)
│   ├── server/          # Express/Fastify backend service (LLM orchestration)
│   └── cli/             # Phase 1 CLI tool
├── packages/
│   ├── core/            # Shared Core: Request-Builder, Tool-Handler, FileRepository,
│   │                    #   system prompt, model router (imported by CLI + server)
│   ├── prompts/         # System prompts, tool definitions
│   └── supabase/        # DB schema, migrations, RLS policies
├── docs/                # Architecture docs, self-hosting guide
├── LICENSE              # AGPL-3.0
└── README.md
```

Monorepo structure (Nx or Turborepo) so that CLI, server, and mobile app share the core logic. Contributors can work on any part independently.

## Naming Strategy

### Trademark Warning

"GTD" and "Getting Things Done" are registered trademarks of the David Allen Company. Multiple apps in the store carry disclaimers like "not affiliated with or endorsed by the David Allen Company." Using "GTD" in the app name itself risks a trademark dispute. However, GTD can be used freely in the App Store description, keywords, and marketing materials.

**Recommendation**: Keep "GTD" out of the product name, use it in the App Store subtitle/description: e.g., "AppName — Task Management powered by Getting Things Done."

This is actually a strategic advantage: a name without "GTD" opens the audience beyond GTD purists to anyone who struggles with task management.

### What the Name Should Communicate

The core feeling: **"You talk, someone else handles it."** Relief, not productivity pressure. The app is a quiet assistant, not another system to learn.

### Eliminated Candidates

|Name|Why It's Dead|
|---|---|
|Offload|"Offload" is a built-in iOS feature name (Offload Unused Apps). App Store searches for "Offload" are buried under Apple support articles. Terrible discoverability.|
|MindSweep|Already taken — "Mindsweep: Clear Your Mind" launched in the App Store ~3 weeks ago, GTD-inspired. Plus search results polluted with Minesweeper games.|
|GTD Buddy / GTD Companion|Trademark risk with "GTD" in name. Also generic and forgettable.|
|FlowState|Overused in productivity space. Multiple apps and products already use this name.|
|JustTalk Tasks|Too long, too literal, not memorable.|
|SayDo|Already taken — "SayDo AI" exists in the App Store, voice-first task/calendar app. Direct name collision.|
|Clerq|Already taken — "Clerq" exists as an HR/people management app in the stores. Would cause brand confusion.|
|Sortd|Already taken — Gmail plugin called "Sortd". Spelling also confusing.|

### Viable Candidates

**Handled** — "It's handled."

- ✅ Emotionally perfect — exactly the feeling after using the app
- ✅ One word, strong, confident
- ✅ Great for marketing: "Just say it. It's Handled."
- ✅ Matches new positioning: "your system maintains itself" → "it's handled"
- ⚠️ Likely competitive domain situation
- ⚠️ Common English word = harder to own in search
- App Store subtitle: "Handled — Your Task System Maintains Itself"

**Keppt** — Your tasks are kept. Nothing falls through.

- ✅ Short, unique spelling, memorable
- ✅ Implies safety, reliability, trust — exactly the core value
- ✅ Domain-friendly (keppt.app, getkeppt.com)
- ✅ Works internationally
- ⚠️ Vowel-drop trend may feel dated eventually
- App Store subtitle: "Keppt — Talk, and Your Tasks Are Safe"

**BrainDrop** — Drop your thoughts, we'll handle the rest.

- ✅ Vivid, visual, memorable
- ✅ Captures the GTD "brain dump" concept without GTD terminology
- ✅ Good verb potential: "Just BrainDrop it"
- ⚠️ Could sound like a children's app
- ⚠️ Two words might feel less premium
- App Store subtitle: "BrainDrop — Your Self-Maintaining Task System"

**Untangl** — Untangle your tasks. Effortlessly.

- ✅ Strong visual metaphor — messy → clean
- ✅ Communicates transformation, not features
- ✅ Unique enough for search
- ⚠️ Might imply the user's life is tangled (slightly negative)
- App Store subtitle: "Untangl — Tasks That Organize Themselves"

### Current Top 2 (In Order)

1. **Handled** — best emotional resonance, perfect match for "your system maintains itself" positioning. Marketing writes itself: "Just say it. It's Handled."
2. **Keppt** — strongest trust signal in the name itself. "Nothing gets lost" as a brand name.

Both need trademark/App Store availability checks before committing.

### App Store Keyword Strategy (Regardless of Name)

Primary keywords: getting things done, GTD, voice task manager, AI productivity, task assistant, brain dump, daily planner Subtitle should always reference GTD methodology for search discoverability without putting it in the trademarked product name.

---

_Idea captured: April 2026. Market validation: Passed (April 15, 2026). Status: Ready for side-project build._
