# C.OG, Market Movers, 28/09/2026 17:05–17:38: the vol forecaster is one layer of a multi-layer system

Source: the owner's phone screenshots (8), transcribed 2026-11-06. Context: someone saved a ColezTrades XAUUSD chart (OANDA,
1-min, 27 Sept: a short from about 4,257 down to about 4,142, shaded box) "so he doesn't delete it"; Jordan wants to work out
the stop orders.

**C.OG (17:05):** You could have the historical csv if you really wanted to. it's impossible to reverse engineer this

**Jordan (17:06):** Please send it over. I'm not interested in the forecasting part. It's the stop orders that I want to figure out

**C.OG (17:06):** When I post the old forecaster logic though it will give some more insights

**C.OG (17:07):** Every single position is different and this is an entire system built on top of the forecaster itself.
So the forecaster is more just a single component for this. But I'm going to do alot of explanations on it

**Jordan (17:08):** I figured. That's why I wanted the trade csv XD

**C.OG (17:09):** If you want to develop it to be much better then you'll need a multi layer structure.
Something like 6 layers with the forecaster itself only being one of those layers (edited).
Have you ever looked into meta labelling ?

**C.OG (17:11):** Stuff about Black litterman will be an interesting read aswell

**C.OG (17:13):** @Jordan there was a reason why I said this after you mentioned trying to figure out the stop orders

**Jordan (17:13):** When I say layers. You mean more methods to determine a trade?

**C.OG (17:13):** An example of a layer is an engineering feature such as splitting correlation from variance

**C.OG (17:15):** The reason behind this is that it's not quite possible to match what I'm doing by using purely a vol forecaster.
The way how I'm able to have the stop orders you've said about is because I'm using a vol forecaster as a single layer in a
multi layer system

**C.OG (17:16):** Yes. But I'm saying this so you can at least go in the right direction because I don't want you to waste your time

**C.OG (17:19):** So having the forecaster is very useful as a layer.
But then the way to really develop this is by having conditional views and then other layers supporting it.
So the vol forecaster can drive so many things.
Position sizing, regime states, but you can also use its errors as a feedback loop.
I'll help you out.
If you make volatility a shared states variable where you have
- current conditional volatility
- expected change in volatility
- volatility relative to its longrun level
- probability of being in different volatility regimes
- forecast error

You can open a lot of doors. And research a lot into jump intensity and jump diffusion

**Garin (17:23):** Read a paper on SSRN on jump diffusion a few nights back

**C.OG (17:24):** This is probably a few weeks worth of research and looking into things. But you'll thank me at the end

**Garin (17:27):** I noticed that Merton jump diffusions form looks similar to things like geometric Brownian motion. Is the
Brownian formula built into jump diffusion @C.OG

**C.OG (17:30):** That's part of it. Then it's a jump added on top. To put it as simply as possible
