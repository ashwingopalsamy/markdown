/** A long name cut by its middle, so both its start and its end still say which it is. */
export const short = (name: string, most: number) => {
  if (name.length <= most) return name;
  const front = Math.round((most - 1) * 0.4);
  const head = name.slice(0, front).replace(/[\s\-_·.,]+\S{0,3}$/, '');
  const tail = name.slice(front + 1 - most).replace(/^\S{0,3}[\s\-_·.,]+/, '');
  return `${head}…${tail}`;
};

let pen: CanvasRenderingContext2D | null | undefined;
/** `short` at the most characters that fit `room` pixels in `font`. */
export const fit = (name: string, room: number, font: string) => {
  pen ??= document.createElement('canvas').getContext('2d');
  if (!pen) return short(name, 24);
  pen.font = font;
  for (let most = name.length; most > 9; most--) {
    const s = short(name, most);
    if (pen.measureText(s).width <= room) return s;
  }
  return short(name, 9);
};
