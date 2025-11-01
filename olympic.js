async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Probeert te laden; bij 404 of parse-fout -> lege lijst.
// Zo kunnen WT3/WT4 “nog niet bestaan” zonder errors.
async function loadMaybe(path) {
  if (!path) return [];
  try {
    const data = await loadJSON(path);
    return Array.isArray(data) ? data : (Array.isArray(data.results) ? data.results : []);
  } catch {
    return [];
  }
}

// Bouw: { NATION: [{name, rank, points, time}], ... } en sorteer per natie op punten desc
function buildPerWT(resultsArray) {
  const perNation = {};
  for (const r of resultsArray) {
    if (!r || !r.nation) continue;
    if (!perNation[r.nation]) perNation[r.nation] = [];
    perNation[r.nation].push({
      name: r.name ?? "",
      rank: (Number.isFinite(+r.rank) ? +r.rank : null),
      points: (Number.isFinite(+r.points) ? +r.points : 0),
      time: r.time ?? null
    });
  }
  for (const n of Object.keys(perNation)) {
    perNation[n].sort((a,b) => (b.points - a.points) || ((a.rank ?? 9e9) - (b.rank ?? 9e9)));
  }
  return perNation;
}

/**
 * files: object met paden; elk veld optioneel
 * {
 *   wt1: 'data/wt1_women500m.json',
 *   wt2: 'data/wt2_women500m.json',
 *   wt3: 'data/wt3_women500m.json', // mag ontbreken
 *   wt4: 'data/wt4_women500m.json'  // mag ontbreken
 * }
 */
async function renderOverallNation(files) {
  const wtKeys = ["wt1","wt2","wt3","wt4"];
  const datasets = await Promise.all(wtKeys.map(k => loadMaybe(files[k])));
  const perWT = datasets.map(buildPerWT); // array per WT

  // verzamel alle naties
  const nations = new Set();
  perWT.forEach(map => Object.keys(map).forEach(n => nations.add(n)));

  // bepaal max 'skaterIndex' per natie (max lengte over alle WT-lijsten)
  const rows = [];
  for (const nation of nations) {
    const lists = perWT.map(map => map[nation] || []);
    const maxLen = Math.max(...lists.map(l => l.length), 0);

    for (let i = 0; i < maxLen; i++) {
      const wtData = lists.map(list => list[i] || {name:"", rank:"-", points:0, time:null});
      const total = wtData.reduce((s, x) => s + (x.points || 0), 0);

      const row = {
        nation,
        skaterIndex: i + 1,
        total
      };
      wtData.forEach((d, idx) => {
        const label = wtKeys[idx].toUpperCase(); // WT1, WT2, ...
        row[`${label}_Pts`]  = d.points;
        row[`${label}_Rank`] = (d.rank ?? "-");
        row[`${label}_Name`] = d.name || "";
      });
      rows.push(row);
    }
  }

  // sorteer alle rijen op totaal desc
  rows.sort((a,b) => b.total - a.total);

  // bouw kolommen dynamisch per aanwezige WT
  const headerCols = [
    { key:"#", label:"#"},
    { key:"nation", label:"Nation"},
    { key:"skaterIndex", label:"Skater"},
    { key:"total", label:"Total"}
  ];
  wtKeys.forEach(k => {
    if (!files[k]) return;
    const L = k.toUpperCase();
    headerCols.push({ key:`${L}_Pts`,  label:`${L} Pts`,  cls:"col-points" });
    headerCols.push({ key:`${L}_Rank`, label:`${L} Rank`, cls:"col-rank" });
    headerCols.push({ key:`${L}_Name`, label:`${L} Name`, cls:"col-name" });
  });

  const thead = `
    <tr>
      ${headerCols.map(c => `<th class="${c.cls || ''}">${c.label}</th>`).join("")}
    </tr>
  `;

  const tbody = rows.map((r, i) => {
    const tds = [
      `<td>${i+1}</td>`,
      `<td>${r.nation}</td>`,
      `<td>${r.skaterIndex}</td>`,
      `<td><strong>${r.total}</strong></td>`
    ];
    wtKeys.forEach(k => {
      if (!files[k]) return;
      const L = k.toUpperCase();
      tds.push(`<td class="col-points">${r[`${L}_Pts`]}</td>`);
      tds.push(`<td class="col-rank">${r[`${L}_Rank`]}</td>`);
      tds.push(`<td class="col-name">${r[`${L}_Name`]}</td>`);
    });
    return `<tr class="${r.nation === 'BEL' ? 'highlight-belgium' : ''}">${tds.join("")}</tr>`;
  }).join("");

  const container = document.getElementById("overall-container");
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  `;
  setupColumnToggles();
}

function applyColumnState() {
  const toggles = document.querySelectorAll('.col-toggle');
  toggles.forEach(chk => {
    const cls = chk.dataset.colClass; // bv. 'col-name'
    document.querySelectorAll('.' + cls).forEach(el => {
      el.classList.toggle('hidden-col', !chk.checked);
    });
  });
}

function setupColumnToggles() {
  const toggles = document.querySelectorAll('.col-toggle');
  toggles.forEach(chk => {
    chk.addEventListener('change', applyColumnState);
  });
  applyColumnState(); // initial state direct toepassen
}


window.renderOverallNation = renderOverallNation;
window.setupColumnToggles = setupColumnToggles;
