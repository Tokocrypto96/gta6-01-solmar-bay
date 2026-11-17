// Solmar Bay — keyboard and mouse input. Tracks held keys, edge-triggered presses,
// and a drag-to-orbit camera (pointer lock is offered on click, drag works always,
// so the game is playable in a screenshot browser too).
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.locked = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 0) this.clicked = true;
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.dragging = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
        return;
      }
      if (!this.dragging) return;
      this.mouseDX += e.clientX - this.lastX;
      this.mouseDY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    });
    canvas.addEventListener('click', () => {
      if (!this.locked && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('pointerlockerror', () => { this.locked = false; });
  }

  /** Held this frame (WASD and arrows both count). */
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True only on the frame the key went down. */
  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Mouse movement since last frame, in pixels; resets when read. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  /** True only on the frame the left button went down. */
  consumeClick() {
    const c = this.clicked;
    this.clicked = false;
    return c;
  }

  /** Call at the end of each frame so edge presses last exactly one frame. */
  endFrame() {
    this.pressed.clear();
  }
}
