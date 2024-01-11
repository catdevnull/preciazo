import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Supermercado, hosts, supermercados } from "db-datos/supermercado.js";
import PQueue from "p-queue";
import { formatDuration, intervalToDuration } from "date-fns";
import { db } from "db-datos/db.js";
import { like } from "drizzle-orm";
import { productoUrls } from "db-datos/schema.js";
import { scrapDiaProducts } from "../link-scrapers/dia.js";
import { scrapCotoProducts } from "../link-scrapers/coto.js";
import { scrapCarrefourProducts } from "../link-scrapers/carrefour.js";
import { scrapJumboProducts } from "../link-scrapers/jumbo.js";
import { readableStreamToText } from "bun";

// hacemos una cola para el scrapeo para no tener varios writers a la BD y no sobrecargar la CPU
const scrapQueue = new PQueue({ concurrency: 1 });

export async function auto() {
  const a = new Auto();
  await Promise.all(
    supermercados.filter((x) => x === "Dia").map((supr) => a.downloadList(supr))
  );
}

class Auto {
  telegramConfig?: { token: string; chatId: string };

  constructor() {
    if (!process.env.TELEGRAM_BOT_TOKEN)
      console.warn("no hay TELEGRAM_BOT_TOKEN, no voy a loggear por allá");
    else if (!process.env.TELEGRAM_BOT_CHAT_ID)
      console.warn("no hay TELEGRAM_BOT_CHAT_ID, no voy a loggear por allá");
    else
      this.telegramConfig = {
        token: process.env.TELEGRAM_BOT_TOKEN,
        chatId: process.env.TELEGRAM_BOT_CHAT_ID,
      };

    this.inform("[auto] Empezando scrap");
  }

  async scrapUrls(supermercado: Supermercado) {
    const t0 = performance.now();
    switch (supermercado) {
      case "Dia":
        await scrapDiaProducts();
        break;
      case "Coto":
        await scrapCotoProducts();
        break;
      case "Carrefour":
        await scrapCarrefourProducts();
        break;
      case "Jumbo":
        await scrapJumboProducts();
        break;
    }
    this.inform(
      `[scrapUrls[${supermercado}]] Tardó ${formatMs(performance.now() - t0)}`
    );
  }

  async downloadList(supermercado: Supermercado) {
    const ctxPath = await mkdtemp(join(tmpdir(), "preciazo-scraper-download-"));

    await scrapQueue.add(async () => {
      await this.scrapUrls(supermercado);
    });

    const listPath = join(ctxPath, `lista-${supermercado}.txt`);
    const host = Object.entries(hosts).find(
      ([host, supe]) => supe === supermercado
    )![0];
    const results = await db.query.productoUrls
      .findMany({
        where: like(productoUrls.url, `%${host}%`),
      })
      .execute();
    const urls = results.map((r) => r.url);
    await writeFile(listPath, urls.join("\n") + "\n");

    this.scrapAndInform({ listPath });
    // TODO: borrar archivos temporales
  }

  async scrapAndInform({ listPath }: { listPath: string }) {
    const res = await scrapQueue.add(async () => {
      const t0 = performance.now();

      const sub = Bun.spawn({
        cmd: ["scraper-rs", "fetch-list", listPath],
        stdio: ["ignore", "pipe", "inherit"],
      });
      const text = await readableStreamToText(sub.stdout);
      const code = await sub.exited;
      if (code !== 0) throw new Error(`scraper-rs threw ${code}`);

      return { took: performance.now() - t0, text };
    });

    if (res) {
      const { took, text } = res;
      this.inform(
        `Procesado ${listPath} (${text}) (tardó ${formatMs(took)})`
        //(${progress.done} ok, ${
        //   progress.skipped
        // } skipped, ${progress.errors.length} errores)
      );
    } else {
      this.inform(`Algo falló en ${listPath}`);
    }
  }

  inform(msg: string) {
    this.sendTelegramMsg(msg);
    console.info(msg);
  }
  report(msg: string) {
    this.inform(msg);
    const error = new Error(msg);

    return error;
  }

  async sendTelegramMsg(text: string) {
    if (!this.telegramConfig) return;
    const url = new URL(
      `https://api.telegram.org/bot${this.telegramConfig.token}/sendMessage`
    );
    url.searchParams.set("chat_id", this.telegramConfig.chatId);
    url.searchParams.set("text", text);
    await fetch(url);
  }
}

function formatMs(ms: number) {
  return formatDuration(intervalToDuration({ start: 0, end: Math.round(ms) }));
}
