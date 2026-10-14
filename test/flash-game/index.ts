import type { Extension, View } from "@zcag/pal";

export default {
  palettes: {
    "flash-game": {
      title: "Flash test game",
      view: async (): Promise<View> => ({ tree: { type: "surface", src: "surface/index.html" }, title: "Flash test game", actions: [] }),
      pick: () => {},
    },
  },
} satisfies Extension;
