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

async function loadOverallSources() {
  const resp = await fetch("schedules/overall_sources.json");
  return resp.json();
}
// ==============================
// 🔹 Laad de bron-JSON
// ==============================
async function fetchFinalResultsFor(tour, gender, distance) {
  const sources = await loadOverallSources();
  // Gebruik de volgorde zoals in je JSON staat:
  const rounds = sources[tour]?.[gender]?.[distance] ?? [];
  if (!rounds.length) return [];

  const seen = new Set();                   // om duplicaten te vermijden
  const addKey = (n, nat) => `${n}__${nat}`;
  const ranking = [];

  // Hulpfunctie: voeg skaters toe uit een heat, gesorteerd op plaats
  function pushFromHeat(heat, roundLabelOverride = null) {
    const competitors = heat.event_result_round_heats_competitors ?? [];
    // sorteer op plaats indien beschikbaar
    const rows = [...competitors].sort((a, b) => {
      const pa = Number(a.finish_position ?? a.final_rank ?? a.rank ?? 999);
      const pb = Number(b.finish_position ?? b.final_rank ?? b.rank ?? 999);
      return pa - pb;
    });

    for (const c of rows) {
      const name = c.skaters?.full_name ?? "";
      const nation = c.started_for_nf_code ?? "";
      if (!name || !nation) continue;

      const key = addKey(name, nation);
      if (seen.has(key)) continue; // al hoger geplaatst (bv. A of B)

      const result = (c.final_result ?? c.result ?? "").toUpperCase();
      const place  = Number(c.finish_position ?? c.final_rank ?? c.rank ?? 999);

      ranking.push({
        name,
        nation,
        result,
        place,
        round: roundLabelOverride || heat.name || ""
      });
      seen.add(key);
    }
  }

  // Loop de rondes af in JSON-volgorde
  for (const r of rounds) {
    const { event_result_id, event_result_round_id, round } = r;
    if (!event_result_id || !event_result_round_id) continue;

    const heats = await getHeats(event_result_id, event_result_round_id);
    if (!heats?.length) continue;

    if (round === "Finals") {
      // 1) Final A eerst
      const aHeats = heats.filter(h => (h.name ?? "").toLowerCase().includes("final a"));
      for (const h of aHeats) pushFromHeat(h, "Final A");

      // 2) Final B daarna
      const bHeats = heats.filter(h => (h.name ?? "").toLowerCase().includes("final b"));
      for (const h of bHeats) pushFromHeat(h, "Final B");

      // (optioneel later) andere finals zoals "Ranking Final" pas na A/B toevoegen:
      // const otherHeats = heats.filter(h => !/final a|final b/i.test(h.name ?? ""));
      // for (const h of otherHeats) pushFromHeat(h, h.name);
    } else {
      // Niet-finals: gewoon in heatvolgorde toevoegen, duplicaten worden automatisch geskipt
      for (const h of heats) pushFromHeat(h, round);
    }
  }

  // Rangnummers toekennen volgens uiteindelijke volgorde
  ranking.sort((a, b) => {
    // volgorde is al bepaald door JSON-loop; binnen elke ronde hebben we op place gesorteerd.
    // Als je absolute sort wil forceren: eerst op round-buckets (A, B, ...), dan place.
    // Hier laten we de JSON-loop volgorde leidend zijn.
    return 0;
  });
  ranking.forEach((s, i) => (s.rank = i + 1));

  return ranking;
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
