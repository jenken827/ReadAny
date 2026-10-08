import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "MessageList.tsx"),
  "utf8",
);

/**
 * Regression guard for the reported bug: on a long thread the list snapped back to
 * the bottom on every attempted scroll-up, so the history could not be read. The
 * cause was position-based re-arming — `if (nearBottom) autoFollow = true` fired
 * while the finger was still inside the bottom band, and the content-size change
 * caused by the newly measured cells then pinned it straight back down.
 *
 * The invariant is now: `autoFollowRef` means *user intent*. A gesture clears it,
 * only a gesture that ends at the bottom (or the 滚动到底部 button) restores it, and
 * no pin is issued while the finger owns the position.
 */
describe("MessageList follow-intent contract", () => {
  it("drops following the moment a drag starts", () => {
    expect(source).toMatch(/onScrollBeginDrag=\{\(\) => \{[\s\S]*?draggingRef\.current = true;/);
    expect(source).toMatch(/onScrollBeginDrag=\{\(\) => \{[\s\S]*?autoFollowRef\.current = false;/);
  });

  it("re-arms only when a gesture ends at the bottom", () => {
    expect(source).toMatch(
      /const rearmIfAtBottom = useCallback\([\s\S]*?layoutMeasurement\.height > REARM_THRESHOLD\) return;/,
    );
    expect(source).toMatch(/onScrollEndDrag=\{\(e\) => \{[\s\S]*?rearmIfAtBottom\(e\);/);
    expect(source).toMatch(/onMomentumScrollEnd=\{\(e\) => \{[\s\S]*?rearmIfAtBottom\(e\);/);
  });

  it("never re-arms from inside the bottom band while the user is moving up", () => {
    // The exact line that caused the snap-back must not come back.
    expect(source).not.toMatch(/if \(nearBottom\) autoFollowRef\.current = true;/);
    expect(source).toMatch(
      /if \(!movedUp && \(!draggingRef\.current \|\| dist <= 8\)\) autoFollowRef\.current = true;/,
    );
  });

  it("refuses to pin while the finger owns the scroll position", () => {
    expect(source).toMatch(/if \(draggingRef\.current\) return; \/\/ never steal the position/);
    expect(source).toMatch(
      /if \(!options\?\.force && \(!autoFollowRef\.current \|\| isUserInteracting\(\)\)\) return;/,
    );
    expect(source).toMatch(
      /const isUserInteracting = useCallback\(\s*\(\) => draggingRef\.current \|\| Date\.now\(\) < gestureGuardUntilRef\.current/,
    );
  });

  it("lands on the newest message instantly until the bottom has been reached once", () => {
    // Entry used to animate every medium-length history through the whole
    // conversation (`dist <= layout`), which is what looked janky on entry.
    expect(source).toMatch(
      /const animated = options\?\.animated \?\? \(settledRef\.current && dist <= m\.layout\);/,
    );
  });

  it("does not fabricate the bottom position when a stream ends", () => {
    expect(source).not.toMatch(/isAtBottomRef\.current = true;/);
  });
});
