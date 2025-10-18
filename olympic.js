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
  const rounds = sources[tour]?.[gender]?.[distance] ?? [];
  if (!rounds.length) return [];

  const seen = new Set();
  const ranking = [];
  const addKey = (n, nat) => `${n}__${nat}`;

  // 🔹 Binnen één ronde sorteren volgens ISU-logica
  const ORDER_WEIGHT = { FIN: 1, DNF: 2, PEN: 3, DNS: 4 };

  function sortRoundEntries(entries) {
    // per finish-positie en result-type
    entries.sort((a, b) => {
      const resA = ORDER_WEIGHT[a.result] ?? 99;
      const resB = ORDER_WEIGHT[b.result] ?? 99;
      if (resA !== resB) return resA - resB;
      return a.place - b.place;
    });
    // groepering: eerst alle 1e, dan 2e, enz.
    const grouped = [];
    const maxPos = Math.max(...entries.map(e => e.place || 999));
    for (let pos = 1; pos <= maxPos; pos++) {
      const sub = entries.filter(e => e.place === pos && (e.result === "FIN" || !e.result));
      if (sub.length) grouped.push(...sub);
    }
    // voeg DNF, PEN, DNS toe achteraan in vaste volgorde
    for (const key of ["DNF", "PEN", "DNS"]) {
      const sub = entries.filter(e => e.result === key);
      if (sub.length) grouped.push(...sub);
    }
    return grouped;
  }

  function collectCompetitors(heat, roundLabel) {
    const entries = [];
    for (const c of heat.event_result_round_heats_competitors ?? []) {
      const name = c.skaters?.full_name ?? "";
      const nation = c.started_for_nf_code ?? "";
      if (!name || !nation) continue;
      if (seen.has(addKey(name, nation))) continue;

      const result = (c.final_result ?? c.result ?? "").toUpperCase();
      const place  = Number(c.finish_position ?? c.final_rank ?? c.rank ?? 999);

      entries.push({ name, nation, result, place, round: roundLabel });
    }
    return entries;
  }

  // 🔹 Loop alle rondes in JSON-volgorde
  for (const r of rounds) {
    const heats = await getHeats(r.event_result_id, r.event_result_round_id);
    if (!heats?.length) continue;

    let allEntries = [];

    if (r.round === "Finals") {
      // A-finale eerst
      for (const h of heats.filter(h => (h.name ?? "").toLowerCase().includes("final a"))) {
        allEntries.push(...collectCompetitors(h, "Final A"));
      }
      // B-finale daarna
      for (const h of heats.filter(h => (h.name ?? "").toLowerCase().includes("final b"))) {
        allEntries.push(...collectCompetitors(h, "Final B"));
      }
    } else {
      // Andere rondes (Semi, Quarter, Rep., Heats,…)
      for (const h of heats) {
        allEntries.push(...collectCompetitors(h, r.round));
      }
    }

    // Sorteren binnen de ronde volgens ISU-regels
    const sortedRound = sortRoundEntries(allEntries);

    // Voeg toe en markeer als verwerkt
    for (const s of sortedRound) {
      const key = addKey(s.name, s.nation);
      if (seen.has(key)) continue;
      ranking.push(s);
      seen.add(key);
    }
  }

  // 🔹 Eindsortering = JSON-volgorde van rondes blijft leidend
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
