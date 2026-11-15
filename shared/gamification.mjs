// Server-authoritative economy. The user delegated these modest defaults
// and currency retirement; the chosen Seeds conversion is 1:1. Changes increment the configuration ID.
export const GAMIFICATION_CONFIG = Object.freeze({
  version: 2, id: 'economy-cosmetic-purchases-v2', approvalStatus: 'approved',
  legacyConversion: { policyId: 'seeds-to-coins-1-to-1-v1', coinsPerSeed: 1 },
  foodCost: 5, xpPerLevel: 100, initialFullness: 75, fullnessMaximum: 100,
  fullnessDecayPerHour: 0.25, careEnabledByDefault: false,
  rewards: Object.freeze({
    daily_practice: { coins: 2, xp: 15, dailyCap: 1 },
    read_aloud: { coins: 3, xp: 0, dailyCap: 1 },
    ai_debate: { coins: 3, xp: 15, dailyCap: 2 },
    read_reflect: { coins: 3, xp: 15, dailyCap: 1 },
    vocabulary_review: { coins: 0, xp: 5, dailyCap: 1 },
  }),
  streakMilestones: Object.freeze([{ days: 3, coins: 2, xp: 0 }, { days: 7, coins: 5, xp: 10 }]),
  cosmeticPrices: Object.freeze({
    hair: [null, null, null], hat: [120, 180, 240], top: [null, 160, 220],
    jacket: [null, 280, 400], bottom: [null, 180, 240], shoes: [null, 200, 280],
    accessory: [140, 300, 360],
  }),
});

export const FOODS = Object.freeze([
  { id: 'ramen', name: 'Ramen', cost: 5, fullness: 30, animation: 'eat', assetRef: 'ramen' },
  { id: 'onigiri', name: 'Onigiri', cost: 5, fullness: 20, animation: 'eatOnigiri', assetRef: 'onigiri' },
  { id: 'bento', name: 'Bento', cost: 5, fullness: 35, animation: 'eatBento', assetRef: 'bento' },
]);

export const AVATAR_PALETTES = Object.freeze({
  skin: ['porcelain', 'peach', 'honey', 'tan', 'deep'],
  hairColor: ['espresso', 'black', 'chestnut', 'ginger', 'honey', 'ash', 'cocoa'],
  eyeColor: ['cocoa', 'hazel', 'slate'],
});
export const EQUIPMENT_CATEGORIES = Object.freeze(['hair', 'hat', 'top', 'jacket', 'bottom', 'shoes', 'accessory']);
export const OPTIONAL_EQUIPMENT = Object.freeze(['hat', 'jacket', 'accessory']);
const designs = {
  boy: {
    hair: [['sweep','Side sweep'],['curls','Short curls'],['curtains','Curtain cut']],
    hat: [['field-cap','Field cap'],['rib-beanie','Ribbed beanie'],['canvas-bucket','Canvas bucket']],
    top: [['everyday-tee','Everyday tee'],['sage-polo','Sage polo'],['stripe-knit','Stripe knit']],
    jacket: [['city-overshirt','City overshirt'],['weekend-bomber','Weekend bomber'],['slate-denim','Slate denim jacket']],
    bottom: [['school-trousers','School Trousers'],['cargo-pants','Cargo Pants'],['blue-jeans','Blue Jeans']],
    shoes: [['white-sneakers','White Sneakers'],['brown-boots','Brown Boots'],['black-loafers','Black Loafers']],
    accessory: [['square-glasses','Square glasses'],['studio-headphones','Studio headphones'],['canvas-messenger','Canvas messenger']],
  },
  girl: {
    hair: [['waves','Soft waves'],['bob','Classic bob'],['ponytail','High ponytail']],
    hat: [['wool-beret','Wool beret'],['newsboy-cap','Newsboy cap'],['ribbon-sunhat','Ribbon sunhat']],
    top: [['cotton-tee','Cotton tee'],['sage-blouse','Sage blouse'],['oat-rib-knit','Oat rib knit']],
    jacket: [['tailored-blazer','Tailored blazer'],['soft-cardigan','Soft cardigan'],['sage-cropped','Sage cropped jacket']],
    bottom: [['wide-trousers','Wide Trousers'],['blue-jeans','Blue Jeans'],['pleated-skirt','Pleated Skirt']],
    shoes: [['chunky-sneakers','Chunky Sneakers'],['penny-loafers','Penny Loafers'],['ankle-boots','Ankle Boots']],
    accessory: [['round-glasses','Round glasses'],['slim-headphones','Slim headphones'],['mini-crossbody','Mini crossbody']],
  },
};
function rule(category, index) {
  if (category === 'hair' || index === 0 && !['hat', 'accessory'].includes(category))
    return { type: 'starter', metric: 'starter', target: 0, description: 'Available from the start' };
  const metric = category === 'hat' ? 'reflections' : index === 2 && ['jacket','accessory'].includes(category) ? 'debateWins'
    : category === 'accessory' || category === 'jacket' || index === 2 ? 'debates' : 'reflections';
  const target = category === 'hat' ? [1, 3, 7][index] : metric === 'debateWins' ? 1 : category === 'accessory' ? [1, 3, 1][index] : 2;
  const label = metric === 'reflections' ? 'Read & Reflect completions' : metric === 'debateWins' ? 'AI Debate win' : 'AI Debate completions';
  return { type: 'activity', metric, target, description: `Complete ${target} eligible ${label}` };
}
export const ITEM_CATALOG = Object.freeze(Object.entries(designs).flatMap(([collection, categories]) =>
  Object.entries(categories).flatMap(([category, items]) => items.map(([slug, name], index) => {
    const itemId = `${collection}-${category}-${slug}`;
    const price = GAMIFICATION_CONFIG.cosmeticPrices[category][index];
    return Object.freeze({ id: itemId, itemId, name, category, collection, index,
      assetRef: `illustrated-v2/${collection}/${category}/${itemId}`, layer: category,
      unlockRule: rule(category, index), price, purchasable: price !== null });
  }))));

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-practice', title: 'A first step', description: 'Complete one Daily Practice.', metric: 'practices', target: 1 },
  { id: 'ten-practices', title: 'Finding your rhythm', description: 'Complete ten Daily Practices.', metric: 'practices', target: 10 },
  { id: 'first-reflection', title: 'Another perspective', description: 'Complete one Read & Reflect.', metric: 'reflections', target: 1 },
  { id: 'first-debate', title: 'Make your case', description: 'Complete one AI Debate.', metric: 'debates', target: 1 },
  { id: 'first-debate-win', title: 'A reasoned argument', description: 'Earn one AI Debate win.', metric: 'debateWins', target: 1 },
  { id: 'streak-3', title: 'Three days of learning', description: 'Learn on three consecutive calendar days.', metric: 'longestStreak', target: 3 },
  { id: 'streak-7', title: 'A week of learning', description: 'Learn on seven consecutive calendar days.', metric: 'longestStreak', target: 7 },
]);

export function defaultEquipment(collection = 'girl') {
  const result = { collection, skin: 'peach', hairColor: 'espresso', eyeColor: 'cocoa' };
  for (const category of EQUIPMENT_CATEGORIES)
    result[category] = ['hat','accessory'].includes(category) ? null : ITEM_CATALOG.find(item => item.collection === collection && item.category === category).itemId;
  return result;
}
export function levelProgress(xp) {
  const required = GAMIFICATION_CONFIG.xpPerLevel;
  return { level: Math.floor(xp / required) + 1, current: xp % required, required };
}
