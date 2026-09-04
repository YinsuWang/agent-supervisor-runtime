import { companionProfileDirectory } from "../../src/companion/profile.js";
import { launchPersistentCompanionContext } from "../../src/companion/transport.js";

const profileDir = companionProfileDirectory();
const context = await launchPersistentCompanionContext(profileDir);

try {
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://chatgpt.com/");
  const playwrightPage = page as import("playwright").Page;
  await playwrightPage.locator('#prompt-textarea, [role="textbox"][contenteditable="true"]')
    .filter({ visible: true })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  console.log(JSON.stringify({ profileDir, authenticatedComposerAvailable: true }, null, 2));
} catch (error) {
  const page = context.pages()[0];
  console.error(JSON.stringify({
    profileDir,
    finalUrl: page?.url() ?? "unavailable",
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
}
