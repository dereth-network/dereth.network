// An allegiance's listed members, highest rank first, each linked to its page; or, for every
// allegiance the directory shows no member of, the one page that says so.
import { build, byId, errorNotice, fill, pageHub } from '../network/dom.ts';
import {
  PAGE,
  absentAllegianceView,
  allegianceHeadView,
  allegiancePage,
  entryView,
} from '../network/directory.ts';
import type { DirectoryEntry } from '../network/hub.ts';

const hub = pageHub();
const notices = byId('notices');
const panel = byId('allegiance');
const head = byId('allegiance-head');
const list = byId<HTMLUListElement>('list');
const more = byId<HTMLButtonElement>('more');
let next: number | null = null;
let where: { world: string; key: string } | null = null;

function append(entries: DirectoryEntry[]) {
  for (const entry of entries) {
    const item = build(entryView(entry, { withPatron: true }));
    if (item) list.append(item);
  }
}

more.addEventListener('click', async () => {
  if (next === null || !where) return;
  more.disabled = true;
  try {
    const page = await hub.directoryAllegiance(where.world, where.key, {
      limit: PAGE,
      offset: next,
    });
    if (!page) return;
    append(page.data);
    next = page.nextOffset;
    more.hidden = next === null;
  } catch (error) {
    fill(notices, errorNotice(error));
  } finally {
    more.disabled = false;
  }
});

try {
  const found = await allegiancePage(hub, location.search);
  if (!found) {
    fill(byId('absent'), build(absentAllegianceView()));
  } else {
    where = found;
    const name = found.page.allegiance.name;
    if (name) document.title = `${name} · Directory · Dereth Network`;
    fill(head, build(allegianceHeadView(found.page)));
    append(found.page.data);
    next = found.page.nextOffset;
    more.hidden = next === null;
    panel.hidden = false;
  }
} catch (error) {
  fill(notices, errorNotice(error));
}
