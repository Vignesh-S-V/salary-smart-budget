export const MEAT_CATEGORY = "Meat & Poultry (Non-Veg)";
export const CATEGORIES = ["Groceries",MEAT_CATEGORY,"Medical","Transport","Bills","Loan","Food & Drinks","Personal Care","Shopping","Home & Essentials","Education","Entertainment","Investment & Savings","Other"];

const CATEGORY_RULES = [
 {category:"Groceries",pattern:/\b(coconut|thengai|rice|arisi|milk|paal|vegetable|vegetables|kaai|tomato|thakkali|onion|vengayam|grocery|groceries|oil|ennai|dal|dhal|paruppu|fruit|fruits|pazham|egg|eggs|bread|atta|flour|sugar|salt|masala|spice|provision|wheat|maida|curd|yogurt|butter|cheese|water can|mineral water|snacks packet|potato|urulaikizhangu|carrot|beans|keerai|banana|vazhaipazham|apple|orange|rice bag)\b/i,examples:"rice, milk, vegetables, coconut, dal"},
 {category:"Medical",pattern:/\b(tablet|tablets|medicine|medicines|medical|doctor|hospital|pharmacy|clinic|health|blood test|scan|xray|x-ray|medical shop|syrup|paracetamol|panadol|bandage|vitamin|consultation)\b/i,examples:"medicine, doctor, tablets"},
 {category:"Transport",pattern:/\b(petrol|diesel|fuel|bus|train|auto|cab|uber|ola|rapido|taxi|parking|toll|metro|travel ticket|bike service|car service|puncture|tyre|tire|petrol bunk)\b/i,examples:"petrol, bus, auto, parking"},
 {category:"Bills",pattern:/\b(eb bill|electricity|current bill|water bill|credit card bill|credit card payment|internet|wifi|broadband|recharge|rent|gas cylinder|mobile bill|phone bill|postpaid|prepaid|dth|subscription|insurance premium)\b/i,examples:"EB bill, electricity, credit card bill, recharge, rent"},
 {category:"Loan",pattern:/\b(loan|loans|emi|principal payment|loan repayment|loan installment)\b/i,examples:"personal loan, gold loan, home loan, car loan EMI"},
 {category:"Food & Drinks",pattern:/\b(hotel|restaurant|tea|coffee|snack|snacks|lunch|dinner|breakfast|juice|swiggy|zomato|food|meals|biriyani|biryani|dosa|dosai|idli|idl(i|y)|parotta|paratha|pizza|burger|bakery|cake|ice cream|icecream|tiffin|parcel food|sweets|juice shop|sappadu|saapadu|saapad|sambar|sambhar|rasam|vadai|vada|bajji|bonda|pongal|upma|chapati|chapathi|chappathi|poori|puri|vada pav|pav bhaji|puffs|bun|biscuit|milkshake|falooda|shawarma|rolls|fried rice|noodles|kothu parotta|curd rice|lemon rice|meals parcel|mess bill|canteen|tiffin kadai|tea kadai|coffee shop)\b/i,examples:"tea, meals, biryani, snacks"},
 {category:"Personal Care",pattern:/\b(hair\s*cut|haircut|hair\s*trim|barber|salon|beauty parlou?r|shave|shaving|beard trim|facial|threading|waxing|manicure|pedicure|nail salon|spa|grooming)\b/i,examples:"haircut, barber, salon, shaving, facial, grooming"},
 {category:"Shopping",pattern:/\b(shirt|shirts|dress|shoe|shoes|clothes|clothing|jeans|saree|sari|chappal|slippers|watch|bag|handbag|amazon|flipkart|myntra|online shopping|tshirt|t-shirt|uniform|belt|wallet|jewellery|jewelry|cosmetics|perfume)\b/i,examples:"shirt, shoes, clothes"},
 {category:"Home & Essentials",pattern:/\b(soap|detergent|washing powder|cleaner|bucket|utensil|vessel|broom|mop|house|home|dishwash|dish wash|toothpaste|toothbrush|shampoo|tissue|garbage bag|cleaning liquid|floor cleaner|bulb|battery|kitchen item|cooking gas stove)\b/i,examples:"soap, detergent, cleaning items"},
 {category:"Education",pattern:/\b(book|books|school|college|course|tuition|fees|school fees|college fees|notebook|pen|pencil|stationery|exam|training|class|education)\b/i,examples:"books, school fees, stationery"},
 {category:"Entertainment",pattern:/\b(movie|cinema|theatre|game|gaming|ott|netflix|prime video|hotstar|spotify|concert|outing|park ticket)\b/i,examples:"movie, OTT, games"},
 {category:"Investment & Savings",pattern:/\b(sip|s\.i\.p|crt sip|c\.r\.t\.?|mutual fund|mutual funds|stocks?|shares?|stock market|investment|investments|recurring deposit|fixed deposit|gold savings|gold scheme|chit fund|nps|ppf|elss|index fund|equity fund|mf investment|rd|fd|ppf|epf|nifty|sensex)\b/i,examples:"SIP, CRT SIP, mutual funds, stocks, savings deposits"}
];

export function categorySuggestion(item) {
 const s=item.trim().toLowerCase();
 if(!s)return {category:"",matched:false,examples:""};
 const normalized=` ${s.normalize("NFKD").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim()} `;
 const has=(phrase)=>normalized.includes(` ${phrase} `);
 const tokenPhrase=(phrases)=>phrases.some(has);

 // Strong financial intent is resolved before restaurant and general expense words.
 if(tokenPhrase(["loan","loans","emi"]) || /\b(loan|emi)\b/.test(normalized))
  return {category:"Loan",matched:true,examples:"personal loan, gold loan, home loan, car loan EMI"};
 if(tokenPhrase(["credit card bill","credit card payment","rent","electricity bill","electricity","current bill","water bill","internet bill","wifi bill","recharge","insurance premium","gas bill","mobile bill","phone bill","subscription","dth","d2h","d h tv","dish tv","tata play","sun direct","airtel digital tv","videocon d2h","tv recharge","tv bill"]) || /\b(dth|d\\s*h)\\s*(tv)?\b/.test(normalized))
  return {category:"Bills",matched:true,examples:"credit card bill, electricity, DTH/TV recharge, Tata Play, rent"};
 if(tokenPhrase(["sip","crt sip","crt","mutual fund","mutual funds","stock","stocks","share","shares","share market","stock market","investment","investments","recurring deposit","fixed deposit","gold savings","gold scheme","chit fund","nps","ppf","elss","index fund","equity fund","nifty","sensex","ppf","epf","rd","fd"]))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP, mutual funds, stocks, savings deposits"};

 // Acronym-safe fallbacks for entries typed without separators (CRT-SIP, S.I.P, RD, FD).
 const compact=normalized.replace(/\s/g,"");
 if(/(?:sip|crtsip)/.test(compact)||/\bcrtsip\b/.test(compact))
  return {category:"Investment & Savings",matched:true,examples:"SIP, CRT SIP"};

 // Prepared non-veg dishes purchased as meals stay under Food & Drinks.
 const preparedMeatDish =
  /\\b(chicken|mutton|kozhi|aadu|meat|fish|meen|prawn|shrimp|crab|nandu|squid|lobster|seafood)\\b/i.test(s) &&
  /\\b(biryani|biriyani|meal|meals|lunch|dinner|breakfast|restaurant|hotel|shawarma|gravy|curry|fry|roast|tandoori|tikka|kebab|burger|pizza|fried rice|kothu|parcel|takeaway|65)\\b/i.test(s);
 const tamilPreparedDish = ["வறுவல்","குழம்பு","பிரியாணி"].some(term=>s.includes(term));
 if(preparedMeatDish || (tamilPreparedDish && ["சிக்கன்","மட்டன்","கோழி","மீன்","இறால்","நண்டு"].some(term=>s.includes(term))))
  return {category:"Food & Drinks",matched:true,examples:"chicken biryani, mutton curry, fish fry, restaurant meals"};

 // Raw meat, poultry and seafood purchases get their own category.
 const meatPurchase =
  /\\b(chicken|mutton|kozhi|aadu|poultry|meat|fish|meen|prawn|shrimp|seafood|crab|nandu|squid|octopus|lobster|karuvadu|dried fish)\\b/i.test(s) ||
  ["சிக்கன்","மட்டன்","கோழி","ஆட்டிறைச்சி","கோழிக்கறி","ஆட்டுக்கறி","மீன்","இறால்","நண்டு","கணவாய்","கருவாடு"].some(term=>s.includes(term));
 if(meatPurchase)
  return {category:MEAT_CATEGORY,matched:true,examples:"chicken, mutton, fish, prawns, crab, seafood"};
 const rule=CATEGORY_RULES.find(x=>x.pattern.test(s));
 return rule?{category:rule.category,matched:true,examples:rule.examples}:{category:"Other",matched:false,examples:""};
}
