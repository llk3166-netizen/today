const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

function cleanText(value) {
  return String(value ?? "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function cleanList(value, limit = 3) {
  return String(value ?? "").split(",").map((item) => cleanText(item).slice(0, 30)).filter(Boolean).slice(0, limit);
}

function searchMenuName(menu) {
  return menu.replace("고기/구이", "고기").replace("면/국밥", "국밥").replace("카페/브런치", "브런치");
}

function priceLabel(priceLevel, priceRange) {
  if (priceRange?.startPrice?.units || priceRange?.endPrice?.units) {
    const start = Number(priceRange.startPrice?.units ?? 0).toLocaleString("ko-KR");
    const end = Number(priceRange.endPrice?.units ?? 0).toLocaleString("ko-KR");
    return start && end ? `${start}~${end}원대` : `${start || end}원대`;
  }
  return { PRICE_LEVEL_INEXPENSIVE: "저렴한 편", PRICE_LEVEL_MODERATE: "보통 가격대", PRICE_LEVEL_EXPENSIVE: "높은 가격대", PRICE_LEVEL_VERY_EXPENSIVE: "매우 높은 가격대" }[priceLevel] || "가격 정보 확인 필요";
}

function compactReviews(reviews) {
  return (reviews ?? []).slice(0, 3).map((review) => cleanText(review.text?.text || review.originalText?.text).slice(0, 280)).filter(Boolean);
}

function fallbackInsight(place) {
  const summary = cleanText(place.generativeSummary?.overview || place.editorialSummary?.text);
  return { reason: summary || "선택한 지역과 메뉴 조건에 맞는 Google Places 검색 결과예요.", mainMenu: summary || cleanText(place.primaryTypeDisplayName?.text) || "Google 지도에서 메뉴 확인", waiting: "리뷰에서 대기 정보 확인 불가" };
}

async function generateInsights(restaurants, conditions, apiKey) {
  if (!apiKey || !restaurants.length) return restaurants.map((restaurant) => fallbackInsight(restaurant.source));
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const prompt = [
    "당신은 맛집 추천 도우미입니다. 아래 Google Places 데이터만 근거로 각 식당을 한국어로 요약하세요.",
    "반드시 JSON 배열만 반환하세요. 각 요소는 reason, mainMenu, waiting 키를 가져야 합니다.",
    "reason은 45자 이내로, 선택 조건과 연결된 추천 이유입니다.",
    "mainMenu는 요약/리뷰에 실제 언급된 대표 메뉴나 특징만 35자 이내로 쓰고, 없으면 'Google 지도에서 메뉴 확인'으로 쓰세요.",
    "waiting은 리뷰에 대기·줄·웨이팅이 명시된 경우에만 35자 이내로 요약하고, 아니면 정확히 '리뷰에서 대기 정보 확인 불가'로 쓰세요.",
    "추측하거나 실제 영업·대기 상태를 단정하지 마세요.",
    `선택 조건: 지역=${conditions.area}, 메뉴=${conditions.menus.join(", ")}, 분위기=${conditions.moods.join(", ") || "상관없음"}, 예산=${conditions.budget}, 목적=${conditions.purpose}`,
    `식당 데이터: ${JSON.stringify(restaurants.map((restaurant) => ({ name: restaurant.name, types: restaurant.types, summary: restaurant.summary, reviews: restaurant.reviews })))}`,
  ].join("\n");
  try {
    const response = await fetch(`${GEMINI_API_BASE_URL}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.2 } }),
    });
    if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    const insights = JSON.parse(text);
    if (!Array.isArray(insights)) throw new Error("Gemini response was not an array");
    return restaurants.map((restaurant, index) => ({ ...fallbackInsight(restaurant.source), ...(insights[index] || {}) }));
  } catch (error) {
    console.warn("Gemini recommendation summary unavailable", { message: error.message });
    return restaurants.map((restaurant) => fallbackInsight(restaurant.source));
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const area = cleanText(req.query.area).slice(0, 50);
  const menus = cleanList(req.query.menus || req.query.menu);
  const moods = cleanList(req.query.moods);
  const budget = cleanText(req.query.budget).slice(0, 30);
  const purpose = cleanText(req.query.purpose).slice(0, 30);
  const waiting = cleanText(req.query.waiting).slice(0, 30);
  const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;
  if (!area) return res.status(400).json({ error: "지역을 입력해 주세요." });
  if (!placesApiKey) { console.error("GOOGLE_PLACES_API_KEY is not configured."); return res.status(503).json({ error: "Google Places 검색 설정을 준비 중이에요." }); }
  const conditions = { area, menus: menus.length ? menus : ["맛집"], moods, budget, purpose, waiting };
  try {
    const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Goog-Api-Key": placesApiKey,
        "X-Goog-FieldMask": ["places.id", "places.displayName", "places.formattedAddress", "places.location", "places.googleMapsUri", "places.primaryTypeDisplayName", "places.types", "places.priceLevel", "places.priceRange", "places.rating", "places.userRatingCount", "places.currentOpeningHours", "places.generativeSummary", "places.editorialSummary", "places.reviews"].join(","),
      },
      body: JSON.stringify({ textQuery: `${area} ${conditions.menus.map(searchMenuName).join(" 또는 ")} 음식점`, languageCode: "ko", maxResultCount: 8 }),
    });
    if (!response.ok) { const errorPayload = await response.text(); throw new Error(`Google Places Text Search failed: ${response.status} ${errorPayload.slice(0, 240)}`); }
    const places = (await response.json()).places ?? [];
    const normalized = places.filter((place) => place.displayName?.text && place.location).slice(0, 3).map((place) => ({
      source: place, name: cleanText(place.displayName?.text), category: cleanText(place.primaryTypeDisplayName?.text) || "음식점", address: cleanText(place.formattedAddress), latitude: place.location.latitude, longitude: place.location.longitude,
      googleMapsUri: place.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.displayName?.text} ${place.formattedAddress || area}`)}`,
      rating: place.rating ?? null, userRatingCount: place.userRatingCount ?? null, price: priceLabel(place.priceLevel, place.priceRange), openNow: place.currentOpeningHours?.openNow,
      summary: cleanText(place.generativeSummary?.overview || place.editorialSummary?.text), types: place.types ?? [], reviews: compactReviews(place.reviews),
    }));
    const insights = await generateInsights(normalized, conditions, geminiApiKey);
    const restaurants = normalized.map(({ source, summary, types, reviews, ...restaurant }, index) => ({ ...restaurant, ...insights[index] }));
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ area, conditions, restaurants, sources: { places: "Google Places API (New)", gemini: Boolean(geminiApiKey) } });
  } catch (error) {
    console.error("Google Places request failed", { message: error.message, area, menus: conditions.menus });
    return res.status(502).json({ error: "Google Places에서 식당 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요." });
  }
};
