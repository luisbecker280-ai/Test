// ============================================================================
// NOCTURNE Nacht 1 — Prozeduraler Sound (WebAudio, keine Dateien)
// Dramaturgie: Grundzustand ist STILLE mit Wind & Blaettern; erst wenn die
// Kreatur jagt, blendet die bedrohliche Verfolgungsmusik ein.
// ============================================================================
"use strict";

function AudioEngine() {
  this.ctx = null;
  this.master = null;
  this.heartTimer = 0;
  this.heartIntensity = 0;
  this.wind = null;
  this.chase = null;
  this.chaseLevel = 0;      // 0..1 Zielpegel der Verfolgungsmusik
  this.radio = null;
  this.pump = null;
  this.engine = null;
  this.rustleTimer = 2;
  this.owlTimer = 14;
}

AudioEngine.prototype._ensure = function () {
  if (!this.ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.6;
    this.master.connect(this.ctx.destination);
  }
  if (this.ctx.state === "suspended") this.ctx.resume();
  return true;
};

AudioEngine.prototype._noise = function (seconds, brown) {
  var len = Math.floor(this.ctx.sampleRate * seconds);
  var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  var d = buf.getChannelData(0), last = 0;
  for (var i = 0; i < len; i++) {
    var w = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else d[i] = w;
  }
  return buf;
};

AudioEngine.prototype._env = function (g, t0, peak, a, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
};

// --- Grund-Ambience: Wind + Blaetterrascheln -------------------------------
AudioEngine.prototype.startAmbience = function () {
  if (!this._ensure() || this.wind) return;
  var ctx = this.ctx;
  var src = ctx.createBufferSource();
  src.buffer = this._noise(5, true); src.loop = true;
  var bp = ctx.createBiquadFilter();
  bp.type = "bandpass"; bp.frequency.value = 300; bp.Q.value = 0.5;
  var g = ctx.createGain(); g.gain.value = 0.16;
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
  var lg = ctx.createGain(); lg.gain.value = 120;
  lfo.connect(lg); lg.connect(bp.frequency); lfo.start();
  var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
  var lg2 = ctx.createGain(); lg2.gain.value = 0.05;
  lfo2.connect(lg2); lg2.connect(g.gain); lfo2.start();
  src.connect(bp); bp.connect(g); g.connect(this.master); src.start();
  this.wind = { src: src, lfo: lfo, lfo2: lfo2, gain: g };
};

AudioEngine.prototype._rustle = function () {           // Blaetter
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource();
  src.buffer = this._noise(0.7);
  var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 2600;
  var g = ctx.createGain();
  this._env(g, t, 0.035 + Math.random() * 0.04, 0.15, 0.5);
  src.connect(hp); hp.connect(g); g.connect(this.master); src.start(t);
};

AudioEngine.prototype._owl = function () {
  var ctx = this.ctx, t = ctx.currentTime;
  [0, 0.45].forEach(function (off) {
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(340, t + off);
    o.frequency.linearRampToValueAtTime(300, t + off + 0.3);
    var g = ctx.createGain();
    this._env(g, t + off, 0.05, 0.06, 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t + off); o.stop(t + off + 0.5);
  }, this);
};

// --- Verfolgungsmusik: pulsierender Bass + Dissonanz + Schlaege -----------
AudioEngine.prototype._startChase = function () {
  if (this.chase) return;
  var ctx = this.ctx;
  var out = ctx.createGain(); out.gain.value = 0;
  out.connect(this.master);
  // Tritonus-Bass
  var b1 = ctx.createOscillator(); b1.type = "sawtooth"; b1.frequency.value = 55;
  var b2 = ctx.createOscillator(); b2.type = "sawtooth"; b2.frequency.value = 78;
  var bg = ctx.createGain(); bg.gain.value = 0.0;
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 300;
  b1.connect(lp); b2.connect(lp); lp.connect(bg); bg.connect(out);
  // Puls-LFO auf den Bass (nervoeses Achtel-Pumpen)
  var lfo = ctx.createOscillator(); lfo.type = "square"; lfo.frequency.value = 3.4;
  var lfog = ctx.createGain(); lfog.gain.value = 0.09;
  lfo.connect(lfog); lfog.connect(bg.gain);
  bg.gain.value = 0.11;
  // hohe dissonante Flaeche
  var h1 = ctx.createOscillator(); h1.type = "triangle"; h1.frequency.value = 622;
  var h2 = ctx.createOscillator(); h2.type = "triangle"; h2.frequency.value = 659;
  var hg = ctx.createGain(); hg.gain.value = 0.028;
  h1.connect(hg); h2.connect(hg); hg.connect(out);
  [b1, b2, lfo, h1, h2].forEach(function (o) { o.start(); });
  this.chase = { out: out, oscs: [b1, b2, lfo, h1, h2], hitTimer: 0 };
};

AudioEngine.prototype.setChase = function (level) {     // 0..1
  this.chaseLevel = Math.max(0, Math.min(1, level));
  if (this.chaseLevel > 0.02 && this._ensure()) this._startChase();
};

AudioEngine.prototype._chaseHit = function () {          // Perkussionsschlag
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = "sine";
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.2);
  var g = ctx.createGain();
  this._env(g, t, 0.5 * this.chaseLevel, 0.005, 0.28);
  o.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.35);
};

// --- Radio -------------------------------------------------------------------
AudioEngine.prototype.setRadio = function (mode) {       // "music"|"news"|"static"|"off"
  if (!this._ensure()) return;
  var ctx = this.ctx;
  if (this.radio) {
    try { this.radio.nodes.forEach(function (n) { n.stop && n.stop(); }); } catch (e) { }
    this.radio = null;
  }
  if (mode === "off") return;
  var out = ctx.createGain(); out.gain.value = 0.05;
  var lp = ctx.createBiquadFilter(); lp.type = "bandpass"; lp.frequency.value = 900; lp.Q.value = 1.1;
  lp.connect(out); out.connect(this.master);
  var nodes = [];
  if (mode === "music") {
    var notes = [220, 262, 330, 262, 294, 220, 330, 392];
    var o = ctx.createOscillator(); o.type = "square";
    var og = ctx.createGain(); og.gain.value = 0.4;
    o.connect(og); og.connect(lp);
    var t0 = ctx.currentTime;
    for (var r = 0; r < 60; r++) for (var i = 0; i < notes.length; i++)
      o.frequency.setValueAtTime(notes[i], t0 + (r * notes.length + i) * 0.32);
    o.start(); nodes.push(o);
  } else if (mode === "news") {
    // gedaempftes "Sprechen": moduliertes Rauschen
    var src = ctx.createBufferSource(); src.buffer = this._noise(4, true); src.loop = true;
    var vg = ctx.createGain(); vg.gain.value = 0.8;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 4.2;
    var lg = ctx.createGain(); lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(vg.gain);
    src.connect(vg); vg.connect(lp);
    src.start(); lfo.start(); nodes.push(src, lfo);
  } else if (mode === "static") {
    var st = ctx.createBufferSource(); st.buffer = this._noise(3); st.loop = true;
    var sg = ctx.createGain(); sg.gain.value = 0.35;
    st.connect(sg); sg.connect(lp);
    st.start(); nodes.push(st);
  }
  this.radio = { nodes: nodes, out: out };
};

// --- Fahrzeuge -----------------------------------------------------------------
AudioEngine.prototype.carPassBy = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = this._noise(3.4, true);
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(160, t);
  lp.frequency.linearRampToValueAtTime(520, t + 1.7);
  lp.frequency.linearRampToValueAtTime(120, t + 3.4);
  var g = ctx.createGain();
  g.gain.setValueAtTime(0.001, t);
  g.gain.linearRampToValueAtTime(0.22, t + 1.7);
  g.gain.linearRampToValueAtTime(0.001, t + 3.4);
  src.connect(lp); lp.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.startEngine = function () {
  if (!this._ensure() || this.engine) return;
  var ctx = this.ctx;
  var o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = 55;
  var src = ctx.createBufferSource(); src.buffer = this._noise(2, true); src.loop = true;
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
  var g = ctx.createGain(); g.gain.value = 0.16;
  o.connect(lp); src.connect(lp); lp.connect(g); g.connect(this.master);
  o.start(); src.start();
  this.engine = { osc: o, src: src, gain: g, lp: lp };
};
AudioEngine.prototype.setEngineSpeed = function (v01) {
  if (this.engine) {
    this.engine.osc.frequency.value = 50 + v01 * 90;
    this.engine.lp.frequency.value = 200 + v01 * 500;
  }
};
AudioEngine.prototype.stopEngine = function () {
  if (!this.engine) return;
  try { this.engine.osc.stop(); this.engine.src.stop(); } catch (e) { }
  this.engine = null;
};
AudioEngine.prototype.engineCrank = function (start) {    // orgeln / anspringen
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  for (var i = 0; i < 5; i++) {
    var o = ctx.createOscillator(); o.type = "square";
    o.frequency.value = 70 + (i % 2) * 22;
    var g = ctx.createGain();
    this._env(g, t + i * 0.17, 0.12, 0.01, 0.12);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.17); o.stop(t + i * 0.17 + 0.16);
  }
  if (start) {
    var o2 = ctx.createOscillator(); o2.type = "sawtooth";
    o2.frequency.setValueAtTime(40, t + 0.9);
    o2.frequency.linearRampToValueAtTime(85, t + 1.5);
    var g2 = ctx.createGain();
    this._env(g2, t + 0.9, 0.22, 0.05, 0.8);
    o2.connect(g2); g2.connect(this.master);
    o2.start(t + 0.9); o2.stop(t + 1.8);
  }
};

// --- Zapfsaeule ------------------------------------------------------------------
AudioEngine.prototype.startPump = function () {
  if (!this._ensure() || this.pump) return;
  var ctx = this.ctx;
  var src = ctx.createBufferSource(); src.buffer = this._noise(2, true); src.loop = true;
  var bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 2;
  var g = ctx.createGain(); g.gain.value = 0.2;
  var lfo = ctx.createOscillator(); lfo.frequency.value = 9;
  var lg = ctx.createGain(); lg.gain.value = 0.08;
  lfo.connect(lg); lg.connect(g.gain);
  src.connect(bp); bp.connect(g); g.connect(this.master);
  src.start(); lfo.start();
  this.pump = { src: src, lfo: lfo };
};
AudioEngine.prototype.stopPump = function () {
  if (!this.pump) return;
  try { this.pump.src.stop(); this.pump.lfo.stop(); } catch (e) { }
  this.pump = null;
};

// --- Einzeleffekte -----------------------------------------------------------------
AudioEngine.prototype.bell = function () {                 // Tuerglocke
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [1318, 1046].forEach(function (f, i) {
    var o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    var g = ctx.createGain();
    this._env(g, t + i * 0.12, 0.12, 0.005, 0.6);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.7);
  }, this);
};

AudioEngine.prototype.footstep = function (running, indoor) {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = this._noise(0.1);
  var f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.value = indoor ? 850 : 420;
  var g = ctx.createGain();
  this._env(g, t, running ? 0.26 : 0.13, 0.003, 0.11);
  src.connect(f); f.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.doorCreak = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(130, t);
  o.frequency.linearRampToValueAtTime(62, t + 0.5);
  var f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 300; f.Q.value = 6;
  var g = ctx.createGain();
  this._env(g, t, 0.15, 0.05, 0.5);
  o.connect(f); f.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.65);
};

AudioEngine.prototype.doorBang = function () {            // Kreatur haemmert
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = this._noise(0.16, true);
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 240;
  var g = ctx.createGain();
  this._env(g, t, 0.55, 0.004, 0.2);
  src.connect(lp); lp.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.pickup = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [700, 1050].forEach(function (f, i) {
    var o = ctx.createOscillator(); o.type = "triangle"; o.frequency.value = f;
    var g = ctx.createGain();
    this._env(g, t + i * 0.06, 0.12, 0.004, 0.11);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.18);
  }, this);
};

AudioEngine.prototype.eat = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  for (var i = 0; i < 3; i++) {
    var src = ctx.createBufferSource(); src.buffer = this._noise(0.07);
    var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    var g = ctx.createGain();
    this._env(g, t + i * 0.14, 0.1, 0.004, 0.08);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t + i * 0.14);
  }
};

AudioEngine.prototype.gunshot = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource(); src.buffer = this._noise(0.4);
  var g = ctx.createGain();
  this._env(g, t, 0.9, 0.002, 0.3);
  var lp = ctx.createBiquadFilter(); lp.type = "lowpass";
  lp.frequency.setValueAtTime(4000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 0.3);
  src.connect(lp); lp.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.stunHiss = function () {            // Kreatur getroffen
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.7);
  var g = ctx.createGain();
  this._env(g, t, 0.3, 0.01, 0.7);
  o.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.8);
};

// Der lauteste Sound des Spiels
AudioEngine.prototype.scream = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  // Master kurz anheben, damit der Schrei ALLES uebertoent
  this.master.gain.cancelScheduledValues(t);
  this.master.gain.setValueAtTime(1.0, t);
  this.master.gain.linearRampToValueAtTime(0.6, t + 1.4);
  var o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(820, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.95);
  var o2 = ctx.createOscillator(); o2.type = "square";
  o2.frequency.setValueAtTime(547, t);
  o2.frequency.exponentialRampToValueAtTime(90, t + 0.9);
  var o3 = ctx.createOscillator(); o3.type = "sawtooth";
  o3.frequency.setValueAtTime(1230, t);
  o3.frequency.exponentialRampToValueAtTime(200, t + 0.8);
  var src = ctx.createBufferSource(); src.buffer = this._noise(1.1);
  var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
  var g = ctx.createGain();
  this._env(g, t, 1.25, 0.008, 1.0);
  var gn = ctx.createGain();
  this._env(gn, t, 0.85, 0.004, 0.55);
  o.connect(g); o2.connect(g); o3.connect(g); src.connect(hp); hp.connect(gn);
  g.connect(this.master); gn.connect(this.master);
  o.start(t); o.stop(t + 1.1);
  o2.start(t); o2.stop(t + 1.1);
  o3.start(t); o3.stop(t + 0.9);
  src.start(t);
};

AudioEngine.prototype.winChime = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [523, 659, 784, 1046].forEach(function (f, i) {
    var o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
    var g = ctx.createGain();
    this._env(g, t + i * 0.2, 0.18, 0.01, 1.0);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.2); o.stop(t + i * 0.2 + 1.1);
  }, this);
};

AudioEngine.prototype.setHeartbeat = function (i) { this.heartIntensity = Math.max(0, Math.min(1, i)); };

AudioEngine.prototype._kick = function (vol) {
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.12);
  this._env(g, t, vol, 0.004, 0.15);
  o.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.2);
};

AudioEngine.prototype.update = function (dt) {
  if (!this.ctx) return;
  // Herzschlag
  if (this.heartIntensity > 0.06) {
    this.heartTimer -= dt;
    if (this.heartTimer <= 0) {
      this.heartTimer = 1.3 - this.heartIntensity * 0.8;
      this._kick(0.18 + this.heartIntensity * 0.35);
      var self = this;
      setTimeout(function () { self._kick(0.1 + self.heartIntensity * 0.2); }, 140);
    }
  }
  // Verfolgungsmusik ein-/ausblenden + Schlaege
  if (this.chase) {
    var cur = this.chase.out.gain.value;
    this.chase.out.gain.value = cur + (this.chaseLevel - cur) * Math.min(1, dt * 2.2);
    if (this.chaseLevel > 0.25) {
      this.chase.hitTimer -= dt;
      if (this.chase.hitTimer <= 0) {
        this.chase.hitTimer = 0.55 - this.chaseLevel * 0.18;
        this._chaseHit();
      }
    }
  }
  // Blaetter & Kauz nur, wenn keine Verfolgung laeuft
  if (this.wind && this.chaseLevel < 0.2) {
    this.rustleTimer -= dt;
    if (this.rustleTimer <= 0) { this.rustleTimer = 2.5 + Math.random() * 5; this._rustle(); }
    this.owlTimer -= dt;
    if (this.owlTimer <= 0) { this.owlTimer = 25 + Math.random() * 30; this._owl(); }
  }
};
