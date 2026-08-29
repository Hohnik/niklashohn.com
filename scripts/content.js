/* ============================================================
   content.js — the places on the map, and what is written there.

   Landmark positions are an equilateral triangle, 300 cells to a
   side, so no two are ever much further apart than any other two
   and the map never has a "far corner".
   ============================================================ */
window.NH = window.NH || {};

NH.MARK_RADIUS = 130;   // radius of a landmark mountain, in cells
NH.ARRIVE = 44;         // fly this close and the sheet opens
NH.DEPART = 88;         // leave this far and it closes again

/* `initial` is the single letter the radar draws next to each blip,
   so the three have to stay distinguishable at one character. */
NH.MARKS = [
  { id: 'home',     name: 'Niklas Hohn', tag: 'Start', initial: 'N', world: { x: 0,    y: -173 } },
  { id: 'about',    name: 'About',       tag: 'Who',   initial: 'A', world: { x: -150, y: 87 } },
  { id: 'projects', name: 'Projects',    tag: 'What',  initial: 'P', world: { x: 150,  y: 87 } }
];

NH.GITHUB_USER = 'Hohnik';

/* Bundled copy of the repository list. It is the fallback when
   the GitHub API is unreachable or rate-limited (60 anonymous
   requests an hour per IP), and it is what the "Static" source
   variant shows. Descriptions are GitHub's own, verbatim; repos
   without one simply have none. */
NH.PROJECTS_STATIC = [
  { name: 'noc-examples-pygame', stars: 16, lang: 'Python', updated: '2026-08-14',
    desc: '"Nature of Code" examples pygame port',
    topics: ['art', 'creative', 'generative', 'nature', 'pygame'] },
  { name: 'LaRobot', stars: 4, lang: 'Python', updated: '2026-08-28', desc: null },
  { name: 'Room-Availability-HAW-Landshut', stars: 2, lang: 'JavaScript', updated: '2026-08-27', desc: null },
  { name: 'MailChat', stars: 1, lang: 'Python', updated: '2026-08-26',
    desc: 'User your emails like you would use discord, grouped by people and subject with a easy to understand chat-like conversation history. Like email should have always been.' },
  { name: 'WiFi-Sensing', stars: 1, lang: 'Python', updated: '2026-08-24', desc: null },
  { name: 'DiabetesPrediction', stars: 1, lang: 'Jupyter Notebook', updated: '2025-05-26', desc: null },
  { name: 'Grader', stars: 1, lang: 'Python', updated: '2025-03-21', desc: null },
  { name: 'Shorty', stars: 1, lang: 'HTML', updated: '2025-01-22',
    desc: 'Get a fast overview of shortcuts for (almost) everything.',
    topics: ['nvim', 'shortcuts', 'vim'] },
  { name: 'kage_website', stars: 0, lang: null, updated: '2026-08-28',
    desc: 'Recreation of the Kage website with Moosburg as inspiration' },
  { name: 'niklashohn.com', stars: 0, lang: 'JavaScript', updated: '2026-08-25', desc: null },
  { name: 'hawplan', stars: 0, lang: 'JavaScript', updated: '2026-08-24', desc: null },
  { name: 'Bowling-Pinsheet-Classifier', stars: 0, lang: 'Python', updated: '2026-08-24',
    desc: 'A tool to scan and analyze pin sheets of bowling matches' },
  { name: 'roguelike', stars: 0, lang: 'Python', updated: '2026-08-23', desc: null },
  { name: 'instant-neural-graphics-primitives', stars: 0, lang: 'Python', updated: '2026-07-27', desc: null },
  { name: 'university-timetable', stars: 0, lang: 'Python', updated: '2026-07-23', desc: null },
  { name: 'kennzeichen-word-finder', stars: 0, lang: 'Python', updated: '2026-07-12', desc: null },
  { name: 'github_collaborator_extension', stars: 0, lang: 'JavaScript', updated: '2026-07-06', desc: null },
  { name: 'semantic_segmentation_model', stars: 0, lang: 'Python', updated: '2026-03-30', desc: null },
  { name: 'bdh_spam_filter', stars: 0, lang: 'Python', updated: '2026-02-26', desc: null },
  { name: 'baby_dragon_hatchling', stars: 0, lang: 'Python', updated: '2026-02-17', desc: null },
  { name: 'osrs_ge_flipping_helper', stars: 0, lang: 'Svelte', updated: '2026-01-31', desc: null },
  { name: 'rl_orderflow_trading', stars: 0, lang: 'Python', updated: '2026-01-31', desc: null },
  { name: 'speach_share', stars: 0, lang: 'Python', updated: '2026-01-28', desc: null },
  { name: 'dotfiles', stars: 0, lang: 'Python', updated: '2025-11-27', desc: null },
  { name: 'trading_bot', stars: 0, lang: 'Python', updated: '2025-10-09', desc: null },
  { name: 'RapidAPI_Analysis', stars: 0, lang: 'Python', updated: '2025-10-07', desc: null },
  { name: 'reinforcement_learning', stars: 0, lang: 'Python', updated: '2025-07-23', desc: null },
  { name: 'transformer_gpt_style', stars: 0, lang: 'Python', updated: '2025-07-09', desc: null },
  { name: 'rnn_seq2seq_translation', stars: 0, lang: 'Python', updated: '2025-07-09', desc: null },
  { name: 'backpropagation', stars: 0, lang: 'Python', updated: '2025-07-09', desc: null },
  { name: 'word2vec', stars: 0, lang: 'Jupyter Notebook', updated: '2025-07-09', desc: null },
  { name: 'n-gram', stars: 0, lang: 'Python', updated: '2025-07-09', desc: null },
  { name: 'text_classification', stars: 0, lang: 'Python', updated: '2025-07-09', desc: null },
  { name: 'Schafkopf', stars: 0, lang: 'Shell', updated: '2025-05-26', desc: null },
  { name: 'scheduler', stars: 0, lang: 'Python', updated: '2024-08-04', desc: null }
].map(function (p) {
  p.url = 'https://github.com/' + NH.GITHUB_USER + '/' + p.name;
  p.topics = p.topics || [];
  return p;
});

/* Dot colours for the language chips. Anything unlisted falls
   back to a neutral grey. */
NH.LANG_COLORS = {
  'Python': '#3572a5', 'JavaScript': '#f1e05a', 'TypeScript': '#3178c6',
  'Jupyter Notebook': '#da5b0b', 'HTML': '#e34c26', 'CSS': '#563d7c',
  'Svelte': '#ff3e00', 'Shell': '#89e051', 'Java': '#b07219',
  'C': '#555555', 'C++': '#f34b7d', 'Rust': '#dea584', 'Go': '#00add8',
  'GLSL': '#5686a5', 'Lua': '#000080'
};
