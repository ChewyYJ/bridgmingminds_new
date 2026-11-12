import { expect, type Page } from "@playwright/test";

export async function skipSelfReflection(page: Page) {
  await expect(page.getByTestId("self-reflection")).toBeVisible();
  const note = page.getByRole("textbox", {
    name: "Your reflection",
    exact: true,
  });
  if (await note.count()) await expect(note).toHaveValue("");
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
}

export async function continueWithoutReflection(page: Page) {
  // The primary editor action must bypass the optional reflection stage.
  await expect(page.getByTestId("self-reflection")).toHaveCount(0);
  await page.getByRole("button", { name: "Get feedback", exact: true }).click();
  await expect(page.getByTestId("self-reflection")).toHaveCount(0);
}
