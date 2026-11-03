# Default search provider

The main process owns address interpretation and validates saved provider identifiers against src/search-engines.json. The renderer reads the same catalog for Settings. Address-bar text that is not accepted as an HTTP(S) URL becomes an encoded query for the chosen provider. New tabs use that provider's homepage. Explicit website URLs keep the existing navigation behavior. The default remains Google when no valid preference exists.

Settings offers Google, Bing, Baidu, DuckDuckGo, Yahoo, Yandex, Brave Search, Ecosia, Qwant, Startpage, Sogou, 360 Search, Naver, Yahoo Japan and Daum. Saving persists the selection in the existing settings file and does not navigate an already open page. Queries go only to the selected provider; there is no background fan-out to other engines. Availability, verification requirements and account restrictions are controlled by each provider.
