import { spawn } from "child_process";
import { CronJob } from "cron";

if (process.env.NODE_ENV === "production") {
  const job = CronJob.from({
    cronTime: "0 3 * * *",
    onTick: function () {
      runScraper();
    },
    start: true,
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

function runScraper() {
  spawn("bun", ["/bin/scraper", "auto"], { stdio: "inherit" });
}
