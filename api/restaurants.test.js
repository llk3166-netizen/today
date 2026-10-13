const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NAVER_SEARCH_CLIENT_ID = "test-client-id";
process.env.NAVER_SEARCH_CLIENT_SECRET = "test-client-secret";
process.env.GOOGLE_PLACES_API_KEY = "test-google-places-key";
process.env.GEMINI_API_KEY = "test-gemini-key";
process.env.GEMINI_MODEL = "gemini-2.5-flash";

const restaurants = require("./restaurants");

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function withMockedFetch(response, callback) {
  const originalFetch = global.fetch;
  const fetchRequests = [];
  global.fetch = async (url, options) => {
    const requestUrl = url instanceof URL ? url : new URL(url);
    fetchRequests.push({ url: requestUrl, options });
    return typeof response === "function" ? response(requestUrl, options) : response;
  };
  try {
    await callback(() => fetchRequests);
  } finally {
    global.fetch = originalFetch;
  }
}

function request(query = {}) {
  return { method: "GET", query: { area: "성수동", menu: "일식", budget: "1~2만원", people: "2", ...query } };
}

test("returns normalized restaurants through the server endpoint", async () => {
  const response = createResponse();
  await withMockedFetch((url) => ({
    ok: true,
    json: async () => url.pathname === "/search/v1/local"
      ? { items: [{ title: "<b>성수</b> 식당", category: "음식점>일식", address: "서울 성동구 성수동", roadAddress: "서울 성동구 성수이로 1", telephone: "02-1234-5678" }] }
      : url.pathname === "/search/v1/image"
        ? { items: [{ thumbnail: "https://images.example.com/restaurant.jpg" }] }
        : url.origin === "https://places.googleapis.com"
          ? { places: [{ displayName: { text: "성수 식당" }, priceLevel: "PRICE_LEVEL_MODERATE" }] }
          : url.origin === "https://generativelanguage.googleapis.com"
            ? { candidates: [{ content: { parts: [{ text: JSON.stringify({ recommendations: [{ name: "성수 식당", reasons: ["성수동 일식 조건 후보예요.", "음식점 분류로 확인됐어요.", "Google 가격: 중간이에요.", "예약 필요 정보를 확인해 보세요."] }] }) }] } }] }
            : { items: [{ title: "성수 식당", description: "캐치테이블 예약 필수, 브레이크 타임과 주차 가능 여부를 확인하세요." }] },
  }), async (getFetchRequests) => {
    await restaurants(request(), response);
    const fetchRequest = getFetchRequests().find((item) => item.url.pathname === "/search/v1/local");
    assert.equal(fetchRequest.url.origin, "https://naverapihub.apigw.ntruss.com");
    assert.equal(fetchRequest.url.pathname, "/search/v1/local");
    assert.equal(fetchRequest.url.searchParams.get("display"), "5");
    assert.equal(fetchRequest.options.headers.Accept, "application/json");
    assert.equal(fetchRequest.options.headers["X-NCP-APIGW-API-KEY-ID"], "test-client-id");
    assert.equal(fetchRequest.options.headers["X-NCP-APIGW-API-KEY"], "test-client-secret");
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.results[0].name, "성수 식당");
  assert.equal(response.body.results[0].thumbnail, "https://images.example.com/restaurant.jpg");
  assert.equal(response.body.results[0].googlePriceLevel, "PRICE_LEVEL_MODERATE");
  assert.equal(response.body.results[0].priceStatus, "Google 가격: 중간");
  assert.deepEqual(response.body.results[0].checkpoints, ["예약 필요", "브레이크 타임", "주차 확인"]);
  assert.equal(response.body.results[0].geminiReasons.length, 4);
  assert.equal(response.body.query.searchKeyword, "성수동 일식 맛집");
});

test("falls back to fact-based reasons when Gemini returns too few lines", () => {
  const reasons = restaurants.parseGeminiRecommendations(JSON.stringify({
    recommendations: [{ name: "성수 식당", reasons: ["한 줄뿐이에요."] }],
  }), [{ name: "성수 식당", category: "일식", priceStatus: "Google 가격: 중간", checkpoints: [] }], "성수동", "일식");

  assert.equal(reasons.get("성수 식당").length, 4);
});

test("matches Gemini recommendations when the restaurant name spacing differs", () => {
  const reasons = restaurants.parseGeminiRecommendations(JSON.stringify({
    recommendations: [{ name: "성수식당", reasons: ["하나", "둘", "셋", "넷"] }],
  }), [{ name: "성수 식당", category: "일식", priceStatus: "Google 가격: 중간", checkpoints: [] }], "성수동", "일식");

  assert.deepEqual(reasons.get("성수 식당"), ["하나", "둘", "셋", "넷"]);
});

test("keeps only Google Places price levels that match the selected budget", async () => {
  const response = createResponse();
  await withMockedFetch((url, options) => ({
    ok: true,
    json: async () => url.pathname === "/search/v1/local"
      ? { items: [
        { title: "저가 식당", category: "음식점", address: "성수동" },
        { title: "고가 식당", category: "음식점", address: "성수동" },
      ] }
      : url.origin === "https://places.googleapis.com"
        ? (() => {
          const name = JSON.parse(options.body).textQuery.includes("저가 식당") ? "저가 식당" : "고가 식당";
          const priceLevel = name === "저가 식당" ? "PRICE_LEVEL_INEXPENSIVE" : "PRICE_LEVEL_EXPENSIVE";
          return { places: [{ displayName: { text: name }, priceLevel }] };
        })()
        : { items: [] },
  }), async () => {
    await restaurants(request({ budget: "1만원 이하" }), response);
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.results.length, 1);
  assert.equal(response.body.results[0].name, "저가 식당");
  assert.equal(response.body.priceFilter.matchedCount, 1);
});

test("extracts only failure-prevention checkpoints from Naver search mentions", () => {
  const checkpoints = restaurants.extractCheckpoints([
    { title: "미쁘동 성수", description: "웨이팅이 있고 정기 휴무일과 라스트 오더를 확인하세요. 브레이크 타임은 15:00~17:00이며 주차 공간이 협소해 인근 공영주차장을 이용했어요." },
    { title: "성수 미쁘동", description: "포장 주문도 가능합니다. 주차장이 넓어요." },
  ]);

  assert.deepEqual(checkpoints, ["웨이팅 가능", "브레이크 타임 (15:00~17:00)", "주차 확인", "정기 휴무 확인", "영업시간 확인", "포장 가능"]);
});

test("does not treat a simple parking-available mention as a checkpoint", () => {
  assert.deepEqual(restaurants.extractCheckpoints([
    { title: "성수 식당", description: "주차장이 넓고 주차가 가능합니다." },
  ]), []);
});

test("maps Naver authentication errors to a safe client error", async () => {
  const response = createResponse();
  await withMockedFetch({ ok: false, status: 401 }, () => restaurants(request(), response));

  assert.equal(response.statusCode, 502);
  assert.equal(response.body.code, "NAVER_AUTH_FAILED");
  assert.match(response.body.error, /인증/);
});

test("maps temporary Naver failures to a retryable error", async () => {
  const response = createResponse();
  await withMockedFetch({ ok: false, status: 429 }, () => restaurants(request(), response));

  assert.equal(response.statusCode, 503);
  assert.equal(response.body.code, "NAVER_TEMPORARY_ERROR");
});
