import { GameAudio } from "./audio";
import { GameInput } from "./input";
import { loadSave, writeSave, type SaveData } from "./save";
import { drawSheet, loadSprites, type SpriteBank } from "./sprites";

export type GameStatus = "loading" | "intro" | "playing" | "dead";

export type GameSnapshot = {
  status: GameStatus;
  score: number;
  highScore: number;
  muted: boolean;
  night: boolean;
  isNewRecord: boolean;
};

type ObstacleKind = "desk-small" | "desk-wide" | "desk-tall" | "papers";

type Obstacle = {
  alive: boolean;
  kind: ObstacleKind;
  x: number;
  w: number;
  h: number;
  hitW: number;
  hitH: number;
  hitOx: number;
  fly: "none" | "low" | "high";
  frame: number;
  frameT: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};

type Cloud = { x: number; y: number; w: number; h: number; par: number };

const STEP = 1 / 60;
const VIEW_H = 300;
const GROUND = 246;
const PLAYER_X = 78;
const GRAVITY = 2400;
const JUMP_V = -780;
const JUMP_CUT = 0.42;
const SPEED_START = 360;
const SPEED_MAX = 780;
const COYOTE = 0.08;
const BUFFER = 0.12;
const RUN_FPS = 11;
const TEAL = "#00d4c8";
const INK = "#111111";
const PAPER = "#f4fffd";
const NIGHT = "#062624";

const KIND_SIZE: Record<Exclude<ObstacleKind, "papers">, { w: number; h: number; hitW: number; hitH: number; hitOx: number }> = {
  "desk-small": { w: 78, h: 68, hitW: 52, hitH: 54, hitOx: 14 },
  "desk-wide": { w: 118, h: 78, hitW: 88, hitH: 62, hitOx: 14 },
  "desk-tall": { w: 84, h: 112, hitW: 54, hitH: 98, hitOx: 16 },
};

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function aabb(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class OfficeSprintGame {
  status: GameStatus = "loading";
  score = 0;
  highScore = 0;
  muted = false;
  night = false;
  isNewRecord = false;
  onChange: (() => void) | null = null;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private sprites: SpriteBank | null = null;
  private input: GameInput;
  private audio = new GameAudio();
  private save: SaveData;
  private raf = 0;
  private lastT = 0;
  private acc = 0;
  private time = 0;
  private distance = 0;
  private speed = SPEED_START;
  private spawnIn = 1.4;
  private lastKind: ObstacleKind | null = null;
  private playerY = GROUND;
  private playerVy = 0;
  private grounded = true;
  private ducking = false;
  private coyote = 0;
  private buffer = 0;
  private animT = 0;
  private squash = 1;
  private hitStop = 0;
  private trauma = 0;
  private flash = 0;
  private deadAt = 0;
  private groundX = 0;
  private scorePulse = 0;
  private obstacles: Obstacle[] = [];
  private particles: Particle[] = [];
  private clouds: Cloud[] = [];
  private reducedMotion = false;
  private viewW = 640;
  private dpr = 1;
  private running = false;
  private jumpHeldPrev = false;

  constructor(canvas: HTMLCanvasElement, root: HTMLElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D недоступен");
    this.ctx = ctx;
    this.save = loadSave();
    this.highScore = this.save.highScore;
    this.muted = this.save.muted;
    this.audio.setMuted(this.muted);
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.input = new GameInput(() => this.audio.unlock());
    this.input.attach(root);
    this.seedClouds();
  }

  snapshot(): GameSnapshot {
    return {
      status: this.status,
      score: this.score,
      highScore: this.highScore,
      muted: this.muted,
      night: this.night,
      isNewRecord: this.isNewRecord,
    };
  }

  async boot(): Promise<void> {
    this.resize();
    this.sprites = await loadSprites();
    this.status = "intro";
    this.emit();
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.audio.setMuted(muted);
    this.save.muted = muted;
    writeSave(this.save);
    this.emit();
  }

  unlockAudio(): void {
    this.audio.unlock();
  }

  playFromIntro(): void {
    if (this.status !== "intro") return;
    this.unlockAudio();
    this.beginRun(true);
  }

  restart(): void {
    if (this.status !== "dead") return;
    this.unlockAudio();
    this.beginRun(true);
  }

  resize(): void {
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.viewW = VIEW_H * (cssW / cssH);
  }

  destroy(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.input.destroy();
  }

  private emit() {
    this.onChange?.();
  }

  private loop = (t: number) => {
    if (!this.running) return;
    const raw = (t - this.lastT) / 1000;
    this.lastT = t;
    const dt = Math.min(raw, 0.1);
    this.acc += dt;
    while (this.acc >= STEP) {
      if (this.hitStop > 0) this.hitStop -= STEP;
      else this.step(STEP);
      this.acc -= STEP;
    }
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  };

  private beginRun(jumpStart: boolean) {
    this.status = "playing";
    this.score = 0;
    this.distance = 0;
    this.speed = SPEED_START;
    this.spawnIn = 1.35;
    this.lastKind = null;
    this.playerY = GROUND;
    this.playerVy = 0;
    this.grounded = true;
    this.ducking = false;
    this.coyote = 0;
    this.buffer = 0;
    this.animT = 0;
    this.squash = 1;
    this.hitStop = 0;
    this.trauma = 0;
    this.flash = 0;
    this.deadAt = 0;
    this.night = false;
    this.isNewRecord = false;
    this.scorePulse = 0;
    for (const o of this.obstacles) o.alive = false;
    this.particles.length = 0;
    if (jumpStart) {
      this.playerVy = JUMP_V;
      this.grounded = false;
      this.audio.jump();
      this.squash = 1.18;
    }
    this.emit();
  }

  private step(dt: number) {
    this.time += dt;
    const jump = this.input.consumeJump();
    const restart = this.input.consumeRestart();

    if (this.status === "intro") {
      this.animT += dt;
      this.groundX += 90 * dt;
      if (jump) this.beginRun(true);
      this.decayJuice(dt);
      return;
    }

    if (this.status === "dead") {
      this.animT += dt;
      this.decayJuice(dt);
      this.updateParticles(dt);
      if (this.time - this.deadAt > 0.55 && restart) this.beginRun(true);
      return;
    }

    if (this.status !== "playing") return;

    this.ducking = this.input.duckHeld && this.grounded;
    if (jump) this.buffer = BUFFER;
    this.buffer = Math.max(0, this.buffer - dt);
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);

    if (this.buffer > 0 && this.coyote > 0) {
      this.playerVy = JUMP_V;
      this.grounded = false;
      this.ducking = false;
      this.buffer = 0;
      this.coyote = 0;
      this.squash = 1.22;
      this.audio.jump();
    }

    const jumpHeld = this.input.jumpHeld;
    if (this.jumpHeldPrev && !jumpHeld && !this.grounded && this.playerVy < 0) {
      this.playerVy *= JUMP_CUT;
    }
    this.jumpHeldPrev = jumpHeld;

    const g = GRAVITY * (this.input.duckHeld && this.playerVy > 0 ? 1.7 : 1);
    this.playerVy += g * dt;
    this.playerVy = Math.min(this.playerVy, 1400);
    this.playerY += this.playerVy * dt;

    if (this.playerY >= GROUND) {
      if (!this.grounded) {
        this.audio.land();
        this.squash = 0.82;
        this.burst(PLAYER_X + 20, GROUND, 7, TEAL);
      }
      this.playerY = GROUND;
      this.playerVy = 0;
      this.grounded = true;
    }

    this.squash += (1 - this.squash) * (1 - Math.exp(-14 * dt));
    this.animT += dt;
    this.speed = Math.min(SPEED_MAX, SPEED_START + this.distance * 0.011);
    this.distance += this.speed * dt;
    this.groundX += this.speed * dt;

    const nextScore = Math.floor(this.distance / 10);
    if (nextScore !== this.score) {
      this.score = nextScore;
      if (this.score > 0 && this.score % 100 === 0) {
        this.audio.scoreTick();
        this.scorePulse = 1;
      }
      const nowNight = Math.floor(this.score / 700) % 2 === 1;
      if (nowNight !== this.night) this.night = nowNight;
      this.emit();
    }
    this.scorePulse = Math.max(0, this.scorePulse - dt * 2.4);

    this.spawnIn -= dt;
    if (this.spawnIn <= 0) this.spawn();

    for (const o of this.obstacles) {
      if (!o.alive) continue;
      o.x -= this.speed * dt;
      if (o.kind === "papers") {
        o.frameT += dt;
        if (o.frameT > 0.12) {
          o.frameT = 0;
          o.frame = (o.frame + 1) % 4;
        }
      }
      if (o.x + o.w < -40) o.alive = false;
    }

    this.dust(dt);
    this.updateParticles(dt);
    this.decayJuice(dt);

    if (this.hitsObstacle()) this.die();
  }

  private spawn() {
    const score = this.score;
    const kinds: ObstacleKind[] = ["desk-small", "desk-small", "desk-wide"];
    if (score > 80) kinds.push("desk-tall");
    if (score > 180) kinds.push("papers");
    if (score > 320) kinds.push("papers");

    let kind = kinds[Math.floor(Math.random() * kinds.length)] ?? "desk-small";
    if (this.lastKind === "papers" && kind === "papers") kind = "desk-small";

    const o = this.alloc();
    o.alive = true;
    o.kind = kind;
    o.x = this.viewW + 24;
    o.frame = 0;
    o.frameT = 0;
    o.fly = "none";

    if (kind === "papers") {
      o.fly = "low";
      o.w = 72;
      o.h = 48;
      o.hitW = 48;
      o.hitH = 30;
      o.hitOx = 12;
    } else {
      const s = KIND_SIZE[kind];
      o.w = s.w;
      o.h = s.h;
      o.hitW = s.hitW;
      o.hitH = s.hitH;
      o.hitOx = s.hitOx;
    }

    const reaction = clamp(1.28 - this.speed * 0.00035, 0.95, 1.35);
    let gap = this.speed * reaction;
    if (this.lastKind === "papers") gap += 70;
    if (kind === "desk-tall") gap += 40;
    this.spawnIn = gap / this.speed;
    this.lastKind = kind;
  }

  private alloc(): Obstacle {
    const idle = this.obstacles.find((o) => !o.alive);
    if (idle) return idle;
    const fresh: Obstacle = {
      alive: false,
      kind: "desk-small",
      x: 0,
      w: 0,
      h: 0,
      hitW: 0,
      hitH: 0,
      hitOx: 0,
      fly: "none",
      frame: 0,
      frameT: 0,
    };
    this.obstacles.push(fresh);
    return fresh;
  }

  private playerBox() {
    if (this.ducking) {
      return { x: PLAYER_X + 10, y: this.playerY - 34, w: 48, h: 32 };
    }
    return { x: PLAYER_X + 16, y: this.playerY - 64, w: 30, h: 58 };
  }

  private obstacleBox(o: Obstacle) {
    const bottom = o.kind === "papers" ? GROUND - 50 : GROUND;
    const y = bottom - o.hitH;
    return { x: o.x + o.hitOx, y, w: o.hitW, h: o.hitH };
  }

  private hitsObstacle(): boolean {
    const p = this.playerBox();
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      const b = this.obstacleBox(o);
      if (aabb(p.x, p.y, p.w, p.h, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  }

  private die() {
    this.status = "dead";
    this.deadAt = this.time;
    this.hitStop = 0.08;
    this.trauma = this.reducedMotion ? 0.15 : 0.85;
    this.flash = 1;
    this.audio.crash();
    this.burst(PLAYER_X + 24, this.playerY - 30, 18, TEAL);
    this.burst(PLAYER_X + 24, this.playerY - 20, 10, INK);
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.isNewRecord = true;
      this.save.highScore = this.highScore;
      writeSave(this.save);
    }
    this.emit();
  }

  private dust(dt: number) {
    if (!this.grounded || this.ducking) return;
    if (Math.random() < dt * 14) {
      this.particles.push({
        x: PLAYER_X + 8,
        y: GROUND - 3,
        vx: -this.speed * 0.15 + (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 30,
        life: 0.28,
        max: 0.28,
        size: 2 + Math.random() * 2,
        color: this.night ? TEAL : INK,
      });
    }
  }

  private burst(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 180;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.35 + Math.random() * 0.25,
        max: 0.5,
        size: 2 + Math.random() * 3,
        color,
      });
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 420 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private decayJuice(dt: number) {
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.flash = Math.max(0, this.flash - dt * 4);
  }

  private seedClouds() {
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({
        x: hash(i + 2) * 900,
        y: 18 + hash(i + 9) * 90,
        w: 70 + hash(i + 4) * 110,
        h: 18 + hash(i + 6) * 22,
        par: 0.12 + hash(i + 1) * 0.18,
      });
    }
  }

  private render() {
    const ctx = this.ctx;
    const cssW = Math.max(1, this.canvas.clientWidth);
    const cssH = Math.max(1, this.canvas.clientHeight);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const scale = cssH / VIEW_H;
    const shake = this.trauma * this.trauma;
    const ox = this.reducedMotion ? 0 : (hash(this.time * 40) - 0.5) * 16 * shake;
    const oy = this.reducedMotion ? 0 : (hash(this.time * 40 + 8) - 0.5) * 12 * shake;

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    const night = this.night;
    ctx.fillStyle = night ? NIGHT : PAPER;
    ctx.fillRect(-20, -20, this.viewW + 40, VIEW_H + 40);

    this.drawParallax(ctx, night);
    this.drawGround(ctx, night);
    this.drawObstacles(ctx);
    this.drawPlayer(ctx);
    this.drawParticles(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(0, 212, 200, ${this.flash * 0.28})`;
      ctx.fillRect(0, 0, this.viewW, VIEW_H);
    }

    ctx.restore();
  }

  private drawParallax(ctx: CanvasRenderingContext2D, night: boolean) {
    ctx.save();
    ctx.globalAlpha = night ? 0.22 : 0.28;
    ctx.fillStyle = TEAL;
    for (const c of this.clouds) {
      const x = ((c.x - this.groundX * c.par) % (this.viewW + c.w + 80)) - 40;
      this.roundBlob(ctx, x, c.y, c.w, c.h);
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = night ? 0.12 : 0.1;
    ctx.fillStyle = INK;
    const winW = 36;
    for (let i = 0; i < 12; i++) {
      const x = ((i * 90 - this.groundX * 0.2) % (this.viewW + 90)) - 20;
      ctx.fillRect(x, 36, winW, 52);
      ctx.fillRect(x + 8, 44, 8, 10);
      ctx.fillRect(x + 20, 44, 8, 10);
      ctx.fillRect(x + 8, 60, 8, 10);
      ctx.fillRect(x + 20, 60, 8, 10);
    }
    ctx.restore();
  }

  private roundBlob(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.6);
    ctx.bezierCurveTo(x, y, x + w * 0.3, y - h * 0.2, x + w * 0.5, y + h * 0.2);
    ctx.bezierCurveTo(x + w * 0.8, y - h * 0.1, x + w, y + h * 0.2, x + w, y + h * 0.7);
    ctx.bezierCurveTo(x + w * 0.7, y + h * 1.3, x + w * 0.2, y + h * 1.1, x, y + h * 0.6);
    ctx.fill();
  }

  private drawGround(ctx: CanvasRenderingContext2D, night: boolean) {
    ctx.fillStyle = night ? "#0b3d3a" : TEAL;
    ctx.beginPath();
    ctx.moveTo(-30, GROUND + 8);
    const step = 48;
    const start = -((this.groundX * 0.5) % step);
    for (let x = start - 40, i = 0; x < this.viewW + 80; x += step, i++) {
      const lift = (hash(Math.floor((this.groundX * 0.5 + x) / step)) - 0.5) * 10;
      ctx.lineTo(x, GROUND + 6 + lift);
    }
    ctx.lineTo(this.viewW + 40, VIEW_H + 20);
    ctx.lineTo(-30, VIEW_H + 20);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = night ? TEAL : INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-20, GROUND);
    ctx.lineTo(this.viewW + 20, GROUND);
    ctx.stroke();

    ctx.strokeStyle = night ? "rgba(0,212,200,0.35)" : "rgba(17,17,17,0.28)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -this.groundX * 0.4;
    ctx.beginPath();
    ctx.moveTo(-20, GROUND + 18);
    ctx.lineTo(this.viewW + 20, GROUND + 18);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawObstacles(ctx: CanvasRenderingContext2D) {
    const sprites = this.sprites;
    if (!sprites) return;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      if (o.kind === "papers") {
        const bottom = GROUND - 50;
        const bob = Math.sin(this.time * 8 + o.x * 0.02) * 4;
        drawSheet(ctx, sprites.papers, o.frame, o.x, bottom - o.h + bob, o.w, o.h);
      } else {
        const img =
          o.kind === "desk-small" ? sprites.deskSmall : o.kind === "desk-wide" ? sprites.deskWide : sprites.deskTall;
        ctx.drawImage(img, o.x, GROUND - o.h, o.w, o.h);
      }
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const sprites = this.sprites;
    if (!sprites) return;
    const dead = this.status === "dead";
    let sheet = sprites.run;
    let frame = 0;
    let dw = 78;
    let dh = 92;

    if (dead) {
      sheet = sprites.jump;
      frame = 3;
    } else if (this.status === "intro") {
      frame = Math.floor(this.animT * 8) % 6;
    } else if (!this.grounded) {
      sheet = sprites.jump;
      if (this.playerVy < -220) frame = 1;
      else if (this.playerVy < 80) frame = 2;
      else frame = 3;
    } else if (this.ducking) {
      sheet = sprites.duck;
      dw = 92;
      dh = 62;
      frame = Math.floor(this.animT * RUN_FPS) % 4;
    } else {
      frame = Math.floor(this.animT * RUN_FPS) % 6;
    }

    const sy = this.squash;
    const sx = 1 / sy;
    const drawW = dw * sx;
    const drawH = dh * sy;
    ctx.save();
    if (dead) {
      ctx.translate(PLAYER_X + drawW * 0.45, this.playerY - drawH * 0.35);
      ctx.rotate(-0.35);
      ctx.translate(-(PLAYER_X + drawW * 0.45), -(this.playerY - drawH * 0.35));
    }
    drawSheet(ctx, sheet, frame, PLAYER_X, this.playerY - drawH, drawW, drawH);
    ctx.restore();
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
