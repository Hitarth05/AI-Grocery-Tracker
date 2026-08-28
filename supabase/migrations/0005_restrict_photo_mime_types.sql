-- ============================================================
-- Grocery Expiry Tracker — restrict item photo MIME types
-- Migration 0005
--
-- 0002 allowed image/heic and image/heif on the item-photos bucket, which is
-- reasonable for a phone-first app: iOS shoots HEIC. But no vision model in
-- the extraction path accepts it — Claude takes JPEG, PNG, GIF, and WebP only.
-- A HEIC upload therefore stored fine and then produced a photo nothing could
-- read: the item still gets added by hand, but the scan is silently wasted and
-- the extractions row records a failure that looks like a hard photo rather
-- than an unsupported format.
--
-- In practice iOS Safari transcodes HEIC to JPEG when a file is submitted
-- through a file input, so the capture flow rarely produces one. This closes
-- the paths that bypass that — a share-sheet upload, a desktop browser, or a
-- direct API call.
--
-- Revisit if the app ever transcodes HEIC server-side; then the bucket can
-- accept it again because something in the pipeline can read it.
-- ============================================================

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'item-photos';
