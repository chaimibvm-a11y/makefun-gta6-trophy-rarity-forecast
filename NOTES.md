# Forecasting method

## The problem
Each case hands the program Exophase's reads of GTA VI's PS5 trophy page
before a checkpoint, and asks for five quantiles of every trophy's earn rate
at a target up to a week later. The score is the mean pinball loss on the
logit scale, so a miss from 1% to 2% costs about what a miss from 33% to 50%
does. The house baseline says every rate stays where the last read put it,
with a random-walk spread. Over a week that is wrong: players keep earning
while the tracked population's growth slows, so rates rise.

## What the data does
Launch night showed the two forces pulling rates in opposite directions.
The tracked population jumped from 638 to 3,868 players at the first
refresh and every rate fell, though nobody un-earned a trophy: new players
joining dilutes every rate. Meanwhile the players already tracked keep
earning, which pushes rates up. A forecast that fits the rate itself
confuses the two, and one that fits the earners count extrapolates past
100% because a count has no ceiling. The log-odds (logit) of the rate has
a ceiling built in, and it is also the scale the scorer uses.

## The model
For each trophy, fit `logit(rate) = a + b * ln(1 + t)` by least squares,
with t in hours since release, over the reads from the largest jump in
players-tracked onward. That jump is the launch refresh; reads before it
belong to a different regime and would bend the line. The intercept is
refitted at the shrunk slope by least squares, which averages out the
page's 2-decimal rounding instead of anchoring on a single read. Slopes are shrunk
toward their tier's median (3 parts own, 1 part pool), so a trophy with a
flat or noisy history borrows its peers' typical growth; the platinum pools
toward the low percentile of slopes instead, since it can only rise as fast
as the slowest trophy it needs, and its median is capped at the lowest other
trophy's median. A trophy whose rate never moved gets a small upward drift
that grows with the horizon, because a flat page in launch week is stale,
not static. The spread is a random-walk term widening with the horizon plus
the fit's residual, so uncertain trophies get wide bands.

## Validation
On the practice cases (flat history) the program writes valid forecasts
and, under the refresh answers, beats the baseline's narrow band because
its wider spread covers the dilution drop. On a synthetic final-like case
with real growth and a known truth, it scored 0.22 against the baseline's
0.65, with medians tracking the truth closely for story and activity
trophies. The synthetic truth was generated with the same functional form
the model fits, so that gap is an upper bound; the real edge is smaller,
but the direction is the model's: growth, not persistence.
