import { initializeApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  getMultiFactorResolver,
  GoogleAuthProvider,
  initializeAuth,
  inMemoryPersistence,
  multiFactor,
  signInWithPopup,
  signOut,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret,
  type User,
} from "firebase/auth";

const root = document.querySelector<HTMLElement>("[data-admin-login]");

if (root) {
  const configNode = root.querySelector<HTMLScriptElement>(
    "[data-firebase-config]",
  );
  const google = root.querySelector<HTMLButtonElement>("[data-admin-google]");
  const challenge = root.querySelector<HTMLFormElement>(
    "[data-admin-totp-form]",
  );
  const enrollment = root.querySelector<HTMLElement>("[data-admin-enrollment]");
  const enrollForm = root.querySelector<HTMLFormElement>(
    "[data-admin-enrollment-form]",
  );
  const secretOutput = root.querySelector<HTMLElement>(
    "[data-admin-enrollment-secret]",
  );
  const status = root.querySelector<HTMLElement>("[data-admin-login-status]");

  function announce(message: string) {
    if (status) status.textContent = message;
  }

  async function start() {
    const config: unknown = JSON.parse(configNode?.textContent ?? "null");
    if (
      !config ||
      typeof config !== "object" ||
      !("enabled" in config) ||
      config.enabled !== true
    )
      return;
    if (
      !("apiKey" in config) ||
      typeof config.apiKey !== "string" ||
      !("projectId" in config) ||
      typeof config.projectId !== "string" ||
      !("authDomain" in config) ||
      config.authDomain !== `${config.projectId}.firebaseapp.com` ||
      !google ||
      !challenge ||
      !enrollment ||
      !enrollForm ||
      !secretOutput
    )
      throw new Error("Unavailable login configuration");
    const auth = initializeAuth(
      initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
        },
        "true-hive-inventory-browser",
      ),
      {
        persistence: inMemoryPersistence,
        popupRedirectResolver: browserPopupRedirectResolver,
      },
    );
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    let resolver: MultiFactorResolver | null = null;
    let pendingUser: User | null = null;
    let secret: TotpSecret | null = null;
    let busy = false;

    function hideSecrets() {
      secret = null;
      pendingUser = null;
      secretOutput!.textContent = "";
      enrollment!.hidden = true;
      enrollForm!.reset();
    }

    async function post(action: "session" | "enrollment", user: User) {
      const idToken = await user.getIdToken(true);
      const response = await fetch(`/api/admin/${action}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": root!.dataset["csrfToken"] ?? "",
        },
        body: JSON.stringify({ idToken }),
      });
      if (!response.ok) throw new Error("Sign-in could not be authorized");
      const result: unknown = await response.json();
      if (!result || typeof result !== "object")
        throw new Error("Invalid response");
      return result;
    }

    async function exchange(user: User) {
      const result = await post("session", user);
      if (!("redirect" in result) || result.redirect !== "/inventory/products")
        throw new Error("Invalid response");
      hideSecrets();
      resolver = null;
      await signOut(auth);
      window.location.assign("/inventory/products");
    }

    async function fail() {
      hideSecrets();
      resolver = null;
      challenge!.hidden = true;
      challenge!.reset();
      await signOut(auth).catch(() => {});
      announce(
        "Sign-in could not be authorized. Please try again or contact the operator.",
      );
    }

    google.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      google.disabled = true;
      hideSecrets();
      resolver = null;
      challenge.hidden = true;
      announce("Complete Google sign-in to continue.");
      try {
        await signOut(auth);
        const credential = await signInWithPopup(auth, provider);
        // First-factor identities may only request enrollment; server decides membership.
        const allowed = await post("enrollment", credential.user);
        if (
          !("allowed" in allowed) ||
          allowed.allowed !== true ||
          multiFactor(credential.user).enrolledFactors.length !== 0
        )
          throw new Error("Fresh MFA sign-in is required");
        pendingUser = credential.user;
        secret = await TotpMultiFactorGenerator.generateSecret(
          await multiFactor(credential.user).getSession(),
        );
        secretOutput.textContent = secret.secretKey;
        enrollment.hidden = false;
        announce(
          "Add this key to your authenticator, then enter its code. The key is not stored by this application.",
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "auth/multi-factor-auth-required"
        ) {
          try {
            resolver = getMultiFactorResolver(auth, error as MultiFactorError);
            if (
              !resolver.hints.some(
                (hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID,
              )
            )
              throw new Error("TOTP is required");
            challenge.hidden = false;
            challenge.querySelector<HTMLInputElement>('[name="totp"]')?.focus();
            announce("Enter your authenticator code.");
          } catch {
            await fail();
          }
        } else await fail();
      } finally {
        google.disabled = false;
        busy = false;
      }
    });

    challenge.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !resolver) return;
      busy = true;
      const input = challenge.querySelector<HTMLInputElement>('[name="totp"]');
      const code = input?.value.trim() ?? "";
      try {
        if (!/^\d{6}$/.test(code)) throw new Error("Invalid code");
        const hint = resolver.hints.find(
          (item) => item.factorId === TotpMultiFactorGenerator.FACTOR_ID,
        );
        if (!hint) throw new Error("TOTP is required");
        const credential = await resolver.resolveSignIn(
          TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code),
        );
        await exchange(credential.user);
      } catch {
        await fail();
      } finally {
        if (input) input.value = "";
        busy = false;
      }
    });

    enrollForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy || !secret || !pendingUser) return;
      busy = true;
      const input = enrollForm.querySelector<HTMLInputElement>(
        '[name="enrollmentCode"]',
      );
      try {
        const code = input?.value.trim() ?? "";
        if (!/^\d{6}$/.test(code)) throw new Error("Invalid code");
        await multiFactor(pendingUser).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
          "Inventory authenticator",
        );
        hideSecrets();
        await signOut(auth);
        announce(
          "Authenticator enrolled. Sign in with Google again and complete the authenticator challenge.",
        );
      } catch {
        await fail();
      } finally {
        if (input) input.value = "";
        busy = false;
      }
    });

    window.addEventListener("pagehide", () => {
      hideSecrets();
      resolver = null;
      void signOut(auth).catch(() => {});
    });
  }

  void start().catch(() => announce("Inventory sign-in is unavailable."));
}
