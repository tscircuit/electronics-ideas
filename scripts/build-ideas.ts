import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const rootDir = join(import.meta.dir, "..");
const ideaListsDir = join(rootDir, "idea-lists");
const outputPath = join(rootDir, "IDEAS.txt");

const sourceFiles = readdirSync(ideaListsDir)
  .filter((filename) => filename.endsWith(".txt"))
  .sort((left, right) => left.localeCompare(right));

const ideas = sourceFiles.flatMap((filename) =>
  readFileSync(join(ideaListsDir, filename), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0),
);

writeFileSync(outputPath, `${ideas.join("\n")}\n`);

console.log(`Built IDEAS.txt with ${ideas.length} ideas from ${sourceFiles.length} files.`);
