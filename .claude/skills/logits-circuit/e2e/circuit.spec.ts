import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { getExample } from "@/example";
import { encodeShareParam, fromJson } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { Step } from "../scripts/simulate";

/**
 * Opens one circuit in the read-only preview, fails on any diagnostic error,
 * screenshots it, then replays a steps file (the same one `simulate.ts
 * --steps` takes) by clicking switches and reading pin values off the DOM.
 *
 * Env:
 *   LOGITS_EXAMPLE=<example document id>  tries /preview/example/<id> first
 *   LOGITS_CIRCUIT=<path.json>            otherwise, sent as /preview#data=
 *   LOGITS_STEPS=<steps.json>             optional
 *   LOGITS_SHOTS=<dir>                    default e2e/shots
 *   LOGITS_ALLOW_WARNINGS=1               do not fail on warnings
 */

const exampleId = process.env.LOGITS_EXAMPLE;
const circuitFile = process.env.LOGITS_CIRCUIT;
const stepsFile = process.env.LOGITS_STEPS;
const shots = path.resolve(
  process.env.LOGITS_SHOTS ?? path.join(__dirname, "shots"),
);
const allowWarnings = process.env.LOGITS_ALLOW_WARNINGS === "1";

const shotName =
  exampleId ??
  path.basename(circuitFile ?? "circuit").replace(/\.(logits\.)?json$/, "");
const steps: Step[] = stepsFile
  ? JSON.parse(readFileSync(stepsFile, "utf8"))
  : [];

function loadDocument(): CircuitDocument {
  if (circuitFile) {
    const loaded = fromJson(JSON.parse(readFileSync(circuitFile, "utf8")));
    if (!loaded.ok)
      throw new Error(`${circuitFile}: ${JSON.stringify(loaded.issues)}`);
    if (loaded.issues.length > 0) {
      throw new Error(
        `${circuitFile} drops elements on load: ${JSON.stringify(loaded.issues)}`,
      );
    }
    return loaded.document;
  }
  const example = exampleId ? getExample(exampleId) : undefined;
  if (!example)
    throw new Error(
      `Set LOGITS_CIRCUIT=<file> or LOGITS_EXAMPLE=<id> (got "${exampleId ?? ""}")`,
    );
  return example.document;
}

/** `/preview/example/<id>` when the route exists, the `#data=` link otherwise. */
async function open(page: Page): Promise<string> {
  if (exampleId && !circuitFile) {
    const response = await page.goto(
      `/preview/example/${encodeURIComponent(exampleId)}`,
    );
    if (response?.ok()) return "example route";
  }
  await page.goto(`/preview#data=${await encodeShareParam(loadDocument())}`);
  return "data link";
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function waitReady(page: Page) {
  await page.locator("[data-circuit-preview]").waitFor();
  const diagnostics = page.getByRole("button", { name: /^Diagnostics: / });
  await diagnostics.waitFor();
  // Pins are empty until the first netlist compiles and the engine settles.
  await page.waitForTimeout(500);
  return diagnostics;
}

/**
 * Every node's focus button is labelled `"<label> (<Type>), pins: <id> <bits>, …"`,
 * which reads any pin of any part without knowing its view.
 */
async function readPins(
  page: Page,
  label: string,
): Promise<Record<string, string>> {
  const buttons = page.locator(
    `button[aria-label^="${label.replace(/"/g, '\\"')} ("]`,
  );
  const labels = (
    await buttons.evaluateAll((els) =>
      els.map((el) => el.getAttribute("aria-label") ?? ""),
    )
  ).filter((text) => text.includes("), pins: "));
  if (labels.length !== 1) {
    throw new Error(
      `expected one part labelled "${label}", found ${labels.length}`,
    );
  }
  const pins: Record<string, string> = {};
  for (const entry of labels[0].split("), pins: ")[1].split(", ")) {
    const [id, value] = entry.split(" ");
    pins[id] = value;
  }
  return pins;
}

async function readRef(page: Page, ref: string): Promise<string> {
  const dot = ref.lastIndexOf(".");
  const tryWhole = await readPins(page, ref).catch(() => null);
  const [label, pin] = tryWhole
    ? [ref, undefined]
    : [ref.slice(0, dot), ref.slice(dot + 1)];
  const pins = tryWhole ?? (await readPins(page, label));
  const ids = Object.keys(pins);
  const id =
    pin ?? (ids.length === 1 ? ids[0] : ids.includes("in") ? "in" : undefined);
  if (!id || !(id in pins))
    throw new Error(`${ref}: name a pin — ${ids.join(", ")}`);
  return pins[id];
}

async function setInput(
  page: Page,
  ref: string,
  value: number | boolean | string,
) {
  const want = value === true || value === 1 || value === "1";
  if (
    !(
      value === 0 ||
      value === 1 ||
      typeof value === "boolean" ||
      value === "0" ||
      value === "1"
    )
  ) {
    throw new Error(
      `${ref}: the UI can only flip 1-bit switches; test ${JSON.stringify(value)} with simulate.ts`,
    );
  }
  const toggle = page.getByRole("button", {
    name: new RegExp(`^${escapeRegExp(ref)}: (on|off)$`),
  });
  if ((await toggle.count()) !== 1)
    throw new Error(`no io.switch labelled "${ref}" to click`);
  if ((await toggle.getAttribute("aria-pressed")) !== String(want))
    await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", String(want));
}

test.beforeAll(() => mkdirSync(shots, { recursive: true }));

test(`${shotName}: renders with no diagnostics`, async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const via = await open(page);
  info.annotations.push({ type: "opened via", description: via });
  const diagnostics = await waitReady(page);
  const shot = path.join(shots, `${shotName}.png`);
  await page.screenshot({ path: shot });
  info.annotations.push({ type: "screenshot", description: shot });

  const label = (await diagnostics.getAttribute("aria-label")) ?? "";
  const [, errorCount, warningCount] =
    label.match(/(\d+) errors, (\d+) warnings/) ?? [];
  if (Number(errorCount) > 0 || (!allowWarnings && Number(warningCount) > 0)) {
    await diagnostics.click();
    const panelShot = path.join(shots, `${shotName}-diagnostics.png`);
    await page.screenshot({ path: panelShot });
    info.annotations.push({ type: "diagnostics", description: panelShot });
  }
  expect(errors, "uncaught page errors").toEqual([]);
  expect(Number(errorCount), label).toBe(0);
  if (!allowWarnings) expect(Number(warningCount), label).toBe(0);
});

test(`${shotName}: steps`, async ({ page }, info) => {
  test.skip(steps.length === 0, "no LOGITS_STEPS file");
  await open(page);
  await waitReady(page);

  for (const [index, step] of steps.entries()) {
    const title = `step ${index + 1}${step.name ? ` ${step.name}` : ""}`;
    await test.step(title, async () => {
      for (const [ref, value] of Object.entries(step.set ?? {}))
        await setInput(page, ref, value);
      // The preview runs at 1 µs of simulated time per second: 1 ns per ms.
      await page.waitForTimeout(Math.max(100, step.runNs ?? 50));
      for (const [ref, expected] of Object.entries(step.expect ?? {})) {
        // Compared as a decimal when the expectation is a number, so a failure
        // prints the value the canvas actually showed.
        const want =
          typeof expected === "number"
            ? expected
            : expected.replace(/[\s_]/g, "");
        await expect
          .poll(
            async () => {
              const actual = await readRef(page, ref);
              return typeof expected === "number" && /^[01]+$/.test(actual)
                ? Number.parseInt(actual, 2)
                : actual;
            },
            { message: `${title}: ${ref}`, timeout: 5_000 },
          )
          .toBe(want);
      }
      const shot = path.join(shots, `${shotName}-step${index + 1}.png`);
      await page.screenshot({ path: shot });
      info.annotations.push({ type: title, description: shot });
    });
  }
});
