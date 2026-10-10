const { PNG } = require('pngjs');

const WIDTH = 900;
const HEIGHT = 900;
const BOARD_SIZE = 720;
const SQUARE = BOARD_SIZE / 8;
const BOARD_X = 90;
const BOARD_Y = 90;

const COLORS = {
  background: [29, 31, 38, 255],
  border: [72, 77, 91, 255],
  lightSquare: [232, 225, 209, 255],
  darkSquare: [95, 125, 96, 255],
  whitePiece: [246, 246, 241, 255],
  whiteStroke: [95, 99, 110, 255],
  blackPiece: [35, 38, 46, 255],
  blackStroke: [232, 225, 209, 255],
};

const STARTING_POSITION = [
  ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
  ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
  ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr'],
];

function createImage() {
  const png = new PNG({ width: WIDTH, height: HEIGHT });

  fillRect(png, 0, 0, WIDTH, HEIGHT, COLORS.background);
  fillRect(png, BOARD_X - 14, BOARD_Y - 14, BOARD_SIZE + 28, BOARD_SIZE + 28, COLORS.border);
  fillRect(png, BOARD_X - 8, BOARD_Y - 8, BOARD_SIZE + 16, BOARD_SIZE + 16, [21, 23, 29, 255]);

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const x = BOARD_X + file * SQUARE;
      const y = BOARD_Y + rank * SQUARE;
      const color = (rank + file) % 2 === 0 ? COLORS.lightSquare : COLORS.darkSquare;

      fillRect(png, x, y, SQUARE, SQUARE, color);
    }
  }

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = STARTING_POSITION[rank][file];

      if (!piece) {
        continue;
      }

      drawPiece(
        png,
        piece,
        BOARD_X + file * SQUARE + SQUARE / 2,
        BOARD_Y + rank * SQUARE + SQUARE / 2,
      );
    }
  }

  return PNG.sync.write(png);
}

function setPixel(png, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);

  if (px < 0 || py < 0 || px >= png.width || py >= png.height) {
    return;
  }

  const index = (py * png.width + px) * 4;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function fillRect(png, x, y, width, height, color) {
  for (let py = Math.floor(y); py < y + height; py += 1) {
    for (let px = Math.floor(x); px < x + width; px += 1) {
      setPixel(png, px, py, color);
    }
  }
}

function drawLine(png, x1, y1, x2, y2, color, thickness = 3) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));

  for (let index = 0; index <= steps; index += 1) {
    const t = steps === 0 ? 0 : index / steps;
    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;
    fillCircle(png, x, y, thickness / 2, color);
  }
}

function fillCircle(png, centerX, centerY, radius, color) {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;

      if (dx * dx + dy * dy <= radius * radius) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function fillEllipse(png, centerX, centerY, radiusX, radiusY, color) {
  for (let y = centerY - radiusY; y <= centerY + radiusY; y += 1) {
    for (let x = centerX - radiusX; x <= centerX + radiusX; x += 1) {
      const dx = (x - centerX) / radiusX;
      const dy = (y - centerY) / radiusY;

      if (dx * dx + dy * dy <= 1) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function fillPolygon(png, points, color) {
  const minX = Math.floor(Math.min(...points.map(([x]) => x)));
  const maxX = Math.ceil(Math.max(...points.map(([x]) => x)));
  const minY = Math.floor(Math.min(...points.map(([, y]) => y)));
  const maxY = Math.ceil(Math.max(...points.map(([, y]) => y)));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x, y, points)) {
        setPixel(png, x, y, color);
      }
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function drawPiece(png, piece, centerX, centerY) {
  const side = piece[0];
  const type = piece[1];
  const fill = side === 'w' ? COLORS.whitePiece : COLORS.blackPiece;
  const stroke = side === 'w' ? COLORS.whiteStroke : COLORS.blackStroke;

  drawBase(png, centerX, centerY, fill, stroke);

  if (type === 'p') drawPawn(png, centerX, centerY, fill, stroke);
  if (type === 'r') drawRook(png, centerX, centerY, fill, stroke);
  if (type === 'n') drawKnight(png, centerX, centerY, fill, stroke);
  if (type === 'b') drawBishop(png, centerX, centerY, fill, stroke);
  if (type === 'q') drawQueen(png, centerX, centerY, fill, stroke);
  if (type === 'k') drawKing(png, centerX, centerY, fill, stroke);
}

function drawBase(png, x, y, fill, stroke) {
  fillEllipse(png, x, y + 31, 29, 8, stroke);
  fillEllipse(png, x, y + 29, 25, 7, fill);
  fillRect(png, x - 18, y + 16, 36, 15, fill);
  fillRect(png, x - 21, y + 29, 42, 5, stroke);
}

function drawPawn(png, x, y, fill, stroke) {
  fillCircle(png, x, y - 17, 14, stroke);
  fillCircle(png, x, y - 18, 11, fill);
  fillEllipse(png, x, y + 4, 17, 24, stroke);
  fillEllipse(png, x, y + 4, 13, 20, fill);
}

function drawRook(png, x, y, fill, stroke) {
  fillRect(png, x - 22, y - 22, 44, 11, stroke);
  fillRect(png, x - 19, y - 20, 9, 12, fill);
  fillRect(png, x - 4, y - 20, 9, 12, fill);
  fillRect(png, x + 11, y - 20, 9, 12, fill);
  fillRect(png, x - 17, y - 8, 34, 31, stroke);
  fillRect(png, x - 13, y - 7, 26, 27, fill);
}

function drawKnight(png, x, y, fill, stroke) {
  fillPolygon(
    png,
    [
      [x - 18, y + 24],
      [x - 12, y - 15],
      [x + 4, y - 31],
      [x + 23, y - 20],
      [x + 14, y - 4],
      [x + 21, y + 24],
    ],
    stroke,
  );
  fillPolygon(
    png,
    [
      [x - 12, y + 21],
      [x - 7, y - 12],
      [x + 5, y - 24],
      [x + 17, y - 17],
      [x + 9, y - 4],
      [x + 14, y + 21],
    ],
    fill,
  );
  fillCircle(png, x + 8, y - 16, 2, stroke);
}

function drawBishop(png, x, y, fill, stroke) {
  fillEllipse(png, x, y - 3, 20, 31, stroke);
  fillEllipse(png, x, y - 4, 16, 27, fill);
  drawLine(png, x + 8, y - 22, x - 4, y + 3, stroke, 4);
  fillCircle(png, x, y - 33, 7, stroke);
  fillCircle(png, x, y - 33, 4, fill);
}

function drawQueen(png, x, y, fill, stroke) {
  fillPolygon(
    png,
    [
      [x - 24, y + 14],
      [x - 18, y - 23],
      [x - 7, y - 7],
      [x, y - 29],
      [x + 7, y - 7],
      [x + 18, y - 23],
      [x + 24, y + 14],
    ],
    stroke,
  );
  fillPolygon(
    png,
    [
      [x - 18, y + 12],
      [x - 14, y - 15],
      [x - 5, y - 1],
      [x, y - 21],
      [x + 5, y - 1],
      [x + 14, y - 15],
      [x + 18, y + 12],
    ],
    fill,
  );
  fillCircle(png, x - 18, y - 24, 5, stroke);
  fillCircle(png, x, y - 31, 5, stroke);
  fillCircle(png, x + 18, y - 24, 5, stroke);
}

function drawKing(png, x, y, fill, stroke) {
  fillEllipse(png, x, y, 20, 28, stroke);
  fillEllipse(png, x, y, 16, 24, fill);
  drawLine(png, x, y - 36, x, y - 12, stroke, 5);
  drawLine(png, x - 10, y - 28, x + 10, y - 28, stroke, 5);
}

module.exports = {
  createImage,
};
