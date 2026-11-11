// Static world data for Portal Wars. Every team and player here is fictional.

export type TeamId =
  | "gulf" | "summit" | "bluegrass" | "prairie" | "canyon" | "lakeshore" | "piedmont"
  | "metro" | "desert" | "bayou" | "stallions" | "pacific" | "heartland" | "capitol"
  | "iron" | "coastline" | "rangers"
  | "ozark" | "tidewater" | "drovers"
  // Expansion teams (the league grows to 40 so a 24-team playoff field makes sense)
  | "cypress" | "gulfport" | "pinewood" | "bayoucity"
  | "highdesert" | "silverpeak" | "sagebrush" | "copper"
  | "blueridge" | "chesapeake" | "seaboard"
  | "panhandle" | "hillcountry" | "brazos"
  | "palmetto" | "emerald" | "lowcountry"
  | "flinthills" | "sandhills" | "badlands";

export interface Team {
  id: TeamId;
  name: string;
  short: string; // 3-4 letter abbreviation used on badges
  conf: string;
  color: string; // badge color
  off: number; // offense rating, 0-100
  def: number; // defense rating, 0-100
  ranked: boolean; // in the Season 1 committee table
}

/** The classic start (Lone Star, Week 11). New dynasties pick any team; see state.team. */
export const USER_TEAM: TeamId = "stallions";

/** Four "Power" conferences of eight; two smaller conferences of four (the game's Group of Six). */
export const POWER_CONFS = ["Delta League", "Redrock Circuit", "Atlantic Circuit", "Mesa League"] as const;
export const GROUP_CONFS = ["Sun Coast Conference", "Plains Athletic"] as const;
export const isPowerConf = (conf: string) => (POWER_CONFS as readonly string[]).includes(conf);

const t = (id: TeamId, name: string, short: string, conf: string, color: string, off: number, def: number, ranked = false): Team => ({ id, name, short, conf, color, off, def, ranked });

export const TEAMS: Record<TeamId, Team> = {
  // Delta League
  gulf: t("gulf", "Gulf Coast Mariners", "GCM", "Delta League", "#0e7490", 90, 88, true),
  bayou: t("bayou", "Bayou Kings", "BYK", "Delta League", "#6d28d9", 84, 83, true),
  coastline: t("coastline", "Coastline Storm", "CLS", "Delta League", "#0891b2", 81, 79, true),
  iron: t("iron", "Iron Range Forge", "IRF", "Delta League", "#57534e", 80, 82, true),
  cypress: t("cypress", "Cypress Bend Herons", "CBH", "Delta League", "#047857", 78, 77),
  gulfport: t("gulfport", "Gulfport Privateers", "GPV", "Delta League", "#1e40af", 76, 78),
  pinewood: t("pinewood", "Pinewood Rattlers", "PWR", "Delta League", "#3f6212", 77, 74),
  bayoucity: t("bayoucity", "Bayou City Barons", "BCB", "Delta League", "#9f1239", 75, 76),
  // Redrock Circuit
  summit: t("summit", "Summit State Peaks", "SSP", "Redrock Circuit", "#4f46e5", 89, 86, true),
  canyon: t("canyon", "Canyon Scorpions", "CYS", "Redrock Circuit", "#c2410c", 87, 83, true),
  desert: t("desert", "Desert Falcons", "DSF", "Redrock Circuit", "#a16207", 83, 82, true),
  pacific: t("pacific", "Pacific Titans", "PCT", "Redrock Circuit", "#0369a1", 83, 81, true),
  highdesert: t("highdesert", "High Desert Coyotes", "HDC", "Redrock Circuit", "#b45309", 79, 76),
  silverpeak: t("silverpeak", "Silver Peak Miners", "SPM", "Redrock Circuit", "#64748b", 76, 78),
  sagebrush: t("sagebrush", "Sagebrush Wranglers", "SBW", "Redrock Circuit", "#65a30d", 75, 75),
  copper: t("copper", "Copper Basin Rams", "CBR", "Redrock Circuit", "#c2410c", 77, 73),
  // Atlantic Circuit
  piedmont: t("piedmont", "Piedmont Foxes", "PDF", "Atlantic Circuit", "#b45309", 85, 84, true),
  metro: t("metro", "Metro Hawks", "MTH", "Atlantic Circuit", "#7c3aed", 85, 83, true),
  bluegrass: t("bluegrass", "Bluegrass Colonels", "BGC", "Atlantic Circuit", "#1d4ed8", 86, 87, true),
  capitol: t("capitol", "Capitol Statesmen", "CAP", "Atlantic Circuit", "#1e3a8a", 79, 80, true),
  lakeshore: t("lakeshore", "Lakeshore Lancers", "LKL", "Atlantic Circuit", "#15803d", 84, 85, true),
  blueridge: t("blueridge", "Blue Ridge Highlanders", "BRH", "Atlantic Circuit", "#0f766e", 78, 79),
  chesapeake: t("chesapeake", "Chesapeake Watermen", "CHW", "Atlantic Circuit", "#1d4ed8", 76, 77),
  seaboard: t("seaboard", "Seaboard Clippers", "SBC", "Atlantic Circuit", "#be123c", 77, 75),
  // Mesa League
  stallions: t("stallions", "Lone Star Stallions", "LSS", "Mesa League", "#c8102e", 84, 81, true),
  rangers: t("rangers", "Red River Rangers", "RRR", "Mesa League", "#b91c1c", 79, 77, true),
  prairie: t("prairie", "Prairie Bison", "PRB", "Mesa League", "#92400e", 85, 86, true),
  heartland: t("heartland", "Heartland Wolves", "HLW", "Mesa League", "#475569", 82, 83, true),
  ozark: t("ozark", "Ozark Rivermen", "OZR", "Mesa League", "#3f6212", 72, 71),
  panhandle: t("panhandle", "Panhandle Plainsmen", "PHP", "Mesa League", "#a16207", 77, 76),
  hillcountry: t("hillcountry", "Hill Country Bucks", "HCB", "Mesa League", "#7c2d12", 78, 75),
  brazos: t("brazos", "Brazos Valley Rustlers", "BVR", "Mesa League", "#991b1b", 75, 77),
  // Sun Coast Conference
  tidewater: t("tidewater", "Tidewater Admirals", "TWA", "Sun Coast Conference", "#155e75", 71, 73),
  palmetto: t("palmetto", "Palmetto Coast Pelicans", "PCP", "Sun Coast Conference", "#0284c7", 73, 70),
  emerald: t("emerald", "Emerald Coast Marlins", "ECM", "Sun Coast Conference", "#059669", 70, 71),
  lowcountry: t("lowcountry", "Low Country Egrets", "LCE", "Sun Coast Conference", "#0e7490", 68, 70),
  // Plains Athletic
  drovers: t("drovers", "Great Plains Drovers", "GPD", "Plains Athletic", "#78350f", 70, 72),
  flinthills: t("flinthills", "Flint Hills Thunder", "FHT", "Plains Athletic", "#6b21a8", 72, 69),
  sandhills: t("sandhills", "Sandhills Cranes", "SHC", "Plains Athletic", "#a3a3a3", 67, 70),
  badlands: t("badlands", "Badlands Broncs", "BDB", "Plains Athletic", "#854d0e", 69, 68),
};

/** Committee standing at the start of the save (Week 11, before games). */
export const INITIAL_STANDINGS: { id: TeamId; wins: number; losses: number; sos: number; prevRank: number }[] = [
  { id: "gulf", wins: 11, losses: 0, sos: 0.574, prevRank: 1 },
  { id: "summit", wins: 10, losses: 1, sos: 0.588, prevRank: 2 },
  { id: "bluegrass", wins: 10, losses: 1, sos: 0.561, prevRank: 4 },
  { id: "prairie", wins: 10, losses: 1, sos: 0.552, prevRank: 3 },
  { id: "canyon", wins: 10, losses: 1, sos: 0.533, prevRank: 5 },
  { id: "lakeshore", wins: 9, losses: 2, sos: 0.604, prevRank: 6 },
  { id: "piedmont", wins: 10, losses: 1, sos: 0.509, prevRank: 8 },
  { id: "metro", wins: 10, losses: 1, sos: 0.581, prevRank: 9 },
  { id: "desert", wins: 9, losses: 2, sos: 0.544, prevRank: 9 },
  { id: "bayou", wins: 9, losses: 2, sos: 0.612, prevRank: 8 },
  { id: "stallions", wins: 9, losses: 2, sos: 0.538, prevRank: 14 },
  { id: "pacific", wins: 9, losses: 2, sos: 0.569, prevRank: 11 },
  { id: "heartland", wins: 8, losses: 3, sos: 0.601, prevRank: 9 },
  { id: "capitol", wins: 9, losses: 2, sos: 0.492, prevRank: 14 },
  { id: "iron", wins: 8, losses: 3, sos: 0.557, prevRank: 17 },
  { id: "coastline", wins: 8, losses: 3, sos: 0.521, prevRank: 15 },
  { id: "rangers", wins: 7, losses: 4, sos: 0.548, prevRank: 17 },
];

/** Season 1 is the 2026 season (12-team playoff); from 2027-28 the playoff is 24 teams. */
export const PLAYOFF_FIELD = 12;
export const BYE_SEEDS = 4;
export const FIRST_WEEK = 11;
export const FINAL_WEEK = 12;

export interface Fixture {
  home: TeamId;
  away: TeamId;
  kickoff: string;
  venue?: string;
  label?: string;
}

/** Every remaining game. The user's game is the one that includes USER_TEAM. */
export const SCHEDULE: Record<number, Fixture[]> = {
  11: [
    { home: "stallions", away: "rangers", kickoff: "Sat 2:30 PM CT", venue: "Stallion Field", label: "Must-win" },
    { home: "piedmont", away: "metro", kickoff: "Sat 11:00 AM ET" },
    { home: "bayou", away: "desert", kickoff: "Sat 6:00 PM CT" },
    { home: "heartland", away: "pacific", kickoff: "Sat 2:30 PM CT" },
    { home: "gulf", away: "iron", kickoff: "Sat 7:30 PM CT" },
    { home: "summit", away: "coastline", kickoff: "Sat 9:15 PM MT" },
    { home: "canyon", away: "prairie", kickoff: "Sat 3:30 PM MT" },
    { home: "bluegrass", away: "ozark", kickoff: "Sat 12:00 PM ET" },
    { home: "capitol", away: "tidewater", kickoff: "Sat 1:00 PM ET" },
    { home: "lakeshore", away: "drovers", kickoff: "Sat 12:00 PM CT" },
  ],
  12: [
    { home: "capitol", away: "stallions", kickoff: "Sat 11:00 AM ET", venue: "Statehouse Bowl", label: "Regular-season finale" },
    { home: "gulf", away: "bluegrass", kickoff: "Sat 7:00 PM CT" },
    { home: "lakeshore", away: "summit", kickoff: "Sat 2:30 PM CT" },
    { home: "prairie", away: "piedmont", kickoff: "Sat 11:00 AM CT" },
    { home: "metro", away: "canyon", kickoff: "Sat 3:30 PM ET" },
    { home: "pacific", away: "desert", kickoff: "Sat 10:30 PM ET" },
    { home: "heartland", away: "bayou", kickoff: "Sat 6:00 PM CT" },
    { home: "coastline", away: "iron", kickoff: "Sat 12:00 PM ET" },
    { home: "rangers", away: "ozark", kickoff: "Sat 2:00 PM CT" },
  ],
};

// ---- Opponent depth charts used by the play-by-play sim (the Stallions come from roster.ts) -------------------------------

export interface Skill {
  qb: string;
  rb: string[];
  receivers: { name: string; pos: "WR" | "TE"; share: number }[];
  k: string;
  defense: { name: string; pos: string }[];
}

export const DEPTH: Partial<Record<TeamId, Skill>> = {
  rangers: {
    qb: "Bo Castillo",
    rb: ["Dante Rhodes", "Eli Swanson"],
    receivers: [
      { name: "Kelvin Moss", pos: "WR", share: 0.4 },
      { name: "Wyatt Hale", pos: "TE", share: 0.25 },
      { name: "Jordan Pike", pos: "WR", share: 0.35 },
    ],
    k: "Luke Ferris",
    defense: [
      { name: "Tobias Reyes", pos: "EDGE" },
      { name: "Manny Cortez", pos: "S" },
    ],
  },
  capitol: {
    qb: "Elliot Marsh",
    rb: ["Corey Bishop", "Davon Hart"],
    receivers: [
      { name: "Nate Aldridge", pos: "WR", share: 0.42 },
      { name: "Gavin Rowe", pos: "TE", share: 0.26 },
      { name: "Shane Kowalski", pos: "WR", share: 0.32 },
    ],
    k: "Pete Lindqvist",
    defense: [
      { name: "Marcus Fenwick", pos: "DT" },
      { name: "Andre Little", pos: "CB" },
    ],
  },
};

/** Position-group ratings shown on the matchup cards. */
export const UNITS: Partial<Record<TeamId, Record<string, { name: string; rating: number }>>> = {
  rangers: {
    QB: { name: "Bo Castillo", rating: 81 },
    RB: { name: "Dante Rhodes", rating: 82 },
    WR: { name: "Kelvin Moss", rating: 84 },
    OL: { name: "OL unit", rating: 78 },
    DL: { name: "DL unit", rating: 79 },
    EDGE: { name: "Tobias Reyes", rating: 83 },
    CB: { name: "CB unit", rating: 76 },
    LB: { name: "LB unit", rating: 77 },
  },
  capitol: {
    QB: { name: "Elliot Marsh", rating: 79 },
    RB: { name: "Corey Bishop", rating: 80 },
    WR: { name: "Nate Aldridge", rating: 83 },
    OL: { name: "OL unit", rating: 80 },
    DL: { name: "Marcus Fenwick", rating: 84 },
    EDGE: { name: "EDGE unit", rating: 78 },
    CB: { name: "Andre Little", rating: 82 },
    LB: { name: "LB unit", rating: 79 },
  },
};

/** Scouting copy for the "How they coach it" panel. */
export const SCOUTING: Partial<Record<TeamId, { scheme: string; notes: string[]; threat: string; keys: string[] }>> = {
  rangers: {
    scheme: "Air raid · aggressive",
    notes: [
      "They live on quick throws to Kelvin Moss. Castillo gets the ball out in under 2.5 seconds.",
      "Their corners play off and give up the underneath stuff. The run game can eat clock.",
      "Blitz-heavy on third down. Hot routes beat them; slow-developing plays get sacked.",
      "They are 1–3 in road-trip games after a loss — but this is a rivalry, so throw that out.",
    ],
    threat: "Kelvin Moss turns a five-yard slant into sixty. Keep a safety over the top.",
    keys: [
      "Win on the ground. Rhodes can't score from the sideline.",
      "Pressure Castillo early so he starts throwing it away.",
      "Win the turnover battle — they are −5 on the year.",
    ],
  },
  capitol: {
    scheme: "Pro-style · ball control",
    notes: [
      "They lost Jonah Prestwick to the portal. Elliot Marsh is a game manager, not a playmaker.",
      "Marcus Fenwick wrecks interior runs. Attack the edges instead.",
      "They shorten the game: long drives, few possessions, lots of punts inside the 20.",
      "Andre Little shadows the opponent's best receiver.",
    ],
    threat: "Fenwick in the backfield on early downs puts you behind the chains.",
    keys: [
      "Get the ball outside — perimeter runs and screens.",
      "Take two shots deep per half; Marsh can't keep up in a shootout.",
      "Protect the ball. They need gifts to win this one.",
    ],
  },
};

// ---- Recruiting & portal ---------------------------------------------------------

/** Season 1 "portal watch": players expected to enter the January transfer window. */
export interface PortalPlayer {
  id: string;
  name: string;
  from: string;
  stat: string;
  pos: string;
  yr: string;
  ovr: number;
  pot: number;
  ask: number; // expected asking price when the window opens
  rivals: number; // other schools expected to bid
  tag?: "HOT" | "NEW";
  note: string; // revealed by scouting
}

export const PORTAL: PortalPlayer[] = [
  { id: "vale", name: "Darius Vale", from: "Bayou Kings", stat: "3,812 yds, 28 TD", pos: "QB", yr: "Jr", ovr: 92, pot: 94, ask: 475_000, rivals: 6, tag: "HOT", note: "Elite arm, slow eyes off his first read. Wants a starting job, not money." },
  { id: "holloway", name: "Kade Holloway", from: "Heartland Wolves", stat: "11.5 sacks", pos: "EDGE", yr: "Jr", ovr: 90, pot: 91, ask: 390_000, rivals: 9, note: "Instant starter with a year left. Told teammates he's entering in January." },
  { id: "cole", name: "Miles Cole", from: "Pacific Titans", stat: "74 rec, 1,102 yds", pos: "WR", yr: "So", ovr: 88, pot: 93, ask: 310_000, rivals: 4, note: "Route technician with three years left. Family wants him closer to Texas." },
  { id: "james", name: "Tyrell James", from: "Metro Hawks", stat: "All-Circuit OT", pos: "OT", yr: "Jr", ovr: 86, pot: 88, ask: 265_000, rivals: 3, note: "Plug-and-play right tackle. Would cover Marquez's ankle long-term." },
  { id: "spillman", name: "Andre Spillman", from: "Desert Falcons", stat: "92 tkl, 2 INT", pos: "LB", yr: "Jr", ovr: 85, pot: 89, ask: 240_000, rivals: 5, note: "Downhill thumper. Struggles in space against spread teams." },
  { id: "okafor", name: "Chris Okafor", from: "Red River Rangers", stat: "1,188 rush yds", pos: "RB", yr: "So", ovr: 84, pot: 91, ask: 295_000, rivals: 7, tag: "HOT", note: "Left the Rangers in October; he'll enter as soon as the window opens. Knows their whole playbook." },
  { id: "prestwick", name: "Jonah Prestwick", from: "Capitol Statesmen", stat: "61.2% completions", pos: "QB", yr: "Jr", ovr: 83, pot: 85, ask: 180_000, rivals: 2, note: "Lost the job to Elliot Marsh. Steady backup, low ceiling, no drama." },
  { id: "mott", name: "DeShawn Mott", from: "Iron Range Forge", stat: "14.5 TFL", pos: "DT", yr: "Jr", ovr: 82, pot: 87, ask: 210_000, rivals: 4, note: "Quick first step. Needs to add 10 pounds to play every down." },
  { id: "cabrera", name: "Luis Cabrera", from: "Coastline Storm", stat: "48 rec, 612 yds", pos: "TE", yr: "Jr", ovr: 81, pot: 85, ask: 155_000, rivals: 1, note: "Reliable hands, average blocker. Low competition — good value." },
  { id: "holcombe", name: "Brett Holcombe", from: "Lakeshore Lancers", stat: "47/53 FG", pos: "K", yr: "Jr", ovr: 79, pot: 81, ask: 75_000, rivals: 0, note: "Automatic inside 45. Nobody else is calling." },
];

export const TEAM_NEEDS = ["QB", "EDGE"];
