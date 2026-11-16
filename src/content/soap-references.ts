import ivory from "../assets/soap-delight-bar.webp?url";
import ivorySmall from "../assets/soap-delight-bar-small.webp?url";
import ivoryWolf from "../assets/soap-delight-wolf.webp?url";
import ivoryWolfSmall from "../assets/soap-delight-wolf-small.webp?url";
import amber from "../assets/soap-true-bar.webp?url";
import amberSmall from "../assets/soap-true-bar-small.webp?url";
import amberWolf from "../assets/soap-true-wolf.webp?url";
import amberWolfSmall from "../assets/soap-true-wolf-small.webp?url";

const references = {
  "coconut-milk-delight": {
    src: ivory,
    small: ivorySmall,
    alt: "AI styling reference of an ivory soap bar; not an actual product photograph.",
    wolf: {
      key: "coconut-milk-delight-4oz-wolf",
      src: ivoryWolf,
      small: ivoryWolfSmall,
      alt: "AI styling reference of an ivory wolf-shaped soap; not an actual product photograph.",
    },
  },
  "the-true-soap": {
    src: amber,
    small: amberSmall,
    alt: "AI styling reference of a warm beige soap bar; not an actual product photograph.",
    wolf: {
      key: "the-true-soap-4oz-wolf",
      src: amberWolf,
      small: amberWolfSmall,
      alt: "AI styling reference of a warm beige wolf-shaped soap; not an actual product photograph.",
    },
  },
};

export function getSoapReference(key?: string, variantKey?: string) {
  const reference =
    key && Object.hasOwn(references, key)
      ? references[key as keyof typeof references]
      : null;
  return reference && reference.wolf.key === variantKey
    ? reference.wolf
    : reference;
}
