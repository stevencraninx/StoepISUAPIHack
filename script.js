// ==============================
// 🔹 Laad het juiste JSON-schema
// ==============================
async function loadScheduleFile(dayParam) {
  const day = dayParam || new URLSearchParams(window.location.search).get("day") || "wt1_day4";
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
    c.skaters?.nationality_code === "BEL" || c.started_for_nf_code === "BEL"
  );
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

// ==============================
// 🔹 Bouw het schema op in de pagina
// ==============================
async function loadSchedule(dayParam) {
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  const params = new URLSearchParams(window.location.search);
  const day = dayParam || params.get("day") || "wt1_day4";

  // update dropdown of titel
  syncDropdown(day);

  const scheduleData = await loadScheduleFile(day);
  const schedule = scheduleData.schedule || scheduleData;
  const eventTimezone = scheduleData.timezone || "America/Toronto";

  // Toon tijdzone-informatie bovenaan
  let tzInfo = document.getElementById("timezone-info");
  if (!tzInfo) {
    tzInfo = document.createElement("p");
    tzInfo.id = "timezone-info";
    container.parentElement.insertBefore(tzInfo, container);
  }
  const eventTimeInLocal = new Date().toLocaleString("en-US", { timeZone: eventTimezone });
  const eventOffset = new Date(eventTimeInLocal).getTimezoneOffset();
  const localOffset = new Date().getTimezoneOffset();
  const diffHours = Math.round((localOffset - eventOffset) / 60);
  tzInfo.textContent =
    `⏰ Times shown in your local timezone (${diffHours > 0 ? diffHours + "h ahead" : diffHours < 0 ? -diffHours + "h behind" : "same time"} as event time).`;

  for (const s of schedule) {
    // Converteer naar lokale tijd
    const [h, m] = s.time.split(":").map(Number);
    const eventTime = new Date(new Date().toLocaleString("en-US", { timeZone: eventTimezone }));
    eventTime.setHours(h, m, 0, 0);

    const localTime = eventTime.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const li = document.createElement("li");
    li.innerHTML = `
      <span class='time' data-event-time='${eventTime.toISOString()}'>${localTime}</span>
      ${s.description || `${s.gender} ${s.distance} ${s.round}`}
      ${s.Q_info ? `<span style="color:#666;">(Q: ${s.Q_info})</span>` : ""}
    `;
    container.appendChild(li);

    if (!s.event_result_id) continue;

    try {
      const heats = await getHeats(s.event_result_id, s.event_result_round_id);

      // 🔹 Filter specifieke finale (A/B) als nodig
      let filteredHeats = heats;
      if (s.round && /final/i.test(s.round)) {
        const matchLetter = s.round.match(/Final\s*([AB])/i);
        if (matchLetter) {
          const letter = matchLetter[1].toUpperCase();
          const regex = new RegExp(`Final\\s*${letter}$`, "i");
          filteredHeats = heats.filter(h => regex.test(h.name ?? ""));
        }
      }

      // 🔹 Enkel Belgische heats behouden
      const belgianHeats = filteredHeats.filter(hasBelgian);
      if (belgianHeats.length === 0) continue;

      for (let i = 0; i < belgianHeats.length; i++) {
        const h = belgianHeats[i];
        const sub = document.createElement("div");

        sub.innerHTML = `<h4>${h.name} <small style="color:#555;">(${i + 1} / ${filteredHeats.length})</small></h4>`;

        const table = document.createElement("table");
        table.innerHTML = `
          <tr>
            <th>P</th><th>Q</th><th>#</th><th>Name</th><th>Nation</th><th>Time</th><th>Splits</th>
          </tr>
          ${h.event_result_round_heats_competitors.map(c => {
            // ✅ Toon LapTime uit lep-array
            const splits = Array.isArray(c.lep)
              ? c.lep.map(l => l.LapTime || l.Time || "").filter(Boolean).join(" / ")
              : "";

            return `
              <tr ${c.started_for_nf_code === "BEL" ? "style='background:#ffeb3b;font-weight:bold;'" : ""}>
                <td>${c.final_rank ?? ""}</td>
                <td>${c.qualification_code ?? ""}</td>
                <td>${c.bib_number ?? ""}</td>
                <td>${c.skaters?.full_name ?? ""}</td>
                <td>${c.started_for_nf_code ?? ""}</td>
                <td>${c.final_result ?? ""}</td>
                <td>${splits}</td>
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
  const scheduleItems = document.querySelectorAll("#schedule li");
  if (scheduleItems.length === 0) return;

  const now = new Date();
  const times = [];

  scheduleItems.forEach(item => {
    const timeEl = item.querySelector(".time");
    if (!timeEl) return;
    const eventTime = new Date(timeEl.getAttribute("data-event-time"));
    times.push({ el: item, time: eventTime });
  });

  times.sort((a, b) => a.time - b.time);

  let currentEvent = null;
  for (let i = 0; i < times.length; i++) {
    const thisEvent = times[i];
    const nextEvent = times[i + 1];
    const startTime = thisEvent.time;
    const endTime = nextEvent ? nextEvent.time : new Date(startTime.getTime() + 60 * 60 * 1000);
    if (now >= startTime && now < endTime) {
      currentEvent = thisEvent.el;
      break;
    }
  }

  scheduleItems.forEach(item => item.classList.remove("current-event"));
  if (currentEvent) currentEvent.classList.add("current-event");
}

// ==============================
// 🔹 Auto-refresh met scroll naar huidig event
// ==============================
function scrollToCurrentEvent() {
  const current = document.querySelector(".current-event");
  if (current) current.scrollIntoView({ behavior: "smooth", block: "center" });
}

function startAutoRefresh() {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    if (autoRefresh) {
      console.log("🔁 Auto-refresh actief — schema herladen");

      const currentBefore = document.querySelector(".current-event");
      const currentTime = currentBefore?.querySelector(".time")?.textContent;

      await loadSchedule();

      highlightCurrentEvent();
      let target = document.querySelector(".current-event");
      if (!target && currentTime) {
        target = Array.from(document.querySelectorAll(".time"))
          .find(t => t.textContent.trim() === currentTime)?.closest("li");
      }
      if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, 240000);
}

let autoRefresh = false;
let refreshInterval = null;

document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.getElementById("auto-refresh");
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    console.log("📱 Mobiel gedetecteerd — auto-refresh uitgeschakeld");
    autoRefresh = false;
    localStorage.setItem("autoRefreshEnabled", "false");
    if (toggle) toggle.checked = false;
  } else {
    const saved = localStorage.getItem("autoRefreshEnabled");
    if (saved !== null) autoRefresh = saved === "true";
    else localStorage.setItem("autoRefreshEnabled", "false");

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

  startAutoRefresh();

  loadSchedule().then(() => {
    highlightCurrentEvent();
  });
  setInterval(highlightCurrentEvent, 60000);
});

// 🔹 Hamburger dropdown toggle
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger-btn");
  const menu = document.getElementById("mobile-menu");

  if (hamburger && menu) {
    hamburger.addEventListener("click", () => {
      hamburger.classList.toggle("open");
      menu.classList.toggle("open");
    });

    // Sluit menu bij klik op link
    menu.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        hamburger.classList.remove("open");
        menu.classList.remove("open");
      });
    });
  }
});
