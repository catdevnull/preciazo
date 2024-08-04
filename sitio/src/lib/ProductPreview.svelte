<script lang="ts" context="module">
  export type Product = {
    ean: string;
    name: string | null;
    image_url: string | null;
  };
</script>

<script lang="ts">
  export let product: Product;
</script>

<a href={`/ean/${product.ean}`} class="flex gap-2">
  {#if product.image_url}
    <img
      src={product.image_url}
      alt={product.name}
      class="max-h-48"
      loading="lazy"
    />
  {/if}
  <p class="text-xl">{product.name}</p>
</a>
