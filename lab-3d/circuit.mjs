// A separate 24 V teaching circuit. This is not the task-1 scoring engine.
export const TERMINALS = ['DC.+', 'DC.-', 'PB.1', 'PB.2', 'K1.A1', 'K1.A2', 'K1.11', 'K1.14', 'H1.+', 'H1.-',
  ...Array.from({ length: 6 }, (_, i) => [`TB.${i + 1}.t`, `TB.${i + 1}.b`]).flat()];
export const EXAMPLE = [['DC.+', 'PB.1'], ['PB.2', 'K1.A1'], ['K1.A2', 'DC.-'],
  ['DC.+', 'K1.11'], ['K1.14', 'H1.+'], ['H1.-', 'DC.-']];
export const pairKey = (a, b) => [a, b].sort().join('|');
export function validWires(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.filter(w => {
    if (!Array.isArray(w) || w.length !== 2 || w[0] === w[1] || !w.every(t => TERMINALS.includes(t))) return false;
    const key = pairKey(...w);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 120).map(w => [...w]);
}
export function inspect(wires, power = false, pressed = false) {
  const parent = new Map(TERMINALS.map(t => [t, t]));
  const find = t => { while (parent.get(t) !== t) t = parent.get(t); return t; };
  const join = (a, b) => parent.set(find(a), find(b));
  const same = (a, b) => find(a) === find(b);
  for (const [a, b] of validWires(wires)) join(a, b);
  for (let i = 1; i <= 6; i++) join(`TB.${i}.t`, `TB.${i}.b`);
  if (pressed) join('PB.1', 'PB.2');
  const across = (a, b) => !same('DC.+', 'DC.-') &&
    ((same(a, 'DC.+') && same(b, 'DC.-')) || (same(b, 'DC.+') && same(a, 'DC.-')));
  let short = power && same('DC.+', 'DC.-');
  const relay = power && !short && across('K1.A1', 'K1.A2');
  if (relay) join('K1.11', 'K1.14');
  short ||= power && same('DC.+', 'DC.-');
  return { short, relay: relay && !short, lamp: power && !short && across('H1.+', 'H1.-') };
}
