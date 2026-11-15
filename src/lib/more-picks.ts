import type { Thing } from '../types/content';

export function getMorePicks(thing: Thing, things: Thing[]): Thing[] {
  const available = new Map(things.map((pick) => [pick.id, pick]));
  const seen = new Set([thing.id]);
  const picks: Thing[] = [];
  for (const id of thing.morePickIds) {
    const pick = available.get(id);
    // 公開データに存在する参照だけを、microCMS の設定順で表示する。
    if (!pick || seen.has(id)) continue;
    seen.add(id);
    picks.push(pick);
  }
  return picks;
}
