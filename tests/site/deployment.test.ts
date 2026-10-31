import test from "node:test";
import assert from "node:assert/strict";
import {
  assertPublicFiles,
  assertCheckedDeployment,
} from "../../scripts/site-artifact-policy.mjs";

test("public output cannot contain planning, server source, environment files or database connection code", () => {
  assert.doesNotThrow(() =>
    assertPublicFiles([
      { path: "_astro/site.css", contents: "body{color:green}" },
    ]),
  );
  for (const file of [
    { path: "docs/business.md", contents: "# Private plan" },
    { path: "prototypes/market.html", contents: "Design review" },
    { path: "server/entry.mjs", contents: "Server code" },
    { path: ".env", contents: "A credential" },
    { path: ".neon/context.json", contents: "Private project context" },
    { path: ".mcp.json", contents: "Private project MCP configuration" },
    { path: "_astro/page.js", contents: 'const url="postgresql://private";' },
    { path: "_astro/db.js", contents: "SELECT * FROM inventory_movements" },
  ])
    assert.throws(
      () => assertPublicFiles([file]),
      /public|private|server|database|artifact/i,
    );
});

test("native app deployment must wait for CI on main rather than deploying unchecked commits", () => {
  const service = {
    type: "web",
    runtime: "node",
    plan: "0.5c-512mb",
    region: "oregon",
    branch: "main",
    autoDeployTrigger: "checksPass",
    startCommand: "npm run start",
    healthCheckPath: "/api/health/live",
  };
  const scripts = {
    start: "node --env-file-if-exists=.env scripts/start-site.mjs",
  };
  assert.doesNotThrow(() =>
    assertCheckedDeployment({ services: [service] }, scripts),
  );
  for (const change of [
    { runtime: "docker" },
    { branch: "feature" },
    { autoDeployTrigger: "commit" },
  ])
    assert.throws(
      () =>
        assertCheckedDeployment(
          { services: [{ ...service, ...change }] },
          scripts,
        ),
      /deployment|CI|native|main/i,
    );
});

test("deployment cannot bypass startup preflight or continually probe the database", () => {
  const service = {
    type: "web",
    runtime: "node",
    plan: "0.5c-512mb",
    region: "oregon",
    branch: "main",
    autoDeployTrigger: "checksPass",
    startCommand: "npm run start",
    healthCheckPath: "/api/health/live",
  };
  const scripts = {
    start: "node --env-file-if-exists=.env scripts/start-site.mjs",
  };
  for (const change of [
    { startCommand: "node dist-site/server/entry.mjs" },
    { healthCheckPath: "/api/health/ready" },
  ]) {
    assert.throws(
      () =>
        assertCheckedDeployment(
          { services: [{ ...service, ...change }] },
          scripts,
        ),
      /startup|preflight|liveness/i,
    );
  }
  assert.throws(
    () =>
      assertCheckedDeployment(
        { services: [service] },
        { start: "node dist-site/server/entry.mjs" },
      ),
    /startup|preflight/i,
  );
  for (const configuration of [
    { services: [{ ...service, plan: "1c-2gb" }] },
    { services: [service, service] },
    { services: [service], databases: [{ name: "unapproved-paid-database" }] },
  ]) {
    assert.throws(
      () => assertCheckedDeployment(configuration, scripts),
      /approved|service|database|plan/i,
    );
  }
});
