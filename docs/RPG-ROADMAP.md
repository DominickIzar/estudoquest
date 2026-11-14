# EstudoQuest → learning-centered RPG: architecture review and phased plan

Guiding rule for every phase: **progress comes from evidence of learning** (correct recall over time, quiz performance, applied problem solving), never from clicks or raw time. The game never punishes breaks.

## 1. Current architecture (v1.5)

| File | Role | Size |
|---|---|---|
| `index.html` | Shell: top bar, `<main id="view">`, tab bar, `<dialog>` | ~50 lines |
| `app.js` | State, persistence, gamification core (XP, levels, achievements, streak + shields, quests, stars), Pomodoro, router, views (home, notes, videos, tasks, focus, review, search, profile) | ~1,900 lines |
| `editor.js` | Notion-style editor, IndexedDB images, HTML ⇄ text conversion, sanitizer | ~650 lines |
| `ai.js` | Gemini client (text, YouTube video, JSON schema), assistant dialog, interactive quiz | ~370 lines |
| `game.js` | Mascot, stardust + wishes, weekly boss, rival ghost, focus sounds, exams, `.ics` reminder | ~420 lines |
| `sw.js` | Offline cache (stale-while-revalidate) | |

**Patterns worth keeping**
- One global `state` object, saved to `localStorage` (`save` / `saveSoon` / `flushSave`). `normalize()` merges new default fields into old data. **Every new feature adds fields there, so old backups keep loading.**
- Hash router (`route()` → `viewX(el, …)`), with each view rendering into `#view`. New screens are new `case`s.
- Derived data is computed rather than stored (streak, level, boss damage, quest progress). Only "peaks" and one-off rewards are persisted. Skill trees follow the same rule.
- Flashcards are derived from note text (`pergunta :: resposta` → `state.cards` with Leitner box and due date). Box ≥ 3 already proves recall on two different days, because cards can only be answered when due.
- `askAI` / `askAIJSON` / `startQuiz` / `runQuiz` already cover text, YouTube video and structured output.

**Risks found**
| Risk | Measured / observed | Mitigation |
|---|---|---|
| `syncCards()` rescans every note on each call | 11 ms for 4,000 cards; called several times per navigation | Memoize on a cheap notes signature (done in Phase 1) |
| `localStorage` quota (~5 MB) | 500 large notes ≈ 1.8 MB; text is stored twice (`html` + `body`) | Phase 7: move notes to IndexedDB, keep `localStorage` for small state |
| `route()` re-renders the whole view | 79 ms for a 500-note home render | Fine for now; views compute indexes once per render |
| Quiz history had no link to what it tested | `state.quizzes` = `{ at, score, total, title }` | New records carry `videoId` / `noteId` / `nodeId`; old ones are matched by title |
| Gamification overload on the home page | Home already shows pet, start, boss, quests… | New systems get their own screens; home gets **one** "next step" line |

## 2. Phased plan

Each phase ships on its own, keeps all features working, and adds an end-to-end test in the same style as the existing ones (Playwright, mobile viewport, mocked Gemini).

### Phase 1: Knowledge Skill Trees ✅ (this delivery)
- **Data:** `state.skillNodes[]`: `{ id, subject, title, icon, noteIds[], videoIds[], requires[], order, peak, peakAt }`. A subject is the existing folder / course / task-tag name, so nothing needs re-tagging.
- **Evidence (computed live):** cards come from linked notes and the lesson notes of linked videos. Quizzes are matched by `nodeId`, `videoId`, `noteId` or the legacy title. Lesson progress comes from the video.
- **Stages**
  - 🔍 **Discovered:** watched ≥ 10% of a linked lesson, or wrote ≥ 30 characters in a linked note.
  - 🛠️ **Practiced:** ≥ 3 correct flashcard recalls, or a quiz ≥ 60%.
  - 👑 **Mastered:** ≥ 3 cards, ≥ 80% of them recalled on two different days (box ≥ 3), **and** a quiz ≥ 80% or ≥ 80% of the cards at box ≥ 4.
- **Non-punitive:** the highest stage reached (`peak`) is kept forever. If cards later come due or are forgotten, the node shows a gentle "🔁 revisar" hint instead of losing its stage.
- **Anti-farming:** node review only shows cards that are actually due, so the Leitner spacing cannot be skipped.
- **Screens:** `#/skills` (subjects), `#/skills/<subject>` (visual tree), `#/skills/<subject>/<node>` (stage track, checklist with real numbers, next actions), `#/review/<node>` (node-filtered review).
- **Building trees:** auto-generate from lessons and notes (instant, no AI), suggest a concept map with AI (optional), or edit by hand (title, icon, links, prerequisites, with cycle protection).
- **Connections:** chips on lesson and note pages, a "next step" line on home, a node challenge quiz, AI flashcard creation for a node, rewards (XP + ✦), achievements and a daily quest.

### Phase 2: Character attributes ✅ (v1.7: character sheet at the top of Profile, with archetype class, species unlocked at attribute level 3, and equipping accessory/theme/title)
- **Knowledge:** nodes discovered and practiced, cards created.
- **Mastery:** nodes mastered, weighted by depth in the tree.
- **Discipline:** focus minutes, shields **not** consumed, quests completed. Uses only positive signals: it can rise but never fall.
- Stats are derived from existing data, so existing users start with real values. Shown in Profile with a radar or bar chart; level stays XP-based.
- Reuse `levelInfo`, `addXP` and `ACHIEVEMENTS`.
- **Test:** stats computed from a seeded state; old backup loads.

### Phase 3: Interactive boss battles
- Optional "⚔️ Enfrentar" on the weekly boss: quiz questions drawn from the subject's practiced nodes (AI) or from due flashcards (offline fallback).
- A correct answer deals damage (added to focus damage). A wrong answer shows an explanation and offers a "practice this" card. No HP loss for the player.
- Reuse `runQuiz` (add a `onAnswer` hook) and `bossInfo` (`dmg = focus + battle`).
- **Test:** damage accounting, defeat reward once per week.

### Phase 4: Campaign mode
- A course becomes chapters (tree layers), checkpoints (a node mastered unlocks the next chapter banner), side quests (tasks tagged with the subject) and a final challenge (a mixed quiz over every node in the course; mastery-gated, but always retryable).
- A visual path screen with a map-like vertical road reuses the tree layout.
- **Test:** chapter unlocking derived from node peaks.

### Phase 5: Discovery system
- Story fragments ("Crônicas de Lumi") and mysteries unlocked by learning milestones (first mastered node, first full chapter, 7 review days…).
- New cosmetic items enter the existing `GAME.items` with an `unlock` rule instead of a gacha-only source; stardust and wishes stay as they are.
- **Test:** unlock rules, inventory compatibility.

### Phase 6: Experiment Lab
- Scenario problems generated per node ("Um carro sai de… quanto tempo…?"). The user answers in free text. The AI grades with a rubric (JSON: correct / partial / incorrect, explanation, alternative solutions, next hint). Feedback is constructive, with no score penalty.
- Lab results count as "applied practice" evidence for Mastery in Phase 2.
- **Test:** mocked grading responses, offline fallback message.

### Phase 7: Storage hardening
- Move note HTML and body into IndexedDB, with automatic migration and a pre-migration backup download.
- Optional weekly backup reminder in-app.

## 3. Testing approach (every phase)
1. **Migration:** load a v1.5-shaped backup, no errors, new fields defaulted.
2. **Feature flow:** Playwright at 390×844 with mocked Gemini via `context.route`.
3. **Regression:** re-run the previous suites (habit, editor, AI, game, video AI).
4. **Performance:** synthetic 500-note state, time `route()` before and after.
5. **Accessibility:** buttons with labels, status conveyed by icon + text (not color only), `prefers-reduced-motion` honored.
