# Trench Dive

A rare-answer trivia game inspired by Krillion. Every prompt has a ranked list of accepted answers. Obvious answers barely get you wet; the rarer your answer, the deeper you dive.

## Play

Open `index.html` in a browser. No install or build step.

- **Dive:** 7 prompts, 25 seconds each. A wrong guess costs 2 seconds, then you can try again.
- **Endless:** 45 seconds of air that only drains while you're answering. Right answers refill it, rarer ones refill more.

Spelling doesn't have to be perfect. Plurals, accents, typos and sound-alike spellings ("mozerella", "fillipines") count automatically. If you're further off, the game asks "Did you mean...?" and you tap the right answer or press Enter for the first one.

## Scoring

| Tier | Points | Depth |
| --- | --- | --- |
| Plankton | 10 | 40 m |
| Too Clever | 15 | 60 m |
| Schooler | 30 | 120 m |
| Rare | 60 | 240 m |
| Deep Cut | 85 | 340 m |
| One in a Krillion | 100 | 400 m |

Each list has exactly one One in a Krillion answer. "Too Clever" is the "obscure" answer everybody reaches for. A perfect dive is 700 points, or 2,800 m.

## Project layout

```
index.html         page markup
src/styles.css     styles
src/prompts.js     the 78 prompts and their answer lists (format notes at the top)
src/matcher.js     answer matching: normalizing, aliases, typo tolerance, hints
src/game.js        game flow, timer, air, depth gauge, results
test/check.js      checks every alias and a set of sample answers
```

## Adding prompts

Add an object to `PROMPTS` in `src/prompts.js`, then run the checks:

```
node test/check.js
```

(or `npm test`). It fails if two answers clash, an alias doesn't match its own answer, or a prompt doesn't have exactly one One in a Krillion answer.

Rarity tiers are hand estimates, not real player data.
