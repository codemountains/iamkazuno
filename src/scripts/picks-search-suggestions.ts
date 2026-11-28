import type { PickSearchEvidence, PickSearchHit } from '../lib/picks-search';
import { getPickSearchMatch, type MatchPart } from '../lib/picks-search-match';
import { getThingImageSources } from '../lib/thing-image';
import { rememberCollectionDeparture } from './picks-navigation';

function addThumbnail(option: HTMLAnchorElement, link: HTMLAnchorElement) {
  const cardImage = link.querySelector<HTMLImageElement>('[data-collection-image]');
  if (!cardImage) return;

  const thumbnail = new Image(44, 44);
  thumbnail.className = 'picks-suggestion-thumbnail';
  thumbnail.alt = '';
  thumbnail.decoding = 'async';
  thumbnail.addEventListener('error', () => thumbnail.remove(), { once: true });
  if (cardImage.currentSrc && !cardImage.currentSrc.startsWith('data:')) {
    // 一覧で既に選ばれた画像は、候補でも同じURLを再利用する。
    thumbnail.src = cardImage.currentSrc;
  } else {
    const url = cardImage.dataset.imageSrc ?? cardImage.src;
    const sources = getThingImageSources({ url, width: Number(cardImage.getAttribute('width')) });
    if (sources) {
      thumbnail.sizes = `${thumbnail.width}px`;
      thumbnail.srcset = sources.webpSrcset;
    }
    thumbnail.src = sources?.src ?? url;
  }
  option.prepend(thumbnail);
}

function matchLine(parts: readonly MatchPart[], className: string) {
  const line = document.createElement('span');
  line.className = className;
  for (const { text, matched } of parts) {
    if (matched) {
      const mark = document.createElement('mark');
      mark.textContent = text;
      line.append(mark);
    } else {
      line.append(text);
    }
  }
  return line;
}

export function initSearchSuggestions(input: HTMLInputElement, panel: HTMLElement) {
  const list = panel.querySelector<HTMLElement>('[role="listbox"]')!;
  const more = panel.querySelector<HTMLButtonElement>('#picks-suggestions-more')!;
  const moreCount = more.querySelector<HTMLElement>('#picks-suggestions-more-count')!;
  let options: HTMLAnchorElement[] = [];
  let pendingDetails: Array<() => Promise<void>> = [];
  let active = -1;
  let requested = false;
  let composing = false;

  function select(index: number) {
    options[active]?.setAttribute('aria-selected', 'false');
    active = index;
    const option = options[index];
    if (option) {
      option.setAttribute('aria-selected', 'true');
      input.setAttribute('aria-activedescendant', option.id);
      option.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function refresh() {
    const open = requested && !composing && !!input.value.trim() && options.length > 0;
    panel.hidden = !open;
    if (open && !more.hidden) list.setAttribute('aria-describedby', moreCount.id);
    else list.removeAttribute('aria-describedby');
    input.setAttribute('aria-expanded', String(open));
    if (open) {
      for (const load of pendingDetails.splice(0)) void load();
    } else {
      select(-1);
    }
  }

  function open() {
    if (document.activeElement !== input && document.activeElement !== more) return;
    requested = true;
    refresh();
  }

  function close() {
    // Escape や Tab で閉じた後に検索が完了しても、候補を開き直さない。
    requested = false;
    refresh();
  }

  function update(
    items: ReadonlySet<HTMLElement> | undefined,
    query: string,
    hits: ReadonlyMap<string, PickSearchHit>,
  ) {
    select(-1);
    options = [];
    pendingDetails = [];
    const rows = document.createDocumentFragment();
    for (const item of items ?? []) {
      const link = item.querySelector<HTMLAnchorElement>('.item-card-link');
      const title = link?.querySelector('.item-copy .thing-name')?.textContent?.trim();
      if (!link || !title) continue;

      const row = document.createElement('li');
      row.setAttribute('role', 'none');
      const option = document.createElement('a');
      option.href = link.href;
      option.id = `${list.id}-${options.length + 1}`;
      option.tabIndex = -1;
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      const copy = document.createElement('span');
      copy.className = 'picks-suggestion-copy';
      option.append(copy);
      const variant = link.querySelector('.item-copy .thing-variant')?.textContent?.trim();
      const brand = link.querySelector('.item-brand')?.textContent?.trim();
      const hit = hits.get(link.pathname);
      const render = (evidence?: PickSearchEvidence) => {
        const match = getPickSearchMatch(query, { ...evidence, title, variant, brand });
        const heading = document.createElement('span');
        heading.append(matchLine(match.title, 'picks-suggestion-title'));
        if (variant) heading.append(' ', matchLine(match.variant, 'thing-variant'));
        copy.replaceChildren(heading);
        if (brand) copy.append(' ', matchLine(match.brand, 'picks-suggestion-brand'));
        if (match.detail) {
          const detail = matchLine(match.detail.parts, 'picks-suggestion-detail');
          detail.dataset.matchKind = match.detail.kind;
          copy.append(' ', detail);
        }
      };
      render(hit);
      pendingDetails.push(async () => {
        addThumbnail(option, link);
        if (!hit) return;
        const evidence = await hit.loadEvidence();
        // 入力やカテゴリが変わった後で届いた詳細は、その時点の候補に反映しない。
        if (option.isConnected) render(evidence);
      });
      option.addEventListener('click', (event) => rememberCollectionDeparture(event, link));
      options.push(option);
      row.append(option);
      rows.append(row);
      if (options.length === 5) break;
    }
    list.replaceChildren(rows);
    const remaining = (items?.size ?? 0) - options.length;
    more.hidden = remaining === 0;
    moreCount.textContent = remaining
      ? `${remaining} more ${remaining === 1 ? 'thing' : 'things'}`
      : '';
    refresh();
  }

  function closeIfOutside(event: Event) {
    if (
      requested &&
      event.target !== input &&
      event.target instanceof Node &&
      !panel.contains(event.target)
    )
      close();
  }

  function dismissSuggestions() {
    input.focus({ preventScroll: true });
    close();
  }

  function onKeydown(event: KeyboardEvent) {
    if (composing || event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!options.length) return;
      event.preventDefault();
      open();
      const last = more.hidden ? options.length - 1 : options.length;
      const current = event.currentTarget === more ? options.length : active;
      let next = current + 1;
      if (event.key === 'ArrowUp') next = current <= 0 ? last : current - 1;
      else if (next > last) next = 0;

      if (next === options.length) {
        more.focus();
      } else {
        input.focus({ preventScroll: true });
        select(next);
      }
    } else if (event.key === 'Escape') {
      if (requested && input.value) event.preventDefault();
      dismissSuggestions();
    } else if (event.currentTarget === input) {
      if (event.key === 'Tab') close();
      if (event.key === 'Enter' && !panel.hidden && active >= 0) {
        event.preventDefault();
        options[active].click();
      }
    }
  }

  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  more.addEventListener('focus', () => select(-1));
  more.addEventListener('click', dismissSuggestions);
  more.addEventListener('keydown', onKeydown);
  input.addEventListener('input', (event) => {
    if ((event as InputEvent).isComposing) close();
    else open();
  });
  input.addEventListener('compositionstart', () => {
    composing = true;
    refresh();
  });
  input.addEventListener('compositionend', () => {
    composing = false;
    open();
  });
  input.addEventListener('keydown', onKeydown);

  // クリックやタップで候補を選ぶ間も、入力欄にフォーカスを保つ。
  panel.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
  // iOS では候補をタップしている途中で入力欄が blur する。外側での操作を確認してから閉じる。
  document.addEventListener('pointerdown', closeIfOutside);
  document.addEventListener('focusin', closeIfOutside);
  window.addEventListener('pagehide', close);
  return update;
}
