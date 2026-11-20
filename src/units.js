// All geometry is stored in millimetres. These helpers only deal with display and input.

export const IN = 25.4;

const trim = (n, d) => String(+n.toFixed(d));

export function fmt(mm, unit) {
  if (unit === 'in') return trim(mm / IN, 2) + '"';
  if (unit === 'mm') return trim(mm, 1) + ' mm';
  return trim(mm / 10, 1) + ' cm';
}

// Primary unit plus the other system in brackets, e.g. `104.1 cm (41")`
export function fmtDual(mm, unit) {
  const other = unit === 'in' ? 'cm' : 'in';
  return `${fmt(mm, unit)} (${fmt(mm, other)})`;
}

// Bare number for an input field in the given unit
export function toField(mm, unit) {
  if (unit === 'in') return trim(mm / IN, 3);
  if (unit === 'mm') return trim(mm, 1);
  return trim(mm / 10, 2);
}

// Accepts "41", "41in", '41"', "70 cm", "700mm", "8ft", "8'". No suffix = current unit.
export function parseLen(text, unit) {
  const m = String(text).trim().toLowerCase().match(/^(-?\d*\.?\d+)\s*(mm|cm|m|in|inch|inches|"|”|ft|')?$/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  let u = m[2];
  if (!u) u = unit;
  if (u === 'mm') return v;
  if (u === 'cm') return v * 10;
  if (u === 'm') return v * 1000;
  if (u === 'ft' || u === "'") return v * IN * 12;
  return v * IN;
}
