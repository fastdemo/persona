import { useEffect, useMemo, useRef, useState } from 'react';
import P4Canvas from './components/P4Canvas';
import P5Canvas from './components/P5Canvas';
import {
  BOXES,
  FONTS,
  catalogOf,
  charListOf,
  defaultOf,
  displayNameOf,
  portraitUrl,
  type Game,
} from './data/game';

const cleanName = (v: string) => v.replace(/  +/g, ' ');

export default function App() {
  const [game, setGame] = useState<Game>('P5');
  const [char, setChar] = useState('Ann');
  const [emote, setEmote] = useState('Happy');
  const [costume, setCostume] = useState('Gym Clothes');
  const [name, setName] = useState('Ann');
  const [text, setText] = useState('');
  const [font, setFont] = useState('KoreanKRSM');
  const [boxType, setBoxType] = useState('main');
  const [custom, setCustom] = useState('');
  const [flash, setFlash] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const catalog = useMemo(() => catalogOf(game), [game]);
  const chars = useMemo(() => charListOf(game), [game, catalog]);
  const emotes = useMemo(() => Object.keys(catalog[char] ?? {}), [catalog, char]);
  const costumes = useMemo(() => catalog[char]?.[emote] ?? [], [catalog, char, emote]);
  const portrait = useMemo(
    () => (char === 'None' ? '' : portraitUrl(game, char, emote, costume)),
    [game, char, emote, costume],
  );

  useEffect(() => {
    document.body.dataset.game = game;
  }, [game]);

  // Keep emotion / costume valid when the character changes.
  useEffect(() => {
    if (!emotes.includes(emote)) {
      const next = emotes[0] ?? '';
      setEmote(next);
    }
  }, [char, emotes]);

  useEffect(() => {
    if (!costumes.includes(costume)) {
      setCostume(costumes[0] ?? '');
    }
  }, [char, emote, costumes]);

  const switchGame = (g: Game) => {
    if (g === game) return;
    const d = defaultOf(g);
    setGame(g);
    setChar(d.char);
    setEmote(d.emote);
    setCostume(d.costume);
    setName(d.name);
    setText('');
    setFont(d.font);
    setBoxType(d.box);
    setCustom('');
    setFlash((f) => f + 1);
  };

  const onChar = (c: string) => {
    setChar(c);
    if (c === 'None') {
      setName('');
    } else {
      setName(displayNameOf(game, c));
    }
  };

  const reset = () => {
    const d = defaultOf(game);
    setChar(d.char);
    setEmote(d.emote);
    setCostume(d.costume);
    setName(d.name);
    setText('');
    setFont(d.font);
    setBoxType(d.box);
    setCustom('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const download = () => {
    const canvas = document.getElementById('dialogueCanvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    setFlash((f) => f + 1);
    setTimeout(() => {
      const src = canvas;
      const ctx = src.getContext('2d');
      if (!ctx) return;
      const { width, height } = src;
      let top = height;
      let bottom = -1;
      let left = width;
      let right = -1;
      try {
        const data = ctx.getImageData(0, 0, width, height).data;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] > 0) {
              if (y < top) top = y;
              if (y > bottom) bottom = y;
              if (x < left) left = x;
              if (x > right) right = x;
            }
          }
        }
      } catch {
        return;
      }
      const out = document.createElement('canvas');
      if (right >= left && bottom >= top) {
        out.width = right - left + 1;
        out.height = bottom - top + 1;
        out.getContext('2d')!.drawImage(src, left, top, out.width, out.height, 0, 0, out.width, out.height);
      } else {
        out.width = width;
        out.height = height;
        out.getContext('2d')!.drawImage(src, 0, 0);
      }
      const a = document.createElement('a');
      a.download = `${name || 'persona'}-${text.slice(0, 40) || 'dialogue'}.png`;
      a.href = out.toDataURL('image/png');
      a.click();
    }, 180);
  };

  const onUpload = (f: File | undefined) => {
    if (f) setCustom(URL.createObjectURL(f));
  };

  const fonts = FONTS[game];
  const boxes = BOXES[game];
  const canvasH = game === 'P5' ? 500 : 800;

  // Canvas is "loading" until the active renderer reports every source image
  // complete AND the dialogue font applied. Flips back on every game/asset
  // change so a slow portrait can never leave a half-painted frame.
  const [canvasReady, setCanvasReady] = useState(false);
  const readyGameRef = useRef<Game>('P5');

  useEffect(() => {
    readyGameRef.current = game;
    setCanvasReady(false);
  }, [game, portrait, boxType, font, custom]);

  const handleReady = (ready: boolean) => {
    if (readyGameRef.current === game) setCanvasReady(ready);
  };

  return (
    <div className={`app${flash % 2 ? ' flash go' : ' flash'}`} key={flash}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <img
              src={game === 'P5' ? 'img/persona5logo.png' : 'img/persona4logo.png'}
              alt={game === 'P5' ? 'Persona 5 logo' : 'Persona 4 logo'}
            />
          </div>
          <div>
            <h1>DIALOGUE GENERATOR</h1>
            <p>
              {game === 'P5' ? 'Persona 5 · Royal · Strikers' : 'Persona 4 · Golden'} · 対話ジェネレータ
            </p>
          </div>
        </div>
        <div className="game-switch" role="group" aria-label="Game">
          <button type="button" aria-pressed={game === 'P5'} onClick={() => switchGame('P5')}>
            Persona 5
          </button>
          <button type="button" aria-pressed={game === 'P4'} onClick={() => switchGame('P4')}>
            Persona 4
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className="panel" aria-label="Controls">
          <div className="panel-section">
            <p className="section-title">Portrait</p>
            <div className="field">
              <label htmlFor="charMenu">Character</label>
              <div className="select-wrap">
                <select id="charMenu" value={char} onChange={(e) => onChar(e.target.value)}>
                  {chars.map((c) => (
                    <option key={c} value={c}>
                      {displayNameOf(game, c)}
                    </option>
                  ))}
                  <option value="None">No Portrait</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="emoteMenu">Emotion</label>
              <div className="select-wrap">
                <select id="emoteMenu" value={emote} onChange={(e) => setEmote(e.target.value)}>
                  {emotes.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label htmlFor="costumeMenu">Costume</label>
              <div className="select-wrap">
                <select id="costumeMenu" value={costume} onChange={(e) => setCostume(e.target.value)}>
                  {costumes.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="upload" htmlFor="portraitUpload">
              {custom ? 'Custom portrait loaded — replace?' : 'Upload custom portrait'}
              <input
                ref={fileRef}
                id="portraitUpload"
                type="file"
                accept="image/*"
                onClick={(e) => {
                  (e.target as HTMLInputElement).value = '';
                }}
                onChange={(e) => onUpload(e.target.files?.[0])}
              />
            </label>
            <p className="hint">{game === 'P5' ? '500 × 500px recommended' : '400 × 450px recommended'}</p>
          </div>

          <div className="panel-section">
            <p className="section-title">Dialogue</p>
            <div className="field">
              <label htmlFor="nameField">Name</label>
              <input
                id="nameField"
                type="text"
                value={name}
                onChange={(e) => setName(cleanName(e.target.value))}
                maxLength={120}
              />
            </div>
            <div className="field">
              <label htmlFor="textField">Lines</label>
              <textarea
                id="textField"
                rows={3}
                value={text}
                maxLength={600}
                placeholder={
                  game === 'P5'
                    ? 'Hey, Inmate! Character portraits contain spoilers!'
                    : 'Attention Junes shoppers: portraits contain spoilers!'
                }
                onChange={(e) => setText(e.target.value)}
              />
            </div>
          </div>

          <div className="panel-section">
            <p className="section-title">Style</p>
            <div className="field">
              <label id="boxLabel">Box</label>
              <div className="seg seg-2" role="group" aria-labelledby="boxLabel">
                {boxes.map((b) => (
                  <button key={b.value} type="button" aria-pressed={boxType === b.value} onClick={() => setBoxType(b.value)}>
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label id="fontLabel">Font</label>
              <div className="seg seg-2" role="group" aria-labelledby="fontLabel">
                {fonts.map((f) => (
                  <button key={f.value} type="button" aria-pressed={font === f.value} onClick={() => setFont(f.value)}>
                    <span style={{ fontFamily: `'${f.value}'` }}>{f.label}</span>
                    {f.sub ? <small>{f.sub}</small> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="stage">
          <div className="canvas-card" data-ready={canvasReady}>
            <div className="canvas-loading" hidden={canvasReady} role="status" aria-live="polite">
              <div className="canvas-spinner" aria-hidden="true" />
              <span>Loading dialogue assets…</span>
            </div>
            {game === 'P5' ? (
              <P5Canvas
                portrait={portrait}
                custom={custom}
                name={name}
                text={text}
                font={font}
                char={char}
                emote={emote}
                costume={costume}
                boxType={boxType}
                onReadyChange={handleReady}
              />
            ) : (
              <P4Canvas
                portrait={portrait}
                custom={custom}
                name={name}
                text={text}
                font={font}
                char={char}
                emote={emote}
                costume={costume}
                boxType={boxType}
                onReadyChange={handleReady}
              />
            )}
          </div>
          <div className="stage-actions">
            <button type="button" className="btn btn-primary" onClick={download}>
              Download dialogue image
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              Clear / Reset
            </button>
          </div>
          <div className="stage-meta">
            <span>
              Canvas {game === 'P5' ? '1275 × 500' : '1275 × 800'} · PNG export is auto-trimmed
            </span>
            <span>
              {canvasH === 500 ? 'P5 engine' : 'P4 engine'} · portraits stream from S3
            </span>
          </div>

          <footer className="footer">
            <span>
              Code originally by <a href="https://github.com/opennoise1/p5-dialogue-generator">opennoise</a>.
            </span>
            <span>All artwork © Atlus, shown under fair use.</span>
            <span>For best results, use Google Chrome.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
