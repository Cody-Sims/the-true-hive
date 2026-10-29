# Sharing and CI/CD

Status: **owner-approved public design/planning preview**, not the production business website.

## Publication decision

On **2026-10-28**, the owner explicitly approved publishing the complete current planning hub and selected **Cody-Sims/the-true-hive** as a public source repository. The existing top-level business context may therefore appear in this review snapshot.

This does **not** authorize publishing credentials, customer records, buyer identity, confidential agreement terms or private financial information. Future additions require review before a public commit. Everything committed to a public repository is public even if the Pages build excludes it.

| Destination | Purpose |
|---|---|
| [Repository](https://github.com/Cody-Sims/the-true-hive) | Approved source, issues, pull requests and workflow history |
| [Shareable preview](https://cody-sims.github.io/the-true-hive/) | Ten design directions and mock commerce |
| [Planning hub](https://cody-sims.github.io/the-true-hive/prototypes/plan.html) | Current owner-approved plans, requirements and business roadmap |
| [Business plan](https://cody-sims.github.io/the-true-hive/prototypes/plan.html?doc=business) | Local-to-growth strategy |
| [Partner workbook](https://cody-sims.github.io/the-true-hive/prototypes/plan.html?doc=questions) | Discussion agenda and unresolved decisions |

The URLs become available after the first successful Pages deployment. Anyone with internet access can view or forward them; this is not invited-only access.

## Important hosting boundary

GitHub Pages is suitable here for a **static project/design review with no real orders, payments, reservations or customer-data collection**.

GitHub's [Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) say it is not intended/allowed as free hosting to run an online business or ecommerce site primarily facilitating commercial transactions. Do not turn this preview into the real store. Production commerce belongs on the selected appropriate commerce/application host.

GitHub also [warns that Pages sites are public](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site), even when their source can be private. Noindex is not a password or access control. GitHub [logs visitor IP addresses for security](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages); no analytics/pixels are added by this project.

## What gets published

`npm run build:pages` creates **only `dist/`**, using an explicit artifact allowlist:

- The ten approved homepage/style/illustration sets.
- Shared gallery, collection/product/cart/checkout/inventory and planning UI.
- Registered owner-approved planning documents.
- A locally bundled Markdown parser, source map and preserved dependency license notices.
- A root entry page, `.nojekyll` and a generated-build marker.

No repository-root upload: `.git`, `.github`, tests, build scripts, package files, environment files and the complete `node_modules` tree do not enter the Pages artifact. This is artifact minimization, **not an automatic semantic secrets/privacy scanner**.

`publishing.json` records the approval scope and design/document IDs. Adding a new registered design/document without updating the reviewed allowlist fails the build. The builder refuses symlink sources and refuses to replace an unrecognized `dist` directory.

The planning parser import is explicitly relocated to the published vendor bundle, so the hub works under the project-site path without a CDN or runtime server.

## CI/CD behavior

Workflow: `.github/workflows/pages.yml`.

| Event | Behavior |
|---|---|
| Pull request | Install lockfile dependencies without lifecycle scripts, run native prototype checks and build the approved static artifact; **no deployment** |
| Push to `main` | Same gates, then upload `dist/` and deploy through the `github-pages` environment |
| Manual workflow on `main` | Same gated deployment |
| Other branch | No Pages deployment |

Build jobs have read-only repository permissions. Only the main-branch deployment job receives Pages-write and OIDC permissions. Official actions are pinned to verified commit SHAs; the workflow stores no personal access token or platform secret.

GitHub's [custom workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) describes the build/artifact/deploy dependency and permissions. The static export does not install an application framework, implement a backend or make the cart real.

## Updating the shared preview

Work in a branch, review the intended public diff, run `npm test`, `npm run check:links`, `npm run build:pages` and `npm run check:pages`, then open a pull request. The link gate checks source/export paths, case, fragments and design/product/document parameters. Merging reviewed source into `main` triggers the deployment. Do not commit generated `dist/` or dependency folders.

For a new design/document, update the registry and publication allowlist deliberately. Before committing operating details or partner-workbook answers, decide whether they are appropriate for the **public source history**, not merely whether a navigation link exposes them.

## Recovery

If a gate fails, deployment does not run; inspect the failed workflow rather than bypassing it. Correct the source in a normal follow-up commit. To restore a known-good public snapshot, use a reviewed Git revert/redeployment; do not rewrite shared history or restore real inventory from an old website.

The local server remains independent at `http://127.0.0.1:4173/prototypes/`. Public Pages cannot access that local process.
