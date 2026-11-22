export interface PickSearchEvidence {
  aliases?: readonly string[];
  description?: string;
  matchedMetaFields?: readonly string[];
  excerpt?: string;
}

export interface PickSearchHit {
  matchedMetaFields?: readonly string[];
  loadEvidence(): Promise<PickSearchEvidence>;
}

// 商品データと検索窓に同じ変換をかける。表示名には入力時の表記を残す。
export function normalizeSearchQuery(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/([a-zA-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[ぁ-ゖゝゞ]/g, (kana) => String.fromCharCode(kana.charCodeAt(0) + 0x60))
    .replace(/([a-z0-9])[-‐‑‒–—―−ー]+(?=[a-z0-9])/g, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}
