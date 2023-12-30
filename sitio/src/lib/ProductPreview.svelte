<script lang="ts">
  export let product: { ean: string; name: string; imageUrl: string };
</script>

<a href={`/ean/${product.ean}`} class="flex">
  <img src={product.imageUrl} alt={product.name} class="max-h-48" />
  <p class="text-xl">{product.name}</p>
</a>
