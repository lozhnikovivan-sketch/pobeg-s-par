const JUMP_CODES = new Set(["Space", "ArrowUp", "KeyW"]);
const DUCK_CODES = new Set(["ArrowDown", "KeyS"]);

export class GameInput {
  jumpHeld = false;
  duckHeld = false;
  jumpPressed = false;
  restartPressed = false;
  private keys = new Set<string>();
  private duckPointers = new Set<number>();
  private jumpPointers = new Set<number>();
  private unsubs: Array<() => void> = [];

  constructor(private onGesture: () => void) {}

  attach(root: HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (JUMP_CODES.has(e.code) || DUCK_CODES.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.onGesture();
      this.keys.add(e.code);
      if (JUMP_CODES.has(e.code)) {
        this.jumpHeld = true;
        this.jumpPressed = true;
        this.restartPressed = true;
      }
      if (DUCK_CODES.has(e.code)) this.duckHeld = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
      if (JUMP_CODES.has(e.code)) this.jumpHeld = this.hasJumpKey() || this.jumpPointers.size > 0;
      if (DUCK_CODES.has(e.code)) this.duckHeld = this.hasDuckKey() || this.duckPointers.size > 0;
    };
    const clearKeys = () => {
      this.keys.clear();
      this.jumpHeld = this.jumpPointers.size > 0;
      this.duckHeld = this.duckPointers.size > 0;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-ui]")) return;
      this.onGesture();
      if (target?.closest("[data-duck-btn]")) {
        this.duckPointers.add(e.pointerId);
        this.duckHeld = true;
        try {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        return;
      }
      this.jumpPointers.add(e.pointerId);
      this.jumpHeld = true;
      this.jumpPressed = true;
      this.restartPressed = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      this.jumpPointers.delete(e.pointerId);
      this.duckPointers.delete(e.pointerId);
      this.jumpHeld = this.hasJumpKey() || this.jumpPointers.size > 0;
      this.duckHeld = this.hasDuckKey() || this.duckPointers.size > 0;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) clearKeys();
    });
    root.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    this.unsubs.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    });
  }

  consumeJump(): boolean {
    const v = this.jumpPressed;
    this.jumpPressed = false;
    return v;
  }

  consumeRestart(): boolean {
    const v = this.restartPressed;
    this.restartPressed = false;
    return v;
  }

  destroy(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  private hasJumpKey(): boolean {
    for (const c of JUMP_CODES) if (this.keys.has(c)) return true;
    return false;
  }

  private hasDuckKey(): boolean {
    for (const c of DUCK_CODES) if (this.keys.has(c)) return true;
    return false;
  }
}
