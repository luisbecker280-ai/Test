// ============================================================================
// NOCTURNE 3D — Prozeduraler Sound (WebAudio, keine Dateien)
// ============================================================================
"use strict";

function AudioEngine() {
  this.ctx = null;
  this.master = null;
  this.ambient = null;
  this.heartTimer = 0;
  this.heartIntensity = 0;
}

AudioEngine.prototype._ensure = function () {
  if (!this.ctx) {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }
  if (this.ctx.state === "suspended") this.ctx.resume();
  return true;
};

AudioEngine.prototype._noiseBuffer = function (seconds) {
  var len = Math.floor(this.ctx.sampleRate * seconds);
  var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
  var d = buf.getChannelData(0), last = 0;
  for (var i = 0; i < len; i++) {                 // "brauner" Rauschanteil
    var white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
};

AudioEngine.prototype.startAmbient = function () {
  if (!this._ensure() || this.ambient) return;
  var ctx = this.ctx;
  var src = ctx.createBufferSource();
  src.buffer = this._noiseBuffer(4);
  src.loop = true;
  var lp = ctx.createBiquadFilter();
  lp.type = "lowpass"; lp.frequency.value = 240; lp.Q.value = 0.8;
  var g = ctx.createGain(); g.gain.value = 0.5;
  // langsame Schwebung
  var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
  var lfoG = ctx.createGain(); lfoG.gain.value = 90;
  lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
  // tiefer Drone-Ton
  var drone = ctx.createOscillator();
  drone.type = "sine"; drone.frequency.value = 38;
  var dg = ctx.createGain(); dg.gain.value = 0.10;
  drone.connect(dg); dg.connect(this.master); drone.start();
  src.connect(lp); lp.connect(g); g.connect(this.master); src.start();
  this.ambient = { src: src, drone: drone, lfo: lfo, gain: g, dgain: dg };
};

AudioEngine.prototype.stopAmbient = function () {
  if (!this.ambient) return;
  try {
    this.ambient.src.stop(); this.ambient.drone.stop(); this.ambient.lfo.stop();
  } catch (e) { /* bereits gestoppt */ }
  this.ambient = null;
};

AudioEngine.prototype._env = function (gainNode, t0, peak, attack, decay) {
  var g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.exponentialRampToValueAtTime(peak, t0 + attack);
  g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
};

AudioEngine.prototype.setHeartbeat = function (intensity) {
  this.heartIntensity = Math.max(0, Math.min(1, intensity));
};

AudioEngine.prototype.update = function (dt) {
  if (!this.ctx || this.heartIntensity < 0.06) return;
  this.heartTimer -= dt;
  if (this.heartTimer <= 0) {
    this.heartTimer = 1.35 - this.heartIntensity * 0.85;
    this._kick(0.20 + this.heartIntensity * 0.4);
    var self = this;
    setTimeout(function () { self._kick(0.12 + self.heartIntensity * 0.25); }, 140);
  }
};

AudioEngine.prototype._kick = function (vol) {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(82, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.12);
  this._env(g, t, vol, 0.004, 0.16);
  o.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.2);
};

AudioEngine.prototype.footstep = function (running, indoor) {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource();
  src.buffer = this._noiseBuffer(0.12);
  var f = ctx.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = indoor ? 900 : 480;
  var g = ctx.createGain();
  this._env(g, t, running ? 0.30 : 0.16, 0.003, indoor ? 0.10 : 0.14);
  src.connect(f); f.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.doorCreak = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(120, t);
  o.frequency.linearRampToValueAtTime(65, t + 0.5);
  var f = ctx.createBiquadFilter();
  f.type = "bandpass"; f.frequency.value = 300; f.Q.value = 6;
  var g = ctx.createGain();
  this._env(g, t, 0.16, 0.05, 0.55);
  o.connect(f); f.connect(g); g.connect(this.master);
  o.start(t); o.stop(t + 0.7);
};

AudioEngine.prototype.pickup = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [880, 1318].forEach(function (fq, i) {
    var o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.value = fq;
    var g = ctx.createGain();
    this._env(g, t + i * 0.07, 0.14, 0.005, 0.12);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.2);
  }, this);
};

AudioEngine.prototype.click = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  var src = ctx.createBufferSource();
  src.buffer = this._noiseBuffer(0.03);
  var f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
  var g = ctx.createGain();
  this._env(g, t, 0.12, 0.002, 0.03);
  src.connect(f); f.connect(g); g.connect(this.master);
  src.start(t);
};

AudioEngine.prototype.scream = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  // Schriller fallender Ton
  var o = ctx.createOscillator(); o.type = "sawtooth";
  o.frequency.setValueAtTime(760, t);
  o.frequency.exponentialRampToValueAtTime(130, t + 0.85);
  var o2 = ctx.createOscillator(); o2.type = "square";
  o2.frequency.setValueAtTime(505, t);
  o2.frequency.exponentialRampToValueAtTime(97, t + 0.8);
  // Rausch-Attacke
  var src = ctx.createBufferSource();
  src.buffer = this._noiseBuffer(1.0);
  var hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 600;
  var g = ctx.createGain();
  this._env(g, t, 1.0, 0.01, 0.95);
  var gn = ctx.createGain();
  this._env(gn, t, 0.7, 0.005, 0.5);
  o.connect(g); o2.connect(g); src.connect(hp); hp.connect(gn);
  g.connect(this.master); gn.connect(this.master);
  o.start(t); o.stop(t + 1.0);
  o2.start(t); o2.stop(t + 1.0);
  src.start(t);
};

AudioEngine.prototype.gateOpen = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [180, 240, 155].forEach(function (fq, i) {
    var o = ctx.createOscillator(); o.type = "square";
    o.frequency.value = fq;
    var g = ctx.createGain();
    this._env(g, t + i * 0.16, 0.13, 0.004, 0.3);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.4);
  }, this);
};

AudioEngine.prototype.winChime = function () {
  if (!this._ensure()) return;
  var ctx = this.ctx, t = ctx.currentTime;
  [523, 659, 784, 1046].forEach(function (fq, i) {
    var o = ctx.createOscillator(); o.type = "sine";
    o.frequency.value = fq;
    var g = ctx.createGain();
    this._env(g, t + i * 0.18, 0.2, 0.01, 0.9);
    o.connect(g); g.connect(this.master);
    o.start(t + i * 0.18); o.stop(t + i * 0.18 + 1.0);
  }, this);
};
