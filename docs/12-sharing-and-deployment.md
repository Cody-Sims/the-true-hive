# Sharing and CI/CD

Status: **administrator-only design/planning access implemented in the repository; live retirement and host transition require an authorized rollout**. The earlier public review publication policy is superseded. No infrastructure changes are implied by this document.

## Application access boundary

The public business site remains at `https://thetruehive.com/`. Inventory
(`/inventory/`), the studio (`/prototypes/`), raw Markdown (`/docs/`, `/README.md`,
`/CHANGELOG.md`) and dependent design assets use the same origin and server-side
administrator gate. Unlisted application routes are private by default; required
storefront APIs and exact login/enrollment/session/logout handlers have explicit
exceptions. First-party static assets and Astro's generated image optimizer
remain public for storefront rendering; private studio files never enter that
static/image pipeline. Database readiness is private; process-only liveness stays public.

Google identity alone is insufficient. Existing Firebase project/issuer,
verified email, TOTP, fresh sign-in, eight-hour session, active database
membership and revocation checks remain in force. A single host-only `__Host-`
session unlocks all workspaces and enables administrator navigation on the public
site. Logout/revocation applies everywhere. No Domain cookie or frontend-only
authorization is used. Private and personalized HTML responses are private,
no-store and vary by Cookie.

The studio and pinned Markdown parser are bundled only into the native server.
They are never copied to `dist-site/client/`. Direct file requests require the
same administrator session as the viewer. Validated relative private `returnTo`
paths preserve a requested workspace after login; absolute, sibling-host,
protocol-relative and encoded path aliases are rejected or use the safe default.

## Mandatory retirement of public Pages

**The currently deployed Pages site is not secured by editing this repository.**
Its workflow-based deployment uses `main`, source `/`, with
`preview.thetruehive.com` as the custom hostname. It previously published
prototype HTML, raw planning documents and assets without authentication.

`npm run build:pages` now creates only:

- `index.html`: a fixed redirect/link to `https://thetruehive.com/prototypes/`.
- `404.html`: the same harmless redirect for all historical deep paths.
- `.nojekyll` and a build marker containing no private source list.

The builder removes recognized old generated output before writing replacement
files and refuses symlink/unrecognized output directories. `npm run check:pages`
rejects extra files, private source metadata or noncanonical redirects.
`.github/workflows/pages.yml` deploys **only this replacement artifact**.
Historical document/asset requests therefore receive harmless fallback HTML or
404 after replacement, not a copy of the old source. Deep-link destination state
is intentionally not preserved by static Pages; administrators can navigate
within the authenticated studio. There is no static authentication mechanism.

Required authorized rollout:

1. Prepare the canonical native application and Firebase/domain configuration
   using [the operations runbook](14-development-and-operations.md#canonical-administrator-rollout).
2. Merge through required checks and explicitly verify successful deployment
   of the redirect-only Pages workflow on `main`. **This publication is mandatory
   to replace old unauthenticated files**, including direct `/docs/*.md`,
   `/README.md`, `/CHANGELOG.md`, `/prototypes/*.html`, module and asset URLs.
   If replacement cannot be completed promptly, an authorized operator must
   unpublish/disable Pages instead; do not leave the old artifact serving.
3. Check both the custom hostname and GitHub project-site URLs. Old paths must
   return only canonical redirect HTML or harmless 404, never document/design
   content. Existing browser/download/archive copies cannot be recalled.
4. Optionally move `preview` to the existing native app only after domain/quota
   approval. The app supports fixed-origin GET/HEAD legacy redirects; mutations
   are denied. Pages replacement/unpublication is still required: moving DNS
   alone does not remove the GitHub-hosted deployment.
5. If disabling/removing the Pages custom domain, coordinate Pages binding and
   the `preview` CNAME; never leave dangling DNS pointing at an unclaimed Pages
   domain. Preserve account-issued domain-verification TXT, MX/SPF and all
   unrelated records. Do not change repository visibility or email routing.

## Public GitHub source is a separate boundary

`Cody-Sims/the-true-hive` **is still a public repository**. Current source,
historical published documents, commits and any downloaded copies remain
publicly accessible through GitHub even after all application URLs require
administrator access. This change protects served application URLs, not source
confidentiality or previously disclosed information.

The owner must decide repository visibility separately before storing
confidential business material in Git. No visibility change, history scrub,
secret migration, paid service or live infrastructure change is authorized by
this implementation. Never commit credentials, private customer data or
confidential terms. Review future public commits accordingly.

## Local development and gates

`npm run dev` serves the native app on `http://127.0.0.1:4321`. Showcase mode
needs no database; private routes remain unavailable until the real isolated
Firebase/MFA/membership configuration is supplied. For enabled local admin use
development mode and the matching loopback `SITE_URL`; there is no bypass.
`npm run preview` on port 4173 serves only the redirect-only artifact.
Never serve the repository root or expose a local design-only preview helper.

Run `npm test`, `npm run check:links`, `npm run build:pages` and
`npm run check:pages` for studio/Pages changes. Native app gates include format,
Astro checking, site tests, native build/artifact inspection and browser tests.
Database tests require an isolated `true_hive_test` fixture. See the runbook for
the exact commands and separate provider/owner rehearsals.

Pull requests build/check without deployment; reviewed `main` updates and manual
main runs publish the replacement through the `github-pages` environment.
Only that deployment job has Pages-write/OIDC privileges. Official actions stay
pinned; build jobs retain read-only repository permissions.

## Recovery

Do not roll back to the old public-content Pages artifact or a native revision
that exposes private routes. Keep redirect-only Pages (or authorized
unpublication) during an application rollback. Disable administration if needed
while leaving the storefront/liveness available; do not restore inventory data
to undo an application change. Restore only reviewed application/configuration
state with the canonical access boundary intact.

Porkbun remains authoritative DNS. Apex/www already target the existing Render
service; previous preview CNAME setup and certificates were not changed by this
repository work. Email remains deferred; preserve existing mail/TXT records.

### Email is deferred, not configured

The planned future business address is **`contact@thetruehive.com`**. The owner's
instruction remains **no mail forwarding or mailbox setup now**. No alias,
hosted mailbox, billing purchase, SMTP credential or email-routing change is
included. DNS alone does not establish that a forwarding destination exists or
receives mail. Use the approved phone and configured social profiles instead.

When email becomes necessary, evaluate a real
[Porkbun hosted mailbox](https://kb.porkbun.com/article/24-how-to-set-up-email-hosting-services) or Google
Workspace if the Gmail web interface is required.
[Porkbun forwarding](https://kb.porkbun.com/article/10-how-to-set-up-email-forwarding-service)
describes inbound forwarding, not custom-domain outgoing mail. The previously
pasted free Gmail SMTP workaround is not the selected architecture:
[Google's announced changes](https://support.google.com/mail/answer/17101213?hl=en)
remove third-party Gmail "Send as" starting January 2027, while Google-hosted
Gmail/Workspace identities are distinguished in that guidance.

Choose sending/receiving ownership, retention and forwarding behavior before
activation. Keep destination inboxes, mailbox passwords, provider keys and
recovery details out of the public repository. Sending, receiving, SPF/DKIM/DMARC
and reply authentication require an actual end-to-end test, not just DNS records.
