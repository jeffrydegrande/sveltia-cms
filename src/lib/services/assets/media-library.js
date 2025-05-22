import { isObject } from '@sveltia/utils/object';
import { get } from 'svelte/store';
import { siteConfig } from '$lib/services/config';
import { allStockAssetProviders } from '$lib/services/integrations/media-libraries';
import {
  optimizeSVG,
  rasterImageConversionFormats,
  rasterImageExtensionRegex,
  rasterImageFormats,
  transformImage,
} from '$lib/services/utils/media/image';

/**
 * @import {
 * DefaultMediaLibraryConfig,
 * FileField,
 * FileTransformations,
 * ImageField,
 * MediaLibraryName,
 * RasterImageTransformationOptions,
 * StockAssetMediaLibrary,
 * StockAssetProviderName,
 * } from '$lib/types/public';
 */

/**
 * Get any media library options. Support both new and legacy options at the field level and global.
 * @param {object} [options] Options.
 * @param {MediaLibraryName} [options.libraryName] Library name.
 * @param {FileField | ImageField} [options.fieldConfig] Field configuration.
 * @returns {Record<string, any>} Options.
 */
export const getMediaLibraryOptions = ({ libraryName = 'default', fieldConfig } = {}) => {
  const _siteConfig = get(siteConfig);

  return (
    fieldConfig?.media_libraries?.[libraryName] ??
    (fieldConfig?.media_library?.name === libraryName ||
    _siteConfig?.media_library?.name === libraryName
      ? fieldConfig?.media_library
      : undefined) ??
    _siteConfig?.media_libraries?.[libraryName] ??
    (_siteConfig?.media_library?.name === libraryName ? _siteConfig.media_library : undefined) ??
    {}
  );
};

/**
 * Get normalized default media library options.
 * @param {object} [options] Options.
 * @param {FileField | ImageField} [options.fieldConfig] Field configuration.
 * @returns {{ config: DefaultMediaLibraryConfig }} Options.
 */
export const getDefaultMediaLibraryOptions = ({ fieldConfig } = {}) => {
  const options = getMediaLibraryOptions({ fieldConfig });

  /** @type {DefaultMediaLibraryConfig} */
  const { max_file_size: maxSize, transformations } =
    typeof options === 'boolean' ? {} : (options?.config ?? {});

  return {
    config: {
      max_file_size: typeof maxSize === 'number' && Number.isInteger(maxSize) ? maxSize : Infinity,
      transformations: isObject(transformations) ? transformations : undefined,
    },
  };
};

/**
 * Get normalized stock photo/video media library options.
 * @param {object} [options] Options.
 * @param {FileField | ImageField} [options.fieldConfig] Field configuration.
 * @returns {StockAssetMediaLibrary} Options.
 */
export const getStockAssetMediaLibraryOptions = ({ fieldConfig } = {}) => {
  const options = getMediaLibraryOptions({ libraryName: 'stock_assets', fieldConfig });

  const allProviderNames = /** @type {StockAssetProviderName[]} */ (
    Object.keys(allStockAssetProviders)
  );

  const { providers } = options;

  return {
    providers: Array.isArray(providers) ? providers : allProviderNames,
  };
};

/**
 * Process the given file by applying a transformation if available.
 * @param {File} file Original file.
 * @param {FileTransformations} transformations File transformation options.
 * @returns {Promise<File>} Transformed file, or the original file if no transformation is applied.
 * @todo Move the `transformation` option validation to config parser.
 */
export const transformFile = async (file, transformations) => {
  const [type, subType] = file.type.split('/');

  // Process raster image
  if (type === 'image' && subType !== 'svg+xml') {
    /** @type {RasterImageTransformationOptions | undefined} */
    let transformation;

    if (subType in transformations) {
      transformation = /** @type {Record<string, any>} */ (transformations)[subType];
    } else if (
      'raster_image' in transformations &&
      /** @type {string[]} */ (rasterImageFormats).includes(subType)
    ) {
      transformation = transformations.raster_image;
    }

    if (transformation) {
      const { format, quality, width, height } = transformation;
      const newFormat = format && rasterImageConversionFormats.includes(format) ? format : 'webp';

      const blob = await transformImage(file, {
        format: newFormat,
        quality: quality && Number.isSafeInteger(quality) ? quality : 85,
        width: width && Number.isSafeInteger(width) ? width : undefined,
        height: height && Number.isSafeInteger(height) ? height : undefined,
      });

      const newFileName =
        blob.type === `image/${newFormat}`
          ? rasterImageExtensionRegex.test(file.name)
            ? file.name.replace(rasterImageExtensionRegex, newFormat)
            : file.name.concat(newFormat)
          : // Failed to transform
            file.name;

      return new File([blob], newFileName, { type: blob.type });
    }
  }

  // Process SVG image
  if (type === 'image' && subType === 'svg+xml' && transformations.svg?.optimize) {
    return new File([await optimizeSVG(file)], file.name, { type: file.type });
  }

  return file;
};
