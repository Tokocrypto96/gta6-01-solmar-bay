// Solmar Bay — keyboard & mouse input (v2).
//
// Two flavours of key state: held keys (driving, walking) and edge-triggered
// presses that live for exactly one frame (steal a car, pause, punch). The
// mouse orbits the camera two ways — drag anywhere, or click once for
// pointer lock — so the game stays playable in a plain screenshot browser
// where pointer lock may never engage.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    /** Codes currently held down. */
    this.keys = new Set();
    /** Codes that went down this frame; cleared by endFrame(). */
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    /** Left button went down this frame (a shot, once armed). */
    this.clicked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.locked = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      // Keep the page itself from scrolling on the keys the game uses.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Losing focus mid-chase must not leave a key stuck down forever.
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      // Only the left button counts as a click: a right-button drag orbits
      // the camera and must not queue a shot that fires a frame late.
      if (e.button === 0) this.clicked = true;
    });
    // Right-drag orbits too — swallow the context menu so it never pops.
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
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

  /** True while any of the given keys is held (WASD and arrows both count). */
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True only on the frame one of the given keys went down. */
  wasPressed(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Mouse travel since the last read, in pixels; reading resets it. */
  consumeMouse() {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  /** True only on the frame the left button went down; reading clears it. */
  consumeClick() {
    const was = this.clicked;
    this.clicked = false;
    return was;
  }

  /** End of frame: edge-triggered presses live exactly one frame. */
  endFrame() {
    this.pressed.clear();
  }
}
