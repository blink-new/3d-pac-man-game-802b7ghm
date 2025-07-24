import React, { useEffect, useRef, useState, useCallback } from 'react';

// Game constants matching original Donkey Kong
const CANVAS_WIDTH = 224;
const CANVAS_HEIGHT = 256;
const SCALE = 3;

// Sprite dimensions
const MARIO_WIDTH = 16;
const MARIO_HEIGHT = 16;
const BARREL_WIDTH = 16;
const BARREL_HEIGHT = 14;
const DONKEY_KONG_WIDTH = 32;
const DONKEY_KONG_HEIGHT = 32;
const FIREBALL_WIDTH = 8;
const FIREBALL_HEIGHT = 8;

// Game states
enum GameState {
  TITLE_SCREEN,
  HOW_HIGH_SCREEN,
  LEVEL_INTRO,
  PLAYING,
  MARIO_DEATH,
  LEVEL_COMPLETE,
  GAME_OVER,
  HIGH_SCORE,
  INTERLUDE
}

// Level types (all 4 original levels)
enum LevelType {
  GIRDERS = 0,    // Level 1 - Barrels
  RIVET = 1,      // Level 2 - Rivets  
  ELEVATOR = 2,   // Level 3 - Elevators
  CONVEYOR = 3    // Level 4 - Conveyors
}

interface Position {
  x: number;
  y: number;
}

interface Sprite {
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  frame: number;
  animTimer: number;
}

interface Barrel extends Sprite {
  onLadder: boolean;
  rolling: boolean;
}

interface Fireball extends Sprite {
  direction: number;
}

interface Rivet {
  x: number;
  y: number;
  removed: boolean;
}

interface Elevator {
  x: number;
  y: number;
  height: number;
  direction: number;
  speed: number;
}

const DonkeyKong: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>(GameState.TITLE_SCREEN);
  const [currentLevel, setCurrentLevel] = useState<LevelType>(LevelType.GIRDERS);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(7650);
  const [bonus, setBonus] = useState(5000);
  const [marioHasHammer, setMarioHasHammer] = useState(false);
  const [hammerTimer, setHammerTimer] = useState(0);

  // Game objects
  const mario = useRef<Sprite>({
    x: 24,
    y: 232,
    width: MARIO_WIDTH,
    height: MARIO_HEIGHT,
    vx: 0,
    vy: 0,
    frame: 0,
    animTimer: 0
  });

  const donkeyKong = useRef<Sprite>({
    x: 24,
    y: 40,
    width: DONKEY_KONG_WIDTH,
    height: DONKEY_KONG_HEIGHT,
    vx: 0,
    vy: 0,
    frame: 0,
    animTimer: 0
  });

  const barrels = useRef<Barrel[]>([]);
  const fireballs = useRef<Fireball[]>([]);
  const rivets = useRef<Rivet[]>([]);
  const elevators = useRef<Elevator[]>([]);
  const keys = useRef<Set<string>>(new Set());
  const gameTime = useRef(0);
  const animationId = useRef<number>();
  const bonusTimer = useRef(0);

  // Touch controls
  const [touchControls, setTouchControls] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false
  });

  // Audio context for sound effects
  const audioContext = useRef<AudioContext | null>(null);

  // Initialize audio
  useEffect(() => {
    try {
      audioContext.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.log('Audio not supported');
    }
  }, []);

  // Sound generation functions
  const playSound = useCallback((frequency: number, duration: number, type: OscillatorType = 'square') => {
    if (!audioContext.current) return;
    
    try {
      const oscillator = audioContext.current.createOscillator();
      const gainNode = audioContext.current.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.current.destination);
      
      oscillator.frequency.setValueAtTime(frequency, audioContext.current.currentTime);
      oscillator.type = type;
      
      gainNode.gain.setValueAtTime(0.1, audioContext.current.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.current.currentTime + duration);
      
      oscillator.start(audioContext.current.currentTime);
      oscillator.stop(audioContext.current.currentTime + duration);
    } catch (e) {
      // Ignore audio errors
    }
  }, []);

  // Original Donkey Kong sound effects
  const sounds = {
    jump: () => playSound(800, 0.1),
    walk: () => playSound(200, 0.05),
    barrel: () => playSound(150, 0.2),
    death: () => {
      playSound(400, 0.1);
      setTimeout(() => playSound(300, 0.1), 100);
      setTimeout(() => playSound(200, 0.2), 200);
    },
    hammer: () => playSound(600, 0.1),
    complete: () => {
      playSound(523, 0.2);
      setTimeout(() => playSound(659, 0.2), 200);
      setTimeout(() => playSound(784, 0.3), 400);
    },
    intro: () => {
      // Donkey Kong intro music
      const notes = [262, 294, 330, 349, 392, 440, 494, 523];
      notes.forEach((note, i) => {
        setTimeout(() => playSound(note, 0.3), i * 200);
      });
    },
    rivet: () => playSound(1000, 0.2),
    fireball: () => playSound(300, 0.1, 'sawtooth')
  };

  // Level data - All 4 original levels

  // Level 1: Girders (Barrels)
  const girderPlatforms = [
    { x: 8, y: 232, width: 208, height: 8 },   // Bottom platform
    { x: 8, y: 200, width: 80, height: 8 },    // Bottom left
    { x: 136, y: 200, width: 80, height: 8 },  // Bottom right
    { x: 8, y: 168, width: 80, height: 8 },    // Second left
    { x: 136, y: 168, width: 80, height: 8 },  // Second right
    { x: 8, y: 136, width: 80, height: 8 },    // Third left
    { x: 136, y: 136, width: 80, height: 8 },  // Third right
    { x: 8, y: 104, width: 80, height: 8 },    // Fourth left
    { x: 136, y: 104, width: 80, height: 8 },  // Fourth right
    { x: 8, y: 72, width: 80, height: 8 },     // Fifth left
    { x: 136, y: 72, width: 80, height: 8 },   // Fifth right
    { x: 56, y: 40, width: 112, height: 8 }    // Top platform
  ];

  const girderLadders = [
    { x: 88, y: 200, width: 8, height: 32 },   // Bottom center
    { x: 120, y: 168, width: 8, height: 32 },  // Second right
    { x: 88, y: 136, width: 8, height: 32 },   // Third center
    { x: 120, y: 104, width: 8, height: 32 },  // Fourth right
    { x: 88, y: 72, width: 8, height: 32 },    // Fifth center
    { x: 112, y: 40, width: 8, height: 32 }    // Top center
  ];

  // Level 2: Rivet level
  const rivetPlatforms = [
    { x: 8, y: 232, width: 208, height: 8 },   // Bottom
    { x: 8, y: 168, width: 208, height: 8 },   // Middle
    { x: 8, y: 104, width: 208, height: 8 },   // Top middle
    { x: 56, y: 40, width: 112, height: 8 }    // Top
  ];

  const rivetLadders = [
    { x: 32, y: 168, width: 8, height: 64 },
    { x: 88, y: 104, width: 8, height: 64 },
    { x: 136, y: 168, width: 8, height: 64 },
    { x: 184, y: 104, width: 8, height: 64 },
    { x: 112, y: 40, width: 8, height: 64 }
  ];

  // Level 3: Elevator level
  const elevatorPlatforms = [
    { x: 8, y: 232, width: 208, height: 8 },   // Bottom
    { x: 8, y: 40, width: 208, height: 8 }     // Top
  ];

  // Level 4: Conveyor level
  const conveyorPlatforms = [
    { x: 8, y: 232, width: 208, height: 8 },   // Bottom
    { x: 8, y: 200, width: 64, height: 8 },    // Bottom left conveyor
    { x: 88, y: 200, width: 48, height: 8 },   // Bottom middle conveyor
    { x: 152, y: 200, width: 64, height: 8 },  // Bottom right conveyor
    { x: 8, y: 168, width: 64, height: 8 },    // Second left conveyor
    { x: 152, y: 168, width: 64, height: 8 },  // Second right conveyor
    { x: 56, y: 136, width: 112, height: 8 },  // Middle conveyor
    { x: 56, y: 40, width: 112, height: 8 }    // Top platform
  ];

  const conveyorLadders = [
    { x: 72, y: 200, width: 8, height: 32 },
    { x: 144, y: 200, width: 8, height: 32 },
    { x: 72, y: 168, width: 8, height: 32 },
    { x: 144, y: 168, width: 8, height: 32 },
    { x: 112, y: 136, width: 8, height: 32 },
    { x: 112, y: 40, width: 8, height: 96 }
  ];

  // Get current level data
  const getCurrentPlatforms = () => {
    switch (currentLevel) {
      case LevelType.GIRDERS: return girderPlatforms;
      case LevelType.RIVET: return rivetPlatforms;
      case LevelType.ELEVATOR: return elevatorPlatforms;
      case LevelType.CONVEYOR: return conveyorPlatforms;
      default: return girderPlatforms;
    }
  };

  const getCurrentLadders = () => {
    switch (currentLevel) {
      case LevelType.GIRDERS: return girderLadders;
      case LevelType.RIVET: return rivetLadders;
      case LevelType.ELEVATOR: return [];
      case LevelType.CONVEYOR: return conveyorLadders;
      default: return girderLadders;
    }
  };

  // Game helper functions
  const resetMario = () => {
    mario.current = {
      x: 24,
      y: 232,
      width: MARIO_WIDTH,
      height: MARIO_HEIGHT,
      vx: 0,
      vy: 0,
      frame: 0,
      animTimer: 0
    };
  };

  // Initialize level-specific objects
  const initializeLevel = () => {
    barrels.current = [];
    fireballs.current = [];
    elevators.current = [];
    setMarioHasHammer(false);
    setHammerTimer(0);
    setBonus(5000);
    bonusTimer.current = 0;

    // Initialize rivets for rivet level
    if (currentLevel === LevelType.RIVET) {
      rivets.current = [
        { x: 8, y: 168, removed: false },
        { x: 208, y: 168, removed: false },
        { x: 8, y: 104, removed: false },
        { x: 208, y: 104, removed: false },
        { x: 56, y: 40, removed: false },
        { x: 160, y: 40, removed: false }
      ];
    }

    // Initialize elevators for elevator level
    if (currentLevel === LevelType.ELEVATOR) {
      elevators.current = [
        { x: 32, y: 200, height: 32, direction: -1, speed: 1 },
        { x: 64, y: 150, height: 32, direction: 1, speed: 1.2 },
        { x: 96, y: 180, height: 32, direction: -1, speed: 0.8 },
        { x: 128, y: 120, height: 32, direction: 1, speed: 1.1 },
        { x: 160, y: 160, height: 32, direction: -1, speed: 0.9 },
        { x: 192, y: 140, height: 32, direction: 1, speed: 1.3 }
      ];
    }

    // Reset Mario position based on level
    resetMario();
  };

  // Collision detection
  const checkCollision = (rect1: any, rect2: any): boolean => {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  };

  // Check if Mario is on a platform
  const isOnPlatform = (x: number, y: number): boolean => {
    const platforms = getCurrentPlatforms();
    for (const platform of platforms) {
      if (x + MARIO_WIDTH > platform.x && 
          x < platform.x + platform.width &&
          y + MARIO_HEIGHT >= platform.y && 
          y + MARIO_HEIGHT <= platform.y + platform.height + 4) {
        return true;
      }
    }

    // Check elevators for elevator level
    if (currentLevel === LevelType.ELEVATOR) {
      for (const elevator of elevators.current) {
        if (x + MARIO_WIDTH > elevator.x && 
            x < elevator.x + 16 &&
            y + MARIO_HEIGHT >= elevator.y && 
            y + MARIO_HEIGHT <= elevator.y + 8) {
          return true;
        }
      }
    }

    return false;
  };

  // Check if Mario can climb ladder
  const canClimbLadder = (x: number, y: number): boolean => {
    const ladders = getCurrentLadders();
    for (const ladder of ladders) {
      if (x + MARIO_WIDTH/2 >= ladder.x && 
          x + MARIO_WIDTH/2 <= ladder.x + ladder.width &&
          y + MARIO_HEIGHT >= ladder.y && 
          y <= ladder.y + ladder.height) {
        return true;
      }
    }
    return false;
  };

  // Drawing functions
  const drawMario = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number = 0) => {
    // Mario sprite - simplified pixel art
    ctx.fillStyle = '#FF0000';
    // Hat
    ctx.fillRect(x + 2, y, 12, 4);
    
    ctx.fillStyle = '#FFDBAC';
    // Face
    ctx.fillRect(x + 4, y + 4, 8, 6);
    
    ctx.fillStyle = '#0000FF';
    // Overalls
    ctx.fillRect(x + 2, y + 10, 12, 6);
    
    ctx.fillStyle = '#FFDBAC';
    // Arms
    if (marioHasHammer) {
      ctx.fillStyle = '#8B4513';
      // Hammer
      ctx.fillRect(x + 12, y + 6, 8, 4);
      ctx.fillRect(x + 14, y + 2, 4, 8);
    } else {
      ctx.fillRect(x, y + 8, 4, 4);
      ctx.fillRect(x + 12, y + 8, 4, 4);
    }
    
    ctx.fillStyle = '#8B4513';
    // Shoes
    ctx.fillRect(x + 2, y + 14, 4, 2);
    ctx.fillRect(x + 10, y + 14, 4, 2);

    // Walking animation
    if (frame > 0) {
      ctx.fillStyle = '#0000FF';
      ctx.fillRect(x + 4, y + 12, 2, 2);
      ctx.fillRect(x + 10, y + 12, 2, 2);
    }
  };

  const drawDonkeyKong = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number = 0) => {
    ctx.fillStyle = '#8B4513';
    // Body
    ctx.fillRect(x, y + 8, 32, 24);
    
    ctx.fillStyle = '#654321';
    // Head
    ctx.fillRect(x + 4, y, 24, 16);
    
    ctx.fillStyle = '#FFFFFF';
    // Eyes
    ctx.fillRect(x + 8, y + 4, 4, 4);
    ctx.fillRect(x + 20, y + 4, 4, 4);
    
    ctx.fillStyle = '#000000';
    // Pupils
    ctx.fillRect(x + 10, y + 6, 2, 2);
    ctx.fillRect(x + 22, y + 6, 2, 2);
    
    // Mouth
    ctx.fillRect(x + 14, y + 10, 4, 2);
    
    // Chest beating animation
    if (frame === 1) {
      ctx.fillStyle = '#FF0000';
      ctx.fillRect(x + 12, y + 16, 8, 4);
    }

    // Arms
    ctx.fillStyle = '#8B4513';
    if (frame === 1) {
      // Arms up (beating chest)
      ctx.fillRect(x - 4, y + 12, 8, 8);
      ctx.fillRect(x + 28, y + 12, 8, 8);
    } else {
      // Arms down
      ctx.fillRect(x - 2, y + 16, 6, 12);
      ctx.fillRect(x + 28, y + 16, 6, 12);
    }
  };

  const drawBarrel = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number = 0) => {
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x, y, BARREL_WIDTH, BARREL_HEIGHT);
    
    ctx.fillStyle = '#654321';
    // Barrel bands
    ctx.fillRect(x, y + 2, BARREL_WIDTH, 2);
    ctx.fillRect(x, y + 6, BARREL_WIDTH, 2);
    ctx.fillRect(x, y + 10, BARREL_WIDTH, 2);
    
    // Rolling animation
    if (frame % 2 === 1) {
      ctx.fillStyle = '#A0522D';
      ctx.fillRect(x + 2, y + 1, 2, BARREL_HEIGHT - 2);
      ctx.fillRect(x + 12, y + 1, 2, BARREL_HEIGHT - 2);
    }
  };

  const drawFireball = (ctx: CanvasRenderingContext2D, x: number, y: number, frame: number = 0) => {
    const colors = ['#FF4500', '#FF6347', '#FF0000', '#FFD700'];
    ctx.fillStyle = colors[frame % colors.length];
    
    // Fireball shape
    ctx.fillRect(x + 2, y, 4, 8);
    ctx.fillRect(x, y + 2, 8, 4);
    ctx.fillRect(x + 1, y + 1, 6, 6);
  };

  const drawPauline = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    // Pauline (the princess)
    ctx.fillStyle = '#FF69B4';
    // Dress
    ctx.fillRect(x, y + 8, 8, 8);
    
    ctx.fillStyle = '#FFDBAC';
    // Head
    ctx.fillRect(x + 1, y, 6, 8);
    
    ctx.fillStyle = '#FFD700';
    // Hair
    ctx.fillRect(x, y, 8, 4);
    
    ctx.fillStyle = '#000000';
    // Eyes
    ctx.fillRect(x + 2, y + 2, 1, 1);
    ctx.fillRect(x + 5, y + 2, 1, 1);

    // Help text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HELP!', x + 4, y - 4);
  };

  const drawHammer = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = '#8B4513';
    // Handle
    ctx.fillRect(x + 2, y, 4, 12);
    // Head
    ctx.fillRect(x, y + 2, 8, 4);
  };

  const drawRivet = (ctx: CanvasRenderingContext2D, x: number, y: number, removed: boolean = false) => {
    if (!removed) {
      ctx.fillStyle = '#FFFF00';
      ctx.fillRect(x, y, 4, 4);
      ctx.fillStyle = '#FFA500';
      ctx.fillRect(x + 1, y + 1, 2, 2);
    }
  };

  const drawElevator = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = '#00FFFF';
    ctx.fillRect(x, y, 16, 8);
    ctx.fillStyle = '#0080FF';
    ctx.fillRect(x + 2, y + 2, 12, 4);
  };

  const drawConveyor = (ctx: CanvasRenderingContext2D, platform: any, direction: number = 1) => {
    ctx.fillStyle = '#808080';
    ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    
    // Conveyor belt animation
    ctx.fillStyle = '#A0A0A0';
    const offset = (gameTime.current * direction) % 8;
    for (let x = platform.x + offset; x < platform.x + platform.width; x += 8) {
      ctx.fillRect(x, platform.y + 2, 4, 2);
    }
  };

  const drawUI = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    
    // Score
    ctx.fillText(`1UP`, 8, 12);
    ctx.fillText(`${score.toString().padStart(6, '0')}`, 8, 22);
    
    // High score
    ctx.fillText(`HIGH SCORE`, 80, 12);
    ctx.fillText(`${highScore.toString().padStart(6, '0')}`, 80, 22);
    
    // Lives
    for (let i = 0; i < lives - 1; i++) {
      drawMario(ctx, 8 + i * 20, 240);
    }
    
    // Level indicator
    ctx.fillText(`L=${level.toString().padStart(2, '0')}`, 180, 12);
    
    // Bonus
    if (gameState === GameState.PLAYING) {
      ctx.fillStyle = '#FFFF00';
      ctx.fillText(`BONUS ${bonus}`, 80, 240);
    }
  };

  const drawTitleScreen = (ctx: CanvasRenderingContext2D) => {
    // Background
    ctx.fillStyle = '#000080';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#FF0000';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    
    // Title
    ctx.fillText('DONKEY KONG', CANVAS_WIDTH/2, 60);
    
    ctx.fillStyle = '#FFFF00';
    ctx.font = '8px monospace';
    ctx.fillText('© 1981 NINTENDO OF AMERICA INC.', CANVAS_WIDTH/2, 80);
    
    // High score
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.fillText(`HIGH SCORE`, CANVAS_WIDTH/2, 120);
    ctx.fillText(`${highScore.toString().padStart(6, '0')}`, CANVAS_WIDTH/2, 135);
    
    // Characters
    drawDonkeyKong(ctx, CANVAS_WIDTH/2 - 16, 90);
    drawMario(ctx, CANVAS_WIDTH/2 - 8, 160);
    drawPauline(ctx, CANVAS_WIDTH/2 + 20, 160);
    
    // Instructions
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '8px monospace';
    ctx.fillText('TAP TO START', CANVAS_WIDTH/2, 200);
    
    // Animated elements
    if (Math.floor(gameTime.current / 30) % 2 === 0) {
      ctx.fillStyle = '#FFFF00';
      ctx.fillText('PRESS START', CANVAS_WIDTH/2, 220);
    }
  };

  const drawHowHighScreen = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#000080';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOW HIGH CAN YOU GET?', CANVAS_WIDTH/2, 60);
    
    // Show level progression
    const levelNames = ['GIRDERS', 'RIVETS', 'ELEVATORS', 'CONVEYORS'];
    ctx.font = '8px monospace';
    levelNames.forEach((name, i) => {
      ctx.fillStyle = i === currentLevel ? '#FFFF00' : '#FFFFFF';
      ctx.fillText(`${i + 1}. ${name}`, CANVAS_WIDTH/2, 100 + i * 20);
    });
    
    drawMario(ctx, CANVAS_WIDTH/2 - 8, 200);
  };

  const drawLevelIntro = (ctx: CanvasRenderingContext2D) => {
    const levelNames = ['GIRDERS', 'RIVETS', 'ELEVATORS', 'CONVEYORS'];
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#FFFF00';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${level}`, CANVAS_WIDTH/2, 100);
    ctx.fillText(levelNames[currentLevel], CANVAS_WIDTH/2, 120);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.fillText(`BONUS: ${bonus}`, CANVAS_WIDTH/2, 150);
  };

  const drawGame = (ctx: CanvasRenderingContext2D) => {
    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    const platforms = getCurrentPlatforms();
    const ladders = getCurrentLadders();

    // Draw platforms based on level type
    if (currentLevel === LevelType.CONVEYOR) {
      // Draw conveyor belts with animation
      platforms.forEach((platform, i) => {
        if (i > 0 && i < platforms.length - 1) { // Skip bottom and top platforms
          const direction = i % 2 === 0 ? 1 : -1;
          drawConveyor(ctx, platform, direction);
        } else {
          ctx.fillStyle = '#FF6B6B';
          ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
        }
      });
    } else {
      // Regular platforms
      ctx.fillStyle = '#FF6B6B';
      platforms.forEach(platform => {
        ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
      });
    }

    // Draw ladders
    ctx.fillStyle = '#00FFFF';
    ladders.forEach(ladder => {
      for (let y = ladder.y; y < ladder.y + ladder.height; y += 4) {
        ctx.fillRect(ladder.x, y, 2, 2);
        ctx.fillRect(ladder.x + 6, y, 2, 2);
        ctx.fillRect(ladder.x + 2, y + 2, 4, 1);
      }
    });

    // Draw level-specific elements
    if (currentLevel === LevelType.RIVET) {
      // Draw rivets
      rivets.current.forEach(rivet => {
        drawRivet(ctx, rivet.x, rivet.y, rivet.removed);
      });
    }

    if (currentLevel === LevelType.ELEVATOR) {
      // Draw elevators
      elevators.current.forEach(elevator => {
        drawElevator(ctx, elevator.x, elevator.y);
      });
    }

    // Draw Donkey Kong
    drawDonkeyKong(ctx, donkeyKong.current.x, donkeyKong.current.y, donkeyKong.current.frame);

    // Draw barrels
    barrels.current.forEach(barrel => {
      drawBarrel(ctx, barrel.x, barrel.y, barrel.frame);
    });

    // Draw fireballs
    fireballs.current.forEach(fireball => {
      drawFireball(ctx, fireball.x, fireball.y, fireball.frame);
    });

    // Draw hammers (if level has them)
    if (currentLevel === LevelType.GIRDERS) {
      // Hammer positions
      const hammerPositions = [
        { x: 40, y: 192 },
        { x: 160, y: 128 }
      ];
      
      hammerPositions.forEach(pos => {
        if (!marioHasHammer || (mario.current.x < pos.x - 20 || mario.current.x > pos.x + 20)) {
          drawHammer(ctx, pos.x, pos.y);
        }
      });
    }

    // Draw Mario
    drawMario(ctx, mario.current.x, mario.current.y, mario.current.frame);

    // Draw Pauline
    drawPauline(ctx, 112, 24);

    // Draw UI
    drawUI(ctx);
  };

  const drawInterlude = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#000080';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Animated scene showing Mario and Pauline
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    
    if (currentLevel === LevelType.GIRDERS) {
      ctx.fillText('MARIO SAVES PAULINE!', CANVAS_WIDTH/2, 60);
    } else {
      ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH/2, 60);
    }
    
    // Animated Mario and Pauline
    const animOffset = Math.sin(gameTime.current * 0.1) * 5;
    drawMario(ctx, CANVAS_WIDTH/2 - 20 + animOffset, 120);
    drawPauline(ctx, CANVAS_WIDTH/2 + 10 - animOffset, 120);
    
    // Hearts
    ctx.fillStyle = '#FF69B4';
    ctx.fillRect(CANVAS_WIDTH/2 - 2, 100, 4, 4);
    ctx.fillRect(CANVAS_WIDTH/2 - 6, 110, 4, 4);
    ctx.fillRect(CANVAS_WIDTH/2 + 2, 110, 4, 4);
  };

  const drawDeathScreen = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#FF0000';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MARIO DIED!', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '8px monospace';
    ctx.fillText(`LIVES LEFT: ${lives - 1}`, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 20);
  };

  const drawLevelComplete = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#00FF00';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEVEL COMPLETE!', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
    
    ctx.fillStyle = '#FFFF00';
    ctx.font = '8px monospace';
    ctx.fillText(`BONUS: ${bonus}`, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 20);
  };

  const drawGameOver = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    ctx.fillStyle = '#FF0000';
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', CANVAS_WIDTH/2, CANVAS_HEIGHT/2);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.fillText(`FINAL SCORE: ${score}`, CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 30);
    ctx.fillText('TAP TO RESTART', CANVAS_WIDTH/2, CANVAS_HEIGHT/2 + 50);
  };

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear screen
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    switch (gameState) {
      case GameState.TITLE_SCREEN:
        drawTitleScreen(ctx);
        break;
      case GameState.HOW_HIGH_SCREEN:
        drawHowHighScreen(ctx);
        break;
      case GameState.LEVEL_INTRO:
        drawLevelIntro(ctx);
        break;
      case GameState.PLAYING:
        drawGame(ctx);
        break;
      case GameState.MARIO_DEATH:
        drawGame(ctx);
        drawDeathScreen(ctx);
        break;
      case GameState.LEVEL_COMPLETE:
        drawGame(ctx);
        drawLevelComplete(ctx);
        break;
      case GameState.INTERLUDE:
        drawInterlude(ctx);
        break;
      case GameState.GAME_OVER:
        drawGameOver(ctx);
        break;
    }
  };

  // Check win conditions based on level
  const checkWinCondition = () => {
    const m = mario.current;
    
    switch (currentLevel) {
      case LevelType.GIRDERS:
        // Reach Pauline
        if (m.y <= 48 && m.x >= 56 && m.x <= 168) {
          setGameState(GameState.LEVEL_COMPLETE);
          sounds.complete();
          setScore(prev => prev + bonus);
        }
        break;
        
      case LevelType.RIVET:
        // Remove all rivets
        if (rivets.current.every(rivet => rivet.removed)) {
          setGameState(GameState.INTERLUDE);
          sounds.complete();
          setScore(prev => prev + bonus);
        }
        break;
        
      case LevelType.ELEVATOR:
      case LevelType.CONVEYOR:
        // Reach top platform
        if (m.y <= 48 && m.x >= 56 && m.x <= 168) {
          setGameState(GameState.LEVEL_COMPLETE);
          sounds.complete();
          setScore(prev => prev + bonus);
        }
        break;
    }
  };

  // Update Mario physics
  const updateMario = () => {
    const m = mario.current;
    
    // Handle input
    let moving = false;
    
    if (keys.current.has('ArrowLeft') || touchControls.left) {
      m.vx = -1;
      moving = true;
      if (gameTime.current % 10 === 0) sounds.walk();
    } else if (keys.current.has('ArrowRight') || touchControls.right) {
      m.vx = 1;
      moving = true;
      if (gameTime.current % 10 === 0) sounds.walk();
    } else {
      m.vx = 0;
    }

    // Conveyor belt effect
    if (currentLevel === LevelType.CONVEYOR && isOnPlatform(m.x, m.y)) {
      const platforms = getCurrentPlatforms();
      for (let i = 1; i < platforms.length - 1; i++) {
        const platform = platforms[i];
        if (m.x + MARIO_WIDTH > platform.x && 
            m.x < platform.x + platform.width &&
            m.y + MARIO_HEIGHT >= platform.y && 
            m.y + MARIO_HEIGHT <= platform.y + platform.height + 4) {
          const direction = i % 2 === 0 ? 0.5 : -0.5;
          m.vx += direction;
          break;
        }
      }
    }

    // Jumping
    if ((keys.current.has('Space') || touchControls.jump) && m.vy === 0 && isOnPlatform(m.x, m.y)) {
      m.vy = -4;
      sounds.jump();
    }

    // Ladder climbing
    if (keys.current.has('ArrowUp') || touchControls.up) {
      if (canClimbLadder(m.x, m.y)) {
        m.vy = -1;
        m.vx = 0;
      }
    } else if (keys.current.has('ArrowDown') || touchControls.down) {
      if (canClimbLadder(m.x, m.y)) {
        m.vy = 1;
        m.vx = 0;
      }
    }

    // Apply gravity
    if (!canClimbLadder(m.x, m.y)) {
      m.vy += 0.3;
    }

    // Update position
    m.x += m.vx;
    m.y += m.vy;

    // Platform collision
    if (m.vy > 0) { // Falling
      const platforms = getCurrentPlatforms();
      for (const platform of platforms) {
        if (m.x + MARIO_WIDTH > platform.x && 
            m.x < platform.x + platform.width &&
            m.y + MARIO_HEIGHT > platform.y && 
            m.y + MARIO_HEIGHT < platform.y + platform.height + 8) {
          m.y = platform.y - MARIO_HEIGHT;
          m.vy = 0;
          break;
        }
      }

      // Elevator collision
      if (currentLevel === LevelType.ELEVATOR) {
        for (const elevator of elevators.current) {
          if (m.x + MARIO_WIDTH > elevator.x && 
              m.x < elevator.x + 16 &&
              m.y + MARIO_HEIGHT > elevator.y && 
              m.y + MARIO_HEIGHT < elevator.y + 16) {
            m.y = elevator.y - MARIO_HEIGHT;
            m.vy = 0;
            // Move with elevator
            m.y += elevator.direction * elevator.speed;
            break;
          }
        }
      }
    }

    // Screen boundaries
    m.x = Math.max(0, Math.min(CANVAS_WIDTH - MARIO_WIDTH, m.x));
    
    // Death if falling off screen
    if (m.y > CANVAS_HEIGHT) {
      setGameState(GameState.MARIO_DEATH);
      sounds.death();
    }

    // Animation
    if (moving) {
      m.animTimer++;
      if (m.animTimer > 8) {
        m.frame = (m.frame + 1) % 3;
        m.animTimer = 0;
      }
    } else {
      m.frame = 0;
    }

    // Hammer pickup
    if (currentLevel === LevelType.GIRDERS && !marioHasHammer) {
      const hammerPositions = [
        { x: 40, y: 192 },
        { x: 160, y: 128 }
      ];
      
      for (const pos of hammerPositions) {
        if (Math.abs(m.x - pos.x) < 16 && Math.abs(m.y - pos.y) < 16) {
          setMarioHasHammer(true);
          setHammerTimer(300); // 5 seconds at 60fps
          sounds.hammer();
          break;
        }
      }
    }

    // Hammer timer
    if (marioHasHammer) {
      setHammerTimer(prev => {
        if (prev <= 1) {
          setMarioHasHammer(false);
          return 0;
        }
        return prev - 1;
      });
    }

    // Check win conditions based on level
    checkWinCondition();
  };

  // Update barrels
  const updateBarrels = () => {
    // Spawn new barrel (only on girders level)
    if (currentLevel === LevelType.GIRDERS && gameTime.current % 120 === 0 && barrels.current.length < 4) {
      barrels.current.push({
        x: 56,
        y: 72,
        width: BARREL_WIDTH,
        height: BARREL_HEIGHT,
        vx: 1,
        vy: 0,
        frame: 0,
        animTimer: 0,
        onLadder: false,
        rolling: true
      });
      sounds.barrel();
    }

    // Update existing barrels
    barrels.current = barrels.current.filter(barrel => {
      barrel.x += barrel.vx;
      barrel.y += barrel.vy;

      // Gravity
      if (!barrel.onLadder) {
        barrel.vy += 0.3;
      }

      // Platform collision
      if (barrel.vy > 0) {
        const platforms = getCurrentPlatforms();
        for (const platform of platforms) {
          if (barrel.x + BARREL_WIDTH > platform.x && 
              barrel.x < platform.x + platform.width &&
              barrel.y + BARREL_HEIGHT > platform.y && 
              barrel.y + BARREL_HEIGHT < platform.y + platform.height + 8) {
            barrel.y = platform.y - BARREL_HEIGHT;
            barrel.vy = 0;
            barrel.onLadder = false;
            break;
          }
        }
      }

      // Ladder interaction
      if (!barrel.onLadder && Math.random() < 0.02) {
        const ladders = getCurrentLadders();
        for (const ladder of ladders) {
          if (barrel.x + BARREL_WIDTH/2 >= ladder.x && 
              barrel.x + BARREL_WIDTH/2 <= ladder.x + ladder.width &&
              barrel.y + BARREL_HEIGHT >= ladder.y) {
            barrel.onLadder = true;
            barrel.vy = 2;
            barrel.vx = 0;
            break;
          }
        }
      }

      // Animation
      barrel.animTimer++;
      if (barrel.animTimer > 6) {
        barrel.frame = (barrel.frame + 1) % 4;
        barrel.animTimer = 0;
      }

      // Remove if off screen
      if (barrel.y > CANVAS_HEIGHT || barrel.x < -20 || barrel.x > CANVAS_WIDTH + 20) {
        return false;
      }

      // Collision with Mario (if not using hammer)
      if (!marioHasHammer && checkCollision(mario.current, barrel)) {
        setGameState(GameState.MARIO_DEATH);
        sounds.death();
      }

      // Hammer collision
      if (marioHasHammer && checkCollision(mario.current, barrel)) {
        setScore(prev => prev + 300);
        sounds.hammer();
        return false; // Remove barrel
      }

      return true;
    });
  };

  // Update fireballs
  const updateFireballs = () => {
    // Spawn fireballs on rivet level
    if (currentLevel === LevelType.RIVET && gameTime.current % 180 === 0 && fireballs.current.length < 2) {
      fireballs.current.push({
        x: 24,
        y: 232,
        width: FIREBALL_WIDTH,
        height: FIREBALL_HEIGHT,
        vx: Math.random() > 0.5 ? 1 : -1,
        vy: 0,
        frame: 0,
        animTimer: 0,
        direction: Math.random() > 0.5 ? 1 : -1
      });
      sounds.fireball();
    }

    // Update existing fireballs
    fireballs.current = fireballs.current.filter(fireball => {
      fireball.x += fireball.vx;
      fireball.y += fireball.vy;

      // Gravity
      fireball.vy += 0.2;

      // Platform collision
      if (fireball.vy > 0) {
        const platforms = getCurrentPlatforms();
        for (const platform of platforms) {
          if (fireball.x + FIREBALL_WIDTH > platform.x && 
              fireball.x < platform.x + platform.width &&
              fireball.y + FIREBALL_HEIGHT > platform.y && 
              fireball.y + FIREBALL_HEIGHT < platform.y + platform.height + 8) {
            fireball.y = platform.y - FIREBALL_HEIGHT;
            fireball.vy = -2; // Bounce
            break;
          }
        }
      }

      // Bounce off walls
      if (fireball.x <= 0 || fireball.x >= CANVAS_WIDTH - FIREBALL_WIDTH) {
        fireball.vx *= -1;
      }

      // Animation
      fireball.animTimer++;
      if (fireball.animTimer > 4) {
        fireball.frame = (fireball.frame + 1) % 4;
        fireball.animTimer = 0;
      }

      // Remove if off screen
      if (fireball.y > CANVAS_HEIGHT) {
        return false;
      }

      // Collision with Mario
      if (checkCollision(mario.current, fireball)) {
        setGameState(GameState.MARIO_DEATH);
        sounds.death();
      }

      return true;
    });
  };

  // Update elevators
  const updateElevators = () => {
    if (currentLevel !== LevelType.ELEVATOR) return;

    elevators.current.forEach(elevator => {
      elevator.y += elevator.direction * elevator.speed;

      // Reverse direction at boundaries
      if (elevator.y <= 50 || elevator.y >= 200) {
        elevator.direction *= -1;
      }
    });
  };

  // Update rivets
  const updateRivets = () => {
    if (currentLevel !== LevelType.RIVET) return;

    const m = mario.current;
    rivets.current.forEach(rivet => {
      if (!rivet.removed && Math.abs(m.x - rivet.x) < 8 && Math.abs(m.y - rivet.y) < 8) {
        rivet.removed = true;
        setScore(prev => prev + 100);
        sounds.rivet();
      }
    });
  };

  // Update Donkey Kong animation
  const updateDonkeyKong = () => {
    const dk = donkeyKong.current;
    dk.animTimer++;
    if (dk.animTimer > 30) {
      dk.frame = (dk.frame + 1) % 2;
      dk.animTimer = 0;
    }
  };

  // Update bonus timer
  const updateBonus = () => {
    bonusTimer.current++;
    if (bonusTimer.current >= 60) { // Every second
      setBonus(prev => Math.max(0, prev - 100));
      bonusTimer.current = 0;
    }
  };

  const startGame = () => {
    setGameState(GameState.HOW_HIGH_SCREEN);
    setTimeout(() => {
      setGameState(GameState.LEVEL_INTRO);
      setTimeout(() => {
        setGameState(GameState.PLAYING);
        initializeLevel();
      }, 2000);
    }, 2000);
    
    setScore(0);
    setLives(3);
    setLevel(1);
    setCurrentLevel(LevelType.GIRDERS);
    resetMario();
    sounds.intro();
  };

  const nextLevel = () => {
    setLevel(prev => prev + 1);
    setScore(prev => prev + 1000 * level);
    
    // Cycle through levels
    const nextLevelType = (currentLevel + 1) % 4;
    setCurrentLevel(nextLevelType);
    
    setGameState(GameState.LEVEL_INTRO);
    setTimeout(() => {
      setGameState(GameState.PLAYING);
      initializeLevel();
    }, 2000);
  };

  const resetGame = () => {
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem('donkeyKongHighScore', score.toString());
    }
    setGameState(GameState.TITLE_SCREEN);
    setCurrentLevel(LevelType.GIRDERS);
    resetMario();
    barrels.current = [];
    fireballs.current = [];
  };

  // Main game loop
  const gameLoop = () => {
    gameTime.current++;

    if (gameState === GameState.PLAYING) {
      updateMario();
      updateBarrels();
      updateFireballs();
      updateElevators();
      updateRivets();
      updateDonkeyKong();
      updateBonus();
    }

    draw();
    animationId.current = requestAnimationFrame(gameLoop);
  };

  // Event handlers
  const handleKeyDown = (e: KeyboardEvent) => {
    keys.current.add(e.code);
    e.preventDefault();
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    keys.current.delete(e.code);
    e.preventDefault();
  };

  const handleCanvasClick = () => {
    if (audioContext.current?.state === 'suspended') {
      audioContext.current.resume();
    }

    switch (gameState) {
      case GameState.TITLE_SCREEN:
        startGame();
        break;
      case GameState.HOW_HIGH_SCREEN:
        setGameState(GameState.LEVEL_INTRO);
        setTimeout(() => {
          setGameState(GameState.PLAYING);
          initializeLevel();
        }, 2000);
        break;
      case GameState.MARIO_DEATH:
        if (lives > 1) {
          setLives(prev => prev - 1);
          resetMario();
          setGameState(GameState.PLAYING);
        } else {
          setGameState(GameState.GAME_OVER);
        }
        break;
      case GameState.LEVEL_COMPLETE:
        nextLevel();
        break;
      case GameState.INTERLUDE:
        nextLevel();
        break;
      case GameState.GAME_OVER:
        resetGame();
        break;
    }
  };

  // Touch control handlers
  const handleTouchStart = (control: string) => {
    setTouchControls(prev => ({ ...prev, [control]: true }));
  };

  const handleTouchEnd = (control: string) => {
    setTouchControls(prev => ({ ...prev, [control]: false }));
  };

  // Initialize game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // Load high score
    const savedHighScore = localStorage.getItem('donkeyKongHighScore');
    if (savedHighScore) {
      setHighScore(parseInt(savedHighScore));
    }

    // Event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Start game loop
    animationId.current = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (animationId.current) {
        cancelAnimationFrame(animationId.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="border-2 border-red-600 bg-black cursor-pointer"
          style={{
            width: CANVAS_WIDTH * SCALE,
            height: CANVAS_HEIGHT * SCALE,
            imageRendering: 'pixelated'
          }}
        />
        
        {/* Mobile Touch Controls */}
        <div className="md:hidden">
          <div className="flex justify-center mt-4 space-x-8">
            {/* D-Pad */}
            <div className="relative w-32 h-32">
              <button
                className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-gray-700 text-white rounded font-bold text-lg select-none"
                onTouchStart={(e) => { e.preventDefault(); handleTouchStart('up'); }}
                onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('up'); }}
                onMouseDown={() => handleTouchStart('up')}
                onMouseUp={() => handleTouchEnd('up')}
                onMouseLeave={() => handleTouchEnd('up')}
              >
                ↑
              </button>
              <button
                className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-gray-700 text-white rounded font-bold text-lg select-none"
                onTouchStart={(e) => { e.preventDefault(); handleTouchStart('down'); }}
                onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('down'); }}
                onMouseDown={() => handleTouchStart('down')}
                onMouseUp={() => handleTouchEnd('down')}
                onMouseLeave={() => handleTouchEnd('down')}
              >
                ↓
              </button>
              <button
                className="absolute left-0 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-gray-700 text-white rounded font-bold text-lg select-none"
                onTouchStart={(e) => { e.preventDefault(); handleTouchStart('left'); }}
                onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('left'); }}
                onMouseDown={() => handleTouchStart('left')}
                onMouseUp={() => handleTouchEnd('left')}
                onMouseLeave={() => handleTouchEnd('left')}
              >
                ←
              </button>
              <button
                className="absolute right-0 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-gray-700 text-white rounded font-bold text-lg select-none"
                onTouchStart={(e) => { e.preventDefault(); handleTouchStart('right'); }}
                onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('right'); }}
                onMouseDown={() => handleTouchStart('right')}
                onMouseUp={() => handleTouchEnd('right')}
                onMouseLeave={() => handleTouchEnd('right')}
              >
                →
              </button>
            </div>
            
            {/* Jump Button */}
            <button
              className="w-20 h-20 bg-red-600 text-white rounded-full text-sm font-bold select-none"
              onTouchStart={(e) => { e.preventDefault(); handleTouchStart('jump'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('jump'); }}
              onMouseDown={() => handleTouchStart('jump')}
              onMouseUp={() => handleTouchEnd('jump')}
              onMouseLeave={() => handleTouchEnd('jump')}
            >
              JUMP
            </button>
          </div>
        </div>
      </div>
      
      {/* Instructions */}
      <div className="mt-4 text-center text-white max-w-md">
        <p className="text-sm mb-2">🕹️ <strong>DONKEY KONG</strong> - Complete Arcade Experience</p>
        <p className="text-xs mb-1">Desktop: Arrow Keys + Space to Jump</p>
        <p className="text-xs mb-2 md:hidden">Mobile: Use touch controls above</p>
        <p className="text-xs text-gray-400 mb-1">
          🎯 <strong>All 4 Original Levels:</strong> Girders, Rivets, Elevators, Conveyors
        </p>
        <p className="text-xs text-gray-400 mb-1">
          🔨 Grab hammers to smash barrels! 🔥 Avoid fireballs!
        </p>
        <p className="text-xs text-gray-400">
          💖 Save Pauline and become the ultimate arcade champion!
        </p>
      </div>
    </div>
  );
};

export default DonkeyKong;