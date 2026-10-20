// The landing page's headings link to each program's latest release on GitHub. The repository
// releases several programs under one list, each tagged with its own prefix (`dereth-v0.4.4`,
// `empyrean-v0.3.2`, `lyceum-v…`), so the newest one of each is picked from that list. A heading
// keeps the link written in the page (the releases filtered by its prefix) until GitHub answers,
// and keeps it for good if GitHub doesn't.

export const RELEASES_API =
  'https://api.github.com/repos/dereth-network/dereth/releases?per_page=100';

/** A release, as GitHub's API lists it: only what's read here. */
export interface Release {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
}

/** The newest published, non-prerelease release of `product`, from GitHub's list, newest first.
 * `dereth` doesn't take `dereth-web`'s releases. */
export function latestRelease(releases: Release[], product: string): Release | null {
  const tag = new RegExp(`^${product}-v\\d`);
  return releases.find((r) => tag.test(r.tag_name) && !r.draft && !r.prerelease) ?? null;
}

/** Points each `a[data-release]` at its product's latest release; one without a release keeps its
 * link, or stays plain text if it has none. */
export async function linkReleases(root: ParentNode = document): Promise<void> {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('a[data-release]')];
  if (links.length === 0) return;
  let releases: Release[];
  try {
    const answer = await fetch(RELEASES_API, {
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!answer.ok) return;
    releases = await answer.json();
  } catch {
    return;
  }
  if (!Array.isArray(releases)) return;
  for (const link of links) {
    const release = latestRelease(releases, link.dataset.release ?? '');
    if (release?.html_url.startsWith('https://github.com/')) {
      link.href = release.html_url;
      link.title = release.tag_name;
    }
  }
}
