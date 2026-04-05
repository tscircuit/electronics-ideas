import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ideasPath = join(import.meta.dir, "..", "IDEAS.txt");
const ideas = readFileSync(ideasPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

test("IDEAS.txt contains 1000 ideas", () => {
  expect(ideas).toHaveLength(1000);
});

test("IDEAS.txt contains unique ideas", () => {
  expect(new Set(ideas).size).toBe(ideas.length);
});
