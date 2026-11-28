// js/terminal/jarvisModMedia.js: MEDIA, Helix's own copy of the desk terminal's Media tab: every H.E.L.I.X. video by London day (played in place, one at a time) and the
// podcast with its player and private feed link. Owner only (GET /api/helix/media). The drawing is shared with the tab: js/terminal/mediaView.js (pure half mediaCore.js).
// Description only: titles, programmes, lengths and dates.
import { registerJarvisModule } from './jarvisModules.js';

registerJarvisModule({
  id: 'media', label: 'MEDIA',
  render(pane, api) {
    pane.classList.add('jv-today');                    // the wide, centred pane (the HUD drops the class when another panel opens)
    pane.innerHTML = '<p class="jv-sub">Loading the media list...</p>';
    import('./mediaView.js').then(V => V.mount(pane, { variant: 'helix', win: api.win, doc: api.doc }))
      .catch(e => { pane.innerHTML = `<p class="jv-am">The media panel did not load: ${api.esc(e.message)}</p>`; });
  },
});
