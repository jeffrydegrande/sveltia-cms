/* eslint-disable no-await-in-loop */

import { getBase64 } from '@sveltia/utils/file';
import { sleep } from '@sveltia/utils/misc';

/**
 * Generate a SHA256 hash of a string using the Web Crypto API
 * @param {string} message The message to hash
 * @returns {Promise<string>} Hex-encoded hash
 */
const sha256 = async (message) => {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Generate HMAC-SHA256 signature using Web Crypto API
 * @param {string | ArrayBuffer} key The key for HMAC
 * @param {string} message The message to sign
 * @returns {Promise<ArrayBuffer>} The HMAC signature
 */
const hmacSha256 = async (key, message) => {
  const encoder = new TextEncoder();
  let keyBuffer;

  if (typeof key === 'string') {
    keyBuffer = encoder.encode(key);
  } else {
    keyBuffer = key;
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
};

/**
 * Convert ArrayBuffer to hex string
 * @param {ArrayBuffer} buffer The buffer to convert
 * @returns {string} Hex string
 */
const bufferToHex = (buffer) => {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Generate AWS Signature V4 for Cloudflare R2 API requests.
 * This is a proper implementation that works for S3-compatible API operations.
 *
 * @param {object} options Options for signature generation
 * @param {string} options.method HTTP method (GET, PUT, POST, etc.)
 * @param {string} options.region AWS region (use 'auto' for R2)
 * @param {string} options.accessKeyId AWS access key ID
 * @param {string} options.secretAccessKey AWS secret access key
 * @param {string} options.accountId Account ID for R2
 * @param {string} options.bucket Bucket name
 * @param {string} options.path Path within the bucket (without leading slash)
 * @param {Record<string, string>} [options.headers={}] Request headers
 * @param {Record<string, string>} [options.queryParams={}] Query parameters
 * @param {string} [options.service='s3'] AWS service (use 's3' for R2)
 * @param {Date} [options.date=new Date()] Request date
 * @param {string} [options.payload=''] Request payload
 * @returns {Promise<{ url: string, headers: Record<string, string> }>} Object containing the signed URL and headers
 */
const getSignedRequest = async (options) => {
  const {
    method,
    region,
    accessKeyId,
    secretAccessKey,
    accountId,
    bucket,
    path = '',
    headers = {},
    queryParams = {},
    service = 's3',
    date = new Date(),
    payload = '',
  } = options;

  // Format date strings needed for the request
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Prepare the canonical request
  // For path-style addressing, the canonical URI includes the bucket name
  // For listing operations (when path is empty), we need to add a trailing slash
  const canonicalURI = path ? `/${bucket}/${path}` : `/${bucket}/`;

  // Sort and encode query parameters (AWS specific encoding)
  const canonicalQueryString = Object.keys(queryParams)
    .sort()
    .map((key) => {
      // AWS uses specific encoding rules
      const encodedKey = encodeURIComponent(key).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      const encodedValue = encodeURIComponent(queryParams[key]).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      return `${encodedKey}=${encodedValue}`;
    })
    .join('&');

  // Create payload hash
  const payloadHash = await sha256(payload);

  // Add required headers
  /** @type {Record<string, string>} */
  const allHeaders = {
    host: `${accountId}.r2.cloudflarestorage.com`,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    ...headers,
  };

  // Build the canonical headers string (AWS specific formatting)
  const canonicalHeaders = Object.keys(allHeaders)
    .sort()
    .map((key) => {
      // AWS requires specific header formatting: lowercase key, single space after colon, trimmed value
      const lowerKey = key.toLowerCase();
      const trimmedValue = allHeaders[key].toString().trim().replace(/\s+/g, ' ');
      return `${lowerKey}:${trimmedValue}\n`;
    })
    .join('');

  // Create a list of signed headers
  const signedHeaders = Object.keys(allHeaders)
    .sort()
    .map((key) => key.toLowerCase())
    .join(';');

  // Combine all parts to create the canonical request
  const canonicalRequest = [
    method,
    canonicalURI,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  // Create a string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = await sha256(canonicalRequest);
  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Debug logging for signature calculation
  console.log('=== AWS Signature V4 Debug ===');
  console.log('Date:', amzDate);
  console.log('Region:', region);
  console.log('Canonical URI:', canonicalURI);
  console.log('Canonical Query String:', canonicalQueryString);
  console.log('Canonical Headers:', canonicalHeaders);
  console.log('Signed Headers:', signedHeaders);
  console.log('Payload Hash:', payloadHash);
  console.log('Canonical Request:', canonicalRequest);
  console.log('String to Sign:', stringToSign);
  console.log('Credential Scope:', credentialScope);

  // Create the signature
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  const kSigning = await hmacSha256(kService, 'aws4_request');
  const signature = bufferToHex(await hmacSha256(kSigning, stringToSign));

  // Build the authorization header
  const authorization = [
    `${algorithm} Credential=${accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(', ');

  // Construct the final URL using path-style addressing
  let url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  if (path) {
    url += `/${path}`;
  } else {
    // For listing operations, add trailing slash
    url += '/';
  }
  if (canonicalQueryString) {
    url += `?${canonicalQueryString}`;
  }

  // Filter out headers that browsers set automatically or that cause CORS issues
  const filteredHeaders = Object.fromEntries(
    Object.entries({
      ...allHeaders,
      Authorization: authorization,
    }).filter(
      ([key]) =>
        // Keep only the headers that are needed for authentication and won't cause CORS issues
        !['host'].includes(key.toLowerCase()),
    ),
  );

  // Return the signed request details
  return {
    url,
    headers: filteredHeaders,
  };
};

/**
 * @import { ExternalAsset, MediaLibraryService } from '$lib/types/private';
 */

/**
 * Initialize the R2 service.
 * @returns {Promise<boolean>} Whether the service is configured properly.
 */
const init = async () => {
  // R2 service initialization can be performed here if needed
  // For now, returning true as configuration is done through API keys
  return true;
};

/**
 * Generate authenticated upload details for R2.
 *
 * @param {string} apiKey Combined credentials in format "accountId:accessKeyId:accessKeySecret:bucketName:bucketRegion:customDomain".
 * @param {string} fileName Name of the file to upload.
 * @param {string} contentType MIME type of the file.
 * @param {object} [settings] Optional R2 media library settings.
 * @param {boolean} [settings.publicPath=true] Whether to use a public URL path.
 * @param {string} [settings.customDomain] Custom domain to use for URLs.
 * @param {string} [settings.pathPrefix=''] Prefix to add to uploaded files.
 * @returns {Promise<{uploadURL: string, publicURL: string, headers: Record<string, string>}>} Upload details.
 */
const generateUploadURL = async (apiKey, fileName, contentType, settings = {}) => {
  try {
    const [
      accountId,
      accessKeyId,
      accessKeySecret,
      bucketName,
      bucketRegion = 'auto',
      configCustomDomain = '',
    ] = apiKey.split(':');

    if (!accountId || !accessKeyId || !accessKeySecret || !bucketName) {
      throw new Error('Invalid API key format');
    }

    // Settings with defaults
    const {
      publicPath = true,
      customDomain = configCustomDomain || '',
      pathPrefix = '',
    } = settings;

    // Prepare the file path with optional prefix
    const filePath = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/${fileName}` : fileName;

    // Get signed request for authenticated upload
    const signedRequest = await getSignedRequest({
      method: 'PUT',
      region: bucketRegion,
      accessKeyId,
      secretAccessKey: accessKeySecret,
      accountId,
      bucket: bucketName,
      path: filePath,
      headers: {
        'Content-Type': contentType,
      },
    });

    // The public URL for accessing the file (use custom domain if provided)
    const baseUrl = customDomain || `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const publicURL = publicPath ? `${baseUrl}/${filePath}` : filePath;

    return {
      uploadURL: signedRequest.url,
      publicURL,
      headers: signedRequest.headers,
    };
  } catch (error) {
    console.error('Error generating upload URL:', error);
    throw error;
  }
};

/**
 * Upload a file to R2 using authenticated request.
 *
 * @param {string} uploadURL Signed URL for uploading.
 * @param {File} file File to upload.
 * @param {Record<string, string>} headers Authentication headers.
 * @returns {Promise<void>} Promise that resolves when upload is complete.
 */
const uploadFile = async (uploadURL, file, headers) => {
  try {
    console.log('Uploading file to:', uploadURL);
    console.log('Upload headers:', headers);

    // Prepare headers for the request, ensuring CORS compatibility
    const requestHeaders = {
      ...headers,
      // Don't override Content-Type if it's already in the signed headers
      ...(headers['Content-Type'] ? {} : { 'Content-Type': file.type }),
    };

    // Remove any headers that might cause CORS preflight issues
    // The Authorization header is already included in the signed headers
    delete requestHeaders['Host']; // Browser will set this automatically

    console.log('Final request headers:', requestHeaders);

    // Make a PUT request with the signed headers
    const response = await fetch(uploadURL, {
      method: 'PUT',
      body: file,
      headers: requestHeaders,
      mode: 'cors', // Explicitly set CORS mode
      credentials: 'omit', // Don't send credentials as R2 uses signature auth
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('Upload response:', response.status, response.statusText, errorText);
      console.error('Response headers:', [...response.headers.entries()]);
      throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
    }

    console.log('File uploaded successfully');
    return;
  } catch (error) {
    console.error('Error uploading file:', error);
    if (error.message && error.message.includes('CORS')) {
      console.error('CORS Error Details:');
      console.error(
        '- Make sure your R2 bucket has CORS configured to allow requests from localhost:1313',
      );
      console.error('- The CORS configuration should allow PUT method and the required headers');
      console.error('- Check Cloudflare R2 dashboard > Your Bucket > Settings > CORS policy');
    }
    throw error;
  }
};

/**
 * Search files in the R2 bucket.
 * @param {string} query Search query.
 * @param {object} options Options.
 * @param {string} [options.kind] Asset kind.
 * @param {string} options.apiKey Combined credentials in format "accountId:accessKeyId:accessKeySecret:bucketName:bucketRegion:customDomain".
 * @param {object} [options.settings] Optional R2 media library settings.
 * @param {boolean} [options.settings.publicPath=true] Whether to use a public URL path.
 * @param {string} [options.settings.customDomain] Custom domain to use for URLs.
 * @param {string} [options.settings.pathPrefix=''] Prefix to add to uploaded files.
 * @param {string} [options.userName] Unused for R2, kept for compatibility.
 * @param {string} [options.password] Unused for R2, kept for compatibility.
 * @returns {Promise<ExternalAsset[]>} Assets.
 */
const search = async (query, { kind = 'image', apiKey, settings = {}, userName, password }) => {
  if (!apiKey) {
    return Promise.reject(new Error('API key is required'));
  }

  try {
    const [
      accountId,
      accessKeyId,
      accessKeySecret,
      bucketName,
      bucketRegion = 'auto',
      configCustomDomain = '',
    ] = apiKey.split(':');

    if (!accountId || !accessKeyId || !accessKeySecret || !bucketName) {
      return Promise.reject(new Error('Invalid API key format'));
    }

    // Settings with defaults - merge configuration settings with provided settings
    const {
      publicPath = true,
      customDomain = configCustomDomain || '',
      pathPrefix = '',
    } = settings;

    // Simple prefix filtering for R2 objects
    const searchPrefix = query ? query.toLowerCase() : '';

    // Apply path prefix if any
    const prefixPath = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/` : '';

    // Build the correct base URL - use custom domain if provided, otherwise use public R2 domain
    const baseUrl = customDomain
      ? customDomain.replace(/\/$/, '')
      : `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;

    // Try to list objects from the bucket
    // For R2 buckets with custom domains, we need to try different approaches
    try {
      let listUrl;
      let response;

      // Use proper AWS Signature V4 authentication for listing objects
      console.log('Attempting authenticated S3 API request for listing objects...');

      // Prepare query parameters for listing
      /** @type {Record<string, string>} */
      const listQueryParams = {
        'list-type': '2',
      };

      // Add prefix parameter if needed
      if (prefixPath) {
        listQueryParams.prefix = prefixPath;
      }

      // Use authenticated request for listing (most R2 buckets require this)
      console.log('Making authenticated S3 list request...');
      
      const region = bucketRegion === 'auto' ? 'us-east-1' : bucketRegion;

      const signedRequest = await getSignedRequest({
        method: 'GET',
        region: region,
        accessKeyId,
        secretAccessKey: accessKeySecret,
        accountId,
        bucket: bucketName,
        path: '', // Use root path for listing
        queryParams: listQueryParams,
      });

      console.log('Making authenticated request to:', signedRequest.url);
      console.log('Request headers:', signedRequest.headers);
      console.log('Account ID:', accountId);
      console.log('Bucket Name:', bucketName);
      console.log('Access Key ID:', accessKeyId);
      console.log('Region:', region);

      response = await fetch(signedRequest.url, {
        method: 'GET',
        headers: {
          ...signedRequest.headers,
        },
        mode: 'cors',
        credentials: 'omit',
      });

      console.log('Response status:', response.status);
      console.log('Response headers:', [...response.headers.entries()]);

      if (response.ok) {
        console.log('Successfully listed objects');

        // Use the custom domain for URLs if specified, otherwise use the base URL
        const urlBase = customDomain || baseUrl;
        return processListResponse(response, urlBase, prefixPath, searchPrefix);
      } else {
        console.warn('Listing failed:', response.status, response.statusText);

        // Log response body for debugging
        try {
          const errorText = await response.text();
          console.error('Error response body:', errorText);
        } catch (e) {
          console.error('Could not read error response body');
        }

        console.error('Cannot list objects from R2 bucket. This might be because:');
        console.error('1. The bucket is private and requires authenticated requests');
        console.error('2. The bucket does not exist or the domain is incorrect');
        console.error('3. CORS is not properly configured on the bucket');
        console.error('4. The S3 API is not enabled on the bucket');
        console.error('5. Custom domain buckets often require authentication for listing');
        console.error('Bucket URL attempted:', listUrl);
        console.error('');
        console.error('WORKAROUND: You can still upload files even if listing fails.');
        console.error('The upload functionality will work independently of listing.');

        // Return an empty array to show "No files found" but allow uploads
        return [];
      }
    } catch (error) {
      console.error('Error listing objects from R2:', error);

      // Return empty array instead of throwing to prevent UI breaks
      return [];
    }
  } catch (error) {
    console.error('Error in R2 search:', error);
    return Promise.reject(error);
  }
};

/**
 * @import { AssetKind } from '$lib/types/private';
 */

/**
 * Process an XML response from an S3/R2 list objects request
 *
 * @param {Response} response The fetch response
 * @param {string} baseUrl The base URL for objects
 * @param {string} prefixPath The current prefix path
 * @param {string} searchPrefix The search prefix to filter results
 * @returns {Promise<ExternalAsset[]>} Parsed assets
 */
const processListResponse = async (response, baseUrl, prefixPath, searchPrefix) => {
  try {
    // Parse the XML response
    const text = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'application/xml');

    // Extract object keys
    const contents = Array.from(xmlDoc.getElementsByTagName('Contents'));
    const prefixes = Array.from(xmlDoc.getElementsByTagName('CommonPrefixes'));

    /** @type {ExternalAsset[]} */
    const assets = [];

    // Process files
    contents.forEach((content) => {
      const key = content.getElementsByTagName('Key')[0]?.textContent;
      const size = parseInt(content.getElementsByTagName('Size')[0]?.textContent || '0', 10);
      const lastModified = new Date(
        content.getElementsByTagName('LastModified')[0]?.textContent || '',
      );

      if (key) {
        // Skip directory markers (empty files ending with /)
        if (key.endsWith('/') && size === 0) {
          return;
        }

        // Extract filename (remove the prefix)
        const fileName = key.replace(prefixPath, '');

        // Skip if we're filtering by prefix and the filename doesn't match
        if (searchPrefix && !fileName.toLowerCase().includes(searchPrefix)) {
          return;
        }

        // Determine file kind based on extension
        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        /** @type {AssetKind} */
        let fileKind = 'other';

        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension)) {
          fileKind = 'image';
        } else if (['mp4', 'webm', 'mov'].includes(extension)) {
          fileKind = 'video';
        } else if (['mp3', 'wav', 'ogg'].includes(extension)) {
          fileKind = 'audio';
        } else if (['pdf', 'doc', 'docx', 'txt'].includes(extension)) {
          fileKind = 'document';
        }

        assets.push({
          id: key,
          description: fileName,
          previewURL: fileKind === 'image' ? `${baseUrl}/${key}` : '',
          downloadURL: `${baseUrl}/${key}`,
          fileName,
          kind: fileKind,
          lastModified,
          size,
        });
      }
    });

    // Process directories (CommonPrefixes)
    prefixes.forEach((prefix) => {
      const prefixPath = prefix.getElementsByTagName('Prefix')[0]?.textContent;

      if (prefixPath) {
        // Extract directory name from the prefix
        // For example, if prefixPath is "images/animals/" and the current prefix is "images/",
        // we want to extract "animals" as the directory name
        const dirName = prefixPath.split('/').filter(Boolean).pop();

        assets.push({
          id: prefixPath,
          description: `${dirName}/`,
          previewURL: '', // No preview for directories
          downloadURL: '', // No download for directories
          fileName: `${dirName}/`,
          kind: 'document', // Use document for directories
          lastModified: new Date(),
          size: 0,
        });
      }
    });

    return assets;
  } catch (error) {
    console.error('Error processing list response:', error);
    return [];
  }
};

/**
 * Upload files to R2.
 * @param {File[]} files Files to upload.
 * @param {object} options Options.
 * @param {string} options.apiKey Combined credentials in format "accountId:accessKeyId:accessKeySecret:bucketName:bucketRegion:customDomain".
 * @param {object} [options.settings] Optional R2 media library settings.
 * @param {boolean} [options.settings.publicPath=true] Whether to use a public URL path.
 * @param {string} [options.settings.customDomain] Custom domain to use for URLs.
 * @param {string} [options.settings.pathPrefix=''] Prefix to add to uploaded files.
 * @returns {Promise<ExternalAsset[]>} Uploaded assets.
 */
const upload = async (files, { apiKey, settings = {} }) => {
  if (!apiKey) {
    return Promise.reject(new Error('API key is required'));
  }

  try {
    const [
      accountId,
      accessKeyId,
      accessKeySecret,
      bucketName,
      bucketRegion = 'auto',
      configCustomDomain = '',
    ] = apiKey.split(':');

    if (!accountId || !accessKeyId || !accessKeySecret || !bucketName) {
      return Promise.reject(new Error('Invalid API key format'));
    }

    // Settings with defaults
    const {
      publicPath = true,
      customDomain = configCustomDomain || '',
      pathPrefix = '',
    } = settings;

    const baseUrl = customDomain || `https://${bucketName}.${accountId}.r2.cloudflarestorage.com`;
    const uploadedAssets = [];

    // Process each file
    for (const file of files) {
      const fileName = file.name;
      const contentType = file.type;

      // Generate authenticated upload details
      const { uploadURL, publicURL, headers } = await generateUploadURL(
        apiKey,
        fileName,
        contentType,
        settings,
      );

      // Upload the file with authentication
      await uploadFile(uploadURL, file, headers);

      // Apply path prefix if any
      const prefixPath = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/` : '';
      const fullFileName = `${prefixPath}${fileName}`;

      // Create an asset entry for the uploaded file
      /** @type {AssetKind} */
      const kind = contentType.startsWith('image/')
        ? 'image'
        : contentType.startsWith('video/')
          ? 'video'
          : contentType.startsWith('audio/')
            ? 'audio'
            : contentType.includes('pdf')
              ? 'document'
              : 'other';

      const asset = {
        id: fileName,
        description: fileName,
        previewURL: publicURL,
        downloadURL: publicURL,
        fileName: fullFileName,
        kind,
        lastModified: new Date(),
        size: file.size,
      };

      uploadedAssets.push(asset);
    }

    return uploadedAssets;
  } catch (error) {
    console.error('Error uploading to R2:', error);
    return Promise.reject(error);
  }
};

/**
 * @type {MediaLibraryService}
 */
export default {
  serviceType: 'cloud_storage',
  serviceId: 'r2',
  serviceLabel: 'Cloudflare R2',
  serviceURL: 'https://www.cloudflare.com/products/r2/',
  showServiceLink: true,
  hotlinking: false,
  authType: 'api_key',
  developerURL: 'https://developers.cloudflare.com/r2/',
  apiKeyURL: 'https://dash.cloudflare.com/?to=/:account/r2/overview',
  apiKeyPattern: /^[^:]+:[^:]+:[^:]+:[^:]+(?::[^:]*)?(?::[^:]*)?$/,
  apiKeyHelp:
    'Enter credentials in format: accountId:accessKeyId:accessKeySecret:bucketName[:bucketRegion][:customDomain]. For public R2 buckets, use your-bucket-name.r2.cloudflare.com as customDomain. Make sure your bucket has proper CORS configuration to allow uploads from this domain.',
  init,
  search,
  upload,
};
