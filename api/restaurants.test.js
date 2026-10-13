const assert = require("node:assert/strict");
const test = require("node:test");

process.env.NAVER_SEARCH_CLIENT_ID = "test-client-id";
process.env.NAVER_SEARCH_CLIENT_SECRET = "test-client-secret";

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
    fetchRequests.push({ url, options });
    return typeof response === "function" ? response(url, options) : response;
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
  assert.deepEqual(response.body.results[0].checkpoints, ["예약 필요", "브레이크 타임", "주차 확인"]);
  assert.equal(response.body.query.searchKeyword, "성수동 일식 맛집");
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
