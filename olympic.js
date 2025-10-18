const POINTS_MAP = {
  1:10000, 2:8500, 3:7225, 4:6141, 5:5220, 6:4437, 7:3771, 8:3206, 9:2725, 10:2316,
  11:1969, 12:1673, 13:1422, 14:1209, 15:1028, 16:874, 17:743, 18:631, 19:536, 20:456,
  21:410, 22:369, 23:332, 24:299, 25:269, 26:242, 27:218, 28:196, 29:177, 30:159,
  31:143, 32:129, 33:116, 34:104, 35:94, 36:84, 37:76, 38:68, 39:62, 40:55, 41:50,
  42:45, 43:40, 44:36, 45:33, 46:29, 47:27, 48:24, 49:21, 50:19, 51:18, 52:17, 53:16,
  54:15, 55:14, 56:13, 57:12, 58:11, 59:10, 60:9, 61:8, 62:7, 63:6, 64:5, 65:4, 66:3,
  67:2, 68:1
};

function pointsForRank(rank) {
  const r = Number(rank);
  if (!r || isNaN(r)) return 0;
  return POINTS_MAP[r] || 1;
}

// ==============================
// 🔹 Haal heats op van ISU API
// ==============================
async function getHeats(event_result_id, event_result_round_id) {
  const endpoints = ["result-round-heats", "result-round-heats-team"];
  const formData = new FormData();
  formData.append("event_result_id", event_result_id);
  formData.append("event_result_round_id", event_result_round_id);

  for (const endpoint of endpoints) {
    const url = `https://api.isu-skating.com/api/eventresult/${endpoint}`;
    try {
      const resp = await fetch(url, {
        method: "POST",
        body: formData,
        headers: {
          "Accept": "application/json, text/plain, */*",
          "Origin": "https://isu-skating.com",
          "Referer": `https://isu-skating.com/short-track/results/isu-short-track-world-tour-14/${event_result_id}/`
        }
      });

      if (!resp.ok) continue;
      const data = await resp.json();
      if (data?.data?.length) console.log(event_result_id);
      if (data?.data?.length) return data.data;
    } catch (err) {
      console.warn(`Fout bij ophalen ${endpoint}:`, err);
    }
  }

  return [];
}

// ==============================
// 🔹 Laad de bron-JSON
// ==============================
async function loadOverallSources() {
  const resp = await fetch("schedules/overall_sources.json");
  return resp.json();
}

// ==============================
// 🔹 Bereken volledige ranking per WT
// ==============================
async function fetchFinalResultsFor(tour, gender, distance) {

  const sources = await loadOverallSources();
  const rounds = sources[tour]?.[gender]?.[distance]?.slice().reverse() ?? [];

  if (!rounds?.length) return [];

  const ROUND_PRIORITY = [
    "Finals", "Semi Finals", "Ranking Final",
    "Quarter Finals", "Repechage Semi Finals", "Repechage Quarter Finals",
    "Repechage Heats", "Heats", "Preliminaries"
  ];

  const roundRank = r => {
    const idx = ROUND_PRIORITY.findIndex(x => r.includes(x));
    return idx >= 0 ? idx : ROUND_PRIORITY.length;
  };
  console.log(roundRank);
  const allSkaters = {};
  counter = 1;

  for (const r of rounds) {
    if (!r.event_result_id || !r.event_result_round_id) continue;
    const heats = await getHeats(r.event_result_id, r.event_result_round_id);
    console.log(r);
    for (const h of heats) {
      console.log(h)
      if (!h.event_result_round_heats_competitors) continue;
      for (const c of h.event_result_round_heats_competitors) {
        const name = c.skaters?.full_name ?? "";
        const nation = c.started_for_nf_code ?? "";
        if (!name || !nation) continue;

        const result = (c.final_result ?? c.result ?? "").toUpperCase();
        const place = Number(c.finish_position ?? c.final_rank ?? c.rank ?? 999);
        const round = r.round;
        place = counter;
        // ✅ Controleer of het de "Finals" ronde is
        if (round === "Finals") {
          // ✅ Controleer of het heat-object een naam bevat met "A" (case-insensitive)
          if (h.name && h.name.toLowerCase().includes("a")) {
            // Voeg specifieke logica toe voor A-finale
            allSkaters[`${name}_${nation}`] = {
              name,
              nation,
              round,
              result,
              place,
              finale: "A"
            };

          } else {
            // Andere finale (B, C, Ranking, ...)
            allSkaters[`${name}_${nation}`] = {
              name,
              nation,
              round,
              result,
              place,
              finale: "other"
            };
          }
          counter += 1;
        } else {
          // Niet-finalerondes
          allSkaters[`${name}_${nation}`] = {
            name,
            nation,
            round,
            result,
            place
          };
        }
        console.log(allSkaters);

        const key = `${name}_${nation}`;
        const existing = allSkaters[key];

        if (
          !existing ||
          roundRank(round) < roundRank(existing.round) ||
          (roundRank(round) === roundRank(existing.round) && place < existing.place)
        ) {
          allSkaters[key] = { name, nation, round, result, place };
        }
      }
    }
  }

  const order = { FIN: 1, DNF: 2, PEN: 3, DNS: 4 };

  const sorted = Object.values(allSkaters).sort((a, b) => {
    const ra = roundRank(a.round);
    const rb = roundRank(b.round);
    if (ra !== rb) return ra - rb;
    const oa = order[a.result] ?? 99;
    const ob = order[b.result] ?? 99;
    if (oa !== ob) return oa - ob;
    return a.place - b.place;
  });

  sorted.forEach((s, i) => (s.rank = i + 1));
  return sorted;
}

// ==============================
// 🔹 Bereken olympic standings (alle of één tour)
// ==============================
async function computeOlympicStandings(gender, distance, selectedTour = null) {
  const sources = await loadOverallSources();
  const tours = selectedTour ? [selectedTour] : Object.keys(sources);
  const nationPoints = {};

  for (const tour of tours) {
    const results = await fetchFinalResultsFor(tour, gender, distance);
    const bestPerNation = {};

    for (const c of results) {
      const nation = c.nation ?? "";
      const rank = Number(c.rank ?? 999);
      if (!nation) continue;
      if (!bestPerNation[nation] || rank < bestPerNation[nation]) {
        bestPerNation[nation] = rank;
      }
    }

    for (const [nation, rank] of Object.entries(bestPerNation)) {
      const pts = pointsForRank(rank);
      if (!nationPoints[nation]) nationPoints[nation] = { total: 0, perTour: {} };
      nationPoints[nation].total += pts;
      nationPoints[nation].perTour[tour] = pts;
    }
  }

  const sorted = Object.entries(nationPoints)
    .map(([nation, data]) => ({ nation, ...data }))
    .sort((a, b) => b.total - a.total);

  return sorted;
}

// ==============================
// 🔹 Render functie voor tabelweergave
// ==============================
async function renderOlympicTable(gender, distance, selectedTour = null) {
  const container = document.getElementById("olympic-container");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  const data = await computeOlympicStandings(gender, distance, selectedTour);
  const tours = selectedTour ? [selectedTour] : Object.keys(await loadOverallSources());

  const table = document.createElement("table");
  table.innerHTML = `
    <tr>
      <th>#</th><th>Nation</th>
      ${tours.map(t => `<th>${t}</th>`).join("")}
      <th>Total</th>
    </tr>
    ${data.map((d, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${d.nation}</td>
        ${tours.map(t => `<td>${d.perTour[t] ?? 0}</td>`).join("")}
        <td>${d.total}</td>
      </tr>
    `).join("")}
  `;

  container.innerHTML = "";
  container.appendChild(table);
}
