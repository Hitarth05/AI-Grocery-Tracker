-- ============================================================
-- Grocery Expiry Tracker — allow HEIC uploads
-- Migration 0006
--
-- 0005 narrowed the bucket to JPEG/PNG/WebP because Claude cannot read HEIC
-- and a stored-but-unreadable photo is worse than a rejected one. Extraction
-- runs on Gemini now, which reads HEIC and HEIF natively, so the restriction
-- costs iPhone uploads and buys nothing.
--
-- Uploads are downscaled to JPEG in the browser before they get here, so this
-- covers the paths that skip that: a browser that cannot decode HEIC to a
-- canvas (Chrome cannot), or a share-sheet upload.
--
-- Note this is Gemini's set, not the intersection. Switching ACTIVE_PROVIDER
-- back to Anthropic makes a stored HEIC unreadable — extraction degrades to
-- manual entry rather than failing, but the scan is wasted.
-- ============================================================

update storage.buckets
   set allowed_mime_types = array[
     'image/jpeg',
     'image/png',
     'image/webp',
     'image/heic',
     'image/heif'
   ]
 where id = 'item-photos';
