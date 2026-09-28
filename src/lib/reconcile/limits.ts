/** Per-file cap on the uncompressed CSV. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
/** Per-file cap on data rows. */
export const MAX_ROWS = 50_000;
/**
 * Vercel caps a function request body at 4.5 MB, so the client gzips each
 * CSV before upload and the combined compressed payload must stay below this.
 * Keep in sync with experimental.serverActions.bodySizeLimit in next.config.ts.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
