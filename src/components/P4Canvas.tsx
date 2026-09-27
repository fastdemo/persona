import { useEffect, useRef } from 'react';
import FontFaceObserver from 'fontfaceobserver';
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

const W = 1275;
const H = 800;

const BOX_POS: Record<string, number[]> = {
  goldenBack: [61, 546, 1200, 256],
  goldenFront: [42.5, 621, 1200, 171],
  vanillaBack: [63, 524, 1225, 274],
  vanillaFront: [75, 600, 1200, 175],
};

/**
 * Single-canvas P4 renderer. Draw order: background -> portrait -> box back ->
 * box front -> name + dialogue text. Keeps the original positions, widths,
 * and per-version layout.
 */
export default function P4Canvas(props: P4CanvasState) {
  const { portrait, custom, name, text, font, char, emote, costume, boxType } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgRef = useRef<HTMLImageElement>(null);
  const portraitRef = useRef<HTMLImageElement>(null);
  const customRef = useRef<HTMLImageElement>(null);
  const backRef = useRef<HTMLImageElement>(null);
  const frontRef = useRef<HTMLImageElement>(null);
  const version = boxType === 'vanilla' ? 'vanilla' : 'golden';

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (cancelled) return;
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

      // Text
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `26pt ${font}`;
      if (version === 'golden') {
        ctx.fillStyle = '#4B2A14';
        ctx.fillText(name, 80, font === 'SkipStd-B' ? 615 : 612);
      } else {
        ctx.fillStyle = '#000';
        ctx.fillText(name, 85, font === 'SkipStd-B' ? 590 : 587);
      }
      ctx.fillStyle = '#fff';
      const rows = text.split('\n');
      while (rows.length < 3) rows.push('');
      if (version === 'golden') {
        ctx.fillText(rows[0], 93, 670);
        ctx.fillText(rows[1], 93, 715);
        ctx.fillText(rows[2], 93, 760);
      } else {
        ctx.fillText(rows[0], 100, 645);
        ctx.fillText(rows[1], 100, 690);
        ctx.fillText(rows[2], 100, 735);
      }
    };

    try {
      new FontFaceObserver(font).load(null, 2000).then(draw).catch(draw);
    } catch {
      draw();
    }
    const t = setTimeout(draw, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [portrait, custom, name, text, font, char, emote, costume, boxType, version]);

  return (
    <div className="canvas-frame">
      <canvas ref={canvasRef} id="dialogueCanvas" width={W} height={H} />
      <img ref={bgRef} className="hidden-img" alt="" src="img/p4-background.png" crossOrigin="anonymous" />
      {portrait && char !== 'None' ? (
        <img ref={portraitRef} className="hidden-img" alt="portrait" src={portrait} crossOrigin="anonymous" />
      ) : null}
      {custom ? (
        <img ref={customRef} className="hidden-img" alt="custom portrait" src={custom} crossOrigin="anonymous" />
      ) : null}
      <img
        ref={backRef}
        className="hidden-img"
        alt="dialogue box back"
        src={`boxes/p4/db-${version}-back.png`}
        crossOrigin="anonymous"
      />
      <img
        ref={frontRef}
        className="hidden-img"
        alt="dialogue box front"
        src={`boxes/p4/db-${version}-front.png`}
        crossOrigin="anonymous"
      />
    </div>
  );
}
