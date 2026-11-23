"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Flag, Gauge, Trophy, X } from "lucide-react";
import { useI18n } from "@/components/LocaleProvider";
import { DialogBackdrop } from "@/components/ui/DialogBackdrop";

type LeaderboardRow = {
  employeeId: number;
  firstName: string;
  lastName: string;
  score: number;
};

type Obstacle = { x: number; width: number; height: number };

const WIDTH = 720;
const HEIGHT = 320;
const ROAD_Y = 265;
const CAR_X = 76;
const CAR_WIDTH = 104;
const CAR_HEIGHT = 40;
const CAR_SPRITE = "/lanos-game-sprite-final.png";

export function IncoraRoadGame({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const carImageRef = useRef<HTMLImageElement | null>(null);
  const gameRef = useRef({
    carY: 0,
    velocity: 0,
    obstacles: [] as Obstacle[],
    distance: 0,
    speed: 6,
    spawnIn: 1100,
    lastFrame: 0,
    playing: false,
  });
  const [phase, setPhase] = useState<
    "intro" | "countdown" | "playing" | "over"
  >("intro");
  const [countdown, setCountdown] = useState(3);
  const [score, setScore] = useState(0);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);

  const loadLeaderboard = useCallback(() => {
    fetch("/api/game-scores")
      .then(async (response) => {
        const data = (await response.json()) as {
          leaderboard?: LeaderboardRow[];
        };
        setLeaderboard(data.leaderboard ?? []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [loadLeaderboard]);

  useEffect(() => {
    const image = new window.Image();
    image.src = CAR_SPRITE;
    image.onload = () => {
      carImageRef.current = image;
    };
    return () => {
      image.onload = null;
    };
  }, []);

  const startGame = useCallback(() => {
    gameRef.current = {
      carY: 0,
      velocity: 0,
      obstacles: [],
      distance: 0,
      speed: 6,
      spawnIn: 1000,
      lastFrame: 0,
      playing: true,
    };
    setScore(0);
    setPhase("playing");
  }, []);

  useEffect(() => {
    if (phase !== "countdown") return;
    const interval = window.setInterval(() => {
      setCountdown((value) => {
        if (value <= 1) {
          window.clearInterval(interval);
          startGame();
          return 0;
        }
        return value - 1;
      });
    }, 700);
    return () => window.clearInterval(interval);
  }, [phase, startGame]);

  const jump = useCallback(() => {
    const game = gameRef.current;
    if (!game.playing || game.carY < -1) return;
    game.velocity = -14.5;
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let displayedScore = 0;

    function finish(finalScore: number) {
      gameRef.current.playing = false;
      setScore(finalScore);
      setPhase("over");
      fetch("/api/game-scores", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score: finalScore }),
      })
        .then(async (response) => {
          const data = (await response.json()) as {
            leaderboard?: LeaderboardRow[];
          };
          if (data.leaderboard) setLeaderboard(data.leaderboard);
        })
        .catch(() => undefined);
    }

    function animate(timestamp: number) {
      const game = gameRef.current;
      if (!game.playing || !context) return;
      const delta = Math.min(32, timestamp - (game.lastFrame || timestamp));
      game.lastFrame = timestamp;
      const factor = delta / 16.67;

      game.velocity += 0.68 * factor;
      game.carY = Math.min(0, game.carY + game.velocity * factor);
      if (game.carY === 0) game.velocity = 0;
      game.distance += game.speed * factor;
      game.speed = Math.min(13, 6 + game.distance / 2600);
      game.spawnIn -= delta;
      if (game.spawnIn <= 0) {
        game.obstacles.push({ x: WIDTH + 30, width: 34, height: 76 });
        game.spawnIn = Math.max(
          720,
          1450 - game.speed * 55 + Math.random() * 520,
        );
      }
      game.obstacles.forEach((obstacle) => {
        obstacle.x -= game.speed * factor;
      });
      game.obstacles = game.obstacles.filter((obstacle) => obstacle.x > -60);

      const carTop = ROAD_Y - CAR_HEIGHT + game.carY;
      const collision = game.obstacles.some((obstacle) => {
        const obstacleTop = ROAD_Y - obstacle.height;
        return (
          CAR_X + CAR_WIDTH - 12 > obstacle.x &&
          CAR_X + 10 < obstacle.x + obstacle.width &&
          carTop + CAR_HEIGHT - 5 > obstacleTop
        );
      });

      drawScene(context, game, carImageRef.current);
      const nextScore = Math.floor(game.distance / 10);
      if (nextScore >= displayedScore + 5) {
        displayedScore = nextScore;
        setScore(nextScore);
      }
      if (collision) {
        finish(nextScore);
        return;
      }
      frame = window.requestAnimationFrame(animate);
    }

    function keydown(event: KeyboardEvent) {
      if (event.code === "Space" || event.code === "ArrowUp") {
        event.preventDefault();
        jump();
      }
    }
    window.addEventListener("keydown", keydown);
    frame = window.requestAnimationFrame(animate);
    return () => {
      gameRef.current.playing = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", keydown);
    };
  }, [jump, phase]);

  return (
    <DialogBackdrop
      className="game-backdrop"
      onClose={onClose}
      confirmWhenDirty={false}
    >
      <section className={`road-game phase-${phase}`}>
        <button
          type="button"
          className="icon-button game-close"
          onClick={onClose}
          aria-label={t("Close")}
        >
          <X size={18} />
        </button>

        {phase === "intro" && (
          <div className="game-intro">
            <div className="game-logo-burst">
              <Image
                src="/incora-logo.png"
                alt="INCORA"
                width={162}
                height={48}
                priority
                unoptimized
              />
              <i />
            </div>
            <div className="game-mission-copy">
              <span className="game-mission-label">
                <Flag size={15} />
                {t("Your mission")}
              </span>
              <strong>{t("Make it to the INCORA team sync")}</strong>
              <p>
                {t(
                  "You are driving a red Lanos to the INCORA team sync. Get there on time and jump over every speed camera along the way.",
                )}
              </p>
            </div>
            <div className="game-intro-car" aria-hidden="true">
              <Image
                src={CAR_SPRITE}
                alt=""
                width={316}
                height={121}
                priority
                unoptimized
              />
            </div>
            <div className="game-rules">
              <span>
                <ArrowUp size={17} />
                {t("Space, Arrow Up or tap — jump")}
              </span>
              <span>
                <Gauge size={17} />
                {t("The road gets faster as you go")}
              </span>
            </div>
            <button
              type="button"
              className="game-start-button"
              onClick={() => {
                setCountdown(3);
                setPhase("countdown");
              }}
            >
              {t("Start the trip")}
            </button>
          </div>
        )}

        {phase === "countdown" && (
          <div className="game-countdown">
            <span>{countdown || t("Go!")}</span>
            <small>{t("Space or tap to jump")}</small>
          </div>
        )}

        {(phase === "playing" || phase === "over") && (
          <>
            <div className="game-header">
              <div>
                <Gauge size={17} />
                <span>{t("Lanos is racing to the team sync")}</span>
              </div>
              <strong>
                {t("Score")}: {score}
              </strong>
            </div>
            <div className="game-stage" onPointerDown={jump}>
              <canvas
                ref={canvasRef}
                width={WIDTH}
                height={HEIGHT}
                aria-label={t("Jump over cameras and make it to the team sync")}
              />
              {phase === "over" && (
                <div className="game-over-card">
                  <Flag size={24} />
                  <h2>{t("Camera caught you!")}</h2>
                  <p>
                    {t("Your score")}: <strong>{score}</strong>
                  </p>
                  <button
                    className="button primary-button"
                    onClick={() => {
                      setCountdown(3);
                      setPhase("countdown");
                    }}
                  >
                    {t("Try again")}
                  </button>
                </div>
              )}
            </div>
            <button className="game-jump-button" onPointerDown={jump}>
              {t("Jump")}
            </button>
            <div className="game-leaderboard">
              <div className="game-leaderboard-title">
                <Trophy size={16} />
                <strong>{t("INCORA records")}</strong>
              </div>
              <ol>
                {leaderboard.slice(0, 5).map((row) => (
                  <li key={row.employeeId}>
                    <span>
                      {row.firstName} {row.lastName}
                    </span>
                    <strong>{row.score}</strong>
                  </li>
                ))}
                {leaderboard.length === 0 && (
                  <li className="empty">{t("No records yet. Be first!")}</li>
                )}
              </ol>
            </div>
          </>
        )}
      </section>
    </DialogBackdrop>
  );
}

function drawScene(
  context: CanvasRenderingContext2D,
  game: {
    carY: number;
    obstacles: Obstacle[];
    distance: number;
    speed: number;
  },
  carImage: HTMLImageElement | null,
) {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  const sky = context.createLinearGradient(0, 0, 0, HEIGHT);
  sky.addColorStop(0, "#fffaf0");
  sky.addColorStop(0.56, "#ffe89a");
  sky.addColorStop(1, "#ffc400");
  context.fillStyle = sky;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = "#f0bb00";
  context.beginPath();
  context.moveTo(0, 190);
  for (let x = 0; x <= WIDTH; x += 40) {
    context.lineTo(x, 178 + Math.sin((x + game.distance * 0.15) / 65) * 12);
  }
  context.lineTo(WIDTH, ROAD_Y);
  context.lineTo(0, ROAD_Y);
  context.fill();

  context.fillStyle = "#262626";
  context.fillRect(0, ROAD_Y, WIDTH, HEIGHT - ROAD_Y);
  context.fillStyle = "#ffc400";
  for (let x = -80 - (game.distance % 110); x < WIDTH; x += 110) {
    context.fillRect(x, ROAD_Y + 25, 58, 5);
  }

  game.obstacles.forEach((obstacle) =>
    drawCamera(context, obstacle.x, ROAD_Y - obstacle.height),
  );
  drawCar(context, CAR_X, ROAD_Y - CAR_HEIGHT + game.carY, carImage);
}

function drawCar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  image: HTMLImageElement | null,
) {
  if (image?.complete && image.naturalWidth > 0) {
    context.drawImage(image, x, y, CAR_WIDTH, CAR_HEIGHT);
    return;
  }

  context.save();
  context.translate(x, y);
  context.fillStyle = "#b80f2e";
  context.strokeStyle = "#68101f";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(2, 14, CAR_WIDTH - 4, 28, 8);
  context.fill();
  context.stroke();
  context.beginPath();
  context.moveTo(26, 15);
  context.quadraticCurveTo(44, -2, 78, 4);
  context.lineTo(100, 15);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = "#bde7f4";
  context.beginPath();
  context.moveTo(27, 13);
  context.lineTo(37, 3);
  context.lineTo(52, 5);
  context.lineTo(62, 13);
  context.closePath();
  context.fill();
  context.fillStyle = "#f7d45d";
  context.fillRect(CAR_WIDTH - 8, 20, 7, 6);
  context.fillStyle = "#171717";
  [28, 98].forEach((wheelX) => {
    context.beginPath();
    context.arc(wheelX, 39, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#d8d8d8";
    context.beginPath();
    context.arc(wheelX, 39, 4, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#171717";
  });
  context.restore();
}

function drawCamera(context: CanvasRenderingContext2D, x: number, y: number) {
  context.save();
  context.translate(x, y);
  context.fillStyle = "#343434";
  context.fillRect(14, 24, 6, 52);
  context.fillStyle = "#f4f4ef";
  context.strokeStyle = "#202020";
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(2, 2, 32, 28, 5);
  context.fill();
  context.stroke();
  context.fillStyle = "#1f1f1f";
  context.beginPath();
  context.arc(18, 16, 8, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f74b4b";
  context.beginPath();
  context.arc(18, 16, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
