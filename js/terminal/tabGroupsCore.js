// js/terminal/tabGroupsCore.js: the PURE half of the tidy navigation (js/terminal/tabGroups.js). Which original tabs sit under which nav button. No DOM.
// Every id is an existing tab (data-t). The order of a group's tabs is the order of its pills; the first is where a click on the group lands the first time.
export const GROUPS = [
  { id: 'today', label: 'Today', tabs: ['overview', 'changed'] },
  { id: 'markets', label: 'Markets', tabs: ['assets', 'pair', 'deep', 'monitor', 'kchart'] },
  { id: 'ccy', label: 'Currencies', tabs: ['ccy'] },
  { id: 'macro', label: 'Macro', tabs: ['macro'] },
  { id: 'opts', label: 'Options & positioning', tabs: ['options', 'pos'] },
  { id: 'events', label: 'Events', tabs: ['cal', 'news'] },
  { id: 'chain', label: 'Chain & read', tabs: ['today', 'read'] },
  { id: 'rels', label: 'Correlations', tabs: ['corr', 'insight'] },
  { id: 'record', label: 'Time & record', tabs: ['replay', 'charts', 'ana'] },
  { id: 'tools', label: 'Tools', tabs: ['bprocess', 'workspace', 'infomap', 'media'] },
];

/** The group id a tab belongs to, or null. */
export const groupOf = t => GROUPS.find(g => g.tabs.includes(t))?.id ?? null;

/** The tabs of a group that this login may see (`off` = a Set of tab ids switched off). */
export const pillsFor = (gid, off = new Set()) => (GROUPS.find(g => g.id === gid)?.tabs ?? []).filter(t => !off.has(t));

/** The groups with at least one visible tab. A single-tab group is a plain button; the label is the group's. */
export const visibleGroups = (off = new Set()) => GROUPS.filter(g => pillsFor(g.id, off).length > 0);
