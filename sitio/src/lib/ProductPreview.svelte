<script lang="ts">
  export let product: { ean: string; name: string; imageUrl?: string | null };
</script>

<a href={`/ean/${product.ean}`} class="flex">
  {#if product.imageUrl}
    <img src={product.imageUrl} alt={product.name} class="max-h-48" />
  {/if}
  <p class="text-xl">{product.name}</p>
</a>
