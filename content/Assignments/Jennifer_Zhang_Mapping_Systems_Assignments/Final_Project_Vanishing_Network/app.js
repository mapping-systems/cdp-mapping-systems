const HAILUN = window.HAILUN_DATA;
const POPULATION_BARS = window.HAILUN_POPULATION;
const BAR_HEIGHT_SCALE = 0.18;
const COUNTY_AGE_HEIGHT_SCALE = 38;
const COUNTY_HOUSEHOLD_HEIGHT_SCALE = 720;
const MIGRATION_ARROW_VALUE = 500000;
const MIGRATION_ROUTE_THRESHOLD = 500000;

// Province anchors are geographic display anchors, not claimed destination cities.
const PROVINCE_ANCHORS = {
  北京: [116.4074, 39.9042], 天津: [117.2000, 39.1333], 河北: [114.5149, 38.0428],
  山西: [112.5492, 37.8570], 内蒙古: [111.7492, 40.8426], 辽宁: [123.4315, 41.8057],
  吉林: [125.3235, 43.8171], 黑龙江: [126.6424, 45.7560], 上海: [121.4737, 31.2304],
  江苏: [118.7969, 32.0603], 浙江: [120.1551, 30.2741], 安徽: [117.2272, 31.8206],
  福建: [119.2965, 26.0745], 江西: [115.8582, 28.6829], 山东: [117.1201, 36.6512],
  河南: [113.6254, 34.7466], 湖北: [114.3054, 30.5931], 湖南: [112.9388, 28.2282],
  广东: [113.2644, 23.1291], 广西: [108.3200, 22.8240], 海南: [110.1983, 20.0440],
  重庆: [106.5516, 29.5630], 四川: [104.0665, 30.5723], 贵州: [106.6302, 26.6477],
  云南: [102.7123, 25.0406], 西藏: [91.1172, 29.6469], 陕西: [108.9398, 34.3416],
  甘肃: [103.8343, 36.0611], 青海: [101.7782, 36.6171], 宁夏: [106.2309, 38.4872],
  新疆: [87.6168, 43.8256],
};
const PROVINCE_LABELS = {
  北京: "BEIJING", 天津: "TIANJIN", 河北: "HEBEI", 山西: "SHANXI", 内蒙古: "INNER MONGOLIA",
  辽宁: "LIAONING", 吉林: "JILIN", 黑龙江: "HEILONGJIANG", 上海: "SHANGHAI", 江苏: "JIANGSU",
  浙江: "ZHEJIANG", 安徽: "ANHUI", 福建: "FUJIAN", 江西: "JIANGXI", 山东: "SHANDONG",
  河南: "HENAN", 湖北: "HUBEI", 湖南: "HUNAN", 广东: "GUANGDONG", 广西: "GUANGXI",
  海南: "HAINAN", 重庆: "CHONGQING", 四川: "SICHUAN", 贵州: "GUIZHOU", 云南: "YUNNAN",
  西藏: "TIBET", 陕西: "SHAANXI", 甘肃: "GANSU", 青海: "QINGHAI", 宁夏: "NINGXIA", 新疆: "XINJIANG",
};

function migrationFlow(origin, destination, people) {
  return { origin, destination, people };
}

// Official census long-form tables, 10% sample scaled by 10. Only routes >=500k
// are drawn; the readout totals include all 930 interprovincial OD pairs.
const CHINA_RURAL_URBAN_FLOWS = {
  2010: [
    migrationFlow("湖南", "广东", 3637950), migrationFlow("广西", "广东", 2804560),
    migrationFlow("四川", "广东", 2074670), migrationFlow("安徽", "上海", 1897800),
    migrationFlow("湖北", "广东", 1782100), migrationFlow("安徽", "浙江", 1705300),
    migrationFlow("安徽", "江苏", 1559050), migrationFlow("江西", "广东", 1416840),
    migrationFlow("河南", "广东", 1412890), migrationFlow("江西", "浙江", 1139630),
    migrationFlow("江苏", "上海", 1033620), migrationFlow("河南", "浙江", 916470),
    migrationFlow("贵州", "浙江", 913150), migrationFlow("河北", "北京", 876350),
    migrationFlow("四川", "浙江", 867060), migrationFlow("重庆", "广东", 720500),
    migrationFlow("贵州", "广东", 710770), migrationFlow("江西", "福建", 659630),
    migrationFlow("河南", "北京", 615590), migrationFlow("湖北", "浙江", 606510),
    migrationFlow("河南", "江苏", 595690), migrationFlow("四川", "福建", 564700),
    migrationFlow("河南", "上海", 562080),
  ],
  2020: [
    migrationFlow("湖南", "广东", 5354660), migrationFlow("广西", "广东", 4745610),
    migrationFlow("安徽", "浙江", 2893600), migrationFlow("四川", "广东", 2513370),
    migrationFlow("安徽", "江苏", 2455470), migrationFlow("湖北", "广东", 2455080),
    migrationFlow("江西", "广东", 2196810), migrationFlow("河南", "广东", 1969900),
    migrationFlow("河南", "浙江", 1959550), migrationFlow("安徽", "上海", 1698510),
    migrationFlow("江西", "浙江", 1651340), migrationFlow("贵州", "浙江", 1640720),
    migrationFlow("四川", "浙江", 1185050), migrationFlow("河南", "江苏", 1168490),
    migrationFlow("贵州", "广东", 1167940), migrationFlow("河北", "北京", 1131530),
    migrationFlow("江苏", "上海", 961710), migrationFlow("重庆", "广东", 845770),
    migrationFlow("湖北", "浙江", 810390), migrationFlow("河南", "上海", 786890),
    migrationFlow("湖南", "浙江", 749150), migrationFlow("江西", "福建", 748920),
    migrationFlow("四川", "重庆", 717520), migrationFlow("云南", "广东", 676190),
    migrationFlow("四川", "福建", 661450), migrationFlow("云南", "浙江", 622330),
    migrationFlow("河南", "北京", 564630), migrationFlow("黑龙江", "辽宁", 541570),
    migrationFlow("甘肃", "新疆", 535790), migrationFlow("福建", "广东", 511420),
    migrationFlow("安徽", "广东", 506240),
  ],
};

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function migrationRouteFeatures(year) {
  return {
    type: "FeatureCollection",
    features: (CHINA_RURAL_URBAN_FLOWS[year] || []).map((flow, index) => ({
      type: "Feature",
      properties: { ...flow, year, routeId: `${year}-${index}` },
      geometry: {
        type: "LineString",
        coordinates: [PROVINCE_ANCHORS[flow.origin], PROVINCE_ANCHORS[flow.destination]],
      },
    })),
  };
}

function migrationNodeFeatures(year) {
  const totals = new Map();
  (CHINA_RURAL_URBAN_FLOWS[year] || []).forEach((flow) => {
    const origin = totals.get(flow.origin) || { incoming: 0, outgoing: 0 };
    const destination = totals.get(flow.destination) || { incoming: 0, outgoing: 0 };
    origin.outgoing += flow.people;
    destination.incoming += flow.people;
    totals.set(flow.origin, origin);
    totals.set(flow.destination, destination);
  });
  return {
    type: "FeatureCollection",
    features: [...totals].map(([province, values]) => ({
      type: "Feature",
      properties: { province, ...values },
      geometry: { type: "Point", coordinates: PROVINCE_ANCHORS[province] },
    })),
  };
}

function evidenceBarFeature(id, lens, label, coordinates, values, scale, colors) {
  const [longitude, latitude] = coordinates;
  const halfWidth = lens === "age" ? 0.018 : 0.024;
  const halfHeight = lens === "age" ? 0.011 : 0.015;
  return {
    type: "Feature",
    properties: {
      id,
      lens,
      label,
      v2010: values[2010],
      v2020: values[2020],
      scale,
      color: colors.main,
      change_color: colors.change,
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [longitude - halfWidth, latitude - halfHeight],
        [longitude + halfWidth, latitude - halfHeight],
        [longitude + halfWidth, latitude + halfHeight],
        [longitude - halfWidth, latitude + halfHeight],
        [longitude - halfWidth, latitude - halfHeight],
      ]],
    },
  };
}

const COUNTY_EVIDENCE_BARS = {
  type: "FeatureCollection",
  features: [
    evidenceBarFeature(
      "age-youth",
      "age",
      "AGE 0-14",
      [126.87, 47.45],
      { 2010: 13.18, 2020: 10.76 },
      COUNTY_AGE_HEIGHT_SCALE,
      { main: "#89c9cd", change: "#ef806e" }
    ),
    evidenceBarFeature(
      "age-working",
      "age",
      "AGE 15-59",
      [126.94, 47.45],
      { 2010: 74.65, 2020: 64.88 },
      COUNTY_AGE_HEIGHT_SCALE,
      { main: "#f4f1ea", change: "#ef806e" }
    ),
    evidenceBarFeature(
      "age-older",
      "age",
      "AGE 60+",
      [127.01, 47.45],
      { 2010: 12.16, 2020: 24.36 },
      COUNTY_AGE_HEIGHT_SCALE,
      { main: "#efc66f", change: "#efc66f" }
    ),
    evidenceBarFeature(
      "household-size",
      "household",
      "HOUSEHOLD SIZE",
      [126.94, 47.45],
      { 2010: 3.25, 2020: 2.26 },
      COUNTY_HOUSEHOLD_HEIGHT_SCALE,
      { main: "#89c9cd", change: "#ef806e" }
    ),
  ],
};

const PERIOD_TYPES = {
  2000: "Census",
  2010: "Census",
  2014: "Yearbook",
  2015: "OSM snapshot",
  2020: "Census",
  2022: "Inventory",
  2025: "OSM snapshot",
};

const CURRENT_COUNTS = {
  settlements: HAILUN.settlements.features.length,
  roads: HAILUN.transport.features.filter((feature) => feature.properties.category === "road").length,
  railLines: HAILUN.transport.features.filter((feature) => feature.properties.category === "railway").length,
  railStations: HAILUN.services.features.filter((feature) => feature.properties.category === "rail").length,
  schools: HAILUN.services.features.filter((feature) => feature.properties.category === "school").length,
};

const SCHOOL_SCHEMATIC_COUNTS = { 2000: 390, 2010: 218, 2014: 32 };

function schoolPointRank(coordinates, index) {
  const raw = Math.sin(coordinates[0] * 12.9898 + coordinates[1] * 78.233 + index * 0.618) * 43758.5453;
  return raw - Math.floor(raw);
}

function buildSchematicSchoolUniverse() {
  const points = HAILUN.settlements.features
    .filter((feature) => feature.geometry?.type === "Point")
    .map((feature, index) => ({
      type: "Feature",
      properties: {
        id: `school-schematic-${index}`,
        category: "schematic-school",
        rank: schoolPointRank(feature.geometry.coordinates, index),
      },
      geometry: {
        type: "Point",
        coordinates: [...feature.geometry.coordinates],
      },
    }));

  const baseLength = points.length;
  for (let index = baseLength; index < SCHOOL_SCHEMATIC_COUNTS[2000]; index += 1) {
    const base = points[((index - baseLength) * 73 + 19) % baseLength];
    const angle = (index - baseLength + 1) * 2.399963;
    const [longitude, latitude] = base.geometry.coordinates;
    const coordinates = [
      longitude + Math.cos(angle) * 0.0035,
      latitude + Math.sin(angle) * 0.0022,
    ];
    points.push({
      type: "Feature",
      properties: {
        id: `school-schematic-${index}`,
        category: "schematic-school",
        rank: schoolPointRank(coordinates, index),
      },
      geometry: { type: "Point", coordinates },
    });
  }

  return points.sort((a, b) => a.properties.rank - b.properties.rank);
}

const SCHOOL_SCHEMATIC_UNIVERSE = buildSchematicSchoolUniverse();
const SCHOOL_SCHEMATIC_BY_YEAR = Object.fromEntries(
  Object.entries(SCHOOL_SCHEMATIC_COUNTS).map(([year, count]) => [
    year,
    {
      type: "FeatureCollection",
      features: SCHOOL_SCHEMATIC_UNIVERSE.slice(0, count).map((feature, index) => ({
        ...feature,
        properties: {
          ...feature.properties,
          year: Number(year),
          sequence: index + 1,
          locationStatus: "schematic-settlement-based",
        },
      })),
    },
  ])
);

const SCHOOL_LABELS_EN = {
  "海南乡中学": "Hainan Township Middle School",
  "东方红小学": "Dongfanghong Primary School",
};

const SERIES = {
  all: {
    measure: "permanent residents",
    mapSignal: true,
    baselineYear: 2010,
    latestYear: 2020,
    records: {
      2000: {
        value: 720008,
        quality: "DOCUMENTED",
        source: "Fifth national census",
        metrics: [["720,008", "permanent residents"], ["-6.42%", "below the 2010 peak"]],
      },
      2010: {
        value: 769437,
        quality: "DOCUMENTED",
        source: "Sixth national census",
        metrics: [["580,976", "rural residents"], ["24.49%", "urbanization"], ["Peak", "series baseline"]],
      },
      2020: {
        value: 480216,
        quality: "DOCUMENTED",
        source: "Seventh national census",
        metrics: [["315,450", "rural residents"], ["34.31%", "urbanization"], ["-289,221", "residents since 2010"]],
      },
    },
  },
  populationAge: {
    measure: "residents age 60+",
    mapSignal: false,
    baselineYear: 2010,
    latestYear: 2020,
    records: {
      2010: {
        value: 12.16,
        displaySuffix: "%",
        quality: "DERIVED SHARE",
        periodType: "Census comparison",
        source: "Derived from the Hailun seventh census bulletin's published percentage-point changes",
        metrics: [
          ["12.16%", "residents age 60+", 12.16],
          ["74.65%", "age 15-59", 74.65],
          ["13.18%", "age 0-14", 13.18],
          ["7.15%", "residents age 65+", 7.15],
        ],
      },
      2020: {
        value: 24.36,
        displaySuffix: "%",
        quality: "DOCUMENTED",
        source: "Hailun seventh national census bulletin",
        metrics: [
          ["116,975", "residents age 60+ / 24.36%", 24.36],
          ["311,550", "age 15-59 / 64.88%", 64.88],
          ["51,691", "age 0-14 / 10.76%", 10.76],
          ["78,222", "residents age 65+ / 16.29%", 16.29],
        ],
      },
    },
  },
  populationHousehold: {
    measure: "people per family household",
    mapSignal: false,
    baselineYear: 2010,
    latestYear: 2020,
    records: {
      2010: {
        value: 3.25,
        quality: "DERIVED",
        periodType: "Census comparison",
        source: "Derived from the 2020 average of 2.26 and the published decrease of 0.99 since 2010",
        metrics: [
          ["3.25", "people per family household"],
          ["-0.99", "published change to 2020"],
        ],
      },
      2020: {
        value: 2.26,
        quality: "DOCUMENTED",
        source: "Hailun seventh national census bulletin",
        metrics: [
          ["2.26", "people per family household"],
          ["204,513", "family households"],
          ["461,685", "family-household residents"],
          ["5,533", "collective households"],
        ],
      },
    },
  },
  school: {
    measure: "ordinary primary schools",
    mapSignal: false,
    baselineYear: 2000,
    latestYear: 2022,
    records: {
      2000: {
        value: 390,
        quality: "COMPILED YEARBOOK",
        periodType: "County yearbook",
        source: "Hailun ordinary-primary-school series compiled from county yearbooks by Owei Data",
        metrics: [
          ["390", "ordinary primary schools"],
          ["55", "ordinary middle schools"],
          ["Baseline", "historical comparison"],
          ["390", "schematic comparison points"],
        ],
      },
      2010: {
        value: 218,
        quality: "COMPILED YEARBOOK",
        periodType: "County yearbook",
        source: "Hailun ordinary-primary-school series compiled from county yearbooks by Owei Data",
        metrics: [
          ["218", "ordinary primary schools"],
          ["42", "ordinary middle schools"],
          ["-44.1%", "primary schools since 2000"],
          ["218", "schematic comparison points"],
        ],
      },
      2014: {
        value: 32,
        quality: "COMPILED YEARBOOK",
        periodType: "County yearbook",
        source: "Hailun ordinary-primary-school series compiled from county yearbooks by Owei Data",
        metrics: [
          ["32", "ordinary primary schools"],
          ["29", "ordinary middle schools"],
          ["-91.8%", "primary schools since 2000"],
          ["32", "schematic comparison points"],
        ],
      },
      2022: {
        value: 34,
        quality: "OFFICIAL-DERIVED",
        periodType: "Definition break",
        source: "Derived from Hailun's official 2022 report: 26 compliant primary schools represented 76.5%",
        metrics: [
          ["34", "primary-serving schools · derived"],
          ["54", "unique compulsory schools · official"],
          ["33", "middle-serving schools · derived"],
          ["13", "primary + middle overlap · derived"],
          ["29,382", "compulsory students"],
          ["2", "current open-map school coordinates"],
        ],
      },
    },
  },
  migration: {
    measure: "interprovincial rural-to-urban residents",
    mapSignal: true,
    baselineYear: 2010,
    latestYear: 2020,
    records: {
      2010: {
        value: 53153560,
        quality: "CENSUS OD",
        periodType: "Sixth census",
        source: "China 2010 Population Census long-form Table 7-1; 10% sample scaled ×10",
        metrics: [
          ["23", "routes ≥500,000 shown"],
          ["29,072,910", "people on displayed routes"],
          ["54.7%", "of full national OD total shown"],
          ["3,637,950", "largest: Hunan → Guangdong"],
        ],
      },
      2020: {
        value: 80850300,
        quality: "CENSUS OD",
        periodType: "Seventh census",
        source: "China 2020 Population Census Yearbook long-form Tables 7-1a/7-1b; 10% sample scaled ×10",
        metrics: [
          ["31", "routes ≥500,000 shown"],
          ["46,427,600", "people on displayed routes"],
          ["57.4%", "of full national OD total shown"],
          ["5,354,660", "largest: Hunan → Guangdong"],
        ],
      },
    },
  },
  road: {
    measure: "mapped drivable-road km",
    mapSignal: true,
    baselineYear: 2014,
    latestYear: 2025,
    records: {
      2014: {
        value: 115.84592,
        displayValue: 115.8,
        quality: "OSM HISTORY",
        periodType: "OSM snapshot",
        source: "ohsome API / OpenStreetMap history snapshot, clipped to Hailun",
        featureCount: 6,
        density: 2.5,
        metrics: [["115.8 km", "mapped drivable roads"], ["6", "OSM road ways"], ["2.5 km", "per 100 km²"], ["Baseline", "first nonzero snapshot"]],
      },
      2015: {
        value: 333.00739,
        displayValue: 333.0,
        quality: "OSM HISTORY",
        periodType: "OSM snapshot",
        source: "ohsome API / OpenStreetMap history snapshot, clipped to Hailun",
        featureCount: 13,
        density: 7.2,
        metrics: [["333.0 km", "mapped drivable roads"], ["13", "OSM road ways"], ["7.2 km", "per 100 km²"], ["+217.2 km", "since 2014"]],
      },
      2020: {
        value: 1097.82217,
        displayValue: 1097.8,
        quality: "OSM HISTORY",
        periodType: "OSM snapshot",
        source: "ohsome API / OpenStreetMap history snapshot, clipped to Hailun",
        featureCount: 778,
        density: 23.6,
        metrics: [["1,097.8 km", "mapped drivable roads"], ["778", "OSM road ways"], ["23.6 km", "per 100 km²"], ["+982.0 km", "since 2014"]],
      },
      2025: {
        value: 1351.69245,
        displayValue: 1351.7,
        quality: "OSM HISTORY",
        periodType: "OSM snapshot",
        source: "ohsome API / OpenStreetMap history snapshot, clipped to Hailun",
        featureCount: 823,
        density: 29.0,
        metrics: [["1,351.7 km", "mapped drivable roads"], ["823", "OSM road ways"], ["29.0 km", "per 100 km²"], ["+1,235.8 km", "since 2014"]],
      },
    },
  },
};

const CHAPTERS = {
  all: {
    number: "00 / POPULATION",
    title: "289,221 people disappear",
    copy: "Each 3D column contains the population estimated within its real 3 km grid cell. Move from 2010 to 2020 and watch the same columns collapse by 289,221 residents.",
    status: "WorldPop spatial grid / normalized to official census totals",
    statusColor: "#9fc58c",
    preferredYear: 2020,
    camera: { center: [126.9869, 47.4165], zoom: 8.35, pitch: 67, bearing: -24 },
  },
  school: {
    number: "01 / SCHOOL",
    title: "390 counted. Two remain visible.",
    copy: "Hailun's ordinary primary-school count contracts from 390 in 2000 to 218 in 2010 and 32 in 2014. Historical years use settlement-based comparison dots to make that collapse visible; the final frame replaces them with the two current school sites that have public coordinates.",
    status: "Documented counts / schematic historical distribution / 2 mapped current sites",
    statusColor: "#89c9cd",
    preferredYear: 2000,
    autoPlayToLatest: true,
    camera: { center: [126.9869, 47.4165], zoom: 8.35, pitch: 0, bearing: 0 },
  },
  migration: {
    number: "02 / OUTFLOW",
    title: "Hailun cannot tell us where. China can.",
    copy: "These are documented province-to-province rural-to-urban residents: arrow direction is real, line width is people, and arrow frequency is proportional to flow.",
    status: "Sixth + seventh census long-form OD tables / routes ≥500,000",
    statusColor: "#89c9cd",
    preferredYear: 2010,
    autoPlayToLatest: true,
    camera: { center: [104.8, 35.6], zoom: 3.25, pitch: 0, bearing: 0 },
  },
  road: {
    number: "03 / ROAD GRID",
    title: "115.8 becomes 1,351.7 km",
    copy: "Across four OSM snapshots, Hailun's mapped drivable-road network expands from 115.8 km in 2014 to 1,351.7 km in 2025—an 11.7× increase. The strongest expansion appears between 2015 and 2020; growth then continues at a slower pace through 2025.",
    status: "ohsome OSM history / four observations from 2014–2025",
    statusColor: "#efc66f",
    preferredYear: 2025,
    camera: { center: [126.9869, 47.4165], zoom: 8.55, pitch: 72, bearing: 16 },
  },
};

const POPULATION_LENSES = {
  total: {
    seriesKey: "all",
    title: "289,221 people disappear",
    copy: "Each 3D column contains the population estimated within its real 3 km grid cell. Move from 2010 to 2020 and watch the same columns collapse by 289,221 residents.",
    status: "WorldPop spatial grid / normalized to official census totals",
    statusColor: "#9fc58c",
    preferredYear: 2020,
  },
  age: {
    seriesKey: "populationAge",
    title: "A population grows older",
    copy: "Residents age 60+ rise from 12.16% in 2010 to 24.36% in 2020, while the working-age share falls 9.77 percentage points.",
    status: "Hailun census / countywide age structure",
    statusColor: "#efc66f",
    preferredYear: 2010,
    autoPlayToLatest: true,
    camera: { center: [126.94, 47.425], zoom: 11.35, pitch: 58, bearing: 0 },
  },
  household: {
    seriesKey: "populationHousehold",
    title: "Households contract",
    copy: "Average family-household size falls from 3.25 people in 2010 to 2.26 in 2020. This is countywide census evidence, not a village-level map.",
    status: "Hailun census / countywide household structure",
    statusColor: "#89c9cd",
    preferredYear: 2010,
    autoPlayToLatest: true,
    camera: { center: [126.94, 47.425], zoom: 11.55, pitch: 58, bearing: 0 },
  },
};

const POPULATION_REPORT_VIEW = {
  seriesKey: "all",
  title: "Three censuses / seen from above",
  copy: "Compare Hailun's 2000, 2010 and 2020 population censuses on a north-up 2D map. Each year pairs countywide census figures with the matching WorldPop surface normalized to that census total.",
  status: "Hailun population censuses / 2000, 2010 and 2020",
  statusColor: "#89c9cd",
  preferredYear: 2020,
  camera: { center: [126.9869, 47.4165], zoom: 8.15, pitch: 0, bearing: 0 },
};

const POPULATION_REPORTS = {
  2000: {
    censusLabel: "Fifth national census / 2000",
    total: 720008,
    change: "BASELINE",
    changeLabel: "census benchmark",
    residence: { urban: 144242, urbanShare: 20.03, rural: 575766, ruralShare: 79.97 },
    sex: { male: 368751, maleShare: 51.21, female: 351257, femaleShare: 48.79 },
    age: null,
    household: { families: 194880, size: 3.67, familyPopulation: 715560 },
    note: "Countywide fifth-census table values. A comparable local age-group table was not available, so no 2000 age split is inferred. The map uses the 2000 WorldPop surface normalized to 720,008.",
  },
  2010: {
    censusLabel: "Sixth national census / 2010",
    total: 769437,
    change: "+6.87%",
    changeLabel: "since 2000",
    residence: { urban: 188461, urbanShare: 24.49, rural: 580976, ruralShare: 75.51 },
    sex: { male: 389853, maleShare: 50.67, female: 379584, femaleShare: 49.33 },
    age: {
      youthShare: 13.18,
      workingShare: 74.65,
      olderShare: 12.16,
      detail: "0-14 / 15-59 / 60+ · shares reconstructed from published changes",
    },
    household: { families: 235334, size: 3.25, familyPopulation: 765095 },
    note: "Countywide sixth-census table values. Age shares and household size are reconstructed only from changes explicitly published in Hailun's seventh-census bulletin. The map uses the 2010 WorldPop surface normalized to 769,437.",
  },
  2020: {
    censusLabel: "Seventh national census / 2020",
    total: 480216,
    change: "-37.59%",
    changeLabel: "since 2010",
    residence: { urban: 164766, urbanShare: 34.31, rural: 315450, ruralShare: 65.69 },
    sex: { male: 242211, maleShare: 50.44, female: 238005, femaleShare: 49.56 },
    age: {
      youthShare: 10.76,
      workingShare: 64.88,
      olderShare: 24.36,
      detail: "0-14: 51,691 / 15-59: 311,550 / 60+: 116,975",
    },
    household: { families: 204513, size: 2.26, familyPopulation: 461685 },
    note: "Countywide values published in Hailun's seventh-census bulletin. The map uses the 2020 WorldPop surface normalized to 480,216; grid cells are spatial estimates, not township census observations.",
  },
};

const state = {
  chapter: "all",
  populationLens: "total",
  populationView: "terrain",
  periodIndex: 2,
  timelineDrag: null,
  orbitMode: true,
  orbitGesture: null,
  suppressMapClick: false,
  introStage: 0,
  introTimer: null,
  playTimer: null,
  lensAutoPlayTimer: null,
  mapLoaded: false,
  pendingCamera: null,
};

const dom = {
  shell: document.querySelector(".site-shell"),
  loading: document.querySelector("#loading"),
  loadingNumber: document.querySelector("#loading-number"),
  intro: document.querySelector("#intro"),
  introProgress: document.querySelector("#intro-progress"),
  mapInterface: document.querySelector("#map-interface"),
  yearSlider: document.querySelector("#year-slider"),
  activeYear: document.querySelector("#active-year"),
  periodLabel: document.querySelector("#period-label"),
  populationViewSwitch: document.querySelector("#population-view-switch"),
  populationLenses: document.querySelector("#population-lenses"),
  populationReportViz: document.querySelector("#population-report-viz"),
  populationGridKey: document.querySelector("#population-grid-key"),
  schoolMapKey: document.querySelector("#school-map-key"),
  schoolMapKeyTitle: document.querySelector("#school-map-key-title"),
  schoolMapKeyPoints: document.querySelector("#school-map-key-points"),
  schoolMapKeyCount: document.querySelector("#school-map-key-count"),
  schoolMapKeyNote: document.querySelector("#school-map-key-note"),
  schoolLocationGap: document.querySelector("#school-location-gap"),
  schoolGapYear: document.querySelector("#school-gap-year"),
  schoolGapCount: document.querySelector("#school-gap-count"),
  reportCensusLabel: document.querySelector("#report-census-label"),
  reportTotal: document.querySelector("#report-total"),
  reportChange: document.querySelector("#report-change"),
  reportChangeLabel: document.querySelector("#report-change-label"),
  reportResidenceDetail: document.querySelector("#report-residence-detail"),
  reportResidenceBar: document.querySelector("#report-residence-bar"),
  reportUrban: document.querySelector("#report-urban"),
  reportRural: document.querySelector("#report-rural"),
  reportAgeGroup: document.querySelector("#report-age-group"),
  reportAgeDetail: document.querySelector("#report-age-detail"),
  reportAgeBar: document.querySelector("#report-age-bar"),
  reportAgeUnavailable: document.querySelector("#report-age-unavailable"),
  reportYouth: document.querySelector("#report-youth"),
  reportWorking: document.querySelector("#report-working"),
  reportOlder: document.querySelector("#report-older"),
  reportSexDetail: document.querySelector("#report-sex-detail"),
  reportSexBar: document.querySelector("#report-sex-bar"),
  reportMale: document.querySelector("#report-male"),
  reportFemale: document.querySelector("#report-female"),
  reportFamilyHouseholds: document.querySelector("#report-family-households"),
  reportHouseholdSize: document.querySelector("#report-household-size"),
  reportFamilyPopulation: document.querySelector("#report-family-population"),
  reportNote: document.querySelector("#report-note"),
  evidenceQuality: document.querySelector("#evidence-quality"),
  primaryValue: document.querySelector("#primary-value"),
  primaryLabel: document.querySelector("#primary-label"),
  metricList: document.querySelector("#metric-list"),
  chartLines: document.querySelector("#chart-lines"),
  chartPoints: document.querySelector("#chart-points"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  changeValue: document.querySelector("#change-value"),
  changeLabel: document.querySelector("#change-label"),
  signalKey: document.querySelector("#signal-key"),
  timelineState: document.querySelector("#timeline-state"),
  timelineTicks: document.querySelector("#timeline-ticks"),
  playTimeline: document.querySelector("#play-timeline"),
  terrainBadge: document.querySelector("#terrain-badge"),
  orbitToggle: document.querySelector("#orbit-view"),
  interactionHint: document.querySelector("#interaction-hint"),
  migrationOverlay: document.querySelector("#migration-overlay"),
  migrationParticles: document.querySelector("#migration-particles"),
  migrationTotal: document.querySelector("#migration-total"),
  migrationLabel: document.querySelector("#migration-label"),
  migrationNote: document.querySelector("#migration-note"),
  chapterNumber: document.querySelector("#chapter-number"),
  chapterTitle: document.querySelector("#chapter-title"),
  chapterCopy: document.querySelector("#chapter-copy"),
  chapterStatus: document.querySelector("#chapter-status"),
  chapterStatusDot: document.querySelector("#chapter-status-dot"),
  methodDrawer: document.querySelector("#method-drawer"),
  popup: document.querySelector("#feature-popup"),
  popupKind: document.querySelector("#feature-kind"),
  popupName: document.querySelector("#feature-name"),
};

function formatNumber(value) {
  return Number(value).toLocaleString("en-US");
}

function seriesKeyForChapter(chapter = state.chapter) {
  return chapter === "all"
    ? state.populationView === "report"
      ? POPULATION_REPORT_VIEW.seriesKey
      : POPULATION_LENSES[state.populationLens].seriesKey
    : chapter;
}

function activeSeries() {
  return SERIES[seriesKeyForChapter()];
}

function formatRecordValue(record) {
  return `${formatNumber(record.displayValue ?? record.value)}${record.displaySuffix ?? ""}`;
}

function percentChange(value, baseline) {
  const result = ((value - baseline) / baseline) * 100;
  const prefix = result > 0 ? "+" : "";
  return `${prefix}${result.toFixed(2)}%`;
}

function periodsForChapter(chapter = state.chapter) {
  const series = SERIES[seriesKeyForChapter(chapter)];
  return Object.keys(series.records)
    .map(Number)
    .sort((a, b) => a - b)
    .map((year) => ({
      year,
      type: series.records[year].periodType || PERIOD_TYPES[year] || "Evidence",
    }));
}

function activePeriod() {
  const periods = periodsForChapter();
  return periods[state.periodIndex] || periods[periods.length - 1];
}

function periodIndexForYear(chapter, year) {
  const index = periodsForChapter(chapter).findIndex((period) => period.year === year);
  return index >= 0 ? index : periodsForChapter(chapter).length - 1;
}

function configureTimeline() {
  const periods = periodsForChapter();
  state.periodIndex = Math.max(0, Math.min(state.periodIndex, periods.length - 1));
  dom.yearSlider.max = String(Math.max(0, periods.length - 1));
  dom.yearSlider.step = "0.01";
  setSliderPosition(state.periodIndex);
  dom.yearSlider.disabled = periods.length < 2;
  dom.timelineTicks.style.gridTemplateColumns = `repeat(${periods.length}, 1fr)`;
  dom.timelineTicks.replaceChildren(...periods.map((period) => {
    const tick = document.createElement("span");
    tick.textContent = period.year;
    return tick;
  }));
}

function setSliderPosition(value) {
  const maximum = Number(dom.yearSlider.max) || 0;
  const clamped = Math.max(0, Math.min(Number(value), maximum));
  const progress = maximum === 0 ? 0 : (clamped / maximum) * 100;
  dom.yearSlider.value = String(clamped);
  dom.yearSlider.style.setProperty("--slider-progress", `${progress}%`);
}

function activeEvidence() {
  const period = activePeriod();
  const series = activeSeries();
  const record = series.records[period.year];
  if (record) {
    return {
      ...record,
      primary: formatRecordValue(record),
      label: record.displayLabel ?? series.measure,
    };
  }
  return {
    value: null,
    primary: "--",
    label: "no comparable observation for this year",
    quality: "EVIDENCE GAP",
    source: "No comparable published value",
    metrics: [
      ["Not zero", "missing evidence"],
      ["No estimate", "invented values excluded"],
      [formatNumber(CURRENT_COUNTS.settlements), "current mapped settlements remain"],
    ],
  };
}

function seriesChange(series) {
  if (!series.baselineYear || !series.latestYear) return null;
  const baseline = series.records[series.baselineYear];
  const latest = series.records[series.latestYear];
  if (!baseline || !latest) return null;
  return {
    value: percentChange(latest.value, baseline.value),
    label: `from ${series.baselineYear} to ${series.latestYear}`,
  };
}

function chartCoordinates(series) {
  const periods = periodsForChapter();
  const values = Object.values(series.records).map((record) => record.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const span = maximum - minimum || maximum || 1;
  return periods.map((period, index) => {
    const record = series.records[period.year];
    return {
      index,
      period,
      record,
      x: periods.length === 1 ? 50 : 4 + (index / (periods.length - 1)) * 92,
      y: 12 + ((maximum - record.value) / span) * 68,
    };
  });
}

function showChartTooltip(point, element) {
  const record = point.record;
  if (!record) return;
  dom.chartTooltip.innerHTML = "";
  const value = document.createElement("strong");
  value.textContent = `${point.period.year} / ${formatRecordValue(record)}`;
  const source = document.createElement("span");
  source.textContent = record.source;
  dom.chartTooltip.append(value, source);
  dom.chartTooltip.style.left = `${Math.max(2, Math.min(68, point.x - 13))}%`;
  dom.chartTooltip.style.top = `${Math.max(0, point.y - 34)}%`;
  dom.chartTooltip.classList.add("is-visible");
  dom.chartTooltip.setAttribute("aria-hidden", "false");
  element.setAttribute("aria-describedby", "chart-tooltip");
}

function hideChartTooltip(element) {
  dom.chartTooltip.classList.remove("is-visible");
  dom.chartTooltip.setAttribute("aria-hidden", "true");
  element.removeAttribute("aria-describedby");
}

function hideFeaturePopup() {
  dom.popup.classList.remove("is-visible");
  dom.popup.setAttribute("aria-hidden", "true");
}

function setPeriod(index, preservePlayback = false) {
  if (!preservePlayback) stopTimeline();
  hideFeaturePopup();
  const periods = periodsForChapter();
  state.periodIndex = Math.max(0, Math.min(index, periods.length - 1));
  setSliderPosition(state.periodIndex);
  renderReadout();
  updateMapLayers();
}

function renderChart() {
  const series = activeSeries();
  const points = chartCoordinates(series);
  dom.chartLines.replaceChildren();
  dom.chartLines.setAttribute("viewBox", "0 0 100 100");
  dom.chartLines.setAttribute("preserveAspectRatio", "none");
  const observed = points.filter((point) => point.record);

  observed.slice(1).forEach((point, index) => {
    const previous = observed[index];
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", previous.x);
    line.setAttribute("y1", previous.y);
    line.setAttribute("x2", point.x);
    line.setAttribute("y2", point.y);
    dom.chartLines.append(line);
  });

  dom.chartPoints.replaceChildren(...points.map((point) => {
    const marker = document.createElement("span");
    marker.className = `chart-point${point.index === state.periodIndex ? " is-active" : ""}`;
    marker.style.left = `${point.x}%`;
    marker.style.top = `${point.y}%`;
    marker.dataset.year = String(point.period.year);
    marker.addEventListener("pointerenter", () => showChartTooltip(point, marker));
    marker.addEventListener("pointerleave", () => hideChartTooltip(marker));
    return marker;
  }));
}

function setReportSegment(element, share) {
  element.style.setProperty("--segment", `${share}%`);
  element.textContent = `${share.toFixed(2)}%`;
}

function renderPopulationReport() {
  if (state.chapter !== "all" || state.populationView !== "report") return;
  const year = activePeriod().year;
  const report = POPULATION_REPORTS[year];
  if (!report) return;

  document.querySelectorAll("[data-report-year]").forEach((button) => {
    const isActive = Number(button.dataset.reportYear) === year;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  dom.reportCensusLabel.textContent = report.censusLabel;
  dom.reportTotal.textContent = formatNumber(report.total);
  dom.reportChange.textContent = report.change;
  dom.reportChangeLabel.textContent = report.changeLabel;
  dom.timelineState.textContent = `${year} CENSUS`;

  dom.reportResidenceDetail.textContent = `${formatNumber(report.residence.urban)} urban / ${formatNumber(report.residence.rural)} rural`;
  dom.reportResidenceBar.setAttribute(
    "aria-label",
    `Urban ${report.residence.urbanShare.toFixed(2)} percent; rural ${report.residence.ruralShare.toFixed(2)} percent`
  );
  setReportSegment(dom.reportUrban, report.residence.urbanShare);
  setReportSegment(dom.reportRural, report.residence.ruralShare);

  const hasAge = Boolean(report.age);
  dom.reportAgeGroup.classList.toggle("is-unavailable", !hasAge);
  dom.reportAgeBar.hidden = !hasAge;
  dom.reportAgeUnavailable.hidden = hasAge;
  if (hasAge) {
    dom.reportAgeDetail.textContent = report.age.detail;
    dom.reportAgeBar.setAttribute(
      "aria-label",
      `Age 0 to 14: ${report.age.youthShare.toFixed(2)} percent; age 15 to 59: ${report.age.workingShare.toFixed(2)} percent; age 60 and above: ${report.age.olderShare.toFixed(2)} percent`
    );
    setReportSegment(dom.reportYouth, report.age.youthShare);
    setReportSegment(dom.reportWorking, report.age.workingShare);
    setReportSegment(dom.reportOlder, report.age.olderShare);
  } else {
    dom.reportAgeDetail.textContent = "not available in the sourced county table";
  }

  dom.reportSexDetail.textContent = `${formatNumber(report.sex.male)} male / ${formatNumber(report.sex.female)} female`;
  dom.reportSexBar.setAttribute(
    "aria-label",
    `Male ${report.sex.maleShare.toFixed(2)} percent; female ${report.sex.femaleShare.toFixed(2)} percent`
  );
  setReportSegment(dom.reportMale, report.sex.maleShare);
  setReportSegment(dom.reportFemale, report.sex.femaleShare);

  dom.reportFamilyHouseholds.textContent = formatNumber(report.household.families);
  dom.reportHouseholdSize.textContent = report.household.size.toFixed(2);
  dom.reportFamilyPopulation.textContent = formatNumber(report.household.familyPopulation);
  dom.reportNote.textContent = report.note;
}

function renderReadout() {
  const period = activePeriod();
  const evidence = activeEvidence();
  const series = activeSeries();
  const change = seriesChange(series);

  dom.activeYear.textContent = String(period.year);
  dom.periodLabel.textContent = `${period.year} ${period.type.toUpperCase()}`;
  dom.evidenceQuality.textContent = evidence.quality;
  dom.evidenceQuality.dataset.quality = evidence.quality.toLowerCase().replace(/\s+/g, "-");
  dom.primaryValue.textContent = evidence.primary;
  dom.primaryLabel.textContent = evidence.label;
  dom.timelineState.textContent = evidence.value == null ? "NO COMPARABLE VALUE" : evidence.quality;
  dom.metricList.replaceChildren(...evidence.metrics.map(([value, label, share]) => {
    const row = document.createElement("div");
    row.className = "readout-metric";
    if (share != null) {
      row.classList.add("has-share");
      row.style.setProperty("--share", `${share}%`);
    }
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = value;
    row.append(labelNode, valueNode);
    return row;
  }));

  dom.changeValue.textContent = change ? change.value : "SNAPSHOT";
  dom.changeLabel.textContent = change ? change.label : "no longitudinal claim";
  dom.changeValue.classList.toggle("is-snapshot", !change);
  if (state.chapter === "school") {
    const showCurrentSchoolSites = period.year === 2022;
    const pointCount = SCHOOL_SCHEMATIC_COUNTS[period.year] || 0;
    dom.schoolLocationGap.classList.toggle("is-visible", !showCurrentSchoolSites);
    dom.schoolLocationGap.setAttribute("aria-hidden", String(showCurrentSchoolSites));
    dom.schoolGapYear.textContent = `${period.year} / SCHEMATIC SCHOOL NETWORK`;
    dom.schoolGapCount.textContent = formatRecordValue(evidence);
    dom.schoolMapKeyTitle.textContent = showCurrentSchoolSites
      ? "2022 / 2 mapped sites"
      : `${period.year} / ${formatNumber(pointCount)} comparison dots`;
    dom.schoolMapKeyPoints.textContent = showCurrentSchoolSites
      ? "2 current school sites with public coordinates"
      : `${formatNumber(pointCount)} schematic settlement-based points`;
    dom.schoolMapKeyCount.textContent = showCurrentSchoolSites
      ? "34 primary-serving · derived / 54 compulsory · official"
      : `${formatRecordValue(evidence)} ordinary primary schools · documented count`;
    dom.schoolMapKeyNote.textContent = showCurrentSchoolSites
      ? "The final frame shows only the two current sites with open-map coordinates; the countywide 2022 school totals remain in the evidence panel."
      : `The ${period.year} count is documented. Dot positions are an approximate comparison field distributed across mapped settlements, not archived school addresses.`;
  } else {
    dom.schoolLocationGap.classList.remove("is-visible");
    dom.schoolLocationGap.setAttribute("aria-hidden", "true");
  }
  renderChart();
  renderPopulationReport();
  updateMigrationOverlay();
}

function updateMigrationOverlay() {
  const isVisible = state.chapter === "migration";
  const year = activePeriod().year;
  dom.migrationOverlay.classList.toggle("is-active", isVisible);
  dom.migrationOverlay.setAttribute("aria-hidden", String(!isVisible));
  if (!isVisible) {
    document.querySelectorAll(".china-flow-label").forEach((label) => label.classList.remove("is-visible"));
    return;
  }
  dom.migrationTotal.textContent = `${(activeEvidence().value / 1000000).toFixed(2)}M`;
  dom.migrationLabel.textContent = `rural → urban residents across provincial borders / ${year}`;
  dom.migrationNote.textContent = `${(CHINA_RURAL_URBAN_FLOWS[year] || []).length} routes ≥ ${formatNumber(MIGRATION_ROUTE_THRESHOLD)} shown / province anchors are not claimed destination cities`;
  renderMigrationParticles(year);
  updateMigrationDestinationLabels(year);
  if (state.mapLoaded) updateMigrationParticlePositions();
}

function renderChapter() {
  const isPopulationReport = state.chapter === "all" && state.populationView === "report";
  const isSchoolMap = state.chapter === "school";
  const isMigrationMap = state.chapter === "migration";
  const chapter = state.chapter === "all"
    ? {
        ...CHAPTERS.all,
        ...(isPopulationReport ? POPULATION_REPORT_VIEW : POPULATION_LENSES[state.populationLens]),
      }
    : CHAPTERS[state.chapter];
  if (state.mapLoaded) map.resize();
  hideFeaturePopup();
  dom.chapterNumber.textContent = chapter.number;
  dom.chapterTitle.textContent = chapter.title;
  dom.chapterCopy.textContent = chapter.copy;
  dom.chapterStatus.textContent = chapter.status;
  dom.chapterStatusDot.style.background = chapter.statusColor;
  dom.chapterStatusDot.style.boxShadow = `0 0 0 4px ${chapter.statusColor}22`;
  document.querySelectorAll(".chapter-link").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.layer === state.chapter);
  });
  dom.populationViewSwitch.classList.toggle("is-visible", state.chapter === "all");
  document.querySelectorAll("[data-population-view]").forEach((button) => {
    const isActive = button.dataset.populationView === state.populationView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  dom.populationLenses.classList.toggle("is-visible", state.chapter === "all" && !isPopulationReport);
  document.querySelectorAll("[data-population-lens]").forEach((button) => {
    const isActive = button.dataset.populationLens === state.populationLens;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  dom.populationReportViz.classList.toggle("is-visible", isPopulationReport);
  dom.populationReportViz.setAttribute("aria-hidden", String(!isPopulationReport));
  dom.populationGridKey.setAttribute("aria-hidden", String(!isPopulationReport));
  dom.schoolMapKey.classList.toggle("is-visible", isSchoolMap);
  dom.schoolMapKey.setAttribute("aria-hidden", String(!isSchoolMap));
  dom.shell.classList.toggle("is-population-report", isPopulationReport);
  dom.shell.classList.toggle("is-school-map", isSchoolMap);
  dom.shell.classList.toggle("is-migration-map", isMigrationMap);
  configureTimeline();
  renderReadout();
  if (isPopulationReport || isSchoolMap || isMigrationMap) {
    dom.playTimeline.disabled = periodsForChapter().length < 2;
    dom.timelineState.textContent = isPopulationReport
      ? `${activePeriod().year} CENSUS`
      : isMigrationMap
      ? `${activePeriod().year} CENSUS OD`
      : `${activePeriod().year} ${activePeriod().type.toUpperCase()}`;
    dom.orbitToggle.disabled = true;
    dom.orbitToggle.setAttribute(
      "aria-label",
      isPopulationReport
        ? "2D census view locks rotation"
        : isMigrationMap
        ? "National migration view locks rotation"
        : "2D school-location evidence locks rotation"
    );
    dom.terrainBadge.textContent = isPopulationReport
      ? "2D north-up / census"
      : isMigrationMap
      ? "2D China / census OD"
      : "2D north-up / location evidence";
    dom.interactionHint.textContent = isPopulationReport
      ? "2D census mode / north up / drag to pan / scroll to zoom"
      : isMigrationMap
      ? "China census OD / drag to pan / scroll to zoom / 2010 auto-plays to 2020"
      : "2D school locations / drag to pan / scroll to zoom / click a mapped school";
    if (state.mapLoaded) {
      map.setTerrain(null);
      map.dragPan.enable();
      map.dragRotate.disable();
    }
  } else {
    dom.playTimeline.disabled = periodsForChapter().length < 2;
    dom.orbitToggle.disabled = false;
    dom.terrainBadge.textContent = "DEM terrain 2.2x";
    if (state.mapLoaded) {
      map.setTerrain({ source: "terrainSource", exaggeration: 2.2 });
    }
    setOrbitMode(state.orbitMode);
  }
  updateMapLayers();
  moveCamera(chapter.camera);
}

function setLayerOpacity(id, property, value) {
  if (state.mapLoaded && map.getLayer(id)) {
    map.setPaintProperty(id, property, value);
  }
}

function updateMapLayers() {
  if (!state.mapLoaded) return;
  const chapter = state.chapter;
  const period = activePeriod();
  const series = activeSeries();
  const record = series.records[period.year];
  const populationProperty = {
    2000: "p2000",
    2010: "p2010",
    2020: "p2020",
  }[period.year];
  const isPopulationReport = chapter === "all" && state.populationView === "report";
  const showPopulationBars = chapter === "all"
    && state.populationView === "terrain"
    && state.populationLens === "total"
    && Boolean(populationProperty);
  const showPopulationGrid2d = isPopulationReport && Boolean(populationProperty);
  const values = Object.values(series.records).map((item) => item.value);
  const signal = series.mapSignal && record ? record.value / Math.max(...values) : null;
  const isRoadChapter = chapter === "road";
  const isSchoolChapter = chapter === "school";
  const isMigrationChapter = chapter === "migration";
  const showRoads = chapter === "all" || isRoadChapter || isSchoolChapter;
  const showRail = chapter === "all" && !isPopulationReport;
  const showSettlements = !isSchoolChapter;
  const settlementOpacity = isMigrationChapter
    ? 0
    : isRoadChapter
    ? 0.1
    : isSchoolChapter
    ? 0
    : isPopulationReport
    ? 0.08
    : showPopulationBars
    ? 0.12
    : signal == null
    ? (showSettlements ? 0.68 : 0.22)
    : 0.11 + signal * 0.71;
  const haloOpacity = isMigrationChapter
    ? 0
    : isRoadChapter
    ? 0.025
    : isSchoolChapter
    ? 0
    : isPopulationReport
    ? 0.015
    : signal == null
    ? (showSettlements ? 0.17 : 0.05)
    : 0.025 + signal * 0.2;

  const roadLineOpacity = isMigrationChapter
    ? 0
    : isRoadChapter
    ? 0.18 + signal * 0.76
    : isSchoolChapter
    ? 0
    : (showRoads ? 0.74 : 0.2);
  const roadGlowOpacity = isMigrationChapter
    ? 0
    : isRoadChapter
    ? 0.04 + signal * 0.52
    : isSchoolChapter
    ? 0
    : (showRoads ? 0.34 : 0.08);
  setLayerOpacity("roads-glow", "line-opacity", roadGlowOpacity);
  setLayerOpacity("roads-line", "line-opacity", roadLineOpacity);
  setLayerOpacity("rail-glow", "line-opacity", (isSchoolChapter || isMigrationChapter) ? 0 : (showRail ? 0.72 : 0.12));
  setLayerOpacity("rail-line", "line-opacity", (isSchoolChapter || isMigrationChapter) ? 0 : (showRail ? 0.95 : 0.26));
  setLayerOpacity("settlement-halo", "circle-opacity", haloOpacity);
  setLayerOpacity("settlement-points", "circle-opacity", settlementOpacity);
  setLayerOpacity("boundary-fill", "fill-opacity", isMigrationChapter ? 0 : (signal == null ? 0.035 : 0.015 + signal * 0.045));
  setLayerOpacity("boundary-line", "line-opacity", isMigrationChapter ? 0 : 0.95);
  if (map.getLayer("terrain-hillshade")) {
    map.setPaintProperty("terrain-hillshade", "hillshade-exaggeration", isMigrationChapter ? 0 : 0.74);
  }

  const routeSource = map.getSource("china-migration-routes");
  const nodeSource = map.getSource("china-migration-nodes");
  if (routeSource && nodeSource) {
    routeSource.setData(isMigrationChapter ? migrationRouteFeatures(period.year) : emptyFeatureCollection());
    nodeSource.setData(isMigrationChapter ? migrationNodeFeatures(period.year) : emptyFeatureCollection());
  }
  setLayerOpacity("china-province-fill", "fill-opacity", isMigrationChapter ? 0.5 : 0);
  setLayerOpacity("china-province-outline", "line-opacity", isMigrationChapter ? 0.58 : 0);
  setLayerOpacity("china-migration-glow", "line-opacity", isMigrationChapter ? 0.36 : 0);
  setLayerOpacity("china-migration-lines", "line-opacity", isMigrationChapter ? 0.82 : 0);
  setLayerOpacity("china-migration-nodes", "circle-opacity", isMigrationChapter ? 0.9 : 0);
  setLayerOpacity("china-migration-node-strokes", "circle-opacity", isMigrationChapter ? 0.72 : 0);

  setLayerOpacity("migration-loss-cells", "fill-opacity", 0);

  if (map.getLayer("population-grid-2d")) {
    const populationValue = ["coalesce", ["get", populationProperty || "__none__"], 0];
    map.setPaintProperty("population-grid-2d", "fill-color", [
      "interpolate",
      ["linear"],
      populationValue,
      0,
      "#1c2a36",
      200,
      "#416b72",
      1000,
      "#89c9cd",
      5000,
      "#efc66f",
      15000,
      "#ef806e",
    ]);
    const gridOpacity = showPopulationGrid2d
      ? [
          "interpolate",
          ["linear"],
          populationValue,
          0,
          0.12,
          200,
          0.34,
          1000,
          0.55,
          5000,
          0.72,
          15000,
          0.86,
        ]
      : 0;
    map.setPaintProperty("population-grid-2d", "fill-opacity", gridOpacity);
  }

  if (map.getLayer("roads-line") && map.getLayer("roads-glow")) {
    const roadColor = isRoadChapter ? "#efc66f" : isSchoolChapter ? "#89c9cd" : "#f4f1ea";
    const roadWidth = isRoadChapter
      ? ["interpolate", ["linear"], ["zoom"], 7, 0.12 + signal * 0.7, 11, 0.45 + signal * 2.7]
      : isSchoolChapter
      ? ["interpolate", ["linear"], ["zoom"], 7, 0.55, 11, 2.35]
      : ["interpolate", ["linear"], ["zoom"], 7, 0.35, 11, 1.45];
    const roadGlowWidth = isRoadChapter
      ? ["interpolate", ["linear"], ["zoom"], 7, 0.5 + signal * 2.2, 11, 1.6 + signal * 6]
      : isSchoolChapter
      ? ["interpolate", ["linear"], ["zoom"], 7, 1.8, 11, 7]
      : ["interpolate", ["linear"], ["zoom"], 7, 0.8, 11, 4];
    map.setPaintProperty("roads-line", "line-color", roadColor);
    map.setPaintProperty("roads-glow", "line-color", roadColor);
    map.setPaintProperty("roads-line", "line-width", roadWidth);
    map.setPaintProperty("roads-glow", "line-width", roadGlowWidth);
  }

  if (map.getLayer("population-bars")) {
    const height = populationProperty
      ? ["*", ["coalesce", ["get", populationProperty], 0], BAR_HEIGHT_SCALE]
      : 0;
    const color = period.year === 2020 ? "#d9dfd5" : "#f4f1ea";
    map.setPaintProperty("population-bars", "fill-extrusion-height", height);
    map.setPaintProperty("population-bars", "fill-extrusion-color", color);
    map.setPaintProperty("population-bars", "fill-extrusion-opacity", showPopulationBars ? 0.82 : 0);
  }

  if (map.getLayer("population-loss-bars")) {
    const showLossVolume = showPopulationBars && period.year === 2020;
    const lossBase = showLossVolume
      ? ["*", ["coalesce", ["get", "p2020"], 0], BAR_HEIGHT_SCALE]
      : 0;
    const lossTop = showLossVolume
      ? [
          "*",
          [
            "max",
            ["coalesce", ["get", "p2010"], 0],
            ["coalesce", ["get", "p2020"], 0],
          ],
          BAR_HEIGHT_SCALE,
        ]
      : 0;
    map.setPaintProperty("population-loss-bars", "fill-extrusion-base", lossBase);
    map.setPaintProperty("population-loss-bars", "fill-extrusion-height", lossTop);
    map.setPaintProperty("population-loss-bars", "fill-extrusion-opacity", showLossVolume ? 0.58 : 0);
  }

  const showCountyChart = chapter === "all"
    && ["age", "household"].includes(state.populationLens);
  dom.shell.classList.toggle("is-county-evidence-view", showCountyChart);
  const countyChartFilter = showCountyChart
    ? ["==", ["get", "lens"], state.populationLens]
    : ["==", ["get", "lens"], "__none__"];
  if (map.getLayer("county-evidence-bars")) {
    const valueProperty = period.year === 2010 ? "v2010" : "v2020";
    const height = [
      "*",
      ["coalesce", ["get", valueProperty], 0],
      ["coalesce", ["get", "scale"], 0],
    ];
    map.setFilter("county-evidence-bars", countyChartFilter);
    map.setPaintProperty("county-evidence-bars", "fill-extrusion-height", height);
    map.setPaintProperty("county-evidence-bars", "fill-extrusion-opacity", showCountyChart ? 0.88 : 0);
  }

  if (map.getLayer("county-evidence-change")) {
    const showCountyChange = showCountyChart && period.year === 2020;
    const changeBase = showCountyChange
      ? [
          "*",
          ["min", ["get", "v2010"], ["get", "v2020"]],
          ["get", "scale"],
        ]
      : 0;
    const changeTop = showCountyChange
      ? [
          "*",
          ["max", ["get", "v2010"], ["get", "v2020"]],
          ["get", "scale"],
        ]
      : 0;
    map.setFilter("county-evidence-change", countyChartFilter);
    map.setPaintProperty("county-evidence-change", "fill-extrusion-base", changeBase);
    map.setPaintProperty("county-evidence-change", "fill-extrusion-height", changeTop);
    map.setPaintProperty("county-evidence-change", "fill-extrusion-opacity", showCountyChange ? 0.58 : 0);
  }

  document.querySelectorAll(".county-evidence-marker").forEach((marker) => {
    const markerLens = marker.dataset.lens;
    marker.classList.toggle("is-visible", showCountyChart && markerLens === state.populationLens);
  });

  const showCurrentServices = period.year === 2022 && (chapter === "all" || chapter === "school");
  const schematicSchoolSource = map.getSource("hailun-school-schematic");
  if (schematicSchoolSource) {
    schematicSchoolSource.setData(
      isSchoolChapter && !showCurrentServices
        ? SCHOOL_SCHEMATIC_BY_YEAR[period.year] || emptyFeatureCollection()
        : emptyFeatureCollection()
    );
  }
  const serviceFilter = !showCurrentServices
    ? ["==", ["get", "category"], "__none__"]
    : chapter === "all"
    ? ["in", ["get", "category"], ["literal", ["school", "rail"]]]
    : ["==", ["get", "category"], "school"];
  map.setFilter("service-halo", serviceFilter);
  map.setFilter("service-points", serviceFilter);
  document.querySelectorAll(".school-place-label").forEach((marker) => {
    marker.classList.toggle("is-visible", isSchoolChapter && period.year === 2022);
  });
  document.querySelector(".hailun-place-label")?.classList.toggle("is-hidden", isSchoolChapter || isMigrationChapter);
  if (map.getLayer("service-halo") && map.getLayer("service-points")) {
    map.setPaintProperty(
      "service-halo",
      "circle-radius",
      isSchoolChapter
        ? ["interpolate", ["linear"], ["zoom"], 7, 12, 11, 25]
        : ["interpolate", ["linear"], ["zoom"], 7, 7, 11, 15]
    );
    map.setPaintProperty(
      "service-points",
      "circle-radius",
      isSchoolChapter
        ? ["interpolate", ["linear"], ["zoom"], 7, 5.5, 11, 11]
        : ["interpolate", ["linear"], ["zoom"], 7, 3.3, 11, 7.5]
    );
  }

  if (showPopulationGrid2d) {
    dom.signalKey.textContent = `${period.year} 2D population grid / WorldPop spatial estimate normalized to official census total / report charts are countywide`;
  } else if (isPopulationReport) {
    dom.signalKey.textContent = `${period.year} census report / spatial grid unavailable for the selected year`;
  } else if (showPopulationBars) {
    dom.signalKey.textContent = period.year === 2020
      ? "WorldPop 3 km bars / pale: 480,216 remaining / coral: 289,926 gross loss / net -289,221"
      : `WorldPop 3 km bars / ${period.year} census-normalized total ${formatNumber(record.value)} / 1 person = 0.18 m`;
  } else if (chapter === "all" && state.populationLens === "age") {
    dom.signalKey.textContent = period.year === 2020
      ? "3D county chart / bar = census share / sleeve = change since 2010"
      : "3D county chart / three age shares / 2010 census baseline";
  } else if (chapter === "all" && state.populationLens === "household") {
    dom.signalKey.textContent = period.year === 2020
      ? "3D county column / cyan: 2.26 / coral sleeve: 0.99-person contraction"
      : "3D county column / 3.25 people per family household / 2010 baseline";
  } else if (isSchoolChapter) {
    dom.signalKey.textContent = period.year === 2022
      ? "2022: 2 current school sites with public coordinates / county totals remain in the evidence panel"
      : `${period.year}: ${formatRecordValue(record)} documented schools / ${formatNumber(SCHOOL_SCHEMATIC_COUNTS[period.year])} schematic settlement-based points`;
  } else if (signal == null) {
    dom.signalKey.textContent = record
      ? "Snapshot only / no historical change claim"
      : "Evidence gap / map held neutral";
  } else if (isMigrationChapter) {
    const displayedRoutes = CHINA_RURAL_URBAN_FLOWS[period.year] || [];
    const displayedPeople = displayedRoutes.reduce((sum, flow) => sum + flow.people, 0);
    dom.signalKey.textContent = `${displayedRoutes.length} real OD routes ≥500,000 / ${formatNumber(displayedPeople)} residents shown / moving arrow ≈500,000`;
  } else if (isRoadChapter) {
    dom.signalKey.textContent = `${period.year} road observation / ${formatNumber(record.displayValue)} mapped km / ${formatNumber(record.featureCount)} OSM road ways`;
  } else {
    dom.signalKey.textContent = `${series.measure} index ${Math.round(signal * 100)} / aggregate county signal`;
  }
}

function moveCamera(camera) {
  if (!state.mapLoaded) {
    state.pendingCamera = camera;
    return;
  }
  map.flyTo({
    ...camera,
    duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 2600,
    essential: true,
  });
}

function setOrbitMode(enabled) {
  state.orbitMode = enabled;
  dom.orbitToggle.classList.toggle("is-active", enabled);
  dom.orbitToggle.setAttribute("aria-pressed", String(enabled));
  dom.orbitToggle.setAttribute("aria-label", enabled ? "Disable orbit drag" : "Enable orbit drag");
  dom.interactionHint.textContent = enabled
    ? "Orbit mode / drag to rotate and tilt"
    : "Pan mode / drag to move across terrain";
  dom.shell.classList.toggle("is-orbit-mode", enabled);

  if (!state.mapLoaded) return;
  if (enabled) {
    map.dragPan.disable();
    map.dragRotate.disable();
  } else {
    map.dragPan.enable();
    map.dragRotate.enable();
  }
}

function scrubTimelineFromPointer(event) {
  const drag = state.timelineDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const distance = event.clientX - drag.startX;
  if (Math.abs(distance) > 2) drag.moved = true;
  const value = Math.max(0, Math.min(drag.maximum, drag.startValue + (distance / drag.width) * drag.maximum));
  setSliderPosition(value);
  const nextIndex = Math.round(value);
  if (nextIndex !== state.periodIndex) {
    hideFeaturePopup();
    state.periodIndex = nextIndex;
    renderReadout();
    updateMapLayers();
    setSliderPosition(value);
  }
  dom.timelineState.textContent = "DRAGGING";
}

function finishTimelineDrag(event) {
  const drag = state.timelineDrag;
  if (!drag || drag.pointerId !== event.pointerId) return;
  const snappedIndex = Math.round(Number(dom.yearSlider.value));
  state.timelineDrag = null;
  dom.yearSlider.classList.remove("is-dragging");
  if (dom.yearSlider.hasPointerCapture(event.pointerId)) {
    dom.yearSlider.releasePointerCapture(event.pointerId);
  }
  setPeriod(snappedIndex);
}

function setIntroStage(index) {
  clearTimeout(state.introTimer);
  state.introStage = Math.max(0, Math.min(index, 4));
  document.querySelectorAll(".intro-stage").forEach((stage) => {
    stage.classList.toggle("is-active", Number(stage.dataset.stage) === state.introStage);
  });
  dom.introProgress.style.width = `${(state.introStage + 1) * 20}%`;
  dom.intro.classList.toggle("is-map-stage", state.introStage > 0);

  if (state.introStage > 0) {
    dom.shell.classList.add("is-map-visible");
  }

  const introCameras = [
    null,
    { center: [126.9869, 47.4165], zoom: 8.2, pitch: 66, bearing: -18 },
    { center: [126.68, 47.62], zoom: 9.1, pitch: 72, bearing: 22 },
    { center: [127.12, 47.22], zoom: 8.9, pitch: 73, bearing: -35 },
    { center: [126.9869, 47.4165], zoom: 8.35, pitch: 67, bearing: -24 },
  ];
  if (introCameras[state.introStage]) moveCamera(introCameras[state.introStage]);

  if (state.introStage > 0 && state.introStage < 4) {
    state.introTimer = window.setTimeout(() => setIntroStage(state.introStage + 1), 2700);
  }
}

function finishIntro() {
  clearTimeout(state.introTimer);
  dom.shell.classList.add("is-map-visible");
  dom.intro.classList.add("is-complete");
  document.querySelectorAll(".intro-stage").forEach((stage) => stage.classList.remove("is-active"));
  dom.mapInterface.classList.add("is-active");
  dom.mapInterface.setAttribute("aria-hidden", "false");
  renderChapter();
}

function openDrawer() {
  dom.methodDrawer.classList.add("is-open");
  dom.methodDrawer.setAttribute("aria-hidden", "false");
  document.querySelector("#close-method").focus();
}

function closeDrawer() {
  dom.methodDrawer.classList.remove("is-open");
  dom.methodDrawer.setAttribute("aria-hidden", "true");
  document.querySelector("#open-method").focus();
}

function stopTimeline() {
  if (state.lensAutoPlayTimer) {
    window.clearTimeout(state.lensAutoPlayTimer);
    state.lensAutoPlayTimer = null;
  }
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  dom.playTimeline.classList.remove("is-playing");
  dom.playTimeline.setAttribute("aria-label", "Play observed change");
}

function scheduleLensAutoPlay(lens) {
  if (!lens.autoPlayToLatest) return;
  dom.timelineState.textContent = "AUTO / 2010 → 2020";
  state.lensAutoPlayTimer = window.setTimeout(() => {
    state.lensAutoPlayTimer = null;
    if (
      state.chapter === "all"
      && state.populationView === "terrain"
      && ["age", "household"].includes(state.populationLens)
      && activePeriod().year === 2010
    ) {
      playTimeline();
    }
  }, 2300);
}

function scheduleChapterAutoPlay(chapter) {
  if (!chapter.autoPlayToLatest) return;
  const periods = periodsForChapter();
  const firstYear = periods[0]?.year;
  const lastYear = periods[periods.length - 1]?.year;
  dom.timelineState.textContent = `AUTO / ${firstYear} → ${lastYear}`;
  state.lensAutoPlayTimer = window.setTimeout(() => {
    state.lensAutoPlayTimer = null;
    if (
      ["school", "migration"].includes(state.chapter)
      && activePeriod().year === firstYear
    ) {
      playTimeline();
    }
  }, 2300);
}

function playTimeline() {
  if (state.playTimer) {
    stopTimeline();
    return;
  }
  const periods = periodsForChapter();
  if (state.periodIndex >= periods.length - 1) {
    setPeriod(0, true);
  }
  dom.playTimeline.classList.add("is-playing");
  dom.playTimeline.setAttribute("aria-label", "Pause observed change");
  state.playTimer = window.setInterval(() => {
    if (state.periodIndex >= periods.length - 1) {
      stopTimeline();
      return;
    }
    setPeriod(state.periodIndex + 1, true);
  }, 1200);
}

function renderMigrationParticles(year) {
  if (dom.migrationParticles.dataset.year === String(year)) return;
  const particles = (CHINA_RURAL_URBAN_FLOWS[year] || []).flatMap((flow, routeIndex) => {
    const arrowCount = Math.max(1, Math.round(flow.people / MIGRATION_ARROW_VALUE));
    return Array.from({ length: arrowCount }, (_, arrowIndex) => {
      const particle = document.createElement("span");
      const origin = PROVINCE_ANCHORS[flow.origin];
      const destination = PROVINCE_ANCHORS[flow.destination];
      const cyclePosition = ((arrowIndex / arrowCount) + routeIndex * 0.173) % 1;
      const duration = 7.2 + ((routeIndex * 17) % 25) / 10;
      particle.dataset.originLongitude = String(origin[0]);
      particle.dataset.originLatitude = String(origin[1]);
      particle.dataset.destinationLongitude = String(destination[0]);
      particle.dataset.destinationLatitude = String(destination[1]);
      particle.dataset.route = `${flow.origin}-${flow.destination}`;
      particle.style.setProperty("--duration", `${duration.toFixed(1)}s`);
      particle.style.setProperty("--delay", `${-(cyclePosition * duration).toFixed(3)}s`);
      particle.setAttribute("aria-hidden", "true");
      return particle;
    });
  });
  dom.migrationParticles.dataset.year = String(year);
  dom.migrationParticles.replaceChildren(...particles);
}

function updateMigrationDestinationLabels(year) {
  const incoming = new Map();
  (CHINA_RURAL_URBAN_FLOWS[year] || []).forEach((flow) => {
    incoming.set(flow.destination, (incoming.get(flow.destination) || 0) + flow.people);
  });
  const topDestinations = new Map([...incoming]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6));
  document.querySelectorAll(".china-flow-label").forEach((label) => {
    const people = topDestinations.get(label.dataset.province);
    const isVisible = state.chapter === "migration" && people != null;
    label.classList.toggle("is-visible", isVisible);
    if (isVisible) label.querySelector("small").textContent = `${(people / 1000000).toFixed(2)}M received · shown routes`;
  });
}

function updateMigrationParticlePositions() {
  if (!state.mapLoaded || !dom.migrationParticles.children.length) return;
  const canvas = map.getCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  [...dom.migrationParticles.children].forEach((particle) => {
    const origin = map.project([
      Number(particle.dataset.originLongitude),
      Number(particle.dataset.originLatitude),
    ]);
    const destination = map.project([
      Number(particle.dataset.destinationLongitude),
      Number(particle.dataset.destinationLatitude),
    ]);
    const isVisible = Math.max(origin.x, destination.x) > -120
      && Math.min(origin.x, destination.x) < width + 120
      && Math.max(origin.y, destination.y) > -120
      && Math.min(origin.y, destination.y) < height + 120;
    particle.style.display = isVisible ? "block" : "none";
    if (!isVisible) return;

    const travelX = destination.x - origin.x;
    const travelY = destination.y - origin.y;
    const angle = Math.atan2(travelY, travelX);
    particle.style.setProperty("--origin-x", `${origin.x.toFixed(2)}px`);
    particle.style.setProperty("--origin-y", `${origin.y.toFixed(2)}px`);
    particle.style.setProperty("--travel-x", `${travelX.toFixed(2)}px`);
    particle.style.setProperty("--travel-y", `${travelY.toFixed(2)}px`);
    particle.style.setProperty("--angle", `${angle.toFixed(5)}rad`);
  });
}

let migrationPositionFrame = null;
function requestMigrationParticlePositionUpdate() {
  if (migrationPositionFrame != null) return;
  migrationPositionFrame = window.requestAnimationFrame(() => {
    migrationPositionFrame = null;
    if (state.chapter === "migration") updateMigrationParticlePositions();
  });
}

function setupInterface() {
  document.querySelector("#start-intro").addEventListener("click", () => setIntroStage(1));
  document.querySelector("#enter-map").addEventListener("click", finishIntro);
  document.querySelector("#skip-intro").addEventListener("click", finishIntro);
  document.querySelector("#home-view").addEventListener("click", () => {
    state.chapter = "all";
    state.populationLens = "total";
    state.populationView = "terrain";
    state.periodIndex = periodIndexForYear("all", CHAPTERS.all.preferredYear);
    renderChapter();
  });
  document.querySelector("#open-method").addEventListener("click", openDrawer);
  document.querySelector("#close-method").addEventListener("click", closeDrawer);
  dom.playTimeline.addEventListener("click", playTimeline);
  dom.orbitToggle.addEventListener("click", () => setOrbitMode(!state.orbitMode));

  document.querySelectorAll(".chapter-link").forEach((button) => {
    button.addEventListener("click", () => {
      stopTimeline();
      state.chapter = button.dataset.layer;
      if (state.chapter === "all") {
        state.populationLens = "total";
        state.populationView = "terrain";
      } else {
        state.populationView = "terrain";
      }
      state.periodIndex = periodIndexForYear(
        state.chapter,
        CHAPTERS[state.chapter].preferredYear
      );
      renderChapter();
      scheduleChapterAutoPlay(CHAPTERS[state.chapter]);
    });
  });

  document.querySelectorAll("[data-population-view]").forEach((button) => {
    button.addEventListener("click", () => {
      stopTimeline();
      state.populationView = button.dataset.populationView;
      if (state.populationView === "report") {
        state.populationLens = "total";
        state.periodIndex = periodIndexForYear("all", POPULATION_REPORT_VIEW.preferredYear);
      } else {
        state.periodIndex = periodIndexForYear("all", POPULATION_LENSES[state.populationLens].preferredYear);
      }
      renderChapter();
    });
  });

  document.querySelectorAll("[data-report-year]").forEach((button) => {
    button.addEventListener("click", () => {
      stopTimeline();
      const year = Number(button.dataset.reportYear);
      setPeriod(periodIndexForYear("all", year));
    });
  });

  document.querySelectorAll("[data-population-lens]").forEach((button) => {
    button.addEventListener("click", () => {
      stopTimeline();
      state.populationView = "terrain";
      state.populationLens = button.dataset.populationLens;
      const lens = POPULATION_LENSES[state.populationLens];
      state.periodIndex = periodIndexForYear("all", lens.preferredYear);
      renderChapter();
      scheduleLensAutoPlay(lens);
    });
  });

  dom.yearSlider.addEventListener("pointerdown", (event) => {
    if (dom.yearSlider.disabled || event.button !== 0) return;
    event.preventDefault();
    stopTimeline();
    const bounds = dom.yearSlider.getBoundingClientRect();
    state.timelineDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startValue: Number(dom.yearSlider.value),
      maximum: Number(dom.yearSlider.max),
      width: Math.max(1, bounds.width),
      moved: false,
    };
    dom.yearSlider.setPointerCapture(event.pointerId);
    dom.yearSlider.classList.add("is-dragging");
    dom.timelineState.textContent = "DRAGGING";
  });

  dom.yearSlider.addEventListener("pointermove", scrubTimelineFromPointer);
  dom.yearSlider.addEventListener("pointerup", finishTimelineDrag);
  dom.yearSlider.addEventListener("pointercancel", finishTimelineDrag);
  dom.yearSlider.addEventListener("click", (event) => {
    event.preventDefault();
    setSliderPosition(state.periodIndex);
  });
  dom.yearSlider.addEventListener("keydown", (event) => {
    const maximum = Number(dom.yearSlider.max);
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
      ? maximum
      : event.key === "ArrowLeft"
      ? state.periodIndex - 1
      : state.periodIndex + 1;
    setPeriod(nextIndex);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.methodDrawer.classList.contains("is-open")) {
      closeDrawer();
    }
  });
}

function baseStyle() {
  return {
    version: 8,
    sources: {
      satellite: {
        type: "raster",
        tiles: [
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        ],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 18,
        attribution: "Esri World Imagery",
      },
      terrainSource: {
        type: "raster-dem",
        url: "https://tiles.mapterhorn.com/tilejson.json",
        tileSize: 512,
      },
      hillshadeSource: {
        type: "raster-dem",
        url: "https://tiles.mapterhorn.com/tilejson.json",
        tileSize: 512,
      },
    },
    layers: [
      {
        id: "satellite",
        type: "raster",
        source: "satellite",
        paint: {
          "raster-saturation": -0.66,
          "raster-contrast": 0.34,
          "raster-brightness-min": 0.08,
          "raster-brightness-max": 0.68,
          "raster-fade-duration": 600,
        },
      },
      {
        id: "terrain-hillshade",
        type: "hillshade",
        source: "hillshadeSource",
        paint: {
          "hillshade-exaggeration": 0.74,
          "hillshade-shadow-color": "#071018",
          "hillshade-highlight-color": "#dcc7a1",
          "hillshade-accent-color": "#567783",
          "hillshade-illumination-anchor": "viewport",
        },
      },
    ],
    terrain: {
      source: "terrainSource",
      exaggeration: 2.2,
    },
  };
}

const map = new maplibregl.Map({
  container: "terrain-map",
  style: baseStyle(),
  center: CHAPTERS.all.camera.center,
  zoom: CHAPTERS.all.camera.zoom,
  pitch: CHAPTERS.all.camera.pitch,
  bearing: CHAPTERS.all.camera.bearing,
  minZoom: 2.35,
  maxZoom: 14.5,
  maxPitch: 83,
  attributionControl: false,
  antialias: true,
});

function setupOrbitInteraction() {
  const canvas = map.getCanvas();

  canvas.addEventListener("pointerdown", (event) => {
    if (
      !state.mapLoaded
      || !state.orbitMode
      || state.populationView === "report"
      || ["school", "migration"].includes(state.chapter)
      || event.button !== 0
      || event.pointerType === "touch"
    ) {
      return;
    }
    state.orbitGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      bearing: map.getBearing(),
      pitch: map.getPitch(),
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    dom.shell.classList.add("is-orbit-dragging");
  });

  canvas.addEventListener("pointermove", (event) => {
    const gesture = state.orbitGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.hypot(deltaX, deltaY) > 3) gesture.moved = true;
    map.jumpTo({
      bearing: gesture.bearing + deltaX * 0.34,
      pitch: Math.max(20, Math.min(82, gesture.pitch - deltaY * 0.24)),
    });
  });

  const endOrbitGesture = (event) => {
    const gesture = state.orbitGesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    state.orbitGesture = null;
    dom.shell.classList.remove("is-orbit-dragging");
    if (gesture.moved) {
      state.suppressMapClick = true;
      window.setTimeout(() => {
        state.suppressMapClick = false;
      }, 120);
    }
  };

  canvas.addEventListener("pointerup", endOrbitGesture);
  canvas.addEventListener("pointercancel", endOrbitGesture);
}

const hailunLabel = document.createElement("div");
hailunLabel.className = "hailun-place-label";
const hailunLabelDot = document.createElement("span");
hailunLabelDot.setAttribute("aria-hidden", "true");
const hailunLabelText = document.createElement("div");
const hailunLabelEnglish = document.createElement("strong");
hailunLabelEnglish.textContent = "HAILUN";
hailunLabelText.append(hailunLabelEnglish);
hailunLabel.append(hailunLabelDot, hailunLabelText);
new maplibregl.Marker({
  element: hailunLabel,
  anchor: "bottom-left",
  offset: [8, -7],
})
  .setLngLat([126.9572246, 47.4583585])
  .addTo(map);

Object.entries(PROVINCE_ANCHORS).forEach(([province, coordinates]) => {
  const marker = document.createElement("div");
  marker.className = "china-flow-label";
  marker.dataset.province = province;
  const dot = document.createElement("i");
  dot.setAttribute("aria-hidden", "true");
  const text = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = PROVINCE_LABELS[province];
  const value = document.createElement("small");
  text.append(name, value);
  marker.append(dot, text);
  new maplibregl.Marker({
    element: marker,
    anchor: "bottom-left",
    offset: [6, -5],
  })
    .setLngLat(coordinates)
    .addTo(map);
});

HAILUN.services.features
  .filter((feature) => feature.properties.category === "school")
  .forEach((feature) => {
    const marker = document.createElement("div");
    marker.className = "school-place-label";
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    const text = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = SCHOOL_LABELS_EN[feature.properties.name]
      || feature.properties.nameEn
      || feature.properties.name;
    const source = document.createElement("small");
    source.textContent = "OPEN MAP COORDINATE";
    text.append(name, source);
    marker.append(dot, text);
    new maplibregl.Marker({
      element: marker,
      anchor: "bottom-left",
      offset: [10, -7],
    })
      .setLngLat(feature.geometry.coordinates)
      .addTo(map);
  });

[
  { lens: "age", label: "0-14", coordinates: [126.87, 47.45] },
  { lens: "age", label: "15-59", coordinates: [126.94, 47.45] },
  { lens: "age", label: "60+", coordinates: [127.01, 47.45] },
  { lens: "household", label: "HH SIZE", scope: "COUNTYWIDE", coordinates: [126.94, 47.45] },
].forEach((item) => {
  const marker = document.createElement("div");
  marker.className = "county-evidence-marker";
  marker.dataset.lens = item.lens;
  const label = document.createElement("strong");
  label.textContent = item.label;
  marker.append(label);
  if (item.scope) {
    const scope = document.createElement("small");
    scope.textContent = item.scope;
    marker.append(scope);
  }
  new maplibregl.Marker({
    element: marker,
    anchor: "top",
    offset: [0, 14],
  })
    .setLngLat(item.coordinates)
    .addTo(map);
});

function addMapLayers() {
  map.addSource("china-provinces", { type: "geojson", data: "data/china-provinces.geojson" });
  map.addSource("china-migration-routes", {
    type: "geojson",
    data: emptyFeatureCollection(),
    lineMetrics: true,
  });
  map.addSource("china-migration-nodes", { type: "geojson", data: emptyFeatureCollection() });
  map.addSource("hailun-boundary", { type: "geojson", data: HAILUN.boundary });
  map.addSource("hailun-settlements", { type: "geojson", data: HAILUN.settlements });
  map.addSource("hailun-school-schematic", { type: "geojson", data: emptyFeatureCollection() });
  map.addSource("hailun-services", { type: "geojson", data: HAILUN.services });
  map.addSource("hailun-transport", { type: "geojson", data: HAILUN.transport });
  map.addSource("county-evidence-bars", { type: "geojson", data: COUNTY_EVIDENCE_BARS });
  if (POPULATION_BARS) {
    map.addSource("hailun-population", { type: "geojson", data: POPULATION_BARS });
  }

  map.addLayer({
    id: "china-province-fill",
    type: "fill",
    source: "china-provinces",
    paint: {
      "fill-color": "#101b24",
      "fill-opacity": 0,
    },
  });

  map.addLayer({
    id: "china-province-outline",
    type: "line",
    source: "china-provinces",
    paint: {
      "line-color": "rgba(244, 241, 234, 0.72)",
      "line-width": ["interpolate", ["linear"], ["zoom"], 2.5, 0.35, 5, 1.15],
      "line-opacity": 0,
    },
  });

  map.addLayer({
    id: "china-migration-glow",
    type: "line",
    source: "china-migration-routes",
    paint: {
      "line-color": "#89c9cd",
      "line-width": [
        "interpolate", ["linear"], ["get", "people"],
        MIGRATION_ROUTE_THRESHOLD, 2.5,
        5500000, 9,
      ],
      "line-blur": 4,
      "line-opacity": 0,
    },
  });

  map.addLayer({
    id: "china-migration-lines",
    type: "line",
    source: "china-migration-routes",
    paint: {
      "line-gradient": [
        "interpolate", ["linear"], ["line-progress"],
        0, "rgba(137, 201, 205, 0.24)",
        0.72, "#89c9cd",
        1, "#f3aa92",
      ],
      "line-width": [
        "interpolate", ["linear"], ["get", "people"],
        MIGRATION_ROUTE_THRESHOLD, 0.7,
        1000000, 1.2,
        5500000, 4.4,
      ],
      "line-opacity": 0,
    },
  });

  map.addLayer({
    id: "china-migration-node-strokes",
    type: "circle",
    source: "china-migration-nodes",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["max", ["get", "incoming"], ["get", "outgoing"]], 0, 3.5, 15000000, 15],
      "circle-color": "rgba(17, 26, 34, 0.72)",
      "circle-stroke-color": "rgba(244, 241, 234, 0.34)",
      "circle-stroke-width": 1,
      "circle-opacity": 0,
    },
  });

  map.addLayer({
    id: "china-migration-nodes",
    type: "circle",
    source: "china-migration-nodes",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["max", ["get", "incoming"], ["get", "outgoing"]], 0, 1.8, 15000000, 8.5],
      "circle-color": ["case", [">=", ["get", "incoming"], ["get", "outgoing"]], "#f3aa92", "#89c9cd"],
      "circle-opacity": 0,
    },
  });

  map.addLayer({
    id: "boundary-fill",
    type: "fill",
    source: "hailun-boundary",
    paint: {
      "fill-color": "#f3aa92",
      "fill-opacity": 0.035,
    },
  });

  if (POPULATION_BARS) {
    map.addLayer({
      id: "migration-loss-cells",
      type: "fill",
      source: "hailun-population",
      filter: ["<", ["get", "change_10_20"], 0],
      paint: {
        "fill-color": [
          "interpolate",
          ["linear"],
          ["max", 0, ["*", -1, ["coalesce", ["get", "change_10_20"], 0]]],
          0,
          "#89c9cd",
          1000,
          "#f3aa92",
          10000,
          "#ef806e",
        ],
        "fill-opacity": 0,
        "fill-outline-color": "rgba(244, 241, 234, 0.16)",
      },
    });

    map.addLayer({
      id: "population-grid-2d",
      type: "fill",
      source: "hailun-population",
      paint: {
        "fill-color": "#89c9cd",
        "fill-opacity": 0,
        "fill-outline-color": "rgba(244, 241, 234, 0.2)",
        "fill-opacity-transition": {
          duration: 500,
          delay: 0,
        },
      },
    });

    map.addLayer({
      id: "population-bars",
      type: "fill-extrusion",
      source: "hailun-population",
      paint: {
        "fill-extrusion-color": [
          "interpolate",
          ["linear"],
          ["coalesce", ["get", "change_pct"], 0],
          -80,
          "#f3aa92",
          0,
          "#f4f1ea",
          40,
          "#89c9cd",
        ],
        "fill-extrusion-height": [
          "*",
          ["coalesce", ["get", "p2020"], 0],
          BAR_HEIGHT_SCALE,
        ],
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.82,
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-height-transition": {
          duration: 900,
          delay: 0,
        },
        "fill-extrusion-opacity-transition": {
          duration: 450,
          delay: 0,
        },
      },
    });

    map.addLayer({
      id: "population-loss-bars",
      type: "fill-extrusion",
      source: "hailun-population",
      paint: {
        "fill-extrusion-color": "#ef806e",
        "fill-extrusion-height": 0,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0,
        "fill-extrusion-vertical-gradient": true,
        "fill-extrusion-height-transition": {
          duration: 900,
          delay: 0,
        },
        "fill-extrusion-base-transition": {
          duration: 900,
          delay: 0,
        },
        "fill-extrusion-opacity-transition": {
          duration: 450,
          delay: 0,
        },
      },
    });
  }

  map.addLayer({
    id: "county-evidence-bars",
    type: "fill-extrusion",
    source: "county-evidence-bars",
    filter: ["==", ["get", "lens"], "__none__"],
    paint: {
      "fill-extrusion-color": ["get", "color"],
      "fill-extrusion-height": 0,
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-height-transition": {
        duration: 1800,
        delay: 0,
      },
      "fill-extrusion-opacity-transition": {
        duration: 350,
        delay: 0,
      },
    },
  });

  map.addLayer({
    id: "county-evidence-change",
    type: "fill-extrusion",
    source: "county-evidence-bars",
    filter: ["==", ["get", "lens"], "__none__"],
    paint: {
      "fill-extrusion-color": ["get", "change_color"],
      "fill-extrusion-height": 0,
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0,
      "fill-extrusion-vertical-gradient": true,
      "fill-extrusion-height-transition": {
        duration: 1800,
        delay: 0,
      },
      "fill-extrusion-base-transition": {
        duration: 1800,
        delay: 0,
      },
      "fill-extrusion-opacity-transition": {
        duration: 350,
        delay: 0,
      },
    },
  });

  map.addLayer({
    id: "roads-glow",
    type: "line",
    source: "hailun-transport",
    filter: ["==", ["get", "category"], "road"],
    paint: {
      "line-color": "#f4f1ea",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.8, 11, 4],
      "line-blur": 3,
      "line-opacity": 0.34,
    },
  });

  map.addLayer({
    id: "roads-line",
    type: "line",
    source: "hailun-transport",
    filter: ["==", ["get", "category"], "road"],
    paint: {
      "line-color": "#f4f1ea",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.35, 11, 1.45],
      "line-opacity": 0.74,
    },
  });

  map.addLayer({
    id: "rail-glow",
    type: "line",
    source: "hailun-transport",
    filter: ["==", ["get", "category"], "railway"],
    paint: {
      "line-color": "#89c9cd",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 3, 11, 7],
      "line-blur": 5,
      "line-opacity": 0.72,
    },
  });

  map.addLayer({
    id: "rail-line",
    type: "line",
    source: "hailun-transport",
    filter: ["==", ["get", "category"], "railway"],
    paint: {
      "line-color": "#89c9cd",
      "line-width": ["interpolate", ["linear"], ["zoom"], 7, 1.2, 11, 2.8],
      "line-opacity": 0.95,
      "line-dasharray": [1, 1.1],
    },
  });

  map.addLayer({
    id: "settlement-halo",
    type: "circle",
    source: "hailun-settlements",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.4, 11, 9],
      "circle-color": "#f3aa92",
      "circle-blur": 0.65,
      "circle-opacity": 0.2,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "settlement-points",
    type: "circle",
    source: "hailun-settlements",
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        7,
        ["match", ["get", "place"], "city", 2.8, "town", 2.1, 1.05],
        11,
        ["match", ["get", "place"], "city", 7, "town", 5, 2.2],
      ],
      "circle-color": [
        "match",
        ["get", "place"],
        "city",
        "#f4f1ea",
        "town",
        "#f3aa92",
        "#efc66f",
      ],
      "circle-stroke-color": "#111a22",
      "circle-stroke-width": 0.8,
      "circle-opacity": 0.82,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "school-history-halo",
    type: "circle",
    source: "hailun-school-schematic",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 4.2, 11, 9],
      "circle-color": "#f3aa92",
      "circle-blur": 0.82,
      "circle-opacity": 0.32,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "school-history-points",
    type: "circle",
    source: "hailun-school-schematic",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 2.1, 11, 4.8],
      "circle-color": "#f3aa92",
      "circle-stroke-color": "#f4f1ea",
      "circle-stroke-width": 0.65,
      "circle-opacity": 0.92,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "service-halo",
    type: "circle",
    source: "hailun-services",
    filter: ["in", ["get", "category"], ["literal", ["school", "rail"]]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 7, 11, 15],
      "circle-color": [
        "match",
        ["get", "category"],
        "school",
        "#f3aa92",
        "rail",
        "#89c9cd",
        "#f4f1ea",
      ],
      "circle-blur": 0.8,
      "circle-opacity": 0.45,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "service-points",
    type: "circle",
    source: "hailun-services",
    filter: ["in", ["get", "category"], ["literal", ["school", "rail"]]],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 7, 3.3, 11, 7.5],
      "circle-color": [
        "match",
        ["get", "category"],
        "school",
        "#f3aa92",
        "rail",
        "#89c9cd",
        "#f4f1ea",
      ],
      "circle-stroke-color": "#f4f1ea",
      "circle-stroke-width": 1.2,
      "circle-opacity": 1,
      "circle-pitch-alignment": "map",
    },
  });

  map.addLayer({
    id: "boundary-line",
    type: "line",
    source: "hailun-boundary",
    paint: {
      "line-color": "#f3aa92",
      "line-width": 1.35,
      "line-opacity": 0.95,
      "line-dasharray": [3, 1.5],
    },
  });
}

function showFeaturePopup(event, feature) {
  if (
    feature.layer
    && ["county-evidence-bars", "county-evidence-change"].includes(feature.layer.id)
  ) {
    const year = activePeriod().year;
    const value = Number(feature.properties[`v${year}`]);
    const suffix = feature.properties.lens === "age" ? "%" : " people";
    dom.popupKind.textContent = `Countywide 3D chart / ${year}`;
    dom.popupName.textContent = `${feature.properties.label}: ${formatNumber(value)}${suffix}`;
    dom.popup.style.left = `${Math.min(window.innerWidth - 235, event.point.x + 14)}px`;
    dom.popup.style.top = `${Math.min(window.innerHeight - 90, event.point.y + 14)}px`;
    dom.popup.classList.add("is-visible");
    dom.popup.setAttribute("aria-hidden", "false");
    return;
  }

  if (feature.layer && ["population-bars", "population-loss-bars", "population-grid-2d"].includes(feature.layer.id)) {
    const year = activePeriod().year;
    const property = `p${year}`;
    const population = Number(feature.properties[property] || 0);
    const change = Number(feature.properties.change_10_20 || 0);
    dom.popupKind.textContent = `WorldPop 3 km cell / ${year}`;
    const comparison = year === 2020
      ? ` · ${change > 0 ? "+" : ""}${formatNumber(Math.round(change))} since 2010`
      : year === 2010
      ? " · 2010 census baseline"
      : " · 2000 WorldPop surface";
    dom.popupName.textContent = feature.layer.id === "population-loss-bars"
      ? `${formatNumber(Math.round(Math.max(0, -change)))} residents lost · ${formatNumber(Math.round(feature.properties.p2010))} to ${formatNumber(Math.round(feature.properties.p2020))}`
      : `${formatNumber(Math.round(population))} estimated residents${comparison}`;
    dom.popup.style.left = `${Math.min(window.innerWidth - 235, event.point.x + 14)}px`;
    dom.popup.style.top = `${Math.min(window.innerHeight - 90, event.point.y + 14)}px`;
    dom.popup.classList.add("is-visible");
    dom.popup.setAttribute("aria-hidden", "false");
    return;
  }

  const category = feature.properties.category;
  const labels = {
    settlement: "Mapped settlement",
    school: "Mapped school point",
    rail: "Mapped railway station",
  };
  dom.popupKind.textContent = labels[category] || "Mapped feature";
  dom.popupName.textContent = SCHOOL_LABELS_EN[feature.properties.name]
    || feature.properties.nameEn
    || feature.properties.name;
  dom.popup.style.left = `${Math.min(window.innerWidth - 235, event.point.x + 14)}px`;
  dom.popup.style.top = `${Math.min(window.innerHeight - 90, event.point.y + 14)}px`;
  dom.popup.classList.add("is-visible");
  dom.popup.setAttribute("aria-hidden", "false");
}

map.on("load", () => {
  addMapLayers();
  state.mapLoaded = true;
  setOrbitMode(state.orbitMode);
  dom.loadingNumber.textContent = "100";
  window.setTimeout(() => dom.loading.classList.add("is-complete"), 300);
  updateMapLayers();
  updateMigrationParticlePositions();
  if (state.pendingCamera) {
    const camera = state.pendingCamera;
    state.pendingCamera = null;
    moveCamera(camera);
  }
});

map.on("move", requestMigrationParticlePositionUpdate);

map.on("click", (event) => {
  if (!state.mapLoaded) return;
  if (state.suppressMapClick) return;
  const interactiveLayers = ["service-points", "settlement-points"];
  if (
    map.getLayer("population-bars")
    && state.chapter === "all"
    && (state.populationView === "report" || state.populationLens === "total")
    && [2000, 2010, 2020].includes(activePeriod().year)
  ) {
    interactiveLayers.unshift(state.populationView === "report" ? "population-grid-2d" : "population-bars");
    if (state.populationView !== "report" && map.getLayer("population-loss-bars") && activePeriod().year === 2020) {
      interactiveLayers.unshift("population-loss-bars");
    }
  }
  if (
    map.getLayer("county-evidence-bars")
    && state.chapter === "all"
    && ["age", "household"].includes(state.populationLens)
  ) {
    interactiveLayers.unshift("county-evidence-bars");
    if (map.getLayer("county-evidence-change") && activePeriod().year === 2020) {
      interactiveLayers.unshift("county-evidence-change");
    }
  }
  const features = map.queryRenderedFeatures(event.point, {
    layers: interactiveLayers,
  });
  if (features.length) {
    showFeaturePopup(event, features[0]);
  } else {
    hideFeaturePopup();
  }
});

map.on("mousemove", (event) => {
  if (!state.mapLoaded) return;
  const interactiveLayers = ["service-points", "settlement-points"];
  if (
    map.getLayer("population-bars")
    && state.chapter === "all"
    && (state.populationView === "report" || state.populationLens === "total")
    && [2000, 2010, 2020].includes(activePeriod().year)
  ) {
    interactiveLayers.unshift(state.populationView === "report" ? "population-grid-2d" : "population-bars");
    if (state.populationView !== "report" && map.getLayer("population-loss-bars") && activePeriod().year === 2020) {
      interactiveLayers.unshift("population-loss-bars");
    }
  }
  if (
    map.getLayer("county-evidence-bars")
    && state.chapter === "all"
    && ["age", "household"].includes(state.populationLens)
  ) {
    interactiveLayers.unshift("county-evidence-bars");
    if (map.getLayer("county-evidence-change") && activePeriod().year === 2020) {
      interactiveLayers.unshift("county-evidence-change");
    }
  }
  const features = map.queryRenderedFeatures(event.point, {
    layers: interactiveLayers,
  });
  map.getCanvas().style.cursor = features.length ? "pointer" : "";
});

window.addEventListener("resize", () => {
  if (state.mapLoaded) {
    map.resize();
    requestMigrationParticlePositionUpdate();
  }
});

let loadingValue = 0;
const loadingTicker = window.setInterval(() => {
  if (state.mapLoaded) {
    window.clearInterval(loadingTicker);
    return;
  }
  loadingValue = Math.min(94, loadingValue + Math.ceil((95 - loadingValue) * 0.08));
  dom.loadingNumber.textContent = String(loadingValue).padStart(2, "0");
}, 90);

window.setTimeout(() => {
  if (!state.mapLoaded) {
    dom.loading.classList.add("is-complete");
  }
}, 9000);

setupOrbitInteraction();
setupInterface();
configureTimeline();
renderReadout();
