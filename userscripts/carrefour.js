// @ts-check
(async () => {
  const getUrls = () => JSON.parse(localStorage.urls || "[]");

  function nextPage() {
    const btn = document.querySelector(
      'button[type="button"].pointer svg path[d="M11.7364 8.29314C11.7643 8.22117 11.81 8.15746 11.8693 8.10803C11.9286 8.05859 11.9994 8.02505 12.0752 8.01054C12.151 7.99604 12.2293 8.00106 12.3026 8.02513C12.376 8.0492 12.442 8.09153 12.4944 8.14814L19.7834 15.4161C19.923 15.5769 19.9999 15.7827 19.9999 15.9956C19.9999 16.2086 19.923 16.4143 19.7834 16.5751L12.4944 23.8551C12.4527 23.8998 12.4024 23.9356 12.3466 23.9605C12.2908 23.9854 12.2305 23.9989 12.1694 24.0001C12.0778 23.9955 11.9891 23.9661 11.9128 23.915C11.8365 23.864 11.7756 23.7931 11.7364 23.7101C11.6511 23.5504 11.616 23.3687 11.6356 23.1887C11.6552 23.0086 11.7287 22.8387 11.8464 22.7011L18.5574 16.0011L11.8464 9.29514C11.7279 9.15936 11.6538 8.99054 11.6342 8.8114C11.6145 8.63226 11.6502 8.45139 11.7364 8.29314Z"]'
    )?.parentElement?.parentElement?.parentElement;
    btn?.click();
    return !!btn;
  }

  const { h, render } = await import("https://esm.sh/preact");
  const { default: htm } = await import("https://esm.sh/htm");
  const { useState } = await import("https://esm.sh/preact/hooks");
  const html = htm.bind(h);

  function Dashboard() {
    const [autoNextPageInterval, setAutoNextPageInterval] = useState(null);

    function toggleAutoNextPageInterval() {
      if (autoNextPageInterval === null) {
        let lastRun = getProductUrlsInPage();
        nextPage();
        const i = setInterval(async () => {
          if (
            getProductUrlsInPage().filter((u) => lastRun.includes(u)).length ===
            0
          ) {
            saveProductUrlsInPage();
            lastRun = getProductUrlsInPage();
            if (!nextPage()) {
              clearInterval(i);
              setAutoNextPageInterval(null);
            }
          }
        }, 100);
        setAutoNextPageInterval(i);
      } else {
        clearInterval(autoNextPageInterval);
        setAutoNextPageInterval(null);
      }
    }

    return html`<div>
      <button onClick=${copyUrls}>copy urls</button>
      <button onClick=${toggleAutoNextPageInterval}>
        ${autoNextPageInterval === null ? "empezar autopage" : "parar autopage"}
      </button>
    </div>`;
  }

  const dashboardEl = document.createElement("div");
  // @ts-ignore
  dashboardEl.style = `
    position: fixed;
    bottom: 0; right: 0;
  `;
  render(html`<${Dashboard} />`, dashboardEl);
  document.body.appendChild(dashboardEl);

  function copyUrls() {
    navigator.clipboard.writeText(getUrls().join("\n"));
  }

  function getProductUrlsInPage() {
    return [...document.querySelectorAll(".vtex-product-summary-2-x-clearLink")]
      .map((el) => el instanceof HTMLAnchorElement && el.href)
      .filter(/** @returns {x is string} */ (x) => !!x);
  }
  function saveProductUrlsInPage() {
    const urlSet = new Set(getUrls());
    getProductUrlsInPage().forEach((url) => urlSet.add(url));
    localStorage.urls = JSON.stringify([...urlSet]);
  }

  const i = setInterval(() => {
    saveProductUrlsInPage();
  }, 500);
})();
