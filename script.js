// ==============================
// 🔹 Laad het juiste JSON-schema
// ==============================
async function loadScheduleFile(dayParam) {
  // Controleer of er een dagparameter in de URL of dropdown is
  const day = dayParam || new URLSearchParams(window.location.search).get("day") || "wt1_day1";

  try {
    const resp = await fetch(`schedules/${day}.json`);
    if (!resp.ok) throw new Error(`Kon ${day}.json niet laden`);
    return await resp.json();
  } catch (err) {
    console.error("Fout bij laden van schema:", err);
    return [];
  }
}

// ==============================
// 🔹 Sync dropdown & laad nieuw schema bij wijziging
// ==============================
function syncDropdown(day) {
  const select = document.getElementById("day-select");
  if (!select) return;

  // Stel huidige dag in op basis van URL
  select.value = day;

  // Bij verandering in dropdown
  select.addEventListener("change", e => {
    const selectedDay = e.target.value;
    const newUrl = `${window.location.pathname}?day=${selectedDay}`;
    history.pushState({}, "", newUrl); // URL bijwerken zonder reload
    loadSchedule(selectedDay); // Herlaad schema
  });
}
// ==============================
// 🔹 Controleer of er een Belg in zit
// ==============================
function hasBelgian(heat) {
  return heat.event_result_round_heats_competitors?.some(c =>
    c.skaters?.nationality_code === "BEL" ||
    c.started_for_nf_code === "BEL"
  );
}

// ==============================
// 🔹 Haal heats op van de ISU API
// ==============================
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
  return data?.data || [];
}

// ==============================
// 🔹 Bouw het schema op in de pagina
// ==============================
async function loadSchedule(dayParam) {
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  const params = new URLSearchParams(window.location.search);
  const day = dayParam || params.get("day") || "day1";

  // Update dropdown + titel
  syncDropdown(day);

  const schedule = await loadScheduleFile(day);

  for (const s of schedule) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class='time'>${s.time}</span>
      ${s.description || `${s.gender} ${s.distance} ${s.round}`}
      ${s.Q_info ? `<span style="color:#666;">(Q: ${s.Q_info})</span>` : ""}
    `;
    container.appendChild(li);

    if (!s.event_result_id) continue;

    try {
      const heats = await getHeats(s.event_result_id, s.event_result_round_id);
      const belgianHeats = heats.filter(hasBelgian);

      if (belgianHeats.length === 0) continue;

      for (let i = 0; i < belgianHeats.length; i++) {
        const h = belgianHeats[i];
        const sub = document.createElement("div");
        sub.innerHTML = `<h4>${h.name} <small style="color:#555;">(${i + 1} / ${heats.length})</small></h4>`;

        const table = document.createElement("table");
        table.innerHTML = `
          <tr><th>P</th><th>#</th><th>Name</th><th>Nation</th><th>Time</th></tr>
          ${h.event_result_round_heats_competitors.map(c => `
            <tr ${c.started_for_nf_code === "BEL" ? "style='background:#ffeb3b;font-weight:bold;'" : ""}>
              <td>${c.final_rank ?? ""}</td>
              <td>${c.bib_number}</td>
              <td>${c.skaters?.full_name ?? ""}</td>
              <td>${c.started_for_nf_code}</td>
              <td>${c.final_result}</td>
            </tr>
          `).join("")}
        `;

        const tableContainer = document.createElement("div");
        tableContainer.classList.add("table-container");
        tableContainer.appendChild(table);

        sub.appendChild(tableContainer);
        li.appendChild(sub);
      }
    } catch (err) {
      console.error("Error loading heats:", err);
    }
  }
}

// ==============================
// 🔹 Highlight huidig event
// ==============================
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

// ==============================
// 🔹 Init
// ==============================
highlightCurrentEvent();
setInterval(highlightCurrentEvent, 60000);

loadSchedule();
setInterval(loadSchedule, 240000);
