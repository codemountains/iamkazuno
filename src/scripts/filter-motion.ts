interface ItemSnapshot {
  rect: DOMRect;
  opacity: string;
}

// 絞り込み自体は同期的に完了させ、動きは表示だけに加える。
export function initFilterMotion(grid: HTMLElement, items: HTMLElement[]) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hoverPointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const animations = new Set<Animation>();
  let outgoingLayer: HTMLUListElement | null = null;

  function cancel() {
    for (const animation of animations) animation.cancel();
    animations.clear();
    outgoingLayer?.remove();
    outgoingLayer = null;
  }

  function animate(element: HTMLElement, keyframes: Keyframe[], duration: number, onFinish?: () => void) {
    const animation = element.animate(keyframes, {
      duration,
      easing: 'cubic-bezier(.2,.7,.2,1)',
    });
    animations.add(animation);
    animation.addEventListener('finish', () => {
      animations.delete(animation);
      onFinish?.();
    }, { once: true });
  }

  function inViewport(rect: DOMRect) {
    return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  }

  function fadeOut(item: HTMLElement, snapshot: ItemSnapshot) {
    if (!outgoingLayer) {
      outgoingLayer = document.createElement('ul');
      outgoingLayer.setAttribute('aria-hidden', 'true');
      outgoingLayer.inert = true;
      Object.assign(outgoingLayer.style, {
        position: 'fixed', inset: '0', margin: '0', padding: '0',
        listStyle: 'none', overflow: 'hidden', pointerEvents: 'none', zIndex: '1',
      });
      document.body.append(outgoingLayer);
    }

    // 元のカードはすでにhidden。残像は操作・読み上げ・レイアウトに参加しない。
    const ghost = item.cloneNode(true) as HTMLElement;
    ghost.hidden = false;
    ghost.removeAttribute('data-item');
    ghost.removeAttribute('data-categories');
    for (const element of [ghost, ...ghost.querySelectorAll('[id], [aria-labelledby]')]) {
      element.removeAttribute('id');
      element.removeAttribute('aria-labelledby');
    }
    Object.assign(ghost.style, {
      position: 'absolute', margin: '0',
      left: `${snapshot.rect.left}px`, top: `${snapshot.rect.top}px`,
      width: `${snapshot.rect.width}px`, height: `${snapshot.rect.height}px`,
    });
    const layer = outgoingLayer;
    layer.append(ghost);
    animate(ghost, [{ opacity: snapshot.opacity }, { opacity: 0 }], 110, () => {
      ghost.remove();
      if (!layer.childElementCount) {
        layer.remove();
        if (outgoingLayer === layer) outgoingLayer = null;
      }
    });
  }

  function update(change: () => void, options: { animate?: boolean; pointerType?: string } = {}) {
    const shouldAnimate = options.animate !== false && !reducedMotion.matches && typeof grid.animate === 'function';
    const rearrange = hoverPointer.matches && (!options.pointerType || options.pointerType === 'mouse');
    const before = new Map<HTMLElement, ItemSnapshot>();

    if (shouldAnimate && rearrange) {
      for (const item of items) {
        if (!item.hidden) before.set(item, { rect: item.getBoundingClientRect(), opacity: getComputedStyle(item).opacity });
      }
    }
    // 連打時は現在の見た目を記録してから古い演出を解除する。
    cancel();
    change();
    if (!shouldAnimate) return;

    if (!rearrange) {
      animate(grid, [{ opacity: 0.35 }, { opacity: 1 }], 160);
      return;
    }

    // 計測を先にまとめ、カードごとの書き込みで再レイアウトを繰り返さない。
    const after = new Map(items.filter((item) => !item.hidden).map((item) => [item, item.getBoundingClientRect()]));
    for (const item of items) {
      const previous = before.get(item);
      const next = after.get(item);
      if (!next) {
        if (previous && inViewport(previous.rect)) fadeOut(item, previous);
        continue;
      }
      if (!inViewport(next)) continue;

      const dx = previous ? previous.rect.left - next.left : 0;
      const dy = previous ? previous.rect.top - next.top : 0;
      const nearby = previous && inViewport(previous.rect) && Math.hypot(dx, dy) <= Math.max(next.width, next.height) * 1.5;
      if (nearby) {
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Number(previous.opacity) < 1) {
          animate(item, [
            { transform: `translate(${dx}px, ${dy}px)`, opacity: previous.opacity },
            { transform: 'translate(0, 0)', opacity: 1 },
          ], 220);
        }
      } else {
        // 遠いカードは画面を横断させず、その場で短く表示する。
        animate(item, [{ opacity: 0 }, { opacity: 1 }], 160);
      }
    }
  }

  reducedMotion.addEventListener('change', cancel);
  hoverPointer.addEventListener('change', cancel);
  window.addEventListener('resize', cancel, { passive: true });
  window.addEventListener('scroll', cancel, { passive: true });
  window.addEventListener('pagehide', cancel);
  document.addEventListener('picks:resize', cancel);

  return { update };
}
