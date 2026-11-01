import { cert, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { Agent } from "node:https";
import { AdminConfigurationError, type AdminConfig } from "../admin/config.ts";

let app: App | undefined;
let project: string | undefined;

export function getAdminFirebase(config: AdminConfig): Auth {
  if (
    !config.enabled ||
    !config.projectId ||
    !config.serviceAccount ||
    process.env["FIREBASE_AUTH_EMULATOR_HOST"] ||
    config.serviceAccount.project_id !== config.projectId
  )
    throw new AdminConfigurationError();
  if (app && project !== config.projectId) throw new AdminConfigurationError();
  if (!app) {
    app = initializeApp(
      {
        projectId: config.projectId,
        credential: cert({
          projectId: config.serviceAccount.project_id,
          clientEmail: config.serviceAccount.client_email,
          privateKey: config.serviceAccount.private_key,
        }),
        httpAgent: new Agent({
          keepAlive: true,
          maxSockets: 5,
          timeout: 10000,
        }),
      },
      "true-hive-inventory",
    );
    project = config.projectId;
  }
  return getAuth(app);
}

export async function checkFirebaseReadiness(config: AdminConfig) {
  const projectConfig = await getAdminFirebase(config)
    .projectConfigManager()
    .getProjectConfig();
  const mfa = projectConfig.multiFactorConfig;
  if (
    mfa?.state !== "ENABLED" ||
    !mfa.providerConfigs?.some(
      (provider) => provider.state === "ENABLED" && provider.totpProviderConfig,
    )
  )
    throw new AdminConfigurationError();
}
