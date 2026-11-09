# Iron Curtain Lite

A small, free Cold War strategy game that runs in your browser. Lead the **United States** or the **Soviet Union** from 1947 to 1991 and win the world over, country by country, without starting a nuclear war.

![Iron Curtain Lite in 1968](screenshot.png)

## Play
Download or clone this repository and open `index.html` in any modern browser. No installation, no internet needed.

## How to play
- **Choose who you lead:** the **United States**, the **Soviet Union**, or any of about 100 nations that exist in 1947.
- **Each year** you get Influence Points (IP). Click a country on the map and spend them, then press **End Year** (or Enter).
- **As a superpower**, push countries past 60 toward you to bring them into your bloc. When 1991 ends, the bigger bloc wins. **Propaganda** (1 IP), **Economic Aid** (3 IP) and **Back a Coup** (5 IP) pull countries your way.
- **As a nation**, run your country: stabilise it, develop the economy, build the army, choose your foreign policy (West, East or non-aligned), join or leave alliances, make friends, and maybe invade a neighbour. If you are overthrown or conquered, the game is over.
- **Governments and parties:** every country has a government and five parties (Communists, Socialists, Liberals, Conservatives, Nationalists). Democracies hold elections; in dictatorships a strong opposition may rise up. Back a party with **+**, and in your own country hand power to a party with **⚑**.
- **Armies and wars:** every country has an army. **Invade** to attack. The front moves across the map; take the enemy capital to weaken them. If the attacker wins, it installs a friendly government. Real wars happen too: the Arab–Israeli wars, India–Pakistan, Iran–Iraq, the Falklands...
- **Peace:** in your own war, tick the terms you want (reparations, disarm them, a friendly government, annexation) and see if the enemy would sign. Win a war and you dictate the peace at a conference.
- **Borders change:** when a war ends in a truce, the ceasefire line becomes the new border; a winner can also keep the land it occupied. The loser may come back years later to win it back.
- **Occupied lands:** every country you annex and every piece of land you take is a territory with unrest and integration. Choose a policy (garrison, integrate, exploit, autonomy), invest, crack down, or release it. Too much unrest and it rises up; full integration makes it yours for good.
- **Form a nation:** unite with your neighbours into Germany, Korea, Gran Colombia, the Maghreb Union and more. Every member must be a close friend, defeated by you, or already yours. Annexed lands can rebel and break free.
- **Alliances:** NATO, the Warsaw Pact, SEATO and the Rio Pact defend their members when they are attacked.
- **Civil wars** (⚔): arm a side or send troops. The rebels' territory is shown on the map.
- **Tension** rises with coups, invasions and crises. At 100 it is nuclear war and everyone loses. **Détente** (3 IP) lowers it.
- Real history happens along the way (the Berlin Blockade, the Cuban Missile Crisis, Vietnam, the fall of the Wall...) and as a superpower you sometimes decide what to do.

## Files
- `game.js`: the rules (also runs in Node: `node tools/balance.js` plays computer against computer, `node tools/nation.js` plays some nations)
- `data.js`: countries, capitals, alliances and historical events
- `neighbours.js`: which countries border each other (made by `node tools/build-neighbours.js`)
- `ui.js`, `style.css`, `index.html`: the screen
- `tools/test.html`: opens a game and plays it automatically, e.g. `tools/test.html#US,10` (10 years as the USA)
- `lib/`: d3, topojson-client and the world map (see Credits)

## Credits
- Map data: [Natural Earth](https://www.naturalearthdata.com/) (public domain) via [world-atlas](https://github.com/topojson/world-atlas) (ISC)
- [d3](https://d3js.org/) (ISC) and [topojson-client](https://github.com/topojson/topojson-client) (ISC)

## License
MIT. See `LICENSE`.
