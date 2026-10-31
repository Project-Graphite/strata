const merchantCategories: [string, RegExp][] = [
  ['groceries', /instashop|breadfast|talabat mart|carrefour|spinneys|seoudi|kazyon|metro market|gourmet|rabbit|hyper ?one|oscar|kheir zaman|supermarket|grocer|سوبر ?ماركت|بقال/i],
  ['subscriptions', /google one|icloud|cloudflare|ovh|openrouter|anthropic|openai|chatgpt|github|stability|digitalocean|netflix|spotify|anghami|shahid|osn|watch ?it|youtube|discord|prime/i],
  ['eating out', /talabat|elmenus|mcdonald|\bkfc\b|pizza|papa john|domino|hardee|burger|starbucks|costa|cilantro|sushi|momochi|bazooka|kitch|restaurant|\bres\b|cafe|café|coffee|bakery|grill|shawarma|koshary|foods?\b|مطعم|كافيه|مقهى/i],
  ['transport', /\buber\b|didi|careem|indrive|swvl|\bbolt\b|taxi|wataniya|chillout|emarat misr|misr petroleum|totalenergies|\bmobil\b|\bshell\b|parking|بنزين|وقود/i],
  ['utilities', /vodafone|orange|etisalat|\bwe\b|telecom egypt|recharge|top ?up|electric|internet|كهرباء|غاز|مياه/i],
  ['entertainment', /\bvox\b|cinema|netflix|spotify|anghami|shahid|\bosn\b|youtube|discord|steam|valve|playstation|\bpsn\b|xbox|microsoft (?:pc|store)|tiktok|gamers|\bgame/i],
  ['shopping', /amazon|\bnoon\b|jumia|ikea|h&m|zara|samsung|b\.tech|\braya\b|\bshein\b|\btemu\b/i],
  ['health', /phar|صيدلي|ezaby|clinic|hospital|\blab\b|\bdent|\bscan|\bdr\b|doctor|medical|عيادة|مستشفى/i],
  ['travel', /egyptair|booking\.com|airbnb|hotel|expedia|skyscanner|flydubai|air arabia|فندق/i],
  ['education', /udemy|coursera|school|university|academy|مدرسة|جامعة/i],
];

export const guessCategory = (merchant: string, categories: { name: string }[]) =>
  merchantCategories.find(([name, pattern]) => pattern.test(merchant) && categories.some((category) => category.name === name))?.[0] ?? null;
