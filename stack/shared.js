/**
 * Wang Report Stack Assessment — Shared utilities
 * Used by both /stack/ and /stack/catalog/
 */

// Data loaded by the page; both pages call loadSharedData() then use these globals
var CAP_MAP = {};      // capId → capability object (with sub_capabilities)
var MODULE_MAP = {};   // moduleId → module object (with coverage maps)
var VENDOR_MAP = {};   // vendorId → vendor object

async function loadSharedData(basePath) {
  // basePath: '../data' from catalog, '../../data' etc — caller provides
  const [capsData, vcData, vendorsData] = await Promise.all([
    fetch(basePath + '/capabilities.json').then(r => r.json()),
    fetch(basePath + '/vendor-capabilities.json').then(r => r.json()),
    fetch(basePath + '/vendors.json').then(r => r.json()),
  ]);

  (capsData.capabilities || capsData).forEach(c => { CAP_MAP[c.id] = c; });
  (vcData.modules || vcData).forEach(m => { MODULE_MAP[m.module_id] = m; });
  (vendorsData.vendors || []).forEach(v => { VENDOR_MAP[v.id] = v; });

  return { caps: Object.values(CAP_MAP), modules: Object.values(MODULE_MAP), vendors: Object.values(VENDOR_MAP) };
}

const LEVEL_VAL = { full: 1.0, partial: 0.5, none: 0.0 };

function computeSlotCoverageDetailed(capId, vendorEntries, capDef) {
  const subCaps = capDef.sub_capabilities;
  if (!subCaps || subCaps.length === 0) {
    return { score: vendorEntries.length > 0 ? 1.0 : 0.0, gaps: [], criticalGaps: [], subCapCount: 0, perSubCap: [] };
  }
  let weightedCovSum = 0, weightSum = 0;
  const gaps = [], criticalGaps = [], perSubCap = [];
  for (const sc of subCaps) {
    let combined = 0;
    const contributors = [];
    for (const entry of vendorEntries) {
      const mod = MODULE_MAP[entry.module_id];
      const level = mod?.coverage?.[capId]?.sub_caps?.[sc.id] ?? 'none';
      const val = LEVEL_VAL[level] ?? 0;
      combined = Math.min(1.0, combined + val);
      if (val > 0) contributors.push({ module_id: entry.module_id, vendor_id: entry.vendor_id, level });
    }
    const w = sc.weight ?? 1.0;
    weightedCovSum += combined * w;
    weightSum += w;
    const covLevel = combined >= 1.0 ? 'full' : combined > 0 ? 'partial' : 'none';
    if (combined < 1.0) { gaps.push(sc.id); if (sc.required) criticalGaps.push(sc.id); }
    perSubCap.push({ ...sc, combined, covLevel, contributors });
  }
  return { score: weightSum > 0 ? weightedCovSum / weightSum : 0, gaps, criticalGaps, subCapCount: subCaps.length, perSubCap };
}

// Read stack from localStorage (wr_stack_v2)
function loadStackFromStorage() {
  try {
    const raw = localStorage.getItem('wr_stack_v2');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function gradeLabel(score) {
  if (score === null || score === undefined) return '—';
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 45) return 'D';
  return 'F';
}
