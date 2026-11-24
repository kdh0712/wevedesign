// The 현장 관리 folders: 진행중 · 미체결 · 완료 by status, and 지역별 by the 시·군 read from the address. Pure and
// import-free, so Node tests can load it directly. Spec: docs/superpowers/specs/2026-11-24-site-folders-design.md

export type SiteStage = '진행중' | '미체결' | '완료';
export const SITE_STAGES: readonly SiteStage[] = ['진행중', '미체결', '완료'];
export const NO_REGION = '지역 미정';

// '' is 전체; a stage name; or 'region:<지역>'.
export type SiteFolder = string;
export type SiteFolderCounts = { all: number; stages: Record<SiteStage, number>; regions: { name: string; count: number }[] };

type FolderSite = { status?: unknown; address?: unknown; deletedAt?: unknown };

const REGION_PREFIX = 'region:';
// Only the first few words name the region; a 시 further on is a building or a road, not a city.
const REGION_WORDS = 4;
const METROPOLITAN: [RegExp, (match: RegExpExecArray) => string][] = [
  [/^(서울|부산|대구|인천|대전|울산)(?:특별시|광역시|시)?$/, (match) => match[1]],
  // 광주시 is 경기 광주시, so only 광주 and 광주광역시 are the 광역시.
  [/^광주(?:광역시)?$/, () => '광주'],
  [/^세종(?:특별자치시|시)?$/, () => '세종'],
];
const CITY_OR_COUNTY = /^[가-힣]{1,6}[시군]$/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function siteStage(status: unknown): SiteStage {
  if (status === '계약' || status === '시공중') return '진행중';
  if (status === '완료') return '완료';
  return '미체결';
}

// The first 시·군 among the address's first words (after a postcode or a 도), 특별시·광역시 by their short name.
export function siteRegion(address: unknown): string {
  const words = text(address)
    .split(/[\s,()[\]]+/)
    .filter(Boolean)
    .slice(0, REGION_WORDS);
  for (const word of words) {
    for (const [pattern, name] of METROPOLITAN) {
      const match = pattern.exec(word);
      if (match) return name(match);
    }
    if (CITY_OR_COUNTY.test(word)) return word;
  }
  return NO_REGION;
}

export function regionFolder(name: string): SiteFolder {
  return `${REGION_PREFIX}${name}`;
}

export function siteInFolder(site: FolderSite, folder: SiteFolder): boolean {
  if (!folder) return true;
  if (folder.startsWith(REGION_PREFIX)) return siteRegion(site.address) === folder.slice(REGION_PREFIX.length);
  return siteStage(site.status) === folder;
}

// Every site not in the trash, whatever the search says. Regions: most sites first, then 가나다, 지역 미정 last.
export function countSiteFolders(sites: readonly FolderSite[]): SiteFolderCounts {
  const stages: Record<SiteStage, number> = { 진행중: 0, 미체결: 0, 완료: 0 };
  const regions = new Map<string, number>();
  let all = 0;
  for (const site of sites) {
    if (site.deletedAt) continue;
    all += 1;
    stages[siteStage(site.status)] += 1;
    const region = siteRegion(site.address);
    regions.set(region, (regions.get(region) || 0) + 1);
  }
  const sorted = [...regions]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => {
      if ((a.name === NO_REGION) !== (b.name === NO_REGION)) return a.name === NO_REGION ? 1 : -1;
      return b.count - a.count || a.name.localeCompare(b.name, 'ko');
    });
  return { all, stages, regions: sorted };
}

// A remembered folder, kept only while it still means something: an unknown value is 전체, and so is a region with no
// sites left once the sites have loaded (before that, every region looks empty).
export function resolveSiteFolder(folder: unknown, counts: SiteFolderCounts, loaded: boolean): SiteFolder {
  if (folder === '' || (SITE_STAGES as readonly unknown[]).includes(folder)) return folder as SiteFolder;
  if (typeof folder !== 'string' || !folder.startsWith(REGION_PREFIX) || folder.length === REGION_PREFIX.length) return '';
  const name = folder.slice(REGION_PREFIX.length);
  return !loaded || counts.regions.some((region) => region.name === name) ? folder : '';
}
