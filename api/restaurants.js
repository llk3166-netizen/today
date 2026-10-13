const NAVER_API_HUB_LOCAL_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/local";
const NAVER_API_HUB_BLOG_SEARCH_URL = "https://naverapihub.apigw.ntruss.com/search/v1/blog";
const CHECKPOINT_RULES = [
  { label: "예약 필요", pattern: /예약\s*(필수|필요|권장|추천)|(?:미리|사전)\s*예약|캐치테이블|네이버\s*예약|예약제/i },
  { label: "웨이팅 가능", pattern: /웨이팅|대기\s*(?:필수|있|가능|줄)|줄\s*(?:서는|서야|서서)|오픈런/i },
  { label: "브레이크 타임", pattern: /브레이크\s*타임|휴식\s*시간/i },
  // A general "parking available" mention is not a failure-prevention signal.
  // Only show this tag when the snippet asks the visitor to check parking or
  // describes a likely parking constraint.
  { label: "주차 확인", pattern: /주차\s*(?:공간|자리|장)?\s*(?:협소|없|불가|어렵|제한)|(?:인근|근처)\s*(?:공영\s*)?주차장|공영\s*주차장|주차\s*(?:여부|정보|가능\s*여부|확인|문의)|유료\s*주차|주차\s*지원\s*(?:없|불가)/i },
  { label: "정기 휴무 확인", pattern: /정기\s*휴무|휴무일|휴무\s*(확인|주의)/i },
  { label: "영업시간 확인", pattern: /영업\s*시간|라스트\s*오더|마감\s*(시간|임박)?/i },
  { label: "포장 가능", pattern: /포장\s*(가능|주문)|테이크\s*아웃/i },
];

function cleanText(value = "") {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractCheckpoints(items = []) {
  const matches = new Set();

  for (const item of items) {
    const text = cleanText(`${item.title || ""} ${item.description || ""}`);
    for (const checkpoint of CHECKPOINT_RULES) {
      if (checkpoint.pattern.test(text)) matches.add(checkpoint.label);
    }
  }

  return CHECKPOINT_RULES
    .map((checkpoint) => checkpoint.label)
    .filter((label) => matches.has(label));
}

function naverHeaders(clientId, clientSecret) {
  return {
    Accept: "application/json",
    "X-NCP-APIGW-API-KEY-ID": clientId,
    "X-NCP-APIGW-API-KEY": clientSecret,
  };
}

async function fetchRestaurantCheckpoints({ area, name, clientId, clientSecret }) {
  try {
    const url = new URL(NAVER_API_HUB_BLOG_SEARCH_URL);
    url.searchParams.set("query", `${area} ${name}`);
    url.searchParams.set("display", "5");
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "sim");
    url.searchParams.set("format", "json");
    const response = await fetch(url, { headers: naverHeaders(clientId, clientSecret) });
    if (!response.ok) {
      console.warn(`Naver blog checkpoint search failed with status ${response.status}.`);
      return [];
    }
    const payload = await response.json();
    return extractCheckpoints(payload.items);
  } catch (error) {
    console.warn("Naver blog checkpoint search failed.", error instanceof Error ? error.message : "Unknown error");
    return [];
  }
}

function budgetRange(label) {
  const ranges = {
    "1만원 이하": { min: 0, max: 10000 },
    "1~2만원": { min: 10000, max: 20000 },
    "2~3만원": { min: 20000, max: 30000 },
    "3만원 이상": { min: 30000, max: null },
  };
  return ranges[label] || ranges["1~2만원"];
}

function sendJson(response, status, body) {
  response.status(status).json(body);
}

function sendError(response, status, code, error) {
  return sendJson(response, status, { code, error });
}

function upstreamFailure(response, status) {
  if (status === 401 || status === 403) {
    return sendError(response, 502, "NAVER_AUTH_FAILED", "네이버 검색 서비스 인증을 확인하지 못했어요.");
  }

  if (status === 429 || status >= 500) {
    return sendError(response, 503, "NAVER_TEMPORARY_ERROR", "네이버 검색 서비스가 일시적으로 응답하지 않아요. 잠시 후 다시 시도해 주세요.");
  }

  return sendError(response, 502, "NAVER_SEARCH_FAILED", "네이버 검색 결과를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.");
}

module.exports = async function restaurants(request, response) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendError(response, 405, "METHOD_NOT_ALLOWED", "GET 요청만 지원합니다.");
  }

  const area = String(request.query.area || "").trim().slice(0, 80);
  const menu = String(request.query.menu || "맛집").trim().slice(0, 80);
  const budget = String(request.query.budget || "1~2만원").trim();
  const people = Math.min(50, Math.max(1, Number.parseInt(request.query.people, 10) || 1));

  if (!area) {
    return sendError(response, 400, "INVALID_AREA", "검색할 지역을 입력해 주세요.");
  }

  // Prefer the API Hub names. The legacy names provide a migration path for
  // existing deployments whose values are already API Hub credentials.
  const clientId = process.env.NAVER_API_HUB_CLIENT_ID || process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_API_HUB_CLIENT_SECRET || process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("NAVER API HUB Search credentials are not configured.");
    return sendError(response, 500, "SERVER_CONFIGURATION_ERROR", "검색 서비스를 준비하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  try {
    const searchKeyword = `${area} ${menu} 맛집`;
    const url = new URL(NAVER_API_HUB_LOCAL_SEARCH_URL);
    url.searchParams.set("query", searchKeyword);
    url.searchParams.set("display", "5");
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "comment");
    url.searchParams.set("format", "json");
    const naverResponse = await fetch(url, {
      headers: naverHeaders(clientId, clientSecret),
    });

    if (!naverResponse.ok) {
      console.error(`Naver local search failed with status ${naverResponse.status}.`);
      return upstreamFailure(response, naverResponse.status);
    }

    const payload = await naverResponse.json();
    const range = budgetRange(budget);
    const baseResults = (payload.items || []).map((item) => {
      const name = cleanText(item.title);
      const mapSearchQuery = `${area} ${name}`;
      return {
        name,
        category: cleanText(item.category),
        address: cleanText(item.address),
        roadAddress: cleanText(item.roadAddress),
        telephone: cleanText(item.telephone),
        mapUrl: `https://map.naver.com/p/search/${encodeURIComponent(mapSearchQuery)}`,
        mapSearchQuery,
        thumbnail: null,
        priceStatus: "가격 확인 필요",
        priceNote: "네이버 지역 검색 결과에는 메뉴 가격 정보가 없어 예산 적합 여부를 확인할 수 없어요.",
      };
    });
    const results = await Promise.all(baseResults.map(async (restaurant) => ({
      ...restaurant,
      checkpoints: await fetchRestaurantCheckpoints({ area, name: restaurant.name, clientId, clientSecret }),
    })));

    return sendJson(response, 200, {
      query: { area, menu, searchKeyword, budget, people, perPersonBudget: range, totalBudget: { min: range.min * people, max: range.max === null ? null : range.max * people } },
      priceDataAvailable: false,
      results,
    });
  } catch (error) {
    console.error("Naver local search request failed.", error instanceof Error ? error.message : "Unknown error");
    return sendError(response, 503, "NAVER_NETWORK_ERROR", "네이버 검색 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
};

module.exports.extractCheckpoints = extractCheckpoints;
