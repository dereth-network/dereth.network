// The network page: the worlds linked to the network now, under its opening lines. The rest of
// the page is the page itself; if the hub can't be reached, the line just stays hidden.
import { byId, pageHub } from '../network/dom.ts';

pageHub()
  .network()
  .then(({ worlds }) => {
    const names = worlds
      .filter((w) => w.online)
      .map((w) => w.name)
      .sort((a, b) => a.localeCompare(b));
    if (names.length === 0) return;
    byId('live-names').textContent = names.join(', ');
    byId('live').hidden = false;
  })
  .catch(() => {});
