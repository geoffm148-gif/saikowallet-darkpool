/**
 * StarshipSaiko — Hidden easter egg game.
 * Triggered by typing "starship" on the dashboard or entering the Konami code.
 * Not linked in any navigation menu.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const GAME_W = 640;
const GAME_H = 820;
const PLAYER_W = 36;
const PLAYER_H = 36;
const PLAYER_SPEED_BASE = 2.5;
const BULLET_SPEED = 7;
const STAR_COUNT = 80;
const MAX_BOMBS = 3;
const BOMB_RADIUS = 250;
const MAX_LEVEL = 50;

const XP_PER_LEVEL = [0, 100, 250, 500, 800, 1200, 1800, 2500, 3500, 5000];

const UPGRADES = {
  fireRate: { name: 'Fire Rate', desc: 'Shoot faster', maxRank: 5, icon: '⚡' },
  damage: { name: 'Damage', desc: 'Bullets hit harder', maxRank: 5, icon: '💥' },
  speed: { name: 'Move Speed', desc: 'Move faster', maxRank: 5, icon: '🏃' },
  shield: { name: 'Shield', desc: 'Absorb one hit', maxRank: 3, icon: '🛡' },
  magnet: { name: 'Magnet', desc: 'Attract powerups', maxRank: 3, icon: '🧲' },
  multishot: { name: 'Multi-Shot', desc: 'Extra bullet streams', maxRank: 3, icon: '🔫' },
};

const ENEMY_TYPES = {
  grunt:  { w: 28, h: 28, hp: 1, score: 100,  xp: 10,  color: '#ef4444', shootChance: 0.002 },
  fast:   { w: 22, h: 22, hp: 1, score: 200,  xp: 15,  color: '#a855f7', shootChance: 0.001 },
  tank:   { w: 36, h: 36, hp: 3, score: 300,  xp: 25,  color: '#f59e0b', shootChance: 0.004 },
  sniper: { w: 26, h: 30, hp: 2, score: 250,  xp: 20,  color: '#06b6d4', shootChance: 0.006 },
  boss:   { w: 72, h: 72, hp: 40, score: 5000, xp: 200, color: '#dc2626', shootChance: 0.012 },
};

const BOSS_NAMES: Record<number, string> = {
  10: 'CRIMSON VANGUARD', 20: 'VOID SERPENT', 30: 'STELLAR DEVOURER',
  40: 'OMEGA SAIKO', 50: 'THE FINAL FORM',
};

const initStars = () => Array.from({ length: STAR_COUNT }, () => ({
  x: Math.random() * GAME_W, y: Math.random() * GAME_H,
  speed: 0.3 + Math.random() * 1.5, size: Math.random() > 0.7 ? 2 : 1,
  brightness: 0.2 + Math.random() * 0.7,
}));

const getXPForLevel = (level: number): number => {
  if (level <= 10) return XP_PER_LEVEL[Math.min(level, XP_PER_LEVEL.length - 1)] ?? 100;
  return Math.floor(5000 + (level - 10) * 1500);
};

type UpgradeKey = keyof typeof UPGRADES;

interface GameState {
  player: {
    x: number; y: number; w: number; h: number;
    invincible: number; lives: number; bombs: number; power: number;
    flickerFrame: number; shieldHP: number;
  };
  upgrades: Record<UpgradeKey, number>;
  bullets: Array<{ x: number; y: number; vx?: number; vy: number; w: number; h: number; dmg?: number }>;
  enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; w: number; h: number; color?: string }>;
  enemies: Array<{
    type: keyof typeof ENEMY_TYPES;
    x: number; y: number; w: number; h: number;
    hp: number; maxHp: number; speed: number;
    shootChance: number; score: number; xp: number; color: string;
    movePattern: string; sineOffset: number; sineSpeed: number;
    sineAmp: number; startX: number; bossPhase: number;
  }>;
  particles: Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }>;
  explosions: Array<{ x: number; y: number; radius: number; maxRadius: number; life: number; maxLife: number }>;
  powerups: Array<{ x: number; y: number; w: number; h: number; type: string; vy: number }>;
  stars: Array<{ x: number; y: number; speed: number; size: number; brightness: number }>;
  score: number; xp: number; level: number; xpToNext: number;
  wave: number; waveTimer: number; waveDelay: number;
  spawnTimer: number; enemiesSpawned: number; enemiesPerWave: number;
  bossActive: boolean; screenShake: number; bombFlash: number; _bombPressed: boolean;
  pendingLevelUps: number;
}

export function StarshipSaikoScreen() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const g = useRef<GameState | null>(null);
  const keys = useRef<Record<string, boolean>>({});
  const frame = useRef(0);

  const [gameState, setGameState] = useState<'title' | 'playing' | 'upgrade' | 'gameover'>('title');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [displayWave, setDisplayWave] = useState(0);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeChoices, setUpgradeChoices] = useState<Array<{ key: UpgradeKey; name: string; desc: string; maxRank: number; icon: string; rank: number }>>([]);
  const [pLevel, setPLevel] = useState(1);
  const [pXP, setPXP] = useState(0);
  const [pXPNext, setPXPNext] = useState(100);

  const genUpgrades = useCallback(() => {
    if (!g.current) return [];
    const avail = (Object.entries(UPGRADES) as Array<[UpgradeKey, typeof UPGRADES[UpgradeKey]]>)
      .filter(([k, v]) => (g.current!.upgrades[k] || 0) < v.maxRank);
    return avail.sort(() => Math.random() - 0.5).slice(0, 3)
      .map(([k, v]) => ({ key: k, ...v, rank: g.current!.upgrades[k] || 0 }));
  }, []);

  const pickUpgrade = useCallback((key: UpgradeKey) => {
    if (!g.current) return;
    g.current.upgrades[key] = (g.current.upgrades[key] || 0) + 1;
    if (key === 'shield') g.current.player.shieldHP = g.current.upgrades.shield;
    setShowUpgrade(false);
    setGameState('playing');
  }, []);

  const initGame = useCallback(() => {
    g.current = {
      player: { x: GAME_W / 2 - PLAYER_W / 2, y: GAME_H - 100, w: PLAYER_W, h: PLAYER_H, invincible: 180, lives: 3, bombs: MAX_BOMBS, power: 1, flickerFrame: 0, shieldHP: 0 },
      upgrades: { fireRate: 0, damage: 0, speed: 0, shield: 0, magnet: 0, multishot: 0 },
      bullets: [], enemyBullets: [], enemies: [], particles: [], explosions: [], powerups: [],
      stars: initStars(), score: 0, xp: 0, level: 1, xpToNext: 100,
      wave: 1, waveTimer: 0, waveDelay: 240, spawnTimer: 0, enemiesSpawned: 0, enemiesPerWave: 5,
      bossActive: false, screenShake: 0, bombFlash: 0, _bombPressed: false, pendingLevelUps: 0,
    };
    setScore(0); setPXP(0); setPLevel(1); setPXPNext(100); setDisplayWave(1);
  }, []);

  const spawnParticles = useCallback((x: number, y: number, color: string, count = 8) => {
    const s = g.current!;
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + Math.random() * 0.5;
      const sp = 1 + Math.random() * 3;
      s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 20 + Math.random() * 20, maxLife: 40, color, size: 2 + Math.random() * 3 });
    }
  }, []);

  const spawnExplosion = useCallback((x: number, y: number, size = 1) => {
    g.current!.explosions.push({ x, y, radius: 0, maxRadius: 35 * size, life: 25, maxLife: 25 });
    spawnParticles(x, y, '#ff6b35', Math.floor(12 * size));
    spawnParticles(x, y, '#ffd700', Math.floor(8 * size));
  }, [spawnParticles]);

  const addXP = useCallback((amount: number) => {
    const s = g.current!;
    s.xp += amount;
    while (s.xp >= s.xpToNext && s.level < MAX_LEVEL) {
      s.xp -= s.xpToNext; s.level++; s.xpToNext = getXPForLevel(s.level); s.pendingLevelUps++;
    }
    setPXP(s.xp); setPLevel(s.level); setPXPNext(s.xpToNext);
  }, []);

  const checkLevelUp = useCallback(() => {
    const s = g.current!;
    if (s.pendingLevelUps > 0 && !showUpgrade) {
      s.pendingLevelUps--;
      const ch = genUpgrades();
      if (ch.length > 0) { setUpgradeChoices(ch); setShowUpgrade(true); setGameState('upgrade'); }
    }
  }, [showUpgrade, genUpgrades]);

  const fireBomb = useCallback(() => {
    const s = g.current!;
    if (s.player.bombs <= 0) return;
    s.player.bombs--; s.bombFlash = 15; s.screenShake = 10;
    const px = s.player.x + s.player.w / 2, py = s.player.y + s.player.h / 2;
    s.enemyBullets = [];
    s.enemies.forEach((e) => {
      const dx = (e.x + e.w / 2) - px, dy = (e.y + e.h / 2) - py;
      if (Math.sqrt(dx * dx + dy * dy) < BOMB_RADIUS) { e.hp -= e.type === 'boss' ? 5 : e.hp; spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 6); }
    });
    for (let i = 0; i < 30; i++) {
      const a = (Math.PI * 2 * i) / 30, sp = 2 + Math.random() * 4;
      s.particles.push({ x: px, y: py, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 30 + Math.random() * 20, maxLife: 50, color: i % 2 === 0 ? '#ef4444' : '#ffd700', size: 3 + Math.random() * 4 });
    }
  }, [spawnParticles]);

  const spawnEnemy = useCallback((type: keyof typeof ENEMY_TYPES, x?: number, customHP?: number) => {
    const s = g.current!, t = ENEMY_TYPES[type], w = s.wave;
    const hpScale = type === 'boss' ? 1 + (w / 10) * 0.5 : 1;
    const speedScale = Math.min(1 + w * 0.02, 2);
    const baseSpeed = type === 'fast' ? 1.2 : type === 'boss' ? 0.4 : type === 'sniper' ? 0.6 : 0.8;
    const ex = x ?? Math.random() * (GAME_W - t.w);
    s.enemies.push({
      type, x: ex, y: -t.h, w: t.w, h: t.h,
      hp: customHP ?? Math.ceil(t.hp * hpScale), maxHp: customHP ?? Math.ceil(t.hp * hpScale),
      speed: baseSpeed * speedScale, shootChance: t.shootChance * Math.min(1 + w * 0.03, 2),
      score: t.score, xp: t.xp, color: t.color,
      movePattern: type === 'boss' ? 'sine' : Math.random() > 0.6 ? 'sine' : 'straight',
      sineOffset: Math.random() * Math.PI * 2, sineSpeed: 0.012 + Math.random() * 0.015,
      sineAmp: 40 + Math.random() * 60, startX: ex, bossPhase: 0,
    });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current, s = g.current;
    if (!canvas || !s) return;
    const ctx = canvas.getContext('2d')!, f = frame.current, p = s.player;
    const sx = s.screenShake > 0 ? (Math.random() - 0.5) * s.screenShake : 0;
    const sy = s.screenShake > 0 ? (Math.random() - 0.5) * s.screenShake : 0;
    ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    s.stars.forEach((st) => { ctx.fillStyle = `rgba(255,255,255,${st.brightness})`; ctx.fillRect(st.x, st.y, st.size, st.size); });
    if (s.bombFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${s.bombFlash / 30})`; ctx.fillRect(0, 0, GAME_W, GAME_H); }
    s.explosions.forEach((ex) => { const a = ex.life / ex.maxLife; const gr = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius); gr.addColorStop(0, `rgba(255,200,50,${a})`); gr.addColorStop(0.5, `rgba(255,100,20,${a * 0.5})`); gr.addColorStop(1, 'rgba(255,50,0,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2); ctx.fill(); });
    s.particles.forEach((pt) => { ctx.globalAlpha = pt.life / pt.maxLife; ctx.fillStyle = pt.color; ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size); }); ctx.globalAlpha = 1;
    s.powerups.forEach((pw) => {
      const gl = Math.sin(f * 0.1) * 0.3 + 0.7;
      const cols: Record<string, string> = { power: `rgba(34,197,94,${gl})`, health: `rgba(239,68,68,${gl})`, bomb: `rgba(59,130,246,${gl})` };
      const lbl: Record<string, string> = { power: 'P', health: '+', bomb: 'B' };
      ctx.fillStyle = cols[pw.type] ?? 'rgba(128,128,128,0.7)'; ctx.beginPath(); ctx.arc(pw.x + pw.w / 2, pw.y + pw.h / 2, pw.w / 2 + 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lbl[pw.type] ?? '', pw.x + pw.w / 2, pw.y + pw.h / 2);
    });
    s.enemies.forEach((e) => {
      ctx.fillStyle = e.color;
      if (e.type === 'boss') {
        if (e.bossPhase >= 1) { ctx.shadowColor = e.bossPhase >= 2 ? '#ff0000' : '#ff6600'; ctx.shadowBlur = 15; }
        ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y); ctx.lineTo(e.x + e.w, e.y + e.h * 0.4); ctx.lineTo(e.x + e.w * 0.85, e.y + e.h); ctx.lineTo(e.x + e.w * 0.15, e.y + e.h); ctx.lineTo(e.x, e.y + e.h * 0.4); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        const hp = e.hp / e.maxHp; ctx.fillStyle = '#222'; ctx.fillRect(e.x, e.y - 12, e.w, 6); ctx.fillStyle = hp > 0.5 ? '#22c55e' : hp > 0.25 ? '#f59e0b' : '#ef4444'; ctx.fillRect(e.x, e.y - 12, e.w * hp, 6);
        const bn = BOSS_NAMES[s.wave]; if (bn) { ctx.fillStyle = '#fff'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(bn, e.x + e.w / 2, e.y - 16); }
      } else if (e.type === 'tank') { ctx.fillRect(e.x + 4, e.y, e.w - 8, e.h); ctx.fillRect(e.x, e.y + 6, e.w, e.h - 12); }
      else if (e.type === 'fast') { ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y); ctx.lineTo(e.x + e.w, e.y + e.h); ctx.lineTo(e.x, e.y + e.h); ctx.closePath(); ctx.fill(); }
      else if (e.type === 'sniper') { ctx.beginPath(); ctx.moveTo(e.x + e.w / 2, e.y); ctx.lineTo(e.x + e.w, e.y + e.h * 0.6); ctx.lineTo(e.x + e.w * 0.7, e.y + e.h); ctx.lineTo(e.x + e.w * 0.3, e.y + e.h); ctx.lineTo(e.x, e.y + e.h * 0.6); ctx.closePath(); ctx.fill(); }
      else { ctx.fillRect(e.x + 2, e.y, e.w - 4, e.h); ctx.fillRect(e.x, e.y + 4, e.w, e.h - 8); }
    });
    s.enemyBullets.forEach((b) => { ctx.fillStyle = b.color || '#ff6666'; ctx.beginPath(); ctx.arc(b.x, b.y, b.w / 2, 0, Math.PI * 2); ctx.fill(); });
    s.bullets.forEach((b) => { const gr = ctx.createLinearGradient(b.x, b.y + (b.h || 12), b.x, b.y); gr.addColorStop(0, '#ef4444'); gr.addColorStop(1, '#ffd700'); ctx.fillStyle = gr; ctx.fillRect(b.x, b.y, b.w, b.h || 12); });
    if (p.invincible <= 0 || Math.floor(p.flickerFrame / 4) % 2 === 0) {
      const eg = ctx.createRadialGradient(p.x + p.w / 2, p.y + p.h + 8, 0, p.x + p.w / 2, p.y + p.h + 8, 18); eg.addColorStop(0, `rgba(239,68,68,${0.5 + Math.sin(f * 0.3) * 0.2})`); eg.addColorStop(1, 'rgba(239,68,68,0)'); ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h + 8, 18, 0, Math.PI * 2); ctx.fill();
      if (p.shieldHP > 0) { ctx.strokeStyle = `rgba(59,130,246,${0.3 + Math.sin(f * 0.08) * 0.2})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.8, 0, Math.PI * 2); ctx.stroke(); }
      ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.moveTo(p.x + p.w / 2, p.y); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.lineTo(p.x + p.w / 2, p.y + p.h - 10); ctx.lineTo(p.x, p.y + p.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(p.x + p.w / 2, p.y + p.h * 0.45, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(p.x + 2, p.y + p.h - 12, 7, 3); ctx.fillRect(p.x + p.w - 9, p.y + p.h - 12, 7, 3);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, GAME_W, 36);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${s.score.toString().padStart(8, '0')}`, 10, 10);
    ctx.textAlign = 'center'; ctx.fillText(`WAVE ${s.wave}`, GAME_W / 2, 10);
    ctx.textAlign = 'right'; ctx.fillText(`LVL ${s.level}`, GAME_W - 10, 10);
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(10, 30, GAME_W - 20, 4);
    ctx.fillStyle = '#a855f7'; ctx.fillRect(10, 30, (GAME_W - 20) * (s.xp / s.xpToNext), 4);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, GAME_H - 44, GAME_W, 44);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#666'; ctx.font = '10px monospace';
    ctx.fillText('LIVES', 10, GAME_H - 30);
    for (let i = 0; i < p.lives; i++) { ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.moveTo(50 + i * 18 + 6, GAME_H - 36); ctx.lineTo(50 + i * 18 + 12, GAME_H - 24); ctx.lineTo(50 + i * 18, GAME_H - 24); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#666'; ctx.fillText('BOMBS', 10, GAME_H - 12);
    for (let i = 0; i < p.bombs; i++) { ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(58 + i * 16, GAME_H - 12, 5, 0, Math.PI * 2); ctx.fill(); }
    ctx.textAlign = 'right'; ctx.fillStyle = '#666'; ctx.fillText('POWER', GAME_W - 10, GAME_H - 30);
    ctx.fillStyle = '#22c55e'; ctx.fillText('█'.repeat(p.power) + '░'.repeat(3 - p.power), GAME_W - 10, GAME_H - 14);
    if (s.upgrades.shield > 0) { ctx.textAlign = 'center'; ctx.fillStyle = p.shieldHP > 0 ? '#3b82f6' : '#333'; ctx.font = '10px monospace'; ctx.fillText(`SHIELD ${'●'.repeat(p.shieldHP)}${'○'.repeat(s.upgrades.shield - p.shieldHP)}`, GAME_W / 2, GAME_H - 12); }
    const au = (Object.entries(s.upgrades) as Array<[UpgradeKey, number]>).filter(([, v]) => v > 0).map(([k, v]) => `${UPGRADES[k].icon}${v}`).join(' ');
    if (au) { ctx.textAlign = 'center'; ctx.fillStyle = '#444'; ctx.font = '9px monospace'; ctx.fillText(au, GAME_W / 2, GAME_H - 30); }
    if (s.waveTimer < 120 && s.waveTimer > 0) {
      const a = s.waveTimer < 40 ? s.waveTimer / 40 : s.waveTimer > 80 ? (120 - s.waveTimer) / 40 : 1;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (s.wave % 10 === 0) { ctx.fillStyle = `rgba(239,68,68,${a})`; ctx.font = 'bold 32px monospace'; ctx.fillText('⚠ BOSS INCOMING ⚠', GAME_W / 2, GAME_H / 2 - 30); ctx.fillStyle = `rgba(255,255,255,${a * 0.7})`; ctx.font = '18px monospace'; ctx.fillText(BOSS_NAMES[s.wave] || `WAVE ${s.wave} BOSS`, GAME_W / 2, GAME_H / 2 + 10); }
      else { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.font = 'bold 28px monospace'; ctx.fillText(`WAVE ${s.wave}`, GAME_W / 2, GAME_H / 2 - 10); }
    }
    ctx.restore();
  }, []);

  const update = useCallback(() => {
    const s = g.current;
    if (!s) return;
    const k = keys.current, f = frame.current++, p = s.player;
    const moveSpeed = PLAYER_SPEED_BASE + s.upgrades.speed * 0.4;
    if (k['ArrowLeft'] || k['KeyA']) p.x -= moveSpeed;
    if (k['ArrowRight'] || k['KeyD']) p.x += moveSpeed;
    if (k['ArrowUp'] || k['KeyW']) p.y -= moveSpeed;
    if (k['ArrowDown'] || k['KeyS']) p.y += moveSpeed;
    p.x = Math.max(0, Math.min(GAME_W - p.w, p.x));
    p.y = Math.max(0, Math.min(GAME_H - p.h, p.y));
    if (p.invincible > 0) p.invincible--;
    p.flickerFrame++;
    const fireInt = Math.max(3, 8 - s.upgrades.fireRate);
    if (k['Space'] && f % fireInt === 0) {
      const cx = p.x + p.w / 2, dmg = 1 + s.upgrades.damage, ms = s.upgrades.multishot;
      s.bullets.push({ x: cx - 2, y: p.y, vx: 0, vy: -BULLET_SPEED, w: 4, h: 14, dmg });
      if (ms >= 1 || p.power >= 2) { s.bullets.push({ x: cx - 14, y: p.y + 8, vx: -0.4, vy: -BULLET_SPEED, w: 3, h: 10, dmg }); s.bullets.push({ x: cx + 10, y: p.y + 8, vx: 0.4, vy: -BULLET_SPEED, w: 3, h: 10, dmg }); }
      if (ms >= 2 || p.power >= 3) { s.bullets.push({ x: cx - 22, y: p.y + 14, vx: -0.8, vy: -BULLET_SPEED * 0.9, w: 3, h: 8, dmg }); s.bullets.push({ x: cx + 18, y: p.y + 14, vx: 0.8, vy: -BULLET_SPEED * 0.9, w: 3, h: 8, dmg }); }
      if (ms >= 3) { s.bullets.push({ x: cx - 8, y: p.y - 4, vx: -0.15, vy: -BULLET_SPEED * 1.05, w: 3, h: 10, dmg }); s.bullets.push({ x: cx + 4, y: p.y - 4, vx: 0.15, vy: -BULLET_SPEED * 1.05, w: 3, h: 10, dmg }); }
    }
    if (k['Enter'] && !s._bombPressed) { fireBomb(); s._bombPressed = true; }
    if (!k['Enter']) s._bombPressed = false;
    s.bullets = s.bullets.filter((b) => { b.x += b.vx ?? 0; b.y += b.vy; return b.y > -20 && b.y < GAME_H + 20 && b.x > -20 && b.x < GAME_W + 20; });
    s.enemyBullets = s.enemyBullets.filter((b) => { b.x += b.vx; b.y += b.vy; return b.y > -10 && b.y < GAME_H + 10 && b.x > -10 && b.x < GAME_W + 10; });
    s.waveTimer++;
    if (s.waveTimer > s.waveDelay && s.enemies.length === 0 && s.enemiesSpawned >= s.enemiesPerWave) {
      s.wave++; s.waveTimer = 0; s.enemiesSpawned = 0; s.bossActive = false;
      s.enemiesPerWave = Math.min(5 + Math.floor(s.wave * 1.2), 30);
      s.waveDelay = s.wave % 10 === 0 ? 300 : 200;
      setDisplayWave(s.wave);
    }
    const spawnInt = Math.max(20, 80 - s.wave * 3);
    s.spawnTimer++;
    if (s.enemiesSpawned < s.enemiesPerWave && s.spawnTimer > spawnInt && !s.bossActive) {
      s.spawnTimer = 0; s.enemiesSpawned++;
      if (s.wave % 10 === 0 && s.enemiesSpawned === s.enemiesPerWave) { spawnEnemy('boss', GAME_W / 2 - 36, Math.ceil(40 + (s.wave / 10) * 20)); s.bossActive = true; }
      else { const r = Math.random(); if (s.wave <= 3) spawnEnemy('grunt'); else if (s.wave <= 6) spawnEnemy(r < 0.25 ? 'fast' : 'grunt'); else if (s.wave <= 9) spawnEnemy(r < 0.15 ? 'tank' : r < 0.35 ? 'fast' : 'grunt'); else spawnEnemy(r < 0.1 ? 'sniper' : r < 0.25 ? 'tank' : r < 0.45 ? 'fast' : 'grunt'); }
    }
    s.enemies = s.enemies.filter((e) => {
      e.y += e.speed;
      if (e.movePattern === 'sine') e.x = e.startX + Math.sin(f * e.sineSpeed + e.sineOffset) * e.sineAmp;
      if (e.type === 'boss') {
        e.y = Math.min(e.y, 80); e.x = GAME_W / 2 - e.w / 2 + Math.sin(f * 0.012) * 200;
        if (e.hp < e.maxHp * 0.5 && e.bossPhase === 0) { e.bossPhase = 1; e.shootChance *= 1.5; spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ff0000', 20); }
        if (e.hp < e.maxHp * 0.25 && e.bossPhase === 1) { e.bossPhase = 2; e.shootChance *= 1.5; spawnParticles(e.x + e.w / 2, e.y + e.h / 2, '#ff0000', 30); }
      }
      e.x = Math.max(0, Math.min(GAME_W - e.w, e.x));
      if (Math.random() < e.shootChance && e.y > 0) {
        const ex = e.x + e.w / 2, ey = e.y + e.h;
        if (e.type === 'boss') {
          if (e.bossPhase >= 2) { for (let a = 0; a < 8; a++) { const ang = (Math.PI * 2 * a) / 8 + f * 0.05; s.enemyBullets.push({ x: ex, y: ey, vx: Math.cos(ang) * 1.5, vy: Math.sin(ang) * 1.5 + 0.5, w: 6, h: 6, color: '#ff3333' }); } }
          else if (e.bossPhase >= 1) { for (let a = -3; a <= 3; a++) s.enemyBullets.push({ x: ex, y: ey, vx: a * 0.7, vy: 1.8, w: 6, h: 6, color: '#ff3333' }); }
          else { for (let a = -2; a <= 2; a++) s.enemyBullets.push({ x: ex, y: ey, vx: a * 0.6, vy: 1.5, w: 5, h: 5, color: '#ff3333' }); }
        } else if (e.type === 'sniper') { const dx = (s.player.x + s.player.w / 2) - ex, dy = (s.player.y + s.player.h / 2) - ey, len = Math.sqrt(dx * dx + dy * dy) || 1; s.enemyBullets.push({ x: ex, y: ey, vx: (dx / len) * 2.5, vy: (dy / len) * 2.5, w: 4, h: 8, color: '#06b6d4' }); }
        else { const dx = (s.player.x + s.player.w / 2) - ex, dy = (s.player.y + s.player.h / 2) - ey, len = Math.sqrt(dx * dx + dy * dy) || 1; s.enemyBullets.push({ x: ex, y: ey, vx: (dx / len) * 1.5, vy: (dy / len) * 1.5, w: 5, h: 5, color: '#ff6666' }); }
      }
      return e.y < GAME_H + 50 && e.hp > 0;
    });
    s.bullets = s.bullets.filter((b) => {
      let hit = false;
      s.enemies.forEach((e) => {
        if (!hit && b.x < e.x + e.w && b.x + b.w > e.x && b.y < e.y + e.h && b.y + b.h > e.y) {
          e.hp -= b.dmg ?? 1; hit = true; spawnParticles(b.x, b.y, e.color, 3);
          if (e.hp <= 0) {
            s.score += e.score; setScore(s.score); addXP(e.xp);
            spawnExplosion(e.x + e.w / 2, e.y + e.h / 2, e.type === 'boss' ? 4 : 1);
            if (e.type === 'boss') { s.bossActive = false; for (let d = 0; d < 3; d++) { const r = Math.random(); s.powerups.push({ x: e.x + e.w / 2 - 8 + (d - 1) * 30, y: e.y + e.h / 2, w: 16, h: 16, type: r < 0.33 ? 'health' : r < 0.66 ? 'bomb' : 'power', vy: 1.2 }); } }
            else if (Math.random() < 0.1) { const r = Math.random(); s.powerups.push({ x: e.x + e.w / 2 - 8, y: e.y, w: 16, h: 16, type: r < 0.25 ? 'bomb' : r < 0.4 ? 'health' : 'power', vy: 1.2 }); }
          }
        }
      });
      return !hit;
    });
    s.enemies = s.enemies.filter((e) => e.hp > 0);
    if (p.invincible <= 0) {
      let wasHit = false;
      s.enemyBullets = s.enemyBullets.filter((b) => { if (b.x < p.x + p.w - 6 && b.x + b.w > p.x + 6 && b.y < p.y + p.h - 6 && b.y + b.h > p.y + 6) { wasHit = true; return false; } return true; });
      s.enemies.forEach((e) => { if (p.invincible <= 0 && e.x < p.x + p.w - 6 && e.x + e.w > p.x + 6 && e.y < p.y + p.h - 6 && e.y + e.h > p.y + 6) wasHit = true; });
      if (wasHit) {
        if (p.shieldHP > 0) { p.shieldHP--; p.invincible = 60; s.screenShake = 4; spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#3b82f6', 12); }
        else { p.lives--; p.invincible = 150; p.power = Math.max(1, p.power - 1); s.screenShake = 8; spawnExplosion(p.x + p.w / 2, p.y + p.h / 2); if (p.lives <= 0) { setGameState('gameover'); setHighScore((prev) => Math.max(prev, s.score)); } }
      }
    }
    const mag = s.upgrades.magnet * 80;
    s.powerups = s.powerups.filter((pw) => {
      if (mag > 0) { const dx = (p.x + p.w / 2) - (pw.x + pw.w / 2), dy = (p.y + p.h / 2) - (pw.y + pw.h / 2), d = Math.sqrt(dx * dx + dy * dy); if (d < mag && d > 0) { pw.x += (dx / d) * 2.5; pw.y += (dy / d) * 2.5; } }
      pw.y += pw.vy;
      if (pw.x < p.x + p.w && pw.x + pw.w > p.x && pw.y < p.y + p.h && pw.y + pw.h > p.y) {
        if (pw.type === 'power') p.power = Math.min(3, p.power + 1); else if (pw.type === 'bomb') p.bombs = Math.min(MAX_BOMBS + s.upgrades.shield, p.bombs + 1); else if (pw.type === 'health') p.lives = Math.min(5, p.lives + 1);
        spawnParticles(pw.x + pw.w / 2, pw.y + pw.h / 2, pw.type === 'power' ? '#22c55e' : pw.type === 'health' ? '#ef4444' : '#3b82f6', 10);
        addXP(5); return false;
      }
      return pw.y < GAME_H + 20;
    });
    s.particles = s.particles.filter((pt) => { pt.x += pt.vx; pt.y += pt.vy; pt.life--; pt.vx *= 0.97; pt.vy *= 0.97; return pt.life > 0; });
    s.explosions = s.explosions.filter((ex) => { ex.life--; ex.radius = ex.maxRadius * (1 - ex.life / ex.maxLife); return ex.life > 0; });
    s.stars.forEach((st) => { st.y += st.speed; if (st.y > GAME_H) { st.y = 0; st.x = Math.random() * GAME_W; } });
    if (s.screenShake > 0) s.screenShake--;
    if (s.bombFlash > 0) s.bombFlash--;
    checkLevelUp();
  }, [fireBomb, spawnEnemy, spawnExplosion, spawnParticles, addXP, checkLevelUp]);

  // Game loop
  useEffect(() => {
    if (gameState !== 'playing') return;
    let id: number;
    const loop = () => { update(); draw(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [gameState, update, draw]);

  // Title / gameover animation
  useEffect(() => {
    if (gameState !== 'title' && gameState !== 'gameover') return;
    const stars = initStars();
    let id: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const render = () => {
      ctx.fillStyle = '#050508'; ctx.fillRect(0, 0, GAME_W, GAME_H);
      stars.forEach((st) => { st.y += st.speed * 0.5; if (st.y > GAME_H) { st.y = 0; st.x = Math.random() * GAME_W; } ctx.fillStyle = `rgba(255,255,255,${st.brightness})`; ctx.fillRect(st.x, st.y, st.size, st.size); });
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (gameState === 'title') {
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 42px monospace'; ctx.fillText('STARSHIP', GAME_W / 2, GAME_H / 2 - 80);
        ctx.fillStyle = '#fff'; ctx.font = 'bold 52px monospace'; ctx.fillText('SAIKO', GAME_W / 2, GAME_H / 2 - 25);
        const pu = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255,255,255,${pu})`; ctx.font = '16px monospace'; ctx.fillText('PRESS SPACE TO START', GAME_W / 2, GAME_H / 2 + 60);
        ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '13px monospace';
        ctx.fillText('WASD / ARROWS — Move', GAME_W / 2, GAME_H / 2 + 120);
        ctx.fillText('SPACE — Shoot', GAME_W / 2, GAME_H / 2 + 145);
        ctx.fillText('ENTER — Bomb', GAME_W / 2, GAME_H / 2 + 170);
        ctx.fillText('Defeat enemies to earn XP and unlock upgrades!', GAME_W / 2, GAME_H / 2 + 210);
        if (highScore > 0) { ctx.fillStyle = '#ffd700'; ctx.font = '14px monospace'; ctx.fillText(`HIGH SCORE: ${highScore.toString().padStart(8, '0')}`, GAME_W / 2, GAME_H / 2 + 250); }
      } else {
        ctx.fillStyle = '#ef4444'; ctx.font = 'bold 40px monospace'; ctx.fillText('GAME OVER', GAME_W / 2, GAME_H / 2 - 100);
        ctx.fillStyle = '#fff'; ctx.font = '22px monospace'; ctx.fillText(`SCORE: ${score.toString().padStart(8, '0')}`, GAME_W / 2, GAME_H / 2 - 40);
        ctx.fillStyle = '#ffd700'; ctx.font = '16px monospace'; ctx.fillText(`HIGH SCORE: ${highScore.toString().padStart(8, '0')}`, GAME_W / 2, GAME_H / 2);
        ctx.fillStyle = '#a855f7'; ctx.fillText(`LEVEL ${pLevel}  |  WAVE ${displayWave}`, GAME_W / 2, GAME_H / 2 + 35);
        const pu = Math.sin(Date.now() * 0.003) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(255,255,255,${pu})`; ctx.font = '16px monospace'; ctx.fillText('PRESS SPACE TO RETRY', GAME_W / 2, GAME_H / 2 + 90);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.font = '10px monospace'; ctx.fillText('© SAIKO INU', GAME_W / 2, GAME_H - 25);
      id = requestAnimationFrame(render);
    };
    id = requestAnimationFrame(render);
    return () => cancelAnimationFrame(id);
  }, [gameState, score, highScore, pLevel, displayWave]);

  // Upgrade overlay
  useEffect(() => {
    if (gameState !== 'upgrade') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    draw();
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#a855f7'; ctx.font = 'bold 28px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('LEVEL UP!', GAME_W / 2, 140);
    ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(`Level ${pLevel}`, GAME_W / 2, 175);
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '13px monospace'; ctx.fillText('Choose an upgrade', GAME_W / 2, 205);
    const cw = 170, ch = 180;
    const tw = upgradeChoices.length * cw + (upgradeChoices.length - 1) * 16;
    const sx = (GAME_W - tw) / 2;
    upgradeChoices.forEach((c, i) => {
      const cx = sx + i * (cw + 16), cy = GAME_H / 2 - ch / 2 + 20;
      ctx.fillStyle = '#141414'; ctx.strokeStyle = '#333'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '28px monospace'; ctx.textAlign = 'center'; ctx.fillText(c.icon, cx + cw / 2, cy + 40);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 13px monospace'; ctx.fillText(c.name, cx + cw / 2, cy + 75);
      ctx.fillStyle = '#888'; ctx.font = '11px monospace'; ctx.fillText(c.desc, cx + cw / 2, cy + 100);
      for (let r = 0; r < c.maxRank; r++) { ctx.fillStyle = r <= c.rank ? '#a855f7' : '#333'; ctx.fillRect(cx + cw / 2 - (c.maxRank * 12) / 2 + r * 12, cy + 125, 8, 8); }
      ctx.fillStyle = '#a855f7'; ctx.font = 'bold 16px monospace'; ctx.fillText(`[${i + 1}]`, cx + cw / 2, cy + ch - 15);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '12px monospace'; ctx.fillText('Press 1, 2, or 3 to choose', GAME_W / 2, GAME_H / 2 + ch / 2 + 60);
  }, [gameState, upgradeChoices, pLevel, draw]);

  // Keyboard handler
  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
      if (e.code === 'Space') {
        e.preventDefault();
        if (gameState === 'title' || gameState === 'gameover') { initGame(); setGameState('playing'); }
      }
      if (e.code === 'Enter') e.preventDefault();
      if (e.code === 'Escape') { void navigate('/dashboard'); }
      if (gameState === 'upgrade') {
        if (e.code === 'Digit1' && upgradeChoices[0]) pickUpgrade(upgradeChoices[0].key);
        if (e.code === 'Digit2' && upgradeChoices[1]) pickUpgrade(upgradeChoices[1].key);
        if (e.code === 'Digit3' && upgradeChoices[2]) pickUpgrade(upgradeChoices[2].key);
      }
    };
    const up = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up); };
  }, [gameState, initGame, upgradeChoices, pickUpgrade, navigate]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#000', fontFamily: 'monospace', position: 'relative' }}>
      {/* Back button */}
      <button
        onClick={() => void navigate('/dashboard')}
        style={{
          position: 'absolute', top: 12, left: 12, zIndex: 100,
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', fontSize: '11px',
          padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.5px',
        }}
      >
        ESC to exit
      </button>
      <canvas
        ref={canvasRef}
        width={GAME_W}
        height={GAME_H}
        style={{ border: '1px solid #1a1a1a', borderRadius: '4px' }}
        tabIndex={0}
      />
      <div style={{ marginTop: '10px', color: '#333', fontSize: '11px' }}>
        WASD/Arrows: Move &nbsp;|&nbsp; Space: Shoot &nbsp;|&nbsp; Enter: Bomb &nbsp;|&nbsp; 1/2/3: Choose Upgrade &nbsp;|&nbsp; ESC: Exit
      </div>
    </div>
  );
}
