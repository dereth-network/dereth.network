// Names for the numbers a character profile carries. A profile gives its skills, augmentations,
// heritage and allegiance rank as numbers; these tables turn them into the names players know.

/**
 * The game's skill names by their number, as the character panels show them. The weapon skills
 * the game later folded into the weapon groups, and the few numbered skills that never shipped,
 * keep their names.
 */
export const SKILLS: Record<number, string> = {
  1: 'Axe',
  2: 'Bow',
  3: 'Crossbow',
  4: 'Dagger',
  5: 'Mace',
  6: 'Melee Defense',
  7: 'Missile Defense',
  8: 'Sling',
  9: 'Spear',
  10: 'Staff',
  11: 'Sword',
  12: 'Thrown Weapons',
  13: 'Unarmed Combat',
  14: 'Arcane Lore',
  15: 'Magic Defense',
  16: 'Mana Conversion',
  17: 'Spellcraft',
  18: 'Item Tinkering',
  19: 'Assess Person',
  20: 'Deception',
  21: 'Healing',
  22: 'Jump',
  23: 'Lockpick',
  24: 'Run',
  25: 'Awareness',
  26: 'Arms and Armor Repair',
  27: 'Assess Creature',
  28: 'Weapon Tinkering',
  29: 'Armor Tinkering',
  30: 'Magic Item Tinkering',
  31: 'Creature Enchantment',
  32: 'Item Enchantment',
  33: 'Life Magic',
  34: 'War Magic',
  35: 'Leadership',
  36: 'Loyalty',
  37: 'Fletching',
  38: 'Alchemy',
  39: 'Cooking',
  40: 'Salvaging',
  41: 'Two Handed Combat',
  42: 'Gearcraft',
  43: 'Void Magic',
  44: 'Heavy Weapons',
  45: 'Light Weapons',
  46: 'Finesse Weapons',
  47: 'Missile Weapons',
  48: 'Shield',
  49: 'Dual Wield',
  50: 'Recklessness',
  51: 'Sneak Attack',
  52: 'Dirty Fighting',
  53: 'Challenge',
  54: 'Summoning',
};

/**
 * Augmentation names by the number of the integer property the game keeps each one in, whose
 * value is how many times it was taken. Four luminance auras count past five into the Seer's
 * aura of the same kind: Valor into Destruction, Protection into Invulnerability, Glory into
 * Retribution, and Temperance into Hardening. The few with no name players use read as what
 * they change.
 */
export const AUGMENTATIONS: Record<number, string> = {
  // Innate attributes.
  218: 'Reinforcement of the Lugians',
  219: "Bleeargh's Fortitude",
  220: "Oswald's Enhancement",
  221: "Siraluun's Blessing",
  222: 'Enduring Calm',
  223: 'Steadfast Will',
  // Specialized crafting skills.
  224: "Ciandra's Essence",
  225: "Yoshi's Essence",
  226: "Jibril's Essence",
  227: "Celdiseth's Essence",
  228: "Koga's Essence",
  // Burden, death, experience, salvage, imbues, regeneration and spell duration.
  229: 'Shadow of the Seventh Mule',
  230: 'Might of the Seventh Mule',
  231: 'Clutch of the Miser',
  232: 'Enduring Enchantment',
  233: 'Critical Protection',
  234: 'Quick Learner',
  235: "Ciandra's Fortune",
  236: 'Charmed Smith',
  237: 'Innate Renewal',
  238: "Archmage's Endurance",
  // Resistances.
  240: 'Enhancement of the Blade Turner',
  241: 'Enhancement of the Arrow Turner',
  242: 'Enhancement of the Mace Turner',
  243: 'Caustic Enhancement',
  244: 'Fiery Enhancement',
  245: 'Icy Enhancement',
  246: "Storm's Enhancement",
  // Gearcraft, the magic schools without foci, criticals and the weapon skills.
  293: "Tristra's Essence",
  294: 'Infused Creature Magic',
  295: 'Infused Item Magic',
  296: 'Infused Life Magic',
  297: 'Infused War Magic',
  298: 'Eye of the Remorseless',
  299: 'Hand of the Remorseless',
  300: 'Master of the Steel Circle',
  301: 'Master of the Focused Eye',
  302: 'Master of the Five Fold Path',
  // Damage and damage resistance ratings.
  309: 'Frenzy of the Slayer',
  310: 'Iron Skin of the Invincible',
  // All skills, nether resistance and void magic without foci.
  326: 'Jack of All Trades',
  327: 'Nether Resistance',
  328: 'Infused Void Magic',
  // Bought with luminance.
  333: 'Aura of Valor',
  334: 'Aura of Protection',
  335: 'Aura of Glory',
  336: 'Aura of Temperance',
  337: 'Luminance Surge Effect Rating',
  338: 'Aura of Aetheric Vision',
  339: 'Aura of Mana Flow',
  340: 'Aura of Mana Infusion',
  341: 'Luminance Vitality',
  342: 'Aura of Purity',
  343: 'Aura of the Craftsman',
  344: 'Aura of the Specialist',
  345: 'Luminance No Destroy Craft',
  365: 'Aura of the World',
};

/** The heritage names by the game's number for each heritage. */
export const HERITAGES: Record<number, string> = {
  1: 'Aluvian',
  2: "Gharu'ndim",
  3: 'Sho',
  4: 'Viamontian',
  5: 'Umbraen',
  6: 'Gear Knight',
  7: 'Tumerok',
  8: 'Lugian',
  9: 'Empyrean',
  10: 'Penumbraen',
  11: 'Undead',
  12: 'Olthoi Soldier',
  13: 'Olthoi Spitter',
};

const ALUVIAN_MALE = [
  'Yeoman',
  'Baronet',
  'Baron',
  'Reeve',
  'Thane',
  'Ealdor',
  'Duke',
  'Aetheling',
  'King',
  'High King',
];

const ALUVIAN_FEMALE = [
  'Yeoman',
  'Baronet',
  'Baroness',
  'Reeve',
  'Thane',
  'Ealdor',
  'Duchess',
  'Aetheling',
  'Queen',
  'High Queen',
];

const GHARUNDIM_MALE = [
  'Sayyid',
  'Shayk',
  'Maulan',
  "Mu'allim",
  'Naquib',
  'Qadi',
  'Mushir',
  'Amir',
  'Malik',
  'Sultan',
];

const GHARUNDIM_FEMALE = [
  'Sayyida',
  'Shayka',
  'Maulana',
  "Mu'allima",
  'Naquiba',
  'Qadiya',
  'Mushira',
  'Amira',
  'Malika',
  'Sultana',
];

const SHO_MALE = [
  'Jinin',
  'Jo-chueh',
  'Nan-chueh',
  'Shi-chueh',
  'Ta-chueh',
  'Kun-chueh',
  'Kou',
  'Taikou',
  'Ou',
  'Koutei',
];

const SHO_FEMALE = [
  'Jinin',
  'Jo-chueh',
  'Nan-chueh',
  'Shi-chueh',
  'Ta-chueh',
  'Kun-chueh',
  'Kou',
  'Taikou',
  'Jo-ou',
  'Koutei',
];

const VIAMONTIAN_MALE = [
  'Squire',
  'Banner',
  'Baron',
  'Viscount',
  'Count',
  'Marquis',
  'Duke',
  'Grand Duke',
  'King',
  'High King',
];

const VIAMONTIAN_FEMALE = [
  'Dame',
  'Banner',
  'Baroness',
  'Viscountess',
  'Countess',
  'Marquise',
  'Duchess',
  'Grand Duchess',
  'Queen',
  'High Queen',
];

// Umbraen and Penumbraen share these.
const UMBRAEN_MALE = [
  'Tenebrous',
  'Shade',
  'Squire',
  'Knight',
  'Void Knight',
  'Void Lord',
  'Duke',
  'Archduke',
  'Highborn',
  'King',
];

const UMBRAEN_FEMALE = [
  'Tenebrous',
  'Shade',
  'Squire',
  'Knight',
  'Void Knight',
  'Void Lady',
  'Duchess',
  'Archduchess',
  'Highborn',
  'Queen',
];

const GEAR_KNIGHT = [
  'Tribunus',
  'Praefectus',
  'Optio',
  'Centurion',
  'Principes',
  'Legatus',
  'Consul',
  'Dux',
  'Secondus',
  'Primus',
];

const TUMEROK = ['Xutua', 'Tuona', 'Ona', 'Nuona', 'Turea', 'Rea', 'Nurea', 'Kauh', 'Sutah', 'Tah'];

const LUGIAN = [
  'Laigus',
  'Raigus',
  'Amploth',
  'Arintoth',
  'Obeloth',
  'Lithos',
  'Kantos',
  'Gigas',
  'Extas',
  'Tiatus',
];

const EMPYREAN_MALE = [
  'Ensign',
  'Corporal',
  'Lieutenant',
  'Commander',
  'Captain',
  'Commodore',
  'Admiral',
  'Warlord',
  'Ipharsin',
  'Aulin',
];

const EMPYREAN_FEMALE = [
  'Ensign',
  'Corporal',
  'Lieutenant',
  'Commander',
  'Captain',
  'Commodore',
  'Admiral',
  'Warlord',
  'Ipharsia',
  'Aulia',
];

const UNDEAD_MALE = [
  'Neophyte',
  'Acolyte',
  'Adept',
  'Esquire',
  'Squire',
  'Knight',
  'Count',
  'Viscount',
  'Highness',
  'Annointed',
];

const UNDEAD_FEMALE = [
  'Neophyte',
  'Acolyte',
  'Adept',
  'Esquire',
  'Squire',
  'Knight',
  'Countess',
  'Viscountess',
  'Highness',
  'Annointed',
];

/**
 * The allegiance rank titles by heritage, for each gender, rank 1 first. Umbraen and Penumbraen
 * share one table; Gear Knights, Tumeroks and Lugians have the same titles for both genders; the
 * Olthoi have none.
 */
export const RANK_TITLES: Record<number, { male: string[]; female: string[] }> = {
  1: { male: ALUVIAN_MALE, female: ALUVIAN_FEMALE },
  2: { male: GHARUNDIM_MALE, female: GHARUNDIM_FEMALE },
  3: { male: SHO_MALE, female: SHO_FEMALE },
  4: { male: VIAMONTIAN_MALE, female: VIAMONTIAN_FEMALE },
  5: { male: UMBRAEN_MALE, female: UMBRAEN_FEMALE },
  6: { male: GEAR_KNIGHT, female: GEAR_KNIGHT },
  7: { male: TUMEROK, female: TUMEROK },
  8: { male: LUGIAN, female: LUGIAN },
  9: { male: EMPYREAN_MALE, female: EMPYREAN_FEMALE },
  10: { male: UMBRAEN_MALE, female: UMBRAEN_FEMALE },
  11: { male: UNDEAD_MALE, female: UNDEAD_FEMALE },
};

/**
 * The allegiance rank title for a heritage, a gender (1 male, 2 female) and a rank (1 to 10), or
 * null where there is none: the Olthoi, any other heritage or gender, or a rank out of range.
 */
export function rankTitle(heritage: number, gender: number, rank: number): string | null {
  const titles = RANK_TITLES[heritage];
  if (!titles) return null;
  const table = gender === 1 ? titles.male : gender === 2 ? titles.female : [];
  return table[rank - 1] ?? null;
}
