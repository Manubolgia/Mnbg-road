# MAINLINE

A roll-and-draw route building game for up to ten players, one phone each.
Installable as a PWA, the front end is static and lives on GitHub Pages; the
rooms run on a Cloudflare Worker with a Durable Object per game.

MAINLINE is an independent implementation of the classic roll-and-draw route
building game. The rules are followed exactly; every name is our own.

---

## How it plays

Seven rounds. Each round four dice are rolled — three route dice and one
junction die — and every player draws the same four results on their own
seven-by-seven sheet, in any order, rotated or mirrored as they like. You must
use as many of the four as you legally can.

Every piece must join an existing route end or one of the twelve gateways
around the board edge (six road, six rail). A road end may never meet a rail
end; only an **interchange** lets traffic swap between the two, and the
**flyover** carries one over the other without joining them. Once a round, three
times a game, and never the same one twice, you may also draw one of the six
**special pieces**.

After the seventh round:

| | |
|---|---|
| **Network** | gateways joined into your single largest network — 2→4, 3→8, 4→12, 5→16, 6→20, 7→24, 8→28, 9→32, 10→36, 11→40, 12→45 |
| **Centre** | one point per filled square of the middle three-by-three |
| **Longest road** | one point per square along your longest unbroken road |
| **Longest rail** | the same, for rail |
| **Loose ends** | minus one for every route end pointing at an empty square or off the board |

The full rules are in the app under *How to play*.

---

## Layout

```
web/                  the PWA — static, no build step
  index.html          shell; holds the one deploy-time constant
  styles.css          one main colour, one accent, one secondary
  sw.js               service worker, caches the shell for offline play
  manifest.webmanifest
  icons/              SVG mark plus rasterised PNGs
  js/
    rules/            the engine: tiles, board, scoring, round validation
    ui/               SVG drawing for pieces and sheets
    net/client.js     websocket client with reconnection
    session.js        solo game and online game behind one interface
    app.js            screens, input, rendering
worker/               Cloudflare Worker + Durable Object room server
tools/                rule tests and the icon rasteriser
```

The `web/js/rules` modules are imported by both the browser and the Worker, so
the server checks every submitted round against exactly the same code the app
used to draw it.

---

## Running it locally

```sh
# the app
cd web && python3 -m http.server 8765     # then open http://localhost:8765

# the rules tests
node tools/test-rules.mjs

# the room server
cd worker && npm install && npx wrangler dev
```

With `wrangler dev` running, open the app, go to **Settings**, and set the game
server to the URL wrangler prints (e.g. `http://localhost:8787`).

---

## Deploying

### 1. The room server (Cloudflare)

```sh
cd worker
npm install
npx wrangler login
npx wrangler deploy
```

Wrangler prints the Worker URL, e.g.
`https://mainline-rooms.<your-account>.workers.dev`. Durable Objects here are
SQLite-backed, which is available on the Workers free plan. Rooms delete
themselves after twelve hours of inactivity.

### 2. The app (GitHub Pages)

In the repository settings, under **Pages**, set the source to **GitHub
Actions**. Then under **Secrets and variables → Actions → Variables**, add a
repository variable:

| Name | Value |
|---|---|
| `MAINLINE_SERVER` | the Worker URL from step 1 |

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs the rule
tests, bakes the Worker URL into `index.html`, and publishes `web/` to Pages.

If you skip the variable the app still deploys and solo play works; players can
fill the server URL in themselves under **Settings**.

### 3. Installing on a phone

Open the Pages URL, then *Add to Home Screen* (iOS Safari) or *Install app*
(Android Chrome). The shell is cached, so solo games work with no signal.

---

## Playing together

One player taps **Create a room** and shares the four-character code or the
invite link. Everyone joins, the host starts, and from then on all phones see
the same dice each round. You can peek at anyone's sheet by tapping their name.
The round closes when everyone has tapped **Done**; the host can also force it
along if someone has wandered off.

Up to ten players per room. Players can close the app and come back — the
Worker keeps the game and the app reconnects on its own.

---

## Regenerating the icons

The mark is `web/icons/icon.svg`. The PNG sizes the manifest wants are produced
from the same geometry with no image dependencies:

```sh
python3 tools/make-icons.py
```
