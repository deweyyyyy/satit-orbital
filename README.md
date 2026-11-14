# SATIT Orbital

**Design a real space mission. Launch it. Live with every trade-off.**

A browser game for the 2026 NASA Space Apps Challenge (*Space Mission Design Game*, Games · Beginner/Youth → Intermediate). Players pick a mission, build a spacecraft, choose an orbit and rocket, pick ground stations, fly the mission through emergencies in a real-time 3D view, and get a debrief that explains *why* it succeeded or failed. Play solo with an AI crew, with 2–4 players on one device, or online with up to 4 crew on separate devices.

By **Team SATIT Orbital**. Sources, credits and SI-use disclosure are [at the end of this page](#sources-and-credits).

![Title screen with a 3D Earth](docs/screenshots/title.jpg)

## How it plays

| Phase | NASA mission segment | What you do |
|---|---|---|
| 1 · Objective | User segment | Pick one of 5 missions (CubeSat Classroom, Wildfire Watch, Lunar Relay, Asteroid Scout, Red Planet Weather), a mode and a study level. |
| 2 · Hangar | Space segment | Choose a structure, solar array, battery, radio, computer, pointing system, engine and instruments. Your spacecraft is built in 3D as you go, and live gauges show mass, power, budget, data and Δv. |
| 3 · Launch & orbit | Launch segment | Pick an orbit (LEO, geostationary, halo, interplanetary…) shown in 3D, and a rocket that can lift your mass there. Then watch the launch. |
| 4 · Operate | Ground segment | Pick ground stations, then fly the mission in 3D. Emergencies (solar storms, debris, budget cuts) need crew decisions. |
| 5 · Debrief | — | Requirements met, score breakdown, what would change the outcome, real NASA missions like yours, verified leaderboard. |

| Hangar | Launch & orbit |
|---|---|
| ![Hangar with a 3D spacecraft](docs/screenshots/hangar.jpg) | ![Choosing an orbit in 3D](docs/screenshots/launch.jpg) |
| **Emergency vote** | **Debrief** |
| ![A crew emergency during operations](docs/screenshots/emergency.jpg) | ![Debrief with score and explanations](docs/screenshots/debrief.jpg) |

Every choice has consequences: more instruments mean more mass, power, cost and data; a weak radio wastes science; far from Earth you need bigger dishes and the Deep Space Network.

## Features

- **Real-time 3D** (Three.js): procedural planets (Earth with clouds and atmosphere, Moon, Mars, an asteroid), orbit paths shaped like each real orbit type, a spacecraft model built from your parts, live downlink beams and emergency alarms. Drag to look around, scroll to zoom. Falls back to 2D art without WebGL.
- **Game feel:** animated page transitions, launch countdown with camera shake and warp, synthesized sound effects and mission-control ambience (no audio files), crew dialogue, star ratings.
- **Five modes:** solo with an AI crew, local co-op (2–4 players), online co-op (up to 4, Durable Objects), versus with a shared challenge code, and sandbox.
- **Learning built in:** every warning explains *why*, every emergency ends with a "why it matters" lesson, and the debrief suggests what would have changed the result.
- **Accessible:** keyboard playable, screen-reader labels, honours "reduce motion", sound can be muted.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run db:migrate:local   # create the local D1 leaderboard table
npm run dev                # http://127.0.0.1:8787
```

The game also works with no backend at all (any static file server pointed at `public/`): leaderboard and online rooms switch off automatically.

## Tests

```bash
npm test             # engine unit tests (node:test)
npm run check        # bundle the Worker without deploying
npm run test:smoke   # API + Durable Object room test, against a running `npm run dev`
```

GitHub Actions runs all three on every push and pull request (`.github/workflows/ci.yml`).

## Deploy to Cloudflare

From your machine:

```bash
npx wrangler login
npx wrangler d1 create satit-orbital        # copy the database_id into wrangler.jsonc
npm run db:migrate:remote
npm run deploy
```

Or from GitHub: add the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, put the real `database_id` in `wrangler.jsonc`, then run the **Deploy to Cloudflare** workflow from the Actions tab.

Uses Workers Free plan features: static assets, D1, and SQLite-backed Durable Objects.

## Architecture

```
public/                 static game (no build step)
  index.html
  css/game.css
  js/data.js            missions, parts, orbits, rockets, ground stations, events
  js/engine.js          pure, deterministic rules + simulation (shared with the server)
  js/views.js           HTML templates for each screen
  js/main.js            state, rendering, transitions, simulation loop, online sync
  js/scene3d.js         Three.js 3D views
  js/net.js             leaderboard + room client
  js/fx.js              synthesized sound effects
  vendor/               three.module.min.js (Three.js r170, MIT)
src/worker.js           Cloudflare Worker API + MissionRoom Durable Object
migrations/             D1 schema
test/                   unit and smoke tests
docs/screenshots/       images for this README
```

- **Verified scores.** The client submits its design, random seed and emergency decisions. The Worker replays the mission with the same `engine.js` and stores the server-computed score in D1. Designs that could never launch are rejected, and Versus challenge runs use a seed derived on the server so every team faces the same emergencies. Known limit: on the open boards the player's browser picks the seed, so a determined player could try many seeds offline.
- **Online rooms.** One Durable Object per 5-character room code holds the Commander's mission state and relays crew messages over WebSockets (hibernation API). The Commander's browser runs the simulation and streams snapshots; other crew vote on emergencies and own different parts of the spacecraft. Seats can be reclaimed after a dropped connection, and idle rooms clean themselves up after 24 hours.
- **No personal data.** Leaderboard names are generated callsigns (e.g. `Swift-Falcon-07`); free text is rejected.

## Sources and credits

NASA does not endorse this project. It is an independent entry to the 2026 NASA Space Apps Challenge.

### NASA data and resources used

| Resource (from the challenge's Resources tab) | How the game uses it |
|---|---|
| Design and Develop Science Missions | The four mission segments (user, space, launch, ground) become the game's phases. |
| Concept Maturity Levels (CMLs), JPL | Player rank: CML 1 Cocktail Napkin → CML 4 Point Design. |
| Mission Design Lab (MDL) | Difficulty levels (Office Hours, Trade Study, Point Design) and the spacecraft subsystem categories. |
| General Mission Analysis Tool (GMAT) | The families of orbits offered in Phase 3 (LEO, geostationary, lunar, libration-point/halo, interplanetary). |
| A Learning Game About Telescopes | Objectives drive engineering choices; levels of complexity; launch animation; "real NASA missions like yours". |
| CubeSat 101 | The CubeSat Classroom mission: form factors, mass limits, CubeSat Launch Initiative vs. rideshare. |
| NASA Mission Viz | Inspiration for the 3D orbit views. |
| Visualize a Space Mission Using Virtual Reality (Space Apps 2023) | Mission concept → trajectory → timeline structure. |
| CSA Digital Games and Activities (partner resource) | General design reference; no content reused. |

Real missions mentioned in the game as references: Landsat 8 and 9, MODIS (Terra and Aqua), GOES, CubeSat Launch Initiative, CAPSTONE, NEAR Shoemaker, OSIRIS-REx, Mars Reconnaissance Orbiter (MARCI), Kepler/K2, the International Space Station and the Deep Space Network.

**Simplified for play:** part masses, power, costs, data rates, budgets, rocket capacities, signal multipliers, scores and emergency odds are game-balance values, not NASA data. The relationships between them are meant to be realistic.

### Software and assets

| Item | License |
|---|---|
| This game's code | MIT ([LICENSE](LICENSE)) |
| [Three.js](https://threejs.org/) r170 (`public/vendor/`) | MIT |
| Wrangler (development and deployment) | MIT OR Apache-2.0 |
| Orbitron and Chakra Petch fonts (Google Fonts) | SIL Open Font License |
| Icons, 3D models, textures and sound effects | Generated by our code at runtime (MIT) |
| Hosting: Cloudflare Workers, D1, Durable Objects | Used under Cloudflare's terms; no Cloudflare code redistributed |

### Use of Super Intelligence (SI) tools

The game's code (HTML, CSS, JavaScript, Three.js scenes, Web Audio sounds, Cloudflare Worker), game-balance numbers, scenario text, UI design, tests, CI and this README were written with assistance from **Claude (Anthropic)**, a large language model (an SI tool). Each source file says so in its header comment, and `index.html` has an `si-assistance` meta tag. No SI-generated image, video or audio files are used: all graphics are generated by code at runtime, sounds are synthesized in code, and the screenshots above are captures of the running game.

## License

[MIT](LICENSE).
