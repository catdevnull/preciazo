<script lang="ts">
  import "../app.pcss";

  import type { PageData } from "./$types";

  export let data: PageData;
</script>

<div
  class="relative m-4 rounded-lg border border-yellow-300 bg-yellow-50 p-4 text-yellow-800"
>
  <div class="text-sm opacity-80">
    <strong>¡Ey!</strong> Preciazo todavía está en beta, y todavía estamos
    buscando su lugar en el mundo :) Si notas algún problema,
    <a class="underline" href="mailto:preciazo@nulo.ar">contactame :)</a>
  </div>
</div>

<!-- https://flowbite.com/docs/forms/search-input/ -->
<form class="mx-4 my-4 flex items-stretch" method="GET" action="/search">
  <input
    type="search"
    name="q"
    class="block w-full rounded-l-lg border border-gray-300 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500"
    placeholder={`Buscar entre ${data.nProductos} productos`}
    required
  />
  <button
    type="submit"
    class="block rounded-e-lg border border-blue-700 bg-blue-700 p-2.5 text-sm font-medium text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
  >
    <svg
      class="h-4 w-4"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 20 20"
    >
      <path
        stroke="currentColor"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"
      />
    </svg>
    <span class="sr-only">Search</span>
  </button>
</form>

<slot />
