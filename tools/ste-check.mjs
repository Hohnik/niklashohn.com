/* tools/ste-check.mjs — a check for ASD-STE100 Simplified Technical
   English.

   The documentation in this repository must follow ASD-STE100. This
   tool reads the documentation and the comments in the code. It then
   reports the lines that break a rule.

   Run it like this:

     node tools/ste-check.mjs

   The tool tests four rules:

   1. A sentence has 25 words or fewer.
   2. A word must be in the approved list. The tool holds the words
      that this repository used before, with the approved word for
      each one.
   3. Do not use a contraction. Write the full form.
   4. Do not use the passive voice.

   The tool cannot test the full ASD-STE100 dictionary, which is not
   free. It tests the errors that occur in this repository.
*/
import { readFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/* The word on the left is not approved. Use the word on the right. */
const NOT_APPROVED = {
  utilize: 'use', utilise: 'use', perform: 'do', obtain: 'get',
  ensure: 'make sure', via: 'with', approximately: 'about',
  sufficient: 'enough', initiate: 'start', terminate: 'stop',
  modify: 'change', verify: 'check', indicate: 'show',
  determine: 'find', additional: 'more', however: 'but',
  assist: 'help', attempt: 'try', provide: 'give', render: 'draw',
  renders: 'draws', rendered: 'drew', compute: 'calculate',
  computes: 'calculates', generate: 'make', generates: 'makes',
  implement: 'make', invoke: 'call', invokes: 'calls',
  iterate: 'repeat', leverage: 'use', facilitate: 'help',
  commence: 'start', cease: 'stop', retain: 'keep', possess: 'have',
  numerous: 'many', various: 'different', whilst: 'while',
  amongst: 'among', regarding: 'about', concerning: 'about',
  accomplish: 'do', eliminate: 'remove', exhibit: 'show',
  identify: 'find', maintain: 'keep', notify: 'tell',
  optimize: 'improve', optimise: 'improve', purchase: 'buy',
  reside: 'be', subsequent: 'later', prior: 'earlier',
  utilizing: 'use', handle: 'control', handles: 'controls',
  desire: 'want', endeavour: 'try', commence: 'start'
};

/* This repository approves these words that end in -ing. Each one is
   a noun or an adjective, and not a verb. */
const ING_OK = new Set([
  'string', 'strings', 'during', 'ring', 'rings', 'thing', 'things',
  'setting', 'settings', 'bring', 'nothing', 'something', 'anything',
  'everything', 'according', 'sampling', 'wing', 'wings',
  'bearing', 'bearings', 'heading', 'headings'
]);

const CONTRACTION = /\b\w+'(s|t|re|ve|ll|d|m)\b/gi;
const PASSIVE = /\b(is|are|was|were|be|been|being)\s+(\w+ed|drawn|made|given|written|read|set|put|kept|held|sent|shown|taken|seen|known|built|found)\b/i;

const MAX_WORDS = 25;

/* Read every comment out of a file. The tool checks comments, not
   code. */
function comments(text, ext) {
  const out = [];
  const push = (line, body) => out.push({ line, body });
  const lines = text.split('\n');

  if (ext === '.md') {
    let inFence = false;
    lines.forEach((l, i) => {
      if (l.trim().startsWith('```')) { inFence = !inFence; return; }
      if (inFence) return;
      if (l.trim().startsWith('|')) return;      // a table, not prose
      if (/^\s*#+\s/.test(l)) return;            // a title, not a sentence
      push(i + 1, l);
    });
    return out;
  }

  if (ext === '.html') {
    const re = /<!--([\s\S]*?)-->/g;
    let m;
    while ((m = re.exec(text))) {
      push(text.slice(0, m.index).split('\n').length, m[1]);
    }
    return out;
  }

  /* .js .mjs .css — walk the file one character at a time.

     A simple search for the comment marks is not enough. The text
     `'**://api.github.com/**'` holds both a line mark and a block
     mark inside a string. The scanner below knows when it is in a
     string, so it does not read those marks as a comment. */
  const isCss = ext === '.css';
  let line = 1;
  let i = 0;
  while (i < text.length) {
    const c = text[i], next = text[i + 1];
    if (c === '\n') { line++; i++; continue; }

    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '\n') line++;
        if (text[i] === quote) { i++; break; }
        i++;
      }
      continue;
    }

    if (c === '/' && next === '*') {
      const start = line;
      const from = i + 2;
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] === '\n') line++;
        i++;
      }
      push(start, text.slice(from, i).replace(/^\s*\*/gm, ''));
      i += 2;
      continue;
    }

    if (!isCss && c === '/' && next === '/') {
      const start = line;
      const from = i + 2;
      while (i < text.length && text[i] !== '\n') i++;
      push(start, text.slice(from, i));
      continue;
    }

    i++;
  }
  return out;
}

function walk(dir, hits = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name.startsWith('.verify')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, hits);
    else if (['.js', '.mjs', '.css', '.html', '.md'].includes(extname(full))) hits.push(full);
  }
  return hits;
}

const problems = [];
function report(file, line, rule, detail) {
  problems.push({ file, line, rule, detail });
}

for (const file of walk(process.cwd())) {
  const text = await readFile(file, 'utf8');
  for (const c of comments(text, extname(file))) {
    /* Take out the parts that are not prose: code, addresses, GLSL
       names and the identifiers that a comment must name exactly. */
    let prose = c.body
      .replace(/`[^`]*`/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\b[\w.-]+\.(mjs|js|css|html|md|png|json|yml|ttf)\b/gi, ' ')  // file names
      .replace(/\b[\w.]*[a-z][A-Z]\w*/g, ' ')      // camelCase
      .replace(/\b[a-z]+_[a-z_]+\b/gi, ' ')        // snake_case
      .replace(/\b[a-z]+(-[a-z]+)+\b/gi, ' ')      // kebab-case, such as a CSS name
      .replace(/={3,}/g, ' ')                      // comment banners
      .replace(/[-*|>#]/g, ' ');

    for (const raw of prose.match(/\b[A-Za-z]+\b/g) || []) {
      const word = raw.toLowerCase();
      if (NOT_APPROVED[word]) {
        report(file, c.line, 'word', `"${word}" is not approved. Use "${NOT_APPROVED[word]}".`);
      }
      /* A word with a capital letter is a technical name, and
         ASD-STE100 permits a technical name. */
      const isName = raw[0] === raw[0].toUpperCase();
      if (word.endsWith('ing') && word.length > 4 && !ING_OK.has(word) && !isName) {
        report(file, c.line, 'ing', `"${word}" is an -ing form. Use a simple tense.`);
      }
    }
    for (const hit of prose.match(CONTRACTION) || []) {
      report(file, c.line, 'contraction', `"${hit}" is a contraction. Write the full form.`);
    }
    for (const sentence of prose.split(/(?<=[.:;])\s+/)) {
      const words = sentence.trim().split(/\s+/).filter(Boolean);
      if (words.length > MAX_WORDS) {
        report(file, c.line, 'length', `${words.length} words. The limit is ${MAX_WORDS}.`);
      }
      if (PASSIVE.test(sentence)) {
        report(file, c.line, 'passive', `"${sentence.trim().slice(0, 60)}" looks passive.`);
      }
    }
  }
}

const byRule = {};
problems.forEach(p => { byRule[p.rule] = (byRule[p.rule] || 0) + 1; });

if (!problems.length) {
  console.log('ASD-STE100: all documentation and comments pass.');
  process.exit(0);
}

console.log(`ASD-STE100: ${problems.length} problems.\n`);
for (const p of problems) {
  console.log(`  ${p.file}:${p.line}  [${p.rule}] ${p.detail}`);
}
console.log('\nBy rule: ' + Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(', '));
process.exit(1);
