const DATA_PATH = "data/sixth_avenue_outdoor_pops.geojson";
const COLORS = {
  Limited: "#d95f4f",
  Moderate: "#d5a53c",
  Extensive: "#2f7d61",
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const slides = [...document.querySelectorAll(".slide")];
const previousButton = document.querySelector("#previous-slide");
const nextButton = document.querySelector("#next-slide");
const slideCounter = document.querySelector("#slide-counter");
const slideTitle = document.querySelector("#slide-title");
let currentSlide = 0;

const map = new maplibregl.Map({
  container: "map",
  style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  center: [-73.9715, 40.783],
  zoom: 11.05,
  minZoom: 10,
  attributionControl: true,
});
map.addControl(new maplibregl.NavigationControl(), "top-right");

const goToSlide = (requestedIndex, updateHash = true) => {
  const nextIndex = Math.max(0, Math.min(slides.length - 1, requestedIndex));
  currentSlide = nextIndex;

  slides.forEach((slide, index) => {
    slide.classList.toggle("active", index === currentSlide);
    slide.dataset.state = index < currentSlide ? "before" : "after";
    slide.setAttribute("aria-hidden", index === currentSlide ? "false" : "true");
  });

  const activeSlide = slides[currentSlide];
  const activeBackdrop = getComputedStyle(activeSlide).backgroundColor;
  document.documentElement.style.setProperty("--slide-backdrop", activeBackdrop);
  document.body.classList.toggle(
    "dark-chrome",
    activeSlide.classList.contains("slide-method") ||
      activeSlide.classList.contains("slide-reflection"),
  );
  slideCounter.textContent = `${currentSlide + 1} / ${slides.length}`;
  slideTitle.textContent = activeSlide.dataset.title || "";
  previousButton.disabled = currentSlide === 0;
  nextButton.disabled = currentSlide === slides.length - 1;

  if (updateHash) {
    history.replaceState(null, "", `#slide-${currentSlide + 1}`);
  }
  if (activeSlide.id === "map-section") {
    window.setTimeout(() => map.resize(), 80);
  }
};

const initialHash = Number(location.hash.replace("#slide-", ""));
goToSlide(Number.isFinite(initialHash) && initialHash > 0 ? initialHash - 1 : 0, false);

previousButton.addEventListener("click", () => goToSlide(currentSlide - 1));
nextButton.addEventListener("click", () => goToSlide(currentSlide + 1));
document.querySelector("#begin-button").addEventListener("click", () => goToSlide(1));

document.addEventListener("keydown", (event) => {
  if (["ArrowRight", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    goToSlide(currentSlide + 1);
  } else if (["ArrowLeft", "PageUp"].includes(event.key)) {
    event.preventDefault();
    goToSlide(currentSlide - 1);
  } else if (event.key === "Home") {
    goToSlide(0);
  } else if (event.key === "End") {
    goToSlide(slides.length - 1);
  }
});

document.addEventListener("click", (event) => {
  if (
    event.target.closest(
      "button, a, [data-interactive], #map, .sidebar, .maplibregl-control-container",
    )
  ) {
    return;
  }
  goToSlide(event.clientX < window.innerWidth / 2 ? currentSlide - 1 : currentSlide + 1);
});

let touchStartX = null;
document.addEventListener("touchstart", (event) => {
  if (event.target.closest("[data-interactive], #map, .sidebar")) return;
  touchStartX = event.changedTouches[0]?.clientX ?? null;
}, { passive: true });
document.addEventListener("touchend", (event) => {
  if (touchStartX === null) return;
  const delta = (event.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
  if (Math.abs(delta) > 55) goToSlide(delta < 0 ? currentSlide + 1 : currentSlide - 1);
  touchStartX = null;
}, { passive: true });

const renderList = (features, selectedLevel = "All") => {
  const list = document.querySelector("#plaza-list");
  list.innerHTML = "";
  features
    .filter(
      (feature) =>
        selectedLevel === "All" || feature.properties.score_band === selectedLevel,
    )
    .sort(
      (a, b) =>
        Number(b.properties.provision_score) - Number(a.properties.provision_score),
    )
    .forEach((feature) => {
      const properties = feature.properties;
      const item = document.createElement("li");
      item.innerHTML = `
        <button data-id="${escapeHtml(properties.pops_number)}">
          <span>
            <strong>${escapeHtml(properties.address)}</strong>
            <small>${escapeHtml(properties.year)} · ${escapeHtml(properties.public_space_type)}</small>
          </span>
          <b style="color:${COLORS[properties.score_band]}">${escapeHtml(properties.provision_score)}</b>
        </button>
      `;
      item.querySelector("button").addEventListener("click", () => {
        map.flyTo({ center: feature.geometry.coordinates, zoom: 16.3 });
        renderSelected(feature);
      });
      list.appendChild(item);
    });
};

const renderCoverage = (summary) => {
  const values = [
    ["Seating", summary.seating_required],
    ["Landscape", summary.landscape_required],
    ["Lighting", summary.lighting_required],
    ["Public signage", summary.signage_required],
    ["Tables", summary.tables_required],
    ["Water feature / fountain", summary.water_required],
  ];
  document.querySelector("#coverage-chart").innerHTML = values
    .map(([label, value]) => {
      const pct = Math.round((Number(value) / Number(summary.development_count)) * 100);
      return `
        <div class="bar-row">
          <span>${escapeHtml(label)}</span>
          <div><i style="width:${pct}%"></i></div>
          <strong>${value}/15</strong>
        </div>
      `;
    })
    .join("");
};

const renderCases = (features) => {
  const ids = ["M050042", "M050055", "M050060"];
  const labels = {
    M050042: "Access without amenities",
    M050055: "A basic place to stay",
    M050060: "A broad public-space program",
  };
  const container = document.querySelector("#case-studies");
  container.innerHTML = ids
    .map((id) => features.find((feature) => feature.properties.pops_number === id))
    .filter(Boolean)
    .map((feature) => {
      const p = feature.properties;
      return `
        <article>
          <p class="case-label">${escapeHtml(labels[p.pops_number])}</p>
          <h3>${escapeHtml(p.address)}</h3>
          <strong>${escapeHtml(p.provision_score)}</strong>
          <span>Documented Provision Score</span>
          <p>${escapeHtml(p.amenities_required || "None documented")}</p>
          <button data-case-id="${escapeHtml(p.pops_number)}">Locate on map →</button>
        </article>
      `;
    })
    .join("");

  container.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const feature = features.find(
        (item) => item.properties.pops_number === button.dataset.caseId,
      );
      if (!feature) return;
      goToSlide(slides.findIndex((slide) => slide.id === "map-section"));
      window.setTimeout(() => {
        map.flyTo({ center: feature.geometry.coordinates, zoom: 16.3 });
        renderSelected(feature);
      }, 150);
    });
  });
};

const renderSelected = (feature) => {
  const p = feature.properties;
  const panel = document.querySelector("#selected-plaza");
  panel.innerHTML = `
    <img
      src="${escapeHtml(p.image_path)}"
      alt="Street-level view of ${escapeHtml(p.address)}"
      onerror="this.onerror=null;this.src='images/plaza-placeholder.svg';"
    />
    <div class="selected-heading">
      <div>
        <p class="section-label">Selected plaza</p>
        <h3>${escapeHtml(p.address)}</h3>
      </div>
      <div class="score" style="--score-color:${COLORS[p.score_band]}">
        <strong>${escapeHtml(p.provision_score)}</strong><span>/100</span>
      </div>
    </div>
    <dl>
      <dt>Completed</dt><dd>${escapeHtml(p.year)}</dd>
      <dt>Plaza area</dt><dd>${Number(p.plaza_area_sf).toLocaleString()} sq. ft.</dd>
      <dt>Required access</dt><dd>${escapeHtml(p.hour_of_access_required)}</dd>
    </dl>
    <p class="selected-amenities"><strong>Required amenities</strong><br>${escapeHtml(p.amenities_required || "None documented")}</p>
  `;
};

const loadData = window.POPS_DATA
  ? Promise.resolve(window.POPS_DATA)
  : fetch(DATA_PATH).then((response) => {
      if (!response.ok) throw new Error(`Could not load ${DATA_PATH}`);
      return response.json();
    });

loadData
  .then((data) => {
    const features = data.features || [];
    const summary = data.metadata.summary;

    document.querySelector("#site-count").textContent = summary.development_count;
    document.querySelector("#area-count").textContent =
      `${Math.round(summary.total_documented_plaza_area_sf / 1000)}k`;
    document.querySelector("#zero-count").textContent = summary.zero_required_amenities;
    document.querySelector("#finding-text").innerHTML =
      `<strong>${summary.twenty_four_hour_access} of ${summary.development_count}</strong> developments include a 24-hour access requirement, yet <strong>${summary.zero_required_amenities}</strong> list no required amenities and only <strong>${summary.seating_required}</strong> require seating.`;

    renderCoverage(summary);
    renderCases(features);
    renderList(features);
    const initialFeature =
      features.find((feature) => feature.properties.pops_number === "M050060") ||
      features[0];
    if (initialFeature) renderSelected(initialFeature);

    map.on("load", () => {
      const contextData = window.MANHATTAN_POPS_DATA;
      const boundaryData = window.STUDY_AREA_BOUNDARY;

      if (boundaryData) {
        map.addSource("study-area", { type: "geojson", data: boundaryData });
        map.addLayer({
          id: "study-area-fill",
          type: "fill",
          source: "study-area",
          paint: {
            "fill-color": "#d5a53c",
            "fill-opacity": 0.09,
          },
        });
        map.addLayer({
          id: "study-area-outline",
          type: "line",
          source: "study-area",
          paint: {
            "line-color": "#805427",
            "line-width": 2.5,
            "line-dasharray": [2, 1.5],
          },
        });
      }

      if (contextData) {
        map.addSource("manhattan-pops", { type: "geojson", data: contextData });
        map.addLayer({
          id: "manhattan-pops-context",
          type: "circle",
          source: "manhattan-pops",
          paint: {
            "circle-radius": 3.5,
            "circle-color": "#858b90",
            "circle-opacity": 0.62,
          },
        });
      }

      map.addSource("pops", { type: "geojson", data });
      map.addLayer({
        id: "pops-halo",
        type: "circle",
        source: "pops",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "plaza_area_sf"], 4000, 10, 30000, 25],
          "circle-color": "#ffffff",
          "circle-opacity": 0.84,
        },
      });
      map.addLayer({
        id: "pops-points",
        type: "circle",
        source: "pops",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "plaza_area_sf"], 4000, 7, 30000, 20],
          "circle-color": [
            "match",
            ["get", "score_band"],
            "Limited", COLORS.Limited,
            "Moderate", COLORS.Moderate,
            "Extensive", COLORS.Extensive,
            "#777777",
          ],
          "circle-opacity": 0.92,
          "circle-stroke-color": "#20242a",
          "circle-stroke-width": 1,
        },
      });

      const manhattanBounds = new maplibregl.LngLatBounds();
      [...(contextData?.features || []), ...features].forEach((feature) => {
        manhattanBounds.extend(feature.geometry.coordinates);
      });
      if (!manhattanBounds.isEmpty()) {
        map.fitBounds(manhattanBounds, {
          padding: { top: 44, right: 44, bottom: 44, left: 44 },
          duration: 0,
          maxZoom: 12,
        });
      }

      map.on("click", "pops-points", (event) => {
        const feature = event.features?.[0];
        if (feature) renderSelected(feature);
      });
      map.on("mouseenter", "pops-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "pops-points", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    document.querySelectorAll(".filters button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".filters button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        const level = button.dataset.filter;
        const filter = level === "All" ? null : ["==", ["get", "score_band"], level];
        if (map.getLayer("pops-points")) map.setFilter("pops-points", filter);
        if (map.getLayer("pops-halo")) map.setFilter("pops-halo", filter);
        renderList(features, level);
      });
    });
  })
  .catch((error) => {
    console.error(error);
    document.querySelector("#finding-text").textContent =
      "The processed dataset could not be loaded.";
  });
