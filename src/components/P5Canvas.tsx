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

  const [blankKind, setBlankKind] = useState<'small' | 'medium' | 'large'>('small');
  const [assetTick, setAssetTick] = useState(0);
  const [imgRetry, setImgRetry] = useState(0);

  const boxUrl = (() => {
    const named = nameBoxUrl(font, name, boxType);
    if (named) return named;
    if (boxType === 'noPortrait') return 'boxes/p5/db-noPortrait.png';
    if (boxType === 'dancing') return 'boxes/p5/db-dancing.png';
    if (boxType === 'strikers') return 'boxes/p5/db-strikers.png';
    return `boxes/p5/db-main-${blankKind}.png`;
  })();

  // Box-art anchor: the original drawBox() draws every box at x=320, so the
  // art's own width difference is what shifts the nameplate. Named and blank
  // boxes all share x=320 — do the same here.
  const BOX_X = 320;

  const bump = () => setAssetTick((t) => t + 1);

  useEffect(() => {
    tileSeedRef.current = { name: '', picks: [] };
  }, [boxType]);

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

      // Name tiles + name text (rotated frame). The tile highlight + glyph
      // split must use the same textX anchor as the box art above, otherwise
      // the black tile drifts off the white nameplate on medium/large boxes.
      // NOTE (bot engine parity): for `main`, textX stays 418 for every size —
      // the wider blank art is centered on the same nameplate, so shifting
      // textX right (456/495) is what pushes text off the plate. Kept at 418.
      const angle = (ANGLE[boxType] ?? ANGLE.main) * (Math.PI / 180);
      const mainTextX = 418;
      ctx.save();
      if (boxType === 'main' || boxType === 'noPortrait') {
        const textX = boxType === 'main' ? mainTextX : 392;
        const textY = boxType === 'main' ? 438 : 425;

        // Tiles (drawn in rotated space, like the original tileCanvas)
        ctx.save();
        ctx.rotate(angle);
        ctx.fillStyle = '#000';
        const seed = tileSeedRef.current;
        if (seed.name !== name) {
          seed.name = name;
          seed.picks = findRandomNumbers(name) as (number | null)[];
        }
        const [random, secondRandom, thirdRandom] = seed.picks;
        ctx.font = `18pt ${font}`;
        const measureWhole = ctx.measureText(name);
        if (name.length > 1 && name.trim() && random !== null && random !== undefined) {
          let boxX = textX - measureWhole.width / 2;
          for (let i = 0; i < (random as number); i++) boxX += ctx.measureText(name[i]).width;
          const tm = ctx.measureText(name[random as number]) as TextMetrics & {
            fontBoundingBoxAscent?: number;
            fontBoundingBoxDescent?: number;
          };
          const asc = tm.fontBoundingBoxAscent ?? 20;
          const desc = tm.fontBoundingBoxDescent ?? 6;
          ctx.fillRect(boxX, textY - asc - 4, tm.width, asc + desc + 7);
          if (name.length >= 8 && secondRandom !== null && secondRandom !== undefined) {
            let secondBoxX = boxX;
            for (let i = (random as number); i < (secondRandom as number); i++) {
              secondBoxX += ctx.measureText(name[i]).width;
            }
            const t2 = ctx.measureText(name[secondRandom as number]) as TextMetrics & {
              fontBoundingBoxAscent?: number;
              fontBoundingBoxDescent?: number;
            };
            const a2 = t2.fontBoundingBoxAscent ?? 20;
            const d2 = t2.fontBoundingBoxDescent ?? 6;
            ctx.fillRect(secondBoxX, textY - a2 - 3, t2.width, a2 + d2 + 7);
            if (name.length >= 16 && thirdRandom !== null && thirdRandom !== undefined) {
              let thirdBoxX = secondBoxX;
              for (let i = (secondRandom as number); i < (thirdRandom as number); i++) {
                thirdBoxX += ctx.measureText(name[i]).width;
              }
              const t3 = ctx.measureText(name[thirdRandom as number]) as TextMetrics & {
                fontBoundingBoxAscent?: number;
                fontBoundingBoxDescent?: number;
              };
              const a3 = t3.fontBoundingBoxAscent ?? 20;
              const d3 = t3.fontBoundingBoxDescent ?? 6;
              ctx.fillRect(thirdBoxX, textY - a3 - 3, t3.width, a3 + d3 + 6);
            }
          }
        }
        ctx.restore();

        // Name glyphs (rotated like the original nameCanvas)
        ctx.rotate(angle);
        ctx.font = `18pt ${font}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        const nm = ctx.measureText(name);
        if (name.length === 1) {
          ctx.fillStyle = '#000';
          ctx.fillText(name, textX, textY);
        } else if (name.trim() && random !== null && random !== undefined) {
          const beforeBox = name.substring(0, random as number);
          const behindBox = name.substring(random as number, (random as number) + 1);
          const afterFirst = name.substring((random as number) + 1);
          let secondBehind = '';
          let secondAfter = afterFirst;
          let thirdBehind = '';
          let thirdAfter = '';
          if (name.length >= 8 && secondRandom !== null && secondRandom !== undefined) {
            secondAfter = name.substring((secondRandom as number) + 1);
            const head = name.substring((random as number) + 1, secondRandom as number);
            secondBehind = name.substring(secondRandom as number, (secondRandom as number) + 1);
            if (name.length >= 16 && thirdRandom !== null && thirdRandom !== undefined) {
              secondAfter = name.substring((secondRandom as number) + 1, thirdRandom as number);
              thirdBehind = name.substring(thirdRandom as number, (thirdRandom as number) + 1);
              thirdAfter = name.substring((thirdRandom as number) + 1);
              void head;
            }
          }
          const startX = textX - nm.width / 2;
          let cursorBoxX = startX;
          for (let i = 0; i < (random as number); i++) cursorBoxX += ctx.measureText(name[i]).width;
          ctx.fillStyle = '#000';
          ctx.fillText(beforeBox, startX, textY);
          ctx.fillStyle = '#fff';
          const beforeW = ctx.measureText(beforeBox).width;
          ctx.fillText(behindBox, startX + beforeW, textY);
          ctx.fillStyle = '#000';
          const behindW = ctx.measureText(behindBox).width;
          let cursor = cursorBoxX + behindW;
          if (name.length >= 8 && secondRandom !== null && secondRandom !== undefined) {
            const head = name.substring((random as number) + 1, secondRandom as number);
            ctx.fillText(head, cursor, textY);
            cursor += ctx.measureText(head).width;
            ctx.fillStyle = '#fff';
            ctx.fillText(secondBehind, cursor, textY);
            cursor += ctx.measureText(secondBehind).width;
            ctx.fillStyle = '#000';
            if (name.length >= 16 && thirdRandom !== null && thirdRandom !== undefined) {
              const mid = name.substring((secondRandom as number) + 1, thirdRandom as number);
              ctx.fillText(mid, cursor, textY);
              cursor += ctx.measureText(mid).width;
              ctx.fillStyle = '#fff';
              ctx.fillText(thirdBehind, cursor, textY);
              cursor += ctx.measureText(thirdBehind).width;
              ctx.fillStyle = '#000';
              ctx.fillText(thirdAfter, cursor, textY);
            } else {
              ctx.fillText(secondAfter, cursor, textY);
            }
          } else {
            ctx.fillText(afterFirst, cursor, textY);
          }
          void secondAfter;
        } else {
          ctx.fillStyle = '#000';
          ctx.fillText(name, textX - nm.width / 2, textY);
        }
      } else if (boxType === 'dancing') {
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.font = `18pt ${font}`;
        ctx.fillText(name, 660, 353);
      } else {
        ctx.rotate(angle);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.font = `16.5pt ${font}`;
        ctx.fillText(name, 500, 371);
      }
      ctx.restore();

      // Dialogue text
      ctx.save();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = boxType === 'strikers' ? `16pt ${font}` : `18pt ${font}`;
      const coords = (findTextCoords as Record<string, number[]>)[boxType] ?? findTextCoords.main;
      const rows = text.split('\n');
      while (rows.length < 3) rows.push('');
      if (rows[0] && rows[1] && !rows[2]) {
        ctx.fillText(rows[0], coords[0], coords[1] + 14);
        ctx.fillText(rows[1], coords[0], coords[2] + 14);
      } else {
        ctx.fillText(rows[0], coords[0], coords[1]);
        ctx.fillText(rows[1], coords[0], coords[2]);
        ctx.fillText(rows[2], coords[0], coords[3]);
      }
      ctx.restore();

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
  }, [portrait, custom, name, text, font, char, emote, costume, boxType, boxUrl, assetTick, imgRetry]);

  // Decide blank-box size the same way the original did, and keep it live:
  // the generic db-main-{small,medium,large} art swaps with the measured name width.
  useEffect(() => {
    if (nameBoxUrl(font, name, boxType) !== null) return;
    const c = document.createElement('canvas').getContext('2d');
    if (!c) return;
    c.font = `18pt ${font}`;
    const w = c.measureText(name).width;
    const kind = w <= 195 ? 'small' : w <= 275 ? 'medium' : 'large';
    setBlankKind((k) => (k === kind ? k : kind));
    onBoxArt?.(kind);
  }, [name, font, boxType, onBoxArt]);

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
