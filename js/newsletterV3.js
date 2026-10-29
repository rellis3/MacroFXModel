/**
 * The V3 newsletter: the daily as "the state of the levels today". Page 1 is the Today opening; then the global backdrop, the currencies and the pairs as they
 * stand today against yesterday's close; the 20-day investigation shrinks to a backdrop page. Same builder as V2 with `v3: true`, so it sits beside the
 * others and nothing in the current output changes.
 *
 * Every row is a measured figure with a plain-words line for what it measures. Nothing here forecasts a direction. The currency scorecard moves slowly and
 * the feed carries no saved yesterday, so that table shows the state, not the day's change, and says so.
 *
 * Pure. Tested in js/newsletterV3.test.mjs.
 */
import { buildNewsletter } from './newsletter.js';

export const buildNewsletterV3 = n => buildNewsletter({ ...n, layout: 'v2', v3: true });

/** The released daily: V3 without the draft tag, with today's headline as the email subject. Weekly editions are not V3 and come back unchanged. */
export const releaseNewsletterV3 = n => buildNewsletter({ ...n, layout: 'v2', v3: true, release: true });
