import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Rabbit, RABBIT } from "./rabbit";
import { LayeredPile } from "./pile";
import { demoLevel } from "./demo";
import {
  defaultRabbitSettings,
  parseRabbitSettings,
  readRabbitSettings,
  RABBIT_DRAFT_KEY,
  RABBIT_GAME_KEY,
  type RabbitSettings,
  type PartTuning,
} from "./rabbit-settings";
import "./ui/rabbit-editor.css";

const pitches = [0.18, 0.7, 1.31];
const parts = [
  ["head", "Голова"],
  ["body", "Тело"],
  ["leftHand", "Левая рука"],
  ["rightHand", "Правая рука"],
] as const;
type Options = {
  radius: number;
  zoom: number;
  speed: number;
  ball: boolean;
  guides: boolean;
  ghost: boolean;
};
type Preview = {
  view: (index: number) => void;
  settings: (settings: RabbitSettings) => void;
};
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="rig-slider">
      <span>
        {label}
        <output>{Number(value.toFixed(2))}</output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <input
        className="rig-number"
        type="number"
        aria-label={`${label}, точное значение`}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          if (e.target.value !== "" && Number.isFinite(e.target.valueAsNumber))
            onChange(Math.max(min, Math.min(max, e.target.valueAsNumber)));
        }}
      />
    </label>
  );
}
function PreviewScene({
  settings,
  options,
  api,
  onFrame,
  onError,
}: {
  settings: RabbitSettings;
  options: Options;
  api: React.RefObject<Preview | null>;
  onFrame: (n: number) => void;
  onError: (text: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    latest = useRef(options),
    initial = useRef(settings);
  latest.current = options;
  useEffect(() => {
    const el = host.current!;
    let stopped = false,
      raf = 0,
      ready = false,
      frame = -1,
      time = 0,
      last = 0,
      yaw = -Math.PI,
      pitch = 0.7,
      drag: { x: number; y: number } | null = null;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.append(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d8d6d0");
    scene.fog = new THREE.Fog("#d8d6d0", 1000, 2300);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 5000),
      rabbit = new Rabbit(initial.current),
      character = new THREE.Group();
    character.add(rabbit.root);
    scene.add(character);
    const ball = new THREE.Group();
    scene.add(ball);
    const atlas = new Image(),
      level = demoLevel();
    atlas.src = level.atlas;
    let pile: LayeredPile | undefined;
    const floorTexture = new THREE.Texture();
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.repeat.set(3, 3);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000),
      new THREE.MeshStandardMaterial({
        color: "#f5f2e8",
        map: floorTexture,
        roughness: 1,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.3;
    scene.add(floor);
    const grid = new THREE.GridHelper(3000, 100, "#f00020", "#cccccc");
    grid.position.y = 0.1;
    scene.add(grid);
    const anchor = new THREE.AxesHelper(40);
    anchor.position.y = 1;
    scene.add(anchor);
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const sc = shadowCanvas.getContext("2d")!;
    const grad = sc.createRadialGradient(64, 64, 3, 64, 64, 64);
    grad.addColorStop(0, "#0007");
    grad.addColorStop(1, "#0000");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas),
      shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          map: shadowTexture,
          transparent: true,
          depthWrite: false,
        }),
      );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.2;
    scene.add(shadow);
    scene.add(new THREE.HemisphereLight("#ffffff", "#b6b1a3", 2.4));
    const light = new THREE.DirectionalLight("#ffffff", 2.5);
    light.position.set(-200, 400, 400);
    scene.add(light);
    api.current = {
      view: (index) => {
        yaw = (-(index % 8) * Math.PI) / 4;
        pitch = pitches[Math.floor(index / 8)];
        rabbit.frame = { column: index % 8, row: Math.floor(index / 8) };
      },
      settings: (s) => rabbit.configure(s),
    };
    Promise.all([rabbit.ready, atlas.decode()])
      .then(() => {
        if (stopped) return;
        floorTexture.image = atlas;
        floorTexture.needsUpdate = true;
        pile = new LayeredPile(ball, atlas);
        let area = 0;
        const total = level.pieces.reduce((s, p) => s + p.growthValue, 0);
        for (const p of level.pieces) {
          area += p.growthValue;
          pile.bake(pile.allocate(p, 60 * Math.sqrt(area / total)));
        }
        ready = true;
      })
      .catch((e) => onError(String(e)));
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    });
    resize.observe(el);
    const down = (e: PointerEvent) => {
      renderer.domElement.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      yaw -= (e.clientX - drag.x) * 0.006;
      pitch = THREE.MathUtils.clamp(
        pitch + (e.clientY - drag.y) * 0.005,
        0.06,
        1.5,
      );
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => {
      drag = null;
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", up);
    function tick(now: number) {
      if (stopped) return;
      const dt = Math.min((now - last) / 1000 || 0.016, 0.05);
      last = now;
      const o = latest.current;
      time += dt * o.speed;
      const scale = 1 + Math.min(0.8, o.radius / 380);
      character.scale.setScalar(scale);
      const gap = RABBIT.ballGap * scale + o.radius;
      ball.visible = o.ball;
      ball.scale.setScalar(o.radius / 60);
      ball.position.set(0, Math.max(4, o.radius * 0.85), gap);
      ball.rotation.x += dt * o.speed * 0.9;
      ball.rotation.z = 0.12;
      shadow.visible = o.ball;
      shadow.position.z = gap;
      shadow.scale.setScalar(o.radius * 2.05);
      grid.visible = anchor.visible = o.guides;
      rabbit.ghost.visible = o.ghost;
      floorTexture.offset.y = (time * 0.045) % 1;
      const distance = (250 + o.radius * 2.4) / o.zoom;
      camera.position.set(
        Math.sin(yaw) * Math.cos(pitch) * distance,
        Math.sin(pitch) * distance,
        Math.cos(yaw) * Math.cos(pitch) * distance,
      );
      camera.lookAt(0, Math.max(28 * scale, o.radius * 0.4), gap * 0.4);
      if (ready) {
        rabbit.update(camera, 0, o.radius, scale, time, o.speed ? 200 : 0);
        const n = rabbit.frame.row * 8 + rabbit.frame.column;
        if (n !== frame) {
          frame = n;
          onFrame(n);
        }
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      resize.disconnect();
      api.current = null;
      rabbit.dispose();
      pile?.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      floorTexture.dispose();
      shadow.geometry.dispose();
      shadow.material.dispose();
      shadowTexture.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      anchor.geometry.dispose();
      (anchor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  useEffect(() => {
    api.current?.settings(settings);
  }, [settings]);
  return <div className="rig-canvas" ref={host} />;
}
export function RabbitEditor() {
  const [settings, setSettings] = useState(() =>
    readRabbitSettings(RABBIT_DRAFT_KEY),
  );
  const [selected, setSelected] = useState(12),
    [active, setActive] = useState(12),
    [part, setPart] =
      useState<
        keyof Pick<
          (typeof settings.views)[0],
          "head" | "body" | "leftHand" | "rightHand"
        >
      >("head");
  const [options, setOptions] = useState<Options>({
    radius: 60,
    zoom: 1.15,
    speed: 1,
    ball: true,
    guides: false,
    ghost: true,
  });
  const [notice, setNotice] = useState(
      "Черновик сохраняется в этом браузере автоматически.",
    ),
    [error, setError] = useState("");
  const api = useRef<Preview | null>(null),
    file = useRef<HTMLInputElement>(null),
    history = useRef<RabbitSettings[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(RABBIT_DRAFT_KEY, JSON.stringify(settings));
      } catch {
        setError("Браузер не разрешил сохранить черновик. Скачай JSON.");
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [settings]);
  const change = (next: RabbitSettings) => {
    history.current.push(settings);
    if (history.current.length > 100) history.current.shift();
    setSettings(next);
  };
  const view = settings.views[selected],
    p = view[part];
  const updatePart = (patch: Partial<PartTuning>) => {
    const next = structuredClone(settings);
    Object.assign(next.views[selected][part], patch);
    change(next);
  };
  const updateView = (key: string, value: number) => {
    const next = structuredClone(settings);
    Object.assign(next.views[selected], { [key]: value });
    change(next);
  };
  const select = (n: number) => {
    setSelected(n);
    api.current?.view(n);
  };
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(settings, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "webivore-rabbit-settings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("JSON экспортирован. Пришли мне этот файл с настройками.");
  }
  async function importFile(f?: File) {
    if (!f) return;
    try {
      if (f.size > 100000)
        throw new Error("Файл слишком большой. Нужен JSON настроек зайца.");
      change(parseRabbitSettings(JSON.parse(await f.text())));
      setError("");
      setNotice("Все 24 ракурса импортированы.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (file.current) file.current.value = "";
    }
  }
  return (
    <main className="rabbit-editor">
      <header className="rig-header">
        <div>
          <span>WEBIVORE / DEV</span>
          <h1>Настройка зайца</h1>
        </div>
        <a href="/">Вернуться в игру ↗</a>
      </header>
      <section
        className="rig-preview"
        aria-label="Бесконечная ходьба и толкание шара"
      >
        <PreviewScene
          settings={settings}
          options={options}
          api={api}
          onFrame={setActive}
          onError={setError}
        />
        <div className="rig-preview-label">
          <b>{options.speed ? "Идёт на месте" : "Пауза"}</b>
          <span>
            В кадре: {(active % 8) * 45}° /{" "}
            {["низко", "середина", "сверху"][Math.floor(active / 8)]}
          </span>
        </div>
        <div className="rig-preview-help">
          Перетащи сцену, чтобы осмотреть. Выбери ракурс справа, чтобы камера
          точно вернулась к нему.
        </div>
        {active !== selected && (
          <button
            className="rig-return"
            onClick={() => api.current?.view(selected)}
          >
            К редактируемому ракурсу ↗
          </button>
        )}
      </section>
      <aside className="rig-panel">
        <section>
          <h2>01 / Ракурс и камера</h2>
          <p>
            Каждая из 24 позиций настраивается отдельно. Кнопка сразу переводит
            камеру.
          </p>
          {["Низко · 10°", "Середина · 40°", "Сверху · 75°"].map((row, r) => (
            <div className="rig-row" key={row}>
              <span>{row}</span>
              <div>
                {Array.from({ length: 8 }, (_, c) => (
                  <button
                    key={c}
                    aria-label={`${row}, ${c * 45}°`}
                    aria-pressed={selected === r * 8 + c}
                    onClick={() => select(r * 8 + c)}
                  >
                    {c * 45}°
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
        <section>
          <h2>
            02 / Компоновка · {(selected % 8) * 45}° ·{" "}
            {["низко", "середина", "сверху"][Math.floor(selected / 8)]}
          </h2>
          <div className="rig-parts">
            {parts.map(([key, label]) => (
              <button
                key={key}
                aria-pressed={part === key}
                onClick={() => setPart(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="rig-checks">
            <label>
              <input
                type="checkbox"
                checked={p.visible}
                onChange={(e) => updatePart({ visible: e.target.checked })}
              />
              Показывать
            </label>
            {part.includes("Hand") && (
              <label>
                <input
                  type="checkbox"
                  checked={p.front}
                  onChange={(e) => updatePart({ front: e.target.checked })}
                />
                Перед головой и телом
              </label>
            )}
          </div>
          <Slider
            label="X · вправо"
            value={p.x}
            min={-180}
            max={180}
            onChange={(x) => updatePart({ x })}
          />
          <Slider
            label="Y · вверх"
            value={p.y}
            min={-180}
            max={180}
            onChange={(y) => updatePart({ y })}
          />
          <Slider
            label="Масштаб"
            value={p.scale}
            min={0.2}
            max={2.5}
            step={0.01}
            onChange={(scale) => updatePart({ scale })}
          />
          {!part.includes("Hand") && (
            <Slider
              label="Поворот"
              value={p.rotation}
              min={-90}
              max={90}
              onChange={(rotation) => updatePart({ rotation })}
            />
          )}
          {part.includes("Hand") && (
            <p>
              Руки из предыдущей версии: остаются на поверхности шара. Смещение
              и масштаб настраиваются для этого ракурса.
            </p>
          )}
          {(part === "head" || part === "body") && (
            <div className="rig-source">
              <label>
                Исходный угол
                <select
                  aria-label="Исходный угол"
                  value={view[part === "head" ? "headColumn" : "bodyColumn"]}
                  onChange={(e) =>
                    updateView(
                      part === "head" ? "headColumn" : "bodyColumn",
                      +e.target.value,
                    )
                  }
                >
                  {Array.from({ length: 8 }, (_, c) => (
                    <option key={c} value={c}>
                      {c * 45}°
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Исходная высота
                <select
                  aria-label="Исходная высота"
                  value={view[part === "head" ? "headRow" : "bodyRow"]}
                  onChange={(e) =>
                    updateView(
                      part === "head" ? "headRow" : "bodyRow",
                      +e.target.value,
                    )
                  }
                >
                  {["Низко", "Середина", "Сверху"].map((s, r) => (
                    <option key={s} value={r}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <Slider
            label="Вся поза · над землёй"
            value={view.ground}
            min={-80}
            max={80}
            onChange={(n) => updateView("ground", n)}
          />
          <div className="rig-actions">
            <button
              onClick={() => {
                const next = structuredClone(settings);
                next.views[selected] = defaultRabbitSettings().views[selected];
                change(next);
              }}
            >
              Сбросить этот ракурс
            </button>
            <button
              disabled={!history.current.length}
              onClick={() => {
                const prev = history.current.pop();
                if (prev) setSettings(prev);
              }}
            >
              Отменить
            </button>
          </div>
        </section>
        <section>
          <h2>03 / Условия просмотра</h2>
          <p>Эти ползунки меняют только сцену редактора.</p>
          <Slider
            label="Радиус шара"
            value={options.radius}
            min={5}
            max={240}
            onChange={(radius) => setOptions({ ...options, radius })}
          />
          <Slider
            label="Приближение"
            value={options.zoom}
            min={0.5}
            max={2.5}
            step={0.05}
            onChange={(zoom) => setOptions({ ...options, zoom })}
          />
          <Slider
            label="Скорость ходьбы"
            value={options.speed}
            min={0}
            max={2}
            step={0.1}
            onChange={(speed) => setOptions({ ...options, speed })}
          />
          <div className="rig-checks">
            {(
              [
                ["ball", "Шар"],
                ["guides", "Сетка и опора"],
                ["ghost", "Видимость за шаром"],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) =>
                    setOptions({ ...options, [key]: e.target.checked })
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </section>
        <section className="rig-save">
          <h2>04 / Сохранить настройки</h2>
          <p>Черновик не меняет игру, пока ты не нажмёшь «Применить в игре».</p>
          <div className="rig-actions">
            <button className="rig-primary" onClick={download}>
              Экспорт JSON ↓
            </button>
            <button onClick={() => file.current?.click()}>Импорт JSON ↑</button>
            <button
              onClick={() => {
                try {
                  localStorage.setItem(
                    RABBIT_GAME_KEY,
                    JSON.stringify(settings),
                  );
                  setNotice(
                    "Настройки применены. Открой игру заново, чтобы увидеть их.",
                  );
                } catch {
                  setError("Не удалось сохранить настройки игры.");
                }
              }}
            >
              Применить в игре
            </button>
          </div>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void importFile(e.target.files?.[0])}
          />
          <p role="status">{notice}</p>
          {error && <p role="alert">{error}</p>}
        </section>
      </aside>
    </main>
  );
}
