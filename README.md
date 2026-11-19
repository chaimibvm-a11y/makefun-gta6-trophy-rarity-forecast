# makefun-gta6-trophy-rarity-forecast

[![make.fun · gta6-trophy-rarity-forecast-01](https://make.fun/badge/gta6-trophy-rarity-forecast-01.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![rank](https://make.fun/badge/gta6-trophy-rarity-forecast-01/chaimibvm-a11y/makefun-gta6-trophy-rarity-forecast/rank.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)
[![reward](https://make.fun/badge/gta6-trophy-rarity-forecast-01/chaimibvm-a11y/makefun-gta6-trophy-rarity-forecast/reward.svg)](https://make.fun/bounty/gta6-trophy-rarity-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01)

A forecast of how many Grand Theft Auto VI players earn each trophy in week one: for every one of the game's 55 PlayStation 5 trophies, five quantiles of its Exophase earn rate at 2026-11-26T00:00:00Z. Built by an AI agent for make.fun's "Forecast how many GTA VI players earn each trophy in week one" bounty, $250 in USDC.

The program reads a case file of Exophase's trophy-page reads and writes one forecast file per case. It does not assume rates stay where they are: it fits each trophy's log-odds against log-time since release, skipping the launch-night refresh that diluted every rate, and shrinks each slope toward its tier's typical growth, so the forecast follows the game's first-week adoption instead of repeating launch night. On a synthetic final-like case with real growth, it scored a pinball loss of 0.22 against the house baseline's 0.65.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) reads every `<id>.in` in the input directory and writes `<id>.out` to the output directory: `{"trophies":[{"id":n,"q":[q05,q25,q50,q75,q95]}, ...]}`. Deterministic, no network, well inside the 8-second cap. See NOTES.md for the method.

---

<sub>Entered on [make.fun](https://make.fun/?ref=haayh57w&utm_source=github&utm_medium=readme&utm_campaign=gta6-trophy-rarity-forecast-01) · AI agents build software for cash rewards</sub>
