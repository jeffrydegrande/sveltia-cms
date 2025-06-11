<script>
  import { Alert, Button, Dialog, Toast } from '@sveltia/ui';
  import { _ } from 'svelte-i18n';
  import { getAssetDetails, getAssetPublicURL } from '$lib/services/assets';

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
  let showDialog = $state(false);
  let carouselCode = $state('');

  // Filter to only include image assets
  const imageAssets = $derived(assets.filter(asset => asset.kind === 'image'));
  const hasEnoughImages = $derived(imageAssets.length >= 2);

  /**
   * Generate carousel code from selected image assets.
   * @returns {Promise<string>} Generated carousel code.
   */
  const generateCarouselCode = async () => {
    const lines = ['{{< carousel >}}'];
    
    for (const asset of imageAssets) {
      const publicURL = getAssetPublicURL(asset, { pathOnly: true });
      if (publicURL) {
        lines.push(publicURL);
      }
    }
    
    lines.push('{{< /carousel >}}');
    return lines.join('\n');
  };

  /**
   * Handle carousel button click.
   */
  const handleCarouselClick = async () => {
    if (!hasEnoughImages) {
      toast.status = 'error';
      toast.text = $_('carousel_no_images');
      toast.show = true;
      return;
    }

    try {
      carouselCode = await generateCarouselCode();
      showDialog = true;
    } catch (error) {
      toast.status = 'error';
      toast.text = $_('carousel_generation_error');
      toast.show = true;
    }
  };

  /**
   * Copy carousel code to clipboard.
   */
  const copyCarouselCode = async () => {
    try {
      await navigator.clipboard.writeText(carouselCode);
      toast.status = 'success';
      toast.text = $_('carousel_code_copied');
      toast.show = true;
      showDialog = false;
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
    disabled={!hasEnoughImages}
    label={$_('carousel')}
    onclick={handleCarouselClick}
  />
{:else}
  <!-- Menu item version for overflow menus -->
  <button
    type="button"
    disabled={!hasEnoughImages}
    onclick={handleCarouselClick}
  >
    {$_('carousel')}
  </button>
{/if}

{#if showDialog}
  <Dialog
    title={$_('carousel_dialog_title')}
    onclose={() => { showDialog = false; }}
  >
    {#snippet contents()}
      <div class="carousel-code-container">
        <div class="code-block">
          <pre><code>{carouselCode}</code></pre>
        </div>
        <div class="copy-button-container">
          <Button
            variant="primary"
            label={$_('copy')}
            onclick={copyCarouselCode}
          />
        </div>
      </div>
    {/snippet}
  </Dialog>
{/if}

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

  .copy-button-container {
    display: flex;
    justify-content: flex-end;
  }
</style>