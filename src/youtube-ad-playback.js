(function () {
  const supportedDomains = ['youtube.com', 'youtube-nocookie.com'];
  const hostname = location.hostname.toLowerCase().replace(/^\.+|\.+$/g, '');
  const isSupportedHost = supportedDomains.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
  );
  if (!isSupportedHost || window.__astraYouTubeAdPlaybackInstalled) return;
  window.__astraYouTubeAdPlaybackInstalled = true;

  const targetPlaybackRate = 8;
  let adIsActive = false;
  let contentPlaybackRate = 1;
  let contentDefaultPlaybackRate = 1;
  let adVideo = null;

  const currentVideo = () =>
    document.querySelector('.html5-main-video') || document.querySelector('video');
  const playerShowsAd = () => {
    const player = document.getElementById('movie_player') ||
      document.querySelector('.html5-video-player');
    return Boolean(player && (
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting')
    ));
  };
  const validRate = (value, fallback) =>
    Number.isFinite(value) && value > 0 ? value : fallback;
  const setRate = (video, playbackRate, defaultPlaybackRate = playbackRate) => {
    if (!video) return;
    if (video.defaultPlaybackRate !== defaultPlaybackRate) {
      video.defaultPlaybackRate = defaultPlaybackRate;
    }
    if (video.playbackRate !== playbackRate) video.playbackRate = playbackRate;
  };
  const updatePlaybackRate = () => {
    const video = currentVideo();
    const showingAd = playerShowsAd();

    if (showingAd) {
      if (!adIsActive) {
        contentPlaybackRate = validRate(video?.playbackRate, contentPlaybackRate);
        contentDefaultPlaybackRate = validRate(
          video?.defaultPlaybackRate,
          contentDefaultPlaybackRate
        );
      }
      adIsActive = true;
      adVideo = video;
      setRate(video, targetPlaybackRate);
      return;
    }

    if (adIsActive) {
      adIsActive = false;
      setRate(video || adVideo, contentPlaybackRate, contentDefaultPlaybackRate);
      adVideo = null;
      return;
    }

    if (video) {
      contentPlaybackRate = validRate(video.playbackRate, contentPlaybackRate);
      contentDefaultPlaybackRate = validRate(
        video.defaultPlaybackRate,
        contentDefaultPlaybackRate
      );
    }
  };
  const start = () => {
    document.addEventListener('ratechange', updatePlaybackRate, true);
    document.addEventListener('playing', updatePlaybackRate, true);
    document.addEventListener('loadedmetadata', updatePlaybackRate, true);
    document.addEventListener('visibilitychange', updatePlaybackRate, true);
    new MutationObserver(updatePlaybackRate).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'src']
    });
    window.setInterval(updatePlaybackRate, 250);
    updatePlaybackRate();
  };
  if (document.documentElement) start();
  else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
