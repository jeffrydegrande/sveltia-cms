<script>
  import { Alert, Button, Dialog, Toast } from '@sveltia/ui';
  import { _ } from 'svelte-i18n';
  import { getAssetPublicURL, selectedAssets, focusedAsset } from '$lib/services/assets';

  /**
   * @import { Asset } from '$lib/types/private';
   */

  /**
   * @typedef {object} Props
   * @property {Asset[]} [assets] Selected assets.
   * @property {boolean} [useButton] Whether to use the Button component.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    assets = [],
    useButton = true,
    /* eslint-enable prefer-const */
  } = $props();

  /** @type {{ show: boolean, text: string, status: 'success' | 'error' }} */
  const toast = $state({ show: false, text: '', status: 'success' });
  let dialogOpen = $state(false);

  // Access stores directly to avoid reactivity timing issues
  const currentAssets = $derived.by(() => {
    return $selectedAssets.length ? $selectedAssets : ($focusedAsset ? [$focusedAsset] : []);
  });

  const imageAssets = $derived.by(() => {
    const filtered = currentAssets.filter(asset => asset.kind === 'image');
    console.log('Filtering assets:', {
      input: currentAssets.map(a => ({ name: a.name, kind: a.kind })),
      output: filtered.map(a => ({ name: a.name, kind: a.kind }))
    });
    return filtered;
  });
  const hasImages = $derived(imageAssets.length > 0);

  // Debug logging to see what's happening
  $effect(() => {
    console.log('Carousel Debug (direct stores):', {
      selectedAssetsLength: $selectedAssets.length,
      focusedAsset: !!$focusedAsset,
      totalAssets: currentAssets.length,
      imageAssets: imageAssets.length,
      assetNames: currentAssets.map(a => a.name),
      assetKinds: currentAssets.map(a => ({ name: a.name, kind: a.kind })),
      hasImages
    });
  });
  
  // Make carousel code reactive to current selection
  const carouselCode = $derived.by(() => {
    // Get fresh assets to avoid timing issues
    const freshAssets = $selectedAssets.length ? $selectedAssets : ($focusedAsset ? [$focusedAsset] : []);
    const freshImageAssets = freshAssets.filter(asset => asset.kind === 'image');
    
    console.log('Generating carousel code for:', freshImageAssets.map(a => a.name));
    if (freshImageAssets.length === 0) return '';
    
    const lines = ['{{< carousel >}}'];
    
    // eslint-disable-next-line no-restricted-syntax
    for (const asset of freshImageAssets) {
      const publicURL = getAssetPublicURL(asset, { pathOnly: true });
      console.log('Asset:', asset.name, 'URL:', publicURL);

      if (publicURL) {
        lines.push(publicURL);
      }
    }
    
    lines.push('{{< /carousel >}}');
    console.log('Final carousel code:', lines.join('\n'));
    return lines.join('\n');
  });

  /**
   * Handle carousel button click.
   */
  const handleCarouselClick = () => {
    if (!hasImages) {
      toast.status = 'error';
      toast.text = $_('carousel_no_images');
      toast.show = true;
      return;
    }

    dialogOpen = true;
  };

  /**
   * Copy carousel code to clipboard.
   */
  const copyCarouselCode = async () => {
    if (!carouselCode) {
      toast.status = 'error';
      toast.text = $_('carousel_generation_error');
      toast.show = true;
      return;
    }

    try {
      await navigator.clipboard.writeText(carouselCode);
      toast.status = 'success';
      toast.text = $_('carousel_code_copied');
      toast.show = true;
      dialogOpen = false;
    } catch (error) {
      toast.status = 'error';
      toast.text = $_('clipboard_error');
      toast.show = true;
    }
  };
</script>

{#if useButton}
  <Button
    variant="ghost"
    disabled={!hasImages}
    label={$_('carousel')}
    onclick={handleCarouselClick}
  />
{:else}
  <!-- Menu item version for overflow menus -->
  <button
    type="button"
    disabled={!hasImages}
    onclick={handleCarouselClick}
  >
    {$_('carousel')}
  </button>
{/if}

<Dialog
  title={$_('carousel_dialog_title')}
  bind:open={dialogOpen}
  onOk={copyCarouselCode}
  okLabel={$_('copy')}
>
  <div class="carousel-code-container">
    <div class="code-block">
      <pre><code>{carouselCode}</code></pre>
    </div>
  </div>
</Dialog>

<Toast bind:show={toast.show}>
  <Alert status={toast.status}>{toast.text}</Alert>
</Toast>

<style>
  .carousel-code-container {
    min-width: 400px;
  }

  .code-block {
    background-color: var(--sui-secondary-background-color);
    border: 1px solid var(--sui-secondary-border-color);
    border-radius: 4px;
    padding: 16px;
    margin-bottom: 16px;
    font-family: var(--sui-font-family-mono);
    font-size: 14px;
    line-height: 1.4;
    overflow-x: auto;
  }

  .code-block pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>