import { zResource, type Resource } from "ckan/schemas";
import { z } from "zod";
import { listDirectory } from "./b2";
import { isSameDay } from "date-fns";
import { indexResources } from "./index-resources";

export async function generateMarkdown() {
  const resourcesIndex = await indexResources();

  const datasets = z
    .record(z.string(), z.array(zResource))
    .parse(resourcesIndex);
  const datasetsArray = Object.entries(datasets)
    .map(([date, resources]) => ({
      date: new Date(date),
      resources,
    }))
    .sort((a, b) => +b.date - +a.date);

  let latestResources = new Map<string, Resource & { firstSeenAt: Date }>();

  for (const { date, resources } of datasetsArray) {
    for (const resource of resources) {
      const id = `${resource.id}-revID-${resource.revision_id}`;
      const existing = latestResources.get(id);
      if (existing && existing.firstSeenAt < date) continue;
      latestResources.set(id, { ...resource, firstSeenAt: date });
    }
  }

  function getDate(resource: Resource) {
    {
      const matches = resource.name.match(/precios_(\d{4})(\d{2})(\d{2})/);
      if (matches) {
        return new Date(
          parseInt(matches[1]),
          parseInt(matches[2]) - 1,
          parseInt(matches[3])
        );
      }
    }
    {
      const matches = resource.description.match(
        /(?<day>\d{2})\/(?<month>\d{2})\/(?<year>\d{4})|(?<year2>\d{4})-(?<month2>\d{2})-(?<day2>\d{2})/
      );
      if (matches) {
        const { day, month, year, day2, month2, year2 } = matches.groups!;
        return new Date(
          parseInt(year || year2),
          parseInt(month || month2) - 1,
          parseInt(day || day2)
        );
      }
    }
    console.debug(resource);
    throw new Error(`No date found for ${resource.name}`);
  }

  const fileList = await listDirectory("");

  const zipResources = [...latestResources.values()].filter(
    (r) => r.format === "ZIP"
  );
  const dates = [
    ...new Set(
      zipResources.map((r) => getDate(r).toISOString().split("T")[0]).sort()
    ),
  ];

  // check if dates are missing in between min and max date
  const minDate = new Date(
    Math.min(...[...dates].map((d) => new Date(d).getTime()))
  );
  const maxDate = new Date(
    Math.max(...[...dates].map((d) => new Date(d).getTime()))
  );
  for (let d = minDate; d <= maxDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split("T")[0];
    if (!dates.includes(dateStr)) dates.push(dateStr);
  }
  dates.sort();

  function getWeekDay(searchIn: string) {
    if (/domingo/iu.test(searchIn)) return 0;
    if (/lunes/iu.test(searchIn)) return 1;
    if (/martes/iu.test(searchIn)) return 2;
    if (/mi[eé]rcoles/iu.test(searchIn)) return 3;
    if (/jueves/iu.test(searchIn)) return 4;
    if (/viernes/iu.test(searchIn)) return 5;
    if (/s[aá]bado/iu.test(searchIn)) return 6;
    return null;
  }
  function getWeekDayInResource(resource: Resource) {
    return getWeekDay(resource.description) ?? getWeekDay(resource.name);
  }

  let markdown = `# index de archivo de datasets de precios SEPA

esto esta automáticamente generado por sepa-index-gen dentro de preciazo.`;

  const formatter = Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const dateTimeFormatter = Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (const dateStr of dates) {
    const date = new Date(dateStr);
    markdown += `\n* ${formatter.format(date)}:`;
    const resourcesInDate = zipResources.filter((r) =>
      isSameDay(getDate(r), date)
    );
    if (!resourcesInDate.length) {
      markdown += " ❌ no tengo recursos para esta fecha";
    }
    for (const resource of resourcesInDate) {
      const id = `${resource.id}-revID-${resource.revision_id}`;
      const fileExists = fileList.find((file) => file.startsWith(id));
      const link =
        fileExists ??
        `https://f004.backblazeb2.com/file/precios-justos-datasets/${fileExists}`;
      let warnings = "";
      if (
        getWeekDayInResource(resource) &&
        date.getDay() !== getWeekDayInResource(resource)
      ) {
        warnings +=
          "⁉️⚠️ dia de semana incorrecto, puede haberse subido incorrectamente ";
      }
      markdown += `\n  * ${id} ${warnings} ${fileExists ? `[✅ descargar](${link})` : "❌"} (primera vez visto: ${dateTimeFormatter.format(resource.firstSeenAt)})`;
    }
  }

  return markdown;
}
