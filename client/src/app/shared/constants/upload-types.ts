/** Single source of truth for document uploads. Keep in sync with server/src/common/multer.storage.ts. */
export const ALLOWED_UPLOAD_TYPES = '.pdf,.docx,.xlsx,.png,.jpg,.jpeg';

/** Types a browser can render in a tab; everything else is downloaded. */
export const PREVIEWABLE_EXTENSIONS = /\.(pdf|png|jpe?g)$/i;
