import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const template = readFileSync(resolve(here, "../../../assets/reader/reader.template.html"), "utf8");
const built = readFileSync(resolve(here, "../../../assets/reader/reader.html"), "utf8");

/**
 * The mobile reader used to annotate a whole section in one synchronous pass.
 * Ruby layout cost is linear in the number of annotated characters, so a long
 * chapter (thousands of characters, two DOM nodes per character) blocked the
 * WebView main thread for a long single task on every section load — including
 * sections foliate preloads while the user is still reading the previous one.
 *
 * The invariant is now: injection is queued and drained in small slices that
 * yield between them, the visible part of the visible section goes first, a page
 * turn makes the queue give way, and the final DOM is identical to what the old
 * one-shot pass produced (so pagination does not change).
 */
describe("mobile reader ruby injection scheduling", () => {
  it("never annotates a whole section in one synchronous pass", () => {
    expect(template).not.toContain("doInjectRubyAnnotations");
    expect(template).toMatch(/try \{ rubyScheduleInjection\(doc, _rubyMode\); \} catch\(e\) \{\}/);
    expect(template).toMatch(/if \(doc\) rubyScheduleInjection\(doc, _rubyMode\);/);
  });

  it("drains the queue in bounded slices that yield to the main thread", () => {
    const sliceChars = Number(/var RUBY_SLICE_CHARS = (\d+);/.exec(template)?.[1]);
    expect(sliceChars).toBeGreaterThan(0);
    expect(sliceChars).toBeLessThanOrEqual(1000);
    expect(template).toMatch(/rubyTickTimer = setTimeout\(rubyTick, delay\);/);
    expect(template).toMatch(/if \(chars >= RUBY_SLICE_CHARS \|\| done >= RUBY_SLICE_NODES\) break;/);
    expect(template).toMatch(/if \(rubyJobs\.length\) rubyScheduleTick\(RUBY_SLICE_GAP_MS\);/);
  });

  it("gives way while the user is turning pages or scrolling", () => {
    expect(template).toMatch(
      /el\.addEventListener\('relocate', \(e\) => \{\s*\n\s*markLoaded\(\);\s*\n\s*rubyNoteUserActivity\(\);/,
    );
    expect(template).toMatch(
      /if \(rubyNowMs\(\) - rubyLastActivityAt < RUBY_QUIET_AFTER_RELOCATE_MS\) \{[\s\S]*?return;/,
    );
  });

  it("annotates the visible section and the visible part of it first", () => {
    expect(template).toMatch(/var currentDoc = rubyCurrentDoc\(\);/);
    expect(template).toMatch(/return near\.concat\(mid, far\);/);
  });

  it("cancels pending work when annotations are removed or the mode changes", () => {
    expect(template).toMatch(/window\.removeRuby = function\(\) \{[\s\S]*?rubyCancelJobs\(\);/);
    expect(template).toMatch(/if \(nextMode !== _rubyMode\) \{[\s\S]*?rubyCancelJobs\(\);/);
  });

  it("keeps the generated reader.html in sync with the template", () => {
    expect(built).toContain("var RUBY_SLICE_CHARS = 400;");
    expect(built).toContain("function rubyScheduleInjection(doc, mode) {");
    expect(built).toContain("rubyNoteUserActivity(); // 翻页/滚动优先，注音队列让路");
    expect(built).not.toContain("doInjectRubyAnnotations");
  });
});
