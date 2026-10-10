import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "BookChatScreen.tsx"),
  "utf8",
);

/**
 * Regression guard for the reported bug: the first time a book's AI chat was
 * opened in a session, the screen stayed on the「AI 助手 / 建议问题」empty state
 * even though the thread was already in the store; an unrelated re-render
 * (tapping the 历史 icon) was needed before the messages showed up.
 *
 * Why: `getActiveThreadId()` is a zustand *action* — it reads state imperatively
 * and creates no subscription. On the first open the active id does not exist
 * yet, and the effect that writes it runs only after `loadThreads` resolved.
 * That write touches `bookActiveThreadIds`, which the screen did not subscribe
 * to, so React had no reason to re-render: the render that finally displayed the
 * conversation was the one triggered by the history tap.
 *
 * The invariant is now: the screen subscribes to `bookActiveThreadIds` (and never
 * calls `getActiveThreadId()` while rendering), and falls back to the newest
 * thread of the book so the conversation renders together with `threads`.
 */
describe("BookChatScreen active-thread contract", () => {
  it("subscribes to the active-thread map instead of calling the getter", () => {
    expect(source).toMatch(/useChatStore\(\(s\) => s\.bookActiveThreadIds\)/);
    // The non-reactive getter must not come back into the render path.
    expect(source).not.toMatch(/s\.getActiveThreadId/);
    expect(source).not.toMatch(/=\s*getActiveThreadId\(/);
  });

  it("renders the newest thread of the book while no thread has been picked", () => {
    expect(source).toMatch(/const storedActiveThreadId = bookActiveThreadIds\[bookId\] \|\| null;/);
    expect(source).toMatch(
      /const activeThreadId = storedActiveThreadId \?\? bookThreads\[0\]\?\.id \?\? null;/,
    );
  });

  it("only writes the fallback back to the store when nothing was stored", () => {
    expect(source).toMatch(
      /if \(!storedActiveThreadId && activeThreadId\) \{\s*setBookActiveThread\(bookId, activeThreadId\);/,
    );
  });
});
