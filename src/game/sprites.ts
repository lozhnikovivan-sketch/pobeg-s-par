export type SpriteSheet = {
  img: HTMLImageElement;
  cols: number;
  rows: number;
};

export type SpriteBank = {
  run: SpriteSheet;
  jump: SpriteSheet;
  duck: SpriteSheet;
  papers: SpriteSheet;
  deskSmall: HTMLImageElement;
  deskWide: HTMLImageElement;
  deskTall: HTMLImageElement;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Не удалось загрузить ${src}`));
    img.src = src;
  });
}

export async function loadSprites(): Promise<SpriteBank> {
  const [run, jump, duck, papers, deskSmall, deskWide, deskTall] = await Promise.all([
    loadImage("/sprites/hero-run.png"),
    loadImage("/sprites/hero-jump.png"),
    loadImage("/sprites/hero-duck.png"),
    loadImage("/sprites/papers.png"),
    loadImage("/sprites/desk-small.png"),
    loadImage("/sprites/desk-wide.png"),
    loadImage("/sprites/desk-tall.png"),
  ]);
  return {
    run: { img: run, cols: 3, rows: 2 },
    jump: { img: jump, cols: 2, rows: 2 },
    duck: { img: duck, cols: 2, rows: 2 },
    papers: { img: papers, cols: 2, rows: 2 },
    deskSmall,
    deskWide,
    deskTall,
  };
}

export function drawSheet(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  index: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const count = sheet.cols * sheet.rows;
  const i = ((index % count) + count) % count;
  const fw = sheet.img.width / sheet.cols;
  const fh = sheet.img.height / sheet.rows;
  const sx = (i % sheet.cols) * fw;
  const sy = Math.floor(i / sheet.cols) * fh;
  ctx.drawImage(sheet.img, sx, sy, fw, fh, dx, dy, dw, dh);
}
