/**
 * @param {{path: string, contents: string}[]} files
 */
export function assertPublicFiles(files) {
  for (const file of files) {
    if (
      /(?:^|\/)(?:docs|prototypes|server|node_modules|\.git|\.neon|\.mcp\.json)(?:\/|$)/.test(
        file.path,
      ) ||
      /(?:^|\/)\.env(?:\.|$)/.test(file.path) ||
      /\.(?:md|sql|ts|map)$/.test(file.path) ||
      file.path.split("/").includes("..")
    ) {
      throw new Error(
        `A private/server artifact was included in public output: ${file.path}`,
      );
    }
    if (
      /postgres(?:ql)?:\/\/|DATABASE_URL|MIGRATION_DATABASE_URL|inventory_movements|pg_advisory_xact_lock/.test(
        file.contents,
      )
    ) {
      throw new Error(
        `Database configuration or server code leaked into a public artifact: ${file.path}`,
      );
    }
  }
}

/**
 * @param {unknown} configuration
 * @param {unknown} scripts
 */
export function assertCheckedDeployment(configuration, scripts) {
  if (
    !configuration ||
    typeof configuration !== "object" ||
    !("services" in configuration) ||
    !Array.isArray(configuration.services) ||
    configuration.services.length !== 1 ||
    "databases" in configuration
  ) {
    throw new Error(
      "Only one approved native service and no Render database may be provisioned.",
    );
  }
  if (
    !scripts ||
    typeof scripts !== "object" ||
    !("start" in scripts) ||
    scripts.start !== "node --env-file-if-exists=.env scripts/start-site.mjs"
  ) {
    throw new Error("Native startup must run the checked preflight wrapper.");
  }
  for (const service of configuration.services) {
    if (
      !service ||
      service.runtime !== "node" ||
      service.branch !== "main" ||
      service.autoDeployTrigger !== "checksPass"
    ) {
      throw new Error(
        "Native deployment must follow main and wait for CI checks.",
      );
    }
    if (
      service.type !== "web" ||
      service.plan !== "0.5c-512mb" ||
      service.region !== "oregon"
    ) {
      throw new Error(
        "Deployment must use the approved native app plan and region.",
      );
    }
    if (
      service.startCommand !== "npm run start" ||
      service.healthCheckPath !== "/api/health/live"
    ) {
      throw new Error(
        "Deployment must use startup preflight and routine liveness checks.",
      );
    }
    if (Array.isArray(service.envVars)) {
      for (const variable of service.envVars) {
        if (
          typeof variable.key === "string" &&
          /DATABASE_URL|SECRET|TOKEN|PASSWORD/.test(variable.key) &&
          "value" in variable
        ) {
          throw new Error(
            "Deployment secrets must be supplied privately by the host, not committed as values.",
          );
        }
      }
    }
  }
}
