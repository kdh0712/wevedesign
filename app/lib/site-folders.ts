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
// 특별시·광역시 with their suffix, anywhere in those words. 광주시 is 경기 광주시, so it is left to CITY_OR_COUNTY.
const METROPOLITAN_FULL = /^(서울|부산|대구|인천|광주|대전|울산|세종)(?:특별시|광역시|특별자치시)$|^(서울|부산|대구|인천|대전|울산|세종)시$/;
// A bare 서울 or 세종 names the city only as the first word: '산본 세종 6단지' is an apartment in 군포, '경기 광주' is 경기 광주시.
const METROPOLITAN_SHORT = ['서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종'];
const CITY_OR_COUNTY = /^[가-힣]{1,6}[시군]$/;

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function siteStage(status: unknown): SiteStage {
  if (status === '계약' || status === '시공중') return '진행중';
  if (status === '완료') return '완료';
  return '미체결';
}

// The first 시·군 among the address's first words (after a postcode or a 도), 특별시·광역시 by their short name.
// Anything else (no address, '의왕 내손동' without 시, a 신도시) is 지역 미정.
export function siteRegion(address: unknown): string {
  const words = text(address)
    .split(/[\s,()[\]]+/)
    .filter(Boolean)
    .slice(0, REGION_WORDS);
  let firstWord = true;
  for (const written of words) {
    // 수원특례시 is 수원시.
    const word = written.replace(/특례시$/, '시');
    const metropolitan = METROPOLITAN_FULL.exec(word);
    if (metropolitan) return metropolitan[1] || metropolitan[2];
    if (firstWord && METROPOLITAN_SHORT.includes(word)) return word;
    // A postcode before the address does not count as its first word.
    if (/[가-힣]/.test(word)) firstWord = false;
    // 평촌신도시, 산본신도시: a 신도시 is a neighbourhood, not a city.
    if (CITY_OR_COUNTY.test(word) && !word.endsWith('도시')) return word;
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
