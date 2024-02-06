<script lang="ts" context="module">
  export type Product = { ean: string; name: string; imageUrl: string | null };
</script>

<script lang="ts">
  export let product: Product;
</script>

<a href={`/ean/${product.ean}`} class="flex gap-2">
  {#if product.imageUrl}
    <img
      src={product.imageUrl}
      alt={product.name}
      class="max-h-48"
      loading="lazy"
    />
  {/if}
  <p class="text-xl">{product.name}</p>
</a>
