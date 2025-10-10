// ==============================
// 🔹 Laad het juiste JSON-schema
// ==============================
async function loadScheduleFile(dayParam) {
  const day = dayParam || new URLSearchParams(window.location.search).get("day") || "wt1_day2";

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

  select.value = day;

  select.addEventListener("change", e => {
    const selectedDay = e.target.value;
    const newUrl = `${window.location.pathname}?day=${selectedDay}`;
    history.pushState({}, "", newUrl);
    loadSchedule(selectedDay);
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
  const day = dayParam || params.get("day") || "wt1_day2";

  // update dropdown of titel
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

        // Titel met heatnummer
        sub.innerHTML = `<h4>${h.name} <small style="color:#555;">(${i + 1} / ${heats.length})</small></h4>`;

        // Maak de tabel met kwalificatiekleuren
        const table = document.createElement("table");
        table.innerHTML = `
          <tr>
            <th>P</th>
            <th>Quali</th>
            <th>#</th>
            <th>Name</th>
            <th>Nation</th>
            <th>Time</th>

          </tr>
          ${h.event_result_round_heats_competitors.map(c => {
            const quali = c.qualification_code ?? "";
            let qualiStyle = "";

            if (quali.startsWith("Q")) qualiStyle = "background:#c8f7c5;";    // groen
            else if (quali === "ADV") qualiStyle = "background:#b3e5fc;";     // blauw
            else if (quali === "PEN") qualiStyle = "background:#ffcdd2;";     // rood
            else if (quali === "YC") qualiStyle = "background:#fff59d;";      // geel

            return `
              <tr ${c.started_for_nf_code === "BEL" ? "style='background:#ffeb3b;font-weight:bold;'" : ""}>
                <td>${c.final_rank ?? ""}</td>
                <td style="${qualiStyle}">${quali}</td>
                <td>${c.bib_number}</td>
                <td>${c.skaters?.full_name ?? ""}</td>
                <td>${c.started_for_nf_code}</td>
                <td>${c.final_result}</td>

              </tr>
            `;
          }).join("")}
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

  // ✅ Highlight het juiste event na het renderen
  highlightCurrentEvent();
}

// ==============================
// 🔹 Highlight huidig event
// ==============================
function highlightCurrentEvent() {
  const now = new Date();

  // Pak alle items met een .time
  const entries = [...document.querySelectorAll("#schedule li")]
    .map(item => {
      const t = item.querySelector(".time")?.textContent?.trim();
      if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
      const [h, m] = t.split(":").map(Number);
      const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
      return { item, dt };
    })
    .filter(Boolean)
    .sort((a, b) => a.dt - b.dt);

  if (entries.length === 0) return;

  // 1) Zoek de eerste in de toekomst
  let target = entries.find(e => e.dt >= now)?.item;

  // 2) Als alles al voorbij is, highlight de laatste
  if (!target) target = entries[entries.length - 1].item;

  // Visual reset + set
  document.querySelectorAll("#schedule li").forEach(li => li.classList.remove("current-event"));
  if (target) target.classList.add("current-event");
}

// ==============================
// 🔹 Auto-refresh toggle (werkt met localStorage)
// ==============================
function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (autoRefresh) {
      console.log("🔁 Auto-refresh actief — schema herladen");
      loadSchedule();
    }
  }, 240000);
}

let autoRefresh = false;  // standaard uit
let refreshInterval = null;

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(() => {
    if (autoRefresh) {
      console.log("🔁 Auto-refresh actief — schema herladen");
      loadSchedule();
    }
  }, 240000); // 4 minuten
}

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("auto-refresh");
  const isMobile = window.innerWidth <= 768;

  // 🔹 Op mobiel altijd uitzetten en niet tonen
  if (isMobile) {
    console.log("📱 Mobiel gedetecteerd — auto-refresh uitgeschakeld");
    autoRefresh = false;
    localStorage.setItem("autoRefreshEnabled", "false");
    if (toggle) toggle.checked = false;
  } else {
    // 🔹 Alleen op desktop voorkeur ophalen
    const saved = localStorage.getItem("autoRefreshEnabled");
    if (saved !== null) {
      autoRefresh = saved === "true";
    } else {
      localStorage.setItem("autoRefreshEnabled", "false");
    }

    if (toggle) toggle.checked = autoRefresh;

    if (toggle) {
      toggle.addEventListener("change", (e) => {
        autoRefresh = e.target.checked;
        localStorage.setItem("autoRefreshEnabled", String(autoRefresh));
        if (autoRefresh) startAutoRefresh();
        else clearInterval(refreshInterval);
      });
    }
  }

  // Interval opstarten (doet niks zolang autoRefresh = false)
  startAutoRefresh();

  // Initieel laden
  loadSchedule();
  highlightCurrentEvent();
  setInterval(highlightCurrentEvent, 60000);
});
