import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';

// Game constants
const MAZE_SIZE = 21;
const CELL_SIZE = 1;
const PACMAN_SPEED = 0.05;
const GHOST_SPEED = 0.03;

// Game types
interface Position {
  x: number;
  z: number;
}

interface GameState {
  score: number;
  lives: number;
  gameStatus: 'start' | 'playing' | 'gameOver' | 'paused';
  powerMode: boolean;
  powerModeTimer: number;
}

// Maze layout (1 = wall, 0 = empty, 2 = dot, 3 = power pellet)
const MAZE_LAYOUT = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,1,3,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,1,2,1],
  [1,2,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,2,1],
  [1,1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1,1],
  [0,0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0,0],
  [1,1,1,1,1,2,1,0,1,1,0,1,1,0,1,2,1,1,1,1,1],
  [0,0,0,0,0,2,0,0,1,0,0,0,1,0,0,2,0,0,0,0,0],
  [1,1,1,1,1,2,1,0,1,0,0,0,1,0,1,2,1,1,1,1,1],
  [0,0,0,0,0,2,0,0,1,1,1,1,1,0,0,2,0,0,0,0,0],
  [1,1,1,1,1,2,1,0,1,1,1,1,1,0,1,2,1,1,1,1,1],
  [0,0,0,0,1,2,1,0,0,0,0,0,0,0,1,2,1,0,0,0,0],
  [1,1,1,1,1,2,1,1,1,0,1,0,1,1,1,2,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,1,2,1],
  [1,3,2,2,1,2,2,2,2,2,2,2,2,2,2,2,1,2,2,3,1],
  [1,1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1,1],
  [1,2,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

// Pac-Man component
function PacMan({ position, rotation }: { position: Position; rotation: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = rotation;
      // Add subtle bobbing animation
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 8) * 0.05 + 0.5;
    }
  });

  return (
    <mesh ref={meshRef} position={[position.x, 0.5, position.z]}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.3} />
    </mesh>
  );
}

// Ghost component
function Ghost({ position, color, scared }: { position: Position; color: string; scared: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Add floating animation
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 4 + position.x) * 0.1 + 0.5;
    }
  });

  const ghostColor = scared ? "#0066FF" : color;
  
  return (
    <group position={[position.x, 0.5, position.z]}>
      <mesh ref={meshRef}>
        <cylinderGeometry args={[0.25, 0.25, 0.5, 8]} />
        <meshStandardMaterial 
          color={ghostColor} 
          emissive={ghostColor} 
          emissiveIntensity={scared ? 0.2 : 0.1} 
        />
      </mesh>
      {/* Ghost eyes */}
      <mesh position={[-0.1, 0.1, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
      <mesh position={[0.1, 0.1, 0.2]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="white" />
      </mesh>
    </group>
  );
}

// Dot component
function Dot({ position }: { position: Position }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });

  return (
    <mesh ref={meshRef} position={[position.x, 0.2, position.z]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.5} />
    </mesh>
  );
}

// Power Pellet component
function PowerPellet({ position }: { position: Position }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.elapsedTime * 3;
      meshRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 4) * 0.2);
    }
  });

  return (
    <mesh ref={meshRef} position={[position.x, 0.3, position.z]}>
      <sphereGeometry args={[0.15, 12, 12]} />
      <meshStandardMaterial color="#FF6B6B" emissive="#FF6B6B" emissiveIntensity={0.8} />
    </mesh>
  );
}

// Wall component
function Wall({ position }: { position: Position }) {
  return (
    <mesh position={[position.x, 0.5, position.z]}>
      <boxGeometry args={[CELL_SIZE, 1, CELL_SIZE]} />
      <meshStandardMaterial color="#0066FF" emissive="#0066FF" emissiveIntensity={0.1} />
    </mesh>
  );
}

// Game Scene component
function GameScene({ gameState, onGameStateChange }: { 
  gameState: GameState; 
  onGameStateChange: (newState: Partial<GameState>) => void;
}) {
  const [pacmanPos, setPacmanPos] = useState<Position>({ x: 10, z: 15 });
  const [pacmanRotation, setPacmanRotation] = useState(0);
  const [ghosts, setGhosts] = useState([
    { pos: { x: 10, z: 9 }, color: "#FF0000", direction: { x: 1, z: 0 } },
    { pos: { x: 9, z: 9 }, color: "#FFB6C1", direction: { x: -1, z: 0 } },
    { pos: { x: 11, z: 9 }, color: "#00FFFF", direction: { x: 0, z: 1 } },
    { pos: { x: 10, z: 10 }, color: "#FFA500", direction: { x: 0, z: -1 } }
  ]);
  const [maze, setMaze] = useState(MAZE_LAYOUT.map(row => [...row]));
  const [keys, setKeys] = useState<Set<string>>(new Set());

  // Camera controls
  const { camera } = useThree();
  
  useEffect(() => {
    camera.position.set(pacmanPos.x, 15, pacmanPos.z + 8);
    camera.lookAt(pacmanPos.x, 0, pacmanPos.z);
  }, [pacmanPos, camera]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setKeys(prev => new Set(prev).add(event.key.toLowerCase()));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      setKeys(prev => {
        const newKeys = new Set(prev);
        newKeys.delete(event.key.toLowerCase());
        return newKeys;
      });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Game logic
  useFrame(() => {
    if (gameState.gameStatus !== 'playing') return;

    // Move Pac-Man
    const newPos = { ...pacmanPos };
    let newRotation = pacmanRotation;

    let moved = false;
    if (keys.has('w') || keys.has('arrowup')) {
      const testZ = newPos.z - PACMAN_SPEED;
      const gridZ = Math.round(testZ);
      const gridX = Math.round(newPos.x);
      if (gridX >= 0 && gridX < MAZE_SIZE && gridZ >= 0 && gridZ < MAZE_SIZE && maze[gridZ][gridX] !== 1) {
        newPos.z = testZ;
        newRotation = Math.PI;
        moved = true;
      }
    }
    if (keys.has('s') || keys.has('arrowdown')) {
      const testZ = newPos.z + PACMAN_SPEED;
      const gridZ = Math.round(testZ);
      const gridX = Math.round(newPos.x);
      if (gridX >= 0 && gridX < MAZE_SIZE && gridZ >= 0 && gridZ < MAZE_SIZE && maze[gridZ][gridX] !== 1) {
        newPos.z = testZ;
        newRotation = 0;
        moved = true;
      }
    }
    if (keys.has('a') || keys.has('arrowleft')) {
      const testX = newPos.x - PACMAN_SPEED;
      const gridX = Math.round(testX);
      const gridZ = Math.round(newPos.z);
      if (gridX >= 0 && gridX < MAZE_SIZE && gridZ >= 0 && gridZ < MAZE_SIZE && maze[gridZ][gridX] !== 1) {
        newPos.x = testX;
        newRotation = Math.PI / 2;
        moved = true;
      }
    }
    if (keys.has('d') || keys.has('arrowright')) {
      const testX = newPos.x + PACMAN_SPEED;
      const gridX = Math.round(testX);
      const gridZ = Math.round(newPos.z);
      if (gridX >= 0 && gridX < MAZE_SIZE && gridZ >= 0 && gridZ < MAZE_SIZE && maze[gridZ][gridX] !== 1) {
        newPos.x = testX;
        newRotation = -Math.PI / 2;
        moved = true;
      }
    }

    // Update position and check for collectibles
    if (moved) {
      setPacmanPos(newPos);
      setPacmanRotation(newRotation);

      const gridX = Math.round(newPos.x);
      const gridZ = Math.round(newPos.z);

      // Check dot collection
      if (maze[gridZ][gridX] === 2) {
        setMaze(prev => {
          const newMaze = prev.map(row => [...row]);
          newMaze[gridZ][gridX] = 0;
          return newMaze;
        });
        onGameStateChange({ score: gameState.score + 10 });
      }

      // Check power pellet collection
      if (maze[gridZ][gridX] === 3) {
        setMaze(prev => {
          const newMaze = prev.map(row => [...row]);
          newMaze[gridZ][gridX] = 0;
          return newMaze;
        });
        onGameStateChange({ 
          score: gameState.score + 50,
          powerMode: true,
          powerModeTimer: 10
        });
      }
    }

    // Move ghosts
    setGhosts(prevGhosts => 
      prevGhosts.map(ghost => {
        const newGhostPos = {
          x: ghost.pos.x + ghost.direction.x * GHOST_SPEED,
          z: ghost.pos.z + ghost.direction.z * GHOST_SPEED
        };

        const ghostGridX = Math.round(newGhostPos.x);
        const ghostGridZ = Math.round(newGhostPos.z);

        // Change direction if hitting wall or randomly
        if (ghostGridX < 0 || ghostGridX >= MAZE_SIZE || 
            ghostGridZ < 0 || ghostGridZ >= MAZE_SIZE ||
            maze[ghostGridZ][ghostGridX] === 1 ||
            Math.random() < 0.01) {
          
          const directions = [
            { x: 1, z: 0 }, { x: -1, z: 0 }, 
            { x: 0, z: 1 }, { x: 0, z: -1 }
          ];
          const newDirection = directions[Math.floor(Math.random() * directions.length)];
          
          return { ...ghost, direction: newDirection };
        }

        return { ...ghost, pos: newGhostPos };
      })
    );

    // Check ghost collision
    ghosts.forEach(ghost => {
      const distance = Math.sqrt(
        Math.pow(pacmanPos.x - ghost.pos.x, 2) + 
        Math.pow(pacmanPos.z - ghost.pos.z, 2)
      );
      
      if (distance < 0.5) {
        if (gameState.powerMode) {
          onGameStateChange({ score: gameState.score + 200 });
        } else {
          onGameStateChange({ 
            lives: gameState.lives - 1,
            gameStatus: gameState.lives <= 1 ? 'gameOver' : 'playing'
          });
          // Reset positions
          setPacmanPos({ x: 10, z: 15 });
        }
      }
    });
  });

  // Power mode timer
  useEffect(() => {
    if (gameState.powerMode && gameState.powerModeTimer > 0) {
      const timer = setTimeout(() => {
        onGameStateChange({ 
          powerModeTimer: gameState.powerModeTimer - 1 
        });
      }, 1000);

      if (gameState.powerModeTimer === 1) {
        onGameStateChange({ powerMode: false });
      }

      return () => clearTimeout(timer);
    }
  }, [gameState.powerMode, gameState.powerModeTimer, onGameStateChange]);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 10, 10]} intensity={1} color="#FFD700" />
      <pointLight position={[0, 10, 0]} intensity={0.5} color="#FF6B6B" />
      <pointLight position={[20, 10, 20]} intensity={0.5} color="#00FFFF" />

      {/* Maze */}
      {maze.map((row, z) =>
        row.map((cell, x) => {
          const position = { x, z };
          
          if (cell === 1) return <Wall key={`${x}-${z}`} position={position} />;
          if (cell === 2) return <Dot key={`${x}-${z}`} position={position} />;
          if (cell === 3) return <PowerPellet key={`${x}-${z}`} position={position} />;
          return null;
        })
      )}

      {/* Pac-Man */}
      <PacMan position={pacmanPos} rotation={pacmanRotation} />

      {/* Ghosts */}
      {ghosts.map((ghost, index) => (
        <Ghost 
          key={index} 
          position={ghost.pos} 
          color={ghost.color}
          scared={gameState.powerMode}
        />
      ))}

      {/* Floor */}
      <mesh position={[10, -0.1, 10]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[MAZE_SIZE, MAZE_SIZE]} />
        <meshStandardMaterial color="#000000" />
      </mesh>
    </>
  );
}

// Main Game Component
export default function Game3D() {
  const [gameState, setGameState] = useState<GameState>({
    score: 0,
    lives: 3,
    gameStatus: 'start',
    powerMode: false,
    powerModeTimer: 0
  });

  const handleGameStateChange = useCallback((newState: Partial<GameState>) => {
    setGameState(prev => ({ ...prev, ...newState }));
  }, []);

  const startGame = () => {
    setGameState({
      score: 0,
      lives: 3,
      gameStatus: 'playing',
      powerMode: false,
      powerModeTimer: 0
    });
  };

  const restartGame = () => {
    setGameState({
      score: 0,
      lives: 3,
      gameStatus: 'start',
      powerMode: false,
      powerModeTimer: 0
    });
  };

  return (
    <div className="w-full h-screen relative bg-black">
      {/* Game UI */}
      <div className="game-ui">
        {/* Score and Lives */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-center">
          <div className="score-display px-4 py-2 rounded-lg">
            <div className="text-primary text-xl font-bold neon-glow">
              SCORE: {gameState.score.toLocaleString()}
            </div>
          </div>
          <div className="score-display px-4 py-2 rounded-lg">
            <div className="text-accent text-xl font-bold neon-glow">
              LIVES: {gameState.lives}
            </div>
          </div>
        </div>

        {/* Power Mode Indicator */}
        {gameState.powerMode && (
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2">
            <div className="score-display px-6 py-3 rounded-lg">
              <div className="text-accent text-2xl font-bold pulse-glow">
                POWER MODE: {gameState.powerModeTimer}s
              </div>
            </div>
          </div>
        )}

        {/* Start Screen */}
        {gameState.gameStatus === 'start' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-primary neon-glow mb-8">
                3D PAC-MAN
              </h1>
              <p className="text-xl text-white mb-8">
                Use WASD or Arrow Keys to move
              </p>
              <button 
                onClick={startGame}
                className="game-button px-8 py-4 rounded-lg text-xl"
              >
                START GAME
              </button>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {gameState.gameStatus === 'gameOver' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80">
            <div className="text-center">
              <h1 className="text-6xl font-bold text-accent neon-glow mb-4">
                GAME OVER
              </h1>
              <p className="text-3xl text-primary mb-8">
                Final Score: {gameState.score.toLocaleString()}
              </p>
              <button 
                onClick={restartGame}
                className="game-button px-8 py-4 rounded-lg text-xl"
              >
                PLAY AGAIN
              </button>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
          <div className="score-display px-4 py-2 rounded-lg text-center">
            <div className="text-white text-sm">
              WASD or Arrow Keys to Move
            </div>
          </div>
        </div>
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [10, 15, 18], fov: 60 }}>
        <GameScene gameState={gameState} onGameStateChange={handleGameStateChange} />
      </Canvas>
    </div>
  );
}