export const SETTINGS_KEY = "display-settings";

type PerfNavigator = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

export function autoLowEnd() {
  const nav = navigator as PerfNavigator;
  const memory = nav.deviceMemory ?? 8;
  const midRangeAndroid = /Android/i.test(nav.userAgent) && memory <= 4;
  return memory <= 2 || (nav.hardwareConcurrency || 8) <= 4 || midRangeAndroid || nav.connection?.saveData === true;
}

export const perfInitScript = `(function(){try{var n=navigator,d=document.documentElement,m="system",r="system";try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SETTINGS_KEY)})).state;m=s.performanceMode||m;r=s.reduceMotion||r}catch(e){}var mem=n.deviceMemory||8;var a=mem<=2||(n.hardwareConcurrency||8)<=4||(/Android/i.test(n.userAgent)&&mem<=4)||!!(n.connection&&n.connection.saveData);var low=m==="on"||(m!=="off"&&a);if(low)d.setAttribute("data-perf","low");if(!low&&r!=="on"&&(r==="off"||!matchMedia("(prefers-reduced-motion: reduce)").matches))d.setAttribute("data-reveal","")}catch(e){}})()`;
