// Integration test that loads the REAL compiler-emitted content/hint_filters.js
// (produced by `tsc -p content/tsconfig.json`) and exercises the deterministic
// hint engine in a real JS engine, with faithful stubs for the project's helper
// modules and a minimal DOM. Stronger than test-stable-hints.mjs (which
// re-implements the logic): here we run the actual shipped functions.
//
// Usage: emit the content project first, then:
//   tsc -p content/tsconfig.json --outDir /tmp/emit-content --noEmit false
//   EMIT_DIR=/tmp/emit-content node agent-notes/test-emitted-hints.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const EMIT = process.env.EMIT_DIR || "/tmp/emit-content";
const HF = path.join(EMIT, "content", "hint_filters.js");

let passed = 0, failed = 0;
const ok = (c, m) => { if (c) { passed++; console.log("  ok - " + m); } else { failed++; console.error("  FAIL - " + m); } };

class El {
  constructor(tag, props = {}) {
    this.tag = tag.toUpperCase();
    this.id = props.id || "";
    this.attrs = props.attrs || {};
    this.text = props.text || "";
    this.children = [];
    this.parentElement = null;
  }
  add(child) { child.parentElement = this; this.children.push(child); return child; }
  get previousElementSibling() {
    if (!this.parentElement) return null;
    const sibs = this.parentElement.children;
    const i = sibs.indexOf(this);
    return i > 0 ? sibs[i - 1] : null;
  }
}

const stubs = {
  dom_utils: {
    htmlTag_: (el) => (el.tag || "").toLowerCase(),
    attr_s: (el, name) => (el.attrs && el.attrs[name]) || "",
    textContent_s: (el) => el.text || "",
    ALA: "aria-label",
  },
  utils: { Lower: (s) => String(s).toLowerCase(), math: Math, OnChrome: 1 },
  link_hints: { hintChars: "sadfjklewcmpgh" },
  keyboard_utils: { SPC: " " },
};

function resolveDep(spec) {
  const base = spec.replace(/^\.\.?\//, "").replace(/^lib\//, "").replace(/\.js$/, "");
  if (base === "require") return undefined;
  if (base === "exports") return null; // handled specially
  if (stubs[base]) return stubs[base];
  const tail = base.split("/").pop();
  if (stubs[tail]) return stubs[tail];
  return {}; // unused dep (rect, local_links, dom_ui, omni): empty stub
}

// The emitted modules are AMD (tsconfig uses module: amd). Provide a define() shim.
function loadEmitted(file) {
  const code = readFileSync(file, "utf8");
  const moduleExports = {};
  const define = (deps, factory) => {
    const args = deps.map((d) => (d === "exports" ? moduleExports : d === "require" ? (() => ({})) : resolveDep(d)));
    factory.apply(null, args);
  };
  define.amd = true;
  const ctx = { define, console, Math };
  vm.createContext(ctx);
  new vm.Script(code, { filename: file }).runInContext(ctx);
  return moduleExports;
}

const hf = loadEmitted(HF);
ok(typeof hf.hash32 === "function", "real hash32 exported and loadable");
ok(typeof hf.stableFingerprint === "function", "real stableFingerprint exported and loadable");
ok(typeof hf.initAlphabetEngineStable === "function", "real initAlphabetEngineStable exported and loadable");

ok(hf.hash32("") === 2166136261, "FNV-1a empty string offset basis (2166136261)");
ok(hf.hash32("abc") === hf.hash32("abc"), "hash32 deterministic");
ok(hf.hash32("abc") !== hf.hash32("abd"), "hash32 sensitive to small change");
ok(hf.hash32("é") === hf.hash32("é"), "hash32 stable on multibyte");
ok((hf.hash32("anything") >>> 0) === hf.hash32("anything"), "hash32 unsigned 32-bit");

function buildPage() {
  const body = new El("body");
  const nav = body.add(new El("nav"));
  const a1 = nav.add(new El("a", { id: "home", text: "Home" }));
  const a2 = nav.add(new El("a", { attrs: { href: "https://example.com/docs?x=1#frag" }, text: "Docs" }));
  const a3 = nav.add(new El("a", { text: "Blog" }));
  return { body, a1, a2, a3 };
}
const p1 = buildPage();
const fpHome = hf.stableFingerprint(p1.a1);
const fpDocs = hf.stableFingerprint(p1.a2);
ok(fpHome.includes("#home"), "fingerprint includes id");
ok(fpHome.includes("t:home"), "fingerprint includes lowercased text");
ok(fpDocs.includes("@https://example.com/docs"), "fingerprint normalizes href");
ok(!fpDocs.includes("x=1") && !fpDocs.includes("frag"), "fingerprint drops query string and fragment");
ok(fpHome !== fpDocs, "different elements get different fingerprints");

const p2 = buildPage();
ok(hf.stableFingerprint(p2.a1) === fpHome, "same element on re-visit -> same fingerprint");
ok(hf.stableFingerprint(p2.a2) === fpDocs, "same href element on re-visit -> same fingerprint");

function assign(elements) {
  const items = elements.map((d) => ({ d, a: "" }));
  hf.initAlphabetEngineStable(items);
  const map = new Map();
  for (const it of items) map.set(hf.stableFingerprint(it.d), it.a);
  return map;
}

const A = buildPage();
const labelsA = assign([A.a1, A.a2, A.a3]);
ok([...labelsA.values()].every((l) => typeof l === "string" && l.length > 0), "every element gets a non-empty label");
ok(new Set(labelsA.values()).size === labelsA.size, "labels are unique (no duplicate assignment)");

const A2 = buildPage();
const labelsA2 = assign([A2.a1, A2.a2, A2.a3]);
let sameAll = true;
for (const [fp, lbl] of labelsA) if (labelsA2.get(fp) !== lbl) sameAll = false;
ok(sameAll, "assignment is identical across visits to the same page");

const A3 = buildPage();
const labelsA3 = assign([A3.a3, A3.a1, A3.a2]);
let orderInvariant = true;
for (const [fp, lbl] of labelsA) if (labelsA3.get(fp) !== lbl) orderInvariant = false;
ok(orderInvariant, "label for a given element is invariant to input order");

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) process.exit(1);
