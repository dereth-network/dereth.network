// Join a world: the link a host's launcher copies opens here, the world after the `#`. The page
// sends nothing anywhere: it shows the world and offers to open it in Dereth, or to get Dereth.
import { byId, fill, h, notice } from '../network/dom.ts';
import { GET_DERETH, TEXT, appLink, shown, worldFromHash } from '../network/join.ts';

const world = byId('world');
const actions = byId('actions');
const named = worldFromHash(location.hash);

if (named) {
  const { name, where } = shown(named);
  fill(
    world,
    h('p', { class: 'lead-line' }, TEXT.lead),
    h('p', { class: 'world-name' }, name),
    h('p', { class: 'world-where' }, h('code', {}, where)),
  );
  fill(
    actions,
    h(
      'div',
      { class: 'buttons' },
      h('a', { class: 'btn lit', href: appLink(named) }, TEXT.open),
      h('a', { class: 'btn', href: GET_DERETH }, TEXT.get),
    ),
    h('p', { class: 'hint' }, TEXT.how),
    h('p', { class: 'hint' }, TEXT.noDereth),
  );
} else {
  fill(world, notice('note', TEXT.noWorld));
  fill(
    actions,
    h('div', { class: 'buttons' }, h('a', { class: 'btn lit', href: GET_DERETH }, TEXT.get)),
  );
}

// A link opened again with another world after the `#` shows that one.
addEventListener('hashchange', () => location.reload());
