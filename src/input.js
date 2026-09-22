const held = new Set();
const pressed = new Set();
const BLOCK = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]);

addEventListener("keydown", (e) => {
  if (BLOCK.has(e.code)) e.preventDefault();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
});
addEventListener("keyup", (e) => held.delete(e.code));
addEventListener("blur", () => held.clear());

function gamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

export const input = {
  down: (...codes) => codes.some((c) => held.has(c)),
  /** このフレームで新たに押されたキーか */
  hit: (...codes) => codes.some((c) => pressed.has(c)),
  endFrame() {
    pressed.clear();
  },
  /** プレイヤーの運転入力を kart.control に書き込む */
  readDriving(c) {
    const pad = gamepad();
    const b = (i) => !!pad?.buttons[i]?.pressed;
    const axis = pad ? pad.axes[0] ?? 0 : 0;
    c.throttle = this.down("ArrowUp", "KeyW") || b(0) || b(7) ? 1 : 0;
    c.brake = this.down("ArrowDown", "KeyS") || b(1) || b(6) ? 1 : 0;
    let steer = (this.down("ArrowLeft", "KeyA") ? 1 : 0) - (this.down("ArrowRight", "KeyD") ? 1 : 0);
    if (Math.abs(axis) > 0.15) steer = -axis;
    if (b(14)) steer = 1;
    if (b(15)) steer = -1;
    c.steer = steer;
    c.drift = this.down("Space", "ShiftLeft", "ShiftRight") || b(5);
    c.item = this.down("KeyX", "KeyE", "KeyJ") || b(4) || b(2);
    c.back = c.brake === 1;
  },
};
