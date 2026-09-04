#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const TITLE_FIXES = {
  "arijit-singh-news.html": "अरिजीत सिंह ने प्लेबैक सिंगिंग कहा अलविदा",
  "bollywood/ranbir-kapoor-mulshi-property-investment.html": "रणबीर कपूर: मुळशीत १६ कोटींची जमीन खरेदी",
  "bollywood/vijay-sangeetha-divorce-court-hearing.html": "विजय-संगीता तलाक: अदालत में सुनवाई",
  "Career/ssb-constable-bharti-2026.html": "SSB Constable Bharti 2026: 827 पदांसाठी अर्ज",
  "Cricket/india-vs-zimbabwe-super8-t20-world-cup.html": "IND vs ZIM Super 8: India Wins by 72 Runs",
  "Current-Affairs/july-august-2025-current-affairs.html": "जुलै-ऑगस्ट २०२५ चालू घडामोडी",
  "Current-Affairs/spardha-pariksha-current-affairs-september-2025.html": "सप्टेंबर २०२५ स्पर्धा परीक्षा चालू घडामोडी",
  "ind-vs-nz-result.html": "IND vs NZ 3rd ODI: न्यूज़ीलैंड ने रचा इतिहास",
  "Latest/Instagram-bbc-child-safety-investigation.html": "इंस्टाग्रामवर बाल सुरक्षा: बीबीसी तपासणी",
  "Music/arijit-singh-retirement-news.html": "Arijit Singh ki Awaaz Hamesha Goonjegi",
  "ott-jan.html": "OTT धमाका: 20-30 जनवरी रिलीज",
  "panchayat-season-5-update.html": "Panchayat Season 5: कब लौटेगी फुलेरा?",
  "pickleball-league-sonyliv.html": "Pickleball League: Sony LIV बना पार्टनर",
  "post-radhika-apte.html": "राधिका आप्टे: इंडस्ट्री में सेक्सिज़्म",
  "rcb-wpl-win.html": "RCB Women: लगातार 5वीं जीत",
  "Review/the-bluff-movie-review.html": "The Bluff Movie Review: Hit or Miss?",
  "robin-kaye-news.html": "Robin Kaye: American Idol सुपरवाइजर का अंत",
  "seema-sajdeh-divorce-news.html": "सीमा सजदेह: सोहेल खान से क्यों टूटा रिश्ता",
  "shreyas-iyer-back.html": "Shreyas Iyer & Bishnoi: T20 में वापसी",
  "tvk-election-symbol.html": "TVK को मिला 'सीटी' चुनाव चिन्ह",
  "web-series/accused-netflix-review.html": "Accused Netflix Review: क्या देखने लायक है?",
};

const DESC_FIXES = {
  "bollywood/ranbir-kapoor-mulshi-property-investment.html": "रणबीर कपूरने मुळशीत १६.४२ कोटींना जमीन खरेदी केली. अमिताभ, कार्तिक, क्रिती यांच्या रिअल इस्टेट रिपोर्ट.",
  "bollywood/vijay-sangeetha-divorce-court-hearing.html": "थलपति विजय और संगीता का तलाक 20 अप्रैल को अदालत में. TVK राजनीति और जन नायकन सेंसर विवाद.",
  "Current-Affairs/spardha-pariksha-current-affairs-september-2025.html": "सप्टेंबर २०२५ चालू घडामोडी: RRB, SSC, MPSC, UPSC स्पर्धा परीक्षांसाठी महत्त्वाच्या मुद्दे.",
  "Latest/Instagram-bbc-child-safety-investigation.html": "बीबीसी तपासणीत इंस्टाग्रामवर बाल अत्याचाराशी जाहिराती. मेटा आणि टेलिग्रामची भूमिका, पालकांसाठी सुरक्षा उपाय.",
  "web-series/accused-netflix-review.html": "Accused Netflix: क्या यह क्राइम थ्रिलर देखने लायक है? पूरी समीक्षा, कास्ट और स्टोरी एनालिसिस.",
};

function fixTitles() {
  for (const [relPath, newTitle] of Object.entries(TITLE_FIXES)) {
    const filePath = path.join(ROOT, relPath);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${relPath} not found`);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf-8");
    const oldTitleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (!oldTitleMatch) {
      console.log(`  SKIP: ${relPath} no <title> found`);
      continue;
    }
    const oldTitle = oldTitleMatch[1];
    if (oldTitle === newTitle) {
      console.log(`  OK: ${relPath}`);
      continue;
    }
    const fullTitle = newTitle + " – SnapAura";
    html = html.replace(/<title>[^<]+<\/title>/i, `<title>${fullTitle}</title>`);
    fs.writeFileSync(filePath, html, "utf-8");
    console.log(`  FIXED: ${relPath} (${oldTitle.length} -> ${fullTitle.length} chars)`);
  }
}

function fixDescriptions() {
  for (const [relPath, newDesc] of Object.entries(DESC_FIXES)) {
    const filePath = path.join(ROOT, relPath);
    if (!fs.existsSync(filePath)) {
      console.log(`  SKIP: ${relPath} not found`);
      continue;
    }
    let html = fs.readFileSync(filePath, "utf-8");
    const oldDescMatch = html.match(/<meta\s+name="description"\s+content="([^"]*)"/i);
    if (!oldDescMatch) {
      console.log(`  SKIP: ${relPath} no meta description`);
      continue;
    }
    const oldDesc = oldDescMatch[1];
    if (oldDesc === newDesc) {
      console.log(`  OK: ${relPath}`);
      continue;
    }
    html = html.replace(
      new RegExp(`<meta\\s+name="description"\\s+content="[^"]*"`, "i"),
      `<meta name="description" content="${newDesc}"`
    );
    if (html.includes('og:description')) {
      html = html.replace(
        new RegExp(`<meta\\s+property="og:description"\\s+content="[^"]*"`, "i"),
        `<meta property="og:description" content="${newDesc}"`
      );
    }
    fs.writeFileSync(filePath, html, "utf-8");
    console.log(`  FIXED: ${relPath} (${oldDesc.length} -> ${newDesc.length} chars)`);
  }
}

console.log("\n=== FIXING TITLES ===\n");
fixTitles();

console.log("\n=== FIXING META DESCRIPTIONS ===\n");
fixDescriptions();

console.log("\n=== DONE ===");
