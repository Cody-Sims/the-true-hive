export function publicationFiles() {
  return [];
}

export function validatePublicationApproval(approval) {
  if (approval.public !== true) throw new Error("Public redirect publication has not been approved.");
  if (approval.scope !== "redirect-only") throw new Error("Only redirect-only publication scope is supported.");
  if (approval.destination !== "https://thetruehive.com/prototypes/") throw new Error("The redirect destination must be the canonical private studio.");
  return true;
}
