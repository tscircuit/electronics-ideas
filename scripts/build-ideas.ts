import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const ideaListsDir = join(rootDir, "idea-lists");
const categoriesPath = join(rootDir, "CATEGORIES.txt");
const outputPath = join(rootDir, "IDEAS.txt");

const slugifyCategory = (category: string) =>
  category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const categories = readFileSync(categoriesPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const availableFiles = new Set(
  readdirSync(ideaListsDir).filter((filename) => filename.endsWith(".txt")),
);

const sourceFiles = categories.map((category) => {
  const filename = `${slugifyCategory(category)}.txt`;

  if (!availableFiles.has(filename)) {
    throw new Error(`Missing idea list for category "${category}": ${filename}`);
  }

  return filename;
});

const ideas = sourceFiles.flatMap((filename) =>
  readFileSync(join(ideaListsDir, filename), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

writeFileSync(outputPath, `${ideas.join("\n")}\n`);

console.log(`Built IDEAS.txt with ${ideas.length} ideas from ${sourceFiles.length} category files.`);
