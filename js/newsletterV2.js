/**
 * The V2 newsletter: the same builder as the current one (js/newsletter.js) with `layout: 'v2'` set, so every V2 change sits behind that flag and the
 * current output is untouched until the owner picks. Atlas builds both from the same data and shows them side by side ("Compare with V2").
 * The V2 masthead carries a "V2 draft" tag so the two can never be mixed up. Add each V2 change in newsletter.js as `n.layout === 'v2' ? new : current`.
 *
 * Pure. Tested in js/newsletter.test.mjs.
 */
import { buildNewsletter } from './newsletter.js';

export const buildNewsletterV2 = n => buildNewsletter({ ...n, layout: 'v2' });
