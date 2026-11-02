# Owner checklist: what I need from you

Reviewed **2026-11-01**. The inventory/admin and Stripe test-checkout code is implemented and published for review in [PR #5](https://github.com/Cody-Sims/the-true-hive/pull/5), but **inventory.thetruehive.com is not activated**. Check items only after they are actually completed or approved.

Start with account access and approvals. Technical setup and a controlled local/staging rehearsal follow; this is not a requirement to complete sign-in on an unactivated hostname.

**This repository is public.** Do not put passwords, keys, service-account JSON, database URLs, administrator emails/UIDs, authenticator secrets, recovery codes, private addresses or real stock records in this file, commits, chat or screenshots. Use provider secret settings or an approved private configuration workflow.

**Verified setup:** the separate Firebase project has Google sign-in and authenticator TOTP enabled on Spark, with SMS disabled and no paid upgrade. A private pre-migration database backup was successfully created and fully read without restoring it; both forward migrations and their checksums are verified. The separate inventory runtime role passes the application's permission checks and rolled-back denial probes; existing public-read access is preserved. Private local runtime configuration is stored securely. The owner privately chose one administrator identity, enrolled TOTP and completed a fresh MFA sign-in; the actual local workspace and private API are authorized. The owner also approved storing the runtime credentials on the existing Render service: all eight persisted settings were privately compared, the public database target matches, and hosted inventory/checkout remain disabled. No products, stock or orders were created during setup. Access-removal rehearsal, implementation merge/deployment, recovery rehearsal and Stripe setup remain pending.

The approved local admin uses the configured Neon database, not a throwaway stock sandbox: edits made there persist. Hosted inventory and checkout remain disabled. The already-authorized localhost OAuth domain was reused without adding or removing domains.

## 1. Account access and spending approval

- [ ] Be ready to sign in to the business-owned Firebase/Google Cloud, Stripe, Render, Neon and Porkbun accounts when configuration needs your authorization.
- [x] Make the **separate True Hive Firebase project** available and authorize its Google/TOTP setup. The project remains on Spark; do not reuse the personal site's project, credentials or admin permissions.
- [ ] Explicitly approve any future paid feature or upgrade before it is enabled. Authenticator TOTP is configured without enabling SMS or Blaze; free-plan quotas still apply.

**Your part:** account ownership, sign-in/2FA prompts and spending decisions. You do not need to share account passwords or write configuration code.

## 2. Administrator identity and authenticator

- [x] Choose which Google identity may administer inventory and arrange its Firebase UID provisioning privately. Ordinary Google sign-in does not grant inventory access.
- [x] After membership provisioning and provider setup, complete authenticator enrollment and a fresh Google + TOTP sign-in in the approved local inventory browser.
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

- [ ] Decide the acceptable data-loss/recovery window and who owns backups, restore checks and outage response.
- [ ] Agree who reviews uncertain payments/stock holds and how reconciliation will be run and monitored.
- [ ] Approve any separately billed backup or scheduling service before provisioning it.

**Completion:** a restore into a separate recovery target and the reconciliation procedure have been rehearsed. A manual script or provider history window alone is not a verified recovery/scheduling arrangement.

## 5. Real business inputs, before operational stock or sales

These inputs are not required just to review an empty private admin, but they are required before treating records as real inventory or making purchase promises.

- [ ] Supply approved product titles, descriptions, genuine SKUs/variants, unit definitions and USD prices, with appropriate label/claim/content approval.
- [ ] Supply genuine inventory locations, any explicitly approved public pickup label, and a counted opening balance by variant/location. Separate unavailable/allocated units and future forecasts; do not copy prototype stock or retail-sell already allocated future honey.
- [ ] Confirm pickup eligibility and operating arrangements without inadvertently publishing a home/apiary address.
- [ ] Before the public business-site launch, confirm approved photographs/copy, public phone and exact Facebook/Instagram destinations. These are not prerequisites for an empty private admin.

**Completion:** you review the entered records against actual products and counts. Confidential inputs stay out of public planning documents.

## 6. Release approval and hands-on rehearsal

- [x] Authorize publishing the implementation branch and this checklist through a PR. This permission does not authorize merging or activation.
- [ ] Review the PR and passing required CI, then explicitly approve merge and the intended deployment. The separately authorized database migration/role setup is complete; opening a PR alone does not deploy the inventory implementation.
- [ ] Participate in the admin/test-flow rehearsal: create/edit a draft, publish information, increase/reduce stock, retry an uncertain operation, complete a test checkout and record pickup. Confirm that payment commits stock once and pickup records physical departure once.
- [ ] After MFA, access-removal, sandbox and recovery gates pass, authorize adding **only inventory.thetruehive.com** to the existing Render service and its specific Porkbun DNS record. Review any domain-quota cost first.

**Completion:** valid HTTPS, denied anonymous/non-admin access, and your successful authorized admin journey are verified on the actual hostname. Robots/noindex settings supplement authorization; they do not protect private data themselves.

## Technical work I can help handle after authorization

Provider/application configuration, least-privilege SQL roles and migration, private membership provisioning, deployment/CI checks, webhook setup, sandbox/recovery checks, and the approved inventory-domain DNS/TLS work can be handled together with authorized access. You do not need to perform the SQL or DNS edits unaided.

Your essential contribution is **access, approvals, private identity/credential handling, real business facts and participation in the owner rehearsal**.

## Still deferred

Keep `INVENTORY_ENABLED=false` and `CHECKOUT_MODE=disabled` until the relevant activation gates pass. Do not enable paid upgrades automatically, accept live charges, repoint root/www, configure business email, enable shipping or add wildcard DNS.

Live selling needs a separate release decision and the remaining product, pickup, tax/privacy/refund and operational policies. The current checkout implementation is card-only **test mode**.

Full contracts and acceptance criteria: [inventory phase specification](15-inventory-admin-and-commerce.md). This checklist records required owner actions, not evidence that setup is already complete.
