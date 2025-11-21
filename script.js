// Duur per afstand in minuten (kan je aanpassen)
const heatDurations = {
  "500": 3,
  "1000": 4,
  "1500": 5,
  "2000": 6,
  "3000": 8,
  "5000": 9
};
// ==============================
// 🔹 Laad het juiste JSON-schema
// ==============================
async function loadScheduleFile(dayParam) {
  const day = dayParam || new URLSearchParams(window.location.search).get("day") || "wt3_day3";
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

function getLocalEventTime(sTime, eventTimezone) {
  // sTime is "HH:MM", bv "10:00"
  const [hh, mm] = sTime.split(":").map(Number);

  // 1) Bepaal de kalenderdag in de event-tijdzone (jaar, maand, dag)
  const fmtDay = new Intl.DateTimeFormat("en-CA", {
    timeZone: eventTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dayParts = fmtDay.formatToParts(new Date());
  const year  = Number(dayParts.find(p => p.type === "year").value);
  const month = Number(dayParts.find(p => p.type === "month").value);
  const day   = Number(dayParts.find(p => p.type === "day").value);

  // 2) Helper om offset in MINUTEN voor een zone op een bepaald UTC-moment te pakken
  function getOffsetMinutes(date, tz) {
    const f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",   // bv. "GMT-4"
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    });
    const parts = f.formatToParts(date);
    const name = parts.find(p => p.type === "timeZoneName")?.value || "GMT+0";
    const m = name.match(/GMT([+\-]\d{1,2})(?::?(\d{2}))?/);
    if (!m) return 0;
    const sign = m[1].startsWith("-") ? -1 : 1;
    const h = Math.abs(parseInt(m[1], 10));
    const mi = m[2] ? parseInt(m[2], 10) : 0;
    return sign * (h * 60 + mi);
  }

  // 3) Bereken het *UTC-tijdstip* dat hoort bij "jaar-maand-dag HH:MM" in de event-tijdzone.
  //   UTC = (wall-time als UTC) - eventOffset
  //   Eerst een UTC "basis" met dezelfde cijfers (nog zonder offsetcorrectie):
  const utcBase = Date.UTC(year, month - 1, day, hh, mm);
  //   Pak de offset van de event-zone op dat moment:
  const eventOffsetMin = getOffsetMinutes(new Date(utcBase), eventTimezone); // bv. GMT-4 => -240
  //   Corrigeer naar de echte UTC van de event-wall-time:
  const utcEventMs = utcBase - eventOffsetMin * 60_000;

  // 4) Maak lokale Date en label voor de gebruiker
  const localDate = new Date(utcEventMs);
  const localLabel = localDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  // 5) ISO teruggeven voor highlight, label voor weergave
  return { label: localLabel, iso: localDate.toISOString() };
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

  //console.log("❌ Geen heats gevonden voor:", event_result_id, event_result_round_id);
  return [];
}

// ==============================
// 🔹 Bouw het schema op in de pagina
// ==============================
async function loadSchedule(dayParam) {
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  const params = new URLSearchParams(window.location.search);
  const day = dayParam || params.get("day") || "wt3_day3";

  syncDropdown(day);

  const scheduleData = await loadScheduleFile(day);
  const schedule = scheduleData.schedule || scheduleData;
  const eventTimezone = scheduleData.timezone || "America/Toronto";

  let index = 0;
  for (const s of schedule) {
    const next = schedule[index + 1]; // volgende blok (kan undefined zijn)
    // Converteer eventtijd naar lokale tijdzone
    const { label: localLabel, iso } = getLocalEventTime(s.time, eventTimezone);

    const li = document.createElement("li");
    li.className = "heat-header";
    li.innerHTML = `
      <span class='time' data-event-time='${iso}'>${localLabel}</span>
      ${s.description || `${s.gender} ${s.distance} ${s.round}`}
      ${s.Q_info ? `<span style="color:#666; margin-right: 7.5rem;">(Q: ${s.Q_info})</span>` : ""}
    `;
    container.appendChild(li);

    // Bepaal of dit blok "oud" is op basis van de volgende blok
    let isBlockOld = false;

    if (next && next.time) {
      const { iso: nextIso } = getLocalEventTime(next.time, eventTimezone);
      const nextStartUtc = new Date(nextIso);

      // blok is klaar op start volgende blok; we wachten nog 20 minuten
      const hideAfter = nextStartUtc.getTime() + 20 * 60 * 1000;
      isBlockOld = Date.now() > hideAfter;
    }
    // Als er geen volgende blok is (laatste van de dag), dan blijft isBlockOld = false
    index++;
    if (!s.event_result_id) continue;

    try {
      const heats = await getHeats(s.event_result_id, s.event_result_round_id);
      if (!heats.length) continue;

      // 🔹 Filter specifieke finale (A/B) als nodig
      let filteredHeats = heats;
      if (s.round && /final/i.test(s.round)) {
        const matchLetter = s.round.match(/Final\s*([AB])/i);
        if (matchLetter) {
          const letter = matchLetter[1].toUpperCase();
          // Alleen heats met exacte 'Final A' of 'Final B' in de naam
          const regex = new RegExp(`Final\\s*${letter}$`, "i");
          filteredHeats = heats.filter(h => regex.test(h.name ?? ""));
        }
      }

      // 🔹 standaard: enkel Belgische heats tonen
      let belgianHeats = filteredHeats.filter(hasBelgian);

      // knop om alles te tonen
      const toggleBtn = document.createElement("button");
      toggleBtn.textContent = "Show All Heats";
      toggleBtn.className = "toggle-heats-btn";
      li.appendChild(toggleBtn);

      // container voor heats
      const heatsContainer = document.createElement("div");
      li.appendChild(heatsContainer);

      // renderfunctie (Belgian of All)
      function renderHeats(showAll = false) {
        heatsContainer.innerHTML = "";
        const displayHeats = showAll ? heats : belgianHeats;

        for (const h of displayHeats) {
          const sub = document.createElement("div");
          // schatting van starttijd van heat
          const perHeatMinutes = heatDurations[s.distance] || 3; // standaard 3 min per heat
          const heatIndex = parseInt(h.name.match(/\d+/)?.[0] || 1, 10) - 1;
          const [startHour, startMin] = s.time.split(":").map(Number);
          const totalMinutes = startHour * 60 + startMin + heatIndex * perHeatMinutes;
          const estHour = Math.floor(totalMinutes / 60) % 24;
          const estMin = totalMinutes % 60;
          const estTimeString = `${String(estHour).padStart(2, "0")}:${String(estMin).padStart(2, "0")}`;
          const { label: estLabel } = getLocalEventTime(estTimeString, eventTimezone);

          // 🔹 Toon naam + geschatte lokale starttijd
          sub.innerHTML = `<h4>${h.name} <small style="color:#666;">~${estLabel}</small></h4>`;

          const table = document.createElement("table");
          table.innerHTML = `
            <tr>
              <th>P</th><th>Q</th><th>#</th><th>Name</th><th>Nation</th><th>Time</th><th>Splits</th>
            </tr>
            ${h.event_result_round_heats_competitors.map(c => `
              <tr ${c.started_for_nf_code === "BEL" ? "style='background:#ffeb3b;font-weight:bold;'" : ""}>
                <td>${c.final_rank ?? ""}</td>
                <td>${c.qualification_code ?? ""}</td>
                <td>${c.bib_number ?? ""}</td>
                <td>${c.skaters?.full_name ?? ""}</td>
                <td>${c.started_for_nf_code ?? ""}</td>
                <td>${c.final_result ?? ""}</td>
                <td>${c.lep?.map(l => l.LapTime || l.Time || "").join(" / ") ?? ""}</td>
              </tr>
            `).join("")}
          `;
          // Maak een scrollbare container rond de tabel
          const tableContainer = document.createElement("div");
          tableContainer.classList.add("table-container");
          tableContainer.appendChild(table);
          sub.appendChild(tableContainer);
          heatsContainer.appendChild(sub);
        }
      }

      // 🔹 gedrag afhankelijk van isBlockOld
      let showAll = false;

      if (isBlockOld) {
        // Oud blok: standaard alles verbergen (ook BEL)
        heatsContainer.style.display = "none";
        toggleBtn.textContent = "Show All Heats";

        toggleBtn.addEventListener("click", () => {
          const hidden = heatsContainer.style.display === "none";
          if (hidden) {
            heatsContainer.style.display = "";
            // bij oude blokken tonen we meteen ALLE heats
            renderHeats(true);
            toggleBtn.textContent = "Hide Heats";
          } else {
            heatsContainer.style.display = "none";
            toggleBtn.textContent = "Show All Heats";
          }
        });
      } else {
        // Actueel blok: zoals vroeger
        renderHeats(false); // start met alleen BEL

        toggleBtn.addEventListener("click", () => {
          showAll = !showAll;
          toggleBtn.textContent = showAll ? "Hide Non-BEL Heats" : "Show All Heats";
          renderHeats(showAll);
        });
      }

    } catch (err) {
      console.error("Error loading heats:", err);
    }

  }

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
  let currentIndex = -1;

  for (let i = 0; i < times.length; i++) {
    const thisEvent = times[i];
    const nextEvent = times[i + 1];
    const startTime = thisEvent.time;
    const endTime = nextEvent
      ? nextEvent.time                     // blok stopt bij start volgende blok
      : new Date(startTime.getTime() + 60 * 60 * 1000); // fallback: +1u

    if (now >= startTime && now < endTime) {
      currentEvent = thisEvent.el;
      currentIndex = i;
      break;
    }
  }

  // Alles resetten
  scheduleItems.forEach(item => {
    item.classList.remove("current-event");
    item.classList.remove("finished-event");
  });

  // Huidige blok
  if (currentEvent) {
    currentEvent.classList.add("current-event");
  }

  // Alle blokken vóór de huidige worden "finished"
  if (currentIndex > 0) {
    for (let i = 0; i < currentIndex; i++) {
      times[i].el.classList.add("finished-event");
    }
  }

  // Optioneel: als we na het laatste event zitten, markeer alles als finished
  if (currentIndex === -1 && times.length > 0 && now > times[times.length - 1].time) {
    times.forEach(t => t.el.classList.add("finished-event"));
  }
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
      //console.log("🔁 Auto-refresh actief — schema herladen");

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
    //console.log("📱 Mobiel gedetecteerd — auto-refresh uitgeschakeld");
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
