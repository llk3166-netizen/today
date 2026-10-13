(() => {
  const SEARCH_STATE_KEY = "today-meal-search";

  function readSearchState() {
    try {
      return JSON.parse(sessionStorage.getItem(SEARCH_STATE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveSearchState(state) {
    try {
      sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify(state));
    } catch {
      // Search still works when session storage is unavailable.
    }
  }

  const areaInput = document.getElementById("area");
  if (areaInput && !document.getElementById("people")) {
    areaInput.closest(".field").insertAdjacentHTML(
      "afterend",
      '<div class="field"><label>몇 분이 함께 드시나요?</label><div class="search">👥 <input id="people" type="number" min="1" max="50" value="2" inputmode="numeric" aria-label="인원"></div></div>',
    );
  }

  const initialState = readSearchState();
  if (areaInput) areaInput.value = initialState.area || "";
  const peopleInput = document.getElementById("people");
  if (peopleInput && initialState.people) peopleInput.value = initialState.people;
  areaInput?.addEventListener("input", () => saveSearchState({ ...readSearchState(), area: areaInput.value.trim() }));
  peopleInput?.addEventListener("input", () => saveSearchState({ ...readSearchState(), people: peopleInput.value }));

  const budgetText = (amount) => `${new Intl.NumberFormat("ko-KR").format(amount)}원`;

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    })[character]);
  }

  function safeMapUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  }

  function selectedText(group, fallback) {
    return document.querySelector(`[data-group="${group}"] .selected`)?.textContent?.trim() || fallback;
  }

  function setCards(markup) {
    document.getElementById("cards").innerHTML = markup;
  }

  function formatBudget(range, people) {
    const perPerson = range.max === null
      ? `${budgetText(range.min)} 이상`
      : `${budgetText(range.min)} ~ ${budgetText(range.max)}`;
    const total = range.max === null
      ? `${budgetText(range.min * people)} 이상`
      : `${budgetText(range.min * people)} ~ ${budgetText(range.max * people)}`;
    return { perPerson, total };
  }

  async function renderRecommendations() {
    const area = document.getElementById("area").value.trim();
    const people = Math.min(50, Math.max(1, Number.parseInt(document.getElementById("people").value, 10) || 1));
    const menu = selectedText("menu", "맛집");
    const mood = selectedText("mood", "");
    const budget = selectedText("budget", "1~2만원");
    document.getElementById("summaryArea").textContent = area || "지역 입력 필요";
    document.getElementById("summaryWait").textContent = `${people}명 · ${budget}`;
    document.getElementById("summaryTaste").textContent = `${mood ? `${mood} ` : ""}${menu}`;

    saveSearchState({ area, people: String(people), menu, budget });

    if (!area) {
      setCards('<section class="restaurant"><strong>지역을 입력해 주세요.</strong><p class="lead" style="margin:8px 0 0">예: 성수동, 광화문, 해운대</p></section>');
      return;
    }

    setCards('<section class="restaurant" aria-live="polite"><strong>맛집을 찾고 있어요…</strong><p class="lead" style="margin:8px 0 0">네이버 지역 검색 결과를 불러오는 중입니다.</p></section>');

    try {
      const params = new URLSearchParams({ area, menu, budget, people: String(people) });
      const response = await fetch(`/api/restaurants?${params}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "검색 결과를 불러오지 못했어요.");

      const { perPerson, total } = formatBudget(payload.query.perPersonBudget, people);
      const budgetPanel = `<section class="restaurant" style="background:#fff7f7;border-color:#ffd5d7"><strong>${people}명 식사 예산</strong><p class="lead" style="margin:7px 0 0">1인 ${escapeHtml(perPerson)} · 총 ${escapeHtml(total)}</p><p class="meta" style="margin:7px 0 0">가격 정보가 없는 결과는 예산 적합 여부를 확정할 수 없어요.</p></section>`;

      if (!payload.results?.length) {
        setCards(`${budgetPanel}<section class="restaurant"><strong>조건에 맞는 식당을 찾지 못했어요.</strong><p class="lead" style="margin:8px 0 0">지역명을 조금 넓히거나 메뉴를 바꿔 다시 검색해 보세요.</p></section>`);
        return;
      }

      const cards = payload.results.map((restaurant, index) => {
        const mapUrl = safeMapUrl(restaurant.mapUrl);
        const address = restaurant.roadAddress || restaurant.address || "주소 정보 없음";
        const thumbnail = restaurant.thumbnail
          ? `<img class="food" src="${escapeHtml(restaurant.thumbnail)}" alt="${escapeHtml(restaurant.name)} 사진">`
          : '<div class="food" aria-hidden="true" style="display:grid;place-items:center;font-size:27px">🍽️</div>';
        return `<article class="restaurant"><div class="rank"><b>${index + 1}순위</b><span class="score">${escapeHtml(restaurant.priceStatus)}</span></div><div class="info">${thumbnail}<div><div class="meta">${escapeHtml(restaurant.category || "음식점")}</div><div class="name">${escapeHtml(restaurant.name)}</div><div class="tags"><span>${escapeHtml(address)}</span></div></div></div><div class="reason"><strong>검색 정보</strong><ul><li>${escapeHtml(restaurant.address || "지번 주소 정보 없음")}</li><li>${escapeHtml(restaurant.roadAddress || "도로명 주소 정보 없음")}</li><li>${escapeHtml(restaurant.telephone || "전화번호 정보 없음")}</li><li>${escapeHtml(restaurant.priceNote)}</li></ul></div><div class="actions">${mapUrl ? `<a class="save" style="display:grid;place-items:center;text-decoration:none" target="_blank" rel="noopener noreferrer" href="${escapeHtml(mapUrl)}" aria-label="${escapeHtml(restaurant.mapSearchQuery || `${area} ${restaurant.name}`)} 네이버 지도에서 보기">네이버 지도에서 보기</a>` : '<span class="secondary" style="display:grid;place-items:center;color:#69666a">지도 링크 없음</span>'}</div></article>`;
      }).join("");
      setCards(`${budgetPanel}<p class="meta" style="margin:12px 2px">네이버 지역 검색의 관련도 순서입니다. 가격 정보가 확인되는 식당이 없어서 가격 기준 정렬은 보류했어요.</p>${cards}`);
    } catch (error) {
      setCards(`<section class="restaurant"><strong>검색 결과를 불러오지 못했어요.</strong><p class="lead" style="margin:8px 0 0">${escapeHtml(error.message || "잠시 후 다시 시도해 주세요.")}</p><button class="secondary" style="margin-top:12px" type="button" onclick="render()">다시 시도</button></section>`);
    }
  }

  window.renderRecommendations = renderRecommendations;
  window.render = renderRecommendations;
  window.shuffle = renderRecommendations;
  window.go = function goToScreen(id) {
    document.querySelectorAll(".screen").forEach((screen) => screen.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
    window.scrollTo(0, 0);
    if (id === "results") renderRecommendations();
  };
})();
