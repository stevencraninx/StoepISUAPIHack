const schedule = [
    {"time": "09:30", "gender": "Men", "distance": "1000", "round": "Preliminaries", "Q_info": "1 + 5", "event_result_id": "11813645", "event_result_round_id": "4088525"},
    {"time": "10:30", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "10:45", "gender": "Women", "distance": "500", "round": "Preliminaries", "Q_info": "2 + 4", "event_result_id": "11813641", "event_result_round_id": "4088533"},
    {"time": "11:09", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "11:24", "gender": "Men", "distance": "1000", "round": "Heats", "Q_info": "2 + 2", "event_result_id": "11813645", "event_result_round_id": "4088526"},
    {"time": "11:56", "description": "Lunch break", "event_result_id": ""},
    {"time": "12:55", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "13:15", "gender": "Women", "distance": "500", "round": "Heats", "Q_info": "2 + 2", "event_result_id": "11813641", "event_result_round_id": "4088534"},
    {"time": "13:39", "gender": "Men", "distance": "5000", "round": "Quarterfinals", "Q_info": "2", "event_result_id": "", "event_result_round_id": ""},
    {"time": "14:19", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "14:34", "gender": "Women", "distance": "1500", "round": "Quarterfinals", "Q_info": "2 + 1", "event_result_id": "11813644", "event_result_round_id": "4088545"},
    {"time": "15:19", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "15:34", "gender": "Men", "distance": "1000", "round": "Rep. Heats", "Q_info": "1 + 7", "event_result_id": "11813645", "event_result_round_id": "4088527"},
    {"time": "16:26", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "16:41", "gender": "Mixed", "distance": "2000", "round": "Team Relay Semi Finals", "Q_info": "2", "event_result_id": "11813643", "event_result_round_id": "4088523"},
    {"time": "16:53", "gender": "Mixed", "distance": "2000", "round": "Team Relay Ranking Final", "Q_info": "", "event_result_id": "11813643", "event_result_round_id": "4088522"},
    {"time": "16:59", "description": "Ice resurfacing", "event_result_id": ""},
    {"time": "17:14", "gender": "Women", "distance": "500", "round": "Rep. Heats", "Q_info": "2 + 2", "event_result_id": "11813641", "event_result_round_id": "4088535"},
    {"time": "17:41", "gender": "Men", "distance": "5000", "round": "Ranking Final", "Q_info": "", "event_result_id": "11813647", "event_result_round_id": "4088541"},
    {"time": "17:57", "description": "End", "event_result_id": ""}
]

function hasBelgian(heat) {
  // Controleer of minstens één competitor Belg is
  return heat.event_result_round_heats_competitors?.some(c =>
    c.skaters?.nationality_code === "BEL" ||
    c.started_for_nf_code === "BEL"
  );
}

async function getHeats(event_result_id, event_result_round_id) {
  const url = "https://api.isu-skating.com/api/eventresult/result-round-heats";
  const formData = new FormData();
  formData.append("event_result_id", event_result_id);
  formData.append("event_result_round_id", event_result_round_id);

  const resp = await fetch(url, {
    method: "POST",
    body: formData,
    headers: {
      "Accept": "application/json, text/plain, */*",
      "Origin": "https://isu-skating.com",
      "Referer": `https://isu-skating.com/short-track/results/isu-short-track-world-tour-14/${event_result_id}/`
    }
  });

  if (!resp.ok) throw new Error(`ISU API error: ${resp.status}`);
  const data = await resp.json();

  console.log("Raw API response:", data);

  // ✅ Gebruik de juiste structuur
  return data?.data || [];
}

async function loadSchedule() {
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  for (const s of schedule) {
    const li = document.createElement("li");
    li.innerHTML = `<span class='time'>${s.time}</span> ${s.description || `${s.gender} ${s.distance} ${s.round}`}`;
    container.appendChild(li);

    if (!s.event_result_id) continue;

    try {
      const heats = await getHeats(s.event_result_id, s.event_result_round_id);
      const belgianHeats = heats.filter(hasBelgian);
      console.log("belgianHeats ", belgianHeats);

      for (const h of belgianHeats) {
        const sub = document.createElement("div");
        sub.innerHTML = `<h4>${h.name}</h4>`;
        const table = document.createElement("table");
        table.innerHTML = `
          <tr><th>P</th><th>#</th><th>Name</th><th>Nation</th><th>Time</th></tr>
          ${h.event_result_round_heats_competitors.map(c => `
            <tr ${c.started_for_nf_code === "BEL" ? "style='background: #ffeb3b; font-weight: bold;'" : ""}>
              <td>${c.final_rank ?? ""}</td>
              <td>${c.bib_number}</td>
              <td>${c.skaters?.full_name ?? ""}</td>
              <td>${c.started_for_nf_code}</td>
              <td>${c.final_result}</td>
            </tr>
          `).join("")}
        `;
        sub.appendChild(table);
        li.appendChild(sub);
      }
    } catch (err) {
      console.error(err);
    }
  }
}

function highlightCurrentEvent() {
  const currentTime = new Date();
  const scheduleItems = document.querySelectorAll("#schedule li");
  let currentEvent = null;
  let smallestDiff = Infinity;

  scheduleItems.forEach(item => {
    const timeEl = item.querySelector(".time");
    if (!timeEl) return;
    const time = timeEl.textContent.trim();
    const [h, m] = time.split(":").map(Number);
    const eventTime = new Date(currentTime.getFullYear(), currentTime.getMonth(), currentTime.getDate(), h, m);
    const diff = Math.abs(currentTime - eventTime);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      currentEvent = item;
    }
  });

  document.querySelectorAll("#schedule li").forEach(li => li.classList.remove("current-event"));
  if (currentEvent) currentEvent.classList.add("current-event");
}

setInterval(highlightCurrentEvent, 60000);
highlightCurrentEvent();

// laad onmiddellijk bij opstart
loadSchedule();
// ververs om de 4 minuten
setInterval(loadSchedule, 240000);
