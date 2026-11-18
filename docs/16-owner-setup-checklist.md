# Owner checklist: what I need from you

Reviewed **2026-11-14**. The inventory/admin and Stripe test-checkout implementation merged through [PR #5](https://github.com/Cody-Sims/the-true-hive/pull/5). The separately approved **https://inventory.thetruehive.com/** is now enabled for private catalog preparation using the existing Google/TOTP admin; checkout remains disabled. The owner-approved redesign from [PR #6](https://github.com/Cody-Sims/the-true-hive/pull/6) is hosted at **https://thetruehive.com/** with verified HTTPS and a `www` redirect. Check items only after they are actually completed or approved.

Start with account access and approvals. Technical setup and a controlled local/staging rehearsal follow; this is not a requirement to complete sign-in on an unactivated hostname.

**Canonical-access transition:** the inventory-host checks below record the
earlier rollout. New repository code places inventory, planning and design
access on `https://thetruehive.com` with one existing administrator session.
Complete the [canonical rollout](14-development-and-operations.md#canonical-administrator-rollout),
including Firebase apex authorization, optional obsolete-origin cleanup, one new apex
sign-in and mandatory replacement/unpublication of old public Pages. Do not mark
these live steps complete from repository tests. The public GitHub source/history
remains public unless the owner separately changes repository visibility.

**This repository is public.** Do not put passwords, keys, service-account JSON, database URLs, administrator emails/UIDs, authenticator secrets, recovery codes, private addresses or real stock records in this file, commits, chat or screenshots. Use provider secret settings or an approved private configuration workflow.

**Verified setup:** the separate Firebase project has Google sign-in and
authenticator TOTP enabled on Spark, with SMS disabled and no paid upgrade.
Both migrations/checksums and least-privilege runtime permissions are verified.
The owner previously chose an administrator privately, enrolled TOTP and
completed local MFA/workspace access. All eight original Render settings were
privately compared and public/private database targets match.

The subsequent inventory-only rollout verified current administrator membership,
Google/TOTP enrollment, Firebase's authorized hostname, production startup
preflight, hosted login-client initialization and anonymous/forged-session/
wrong-host denial. A fresh mode-600 ignored pre-activation database archive
was created and fully listed, not restored. No products, stock or orders were
seeded. New-host owner sign-in and operating access-removal/recovery/Stripe
rehearsals remain separate.

The local and hosted private admin use the configured Neon database, not a throwaway stock sandbox: edits persist. Hosted inventory preparation is enabled; checkout remains disabled and the public shop remains showcase. The already-authorized localhost OAuth domain was preserved.

## 1. Account access and spending approval

- [ ] Be ready to sign in to the business-owned Firebase/Google Cloud, Stripe, Render, Neon and Porkbun accounts when configuration needs your authorization.
- [x] Make the **separate True Hive Firebase project** available and authorize its Google/TOTP setup. The project remains on Spark; do not reuse the personal site's project, credentials or admin permissions.
- [ ] Explicitly approve any future paid feature or upgrade before it is enabled. Authenticator TOTP is configured without enabling SMS or Blaze; free-plan quotas still apply.

**Your part:** account ownership, sign-in/2FA prompts and spending decisions. You do not need to share account passwords or write configuration code.

## 2. Administrator identity and authenticator

- [x] Choose which Google identity may administer inventory and arrange its Firebase UID provisioning privately. Ordinary Google sign-in does not grant inventory access.
- [x] After membership provisioning and provider setup, complete authenticator enrollment and a fresh Google + TOTP sign-in in the approved local inventory browser.
- [ ] Complete normal Google + authenticator sign-in on the new hosted inventory hostname and confirm the workspace. Its HTTPS/login/access boundaries are verified, but automation has not completed this human sign-in.
- [ ] Complete the sign-out/access-removal rehearsal; a successful MFA sign-in alone does not verify revocation behavior.
- [ ] Keep recovery information privately and agree who can revoke access if the account/device is compromised.

**Completion:** your authorized identity passes app-enforced MFA; an ordinary signed-in identity is denied; sign-out/access removal prevents subsequent private requests. Google-account 2FA alone does not replace the application's TOTP requirement.

## 3. Private configuration and Stripe sandbox access

- [x] Authorize private setup of the isolated Firebase web configuration and server service-account credential.
- [x] Authorize the existing empty Neon database's backup, forward migration and separate least-privilege inventory login. These are completed, with public-read credentials preserved and private local runtime configuration verified.
- [x] Complete private runtime secret configuration on the intended Render service. Persisted values are verified, with hosted inventory and checkout disabled. Saving requested a rebuild of the existing showcase service; this is not publication or deployment of the inventory implementation.
- [ ] Make the Stripe account available in **test mode only**, with private test API/webhook credentials. No live keys or real charges.

You can provide authorized console access instead of manually collecting/configuring every value. The technical configuration list is in [development and operations](14-development-and-operations.md#private-runtime-and-operator-configuration); actual values must never go into this checklist.

**Completion:** configuration is supplied privately, public/read and inventory/write credentials target the same database/branch, and the test webhook is set up on the storefront/staging origin. Test purchases use an isolated sandbox, not operational physical stock.

## 4. Recovery and reconciliation ownership

**Verified technical rehearsal:** the private pre-migration archive was restored into a new isolated local database; its original migration checksum, empty business records and application of the forward admin migration were verified. No Neon restore/rollback was performed. This empty-backup rehearsal does not prove recovery of future operational records or current administrator/session state, nor establish a recovery window or schedule.

- [ ] Decide the acceptable data-loss/recovery window and who owns backups, restore checks and outage response.
- [ ] Agree who reviews uncertain payments/stock holds and how reconciliation will be run and monitored.
- [ ] Approve any separately billed backup or scheduling service before provisioning it.

**Completion:** a restore into a separate recovery target and the reconciliation procedure have been rehearsed. A manual script or provider history window alone is not a verified recovery/scheduling arrangement.

## 5. Real business inputs, before operational stock or sales

These inputs are not required just to review an empty private admin, but they are required before treating records as real inventory or making purchase promises.

- [ ] Supply approved product titles, descriptions, genuine SKUs/variants, unit definitions and USD prices, with appropriate label/claim/content approval.
- [ ] Supply genuine inventory locations, any explicitly approved public pickup label, and a counted opening balance by variant/location. Separate unavailable/allocated units and future forecasts; do not copy prototype stock or retail-sell already allocated future honey.
- [ ] Confirm pickup eligibility and operating arrangements without inadvertently publishing a home/apiary address.
- [ ] Supply real photographs/new factual claims, public phone and exact Facebook/Instagram destinations before replacing the approved showcase's illustrations, neutral copy and honest pending-contact states. These remain required for operational sales, not for the approved showcase release.

**Completion:** you review the entered records against actual products and counts. Confidential inputs stay out of public planning documents.

## 6. Release approval and hands-on rehearsal

- [x] Authorize publishing the implementation branch and this checklist through a PR. This permission does not authorize merging or activation.
- [x] Authorize fixing PR findings and merging after required CI, with the existing service's deployment keeping inventory and checkout disabled. Inventory-domain activation is still separate; the merge must not bypass review fixes or checks.
- [x] Approve the redesigned public showcase and apex/www hosting; verify the merged release, actual HTTPS, redirects, public assets and preservation of mail/preview DNS.
- [ ] Participate in the admin/test-flow rehearsal: create/edit a draft, publish information, increase/reduce stock, retry an uncertain operation, complete a test checkout and record pickup. Confirm that payment commits stock once and pickup records physical departure once.
- [x] Authorize inventory-only catalog preparation, add its exact hostname/DNS/TLS to the existing service and verify access boundaries while checkout/public database mode remain off. Live usage confirmed this uses the remaining included domain slot, without a new charge or plan upgrade.

**Completion:** valid HTTPS, denied anonymous/non-admin access, and your successful authorized admin journey are verified on the actual hostname. Robots/noindex settings supplement authorization; they do not protect private data themselves.

## Technical work I can help handle after authorization

Provider/application configuration, least-privilege SQL roles and migration, private membership provisioning, deployment/CI checks, webhook setup, sandbox/recovery checks, and the approved inventory-domain DNS/TLS work can be handled together with authorized access. You do not need to perform the SQL or DNS edits unaided.

Your essential contribution is **access, approvals, private identity/credential handling, real business facts and participation in the owner rehearsal**.

## Still deferred

Inventory-only preparation now uses `INVENTORY_ENABLED=true`; keep `CHECKOUT_MODE=disabled` and public showcase mode until their separate gates pass. Do not enable paid upgrades automatically, accept live charges, alter approved root/www/mail/preview routing, configure business email, enable shipping or add wildcard DNS.

Live selling needs a separate release decision and the remaining product, pickup, tax/privacy/refund and operational policies. The current checkout implementation is card-only **test mode**.

Full contracts and acceptance criteria: [inventory phase specification](15-inventory-admin-and-commerce.md). This checklist records required owner actions, not evidence that setup is already complete.
