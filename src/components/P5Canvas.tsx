import { useEffect, useRef, useState } from 'react';
import { simplePositions, findSpecialPosition } from '../engine/p5/portraitPositions';
import { findRandomNumbers, findTextCoords } from '../engine/p5/nameAndTextTools';
import { nameBoxUrl } from '../data/game';

export interface P5CanvasState {
  portrait: string;
  custom: string;
  name: string;
  text: string;
  font: string;
  char: string;
  emote: string;
  costume: string;
  boxType: string;
}

const W = 1275;
const H = 500;

const ANGLE: Record<string, number> = {
  main: -14.65,
  noPortrait: -18.55,
  dancing: 0,
  strikers: -5.5,
};

interface Props extends P5CanvasState {
  onBoxArt?: (kind: 'small' | 'medium' | 'large' | 'named') => void;
  onReadyChange?: (ready: boolean) => void;
}

const withCacheBuster = (src: string) => (src.includes('?') ? `${src}&r=1` : `${src}?r=1`);

// Name budget per box: the name is CENTERED on its anchor, so the binding
// limit is the TIGHTER side of the plate in the rotated text frame. Probed
// per size-art at its own draw offset + legacy anchor (plate span at the
// text row in the rotated frame):
// small/named 584 / medium 600 / large 616 (noPortrait 394 at
// (392,425)/-18.55°, dancing 840 at (660,353)/0°, strikers 586 at
// (500,371)/-5.5°). Fitted BEFORE the legacy tile roll (rolled on the fitted
// string), so picks can never go stale.
// NOTE: an earlier revision used tiny budgets here (116/178/242) measured
// from a misread probe (opaque zigzag span ABOVE the text row, not AT it).
// Those truncated every normal name to ~5 chars ("Ann" fit, everything else
// got …). The plate is ~580px wide at the text row — trust the at-row probe.
const NAME_LEN: Record<string, number> = {
  main: 584,
  noPortrait: 394,
  dancing: 840,
  strikers: 586,
};
// Per-size room for `main` (blank art swaps by width, so the budget grows):
// small 584 / medium 600 / large 616. Named per-character art uses 584.
const NAME_LEN_MAIN: Record<string, number> = { small: 584, medium: 600, large: 616 };

// Max dialogue-line width (canvas px) per box: dark-bubble interior at the
// legacy text rows (white border walls subtracted, 14px right padding).
// Probed per size-art at its own draw offset, dark runs only:
// small [636,606,576] / medium [622,607,577] / large [637,607,577] — the
// three main arts share ~the same bubble, so `main` uses one set:
// [636,607,577]. noPortrait [615,644,567], dancing [749,761,772],
// strikers [570,552,534]. Line 3 of every box is narrower (tail wedge) —
// the wrap uses per-line budgets so line 3 truncates instead of overflowing.
const LINE_LEN: Record<string, number[]> = {
  main: [636, 607, 577],
  noPortrait: [615, 644, 567],
  dancing: [749, 761, 772],
  strikers: [570, 552, 534],
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
 * Single-canvas P5 renderer. Draw order: background -> portrait -> name box art
 * -> name tiles + name text -> dialogue text. Keeps the original rotation math,
 * name-tile effect, and per-character box art.
 *
 * Reliability: every source image bumps `assetTick` on load AND error, so the
 * paint effect re-runs as assets arrive — first paint no longer depends on the
 * user typing. Fonts are awaited via document.fonts with a bounded poll.
 */
export default function P5Canvas(props: Props) {
  const { portrait, custom, name, text, font, char, emote, costume, boxType, onBoxArt, onReadyChange } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  const customRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLImageElement>(null);
  const tileSeedRef = useRef<{ name: string; picks: (number | null)[] }>({ name: '', picks: [] });
  const fontOkRef = useRef(false);
  const readyRef = useRef(false);
  const readyCbRef = useRef(onReadyChange);
  readyCbRef.current = onReadyChange;

  const [assetTick, setAssetTick] = useState(0);
  const [imgRetry, setImgRetry] = useState(0);

  // Decide blank-box size the same way the original did, and keep it live:
  // the generic db-main-{small,medium,large} art swaps with the measured name
  // width. Pure helper (no hooks) declared BEFORE both users, so the box URL
  // and the paint effect compute the same answer synchronously during render.
  // NOTE: `onBoxArt` is an unused legacy hint — kept in props for API compat.
  // The width thresholds (195/275) come straight from the original
  // ImageCanvas; keep them identical so named-vs-blank selection matches.
  // The drawn anchor shifts with the art (legacy parity): 418 / 456 / 495.
  // CRITICAL: measure the RAW name here, not the truncated fitName. Medium
  // and large arts exist precisely to hold longer names — truncating first
  // and then measuring would shrink every long name back to the small art
  // (Image 2: the main plate never grew, so text spilled past the bubble).
  const blankKindFor = (value: string): 'small' | 'medium' | 'large' => {
    void onBoxArt;
    const c = document.createElement('canvas').getContext('2d');
    if (!c || boxType !== 'main' || nameBoxUrl(font, value, boxType) !== null) return 'small';
    // Measure with the SAME font the plate text will use. A fallback font
    // here picks the wrong art size for one frame (the "Ann" smear).
    c.font = `18pt ${font}`;
    const w = c.measureText(value).width;
    return w <= 195 ? 'small' : w <= 275 ? 'medium' : 'large';
  };
  const blankKind = blankKindFor(name);
  // Drawn name anchor per blank size (legacy parity): 418 / 456 / 495,
  // matching the art each size ships (each size's plate sits further right).
  // Named per-character art uses the 418 anchor.
  const mainTextX = blankKind === 'medium' ? 456 : blankKind === 'large' ? 495 : 418;

  const boxUrl = (() => {
    const named = nameBoxUrl(font, name, boxType);
    if (named) return named;
    if (boxType === 'noPortrait') return 'boxes/p5/db-noPortrait.png';
    if (boxType === 'dancing') return 'boxes/p5/db-dancing.png';
    if (boxType === 'strikers') return 'boxes/p5/db-strikers.png';
    // Must match what paint uses — both read the same synchronous helper, so
    // the art and the text anchor can never disagree for a frame (the "Ann"
    // smear came from reading still-pending state here).
    return `boxes/p5/db-main-${blankKind}.png`;
  })();

  // Box-art anchor: the original drawBox() draws every box at x=320, so the
  // art's own width difference is what shifts the nameplate. Named and blank
  // boxes all share x=320 — do the same here.
  const BOX_X = 320;

  const bump = () => setAssetTick((t) => t + 1);

  useEffect(() => {
    tileSeedRef.current = { name: '', picks: [] };
  }, [boxType, font]);

  // New portrait URL -> allow one retry again. Reset the tile seed too: a
  // stale seed keyed on the previous name would reuse old picks for one
  // frame after a character switch (tile/glyph mismatch = smeared glyphs).
  useEffect(() => {
    setImgRetry(0);
    tileSeedRef.current = { name: '', picks: [] };
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
      const boxOk = !boxRef.current || boxRef.current.complete;
      const porEl = portraitRef.current;
      const porOk = char === 'None' || !portrait || (porEl ? porEl.complete : true);
      const cusEl = customRef.current;
      const cusOk = !custom || (cusEl ? cusEl.complete : true);
      const ready = bgOk && boxOk && porOk && cusOk && fontOkRef.current;
      if (ready !== readyRef.current) {
        readyRef.current = ready;
        readyCbRef.current?.(ready);
      }
    };

    const draw = () => {
      if (!alive) return;
      report();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Background
      const bg = bgRef.current;
      if (bg && bg.complete && bg.naturalWidth > 0) {
        ctx.drawImage(bg, 0, 0, W, H);
      } else {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);
      }

      // Portrait
      if (char !== 'None') {
        const useCustom = custom !== '' && customRef.current?.complete && (customRef.current?.naturalWidth ?? 0) > 0;
        if (useCustom && customRef.current) {
          const img = customRef.current;
          const scale = Math.min(500 / img.naturalWidth, 500 / img.naturalHeight);
          const w = img.naturalWidth * scale;
          const h = img.naturalHeight * scale;
          ctx.drawImage(img, 40 + (500 - w) / 2, H - h, w, h);
        } else {
          const img = portraitRef.current;
          if (img && img.complete && img.naturalWidth > 0) {
            const pos = (simplePositions as Record<string, number[]>)[char] ?? findSpecialPosition(char, emote, costume);
            let w = 500;
            const h = 500;
            if (costume === "Humanity's Companion") w = 580;
            if (char === 'Haru' && (costume === 'Swimsuit (Okinawa)' || costume === 'Road Trip (Hat)')) w = 570;
            ctx.drawImage(img, pos[0], pos[1], w, h);
          }
        }
      }

      // Name box art — anchor per box type like the original drawBox().
      // Every variant draws at x=320; width/height differences in the art
      // itself position the nameplate (named art includes the name glyphs,
      // blank small/medium/large grows 250->266->284px tall).
      const boxImg = boxRef.current;
      if (boxImg && boxImg.complete && boxImg.naturalWidth > 0) {
        const bw = boxImg.naturalWidth;
        const bh = boxImg.naturalHeight;
        if (boxType === 'main') {
          const hOff = bh - 250;
          ctx.drawImage(boxImg, BOX_X, 250 - hOff, bw, bh);
        } else if (boxType === 'noPortrait') {
          ctx.drawImage(boxImg, BOX_X, 180, bw, bh);
        } else if (boxType === 'dancing') {
          ctx.drawImage(boxImg, BOX_X, 300, bw, bh);
        } else {
          ctx.drawImage(boxImg, BOX_X, 250, bw, bh);
        }
      }

      // Name tiles + name text (rotated frame), drawn from the SAME fitted
      // string. fitName is truncated to the plate's structural length FIRST,
      // the tile roll runs on fitName (never the raw name), so picks can
      // never go stale after … truncation.
      //
      // Tile-geometry parity with the legacy tileCanvas: tiles sit at the
      // same cursor offsets the glyphs use (both derived from per-char
      // measureText sums over fitName), so the highlight always lands
      // exactly behind its glyph. Legacy bounds kept: 1 tile (<8 chars),
      // 2 tiles (8–15), 3 tiles (16+).
      const angle = (ANGLE[boxType] ?? ANGLE.main) * (Math.PI / 180);
      ctx.save();
      if (boxType === 'main' || boxType === 'noPortrait') {
        // Drawn name anchor (legacy parity): `main` shifts with the blank
        // art — 418 / 456 / 495 — because each size's plate sits further
        // right; named per-character art uses the 418 anchor. `noPortrait`
        // centers on the plate middle (legacy 392 is left of plate center
        // and makes long names spill left). Art + anchor both derive from
        // the same synchronous blankKind, so they can never disagree (the
        // "Ann" smear came from the anchor shifting a frame before the
        // art). PLATE_CX values probed per art at the text row.
        const textX = boxType === 'main' ? mainTextX : 725;
        const textY = boxType === 'main' ? 438 : 425;

        // Tile seed: SKIPPED for `noPortrait` (legacy draws no tiles there —
        // plain centered name). Rolling picks on every keystroke would also
        // re-randomize the highlight each frame; main-only keeps it stable.
        // The tile rects themselves are painted in the glyph pass below.
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = '#000';
        ctx.font = `18pt ${font}`;
        // Name budget: truncate with … to the plate's structural length FIRST,
        // then draw tiles + glyphs from that fitted string only. Drawing the
        // raw name was what let long names spill past the plate's left edge.
        const fitName =
          boxType === 'main'
            ? fitEllipsis(ctx, name, NAME_LEN_MAIN[blankKind] ?? NAME_LEN.main)
            : fitEllipsis(ctx, name, NAME_LEN[boxType] ?? NAME_LEN.main);
        const seed = tileSeedRef.current;
        if (boxType === 'main') {
          const seedKey = `${font}::${fitName}`;
          if (seed.name !== seedKey) {
            seed.name = seedKey;
            seed.picks = findRandomNumbers(fitName) as (number | null)[];
          }
        }
        // Seed only (`main` only): the tile roll runs on the FITTED string
        // (never the raw name), so picks can never go stale after …
        // truncation. The tile rects themselves are painted in the glyph
        // pass below (tile + white glyph per highlight), sharing one
        // offset ruler. (Legacy tileCanvas parity: tile left edge = START
        // of the highlighted glyph = textX-centered whole width + advance
        // of everything BEFORE the pick.)
        // Seed-only block above keeps the roll pinned per (fitted-name,
        // font) for `main`. Pull the picks + fitted metrics here for the
        // glyph pass (`noPortrait` returns before using them).
        const [random2, secondRandom2, thirdRandom2] = seed.picks;
        const fitLen = fitName.length;
        const r0 = Math.min(random2 as number, Math.max(0, fitLen - 1));
        const s20 =
          secondRandom2 === null || secondRandom2 === undefined
            ? null
            : Math.min(secondRandom2 as number, Math.max(0, fitLen - 1));
        const s30 =
          thirdRandom2 === null || thirdRandom2 === undefined
            ? null
            : Math.min(thirdRandom2 as number, Math.max(0, fitLen - 1));
        ctx.restore();

        // Name glyphs (rotated like the original nameCanvas), drawn from the
        // SAME fitted string as the tiles — never the raw over-long name.
        // Geometry: the tile + white glyph are INSET 1px right of the black
        // glyph's slot (tile left edge = glyph start + 1, white glyph
        // stamped at the same +1). Pixel-proven over 60+ probe grids: the
        // KRSM 'n' left stem carries dark antialiased fringe; painting the
        // tile exactly on the slot puts the tile's dark left edge on top of
        // that fringe and reads as a "double-n" smear. The 1px inset tucks
        // the tile edge inside the stem, and the white glyph covers the
        // fringe. Black pass keeps the legacy ruler (measured slot).
        ctx.rotate(angle);
        ctx.font = `18pt ${font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const nm = ctx.measureText(fitName);
        if (fitLen <= 1) {
          ctx.fillStyle = '#000';
          ctx.fillText(fitName, textX, textY);
        } else if (boxType === 'noPortrait') {
          // Legacy parity: noPortrait draws NO tiles — plain centered name.
          // The plate is straight and ~625px wide at the text row, centered
          // near x≈725; center the fitted name on the PLATE (not the 392
          // textX, which sits left of plate center) so long names grow
          // evenly both ways and truncate before hitting either tip.
          ctx.fillStyle = '#000';
          ctx.fillText(fitName, 725 - nm.width / 2, textY);
        } else if (fitName.trim()) {
          // White-tile indices (legacy bounds): 1 tile (<8), 2 (8–15), 3 (16+).
          const whites = new Set<number>([r0]);
          if (fitLen >= 8 && s20 !== null) whites.add(s20);
          if (fitLen >= 16 && s30 !== null) whites.add(s30);
          const startX = textX - nm.width / 2;
          // Pass 1: every glyph in black at its measured slot (legacy
          // ruler: pen advances by measured width per glyph).
          ctx.fillStyle = '#000';
          let pen = startX;
          for (let i = 0; i < fitName.length; i++) {
            ctx.fillText(fitName[i], pen, textY);
            pen += ctx.measureText(fitName[i]).width;
          }
          // Pass 2: black tile + white glyph at each highlight index.
          // Geometry (pixel-proven over 60+ probe grids): BOTH tile and
          // white glyph are inset 1px right of the black glyph's slot —
          // tile left edge = glyph start + 1 (1px narrower), white glyph
          // stamped at the same +1. The KRSM 'n' left stem carries dark
          // antialiased fringe; painting the tile exactly on the slot
          // puts the tile's dark left edge on top of that fringe and
          // reads as a "double-n" smear. The 1px inset tucks the tile
          // edge inside the stem. Black pass keeps the legacy ruler
          // (measured slot), so the glyph body never moves.
          for (const idx of whites) {
            let bx = startX;
            for (let i = 0; i < idx; i++) bx += ctx.measureText(fitName[i]).width;
            const tm = ctx.measureText(fitName[idx]) as TextMetrics & {
              fontBoundingBoxAscent?: number;
              fontBoundingBoxDescent?: number;
            };
            const asc = tm.fontBoundingBoxAscent ?? 20;
            const desc = tm.fontBoundingBoxDescent ?? 6;
            const top = textY - asc - 4 + (idx === r0 ? 0 : 1);
            const hh = asc + desc + 7 - (idx === r0 ? 0 : 1);
            // Black tile (legacy geometry, inset 1px right / 1px narrower).
            ctx.fillStyle = '#000';
            ctx.fillRect(bx + 1, top, Math.max(1, tm.width - 1), hh);
            // White glyph, same +1 inset as the tile.
            ctx.fillStyle = '#fff';
            ctx.fillText(fitName[idx], bx + 1, textY);
          }
        } else {
          ctx.fillStyle = '#000';
          ctx.fillText(fitName, textX - nm.width / 2, textY);
        }
      } else if (boxType === 'dancing') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = `18pt ${font}`;
        ctx.fillText(fitEllipsis(ctx, name, NAME_LEN.dancing), 660, 353);
      } else {
        ctx.rotate(angle);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.font = `16.5pt ${font}`;
        ctx.fillText(fitEllipsis(ctx, name, NAME_LEN.strikers), 500, 371);
      }
      ctx.restore();

      // Dialogue text: word-wrap to the art's own per-line budgets, max 3
      // lines, tail-truncated with … — never spills past the bubble.
      // Legacy parity: budgets are the dark-run lengths at the legacy text
      // rows (main 391/364/333 from x=500; other boxes probed the same way),
      // and the 2-line centering nudge (+14) is kept from the original.
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = boxType === 'strikers' ? `16pt ${font}` : `18pt ${font}`;
      const coords = (findTextCoords as Record<string, number[]>)[boxType] ?? findTextCoords.main;
      const budgets = LINE_LEN[boxType] ?? LINE_LEN.main;
      // Wrap EACH line to its own row budget (rows narrow toward the tail
      // wedge), so a long line 1 can never push text past the bubble.
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
      // Fill row by row: each row wraps to ITS budget; overflow moves to the
      // next row. Anything past row 3 folds into row 3 with a … tail.
      const queue: string[] = [];
      for (const rawLine of text.split('\n')) queue.push(...wrapLine(rawLine, budgets[0]));
      const rows: string[] = ['', '', ''];
      for (let r = 0; r < 3 && queue.length > 0; r++) {
        // Re-wrap the remainder to this row's own (possibly narrower) budget.
        const rewrapped: string[] = [];
        for (const q of queue) rewrapped.push(...wrapLine(q, budgets[r] ?? budgets[0]));
        rows[r] = rewrapped[0] ?? '';
        queue.splice(0, queue.length, ...rewrapped.slice(1));
      }
      const leftover = queue.length > 0;
      if (!rows[0] && !rows[1] && !rows[2]) rows[0] = '';
      const fitted = [0, 1, 2].map((i) => fitEllipsis(ctx, rows[i] ?? '', budgets[i] ?? budgets[0]));
      if (leftover) fitted[2] = fitEllipsis(ctx, `${fitted[2]} …`, budgets[2]);
      if (fitted[0] && fitted[1] && !fitted[2]) {
        ctx.fillText(fitted[0], coords[0], coords[1] + 14);
        ctx.fillText(fitted[1], coords[0], coords[2] + 14);
      } else {
        ctx.fillText(fitted[0], coords[0], coords[1]);
        ctx.fillText(fitted[1] ?? '', coords[0], coords[2]);
        ctx.fillText(fitted[2] ?? '', coords[0], coords[3]);
      }
      ctx.restore();

    };

    const markFontOk = () => {
      if (!alive) return;
      if (!fontOkRef.current) {
        // First paint with the REAL font: reseed the tile roll, because the
        // seed may have been rolled while a fallback font was active (wrong
        // advances -> tile/glyph geometry mismatch = smeared glyphs).
        tileSeedRef.current = { name: '', picks: [] };
        fontOkRef.current = true;
      }
      draw();
    };

    // Bounded font wait: poll document.fonts so a slow font can't leave the
    // canvas stuck in a fallback face. Caps at ~10s, then paints regardless.
    const ensureFont = (triesLeft: number) => {
      if (!alive) return;
      let ok = true;
      try {
        ok = !document.fonts?.check || document.fonts.check(`18pt "${font}"`, name || 'A');
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
      const loader = document.fonts?.load(`18pt "${font}"`, name || 'A');
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
  }, [portrait, custom, name, text, font, char, emote, costume, boxType, boxUrl, blankKind, assetTick, imgRetry]);

  useEffect(() => {
    void blankKind;
    void onBoxArt;
  }, [blankKind, onBoxArt]);

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
      <img ref={bgRef} className="hidden-img" alt="" src="img/p5-background.png" crossOrigin="anonymous" onLoad={bump} onError={bump} />
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
        ref={boxRef}
        className="hidden-img"
        alt="dialogue box"
        src={boxUrl}
        crossOrigin="anonymous"
        onLoad={bump}
        onError={bump}
      />
    </div>
  );
}
