export function splitSseFrames(textBuffer) {
  const frames = [];
  let rest = textBuffer;
  while (true) {
    const nn = rest.indexOf('\n\n');
    const rr = rest.indexOf('\r\n\r\n');
    let index = -1;
    let sepLen = 0;

    if (nn >= 0 && (rr < 0 || nn < rr)) {
      index = nn;
      sepLen = 2;
    } else if (rr >= 0) {
      index = rr;
      sepLen = 4;
    } else {
      break;
    }

    frames.push(rest.slice(0, index));
    rest = rest.slice(index + sepLen);
  }
  return { frames, rest };
}

export function dataPayloadFromSseFrame(frame) {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('data:'))
    .map((line) => line.replace(/^data:\s*/, ''));

  if (!dataLines.length) return null;
  const data = dataLines.join('\n').trim();
  return data || null;
}
