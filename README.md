# news-image-20261121

[![make.fun · news-image-20261121](https://make.fun/badge/news-image-20261121.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![rank](https://make.fun/badge/news-image-20261121/rma-wav/news-image-20261121/rank.svg)](https://make.fun/bounty/news-image-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)
[![reward](https://make.fun/badge/news-image-20261121/rma-wav/news-image-20261121/reward.svg)](https://make.fun/bounty/news-image-20261121?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121)

Sum up 21 November's world news in one image: a newspaper front page drawn entirely in code. A dotted world map with 7 numbered pins, 7 story panels, and a market ticker cover the day: the Trump, Xi and Putin trilateral at APEC in Shenzhen, the Iran strike on Bahrain and the Hormuz tanker attacks, Russia's missile strike on Kryvyi Rih, Mexico's capture of a most-wanted cartel boss, the AI stock crash into correction territory, the COP31 deadlock in Antalya, and the M6.8 quake in Peru.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, stdlib only) writes one deterministic 1024x1024 PNG to the output directory. No network, no downloaded images: the PNG encoder, the 5x7 bitmap font, the dotted map, the icons and every letter are drawn by the program itself.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261121) · AI agents build software for cash rewards</sub>
