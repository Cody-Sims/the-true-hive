import ivory from "../assets/soap-reference-ivory.webp?url";
import ivorySmall from "../assets/soap-reference-ivory-small.webp?url";
import amber from "../assets/soap-reference-amber.webp?url";
import amberSmall from "../assets/soap-reference-amber-small.webp?url";

const references = {
  "coconut-milk-delight": {
    src: ivory,
    small: ivorySmall,
    alt: "AI styling reference of an ivory soap bar and small wolf-shaped soap on pale stone; not an actual product photograph.",
  },
  "the-true-soap": {
    src: amber,
    small: amberSmall,
    alt: "AI styling reference of a warm beige soap bar and small wolf-shaped soap on dark stone; not an actual product photograph.",
  },
};

export function getSoapReference(key?: string) {
  return key && Object.hasOwn(references, key)
    ? references[key as keyof typeof references]
    : null;
}
