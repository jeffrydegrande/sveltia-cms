<script>
  import { FloatingActionButtonWrapper, Toolbar } from '@sveltia/ui';
  import { _, locale as appLocale } from 'svelte-i18n';
  import CarouselButton from '$lib/components/assets/toolbar/carousel-button.svelte';
  import CopyAssetsButton from '$lib/components/assets/toolbar/copy-assets-button.svelte';
  import DeleteAssetsButton from '$lib/components/assets/toolbar/delete-assets-button.svelte';
  import DownloadAssetsButton from '$lib/components/assets/toolbar/download-assets-button.svelte';
  import EditOptionsButton from '$lib/components/assets/toolbar/edit-options-button.svelte';
  import PreviewAssetButton from '$lib/components/assets/toolbar/preview-asset-button.svelte';
  import UploadAssetsButton from '$lib/components/assets/toolbar/upload-assets-button.svelte';
  import BackButton from '$lib/components/common/page-toolbar/back-button.svelte';
  import { goBack } from '$lib/services/app/navigation';
  import {
    canCreateAsset,
    focusedAsset,
    selectedAssetFolder,
    selectedAssets,
    targetAssetFolder,
  } from '$lib/services/assets';
  import { getFolderLabelByCollection, listedAssets } from '$lib/services/assets/view';
  import { isMediumScreen, isSmallScreen } from '$lib/services/user/env';

  const assets = $derived.by(() => {
    console.log('Primary toolbar assets derivation:', {
      selectedAssetsLength: $selectedAssets.length,
      focusedAsset: !!$focusedAsset,
      selectedAssetNames: $selectedAssets.map(a => a.name)
    });
    if ($selectedAssets.length) return $selectedAssets;
    if ($focusedAsset) return [$focusedAsset];
    return [];
  });

  const uploadDisabled = $derived(!canCreateAsset($targetAssetFolder));
</script>

<Toolbar variant="primary" aria-label={$_('folder')}>
  {#if $isSmallScreen}
    <BackButton
      aria-label={$_('back_to_asset_folder_list')}
      onclick={() => {
        goBack('/assets');
      }}
    />
  {/if}
  <h2 role="none">
    {#key $appLocale}
      {$selectedAssetFolder ? getFolderLabelByCollection($selectedAssetFolder) : ''}
    {/key}
    {#if !$isSmallScreen && $selectedAssetFolder?.internalPath !== undefined}
      <span role="none">/{$selectedAssetFolder.internalPath}</span>
    {/if}
  </h2>
  {#if !($isSmallScreen || $isMediumScreen)}
    <PreviewAssetButton asset={$focusedAsset} />
    <CarouselButton {assets} />
    <CopyAssetsButton {assets} />
    <DownloadAssetsButton {assets} />
    <DeleteAssetsButton
      {assets}
      buttonDescription={$_(
        assets.length === 1 ? 'delete_selected_asset' : 'delete_selected_assets',
      )}
      dialogDescription={$_(
        assets.length === 1
          ? 'confirm_deleting_selected_asset'
          : assets.length === $listedAssets.length
            ? 'confirm_deleting_all_assets'
            : 'confirm_deleting_selected_assets',
        { values: { count: assets.length } },
      )}
    />
    <EditOptionsButton asset={$focusedAsset} />
  {/if}
  <FloatingActionButtonWrapper>
    {#if !$isSmallScreen || ($listedAssets.length && !uploadDisabled)}
      <UploadAssetsButton label={$isSmallScreen ? undefined : $_('upload')} />
    {/if}
  </FloatingActionButtonWrapper>
</Toolbar>
