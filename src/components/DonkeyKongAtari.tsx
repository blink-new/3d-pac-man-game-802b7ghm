import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

interface Position {
  x: number;
  y: number;
}

interface GameObject {
  x: number;
  y: number;
  width: number;
  height: number;
  active: boolean;
}

interface Barrel extends GameObject {
  direction: number;
  speed: number;
  onLadder: boolean;
}

interface Fireball extends GameObject {
  direction: number;
  speed: number;
  climbing: boolean;
}

const DonkeyKongAtari: React.FC = () => {
  // Game state
  const [gameState, setGameState] = useState<'title' | 'playing' | 'gameOver' | 'levelComplete'>('title');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('atari-dk-highscore');
    return saved ? parseInt(saved) : 0;
  });

  // Mario state
  const [mario, setMario] = useState<Position & { 
    onGround: boolean; 
    jumping: boolean; 
    climbing: boolean; 
    direction: number;
    hasHammer: boolean;
    hammerTimer: number;
    animFrame: number;
  }>({
    x: 50,
    y: 200,
    onGround: true,
    jumping: false,
    climbing: false,
    direction: 1,
    hasHammer: false,
    hammerTimer: 0,
    animFrame: 0
  });

  // Game objects
  const [barrels, setBarrels] = useState<Barrel[]>([]);
  const [fireballs, setFireballs] = useState<Fireball[]>([]);
  const [hammer, setHammer] = useState<GameObject | null>(null);
  const [bonus, setBonus] = useState(5000);

  // Input state
  const [keys, setKeys] = useState<{[key: string]: boolean}>({});
  const [touchControls, setTouchControls] = useState({
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false
  });

  // Refs
  const gameLoopRef = useRef<number>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Atari 2600 specific level layout (simplified single screen)
  const platforms = useMemo(() => [
    { x: 0, y: 220, width: 320, height: 8 }, // Bottom platform
    { x: 40, y: 180, width: 240, height: 8 }, // Second platform
    { x: 0, y: 140, width: 280, height: 8 }, // Third platform
    { x: 40, y: 100, width: 240, height: 8 }, // Fourth platform
    { x: 0, y: 60, width: 320, height: 8 }, // Top platform
  ], []);

  const ladders = useMemo(() => [
    { x: 80, y: 180, width: 16, height: 40 },
    { x: 240, y: 140, width: 16, height: 40 },
    { x: 80, y: 100, width: 16, height: 40 },
    { x: 240, y: 60, width: 16, height: 40 },
  ], []);

  // Audio functions
  const createBeep = useCallback((frequency: number, duration: number) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    
    oscillator.frequency.value = frequency;
    oscillator.type = 'square';
    
    gainNode.gain.setValueAtTime(0.1, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContextRef.current.currentTime + duration);
    
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + duration);
  }, []);

  const playJumpSound = useCallback(() => createBeep(800, 0.1), [createBeep]);
  const playDeathSound = useCallback(() => {
    createBeep(200, 0.1);
    setTimeout(() => createBeep(150, 0.1), 100);
    setTimeout(() => createBeep(100, 0.2), 200);
  }, [createBeep]);
  const playHammerSound = useCallback(() => createBeep(400, 0.05), [createBeep]);
  const playCompleteSound = useCallback(() => {
    createBeep(523, 0.2);
    setTimeout(() => createBeep(659, 0.2), 200);
    setTimeout(() => createBeep(784, 0.3), 400);
  }, [createBeep]);

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key]: true }));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      setKeys(prev => ({ ...prev, [e.key]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Touch controls
  const handleTouchStart = useCallback((control: string) => {
    setTouchControls(prev => ({ ...prev, [control]: true }));
  }, []);

  const handleTouchEnd = useCallback((control: string) => {
    setTouchControls(prev => ({ ...prev, [control]: false }));
  }, []);

  // Collision detection
  const checkCollision = useCallback((obj1: GameObject, obj2: GameObject): boolean => {
    return obj1.x < obj2.x + obj2.width &&
           obj1.x + obj1.width > obj2.x &&
           obj1.y < obj2.y + obj2.height &&
           obj1.y + obj1.height > obj2.y;
  }, []);

  // Game logic
  const resetGame = useCallback(() => {
    setMario({
      x: 50,
      y: 200,
      onGround: true,
      jumping: false,
      climbing: false,
      direction: 1,
      hasHammer: false,
      hammerTimer: 0,
      animFrame: 0
    });
    setBarrels([]);
    setFireballs([]);
    setHammer({ x: 120, y: 160, width: 16, height: 16, active: true });
    setBonus(5000);
  }, []);

  const startGame = useCallback(() => {
    setGameState('playing');
    setScore(0);
    setLives(3);
    setLevel(1);
    resetGame();
  }, [resetGame]);

  const nextLevel = useCallback(() => {
    setLevel(prev => prev + 1);
    setScore(prev => prev + bonus);
    resetGame();
    setGameState('playing');
    playCompleteSound();
  }, [bonus, resetGame, playCompleteSound]);

  const loseLife = useCallback(() => {
    playDeathSound();
    setLives(prev => {
      const newLives = prev - 1;
      if (newLives <= 0) {
        setGameState('gameOver');
        if (score > highScore) {
          setHighScore(score);
          localStorage.setItem('atari-dk-highscore', score.toString());
        }
      } else {
        resetGame();
      }
      return newLives;
    });
  }, [score, highScore, resetGame, playDeathSound]);

  // Update Mario
  const updateMario = useCallback(() => {
    if (gameState !== 'playing') return;

    setMario(prev => {
      const newMario = { ...prev };
      const moveSpeed = 2;
      const jumpSpeed = 4;

      // Handle input
      const leftPressed = keys['ArrowLeft'] || keys['a'] || touchControls.left;
      const rightPressed = keys['ArrowRight'] || keys['d'] || touchControls.right;
      const upPressed = keys['ArrowUp'] || keys['w'] || touchControls.up;
      const downPressed = keys['ArrowDown'] || keys['s'] || touchControls.down;
      const jumpPressed = keys[' '] || keys['Enter'] || touchControls.jump;

      // Horizontal movement
      if (leftPressed && !newMario.climbing) {
        newMario.x = Math.max(0, newMario.x - moveSpeed);
        newMario.direction = -1;
        newMario.animFrame = (newMario.animFrame + 1) % 4;
      } else if (rightPressed && !newMario.climbing) {
        newMario.x = Math.min(304, newMario.x + moveSpeed);
        newMario.direction = 1;
        newMario.animFrame = (newMario.animFrame + 1) % 4;
      }

      // Ladder climbing
      const onLadder = ladders.some(ladder => 
        newMario.x + 8 >= ladder.x && newMario.x + 8 <= ladder.x + ladder.width &&
        newMario.y + 16 >= ladder.y && newMario.y <= ladder.y + ladder.height
      );

      if (onLadder) {
        if (upPressed) {
          newMario.y = Math.max(0, newMario.y - moveSpeed);
          newMario.climbing = true;
          newMario.onGround = false;
        } else if (downPressed) {
          newMario.y = Math.min(220, newMario.y + moveSpeed);
          newMario.climbing = true;
          newMario.onGround = false;
        } else {
          newMario.climbing = false;
        }
      } else {
        newMario.climbing = false;
      }

      // Jumping
      if (jumpPressed && newMario.onGround && !newMario.jumping && !newMario.climbing) {
        newMario.jumping = true;
        newMario.onGround = false;
        playJumpSound();
      }

      // Gravity and jumping physics
      if (!newMario.onGround && !newMario.climbing) {
        if (newMario.jumping) {
          newMario.y -= jumpSpeed;
          if (newMario.y <= prev.y - 32) {
            newMario.jumping = false;
          }
        } else {
          newMario.y += 3; // Gravity
        }
      }

      // Platform collision
      newMario.onGround = false;
      platforms.forEach(platform => {
        if (newMario.x + 16 > platform.x && newMario.x < platform.x + platform.width &&
            newMario.y + 16 >= platform.y && newMario.y + 16 <= platform.y + platform.height + 5) {
          newMario.y = platform.y - 16;
          newMario.onGround = true;
          newMario.jumping = false;
        }
      });

      // Hammer logic
      if (newMario.hasHammer) {
        newMario.hammerTimer--;
        if (newMario.hammerTimer <= 0) {
          newMario.hasHammer = false;
        }
      }

      // Check hammer pickup
      if (hammer && hammer.active && 
          Math.abs(newMario.x - hammer.x) < 20 && Math.abs(newMario.y - hammer.y) < 20) {
        newMario.hasHammer = true;
        newMario.hammerTimer = 300; // 5 seconds at 60fps
        setHammer(prev => prev ? { ...prev, active: false } : null);
        playHammerSound();
      }

      return newMario;
    });
  }, [gameState, keys, touchControls, ladders, platforms, hammer, playJumpSound, playHammerSound]);

  // Update barrels
  const updateBarrels = useCallback(() => {
    if (gameState !== 'playing') return;

    setBarrels(prev => {
      let newBarrels = [...prev];

      // Spawn new barrel
      if (Math.random() < 0.02 + level * 0.005) {
        newBarrels.push({
          x: 40,
          y: 44,
          width: 16,
          height: 16,
          active: true,
          direction: 1,
          speed: 1 + level * 0.2,
          onLadder: false
        });
      }

      // Update existing barrels
      newBarrels = newBarrels.map(barrel => {
        if (!barrel.active) return barrel;

        const newBarrel = { ...barrel };

        // Move barrel
        newBarrel.x += newBarrel.direction * newBarrel.speed;

        // Platform boundaries
        const currentPlatform = platforms.find(platform => 
          newBarrel.y + newBarrel.height >= platform.y && 
          newBarrel.y + newBarrel.height <= platform.y + platform.height + 5
        );

        if (currentPlatform) {
          if (newBarrel.x <= currentPlatform.x) {
            newBarrel.x = currentPlatform.x;
            newBarrel.direction = 1;
          } else if (newBarrel.x + newBarrel.width >= currentPlatform.x + currentPlatform.width) {
            newBarrel.x = currentPlatform.x + currentPlatform.width - newBarrel.width;
            newBarrel.direction = -1;
          }
        }

        // Check ladder descent
        if (!newBarrel.onLadder && Math.random() < 0.1) {
          const nearLadder = ladders.find(ladder => 
            Math.abs(newBarrel.x - ladder.x) < 20 && 
            newBarrel.y + newBarrel.height >= ladder.y
          );
          if (nearLadder) {
            newBarrel.onLadder = true;
            newBarrel.x = nearLadder.x;
          }
        }

        // Ladder movement
        if (newBarrel.onLadder) {
          newBarrel.y += newBarrel.speed;
          const ladder = ladders.find(l => Math.abs(newBarrel.x - l.x) < 10);
          if (ladder && newBarrel.y >= ladder.y + ladder.height) {
            newBarrel.onLadder = false;
          }
        }

        // Remove if off screen
        if (newBarrel.y > 240) {
          newBarrel.active = false;
        }

        return newBarrel;
      }).filter(barrel => barrel.active);

      return newBarrels;
    });
  }, [gameState, level, platforms, ladders]);

  // Update fireballs
  const updateFireballs = useCallback(() => {
    if (gameState !== 'playing') return;

    setFireballs(prev => {
      let newFireballs = [...prev];

      // Spawn fireball
      if (Math.random() < 0.01 + level * 0.002) {
        newFireballs.push({
          x: 160,
          y: 200,
          width: 12,
          height: 12,
          active: true,
          direction: Math.random() > 0.5 ? 1 : -1,
          speed: 0.5 + level * 0.1,
          climbing: false
        });
      }

      // Update fireballs
      newFireballs = newFireballs.map(fireball => {
        if (!fireball.active) return fireball;

        const newFireball = { ...fireball };

        if (!newFireball.climbing) {
          newFireball.x += newFireball.direction * newFireball.speed;

          // Platform boundaries
          if (newFireball.x <= 0 || newFireball.x >= 304) {
            newFireball.direction *= -1;
          }

          // Random ladder climbing
          if (Math.random() < 0.05) {
            const nearLadder = ladders.find(ladder => 
              Math.abs(newFireball.x - ladder.x) < 20
            );
            if (nearLadder) {
              newFireball.climbing = true;
              newFireball.x = nearLadder.x;
            }
          }
        } else {
          newFireball.y += (Math.random() > 0.5 ? 1 : -1) * newFireball.speed;
          if (Math.random() < 0.1) {
            newFireball.climbing = false;
          }
        }

        return newFireball;
      }).filter(fireball => fireball.active);

      return newFireballs;
    });
  }, [gameState, level, ladders]);

  // Check collisions
  const checkCollisions = useCallback(() => {
    if (gameState !== 'playing') return;

    const marioRect = { x: mario.x, y: mario.y, width: 16, height: 16 };

    // Check barrel collisions
    barrels.forEach(barrel => {
      if (barrel.active && checkCollision(marioRect, barrel)) {
        if (mario.hasHammer) {
          // Destroy barrel with hammer
          setScore(prev => prev + 300);
          setBarrels(prev => prev.map(b => b === barrel ? { ...b, active: false } : b));
          playHammerSound();
        } else {
          // Mario dies
          loseLife();
        }
      }
    });

    // Check fireball collisions
    fireballs.forEach(fireball => {
      if (fireball.active && checkCollision(marioRect, fireball)) {
        if (mario.hasHammer) {
          // Destroy fireball with hammer
          setScore(prev => prev + 500);
          setFireballs(prev => prev.map(f => f === fireball ? { ...f, active: false } : f));
          playHammerSound();
        } else {
          // Mario dies
          loseLife();
        }
      }
    });

    // Check win condition (reach Pauline)
    if (mario.x > 280 && mario.y < 80) {
      setGameState('levelComplete');
      setTimeout(nextLevel, 2000);
    }
  }, [gameState, mario, barrels, fireballs, checkCollision, loseLife, nextLevel, playHammerSound]);

  // Main game loop
  useEffect(() => {
    if (gameState === 'playing') {
      const gameLoop = () => {
        updateMario();
        updateBarrels();
        updateFireballs();
        checkCollisions();
        
        // Decrease bonus
        setBonus(prev => Math.max(0, prev - 1));

        gameLoopRef.current = requestAnimationFrame(gameLoop);
      };
      
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [gameState, updateMario, updateBarrels, updateFireballs, checkCollisions]);

  // Render function
  const renderGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 320, 240);

    if (gameState === 'title') {
      // Title screen
      ctx.fillStyle = '#FF6B47';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DONKEY KONG', 160, 60);
      
      ctx.fillStyle = '#FFFF00';
      ctx.font = '12px monospace';
      ctx.fillText('ATARI 2600', 160, 80);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '10px monospace';
      ctx.fillText('PRESS SPACE TO START', 160, 120);
      ctx.fillText(`HIGH SCORE: ${highScore}`, 160, 140);
      
      // Simple Donkey Kong sprite
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(140, 160, 40, 30);
      ctx.fillStyle = '#000000';
      ctx.fillRect(145, 165, 6, 6);
      ctx.fillRect(169, 165, 6, 6);
      
      return;
    }

    if (gameState === 'gameOver') {
      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', 160, 100);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '12px monospace';
      ctx.fillText(`FINAL SCORE: ${score}`, 160, 120);
      ctx.fillText(`HIGH SCORE: ${highScore}`, 160, 140);
      ctx.fillText('PRESS SPACE TO RESTART', 160, 160);
      
      return;
    }

    // Draw platforms
    ctx.fillStyle = '#FF6B47';
    platforms.forEach(platform => {
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height);
    });

    // Draw ladders
    ctx.fillStyle = '#FFFF00';
    ladders.forEach(ladder => {
      for (let y = ladder.y; y < ladder.y + ladder.height; y += 4) {
        ctx.fillRect(ladder.x, y, 4, 2);
        ctx.fillRect(ladder.x + 12, y, 4, 2);
        ctx.fillRect(ladder.x + 4, y + 2, 8, 2);
      }
    });

    // Draw Donkey Kong
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(40, 20, 60, 40);
    ctx.fillStyle = '#000000';
    ctx.fillRect(50, 30, 8, 8);
    ctx.fillRect(82, 30, 8, 8);

    // Draw Pauline
    ctx.fillStyle = '#FF69B4';
    ctx.fillRect(280, 40, 16, 20);
    ctx.fillStyle = '#FFFF00';
    ctx.fillRect(280, 40, 16, 8);

    // Draw hammer
    if (hammer && hammer.active) {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(hammer.x, hammer.y, hammer.width, hammer.height);
    }

    // Draw barrels
    ctx.fillStyle = '#8B4513';
    barrels.forEach(barrel => {
      if (barrel.active) {
        ctx.fillRect(barrel.x, barrel.y, barrel.width, barrel.height);
        ctx.fillStyle = '#654321';
        ctx.fillRect(barrel.x + 2, barrel.y + 2, barrel.width - 4, barrel.height - 4);
        ctx.fillStyle = '#8B4513';
      }
    });

    // Draw fireballs
    ctx.fillStyle = '#FF4500';
    fireballs.forEach(fireball => {
      if (fireball.active) {
        ctx.fillRect(fireball.x, fireball.y, fireball.width, fireball.height);
        ctx.fillStyle = '#FFFF00';
        ctx.fillRect(fireball.x + 2, fireball.y + 2, fireball.width - 4, fireball.height - 4);
        ctx.fillStyle = '#FF4500';
      }
    });

    // Draw Mario
    ctx.fillStyle = mario.hasHammer ? '#FFFF00' : '#FF0000';
    ctx.fillRect(mario.x, mario.y, 16, 16);
    ctx.fillStyle = '#0000FF';
    ctx.fillRect(mario.x, mario.y + 8, 16, 8);
    
    // Mario's hammer
    if (mario.hasHammer) {
      ctx.fillStyle = '#8B4513';
      const hammerX = mario.x + (mario.direction > 0 ? 16 : -8);
      ctx.fillRect(hammerX, mario.y - 4, 8, 12);
    }

    // Draw UI
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${score}`, 10, 15);
    ctx.fillText(`LIVES: ${lives}`, 120, 15);
    ctx.fillText(`LEVEL: ${level}`, 200, 15);
    ctx.fillText(`BONUS: ${bonus}`, 250, 15);

    if (gameState === 'levelComplete') {
      ctx.fillStyle = '#00FF00';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LEVEL COMPLETE!', 160, 120);
    }
  }, [mario, barrels, fireballs, hammer, gameState, score, lives, level, bonus, highScore, platforms, ladders]);

  // Render loop
  useEffect(() => {
    const render = () => {
      renderGame();
      requestAnimationFrame(render);
    };
    render();
  }, [mario, barrels, fireballs, hammer, gameState, score, lives, level, bonus, highScore, renderGame]);

  // Handle start/restart
  useEffect(() => {
    if ((gameState === 'title' || gameState === 'gameOver') && 
        (keys[' '] || keys['Enter'] || touchControls.jump)) {
      startGame();
    }
  }, [gameState, keys, touchControls, startGame]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black p-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={320}
          height={240}
          className="border-2 border-gray-600 bg-black"
          style={{ 
            imageRendering: 'pixelated',
            width: '640px',
            height: '480px',
            maxWidth: '100vw',
            maxHeight: '60vh'
          }}
        />
        
        {/* Mobile touch controls */}
        <div className="md:hidden mt-4 flex flex-col items-center space-y-4">
          {/* D-pad */}
          <div className="relative w-32 h-32">
            <button
              className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-gray-700 text-white font-bold rounded"
              onTouchStart={() => handleTouchStart('up')}
              onTouchEnd={() => handleTouchEnd('up')}
              onMouseDown={() => handleTouchStart('up')}
              onMouseUp={() => handleTouchEnd('up')}
            >
              ↑
            </button>
            <button
              className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-10 h-10 bg-gray-700 text-white font-bold rounded"
              onTouchStart={() => handleTouchStart('down')}
              onTouchEnd={() => handleTouchEnd('down')}
              onMouseDown={() => handleTouchStart('down')}
              onMouseUp={() => handleTouchEnd('down')}
            >
              ↓
            </button>
            <button
              className="absolute left-0 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-gray-700 text-white font-bold rounded"
              onTouchStart={() => handleTouchStart('left')}
              onTouchEnd={() => handleTouchEnd('left')}
              onMouseDown={() => handleTouchStart('left')}
              onMouseUp={() => handleTouchEnd('left')}
            >
              ←
            </button>
            <button
              className="absolute right-0 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-gray-700 text-white font-bold rounded"
              onTouchStart={() => handleTouchStart('right')}
              onTouchEnd={() => handleTouchEnd('right')}
              onMouseDown={() => handleTouchStart('right')}
              onMouseUp={() => handleTouchEnd('right')}
            >
              →
            </button>
          </div>
          
          {/* Jump button */}
          <button
            className="w-20 h-20 bg-red-600 text-white font-bold rounded-full text-lg"
            onTouchStart={() => handleTouchStart('jump')}
            onTouchEnd={() => handleTouchEnd('jump')}
            onMouseDown={() => handleTouchStart('jump')}
            onMouseUp={() => handleTouchEnd('jump')}
          >
            JUMP
          </button>
        </div>

        {/* Desktop instructions */}
        <div className="hidden md:block mt-4 text-center text-white text-sm">
          <p>Arrow Keys or WASD to move • Spacebar to jump • Climb ladders to reach Pauline!</p>
        </div>
      </div>
    </div>
  );
};

export default DonkeyKongAtari;