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
// 🔹 Haal heats op van ISU API (met automatische fallback)
// ==============================
async function getHeats(event_result_id, event_result_round_id) {
  const endpoints = [
    "result-round-heats",       // standaard individuele heats
    "result-round-heats-team"   // team / relay heats
  ];

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
      if (data?.data?.length) {
        console.log(`✅ Data gevonden via ${endpoint}`);
        return data.data;
      } else {
        console.log(`⚠️ Geen data via ${endpoint}`);
      }
    } catch (err) {
      console.warn(`❌ Fout bij ${endpoint}:`, err);
    }
  }

  console.log("❌ Geen heats gevonden voor:", event_result_id, event_result_round_id);
  return [];
}

async function loadOverallSources() {
  const resp = await fetch("schedules/overall_sources.json");
  return resp.json();
}

async function fetchFinalResultsFor(tour, gender, distance) {
  const sources = await loadOverallSources();
  const finals = sources[tour]?.[gender]?.[distance]?.find(r => /Final/i.test(r.round));
  if (!finals) return [];
  const heats = await getHeats(finals.event_result_id, finals.event_result_round_id);
  return heats?.[0]?.event_result_round_heats_competitors || [];
}

async function computeOlympicStandings(gender, distance) {
  const sources = await loadOverallSources();
  const tours = Object.keys(sources);
  const nationPoints = {};

  for (const tour of tours) {
    const results = await fetchFinalResultsFor(tour, gender, distance);
    const bestPerNation = {};

    for (const c of results) {
      const nation = c.started_for_nf_code ?? "";
      const rank = Number(c.final_rank ?? 999);
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

  // sort descending
  const sorted = Object.entries(nationPoints)
    .map(([nation, data]) => ({ nation, ...data }))
    .sort((a, b) => b.total - a.total);

  return sorted;
}

async function renderOlympicTable(gender, distance) {
  const container = document.getElementById("olympic-container");
  container.innerHTML = "<p>Loading...</p>";

  const data = await computeOlympicStandings(gender, distance);
  const tours = Object.keys((await loadOverallSources()));

  const table = document.createElement("table");
  table.innerHTML = `
    <tr>
      <th>#</th><th>Nation</th>
      ${tours.map(t => `<th>${t}</th>`).join("")}
      <th>Total</th>
    </tr>
    ${data.map((d, i) => `
      <tr>
        <td>${i+1}</td>
        <td>${d.nation}</td>
        ${tours.map(t => `<td>${d.perTour[t] ?? 0}</td>`).join("")}
        <td>${d.total}</td>
      </tr>
    `).join("")}
  `;
  container.innerHTML = "";
  container.appendChild(table);
}

document.addEventListener("DOMContentLoaded", async () => {
  const genderSelect = document.getElementById("gender-select");
  const distanceSelect = document.getElementById("distance-select");

  async function update() {
    await renderOlympicTable(genderSelect.value, distanceSelect.value);
  }

  genderSelect.addEventListener("change", update);
  distanceSelect.addEventListener("change", update);

  await update();
});
