/* Optional NAVER Maps JavaScript API configuration lives in naver-maps-config.js. */
if (window.NAVER_MAPS_CLIENT_ID && window.NAVER_MAPS_CLIENT_ID !== "YOUR_NAVER_MAPS_CLIENT_ID") {
  const naverMapsSdk = document.createElement("script");
  naverMapsSdk.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(window.NAVER_MAPS_CLIENT_ID)}`;
  naverMapsSdk.async = true;
  document.head.appendChild(naverMapsSdk);
}
function openNaverMap(name, area) {
  const query = encodeURIComponent(`${name} ${area}`);
  window.open(`https://map.naver.com/p/search/${query}`, "_blank", "noopener");
}

window.addEventListener("DOMContentLoaded", () => {
  window.render = function renderRecommendations() {
    const area = document.getElementById("area").value || "성수동";
    const menus = [...document.querySelectorAll('[data-group="menu"] .selected')].map((item) => item.textContent);
    const moods = [...document.querySelectorAll('[data-group="mood"] .selected')].map((item) => item.textContent);
    const waiting = document.querySelector('[data-group="wait"] .selected')?.textContent || "상관없어요";

    document.getElementById("summaryArea").textContent = area;
    document.getElementById("summaryWait").textContent = waiting;
    document.getElementById("summaryTaste").textContent = `${moods[0] || "캐주얼한"} ${menus[0] || "일식"}`;
    document.getElementById("cards").innerHTML = data.map((restaurant, index) => `
      <article class="restaurant">
        <div class="rank"><b>TOP ${index + 1}</b><span class="score">매칭률 ${restaurant.s}</span></div>
        <div class="info"><img class="food" src="${restaurant.img}" alt="${restaurant.n} 음식 사진"><div><div class="meta">${restaurant.c} · ${restaurant.d}</div><div class="name">${restaurant.n}</div><div class="tags"><span>${restaurant.p}</span> ★ 4.${8 - index} 리뷰 다수</div></div></div>
        <div class="reason"><strong>✓ 오늘의 조건 매칭 추천 이유</strong><ul>${restaurant.r.map((reason) => `<li>${reason}</li>`).join("")}</ul></div>
        <div class="actions"><button class="secondary" onclick="openNaverMap('${restaurant.n}', '${area}')">네이버 지도</button><button class="save" onclick="toast('‘${restaurant.n}’을 내 픽에 담았어요!')">♡ 후보로 담기</button></div>
      </article>`).join("");
  };
});
