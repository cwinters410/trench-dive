// Checks the answer matcher.
//  - every alias matches its own answer
//  - no two answers in a prompt share a key
//  - every prompt has exactly one One in a Krillion answer
//  - sample inputs land in the expected tier or hint
// Run: node test/check.js   (exits with code 1 if anything fails)

const path = require("path");
require(path.join(__dirname, "..", "src", "prompts.js"));
require(path.join(__dirname, "..", "src", "matcher.js"));

const TD = globalThis.TD;
const IDS = ["p", "tc", "s", "r", "d", "k"];
const tierOf = (P, r) => (r.t === "ok" ? IDS[P._ans[r.i].tier] : r.t);
let problems = 0;
let total = 0;

for (const P of TD.PROMPTS) {
  total += P._ans.length;
  if (P._clash.length) { problems++; console.log("CLASH  |", P.q, "|", P._clash.join("; ")); }
  const krill = P._ans.filter(a => a.tier === 5).length;
  if (krill !== 1) { problems++; console.log("KRILLION COUNT |", P.q, "|", krill); }
  for (const id of IDS) {
    if (!P[id]) continue;
    for (const entry of P[id].split("|")) {
      const want = entry.split("=")[0].trim();
      for (const alias of entry.split("=")) {
        const r = TD.judge(P, alias);
        if (r.t !== "ok" || P._ans[r.i].name !== want) {
          problems++;
          console.log("SELF   |", P.q, "|", alias, "->", r.t === "ok" ? P._ans[r.i].name : JSON.stringify(r));
        }
      }
    }
  }
}

const cases = [
  ["Name a country in Africa", "Comoros", "k"], ["Name a country in Africa", "cote d'ivoire", "s"],
  ["Name a country in Africa", "Swaziland", "d"], ["Name a country in Africa", "papua new guinea", "near"],
  ["Name a country in Africa", "congo", "s"], ["Name a country in Africa", "Zimbabwee", "s"],
  ["Name a country in Africa", "africa", "near"], ["Name a country in Africa", "São Tomé and Príncipe", "d"],
  ["Name a US state", "nebraska", "k"], ["Name a US state", "carolina", "amb"], ["Name a US state", "DC", "near"],
  ["Name a US state", "jersey", "s"], ["Name a US state", "NJ", "near"], ["Name a US state", "Pensylvania", "s"],
  ["Name a capital city in Europe", "Kiev", "s"], ["Name a capital city in Europe", "Chișinău", "d"],
  ["Name a capital city in Europe", "the hague", "near"], ["Name a capital city in Europe", "Reykjavík", "tc"],
  ["Name an ocean or sea", "Laptev Sea", "k"], ["Name an ocean or sea", "sea of japan", "r"],
  ["Name an ocean or sea", "Gulf of Mexico", "near"], ["Name an ocean or sea", "pacific ocean", "p"],
  ["Name a chemical element", "Thulium", "k"], ["Name a chemical element", "aluminium", "s"],
  ["Name a chemical element", "Fe", "near"], ["Name a chemical element", "flourine", "s"],
  ["Name a bone in the human body", "funny bone", "near"], ["Name a bone in the human body", "thigh bone", "p"],
  ["Name a bone in the human body", "left femur", "p"],
  ["Name a Pixar movie", "toy story 6", "sug"], ["Name a Pixar movie", "shrek", "near"],
  ["Name a Pixar movie", "monsters", "amb"], ["Name a Pixar movie", "Monsters, Inc.", "p"],
  ["Name a US president", "Benjamin Harrison", "k"], ["Name a US president", "harrison", "d"],
  ["Name a US president", "President Obama", "p"], ["Name a US president", "benjamin", "no"],
  ["Name a US president", "George H.W. Bush", "s"],
  ["Name a Shakespeare play", "midsummer", "s"], ["Name a Shakespeare play", "henry", "amb"],
  ["Name a currency", "swiss franc", "s"], ["Name a currency", "bitcoin", "near"],
  ["Name a letter of the Greek alphabet", "ypsilon", "k"],
  ["Name a Taylor Swift studio album", "Red (Taylor's Version)", "p"], ["Name a Taylor Swift studio album", "the eras tour", "near"],
  ["Name a dog breed", "chocolate labrador", "p"], ["Name a dog breed", "terrier", "amb"],
  ["Name a Monopoly property", "States Avenue", "k"],
  ["Name an NFL team", "new york", "amb"], ["Name an NFL team", "Titans", "k"],
  ["Name a card game", "go", "near"], ["Name a card game", "go fish", "p"],
  ["Name a muscle in the human body", "left bicep", "p"],
  ["Name a type of shark", "great white shark", "p"], ["Name a type of shark", "baby shark", "near"],
  ["Name a type of pasta", "bowtie pasta", "s"], ["Name a type of pasta", "pasta", "near"],
  ["Name a type of tree", "christmas tree", "near"], ["Name a type of tree", "sugar maple", "r"],
  ["Name a type of cloud", "cumulonimbus clouds", "s"], ["Name a fruit", "grape fruit", "s"],
  ["Name a video game console", "ps5", "p"], ["Name an instrument in a symphony orchestra", "bass guitar", "near"],
  ["Name a marine mammal", "killer whale", "p"], ["Name an Olympic sport", "ping pong", "r"],
  ["Name a fast-food chain", "Chick-fil-A", "p"], ["Name a car brand", "toyota camry", "p"],
  ["Name a signer of the Declaration of Independence", "thomas paine", "near"],
  ["Name one of the Seven Wonders of the Ancient World", "the hanging gardens of babylon", "p"],
  ["Name an animal of the Chinese zodiac", "cat", "near"], ["Name an SI base unit", "gram", "near"],
  ["Name a planet or dwarf planet", "sedna", "near"], ["Name a constellation", "big dipper", "near"],
  ["Name a Greek god or goddess", "jupiter", "near"], ["Name a US state capital", "st. paul", "r"],
  ["Name a country that was part of the Soviet Union", "poland", "near"],
  ["Name a programming language", "C++", "p"], ["Name a programming language", "c#", "s"],
  ["Name a programming language", "C", "p"], ["Name a programming language", "html", "near"],
  ["Name a social media app", "Google+", "r"], ["Name a social media app", "google", "near"],
  ["Name a social media app", "Twitter", "p"], ["Name a Star Wars movie", "Star Wars: A New Hope", "p"],
  ["Name a Star Wars movie", "mandalorian", "near"], ["Name a Minecraft mob", "golem", "amb"],
  ["Name an original 151 Pok\u00e9mon", "Alolan Vulpix", "s"], ["Name an original 151 Pok\u00e9mon", "lucario", "near"],
  ["Name a man who has been ranked world No. 1 in tennis", "marcelo ríos", "k"],
  ["Name a woman who has been ranked world No. 1 in tennis", "williams", "amb"],
  ["Name a moon in our solar system", "titan moon", "p"], ["Name a moon in our solar system", "venus", "near"],
  ["Name a type of rock", "granite rock", "p"], ["Name a type of rock", "Dwayne Johnson", "near"],
  ["Name a country that uses the euro", "Bulgaria", "d"], ["Name a Roman emperor", "Julius Caesar", "near"],
  ["Name a part of the brain", "frontal", "p"], ["Name a psychologist", "Mary Calkins", "k"],
  // misspellings: close ones count, further ones get a "Did you mean" guess
  ["Name a type of cheese", "mozerella", "p"], ["Name a country in Asia", "fillipines", "s"],
  ["Name a dinosaur", "tyranosaurus rex", "p"], ["Name a dinosaur", "brachio", "sug"],
  ["Name a dinosaur", "pterodactly", "near"], ["Name a currency", "swiss frank", "s"],
  ["Name an original 151 Pok\u00e9mon", "alolan vulpixx", "s"], ["Name a country in Europe", "austrlia", "near"],
  ["Name a country in Africa", "nigera", "sug"], ["Name a Pixar movie", "rataytooey", "sug"],
  ["Name a fruit", "qwerty", "no"], ["Name a country in Africa", "zzzzzz", "no"],
];

let passed = 0;
for (const [q, input, want] of cases) {
  const P = TD.PROMPTS.find(x => x.q === q);
  if (!P) { problems++; console.log("MISSING PROMPT |", q); continue; }
  const r = TD.judge(P, input);
  const got = tierOf(P, r);
  if (got === want) passed++;
  else { problems++; console.log("CASE   |", q, "|", input, "| want", want, "got", got, r.msg || ""); }
}

console.log(`${TD.PROMPTS.length} prompts, ${total} answers, ${passed}/${cases.length} sample inputs OK, ${problems} problem(s)`);
process.exit(problems ? 1 : 0);
