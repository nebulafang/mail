export const THEME_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const themeInitScript = `(function(){try{var p=localStorage.getItem(${JSON.stringify(THEME_KEY)});var d=p==="dark"||(p!=="light"&&matchMedia(${JSON.stringify(DARK_QUERY)}).matches);var h=document.documentElement;h.classList.toggle("dark",d);h.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
