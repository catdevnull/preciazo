import { spawn } from "child_process";
import Cron from "croner";

if (process.env.NODE_ENV === "production") {
  const job = Cron("15 3 * * *", () => {
    runScraper();
  });
}

function runScraper() {
  spawn("bun", ["/bin/scraper", "auto"], { stdio: "inherit" });
}
