export interface ClassificationResult {
  category: "flooding" | "fire incident" | "road obstruction" | "medical emergency" | "other disaster-related incidents";
  priority_level: "High" | "Medium" | "Low";
  confidence_score: number;
  reasoning: string;
  secondary_category?: "flooding" | "fire incident" | "road obstruction" | "medical emergency" | "other disaster-related incidents" | null;
  compound_hazard?: boolean;
  compound_hazards?: string[];
  recommended_units?: string[];
  extracted_entities?: {
    locations?: string[];
    vulnerableGroups?: string[];
    hasCasualties?: boolean;
    isTrapped?: boolean;
  };
  hazard_scores?: {
    fire: number;
    flooding: number;
    road: number;
    medical: number;
    other: number;
  };
}

const VALID_CATEGORIES = new Set([
  'flooding',
  'fire incident',
  'road obstruction',
  'medical emergency',
  'other disaster-related incidents',
]);

const VALID_PRIORITIES = new Set(['High', 'Medium', 'Low']);

function isClassificationResult(value: unknown): value is ClassificationResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ClassificationResult>;
  return typeof result.category === 'string'
    && VALID_CATEGORIES.has(result.category)
    && typeof result.priority_level === 'string'
    && VALID_PRIORITIES.has(result.priority_level)
    && typeof result.confidence_score === 'number'
    && Number.isFinite(result.confidence_score)
    && result.confidence_score >= 0
    && result.confidence_score <= 1
    && typeof result.reasoning === 'string';
}

export function normalizeTaglish(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  let text = raw.toLowerCase().trim();

  // Normalize repeated punctuation (e.g. '????' -> '?')
  text = text.replace(/([!?.,])\1+/g, '$1');

  // Normalize stretched vowel/consonant typos (e.g. 'sunooog' -> 'sunog', 'bahaaaaa' -> 'baha')
  text = text.replace(/([a-z])\1{2,}/g, '$1');

  // Common Taglish SMS abbreviations and slang dictionary
  const slangMap: [RegExp, string][] = [
    [/\b(hnd|nd|d)\b/g, 'hindi'],
    [/\b(wla|wlang)\b/g, 'walang'],
    [/\b(pls|plz|pki)\b/g, 'paki'],
    [/\b(dto|d2)\b/g, 'dito'],
    [/\b(dun|don)\b/g, 'doon'],
    [/\b(san|sn)\b/g, 'saan'],
    [/\b(kelan|kln)\b/g, 'kailan'],
    [/\b(mron|meron|my)\b/g, 'may'],
    [/\b(bka)\b/g, 'baka'],
    [/\b(bta|batan)\b/g, 'bata'],
    [/\bkoryente\b/g, 'kuryente'],
    [/\bnllunod\b/g, 'nalulunod'],
    [/\bsunug\b/g, 'sunog'],
    [/\baksdente\b/g, 'aksidente'],
    [/\bsalpok\b/g, 'salpukan'],
    [/\bmotor\b/g, 'motorcycle'],
    [/\btrike\b/g, 'tricycle'],
    [/\bemrgncy\b/g, 'emergency'],
    [/\bsaklolo\b/g, 'saklolo']
  ];

  for (const [pattern, repl] of slangMap) {
    text = text.replace(pattern, repl);
  }

  return text;
}

export function detectNegationOrDrill(text: string): { isNegated: boolean; isDrill: boolean } {
  const negationPatterns = [
    'walang sunog', 'walang baha', 'hindi totoo', 'false alarm', 'fake report',
    'naapula na', 'patay na ang apoy', 'hupa na ang baha', 'walang aksidente',
    'mali ang akala', 'maling akala', 'ligtas na', 'fake news'
  ];
  const isNegated = negationPatterns.some(p => text.includes(p));

  const drillPatterns = [
    'fire drill', 'earthquake drill', 'simulation', 'practice drill',
    'exercise only', 'testing lang', 'drill lang'
  ];
  const isDrill = drillPatterns.some(p => text.includes(p));

  return { isNegated, isDrill };
}

export function extractEntities(text: string) {
  // Gumaca Locations, Coastal Zones & Arterial Corridors
  const locationMatches: string[] = [];
  const locations = [
    { name: 'Gumaca Cathedral / Simbahan', patterns: ['simbahan', 'church', 'kapilya', 'cathedral'] },
    { name: 'Gumaca Public Market (Palengke)', patterns: ['palengke', 'market', 'tiangge'] },
    { name: 'Maharlika Highway', patterns: ['maharlika highway', 'maharlika', 'national highway', 'highway'] },
    { name: 'Diversion Road', patterns: ['diversion road', 'diversion', 'bypass'] },
    { name: 'Pipisik River / Area', patterns: ['pipisik', 'pipisik river'] },
    { name: 'Coastal Waters / Lamon Bay', patterns: ['dagat', 'karagatan', 'laot', 'lamon bay', 'baybayin', 'pantalan', 'dalampasigan'] },
    { name: 'Gumaca Municipal Hall', patterns: ['munisipyo', 'municipal hall', 'plaza'] },
    { name: 'Eastern Quezon Medical Center / Hospital', patterns: ['ospital', 'hospital', 'health center', 'clinic'] },
    { name: 'Gumaca Schools', patterns: ['paaralan', 'school', 'eskwelahan', 'elem', 'high school', 'gumaca west', 'gumaca east'] },
    { name: 'Barangay Hall', patterns: ['barangay hall', 'brgy hall', 'bgy hall'] }
  ];

  for (const loc of locations) {
    if (loc.patterns.some(p => text.includes(p))) {
      locationMatches.push(loc.name);
    }
  }

  // Vulnerable groups
  const vulnerableGroups: string[] = [];
  const vulPatterns = [
    { name: 'Children / Infants', patterns: ['bata', 'sanggol', 'baby', 'toddler', 'mga bata'] },
    { name: 'Elderly / Seniors', patterns: ['matanda', 'senior', 'lolo', 'lola', 'elderly'] },
    { name: 'Pregnant Women', patterns: ['buntis', 'manganganak', 'pregnant'] },
    { name: 'Persons with Disability / Bedridden', patterns: ['pwd', 'kapansanan', 'paralyzed', 'bedridden', 'pilay'] }
  ];
  for (const vul of vulPatterns) {
    if (vul.patterns.some(p => text.includes(p))) {
      vulnerableGroups.push(vul.name);
    }
  }

  // Casualties / Severe Life Threat
  const casualties = [
    'patay', 'deds', 'nasawi', 'bangkay', 'sugatan', 'duguan', 'dugo',
    'walang malay', 'unconscious', 'hindi humihinga', 'naghihingalo',
    'agaw-buhay', 'nalulunod', 'drowning', 'bali', 'nabalian'
  ].some(p => text.includes(p));

  // Trapped / Stranded
  const trapped = [
    'trap', 'trapped', 'na-trap', 'natrap', 'naipit', 'stranded',
    'na-stranded', 'nastranded', 'hindi makaalis', 'di makaalis',
    'bubong', 'nakukulong'
  ].some(p => text.includes(p));

  return { locations: locationMatches, vulnerableGroups, hasCasualties: casualties, isTrapped: trapped };
}

export function calculateHazardScores(text: string) {
  function matchesWord(source: string, kw: string) {
    if (kw.includes(' ')) return source.includes(kw);
    const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp('(^|[^a-z0-9])' + escaped + '([^a-z0-9]|$)', 'i');
    return regex.test(source);
  }

  const weights = {
    fire: [
      { weight: 3.5, words: ['sunog', 'nasusunog', 'masusunog', 'apoy', 'nag-aapoy', 'blaze', 'inferno', 'explosion', 'sumabog', 'sumisiklab'] },
      { weight: 2.0, words: ['usok', 'makapal na usok', 'kuryente', 'short circuit', 'live wire', 'spark', 'lpg', 'gas leak', 'singaw ng gas'] },
      { weight: 1.0, words: ['kandila', 'silab', 'abo', 'nasunog'] }
    ],
    flooding: [
      { weight: 3.5, words: ['baha', 'pagbaha', 'binaha', 'bumabaha', 'lubog sa tubig', 'umaapaw ang ilog', 'storm surge', 'daluyong', 'tsunami', 'flash flood'] },
      { weight: 2.5, words: ['submerged', 'pantay-tuhod', 'tuhod', 'lagpas tao', 'inundation', 'overflow', 'high tide', 'dagat', 'laot', 'tinangay ng alon', 'tinangay ng agos', 'lumubog na bangka', 'tumaob na bangka', 'capsized', 'tumaob'] },
      { weight: 1.2, words: ['tubig', 'ulan', 'sapa', 'ilog', 'baybayin', 'pantalan', 'dalampasigan', 'bangka', 'boat', 'alon', 'lawa', 'dike', 'water'] }
    ],
    road: [
      { weight: 3.5, words: ['landslide', 'guho', 'naguho ang lupa', 'tumbang puno', 'tumbang poste', 'barikada', 'nakaharang sa highway', 'sarado ang daan', 'salpukan ng sasakyan', 'salpukan'] },
      { weight: 2.5, words: ['nakaharang', 'debris', 'block', 'blocked', 'nagbara', 'banggaan', 'aksidente', 'sumalpok', 'nabangga', 'boulder', 'malalaking bato', 'sirang tulay', 'bato sa daan'] },
      { weight: 1.2, words: ['kalsada', 'daan', 'highway', 'trapiko', 'traffic', 'harang', 'tumba', 'poste', 'puno'] }
    ],
    medical: [
      { weight: 4.0, words: ['nalulunod', 'nalunod', 'lunod', 'malulunod', 'drowning', 'drown', 'inatake sa puso', 'heart attack', 'stroke', 'cardiac arrest', 'walang pulso', 'hindi humihinga', 'hindi makahinga', 'naghihingalo', 'agaw-buhay', 'namamatay'] },
      { weight: 2.5, words: ['nahimatay', 'unconscious', 'duguan', 'malubhang sugat', 'bleeding', 'sugat', 'panganak', 'manganganak', 'kombulsyon', 'seizure', 'nalason', 'poisoning', 'kagat ng ahas', 'fracture', 'nabalian', 'burns', 'napaso', 'patay', 'biktima'] },
      { weight: 1.2, words: ['masakit', 'nasaktan', 'pinsala', 'ambulansya', 'ambulance', 'ospital', 'medical', 'doktor', 'dugo'] }
    ],
    other: [
      { weight: 3.5, words: ['lindol', 'earthquake', 'buhawi', 'tornado', 'sinkhole', 'gumuhong gusali', 'chemical spill', 'hazmat'] },
      { weight: 2.0, words: ['ashfall', 'structural collapse', 'pagyanig', 'gumuhong pader'] }
    ]
  };

  const scores = { fire: 0, flooding: 0, road: 0, medical: 0, other: 0 };

  for (const [cat, tierList] of Object.entries(weights) as [keyof typeof scores, { weight: number; words: string[] }[]][]) {
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

export function classifyWithSmartNLP(rawText: string): ClassificationResult {
  if (!rawText || typeof rawText !== 'string') {
    return {
      category: 'other disaster-related incidents',
      secondary_category: null,
      compound_hazard: false,
      compound_hazards: ['other disaster-related incidents'],
      priority_level: 'Low',
      confidence_score: 0.70,
      recommended_units: ['MDRRMO Operations Center'],
      reasoning: 'No description text provided for classification.',
      extracted_entities: { locations: [], vulnerableGroups: [], hasCasualties: false, isTrapped: false },
      hazard_scores: { fire: 0, flooding: 0, road: 0, medical: 0, other: 0 }
    };
  }

  const normalized = normalizeTaglish(rawText);
  const { isNegated, isDrill } = detectNegationOrDrill(normalized);
  const entities = extractEntities(normalized);
  const scores = calculateHazardScores(normalized);

  // --- SPECIAL CASE: NEGATION / DRILL ---
  if (isNegated || isDrill) {
    const reason = isDrill
      ? `Simulated Emergency / Exercise: Drill keywords identified (${entities.locations[0] || 'designated area'}). Logged for MDRRMO tracking without emergency vehicle dispatch.`
      : `False Alarm / Negation: Report explicitly indicates no active hazard or situation already resolved. Logged for verification.`;
    return {
      category: 'other disaster-related incidents',
      secondary_category: null,
      compound_hazard: false,
      compound_hazards: ['other disaster-related incidents'],
      priority_level: 'Low',
      confidence_score: 0.95,
      recommended_units: ['MDRRMO Operations Center Monitoring'],
      reasoning: reason,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // --- IDENTIFY TOP HAZARDS BY SCORE ---
  const ranked = ([
    { cat: 'fire incident', score: scores.fire },
    { cat: 'flooding', score: scores.flooding },
    { cat: 'road obstruction', score: scores.road },
    { cat: 'medical emergency', score: scores.medical },
    { cat: 'other disaster-related incidents', score: scores.other }
  ] as { cat: ClassificationResult['category']; score: number }[]).sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];

  // Specific high-risk triggers
  const isDrowning = normalized.includes('nalulunod') || normalized.includes('nalunod') || normalized.includes('lunod') || normalized.includes('drown');
  const isMarineOrWater = scores.flooding >= 1.5 || normalized.includes('dagat') || normalized.includes('laot') || normalized.includes('ilog');
  const isRoadCollision = normalized.includes('salpukan') || normalized.includes('banggaan') || normalized.includes('aksidente') || normalized.includes('sumalpok');
  const isFireWithDebris = scores.fire >= 2.0 && scores.road >= 2.0;
  const isFloodWithTrapped = (scores.flooding >= 2.0 && (entities.isTrapped || scores.medical >= 2.0));
  const isAccidentWithInjury = (scores.road >= 2.0 || isRoadCollision) && (scores.medical >= 2.0 || entities.hasCasualties);

  // ==========================================
  // COMPOUND HAZARD RESOLUTIONS
  // ==========================================

  // CASE 1: DROWNING + STRANDED AT SEA / MARITIME RESCUE
  if (isDrowning && (isMarineOrWater || entities.isTrapped)) {
    const locationName = entities.locations.find(l => l.includes('Coastal') || l.includes('Lamon') || l.includes('Pipisik')) || 'coastal / marine waters';
    return {
      category: 'medical emergency',
      secondary_category: 'flooding',
      compound_hazard: true,
      compound_hazards: ['medical emergency', 'flooding'],
      priority_level: 'High',
      confidence_score: 0.98,
      recommended_units: [
        'MDRRMO Water Search & Rescue Team (WASAR)',
        'Municipal Health Office (MHO) EMS Ambulance',
        'Philippine Coast Guard Auxiliary Gumaca'
      ],
      reasoning: `Compound Emergency: Active drowning casualty (nalulunod) reported in ${locationName} alongside stranded individuals. Escalated to HIGH priority for urgent waterborne search-and-rescue and emergency paramedic CPR/resuscitation.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // CASE 2: FIRE + ROAD OBSTRUCTION / DEBRIS
  if (isFireWithDebris || (scores.fire >= 2.5 && second.cat === 'road obstruction' && second.score >= 1.5)) {
    const loc = entities.locations[0] || 'vicinity';
    return {
      category: 'fire incident',
      secondary_category: 'road obstruction',
      compound_hazard: true,
      compound_hazards: ['fire incident', 'road obstruction'],
      priority_level: 'High',
      confidence_score: 0.98,
      recommended_units: [
        'BFP Gumaca Fire Rescue Station',
        'MDRRMO Quick Response & Engineering Road Clearing'
      ],
      reasoning: `Compound Emergency: Active fire reported near ${loc} compounded by road obstruction/debris blocking emergency vehicle access. Escalated to HIGH priority for joint BFP fire suppression and clearing crew dispatch.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // CASE 3: VEHICULAR COLLISION / ROAD HAZARD + MEDICAL / INJURIES
  if (isAccidentWithInjury || (top.cat === 'medical emergency' && second.cat === 'road obstruction' && second.score >= 2.0)) {
    const loc = entities.locations[0] || 'roadway';
    return {
      category: 'medical emergency',
      secondary_category: 'road obstruction',
      compound_hazard: true,
      compound_hazards: ['medical emergency', 'road obstruction'],
      priority_level: 'High',
      confidence_score: 0.97,
      recommended_units: [
        'Municipal Health Office (MHO) EMS Ambulance',
        'PNP Gumaca Traffic Enforcement',
        'MDRRMO Quick Response Team'
      ],
      reasoning: `Compound Emergency: Vehicular collision or road incident with injured casualties reported along ${loc}. Dispatched HIGH priority EMS ambulance for trauma triage and PNP/MDRRMO for traffic route clearance.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // CASE 4: FLOOD + MEDICAL / TRAPPED PERSONS / CASUALTIES
  if (isFloodWithTrapped || (scores.flooding >= 2.5 && scores.medical >= 2.0)) {
    const loc = entities.locations[0] || 'flood zone';
    const vulStr = entities.vulnerableGroups.length > 0 ? ` involving ${entities.vulnerableGroups.join(', ')}` : '';
    return {
      category: 'flooding',
      secondary_category: 'medical emergency',
      compound_hazard: true,
      compound_hazards: ['flooding', 'medical emergency'],
      priority_level: 'High',
      confidence_score: 0.97,
      recommended_units: [
        'MDRRMO Water Search & Rescue Team (WASAR)',
        'Municipal Health Office (MHO) EMS Ambulance'
      ],
      reasoning: `Compound Emergency: Deep inundation/river overflow in ${loc} with trapped individuals${vulStr}. Escalated to HIGH priority for watercraft evacuation and emergency medical standby.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // CASE 5: FLOOD + ROAD OBSTRUCTION / LANDSLIDE
  if (scores.flooding >= 2.0 && scores.road >= 2.0) {
    const loc = entities.locations[0] || 'transit route';
    return {
      category: 'flooding',
      secondary_category: 'road obstruction',
      compound_hazard: true,
      compound_hazards: ['flooding', 'road obstruction'],
      priority_level: 'High',
      confidence_score: 0.96,
      recommended_units: [
        'MDRRMO Water Search & Rescue (WASAR)',
        'DPWH 4th District Engineering Office',
        'Municipal Engineering Road Clearing'
      ],
      reasoning: `Compound Emergency: Rising floodwaters and landslide/debris blocking critical thoroughfare in ${loc}. Dispatched HIGH priority water rescue and heavy equipment clearing crews.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // CASE 6: FIRE + MEDICAL / CASUALTIES
  if (scores.fire >= 2.5 && (scores.medical >= 1.5 || entities.hasCasualties)) {
    return {
      category: 'fire incident',
      secondary_category: 'medical emergency',
      compound_hazard: true,
      compound_hazards: ['fire incident', 'medical emergency'],
      priority_level: 'High',
      confidence_score: 0.98,
      recommended_units: [
        'BFP Gumaca Fire Rescue Station',
        'Municipal Health Office (MHO) EMS Ambulance'
      ],
      reasoning: `Compound Emergency: Structural or active fire incident with reported burn victims or smoke inhalation distress. Immediate HIGH priority dual-dispatch for BFP fire suppression and EMS ambulance triage.`,
      extracted_entities: entities,
      hazard_scores: scores
    };
  }

  // ==========================================
  // SINGLE HAZARD CLASSIFICATION
  // ==========================================
  if (top.score > 0) {
    let priority: ClassificationResult['priority_level'] = 'Medium';
    let units = ['MDRRMO Operations Center'];
    let reason = '';

    // Priority Escalation Rules
    const isUrgent = entities.hasCasualties || entities.isTrapped || entities.vulnerableGroups.length > 0 ||
      normalized.includes('saklolo') || normalized.includes('tulong') || normalized.includes('emergency') ||
      normalized.includes('delikado') || normalized.includes('agaran') || normalized.includes('critical') ||
      entities.locations.some(l => l.includes('Hospital') || l.includes('School') || l.includes('Cathedral'));

    if (top.cat === 'fire incident') {
      priority = isUrgent || top.score >= 3.5 ? 'High' : 'Medium';
      units = ['BFP Gumaca Fire Rescue Station'];
      reason = priority === 'High'
        ? `High-priority fire incident: Active combustion or structural risk detected (${rawText.slice(0, 45)}...). Immediate BFP fire suppression dispatched.`
        : `Fire incident detected: Combustion or smoke keywords flagged for BFP Gumaca inspection.`;
    } else if (top.cat === 'flooding') {
      priority = isUrgent || top.score >= 3.5 || entities.isTrapped ? 'High' : 'Medium';
      units = priority === 'High' ? ['MDRRMO Water Search & Rescue Team (WASAR)'] : ['MDRRMO Flood & Drainage Monitoring'];
      reason = priority === 'High'
        ? `Severe flooding / marine distress: Deep inundation or stranded persons flagged (${rawText.slice(0, 45)}...). Dispatched HIGH priority WASAR boat rescue.`
        : `Flooding hazard detected: Water buildup monitored for MDRRMO drainage management.`;
    } else if (top.cat === 'road obstruction') {
      priority = isUrgent || top.score >= 3.5 || normalized.includes('landslide') || normalized.includes('guho') ? 'High' : 'Medium';
      units = ['MDRRMO Quick Response Team', 'DPWH / Municipal Engineering Clearing'];
      reason = priority === 'High'
        ? `Critical road obstruction: Major thoroughfare or arterial highway blocked (${rawText.slice(0, 45)}...). Dispatched heavy equipment clearing crew.`
        : `Road obstruction detected: Physical obstruction or traffic impediment flagged for clearing.`;
    } else if (top.cat === 'medical emergency') {
      priority = isUrgent || top.score >= 3.5 || isDrowning ? 'High' : 'Medium';
      units = ['Municipal Health Office (MHO) EMS Ambulance'];
      reason = priority === 'High'
        ? `Critical medical distress: Acute trauma or life-threatening symptoms identified (${rawText.slice(0, 45)}...). Dispatched urgent EMS paramedic ambulance.`
        : `Medical assistance required: Non-critical symptoms flagged for MDRRMO medical transport assistance.`;
    } else {
      priority = isUrgent ? 'High' : 'Medium';
      units = ['MDRRMO Disaster Operations Center'];
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

  // Fallback
  return {
    category: 'other disaster-related incidents',
    secondary_category: null,
    compound_hazard: false,
    compound_hazards: ['other disaster-related incidents'],
    priority_level: 'Low',
    confidence_score: 0.75,
    recommended_units: ['MDRRMO Operations Center'],
    reasoning: `General disaster incident: Unstructured description logged for routine MDRRMO Gumaca triage.`,
    extracted_entities: entities,
    hazard_scores: scores
  };
}

export async function classifyIncident(description: string): Promise<ClassificationResult> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey) return classifyWithSmartNLP(description);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${apiKey}`;
    const systemInstruction =
      "You are an AI emergency dispatch classifier for KALASAG MDRRMO (Gumaca, Quezon). " +
      "Analyze emergency reports written in Tagalog, English, or Taglish. Treat calm, polite, understated, and mixed-case reports as seriously as urgent reports; do not downgrade severity due to tone. " +
      "Choose exactly one primary category: 'flooding', 'fire incident', 'road obstruction', 'medical emergency', or 'other disaster-related incidents'. " +
      "For multiple hazards, choose the primary life-safety hazard, set secondary_category to the compounding hazard, set compound_hazard to true, and set priority_level to 'High'. " +
      "Choose priority_level 'High', 'Medium', or 'Low'. Provide confidence_score from 0.0 to 1.0 and concise English reasoning. " +
      'Respond only with JSON: {"category":"...","secondary_category":null,"compound_hazard":false,"priority_level":"Medium","confidence_score":0.8,"reasoning":"..."}';

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemInstruction}\n\nEmergency Report: "${description}"` }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });

    if (!response.ok) {
      console.warn("Gemini API unavailable; using local Smart NLP fallback.");
      return classifyWithSmartNLP(description);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) return classifyWithSmartNLP(description);

    const parsed: unknown = JSON.parse(textResponse);
    if (!isClassificationResult(parsed)) {
      console.warn("Gemini returned an invalid incident classification; using local Smart NLP fallback.");
      return classifyWithSmartNLP(description);
    }
    return parsed;
  } catch (err) {
    console.warn("Gemini API error; using local Smart NLP fallback:", err);
    return classifyWithSmartNLP(description);
  }
}
