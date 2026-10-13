# Google Places + Gemini 설정

새 Vercel 프로젝트 `today-meal-pick-google`의 **Production**과 **Preview** 환경에 아래 값을 Secret으로 등록하세요.

| 이름 | 용도 |
| --- | --- |
| `GOOGLE_PLACES_API_KEY` | Google Maps Platform에서 발급한 Places API (New) 서버 키 |
| `GEMINI_API_KEY` | Google AI Studio에서 발급한 Gemini API 키 |
| `GEMINI_MODEL` | 선택 항목. 기본값은 `gemini-2.5-flash` |

두 키 모두 브라우저에 노출하지 마세요. 이 프로젝트는 Vercel의 `/api/restaurants` 서버 함수만 키를 사용합니다.

Google Cloud에서는 결제 계정을 연결하고 **Places API (New)** 를 활성화해야 합니다. `GOOGLE_PLACES_API_KEY`는 API 제한을 적용해 **Places API (New)** 만 허용하는 것을 권장합니다. Gemini API 키는 Google AI Studio에서 생성합니다.

Google Places API는 실제 대기 시간을 보장하지 않습니다. 화면의 대기 정보는 가져온 리뷰에 명시된 대기 언급만 Gemini가 요약하며, 근거가 없으면 확인 불가로 표시합니다.
