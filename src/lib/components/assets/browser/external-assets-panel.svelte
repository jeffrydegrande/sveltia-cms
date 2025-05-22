<!--
  @component
  Implement a panel that allows searching media files from an external media library and selecting
  one for an image/file entry field.
-->
<script>
  import {
    Button,
    EmptyState,
    Icon,
    InfiniteScroll,
    Option,
    PasswordInput,
    TextInput,
  } from '@sveltia/ui';
  import { sleep } from '@sveltia/utils/misc';
  import DOMPurify from 'isomorphic-dompurify';
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import SimpleImageGrid from '$lib/components/assets/browser/simple-image-grid.svelte';
  import AssetPreview from '$lib/components/assets/shared/asset-preview.svelte';
  import { selectAssetsView } from '$lib/services/contents/draft/editor';
  import { isSmallScreen } from '$lib/services/user/env';
  import { prefs } from '$lib/services/user/prefs';
  import { getMediaLibraryOptions } from '$lib/services/assets/media-library';

  /**
   * @import {
   * AssetKind,
   * ExternalAsset,
   * MediaLibraryService,
   * SelectedResource,
   * } from '$lib/types/private';
   */

  /**
   * @typedef {object} Props
   * @property {AssetKind} [kind] Asset kind.
   * @property {string} [searchTerms] Search terms for filtering assets.
   * @property {MediaLibraryService} serviceProps Media library service details.
   * @property {string} [gridId] The `id` attribute of the inner listbox.
   * @property {(resource: SelectedResource) => void} [onSelect] Custom `Select` event handler.
   */

  /** @type {Props} */
  let {
    /* eslint-disable prefer-const */
    kind = 'image',
    searchTerms = '',
    serviceProps,
    gridId = undefined,
    onSelect = undefined,
    /* eslint-enable prefer-const */
  } = $props();

  const {
    serviceType = 'stock_assets',
    serviceId = '',
    serviceLabel = '',
    hotlinking = false,
    authType = 'api_key',
    developerURL = '',
    apiKeyURL = '',
    apiKeyPattern,
    init,
    signIn,
    search,
    upload,
  } = $derived(serviceProps);

  // Get media library settings from configuration
  const mediaLibrarySettings = $derived(() => {
    if (serviceType === 'cloud_storage') {
      const options = getMediaLibraryOptions({ libraryName: serviceId });
      // R2 settings are under 'settings' property, not 'config'
      return options?.settings || {};
    }
    return {};
  });

  const input = $state({ userName: '', password: '' });
  let hasConfig = $state(true);
  let hasAuthInfo = $state(false);
  let apiKey = $state('');
  let userName = $state('');
  let password = $state('');
  /** @type {'initial' | 'requested' | 'success' | 'error'} */
  let authState = $state('initial');
  /** @type {ExternalAsset[] | null} */
  let searchResults = $state(null);
  /** @type {string | undefined} */
  let error = $state();

  let debounceTimer = 0;

  /**
   * Search assets.
   * @param {string} [query] Search query.
   */
  const searchAssets = async (query = '') => {
    searchResults = null;

    try {
      searchResults = await search(query, {
        kind,
        apiKey,
        userName,
        password,
        settings: mediaLibrarySettings(),
      });
    } catch (/** @type {any} */ ex) {
      error = 'search_fetch_failed';
      // eslint-disable-next-line no-console
      console.error(ex);
    }
  };

  /**
   * Download the selected asset, if needed, and notify the file and credit. If hotlinking is
   * required by the service, just notify the URL instead of downloading the file.
   * @param {ExternalAsset} asset Selected asset.
   * @todo Support video files.
   */
  const selectAsset = async (asset) => {
    const { downloadURL, fileName, credit } = asset;

    if (hotlinking) {
      onSelect?.({ url: downloadURL, credit });

      return;
    }

    try {
      const response = await fetch(downloadURL);
      const { ok, status } = response;

      if (!ok) {
        throw new Error(`The response returned with HTTP status ${status}.`);
      }

      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type });

      onSelect?.({ file, credit });
    } catch (/** @type {any} */ ex) {
      error = 'image_fetch_failed';
      // eslint-disable-next-line no-console
      console.error(ex);
    }
  };

  onMount(() => {
    (async () => {
      if (typeof init === 'function') {
        hasConfig = false;
        hasConfig = await init();
      }

      if (!hasConfig) {
        return;
      }

      apiKey = $prefs.apiKeys?.[serviceId] ?? '';
      [userName, password] = ($prefs.logins?.[serviceId] ?? '').split(' ');
      hasAuthInfo = !!apiKey || !!password;
      searchResults = null;

      if (hasAuthInfo) {
        searchAssets();
      }
    })();
  });

  $effect(() => {
    void [searchTerms];
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      if (hasAuthInfo) {
        searchAssets(searchTerms);
      }
    }, 1000);
  });
</script>

{#if hasAuthInfo}
  {#if error}
    <EmptyState>
      <span role="alert">{$_(`assets_dialog.error.${error}`)}</span>
    </EmptyState>
  {:else if !searchResults}
    <EmptyState>
      <span role="alert">{$_('searching')}</span>
    </EmptyState>
  {:else if !searchResults.length}
    <EmptyState>
      <div role="none" class="empty-state-container">
        <span role="alert">{$_('no_files_found')}</span>

        {#if serviceType === 'cloud_storage'}
          <Button
            variant="primary"
            label={$_('upload_assets')}
            onclick={() => {
              // Create a file input element
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.multiple = true;

              // Handle file selection
              fileInput.onchange = async (event) => {
                if (!event.target || !('files' in event.target)) return;

                const inputElement = /** @type {HTMLInputElement} */ (event.target);
                const files = Array.from(inputElement.files || []);

                if (files.length > 0 && serviceProps.upload) {
                  try {
                    // Upload the files
                    const result = await serviceProps.upload(files, {
                      apiKey,
                      settings: mediaLibrarySettings(),
                    });
                    console.log('Upload successful:', result);
                    // Refresh the search results
                    searchAssets();
                  } catch (err) {
                    console.error('Upload failed:', err);
                    if (
                      err.message &&
                      (err.message.includes('CORS') || err.message.includes('Access to fetch'))
                    ) {
                      error = 'cors_error';
                      console.error(
                        'CORS Error: Make sure your R2 bucket has CORS configured for localhost:1313',
                      );
                    } else {
                      error = 'upload_failed';
                    }
                  }
                }
              };

              // Trigger file selection dialog
              fileInput.click();
            }}
          >
            {#snippet startIcon()}
              <Icon name="cloud_upload" />
            {/snippet}
          </Button>
        {/if}
      </div>
    </EmptyState>
  {:else}
    <div role="none" class="grid-with-toolbar">
      {#if serviceType === 'cloud_storage'}
        <div role="none" class="toolbar">
          <Button
            variant="primary"
            label={$_('upload_assets')}
            onclick={() => {
              // Create a file input element
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.multiple = true;

              // Handle file selection
              fileInput.onchange = async (event) => {
                if (!event.target || !('files' in event.target)) return;

                const inputElement = /** @type {HTMLInputElement} */ (event.target);
                const files = Array.from(inputElement.files || []);

                if (files.length > 0 && serviceProps.upload) {
                  try {
                    // Upload the files
                    const result = await serviceProps.upload(files, {
                      apiKey,
                      settings: mediaLibrarySettings(),
                    });
                    console.log('Upload successful:', result);
                    // Refresh the search results
                    searchAssets();
                  } catch (err) {
                    console.error('Upload failed:', err);
                    if (
                      err.message &&
                      (err.message.includes('CORS') || err.message.includes('Access to fetch'))
                    ) {
                      error = 'cors_error';
                      console.error(
                        'CORS Error: Make sure your R2 bucket has CORS configured for localhost:1313',
                      );
                    } else {
                      error = 'upload_failed';
                    }
                  }
                }
              };

              // Trigger file selection dialog
              fileInput.click();
            }}
          >
            {#snippet startIcon()}
              <Icon name="cloud_upload" />
            {/snippet}
          </Button>
        </div>
      {/if}

      <SimpleImageGrid
        {gridId}
        viewType={$selectAssetsView?.type}
        onChange={({ value }) => {
          const asset = searchResults?.find(({ id }) => id === value);

          if (asset) {
            selectAsset(asset);
          }
        }}
      >
        <InfiniteScroll items={searchResults} itemKey="id">
          {#snippet renderItem(/** @type {ExternalAsset} */ asset)}
            {#await sleep() then}
              {@const { id, previewURL, description, kind: _kind } = asset}
              <Option label="" value={id}>
                {#snippet checkIcon()}
                  <!-- Remove check icon -->
                {/snippet}
                <AssetPreview
                  kind={_kind}
                  src={previewURL}
                  variant="tile"
                  crossorigin="anonymous"
                />
                {#if !$isSmallScreen || $selectAssetsView?.type === 'list'}
                  <span role="none" class="name">{description}</span>
                {/if}
              </Option>
            {/await}
          {/snippet}
        </InfiniteScroll>
      </SimpleImageGrid>
    </div>
  {/if}
{:else if hasConfig}
  <EmptyState>
    <p role="alert">
      {#if serviceType === 'stock_assets'}
        {@html DOMPurify.sanitize(
          $_('prefs.media.stock_photos.description', {
            values: {
              service: serviceLabel,
              homeHref: `href="${developerURL}"`,
              apiKeyHref: `href="${apiKeyURL}"`,
            },
          }),
          { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href', 'target', 'rel'] },
        )}
      {/if}
      {#if serviceType === 'cloud_storage'}
        {@html DOMPurify.sanitize(
          $_(`cloud_storage.auth.${authState}`, {
            values: {
              service: serviceLabel,
            },
          }),
          { ALLOWED_TAGS: ['a'], ALLOWED_ATTR: ['href', 'target', 'rel'] },
        )}
      {/if}
    </p>
    {#if authType === 'api_key'}
      <div role="none" class="input-outer">
        <TextInput
          flex
          spellcheck="false"
          aria-label={$_('prefs.media.stock_photos.field_label', {
            values: { service: serviceLabel },
          })}
          oninput={(event) => {
            const _value = /** @type {HTMLInputElement} */ (event.target).value.trim();

            if (apiKeyPattern?.test(_value)) {
              apiKey = _value;
              hasAuthInfo = true;
              $prefs.apiKeys ??= {};
              $prefs.apiKeys[serviceId] = apiKey;
              searchAssets();
            }
          }}
        />
      </div>
    {/if}
    {#if authType === 'password'}
      <div role="none" class="input-outer">
        <TextInput
          flex
          spellcheck="false"
          aria-label={$_('user_name')}
          disabled={authState === 'requested'}
          bind:value={input.userName}
        />
      </div>
      <div role="none" class="input-outer">
        <PasswordInput
          aria-label={$_('password')}
          disabled={authState === 'requested'}
          bind:value={input.password}
        />
      </div>
      <div role="none" class="input-outer">
        <Button
          variant="secondary"
          label={$_('sign_in')}
          disabled={!input.userName || !input.password || authState === 'requested'}
          onclick={async () => {
            authState = 'requested';
            input.userName = input.userName.trim();
            input.password = input.password.trim();

            if (await signIn?.(input.userName, input.password)) {
              authState = 'success';
              userName = input.userName;
              password = input.password;
              hasAuthInfo = true;
              $prefs.logins ??= {};
              $prefs.logins[serviceId] = [userName, password].join(' ');
              searchAssets();
            } else {
              authState = 'error';
            }
          }}
        />
      </div>
    {/if}
  </EmptyState>
{:else}
  <EmptyState>
    <span role="alert">{$_('cloud_storage.invalid')}</span>
  </EmptyState>
{/if}

<style lang="scss">
  p {
    margin: 0 0 8px;
  }

  .input-outer {
    width: 400px;
    max-width: 100%;
    text-align: center;
  }

  .empty-state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .grid-with-toolbar {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .toolbar {
    padding: 8px;
    border-bottom: 1px solid var(--sui-border-color);
    display: flex;
    justify-content: flex-end;
  }
</style>
