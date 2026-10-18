import { screens, sourceMap } from "../src/catalog.js";
console.log(
  JSON.stringify(
    {
      screens: screens.length,
      sourceAliases: Object.keys(sourceMap).length,
      groups: [...new Set(screens.map((s) => s.group))],
      catalogue: screens,
    },
    null,
    2,
  ),
);
