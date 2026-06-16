const LOGIN_TAGLINES = [
  'No docs, no glory.',
  'Undocumented work is imaginary work.',
  "If it's not documented, it didn't happen.",
  'Know things. Write them down.',
  'Turn chaos into canon.',
  'Your business brain, finally searchable.',
  'Because "ask Alex" is not a process.',
  'May the docs be with you.',
  'Write it down before it becomes folklore.',
  'Stop losing knowledge in chat threads.',
  'Documentation: because memory is a terrible database.',
  'You know nothing... without docs.',
  'All your knowledge are belong to us.',
  'Brain drain starts where docs end.',
] as const;

export function randomLoginTagline(): string {
  const index = Math.floor(Math.random() * LOGIN_TAGLINES.length);
  return LOGIN_TAGLINES[index] ?? LOGIN_TAGLINES[0];
}
