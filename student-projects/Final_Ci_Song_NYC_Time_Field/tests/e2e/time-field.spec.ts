import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const consoleErrorsByPage = new WeakMap<object, string[]>();

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  consoleErrorsByPage.set(page, consoleErrors);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Commute Map Lab" })).toBeVisible();
  await expect(page.locator(".map-status")).toContainText("Subway model", {
    timeout: 45_000,
  });
  await expect(page.locator(".metric-strip article").first()).not.toContainText("—");
});

test.afterEach(async ({ page }) => {
  const errors = consoleErrorsByPage.get(page) ?? [];
  expect(errors).toEqual([]);
});

test("switches travel mode and bar height independently", async ({ page }) => {
  const slider = page.getByRole("slider", { name: "Commute time budget" });
  await slider.fill("45");
  await expect(page.locator(".time-readout strong")).toHaveText("45 MIN");

  await page.getByRole("button", { name: "Weekend" }).click();
  await expect(page.getByRole("button", { name: "Weekend" })).toHaveClass(
    /active/,
  );
  await page.getByRole("button", { name: "Driving" }).click();
  await expect(page.locator(".map-mode-note")).toContainText(
    "no live traffic or parking",
  );
  await expect(
    page.getByRole("button", { name: "Weekday AM" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Estimated rent" }).click();
  await expect(page.locator(".map-mode-note")).toContainText(
    "Color + price-ranked height · reachable homes only",
  );
  await expect(page.locator(".map-mode-note")).toContainText(
    "Outside your time limit: hidden",
  );
  await expect(
    page.getByLabel("Estimated gross rent legend"),
  ).toContainText("$0.3K lower");
  await expect(page.getByLabel("Estimated gross rent legend")).toContainText(
    "$3.5K higher",
  );
  await expect(page.locator(".map-canvas canvas")).toHaveAttribute(
    "data-time-field-encoding",
    "rent",
  );
  await expect(page.locator(".map-canvas canvas")).toHaveAttribute(
    "data-time-field-height-scale",
    "continuous-per-cell",
  );
  await expect(
    page.getByRole("link", { name: "Download the 5,543-row rent table" }),
  ).toHaveAttribute("href", "/data/rent-by-cell.csv");
  await expect(page.locator(".map-canvas canvas")).toHaveAttribute(
    "data-time-field-range",
    "reachable",
  );

  await expect
    .poll(() => new URL(page.url()).searchParams.get("minutes"))
    .toBe("45");
  expect(new URL(page.url()).searchParams.get("scenario")).toBe("weekend");
  expect(new URL(page.url()).searchParams.get("mode")).toBe("driving");
  expect(new URL(page.url()).searchParams.get("height")).toBe("rent");
});

test("replays smoothly from a scrolled wide-screen state", async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 });
  await page.getByRole("link", { name: "Map Lab", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(
    0,
  );

  await page.getByRole("button", { name: "Replay intro" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const geometry = await page.evaluate(() => {
    const opening = document.querySelector<SVGSVGElement>(".opening-routes");
    const hero = document.querySelector<SVGSVGElement>(".hero-lines");
    const route = hero?.querySelector<SVGPathElement>(".map-route-bronx");
    const viewBox = hero?.getAttribute("viewBox") ?? "";
    const [x, , width] = viewBox.split(/\s+/).map(Number);
    const path = route?.getAttribute("d") ?? "";
    const left = Number(path.match(/^M(-?\d+(?:\.\d+)?)/)?.[1]);
    const right = Number(path.match(/H(-?\d+(?:\.\d+)?)$/)?.[1]);
    return {
      openingViewBox: opening?.getAttribute("viewBox"),
      heroViewBox: viewBox,
      left,
      right,
      viewLeft: x,
      viewRight: x + width,
    };
  });

  expect(geometry.openingViewBox).toBe(geometry.heroViewBox);
  expect(geometry.left).toBeLessThan(geometry.viewLeft);
  expect(geometry.right).toBeGreaterThan(geometry.viewRight);

  await expect(page.locator(".opening-film")).toHaveClass(/is-finished/, {
    timeout: 4_000,
  });
  expect(new URL(page.url()).hash).toBe("");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect
    .poll(() =>
      page
        .locator(".opening-film")
        .evaluate((element) => getComputedStyle(element).transitionDuration),
    )
    .toContain("0.24s");
});

test("restores shared URL state and selects a ranked neighborhood", async ({
  page,
}) => {
  await page.goto(
    "/?lng=-73.9772&lat=40.7527&minutes=40&scenario=weekday_midday&mode=subway&height=time",
  );
  await expect(page.locator(".map-status")).toContainText("Subway model", {
    timeout: 45_000,
  });
  await expect(page.locator(".time-readout strong")).toHaveText("40 MIN");
  await expect(
    page.getByRole("button", { name: "Weekday Midday" }),
  ).toHaveClass(/active/);

  const firstNeighborhood = page
    .getByRole("table", { name: "Neighborhood accessibility ranking 1" })
    .getByRole("button")
    .first();
  await expect(firstNeighborhood).toBeVisible();
  await firstNeighborhood.click();
  await expect(firstNeighborhood.locator("xpath=ancestor::tr")).toHaveClass(
    /selected/,
  );
  await expect(
    page.getByRole("button", { name: "Inspect homes" }),
  ).toHaveClass(
    /active/,
  );
});

test("has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .exclude(".maplibregl-canvas")
    .analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(serious).toEqual([]);
});

test("mobile layout stays within the viewport", async ({ page }) => {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
  await expect(page.locator(".map-canvas")).toBeVisible();
  await expect(page.locator(".control-panel")).toBeVisible();
});
