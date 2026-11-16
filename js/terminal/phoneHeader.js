/**
 * js/terminal/phoneHeader.js: the phone header's More menu (2026-11-17). At 700px and under (js/terminal/phone-header.css) the header's right-hand controls live in a
 * sheet that the More button opens. The controls are not rebuilt: they keep their ids, data-surface attributes and listeners, so the feature loaders
 * (terminalFeel.js) and the access hiding keep working. The only DOM move is #cmdbtn (the command box, shown as a magnifier) and #asofchip (LIVE / PAST):
 * on a phone they sit in the bar next to More; above 700px they go back where they were in .tright.
 * Accessible: the More button carries aria-expanded and aria-controls, the sheet traps Tab, Esc closes it and returns focus to More, a tap outside closes it.
 */
export const PHONE_MQ = '(max-width: 700px)';

export function mountPhoneHeader({ doc = document, win = window } = {}) {
  const top = doc.querySelector('header.top');
  const topin = top?.querySelector('.topin');
  const tright = topin?.querySelector('.tright');
  const more = doc.getElementById('hdrmore');
  if (!top || !topin || !tright || !more) return null;
  const cmd = doc.getElementById('cmdbtn');
  const chip = doc.getElementById('asofchip');
  const asofbtn = doc.getElementById('asofbtn');
  const mq = win.matchMedia ? win.matchMedia(PHONE_MQ) : null;
  let phone = false;
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const visible = e => !e.hidden && !e.closest('[hidden]') && win.getComputedStyle(e).display !== 'none';
  const sheetItems = () => [...tright.querySelectorAll(FOCUSABLE)].filter(visible);
  const isOpen = () => top.classList.contains('hm-open');

  function setOpen(on, { focus = true } = {}) {
    on = !!on && phone;
    top.classList.toggle('hm-open', on);
    more.setAttribute('aria-expanded', String(on));
    if (on && focus) { const first = sheetItems()[0]; if (first) first.focus(); }
  }

  function apply(isPhone) {
    if (isPhone === phone && more.dataset.ready) return;
    phone = isPhone;
    more.dataset.ready = '1';
    if (isPhone) {
      if (cmd && cmd.parentElement !== topin) topin.insertBefore(cmd, tright);
      if (chip && chip.parentElement !== topin) topin.insertBefore(chip, tright);
      if (cmd) { cmd.setAttribute('readonly', ''); cmd.setAttribute('inputmode', 'none'); }
    } else {
      setOpen(false, { focus: false });
      if (cmd && cmd.parentElement !== tright) tright.insertBefore(cmd, tright.firstChild);
      if (chip && chip.parentElement !== tright) tright.insertBefore(chip, asofbtn && asofbtn.parentElement === tright ? asofbtn : null);
      if (cmd) { cmd.removeAttribute('readonly'); cmd.removeAttribute('inputmode'); }
    }
  }

  more.addEventListener('click', () => setOpen(!isOpen()));
  doc.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); more.focus(); return; }
    if (e.key === 'Tab') {
      const items = [more, ...sheetItems()];
      if (!items.length) return;
      const i = items.indexOf(doc.activeElement);
      const next = e.shiftKey ? (i <= 0 ? items.length - 1 : i - 1) : (i === -1 || i === items.length - 1 ? 0 : i + 1);
      e.preventDefault();
      items[next].focus();
    }
  });
  doc.addEventListener('click', e => {
    if (!isOpen()) return;
    const t = e.target;
    if (more.contains(t)) return;
    if (!tright.contains(t)) { setOpen(false, { focus: false }); return; }
    // a button in the sheet (Alerts, Time machine, Linked...) opens its own panel: fold the sheet once that has run; the colour picker stays inside the sheet
    const b = t.closest?.('button, a[href]');
    if (b && b.id !== 'themebtn' && !b.closest('#themepop')) win.setTimeout(() => setOpen(false, { focus: false }), 120);
  });
  if (mq) {
    const on = () => apply(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', on); else mq.addListener?.(on);
    apply(mq.matches);
  } else apply(false);
  return { isOpen, open: () => setOpen(true), close: () => setOpen(false), isPhone: () => phone };
}

if (typeof document !== 'undefined' && !globalThis.__DESK_TEST__) {
  try { mountPhoneHeader(); } catch (e) { console.warn('phone header', e); }
}
