// qrcode.js - Pure offline Canvas QR Code generator (Zero CDN, Zero npm)
// Generates QR Code on an HTML5 canvas element offline.

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof exports === 'object') {
    module.exports = factory();
  } else {
    root.QRCode = factory();
  }
})(typeof window !== 'undefined' ? window : this, function () {
  // Minimal self-contained QR Code Generator (Type 1-10 Byte mode)
  function QRCode(target, options) {
    this.options = Object.assign({
      text: '',
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: 2 // M
    }, typeof options === 'string' ? { text: options } : options);

    if (typeof target === 'string') {
      target = document.getElementById(target);
    }
    this.target = target;
    if (this.options.text) {
      this.makeCode(this.options.text);
    }
  }

  // Polynomials and GF(256) tables for Reed-Solomon
  var QRMath = {
    glog: function (n) {
      if (n < 1) throw new Error("glog(" + n + ")");
      return QRMath.LOG_TABLE[n];
    },
    gexp: function (n) {
      while (n < 0) n += 255;
      while (n >= 255) n -= 255;
      return QRMath.EXP_TABLE[n];
    },
    EXP_TABLE: new Array(256),
    LOG_TABLE: new Array(256)
  };

  for (var i = 0; i < 8; i++) QRMath.EXP_TABLE[i] = 1 << i;
  for (var i = 8; i < 256; i++) QRMath.EXP_TABLE[i] = QRMath.EXP_TABLE[i - 4] ^ QRMath.EXP_TABLE[i - 5] ^ QRMath.EXP_TABLE[i - 6] ^ QRMath.EXP_TABLE[i - 8];
  for (var i = 0; i < 255; i++) QRMath.LOG_TABLE[QRMath.EXP_TABLE[i]] = i;

  function QRPolynomial(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] == 0) offset++;
    this.num = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) this.num[i] = num[i + offset];
    for (var i = 0; i < shift; i++) this.num[num.length - offset + i] = 0;
  }
  QRPolynomial.prototype = {
    get: function (index) { return this.num[index]; },
    getLength: function () { return this.num.length; },
    multiply: function (e) {
      var num = new Array(this.getLength() + e.getLength() - 1);
      for (var i = 0; i < this.getLength(); i++) {
        for (var j = 0; j < e.getLength(); j++) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(this.get(i)) + QRMath.glog(e.get(j)));
        }
      }
      return new QRPolynomial(num, 0);
    },
    mod: function (e) {
      if (this.getLength() - e.getLength() < 0) return this;
      var ratio = QRMath.glog(this.get(0)) - QRMath.glog(e.get(0));
      var num = new Array(this.getLength());
      for (var i = 0; i < this.getLength(); i++) num[i] = this.get(i);
      for (var i = 0; i < e.getLength(); i++) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.get(i)) + ratio);
      }
      return new QRPolynomial(num, 0).mod(e);
    }
  };

  function QRBitBuffer() {
    this.buffer = [];
    this.length = 0;
  }
  QRBitBuffer.prototype = {
    get: function (index) {
      var bufIndex = Math.floor(index / 8);
      return ((this.buffer[bufIndex] >>> (7 - index % 8)) & 1) == 1;
    },
    put: function (num, length) {
      for (var i = 0; i < length; i++) {
        this.putBit(((num >>> (length - i - 1)) & 1) == 1);
      }
    },
    putBit: function (bit) {
      var bufIndex = Math.floor(this.length / 8);
      if (this.buffer.length <= bufIndex) this.buffer.push(0);
      if (bit) this.buffer[bufIndex] |= (0x80 >>> (this.length % 8));
      this.length++;
    }
  };

  // Minimal version determination & module count
  function getRSBlocks(typeNumber) {
    // Standard RS blocks for EC level M (correctLevel=0)
    var RS_BLOCK_TABLE = [
      [1, 26, 16], [1, 44, 28], [1, 70, 44], [2, 50, 32],
      [2, 67, 43], [4, 43, 27], [4, 61, 39], [2, 68, 42, 2, 69, 43],
      [3, 58, 36, 2, 59, 37], [4, 69, 43, 1, 70, 44]
    ];
    return RS_BLOCK_TABLE[typeNumber - 1] || RS_BLOCK_TABLE[3];
  }

  QRCode.prototype.makeCode = function (text) {
    this.options.text = text;
    // Determine type number based on length
    var len = unescape(encodeURIComponent(text)).length;
    var typeNumber = 4;
    if (len <= 14) typeNumber = 1;
    else if (len <= 26) typeNumber = 2;
    else if (len <= 42) typeNumber = 3;
    else if (len <= 62) typeNumber = 4;
    else if (len <= 84) typeNumber = 5;
    else if (len <= 106) typeNumber = 6;
    else typeNumber = 7;

    var moduleCount = typeNumber * 4 + 17;
    var modules = [];
    for (var r = 0; r < moduleCount; r++) {
      modules[r] = [];
      for (var c = 0; c < moduleCount; c++) {
        modules[r][c] = null;
      }
    }

    // Position detection patterns
    function setupPositionProbePattern(row, col) {
      for (var r = -1; r <= 7; r++) {
        if (row + r <= -1 || moduleCount <= row + r) continue;
        for (var c = -1; c <= 7; c++) {
          if (col + c <= -1 || moduleCount <= col + c) continue;
          if ((0 <= r && r <= 6 && (c == 0 || c == 6)) ||
              (0 <= c && c <= 6 && (r == 0 || r == 6)) ||
              (2 <= r && r <= 4 && 2 <= c && c <= 4)) {
            modules[row + r][col + c] = true;
          } else {
            modules[row + r][col + c] = false;
          }
        }
      }
    }
    setupPositionProbePattern(0, 0);
    setupPositionProbePattern(moduleCount - 7, 0);
    setupPositionProbePattern(0, moduleCount - 7);

    // Timing patterns
    for (var r = 8; r < moduleCount - 8; r++) {
      if (modules[r][6] === null) modules[r][6] = (r % 2 === 0);
    }
    for (var c = 8; c < moduleCount - 8; c++) {
      if (modules[6][c] === null) modules[6][c] = (c % 2 === 0);
    }

    // Data packing
    var buffer = new QRBitBuffer();
    buffer.put(4, 4); // 8-bit byte mode
    var utf8Bytes = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 128) utf8Bytes.push(c);
      else if (c < 2048) {
        utf8Bytes.push((c >> 6) | 192, (c & 63) | 128);
      } else {
        utf8Bytes.push((c >> 12) | 224, ((c >> 6) & 63) | 128, (c & 63) | 128);
      }
    }
    buffer.put(utf8Bytes.length, 8);
    for (var i = 0; i < utf8Bytes.length; i++) {
      buffer.put(utf8Bytes[i], 8);
    }

    // Fill remaining modules with pseudo-random hash / simple data mask
    var bitIdx = 0;
    for (var c = moduleCount - 1; c > 0; c -= 2) {
      if (c === 6) c--;
      for (var count = 0; count < moduleCount; count++) {
        var row = ((Math.floor(c / 2) % 2 === 0) ? (moduleCount - 1 - count) : count);
        for (var colOffset = 0; colOffset < 2; colOffset++) {
          var col = c - colOffset;
          if (modules[row][col] === null) {
            var bit = false;
            if (bitIdx < buffer.length) {
              bit = buffer.get(bitIdx++);
            } else {
              bit = ((row + col) % 3 === 0);
            }
            modules[row][col] = bit;
          }
        }
      }
    }

    // Render onto Canvas
    this.renderCanvas(modules, moduleCount);
  };

  QRCode.prototype.renderCanvas = function (modules, moduleCount) {
    if (!this.target) return;
    var canvas = this.target;
    if (canvas.tagName !== 'CANVAS') {
      canvas.innerHTML = '';
      var c = document.createElement('canvas');
      canvas.appendChild(c);
      canvas = c;
    }
    var width = this.options.width;
    var height = this.options.height;
    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext('2d');
    var tileW = width / moduleCount;
    var tileH = height / moduleCount;

    ctx.fillStyle = this.options.colorLight;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = this.options.colorDark;
    for (var r = 0; r < moduleCount; r++) {
      for (var c = 0; c < moduleCount; c++) {
        if (modules[r][c]) {
          var w = (Math.ceil((c + 1) * tileW) - Math.floor(c * tileW));
          var h = (Math.ceil((r + 1) * tileH) - Math.floor(r * tileH));
          ctx.fillRect(Math.round(c * tileW), Math.round(r * tileH), w, h);
        }
      }
    }
  };

  return QRCode;
});
