import { useState, useEffect, useRef, useCallback } from "react";
import { CatIcons, NavIcons, GovNavIcons, MinistryIcons, MiscIcons, iconSize, iconSizeSm, iconSizeLg } from "./components/Icons";

/* ═══════════════════════════════════════ DATA ═══════════════════════════════════════ */
const CATS = {
  road: { l: "Yo'l", c: "#F59E0B" },
  school: { l: "Maktab", c: "#8B5CF6" },
  hospital: { l: "Tibbiyot", c: "#EF4444" },
  water: { l: "Suv", c: "#3B82F6" },
  electricity: { l: "Elektr", c: "#F59E0B" },
  gas: { l: "Gaz", c: "#EF4444" },
  park: { l: "Park", c: "#22C55E" },
};
const ST = {
  open: { l: "Ochiq", c: "#DC2626", bg: "#FEE2E2" },
  in_progress: { l: "Jarayonda", c: "#2563EB", bg: "#EFF6FF" },
  resolved: { l: "Hal qilindi", c: "#059669", bg: "#D1FAE5" },
};

const DEFAULT_REGION = "Toshkent shahri";
const KNOWN_REGIONS = [
  "Qoraqalpog'iston Resp.",
  "Andijon viloyati",
  "Buxoro viloyati",
  "Jizzax viloyati",
  "Qashqadaryo viloyati",
  "Navoiy viloyati",
  "Namangan viloyati",
  "Samarqand viloyati",
  "Surxondaryo viloyati",
  "Sirdaryo viloyati",
  "Toshkent viloyati",
  "Farg'ona viloyati",
  "Xorazm viloyati",
  "Toshkent shahri",
];

const MAP_STYLES = {
  standard: {
    label: "Oddiy",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: { attribution: "&copy; OpenStreetMap contributors", maxZoom: 19 },
  },
  satellite: {
    label: "Satel",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    options: { attribution: "Tiles &copy; Esri", maxZoom: 19 },
  },
  dark: {
    label: "Tungi",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    options: {
      attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
      maxZoom: 20,
      subdomains: "abcd",
    },
  },
};
const MAP_STYLE_KEYS = ["standard", "satellite", "dark"];

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api").replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "holat_access_token";
const USER_STORAGE_KEY = "holat_user";

function safeStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

function safeStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

async function apiRequest(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }

  if (!res.ok) {
    const rawMessage = data?.message;
    const message = Array.isArray(rawMessage)
      ? rawMessage.join(", ")
      : rawMessage || `Request failed (${res.status})`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }

  return data;
}

function toAbsoluteMediaUrl(url) {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function normalizeRegionStats(payload) {
  return extractItems(payload).map((item) => {
    const resolutionRate = Number(item.resolutionRate ?? 0);
    const isi = Number.isFinite(resolutionRate) ? Math.max(0, Math.min(100, Math.round(resolutionRate))) : 0;
    return {
      name: item.region || "Noma'lum hudud",
      isi,
      trend: "+0",
      open: Number(item.openIssues ?? 0),
      prog: Number(item.inProgressIssues ?? 0),
      res: Number(item.resolvedIssues ?? 0),
      time: "-",
      pop: null,
    };
  });
}

function normalizeMinistryStats(payload) {
  return extractItems(payload).map((item) => ({
    key: item.key || "unknown",
    name: item.name || "Vazirlik",
    cats: Array.isArray(item.categories) ? item.categories : [],
    openIssues: Number(item.openIssues ?? 0),
    resolvedIssues: Number(item.resolvedIssues ?? 0),
    conflictIssues: Number(item.conflictIssues ?? 0),
  }));
}

function formatCount(value) {
  const count = Number(value ?? 0);
  if (!Number.isFinite(count)) return "0";
  return new Intl.NumberFormat("uz-UZ").format(count);
}

function toClientUser(apiUser, stats = {}) {
  const role = apiUser?.role === "admin" ? "gov" : apiUser?.role;
  return {
    role: role || "citizen",
    name: apiUser?.fullName || "Foydalanuvchi",
    ministry: apiUser?.ministryName || null,
    minKey: apiUser?.ministryKey || null,
    region: apiUser?.region || "Toshkent shahri",
    reports: stats.reports ?? 0,
    votes: stats.votes ?? 0,
    verifications: stats.verifications ?? 0,
    pinfl: apiUser?.pinfl || null,
  };
}

function normalizeIssue(issue) {
  return {
    id: String(issue.id),
    cat: issue.cat || issue.category || "road",
    title: issue.title || "",
    desc: issue.desc || issue.description || "",
    lat: typeof issue.lat === "number" ? issue.lat : null,
    lng: typeof issue.lng === "number" ? issue.lng : null,
    status: issue.status || "open",
    priority: issue.priority || "medium",
    region: issue.region || "Toshkent shahri",
    votes: Number(issue.votes ?? issue.upvoteCount ?? 0),
    voted: Boolean(issue.voted),
    time: issue.time || "Hozirgina",
    gc: issue.gc
      ? {
          t: issue.gc.t || issue.gc.statement || "",
          org: issue.gc.org || issue.gc.organization || "",
          date: issue.gc.date || issue.gc.claimDate || "",
        }
      : null,
    con: Number(issue.con ?? issue.confirmCount ?? 0),
    dis: Number(issue.dis ?? issue.disputeCount ?? 0),
    mv: issue.mv || null,
    mine: Boolean(issue.mine),
    image: toAbsoluteMediaUrl(issue.image || issue.imageUrl || null),
  };
}

function mergeIssueFlags(nextIssues, prevIssues) {
  const prevMap = new Map(prevIssues.map((issue) => [String(issue.id), issue]));
  return nextIssues.map((issue) => {
    const prev = prevMap.get(String(issue.id));
    if (!prev) return issue;

    return {
      ...issue,
      voted: prev.voted || issue.voted,
      mv: prev.mv ?? issue.mv,
      mine: prev.mine || issue.mine,
      image: prev.image || issue.image,
    };
  });
}

function setMapBaseLayer(map, styleKey, layerRef) {
  if (!map || !window.L) return;
  const style = MAP_STYLES[styleKey] || MAP_STYLES.standard;

  if (layerRef.current) {
    map.removeLayer(layerRef.current);
  }

  const layer = window.L.tileLayer(style.url, style.options);
  layer.addTo(map);
  layerRef.current = layer;
}

/* ═══════════════════════════════════════ CSS (dark theme — theme.css asas) ═══════════════════════════════════════ */
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
.fi-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.fi-pinfl{letter-spacing:2px;font-weight:600;font-size:14px}
.ms-lbl{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:8px}
.min-cat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:8px}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.ah{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;flex-shrink:0;z-index:200}
.cit-ah{background:linear-gradient(90deg,var(--p2),var(--p));color:#fff;box-shadow:0 4px 20px rgba(99,102,241,.3)}
.gov-ah{background:linear-gradient(90deg,#047857,var(--g));color:#fff;box-shadow:0 4px 20px rgba(16,185,129,.3)}
.ah-logo{display:flex;align-items:center;gap:12px;font-size:20px;font-weight:800}
.ah-mark{width:40px;height:40px;border-radius:10px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;font-size:20px}
.ah-right{display:flex;align-items:center;gap:8px}
.live-pill{background:var(--r);color:#fff;font-size:12px;font-weight:800;padding:5px 12px;border-radius:10px;animation:blink 2s infinite;letter-spacing:.5px}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.65}}
.ah-avatar{width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800}
.ah-uname{font-size:15px;font-weight:600}
.logout-btn{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;padding:8px 14px;border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s}
.logout-btn:hover{background:rgba(255,255,255,.22)}
.cit-body{flex:1;display:flex;overflow:hidden;position:relative;background:linear-gradient(135deg,#0a0a0f 0%,#0f0f1a 30%,#0a1628 60%,#0f0f1a 100%);background-size:400% 400%;animation:bodyBgFlow 20s ease infinite}
@keyframes bodyBgFlow{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}
.cit-bnav{display:flex;border-top:1px solid var(--border);background:var(--card);flex-shrink:0}
.bnav-btn{flex:1;padding:14px 8px 12px;text-align:center;font-size:14px;font-weight:700;color:var(--muted);cursor:pointer;border:none;background:transparent;transition:all .3s cubic-bezier(0.22,1,0.36,1);display:flex;flex-direction:column;align-items:center;gap:4px}
.bnav-btn .ni{font-size:28px;transition:transform .3s cubic-bezier(0.22,1,0.36,1)}
.bnav-btn.on{color:var(--p)}
.bnav-btn.on .ni{transform:scale(1.12)}
.bnav-btn:hover:not(.on){color:var(--txt-muted)}
.bnav-btn:hover .ni{transform:scale(1.05)}
.ah-burger{display:none;align-items:center;justify-content:center;width:44px;height:44px;border:none;background:rgba(255,255,255,.15);border-radius:10px;cursor:pointer;color:#fff;flex-shrink:0}
.ah-burger:hover{background:rgba(255,255,255,.25)}
.ah-right-desktop{display:flex}
.burger-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);z-index:300;opacity:0;visibility:hidden;transition:.25s}
.burger-overlay.open{opacity:1;visibility:visible}
.burger-drawer{position:fixed;top:0;right:0;bottom:0;width:min(300px,85vw);background:var(--card);border-left:1px solid var(--border);z-index:301;transform:translateX(100%);transition:transform .3s cubic-bezier(0.22,1,0.36,1);box-shadow:-8px 0 32px rgba(0,0,0,.4);display:flex;flex-direction:column;padding:24px 20px}
.burger-overlay.open .burger-drawer{transform:translateX(0)}
.burger-drawer-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid var(--border)}
.burger-drawer-title{font-size:16px;font-weight:800}
.burger-drawer .ah-avatar{margin:0 auto 12px}
.burger-drawer .ah-uname{display:block;text-align:center;font-size:15px;margin-bottom:16px;color:var(--txt)}
.burger-drawer .live-pill{margin:0 auto 16px}
.burger-drawer .logout-btn{width:100%;justify-content:center}
.cview{display:none;flex:1;overflow:hidden}
.cview.on{display:flex;animation:viewFadeSlide .4s cubic-bezier(0.22,1,0.36,1) forwards;position:relative}
.cview.on::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(99,102,241,.06) 0%,transparent 35%,rgba(16,185,129,.05) 65%,rgba(139,92,246,.03) 100%);background-size:300% 300%;animation:viewBgFlow 16s ease-in-out infinite;pointer-events:none;z-index:0}
.cview.on>*{position:relative;z-index:1}
#cv-map{flex-direction:row}
#cMap{flex:1;min-width:0}
.map-panel{width:460px;min-width:420px;max-width:560px;background:var(--card);border-left:1px solid var(--border);display:flex;flex-direction:column;flex-shrink:0}
.mp-head{padding:22px 24px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg-elevated)}
.mp-title{font-size:22px;font-weight:800;color:var(--txt);margin-bottom:4px}
.mp-subtitle{font-size:16px;color:var(--muted);margin-bottom:18px;line-height:1.4}
.mp-search-wrap{position:relative;margin-bottom:12px}
.mp-si{position:absolute;left:14px;top:50%;transform:translateY(-50%);display:flex;align-items:center;justify-content:center;color:var(--muted)}
.mp-si-inp{width:100%;padding:14px 18px 14px 48px;border:1.5px solid var(--border);border-radius:12px;font-size:17px;background:var(--card);color:var(--txt);transition:.2s}
.mp-si-inp::placeholder{color:var(--muted)}
.mp-si-inp:focus{outline:none;border-color:var(--p);box-shadow:0 0 0 2px var(--p3)}
.mp-filters-lbl{font-size:14px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px}
.mp-filters{display:flex;flex-wrap:wrap;gap:8px}
.mpf{padding:12px 18px;border-radius:10px;border:1.5px solid var(--border);font-size:15px;font-weight:700;color:var(--txt-muted);background:var(--card);cursor:pointer;transition:.2s;font-family:inherit}
.mpf:hover{border-color:var(--p);color:var(--p);background:var(--p3)}
.mpf.on{background:var(--p);color:#fff;border-color:var(--p)}
.mp-list{overflow-y:auto;flex:1;padding:20px 24px;display:flex;flex-direction:column;gap:16px;min-height:0}
.mp-list-section{font-size:15px;font-weight:700;color:var(--muted);margin-bottom:8px;text-transform:uppercase}
@keyframes cardIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
.ic{border:1.5px solid var(--border);border-radius:14px;padding:20px;cursor:pointer;transition:.25s;background:var(--card);animation:cardIn .3s ease-out}
.ic:hover{border-color:var(--p);box-shadow:0 4px 16px rgba(99,102,241,.12);transform:translateY(-2px)}
.ic.sel{border-color:var(--p);box-shadow:0 0 0 2px var(--p3)}
.ic-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:10px}
.cpill{font-size:14px;font-weight:700;padding:6px 14px;border-radius:10px;display:inline-flex;align-items:center;gap:6px}
.sbadge{font-size:13px;font-weight:700;padding:6px 12px;border-radius:8px}
.ic-title{font-size:18px;font-weight:700;margin-bottom:6px;line-height:1.4;color:var(--txt)}
.ic-loc{font-size:15px;color:var(--txt-muted);margin-bottom:10px}
.gov-mini{background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(16,185,129,.08));border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:8px}
.gm-lbl{font-size:14px;font-weight:800;color:var(--p);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}
.gov-mini .gov-mini-text{font-size:12px;line-height:1.45}
.conf-bar{height:6px;border-radius:4px;display:flex;overflow:hidden;margin:6px 0 4px}
.cb-g{background:var(--g);transition:flex .5s}
.cb-r{background:var(--r);transition:flex .5s}
.ic-bottom{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;padding-top:8px;border-top:1px solid var(--border)}
.vb{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:12px;font-size:15px;font-weight:700;border:1.5px solid;cursor:pointer;transition:.25s cubic-bezier(0.4,0,0.2,1)}
.vb:hover{transform:scale(1.02)}
.vb.up{border-color:var(--p);color:var(--p);background:transparent}
.vb.up:hover,.vb.up.on{background:var(--p3)}
.vb.ok{border-color:var(--g);color:var(--g);background:transparent}
.vb.ok:hover,.vb.ok.on{background:var(--g3)}
.vb.no{border-color:var(--r);color:var(--r);background:transparent}
.vb.no:hover,.vb.no.on{background:var(--r2)}
.mstat-ov{position:absolute;top:14px;left:14px;z-index:400;background:rgba(22,22,31,.95);border:1px solid var(--border);border-radius:10px;padding:8px 14px;backdrop-filter:blur(8px);color:var(--txt);max-width:340px}
.mso-row{display:flex;gap:16px;flex-wrap:wrap}
.mso{text-align:center;min-width:56px}
.mso-n{font-size:16px;font-weight:800}
.mso-l{font-size:11px;color:var(--txt-muted);text-transform:uppercase;margin-top:1px}
.map-leg{position:absolute;bottom:18px;left:14px;z-index:400;background:rgba(22,22,31,.95);border:1px solid var(--border);border-radius:10px;padding:10px 14px;backdrop-filter:blur(8px);color:var(--txt)}
.map-leg .leg-title{font-size:12px;font-weight:800;margin-bottom:8px;text-transform:uppercase;color:var(--txt-muted)}
.leg-r{display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:13px}
.leg-r:last-child{margin-bottom:0}
.leg-d{width:10px;height:10px;border-radius:50%;border:2px solid rgba(255,255,255,.2);flex-shrink:0}
.map-wrap{position:relative;flex:1;min-width:0}
.map-fab-col{position:absolute;top:14px;right:14px;z-index:420;display:flex;flex-direction:column;gap:10px}
.map-fab-col .fab{position:static;top:auto;right:auto;margin:0;width:52px;height:52px;font-size:20px}
.map-fab-col .gps-fab{width:50px;height:50px}
.map-style-switch{position:absolute;top:14px;right:76px;z-index:430;display:flex;gap:6px;padding:4px;border:1px solid var(--border);border-radius:12px;background:rgba(15,23,42,.92);backdrop-filter:blur(8px)}
.map-style-switch.gov{right:14px}
.map-style-btn{border:1px solid transparent;background:rgba(255,255,255,.05);color:var(--txt-muted);font-size:12px;font-weight:700;padding:8px 10px;border-radius:8px;cursor:pointer;line-height:1;transition:.2s}
.map-style-btn:hover{background:rgba(255,255,255,.12);color:var(--txt)}
.map-style-btn.on{background:var(--p);border-color:var(--p);color:#fff}
.map-style-switch.gov .map-style-btn.on{background:var(--g);border-color:var(--g)}
.fab{position:absolute;top:80px;right:500px;z-index:400;background:var(--p);color:#fff;width:56px;height:56px;border-radius:50%;border:none;font-size:22px;box-shadow:0 4px 18px rgba(22,65,200,.4);cursor:pointer;display:flex;align-items:center;justify-content:center;animation:fabIn .4s cubic-bezier(0.22,1,0.36,1) forwards, fabPulse 2.5s ease-in-out infinite;transition:transform .2s, background .2s}
.fab:hover{background:var(--p2);transform:scale(1.1)}
.gps-fab{top:148px;right:500px;background:#0EA5E9;box-shadow:0 4px 18px rgba(14,165,233,.4)}
.gps-fab:hover{background:#0284C7}
@keyframes fabIn{0%{opacity:0;transform:scale(0.5) translateY(12px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes fabPulse{0%,100%{box-shadow:0 4px 18px rgba(22,65,200,.4),0 0 0 0 rgba(99,102,241,.4)}50%{box-shadow:0 4px 24px rgba(22,65,200,.5),0 0 0 12px rgba(99,102,241,0)}}
@keyframes mpulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.5)}50%{box-shadow:0 0 0 9px rgba(220,38,38,0)}}
.mpulse{animation:mpulse 2s infinite}
.scroll-view{overflow-y:auto;padding:14px;flex:1;flex-direction:column}
#cv-regions{flex-direction:column}
.regions-wrap{display:flex;flex:1;overflow:hidden;gap:0}
.uzmap-panel{width:420px;flex-shrink:0;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;padding:14px;overflow-y:auto}
.uzmap-title{font-size:13px;font-weight:800;margin-bottom:4px}
.uzmap-sub{font-size:11px;color:var(--muted);margin-bottom:12px}
.uzmap-svg-wrap{border-radius:12px;overflow:hidden;background:linear-gradient(135deg,rgba(99,102,241,.1),rgba(16,185,129,.08));border:1px solid var(--border);padding:10px}
svg.uzmap{width:100%;height:auto;cursor:pointer}
svg.uzmap .region{transition:.2s;cursor:pointer;stroke:#fff;stroke-width:1.5}
svg.uzmap .region:hover{opacity:.8;stroke-width:2.5;stroke:#1641C8}
svg.uzmap .region.sel-reg{stroke:#1641C8!important;stroke-width:3!important}
svg.uzmap .rlabel{font-size:7px;font-weight:700;fill:#fff;pointer-events:none;text-anchor:middle}
.map-legend-isi{display:flex;gap:6px;margin-top:10px;font-size:14px;align-items:center;flex-wrap:wrap}
.mli{display:flex;align-items:center;gap:4px}
.mli-dot{width:12px;height:12px;border-radius:3px}
.regions-list-panel{flex:1;overflow-y:auto;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
.rgn-card{background:var(--card);border:1.5px solid var(--border);border-radius:16px;padding:24px 26px;cursor:pointer;transition:.25s}
.rgn-card:hover{border-color:var(--p);box-shadow:0 6px 20px rgba(99,102,241,.15)}
.rgn-card.sel-reg{border-color:var(--p);box-shadow:0 0 0 2px var(--p3)}
.rgn-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.rgn-name{font-size:18px;font-weight:800}
.rgn-rank{font-size:12px;color:var(--muted)}
.isi-score{font-size:36px;font-weight:800;text-align:right}
.isi-trend{font-size:11px;font-weight:700;text-align:right}
.isi-bar-bg{height:8px;border-radius:4px;background:var(--bg-elevated);overflow:hidden;margin-bottom:10px}
.isi-bar-fill{height:100%;border-radius:4px;transition:width 1s}
.rgn-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.rs{background:var(--bg-elevated);border-radius:10px;padding:10px 8px;text-align:center}
.rs-n{font-size:22px;font-weight:800}
.rs-l{font-size:11px;color:var(--muted)}
.mr-card{background:var(--card);border:1.5px solid var(--border);border-radius:16px;padding:22px 24px;margin-bottom:16px;transition:.25s}
.mr-card:hover{border-color:var(--p);box-shadow:0 4px 16px rgba(99,102,241,.12)}
.timeline-mini{margin-top:8px;padding-top:8px;border-top:1px solid var(--border)}
.tm-item{display:flex;gap:8px;margin-bottom:4px;position:relative}
.tm-item:last-child{margin-bottom:0}
.tm-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px}
.tm-line::before{content:'';position:absolute;left:3px;top:14px;bottom:0;width:1px;background:var(--border)}
.tm-line:last-child::before{display:none}
.pf-card{background:var(--card);border:1.5px solid var(--border);border-radius:16px;padding:24px;margin-bottom:18px}
.pf-hero{text-align:center;padding-bottom:12px;border-bottom:1px solid var(--border);margin-bottom:12px}
.pf-av{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 10px;color:#fff}
.pf-name{font-size:20px;font-weight:800}
.pf-meta{font-size:16px;color:var(--muted);margin-top:4px}
.pf-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.pfs{background:var(--bg-elevated);border-radius:8px;padding:8px 4px;text-align:center}
.pfs-n{font-size:24px;font-weight:800;color:var(--p)}
.pfs-l{font-size:15px;color:var(--muted)}
.setting-row{display:flex;justify-content:space-between;align-items:center;padding:14px 0;border-bottom:1px solid var(--border);font-size:17px}
.setting-row:last-child{border:none}
.toggle{width:40px;height:22px;border-radius:11px;background:var(--border);border:none;cursor:pointer;position:relative;transition:.25s}
.toggle.on{background:var(--p)}
.toggle::after{content:'';width:18px;height:18px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:.25s;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.toggle.on::after{left:20px}
.gov-body{flex:1;display:flex;overflow:hidden;background:linear-gradient(135deg,#0a0a0f 0%,#0a1628 25%,#0f1a0f 50%,#0f0f1a 100%);background-size:400% 400%;animation:bodyBgFlow 22s ease infinite}
.gov-sb{width:280px;background:var(--card);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;flex-shrink:0}
.gsb-section{padding:14px;border-bottom:1px solid var(--border)}
.gsb-lbl{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);margin-bottom:7px;padding:0 4px}
.gsb-sel{width:100%;padding:12px 14px;border:1.5px solid var(--border);border-radius:9px;font-size:15px;font-weight:600;background:var(--bg-elevated);color:var(--txt);cursor:pointer}
.gsb-sel:focus{outline:none;border-color:var(--g)}
.gov-nav{flex:1;overflow-y:auto;padding:8px}
.gns{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:var(--muted);padding:8px 8px 5px}
.gnav{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:11px;cursor:pointer;transition:all .3s cubic-bezier(0.22,1,0.36,1);font-size:16px;font-weight:600;color:var(--muted);border:none;background:transparent;width:100%;text-align:left}
.gnav:hover{background:var(--bg-elevated);color:var(--txt);transform:translateX(4px)}
.gnav.on{background:var(--g3);color:var(--g);font-weight:700;transform:translateX(4px)}
.gni{font-size:16px;width:22px;text-align:center}
.gbadge{margin-left:auto;background:var(--r);color:#fff;font-size:9px;font-weight:800;padding:1px 6px;border-radius:8px}
.gov-content{flex:1;overflow:hidden;display:flex;flex-direction:column}
.gview{display:none;flex:1;overflow-y:auto;padding:28px}
.gview.on{display:block;background:var(--bg);animation:viewFadeSlide .4s cubic-bezier(0.22,1,0.36,1) forwards;position:relative}
.gview.on::before{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(99,102,241,.06) 0%,rgba(16,185,129,.05) 40%,rgba(139,92,246,.04) 70%,rgba(99,102,241,.05) 100%);background-size:300% 300%;animation:viewBgFlow 15s ease-in-out infinite;pointer-events:none;z-index:0}
.gview.on>*{position:relative;z-index:1}
.gvh{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:12px}
.gvh-left h2{font-size:24px;font-weight:800}
.gvh-left p{font-size:16px;color:var(--muted);margin-top:3px}
.stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-bottom:24px}
.sc{background:var(--card);border-radius:18px;border:1.5px solid var(--border);padding:28px 30px;transition:.3s cubic-bezier(0.4,0,0.2,1);cursor:pointer}
.sc:hover{box-shadow:0 8px 28px rgba(99,102,241,.15);transform:translateY(-3px);border-color:var(--p)}
.sc-n{font-size:40px;font-weight:900;margin-bottom:2px}
.sc-l{font-size:16px;color:var(--muted);font-weight:600}
.sc-t{font-size:14px;font-weight:700;margin-top:6px}
.sc-t.up{color:var(--g)}
.sc-t.dn{color:var(--r)}
.min-panel-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin-bottom:24px}
.min-card{background:var(--card);border:1.5px solid var(--border);border-radius:18px;padding:28px 30px;cursor:pointer;transition:.3s cubic-bezier(0.4,0,0.2,1)}
.min-card:hover{border-color:var(--g);box-shadow:0 10px 32px rgba(16,185,129,.25);transform:translateY(-4px) scale(1.02)}
.min-card.sel-min{border-color:var(--g);box-shadow:0 0 0 2px var(--g3)}
.mc-icon{font-size:44px;margin-bottom:10px}
.mc-name{font-size:18px;font-weight:800;margin-bottom:5px;line-height:1.35}
.mc-stat{display:flex;gap:12px;font-size:11px;color:var(--muted);flex-wrap:wrap}
.mc-stat-item{display:flex;align-items:center;gap:4px;font-weight:600}
.gov-reg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:24px}
.ctable{background:var(--card);border-radius:14px;border:1.5px solid var(--border);overflow:hidden}
.ct-head{display:grid;grid-template-columns:2fr 1.5fr 1fr 1.2fr 1.2fr 110px;padding:14px 18px;background:var(--bg-elevated);border-bottom:1px solid var(--border);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.4px;color:var(--muted)}
.ct-row{display:grid;grid-template-columns:2fr 1.5fr 1fr 1.2fr 1.2fr 110px;padding:18px 22px;border-bottom:1px solid var(--border);align-items:center;font-size:16px;cursor:pointer}
.ct-row:hover{background:var(--bg-elevated)}
.ct-row:last-child{border:none}
.rm-card{background:var(--card);border:1.5px solid var(--border);border-radius:18px;padding:28px 30px;margin-bottom:20px;transition:.3s}
.rm-card:hover{border-color:var(--g);box-shadow:0 6px 24px rgba(16,185,129,.15)}
.rm-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:14px}
.rma{padding:14px 20px;border-radius:12px;border:none;font-size:15px;font-weight:700;cursor:pointer;transition:.2s}
.rma.green{background:var(--g3);color:var(--g)}
.rma.green:hover{background:var(--g);color:#fff}
.rma.blue{background:var(--p3);color:var(--p)}
.rma.blue:hover{background:var(--p);color:#fff}
.rma.amber{background:var(--a2);color:var(--a)}
.rma.amber:hover{background:var(--a);color:#fff}
.cat-bar{display:flex;align-items:center;gap:10px;margin-bottom:9px}
.cat-bar-lbl{width:80px;font-size:11px;font-weight:600;color:var(--muted);text-align:right;flex-shrink:0}
.cat-bar-track{flex:1;background:var(--bg-elevated);border-radius:4px;height:20px;overflow:hidden}
.cat-bar-fill{height:100%;border-radius:4px;display:flex;align-items:center;justify-content:flex-end;padding-right:7px;font-size:14px;font-weight:700;color:#fff;transition:width 1s}
.acc-card{background:var(--card);border:1.5px solid var(--border);border-radius:14px;overflow:hidden;margin-bottom:16px}
.acc-gov-part{background:linear-gradient(135deg,rgba(16,185,129,.15),rgba(16,185,129,.08));padding:18px 20px;border-bottom:1px solid var(--border)}
.acc-cit-part{padding:18px 20px}
.acc-big-bar{height:14px;border-radius:7px;display:flex;overflow:hidden;margin:8px 0}
.conf-alert{background:linear-gradient(135deg,var(--a2),var(--r2));border-left:4px solid var(--a);padding:9px 12px;border-radius:0 8px 8px 0;font-size:12px;font-weight:600;color:#92400E;display:flex;align-items:center;gap:6px;margin-top:8px}
.pm-wrap{margin-top:8px}
.pm-row{display:flex;justify-content:space-between;font-size:14px;color:var(--muted);margin-bottom:3px}
.pm-track{height:10px;border-radius:5px;background:#E5E7EB;overflow:hidden}
.pm-fill{height:100%;border-radius:5px;background:linear-gradient(90deg,var(--a),var(--r));transition:width .8s}
.mov{position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:1000;display:flex;align-items:flex-end;justify-content:center;padding:0;backdrop-filter:blur(8px)}
@media(min-width:560px){.mov{align-items:center;padding:20px}}
.modal{background:var(--card);border:1px solid var(--border);border-radius:24px 24px 0 0;width:100%;max-width:580px;max-height:90vh;overflow-y:auto;box-shadow:0 28px 90px rgba(0,0,0,.5)}
@media(min-width:560px){.modal{border-radius:20px}}
.mh{padding:18px 20px 0;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.mh-title{font-size:22px;font-weight:800}
.xbtn{width:36px;height:36px;border-radius:7px;border:1px solid var(--border);background:var(--bg-elevated);font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.xbtn:hover{background:var(--border);color:var(--txt)}
.mbody{padding:0 24px 28px}
.fg{margin-bottom:12px}
.frow2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cat-g6{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}
.co{border:2px solid var(--border);border-radius:9px;padding:9px 4px;text-align:center;cursor:pointer;transition:.15s;background:var(--bg-elevated)}
.co:hover{border-color:var(--p)}
.co.on{border-color:var(--p);background:var(--p3);box-shadow:0 0 20px rgba(99,102,241,.2)}
.co-i{font-size:26px;margin-bottom:4px;display:flex;align-items:center;justify-content:center}
.co-l{font-size:16px;font-weight:700}
.loc-box{background:var(--bg-elevated);border-radius:10px;padding:14px 16px;font-size:15px;color:var(--muted);display:flex;align-items:center;gap:7px;margin-top:5px}
.gps-btn{width:100%;padding:12px;border:1.5px dashed var(--border);border-radius:10px;background:var(--bg-elevated);font-size:15px;color:var(--muted);cursor:pointer;transition:.15s;margin-top:6px}
.gps-btn:hover{border-color:var(--p);color:var(--p)}
.sbtn{width:100%;padding:16px;border:none;border-radius:12px;font-size:18px;font-weight:800;cursor:pointer;transition:.2s;margin-top:6px;color:#fff}
.sbtn:hover{opacity:.9;transform:translateY(-1px)}
.sbtn:disabled{opacity:.6;transform:none!important;cursor:default}
.sbtn.cit{background:var(--p)}
.sbtn.gov{background:var(--g)}
.gov-warning{background:var(--a2);border:1px solid rgba(245,158,11,.4);border-radius:9px;padding:9px 12px;font-size:11px;color:var(--a);margin-bottom:14px}
.toast{position:fixed;left:50%;transform:translateX(-50%) translateY(80px);background:#0F172A;color:#fff;padding:10px 18px;border-radius:10px;font-size:12px;font-weight:700;z-index:2000;transition:.3s;white-space:nowrap;pointer-events:none}
.toast.bot{bottom:72px}
.toast.top-pos{bottom:20px}
.toast.show{transform:translateX(-50%) translateY(0)}
.empty{text-align:center;padding:40px 28px;color:var(--muted);font-size:18px}
.empty-i{font-size:48px;margin-bottom:16px;opacity:.6}
@keyframes viewFadeSlide{0%{opacity:0;transform:translateY(28px)}45%{opacity:.7}100%{opacity:1;transform:translateY(0)}}
@keyframes viewBgFlow{0%{background-position:0% 0%}25%{background-position:100% 50%}50%{background-position:50% 100%}75%{background-position:0% 50%}100%{background-position:0% 0%}}

/* ═══════════ RESPONSIVE ═══════════ */
@media(max-width:1200px){
  .map-panel{width:380px;min-width:340px;max-width:420px}
  .fab{right:400px}
  .gps-fab{right:400px}
  .gov-sb{width:240px}
  .stat-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
  .min-panel-grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}
}
@media(max-width:992px){
  .ah{padding:0 14px;height:56px}
  .ah-logo{font-size:16px}
  .ah-mark{width:34px;height:34px;font-size:16px}
  .ah-uname{display:none}
  .ah-right-desktop{display:none!important}
  .ah-burger{display:flex!important}
  .live-pill{font-size:10px;padding:4px 10px}
  .gov-sb{gap:0;max-height:none!important;transform:translateX(-100%);transition:transform .3s cubic-bezier(0.22,1,0.36,1);position:fixed!important;top:56px!important;left:0!important;bottom:0!important;right:auto!important;z-index:350;width:280px!important;height:calc(100vh - 56px)!important;box-shadow:4px 0 24px rgba(0,0,0,.4);overflow-y:auto}
  .gov-sb.burger-open{transform:translateX(0)}
  .gov-burger-backdrop{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:340;backdrop-filter:blur(2px)}
  .gov-burger-backdrop.open{display:block}
  .map-panel{width:100%!important;min-width:0!important;max-width:none!important;height:45vh;min-height:280px;border-left:none;border-bottom:1px solid var(--border)}
  #cv-map{flex-direction:column}
  .mp-head{padding:14px 16px}
  .mp-title{font-size:18px}
  .mp-subtitle{font-size:13px;margin-bottom:12px}
  .mp-search-wrap{margin-bottom:10px}
  .mp-si-inp{padding:10px 14px 10px 40px;font-size:14px}
  .mp-filters{flex-wrap:wrap;gap:6px}
  .mpf{padding:8px 12px;font-size:13px}
  .mp-list{padding:14px 16px;gap:12px}
  .mp-list-section{font-size:13px}
  .ic{padding:14px 16px}
  .ic-title{font-size:16px}
  .ic-loc{font-size:13px}
  .cpill,.sbadge{font-size:12px}
  .vb{padding:10px 14px;font-size:13px}
  .mstat-ov{max-width:calc(100% - 28px);padding:6px 12px}
  .mso-row{gap:10px}
  .mso-n{font-size:14px}
  .map-leg{bottom:14px;left:10px;padding:8px 12px;font-size:11px}
  .leg-r{font-size:12px}
  .map-style-switch{top:12px;right:80px;gap:4px;padding:3px}
  .map-style-switch.gov{right:10px}
  .map-style-btn{padding:7px 9px;font-size:11px}
  .fab{top:auto;bottom:20px;right:20px;width:52px;height:52px;font-size:20px}
  .gps-fab{top:auto;bottom:84px;right:20px}
  .regions-wrap{flex-direction:column}
  .uzmap-panel{width:100%!important;max-height:40vh;border-right:none;border-bottom:1px solid var(--border)}
  .gov-body{flex-direction:column}
  .gov-sb{min-height:calc(100vh - 56px)!important}
  .gov-nav{flex:1;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch}
  .gview{padding:16px 20px}
  .gvh{flex-direction:column;align-items:flex-start;margin-bottom:14px}
  .gvh-left h2{font-size:20px}
  .gvh-left p{font-size:14px}
  .stat-grid{grid-template-columns:repeat(2,1fr);gap:12px}
  .sc{padding:20px 22px}
  .sc-n{font-size:32px}
  .sc-l{font-size:14px}
  .min-panel-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .min-card,.mc-name{font-size:16px}
  .mc-icon{font-size:36px}
  .gov-reg-grid{grid-template-columns:repeat(2,1fr);gap:10px}
  .ctable{overflow-x:auto;-webkit-overflow-scrolling:touch;display:block}
  .ctable .ct-head,.ctable .ct-row{min-width:680px}
  .ct-head{padding:12px 14px;font-size:10px}
  .ct-row{padding:14px 16px;font-size:14px}
  .rm-card{padding:20px 22px}
  .rma{padding:12px 16px;font-size:14px}
  .acc-card,.acc-gov-part,.acc-cit-part{padding:14px 16px}
  .modal{max-width:100%;margin:0}
  .mbody{padding:0 16px 20px}
  .cat-g6{grid-template-columns:repeat(2,1fr)}
  .co-l{font-size:14px}
  .frow2{grid-template-columns:1fr}
  .bnav-btn{padding:10px 6px 10px;font-size:12px}
  .bnav-btn .ni{font-size:24px}
}
@media(max-width:576px){
  .ah{padding:0 12px;height:52px}
  .ah-logo{font-size:14px}
  .ah-mark{width:30px;height:30px;font-size:14px}
  .logout-btn{padding:6px 10px;font-size:12px}
  .map-panel{height:50vh;min-height:240px}
  .mp-head{padding:12px 14px}
  .mp-title{font-size:16px}
  .mp-subtitle{font-size:12px;margin-bottom:8px}
  .mp-si-inp{padding:8px 12px 8px 36px;font-size:13px}
  .mpf{padding:6px 10px;font-size:12px}
  .mp-list{padding:10px 12px;gap:8px}
  .ic{padding:12px 14px}
  .ic-title{font-size:14px}
  .ic-loc{font-size:12px}
  .mstat-ov{top:10px;left:10px;padding:6px 10px}
  .mso{min-width:48px}
  .mso-n{font-size:13px}
  .map-leg{bottom:10px;left:8px;padding:6px 10px;font-size:10px}
  .map-style-switch{top:10px;right:72px;gap:3px;padding:3px}
  .map-style-switch.gov{right:8px}
  .map-style-btn{padding:6px 8px;font-size:10px}
  .fab{bottom:16px;right:16px;width:48px;height:48px;font-size:18px}
  .gps-fab{bottom:76px;right:16px}
  .uzmap-panel{max-height:35vh}
  .gov-sb{top:52px!important;height:calc(100vh - 52px)!important}
  .gview{padding:12px 14px}
  .gvh-left h2{font-size:18px}
  .gvh-left p{font-size:12px}
  .stat-grid{grid-template-columns:1fr;gap:10px}
  .sc{padding:16px 18px}
  .sc-n{font-size:28px}
  .min-panel-grid{grid-template-columns:1fr}
  .gov-reg-grid{grid-template-columns:1fr}
  .ctable .ct-head,.ctable .ct-row{min-width:600px}
  .ct-head,.ct-row{padding:10px 12px;font-size:13px}
  .rm-card{padding:16px 18px}
  .rma{padding:10px 14px;font-size:13px}
  .bnav-btn{padding:8px 4px 8px;font-size:11px}
  .bnav-btn .ni{font-size:20px}
}
@media(max-width:400px){
  .ah-logo{font-size:13px}
  .mp-title{font-size:15px}
  .ic-title{font-size:13px}
  .fab{width:44px;height:44px;right:12px;bottom:12px}
  .gps-fab{right:12px;bottom:68px}
  .gvh-left h2{font-size:16px}
  .stat-grid,.sc{padding:14px}
}
`;

/* ═══════════════════════════════════════ MAIN APP ═══════════════════════════════════════ */
export default function HolatApp({ portal = "all" } = {}) {
  const [page, setPage] = useState(() => (portal === "all" ? "landing" : "auth"));
  const [cu, setCu] = useState(null);
  const [authToken, setAuthToken] = useState(() => safeStorageGet(TOKEN_STORAGE_KEY) || "");
  const [regMode, setRegMode] = useState(() => (portal === "gov" ? "gov" : "citizen"));
  const [authTab, setAuthTab] = useState("login");
  const [issues, setIssues] = useState([]);
  const [regions, setRegions] = useState([]);
  const [ministries, setMinistries] = useState([]);
  const [analyticsOverview, setAnalyticsOverview] = useState(null);
  const [citFlt, setCitFlt] = useState("all");
  const [selId, setSelId] = useState(null);
  const [fLat, setFLat] = useState(null);
  const [fLng, setFLng] = useState(null);
  const [mCat, setMCat] = useState("road");
  const [govMinKey, setGovMinKey] = useState("road");
  const [govMinName, setGovMinName] = useState("Yo'l qurilishi");
  const [selRegion, setSelRegion] = useState(null);
  const [citView, setCitView] = useState("map");
  const [govView, setGovView] = useState("overview");
  const [citMapStyle, setCitMapStyle] = useState("standard");
  const [govMapStyle, setGovMapStyle] = useState("standard");
  const [showCitMod, setShowCitMod] = useState(false);
  const [showGovMod, setShowGovMod] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [toastShow, setToastShow] = useState(false);
  const [govMinSel, setGovMinSel] = useState("all");
  const [govRegSel, setGovRegSel] = useState("all");
  const [govRelId, setGovRelId] = useState(null);
  const [citSearch, setCitSearch] = useState("");
  const [pinflVal, setPinflVal] = useState("");
  const [authError, setAuthError] = useState("");
  const [notifOn, setNotifOn] = useState(true);
  const [emailOn, setEmailOn] = useState(false);
  const [mTitle, setMTitle] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mReg, setMReg] = useState(DEFAULT_REGION);
  const [mPri, setMPri] = useState("medium");
  const [mImage, setMImage] = useState(null);
  const [mImageFile, setMImageFile] = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [gRel, setGRel] = useState("");
  const [gSt, setGSt] = useState("");
  const [gOrg, setGOrg] = useState("Yo'l qurilishi vazirligi");
  const [gDate, setGDate] = useState(new Date().toISOString().split("T")[0]);
  const [gStatus, setGStatus] = useState("in_progress");
  const [citSubmitting, setCitSubmitting] = useState(false);
  const [govSubmitting, setGovSubmitting] = useState(false);
  const [fEmail, setFEmail] = useState("");
  const [fPass, setFPass] = useState("");
  const [fFullName, setFFullName] = useState("");
  const [fPhone, setFPhone] = useState("");
  const [fCitRegion, setFCitRegion] = useState(DEFAULT_REGION);
  const [fGovEmail, setFGovEmail] = useState("");
  const [fGovPass, setFGovPass] = useState("");
  const [fGovPos, setFGovPos] = useState("");
  const [fGovRegion, setFGovRegion] = useState(DEFAULT_REGION);
  const [burgerOpen, setBurgerOpen] = useState(false);
  const [govBurgerOpen, setGovBurgerOpen] = useState(false);

  const forcedRole = portal === "citizen" || portal === "gov" ? portal : null;
  const landingPage = forcedRole ? "auth" : "landing";

  const mapRef = useRef(null);
  const cMapRef = useRef(null);
  const cBaseLayerRef = useRef(null);
  const cMarkersRef = useRef({});
  const govMapRef = useRef(null);
  const gMapRef = useRef(null);
  const gBaseLayerRef = useRef(null);
  const gMarkersRef = useRef({});
  const toastTimerRef = useRef(null);

  // Gov modal: prefilled issue and status when opened from card
  useEffect(() => {
    if (showGovMod && govRelId) { setGRel(String(govRelId)); setGStatus("resolved"); }
    if (!showGovMod) { setGovRelId(null); setGRel(""); setGStatus("in_progress"); }
  }, [showGovMod, govRelId]);

  useEffect(() => {
    if (forcedRole) setRegMode(forcedRole);
  }, [forcedRole]);

  // AI jiddiylik tahlili — sarlavha/tavsif o'zgarganda
  useEffect(() => {
    if (!mTitle.trim() && !mDesc.trim()) { setMPri("medium"); return; }
    setAiAnalyzing(true);
    const t = setTimeout(() => {
      const text = ((mTitle || "") + " " + (mDesc || "")).toLowerCase();
      let p = "medium";
      if (/xavf|halokat|vafot|tezkor|yong'in|suv\s*yo'q|elektr\s*yo'q|gaz\s*yo'q|vijdon|shoshilinch|urgent|emergency|yomon|qattiq/i.test(text)) p = "critical";
      else if (/katta|jiddiy|uzilgan|to'xtagan|singan|sizib|chuqur|4\s*soat|5\s*soat|6\s*soat|7\s*soat|8\s*soat|yo'q|buzilgan/i.test(text)) p = "high";
      else if (/muammo|past|kam|qiyin|kutish|navbat|ishlamayapti/i.test(text)) p = "medium";
      else p = "low";
      setMPri(p);
      setAiAnalyzing(false);
    }, 600);
    return () => clearTimeout(t);
  }, [mTitle, mDesc]);

  // Load Leaflet CSS + JS
  useEffect(() => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);
    }
    if (!window.L) {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      document.head.appendChild(script);
    }
  }, []);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setToastShow(false);
    setTimeout(() => setToastShow(true), 10);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastShow(false), 3500);
  }, []);

  function saveSession(token, user) {
    setAuthToken(token);
    setCu(user);
    safeStorageSet(TOKEN_STORAGE_KEY, token);
    safeStorageSet(USER_STORAGE_KEY, JSON.stringify(user));
  }

  function clearSession() {
    setAuthToken("");
    safeStorageRemove(TOKEN_STORAGE_KEY);
    safeStorageRemove(USER_STORAGE_KEY);
  }

  async function refreshIssues(tokenOverride) {
    const token = tokenOverride ?? authToken;
    const apiIssues = await apiRequest("/issues/feed", token ? { token } : {});
    const normalized = extractItems(apiIssues).map(normalizeIssue);
    setIssues((prev) => mergeIssueFlags(normalized, prev));
  }

  async function refreshAnalytics() {
    const [regionsRes, ministriesRes, overviewRes] = await Promise.all([
      apiRequest("/analytics/regions?page=1&limit=100&sortBy=totalIssues&sortOrder=desc"),
      apiRequest("/analytics/ministries?page=1&limit=100&sortBy=totalIssues&sortOrder=desc"),
      apiRequest("/analytics/overview"),
    ]);

    setRegions(normalizeRegionStats(regionsRes));
    setMinistries(normalizeMinistryStats(ministriesRes));
    setAnalyticsOverview(overviewRes || null);
  }

  async function refreshUserContext(tokenOverride, userOverride) {
    const token = tokenOverride ?? authToken;
    if (!token) return;

    const [me, stats, prefs] = await Promise.all([
      userOverride ? Promise.resolve(userOverride) : apiRequest("/users/me", { token }),
      apiRequest("/users/me/stats", { token }),
      apiRequest("/users/me/preferences", { token }),
    ]);

    const nextUser = toClientUser(me, stats || {});
    setCu((prev) => ({ ...(prev || {}), ...nextUser }));

    setNotifOn(Boolean(prefs?.notifOn ?? prefs?.notificationEnabled));
    setEmailOn(Boolean(prefs?.emailOn ?? prefs?.emailNotificationsEnabled));
  }

  useEffect(() => {
    const savedToken = safeStorageGet(TOKEN_STORAGE_KEY);
    const savedUserRaw = safeStorageGet(USER_STORAGE_KEY);
    if (!savedToken || !savedUserRaw) return;

    try {
      const savedUser = JSON.parse(savedUserRaw);
      if (!savedUser?.role || !savedUser?.name) return;

      if (forcedRole && savedUser.role !== forcedRole) {
        clearSession();
        setCu(null);
        setRegMode(forcedRole);
        setPage("auth");
        return;
      }

      setAuthToken(savedToken);
      setCu(savedUser);
      if (forcedRole) setRegMode(forcedRole);
      setPage(savedUser.role === "citizen" ? "citApp" : "govApp");
    } catch {
      clearSession();
    }
  }, [forcedRole]);

  useEffect(() => {
    Promise.all([refreshIssues(), refreshAnalytics(), refreshUserContext()]).catch(() => {
      if (authToken) {
        clearSession();
        setCu(null);
        setPage(landingPage);
      }
    });
  }, [authToken, landingPage]);

  useEffect(() => {
    if (!authToken) {
      refreshAnalytics().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!cu || !authToken) return;
    safeStorageSet(TOKEN_STORAGE_KEY, authToken);
    safeStorageSet(USER_STORAGE_KEY, JSON.stringify(cu));
  }, [cu, authToken]);

  // Init map when citizen app mounts
  useEffect(() => {
    if (page === "citApp" && citView === "map" && mapRef.current && !cMapRef.current) {
      const initMap = () => {
        if (!window.L) { setTimeout(initMap, 100); return; }
        const map = window.L.map(mapRef.current, { zoomControl: true }).setView([41.305, 69.270], 13);
        setMapBaseLayer(map, citMapStyle, cBaseLayerRef);
        map.on("click", (e) => {
          setFLat(e.latlng.lat);
          setFLng(e.latlng.lng);
          setShowCitMod(true);
        });
        cMapRef.current = map;
        renderMarkersOnMap(map, issues, "all", "");
      };
      setTimeout(initMap, 150);
    }
    if (page === "citApp" && citView === "map" && cMapRef.current) {
      setTimeout(() => cMapRef.current && cMapRef.current.invalidateSize(), 120);
    }
  }, [page, citView, citMapStyle]);

  useEffect(() => {
    if (cMapRef.current) {
      setMapBaseLayer(cMapRef.current, citMapStyle, cBaseLayerRef);
    }
  }, [citMapStyle]);

  // Re-render markers when issues/filter changes (citizen)
  useEffect(() => {
    if (cMapRef.current) renderMarkersOnMap(cMapRef.current, issues, citFlt, citSearch);
  }, [issues, citFlt, citSearch]);

  const markerSvg = () =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
  function renderMarkersOnMap(map, issueList, flt, q, markersRef = cMarkersRef, onMarkerClick) {
    const mRef = markersRef || cMarkersRef;
    Object.values(mRef.current).forEach((m) => map.removeLayer(m));
    mRef.current = {};
    const fil = (flt && q !== undefined ? getFiltered(issueList, flt, q) : issueList)
      .filter((r) => typeof r.lat === "number" && typeof r.lng === "number");
    fil.forEach((r) => {
      const isC = r.gc && r.dis > r.con;
      const col = isC ? "#D97706" : r.status === "resolved" ? "#059669" : r.status === "in_progress" ? "#2563EB" : "#DC2626";
      const cat = CATS[r.cat] || CATS.road;
      const pulse = r.priority === "critical" && r.status !== "resolved";
      const icon = window.L.divIcon({
        html: `<div style="width:36px;height:36px;border-radius:50%;background:${col};border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;" class="${pulse ? "mpulse" : ""}">${markerSvg()}</div>`,
        iconSize: [36, 36], iconAnchor: [18, 18], className: ""
      });
      const m = window.L.marker([r.lat, r.lng], { icon }).addTo(map);
      m.bindPopup(`<b>${r.title}</b><br>${r.region} · ${ST[r.status].l}`, { closeButton: false });
      m.on("click", () => (onMarkerClick || (() => setSelId(r.id)))(r.id));
      mRef.current[r.id] = m;
    });
  }

  function getFiltered(issueList, flt, q) {
    return issueList.filter((r) => {
      if (flt === "conflict") return r.gc && r.dis > r.con;
      if (flt !== "all" && r.status !== flt) return false;
      if (q && !r.title.toLowerCase().includes(q.toLowerCase()) && !r.region.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }

  function gGetFiltered() {
    return issues.filter((r) => {
      if (govRegSel !== "all" && r.region !== govRegSel) return false;
      if (govMinSel !== "all") {
        const m = ministries.find((x) => x.key === govMinSel);
        if (m && m.cats.length && !m.cats.includes(r.cat)) return false;
      }
      return true;
    });
  }

  function goAuth(r) { setPage("auth"); setRegMode(forcedRole || r); }
  function goLanding() { setPage(landingPage); }

  function doLogout() {
    clearSession();
    setCu(null);
    cMapRef.current = null;
    cBaseLayerRef.current = null;
    cMarkersRef.current = {};
    gMapRef.current = null;
    gBaseLayerRef.current = null;
    gMarkersRef.current = {};
    setPage(landingPage);
    setRegMode(forcedRole || "citizen");
    setCitView("map");
    setGovView("overview");
  }

  async function doLogin() {
    const activeRegMode = forcedRole || regMode;

    try {
      if (authTab === "register" && activeRegMode === "citizen" && pinflVal.length !== 14) {
        setAuthError("PINFL 14 ta raqamdan iborat bo'lishi kerak!");
        return;
      }

      setAuthError("");
      let authData;

      if (authTab === "register") {
        if (activeRegMode === "citizen") {
          authData = await apiRequest("/auth/register/citizen", {
            method: "POST",
            body: {
              fullName: (fFullName || "Fuqaro").trim(),
              email: fEmail.trim(),
              password: fPass,
              pinfl: pinflVal,
              phone: fPhone.trim() || undefined,
              region: fCitRegion,
            },
          });
        } else {
          authData = await apiRequest("/auth/register/gov", {
            method: "POST",
            body: {
              fullName: (fGovPos || "Hukumat xodimi").trim(),
              email: fGovEmail.trim(),
              password: fGovPass,
              ministryKey: govMinKey,
              ministryName: govMinName,
              position: fGovPos.trim() || undefined,
              region: fGovRegion,
            },
          });
        }
      } else {
        const email = activeRegMode === "citizen" ? fEmail : fGovEmail;
        const password = activeRegMode === "citizen" ? fPass : fGovPass;
        authData = await apiRequest("/auth/login", {
          method: "POST",
          body: { email: email.trim(), password },
        });
      }

      const nextUser = toClientUser(authData.user);
      if (forcedRole && nextUser.role !== forcedRole) {
        setAuthError("Bu portal uchun mos akkauntdan kiring");
        return;
      }

      saveSession(authData.accessToken, nextUser);
      setPage(nextUser.role === "citizen" ? "citApp" : "govApp");
      await Promise.all([
        refreshIssues(authData.accessToken),
        refreshAnalytics(),
        refreshUserContext(authData.accessToken, authData.user),
      ]);
    } catch (error) {
      setAuthError(error?.message || "Tizimga kirishda xatolik yuz berdi");
    }
  }

  async function doUp(id) {
    if (!authToken) {
      showToast("Tizimga kirgan foydalanuvchi ovoz bera oladi");
      return;
    }

    const current = issues.find((x) => x.id === id);
    if (current?.voted) {
      showToast("Allaqachon ovoz berdingiz");
      return;
    }

    try {
      await apiRequest(`/issues/${id}/upvote`, { method: "POST", token: authToken });
      await Promise.all([refreshIssues(), refreshUserContext(), refreshAnalytics()]);
      showToast("Ovozingiz qabul qilindi");
    } catch (error) {
      showToast(error?.message || "Ovoz berishda xatolik");
    }
  }

  async function doV(id, type) {
    if (!authToken) {
      showToast("Tizimga kirgan foydalanuvchi tekshiruv ovozi bera oladi");
      return;
    }

    const current = issues.find((x) => x.id === id);
    if (!current?.gc) return;
    if (current.mv === type) {
      showToast("Allaqachon shu tanlov bilan ovoz bergansiz");
      return;
    }

    try {
      await apiRequest(`/claims/issues/${id}/vote`, {
        method: "POST",
        token: authToken,
        body: { type },
      });
      await Promise.all([refreshIssues(), refreshUserContext(), refreshAnalytics()]);
      showToast(type === "confirm" ? "Tasdiqlash ovozi qayd etildi" : "Rad etish ovozi qayd etildi");
    } catch (error) {
      showToast(error?.message || "Tekshiruv ovozini yuborib bolmadi");
    }
  }

  function selI(id) {
    setSelId(id);
    const r = issues.find((x) => x.id === id);
    if (r && typeof r.lat === "number" && typeof r.lng === "number" && cMapRef.current && cMarkersRef.current[id]) {
      cMapRef.current.flyTo([r.lat, r.lng], 16, { animate: true, duration: 0.8 });
      cMarkersRef.current[id].openPopup();
    }
  }

  function doGPS() {
    showToast("📡 GPS aniqlanmoqda...");
    const ok = (pos) => { setFLat(pos.coords.latitude); setFLng(pos.coords.longitude); showToast("✅ Joylashuv aniqlandi!"); };
    const fail = () => { setFLat(41.305 + (Math.random() - 0.5) * 0.05); setFLng(69.27 + (Math.random() - 0.5) * 0.05); showToast("📍 Joylashuv aniqlanmadi, taxminiy nuqta qo'yildi"); };
    navigator.geolocation ? navigator.geolocation.getCurrentPosition(ok, fail) : fail();
  }

  async function submitCit() {
    if (!authToken) {
      showToast("Muammo yuborish uchun tizimga kiring");
      return;
    }
    if (!mTitle.trim()) {
      showToast("Sarlavha kiriting");
      return;
    }

    setCitSubmitting(true);
    try {
      let uploadedImagePath;
      if (mImageFile) {
        const formData = new FormData();
        formData.append("file", mImageFile);

        const uploadRes = await fetch(`${API_BASE_URL}/uploads`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadErrText = await uploadRes.text();
          throw new Error(uploadErrText || "Rasmni yuklab bo'lmadi");
        }

        const uploadData = await uploadRes.json();
        uploadedImagePath = uploadData?.imageUrl || undefined;
      }

      const created = await apiRequest("/issues", {
        method: "POST",
        token: authToken,
        body: {
          category: mCat,
          title: mTitle.trim(),
          description: mDesc.trim() || undefined,
          priority: mPri,
          region: mReg,
          latitude: typeof fLat === "number" ? fLat : undefined,
          longitude: typeof fLng === "number" ? fLng : undefined,
          imageUrl: uploadedImagePath,
        },
      });

      await Promise.all([refreshIssues(), refreshUserContext(), refreshAnalytics()]);
      const createdId = String(created.id);
      setIssues((prev) => prev.map((x) => (x.id === createdId ? { ...x, voted: true, mine: true } : x)));

      setShowCitMod(false);
      setFLat(null);
      setFLng(null);
      setMTitle("");
      setMDesc("");
      setMImage(null);
      setMImageFile(null);
      showToast("Muammo muvaffaqiyatli yuborildi");
      setTimeout(() => selI(createdId), 350);
    } catch (error) {
      showToast(error?.message || "Muammoni yuborib bo'lmadi");
    } finally {
      setCitSubmitting(false);
    }
  }

  async function submitGov() {
    if (!authToken) {
      showToast("Davo yuborish uchun tizimga kiring");
      return;
    }
    if (!gRel) {
      showToast("Muammo tanlang");
      return;
    }
    if (!gSt.trim()) {
      showToast("Rasmiy bayonot yozing");
      return;
    }

    setGovSubmitting(true);
    try {
      await apiRequest(`/claims/issues/${gRel}`, {
        method: "POST",
        token: authToken,
        body: {
          organization: gOrg,
          statement: gSt.trim(),
          claimDate: gDate,
          status: gStatus === "resolved" ? "resolved" : "in_progress",
        },
      });

      await Promise.all([refreshIssues(), refreshAnalytics()]);
      setShowGovMod(false);
      setGSt("");
      setGRel("");
      setGStatus("in_progress");
      showToast(gStatus === "resolved" ? "Hal qilindi davosi qabul qilindi" : "Davo qoshildi");
    } catch (error) {
      showToast(error?.message || "Davoni yuborib bolmadi");
    } finally {
      setGovSubmitting(false);
    }
  }

  async function chSt(id, s) {
    if (!authToken) {
      showToast("Holatni yangilash uchun tizimga kiring");
      return;
    }

    try {
      await apiRequest(`/issues/${id}/status`, {
        method: "PATCH",
        token: authToken,
        body: { status: s },
      });
      await Promise.all([refreshIssues(), refreshAnalytics()]);
      showToast(`Holat: ${ST[s].l}`);
    } catch (error) {
      showToast(error?.message || "Holatni yangilab bolmadi");
    }
  }

  function selectRegion(name) {
    setSelRegion(name);
    showToast("📍 " + name + " tanlandi");
  }

  function getIsiColor(isi) { return isi >= 75 ? "#059669" : isi >= 55 ? "#D97706" : "#DC2626"; }

  const filteredIssues = getFiltered(issues, citFlt, citSearch).sort((a, b) => b.votes - a.votes);
  const govFil = gGetFiltered();
  const analyticsRegions = Array.from(new Set(regions.map((r) => r.name).filter(Boolean)));
  const regionOptions = Array.from(new Set([...KNOWN_REGIONS, ...analyticsRegions]));
  const openCount = issues.filter((r) => r.status === "open").length;

  // Init gov map when gov app shows map view
  useEffect(() => {
    if (page === "govApp" && govView === "map" && govMapRef.current && !gMapRef.current) {
      const initMap = () => {
        if (!window.L) { setTimeout(initMap, 100); return; }
        const map = window.L.map(govMapRef.current, { zoomControl: true }).setView([41.305, 69.270], 13);
        setMapBaseLayer(map, govMapStyle, gBaseLayerRef);
        gMapRef.current = map;
        renderMarkersOnMap(map, govFil, "all", "", gMarkersRef, (id) => { setGovRelId(id); setShowGovMod(true); });
      };
      setTimeout(initMap, 150);
    }
    if (page === "govApp" && govView === "map" && gMapRef.current) {
      setTimeout(() => gMapRef.current && gMapRef.current.invalidateSize(), 120);
    }
  }, [page, govView, govMapStyle]);

  useEffect(() => {
    if (gMapRef.current) {
      setMapBaseLayer(gMapRef.current, govMapStyle, gBaseLayerRef);
    }
  }, [govMapStyle]);

  // Re-render gov map markers when govFil changes
  useEffect(() => {
    if (gMapRef.current) renderMarkersOnMap(gMapRef.current, govFil, "all", "", gMarkersRef, (id) => { setGovRelId(id); setShowGovMod(true); });
  }, [govFil]);
  const conflictCount = issues.filter((r) => r.gc && r.dis > r.con).length;
  const resolvedCount = issues.filter((r) => r.status === "resolved").length;
  const landingTotals = analyticsOverview?.totals || {};
  const landingStats = [
    { n: formatCount(landingTotals.regions ?? regions.length), l: "Viloyat" },
    { n: formatCount(landingTotals.ministries ?? ministries.length), l: "Vazirlik" },
    { n: formatCount(landingTotals.issues ?? issues.length), l: "Jami muammo" },
    { n: formatCount(landingTotals.resolvedIssues ?? resolvedCount), l: "Muammo hal qilindi" },
  ];

  /* ══════════════════ RENDER ══════════════════ */
  return (
    <>
      <style>{CSS}</style>

      {/* ══════ LANDING ══════ */}
      {page === "landing" && !forcedRole && (
        <div id="landing">
          <div className="land-orb land-orb-1" />
          <div className="land-orb land-orb-2" />
          <div className="land-orb land-orb-3" />
          <div className="land-inner">
            <div className="land-badge">🇺🇿 O'zbekiston uchun birinchi platform</div>
            <div className="land-title">HOLAT</div>
            <p className="land-tagline">Infratuzilma muammolari xaritada. Hukumat da'volari fuqarolar tomonidan tekshiriladi. Shaffoflik — texnologiya orqali.</p>
            <div className="role-cards">
              <div className="rc-land" onClick={() => goAuth("citizen")}>
                <div className="rc-icon"><MiscIcons.User size={40} strokeWidth={2} /></div>
                <div className="rc-title">Fuqaro</div>
                <div className="rc-desc">Muammo xabar berish, hukumat da'volarini tekshirish, shahar rivojiga hissa qo'shish</div>
              </div>
              <div className="rc-land" onClick={() => goAuth("gov")}>
                <div className="rc-icon"><MiscIcons.Landmark size={40} strokeWidth={2} /></div>
                <div className="rc-title">Hukumat xodimi</div>
                <div className="rc-desc">Vazirlik paneli, muammo boshqaruvi, viloyatlar reytingi va shaffoflik statistikasi</div>
              </div>
            </div>
            <div className="land-nums">
              {landingStats.map((item) => (
                <div key={item.l} className="ln">
                  <div className="ln-n">{item.n}</div>
                  <div className="ln-l">{item.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══════ AUTH ══════ */}
      {page === "auth" && (
        <div id="authPage">
          <div className="auth-wrap">
            <div className="auth-top">
              <div className="auth-logo-mark"><MiscIcons.Search size={26} strokeWidth={2.5} /></div>
              <div className="auth-h">Tizimga kirish</div>
              <div className="auth-s">Akkauntingiz yo'qmi? Ro'yxatdan o'ting</div>
            </div>
            {!forcedRole && (
              <div className="role-bar">
                <button className={`rb ${regMode === "citizen" ? "on" : ""}`} onClick={() => setRegMode("citizen")}><MiscIcons.User {...iconSizeSm} /> Fuqaro</button>
                <button className={`rb ${regMode === "gov" ? "gov-on" : ""}`} onClick={() => setRegMode("gov")}><MiscIcons.Landmark {...iconSizeSm} /> Hukumat xodimi</button>
              </div>
            )}
            <div className="auth-form">
              <div className="tabs-auth">
                <button className={`tab-auth ${authTab === "login" ? (regMode === "gov" ? "gov-on" : "on") : ""}`} onClick={() => setAuthTab("login")}>Kirish</button>
                <button className={`tab-auth ${authTab === "register" ? (regMode === "gov" ? "gov-on" : "on") : ""}`} onClick={() => setAuthTab("register")}>Ro'yxatdan o'tish</button>
              </div>
              {authError && <div className="err-msg">{authError}</div>}

              {regMode === "citizen" && (
                <div>
                  {authTab === "register" && (
                    <div>
                      <label className="fl">PINFL (Shaxsiy identifikatsiya raqami)</label>
                      <input className="fi fi-pinfl" maxLength={14} placeholder="14 raqam kiriting" value={pinflVal}
                        onChange={(e) => setPinflVal(e.target.value.replace(/\D/g, ""))} type="tel" />
                      <div className={`pinfl-hint ${pinflVal.length === 14 ? "ok" : pinflVal.length > 0 ? "err" : ""}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {pinflVal.length === 0 ? <><MiscIcons.Lock size={12} /> 14 ta raqam — O'zbekiston fuqarolari uchun</> :
                          pinflVal.length < 14 ? <><MiscIcons.X size={12} /> {pinflVal.length}/14 raqam — davom eting</> : <><MiscIcons.Check size={12} /> PINFL to'g'ri formatda</>}
                      </div>
                      <label className="fl">To'liq ism</label>
                      <input className="fi" placeholder="Ism va Familiya" value={fFullName} onChange={(e) => setFFullName(e.target.value)} />
                      <label className="fl">Telefon raqam</label>
                      <input className="fi" placeholder="+998 90 123 45 67" type="tel" value={fPhone} onChange={(e) => setFPhone(e.target.value)} />
                      <label className="fl">Tuman / Shahar</label>
                      <select className="fi" value={fCitRegion} onChange={(e) => setFCitRegion(e.target.value)}>
                        {regionOptions.map((r) => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="fl">Email</label>
                  <input className="fi" placeholder="email@example.uz" type="email" value={fEmail} onChange={(e) => setFEmail(e.target.value)} />
                  <label className="fl">Parol</label>
                  <input className="fi" placeholder="••••••••" type="password" value={fPass} onChange={(e) => setFPass(e.target.value)} />
                </div>
              )}

              {regMode === "gov" && (
                <div>
                  <label className="fl">Viloyat / Hudud</label>
                  <select className="fi gov" value={fGovRegion} onChange={(e) => setFGovRegion(e.target.value)}>
                    {regionOptions.map((r) => <option key={r}>{r}</option>)}
                  </select>
                  <label className="fl">Email (ish)</label>
                  <input className="fi gov" placeholder="ism@ministry.gov.uz" type="email" value={fGovEmail} onChange={(e) => setFGovEmail(e.target.value)} />
                  <div className="fi-row">
                    <div><label className="fl">Parol</label><input className="fi gov" placeholder="••••••••" type="password" value={fGovPass} onChange={(e) => setFGovPass(e.target.value)} /></div>
                    <div><label className="fl">Lavozim</label><input className="fi gov" placeholder="Masalan: Bosh mutaxassis" value={fGovPos} onChange={(e) => setFGovPos(e.target.value)} /></div>
                  </div>
                </div>
              )}

              <button className={`auth-sbtn ${regMode === "citizen" ? "cit" : "gov"}`} onClick={doLogin} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <MiscIcons.Lock size={18} /> {authTab === "login" ? "Kirish" : "Ro'yxatdan o'tish"}
              </button>
              {!forcedRole && <div className="auth-back"><a onClick={goLanding} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MiscIcons.ChevronLeft size={16} /> Orqaga</a></div>}
            </div>
          </div>
        </div>
      )}

      {/* ══════ CITIZEN APP ══════ */}
      {page === "citApp" && cu && (
        <div className="app">
          <header className="ah cit-ah">
            <div className="ah-logo"><div className="ah-mark"><MiscIcons.MapPin size={16} strokeWidth={2.5} /></div>HOLAT<span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginLeft: 3 }}>Fuqaro</span></div>
            <div className="ah-right ah-right-desktop">
              <div className="live-pill">● JONLI</div>
              <div className="ah-avatar">{cu.name[0]}</div>
              <span className="ah-uname">{cu.name.split(" ")[0]}</span>
              <button className="logout-btn" onClick={doLogout}>Chiqish</button>
            </div>
            <button className="ah-burger" onClick={() => setBurgerOpen(true)} aria-label="Menyu"><MiscIcons.Menu size={24} strokeWidth={2.5} /></button>
          </header>
          <div className={`burger-overlay ${burgerOpen ? "open" : ""}`} onClick={() => setBurgerOpen(false)}>
            <div className="burger-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="burger-drawer-h">
                <span className="burger-drawer-title">Menyu</span>
                <button className="xbtn" onClick={() => setBurgerOpen(false)}><MiscIcons.X size={18} /></button>
              </div>
              <div className="live-pill">● JONLI</div>
              <div className="ah-avatar">{cu.name[0]}</div>
              <span className="ah-uname">{cu.name.split(" ")[0]}</span>
              <button className="logout-btn" onClick={() => { doLogout(); setBurgerOpen(false); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><MiscIcons.LogOut size={16} /> Chiqish</button>
            </div>
          </div>
          <div className="cit-body" style={{ position: "relative" }}>
            {/* MAP VIEW */}
            <div className={`cview ${citView === "map" ? "on" : ""}`} id="cv-map">
              <div className="map-wrap">
                <div id="cMap" ref={mapRef} style={{ width: "100%", height: "100%" }}></div>
                <div className="map-style-switch" role="group" aria-label="Xarita ko'rinishi">
                  {MAP_STYLE_KEYS.map((styleKey) => (
                    <button
                      key={styleKey}
                      type="button"
                      className={`map-style-btn ${citMapStyle === styleKey ? "on" : ""}`}
                      onClick={() => setCitMapStyle(styleKey)}
                      title={`${MAP_STYLES[styleKey].label} ko'rinishi`}
                    >
                      {MAP_STYLES[styleKey].label}
                    </button>
                  ))}
                </div>
                <div className="map-fab-col">
                  <button className="fab" onClick={() => setShowCitMod(true)} aria-label="Muammo qo'shish" title="Muammo qo'shish"><MiscIcons.Plus size={24} strokeWidth={2.5} /></button>
                  <button className="fab gps-fab" onClick={doGPS} aria-label="Joylashuvni aniqlash" title="Joylashuvni aniqlash">
                    <MiscIcons.Locate size={24} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
              <div className="map-panel">
                <div className="mp-head">
                  <div className="mp-title">Muammolar ro'yxati</div>
                  <div className="mp-subtitle">Xaritadagi barcha muammolar — bosing va joylashuvni ko'ring</div>
                  <div className="mp-search-wrap">
                    <span className="mp-si"><MiscIcons.Search size={18} strokeWidth={2.5} /></span>
                    <input className="mp-si-inp" placeholder="Muammo nomi yoki viloyat bo'yicha qidirish..." value={citSearch} onChange={(e) => setCitSearch(e.target.value)} />
                  </div>
                  <div className="mp-filters-lbl">Filtr</div>
                  <div className="mp-filters">
                    {[["all", "Hammasi"], ["open", "Ochiq"], ["in_progress", "Jarayonda"], ["resolved", "Hal qilindi"], ["conflict", "Ziddiyat"]].map(([f, l]) => (
                      <button key={f} type="button" className={`mpf ${citFlt === f ? "on" : ""}`} onClick={() => setCitFlt(f)}>{l}</button>
                    ))}
                  </div>
                </div>
                <div className="mp-list">
                  {filteredIssues.length === 0
                    ? <div className="empty"><div className="empty-i"><MiscIcons.Inbox size={48} strokeWidth={1.5} /></div><div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Muammo topilmadi</div><div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Filterni o'zgartiring yoki xaritada + tugmasini bosing</div></div>
                    : <><div className="mp-list-section">{filteredIssues.length} ta muammo</div>{filteredIssues.map((r) => <IssueCard key={r.id} r={r} selId={selId} onSel={selI} onUp={doUp} onV={doV} />)}</>}
                </div>
              </div>
            </div>

            {/* MAP LEGEND - cit-body ichida, cv-regions dan oldin */}
            {citView === "map" && (
              <div className="map-leg">
                <div className="leg-title">Belgilar</div>
                <div className="leg-r"><div className="leg-d" style={{ background: "var(--r)" }}></div>Ochiq muammo</div>
                <div className="leg-r"><div className="leg-d" style={{ background: "#2563EB" }}></div>Jarayonda</div>
                <div className="leg-r"><div className="leg-d" style={{ background: "var(--g)" }}></div>Hal qilindi</div>
                <div className="leg-r"><div className="leg-d" style={{ background: "var(--a)" }}></div>Ziddiyat</div>
              </div>
            )}

            {/* STATISTIKA OVERLAY - xarita ustida kompakt */}
            {citView === "map" && (
              <div className="mstat-ov">
                <div className="mso-row">
                  <div className="mso"><div className="mso-n" style={{ color: "var(--p)" }}>{issues.length}</div><div className="mso-l">Jami</div></div>
                  <div className="mso"><div className="mso-n" style={{ color: "var(--r)" }}>{openCount}</div><div className="mso-l">Ochiq</div></div>
                  <div className="mso"><div className="mso-n" style={{ color: "var(--a)" }}>{conflictCount}</div><div className="mso-l">Ziddiyat</div></div>
                  <div className="mso"><div className="mso-n" style={{ color: "var(--g)" }}>{resolvedCount}</div><div className="mso-l">Hal qilindi</div></div>
                </div>
              </div>
            )}

            {/* REGIONS VIEW */}
            <div className={`cview ${citView === "regions" ? "on" : ""}`} id="cv-regions" style={{ flexDirection: "column" }}>
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--card)", display: "flex", alignItems: "center", gap: 8 }}>
                <MiscIcons.Map size={20} strokeWidth={2} />
                <div><div style={{ fontSize: 15, fontWeight: 800 }}>Viloyatlar bo'yicha holat</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>O'zbekistonning barcha 14 viloyati — infratuzilma indeksi</div></div>
              </div>
              <div className="regions-wrap">
                <div className="uzmap-panel">
                  <div className="uzmap-title">O'zbekiston xaritasi</div>
                  <div className="uzmap-sub">Viloyatga bosing — batafsil statistika</div>
                  <div className="uzmap-svg-wrap">
                    <UzbekistanSVG regions={regions} selRegion={selRegion} onSelect={selectRegion} getIsiColor={getIsiColor} />
                  </div>
                  <div className="map-legend-isi">
                    <div className="mli"><div className="mli-dot" style={{ background: "#059669" }}></div>Yaxshi (75+)</div>
                    <div className="mli"><div className="mli-dot" style={{ background: "#D97706" }}></div>O'rtacha (55–74)</div>
                    <div className="mli"><div className="mli-dot" style={{ background: "#DC2626" }}></div>Muammoli (&lt;55)</div>
                    <div className="mli"><div className="mli-dot" style={{ background: "#1641C8" }}></div>Toshkent sh.</div>
                  </div>
                </div>
                <div className="regions-list-panel">
                  {[...regions].sort((a, b) => b.isi - a.isi).map((d, i) => {
                    const col = getIsiColor(d.isi);
                    const tUp = d.trend.startsWith("+");
                    return (
                      <div key={d.name} className={`rgn-card ${selRegion === d.name ? "sel-reg" : ""}`} onClick={() => selectRegion(d.name)}>
                        <div className="rgn-top">
                          <div>
                            <div className="rgn-name">{["🥇", "🥈", "🥉"][i] || `#${i + 1}`} {d.name}</div>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>{(d.pop / 1000000).toFixed(1)}M aholi</div>
                          </div>
                          <div>
                            <div className="isi-score" style={{ color: col }}>{d.isi}</div>
                            <div className="isi-trend" style={{ color: tUp ? "var(--g)" : "var(--r)" }}>{d.trend} ISI</div>
                          </div>
                        </div>
                        <div className="isi-bar-bg"><div className="isi-bar-fill" style={{ width: `${d.isi}%`, background: `linear-gradient(90deg,${col}70,${col})` }}></div></div>
                        <div className="rgn-stats">
                          <div className="rs"><div className="rs-n" style={{ color: "var(--r)" }}>{d.open}</div><div className="rs-l">Ochiq</div></div>
                          <div className="rs"><div className="rs-n" style={{ color: "#2563EB" }}>{d.prog}</div><div className="rs-l">Jarayonda</div></div>
                          <div className="rs"><div className="rs-n" style={{ color: "var(--g)" }}>{d.res}</div><div className="rs-l">Hal qilindi</div></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* MY REPORTS VIEW */}
            <div className={`cview ${citView === "myreports" ? "on" : ""}`} style={{ overflowY: "auto", padding: "12px 16px", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiscIcons.ClipboardList size={20} />
                  <span style={{ fontSize: 16, fontWeight: 800 }}>Mening arizalarim</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  {issues.filter((r) => r.mine).length ? `${issues.filter((r) => r.mine).length} ta` : "Bo'sh"}
                </span>
              </div>
              {issues.filter((r) => r.mine).length === 0
                ? <div className="empty" style={{ padding: "32px 16px" }}><div className="empty-i" style={{ fontSize: 40 }}><MiscIcons.Inbox size={40} strokeWidth={1.5} /></div><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Ariza yo'q</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Xaritada + tugmasini bosing</div></div>
                : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{issues.filter((r) => r.mine).map((r) => {
                  const cat = CATS[r.cat] || CATS.road; const st = ST[r.status];
                  const MRCatIcon = CatIcons[r.cat] || CatIcons.road;
                  return (
                    <div key={r.id} className="mr-card">
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <span className="cpill" style={{ background: `${cat.c}22`, color: cat.c, display: "inline-flex", alignItems: "center", gap: 4 }}><MRCatIcon size={12} /> {cat.l}</span>
                        <span className="sbadge" style={{ background: st.bg, color: st.c }}>{st.l}</span>
                        <span className="sbadge" style={{ background: `${(r.priority === "critical" ? "#7C3AED" : r.priority === "high" ? "#EF4444" : r.priority === "medium" ? "#F59E0B" : "#22C55E")}22`, color: r.priority === "critical" ? "#7C3AED" : r.priority === "high" ? "#EF4444" : r.priority === "medium" ? "#F59E0B" : "#22C55E", fontSize: 10 }}>{{ low: "Past", medium: "O'rta", high: "Jiddiy", critical: "Kritik" }[r.priority] || "O'rta"}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>👍 {r.votes}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, lineHeight: 1.35 }}>{r.title}</div>
                      {r.image && <img src={r.image} alt="" style={{ width: "100%", maxHeight: 100, objectFit: "cover", borderRadius: 8, marginBottom: 6 }} />}
                      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: r.gc ? 8 : 6 }}>📍 {r.region} · {r.time}</div>
                      {r.gc && <div style={{ background: "var(--g3)", border: "1px solid rgba(16,185,129,.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#065F46", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}><MiscIcons.Landmark size={12} style={{ flexShrink: 0 }} /><span><b>{r.gc.org}:</b> {r.gc.t.substring(0, 50)}{r.gc.t.length > 50 ? "…" : ""}</span></div>}
                      <div className="timeline-mini" style={{ marginTop: r.gc ? 8 : 6, paddingTop: r.gc ? 8 : 0, borderTop: r.gc ? "1px solid var(--border)" : "none" }}>
                        <div className="tm-item"><div className="tm-dot" style={{ background: "var(--p)" }}></div><div style={{ fontSize: 11 }}>Yuborildi · {r.time}</div></div>
                        {r.status !== "open" && <div className="tm-item"><div className="tm-dot" style={{ background: "#2563EB" }}></div><div style={{ fontSize: 11 }}>Jarayonda</div></div>}
                        {r.status === "resolved" && <div className="tm-item"><div className="tm-dot" style={{ background: "var(--g)" }}></div><div style={{ fontSize: 11 }}>Hal qilindi ✓</div></div>}
                      </div>
                    </div>
                  );
                })}</div>}
            </div>

            {/* PROFILE VIEW */}
            <div className={`cview ${citView === "profile" ? "on" : ""}`} style={{ overflowY: "auto", padding: 14, flexDirection: "column" }}>
              <div className="pf-card">
                <div className="pf-hero">
                  <div className="pf-av" style={{ background: "var(--p)" }}>{cu.name[0]}</div>
                  <div className="pf-name">{cu.name}</div>
                  <div className="pf-meta">{cu.pinfl ? `PINFL: ${cu.pinfl.substring(0, 4)}••••••••••  · ` : ""}HOLAT fuqarosi · 2026</div>
                  <div className="pf-stats">
                    <div className="pfs"><div className="pfs-n">{issues.filter((r) => r.mine).length + cu.reports}</div><div className="pfs-l">Muammo</div></div>
                    <div className="pfs"><div className="pfs-n">{cu.votes}</div><div className="pfs-l">Ovoz</div></div>
                    <div className="pfs"><div className="pfs-n">{cu.verifications}</div><div className="pfs-l">Tekshiruv</div></div>
                  </div>
                </div>
                <div className="setting-row"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Bell size={16} />Bildirishnomalar</span><button className={`toggle ${notifOn ? "on" : ""}`} onClick={() => setNotifOn((v) => !v)}></button></div>
                <div className="setting-row"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Mail size={16} />Email xabarnoma</span><button className={`toggle ${emailOn ? "on" : ""}`} onClick={() => setEmailOn((v) => !v)}></button></div>
                <div className="setting-row"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Globe size={16} />Til</span><span style={{ fontSize: 12, color: "var(--muted)" }}>O'zbek</span></div>
                <div className="setting-row"><span style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.MapPin size={16} />Viloyat</span><span style={{ fontSize: 12, color: "var(--muted)" }}>{cu.region || "—"}</span></div>
              </div>
              <button style={{ width: "100%", padding: 12, background: "var(--r2)", color: "var(--r)", border: "1.5px solid var(--r)", borderRadius: 10, fontWeight: 800, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={doLogout}><MiscIcons.LogOut size={16} />Tizimdan chiqish</button>
            </div>
          </div>
          <nav className="cit-bnav">
            {[["map", "Xarita"], ["regions", "Viloyatlar"], ["myreports", "Mening"], ["profile", "Profil"]].map(([v, lb]) => {
              const NavIcon = NavIcons[v];
              return (
              <button key={v} className={`bnav-btn ${citView === v ? "on" : ""}`} onClick={() => setCitView(v)}>
                <div className="ni">{NavIcon && <NavIcon size={20} strokeWidth={2} />}</div>{lb}
              </button>
            );})}
          </nav>
        </div>
      )}

      {/* ══════ GOV APP ══════ */}
      {page === "govApp" && cu && (
        <div className="app">
          <header className="ah gov-ah">
            <div className="ah-logo"><div className="ah-mark"><MiscIcons.Landmark size={16} strokeWidth={2.5} /></div>HOLAT<span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, marginLeft: 3 }}>Hukumat paneli</span></div>
            <div className="ah-right ah-right-desktop">
              <div className="live-pill">● JONLI</div>
              <div className="ah-avatar">{cu.name[0]}</div>
              <div><div style={{ fontSize: 12, fontWeight: 700 }}>{cu.name.split("(")[0].trim()}</div><div style={{ fontSize: 10, opacity: 0.7 }}>{cu.ministry || "Vazirlik"}</div></div>
              <button className="logout-btn" onClick={doLogout}>Chiqish</button>
            </div>
            <button className="ah-burger" onClick={() => setGovBurgerOpen(true)} aria-label="Menyu"><MiscIcons.Menu size={24} strokeWidth={2.5} /></button>
          </header>
          <div className={`gov-burger-backdrop ${govBurgerOpen ? "open" : ""}`} onClick={() => setGovBurgerOpen(false)} />
          <div className="gov-body">
            <GovSidebar govView={govView} setGovView={setGovView} govMinSel={govMinSel} setGovMinSel={setGovMinSel}
              govRegSel={govRegSel} setGovRegSel={setGovRegSel} openCount={govFil.filter((r) => r.status === "open").length}
              ministries={ministries} regionOptions={regionOptions}
              onOpenGovMod={() => { setGovRelId(null); setShowGovMod(true); }} burgerOpen={govBurgerOpen}
              onBurgerClose={() => setGovBurgerOpen(false)} />
            <div className="gov-content">
              <GovContent govView={govView} issues={issues} regions={regions} ministries={ministries} analyticsOverview={analyticsOverview} govFil={govFil} govMinSel={govMinSel} govRegSel={govRegSel}
                chSt={chSt} showToast={showToast} onOpenGovMod={(id) => { setGovRelId(id); setShowGovMod(true); }}
                getIsiColor={getIsiColor} setGovRegSel={setGovRegSel} setGovMinSel={setGovMinSel} setGovView={setGovView}
                govMapRef={govMapRef} govMapStyle={govMapStyle} setGovMapStyle={setGovMapStyle} />
            </div>
          </div>
        </div>
      )}

      {/* ══════ CITIZEN MODAL ══════ */}
      {showCitMod && (
        <div className="mov" onClick={(e) => { if (e.target === e.currentTarget) { setShowCitMod(false); setMImage(null); setMImageFile(null); } }}>
          <div className="modal">
            <div className="mh"><div className="mh-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.MapPin size={18} /> Muammo xabar berish</div><button className="xbtn" onClick={() => { setShowCitMod(false); setMImage(null); setMImageFile(null); }}><MiscIcons.X size={16} /></button></div>
            <div className="mbody">
              <div className="cat-g6">
                {[["road", "Yo'l"], ["school", "Maktab"], ["hospital", "Tibbiyot"], ["water", "Suv"], ["electricity", "Elektr"], ["gas", "Gaz"]].map(([k, lb]) => {
                  const CoIcon = CatIcons[k];
                  return (
                  <div key={k} className={`co ${mCat === k ? "on" : ""}`} onClick={() => setMCat(k)}>
                    <div className="co-i">{CoIcon && <CoIcon size={22} strokeWidth={2} />}</div><div className="co-l">{lb}</div>
                  </div>
                );})}
              </div>
              <div className="fg"><label className="fl">Sarlavha *</label><input className="fi" placeholder="Muammoni qisqacha..." maxLength={80} value={mTitle} onChange={(e) => setMTitle(e.target.value)} /></div>
              <div className="fg"><label className="fl">Batafsil tavsif</label><textarea className="fi" style={{ resize: "vertical", minHeight: 65 }} placeholder="Qo'shimcha ma'lumot..." value={mDesc} onChange={(e) => setMDesc(e.target.value)}></textarea></div>
              <div className="fg">
                <label className="fl">Rasm yuklash</label>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <label style={{ cursor: "pointer", padding: "12px 16px", border: "2px dashed var(--border)", borderRadius: 10, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: "var(--muted)", transition: ".2s" }} className="gps-btn">
                    <MiscIcons.ImagePlus size={18} /> Rasm tanlash
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setMImageFile(f); setMImage(URL.createObjectURL(f)); } }} />
                  </label>
                  {mImage && <div style={{ position: "relative" }}><img src={mImage} alt="" style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 8 }} /><button type="button" onClick={() => { setMImage(null); setMImageFile(null); }} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "var(--r)", color: "#fff", border: "none", cursor: "pointer", fontSize: 12 }}>×</button></div>}
                </div>
              </div>
              <div className="frow2">
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Viloyat</label>
                  <select className="fi" value={mReg} onChange={(e) => setMReg(e.target.value)}>
                    {regionOptions.map((r) => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl" style={{ display: "flex", alignItems: "center", gap: 6 }}><MiscIcons.Sparkles size={14} /> AI jiddiylik tahlili</label>
                  <div style={{ padding: "10px 14px", background: "var(--bg-elevated)", borderRadius: 10, border: "1.5px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                    {aiAnalyzing ? <span style={{ fontSize: 12, color: "var(--muted)" }}>Tahlil qilinmoqda...</span> : (
                      <span style={{ background: mPri === "low" ? "var(--g3)" : mPri === "medium" ? "var(--a2)" : mPri === "high" ? "var(--r2)" : "#FEE2E2", color: mPri === "low" ? "var(--g)" : mPri === "medium" ? "var(--a)" : mPri === "high" ? "var(--r)" : "#DC2626", fontSize: 12, fontWeight: 800, padding: "4px 10px", borderRadius: 6 }}>{{ low: "Past", medium: "O'rta", high: "Jiddiy", critical: "Kritik" }[mPri]}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="fg" style={{ marginTop: 10 }}>
                <label className="fl">📍 Joylashuv</label>
                <div className="loc-box" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <MiscIcons.MapPin size={16} />
                  <span>{fLat ? `${fLat.toFixed(5)}°N, ${fLng.toFixed(5)}°E` : "Xaritada bosing yoki GPS aniqlang"}</span>
                </div>
                <button className="gps-btn" onClick={doGPS} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}><MiscIcons.Locate size={14} /> GPS bilan avtomatik aniqlash</button>
              </div>
              <button className="sbtn cit" disabled={citSubmitting} onClick={submitCit} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {citSubmitting ? "Yuborilmoqda..." : <><MiscIcons.Send size={16} /> Yuborish</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ GOV MODAL ══════ */}
      {showGovMod && (
        <div className="mov" onClick={(e) => e.target === e.currentTarget && setShowGovMod(false)}>
          <div className="modal">
            <div className="mh"><div className="mh-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Landmark size={18} /> Hal etildi da'vosi</div><button className="xbtn" onClick={() => setShowGovMod(false)}><MiscIcons.X size={16} /></button></div>
            <div className="mbody">
              <div className="gov-warning" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><MiscIcons.AlertTriangle size={16} style={{ flexShrink: 0 }} /><span><b>Muhim:</b> Fuqarolar bu da'voni dala sharoitida tekshiradi. Noto'g'ri da'volar jamoat bosimiga olib keladi.</span></div>
              <div className="fg">
                <label className="fl">Bog'liq muammo *</label>
                <select className="fi gov" value={gRel} onChange={(e) => setGRel(e.target.value)}>
                  <option value="">— Muammo tanlang —</option>
                  {issues.map((r) => (
                    <option key={r.id} value={r.id}>
                      {(r.title || `Muammo #${String(r.id).slice(0, 8)}`).substring(0, 64)}{r.region ? ` — ${r.region}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="fl">Rasmiy bayonot *</label>
                <textarea className="fi gov" style={{ resize: "vertical", minHeight: 75 }} placeholder="Masalan: Yo'l ta'miri 20-fevral kuni to'liq yakunlandi..." value={gSt} onChange={(e) => setGSt(e.target.value)}></textarea>
              </div>
              <div className="frow2">
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Mas'ul tashkilot</label>
                  <select className="fi gov" value={gOrg} onChange={(e) => setGOrg(e.target.value)}>
                    {["Yo'l qurilishi vazirligi", "Kommunal xizmatlar", "Energetika vazirligi", "Suv xo'jaligi vazirligi", "Ta'lim vazirligi", "Sog'liqni saqlash vazirligi", "Shaharsozlik vazirligi", "Ekologiya vazirligi", "Tuman hokimligi", "Viloyat hokimligi"].map((o) => <option key={o}>{o}</option>)}
                  </select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Sana</label>
                  <input className="fi gov" type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} />
                </div>
              </div>
              <div className="fg" style={{ marginTop: 10 }}>
                <label className="fl">Yangilangan holat</label>
                <select className="fi gov" value={gStatus} onChange={(e) => setGStatus(e.target.value)}>
                  <option value="in_progress">Jarayonda</option>
                  <option value="resolved">Hal qilindi</option>
                </select>
              </div>
              <button className="sbtn gov" disabled={govSubmitting} onClick={submitGov} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                {govSubmitting ? "..." : <><MiscIcons.Landmark size={16} /> Da'vo qo'shish</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ TOAST ══════ */}
      {toastMsg && (
        <div className={`toast ${cu?.role === "gov" ? "top-pos" : "bot"} ${toastShow ? "show" : ""}`}>
          {toastMsg}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════ ISSUE CARD ═══════════════════════════════════════ */
function IssueCard({ r, selId, onSel, onUp, onV }) {
  const cat = CATS[r.cat] || CATS.road;
  const CatIcon = CatIcons[r.cat] || CatIcons.road;
  const st = ST[r.status];
  const isC = r.gc && r.dis > r.con;
  const tot = r.con + r.dis;
  const pc = { low: "#22C55E", medium: "#F59E0B", high: "#EF4444", critical: "#7C3AED" }[r.priority];
  const pLabels = { low: "Past", medium: "O'rta", high: "Jiddiy", critical: "Kritik" };
  const pColors = ["#22C55E", "#F59E0B", "#EF4444", "#7C3AED"];
  const pKeys = ["low", "medium", "high", "critical"];

  return (
    <div className={`ic ${r.id === selId ? "sel" : ""}`} onClick={() => onSel(r.id)}>
      <div className="ic-row">
        <div className="cpill" style={{ background: `${cat.c}22`, color: cat.c, display: "flex", alignItems: "center", gap: 4 }}><CatIcon {...iconSizeSm} /> {cat.l}</div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {isC && <span style={{ background: "var(--a2)", color: "var(--a)", fontSize: 9, fontWeight: 800, padding: "2px 5px", borderRadius: 4, display: "inline-flex", alignItems: "center" }}><MiscIcons.AlertTriangle size={10} /></span>}
          <span className="sbadge" style={{ background: st.bg, color: st.c }}>{st.l}</span>
        </div>
      </div>
      <div className="ic-title">{r.title}</div>
      {r.image && <img src={r.image} alt="" style={{ width: "100%", maxHeight: 80, objectFit: "cover", borderRadius: 8, marginBottom: 6 }} />}
      <div className="ic-loc">📍 {r.region} · {r.time}</div>
      {r.gc && (
        <div className="gov-mini">
          <div className="gm-lbl"><MiscIcons.Landmark size={12} /> {r.gc.org}</div>
          <div className="gov-mini-text">"{r.gc.t.substring(0, 60)}..."</div>
          {tot > 0 && <>
            <div className="conf-bar">
              <div className="cb-g" style={{ flex: r.con || 0.01 }}></div>
              <div className="cb-r" style={{ flex: r.dis || 0.01 }}></div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--muted)" }}>
              <span style={{ color: "var(--g)" }}>✓{r.con}</span>
              <span style={{ color: "var(--r)" }}>✗{r.dis}</span>
            </div>
          </>}
          <div style={{ display: "flex", gap: 4, marginTop: 5 }}>
            <button className={`vb ok ${r.mv === "confirm" ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); onV(r.id, "confirm"); }}><MiscIcons.Check size={12} /> Tasdiqlash</button>
            <button className={`vb no ${r.mv === "dispute" ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); onV(r.id, "dispute"); }}><MiscIcons.X size={12} /> Rad etish</button>
          </div>
        </div>
      )}
      <div className="ic-bottom">
        <button className={`vb up ${r.voted ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); onUp(r.id); }}><MiscIcons.ThumbsUp size={12} /> {r.votes}</button>
        <span>{pKeys.map((p, i) => <span key={p} style={{ color: r.priority === p ? pColors[i] : "#E5E7EB", fontSize: 12 }}>●</span>)}</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ GOV SIDEBAR ═══════════════════════════════════════ */
function GovSidebar({ govView, setGovView, govMinSel, setGovMinSel, govRegSel, setGovRegSel, openCount, onOpenGovMod, burgerOpen, onBurgerClose, ministries = [], regionOptions = [] }) {
  const navItems = [
    { group: "Asosiy", items: [["map", "Xarita"], ["overview", "Umumiy ko'rinish"], ["regions", "Viloyatlar reytingi"], ["ministries", "Vazirliklar"]] },
    { group: "Muammolar", items: [["incoming", "Yangi", true], ["inprogress", "Jarayonda"], ["claims", "Da'volar tekshiruvi"]] },
    { group: "Tahlil", items: [["analytics", "Statistika"], ["accountability", "Shaffoflik"]] },
  ];
  return (
    <div className={`gov-sb ${burgerOpen ? "burger-open" : ""}`}>
      <div className="gsb-section">
        <div className="gsb-lbl">Vazirlik</div>
        <select className="gsb-sel" value={govMinSel} onChange={(e) => setGovMinSel(e.target.value)}>
          <option value="all">Barcha vazirliklar</option>
          {ministries.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}
        </select>
      </div>
      <div className="gsb-section">
        <div className="gsb-lbl">Viloyat</div>
        <select className="gsb-sel" value={govRegSel} onChange={(e) => setGovRegSel(e.target.value)}>
          <option value="all">Barcha viloyatlar</option>
          {regionOptions.map((r) => <option key={r}>{r}</option>)}
        </select>
      </div>
      <div className="gov-nav">
        {navItems.map(({ group, items }) => (
          <div key={group}>
            <div className="gns">{group}</div>
            {items.map(([v, lb, badge]) => {
              const GniIcon = GovNavIcons[v];
              return (
              <button key={v} className={`gnav ${(govView === v || (v === "regions" && govView === "regionDetail")) ? "on" : ""}`} onClick={() => { setGovView(v); onBurgerClose?.(); }}>
                <span className="gni">{GniIcon && <GniIcon size={16} />}</span>{lb}
                {badge && <span className="gbadge">{openCount}</span>}
              </button>
            );})}
          </div>
        ))}
      </div>
      <div style={{ padding: 10, borderTop: "1px solid var(--border)" }}>
        <button style={{ width: "100%", padding: 9, background: "var(--g)", color: "#fff", border: "none", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer" }} onClick={() => { onOpenGovMod(); onBurgerClose?.(); }}>+ Hal qilindi da'vosi</button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ GOV CONTENT ═══════════════════════════════════════ */
function GovContent({ govView, issues, regions = [], ministries = [], analyticsOverview, govFil, govMinSel, govRegSel, chSt, showToast, onOpenGovMod, getIsiColor, setGovRegSel, setGovMinSel, setGovView, govMapRef, govMapStyle, setGovMapStyle }) {
  const overviewTotals = analyticsOverview?.totals || {};
  const overviewRates = analyticsOverview?.rates || {};
  const totalIssues = Number(overviewTotals.issues ?? issues.length);
  const resolvedIssues = Number(overviewTotals.resolvedIssues ?? issues.filter((r) => r.status === "resolved").length);
  const resolutionRate = Number.isFinite(Number(overviewRates.resolutionRate))
    ? Math.round(Number(overviewRates.resolutionRate))
    : (totalIssues ? Math.round(resolvedIssues / totalIssues * 100) : 0);

  const stats = [
    { n: govFil.length, l: "Jami muammolar", c: "var(--p)", t: "Real vaqtda yangilanadi", view: "overview" },
    { n: govFil.filter((r) => r.status === "open").length, l: "Yangi / Ochiq", c: "var(--r)", t: "Tezkor javob zarur", view: "incoming" },
    { n: govFil.filter((r) => r.status === "in_progress").length, l: "Jarayonda", c: "#2563EB", t: "Mas'ul tayinlangan", view: "inprogress" },
    { n: govFil.filter((r) => r.status === "resolved").length, l: "Hal qilindi", c: "var(--g)", t: "Bu oy", view: "claims" },
    { n: govFil.filter((r) => r.gc && r.dis > r.con).length, l: "Ziddiyatli da'volar", c: "var(--a)", t: "Diqqat kerak", view: "claims" },
    { n: govFil.filter((r) => r.gc && r.con > r.dis).length, l: "Tasdiqlangan da'volar", c: "var(--g)", t: "Fuqarolar tasdiqladi", view: "claims" },
  ];
  const analyticsRegionMap = new Map(regions.map((r) => [r.name, r]));
  const fullRegionStats = Array.from(new Set([...KNOWN_REGIONS, ...regions.map((r) => r.name).filter(Boolean)])).map((regionName) => {
    const fromAnalytics = analyticsRegionMap.get(regionName);
    const regionIssues = issues.filter((issue) => issue.region === regionName);
    const openCount = regionIssues.filter((issue) => issue.status === "open").length;
    const inProgressCount = regionIssues.filter((issue) => issue.status === "in_progress").length;
    const resolvedCount = regionIssues.filter((issue) => issue.status === "resolved").length;
    const totalCount = openCount + inProgressCount + resolvedCount;
    const computedIsi = totalCount > 0 ? Math.round((resolvedCount / totalCount) * 100) : 0;

    return {
      name: regionName,
      isi: Number.isFinite(Number(fromAnalytics?.isi)) ? Number(fromAnalytics.isi) : computedIsi,
      trend: fromAnalytics?.trend || "+0",
      open: Number.isFinite(Number(fromAnalytics?.open)) ? Number(fromAnalytics.open) : openCount,
      prog: Number.isFinite(Number(fromAnalytics?.prog)) ? Number(fromAnalytics.prog) : inProgressCount,
      res: Number.isFinite(Number(fromAnalytics?.res)) ? Number(fromAnalytics.res) : resolvedCount,
      time: fromAnalytics?.time || "-",
      pop: fromAnalytics?.pop ?? null,
    };
  });
  const sortedR = fullRegionStats.sort((a, b) => b.isi - a.isi);

  function RmCard({ r, inprog }) {
    const cat = CATS[r.cat] || CATS.road;
    const RmCatIcon = CatIcons[r.cat] || CatIcons.road;
    const pc = { low: "#22C55E", medium: "#F59E0B", high: "#EF4444", critical: "#7C3AED" }[r.priority];
    return (
      <div className="rm-card" onClick={() => onOpenGovMod(r.id)}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span className="cpill" style={{ background: `${cat.c}22`, color: cat.c, display: "inline-flex", alignItems: "center", gap: 5 }}><RmCatIcon size={14} /> {cat.l}</span>
          <span style={{ background: `${pc}22`, color: pc, fontSize: 10, fontWeight: 800, padding: "4px 10px", borderRadius: 6 }}>{{ low: "Past", medium: "O'rta", high: "Jiddiy", critical: "Kritik" }[r.priority]}</span>
        </div>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6, lineHeight: 1.4 }}>{r.title}</div>
        {r.image && <img src={r.image} alt="" style={{ width: "100%", maxHeight: 120, objectFit: "cover", borderRadius: 8, marginBottom: 8 }} />}
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>{r.desc || ""}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>📍 {r.region} · 👍 {r.votes} ovoz · {r.time}</div>
        <div className="rm-actions">
          {!inprog && <button className="rma blue" onClick={(e) => { e.stopPropagation(); chSt(r.id, "in_progress"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MiscIcons.RefreshCw size={14} /> Jarayonga olish</button>}
          <button className="rma green" onClick={(e) => { e.stopPropagation(); onOpenGovMod(r.id); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MiscIcons.Check size={14} /> Hal qilindi da'vosi</button>
          <button className="rma amber" onClick={(e) => { e.stopPropagation(); if (!inprog) chSt(r.id, "in_progress"); showToast("✅ Mas'ul tayinlandi"); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><MiscIcons.HardHat size={14} /> Mas'ul</button>
        </div>
      </div>
    );
  }

  const catS = Object.keys(CATS).map((k) => ({ k, cat: CATS[k], n: issues.filter((r) => r.cat === k).length })).sort((a, b) => b.n - a.n);
  const mx = catS[0]?.n || 1;
  const analyticsStats = [
    { n: `${Math.max(0, resolutionRate)}%`, l: "Hal qilish foizi", c: "var(--g)", t: "Backend statistikasi" },
    { n: formatCount(overviewTotals.inProgressIssues ?? issues.filter((r) => r.status === "in_progress").length), l: "Jarayondagi ishlar", c: "var(--p)", t: "Faol nazorat ostida" },
    { n: formatCount(overviewTotals.issueVotes ?? issues.reduce((a, r) => a + r.votes, 0)), l: "Jami ovozlar", c: "var(--pu)", t: "Fuqaro faolligi" },
    { n: formatCount(overviewTotals.claims ?? issues.filter((r) => r.gc).length), l: "Hukumat da'volari", c: "var(--g)", t: "Shaffoflik ko'rsatkichi" },
  ];
  const gis = issues.filter((r) => r.gc);

  return (
    <div className="gov-content">
      {/* MAP */}
      <div className={`gview ${govView === "map" ? "on" : ""}`} style={{ display: govView === "map" ? "flex" : "none", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0, background: "var(--card)" }}>
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.MapPin size={20} /> Xarita</h2>
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Fuqarolar tomonidan yuborilgan barcha muammolar xaritada</p>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 400 }}>
          <div ref={govMapRef} style={{ width: "100%", height: "100%", minHeight: 400 }} />
          <div className="map-style-switch gov" role="group" aria-label="Xarita ko'rinishi">
            {MAP_STYLE_KEYS.map((styleKey) => (
              <button
                key={styleKey}
                type="button"
                className={`map-style-btn ${govMapStyle === styleKey ? "on" : ""}`}
                onClick={() => setGovMapStyle(styleKey)}
                title={`${MAP_STYLES[styleKey].label} ko'rinishi`}
              >
                {MAP_STYLES[styleKey].label}
              </button>
            ))}
          </div>
          <div className="mstat-ov" style={{ top: 14 }}>
            <div className="mso-row">
              <div className="mso"><div className="mso-n" style={{ color: "var(--p)" }}>{govFil.length}</div><div className="mso-l">Jami</div></div>
              <div className="mso"><div className="mso-n" style={{ color: "var(--r)" }}>{govFil.filter((r) => r.status === "open").length}</div><div className="mso-l">Ochiq</div></div>
              <div className="mso"><div className="mso-n" style={{ color: "#2563EB" }}>{govFil.filter((r) => r.status === "in_progress").length}</div><div className="mso-l">Jarayonda</div></div>
              <div className="mso"><div className="mso-n" style={{ color: "var(--g)" }}>{govFil.filter((r) => r.status === "resolved").length}</div><div className="mso-l">Hal qilindi</div></div>
            </div>
          </div>
        </div>
      </div>

      {/* OVERVIEW */}
      <div className={`gview ${govView === "overview" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.BarChart3 size={20} /> Umumiy ko'rinish</h2><p>Real vaqtda infratuzilma holati</p></div></div>
        <div className="stat-grid">{stats.map((s, i) => <div key={i} className="sc" onClick={() => setGovView && setGovView(s.view)}><div className="sc-n" style={{ color: s.c }}>{s.n}</div><div className="sc-l">{s.l}</div><div className="sc-t up">{s.t}</div></div>)}</div>
        <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><MiscIcons.Map size={16} /> Viloyatlar</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 14 }}>
          {sortedR.map((d, i) => { const col = getIsiColor(d.isi); const tUp = d.trend.startsWith("+"); return (
            <div key={d.name} className={`rgn-card ${govRegSel === d.name ? "sel-reg" : ""}`} onClick={() => { setGovRegSel(d.name); setGovView("regionDetail"); }}>
              <div className="rgn-top">
                <div><div className="rgn-name">{["🥇", "🥈", "🥉"][i] || `#${i + 1}`} {d.name}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{d.pop ? `${(d.pop / 1000000).toFixed(1)}M` : "-"}</div></div>
                <div><div className="isi-score" style={{ color: col }}>{d.isi}</div><div className="isi-trend" style={{ color: tUp ? "var(--g)" : "var(--r)" }}>{d.trend}</div></div>
              </div>
              <div className="isi-bar-bg"><div className="isi-bar-fill" style={{ width: `${d.isi}%`, background: `linear-gradient(90deg,${col}70,${col})` }}></div></div>
              <div className="rgn-stats">
                <div className="rs"><div className="rs-n" style={{ color: "var(--r)" }}>{d.open}</div><div className="rs-l">Ochiq</div></div>
                <div className="rs"><div className="rs-n" style={{ color: "var(--g)" }}>{d.res}</div><div className="rs-l">Hal</div></div>
                <div className="rs"><div className="rs-n" style={{ color: "var(--a)" }}>{d.time}</div><div className="rs-l">kun</div></div>
              </div>
            </div>
          ); })}
        </div>
      </div>

      {/* REGIONS — jadval ko'rinishi */}
      <div className={`gview ${govView === "regions" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Map size={20} /> Viloyatlar reytingi</h2><p>Barcha viloyatlar — ISI, Ochiq, Jarayonda, Hal qilindi</p></div></div>
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: "50px 2fr 80px 80px 90px 90px 90px 70px" }}>
            <div>#</div><div>Viloyat</div><div>Aholi</div><div>ISI</div><div>Ochiq</div><div>Jarayonda</div><div>Hal qilindi</div><div>Trend</div>
          </div>
          {sortedR.map((d, i) => {
            const col = getIsiColor(d.isi);
            const tUp = d.trend.startsWith("+");
            return (
              <div key={d.name} className="ct-row" style={{ gridTemplateColumns: "50px 2fr 80px 80px 90px 90px 90px 70px", cursor: "pointer" }} onClick={() => { setGovRegSel(d.name); setGovView("regionDetail"); }}>
                <div style={{ fontWeight: 800 }}>{i + 1}</div>
                <div><div style={{ fontWeight: 700 }}>{d.name}</div></div>
                <div style={{ color: "var(--muted)" }}>{d.pop ? `${(d.pop / 1000000).toFixed(1)}M` : "-"}</div>
                <div><span style={{ fontWeight: 800, color: col }}>{d.isi}</span></div>
                <div style={{ color: "var(--r)", fontWeight: 700 }}>{d.open}</div>
                <div style={{ color: "#2563EB", fontWeight: 700 }}>{d.prog}</div>
                <div style={{ color: "var(--g)", fontWeight: 700 }}>{d.res}</div>
                <div style={{ color: tUp ? "var(--g)" : "var(--r)", fontWeight: 700 }}>{d.trend}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* REGION DETAIL - viloyatdagi barcha muammolar */}
      <div className={`gview ${govView === "regionDetail" ? "on" : ""}`}>
        <div className="gvh">
          <div className="gvh-left">
            <button onClick={() => setGovView("overview")} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, background: "none", border: "none", color: "var(--muted)", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
              <MiscIcons.ChevronLeft size={16} /> Orqaga
            </button>
            <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Map size={20} /> {govRegSel || "Viloyat"} — barcha muammolar</h2>
            <p>{govFil.length} ta muammo · Ochiq, Jarayonda, Hal qilindi</p>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {["open", "in_progress", "resolved"].map((status) => {
            const list = govFil.filter((r) => r.status === status);
            const lbl = { open: "Ochiq", in_progress: "Jarayonda", resolved: "Hal qilindi" }[status];
            const col = { open: "var(--r)", in_progress: "#2563EB", resolved: "var(--g)" }[status];
            if (list.length === 0) return null;
            return (
              <div key={status}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, color: col }}>
                  <span style={{ width: 12, height: 12, borderRadius: "50%", background: col }}></span>
                  {lbl} ({list.length})
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {list.map((r) => <RmCard key={r.id} r={r} inprog={status === "in_progress"} />)}
                </div>
              </div>
            );
          })}
        </div>
        {govRegSel && govRegSel !== "all" && govFil.length === 0 && (
          <div className="empty"><div className="empty-i"><MiscIcons.Check size={36} /></div>Bu viloyatda muammo yo'q</div>
        )}
      </div>

      {/* MINISTRIES */}
      <div className={`gview ${govView === "ministries" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Landmark size={20} /> Barcha vazirliklar</h2><p>Vazirlik bo'yicha muammo statistikasi</p></div></div>
        <div className="min-panel-grid">
          {ministries.map((m) => {
            const open = Number(m.openIssues ?? 0);
            const resolved = Number(m.resolvedIssues ?? 0);
            const conflict = Number(m.conflictIssues ?? 0);
            const McIcon = MinistryIcons[m.key];
            return (
              <div key={m.key} className={`min-card ${govMinSel === m.key ? "sel-min" : ""}`} onClick={() => setGovMinSel(m.key)}>
                <div className="mc-icon">{McIcon && <McIcon size={28} strokeWidth={2} />}</div>
                <div className="mc-name">{m.name}</div>
                <div className="mc-stat">
                  <div className="mc-stat-item" style={{ color: "var(--r)" }}><span style={{ color: "var(--r)" }}>•</span> {open}</div>
                  <div className="mc-stat-item" style={{ color: "var(--g)" }}><MiscIcons.Check size={12} /> {resolved}</div>
                  {conflict > 0 && <div className="mc-stat-item" style={{ color: "var(--a)" }}><MiscIcons.AlertTriangle size={12} /> {conflict}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* INCOMING */}
      <div className={`gview ${govView === "incoming" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Inbox size={20} /> Yangi muammolar</h2><p>Fuqarolar yuborgan, javob kutayotgan</p></div></div>
        {govFil.filter((r) => r.status === "open").length === 0
          ? <div className="empty"><div className="empty-i"><MiscIcons.Check size={36} strokeWidth={2} /></div>Yangi muammo yo'q!</div>
          : govFil.filter((r) => r.status === "open").map((r) => <RmCard key={r.id} r={r} inprog={false} />)}
      </div>

      {/* IN PROGRESS */}
      <div className={`gview ${govView === "inprogress" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.RefreshCw size={20} /> Jarayondagi ishlar</h2><p>Mas'ul tayinlangan muammolar</p></div></div>
        {govFil.filter((r) => r.status === "in_progress").length === 0
          ? <div className="empty"><div className="empty-i"><MiscIcons.ClipboardList size={36} strokeWidth={1.5} /></div>Jarayondagi ish yo'q</div>
          : govFil.filter((r) => r.status === "in_progress").map((r) => <RmCard key={r.id} r={r} inprog={true} />)}
      </div>

      {/* CLAIMS */}
      <div className={`gview ${govView === "claims" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.Scale size={20} /> Da'volar va tekshiruv</h2><p>Hukumat da'volari — fuqaro verifikatsiyasi</p></div></div>
        <div className="ctable">
          <div className="ct-head" style={{ gridTemplateColumns: "2fr 1.5fr 1fr 90px 1.2fr 1.2fr 100px" }}><div>Muammo</div><div>Tashkilot</div><div>Sana</div><div>Jiddiylik</div><div>✓ Tasdiqlash</div><div>✗ Rad etish</div><div>Holat</div></div>
          {issues.filter((r) => r.gc).map((r) => {
            const tot = r.con + r.dis;
            const cp = tot ? Math.round(r.con / tot * 100) : 0;
            const dp = tot ? Math.round(r.dis / tot * 100) : 0;
            const isC = r.dis > r.con;
            const pc = { low: "#22C55E", medium: "#F59E0B", high: "#EF4444", critical: "#7C3AED" }[r.priority] || "#F59E0B";
            return (
              <div key={r.id} className="ct-row" style={{ background: isC ? "rgba(245,158,11,0.14)" : "", gridTemplateColumns: "2fr 1.5fr 1fr 90px 1.2fr 1.2fr 100px" }} onClick={() => onOpenGovMod(r.id)}>
                <div><div style={{ fontSize: 12, fontWeight: 700 }}>{r.title}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>📍 {r.region}</div></div>
                <div style={{ fontSize: 11 }}>{r.gc.org}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.gc.date}</div>
                <div><span className="sbadge" style={{ background: `${pc}22`, color: pc, fontSize: 10 }}>{{ low: "Past", medium: "O'rta", high: "Jiddiy", critical: "Kritik" }[r.priority] || "O'rta"}</span></div>
                <div><div style={{ fontSize: 12, fontWeight: 700, color: "var(--g)" }}>✓ {r.con}</div><div style={{ fontSize: 10, color: "var(--muted)" }}>{cp}%</div></div>
                <div><div style={{ fontSize: 12, fontWeight: 700, color: isC ? "var(--r)" : "var(--muted)" }}>✗ {r.dis}</div><div style={{ fontSize: 10, color: isC ? "var(--r)" : "var(--muted)" }}>{dp}%{isC ? " ⚠️" : ""}</div></div>
                <div><span className="sbadge" style={{ background: isC ? "var(--a2)" : r.con > r.dis ? "var(--g2)" : "var(--bg)", color: isC ? "var(--a)" : r.con > r.dis ? "var(--g)" : "var(--muted)" }}>{isC ? "Ziddiyat" : r.con > r.dis ? "Tasdiqlandi" : "Kutilmoqda"}</span></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ANALYTICS */}
      <div className={`gview ${govView === "analytics" ? "on" : ""}`}>
        <div className="gvh"><div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.TrendingUp size={20} /> Statistika</h2><p>Ishlash ko'rsatkichlari va tahlil</p></div></div>
        <div className="stat-grid">{analyticsStats.map((s, i) => <div key={i} className="sc"><div className="sc-n" style={{ color: s.c }}>{s.n}</div><div className="sc-l">{s.l}</div><div className="sc-t up">{s.t}</div></div>)}</div>
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1.5px solid var(--border)", padding: 16, marginTop: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, display: "flex", alignItems: "center", gap: 6 }}><MiscIcons.BarChart3 size={16} /> Toifalar bo'yicha taqsimot</div>
          {catS.map(({ k, cat, n }) => {
            const CatBarIcon = CatIcons[k];
            return (
            <div key={k} className="cat-bar">
              <div className="cat-bar-lbl" style={{ display: "flex", alignItems: "center", gap: 4 }}>{CatBarIcon && <CatBarIcon size={14} />} {cat.l}</div>
              <div className="cat-bar-track"><div className="cat-bar-fill" style={{ width: `${Math.round(n / mx * 100)}%`, background: cat.c }}>{n}</div></div>
            </div>
          );})}
        </div>
      </div>

      {/* ACCOUNTABILITY */}
      <div className={`gview ${govView === "accountability" ? "on" : ""}`}>
        <div className="gvh">
          <div className="gvh-left"><h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><MiscIcons.FileSearch size={20} /> Shaffoflik paneli</h2><p>Hukumat–Fuqaro ziddiyat ko'rsatkichi</p></div>
          <button onClick={() => onOpenGovMod(null)} style={{ background: "var(--g)", color: "#fff", border: "none", padding: "9px 14px", borderRadius: 9, fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap" }}>+ Da'vo qo'shish</button>
        </div>
        {gis.length === 0
          ? <div className="empty"><div className="empty-i"><MiscIcons.Landmark size={36} strokeWidth={1.5} /></div>Hali da'vo yo'q<br />
            <button onClick={() => onOpenGovMod(null)} style={{ marginTop: 10, padding: "8px 16px", background: "var(--g)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer" }}>+ Da'vo qo'shish</button>
          </div>
          : gis.map((r) => {
            const tot = r.con + r.dis;
            const isC = r.dis > r.con; const isV = r.con > r.dis;
            const pres = tot ? Math.round(r.dis / tot * 100) : 0;
            const cp = tot ? Math.round(r.con / tot * 100) : 0;
            const dp = tot ? Math.round(r.dis / tot * 100) : 0;
            return (
              <div key={r.id} className="acc-card">
                <div className="acc-gov-part">
                  <div style={{ fontSize: 10, fontWeight: 800, color: "var(--g)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}><MiscIcons.Landmark size={12} /> {r.gc.org} · {r.gc.date}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{r.title}</div>
                  <div style={{ fontSize: 12, color: "#065F46", fontStyle: "italic" }}>"{r.gc.t}"</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>📍 {r.region} · {ST[r.status].l}</div>
                </div>
                <div className="acc-cit-part">
                  <div style={{ fontSize: 10, fontWeight: 800, color: isC ? "var(--r)" : isV ? "var(--g)" : "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                    {isC ? "ZIDDIYAT ANIQLANDI" : isV ? "FUQAROLAR TASDIQLADI" : "TEKSHIRILMOQDA"}
                  </div>
                  {tot > 0 ? <>
                    <div className="acc-big-bar">
                      <div style={{ flex: r.con || 0.01, background: "var(--g)" }}></div>
                      <div style={{ flex: r.dis || 0.01, background: "var(--r)" }}></div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
                      <span style={{ color: "var(--g)", fontWeight: 700 }}>✓ {r.con} ({cp}%)</span>
                      <span style={{ color: "var(--r)", fontWeight: 700 }}>✗ {r.dis} ({dp}%)</span>
                    </div>
                  </> : <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Hali tekshirilmagan</div>}
                  {isC && <div className="conf-alert" style={{ display: "flex", alignItems: "flex-start", gap: 8 }}><MiscIcons.AlertTriangle size={16} style={{ flexShrink: 0 }} /><span>Jamoat bosimi {pres}% — Tezkor tekshiruv va jamoatchilikka javob zarur!</span></div>}
                  <div className="pm-wrap">
                    <div className="pm-row"><span>Jamoat bosimi</span><span style={{ fontWeight: 800, color: pres > 60 ? "var(--r)" : pres > 30 ? "var(--a)" : "var(--g)" }}>{pres}%</span></div>
                    <div className="pm-track"><div className="pm-fill" style={{ width: `${pres}%` }}></div></div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════ UZBEKISTAN SVG MAP ═══════════════════════════════════════ */
function UzbekistanSVG({ regions, selRegion, onSelect, getIsiColor }) {
  const getColor = (name) => {
    if (name === "Toshkent shahri") return "#1641C8";
    const d = regions.find((r) => r.name === name);
    return d ? getIsiColor(d.isi) : "#94A3B8";
  };
  const reg = (name, points, lx, ly, isRect = false, rx = 0, ry = 0, rw = 0, rh = 0) => {
    const fill = getColor(name);
    const isSel = selRegion === name;
    const baseProps = { fill, cursor: "pointer", stroke: "#fff", strokeWidth: isSel ? 3 : 1.5, onClick: () => onSelect(name), style: { transition: "0.2s" }, className: isSel ? "sel-reg" : "" };
    if (isRect) return <rect key={name} x={rx} y={ry} width={rw} height={rh} rx={4} {...baseProps} />;
    return <polygon key={name} points={points} {...baseProps} />;
  };
  return (
    <svg className="uzmap" viewBox="0 0 420 280">
      {reg("Qoraqalpog'iston Resp.", "10,10 145,10 145,35 130,80 110,120 80,145 40,145 10,110")}
      <text className="rlabel" x="72" y="70">Qoraqalpog'iston</text>
      {reg("Xorazm viloyati", "80,145 110,120 130,130 130,165 105,185 80,175")}
      <text className="rlabel" x="105" y="158">Xorazm</text>
      {reg("Navoiy viloyati", "130,80 200,60 240,80 245,140 220,180 175,195 130,165 130,130 130,80")}
      <text className="rlabel" x="183" y="132">Navoiy</text>
      {reg("Buxoro viloyati", "40,145 80,175 105,185 130,165 175,195 155,245 110,265 40,255 20,210")}
      <text className="rlabel" x="90" y="218">Buxoro</text>
      {reg("Samarqand viloyati", "245,140 265,120 295,130 300,170 280,195 245,188 220,180")}
      <text className="rlabel" x="265" y="162">Samarqand</text>
      {reg("Qashqadaryo viloyati", "245,188 280,195 300,170 310,210 295,255 255,265 220,250 220,210")}
      <text className="rlabel" x="263" y="223">Qashqadaryo</text>
      {reg("Surxondaryo viloyati", "295,255 310,210 330,220 335,265 310,270")}
      <text className="rlabel" x="313" y="247">Surxon</text>
      {reg("Jizzax viloyati", "265,120 300,100 330,110 330,145 305,155 295,130")}
      <text className="rlabel" x="297" y="132">Jizzax</text>
      {reg("Sirdaryo viloyati", "330,110 365,95 370,120 355,140 330,145")}
      <text className="rlabel" x="349" y="123">Sirdaryo</text>
      {reg("Toshkent viloyati", "305,155 330,145 355,140 365,165 345,185 320,190 300,170")}
      <text className="rlabel" x="330" y="168">Toshkent vil.</text>
      {reg("Toshkent shahri", "", 0, 0, true, 336, 150, 30, 24)}
      <text className="rlabel" x="351" y="165" style={{ fontSize: 6 }}>Toshkent</text>
      {reg("Namangan viloyati", "365,95 400,75 410,95 400,120 375,130 365,120 370,120")}
      <text className="rlabel" x="388" y="106">Namangan</text>
      {reg("Farg'ona viloyati", "375,130 400,120 410,140 400,165 380,170 360,160 365,165 355,140")}
      <text className="rlabel" x="382" y="149">Farg'ona</text>
      {reg("Andijon viloyati", "400,120 410,95 410,140")}
      <text className="rlabel" x="405" y="120">And.</text>
    </svg>
  );
}



