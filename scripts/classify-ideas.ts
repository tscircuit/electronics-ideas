import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

type IdeaClassification = {
  idea: string;
  category: string;
};

type BatchResponse = {
  classifications: Array<{
    line_number: number;
    category: string;
  }>;
};

const rootDir = join(import.meta.dir, "..");
const ideasPath = join(rootDir, "IDEAS.txt");
const categoriesPath = join(rootDir, "CATEGORIES.txt");
const outputPath = join(rootDir, "ideas.json");

const model = process.env.OPENAI_MODEL ?? "gpt-5-nano";
const batchSize = Number.parseInt(process.env.IDEA_CLASSIFY_BATCH_SIZE ?? "50", 10);

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to classify ideas.");
}

if (!Number.isInteger(batchSize) || batchSize <= 0) {
  throw new Error(`Invalid IDEA_CLASSIFY_BATCH_SIZE: ${String(process.env.IDEA_CLASSIFY_BATCH_SIZE)}`);
}

const ideas = readFileSync(ideasPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const categories = readFileSync(categoriesPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

if (ideas.length === 0) {
  throw new Error("IDEAS.txt does not contain any ideas.");
}

if (new Set(ideas).size !== ideas.length) {
  throw new Error("IDEAS.txt contains duplicate ideas.");
}

if (categories.length < 10 || categories.length > 50) {
  throw new Error(`CATEGORIES.txt must contain between 10 and 50 categories. Found ${categories.length}.`);
}

if (new Set(categories).size !== categories.length) {
  throw new Error("CATEGORIES.txt contains duplicate categories.");
}

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const schemaForBatch = (expectedBatchSize: number) => ({
  type: "object",
  additionalProperties: false,
  properties: {
    classifications: {
      type: "array",
      minItems: expectedBatchSize,
      maxItems: expectedBatchSize,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          line_number: {
            type: "integer",
            minimum: 1,
            maximum: expectedBatchSize,
          },
          category: {
            type: "string",
            enum: categories,
          },
        },
        required: ["line_number", "category"],
      },
    },
  },
  required: ["classifications"],
}) as const;

const classifyBatch = async (batchIdeas: string[]): Promise<IdeaClassification[]> => {
  const numberedIdeas = batchIdeas.map((idea, index) => `${index + 1}. ${idea}`).join("\n");

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text: [
              "Classify each PCB idea into exactly one broad category.",
              "Use only the provided categories.",
              "Do not rewrite or summarize the ideas.",
              "Return one classification per input line number.",
            ].join(" "),
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [
              "Categories:",
              categories.map((category) => `- ${category}`).join("\n"),
              "",
              "Ideas:",
              numberedIdeas,
            ].join("\n"),
          },
        ],
      },
    ],
    reasoning: { effort: "low" },
    text: {
      format: {
        type: "json_schema",
        name: "idea_classifications",
        strict: true,
        schema: schemaForBatch(batchIdeas.length),
      },
    },
  });

  const parsed = JSON.parse(response.output_text) as BatchResponse;
  const seenLineNumbers = new Set<number>();

  if (parsed.classifications.length !== batchIdeas.length) {
    throw new Error(
      `Expected ${batchIdeas.length} classifications, received ${parsed.classifications.length}.`,
    );
  }

  for (const classification of parsed.classifications) {
    if (!categories.includes(classification.category)) {
      throw new Error(`Received unknown category: ${classification.category}`);
    }

    if (classification.line_number < 1 || classification.line_number > batchIdeas.length) {
      throw new Error(`Received out-of-range line_number: ${classification.line_number}`);
    }

    if (seenLineNumbers.has(classification.line_number)) {
      throw new Error(`Received duplicate line_number: ${classification.line_number}`);
    }

    seenLineNumbers.add(classification.line_number);
  }

  const ordered = [...parsed.classifications].sort((left, right) => left.line_number - right.line_number);

  return ordered.map((classification, index) => ({
    idea: batchIdeas[index],
    category: classification.category,
  }));
};

const classifications: IdeaClassification[] = [];

for (let start = 0; start < ideas.length; start += batchSize) {
  const batchIdeas = ideas.slice(start, start + batchSize);
  const batchNumber = Math.floor(start / batchSize) + 1;
  const totalBatches = Math.ceil(ideas.length / batchSize);

  console.log(`Classifying batch ${batchNumber}/${totalBatches} (${batchIdeas.length} ideas) with ${model}...`);
  const batchClassifications = await classifyBatch(batchIdeas);
  classifications.push(...batchClassifications);
}

writeFileSync(outputPath, `${JSON.stringify(classifications, null, 2)}\n`);
console.log(`Wrote ${classifications.length} classified ideas to ${outputPath}.`);
