import { editorDesigns } from "./manifest.mjs";

const params = new URLSearchParams(location.search);
if (params.get("design") !== "guided") {
  await import("./app.mjs");
} else {
  try {
    const loading = document.createElement("p");
    loading.setAttribute("role", "status");
    loading.textContent = "Loading the improved Guided editor...";
    document.querySelector("#app").append(loading);
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = new URL("../guided-scroll/styles.css", import.meta.url).href;
    const stylesReady = new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error("Guided styles timed out.")), 10000);
      style.onload = () => { window.clearTimeout(timeout); resolve(); };
      style.onerror = () => { window.clearTimeout(timeout); reject(new Error("Guided styles unavailable.")); };
    });
    document.head.append(style);
    const [response] = await Promise.all([
      fetch(new URL("../guided-scroll/index.html", import.meta.url), {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      }),
      stylesReady,
    ]);
    if (!response.ok) throw new Error("Guided template unavailable.");
    const template = new DOMParser().parseFromString(await response.text(), "text/html");
    if (!template.querySelector("#product-form") || !template.querySelector("#customer-preview"))
      throw new Error("Incomplete guided template.");
    document.body.className = `${template.body.className} editor-comparison`;
    document.body.dataset.design = "guided";
    document.body.dataset.layout = "together";
    document.body.replaceChildren(...template.body.childNodes);

    const label = document.createElement("label");
    label.className = "guided-direction";
    label.append("Direction");
    const direction = document.createElement("select");
    direction.id = "direction";
    direction.setAttribute("aria-label", "Editor direction");
    for (const design of editorDesigns)
      direction.add(new Option(`${design.number} / ${design.name}`, design.id));
    direction.value = "guided";
    label.append(direction);
    const navigation = document.querySelector(".flow-header nav");
    navigation.replaceChild(label, navigation.querySelector("a"));

    const { confirmLeave } = await import("../guided-next/app.mjs");
    await import("../guided-scroll/app.mjs");
    direction.addEventListener("change", () => {
      if (!confirmLeave()) { direction.value = "guided"; return; }
      const url = new URL(location.href);
      url.searchParams.set("design", direction.value);
      url.searchParams.set("mode", params.get("mode") === "new" ? "new" : "edit");
      url.searchParams.delete("layout");
      location.href = url.href;
    });
    document.title = `Guided editor / ${params.get("mode") === "new" ? "Add" : "Edit"} product | The True Hive`;
  } catch {
    document.body.className = "";
    document.body.innerHTML = '<main class="empty-state"><h1>Guided preview unavailable.</h1><p role="alert">The improved Guided editor could not be loaded. No product data was changed.</p><a href="index.html">Back to all designs</a></main>';
  }
}
