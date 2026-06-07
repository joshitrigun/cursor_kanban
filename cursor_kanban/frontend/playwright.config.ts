import * as os from "os";
import * as path from "path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === "1";
const webServerCommand =
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ??
  "npm run dev -- --hostname 127.0.0.1 --port 3000";

// Use the full Chrome for Testing binary when the headless shell isn't available.
// This happens on dev machines where `playwright install chromium` pulls the full
// Chrome rather than the headless shell build.
const chromeForTestingBin = path.join(
  os.homedir(),
  "Library/Caches/ms-playwright/chromium-1208/chrome-mac-arm64",
  "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
);
const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? chromeForTestingBin;

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: webServerCommand,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
    // Mobile projects — system Chrome with mobile viewport/UA.
    // channel:"chrome" avoids the headless-shell binary which isn't available on arm64 dev machines.
    {
      name: "mobile-iphone-se",
      use: {
        channel: "chrome",
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      },
    },
    {
      name: "mobile-iphone-12",
      use: {
        channel: "chrome",
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
      },
    },
    {
      name: "mobile-samsung-s23",
      use: {
        channel: "chrome",
        viewport: { width: 393, height: 851 },
        deviceScaleFactor: 2.75,
        isMobile: true,
        hasTouch: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      },
    },
  ],
});
