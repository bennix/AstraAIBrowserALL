const languageLink = document.querySelector('#language');
const requestedLanguage = new URLSearchParams(location.search).get('lang');

async function showChinese() {
  const response = await fetch('i18n/zh.json?v=0.1.15');
  if (!response.ok) return;
  const copy = await response.json();
  for (const element of document.querySelectorAll('[data-copy]')) {
    element.textContent = copy[element.dataset.copy];
  }
  for (const element of document.querySelectorAll('[data-label]')) {
    element.setAttribute('aria-label', copy[element.dataset.label]);
  }
  document.documentElement.lang = 'zh-CN';
  document.title = copy.title;
  languageLink.href = '?lang=en';
  languageLink.textContent = 'English';
  languageLink.lang = 'en';
  languageLink.hreflang = 'en';
}

if (requestedLanguage !== 'en') {
  showChinese().catch(console.error);
}
