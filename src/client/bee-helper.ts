const helper = document.querySelector<HTMLElement>("[data-bee-helper]");
if (helper) {
  const options = helper.querySelector<HTMLElement>("[data-bee-options]");
  if (options) options.hidden = false;
  helper.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest<HTMLButtonElement>("[data-bee-choice]")
        : null;
    if (!button || !helper.contains(button)) return;
    const answer = [
      ...helper.querySelectorAll<HTMLTemplateElement>("[data-bee-answer]"),
    ].find(
      (template) =>
        template.dataset["beeAnswer"] === button.dataset["beeChoice"],
    );
    if (!answer) return;
    for (const choice of helper.querySelectorAll("[data-bee-choice]"))
      choice.setAttribute("aria-pressed", String(choice === button));
    helper
      .querySelector("[data-bee-result]")
      ?.replaceChildren(answer.content.cloneNode(true));
  });
}
