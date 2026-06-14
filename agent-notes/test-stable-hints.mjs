// Standalone micro-tests for the pure logic of deterministic hint labels.
// Mirrors hash32 / normalizeHref_ / probing assignment from content/hint_filters.ts.
// Run: node agent-notes/test-stable-hints.mjs
import assert from "node:assert";

const imul = Math.imul;

// --- mirror of hash32 (FNV-1a, 32-bit, unsigned) ---
const hash32 = (str) => {
  let h = 2166136261;
  for (let i = 0, n = str.length; i < n; i++) {
    const c = str.charCodeAt(i);
    h ^= c & 0xff;
    if (c > 0xff) { h ^= (c >>> 8) & 0xff; }
    h = imul(h, 16777619);
  }
  return h >>> 0;
};

// --- mirror of normalizeHref_ ---
const normalizeHref_ = (raw) => {
  const q = raw.indexOf("?"), hsh = raw.indexOf("#");
  let end = raw.length;
  if (q >= 0) { end = q; }
  if (hsh >= 0 && hsh < end) { end = hsh; }
  return raw.slice(0, end);
};

// --- mirror of the deterministic assignment (slot = hash%N, linear probing, fp tie-break) ---
const assignStable = (fingerprints, labels) => {
  const poolLen = labels.length;
  const order = fingerprints.map((fp, idx) => ({ fp, idx }));
  order.sort((a, b) => (a.fp < b.fp ? -1 : a.fp > b.fp ? 1 : a.idx - b.idx));
  const taken = new Array(poolLen);
  const out = new Array(fingerprints.length);
  for (const { fp, idx } of order) {
    let slot = poolLen ? hash32(fp) % poolLen : 0, probes = 0;
    while (probes < poolLen && taken[slot] !== undefined) { slot = (slot + 1) % poolLen; probes++; }
    if (probes >= poolLen) { out[idx] = labels[idx] || ""; continue; }
    taken[slot] = fp;
    out[idx] = labels[slot];
  }
  return out;
};

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

console.log("hash32:");
t("deterministic: same input -> same output", () => {
  assert.strictEqual(hash32("hello"), hash32("hello"));
});
t("returns unsigned 32-bit int", () => {
  for (const s of ["", "a", "https://x.com/p", "éèì"]) {
    const h = hash32(s);
    assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff, `bad: ${s} -> ${h}`);
  }
});
t("known FNV-1a vector: '' === 2166136261", () => {
  assert.strictEqual(hash32(""), 2166136261);
});
t("sensitive to small changes", () => {
  assert.notStrictEqual(hash32("ab"), hash32("ba"));
  assert.notStrictEqual(hash32("a"), hash32("a "));
});
t("handles multibyte without collapsing", () => {
  assert.notStrictEqual(hash32("é"), hash32("e"));
});

console.log("normalizeHref_:");
t("drops query", () => assert.strictEqual(normalizeHref_("https://x.com/p?a=1"), "https://x.com/p"));
t("drops hash", () => assert.strictEqual(normalizeHref_("https://x.com/p#frag"), "https://x.com/p"));
t("drops query before hash", () => assert.strictEqual(normalizeHref_("https://x.com/p?a=1#f"), "https://x.com/p"));
t("keeps clean url", () => assert.strictEqual(normalizeHref_("https://x.com/p"), "https://x.com/p"));
t("hash before query (hash wins)", () => assert.strictEqual(normalizeHref_("https://x.com/p#a?b"), "https://x.com/p"));

console.log("assignStable (determinism & no-shift):");
const labels = ["a","s","d","f","g","h","j","k","l"]; // pool of 9
t("every element gets a unique label", () => {
  const fps = ["A","B","C","D","E"];
  const out = assignStable(fps, labels);
  assert.strictEqual(new Set(out).size, out.length, "labels not unique: " + out);
});
t("same fingerprints -> same labels (stable across visits)", () => {
  const fps = ["btn-login","btn-logout","nav-home","nav-about"];
  const a = assignStable(fps, labels);
  const b = assignStable(fps, labels);
  assert.deepStrictEqual(a, b);
});
t("adding an element elsewhere does NOT shift others (no collision case)", () => {
  const base = ["nav-home","nav-about","footer-tos"];
  const withExtra = ["nav-home","nav-about","footer-tos","new-banner-link"];
  const a = assignStable(base, labels);
  const b = assignStable(withExtra, labels);
  // labels for the 3 shared fingerprints must be identical, unless the new one
  // probes into one of their exact slots. Verify they are preserved here:
  for (const fp of base) {
    const ia = base.indexOf(fp), ib = withExtra.indexOf(fp);
    assert.strictEqual(a[ia], b[ib], `${fp} shifted: ${a[ia]} -> ${b[ib]}`);
  }
});
t("order of input does not change a given fingerprint's label", () => {
  const fps1 = ["x","y","z"];
  const fps2 = ["z","x","y"];
  const o1 = assignStable(fps1, labels);
  const o2 = assignStable(fps2, labels);
  assert.strictEqual(o1[fps1.indexOf("x")], o2[fps2.indexOf("x")]);
  assert.strictEqual(o1[fps1.indexOf("y")], o2[fps2.indexOf("y")]);
  assert.strictEqual(o1[fps1.indexOf("z")], o2[fps2.indexOf("z")]);
});

console.log(`\nAll ${pass} assertions passed.`);
