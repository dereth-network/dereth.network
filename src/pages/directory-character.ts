// A listed character's page: its profile, as its world last sent it, and its allegiance's listed
// members, each linked; or, for every address the directory does not show, the one page that
// says so.
import { build, byId, errorNotice, fill, pageHub } from '../network/dom.ts';
import { characterPage } from '../network/directory.ts';

const notices = byId('notices');
const profile = byId('profile');

try {
  const { title, view } = await characterPage(pageHub(), location.search);
  if (title) document.title = `${title} · Directory · Dereth Network`;
  fill(profile, build(view));
} catch (error) {
  fill(notices, errorNotice(error));
} finally {
  profile.setAttribute('aria-busy', 'false');
}
