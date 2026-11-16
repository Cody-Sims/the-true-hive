// Deliberate public catalog snapshot for design review; never operational stock.
export const products = [
  {
    key: "coconut-milk-delight",
    title: "Coconut Milk Delight",
    summary:
      "A Teawood scented soap made with coconut milk to give a luxurious lather.",
    ingredients: [
      "Avocado Oil",
      "Coconut Oil",
      "Distilled Water",
      "Coconut Milk",
      "Lye",
      "Shea Butter",
      "Mango Butter",
      "Castor Oil",
      "Sweet Almond Oil",
    ],
    variants: [
      {
        key: "coconut-milk-delight-4oz-single",
        label: "Single 4oz bar",
        priceMinor: 1000,
        image: "assets/soap-delight-bar.webp",
        small: "assets/soap-delight-bar-small.webp",
      },
      {
        key: "coconut-milk-delight-4oz-wolf",
        label: "Single 1oz Wolf Mold",
        priceMinor: 1250,
        image: "assets/soap-delight-wolf.webp",
        small: "assets/soap-delight-wolf-small.webp",
      },
    ],
  },
  {
    key: "the-true-soap",
    title: "The True Soap",
    summary:
      "A vanilla and tonka bean soap. This simple soap is what started it all for us and acts as the inspiration for a lot of our soaps.",
    ingredients: [
      "Avocado Oil",
      "Distilled Water",
      "Palm Oil",
      "Coconut Oil",
      "Lye",
      "Castor Oil",
      "Beeswax ;)",
    ],
    variants: [
      {
        key: "the-true-soap-4oz-single",
        label: "Single 4oz bar",
        priceMinor: 1000,
        image: "assets/soap-true-bar.webp",
        small: "assets/soap-true-bar-small.webp",
      },
      {
        key: "the-true-soap-4oz-wolf",
        label: "Single 1oz Wolf Mold",
        priceMinor: 1250,
        image: "assets/soap-true-wolf.webp",
        small: "assets/soap-true-wolf-small.webp",
      },
    ],
  },
];
