import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OfficeSprintGame, type GameSnapshot } from "@/game/engine";
import { cn } from "@/lib/utils";

const INITIAL: GameSnapshot = {
  status: "loading",
  score: 0,
  highScore: 0,
  muted: false,
  night: false,
  isNewRecord: false,
};

function pad(n: number) {
  return n.toString().padStart(5, "0");
}

export function OfficeSprint() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<OfficeSprintGame | null>(null);
  const [snap, setSnap] = useState<GameSnapshot>(INITIAL);

  const sync = useCallback(() => {
    const g = gameRef.current;
    if (g) setSnap(g.snapshot());
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const game = new OfficeSprintGame(canvas, stage);
    gameRef.current = game;
    game.onChange = sync;
    void game.boot().then(sync);

    const onResize = () => game.resize();
    const onVis = () => {
      if (!document.hidden) game.unlockAudio();
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
      game.destroy();
      gameRef.current = null;
    };
  }, [sync]);

  const play = () => {
    gameRef.current?.unlockAudio();
    gameRef.current?.playFromIntro();
  };
  const restart = () => {
    gameRef.current?.unlockAudio();
    gameRef.current?.restart();
  };
  const toggleMute = () => {
    const g = gameRef.current;
    if (!g) return;
    g.unlockAudio();
    g.setMuted(!g.muted);
  };

  const overlayIntro = snap.status === "intro" || snap.status === "loading";
  const overlayDead = snap.status === "dead";

  return (
    <div
      className={cn(
        "flex min-h-dvh flex-col bg-background text-foreground",
        snap.night && "bg-night text-night-fg",
      )}
    >
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="/logo-novye-ludi.png"
            alt="Команда Новые люди"
            className="h-12 w-auto shrink-0 sm:h-14"
          />
          <div className="min-w-0">
            <p className="font-display text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Команда Новые люди
            </p>
            <h1 className="font-display text-xl font-semibold uppercase leading-none tracking-tight sm:text-2xl">
              Побег с пар
            </h1>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          data-ui
          aria-label={snap.muted ? "Включить звук" : "Выключить звук"}
          onClick={toggleMute}
        >
          {snap.muted ? <VolumeX /> : <Volume2 />}
        </Button>
      </header>

      <div ref={stageRef} className="relative mx-auto w-full max-w-5xl flex-1 px-3 sm:px-6">
        <div
          className={cn(
            "relative overflow-hidden rounded-xl border border-border bg-card shadow-[0_18px_50px_-28px_rgba(17,17,17,0.45)]",
            "h-[min(52vh,440px)] min-h-[240px]",
          )}
        >
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            aria-label="Игровое поле: айтишник перепрыгивает офисные столы"
          />

          <div
            className={cn(
              "pointer-events-none absolute right-4 top-3 z-10 text-right font-display tabular-nums tracking-wider",
              snap.night ? "text-night-fg" : "text-ink",
            )}
          >
            {snap.highScore > 0 && (
              <p className="text-xs text-muted-foreground sm:text-sm">
                HI {pad(snap.highScore)}
              </p>
            )}
            <p className="text-2xl leading-none sm:text-3xl">{pad(snap.score)}</p>
          </div>

          {overlayIntro && (
            <div
              className={cn(
                "absolute inset-0 z-20 flex flex-col items-center justify-center px-5 text-center backdrop-blur-[2px]",
                snap.night
                  ? "bg-[color-mix(in_oklab,var(--color-night)_78%,transparent)]"
                  : "bg-[color-mix(in_oklab,var(--color-background)_78%,transparent)]",
              )}
            >
              <p className="font-display text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Помоги айтишнику
              </p>
              <h2 className="mt-2 max-w-md font-display text-3xl font-semibold uppercase leading-[0.95] tracking-tight sm:text-5xl">
                Перепрыгни
                <br />
                рабочие столы
              </h2>
              <p className="mt-3 max-w-sm text-sm text-muted-foreground">
                Набери как можно больше очков. Столы — прыжок, летающие бумаги —
                пригнись.
              </p>
              <Button
                type="button"
                size="lg"
                className="mt-6 min-w-44"
                data-ui
                onClick={play}
                disabled={snap.status === "loading"}
              >
                <Play />
                {snap.status === "loading" ? "Загрузка" : "Играть"}
              </Button>
            </div>
          )}

          {overlayDead && (
            <div
              className={cn(
                "absolute inset-0 z-20 flex flex-col items-center justify-center px-5 text-center backdrop-blur-[2px]",
                snap.night
                  ? "bg-[color-mix(in_oklab,var(--color-night)_72%,transparent)]"
                  : "bg-[color-mix(in_oklab,var(--color-background)_72%,transparent)]",
              )}
            >
              <p className="font-display text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
                Конец спринта
              </p>
              <h2 className="mt-2 font-display text-4xl font-semibold uppercase tracking-tight sm:text-5xl">
                Стоп
              </h2>
              <p className="mt-3 font-display text-2xl tabular-nums">{pad(snap.score)}</p>
              {snap.isNewRecord ? (
                <p className="mt-1 text-sm font-semibold text-teal-deep">Новый рекорд</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Рекорд {pad(snap.highScore)}</p>
              )}
              <Button type="button" size="lg" className="mt-6 min-w-44" data-ui onClick={restart}>
                <RotateCcw />
                Ещё раз
              </Button>
            </div>
          )}
        </div>

        <div className="mt-4 hidden items-center justify-center gap-6 text-sm text-muted-foreground sm:flex">
          <span>
            <kbd className="rounded-sm border border-border bg-card px-1.5 py-0.5 font-display text-xs text-foreground">
              Пробел
            </kbd>{" "}
            прыжок
          </span>
          <span>
            <kbd className="rounded-sm border border-border bg-card px-1.5 py-0.5 font-display text-xs text-foreground">
              Вниз
            </kbd>{" "}
            пригнуться
          </span>
        </div>

        <div className="mt-4 flex items-stretch justify-center gap-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:hidden">
          <button
            type="button"
            className="flex h-16 min-w-0 flex-1 items-center justify-center rounded-lg bg-primary font-display text-lg font-semibold uppercase tracking-wide text-primary-foreground touch-none select-none"
          >
            Прыжок
          </button>
          <button
            type="button"
            data-duck-btn
            className="flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-primary font-display text-sm font-semibold uppercase tracking-wide text-primary-foreground touch-none select-none"
            aria-label="Пригнуться"
          >
            <ChevronDown className="size-8" />
          </button>
        </div>
      </div>
    </div>
  );
}
