/**
 * Advanced Multi-Hazard Smart NLP Classifier Engine v2.0
 * Specially designed for KALASAG MDRRMO (Gumaca, Quezon)
 */

export interface ClassificationOutput {
  category: string;
  secondary_category: string | null;
  compound_hazard: boolean;
  compound_hazards: string[];
  priority_level: "High" | "Medium" | "Low";
  confidence_score: number;
  recommended_units: string[];
  reasoning: string;
  extracted_entities: {
    locations: string[];
    vulnerableGroups: string[];
    hasCasualties: boolean;
    isTrapped: boolean;
  };
  hazard_scores: Record<string, number>;
}

export function normalizeTaglish(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  let text = raw.toLowerCase().trim();

  text = text.replace(/([!?.,])\1+/g, "$1");
  text = text.replace(/([a-z])\1{2,}/g, "$1");

  const slangMap: [RegExp, string][] = [
    [/\b(hnd|nd|d)\b/g, "hindi"],
    [/\b(wla|wlang)\b/g, "walang"],
    [/\b(pls|plz|pki)\b/g, "paki"],
    [/\b(dto|d2)\b/g, "dito"],
    [/\b(dun|don)\b/g, "doon"],
    [/\b(san|sn)\b/g, "saan"],
    [/\b(kelan|kln)\b/g, "kailan"],
    [/\b(mron|meron|my)\b/g, "may"],
    [/\b(bka)\b/g, "baka"],
    [/\b(bta|batan)\b/g, "bata"],
    [/\bkoryente\b/g, "kuryente"],
    [/\bnllunod\b/g, "nalulunod"],
    [/\bsunug\b/g, "sunog"],
    [/\baksdente\b/g, "aksidente"],
    [/\bsalpok\b/g, "salpukan"],
    [/\bmotor\b/g, "motorcycle"],
    [/\btrike\b/g, "tricycle"],
    [/\bemrgncy\b/g, "emergency"],
    [/\bsaklolo\b/g, "saklolo"],
    [/\b(paki|pa)[-\s]?(check|silip|tingin|punta|tulong)\b/g, "saklolo emergency"],
    [/\b(parang|medyo|tila)\s+may\s+sunog\b/g, "sunog apoy"],
    [/\b(parang|medyo|tila)\s+mataas\s+ang\s+tubig\b/g, "baha mataas tubig"],
    [/\b(nahulog|nawalan\s+ng\s+malay|di\s+gumagalaw)\b/g, "walang malay medical emergency"]
  ];

  for (const [pattern, repl] of slangMap) {
    text = text.replace(pattern, repl);
  }

  return text;
}

export function detectNegationOrDrill(text: string) {
  const negationPatterns = [
    "walang sunog", "walang baha", "hindi totoo", "false alarm", "fake report",
    "naapula na", "patay na ang apoy", "hupa na ang baha", "walang aksidente",
    "mali ang akala", "maling akala", "ligtas na", "fake news"
  ];
  const isNegated = negationPatterns.some(p => text.includes(p));

  const drillPatterns = [
    "fire drill", "earthquake drill", "simulation", "practice drill",
    "exercise only", "testing lang", "drill lang"
  ];
  const isDrill = drillPatterns.some(p => text.includes(p));

  return { isNegated, isDrill };
}

export function extractEntities(text: string) {
  const locationMatches: string[] = [];
  const locations = [
    { name: "Gumaca Cathedral / Simbahan", patterns: ["simbahan", "church", "kapilya", "cathedral"] },
    { name: "Gumaca Public Market (Palengke)", patterns: ["palengke", "market", "tiangge"] },
    { name: "Maharlika Highway", patterns: ["maharlika highway", "maharlika", "national highway", "highway"] },
    { name: "Diversion Road", patterns: ["diversion road", "diversion", "bypass"] },
    { name: "Pipisik River / Area", patterns: ["pipisik", "pipisik river"] },
    { name: "Coastal Waters / Lamon Bay", patterns: ["dagat", "karagatan", "laot", "lamon bay", "baybayin", "pantalan", "dalampasigan"] },
    { name: "Gumaca Municipal Hall", patterns: ["munisipyo", "municipal hall", "plaza"] },
    { name: "Eastern Quezon Medical Center / Hospital", patterns: ["ospital", "hospital", "health center", "clinic"] },
    { name: "Gumaca Schools", patterns: ["paaralan", "school", "eskwelahan", "elem", "high school", "gumaca west", "gumaca east"] },
    { name: "Barangay Hall", patterns: ["barangay hall", "brgy hall", "bgy hall"] }
  ];

  for (const loc of locations) {
    if (loc.patterns.some(p => text.includes(p))) {
      locationMatches.push(loc.name);
    }
  }

  const vulnerableGroups: string[] = [];
  const vulPatterns = [
    { name: "Children / Infants", patterns: ["bata", "sanggol", "baby", "toddler", "mga bata"] },
    { name: "Elderly / Seniors", patterns: ["matanda", "senior", "lolo", "lola", "elderly"] },
    { name: "Pregnant Women", patterns: ["buntis", "manganganak", "pregnant"] },
    { name: "Persons with Disability / Bedridden", patterns: ["pwd", "kapansanan", "paralyzed", "bedridden", "pilay"] }
  ];
  for (const vul of vulPatterns) {
    if (vul.patterns.some(p => text.includes(p))) {
      vulnerableGroups.push(vul.name);
    }
  }

  const casualties = [
    "patay", "deds", "nasawi", "bangkay", "sugatan", "duguan", "dugo",
    "walang malay", "unconscious", "hindi humihinga", "naghihingalo",
    "agaw-buhay", "nalulunod", "drowning", "bali", "nabalian"
  ].some(p => text.includes(p));

  const trapped = [
    "trap", "trapped", "na-trap", "natrap", "naipit", "stranded",
    "na-stranded", "nastranded", "hindi makaalis", "di makaalis",
    "bubong", "nakukulong"
  ].some(p => text.includes(p));

  return { locations: locationMatches, vulnerableGroups, hasCasualties: casualties, isTrapped: trapped };
}

export function calculateHazardScores(text: string) {
  function matchesWord(source: string, kw: string) {
    if (kw.includes(" ")) return source.includes(kw);
    const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const regex = new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i");
    return regex.test(source);
  }

  const weights = {
    fire: [
      { weight: 3.5, words: ["sunog", "nasusunog", "masusunog", "apoy", "nag-aapoy", "blaze", "inferno", "explosion", "sumabog", "sumisiklab"] },
      { weight: 2.0, words: ["usok", "makapal na usok", "kuryente", "short circuit", "live wire", "spark", "lpg", "gas leak", "singaw ng gas"] },
      { weight: 1.0, words: ["kandila", "silab", "abo", "nasunog"] }
    ],
    flooding: [
      { weight: 3.5, words: ["baha", "pagbaha", "binaha", "bumabaha", "lubog sa tubig", "umaapaw ang ilog", "storm surge", "daluyong", "tsunami", "flash flood"] },
      { weight: 2.5, words: ["submerged", "pantay-tuhod", "tuhod", "lagpas tao", "inundation", "overflow", "high tide", "dagat", "laot", "tinangay ng alon", "tinangay ng agos", "lumubog na bangka", "tumaob na bangka", "capsized", "tumaob"] },
      { weight: 1.2, words: ["tubig", "ulan", "sapa", "ilog", "baybayin", "pantalan", "dalampasigan", "bangka", "boat", "alon", "lawa", "dike", "water"] }
    ],
    road: [
      { weight: 3.5, words: ["landslide", "guho", "naguho ang lupa", "tumbang puno", "tumbang poste", "barikada", "nakaharang sa highway", "sarado ang daan", "salpukan ng sasakyan", "salpukan"] },
      { weight: 2.5, words: ["nakaharang", "debris", "block", "blocked", "nagbara", "banggaan", "aksidente", "sumalpok", "nabangga", "boulder", "malalaking bato", "sirang tulay", "bato sa daan"] },
      { weight: 1.2, words: ["kalsada", "daan", "highway", "trapiko", "traffic", "harang", "tumba", "poste", "puno"] }
    ],
    medical: [
      { weight: 4.0, words: ["nalulunod", "nalunod", "lunod", "malulunod", "drowning", "drown", "inatake sa puso", "heart attack", "stroke", "cardiac arrest", "walang pulso", "hindi humihinga", "hindi makahinga", "naghihingalo", "agaw-buhay", "namamatay"] },
      { weight: 2.5, words: ["nahimatay", "unconscious", "duguan", "malubhang sugat", "bleeding", "sugat", "panganak", "manganganak", "kombulsyon", "seizure", "nalason", "poisoning", "kagat ng ahas", "fracture", "nabalian", "burns", "napaso", "patay", "biktima"] },
      { weight: 1.2, words: ["masakit", "nasaktan", "pinsala", "ambulansya", "ambulance", "ospital", "medical", "doktor", "dugo"] }
    ],
    other: [
      { weight: 3.5, words: ["lindol", "earthquake", "buhawi", "tornado", "sinkhole", "gumuhong gusali", "chemical spill", "hazmat"] },
      { weight: 2.0, words: ["ashfall", "structural collapse", "pagyanig", "gumuhong pader"] }
    ]
  };

  const scores: Record<string, number> = { fire: 0, flooding: 0, road: 0, medical: 0, other: 0 };

  for (const [cat, tierList] of Object.entries(weights)) {
    for (const tier of tierList) {
      for (const word of tier.words) {
        if (matchesWord(text, word)) {
          scores[cat] += tier.weight;
        }
      }
    }
  }

  return scores;
}

export function classifyWithSmartNLP(rawText: string): ClassificationOutput {
  if (!rawText || typeof rawText !== "string") {
    return {
      category: "other disaster-related incidents",
      secondary_category: null,
      compound_hazard: false,
      compound_hazards: ["other disaster-related incidents"],
      priority_level: "Low",
      confidence_score: 0.70,
      recommended_units: ["MDRRMO Operations Center"],
      reasoning: "No description text provided for classification.",
      extracted_entities: { locations: [], vulnerableGroups: [], hasCasualties: false, isTrapped: false },
      hazard_scores: { fire: 0, flooding: 0, road: 0, medical: 0, other: 0 }
    };
  }

  const normalized = normalizeTaglish(rawText);
  const { isNegated, isDrill } = detectNegationOrDrill(normalized);
  const entities = extractEntities(normalized);
  const scores = calculateHazardScores(normalized);

  if (isNegated || isDrill) {
    const reason = isDrill
      ? `Simulated Emergency / Exercise: Drill keywords identified (${entities.locations[0] || "designated area"}). Logged for MDRRMO tracking; no response action is taken from this local estimate.`
      : `False Alarm / Negation: Report explicitly indicates no active hazard or situation already resolved. Logged for verification.`;
    return {
      category: "other disaster-related incidents",
      secondary_category: null,
      compound_hazard: false,
      compound_hazards: ["other disaster-related incidents"],
      priority_level: "Low",
      confidence_score: 0.95,
      recommended_units: ["MDRRMO Operations Center Monitoring"],
      reasoning: reason,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  const ranked = [
    { cat: "fire incident", score: scores.fire },
    { cat: "flooding", score: scores.flooding },
    { cat: "road obstruction", score: scores.road },
    { cat: "medical emergency", score: scores.medical },
    { cat: "other disaster-related incidents", score: scores.other }
  ].sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  const isDrowning = normalized.includes("nalulunod") || normalized.includes("nalunod") || normalized.includes("lunod") || normalized.includes("drown");
  const isMarineOrWater = scores.flooding >= 1.5 || normalized.includes("dagat") || normalized.includes("laot") || normalized.includes("ilog");
  const isRoadCollision = normalized.includes("salpukan") || normalized.includes("banggaan") || normalized.includes("aksidente") || normalized.includes("sumalpok");
  const isFireWithDebris = scores.fire >= 2.0 && scores.road >= 2.0;
  const isFloodWithTrapped = (scores.flooding >= 2.0 && (entities.isTrapped || scores.medical >= 2.0));
  const isAccidentWithInjury = (scores.road >= 2.0 || isRoadCollision) && (scores.medical >= 2.0 || entities.hasCasualties);

  if (isDrowning && (isMarineOrWater || entities.isTrapped)) {
    const locationName = entities.locations.find(l => l.includes("Coastal") || l.includes("Lamon") || l.includes("Pipisik")) || "coastal / marine waters";
    return {
      category: "medical emergency",
      secondary_category: "flooding",
      compound_hazard: true,
      compound_hazards: ["medical emergency", "flooding"],
      priority_level: "High",
      confidence_score: 0.98,
      recommended_units: [
        "MDRRMO Water Search & Rescue Team (WASAR)",
        "Municipal Health Office (MHO) EMS Ambulance",
        "Philippine Coast Guard Auxiliary Gumaca"
      ],
      reasoning: `Preliminary compound-hazard estimate: Drowning and stranded-person keywords were identified in ${locationName}. HIGH priority is suggested for personnel review of water-rescue and medical needs.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (isFireWithDebris || (scores.fire >= 2.5 && second.cat === "road obstruction" && second.score >= 1.5)) {
    const loc = entities.locations[0] || "vicinity";
    return {
      category: "fire incident",
      secondary_category: "road obstruction",
      compound_hazard: true,
      compound_hazards: ["fire incident", "road obstruction"],
      priority_level: "High",
      confidence_score: 0.98,
      recommended_units: [
        "BFP Gumaca Fire Rescue Station",
        "MDRRMO Quick Response & Engineering Road Clearing"
      ],
      reasoning: `Preliminary compound-hazard estimate: Fire and road-obstruction keywords were identified near ${loc}. HIGH priority is suggested for personnel review of fire and road-access risks.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (isAccidentWithInjury || (top.cat === "medical emergency" && second.cat === "road obstruction" && second.score >= 2.0)) {
    const loc = entities.locations[0] || "roadway";
    return {
      category: "medical emergency",
      secondary_category: "road obstruction",
      compound_hazard: true,
      compound_hazards: ["medical emergency", "road obstruction"],
      priority_level: "High",
      confidence_score: 0.97,
      recommended_units: [
        "Municipal Health Office (MHO) EMS Ambulance",
        "PNP Gumaca Traffic Enforcement",
        "MDRRMO Quick Response Team"
      ],
      reasoning: `Preliminary compound-hazard estimate: A road incident and injured-casualty keywords were identified along ${loc}. HIGH priority is suggested for personnel review of medical and traffic needs.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (isFloodWithTrapped || (scores.flooding >= 2.5 && scores.medical >= 2.0)) {
    const loc = entities.locations[0] || "flood zone";
    const vulStr = entities.vulnerableGroups.length > 0 ? ` involving ${entities.vulnerableGroups.join(", ")}` : "";
    return {
      category: "flooding",
      secondary_category: "medical emergency",
      compound_hazard: true,
      compound_hazards: ["flooding", "medical emergency"],
      priority_level: "High",
      confidence_score: 0.97,
      recommended_units: [
        "MDRRMO Water Search & Rescue Team (WASAR)",
        "Municipal Health Office (MHO) EMS Ambulance"
      ],
      reasoning: `Preliminary compound-hazard estimate: Flooding and trapped-person keywords were identified in ${loc}${vulStr}. HIGH priority is suggested for personnel review of evacuation and medical needs.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (scores.flooding >= 2.0 && scores.road >= 2.0) {
    const loc = entities.locations[0] || "transit route";
    return {
      category: "flooding",
      secondary_category: "road obstruction",
      compound_hazard: true,
      compound_hazards: ["flooding", "road obstruction"],
      priority_level: "High",
      confidence_score: 0.96,
      recommended_units: [
        "MDRRMO Water Search & Rescue (WASAR)",
        "DPWH 4th District Engineering Office",
        "Municipal Engineering Road Clearing"
      ],
      reasoning: `Preliminary compound-hazard estimate: Flooding and route-obstruction keywords were identified near ${loc}. HIGH priority is suggested for personnel review of water and route hazards.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (scores.fire >= 2.5 && (scores.medical >= 1.5 || entities.hasCasualties)) {
    return {
      category: "fire incident",
      secondary_category: "medical emergency",
      compound_hazard: true,
      compound_hazards: ["fire incident", "medical emergency"],
      priority_level: "High",
      confidence_score: 0.98,
      recommended_units: [
        "BFP Gumaca Fire Rescue Station",
        "Municipal Health Office (MHO) EMS Ambulance"
      ],
      reasoning: `Preliminary compound-hazard estimate: Fire and injury keywords were identified. HIGH priority is suggested for personnel review of fire and medical risks.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  if (top.score > 0) {
    let priority: "High" | "Medium" | "Low" = "Medium";
    let units = ["MDRRMO Operations Center"];
    let reason = "";

    const isUrgent = entities.hasCasualties || entities.isTrapped || entities.vulnerableGroups.length > 0 ||
      normalized.includes("saklolo") || normalized.includes("tulong") || normalized.includes("emergency") ||
      normalized.includes("delikado") || normalized.includes("agaran") || normalized.includes("critical") ||
      entities.locations.some(l => l.includes("Hospital") || l.includes("School") || l.includes("Cathedral"));

    if (top.cat === "fire incident") {
      priority = isUrgent || top.score >= 3.5 ? "High" : "Medium";
      units = ["BFP Gumaca Fire Rescue Station"];
      reason = priority === "High"
        ? "Preliminary high-priority fire estimate: Combustion or structural-risk keywords were identified. Personnel review is needed."
        : `Preliminary fire estimate: Combustion or smoke keywords were identified for personnel review.`;
    } else if (top.cat === "flooding") {
      priority = isUrgent || top.score >= 3.5 || entities.isTrapped ? "High" : "Medium";
      units = priority === "High" ? ["MDRRMO Water Search & Rescue Team (WASAR)"] : ["MDRRMO Flood & Drainage Monitoring"];
      reason = priority === "High"
        ? "Preliminary high-priority flooding estimate: Deep inundation or stranded-person keywords were identified. Personnel review is needed."
        : `Preliminary flooding estimate: Water-buildup keywords were identified for personnel review.`;
    } else if (top.cat === "road obstruction") {
      priority = isUrgent || top.score >= 3.5 || normalized.includes("landslide") || normalized.includes("guho") ? "High" : "Medium";
      units = ["MDRRMO Quick Response Team", "DPWH / Municipal Engineering Clearing"];
      reason = priority === "High"
        ? "Preliminary high-priority road-obstruction estimate: A blocked route was reported. Personnel review is needed."
        : `Preliminary road-obstruction estimate: Physical obstruction or traffic-impediment keywords were identified for personnel review.`;
    } else if (top.cat === "medical emergency") {
      priority = isUrgent || top.score >= 3.5 || isDrowning ? "High" : "Medium";
      units = ["Municipal Health Office (MHO) EMS Ambulance"];
      reason = priority === "High"
        ? "Preliminary high-priority medical estimate: Acute-trauma or life-threatening-symptom keywords were identified. Personnel review is needed."
        : `Preliminary medical estimate: Health-related keywords were identified for personnel review.`;
    } else {
      priority = isUrgent ? "High" : "Medium";
      units = ["MDRRMO Disaster Operations Center"];
      reason = `Disaster-related incident identified (${rawText.slice(0, 45)}...). Logged for MDRRMO assessment.`;
    }

    const confidence = Math.min(0.98, Math.max(0.85, 0.82 + (top.score * 0.03)));

    return {
      category: top.cat,
      secondary_category: null,
      compound_hazard: false,
      compound_hazards: [top.cat],
      priority_level: priority,
      confidence_score: Number(confidence.toFixed(2)),
      recommended_units: units,
      reasoning: reason,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  return {
    category: "other disaster-related incidents",
    secondary_category: null,
    compound_hazard: false,
    compound_hazards: ["other disaster-related incidents"],
    priority_level: "Low",
    confidence_score: 0.75,
    recommended_units: ["MDRRMO Operations Center"],
    reasoning: `General disaster incident: Unstructured description logged for routine MDRRMO Gumaca triage.`,
    extracted_entities: entities,
    hazard_scores: scores
  };
}

export function mapCategoryToDbEnum(cat: string): "fire" | "flooding" | "road_accident" | "road_obstruction" | "medical_emergency" | "other" {
  const lower = cat.toLowerCase();
  if (lower.includes("fire")) return "fire";
  if (lower.includes("flood")) return "flooding";
  if (lower.includes("accident") || lower.includes("collision")) return "road_accident";
  if (lower.includes("obstruction") || lower.includes("road")) return "road_obstruction";
  if (lower.includes("medical")) return "medical_emergency";
  return "other";
}
