import { decodeXML } from "entities";
export function getUrlsFromSitemap(xml: string) {
  let urls = new Set<string>();
  new HTMLRewriter()
    .on("loc", {
      text(element) {
        const txt = element.text.trim();
        if (!txt) return;
        urls.add(decodeXML(txt));
      },
    })
    .transform(new Response(xml));
  return Array.from(urls);
}
