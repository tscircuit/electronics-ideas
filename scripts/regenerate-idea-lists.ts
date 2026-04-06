import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";

type IdeaBatch = {
  ideas: string[];
};

const rootDir = join(import.meta.dir, "..");
const categoriesPath = join(rootDir, "CATEGORIES.txt");
const ideaListsDir = join(rootDir, "idea-lists");

const model = process.env.OPENAI_IDEA_MODEL ?? "gpt-5.2";
const maxRetries = 3;

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required to regenerate idea lists.");
}

const categories = readFileSync(categoriesPath, "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length > 0);

const anchorExamples: Record<string, string[]> = {
  "Power and Energy": [
    "solar charge combiner for a remote gate opener",
    "48 V telecom backup shelf monitor",
    "portable inverter health dashboard for a food truck",
    "generator auto-start transfer panel for a cabin",
    "DC bus balancer for an e-bike repair bench",
  ],
  "Battery and Charging": [
    "electric screwdriver charging dock",
    "camera battery conditioning tray",
    "tool-pack equalizer for a cordless vacuum cart",
    "USB-C field charger for a drone crew case",
    "battery swap station for handheld barcode scanners",
  ],
  "Sensors and Data Acquisition": [
    "strain gauge board for a benchtop press",
    "multi-channel kiln thermocouple logger",
    "piezo impact recorder for package drop testing",
    "vibration front end for a gearbox test stand",
    "precision current sampler for a soldering station",
  ],
  "Environmental Monitoring": [
    "mushroom grow tent climate panel",
    "walk-in cooler humidity sentinel",
    "attic mold warning node",
    "school classroom CO2 beacon",
    "archive specimen cabinet air quality logger",
  ],
  "Motion and Position Control": [
    "camera slider axis controller",
    "motorized microscope focus stage",
    "linear actuator sync board for a standing desk",
    "garage jig for repeatable drill depth setting",
    "turntable indexing plate controller",
  ],
  "Motor Drives and Robotics": [
    "24 V centrifugal blower controller",
    "NEMA 17 belt feeder drive",
    "worm-geared window opener",
    "brushless screwdriver spindle drive",
    "peristaltic pump dosing head",
  ],
  "Audio and Music": [
    "pedalboard looper switcher",
    "desktop metronome with tactile pulse",
    "practice amp control panel",
    "field recorder preamp",
    "MIDI foot controller for stage keyboards",
  ],
  "Display and Human Interface": [
    "espresso machine front panel",
    "stove touch-and-knob control fascia",
    "workshop timer keypad panel",
    "industrial washdown operator display",
    "homebrew fermentation status panel",
  ],
  "Lighting and LED Control": [
    "bicycle tail-light sequencer",
    "film prop marquee controller",
    "cabinet underglow dimmer",
    "greenhouse grow-light scheduler",
    "ambulance compartment lamp panel",
  ],
  "Wireless IoT": [
    "mailbox arrival notifier",
    "pool equipment telemetry puck",
    "freezer alarm with long-range radio",
    "bee-hive gateway node",
    "trailer door open sensor",
  ],
  "Wired Networking and Industrial Bus": [
    "Modbus boiler room relay panel",
    "CAN bus node for a race kart",
    "PoE badge reader head",
    "Ethernet conveyor counter",
    "RS-485 pump room annunciator",
  ],
  "Security and Access Control": [
    "locker access keypad",
    "delivery box smart latch",
    "garage side-door audit logger",
    "tool crib badge access reader",
    "gate intercom strike controller",
  ],
  "Test and Measurement": [
    "bench LCR fixture",
    "USB load tester for phone chargers",
    "thermocouple calibrator for a repair lab",
    "battery internal-resistance meter",
    "continuity matrix for cable harnesses",
  ],
  "Lab Automation": [
    "tube rocker controller",
    "microplate shaker timing panel",
    "solenoid manifold for a chemistry rig",
    "sample carousel indexer",
    "lab fridge door-open logger",
  ],
  "Home Automation": [
    "boiler room circulation scheduler",
    "bathroom fan delay timer",
    "shade controller for a sunroom",
    "garage vent damper driver",
    "basement sump alert panel",
  ],
  "Wearables and Personal Devices": [
    "smart posture clip",
    "heated cycling glove controller",
    "safety helmet rear light",
    "wrist-worn silent reminder",
    "clip-on hydration tracker",
  ],
  "Health and Wellness": [
    "medication drawer reminder",
    "CPAP hose temperature monitor",
    "hydration kiosk status light",
    "rehab exercise repetition counter",
    "quiet sleep-environment logger",
  ],
  "Automotive and Mobility": [
    "campervan tank monitor",
    "motorcycle accessory fuse panel",
    "e-bike battery range display",
    "trailer brake fault indicator",
    "seat heater retrofit controller",
  ],
  "RF and Radio": [
    "fox-hunt beacon",
    "antenna rotor controller",
    "RF power sampler for a ham bench",
    "field-strength logger for a repeater site",
    "synthesizer local oscillator module",
  ],
  "Computer and USB Peripherals": [
    "macro pad for CAD shortcuts",
    "USB fan controller for a rack shelf",
    "KVM hotkey panel",
    "USB-C dock status display",
    "desktop fingerprint login pad",
  ],
  "Data Logging and Storage": [
    "fridge compressor service logger",
    "fleet trailer shock recorder",
    "aquarium maintenance event logger",
    "brew kettle batch recorder",
    "construction site power interruption logger",
  ],
  "Timing and Scheduling": [
    "church bell strike scheduler",
    "school workshop machine lockout timer",
    "shop floor shift-change beacon",
    "garden irrigation calendar controller",
    "darkroom enlarger timer panel",
  ],
  "Education and STEM": [
    "classroom reaction-time game",
    "intro robotics trainer",
    "learn-to-solder badge",
    "physics pendulum data board",
    "planetarium demo controller",
  ],
  "Agriculture and Outdoor Systems": [
    "fence charger health node",
    "barn fan staging controller",
    "livestock water trough alarm",
    "orchard frost-warning beacon",
    "greenhouse vent opener",
  ],
  "Smart Appliances and Utilities": [
    "rice cooker control panel",
    "water dispenser compressor board",
    "range hood fan keypad",
    "toaster oven reflow conversion front end",
    "ice maker bin-level controller",
  ],
};

const slugifyCategory = (category: string) =>
  category
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const responseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    ideas: {
      type: "array",
      minItems: 40,
      maxItems: 40,
      items: {
        type: "string",
      },
    },
  },
  required: ["ideas"],
} as const;

const bannedPhrases = [
  "eurocard",
  "generic sensor node",
  "development board",
  "carrier board",
  "breakout board",
  "museum display-case",
  "museum display case",
];

const validateIdeas = (category: string, ideas: string[], globalIdeas: Set<string>) => {
  if (ideas.length !== 40) {
    throw new Error(`${category}: expected 40 ideas, received ${ideas.length}`);
  }

  const localIdeas = new Set<string>();

  for (const idea of ideas) {
    const normalized = idea.trim();

    if (normalized.length < 40) {
      throw new Error(`${category}: idea is too short: ${normalized}`);
    }

    const lower = normalized.toLowerCase();
    for (const bannedPhrase of bannedPhrases) {
      if (lower.includes(bannedPhrase)) {
        throw new Error(`${category}: banned phrase "${bannedPhrase}" in idea: ${normalized}`);
      }
    }

    if (localIdeas.has(normalized)) {
      throw new Error(`${category}: duplicate idea within category: ${normalized}`);
    }

    if (globalIdeas.has(normalized)) {
      throw new Error(`${category}: duplicate idea across categories: ${normalized}`);
    }

    localIdeas.add(normalized);
  }
};

const generateIdeasForCategory = async (
  category: string,
  usedIdeas: Set<string>,
): Promise<string[]> => {
  const examples = anchorExamples[category] ?? [];

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    const response = await client.responses.create({
      model,
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You generate high-quality PCB product ideas.",
                "Intent is more important than raw board capability.",
                "Every idea must describe a concrete end product, appliance, tool, instrument, fixture, or retrofit.",
                "Exactly half of the ideas should explicitly name concrete chips in the sentence.",
                "The other half should lead with the real-world intent and mention chips only if helpful.",
                "If an idea involves a motor, specify the motor type or drive style, such as brushed DC gearmotor, BLDC blower, peristaltic pump, NEMA 17 stepper, or linear actuator.",
                "Avoid repetitive form factors, avoid Eurocard, and avoid generic phrasing like monitor board, controller board, or sensor node.",
                "Return one sentence per idea with no numbering.",
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
                `Category: ${category}`,
                "Generate exactly 40 unique ideas.",
                "Use diverse intents within the category; do not just shuffle the same product with different chips.",
                "At least 20 ideas should feel grounded in everyday or industrial objects such as appliances, tools, vehicles, fixtures, panels, or instruments.",
                examples.length > 0 ? `Anchor examples to inspire specificity:\n- ${examples.join("\n- ")}` : "",
                "Formatting rules:",
                "- one idea per array item",
                "- one sentence each",
                "- no numbering",
                "- no markdown bullets",
                "- no Eurocard",
                "- no exact duplicates",
              ].filter(Boolean).join("\n"),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "category_ideas",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    const parsed = JSON.parse(response.output_text) as IdeaBatch;
    const cleanedIdeas = parsed.ideas.map((idea) => idea.trim());

    try {
      validateIdeas(category, cleanedIdeas, usedIdeas);
      return cleanedIdeas;
    } catch (error) {
      console.warn(`Retrying ${category} after validation failure on attempt ${attempt}: ${String(error)}`);
    }
  }

  throw new Error(`Failed to generate a valid set of ideas for ${category} after ${maxRetries} attempts.`);
};

mkdirSync(ideaListsDir, { recursive: true });
for (const filename of readdirSync(ideaListsDir)) {
  if (filename.endsWith(".txt")) {
    rmSync(join(ideaListsDir, filename));
  }
}

const usedIdeas = new Set<string>();

for (const [index, category] of categories.entries()) {
  const filename = `${slugifyCategory(category)}.txt`;
  console.log(`Generating ${index + 1}/${categories.length}: ${filename}`);

  const ideas = await generateIdeasForCategory(category, usedIdeas);
  for (const idea of ideas) {
    usedIdeas.add(idea);
  }

  writeFileSync(join(ideaListsDir, filename), `${ideas.join("\n")}\n`);
}

console.log(`Generated ${usedIdeas.size} ideas across ${categories.length} category files.`);
