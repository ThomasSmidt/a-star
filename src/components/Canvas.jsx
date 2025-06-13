import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  FaPaintBrush,
  FaEraser,
  FaPlay,
  FaStop,
  FaFlagCheckered,
  FaRandom,
} from "react-icons/fa";
import { FaLocationDot } from "react-icons/fa6";
import { IoIosCloseCircle } from "react-icons/io";

import "./Canvas.css";

const Canvas = () => {
  // We no longer need initial dimensions here, as they'll be read from the DOM
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [gridSize, setGridSize] = useState(10);
  const [animationStarted, setAnimationStarted] = useState(false);
  const [pathFound, setPathFound] = useState(true);
  const [drawingMode, setDrawingMode] = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [start, setStart] = useState(false);
  const [finishMode, setFinish] = useState(false);
  const canvasRef = useRef(null);
  const requestRef = useRef();
  const animationFrame = useRef(0);

  //Grid definitions
  const cols = gridSize;
  const rows = gridSize;
  // width and height will be read from dimensions state
  const { width, height } = dimensions;

  //Setting costs for adjacent and diagonal moves
  const D = 1;
  const D2 = Math.sqrt(2);

  const gridRef = useRef([]);
  const openSetRef = useRef([]);
  const closedSetRef = useRef([]);
  const startRef = useRef(null);
  const endRef = useRef(null);
  const pathRef = useRef([]);
  const cellWidthRef = useRef(0);
  const cellHeightRef = useRef(0);

  // This useEffect will now read the actual rendered dimensions of the canvas
  useEffect(() => {
    const updateCanvasDimensions = () => {
      if (canvasRef.current) {
        const canvas = canvasRef.current;
        // Get the actual computed width and height from the DOM
        setDimensions({
          width: canvas.offsetWidth,
          height: canvas.offsetHeight,
        });
      }
    };

    // Initial update
    updateCanvasDimensions();

    // Add a resize listener to update dimensions when the window resizes
    window.addEventListener("resize", updateCanvasDimensions);

    // Cleanup the event listener
    return () => {
      window.removeEventListener("resize", updateCanvasDimensions);
    };
  }, []); // Empty dependency array means this runs once on mount and cleans up on unmount

  const Spot = useCallback(
    function (x, y) {
      this.f = 0; // Total cost
      this.g = 0; // Cost from start to this spot
      this.h = 0; // Heuristic cost to end
      this.x = x; // X coordinate
      this.y = y; // Y coordinate
      this.neighbors = []; // Neighbors of the spot
      this.cameFrom = undefined; // Previous spot in path
      this.wall = false; // Is it a wall?

      this.show = function (col) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        const cellWidth = cellWidthRef.current;
        const cellHeight = cellHeightRef.current;

        if (this.wall) {
          ctx.fillStyle = "#666"; // Wall color
          ctx.beginPath();
          ctx.arc(
            this.x * cellWidth + cellWidth / 2,
            this.y * cellHeight + cellHeight / 2,
            cellHeight / 2.5,
            0,
            2 * Math.PI
          );
          ctx.fill();
        } else {
          ctx.fillStyle = col;
          ctx.fillRect(
            this.x * cellWidth,
            this.y * cellHeight,
            cellWidth,
            cellHeight
          );
        }
      };

      this.addNeighbors = function (grid) {
        let x = this.x;
        let y = this.y;
        if (x < cols - 1) {
          this.neighbors.push(grid[x + 1][y]);
        }
        if (x > 0) {
          this.neighbors.push(grid[x - 1][y]);
        }
        if (y < rows - 1) {
          this.neighbors.push(grid[x][y + 1]);
        }
        if (y > 0) {
          this.neighbors.push(grid[x][y - 1]);
        }
        // Diagonals
        if (x > 0 && y > 0) {
          this.neighbors.push(grid[x - 1][y - 1]);
        }
        if (x < cols - 1 && y > 0) {
          this.neighbors.push(grid[x + 1][y - 1]);
        }
        if (x > 0 && y < rows - 1) {
          this.neighbors.push(grid[x - 1][y + 1]);
        }
        if (x < cols - 1 && y < rows - 1) {
          this.neighbors.push(grid[x + 1][y + 1]);
        }
      };
    },
    [cols, rows]
  );

  const removeFromArray = useCallback((arr, element) => {
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] === element) {
        arr.splice(i, 1);
      }
    }
  }, []);

  //Diagonal distance heuristic
  const heuristic = useCallback(
    (a, b) => {
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);

      return D * Math.max(dx, dy) + (D2 - D) * Math.min(dx, dy);
    },
    [D, D2]
  );

  const dist = useCallback(
    (a, b) => {
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);

      if (dx === 1 && dy === 1) {
        return D2;
      } else if (dx === 1 || dy === 1) {
        return D;
      }
      return 0;
    },
    [D, D2]
  );

  // Define drawInitialGrid FIRST, as it's a dependency for others
  const drawInitialGrid = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return; // Add checks for dimensions
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, width, height);

    setPathFound(true); // Remove no path found text overlay when grid is initialized

    const grid = gridRef.current;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const spot = grid[i][j];
        if (spot === startRef.current) {
          spot.show("#0fff33");
        } else if (spot === endRef.current) {
          spot.show("#ffcb0f");
        } else if (spot.wall) {
          spot.show("#666");
        } else {
          spot.show("#1f1f1f");
        }
      }
    }
  }, [width, height, cols, rows]);

  const initializeGridStructure = useCallback(() => {
    gridRef.current = new Array(cols);
    for (let i = 0; i < cols; i++) {
      gridRef.current[i] = new Array(rows);
    }

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        gridRef.current[i][j] = new Spot(i, j);
      }
    }

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        gridRef.current[i][j].addNeighbors(gridRef.current);
      }
    }

    startRef.current = gridRef.current[0][0];
    endRef.current = gridRef.current[cols - 1][rows - 1];
    startRef.current.wall = false;
    endRef.current.wall = false;

    console.log("Grid data structure initialized.");
    resetPathfindingState();
  }, [Spot, cols, rows]);

  const resetPathfindingState = () => {
    const grid = gridRef.current;
    openSetRef.current = [];
    closedSetRef.current = [];
    pathRef.current = [];

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const spot = grid[i][j];
        spot.f = 0;
        spot.g = 0;
        spot.h = 0;
        spot.cameFrom = undefined;
      }
    }

    openSetRef.current.push(startRef.current);
    setPathFound(true);

    console.log("Pathfinding state reset.");
  };

  const drawLine = useCallback((nodes, col) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const cellWidth = cellWidthRef.current;
    const cellHeight = cellHeightRef.current;

    if (nodes.length < 2) return;
    ctx.beginPath();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = col;
    ctx.lineWidth = cellHeight / 2;
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i];
      const b = nodes[i + 1];
      const ax = a.x * cellWidth + cellWidth / 2;
      const ay = a.y * cellHeight + cellHeight / 2;
      const bx = b.x * cellWidth + cellWidth / 2;
      const by = b.y * cellHeight + cellHeight / 2;
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    }
    ctx.stroke();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return false;
    const ctx = canvas.getContext("2d");

    const grid = gridRef.current;
    let openSet = openSetRef.current;
    let closedSet = closedSetRef.current;
    let start = startRef.current;
    let end = endRef.current;
    let path = pathRef.current;

    start.show("#0fff33");
    end.show("#ffcb0f");

    let winner = 0;
    if (openSet.length > 0) {
      for (let i = 0; i < openSet.length; i++) {
        if (openSet[i].f < openSet[winner].f) {
          winner = i;
        }
      }
      let current = openSet[winner];

      for (let i = 0; i < closedSet.length; i++) {
        closedSet[i].show("#ff000002");
      }

      for (let i = 0; i < openSet.length; i++) {
        openSet[i].show("#22ff0002");
      }

      path = [];
      if (current) {
        let temp = current;
        path.push(temp);
        while (temp.cameFrom) {
          path.push(temp.cameFrom);
          temp = temp.cameFrom;
        }
      }
      pathRef.current = path;
      drawLine(path, "#547CFFaa");

      if (current === end) {
        console.log("Done!");
        drawLine(path, "#ffcb0f");
        return false;
      }

      removeFromArray(openSet, current);
      closedSet.push(current);

      let neighbors = current.neighbors;

      for (let i = 0; i < neighbors.length; i++) {
        let neighbor = neighbors[i];

        if (!closedSet.includes(neighbor) && !neighbor.wall) {
          const moveCost = dist(current, neighbor);
          let tempG = current.g + moveCost;
          let newPathFound = false;

          if (openSet.includes(neighbor)) {
            if (tempG < neighbor.g) {
              neighbor.g = tempG;
              newPathFound = true;
            }
          } else {
            neighbor.g = tempG;
            newPathFound = true;
            openSet.push(neighbor);
          }

          if (newPathFound) {
            neighbor.h = heuristic(neighbor, end);
            neighbor.f = neighbor.g + neighbor.h;
            neighbor.cameFrom = current;
          }
        }
      }
    } else {
      console.log("No solution found");
      setPathFound(false);
      return false;
    }
    return true;
  }, [removeFromArray, drawLine, heuristic, dist]);

  const animate = useCallback(() => {
    const shouldContinue = draw();
    if (shouldContinue) {
      requestRef.current = requestAnimationFrame(animate);
    } else {
      setAnimationStarted(false);
    }
  }, [draw]);

  const initializeAndStartAnimation = () => {
    animationFrame.current = 0;
    drawInitialGrid();
    resetPathfindingState();
    setAnimationStarted(true);
  };

  const stopAnimation = () => {
    setAnimationStarted(false);
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
    }
  };

  const getGridCoordinates = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    // Use getBoundingClientRect to get the actual rendered size and position
    const bounds = canvas.getBoundingClientRect();
    let clientX, clientY;

    // Check if it's a touch event or a mouse event
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - bounds.left;
    const y = clientY - bounds.top;

    const cellX = Math.floor(x / cellWidthRef.current);
    const cellY = Math.floor(y / cellHeightRef.current);

    if (cellX >= 0 && cellX < cols && cellY >= 0 && cellY < rows) {
      return { x: cellX, y: cellY };
    }
    return null;
  };

  const handleInteractionStart = useCallback(
    (e) => {
      // Prevent default touch behavior (like scrolling or zooming) if it's a touch event
      if (e.type === "touchstart") {
        e.preventDefault();
      }

      if (animationStarted) return;
      const coords = getGridCoordinates(e);
      if (coords) {
        const { x, y } = coords;
        const spot = gridRef.current[x][y];
        if (spot !== endRef.current && !spot.wall) {
          if (start) {
            startRef.current = spot;
            setStart(false);
            drawInitialGrid();
          } else if (finishMode) {
            endRef.current = spot;
            setFinish(false);
            drawInitialGrid();
          }
        }
        if (spot !== startRef.current && spot !== endRef.current) {
          spot.wall = eraseMode ? false : true;
          setDrawingMode(true);
          drawInitialGrid();
        }
      }
    },
    [animationStarted, drawInitialGrid, eraseMode, start, finishMode]
  );

  const handleInteractionMove = useCallback(
    (e) => {
      // Prevent default touch behavior (like scrolling or zooming) if it's a touch event
      if (e.type === "touchmove") {
        e.preventDefault();
      }

      if (!drawingMode || animationStarted) return;
      const coords = getGridCoordinates(e);
      if (coords) {
        const { x, y } = coords;
        const spot = gridRef.current[x][y];
        if (spot !== startRef.current && spot !== endRef.current) {
          if (eraseMode && spot.wall) {
            spot.wall = false;
            drawInitialGrid();
          } else if (!eraseMode && !spot.wall) {
            spot.wall = true;
            drawInitialGrid();
          }
        }
      }
    },
    [drawingMode, animationStarted, drawInitialGrid, eraseMode]
  );

  const handleInteractionEnd = useCallback(() => {
    setDrawingMode(false);
  }, []);

  const handleBrushClick = () => {
    setEraseMode(false); // Activate brush mode
  };

  const handleEraserClick = () => {
    setEraseMode(true); // Activate eraser mode
  };

  const handleSetStartClick = () => {
    if (start) {
      setStart(false);
    } else {
      setStart(true);
    }
    setFinish(false);
  };

  const handleSetFinishClick = () => {
    if (finishMode) {
      setFinish(false);
    } else {
      setFinish(true);
    }
    setStart(false);
  };

  const clearWalls = useCallback(() => {
    if (animationStarted) return;
    const grid = gridRef.current;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (grid[i][j] !== startRef.current && grid[i][j] !== endRef.current) {
          grid[i][j].wall = false;
        }
      }
    }
    resetPathfindingState();
    drawInitialGrid();
  }, [animationStarted, drawInitialGrid, cols, rows]);

  const randomizeWalls = useCallback(() => {
    if (animationStarted) return;
    const grid = gridRef.current;

    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const spot = grid[i][j];
        if (spot !== startRef.current && spot !== endRef.current) {
          spot.wall = Math.random() < 0.3; // 40% chance of wall
        }
      }
    }

    resetPathfindingState();
    drawInitialGrid();
  }, [animationStarted, drawInitialGrid, cols, rows]);

  useEffect(() => {
    initializeGridStructure();
  }, [gridSize, initializeGridStructure]);

  // Re-draw when dimensions or gridsize changes
  useEffect(() => {
    if (width > 0 && height > 0) {
      cellWidthRef.current = width / cols;
      cellHeightRef.current = height / rows;
      drawInitialGrid();
    }
  }, [dimensions, gridSize, drawInitialGrid, width, height, cols, rows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Mouse events
    canvas.addEventListener("mousedown", handleInteractionStart);
    canvas.addEventListener("mousemove", handleInteractionMove);
    canvas.addEventListener("mouseup", handleInteractionEnd);
    canvas.addEventListener("mouseleave", handleInteractionEnd);

    // Touch events
    canvas.addEventListener("touchstart", handleInteractionStart, {
      passive: false,
    });
    canvas.addEventListener("touchmove", handleInteractionMove, {
      passive: false,
    });
    canvas.addEventListener("touchend", handleInteractionEnd);
    canvas.addEventListener("touchcancel", handleInteractionEnd);

    return () => {
      // Cleanup mouse events
      canvas.removeEventListener("mousedown", handleInteractionStart);
      canvas.removeEventListener("mousemove", handleInteractionMove);
      canvas.removeEventListener("mouseup", handleInteractionEnd);
      canvas.removeEventListener("mouseleave", handleInteractionEnd);

      // Cleanup touch events
      canvas.removeEventListener("touchstart", handleInteractionStart);
      canvas.removeEventListener("touchmove", handleInteractionMove);
      canvas.removeEventListener("touchend", handleInteractionEnd);
      canvas.removeEventListener("touchcancel", handleInteractionEnd);
    };
  }, [handleInteractionStart, handleInteractionMove, handleInteractionEnd]);

  useEffect(() => {
    if (animationStarted) {
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
      cancelAnimationFrame(requestRef.current);
    };
  }, [animationStarted, animate]);

  const handleGridSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10);
    setPathFound(true);
    if (!isNaN(newSize) && newSize >= 5 && newSize <= 50) {
      setGridSize(newSize);
    }
  };

  return (
    <div className="wrapper">
      <header>
        <h1>A* Visualizer</h1>
        <a href="https:/www.thomassmidt.dk/">Visit my website!</a>
      </header>
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        style={{ backgroundColor: "#1f1f1f" }}
      />

      <div className="button-wrapper">
        <div className="maze-options-wrapper">
          <div className="maze-options">
            <button
              title="Start pathfinding"
              onClick={initializeAndStartAnimation}
              disabled={animationStarted}
            >
              <FaPlay />
            </button>
            <button
              title="Stop animation"
              onClick={stopAnimation}
              disabled={!animationStarted}
            >
              <FaStop />
            </button>
            <button
              title="Clear maze"
              onClick={clearWalls}
              disabled={animationStarted}
            >
              <IoIosCloseCircle />
            </button>
            <button title="Randomize walls" onClick={randomizeWalls}>
              <FaRandom />
            </button>
          </div>
          <h2>Maze Options</h2>
        </div>

        <div className="draw-controls-wrapper">
          <div className="draw-controls">
            <button
              title="Set start location"
              className={start ? "start-button active" : "start-button"}
              onClick={handleSetStartClick}
            >
              <FaLocationDot />
            </button>
            <button
              title="Set goal location"
              className={finishMode ? "finish-button active" : "finish-button"}
              onClick={handleSetFinishClick}
            >
              <FaFlagCheckered />
            </button>
            <div className="brush-erase-wrapper">
              <button
                title="Brush"
                onClick={handleBrushClick}
                disabled={animationStarted}
                className={!eraseMode ? "active" : ""}
              >
                <FaPaintBrush />
              </button>
              <button
                title="Eraser"
                onClick={handleEraserClick}
                disabled={animationStarted}
                className={eraseMode ? "active" : ""}
              >
                <FaEraser />
              </button>
            </div>
          </div>
          <h2>Draw Controls</h2>
        </div>

        <div className="grid-size-control-wrapper">
          <label htmlFor="grid-size">
            {gridSize}x{gridSize}
          </label>
          <input
            id="grid-size"
            type="range"
            value={gridSize}
            onChange={handleGridSizeChange}
            min="5"
            max="50"
            step="5"
            disabled={animationStarted}
          />

          <h2>Grid Size</h2>
        </div>
      </div>
      <p class={!pathFound ? "" : "hidden"}>No path possible.</p>
    </div>
  );
};

export default Canvas;
