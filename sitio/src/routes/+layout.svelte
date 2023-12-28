<script lang="ts">
  import "../app.pcss";

  import type { PageData } from "./$types";

  export let data: PageData;
</script>

<!-- https://flowbite.com/docs/forms/search-input/ -->
<form method="GET" action="/search">
  <div class="flex items-stretch p-4">
    <input
      type="search"
      name="q"
      class="block w-full rounded-l-lg border border-s-2 border-gray-300 border-s-gray-50 bg-gray-50 p-2.5 text-sm text-gray-900 focus:border-blue-500 focus:ring-blue-500 dark:border-gray-600 dark:border-s-gray-700 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400 dark:focus:border-blue-500"
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
  </div>
</form>

<slot />
