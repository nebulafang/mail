import { BRAND_IMAGE } from "@/design-system/brand";

const CSS = `
#splash{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:var(--bg-grouped,#f2f2f7);overflow:hidden;animation:splash-out .35s cubic-bezier(.3,0,.2,1) 4s forwards;contain:strict}
#splash[data-done]{animation:splash-out .32s cubic-bezier(.3,0,.2,1) forwards}
#splash .glow{position:absolute;width:140vmax;height:140vmax;left:50%;top:50%;translate:-50% -50%;background:radial-gradient(closest-side,rgb(125 200 250/.3),rgb(150 225 210/.18) 45%,transparent 70%);animation:splash-breathe 2.4s ease-in-out infinite alternate}
#splash .stage{position:relative;display:flex;flex-direction:column;align-items:center;gap:22px}
#splash .icon{position:relative;width:96px;height:96px;animation:splash-pop .7s cubic-bezier(.34,1.56,.64,1) both}
#splash .art{width:100%;height:100%;border-radius:22.5%;box-shadow:0 12px 32px -8px rgb(70 150 230/.5),0 2px 6px rgb(0 0 0/.08);animation:splash-float 2.6s ease-in-out .7s infinite}
#splash .ring{position:absolute;inset:-10px;border-radius:30%;border:2px solid rgb(90 170 240/.5);opacity:0;animation:splash-ring 1.8s cubic-bezier(.2,.7,.3,1) .5s infinite}
#splash .mail{position:absolute;top:-6px;right:-14px;width:32px;height:24px;filter:drop-shadow(0 4px 8px rgb(0 0 0/.18));animation:splash-mail 1.8s cubic-bezier(.5,0,.3,1) .4s infinite}
#splash .name{font:600 17px/1.2 system-ui,-apple-system,"PingFang SC","Noto Sans SC",sans-serif;letter-spacing:.2px;color:var(--label,#000);opacity:0;animation:splash-fade .5s ease .25s forwards}
#splash .dots{display:flex;gap:6px;opacity:0;animation:splash-fade .4s ease .5s forwards}
#splash .dots i{width:7px;height:7px;border-radius:50%;background:var(--tint,#007aff);animation:splash-dot 1s ease-in-out infinite}
#splash .dots i:nth-child(2){animation-delay:.15s}
#splash .dots i:nth-child(3){animation-delay:.3s}
@keyframes splash-out{to{opacity:0;visibility:hidden;transform:scale(1.04)}}
@keyframes splash-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes splash-float{50%{transform:translateY(-5px)}}
@keyframes splash-ring{0%{opacity:.8;transform:scale(.85)}100%{opacity:0;transform:scale(1.35)}}
@keyframes splash-mail{0%{opacity:0;transform:translate(34px,-40px) rotate(18deg) scale(.7)}35%{opacity:1}70%{opacity:1;transform:translate(-26px,40px) rotate(-6deg) scale(.55)}100%{opacity:0;transform:translate(-30px,46px) scale(.3)}}
@keyframes splash-breathe{to{transform:scale(1.12);opacity:.75}}
@keyframes splash-fade{to{opacity:1}}
@keyframes splash-dot{0%,100%{transform:scale(.6);opacity:.35}50%{transform:scale(1);opacity:1}}
html[data-perf=low] #splash :is(.glow,.ring,.mail){display:none}
html[data-perf=low] #splash :is(.art,.dots i){animation:none}
@media (prefers-reduced-motion:reduce){#splash *{animation:none!important;opacity:1!important}#splash .mail,#splash .ring{display:none}}
`;

const MARK_SHOWN = "window.__splashAt=performance.now();";

const SKIP_WITHOUT_SAVED = `try{var l=JSON.parse(localStorage.getItem("saved-mailboxes")||"[]");if(!(Array.isArray(l)&&l.length)){var s=document.getElementById("splash");s.dataset.done="1";s.removeAttribute("aria-busy");s.style.display="none"}}catch(e){}`;

export function Splash({ skipWhenNothingSaved = false }: { skipWhenNothingSaved?: boolean }) {
  return (
    <div id="splash" role="progressbar" aria-label="正在加载临时邮箱" aria-busy="true">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <script dangerouslySetInnerHTML={{ __html: skipWhenNothingSaved ? MARK_SHOWN + SKIP_WITHOUT_SAVED : MARK_SHOWN }} />
      <div className="glow" />
      <div className="stage">
        <div className="icon">
          <span className="ring" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="art" src={BRAND_IMAGE} alt="" aria-hidden width={96} height={96} fetchPriority="high" />
          <svg className="mail" viewBox="0 0 32 24" aria-hidden>
            <rect width="32" height="24" rx="6" fill="#fff" />
            <path d="M5 6l11 8 11-8" fill="none" stroke="#4a9fe8" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="name">临时邮箱</div>
        <div className="dots">
          <i />
          <i />
          <i />
        </div>
      </div>
    </div>
  );
}
