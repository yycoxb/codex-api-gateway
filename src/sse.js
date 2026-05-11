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
  return parseSseFrame(frame).data;
}

export function parseSseFrame(frame) {
  let event = null;
  const dataLines = [];

  for (const rawLine of String(frame || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(':')) continue;

    if (line.startsWith('event:')) {
      const value = line.replace(/^event:\s*/, '').trim();
      if (value) event = value;
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.replace(/^data:\s*/, ''));
    }
  }

  const data = dataLines.join('\n').trim();
  return {
    event,
    data: data || null,
  };
}

export function eventNameFromSseFrame(frame) {
  return parseSseFrame(frame).event;
}
