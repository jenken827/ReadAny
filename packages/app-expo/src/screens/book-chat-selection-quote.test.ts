import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "BookChatScreen.tsx"),
  "utf8",
);

/**
 * 阅读器划词进对话时带过来的选中文本，只能服务于「第一问」。
 * 这里用源码断言守住两条容易回归的规则（见 ff3881ba 引入的旧实现）。
 */
describe("BookChat selected-text quote lifetime", () => {
  it("不再用 quotes.length === 0 作为重新附着的条件", () => {
    // 旧实现：删掉引用 → quotes.length 归零 → 立即被导航参数补回来。
    expect(source).not.toMatch(/quotes\.length === 0/);
  });

  it("发过一条带引用的消息后就不再携带选中文本", () => {
    expect(source).toMatch(
      /if \(quotes && quotes\.length > 0\) \{\s*setQuotes\(\[\]\);\s*setSelectionContext\(undefined\);/,
    );
  });
});
