(()=>{
 const isX=['x.com','twitter.com'].some(d=>location.hostname===d||location.hostname.endsWith('.'+d));
 const mediaElements=[...document.querySelectorAll('video,audio')];
 const candidates=mediaElements.map(media=>{
  const rect=media.getBoundingClientRect();
  const visible=rect.width>0&&rect.height>0&&rect.bottom>0&&rect.top<innerHeight;
  const article=media.closest('article');
  const link=article&&[...article.querySelectorAll('a[href]')].find(a=>a.querySelector('time')&&/\/status\/\d+/.test(a.pathname));
  const url=isX?(link?.href||(/\/status\/\d+/.test(location.pathname)?location.href:null)):location.href;
  const siblings=mediaElements.filter(element=>element.closest('article')===article);
  const mediaIndex=siblings.indexOf(media);
  const mediaId=isX?(/\/(?:ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/(\d+)/.exec(media.poster||'')?.[1]||null):null;
  const title=article?.querySelector('[data-testid="tweetText"]')?.innerText?.slice(0,140)||document.title;
  return {url,title,mediaId,mediaIndex,mediaCount:siblings.length,
   playing:!media.paused&&!media.ended,visible,width:media.videoWidth||0,height:media.videoHeight||0,
   duration:Number.isFinite(media.duration)?media.duration:null,
   score:(visible?100:0)+(!media.paused?1000:0)-Math.abs(rect.top+rect.height/2-innerHeight/2)/1000};
 }).filter(c=>c.url).sort((a,b)=>b.score-a.score);
 return candidates.filter((c,i)=>candidates.findIndex(x=>
  x.url===c.url&&(isX?(c.mediaId?x.mediaId===c.mediaId:x.mediaIndex===c.mediaIndex):true))===i);
})()
