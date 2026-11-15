# Product photos: architecture and operations

Status: **owner-approved implementation; activation requires the rollout gates below**.
The owner approved metered image storage and reuse of the website's existing
Google Cloud storage project on 2026-11-14.

## Scope and separation

One primary image belongs to a saved product. Save a draft first, then open
**Add or replace product photo**. Photo editing has its own page so an upload
cannot silently discard unsaved product details. Existing illustration choices
remain the fallback.

Use the existing billed **storage project**, a new private True Hive bucket and
a dedicated True Hive service account. Do not copy the personal website's
bucket or key. Its existing objects, permissions and application configuration
are unchanged. Project administrators retain their normal project-wide authority.
The separate True Hive Firebase Auth project keeps its current plan and identity
configuration; image storage does not require adding a bucket to that project.

The bucket uses Oregon `us-west1`, Standard storage, uniform bucket-level access
and public access prevention. There is no Rapid Cache, hierarchical namespace,
cross-bucket replication, customer-managed encryption key or new compute service.
Grant the dedicated principal `roles/storage.objectUser` on **this bucket only**,
not Storage Admin/Editor/Owner at project level.

## Image processing

Accept JPEG, PNG and WebP files up to **8 MiB**, with at most **25 million decoded
pixels**. Reject SVG, GIF, HEIC, unsupported formats, animated/multipage files,
corrupt images and excessive bodies/fields. Export HEIC to JPEG before uploading.
Checks inspect actual bytes/decoder results, not just filenames or MIME labels.

The native Node transport allows 8 MiB plus 64 KiB of multipart overhead.
Photo readers enforce the file and form limits separately; existing JSON and
webhook readers retain their smaller bounds. Authentication precedes reading
upload bodies.

The server honors orientation, resizes inside 2048 by 2048 without enlargement,
produces WebP up to 4 MiB, and strips metadata including GPS. It does not apply
the travel site's saturation/brightness enhancement. Alt text is editable,
required and bounded to 300 characters.

Normalization/upload concurrency is bounded separately from FIFO image
downloads. Normal parallel collection-image requests must not compete for the
single rejecting upload slot.

## Configuration and migration

These are server settings, never browser variables or committed values:

| Variable | Meaning |
|---|---|
| `PRODUCT_IMAGES_ENABLED` | Exact `true`/`false`; default false |
| `PRODUCT_IMAGES_PROJECT_ID` | Existing storage project, not necessarily Firebase Auth's project |
| `PRODUCT_IMAGES_BUCKET` | New isolated private bucket |
| `PRODUCT_IMAGES_SERVICE_ACCOUNT_JSON` | Dedicated storage principal's JSON key, matching the storage project |

There is no ADC or personal-site credential fallback. Keep the key and private
runtime files mode 600 and Git-excluded. Configure only the intended existing
True Hive service; never overwrite unrelated private settings.

Forward migration `003_product_photos.sql` adds nullable, shape-constrained
product metadata and audited photo action names. It does not seed products or
modify stock, variants, held units, commitments, orders or applied migrations.
Back up current data first, apply the existing migration CLI using the private
direct owner connection, and verify both runtime roles can read the new column.
Apply it **before deploying** readers that require `photo`.

The original 001/002 checksums remain immutable, as does 003 once applied.
Schema corrections require another forward migration. A website rollback is
not permission to restore old business data or remove migration history.

## API and privacy boundary

| Route | Behavior |
|---|---|
| `POST /api/admin/products/:key/photo` | Authenticated multipart `operationId`, `expectedRevision`, `alt`, `file` |
| `DELETE /api/admin/products/:key/photo` | Authenticated JSON `operationId`, `expectedRevision`; clear current reference |
| `GET /api/admin/products/:key/photo` | Authenticated current image, no-store/noindex |
| `GET /media/products/:id` | Current published active product image only, and only in public database-catalog mode |

Private handlers require trusted Google/TOTP/member/session locals before body
or pool access; existing exact-origin/CSRF middleware still guards mutations.
Private pages/APIs are not available on storefront/default hosts.

The browser uses first-party proxies, not public GCS URLs, signed capabilities
or bucket names. Draft, concept, unlinked, removed and replaced image IDs do not
become public through the media route. Public eligibility is checked before
storage access. Public images use short caching; previously public images can
remain in browser/intermediary caches briefly, and downloaded copies cannot be
revoked.

Local file previews use blob images only on the private photo-editor page under
the production CSP. This must not broaden public-site image/script policy.
Changing login sessions also changes CSRF state: retry recovery must fetch fresh
authenticated CSRF metadata without changing the retained photo operation.

## Retry and audit semantics

Upload intents retain the original File, UUID, description and expected
revision across lost responses and retryable failures. A multipart boundary
can change; the semantic request fingerprint must not.

Objects have randomized operation UUID names and create-only generation
preconditions. Matching trusted fingerprints can recover an uploaded object
after a lost response. Changed actor/product/file/description/revision under the
same UUID is rejected, never overwritten.

Attaching or clearing a reference increments the product revision and appends
one immutable operation receipt in a transaction. No product/stock row lock is
held during GCS transfer. An audit failure rolls back the reference/revision.
Original confirmed receipts are distinct from refreshed current state.
Revision conflicts require explicit review before a new intent.

Removing/replacing a reference does **not** physically delete prior objects.
Unlinked or uncertain uploads stay private. Never delete an object after an
uncertain commit: it may be attached. Retention/cleanup needs an operator policy
and current-reference checks; do not invent a lifecycle that deletes live photos.

## Rollout and evidence

1. Verify native schema/permission, image validation, retry/audit, production CSP,
   session/CSRF recovery, parallel downloads and public-eligibility regressions.
2. Verify a fresh private pre-migration archive is readable; apply 003 and check
   both runtime roles. Listing an archive is not a full recovery rehearsal.
3. Provision the private bucket and scoped principal in the verified existing
   storage project. Keep the new key private, not in ordinary browser downloads.
4. Perform a temporary **unlinked** normalized-image GCS roundtrip; verify
   anonymous object access is denied and remove only that probe. Do not seed
   fake products/stock or assign synthetic images to real products.
5. Privately persist/compare the four settings. Release checked source through
   the protected PR/main pipeline and verify the actual photo editor.
6. Keep public showcase and disabled checkout unchanged. A real catalog release
   remains separate; private photos do not replace the showcase automatically.

Google's [storage pricing](https://cloud.google.com/storage/pricing) and
[shared free-tier limits](https://cloud.google.com/free/docs/free-cloud-features#cloud-storage)
apply. Budgets/alerts are not hard spending caps. Firebase's
[Storage billing requirements](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024)
apply if storage is put in a Firebase project; this rollout reuses the already
billed website storage project instead of upgrading True Hive Auth.
