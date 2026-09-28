import { useEffect, useRef, useState } from 'react';
import findPosition from '../engine/p4/portraitPositions';
import findWidth from '../engine/p4/portraitWidths';

export interface P4CanvasState {
  portrait: string;
  custom: string;
  name: string;
  text: string;
  font: string;
  char: string;
  emote: string;
  costume: string;
  boxType: string; // 'golden' | 'vanilla'
}

interface Props extends P4CanvasState {
  onReadyChange?: (ready: boolean) => void;
}

const W = 1275;
const H = 800;

const BOX_POS: Record<string, number[]> = {
  goldenBack: [61, 546, 1200, 256],
  goldenFront: [42.5, 621, 1200, 171],
  vanillaBack: [63, 524, 1225, 274],
  vanillaFront: [75, 600, 1200, 175],
};

const withCacheBuster = (src: string) => (src.includes('?') ? `${src}&r=1` : `${src}?r=1`);

// P4 text budgets (canvas px), probed structurally from the shipped box art
// (all values measured, not guessed):
// - Name: plate top-edge at name x is y≈561 (golden) / y≈525 (vanilla); the
//   plate is only ~55px tall there, so the name is capped to the plate's
//   visible width before the slant cuts it: golden 480, vanilla 460.
// - Dialogue: opaque bubble spans at the legacy text rows give per-line
//   room from each line's x: golden [1165, 1162, 656], vanilla [1195, 1198,
//   793] (line 3 starts where the plate tail cuts the bubble).
const P4_NAME_LEN = { golden: 480, vanilla: 460 };
const P4_LINE_LEN: Record<string, number[]> = {
  golden: [1165, 1162, 656],
  vanilla: [1195, 1198, 793],
};

/** Truncate with … so the measured width fits maxWidth (same font on ctx). */
const fitEllipsis = (ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string => {
  if (!value || ctx.measureText(value).width <= maxWidth) return value;
  const ell = '…';
  if (ctx.measureText(ell).width > maxWidth) return '';
  let lo = 0;
  let hi = value.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ctx.measureText(value.slice(0, mid) + ell).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return value.slice(0, Math.max(0, lo - 1)) + ell;
};

/**
 * Single-canvas P4 renderer. Draw order: background -> portrait -> box back ->
 * box front -> name + dialogue text. Keeps the original positions, widths,
 * and per-version layout.
 *
 * Reliability: every source image bumps `assetTick` on load AND error, so the
 * paint effect re-runs as assets arrive — first paint no longer depends on the
 * user typing. Fonts are awaited via document.fonts with a bounded poll.
 */
export default function P4Canvas(props: Props) {
  const { portrait, custom, name, text, font, char, emote, costume, boxType, onReadyChange } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  const customRef = useRef<HTMLImageElement>(null);
  const backRef = useRef<HTMLImageElement>(null);
  const frontRef = useRef<HTMLImageElement>(null);
  const fontOkRef = useRef(false);
  const readyRef = useRef(false);
  const readyCbRef = useRef(onReadyChange);
  readyCbRef.current = onReadyChange;

  const version = boxType === 'vanilla' ? 'vanilla' : 'golden';

  const [assetTick, setAssetTick] = useState(0);
  const [imgRetry, setImgRetry] = useState(0);

  const bump = () => setAssetTick((t) => t + 1);

  // New portrait URL -> allow one retry again.
  useEffect(() => {
    setImgRetry(0);
  }, [portrait]);

  useEffect(() => {
    let alive = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    fontOkRef.current = false;

    const report = () => {
      const bgOk = !bgRef.current || bgRef.current.complete;
      const backOk = !backRef.current || backRef.current.complete;
      const frontOk = !frontRef.current || frontRef.current.complete;
      const porEl = portraitRef.current;
      const porOk = char === 'None' || !portrait || (porEl ? porEl.complete : true);
      const cusEl = customRef.current;
      const cusOk = !custom || (cusEl ? cusEl.complete : true);
      const ready = bgOk && backOk && frontOk && porOk && cusOk && fontOkRef.current;
      if (ready !== readyRef.current) {
        readyRef.current = ready;
        readyCbRef.current?.(ready);
      }
    };

    const draw = () => {
      if (!alive) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = bgRef.current;
      if (bg && bg.complete && bg.naturalWidth > 0) {
        ctx.drawImage(bg, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#FEE727';
        ctx.fillRect(0, 0, W, H);
      }

      // Portrait
      if (char !== 'None') {
        const useCustom = custom !== '' && customRef.current?.complete && (customRef.current?.naturalWidth ?? 0) > 0;
        if (useCustom && customRef.current) {
          const img = customRef.current;
          const x = version === 'golden' ? 795 : 870;
          const y = version === 'golden' ? 175 : 154;
          ctx.drawImage(img, x, y, img.naturalWidth, img.naturalHeight);
        } else {
          const img = portraitRef.current;
          if (img && img.complete && img.naturalWidth > 0) {
            const width = findWidth(char, emote, costume) as number;
            const iH = img.naturalHeight;
            const iW = img.naturalWidth;
            const targetArea = iH * width;
            const newWidth = Math.sqrt((iW / iH) * targetArea);
            const newHeight = targetArea / newWidth;
            const position = findPosition(version, char, emote, costume) as number[];
            ctx.drawImage(img, position[0], position[1], newWidth, newHeight);
          }
        }
      }

      // P4 layers (bot engine parity): portrait -> box back -> box front,
      // drawn at the ORIGINAL 1275x800 coordinates. The boxes sit at
      // (40,330,1195,145) area; name + dialogue use the bot's exact coords.
      const back = backRef.current;
      const front = frontRef.current;
      if (version === 'golden') {
        if (back && back.complete && back.naturalWidth > 0) {
          const p = BOX_POS.goldenBack;
          ctx.drawImage(back, p[0], p[1], p[2], p[3]);
        }
        if (front && front.complete && front.naturalWidth > 0) {
          const p = BOX_POS.goldenFront;
          ctx.drawImage(front, p[0], p[1], p[2], p[3]);
        }
      } else {
        if (back && back.complete && back.naturalWidth > 0) {
          const p = BOX_POS.vanillaBack;
          ctx.drawImage(back, p[0], p[1], p[2], p[3]);
        }
        if (front && front.complete && front.naturalWidth > 0) {
          const p = BOX_POS.vanillaFront;
          ctx.drawImage(front, p[0], p[1], p[2], p[3]);
        }
      }

      // Text: fitted to the art's own budgets — name truncated to the plate,
      // dialogue word-wrapped to max 3 lines with … tail. Never spills past
      // the bubble or the plate edge.
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `26pt ${font}`;
      const fitName = fitEllipsis(ctx, name, P4_NAME_LEN[version as 'golden' | 'vanilla'] ?? 480);
      if (version === 'golden') {
        ctx.fillStyle = '#4B2A14';
        ctx.fillText(fitName, 80, font === 'SkipStd-B' ? 615 : 612);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillText(fitName, 85, font === 'SkipStd-B' ? 590 : 587);
      }
      ctx.fillStyle = '#fff';
      const budgets = P4_LINE_LEN[version] ?? P4_LINE_LEN.golden;
      const wrapLine = (value: string, maxWidth: number): string[] => {
        const words = value.split(/\s+/).filter(Boolean);
        const out: string[] = [];
        let cur = '';
        for (const word of words) {
          if (ctx.measureText(word).width > maxWidth) {
            if (cur) {
              out.push(cur);
              cur = '';
            }
            let chunk = '';
            for (const ch of word) {
              if (ctx.measureText(chunk + ch).width > maxWidth) {
                out.push(chunk);
                chunk = ch;
              } else {
                chunk += ch;
              }
            }
            if (chunk) cur = chunk;
            continue;
          }
          const next = cur ? `${cur} ${word}` : word;
          if (ctx.measureText(next).width > maxWidth) {
            out.push(cur);
            cur = word;
          } else {
            cur = next;
          }
        }
        if (cur) out.push(cur);
        return out;
      };
      const wrapped: string[] = [];
      for (const rawLine of text.split('\n')) wrapped.push(...wrapLine(rawLine, budgets[0]));
      if (!wrapped.length) wrapped.push('');
      const shown = wrapped.slice(0, 3);
      if (wrapped.length > 3) shown[2] = fitEllipsis(ctx, `${shown[2]} …`, budgets[2]);
      const fitted = [0, 1, 2].map((i) => fitEllipsis(ctx, shown[i] ?? '', budgets[i] ?? budgets[0]));
      if (version === 'golden') {
        ctx.fillText(fitted[0], 93, 670);
        ctx.fillText(fitted[1] ?? '', 93, 715);
        ctx.fillText(fitted[2] ?? '', 93, 760);
      } else {
        ctx.fillText(fitted[0], 100, 645);
        ctx.fillText(fitted[1] ?? '', 100, 690);
        ctx.fillText(fitted[2] ?? '', 100, 735);
      }

      report();
    };

    const markFontOk = () => {
      if (!alive) return;
      fontOkRef.current = true;
      draw();
    };

    // Bounded font wait: poll document.fonts so a slow font can't leave the
    // canvas stuck in a fallback face. Caps at ~10s, then paints regardless.
    const ensureFont = (triesLeft: number) => {
      if (!alive) return;
      let ok = true;
      try {
        ok = !document.fonts?.check || document.fonts.check(`26pt "${font}"`, name || 'A');
      } catch {
        ok = true;
      }
      if (ok || triesLeft <= 0) {
        markFontOk();
        return;
      }
      setTimeout(() => ensureFont(triesLeft - 1), 250);
    };

    draw();
    try {
      const loader = document.fonts?.load(`26pt "${font}"`, name || 'A');
      if (loader && typeof loader.then === 'function') {
        loader.then(
          () => ensureFont(40),
          () => ensureFont(40),
        );
      } else {
        ensureFont(40);
      }
    } catch {
      ensureFont(0);
    }

    return () => {
      alive = false;
    };
  }, [portrait, custom, name, text, font, char, emote, costume, boxType, version, assetTick, imgRetry]);

  const onPortraitError = () => {
    if (imgRetry === 0 && portrait) {
      setImgRetry(1);
    } else {
      bump();
    }
  };

  return (
    <div className="canvas-frame">
      <canvas ref={canvasRef} id="dialogueCanvas" width={W} height={H} />
      <img ref={bgRef} className="hidden-img" alt="" src="img/p4-background.png" crossOrigin="anonymous" onLoad={bump} onError={bump} />
      {portrait && char !== 'None' ? (
        <img
          ref={portraitRef}
          className="hidden-img"
          alt="portrait"
          src={imgRetry ? withCacheBuster(portrait) : portrait}
          crossOrigin="anonymous"
          onLoad={bump}
          onError={onPortraitError}
        />
      ) : null}
      {custom ? (
        <img ref={customRef} className="hidden-img" alt="custom portrait" src={custom} crossOrigin="anonymous" onLoad={bump} onError={bump} />
      ) : null}
      <img
        ref={backRef}
        className="hidden-img"
        alt="dialogue box back"
        src={`boxes/p4/db-${version}-back.png`}
        crossOrigin="anonymous"
        onLoad={bump}
        onError={bump}
      />
      <img
        ref={frontRef}
        className="hidden-img"
        alt="dialogue box front"
        src={`boxes/p4/db-${version}-front.png`}
        crossOrigin="anonymous"
        onLoad={bump}
        onError={bump}
      />
    </div>
  );
}
