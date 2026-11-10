// Static world data for Portal Wars. Every team and player here is fictional.

export type TeamId =
  | "gulf" | "summit" | "bluegrass" | "prairie" | "canyon" | "lakeshore" | "piedmont"
  | "metro" | "desert" | "bayou" | "stallions" | "pacific" | "heartland" | "capitol"
  | "iron" | "coastline" | "rangers"
  | "ozark" | "tidewater" | "drovers";

export interface Team {
  id: TeamId;
  name: string;
  short: string; // 3-4 letter abbreviation used on badges
  conf: string;
  color: string; // badge color
  off: number; // offense rating, 0-100
  def: number; // defense rating, 0-100
  ranked: boolean; // part of the committee rankings table
}

export const USER_TEAM: TeamId = "stallions";

export const TEAMS: Record<TeamId, Team> = {
  gulf: { id: "gulf", name: "Gulf Coast Mariners", short: "GCM", conf: "Delta League", color: "#0e7490", off: 90, def: 88, ranked: true },
  summit: { id: "summit", name: "Summit State Peaks", short: "SSP", conf: "Redrock Circuit", color: "#4f46e5", off: 89, def: 86, ranked: true },
  bluegrass: { id: "bluegrass", name: "Bluegrass Colonels", short: "BGC", conf: "East Corridor", color: "#1d4ed8", off: 86, def: 87, ranked: true },
  prairie: { id: "prairie", name: "Prairie Bison", short: "PRB", conf: "Midwest Circuit", color: "#92400e", off: 85, def: 86, ranked: true },
  canyon: { id: "canyon", name: "Canyon Scorpions", short: "CYS", conf: "Redrock Circuit", color: "#c2410c", off: 87, def: 83, ranked: true },
  lakeshore: { id: "lakeshore", name: "Lakeshore Lancers", short: "LKL", conf: "North Circuit", color: "#15803d", off: 84, def: 85, ranked: true },
  piedmont: { id: "piedmont", name: "Piedmont Foxes", short: "PDF", conf: "Atlantic Circuit", color: "#b45309", off: 85, def: 84, ranked: true },
  metro: { id: "metro", name: "Metro Hawks", short: "MTH", conf: "Atlantic Circuit", color: "#7c3aed", off: 85, def: 83, ranked: true },
  desert: { id: "desert", name: "Desert Falcons", short: "DSF", conf: "Redrock Circuit", color: "#a16207", off: 83, def: 82, ranked: true },
  bayou: { id: "bayou", name: "Bayou Kings", short: "BYK", conf: "Delta League", color: "#6d28d9", off: 84, def: 83, ranked: true },
  stallions: { id: "stallions", name: "Lone Star Stallions", short: "LSS", conf: "Mesa League", color: "#c8102e", off: 84, def: 81, ranked: true },
  pacific: { id: "pacific", name: "Pacific Titans", short: "PCT", conf: "West Coast Alliance", color: "#0369a1", off: 83, def: 81, ranked: true },
  heartland: { id: "heartland", name: "Heartland Wolves", short: "HLW", conf: "Midwest Circuit", color: "#475569", off: 82, def: 83, ranked: true },
  capitol: { id: "capitol", name: "Capitol Statesmen", short: "CAP", conf: "East Corridor", color: "#1e3a8a", off: 79, def: 80, ranked: true },
  iron: { id: "iron", name: "Iron Range Forge", short: "IRF", conf: "North Circuit", color: "#57534e", off: 80, def: 82, ranked: true },
  coastline: { id: "coastline", name: "Coastline Storm", short: "CLS", conf: "Coastal Circuit", color: "#0891b2", off: 81, def: 79, ranked: true },
  rangers: { id: "rangers", name: "Red River Rangers", short: "RRR", conf: "Mesa League", color: "#b91c1c", off: 79, def: 77, ranked: true },
  ozark: { id: "ozark", name: "Ozark Rivermen", short: "OZR", conf: "Mesa League", color: "#3f6212", off: 72, def: 71, ranked: false },
  tidewater: { id: "tidewater", name: "Tidewater Admirals", short: "TWA", conf: "Coastal Circuit", color: "#155e75", off: 71, def: 73, ranked: false },
  drovers: { id: "drovers", name: "Great Plains Drovers", short: "GPD", conf: "Midwest Circuit", color: "#78350f", off: 70, def: 72, ranked: false },
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

export interface RookOffer {
  school: string;
  conf: string;
  offer: number;
  interest: number;
  rank: string;
  you?: boolean;
}

export const ROOK_OFFERS: RookOffer[] = [
  { school: "Bayou Kings", conf: "Delta League · conf champ", offer: 920_000, interest: 74, rank: "#4" },
  { school: "Lone Star Stallions", conf: "YOU · Mesa League", offer: 850_000, interest: 68, rank: "#11", you: true },
  { school: "Pacific Titans", conf: "West Coast Alliance", offer: 780_000, interest: 51, rank: "#9" },
  { school: "Heartland Wolves", conf: "Midwest Circuit", offer: 640_000, interest: 33, rank: "#18" },
  { school: "Metro Hawks", conf: "Atlantic Circuit", offer: 510_000, interest: 22, rank: "#7" },
];

export const ROOK_ASK = 1_100_000;

export interface PortalPlayer {
  id: string;
  name: string;
  from: string;
  stat: string;
  pos: string;
  yr: string;
  ovr: number;
  pot: number;
  ask: number;
  rivals: number; // other schools bidding
  tag?: "HOT" | "NEW";
  biddable: boolean; // shortlisted players can be bid on without scouting
  note: string; // revealed by scouting
}

export const PORTAL: PortalPlayer[] = [
  { id: "vale", name: "Darius Vale", from: "Bayou Kings", stat: "3,812 yds, 28 TD", pos: "QB", yr: "Jr", ovr: 92, pot: 94, ask: 475_000, rivals: 6, tag: "HOT", biddable: true, note: "Elite arm, slow eyes off his first read. Wants a starting job, not money." },
  { id: "holloway", name: "Kade Holloway", from: "Heartland Wolves", stat: "11.5 sacks", pos: "EDGE", yr: "Sr", ovr: 90, pot: 90, ask: 390_000, rivals: 9, biddable: true, note: "Instant starter. One year left — a rental, but a great one." },
  { id: "cole", name: "Miles Cole", from: "Pacific Titans", stat: "74 rec, 1,102 yds", pos: "WR", yr: "So", ovr: 88, pot: 93, ask: 310_000, rivals: 4, biddable: false, note: "Route technician with three years left. Family wants him closer to Texas." },
  { id: "james", name: "Tyrell James", from: "Metro Hawks", stat: "All-Circuit OT", pos: "OT", yr: "Jr", ovr: 86, pot: 88, ask: 265_000, rivals: 3, biddable: false, note: "Plug-and-play right tackle. Would cover Marquez's ankle long-term." },
  { id: "spillman", name: "Andre Spillman", from: "Desert Falcons", stat: "92 tkl, 2 INT", pos: "LB", yr: "Jr", ovr: 85, pot: 89, ask: 240_000, rivals: 5, biddable: false, note: "Downhill thumper. Struggles in space against spread teams." },
  { id: "okafor", name: "Chris Okafor", from: "Red River Rangers", stat: "1,188 rush yds", pos: "RB", yr: "So", ovr: 84, pot: 91, ask: 295_000, rivals: 7, biddable: true, note: "Left the Rangers mid-season. Knows their whole playbook." },
  { id: "prestwick", name: "Jonah Prestwick", from: "Capitol Statesmen", stat: "61.2% completions", pos: "QB", yr: "Sr", ovr: 83, pot: 83, ask: 180_000, rivals: 2, biddable: false, note: "Steady backup with one year left. Low ceiling, no drama." },
  { id: "mott", name: "DeShawn Mott", from: "Iron Range Forge", stat: "14.5 TFL", pos: "DT", yr: "Jr", ovr: 82, pot: 87, ask: 210_000, rivals: 4, biddable: false, note: "Quick first step. Needs to add 10 pounds to play every down." },
  { id: "cabrera", name: "Luis Cabrera", from: "Coastline Storm", stat: "48 rec, 612 yds", pos: "TE", yr: "Jr", ovr: 81, pot: 85, ask: 155_000, rivals: 1, biddable: false, note: "Reliable hands, average blocker. Low competition — good value." },
  { id: "holcombe", name: "Brett Holcombe", from: "Northwoods", stat: "47/53 FG", pos: "K", yr: "Sr", ovr: 79, pot: 79, ask: 75_000, rivals: 0, biddable: false, note: "Automatic inside 45. Nobody else is calling." },
];

export const ROOK_PORTAL: PortalPlayer = {
  id: "rook", name: "Jalen Rook", from: "Austin Prep (TX)", stat: "5-star dual-threat", pos: "QB", yr: "HS", ovr: 96, pot: 98, ask: ROOK_ASK, rivals: 4, tag: "NEW", biddable: true,
  note: "Still wants the $1.1M. Bayou is circling, but he told the wire he'd listen to a matching number.",
};

export const TEAM_NEEDS = ["QB", "EDGE"];
