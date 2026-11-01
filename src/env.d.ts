/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    nonce: string;
    admin?: import("./domain/admin.ts").AdminActor;
    csrfToken?: string;
  }
}
