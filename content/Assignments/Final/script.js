const siteNav = document.querySelector('#siteNav');
const navToggle = document.querySelector('#navToggle');
const chapterNav = document.querySelector('#chapterNav');
const navCurrent = document.querySelector('#navCurrent');
const allSections = [...document.querySelectorAll('main > section')].filter((section) => !section.hidden);
const navLinks = [...document.querySelectorAll('#chapterNav a')];

const urbanLifeTypewriter = document.querySelector('#urbanLifeTypewriter');
const typewriterSection = urbanLifeTypewriter?.closest('main > section');
let typewriterTimer = null;

let currentPage = 0;
let isTransitioning = false;
let wheelLock = false;

const clampPage = (index) => {
  return Math.max(0, Math.min(index, allSections.length - 1));
};

const updateNavigationState = (section) => {
  const sectionIndex = section.dataset.index;

  if (navCurrent) {
    navCurrent.textContent = sectionIndex || navCurrent.textContent || '00';
  }

  navLinks.forEach((link) => {
    link.classList.toggle('active', link.dataset.id === section.id);
  });
};

const runUrbanLifeTypewriter = () => {
  if (!urbanLifeTypewriter) return;

  const fullText = urbanLifeTypewriter.dataset.text || 'everyday urban life';
  const typingDelays = [
    70, 58, 62, 82, 55, 60, 115, 75,
    360,
    95, 78, 165, 72, 95,
    320,
    110, 88, 135, 72,
  ];

  if (typewriterTimer) {
    window.clearTimeout(typewriterTimer);
    typewriterTimer = null;
  }

  urbanLifeTypewriter.classList.add('is-typing');
  urbanLifeTypewriter.textContent = '';

  let characterIndex = 0;

  const schedule = (callback, delay) => {
    typewriterTimer = window.setTimeout(callback, delay);
  };

  const typeNextCharacter = () => {
    if (!typewriterSection?.classList.contains('active')) return;

    urbanLifeTypewriter.textContent = fullText.slice(0, characterIndex + 1);
    const delay = typingDelays[characterIndex] ?? 70;
    characterIndex += 1;

    if (characterIndex < fullText.length) {
      schedule(typeNextCharacter, delay);
      return;
    }

    urbanLifeTypewriter.classList.remove('is-typing');
    schedule(deletePreviousCharacter, 2800);
  };

  const deletePreviousCharacter = () => {
    if (!typewriterSection?.classList.contains('active')) return;

    urbanLifeTypewriter.classList.add('is-typing');
    characterIndex -= 1;
    urbanLifeTypewriter.textContent = fullText.slice(0, characterIndex);

    const deleteDelay = characterIndex === 14 || characterIndex === 8 ? 180 : 48;
    if (characterIndex > 0) {
      schedule(deletePreviousCharacter, deleteDelay);
      return;
    }

    schedule(() => {
      characterIndex = 0;
      typeNextCharacter();
    }, 1400);
  };

  schedule(typeNextCharacter, 650);
};

const showPage = (nextIndex, direction = 1) => {
  const clampedIndex = clampPage(nextIndex);

  if (clampedIndex === currentPage || isTransitioning) return;

  const currentSection = allSections[currentPage];
  const nextSection = allSections[clampedIndex];

  if (currentSection === typewriterSection && typewriterTimer) {
    window.clearTimeout(typewriterTimer);
    typewriterTimer = null;
  }

  if (!currentSection || !nextSection) return;

  isTransitioning = true;

  const skipLayeredTransition =
    currentSection.id === 'receipt-evidence' ||
    nextSection.id === 'receipt-evidence';

  currentPage = clampedIndex;
  updateNavigationState(nextSection);

  if (skipLayeredTransition) {
    currentSection.classList.remove('active', 'is-leaving');
    currentSection.style.visibility = 'hidden';
    currentSection.style.transform = '';

    nextSection.classList.remove('is-leaving');
    nextSection.style.visibility = '';
    nextSection.style.transform = 'none';
    nextSection.classList.add('active');

    requestAnimationFrame(() => {
      currentSection.style.visibility = '';
      nextSection.style.transform = '';
    });

    if (nextSection === typewriterSection) {
      runUrbanLifeTypewriter();
    }

    window.setTimeout(() => {
      isTransitioning = false;
    }, 120);

    return;
  }

  currentSection.classList.remove('active');
  currentSection.classList.add('is-leaving');

  nextSection.style.transform =
    direction >= 0
      ? 'translateY(28px) scale(.992)'
      : 'translateY(-28px) scale(.992)';

  window.setTimeout(() => {
    nextSection.classList.add('active');

    requestAnimationFrame(() => {
      nextSection.style.transform = '';
    });

    if (nextSection === typewriterSection) {
      runUrbanLifeTypewriter();
    }
  }, 260);

  window.setTimeout(() => {
    currentSection.classList.remove('is-leaving');
  }, 520);

  window.setTimeout(() => {
    isTransitioning = false;
  }, 920);
};

const initializePages = () => {
  allSections.forEach((section, index) => {
    section.classList.toggle('active', index === 0);
    section.classList.remove('is-leaving');
  });

  currentPage = 0;
  updateNavigationState(allSections[0]);

  if (urbanLifeTypewriter) {
    urbanLifeTypewriter.textContent = urbanLifeTypewriter.dataset.text || 'everyday urban life';
  }
};

if (siteNav && navToggle && chapterNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  navLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
      event.preventDefault();

      const targetSection = document.querySelector(link.getAttribute('href'));
      const targetIndex = allSections.indexOf(targetSection);

      siteNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');

      if (targetIndex !== -1) {
        showPage(targetIndex, targetIndex > currentPage ? 1 : -1);
      }
    });
  });
}

const isInteractiveTarget = (target) => {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest('input, textarea, select, button, a, video, [contenteditable="true"]')
  );
};

window.addEventListener(
  'wheel',
  (event) => {
    if (isInteractiveTarget(event.target)) return;
    if (wheelLock || isTransitioning) return;
    if (Math.abs(event.deltaY) < 18) return;

    event.preventDefault();
    wheelLock = true;

    showPage(currentPage + (event.deltaY > 0 ? 1 : -1), event.deltaY > 0 ? 1 : -1);

    window.setTimeout(() => {
      wheelLock = false;
    }, 980);
  },
  { passive: false }
);

window.addEventListener('keydown', (event) => {
  if (isInteractiveTarget(event.target)) return;

  const nextKeys = ['ArrowDown', 'PageDown', ' '];
  const previousKeys = ['ArrowUp', 'PageUp'];

  if (nextKeys.includes(event.key)) {
    event.preventDefault();
    showPage(currentPage + 1, 1);
    return;
  }

  if (previousKeys.includes(event.key)) {
    event.preventDefault();
    showPage(currentPage - 1, -1);
    return;
  }

  if (event.key === 'Home') {
    event.preventDefault();
    showPage(0, -1);
    return;
  }

  if (event.key === 'End') {
    event.preventDefault();
    showPage(allSections.length - 1, 1);
  }
});

let touchStartY = 0;

window.addEventListener(
  'touchstart',
  (event) => {
    touchStartY = event.touches[0]?.clientY ?? 0;
  },
  { passive: true }
);

window.addEventListener(
  'touchend',
  (event) => {
    const touchEndY = event.changedTouches[0]?.clientY ?? touchStartY;
    const deltaY = touchStartY - touchEndY;

    if (Math.abs(deltaY) < 45 || isTransitioning) return;

    showPage(currentPage + (deltaY > 0 ? 1 : -1), deltaY > 0 ? 1 : -1);
  },
  { passive: true }
);

const laionAccordionCards = [...document.querySelectorAll('.laion-accordion-card')];
const laionVideo = document.querySelector('#laionVideo');
const laionVideoPlaceholder = document.querySelector('#laionVideoPlaceholder');
const laionVideoTitle = document.querySelector('#laionVideoTitle');
const laionVideoNote = document.querySelector('#laionVideoNote');

const laionVideoSources = {
  failure: 'assets/videos/laion-5b.mp4',
  matching: 'assets/videos/clip.mp4',
  language: 'assets/videos/cld3.mp4',
  threshold: 'assets/videos/benchmark.mp4',
};

const setVideoPlaceholder = (placeholder, isVisible) => {
  if (!placeholder) return;
  placeholder.hidden = !isVisible;
};

const loadVideoSource = (video, placeholder, source, shouldPlay = false) => {
  if (!video || !source) return;

  const resolvedSource = new URL(source, document.baseURI).href;
  const currentSource = video.currentSrc || video.src;

  setVideoPlaceholder(placeholder, true);

  const showVideo = () => {
    setVideoPlaceholder(placeholder, false);
  };

  const showError = () => {
    setVideoPlaceholder(placeholder, true);
    console.error('Video failed to load:', resolvedSource, video.error);
  };

  video.addEventListener('loadedmetadata', showVideo, { once: true });
  video.addEventListener('loadeddata', showVideo, { once: true });
  video.addEventListener('canplay', showVideo, { once: true });
  video.addEventListener('error', showError, { once: true });

  if (currentSource !== resolvedSource) {
    video.pause();
    video.src = source;
    video.load();
  }

  if (video.readyState >= 1) {
    showVideo();
  }

  if (shouldPlay) {
    video.play().catch(() => {
      showVideo();
    });
  }
};

const updateLaionAccordion = (selectedCard, shouldPlay = true) => {
  laionAccordionCards.forEach((card) => {
    const isActive = card === selectedCard;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-expanded', String(isActive));
  });

  if (laionVideoTitle) {
    laionVideoTitle.textContent = selectedCard.dataset.title || '';
  }

  if (laionVideoNote) {
    laionVideoNote.textContent = selectedCard.dataset.note || '';
  }

  const videoKey = selectedCard.dataset.video;
  const videoSource = selectedCard.dataset.src || laionVideoSources[videoKey] || '';

  loadVideoSource(
    laionVideo,
    laionVideoPlaceholder,
    videoSource,
    shouldPlay
  );
};

laionAccordionCards.forEach((card) => {
  card.addEventListener('click', () => {
    updateLaionAccordion(card, true);
  });
});

const initialLaionCard = laionAccordionCards.find((card) =>
  card.classList.contains('active')
);

if (initialLaionCard) {
  updateLaionAccordion(initialLaionCard, false);
}

const demoVideo = document.querySelector('#demoVideo');
const demoVideoPlaceholder = document.querySelector('#demoVideoPlaceholder');

if (demoVideo) {
  const demoSource = demoVideo.getAttribute('src') || 'assets/videos/demo.mp4';
  loadVideoSource(demoVideo, demoVideoPlaceholder, demoSource, false);
}


const platformMenuCards = [...document.querySelectorAll('.platform-menu-card')];
const platformDashboard = document.querySelector('.platform-dashboard');

const updatePlatformView = (selectedCard) => {
  platformMenuCards.forEach((card) => {
    const isActive = card === selectedCard;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });

  const showMethodology = selectedCard.dataset.view === 'sample';
  platformDashboard?.classList.toggle('show-methodology', showMethodology);
};

platformMenuCards.forEach((card) => {
  card.addEventListener('click', () => {
    updatePlatformView(card);
  });
});

const initialPlatformMenuCard = platformMenuCards.find((card) => card.classList.contains('active'));

if (initialPlatformMenuCard) {
  updatePlatformView(initialPlatformMenuCard);
}

const platformLocationTabs = [...document.querySelectorAll('.platform-location-tab')];
const platformDashboardLocation = document.querySelector('#platformDashboardLocation');

const platformViewButtons = [...document.querySelectorAll('.platform-view-button')];
const platformDashboardPanels = [...document.querySelectorAll('[data-dashboard-panel]')];
let currentPlatformDashboardView = 'module';

const platformChartTargets = {
  displayed_price: document.querySelector('#platformPriceChart'),
  distance_m: document.querySelector('#platformDistanceChart'),
  delivery_time_min: document.querySelector('#platformTimeChart'),
  displayed_sales: document.querySelector('#platformSalesChart'),
};

const platformModuleTargets = {
  food_recommend: {
    displayed_price: document.querySelector('#moduleRecommendationPrice'),
    distance_m: document.querySelector('#moduleRecommendationDistance'),
    delivery_time_min: document.querySelector('#moduleRecommendationTime'),
    displayed_sales: document.querySelector('#moduleRecommendationSales'),
  },
  sharp_shooter: {
    displayed_price: document.querySelector('#moduleSharpPrice'),
    distance_m: document.querySelector('#moduleSharpDistance'),
    delivery_time_min: document.querySelector('#moduleSharpTime'),
    displayed_sales: document.querySelector('#moduleSharpSales'),
  },
  pin_haofan: {
    displayed_price: document.querySelector('#modulePinPrice'),
    distance_m: document.querySelector('#modulePinDistance'),
    delivery_time_min: document.querySelector('#modulePinTime'),
    displayed_sales: document.querySelector('#modulePinSales'),
  },
};

const platformMetricFormats = {
  displayed_price: (value) => `¥${Math.round(value)}`,
  distance_m: (value) => `${Math.round(value)}\u00A0m`,
  delivery_time_min: (value) => `${Math.round(value)}\u00A0min`,
  displayed_sales: (value) => Math.round(value).toLocaleString(),
};

const platformModuleOrder = [
  ['food_recommend', 'Recommendation'],
  ['sharp_shooter', 'Shen Qiang Shou'],
  ['pin_haofan', 'Pin Hao Fan'],
];

const platformRadarContainers = [...document.querySelectorAll('.platform-radar')];

const platformRadarMetricOrder = [
  ['displayed_price', 'P'],
  ['distance_m', 'D'],
  ['delivery_time_min', 'T'],
  ['displayed_sales', 'S'],
];

const platformRadarAngles = {
  P: -Math.PI / 2,
  D: 0,
  T: Math.PI / 2,
  S: Math.PI,
};

const ensurePlatformRadar = (container) => {
  if (!container || container.querySelector('svg')) return;

  container.innerHTML = `
    <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
      <circle class="platform-radar-grid" cx="50" cy="50" r="14"></circle>
      <circle class="platform-radar-grid" cx="50" cy="50" r="28"></circle>
      <circle class="platform-radar-grid" cx="50" cy="50" r="42"></circle>
      <line class="platform-radar-axis" x1="50" y1="8" x2="50" y2="92"></line>
      <line class="platform-radar-axis" x1="8" y1="50" x2="92" y2="50"></line>
      <polygon class="platform-radar-shape" points="50,50 50,50 50,50 50,50"></polygon>
      <text class="platform-radar-label" x="50" y="3">P</text>
      <text class="platform-radar-label" x="97" y="50">D</text>
      <text class="platform-radar-label" x="50" y="97">T</text>
      <text class="platform-radar-label" x="3" y="50">S</text>
    </svg>
  `;
};

const getPlatformRadarPoint = (normalizedValue, angle) => {
  const radius = Math.max(0, Math.min(1, normalizedValue)) * 42;

  return [
    50 + Math.cos(angle) * radius,
    50 + Math.sin(angle) * radius,
  ];
};

const updatePlatformRadars = (locationData) => {
  if (!locationData) return;

  const metricMaximums = {};

  platformRadarMetricOrder.forEach(([metricKey]) => {
    const values = platformModuleOrder
      .map(([moduleKey]) => Number(locationData?.[moduleKey]?.[metricKey]))
      .filter((value) => Number.isFinite(value));

    metricMaximums[metricKey] = values.length ? Math.max(...values) : 1;
  });

  platformRadarContainers.forEach((container) => {
    ensurePlatformRadar(container);

    const moduleKey = container.dataset.radarModule;
    const moduleData = locationData?.[moduleKey];
    const polygon = container.querySelector('.platform-radar-shape');

    if (!moduleData || !polygon) return;

    const points = platformRadarMetricOrder.map(([metricKey, axisKey]) => {
      const value = Number(moduleData[metricKey]);
      const maximum = metricMaximums[metricKey] || 1;
      const normalizedValue = Number.isFinite(value) ? value / maximum : 0;
      const [x, y] = getPlatformRadarPoint(
        normalizedValue,
        platformRadarAngles[axisKey]
      );

      return `${x},${y}`;
    });

    polygon.setAttribute('points', points.join(' '));
  });
};

platformRadarContainers.forEach(ensurePlatformRadar);

let platformDashboardData = null;

const renderPlatformMetric = (target, metricKey, locationData) => {
  if (!target) return;

  const rows = platformModuleOrder.map(([moduleKey, label]) => ({
    label,
    value: Number(locationData?.[moduleKey]?.[metricKey]),
  }));

  const validValues = rows
    .map((row) => row.value)
    .filter((value) => Number.isFinite(value));

  const maxValue = validValues.length ? Math.max(...validValues) : 0;
  const formatter = platformMetricFormats[metricKey] || ((value) => String(value));

  target.innerHTML = rows.map((row) => {
    const hasValue = Number.isFinite(row.value);
    const width = hasValue && maxValue > 0 ? Math.max(4, (row.value / maxValue) * 100) : 0;
    const valueText = hasValue ? formatter(row.value) : 'N/A';

    return `
      <div class="platform-chart-row">
        <span class="platform-chart-label">${row.label}</span>
        <div class="platform-chart-track">
          <div class="platform-chart-bar" style="width:${width}%"></div>
        </div>
        <strong class="platform-chart-value"><small>MEDIAN</small>${valueText}</strong>
      </div>
    `;
  }).join('');
};

const renderPlatformModuleView = (locationData) => {
  const metricMaximums = {};
  const metricRanks = {};

  Object.keys(platformChartTargets).forEach((metricKey) => {
    const metricValues = platformModuleOrder
      .map(([moduleKey]) => ({
        moduleKey,
        value: Number(locationData?.[moduleKey]?.[metricKey]),
      }))
      .filter((item) => Number.isFinite(item.value));

    metricMaximums[metricKey] = metricValues.length
      ? Math.max(...metricValues.map((item) => item.value))
      : 0;

    const sortedValues = [...metricValues]
      .sort((a, b) => b.value - a.value)
      .map((item) => item.value);

    metricRanks[metricKey] = {};

    metricValues.forEach(({ moduleKey, value }) => {
      const position = sortedValues.findIndex((item) => item === value);
      const dotCount = Math.max(1, 3 - position);
      const label = dotCount === 3 ? 'HIGH' : dotCount === 2 ? 'MID' : 'LOW';

      metricRanks[metricKey][moduleKey] = {
        dotCount,
        label,
      };
    });
  });

  Object.entries(platformModuleTargets).forEach(([moduleKey, metricTargets]) => {
    const moduleData = locationData?.[moduleKey];

    Object.entries(metricTargets).forEach(([metricKey, target]) => {
      if (!target) return;

      const value = Number(moduleData?.[metricKey]);
      const formatter = platformMetricFormats[metricKey] || ((item) => String(item));
      const hasValue = Number.isFinite(value);
      const maxValue = metricMaximums[metricKey];
      const width = hasValue && maxValue > 0 ? Math.max(4, (value / maxValue) * 100) : 0;
      const metricCard = target.closest('.platform-module-metric');
      const bar = metricCard?.querySelector('.platform-module-bar span');
      const rankDots = metricCard?.querySelector('.platform-rank-dots');
      const rankLabel = metricCard?.querySelector('.platform-rank-label');
      const rank = metricRanks[metricKey]?.[moduleKey];

      target.textContent = hasValue ? formatter(value) : 'N/A';

      if (bar) {
        bar.style.width = `${width}%`;
      }

      if (rankDots) {
        rankDots.innerHTML = Array.from({ length: 3 }, (_, index) => {
          const isActive = rank && index < rank.dotCount;
          return `<i class="${isActive ? 'active' : ''}"></i>`;
        }).join('');
      }

      if (rankLabel) {
        rankLabel.textContent = rank?.label || '—';
      }
    });
  });

  updatePlatformRadars(locationData);
};

const setPlatformDashboardView = (nextView) => {
  if (nextView === currentPlatformDashboardView) return;

  const nextPanel = platformDashboardPanels.find(
    (panel) => panel.dataset.dashboardPanel === nextView
  );
  const currentPanel = platformDashboardPanels.find(
    (panel) => panel.dataset.dashboardPanel === currentPlatformDashboardView
  );

  if (!nextPanel) return;

  platformViewButtons.forEach((button) => {
    const isActive = button.dataset.dashboardView === nextView;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-pressed', String(isActive));
  });

  if (currentPanel) {
    currentPanel.classList.add('is-entering');
  }

  window.setTimeout(() => {
    if (currentPanel) {
      currentPanel.hidden = true;
      currentPanel.classList.remove('active', 'is-entering');
    }

    nextPanel.hidden = false;
    nextPanel.classList.add('is-entering');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nextPanel.classList.add('active');
        nextPanel.classList.remove('is-entering');
      });
    });

    currentPlatformDashboardView = nextView;
  }, 220);
};

const renderPlatformDashboard = (location) => {
  if (!platformDashboardData?.[location]) return;

  if (platformDashboardLocation) {
    platformDashboardLocation.textContent = location;
  }

  const locationData = platformDashboardData[location];

  renderPlatformModuleView(locationData);

  Object.entries(platformChartTargets).forEach(([metricKey, target]) => {
    renderPlatformMetric(target, metricKey, locationData);
  });

  platformLocationTabs.forEach((tab) => {
    const isActive = tab.dataset.location === location;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
};

platformLocationTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    renderPlatformDashboard(tab.dataset.location || 'ALL LOCATIONS');
  });
});

platformViewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setPlatformDashboardView(button.dataset.dashboardView || 'module');
  });
});

fetch('./platform_dashboard_data_lunch.json')
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Dashboard data failed to load: ${response.status}`);
    }
    return response.json();
  })
  .then((payload) => {
    platformDashboardData = payload.data;
    renderPlatformDashboard('ALL LOCATIONS');

    const initialPanel = platformDashboardPanels.find(
      (panel) => panel.dataset.dashboardPanel === currentPlatformDashboardView
    );

    platformDashboardPanels.forEach((panel) => {
      const isInitial = panel === initialPanel;
      panel.hidden = !isInitial;
      panel.classList.toggle('active', isInitial);
      panel.classList.remove('is-entering');
    });
  })
  .catch((error) => {
    console.error(error);

    Object.values(platformChartTargets).forEach((target) => {
      if (target) {
        target.innerHTML = '<span class="platform-chart-label">DATA UNAVAILABLE</span>';
      }
    });
  });
const receiptEvidenceSection = document.querySelector('#receipt-evidence');
const receiptEvidenceCards = [...document.querySelectorAll('.receipt-evidence-card')];
const receiptCards = [...document.querySelectorAll('#receipt-evidence .receipt-card')];
let receiptOverlayTimer = null;

const clearReceiptAnimations = () => {
  receiptCards.forEach((card) => {
    card.getAnimations().forEach((animation) => animation.cancel());
  });
};

const resetReceiptEvidenceView = () => {
  window.clearTimeout(receiptOverlayTimer);
  clearReceiptAnimations();

  receiptEvidenceCards.forEach((card) => {
    card.classList.remove('active');
    card.setAttribute('aria-expanded', 'false');
  });

  receiptEvidenceSection?.classList.remove(
    'is-price-view',
    'is-address-view',
    'is-overlay-visible'
  );
  receiptEvidenceSection?.classList.add('is-scattered');
};

const animateReceiptCards = (firstRects) => {
  const lastRects = new Map(
    receiptCards.map((card) => [card, card.getBoundingClientRect()])
  );

  receiptCards.forEach((card, index) => {
    const first = firstRects.get(card);
    const last = lastRects.get(card);
    if (!first || !last) return;

    const deltaX = first.left - last.left;
    const deltaY = first.top - last.top;

    card.animate(
      [
        {
          transform: `translate3d(${deltaX}px, ${deltaY}px, 0)`,
        },
        {
          transform: 'translate3d(0, 0, 0)',
        },
      ],
      {
        duration: 1100,
        delay: index * 32,
        easing: 'cubic-bezier(.22,.72,.18,1)',
        fill: 'both',
      }
    );
  });
};

const updateReceiptEvidenceView = (selectedCard) => {
  if (!receiptEvidenceSection) return;

  window.clearTimeout(receiptOverlayTimer);
  clearReceiptAnimations();

  const wasActive = selectedCard.classList.contains('active');
  const firstRects = new Map(
    receiptCards.map((card) => [card, card.getBoundingClientRect()])
  );

  receiptEvidenceCards.forEach((card) => {
    const isActive = card === selectedCard && !wasActive;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-expanded', String(isActive));
  });

  receiptEvidenceSection.classList.remove(
    'is-scattered',
    'is-price-view',
    'is-address-view',
    'is-overlay-visible'
  );

  if (wasActive) {
    receiptEvidenceSection.classList.add('is-scattered');
  } else if (selectedCard.dataset.receiptView === 'price') {
    receiptEvidenceSection.classList.add('is-price-view');
  } else if (selectedCard.dataset.receiptView === 'address') {
    receiptEvidenceSection.classList.add('is-address-view');
  } else {
    receiptEvidenceSection.classList.add('is-scattered');
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      animateReceiptCards(firstRects);
    });
  });

  if (!wasActive) {
    receiptOverlayTimer = window.setTimeout(() => {
      receiptEvidenceSection.classList.add('is-overlay-visible');
    }, 1700);
  }
};

receiptEvidenceCards.forEach((card) => {
  card.addEventListener('click', () => {
    updateReceiptEvidenceView(card);
  });
});

resetReceiptEvidenceView();

const darkKitchenNodeLayer = document.querySelector('#darkKitchenNodeLayer');
const darkKitchenLinks = document.querySelector('.dark-kitchen-links');
const darkKitchenCards = [...document.querySelectorAll('.dark-kitchen-card')];
const darkKitchenFilters = [...document.querySelectorAll('.dark-kitchen-filter-dock button')];

const darkKitchenData = [
  {
    id: 'hutong-alley',
    label: 'HUTONG ALLEY',
    folder: 'Hutongs  alley',
    prefix: 'alley',
    typology: 'Hutongs  alley.png',
    color: '#e8d7cb',
    center: [18, 25],
    photos: 4,
  },
  {
    id: 'basement',
    label: 'BASEMENT',
    folder: 'Electronics mall  B1 level',
    prefix: 'shuma',
    typology: 'Electronics mall  B1 level.png',
    color: '#dbe2c5',
    center: [50, 22],
    photos: 7,
  },
  {
    id: 'enclosed-zone',
    label: 'ENCLOSED ZONE',
    folder: 'Enclosed  zone',
    prefix: 'meishi',
    typology: 'Enclosed  zone.png',
    color: '#e9c9a7',
    center: [81, 26],
    photos: 6,
  },
  {
    id: 'podium-retail',
    label: 'PODIUM RETAIL',
    folder: 'Podium-level retail shops',
    prefix: 'hotel',
    typology: 'Podium-level retail shops.png',
    color: '#d5d0e2',
    center: [20, 72],
    photos: 2,
  },
  {
    id: 'retail-cluster',
    label: 'RETAIL CLUSTER',
    folder: 'retail-clusters',
    prefix: 'res',
    typology: 'retail-clusters.png',
    color: '#ead98d',
    center: [51, 74],
    photos: 2,
  },
  {
    id: 'market',
    label: 'MARKET',
    folder: 'cai',
    prefix: 'cai',
    typology: 'cai.png',
    color: '#c8d96b',
    center: [82, 71],
    photos: 10,
  },
];

const darkKitchenOffsets = [
  [-9, -9],
  [9, -8],
  [-12, 4],
  [12, 4],
  [-4, -14],
  [4, 14],
  [-14, -2],
  [14, 0],
  [-8, 12],
  [8, 12],
];

const drawDarkKitchenLinks = () => {
  if (!darkKitchenNodeLayer || !darkKitchenLinks) return;

  const boardRect = darkKitchenNodeLayer.getBoundingClientRect();
  darkKitchenLinks.innerHTML = '';

  darkKitchenData.forEach((group) => {
    const centerNode = darkKitchenNodeLayer.querySelector(
      `.dark-kitchen-node.typology[data-typology="${group.id}"]`
    );
    const photoNodes = [
      ...darkKitchenNodeLayer.querySelectorAll(
        `.dark-kitchen-node.photo[data-typology="${group.id}"]`
      ),
    ];

    if (!centerNode) return;

    const centerRect = centerNode.getBoundingClientRect();
    const x1 = centerRect.left - boardRect.left + centerRect.width / 2;
    const y1 = centerRect.top - boardRect.top + centerRect.height / 2;

    photoNodes.forEach((photoNode) => {
      const photoRect = photoNode.getBoundingClientRect();
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');

      line.dataset.typology = group.id;
      line.setAttribute('x1', String(x1));
      line.setAttribute('y1', String(y1));
      line.setAttribute(
        'x2',
        String(photoRect.left - boardRect.left + photoRect.width / 2)
      );
      line.setAttribute(
        'y2',
        String(photoRect.top - boardRect.top + photoRect.height / 2)
      );

      darkKitchenLinks.appendChild(line);
    });
  });
};

const buildDarkKitchenBoard = () => {
  if (!darkKitchenNodeLayer || !darkKitchenLinks) return;

  darkKitchenNodeLayer.innerHTML = '';
  darkKitchenLinks.innerHTML = '';

  darkKitchenData.forEach((group, groupIndex) => {
    const [centerX, centerY] = group.center;
    const typologyNode = document.createElement('figure');

    typologyNode.className = 'dark-kitchen-node typology';
    typologyNode.dataset.typology = group.id;
    typologyNode.style.left = `${centerX}%`;
    typologyNode.style.top = `${centerY}%`;
    typologyNode.style.setProperty('--node-color', group.color);
    typologyNode.style.setProperty(
      '--rotation',
      `${groupIndex % 2 === 0 ? -1.1 : 1.1}deg`
    );
    typologyNode.innerHTML = `
      <img src="${encodeURI(`assets/dark-kitchens/typology/${group.typology}`)}" alt="${group.label} typology diagram">
      <figcaption><span>${group.label}</span><span>TYPOLOGY</span></figcaption>
    `;

    darkKitchenNodeLayer.appendChild(typologyNode);

    const typologyImage = typologyNode.querySelector('img');
    typologyImage?.addEventListener('error', () => {
      console.warn('Typology image failed to load:', typologyImage.src);
      typologyNode.classList.add('image-load-error');
    });

    for (let index = 1; index <= group.photos; index += 1) {
      const [offsetX, offsetY] = darkKitchenOffsets[index - 1];
      const photoNode = document.createElement('figure');

      photoNode.className = 'dark-kitchen-node photo';
      photoNode.dataset.typology = group.id;
      photoNode.style.left = `${centerX + offsetX}%`;
      photoNode.style.top = `${centerY + offsetY}%`;
      photoNode.style.setProperty(
        '--rotation',
        `${((index + groupIndex) % 5) * 1.4 - 2.8}deg`
      );
      photoNode.innerHTML = `
        <img src="${encodeURI(`assets/dark-kitchens/photos/${group.folder}/${group.prefix}-${index}.png`)}" alt="${group.label} field photograph ${index}">
        <figcaption><span>${group.label}</span><span>${String(index).padStart(2, '0')}</span></figcaption>
      `;

      const image = photoNode.querySelector('img');
      image?.addEventListener('error', () => {
        console.warn('Field image failed to load:', image.src);
        photoNode.classList.add('image-load-error');
      });

      darkKitchenNodeLayer.appendChild(photoNode);
    }
  });

  requestAnimationFrame(() => {
    requestAnimationFrame(drawDarkKitchenLinks);
  });
};

const filterDarkKitchenBoard = (typology) => {
  if (!darkKitchenNodeLayer || !darkKitchenLinks) return;

  const nodes = [...darkKitchenNodeLayer.querySelectorAll('.dark-kitchen-node')];
  const lines = [...darkKitchenLinks.querySelectorAll('line')];

  nodes.forEach((node) => {
    const matches = typology === 'all' || node.dataset.typology === typology;
    node.classList.toggle('is-dimmed', !matches);
    node.classList.toggle('is-active', typology !== 'all' && matches);
  });

  lines.forEach((line) => {
    const matches = typology === 'all' || line.dataset.typology === typology;
    line.style.opacity = matches ? '1' : '.05';
    line.style.stroke =
      typology !== 'all' && matches
        ? '#c8d96b'
        : 'rgba(255,255,255,.25)';
  });
};

const setDarkKitchenCard = (selectedCard) => {
  darkKitchenCards.forEach((card) => {
    const isActive = card === selectedCard;
    card.classList.toggle('active', isActive);
    card.setAttribute('aria-expanded', String(isActive));
  });

  if (selectedCard.dataset.darkKitchenView === 'definition') {
    darkKitchenFilters.forEach((button) => {
      button.classList.toggle('active', button.dataset.typology === 'all');
    });
    filterDarkKitchenBoard('all');
  }
};

darkKitchenCards.forEach((card) => {
  card.addEventListener('click', () => {
    setDarkKitchenCard(card);
  });
});

darkKitchenFilters.forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();

    darkKitchenFilters.forEach((item) => {
      item.classList.toggle('active', item === button);
    });

    filterDarkKitchenBoard(button.dataset.typology || 'all');
  });
});

buildDarkKitchenBoard();
window.addEventListener('resize', drawDarkKitchenLinks);

initializePages();
